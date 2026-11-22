"""Builds the three fighters from Microsoft Rocketbox avatars (MIT licence, photo-textured people).

For each fighter: import the FBX, point every bone at its child, rename the 3ds Max Biped bones to the Mixamo
names the game and the retargeter use, parent thighs to the pelvis and collarbones to the chest (as Mixamo does),
then re-dress the photographed modern clothes as period clothing in texture space (the fold shading of the original
photo is kept, the cloth colour and weave are replaced) and add the props. Writes blender/cast_rb.blend, which
blender/retarget.py --cast cast_rb.blend animates and exports.

Run:  python blender/build_rocketbox.py [--render]
"""
import bpy, bmesh, os, sys, math
import numpy as np
from mathutils import Vector, Matrix

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RB = os.environ.get('ROCKETBOX', '/home/user/microsoft/microsoft-rocketbox/Assets/Avatars/Adults/')
TEX = os.path.join(ROOT, 'blender', 'tex'); os.makedirs(TEX, exist_ok=True)
ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]

CAST = {  # fighter id -> Rocketbox avatar and texture prefix
    'davud': ('Male_Adult_15', 'm204'),
    'theodoros': ('Male_Adult_05', 'm009'),
    'lorenzo': ('Male_Adult_20', 'm027'),
}

# ---------- bones: 3ds Max Biped -> Mixamo
BONES = {'Pelvis': 'Hips', 'Spine': 'Spine', 'Spine1': 'Spine1', 'Spine2': 'Spine2', 'Neck': 'Neck', 'Head': 'Head'}
for s, side in (('L', 'Left'), ('R', 'Right')):
    BONES.update({f'{s} Clavicle': f'{side}Shoulder', f'{s} UpperArm': f'{side}Arm', f'{s} Forearm': f'{side}ForeArm', f'{s} Hand': f'{side}Hand',
                  f'{s} Thigh': f'{side}UpLeg', f'{s} Calf': f'{side}Leg', f'{s} Foot': f'{side}Foot', f'{s} Toe0': f'{side}ToeBase'})
    for i, f in enumerate(('Thumb', 'Index', 'Middle', 'Ring', 'Pinky')):
        BONES.update({f'{s} Finger{i}': f'{side}Hand{f}1', f'{s} Finger{i}1': f'{side}Hand{f}2', f'{s} Finger{i}2': f'{side}Hand{f}3'})

def import_avatar(fid, avatar):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.fbx(filepath=os.path.join(RB, avatar, 'Export', avatar + '.fbx'), automatic_bone_orientation=True)
    new = [o for o in bpy.data.objects if o not in before]
    arm = next(o for o in new if o.type == 'ARMATURE'); me = next(o for o in new if o.type == 'MESH')
    # (edit mode first: toggling it after applying the transform brings the old transform back in this build)
    bpy.ops.object.select_all(action='DESELECT'); bpy.context.view_layer.objects.active = arm; arm.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    eb = arm.data.edit_bones
    for s in 'LR':
        eb[f'Bip01 {s} Thigh'].parent = eb['Bip01 Pelvis']; eb[f'Bip01 {s} Clavicle'].parent = eb['Bip01 Spine2']
        # the importer points each bone at one of its children: aim the hand at the middle finger, not the thumb
        eb[f'Bip01 {s} Hand'].tail = eb[f'Bip01 {s} Finger2'].head
    # and the chest, neck and head straight up the body as Mixamo's are (the head would otherwise aim at the face bones)
    eb['Bip01 Spine2'].tail = eb['Bip01 Neck'].head; eb['Bip01 Neck'].tail = eb['Bip01 Head'].head
    h = eb['Bip01 Head']; h.tail = h.head + Vector((0, 0, h.length))  # vertical, like Mixamo's head-to-head-top
    bpy.ops.object.mode_set(mode='OBJECT')
    # bake the FBX's centimetre scale and axis turn into the data itself (not with operators: Blender's undo
    # system restores operator changes when the mode is toggled or a render starts in this build)
    if arm.animation_data: arm.animation_data_clear()
    M = arm.matrix_world.copy(); me_w = me.matrix_world.copy()
    me.parent = None; me.data.transform(me_w); me.matrix_world = Matrix.Identity(4)
    arm.data.transform(M); arm.matrix_world = Matrix.Identity(4)
    for pb in arm.pose.bones: pb.location = (0, 0, 0); pb.rotation_quaternion = (1, 0, 0, 0); pb.rotation_euler = (0, 0, 0); pb.scale = (1, 1, 1)
    me.parent = arm; me.matrix_parent_inverse = Matrix.Identity(4)
    for o in new:
        if o.type == 'EMPTY': bpy.data.objects.remove(o)
    bpy.context.view_layer.update(); assert abs(arm.matrix_world.to_scale().x - 1) < 1e-4, 'armature transform not applied'
    for m in me.modifiers:
        if m.type == 'ARMATURE': m.object = arm
    for b in arm.data.bones:
        short = b.name[6:]
        if short in BONES:
            old = b.name; b.name = 'mixamorig:' + BONES[short]
            if old in me.vertex_groups: me.vertex_groups[old].name = b.name
        else:
            old = b.name; b.name = 'face:' + short.replace(' ', '')
            if old in me.vertex_groups: me.vertex_groups[old].name = b.name
    arm.name = f'{fid}_rig'; arm.data.name = f'{fid}_rig'; me.name = f'{fid}_body'; me.data.name = f'{fid}_body'
    return arm, me

