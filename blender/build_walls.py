"""Builds the Theodosian wall modules in Blender, bakes AO, exports GLB + .blend.
Run: python blender/build_walls.py   (python with the bpy module), then python3 tools/pack.py
Axes in Blender: X = east (city), Y = along the wall (north), Z = up. Exported Y-up for three.js.
"""
import bpy, bmesh, math, random, os, sys
from mathutils import Vector, noise

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'public', 'models')
FAST = '--fast' in sys.argv
random.seed(1453)

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene

MATS = {}
for name, col in [('stone', (0.62, 0.56, 0.45, 1)), ('brick', (0.5, 0.25, 0.18, 1)), ('floor', (0.4, 0.37, 0.32, 1)), ('wood', (0.3, 0.2, 0.12, 1))]:
    m = bpy.data.materials.new(name); m.diffuse_color = col; MATS[name] = m
MAT_ORDER = list(MATS.keys())


def displace(bm, amount, seed):
    """Positional noise displacement so neighbouring boxes stay consistent."""
    for v in bm.verts:
        p = v.co
        n = v.normal
        big = noise.noise(Vector((p.x * 0.35 + seed, p.y * 0.35, p.z * 0.35)))
        small = noise.noise(Vector((p.x * 1.1, p.y * 1.1 + seed, p.z * 1.1)))
        v.co = p + n * (big * amount + small * amount * 0.35)


