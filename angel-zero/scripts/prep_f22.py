#!/usr/bin/env python3
"""ANGELS ZERO — normalize the Sketchfab F-22 Raptor into angels_zero_f22.glb.

Run (from angel-zero/):  blender -b -P scripts/prep_f22.py

Source: assets/f22_raptor_free.glb  (NLM-Group "F22 Raptor FREE", CC-BY 4.0,
        https://sketchfab.com/3d-models/f22-raptor-free-2a64abf0866a405c865466c7642ca689;
        supplied separately, not committed)
Output: assets/angels_zero_f22.glb + assets/f22_prep_report.json

Source axes (Blender import): nose = -Y, up = +Z, pilot's right wing = -X.
Target axes (exported as-is, export_yup=False, same contract as prep_f15.py):
        nose = -Z, up = +Y, right wing = +X, metres.

The source carries one 600-frame gear / bay-door / stabilator demo animation.
Frame 1 is the clean flying pose (gear retracted inside the body, doors shut,
stabilators neutral) and is the pose that gets baked; frame 176 (gear fully
down) only supplies the wheel positions for the procedural gear anchors. The
control surfaces are already separate meshes, so unlike the F-15 nothing is
cut: each one is renamed to the Ctrl_* contract, its origin moved onto its
hinge line and `hinge_axis` / `hinge_kind` written as glTF extras.
"""

import bpy
import bmesh
import json
import math
import os
import time
from mathutils import Vector, Matrix

T0 = time.time()
def log(*a):
    print('[%6.1fs]' % (time.time() - T0), *a, flush=True)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "assets", "f22_raptor_free.glb")
OUT = os.path.join(ROOT, "assets", "angels_zero_f22.glb")
REPORT = os.path.join(ROOT, "assets", "f22_prep_report.json")
TARGET_LENGTH = 18.92            # F-22A overall length, m
REST_FRAME, GEAR_DOWN_FRAME = 1, 176
TEX_MAX = 1024                   # keep 1K, JPEG-compressed at export

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)
log('imported')
scene = bpy.context.scene

# ------------------------------------------------------------ source map
# Object names come from the Sketchfab glTF (see the inspection report in the
# commit that added this script). Sides are resolved from geometry, not names.
GEAR = {   # wheels, hubs, struts, lights of the extending gear (procedural gear replaces them)
    "Object_9", "Object_49", "Object_61",                       # tyres (nose, main x2)
    "Object_19", "Object_51", "Object_63",                      # hubs
    "Object_5", "Object_7", "Object_11", "Object_13", "Object_15", "Object_17", "Object_21", "Object_23",
    "Object_24", "Object_26", "Object_28", "Object_31", "Object_33", "Object_35", "Object_38",
    "Object_47", "Object_53", "Object_55", "Object_57", "Object_59", "Object_65", "Object_67",
}
JUNK = {"Object_113", "Object_89"}                              # display grid plane, stray prop off the right wing
WHEELS = {"nose": "Object_9", "mainA": "Object_49", "mainB": "Object_61"}
CTRL_SRC = {                                                    # source mesh -> kind
    "Object_121": "stabilator", "Object_151": "stabilator",
    "Object_79": "aileron", "Object_85": "aileron",
    "Object_76": "flap", "Object_82": "flap",
    "Object_70": "rudder", "Object_73": "rudder",
}
NOZZLE_SRC = ("Object_45", "Object_87")                         # engine exhaust cans
MISSILE_SRC = (("Object_141", "Object_142", "Object_143"), ("Object_147", "Object_148", "Object_149"))   # side-bay AIM-9s
CANOPY_SRC = "Object_41"

def world_pts(ob):
    return [ob.matrix_world @ v.co for v in ob.data.vertices]

def bbox(pts):
    mn = Vector(tuple(min(p[i] for p in pts) for i in range(3)))
    mx = Vector(tuple(max(p[i] for p in pts) for i in range(3)))
    return mn, mx

log('stage: wheels')
# ---------------------------------------------- wheel positions (gear down)
scene.frame_set(GEAR_DOWN_FRAME)
bpy.context.view_layer.update()
wheel_src = {}
for k, n in WHEELS.items():
    ob = bpy.data.objects.get(n)
    if ob:
        mn, mx = bbox(world_pts(ob))
        wheel_src[k] = ((mn + mx) * 0.5, (mx.z - mn.z) * 0.5)    # centre, radius (source units)