# ---------- texture space: which body part each texel belongs to
PART = {'Hips': 'hips', 'Spine': 'torso', 'Spine1': 'torso', 'Spine2': 'torso', 'Neck': 'torso', 'Head': 'head',
        'Shoulder': 'torso', 'Arm': 'arm', 'ForeArm': 'arm', 'Hand': 'hand', 'UpLeg': 'leg', 'Leg': 'leg', 'Foot': 'foot', 'ToeBase': 'foot'}
PARTS = ['none', 'hips', 'torso', 'head', 'arm', 'hand', 'leg', 'foot']
def part_of(bone):
    if bone.startswith('face:'): return 'head'
    n = bone.split(':')[-1].replace('Left', '').replace('Right', '')
    if 'Hand' in n: return 'hand'
    return PART.get(n, 'torso')

def label_map(me, mat_index, size):
    """Rasterise every triangle of one material into texture space: the body part its weights belong to and the
    rest-pose position of every texel, so clothing can be cut by height and side like a tailor would."""
    groups = {g.index: g.name for g in me.vertex_groups}
    vpart = []
    for v in me.data.vertices:
        best, w = None, 0
        for g in v.groups:
            if g.weight > w: best, w = groups[g.group], g.weight
        vpart.append(PARTS.index(part_of(best)) if best else 0)
    me.data.calc_loop_triangles()
    uv = me.data.uv_layers.active.data
    lab = np.zeros((size, size), np.uint8)
    pos = np.zeros((size, size, 3), np.float32)
    V = np.array([v.co[:] for v in me.data.vertices], np.float32)
    for t in me.data.loop_triangles:
        if t.material_index != mat_index: continue
        P = np.array([uv[l].uv[:] for l in t.loops]) * size
        votes = np.bincount([vpart[v] for v in t.vertices], minlength=len(PARTS)); k = int(votes.argmax())
        x0, y0 = np.floor(P.min(0)).astype(int); x1, y1 = np.ceil(P.max(0)).astype(int)
        x0, y0 = max(x0, 0), max(y0, 0); x1, y1 = min(x1, size - 1), min(y1, size - 1)
        if x1 < x0 or y1 < y0: continue
        xs, ys = np.meshgrid(np.arange(x0, x1 + 1) + 0.5, np.arange(y0, y1 + 1) + 0.5)
        (ax, ay), (bx, by), (cx, cy) = P
        d = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy)
        if abs(d) < 1e-9: continue
        l1 = ((by - cy) * (xs - cx) + (cx - bx) * (ys - cy)) / d; l2 = ((cy - ay) * (xs - cx) + (ax - cx) * (ys - cy)) / d; l3 = 1 - l1 - l2
        inside = (l1 >= -0.02) & (l2 >= -0.02) & (l3 >= -0.02)
        sub = lab[y0:y1 + 1, x0:x1 + 1]; sub[inside] = k
        Q = V[list(t.vertices)]
        pp = l1[..., None] * Q[0] + l2[..., None] * Q[1] + l3[..., None] * Q[2]
        psub = pos[y0:y1 + 1, x0:x1 + 1]; psub[inside] = pp[inside]
    # bleed labels a few texels outward so seams take the right treatment too
    for _ in range(6):
        empty = lab == 0
        if not empty.any(): break
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            sh = np.roll(lab, (dy, dx), (0, 1)); fill = empty & (sh > 0); lab[fill] = sh[fill]
            pos[fill] = np.roll(pos, (dy, dx), (0, 1))[fill]; empty = lab == 0
    return lab, pos

