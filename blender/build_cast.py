"""Builds the fighters with MPFB (MakeHuman for Blender): realistic bodies and faces on a Mixamo-compatible
skeleton, with clothes made from each body's own surface so they bend exactly with it.

Needs the MPFB extension installed in this Blender (see docs/CHARACTERS.md).
Run:  python blender/build_cast.py [--preview DIR]
Writes blender/cast.blend (characters only; animation is added by blender/retarget.py).
MPFB-generated characters and assets are CC0.
"""
import bpy, bmesh, sys, os, math, importlib, addon_utils
from mathutils import Vector, Matrix

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
bpy.ops.wm.read_homefile(use_empty=True)
addon_utils.enable('bl_ext.user_default.mpfb', default_set=True)
def svc(mod, cls): return getattr(importlib.import_module([m for m in sys.modules if m.endswith(mod)][0]), cls)
HS = svc('mpfb.services.humanservice', 'HumanService')
TS = svc('mpfb.services.targetservice', 'TargetService')

# ---------------------------------------------------------------------------------------------
CAST = {
    'davud': dict(  # young janissary
        macro=dict(gender=1.0, age=0.42, muscle=0.68, weight=0.45, height=0.55, proportions=0.6, race=dict(caucasian=0.55, asian=0.25, african=0.2)),
        face={'nose-hump-incr': 0.4, 'chin-prominent-incr': 0.3, 'head-oval': 0.5, 'eyebrows-trans-down': 0.3},
        colors=dict(tunic=(0.55, 0.06, 0.05), trousers=(0.12, 0.18, 0.42), boots=(0.72, 0.52, 0.12), sash=(0.75, 0.6, 0.2)),
        skin=(0.62, 0.43, 0.32), hat='bork', moustache=False, armour=None, skirt=True),
    'theodoros': dict(  # Byzantine guard
        macro=dict(gender=1.0, age=0.7, muscle=0.62, weight=0.68, height=0.48, proportions=0.45, race=dict(caucasian=0.8, asian=0.05, african=0.15)),
        face={'nose-greek-incr': 0.5, 'head-rectangular': 0.5, 'chin-width-incr': 0.4},
        colors=dict(tunic=(0.18, 0.22, 0.35), trousers=(0.35, 0.3, 0.24), boots=(0.22, 0.14, 0.08), sash=(0.5, 0.08, 0.08)),
        skin=(0.66, 0.48, 0.38), hat='helmet', moustache=False, armour='mail', skirt=True),
    'lorenzo': dict(  # Genoese captain
        macro=dict(gender=1.0, age=0.55, muscle=0.6, weight=0.5, height=0.58, proportions=0.55, race=dict(caucasian=0.9, asian=0.05, african=0.05)),
        face={'head-invertedtriangular': 0.5, 'nose-curve-convex': 0.4, 'chin-prognathism-incr': 0.3},
        colors=dict(tunic=(0.45, 0.04, 0.08), trousers=(0.08, 0.08, 0.1), boots=(0.08, 0.06, 0.05), sash=(0.9, 0.88, 0.82)),
        skin=(0.7, 0.52, 0.42), hat='cap', moustache=False, armour='plate', skirt=False),
}

PREFIX = ['']
def mat(name, rgb, rough=0.8, metal=0.0):
    name = PREFIX[0] + name
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True; b = m.node_tree.nodes.get('Principled BSDF')
    b.inputs['Base Color'].default_value = (*rgb, 1); b.inputs['Roughness'].default_value = rough; b.inputs['Metallic'].default_value = metal
    return m

def dominant_bone(obj):
    """vertex index -> name of the bone that moves it most"""
    names = {g.index: g.name for g in obj.vertex_groups}
    out = {}
    for v in obj.data.vertices:
        best, w = None, 0.0
        for g in v.groups:
            if g.weight > w and names[g.group].startswith('mixamorig:'): best, w = names[g.group], g.weight
        out[v.index] = best
    return out

def _in_group(obj, group_name):
    gi = obj.vertex_groups[group_name].index
    return {v.index for v in obj.data.vertices if any(g.group == gi and g.weight > 0.5 for g in v.groups)}