log('stage: bake')
# ------------------------------------------------------ bake the rest pose
scene.frame_set(REST_FRAME)
bpy.context.view_layer.update()
removed = []
for ob in list(bpy.data.objects):
    if ob.type == "MESH" and (ob.name in GEAR or ob.name in JUNK):
        removed.append(ob.name)
        bpy.data.objects.remove(ob, do_unlink=True)
log("Removed gear / junk meshes:", len(removed))

meshes = [o for o in bpy.data.objects if o.type == "MESH"]
# Unshare mesh data before baking (instanced data would be transformed twice).
seen = set()
for ob in meshes:
    if ob.data.name in seen or ob.data.users > 1:
        ob.data = ob.data.copy()
    seen.add(ob.data.name)

src_pts = [p for ob in meshes for p in world_pts(ob)]
src_min, src_max = bbox(src_pts)
center = (src_min + src_max) * 0.5
scale = TARGET_LENGTH / (src_max.y - src_min.y)
# Source nose -Y / up +Z / right -X  ->  target nose -Z / up +Y / right +X.
ROT = Matrix.Rotation(-math.pi / 2, 4, "X") @ Matrix.Rotation(math.pi, 4, "Z")
M = Matrix.Scale(scale, 4) @ ROT @ Matrix.Translation(-center)

def to_target(p):
    return M @ Vector(p)

# Bake world transforms (frame-1 animation pose included) into the geometry.
for ob in meshes:
    ob.data.transform(M @ ob.matrix_world)
    ob.data.update()
for ob in meshes:
    ob.animation_data_clear()
    ob.parent = None
    ob.matrix_world = Matrix.Identity(4)
for ob in list(bpy.data.objects):
    if ob not in meshes:
        bpy.data.objects.remove(ob, do_unlink=True)
for a in list(bpy.data.actions):
    bpy.data.actions.remove(a)

log('stage: shift')
# Origin shift: put the main-gear axle line at z = +0.7 m (as on the F-15) so the
# CG sits ahead of the mains and the shared ground physics (GEAR_PTS z) still fits.
mains = [to_target(wheel_src[k][0]) for k in ("mainA", "mainB") if k in wheel_src]
dz = (0.7 - sum(m.z for m in mains) / len(mains)) if mains else 0.0
SHIFT = Matrix.Translation(Vector((0.0, 0.0, dz)))
for ob in meshes:
    ob.data.transform(SHIFT)
    ob.data.update()
M = SHIFT @ M

Airframe = bpy.data.objects.new("Airframe", None)
bpy.context.collection.objects.link(Airframe)
src_name = {}
for ob in meshes:
    src_name[ob] = ob.name
    ob.name = "F22_" + ob.name
    ob.parent = Airframe
    ob.matrix_parent_inverse = Matrix.Identity(4)
by_src = {v: k for k, v in src_name.items()}

def pts(ob):
    return [v.co.copy() for v in ob.data.vertices]

def set_origin(ob, p):
    for v in ob.data.vertices:
        v.co -= p
    ob.data.update()
    ob.location = p

log('stage: controls')
# ------------------------------------------------- control-surface hinges
def le_points(vs, span_axis, chord_axis=2):
    """Leading-edge end points: within the 12 % slice at each span end, the most
    forward (min z) vertex."""
    lo = min(v[span_axis] for v in vs); hi = max(v[span_axis] for v in vs); w = hi - lo
    a = [v for v in vs if v[span_axis] <= lo + 0.12 * w]
    b = [v for v in vs if v[span_axis] >= hi - 0.12 * w]
    return min(a, key=lambda v: v[chord_axis]), min(b, key=lambda v: v[chord_axis])

