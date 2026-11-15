"""Models the matchlock arquebus in Blender and exports GLB. Forward = +Y, up = +Z (three: -Z forward, +Y up)."""
import bpy, bmesh, math, os
from mathutils import Vector, Matrix
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
mats = {n: bpy.data.materials.new(n) for n in ('wood', 'iron', 'brass', 'cord')}
order = list(mats)

def finish(bm, name, smooth=True, bevel=0.0):
    me = bpy.data.meshes.new(name); bm.normal_update(); bm.to_mesh(me); bm.free()
    for k in order: me.materials.append(mats[k])
    ob = bpy.data.objects.new(name, me); scene.collection.objects.link(ob)
    if bevel:
        m = ob.modifiers.new('b', 'BEVEL'); m.width = bevel; m.segments = 3; m.limit_method = 'ANGLE'; m.angle_limit = math.radians(35)
    for p in me.polygons: p.use_smooth = smooth
    uv = me.uv_layers.new(name='UVMap')
    for poly in me.polygons:
        n = poly.normal; ax = max(range(3), key=lambda i: abs(n[i]))
        for li in poly.loop_indices:
            p = me.vertices[me.loops[li].vertex_index].co
            uv.data[li].uv = (p.y, p.z) if ax == 0 else (p.y, p.x) if ax == 2 else (p.x, p.z)
    return ob

def lathe_y(bm, profile, segs, mat, z=0.0, x=0.0, flat=False):
    """profile: list of (y, radius). Rings around the Y axis."""
    rings = []
    for (y, r) in profile:
        rings.append([bm.verts.new((x + math.cos(a) * r, y, z + math.sin(a) * r)) for a in [i * math.tau / segs + math.pi / segs for i in range(segs)]])
    for a, b in zip(rings, rings[1:]):
        for i in range(segs):
            f = bm.faces.new((a[i], a[(i + 1) % segs], b[(i + 1) % segs], b[i])); f.material_index = order.index(mat)
    for ring, flip in ((rings[0], False), (rings[-1], True)):
        f = bm.faces.new(ring if flip else ring[::-1]); f.material_index = order.index(mat)

def box(bm, mat, c, s, rot=None):
    r = bmesh.ops.create_cube(bm, size=1.0)['verts']
    bmesh.ops.scale(bm, vec=s, verts=r)
    if rot: bmesh.ops.rotate(bm, cent=(0, 0, 0), matrix=rot, verts=r)
    bmesh.ops.translate(bm, vec=c, verts=r)
    for f in {f for v in r for f in v.link_faces}: f.material_index = order.index(mat)

BZ = 0.014  # barrel axis height
# --- barrel: octagonal breech, round tapered tube, flared muzzle with a bore ---
bm = bmesh.new()
lathe_y(bm, [(-0.16, 0.0215), (-0.15, 0.0225), (0.16, 0.0205), (0.175, 0.0185)], 8, 'iron', BZ)
lathe_y(bm, [(0.175, 0.0178), (0.80, 0.0138), (0.815, 0.0138), (0.825, 0.0175), (0.86, 0.0185), (0.87, 0.0172), (0.87, 0.0105), (0.80, 0.0105)], 20, 'iron', BZ)
lathe_y(bm, [(-0.185, 0.008), (-0.18, 0.016), (-0.16, 0.018)], 8, 'iron', BZ)            # breech plug
box(bm, 'iron', (0, 0.845, BZ + 0.021), (0.003, 0.012, 0.006))                               # front sight
box(bm, 'iron', (0, -0.13, BZ + 0.026), (0.012, 0.02, 0.008))                                # rear sight block
barrel = finish(bm, 'barrel', bevel=0.0008)
# --- stock: side profile (y, z) extruded in x, then rounded ---
prof = [(-0.47, 0.012), (-0.47, -0.115), (-0.44, -0.125), (-0.36, -0.098), (-0.27, -0.074), (-0.19, -0.066), (-0.10, -0.052), (0.05, -0.036),
        (0.30, -0.028), (0.56, -0.02), (0.575, -0.012), (0.575, 0.004), (0.2, 0.004), (-0.17, 0.004), (-0.21, 0.016), (-0.30, 0.022), (-0.40, 0.02)]
