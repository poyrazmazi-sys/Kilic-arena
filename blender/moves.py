"""New moves for the knight, built in Blender from real motion-capture poses.

Each move is a sequence of key poses. A key pose takes the upper body from one mocap frame and the
legs from another, then shifts the hips (jump height, crouch). Bezier keys blend the poses smoothly.
Horizontal hip travel is left to the game, which moves the fighter itself; height stays in the clip.
Run through build_characters.py (needs `arm` with the mocap actions already loaded).
"""
import bpy
import math
from mathutils import Vector, Quaternion, Matrix

LOWER = {'Hips', 'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'LeftToeBase', 'LeftToe_End', 'RightUpLeg', 'RightLeg', 'RightFoot', 'RightToeBase', 'RightToe_End'}
FPS = 30

def _bare(n): return n.split(':')[-1]

def build(arm):
    sc = bpy.context.scene; ad = arm.animation_data
    for tr in ad.nla_tracks: tr.mute = True
    acts = {a.name: a for a in bpy.data.actions}
    cache = {}

    def sample(act, frame):
        key = (act, frame)
        if key in cache: return cache[key]
        ad.action = acts[act]
        if hasattr(ad, 'action_slot') and acts[act].slots: ad.action_slot = acts[act].slots[0]
        sc.frame_set(frame)
        cache[key] = {pb.name: (pb.location.copy(), pb.rotation_quaternion.copy()) for pb in arm.pose.bones}
        return cache[key]

    hips = next(pb for pb in arm.pose.bones if _bare(pb.name) == 'Hips')
    # world metres -> hips local units (the armature is scaled 0.01 and rotated)
    R = (arm.matrix_world.to_3x3() @ hips.bone.matrix_local.to_3x3()).inverted()

    def pose(upper, lower, up=0.0, blend=None):
        """upper/lower: (action, frame). blend: optional ((action, frame), weight) mixed into the upper body."""
        U, L = sample(*upper), sample(*lower)
        B = sample(*blend[0]) if blend else None
        out = {}
        for name in U:
            src = L if _bare(name) in LOWER else U
            loc, rot = src[name][0].copy(), src[name][1].copy()
            if B and _bare(name) not in LOWER: rot = rot.slerp(B[name][1], blend[1])
            out[name] = (loc, rot)
        if up: out[hips.name] = (out[hips.name][0] + R @ Vector((0, 0, up)), out[hips.name][1])
        return out

    left = next(pb for pb in arm.pose.bones if _bare(pb.name) == 'LeftUpLeg')
    right = next(pb for pb in arm.pose.bones if _bare(pb.name) == 'RightUpLeg')
    A = arm.matrix_world.copy(); Ai = A.inverted()
    spine = next(pb for pb in arm.pose.bones if _bare(pb.name) == 'Spine')
    lsh = next(pb for pb in arm.pose.bones if _bare(pb.name) == 'LeftArm'); rsh = next(pb for pb in arm.pose.bones if _bare(pb.name) == 'RightArm')

    def face_forward(p):
        """Turn the whole body about the vertical so the hips square up to the opponent (-Y), keeping lean and crouch."""
        for pb in arm.pose.bones: pb.location, pb.rotation_quaternion = p[pb.name]
        bpy.context.view_layer.update()
        line = (A @ left.head) - (A @ right.head)          # left hip minus right hip, world space
        ang = math.atan2(line.y, line.x)                   # facing -Y means this line points along +X
        Rz = Matrix.Rotation(-ang, 4, 'Z')
        hips.matrix = Ai @ Rz @ A @ hips.matrix
        bpy.context.view_layer.update()
        # then the shoulders: take out most of the torso's twist so the chest faces the opponent too
        sh = (A @ lsh.head) - (A @ rsh.head); a2 = math.atan2(sh.y, sh.x) * 0.85
        spine.matrix = Ai @ Matrix.Translation(A @ spine.head) @ Matrix.Rotation(-a2, 4, 'Z') @ Matrix.Translation(-(A @ spine.head)) @ A @ spine.matrix
        bpy.context.view_layer.update()
        out = dict(p); out[hips.name] = (hips.location.copy(), hips.rotation_quaternion.copy()); out[spine.name] = (spine.location.copy(), spine.rotation_quaternion.copy())
        return out

    def make(name, keys):
        if name in bpy.data.actions: bpy.data.actions.remove(bpy.data.actions[name])
        act = bpy.data.actions.new(name); ad.action = act
        for frame, p in keys:
            p = face_forward(p)
            for pb in arm.pose.bones:
                pb.location, pb.rotation_quaternion = p[pb.name]
                pb.keyframe_insert('location', frame=frame); pb.keyframe_insert('rotation_quaternion', frame=frame)
        acts[name] = act
        print('move', name, 'frames', keys[0][0], '-', keys[-1][0])
        return act

    I = ('idle', 1); C = ('crouch_idle', 10); G = ('sword_slash', 3); H = ('sword_slash', 66)
    made = []
    # guard: sword held up across the body, knees a little bent
    made.append(make('block', [(1, pose(H, C, 0.1)), (20, pose(('sword_slash', 67), C, 0.11)), (40, pose(H, C, 0.1))]))
    # side-steps: load the legs, push off in a low hop, land bent, settle. Same keys for both sides;
    # the game slides the fighter left, right or back while this plays.
    step = [(1, pose(G, I)), (4, pose(G, C)), (8, pose(G, I, 0.16)), (11, pose(G, C, 0.02)), (16, pose(G, C)), (20, pose(G, I))]
    made.append(make('dodge_side', step))
    made.append(make('dodge_back', [(1, pose(G, I)), (4, pose(G, C)), (8, pose(G, I, 0.12)), (12, pose(G, C)), (20, pose(G, I))]))
    # the leap: crouch, spring up with the sword drawn back over the head, drive it down at the chest, land
    made.append(make('leap', [
        (1, pose(G, I)),
        (9, pose(('sword_slash', 16), C)),                       # load: low crouch, sword cocked
        (15, pose(('sword_slash', 85), I, 0.55)),                # take off, arms rising
        (23, pose(('sword_slash', 91), C, 1.45)),                # apex: knees tucked, sword fully back
        (29, pose(('sword_slash', 94), I, 1.0)),                 # falling, the blade starts down
        (34, pose(('sword_slash', 100), C, 0.15)),               # strike: blade drives into the chest
        (37, pose(('sword_slash', 103), C, -0.05)),              # land low, follow through
        (46, pose(('sword_slash', 106), C)),
        (54, pose(G, I)),
    ]))
    for tr in ad.nla_tracks: tr.mute = False
    ad.action = None
    return made