controls = []
for src, kind in CTRL_SRC.items():
    ob = by_src.get(src)
    if not ob:
        log("WARN missing control", src); continue
    vs = pts(ob)
    mn, mx = bbox(vs)
    side = "L" if (mn.x + mx.x) < 0 else "R"
    if kind in ("flap", "aileron"):
        A, B = le_points(vs, 0)
        axis = (B - A).normalized()
        if axis.x < 0: axis = -axis
        hinge = (A + B) * 0.5
    elif kind == "stabilator":
        axis = Vector((1, 0, 0))                                    # all-moving slab, pivot at 45 % root chord
        hinge = Vector(((mn.x + mx.x) * 0.5, (mn.y + mx.y) * 0.5, mn.z + 0.45 * (mx.z - mn.z)))
    else:                                                           # rudder: canted fin, hinge = its leading edge
        A, B = le_points(vs, 1)
        axis = (B - A).normalized()
        if axis.y < 0: axis = -axis
        hinge = (A + B) * 0.5
    name = {"stabilator": "Ctrl_Stabilator_", "aileron": "Ctrl_Aileron_", "flap": "Ctrl_Flap_", "rudder": "Ctrl_Rudder_"}[kind] + side
    ob.name = name; ob.data.name = name
    set_origin(ob, hinge)
    ob["hinge_axis"] = [round(axis.x, 5), round(axis.y, 5), round(axis.z, 5)]
    ob["hinge_kind"] = kind
    controls.append({"name": name, "src": src, "kind": kind, "hinge": [round(c, 3) for c in hinge],
                     "axis": [round(axis.x, 5), round(axis.y, 5), round(axis.z, 5)], "size": [round(c, 3) for c in (mx - mn)], "faces": len(ob.data.polygons)})
    log("CTRLNODE %-18s from %-10s hinge=%s axis=%s" % (name, src, controls[-1]["hinge"], controls[-1]["axis"]))

log('stage: nozzles')
# ------------------------------------------------------------- nozzles
nozzles = []
for src in NOZZLE_SRC:
    ob = by_src.get(src)
    if not ob:
        log("WARN missing nozzle", src); continue
    mn, mx = bbox(pts(ob))
    c = (mn + mx) * 0.5
    nm = "Nozzle_L" if c.x < 0 else "Nozzle_R"
    ob.name = nm; ob.data.name = nm
    set_origin(ob, c)
    ob["hinge_kind"] = "nozzle"
    nozzles.append({"name": nm, "center": [round(x, 3) for x in c], "faces": len(ob.data.polygons)})
    log("CTRLNODE %-18s center=%s" % (nm, nozzles[-1]["center"]))

log('stage: ordnance')
# ------------------------------------------------------------ ordnance
# Side-bay AIM-9 groups become Pylon_MSL_1 / _2 (an empty at the missile centre with
# the missile part meshes as children: collectStores() sizes / clones the whole
# group). Copies on the main-bay rails make Pylon_MSL_3 / _4 so the shared
# 4-round MSL logic is unchanged. No bomb stations. (No bpy.ops.object.join:
# it hangs in background mode.)
def group_center(obs):
    mn, mx = bbox([v.co for o in obs for v in o.data.vertices])
    return (mn + mx) * 0.5, mn, mx

def make_pylon(name, parts, offset=None):
    c, mn, mx = group_center(parts)
    if offset is not None:
        c = c + offset
    e = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(e)
    e.location = c
    e.parent = Airframe; e.matrix_parent_inverse = Matrix.Identity(4)
    for i, o in enumerate(parts):
        if offset is not None:                                     # copy for the main-bay station
            o2 = o.copy(); o2.data = o.data.copy(); bpy.context.collection.objects.link(o2)
            for v in o2.data.vertices: v.co += offset
            o2.data.update(); o = o2
        for v in o.data.vertices: v.co -= c
        o.data.update()
        o.name = o.data.name = "%s_part%d" % (name, i)
        o.parent = e; o.matrix_parent_inverse = Matrix.Identity(4); o.location = (0, 0, 0)
    return e, (mx - mn)

groups = []
for grp in MISSILE_SRC:
    parts = [by_src.get(x) for x in grp if by_src.get(x)]
    if parts: groups.append(parts)
groups.sort(key=lambda g: group_center(g)[0].x)
ordnance = []
# Snapshot main-bay offsets before the side groups are re-parented / recentred.
offsets = [Vector((-group_center(g)[0].x * 0.55, 0.0, 0.6)) for g in groups]
src_parts = [[(o.data.copy(), o) for o in g] for g in groups]
for i, g in enumerate(groups):
    e, size = make_pylon("Pylon_MSL_%d" % (i + 1), g)
    ordnance.append({"name": e.name, "center": [round(x, 3) for x in e.location], "size": [round(x, 3) for x in size], "parts": len(g)})
for i, pairs in enumerate(src_parts):                              # main-bay copies from the untouched snapshots
    tmp = []
    for data, orig in pairs:
        ob = bpy.data.objects.new("tmp_copy", data); bpy.context.collection.objects.link(ob); tmp.append(ob)
    e, size = make_pylon("Pylon_MSL_%d" % (i + 3), tmp)
    e.location = e.location + offsets[i]                         # slide the whole station onto the main-bay rail
    ordnance.append({"name": e.name, "center": [round(x, 3) for x in e.location], "size": [round(x, 3) for x in size], "parts": len(tmp)})