bm = bmesh.new()
half = lambda y: 0.021 if y > -0.15 else 0.021 + (min(0.32, -0.15 - y) / 0.32) * 0.006
left = [bm.verts.new((-half(y), y, z)) for y, z in prof]; right = [bm.verts.new((half(y), y, z)) for y, z in prof]
bm.faces.new(left[::-1]); bm.faces.new(right)
n = len(prof)
for i in range(n): bm.faces.new((left[i], left[(i + 1) % n], right[(i + 1) % n], right[i]))
bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
for f in bm.faces: f.material_index = order.index('wood')
stock = finish(bm, 'stock', bevel=0.009)
# --- furniture: bands, lock plate, pan, trigger, ramrod, butt plate ---
bm = bmesh.new()
for y in (0.02, 0.27, 0.5):
    for dz, sx, sz in ((BZ - 0.011, 0.046, 0.056),):
        box(bm, 'brass', (0, y, dz), (sx, 0.009, sz))
box(bm, 'iron', (0.0235, -0.07, -0.012), (0.004, 0.17, 0.04))                               # lock plate
box(bm, 'iron', (0.032, -0.105, BZ + 0.002), (0.02, 0.034, 0.006))                           # pan
box(bm, 'iron', (0.034, -0.105, BZ + 0.012), (0.018, 0.03, 0.003), Matrix.Rotation(0.5, 3, 'Y'))  # pan cover
box(bm, 'iron', (0.0, -0.2, -0.09), (0.006, 0.11, 0.006), Matrix.Rotation(-0.25, 3, 'X'))   # trigger lever
box(bm, 'brass', (0, -0.472, -0.055), (0.05, 0.006, 0.135))                                  # butt plate
lathe_y(bm, [(0.06, 0.0042), (0.6, 0.0042), (0.61, 0.006), (0.62, 0.0045)], 8, 'wood', -0.034)  # ramrod
furn = finish(bm, 'furniture', bevel=0.0015)
# --- serpentine (separate object so the game can swing it); pivot at its base ---
bm = bmesh.new()
pts = [(0, 0, 0), (0, 0.012, 0.028), (0, 0.03, 0.05), (0, 0.052, 0.058), (0, 0.068, 0.05)]
for a, b in zip(pts, pts[1:]):
    a, b = Vector(a), Vector(b); d = b - a
    box(bm, 'iron', (a + b) / 2, (0.005, d.length + 0.004, 0.008), Matrix.Rotation(math.atan2(d.z, d.y), 3, 'X'))
box(bm, 'iron', (0, 0.07, 0.046), (0.009, 0.012, 0.012))                                      # jaws
lathe_y(bm, [(0.068, 0.0035), (0.082, 0.0035)], 8, 'cord', 0.046)                             # match tip
serp = finish(bm, 'serp', bevel=0.001)
serp.location = (0.03, -0.185, -0.012)
# match cord hanging from the jaws down the lock side
bm = bmesh.new()
cp = [Vector((0.03, -0.11, 0.034)), Vector((0.036, -0.14, 0.01)), Vector((0.04, -0.19, -0.05)), Vector((0.038, -0.24, -0.1)), Vector((0.03, -0.27, -0.16))]
for a, b in zip(cp, cp[1:]):
    d = b - a; q = Vector((0, 1, 0)).rotation_difference(d.normalized()).to_matrix()
    box(bm, 'cord', (a + b) / 2, (0.006, d.length + 0.004, 0.006), q)
cord = finish(bm, 'cord', bevel=0.002)

for ob in (barrel, stock, furn, serp, cord):
    bpy.context.view_layer.objects.active = ob
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT, 'blender', 'arquebus.blend'))
bpy.ops.object.select_all(action='SELECT')
out = os.path.join(ROOT, 'public', 'models', 'arquebus.glb')
bpy.ops.export_scene.gltf(filepath=out, export_yup=True, export_apply=True, export_materials='EXPORT', export_image_format='NONE')
print('exported', os.path.getsize(out) // 1024, 'KB', sum(len(o.data.polygons) for o in (barrel, stock, furn, serp, cord)), 'polys before bevel')
