"""Moves every animation onto the MPFB fighters and exports one GLB per fighter.

Sources:
  - blender/moves_preview.blend: the Mixamo clips plus the hand-built moves (block, dodges, leap)
  - Bandai Namco Research Motion Dataset (CC BY-NC 4.0): real mocap sidesteps, back-steps, slashes, kick, bow

Method: for each bone pair, the target is first turned so it points the same way as the source's rest pose
(arms out, legs down) while keeping its own twist. From then on the target follows the source's world rotation
with that fixed offset, and the hips follow the source's travel scaled by leg length. This works between any two
skeletons whatever their rest poses or bone rolls.

Run:  python blender/retarget.py   (after build_cast.py and build_characters.py --preview)
Then: python3 tools/pack.py
"""
import bpy, os, sys, json, math
from mathutils import Matrix, Vector, Quaternion

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BANDAI = os.environ.get('BANDAI', '/home/user/bandainamcoresearchinc/bandai-namco-research-motiondataset/dataset/Bandai-Namco-Research-Motiondataset-1/data')
OUT = os.path.join(ROOT, 'public', 'models')
FAST = '--fast' in sys.argv
CAST_FILE = sys.argv[sys.argv.index('--cast') + 1] if '--cast' in sys.argv else 'cast.blend'

bpy.ops.wm.open_mainfile(filepath=os.path.join(ROOT, 'blender', CAST_FILE))
bpy.context.preferences.edit.use_global_undo = False
sc = bpy.context.scene
sc.render.fps = 30; sc.render.fps_base = 1  # all motion was recorded at 30 frames a second
rigs = {o.name[:-4]: o for o in bpy.data.objects if o.type == 'ARMATURE' and o.name.endswith('_rig')}

# ---------- sources
with bpy.data.libraries.load(os.path.join(ROOT, 'blender', 'moves_preview.blend')) as (src, dst):
    dst.objects = [n for n in src.objects]
knight = next(o for o in dst.objects if o and o.type == 'ARMATURE')
sc.collection.objects.link(knight)
knight_actions = [a for a in bpy.data.actions if a.library is not None or a.name in {'block', 'dodge_side', 'dodge_back', 'leap'}]
for o in dst.objects:
    if o and o is not knight and o.name not in sc.objects: pass  # meshes stay unlinked
if knight.animation_data:
    for tr in list(knight.animation_data.nla_tracks): knight.animation_data.nla_tracks.remove(tr)

BVH = {  # game clip name -> Bandai file
    'strafe_left': 'dataset-1_walk-left_active_001.bvh', 'strafe_right': 'dataset-1_walk-right_active_001.bvh',
    'walk_back': 'dataset-1_walk-back_active_001.bvh', 'slash_b': 'dataset-1_slash_normal_001.bvh', 'slash_c': 'dataset-1_slash_normal_002.bvh',
    'kick': 'dataset-1_kick_normal_001.bvh', 'dash': 'dataset-1_dash_active_001.bvh', 'bow': 'dataset-1_bow_proud_001.bvh',
    'walk_mocap': 'dataset-1_walk_active_001.bvh', 'run_mocap': 'dataset-1_run_active_001.bvh',
}
BMAP = {'Hips': 'Hips', 'Spine': 'Spine', 'Chest': 'Spine2', 'Neck': 'Neck', 'Head': 'Head',
        'Shoulder_L': 'LeftShoulder', 'UpperArm_L': 'LeftArm', 'LowerArm_L': 'LeftForeArm', 'Hand_L': 'LeftHand',
        'Shoulder_R': 'RightShoulder', 'UpperArm_R': 'RightArm', 'LowerArm_R': 'RightForeArm', 'Hand_R': 'RightHand',
        'UpperLeg_L': 'LeftUpLeg', 'LowerLeg_L': 'LeftLeg', 'Foot_L': 'LeftFoot', 'Toes_L': 'LeftToeBase',
        'UpperLeg_R': 'RightUpLeg', 'LowerLeg_R': 'RightLeg', 'Foot_R': 'RightFoot', 'Toes_R': 'RightToeBase'}
bvh_rigs = {}
for clip, f in BVH.items():
    path = os.path.join(BANDAI, f)
    if not os.path.exists(path): print('missing', f); continue
    before = set(bpy.data.objects)
    bpy.ops.import_anim.bvh(filepath=path, global_scale=0.01, frame_start=1, use_fps_scale=False, rotate_mode='NATIVE', axis_forward='-Z', axis_up='Y')
    arm = next(o for o in bpy.data.objects if o not in before and o.type == 'ARMATURE'); arm.name = 'bvh_' + clip
    arm.animation_data.action.name = clip
    bvh_rigs[clip] = arm