class Module:
    def __init__(self, name):
        self.name = name
        self.bm = bmesh.new()
        self.col_boxes = []

    def box(self, mat, x0, x1, y0, y1, z0, z1, seg=0.6, rough=0.05, collide=False, chip=0.0):
        bm = bmesh.new()
        sx, sy, sz = x1 - x0, y1 - y0, z1 - z0
        bmesh.ops.create_cube(bm, size=1.0)
        bmesh.ops.scale(bm, vec=(sx, sy, sz), verts=bm.verts)
        bmesh.ops.translate(bm, vec=((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), verts=bm.verts)
        # bevel the edges a little so corners catch light
        bmesh.ops.bevel(bm, geom=bm.edges[:], offset=min(0.025, min(sx, sy, sz) * 0.15), segments=1, affect='EDGES')
        # subdivide long edges so displacement has something to move
        for _ in range(6):
            long_edges = [e for e in bm.edges if e.calc_length() > seg * 1.6]
            if not long_edges: break
            bmesh.ops.subdivide_edges(bm, edges=long_edges, cuts=1, use_grid_fill=True)
        bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 4])
        bm.normal_update()
        if rough: displace(bm, rough, hash(self.name) % 50)
        if chip:
            # erode the top corners: push top verts down by noise
            for v in bm.verts:
                if v.co.z > z1 - 0.25:
                    n = noise.noise(Vector((v.co.x * 0.8, v.co.y * 0.8, 7.3)))
                    if n > 0.15: v.co.z -= (n - 0.15) * chip
        mi = MAT_ORDER.index(mat)
        for f in bm.faces: f.material_index = mi
        tmp = bpy.data.meshes.new('tmp'); bm.to_mesh(tmp); bm.free()
        self.bm.from_mesh(tmp); bpy.data.meshes.remove(tmp)
        if collide: self.col_boxes.append((x0, x1, y0, y1, z0, z1))

    def banded(self, x0, x1, y0, y1, z0, z1, collide=True, rough=0.07):
        z, i = z0, 0
        while z < z1 - 0.01:
            brick = i % 2 == 1
            h = min(0.55 if brick else 1.7, z1 - z)
            inset = 0.03 if brick else 0.0
            self.box('brick' if brick else 'stone', x0 + inset, x1 - inset, y0 + inset, y1 - inset, z, z + h, rough=rough * (0.5 if brick else 1))
            z += h; i += 1
        if collide: self.col_boxes.append((x0, x1, y0, y1, z0, z1))

    def parapet(self, xa, ya, xb, yb, z, thick=0.6, damage=0.25, collide=True):
        along_y = abs(yb - ya) > abs(xb - xa)
        length = abs(yb - ya) if along_y else abs(xb - xa)
        a0 = min(ya, yb) if along_y else min(xa, xb)
        c = xa if along_y else ya
        def put(mat, s, e, za, zb, **kw):
            if along_y: self.box(mat, c - thick / 2, c + thick / 2, s, e, za, zb, **kw)
            else: self.box(mat, s, e, c - thick / 2, c + thick / 2, za, zb, **kw)
        put('stone', a0, a0 + length, z, z + 1.0, rough=0.04, chip=0.12)
        n = max(1, round(length / 2.3)); step = length / n
        for i in range(n):
            r = random.random()
            if r < damage * 0.35: continue                      # merlon shot away
            h = 0.85 if r > damage else random.uniform(0.25, 0.6)   # broken stump
            s = a0 + i * step + step * 0.17
            put('stone', s, s + step * 0.66, z + 1.0, z + 1.0 + h, seg=0.45, rough=0.02, chip=0.5 if r <= damage else 0.1)
            if r > damage: put('brick', s - 0.05, s + step * 0.66 + 0.05, z + 1.0 + h, z + 1.14 + h, seg=0.5, rough=0.02)
        if collide:
            if along_y: self.col_boxes.append((c - thick / 2, c + thick / 2, a0, a0 + length, z, z + 1.9))
            else: self.col_boxes.append((a0, a0 + length, c - thick / 2, c + thick / 2, z, z + 1.9))

    def rubble(self, cx, cy, z, n, spread, size=(0.15, 0.55)):
        for _ in range(n):
            bm = bmesh.new()
            bmesh.ops.create_icosphere(bm, subdivisions=1, radius=1.0)
            s = random.uniform(*size)
            bmesh.ops.scale(bm, vec=(s * random.uniform(0.7, 1.4), s * random.uniform(0.7, 1.4), s * random.uniform(0.45, 0.8)), verts=bm.verts)
            for v in bm.verts: v.co += Vector((random.uniform(-1, 1), random.uniform(-1, 1), random.uniform(-1, 1))) * s * 0.18
            bmesh.ops.rotate(bm, cent=(0, 0, 0), matrix=__import__('mathutils').Euler((random.random() * 6, random.random() * 6, random.random() * 6)).to_matrix(), verts=bm.verts)
            a, r = random.random() * math.tau, abs(random.gauss(0, spread))
            bmesh.ops.translate(bm, vec=(cx + math.cos(a) * r, cy + math.sin(a) * r, z + s * 0.25), verts=bm.verts)
            mi = MAT_ORDER.index('stone' if random.random() > 0.3 else 'brick')
            for f in bm.faces: f.material_index = mi; f.smooth = False
            tmp = bpy.data.meshes.new('tmp'); bm.to_mesh(tmp); bm.free()
            self.bm.from_mesh(tmp); bpy.data.meshes.remove(tmp)

    def finish(self, bake=True):
        me = bpy.data.meshes.new(self.name)
        self.bm.to_mesh(me); self.bm.free()
        for k in MAT_ORDER: me.materials.append(MATS[k])
        ob = bpy.data.objects.new(self.name, me); scene.collection.objects.link(ob)
        bpy.context.view_layer.objects.active = ob; ob.select_set(True)
        # UV0: metre-scaled box projection for tiling textures
        uv = me.uv_layers.new(name='UVMap')
        for poly in me.polygons:
            n = poly.normal; ax = max(range(3), key=lambda i: abs(n[i]))
            for li in poly.loop_indices:
                p = me.vertices[me.loops[li].vertex_index].co
                uv.data[li].uv = (p.y, p.z) if ax == 0 else (p.x, p.z) if ax == 1 else (p.x, p.y)
        # shade: auto smooth by angle
        for poly in me.polygons: poly.use_smooth = True
        bpy.ops.object.shade_auto_smooth(angle=math.radians(40)) if hasattr(bpy.ops.object, 'shade_auto_smooth') else None
        # UV1: lightmap
        lm = me.uv_layers.new(name='Lightmap'); me.uv_layers.active = lm
        bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.003)
        bpy.ops.object.mode_set(mode='OBJECT')
        print(self.name, 'tris', sum(len(p.vertices) - 2 for p in me.polygons)); sys.stdout.flush()
        if bake: bake_ao(ob, self.name)
        me.uv_layers.active = me.uv_layers['UVMap']
        ob.select_set(False)
        # collision boxes as custom property (json) read by the game
        import json
        ob['colliders'] = json.dumps([[round(v, 3) for v in b] for b in self.col_boxes])
        return ob