for o in ordnance:
    log("ORDNANCE %-12s center=%s size=%s" % (o["name"], o["center"], o["size"]))

log('stage: canopy/gear')
# ----------------------------------------------- canopy, eye, gear anchors
canopy = by_src.get(CANOPY_SRC)
eye = None
if canopy:
    canopy.name = "Canopy_Glass"; canopy.data.name = "Canopy_Glass"
    mn, mx = bbox(pts(canopy))
    eye = Vector(((mn.x + mx.x) * 0.5, mn.y + 0.55 * (mx.y - mn.y), mn.z + 0.42 * (mx.z - mn.z)))

def empty(name, p):
    e = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(e)
    e.location = p
    e.parent = Airframe; e.matrix_parent_inverse = Matrix.Identity(4)
    return e

if eye: empty("Canopy_Pilot_Eye", eye)
# Wheel centres (gear down) in final coordinates; to_target() reads the updated M,
# which already includes the origin SHIFT.
gear = {k: to_target(c) for k, (c, r) in wheel_src.items()}
gear_out = {}
if "nose" in gear:
    gear_out["Gear_Nose"] = gear["nose"]
for k in ("mainA", "mainB"):
    if k in gear:
        gear_out["Gear_Main_L" if gear[k].x < 0 else "Gear_Main_R"] = gear[k]
for nm, p in gear_out.items():
    empty(nm, p)

log('stage: hygiene')
# ------------------------------------------------------------ textures / hygiene
downscaled = 0
for im in bpy.data.images:
    if im.has_data and max(im.size) > TEX_MAX:
        w, h = im.size; im.scale(TEX_MAX, max(1, round(h * TEX_MAX / w))); downscaled += 1
sanitized = 0
for ob in [o for o in bpy.data.objects if o.type == "MESH"]:
    bm = bmesh.new(); bm.from_mesh(ob.data)
    bad = [f for f in bm.faces if f.calc_area() < 1e-10]
    if bad:
        bmesh.ops.delete(bm, geom=bad, context="FACES"); bm.to_mesh(ob.data); ob.data.update(); sanitized += 1
    bm.free()

bpy.context.view_layer.update()          # origins moved above: refresh matrix_world before measuring
all_pts = [ob.matrix_world @ v.co for ob in bpy.data.objects if ob.type == "MESH" for v in ob.data.vertices]
tmn, tmx = bbox(all_pts)
dims = [round(tmx[i] - tmn[i], 3) for i in range(3)]
tris = sum(len(p.vertices) - 2 for ob in bpy.data.objects if ob.type == "MESH" for p in ob.data.polygons)

os.makedirs(os.path.dirname(OUT), exist_ok=True)
log('stage: export')
bpy.ops.export_scene.gltf(
    filepath=OUT, export_format="GLB", export_yup=False, export_apply=True,
    export_image_format="JPEG", export_jpeg_quality=74, export_cameras=False, export_lights=False,
    export_unused_images=False, export_extras=True, export_animations=False, use_selection=False)

log('exported')
report = {
    "source": os.path.basename(SRC), "license": "CC-BY-4.0, NLM-Group (sketchfab.com/3d-models/f22-raptor-free-2a64abf0866a405c865466c7642ca689)",
    "rest_frame": REST_FRAME, "gear_down_frame": GEAR_DOWN_FRAME, "removed": sorted(removed),
    "scale": round(scale, 6), "z_shift": round(dz, 4), "dimensions_m": dims, "tris": tris,
    "bbox_min": [round(c, 3) for c in tmn], "bbox_max": [round(c, 3) for c in tmx],
    "canopy_pilot_eye": [round(c, 3) for c in eye] if eye else None,
    "gear": {k: [round(c, 3) for c in p] for k, p in gear_out.items()},
    "wheel_radius_m": {k: round(r * scale, 3) for k, (c, r) in wheel_src.items()},
    "controls": controls, "nozzles": nozzles, "ordnance": ordnance,
    "textures_downscaled": downscaled, "meshes_sanitized": sanitized,
    "glb_bytes": os.path.getsize(OUT),
}
with open(REPORT, "w", encoding="utf-8") as fh:
    json.dump(report, fh, indent=2)
print("=== F22_PREP_RESULT ===")
print(json.dumps(report))