bname = lambda n: n.split(':')[-1]
def rot3(m): return m.to_3x3().normalized()

def world_pose(arm, frame):
    sc.frame_set(frame)
    return {bname(pb.name): (arm.matrix_world @ pb.matrix) for pb in arm.pose.bones}

def face_forward(arm):
    """Turn a source armature about the vertical so its rest pose faces -Y like the Mixamo clips (hips left-to-right along +X)."""
    bones = {bname(b.name): b for b in arm.data.bones}
    l = arm.matrix_world @ bones['UpperLeg_L' if 'UpperLeg_L' in bones else 'LeftUpLeg'].head_local
    r = arm.matrix_world @ bones['UpperLeg_R' if 'UpperLeg_R' in bones else 'RightUpLeg'].head_local
    d = l - r; ang = math.atan2(d.y, d.x)
    arm.rotation_euler.z -= ang; bpy.context.view_layer.update()

class Retarget:
    def __init__(self, src, tgt, mapping):
        self.src, self.tgt, self.map = src, tgt, mapping  # mapping: target bone -> source bone (bare names)
        A_s, A_t = src.matrix_world, tgt.matrix_world
        sb = {bname(b.name): b for b in src.data.bones}; self.tb = {bname(b.name): b for b in tgt.data.bones}
        self.order = [b for b in tgt.data.bones]  # parents come first in Blender's bone list
        self.order.sort(key=lambda b: len(b.parent_recursive))
        self.C = {}
        for t, s in mapping.items():
            if t not in self.tb or s not in sb: continue
            Rs = rot3(A_s @ sb[s].matrix_local); Rt = rot3(A_t @ self.tb[t].matrix_local)
            ys = (A_s.to_3x3() @ (sb[s].tail_local - sb[s].head_local)).normalized()
            yt = (A_t.to_3x3() @ (self.tb[t].tail_local - self.tb[t].head_local)).normalized()
            Rt_aligned = yt.rotation_difference(ys).to_matrix() @ Rt
            self.C[t] = Rs.inverted() @ Rt_aligned
        hs = A_s @ sb[mapping['Hips']].head_local; ht = A_t @ self.tb['Hips'].head_local
        self.hips_s0, self.hips_t0 = hs, ht; self.scale = ht.z / max(1e-4, hs.z)

    def bake(self, action_name, f0, f1, step=1, finger_basis=None):
        tgt = self.tgt; At_inv = tgt.matrix_world.inverted(); Rat_inv = rot3(tgt.matrix_world).inverted()
        if tgt.animation_data is None: tgt.animation_data_create()
        act = bpy.data.actions.new(f'{bname(tgt.name)[:-4]}|{action_name}'); act['clip'] = action_name; tgt.animation_data.action = act
        frames = list(range(f0, f1 + 1, step))
        for k, f in enumerate(frames):
            W = world_pose(self.src, f)
            pose_rot = {}  # target armature-space rotation per bone
            for b in self.order:
                n = bname(b.name); rest = rot3(b.matrix_local)
                parent = b.parent; prest = rot3(parent.matrix_local) if parent else Matrix.Identity(3)
                ppose = pose_rot[bname(parent.name)] if parent else Matrix.Identity(3)
                rel = prest.inverted() @ rest
                if n in self.C and self.map[n] in W:
                    want = Rat_inv @ (rot3(W[self.map[n]]) @ self.C[n])
                    basis = rel.inverted() @ ppose.inverted() @ want
                elif finger_basis and n in finger_basis: basis = finger_basis[n].to_matrix()
                else: basis = Matrix.Identity(3)
                pose_rot[n] = ppose @ rel @ basis
                pb = tgt.pose.bones[b.name]; pb.rotation_mode = 'QUATERNION'
                q = basis.to_quaternion()
                if k and (pb.rotation_quaternion.dot(q) < 0): q.negate()  # keep quaternions continuous
                pb.rotation_quaternion = q
                if n == 'Hips':
                    hs = W[self.map['Hips']].to_translation()
                    want_t = self.hips_t0 + (hs - self.hips_s0) * self.scale
                    loc = rest.inverted() @ (At_inv @ want_t - b.head_local)
                    pb.location = loc; pb.keyframe_insert('location', frame=k * step + 1)
                pb.keyframe_insert('rotation_quaternion', frame=k * step + 1)
        tgt.animation_data.action = None
        return act