def load_np(path):
    img = bpy.data.images.load(path, check_existing=True)
    w, h = img.size; a = np.empty(w * h * 4, np.float32); img.pixels.foreach_get(a)
    bpy.data.images.remove(img)
    return a.reshape(h, w, 4)

def save_np(arr, path, size=None):
    """Write an RGB(A) float array (bottom-up rows, as Blender stores them) to an image file, optionally downsampled."""
    a = arr
    while size and a.shape[0] > size: a = 0.25 * (a[0::2, 0::2] + a[1::2, 0::2] + a[0::2, 1::2] + a[1::2, 1::2])
    h, w = a.shape[:2]; has_alpha = a.shape[2] == 4
    if not has_alpha: a = np.concatenate([a, np.ones((h, w, 1), np.float32)], 2)
    img = bpy.data.images.new(os.path.basename(path), w, h, alpha=has_alpha, float_buffer=False)
    img.pixels.foreach_set(np.clip(a, 0, 1).astype(np.float32).ravel())
    img.filepath_raw = path; img.file_format = 'PNG' if path.endswith('.png') else 'JPEG'
    if has_alpha: bpy.context.scene.render.image_settings.color_mode = 'RGBA'
    img.save(); bpy.data.images.remove(img)
    return path


# ---------- image helpers
def box1(a, r, axis):
    pad = [(0, 0)] * a.ndim; pad[axis] = (r + 1, r)
    c = np.cumsum(np.pad(a, pad, mode='edge'), axis=axis, dtype=np.float64)
    n = a.shape[axis]
    return ((np.take(c, np.arange(2 * r + 1, 2 * r + 1 + n), axis=axis) - np.take(c, np.arange(0, n), axis=axis)) / (2 * r + 1)).astype(np.float32)

def blur(a, sigma):
    r = max(1, int(round(sigma)))
    for _ in range(3): a = box1(box1(a, r, 0), r, 1)
    return a

def mblur(a, m, sigma):
    """Blur that only averages texels inside the mask (normalised convolution)."""
    if a.ndim == 3: return mblur_c(a, m, sigma)
    return blur(a * m, sigma) / np.maximum(blur(m, sigma), 1e-4)
def mblur_c(a, m, sigma): return np.stack([mblur(a[..., i], m, sigma) for i in range(a.shape[2])], -1)