def bake_ao(ob, name):
    size = 1024 if FAST else 2048
    img = bpy.data.images.new(name + '_ao', size, size, alpha=False)
    for m in ob.data.materials:
        m.use_nodes = True
        nt = m.node_tree
        node = nt.nodes.new('ShaderNodeTexImage'); node.image = img; node.name = 'BAKE'
        nt.nodes.active = node
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = 8 if FAST else 32
    scene.cycles.use_denoising = False
    scene.render.bake.margin = 8
    if scene.world is None: scene.world = bpy.data.worlds.new('w')
    scene.world.light_settings.distance = 6.0
    bpy.ops.object.bake(type='AO', uv_layer='Lightmap')
    path = os.path.join(OUT, name + '_ao.jpg')
    img.filepath_raw = path; img.file_format = 'JPEG'
    scene.render.image_settings.quality = 88
    img.save()
    for m in ob.data.materials:
        m.node_tree.nodes.remove(m.node_tree.nodes['BAKE'])
    print('baked', path); sys.stdout.flush()


# ---------------------------------------------------------------------------
# Outer wall module: 55 m of wall with one projecting tower. Origin at tower centre.
# Wall body x -2.5..2.5, walkway at z=8. Tower x -9.5..-1.2, y -4.5..4.5, top z=10.
# West (camp) is -X.
def outer_module(hero):
    m = Module('outer_hero' if hero else 'outer')
    L = 27.5
    m.banded(-2.5, 2.5, -L, L, 0, 7.9)
    m.box('floor', -2.5, 2.5, -L, L, 7.9, 8.0, seg=1.2, rough=0.015)
    m.col_boxes.append((-2.5, 2.5, -L, L, 7.5, 8.0))
    dmg = 0.35 if hero else 0.2
    m.parapet(-2.5 + 0.3, -L, -2.5 + 0.3, -4.5, 8.0, damage=dmg)
    m.parapet(-2.5 + 0.3, 4.5, -2.5 + 0.3, L, 8.0, damage=dmg)
    # low rear parapet (city side)
    m.box('stone', 2.1, 2.5, -L, L, 8.0, 8.75, rough=0.04, chip=0.25, collide=True)
    # tower body, slightly battered base
    m.banded(-9.5, -1.2, -4.5, 4.5, 0, 9.9)
    m.box('stone', -9.9, -1.2, -4.9, 4.9, 0, 1.6, rough=0.09, chip=0.3)
    m.box('floor', -9.5, -1.2, -4.5, 4.5, 9.9, 10.0, seg=1.0, rough=0.015)
    m.col_boxes.append((-9.5, -1.2, -4.5, 4.5, 9.5, 10.0))
    m.parapet(-9.5 + 0.3, -4.5, -9.5 + 0.3, 4.5, 10.0, damage=dmg)
    m.parapet(-9.5, -4.5 + 0.3, -2.6, -4.5 + 0.3, 10.0, damage=dmg)
    m.parapet(-9.5, 4.5 - 0.3, -2.6, 4.5 - 0.3, 10.0, damage=dmg)
    # low kerb on the walkway side of the tower top with a gap at the stair head
    m.box('stone', -1.6, -1.2, -2.6, 4.5, 10.0, 10.7, rough=0.04, chip=0.2, collide=True)
    # stairs from walkway (z=8) up to tower top (z=10), running north along the tower flank
    steps = 8
    for i in range(steps):
        y0 = -4.5 - (steps - i) * 0.6
        m.box('stone', -2.2, -0.9, y0, y0 + 0.62, 8.0, 8.0 + (i + 1) * 0.25, seg=0.5, rough=0.02, collide=True)
    # arrow slits suggested by dark recessed brick panels
    for y in (-2.2, 2.2):
        m.box('brick', -9.56, -9.45, y - 0.18, y + 0.18, 5.2, 6.6, seg=0.4, rough=0.0)
    # timber hoarding / props on the hero tower
    if hero:
        m.rubble(-6.5, 3.0, 10.0, 18, 0.9, (0.08, 0.3))
        m.rubble(0.6, 12.0, 8.0, 22, 1.2, (0.08, 0.35))
        m.rubble(-11.5, -2.0, 0.0, 40, 2.5, (0.2, 0.8))
        # wooden mantlet (shield wall) the janissaries dragged up
        for k in range(6):
            m.box('wood', -8.6, -8.45, 1.2 + k * 0.5, 1.66 + k * 0.5, 10.0 + 0.0, 11.9 + random.uniform(-0.1, 0.1), seg=0.8, rough=0.01)
        m.box('wood', -8.44, -8.34, 1.1, 4.2, 10.6, 10.75, seg=0.8, rough=0.0)
        m.box('wood', -8.44, -8.34, 1.1, 4.2, 11.4, 11.55, seg=0.8, rough=0.0)
        m.col_boxes.append((-8.6, -8.34, 1.1, 4.2, 10.0, 11.9))
        # scaling ladder against the outer face
        for sx in (-0.35, 0.35):
            m.box('wood', -11.6, -11.48, -2.9 + sx, -2.78 + sx, 0, 0.2, rough=0)
    else:
        m.rubble(-11.0, 1.0, 0.0, 14, 2.0, (0.2, 0.6))
    return m.finish()