def split_by_group(obj, group_name, new_name):
    """Move the faces of a vertex group into their own object (keeps weights and the armature modifier)."""
    inside = _in_group(obj, group_name)
    new = obj.copy(); new.data = obj.data.copy(); new.name = new_name; bpy.context.collection.objects.link(new)
    for o, keep_inside in ((new, True), (obj, False)):
        bm = bmesh.new(); bm.from_mesh(o.data)
        drop = [f for f in bm.faces if all(v.index in inside for v in f.verts) != keep_inside]
        bmesh.ops.delete(bm, geom=drop, context='FACES')
        loose = [v for v in bm.verts if not v.link_faces]; bmesh.ops.delete(bm, geom=loose, context='VERTS')
        bm.to_mesh(o.data); bm.free()
    return new

def shell(src, name, keep, offset, material, smooth_iters=2):
    """A garment: a copy of the body's faces whose vertices pass keep(dominant_bone, position), pushed out along the normals."""
    o = src.copy(); o.data = src.data.copy(); o.name = name; bpy.context.collection.objects.link(o)
    dom = dominant_bone(o)
    bm = bmesh.new(); bm.from_mesh(o.data); bm.verts.ensure_lookup_table()
    drop = [f for f in bm.faces if not all(keep(dom[v.index], v.co) for v in f.verts)]
    bmesh.ops.delete(bm, geom=drop, context='FACES'); bm.normal_update()
    for v in bm.verts: v.co += v.normal * offset
    for _ in range(smooth_iters): bmesh.ops.smooth_vert(bm, verts=bm.verts, factor=0.5, use_axis_x=True, use_axis_y=True, use_axis_z=True)
    bm.to_mesh(o.data); bm.free()
    o.data.materials.clear(); o.data.materials.append(material)
    sol = o.modifiers.new('thickness', 'SOLIDIFY'); sol.thickness = 0.006; sol.offset = -1
    o.modifiers.move(len(o.modifiers) - 1, 0)  # solidify before the armature
    return o

def bone_parent(obj, rig, bone):
    """Attach a rigid prop (hat, moustache) to a bone, keeping its current world position."""
    bpy.context.view_layer.update(); mw = obj.matrix_world.copy(); obj.parent = rig; obj.parent_type = 'BONE'; obj.parent_bone = bone
    obj.matrix_world = mw

UPPER = {'Hips', 'Spine', 'Spine1', 'Spine2', 'LeftShoulder', 'RightShoulder', 'LeftArm', 'RightArm', 'LeftForeArm', 'RightForeArm', 'Neck'}
LEGS = {'LeftUpLeg', 'RightUpLeg', 'LeftLeg', 'RightLeg'}
FEET = {'LeftFoot', 'RightFoot', 'LeftToeBase', 'RightToeBase'}
SHOWN = {'Head', 'Neck', 'LeftHand', 'RightHand'}  # skin left visible (plus fingers)
bare = lambda b: (b or '').replace('mixamorig:', '')

