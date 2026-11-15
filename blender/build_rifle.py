"""Cuts the uploaded rifle model down for the browser (about 500k triangles to about 25k) and orients it for first person."""
import bpy, os
from mathutils import Matrix
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=os.path.join(ROOT, 'assets_src', 'mixamo', 'rifle.glb'))
meshes = [o for o in bpy.data.objects if o.type == 'MESH']
bpy.ops.object.select_all(action='DESELECT')
for o in meshes: o.select_set(True)
bpy.context.view_layer.objects.active = meshes[0]
bpy.ops.object.parent_clear(type='CLEAR_KEEP_TRANSFORM')
bpy.ops.object.join()
ob = bpy.context.view_layer.objects.active
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
tris = sum(len(p.vertices) - 2 for p in ob.data.polygons)
m = ob.modifiers.new('d', 'DECIMATE'); m.ratio = min(1, 26000 / tris)
bpy.ops.object.modifier_apply(modifier='d')
s = 0.1
ob.matrix_world = Matrix(((s, 0, 0, 0), (0, s, 0, 1.2 * s), (0, 0, s, -0.38 * s), (0, 0, 0, 1))) @ ob.matrix_world
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
bpy.ops.object.shade_smooth()
lo = [min(v.co[i] for v in ob.data.vertices) for i in range(3)]; hi = [max(v.co[i] for v in ob.data.vertices) for i in range(3)]
print('tris', tris, '->', sum(len(p.vertices) - 2 for p in ob.data.polygons), 'bbox', [round(x, 3) for x in lo], [round(x, 3) for x in hi])
out = os.path.join(ROOT, 'public', 'models', 'rifle.glb')
bpy.ops.export_scene.gltf(filepath=out, export_yup=True, export_image_format='JPEG', export_jpeg_quality=85, use_selection=True)
print('rifle', os.path.getsize(out) // 1024, 'KB')