# Inner wall module: taller, thicker, big tower. Origin at tower centre; wall x -2.5..2.5 (local).
def inner_module():
    m = Module('inner')
    L = 27.5
    m.banded(-2.5, 2.5, -L, L, 0, 12.9, collide=False, rough=0.09)
    m.box('floor', -2.5, 2.5, -L, L, 12.9, 13.0, seg=2.0, rough=0.01)
    m.parapet(-2.2, -L, -2.2, -5.5, 13.0, damage=0.15, collide=False)
    m.parapet(-2.2, 5.5, -2.2, L, 13.0, damage=0.15, collide=False)
    m.banded(-7.5, 3.5, -5.5, 5.5, 0, 19.9, collide=False, rough=0.1)
    m.box('stone', -7.9, 3.5, -5.9, 5.9, 0, 2.0, rough=0.1, chip=0.3)
    m.box('floor', -7.5, 3.5, -5.5, 5.5, 19.9, 20.0, seg=2.0, rough=0.01)
    m.parapet(-7.2, -5.5, -7.2, 5.5, 20.0, damage=0.15, collide=False)
    m.parapet(-7.5, -5.2, 3.5, -5.2, 20.0, damage=0.15, collide=False)
    m.parapet(-7.5, 5.2, 3.5, 5.2, 20.0, damage=0.15, collide=False)
    m.parapet(3.2, -5.5, 3.2, 5.5, 20.0, damage=0.15, collide=False)
    for y in (-2.5, 2.5):
        m.box('brick', -7.56, -7.45, y - 0.2, y + 0.2, 9, 10.6, seg=0.5, rough=0)
        m.box('brick', -7.56, -7.45, y - 0.2, y + 0.2, 15, 16.6, seg=0.5, rough=0)
    m.col_boxes.append((-7.9, 3.5, -5.9, 5.9, 0, 20)); m.col_boxes.append((-2.5, 2.5, -L, L, 0, 13))
    return m.finish()


objs = [outer_module(True), outer_module(False), inner_module()]
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT, 'blender', 'walls.blend'))
for ob in objs:
    bpy.ops.object.select_all(action='DESELECT'); ob.select_set(True)
    bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, ob.name + '.glb'), use_selection=True, export_extras=True,
                              export_yup=True, export_apply=True, export_materials='EXPORT', export_image_format='NONE')
    print('exported', ob.name, os.path.getsize(os.path.join(OUT, ob.name + '.glb')) // 1024, 'KB')