def build(name, spec):
    PREFIX[0] = name + '_'
    base = HS.create_human(mask_helpers=False, macro_detail_dict={**TS.get_default_macro_info_dict(), **spec['macro']})
    for t, v in spec['face'].items():
        p = TS.target_full_path(t)
        if p: TS.load_target(base, p, weight=v)
        else: print('missing target', t)
    bpy.context.view_layer.objects.active = base; base.select_set(True)
    if base.data.shape_keys: bpy.ops.object.shape_key_remove(all=True, apply_mix=True)
    rig = HS.add_builtin_rig(base, 'mixamo', import_weights=True); rig.name = f'{name}_rig'
    base.name = f'{name}_body'
    mi = _in_group(base, 'joint-mouth'); mouth = sum((base.data.vertices[i].co for i in mi), Vector()) / max(1, len(mi))
    # separate the eyes, hair cap and skirt; drop the other helper geometry and the joint markers
    hairc = split_by_group(base, 'helper-hair', f'{name}_hair'); skirt = split_by_group(base, 'helper-skirt', f'{name}_skirt')
    eyes = split_by_group(base, 'helper-l-eye', f'{name}_eyeL'); eyes2 = split_by_group(base, 'helper-r-eye', f'{name}_eyeR')
    for g in ['helper-genital', 'helper-l-eyelashes-1', 'helper-l-eyelashes-2', 'helper-r-eyelashes-1', 'helper-r-eyelashes-2', 'helper-lower-teeth', 'helper-upper-teeth', 'helper-tongue', 'JointCubes', 'helper-tights', 'genitals']:
        if g in base.vertex_groups:
            junk = split_by_group(base, g, 'junk'); bpy.data.objects.remove(junk, do_unlink=True)
    bpy.data.objects.remove(hairc, do_unlink=True)  # MPFB's hair helper is a long wig; short hair is made from the scalp below
    eyem = mat('eye', (0.08, 0.05, 0.03), 0.15); [e.data.materials.clear() or e.data.materials.append(eyem) for e in (eyes, eyes2)]
    skin = mat('skin', spec['skin'], 0.55); base.data.materials.clear(); base.data.materials.append(skin)
    C = spec['colors']
    zs = [v.co.z for v in base.data.vertices]; height = max(zs) - min(zs)
    knee = min(zs) + height * 0.29; ankle = min(zs) + height * 0.075
    parts = [
        shell(base, f'{name}_tunic', lambda b, p: bare(b) in UPPER or (bare(b) in {'LeftUpLeg', 'RightUpLeg'} and p.z > knee + 0.12), 0.016, mat('tunic', C['tunic'], 0.85)),
        shell(base, f'{name}_trousers', lambda b, p: bare(b) in LEGS and p.z > ankle + 0.1, 0.01, mat('trousers', C['trousers'], 0.9)),
        shell(base, f'{name}_boots', lambda b, p: bare(b) in FEET or (bare(b) in {'LeftLeg', 'RightLeg'} and p.z < ankle + 0.16), 0.012, mat('leather', C['boots'], 0.6)),
        shell(base, f'{name}_sash', lambda b, p: bare(b) in {'Hips', 'Spine'} and abs(p.z - (min(zs) + height * 0.56)) < 0.05, 0.03, mat('sash', C['sash'], 0.7)),
    ]
    if spec['skirt']:
        skirt.data.materials.clear(); skirt.data.materials.append(bpy.data.materials[PREFIX[0] + 'tunic'])
        bm = bmesh.new(); bm.from_mesh(skirt.data); bm.normal_update(); [setattr(v, 'co', v.co + v.normal * 0.02) for v in bm.verts]
        bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.calc_center_median().z < knee - 0.04], context='FACES'); bm.to_mesh(skirt.data); bm.free()
        sol = skirt.modifiers.new('thickness', 'SOLIDIFY'); sol.thickness = 0.006; skirt.modifiers.move(len(skirt.modifiers) - 1, 0); parts.append(skirt)
    else: bpy.data.objects.remove(skirt, do_unlink=True)
    brow = mouth.z + 0.085
    parts.append(shell(base, f'{name}_hair', lambda b, p: bare(b) == 'Head' and p.z > brow and (p.y > mouth.y + 0.05 or p.z > brow + 0.045), 0.004, mat('hair', (0.03, 0.02, 0.013), 0.8), smooth_iters=1))
    if spec['armour'] == 'mail': parts.append(shell(base, f'{name}_mail', lambda b, p: bare(b) in UPPER - {'LeftForeArm', 'RightForeArm', 'Neck'} or (bare(b) in {'LeftUpLeg', 'RightUpLeg'} and p.z > knee + 0.25), 0.026, mat('mail', (0.32, 0.32, 0.33), 0.62, 0.85)))
    if spec['armour'] == 'plate': parts.append(shell(base, f'{name}_plate', lambda b, p: bare(b) in {'Spine', 'Spine1', 'Spine2'} and p.z > min(zs) + height * 0.58, 0.045, mat('steel', (0.62, 0.63, 0.66), 0.3, 1.0), smooth_iters=6))
    # hide skin that clothes cover, so it can never poke through
    dom = dominant_bone(base); bm = bmesh.new(); bm.from_mesh(base.data)
    covered = [f for f in bm.faces if not any(bare(dom[v.index]) in SHOWN or 'Hand' in bare(dom[v.index]) for v in f.verts)]
    bmesh.ops.delete(bm, geom=covered, context='FACES'); bm.to_mesh(base.data); bm.free()
    # head props
    head = rig.pose.bones['mixamorig:Head']; hw = rig.matrix_world @ head.head
    top = max(zs); props = []
    if spec['hat'] == 'bork':
        felt = mat('felt', (0.93, 0.91, 0.86), 0.95); gold = mat('gold', (0.8, 0.6, 0.25), 0.35, 1.0)
        bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=0.095, depth=0.27, location=(hw.x, hw.y + 0.01, top + 0.06)); b1 = bpy.context.object
        bm = bmesh.new(); bm.from_mesh(b1.data); [setattr(v.co, 'x', v.co.x * (1.12 if v.co.z < 0 else 0.9)) or setattr(v.co, 'y', v.co.y * (1.12 if v.co.z < 0 else 0.9)) for v in bm.verts]; bm.to_mesh(b1.data); bm.free()
        b1.data.materials.append(felt)
        bpy.ops.mesh.primitive_cube_add(size=1, location=(hw.x, hw.y + 0.1, top - 0.08)); flap = bpy.context.object; flap.location.z = top - 0.12; flap.scale = (0.15, 0.02, 0.32); flap.rotation_euler.x = math.radians(12); flap.data.materials.append(felt)
        bpy.ops.mesh.primitive_torus_add(major_radius=0.112, minor_radius=0.018, location=(hw.x, hw.y + 0.01, top - 0.07)); band = bpy.context.object; band.data.materials.append(gold)
        props += [b1, flap, band]
    if spec['hat'] == 'cap':
        cloth = mat('cap', (0.45, 0.04, 0.08), 0.85)
        bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=12, radius=0.115, location=(hw.x, hw.y + 0.005, top - 0.045)); cap = bpy.context.object; cap.scale = (1.05, 1.08, 0.62); cap.data.materials.append(cloth)
        props.append(cap)
    if spec['hat'] == 'helmet':
        steel = mat('steel', (0.55, 0.56, 0.58), 0.35, 1.0)
        bpy.ops.mesh.primitive_cone_add(vertices=24, radius1=0.125, radius2=0.01, depth=0.24, location=(hw.x, hw.y, top + 0.05)); cone = bpy.context.object; cone.data.materials.append(steel)
        bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=0.128, depth=0.04, location=(hw.x, hw.y, top - 0.06)); rim = bpy.context.object; rim.data.materials.append(steel)
        bpy.ops.mesh.primitive_cube_add(size=1, location=(hw.x, hw.y - 0.12, top - 0.14)); nasal = bpy.context.object; nasal.scale = (0.018, 0.012, 0.14); nasal.data.materials.append(steel)
        props += [cone, rim, nasal]
    if spec['moustache']:
        hair = mat('hair', (0.04, 0.025, 0.015), 0.7)
        verts = [v.co for v in base.data.vertices]
        lip = min((c for c in verts if abs(c.z - (mouth.z + 0.012)) < 0.006 and abs(c.x - mouth.x) < 0.01), key=lambda c: c.y, default=mouth)
        front, mz = lip, lip.z
        for side in (-1, 1):
            bpy.ops.mesh.primitive_uv_sphere_add(segments=12, ring_count=8, radius=0.022, location=(front.x + side * 0.019, front.y + 0.002, mz - 0.002))
            m = bpy.context.object; m.scale = (1.1, 0.3, 0.32); m.rotation_euler.y = side * math.radians(-18); m.data.materials.append(hair); props.append(m)
    for p in props: bone_parent(p, rig, 'mixamorig:Head')
    coll = bpy.data.collections.new(name); bpy.context.scene.collection.children.link(coll)
    for o in [rig, base, eyes, eyes2, *parts, *props]:
        for c in list(o.users_collection): c.objects.unlink(o)
        coll.objects.link(o)
    print('built', name, 'height', round(height, 2), 'objects', len(coll.objects))
    return rig, coll