def lum(c): return 0.2126 * c[..., 0] + 0.7152 * c[..., 1] + 0.0722 * c[..., 2]
def ss(e0, e1, x): t = np.clip((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t)
def hash2(i, j, seed=0):
    h = (i.astype(np.int64) * 73856093 ^ j.astype(np.int64) * 19349663 ^ seed * 83492791) & 0xffffff
    return (h % 10007) / 10007.0

def value_noise(shape, cell, seed=0):
    """Smooth value noise in texel units, for weave and wear."""
    h, w = shape; ys, xs = np.mgrid[0:h, 0:w].astype(np.float32) / cell
    i, j = np.floor(xs).astype(np.int64), np.floor(ys).astype(np.int64); fx, fy = xs - i, ys - j
    fx, fy = fx * fx * (3 - 2 * fx), fy * fy * (3 - 2 * fy)
    a, b, c, d = hash2(i, j, seed), hash2(i + 1, j, seed), hash2(i, j + 1, seed), hash2(i + 1, j + 1, seed)
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy

def height_to_normal(hgt, strength):
    gy, gx = np.gradient(hgt)
    n = np.stack([-gx * strength, -gy * strength, np.ones_like(hgt)], -1)
    return n / np.linalg.norm(n, axis=-1, keepdims=True)

def blend_normals(base, detail, k=1.0):
    """Whiteout blend of a detail normal onto the photographed normal map (both unit vectors)."""
    n = np.stack([base[..., 0] + detail[..., 0] * k, base[..., 1] + detail[..., 1] * k, base[..., 2] * detail[..., 2]], -1)
    return n / np.linalg.norm(n, axis=-1, keepdims=True)

def srgb(c): return np.array(c, np.float32)

# ---------- re-dressing
class Dress:
    """Holds one body texture set and the texel maps; each garment rule paints a region."""
    def __init__(self, col, nrm, spec, lab, pos):
        self.col, self.lab, self.pos = col[..., :3].copy(), lab, pos
        self.n = nrm[..., :3] * 2 - 1
        self.rough = np.clip(0.95 - 0.6 * lum(spec[..., :3]), 0.35, 0.95)
        self.metal = np.zeros(lab.shape, np.float32)
        self.skin = (lab == PARTS.index('hand')).astype(np.float32)
        H, W = lab.shape; self.v, self.u = np.mgrid[0:H, 0:W].astype(np.float32)
        cloth = (lab > 0) & (lab != PARTS.index('hand'))
        L = lum(self.col)
        # fold and seam shading of the photographed garment, with its colour and fine weave taken out
        self.S = np.clip(blur(L, 1.5) / np.maximum(mblur(L, cloth.astype(np.float32), 36), 1e-3), 0.3, 1.45)
        self.x, self.y, self.z = pos[..., 0], pos[..., 1], pos[..., 2]
    def part(self, *names): return np.isin(self.lab, [PARTS.index(n) for n in names])
    def paint(self, mask, albedo, rough, metal=0.0, shade=1.0, weave=0.06, seed=1, normal=None, nk=1.0):
        m = mask.astype(np.float32) if mask.dtype == bool else mask
        if np.ndim(albedo) == 1: albedo = np.broadcast_to(albedo, self.col.shape)
        wv = 1 + weave * (value_noise(m.shape, 2.0, seed) - 0.5) * 2 + 0.5 * weave * (value_noise(m.shape, 23.0, seed + 7) - 0.5) * 2
        c = albedo * (self.S ** shade)[..., None] * wv[..., None]
        self.col = self.col * (1 - m[..., None]) + c * m[..., None]
        self.rough = self.rough * (1 - m) + rough * m
        self.metal = self.metal * (1 - m) + metal * m
        self.skin = self.skin * (1 - m)
        if normal is not None:
            nn = blend_normals(self.n, normal, nk); self.n = self.n * (1 - m[..., None]) + nn * m[..., None]
    def dust(self, amount=0.35):
        """Arena sand and dirt collect towards the hem and boots."""
        k = amount * ss(0.45, 0.02, self.z) * (0.6 + 0.4 * value_noise(self.lab.shape, 30.0, 11)) * (self.lab > 0) * (self.lab != PARTS.index('hand'))
        sand = srgb([0.62, 0.52, 0.4])
        self.col = self.col * (1 - k[..., None]) + (self.col * 0.5 + sand * 0.5) * k[..., None]
        self.rough = np.maximum(self.rough, 0.9 * k + self.rough * (1 - k))

def mail(d, mask, scale=9.0):
    """Riveted mail: rows of rings offset by half a ring, with the dark padding showing through."""
    u, v = d.u / scale, d.v / scale
    row = np.floor(v); uu = u + 0.5 * (row % 2)
    fu, fv = uu - np.floor(uu) - 0.5, v - row - 0.5
    r = np.sqrt(fu * fu + (fv * 1.15) ** 2)
    ring = np.clip(1 - np.abs(r - 0.33) / 0.15, 0, 1)
    hgt = ring ** 0.7
    alb = srgb([0.5, 0.5, 0.52]) * (0.4 + 0.6 * ring)[..., None] * ring[..., None] + srgb([0.04, 0.035, 0.03]) * (1 - ring)[..., None]
    d.paint(mask, alb, 0.42 + 0.4 * (1 - ring), metal=0.85 * ring + 0.05, shade=0.6, weave=0.1, normal=height_to_normal(blur(hgt, 0.6), 2.2), nk=1.0)

def lamellar(d, mask, col_px=26.0, row_m=0.055):
    """Iron lamellae laced in overlapping rows, the Byzantine klibanion."""
    u = d.u / col_px; zr = d.z / row_m
    ci, ri = np.floor(u + 0.5 * (np.floor(zr) % 2)), np.floor(zr)
    fu = (u + 0.5 * (np.floor(zr) % 2)) - ci; fz = zr - ri
    edge = np.minimum(np.minimum(fu, 1 - fu) * col_px / 3.0, np.minimum(fz, 1 - fz) * row_m * 1000 / 3.0)
    plate = ss(0.0, 1.0, edge)
    bulge = (1 - (2 * fu - 1) ** 4) * (0.6 + 0.4 * fz)
    lace = (np.abs(fz - 0.82) < 0.05) & ((np.abs(fu - 0.3) < 0.08) | (np.abs(fu - 0.7) < 0.08))
    rnd = hash2(ci, ri, 3)[..., None]
    iron = srgb([0.44, 0.44, 0.45]) * (0.75 + 0.4 * rnd) + srgb([0.08, 0.04, 0.02]) * ss(0.6, 1.0, value_noise(d.lab.shape, 9.0, 5))[..., None]
    alb = iron * (0.5 + 0.5 * plate[..., None]) * (0.8 + 0.2 * fz[..., None])
    alb = np.where(lace[..., None], srgb([0.38, 0.1, 0.05]), alb)
    hgt = plate * bulge * 0.8 + 0.25 * fz
    met = np.where(lace, 0.0, 0.9 * plate)
    d.paint(mask, alb, np.where(lace, 0.7, 0.35 + 0.25 * (1 - plate)), metal=met, shade=0.5, weave=0.08, normal=height_to_normal(blur(hgt, 0.7), 3.0))

def quilted(d, mask, albedo, spacing=34.0):
    """Diamond-quilted padded cloth (a gambeson or arming doublet)."""
    a, b = (d.u + d.v) / spacing, (d.u - d.v) / spacing
    da, db = np.abs(a - np.round(a)), np.abs(b - np.round(b))
    puff = np.minimum(da, db) * 2
    hgt = np.sqrt(np.clip(puff, 0, 1))
    seam = 1 - ss(0.0, 0.12, puff)
    alb = albedo * (1 - 0.45 * seam)[..., None]
    d.paint(mask, alb, 0.82, shade=0.9, weave=0.07, normal=height_to_normal(blur(hgt, 1.0), 6.0))

def strips(d, mask, albedo, width_px=26.0):
    """Hanging leather strips (pteruges) below the armour."""
    fu = (d.u / width_px) % 1.0
    gap = (fu < 0.08) | (fu > 0.92)
    rnd = hash2(np.floor(d.u / width_px), np.zeros_like(d.u, dtype=np.int64), 9)[..., None]
    alb = np.where(gap[..., None], albedo * 0.25, albedo * (0.8 + 0.4 * rnd))
    hgt = np.where(gap, 0.0, 1 - (2 * fu - 1) ** 2)
    d.paint(mask, alb, 0.6, shade=0.8, weave=0.1, normal=height_to_normal(blur(hgt, 0.8), 3.0))

OUTFITS = {}
def outfit(fid):
    def reg(f): OUTFITS[fid] = f; return f
    return reg

@outfit('davud')
def dress_davud(d):
    kaftan = d.part('hips', 'torso', 'arm') | (d.part('leg') & (d.z > 0.6))
    # a crimson broadcloth kaftan; the white salvar trousers of the photograph stay below its hem
    d.paint(kaftan, srgb([0.44, 0.05, 0.05]), 0.85, shade=1.1, weave=0.05)
    front = (d.y < -0.02) & d.part('torso', 'hips')
    sash = kaftan & (d.z > 0.96) & (d.z < 1.1) & ~d.part('arm')
    stripes = (np.floor(d.z / 0.016) % 3 == 0)
    d.paint(sash, np.where(stripes[..., None], srgb([0.55, 0.38, 0.12]), srgb([0.74, 0.62, 0.4])), 0.6, weave=0.14, seed=4)
    # thin gold braid frogging across the chest, a trim down the opening and along the hem
    frog = front & (np.abs(d.x) < 0.06) & (d.z > 1.14) & (d.z < 1.4) & ((d.z % 0.04) < 0.006)
    trim = kaftan & (d.y < -0.02) & (np.abs(d.x) < 0.005) & (d.z < 1.45)
    hem = d.part('leg') & (d.z > 0.6) & (d.z < 0.625)
    d.paint(frog | trim | hem, srgb([0.62, 0.47, 0.2]), 0.42, metal=0.5, shade=0.9, weave=0.2, seed=6)
    d.dust(0.3)

@outfit('theodoros')
def dress_theodoros(d):
    torso = d.part('torso', 'hips') & (d.z > 0.98)
    lamellar(d, torso)
    mail(d, d.part('arm') | (d.part('torso') & (d.z <= 0.98)))
    skirt = d.part('hips', 'leg', 'torso') & (d.z > 0.74) & (d.z <= 0.98)
    strips(d, skirt, srgb([0.34, 0.19, 0.09]))
    legs = d.part('leg') & (d.z <= 0.74)
    d.paint(legs & (d.z > 0.3), srgb([0.25, 0.06, 0.08]), 0.88, shade=1.15, weave=0.05)
    boots = d.part('foot') | (d.part('leg') & (d.z <= 0.3))
    d.paint(boots, srgb([0.17, 0.10, 0.06]), 0.55, shade=1.1, weave=0.12, seed=8)
    d.dust(0.35)

def brigandine(d, mask, cloth, rivet_px=30.0, row_m=0.05):
    """Velvet-covered brigandine: small steel plates riveted inside cloth, the rivet heads gilt in rows."""
    rows = d.z / row_m; fz = rows - np.floor(rows)
    cols = d.u / rivet_px + 0.5 * (np.floor(rows) % 2); fu = cols - np.floor(cols)
    rv = np.sqrt(((fu - 0.5) * rivet_px) ** 2 + ((fz - 0.5) * row_m * 1000 * 1.0) ** 2)
    head = rv < 4.5
    bulge = np.sin(np.pi * fz) ** 0.6
    hgt = 0.7 * bulge + np.where(head, 1.0 - (rv / 4.5) ** 2, 0) * 1.5
    alb = cloth * (0.7 + 0.3 * bulge[..., None])
    alb = np.where(head[..., None], srgb([0.66, 0.5, 0.24]) * (0.7 + 0.3 * (1 - rv / 4.5))[..., None], alb)
    d.paint(mask, alb, np.where(head, 0.3, 0.75), metal=np.where(head, 1.0, 0.0), shade=0.95, weave=0.06, normal=height_to_normal(blur(hgt, 0.8), 5.0))

@outfit('lorenzo')
def dress_lorenzo(d):
    H, W = d.lab.shape
    hood = d.part('torso') & (d.v < 0.22 * H) & (d.u > 0.36 * W) & (d.u < 0.64 * W)
    body = (d.part('torso') | (d.part('hips') & (d.z > 0.9))) & ~hood
    brigandine(d, body, srgb([0.07, 0.1, 0.24]))
    quilted(d, d.part('arm'), srgb([0.58, 0.48, 0.33]))
    d.paint(hood, srgb([0.13, 0.12, 0.11]), 0.9, shade=1.1, weave=0.08, seed=5)
    legs = d.part('leg', 'hips') & (d.z <= 0.9) & (d.z > 0.22)
    d.paint(legs & (d.x >= 0), srgb([0.42, 0.06, 0.05]), 0.85, shade=1.25, weave=0.05)
    d.paint(legs & (d.x < 0), srgb([0.1, 0.1, 0.11]), 0.85, shade=1.25, weave=0.05, seed=3)
    boots = d.part('foot') | (d.part('leg') & (d.z <= 0.22))
    d.paint(boots, srgb([0.2, 0.12, 0.07]), 0.5, shade=1.0, weave=0.12, seed=8)
    d.dust(0.3)

def make_textures(fid, avatar, pre, me):
    T = os.path.join(RB, avatar, 'Textures')
    body = next(i for i, m in enumerate(me.data.materials) if 'body' in m.name)
    lab, pos = label_map(me, body, 2048)
    col, nrm, spec = (load_np(os.path.join(T, f'{pre}_body_{k}.tga')) for k in ('color', 'normal', 'specular'))
    d = Dress(col, nrm, spec, lab, pos)
    OUTFITS[fid](d)
    n = d.n / np.linalg.norm(d.n, axis=-1, keepdims=True)
    out = {}
    out['body_col'] = save_np(d.col, os.path.join(TEX, f'{fid}_body_col.jpg'))
    out['body_nrm'] = save_np(n * 0.5 + 0.5, os.path.join(TEX, f'{fid}_body_nrm.jpg'), 1024)
    out['body_orm'] = save_np(np.stack([d.skin, d.rough, d.metal], -1), os.path.join(TEX, f'{fid}_body_orm.jpg'), 1024)
    hc, hn, hs = (load_np(os.path.join(T, f'{pre}_head_{k}.tga')) for k in ('color', 'normal', 'specular'))
    hr = np.clip(0.72 - 0.45 * lum(hs[..., :3]), 0.32, 0.85)
    out['head_col'] = save_np(hc[..., :3], os.path.join(TEX, f'{fid}_head_col.jpg'))
    out['head_nrm'] = save_np(hn[..., :3], os.path.join(TEX, f'{fid}_head_nrm.jpg'), 1024)
    op = os.path.join(T, f'{pre}_opacity_color.tga')
    if os.path.exists(op):
        oc = load_np(op); out['hair_col'] = save_np(oc, os.path.join(TEX, f'{fid}_hair_col.png'), 1024)
    out['head_orm'] = save_np(np.stack([np.ones_like(hr), hr, np.zeros_like(hr)], -1), os.path.join(TEX, f'{fid}_head_orm.jpg'), 512)
    return out

def hair_material(name, col):
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; N = nt.nodes; bsdf = N['Principled BSDF']
    t = N.new('ShaderNodeTexImage'); t.image = bpy.data.images.load(col, check_existing=True)
    nt.links.new(t.outputs['Color'], bsdf.inputs['Base Color']); nt.links.new(t.outputs['Alpha'], bsdf.inputs['Alpha'])
    bsdf.inputs['Roughness'].default_value = 0.55
    return m

def material(name, col, nrm, orm, skin):
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; N = nt.nodes
    bsdf = N['Principled BSDF']
    def tex(path, non_color):
        t = N.new('ShaderNodeTexImage'); t.image = bpy.data.images.load(path, check_existing=True)
        if non_color: t.image.colorspace_settings.name = 'Non-Color'
        return t
    c = tex(col, False); nt.links.new(c.outputs['Color'], bsdf.inputs['Base Color'])
    nm = N.new('ShaderNodeNormalMap'); t = tex(nrm, True); nt.links.new(t.outputs['Color'], nm.inputs['Color']); nt.links.new(nm.outputs['Normal'], bsdf.inputs['Normal'])
    o = tex(orm, True); sep = N.new('ShaderNodeSeparateColor'); nt.links.new(o.outputs['Color'], sep.inputs['Color'])
    nt.links.new(sep.outputs['Green'], bsdf.inputs['Roughness']); nt.links.new(sep.outputs['Blue'], bsdf.inputs['Metallic'])
    if skin:  # for the Blender preview renders only; the game shades skin itself from the mask in the red channel
        bsdf.inputs['Subsurface Weight'].default_value = 0.25; bsdf.inputs['Subsurface Radius'].default_value = (1.0, 0.35, 0.2); bsdf.inputs['Subsurface Scale'].default_value = 0.012
    return m

def build(fid, avatar, pre):
    arm, me = import_avatar(fid, avatar)
    tx = make_textures(fid, avatar, pre, me)
    mats = []
    for m in me.data.materials:
        if 'opacity' in m.name: mats.append(hair_material(f'{fid}_hair', tx['hair_col'])); continue
        part = 'head' if 'head' in m.name else 'body'
        mats.append(material(f'{fid}_{part}', tx[part + '_col'], tx[part + '_nrm'], tx[part + '_orm'], part == 'head'))
    for i, m in enumerate(mats): me.data.materials[i] = m
    for p in me.data.polygons: p.use_smooth = True
    coll = bpy.data.collections.new(fid); bpy.context.scene.collection.children.link(coll)
    for o in (arm, me):
        for c in list(o.users_collection): c.objects.unlink(o)
        coll.objects.link(o)
    return arm, me, coll

def preview(rigs, path, shots):
    sc = bpy.context.scene; sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = int(os.environ.get('SAMPLES', 48))
    sc.cycles.use_denoising = True
    sc.render.resolution_x, sc.render.resolution_y = 900, 900
    w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True
    bg = w.node_tree.nodes['Background']; bg.inputs['Color'].default_value = (0.55, 0.62, 0.75, 1); bg.inputs['Strength'].default_value = 0.9
    sc.view_settings.view_transform = 'AgX'; sc.view_settings.exposure = 0
    sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN')); sun.data.energy = 3.2; sun.data.angle = math.radians(2)
    sun.rotation_euler = (math.radians(52), 0, math.radians(-25)); sc.collection.objects.link(sun)
    floor = bpy.data.meshes.new('floor'); floor.from_pydata([(-20, -20, 0), (20, -20, 0), (20, 20, 0), (-20, 20, 0)], [], [(0, 1, 2, 3)])
    fo = bpy.data.objects.new('floor', floor); sc.collection.objects.link(fo); fm = bpy.data.materials.new('sand'); fm.use_nodes = True
    fm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.45, 0.36, 0.25, 1); floor.materials.append(fm)
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam
    for name, (loc, target, lens) in shots.items():
        cam.location = loc; cam.data.lens = lens
        d = Vector(target) - Vector(loc); cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
        sc.render.filepath = f'{path}_{name}.png'; bpy.ops.render.render(write_still=True)

if __name__ == '__main__':
    bpy.ops.wm.read_factory_settings(use_empty=True); bpy.context.preferences.edit.use_global_undo = False
    only = [a for a in ARGS if a in CAST] or list(CAST)
    built = {}
    for i, fid in enumerate(only):
        arm, me, coll = build(fid, *CAST[fid]); built[fid] = arm
        print('built', fid, len(me.data.polygons), 'faces')
    if '--render' in ARGS:
        for i, (fid, arm) in enumerate(built.items()): arm.location.x = (i - (len(built) - 1) / 2) * 1.1
        bpy.context.view_layer.update()
        out = os.environ.get('RENDER_OUT', os.path.join(ROOT, 'shots', 'rb'))
        preview(built, out, {'full': ((0.6, -4.6, 1.25), (0, 0, 0.95), 42), 'face': ((0.25, -1.55, 1.68), (0, 0, 1.6), 85)})
        for arm in built.values(): arm.location.x = 0
    else:
        bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT, 'blender', 'cast_rb.blend'))