MIX = {bname(b.name): bname(b.name) for b in next(iter(rigs.values())).data.bones}
# meshes are not needed while baking; hiding them keeps every frame fast
for o in bpy.data.objects:
    if o.type == 'MESH': o.hide_viewport = True
for arm in bvh_rigs.values(): face_forward(arm)
manifest = {}
for name, rig in rigs.items():
    made = []
    # every bone at rest first, so the offsets are measured against the rest pose
    for pb in rig.pose.bones: pb.rotation_mode = 'QUATERNION'; pb.rotation_quaternion = (1, 0, 0, 0); pb.location = (0, 0, 0)
    kt = Retarget(knight, rig, MIX)
    knight.animation_data_create()
    for act in [a for a in bpy.data.actions if a.name in {'idle', 'walking', 'running', 'sword_slash', 'hit_reaction', 'dying_1', 'dying_2', 'crouch_idle', 'rifle_aim_idle', 'block', 'dodge_side', 'dodge_back', 'leap'} and a.users >= 0]:
        if '|' in act.name or any(a['clip'] == act.name for a in made): continue
        knight.animation_data.action = act
        if hasattr(knight.animation_data, 'action_slot') and act.slots: knight.animation_data.action_slot = act.slots[0]
        f0, f1 = int(act.frame_range[0]), int(act.frame_range[1])
        made.append(kt.bake(act.name, f0, f1, 2 if FAST else 1))
    # a sword grip for the mocap clips, which have no fingers: the fingers from the slash recording
    knight.animation_data.action = bpy.data.actions['sword_slash']
    if hasattr(knight.animation_data, 'action_slot') and knight.animation_data.action.slots: knight.animation_data.action_slot = knight.animation_data.action.slots[0]
    grip = {}
    tmp = kt.bake('_grip', 3, 3)
    for fc in tmp.fcurves if hasattr(tmp, 'fcurves') else []: pass
    for pb in rig.pose.bones:
        if 'Hand' in pb.name and any(k in pb.name for k in ('Index', 'Middle', 'Ring', 'Pinky', 'Thumb')):
            rig.animation_data.action = tmp; sc.frame_set(1); grip[bname(pb.name)] = pb.rotation_quaternion.copy()
    rig.animation_data.action = None; bpy.data.actions.remove(tmp)
    for clip, arm in bvh_rigs.items():
        bt = Retarget(arm, rig, {t: s for s, t in BMAP.items()})
        act = arm.animation_data.action; f0, f1 = int(act.frame_range[0]), int(act.frame_range[1])
        made.append(bt.bake(clip, f0, min(f1, f0 + 240), 2 if FAST else 1, finger_basis=grip))
    # put every clip on its own NLA track for the exporter
    for tr in list(rig.animation_data.nla_tracks): rig.animation_data.nla_tracks.remove(tr)
    for act in made:
        tr = rig.animation_data.nla_tracks.new(); tr.name = act['clip']; st = tr.strips.new(act['clip'], int(act.frame_range[0]), act); st.name = act['clip']
    rig.animation_data.action = None
    # the right hand's offset from the Mixamo knight's, so the game can hold the sword the same way
    manifest[name] = {'handFix': list(kt.C['RightHand'].to_quaternion()), 'headFix': list(kt.C['Head'].to_quaternion()), 'clips': [a['clip'] for a in made]}
    print('retargeted', name, len(made), 'clips')

# ---------- export each fighter
for o in bpy.data.objects:
    if o.type == 'MESH': o.hide_viewport = False
for name, rig in rigs.items():
    bpy.ops.object.select_all(action='DESELECT')
    coll = bpy.data.collections[name]
    for o in coll.all_objects: o.select_set(True)
    rig.location = (0, 0, 0)
    for t in rig.animation_data.nla_tracks: t.mute = False
    path = os.path.join(OUT, f'fighter_{name}.glb')
    bpy.ops.export_scene.gltf(filepath=path, use_selection=True, export_yup=True, export_animations=True, export_animation_mode='NLA_TRACKS',
                              export_force_sampling=True, export_optimize_animation_size=True, export_skins=True, export_apply=True, export_frame_range=False, export_image_format='AUTO')
    print('exported', name, os.path.getsize(path) // 1024, 'KB')
json.dump(manifest, open(os.path.join(OUT, 'fighters.json'), 'w'), indent=1)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT, 'blender', CAST_FILE.replace('.blend', '_animated.blend')))