built = {n: build(n, s) for n, s in CAST.items()}
# line them up for previews
for i, (n, (rig, coll)) in enumerate(built.items()): rig.location.x = (i - 1) * 1.1
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT, 'blender', 'cast.blend'))

if '--preview' in sys.argv:
    out = sys.argv[sys.argv.index('--preview') + 1]
    sc = bpy.context.scene; sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = 24; sc.cycles.use_denoising = False
    sc.render.resolution_x = 1200; sc.render.resolution_y = 900
    w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True; w.node_tree.nodes['Background'].inputs[1].default_value = 0.6
    sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN')); sun.data.energy = 3.5; sun.rotation_euler = (math.radians(50), 0, math.radians(-30)); sc.collection.objects.link(sun)
    for shot, (loc, look, ortho) in {'full': ((0, -5.5, 1.0), (0, 0, 0.9), 2.4), 'faces': ((0, -2.2, 1.6), (0, 0, 1.55), 0.9)}.items():
        cam = bpy.data.objects.new('cam_' + shot, bpy.data.cameras.new('cam_' + shot)); sc.collection.objects.link(cam); sc.camera = cam
        cam.data.type = 'ORTHO'; cam.data.ortho_scale = ortho * (1.6 if shot == 'full' else 3.6); cam.location = loc
        cam.rotation_euler = (math.radians(90), 0, 0); sc.render.filepath = os.path.join(out, f'cast_{shot}.png'); bpy.ops.render.render(write_still=True)
