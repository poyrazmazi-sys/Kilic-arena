"""Combines the Mixamo knight with all animation clips into one GLB, and prepares the kilij model.
Inputs in assets_src/mixamo (not in git). Run with the bpy python, then python3 tools/pack.py"""
import bpy, os, glob
from mathutils import Matrix
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'assets_src', 'mixamo'); OUT = os.path.join(ROOT, 'public', 'models')

def shrink(px):
    for img in bpy.data.images:
        if img.size[0] > px: img.scale(px, px)

# ---------- knight + animations ----------
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=os.path.join(SRC, 'knight.fbx'))
arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
for a in list(bpy.data.actions): bpy.data.actions.remove(a)
keep = set(bpy.data.objects)
arm.animation_data_create()
for f in sorted(glob.glob(os.path.join(SRC, '*.fbx'))):
    name = os.path.splitext(os.path.basename(f))[0]
    if name == 'knight': continue
    before = set(bpy.data.actions)
    bpy.ops.import_scene.fbx(filepath=f)
    act = next(a for a in bpy.data.actions if a not in before); act.name = name
    for o in [o for o in bpy.data.objects if o not in keep]: bpy.data.objects.remove(o, do_unlink=True)
    tr = arm.animation_data.nla_tracks.new(); tr.name = name
    st = tr.strips.new(name, int(act.frame_range[0]), act); st.name = name
    print('clip', name, [round(x) for x in act.frame_range], 'slot', getattr(st, 'action_slot', None))
arm.animation_data.action = None
shrink(1024)
bpy.ops.object.select_all(action='SELECT')
out = os.path.join(OUT, 'knight.glb')
bpy.ops.export_scene.gltf(filepath=out, export_yup=True, export_animations=True, export_animation_mode='NLA_TRACKS', export_image_format='JPEG', export_jpeg_quality=82,
                          export_force_sampling=True, export_optimize_animation_size=True, export_skins=True, export_frame_range=False)
print('knight', os.path.getsize(out) // 1024, 'KB')

# ---------- kilij ----------
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=os.path.join(SRC, 'kilij.glb'))
s = 0.19
M = Matrix(((0, 0, -s, 0), (0, -s, 0, 0), (-s, 0, 0, 2.05 * s), (0, 0, 0, 1)))
for o in bpy.data.objects:
    if o.parent is None: o.matrix_world = M @ o.matrix_world
shrink(1024)
bpy.ops.object.select_all(action='SELECT')
out = os.path.join(OUT, 'kilij.glb')
bpy.ops.export_scene.gltf(filepath=out, export_yup=True, export_image_format='JPEG', export_jpeg_quality=85, export_apply=True)
print('kilij', os.path.getsize(out) // 1024, 'KB')
