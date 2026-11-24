# ANGELS ZERO — builds the F-22A Raptor 3D cockpit GLB in Blender.
#
#   blender -b -P scripts/build_f22_cockpit.py [-- --preview out.png] [-- --nobake]
#
# Output: assets/f22_cockpit.glb + assets/f22_cockpit_report.json
#
# Frame contract (exported with export_yup=False, so Blender coords == rig coords):
#   origin = pilot eye, -Z forward, +Y up, +X right, metres. src/cockpit_f22.js
#   parents the scene under its rig (rig = eye position + jet quaternion).
# Nodes the runtime binds by name:
#   Cockpit_Static        all fixed geometry, one mesh, materials "<name>_ao"
#                         whose baseColorTexture is the baked AO atlas and whose
#                         extras.ckp_rgb holds the sRGB tint to multiply in.
#   Screen_<ID>           unit-UV quads for the live canvas displays
#                         (PMFD, SMFD_L, SMFD_R, SMFD_C, UFD_L, UFD_R).
#   Stick_Gimbal          side-stick pivot (identity rotation; rotate x = pitch, z = roll)
#   Throttle_L/R          throttle pivots (identity rotation; rotate x)
#   Gear_Handle           gear lever pivot (identity rotation; lever along +Z, rotate x)
#   HUD_Anchor            combiner base point (glass/outline stay procedural in JS)
# Layout follows the real F-22A front panel: ICP + 2 UFDs on the upper tier,
# 8x8 in PMFD flanked by two 6.25 in SMFDs, a fourth SMFD on the centre pedestal,
# diamond-plate canopy sills, side-stick right and twin throttles left.

import bpy
import bmesh
import json
import math
import os
import random
import sys
import time
from mathutils import Vector, Matrix

T0 = time.time()
def log(*a):
    print('[%6.1fs]' % (time.time() - T0), *a, flush=True)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "assets", "f22_cockpit.glb")
REPORT = os.path.join(ROOT, "assets", "f22_cockpit_report.json")
ARGV = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
PREVIEW = ARGV[ARGV.index('--preview') + 1] if '--preview' in ARGV else None
NOBAKE = '--nobake' in ARGV
AO_RES = 2048
AO_SAMPLES = 160
AO_DIST = 0.22
D2R = math.pi / 180

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
COL = scene.collection

# ------------------------------------------------------------------ materials
PALETTE = {
    # name          sRGB       rough  metal
    'ckp_shroud':  ('#2a2e34', 0.82, 0.10),
    'ckp_panel':   ('#383d43', 0.78, 0.12),
    'ckp_bezel':   ('#17191c', 0.60, 0.20),
    'ckp_osb':     ('#b4bac0', 0.55, 0.05),
    'ckp_key':     ('#959ba2', 0.55, 0.05),
    'ckp_sill':    ('#8e9399', 0.62, 0.55),
    'ckp_metal':   ('#a3aab2', 0.35, 0.85),
    'ckp_seat':    ('#30342f', 0.92, 0.00),
    'ckp_yellow':  ('#d9a427', 0.55, 0.05),
    'ckp_red':     ('#b3302a', 0.50, 0.05),
    'ckp_black':   ('#0d0e10', 0.70, 0.05),
    'ckp_white':   ('#dfe2e5', 0.60, 0.00),
    'ckp_floor':   ('#202326', 0.90, 0.05),
    'ckp_hudframe': ('#1b1e22', 0.55, 0.30),
    'ckp_lcd':     ('#0a1a12', 0.25, 0.00),
    'ckp_gearknob': ('#e8ecf0', 0.40, 0.05),
}

def hex_lin(h):
    c = [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    return [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c]

MAT = {}
def make_mat(name, hexc, rough, metal, emit=None):
    m = bpy.data.materials.new(name)
    try:
        m.use_nodes = True
    except Exception:
        pass
    m.use_backface_culling = True
    b = m.node_tree.nodes.get('Principled BSDF')
    b.inputs['Base Color'].default_value = (*hex_lin(hexc), 1)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    if emit:
        b.inputs['Emission Color'].default_value = (*hex_lin(emit), 1)
        b.inputs['Emission Strength'].default_value = 1.0
    m['ckp_rgb'] = hexc
    m.diffuse_color = (*hex_lin(hexc), 1)
    return m

for k, (h, r, mt) in PALETTE.items():
    MAT[k] = make_mat(k, h, r, mt)
for sid in ('PMFD', 'SMFD_L', 'SMFD_R', 'SMFD_C', 'UFD_L', 'UFD_R'):
    MAT['scr_' + sid] = make_mat('scr_' + sid, '#051322', 0.2, 0.0, emit='#0a2a4a')

# ------------------------------------------------------------------ frames
def Rx(deg): return Matrix.Rotation(deg * D2R, 4, 'X')
def Ry(deg): return Matrix.Rotation(deg * D2R, 4, 'Y')
def Rz(deg): return Matrix.Rotation(deg * D2R, 4, 'Z')
def T(x, y, z): return Matrix.Translation((x, y, z))
I4 = Matrix.Identity(4)

PANEL_TILT = 27                                  # face normal elevation (deg)
PANEL_O = Vector((0.0, -0.354, -0.612))           # PMFD centre plane origin
PANEL = T(*PANEL_O) @ Rx(-PANEL_TILT)            # local X right, Y up the face, Z toward pilot
def pf(u, v, w=0.0): return PANEL @ Vector((u, v, w))

PED = T(0.0, -0.600, -0.505) @ Rx(-50)            # centre pedestal face
HUD_ANCHOR = Vector((0.0, -0.118, -0.785))
HUD_TILT = 20                                      # combiner leans aft (top toward pilot)

# ------------------------------------------------------------------ bmesh shapes
def bm_box(w, h, d):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co.x *= w; v.co.y *= h; v.co.z *= d
    return bm

def bm_cyl(r1, r2, h, segs=16, axis='Y'):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=segs, radius1=r1, radius2=r2, depth=h)
    if axis == 'Y':
        bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(-math.pi / 2, 3, 'X'))
    elif axis == 'X':
        bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(math.pi / 2, 3, 'Y'))
    for f in bm.faces:
        f.smooth = len(f.verts) == 4
    return bm

def bm_loft(ra, rb, cap_a=True, cap_b=True):
    bm = bmesh.new()
    A = [bm.verts.new(p) for p in ra]
    B = [bm.verts.new(p) for p in rb]
    n = len(A)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((A[i], A[j], B[j], B[i]))
    if cap_a: bm.faces.new(A)
    if cap_b: bm.faces.new(B[::-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm

def bm_prism(pts, depth, w0=0.0):
    return bm_loft([Vector((x, y, w0)) for x, y in pts], [Vector((x, y, w0 - depth)) for x, y in pts])

def bm_quad(pts):
    bm = bmesh.new()
    bm.faces.new([bm.verts.new(p) for p in pts])
    return bm

def bm_screen(w, h):
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new('UVMap')
    vs = [bm.verts.new((x * w * 0.5, y * h * 0.5, 0)) for x, y in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    f = bm.faces.new(vs)
    for loop, (u, v) in zip(f.loops, ((0, 0), (1, 0), (1, 1), (0, 1))):
        loop[uv].uv = (u, v)
    return bm

# ------------------------------------------------------------------ objects
STATIC = []
COUNTS = {}
def mk(name, bm, mat, M=I4, parent=None, bevel=0.0, seg=2, subsurf=0, solid=0.0, static=True, smooth=False):
    COUNTS[name] = COUNTS.get(name, 0) + 1
    nm = name if COUNTS[name] == 1 else '%s.%03d' % (name, COUNTS[name])
    me = bpy.data.meshes.new(nm)
    if smooth:
        for f in bm.faces: f.smooth = True
    bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(nm, me)
    COL.objects.link(ob)
    me.materials.append(MAT[mat])
    if parent is not None:
        ob.parent = parent
    ob.matrix_basis = M
    if solid:
        md = ob.modifiers.new('solid', 'SOLIDIFY'); md.thickness = solid; md.offset = -1.0
    if bevel:
        md = ob.modifiers.new('bevel', 'BEVEL'); md.width = bevel; md.segments = seg
        md.limit_method = 'ANGLE'; md.angle_limit = 30 * D2R
    if subsurf:
        md = ob.modifiers.new('sub', 'SUBSURF'); md.levels = subsurf; md.render_levels = subsurf
    if static and parent is None:
        STATIC.append(ob)
    return ob

def empty(name, loc, parent=None):
    e = bpy.data.objects.new(name, None)
    COL.objects.link(e)
    e.empty_display_size = 0.03
    if parent is not None: e.parent = parent
    e.location = loc
    return e

def box(name, size, mat, M, bevel=0.0, **kw):
    if bevel == 0.0:
        bevel = min(0.004, min(size) * 0.3)
    return mk(name, bm_box(*size), mat, M, bevel=bevel, **kw)

rnd = random.Random(2202)

# ================================================================== 1. SHROUD
OUTLINE = [(-0.355, -0.150), (0.355, -0.150), (0.366, 0.100), (0.226, 0.126),
           (0.214, 0.236), (-0.214, 0.236), (-0.226, 0.126), (-0.366, 0.100)]
mk('Shroud_Face', bm_prism(OUTLINE, 0.03), 'ckp_shroud', PANEL, bevel=0.006)
ring_a = [pf(u, v, -0.03) for u, v in OUTLINE]
ring_b = [pf(u * 1.10, v - 0.03, -0.36) for u, v in OUTLINE]
mk('Shroud_Body', bm_loft(ring_a, ring_b), 'ckp_shroud', I4, bevel=0.01)
# Glare-shield hood over the upper tier + rubber lip
HOOD = PANEL @ T(0, 0.248, 0) @ Rx(-8)
mk('Hood', bm_loft([Vector((-0.226, 0.012, 0.075)), Vector((0.226, 0.012, 0.075)), Vector((0.236, -0.012, 0.075)), Vector((-0.236, -0.012, 0.075))],
                   [Vector((-0.27, 0.0, -0.10)), Vector((0.27, 0.0, -0.10)), Vector((0.29, -0.03, -0.10)), Vector((-0.29, -0.03, -0.10))]),
   'ckp_shroud', HOOD, bevel=0.005)
box('Hood_Lip', (0.455, 0.010, 0.012), 'ckp_black', HOOD @ T(0, -0.008, 0.072), bevel=0.003)
for s in (-1, 1):   # wings folding down over the UFD flanks onto the main tier
    WG = HOOD @ T(s * 0.232, -0.004, 0.0) @ Rz(-s * 58)
    mk('Hood_Wing', bm_prism([(0.0, -0.012), (s * 0.115, -0.012), (s * 0.115, 0.010), (0.0, 0.012)], 0.14, 0.06),
       'ckp_shroud', WG, bevel=0.004)
    box('Hood_WingLip', (0.112, 0.010, 0.012), 'ckp_black', WG @ T(s * 0.058, -0.004, 0.058), bevel=0.003)
# Step ledge where the upper tier meets the wider main tier
for s in (-1, 1):
    box('Tier_Step', (0.15, 0.012, 0.05), 'ckp_shroud', PANEL @ T(s * 0.292, 0.117, 0.006) @ Rz(s * -10), bevel=0.003)
# Faceted cheeks running out to the canopy sills / side consoles
for s in (-1, 1):
    P1, P2 = pf(s * 0.366, 0.100, -0.005), pf(s * 0.355, -0.150, -0.005)
    P3, P4 = Vector((s * 0.425, -0.440, -0.585)), Vector((s * 0.460, -0.190, -0.705))
    quad = [P1, P2, P3, P4] if s > 0 else [P4, P3, P2, P1]
    mk('Cheek', bm_quad(quad), 'ckp_shroud', I4, solid=0.02, bevel=0.004)
# Dark knee-well fascia below the panel (nothing see-through under the shroud)
box('Kneewell', (0.84, 0.50, 0.04), 'ckp_floor', T(0, -0.75, -0.68))

# ================================================================== 2. DISPLAYS
def display(sid, M, sw, sh, bw, bh, n_h, n_v, depth=0.022):
    box(sid + '_Bezel', (bw, bh, depth), 'ckp_bezel', M @ T(0, 0, depth / 2), bevel=0.004)
    lip, t = 0.007, 0.004
    for x, y, w, h in ((0, (sh + lip) / 2, sw + 2 * lip, lip), (0, -(sh + lip) / 2, sw + 2 * lip, lip),
                       ((sw + lip) / 2, 0, lip, sh), (-(sw + lip) / 2, 0, lip, sh)):
        box(sid + '_Lip', (w, h, t), 'ckp_bezel', M @ T(x, y, depth + t / 2), bevel=0.0015)
    mk('Screen_' + sid, bm_screen(sw, sh), 'scr_' + sid, M @ T(0, 0, depth + 0.0006), static=False)
    # Option-select buttons (OSBs) centred in the bezel margin
    my = (sh / 2 + lip + bh / 2) / 2
    mx = (sw / 2 + lip + bw / 2) / 2
    for i in range(n_h):
        x = (i - (n_h - 1) / 2) * (sw * 0.86 / max(1, n_h - 1))
        for sy in (-1, 1):
            box(sid + '_OSB', (0.014, 0.011, 0.006), 'ckp_osb', M @ T(x, sy * my, depth + 0.003), bevel=0.0013)
    for i in range(n_v):
        y = (i - (n_v - 1) / 2) * (sh * 0.80 / max(1, n_v - 1))
        for sx in (-1, 1):
            box(sid + '_OSB', (0.011, 0.014, 0.006), 'ckp_osb', M @ T(sx * mx, y, depth + 0.003), bevel=0.0013)
    if n_h and n_v:   # corner rockers (brightness / contrast)
        for sx in (-1, 1):
            for sy in (-1, 1):
                box(sid + '_Rocker', (0.016, 0.007, 0.006), 'ckp_osb',
                    M @ T(sx * (bw / 2 - 0.016), sy * (bh / 2 - 0.009), depth + 0.003) @ Rz(sx * sy * 45), bevel=0.0012)

display('PMFD', PANEL @ T(0, -0.010, 0), 0.196, 0.196, 0.262, 0.262, 6, 6)
display('SMFD_L', PANEL @ T(-0.240, -0.020, 0), 0.152, 0.152, 0.206, 0.206, 5, 5)
display('SMFD_R', PANEL @ T(0.240, -0.020, 0), 0.152, 0.152, 0.206, 0.206, 5, 5)
display('UFD_L', PANEL @ T(-0.152, 0.178, 0), 0.084, 0.066, 0.110, 0.098, 0, 3)
display('UFD_R', PANEL @ T(0.152, 0.178, 0), 0.084, 0.066, 0.110, 0.098, 0, 3)

# ICP (integrated control panel) between the UFDs
ICP = PANEL @ T(0, 0.178, 0)
box('ICP_Body', (0.170, 0.104, 0.026), 'ckp_bezel', ICP @ T(0, 0, 0.013), bevel=0.004)
for r in range(4):
    for c in range(3):
        box('ICP_Key', (0.015, 0.016, 0.007), 'ckp_key', ICP @ T(-0.068 + c * 0.0195, 0.033 - r * 0.021, 0.029), bevel=0.0015)
    for c in range(2):
        box('ICP_Key', (0.015, 0.016, 0.007), 'ckp_key', ICP @ T(0.049 + c * 0.0195, 0.033 - r * 0.021, 0.029), bevel=0.0015)
    box('ICP_Window', (0.044, 0.012, 0.003), 'ckp_lcd', ICP @ T(-0.002, 0.033 - r * 0.021, 0.0275), bevel=0.0008)
for c in range(7):
    box('ICP_Key', (0.012, 0.007, 0.006), 'ckp_osb', ICP @ T(-0.06 + c * 0.02, 0.046, 0.028), bevel=0.001)
for s in (-1, 1):   # thumbwheels
    mk('ICP_Wheel', bm_cyl(0.009, 0.009, 0.010, 14, 'X'), 'ckp_metal', ICP @ T(s * 0.091, 0.0, 0.016))

# ================================================================== 3. PEDESTAL + 4th MFD
mk('Pedestal', bm_prism([(-0.138, -0.175), (0.138, -0.175), (0.138, 0.150), (-0.138, 0.150)], 0.40),
   'ckp_shroud', PED, bevel=0.008)
box('Pedestal_Lower', (0.27, 0.36, 0.26), 'ckp_shroud', T(0, -0.88, -0.56), bevel=0.008)
display('SMFD_C', PED @ T(0, -0.012, 0), 0.152, 0.152, 0.206, 0.206, 5, 5)
box('Ped_Panel', (0.20, 0.04, 0.006), 'ckp_bezel', PED @ T(0, -0.145, 0.003), bevel=0.0015)
for c in range(4):
    mk('Ped_Knob', bm_cyl(0.007, 0.008, 0.012, 12, 'Z'), 'ckp_metal', PED @ T(-0.06 + c * 0.04, -0.145, 0.012))

# ================================================================== 4. SILLS, WALLS, CONSOLES
CON_TOP = -0.445
for s in (-1, 1):
    # Diamond-plate canopy sill + outer rail lip + latch hooks
    box('Sill', (0.115, 0.05, 1.10), 'ckp_sill', T(s * 0.478, -0.215, -0.155), bevel=0.006)
    box('Sill_Rail', (0.016, 0.040, 1.10), 'ckp_bezel', T(s * 0.543, -0.180, -0.155), bevel=0.004)
    for z in (-0.56, -0.27, 0.02, 0.28):
        box('Latch', (0.030, 0.022, 0.045), 'ckp_metal', T(s * 0.455, -0.180, z), bevel=0.004)
        box('Latch_Hook', (0.012, 0.016, 0.020), 'ckp_bezel', T(s * 0.440, -0.162, z - 0.014), bevel=0.002)
    # Inner wall between sill and console (leans outboard), frame ribs + wall panels
    box('Wall', (0.022, 0.250, 1.04), 'ckp_panel', T(s * 0.432, -0.325, -0.135) @ Rz(s * 8))
    for z in (-0.60, -0.36, -0.08, 0.20):
        box('Wall_Rib', (0.016, 0.240, 0.022), 'ckp_shroud', T(s * 0.418, -0.325, z) @ Rz(s * 8), bevel=0.003)
    for z0, z1 in ((-0.585, -0.375), (-0.065, 0.185)):
        zc = (z0 + z1) / 2
        WM = T(s * 0.414, -0.318, zc) @ Rz(s * 8) @ Ry(-s * 90)   # local +Z faces inboard
        box('Wall_Panel', (z1 - z0 - 0.02, 0.150, 0.010), 'ckp_bezel', WM, bevel=0.002)
        for i in range(3):
            kz = (i - 1) * (z1 - z0 - 0.06) / 2
            mk('Wall_Knob', bm_cyl(0.009, 0.010, 0.014, 14, 'Z'), 'ckp_metal', WM @ T(kz * s, 0.030, 0.012))
            box('Wall_Legend', (0.035, 0.003, 0.0012), 'ckp_white', WM @ T(kz * s, -0.002, 0.0055), bevel=0.0)
            mk('Wall_Toggle', bm_cyl(0.0022, 0.0018, 0.016, 8, 'Z'), 'ckp_metal', WM @ T(kz * s, -0.035, 0.012))
    # Console deck + front face + inboard side
    box('Console_Top', (0.215, 0.030, 0.96), 'ckp_panel', T(s * 0.318, CON_TOP, -0.135), bevel=0.005)
    box('Console_Front', (0.215, 0.42, 0.030), 'ckp_panel', T(s * 0.318, -0.650, -0.615))
    box('Console_Side', (0.022, 0.46, 0.96), 'ckp_panel', T(s * 0.215, -0.680, -0.135))

def console_panel(s, z0, z1, kind):
    zc, zl = (z0 + z1) / 2, z1 - z0 - 0.008
    y = CON_TOP + 0.019
    box('Con_Plate', (0.192, 0.008, zl), 'ckp_bezel', T(s * 0.318, y, zc), bevel=0.002)
    for i in range(int(zl / 0.05)):   # engraved legend strips
        box('Con_Legend', (0.03 + rnd.random() * 0.04, 0.0012, 0.004), 'ckp_white',
            T(s * (0.25 + rnd.random() * 0.12), y + 0.0045, z0 + 0.02 + i * 0.05), bevel=0.0)
    if kind == 'knobs':
        for i in range(max(1, int(zl / 0.06))):
            for c in range(2):
                x = s * (0.268 + c * 0.095)
                z = z0 + 0.04 + i * 0.06
                mk('Con_Knob', bm_cyl(0.010, 0.011, 0.016, 14, 'Y'), 'ckp_metal', T(x, y + 0.012, z))
                mk('Con_KnobCap', bm_cyl(0.0035, 0.0035, 0.004, 8, 'Y'), 'ckp_white', T(x, y + 0.021, z))
    elif kind == 'toggles':
        for i in range(max(1, int(zl / 0.045))):
            for c in range(3):
                x, z = s * (0.262 + c * 0.055), z0 + 0.03 + i * 0.045
                mk('Con_ToggleBase', bm_cyl(0.006, 0.006, 0.006, 10, 'Y'), 'ckp_metal', T(x, y + 0.007, z))
                mk('Con_Toggle', bm_cyl(0.0022, 0.0018, 0.018, 8, 'Y'), 'ckp_metal', T(x, y + 0.017, z) @ Rx(-15))
                if rnd.random() < 0.18:
                    box('Con_Guard', (0.016, 0.022, 0.022), 'ckp_red', T(x, y + 0.015, z), bevel=0.002)
    elif kind == 'buttons':
        for i in range(max(1, int(zl / 0.03))):
            for c in range(4):
                box('Con_Btn', (0.018, 0.006, 0.016), 'ckp_osb' if rnd.random() < 0.7 else 'ckp_yellow',
                    T(s * (0.258 + c * 0.04), y + 0.006, z0 + 0.025 + i * 0.03), bevel=0.0015)

for z0, z1, kind in ((-0.615, -0.475, 'knobs'), (-0.150, 0.040, 'toggles'), (0.040, 0.330, 'buttons')):
    console_panel(-1, z0, z1, kind)
for z0, z1, kind in ((-0.615, -0.470, 'buttons'), (-0.165, 0.040, 'knobs'), (0.040, 0.330, 'toggles')):
    console_panel(1, z0, z1, kind)

# Left: throttle quadrant plate with two lever slots
box('Throttle_Quadrant', (0.150, 0.040, 0.300), 'ckp_bezel', T(-0.320, CON_TOP + 0.030, -0.315), bevel=0.006)
for x in (-0.345, -0.300):
    box('Throttle_Slot', (0.010, 0.004, 0.24), 'ckp_black', T(x, CON_TOP + 0.051, -0.315), bevel=0.0)
for i in range(6):
    box('Throttle_Detent', (0.030, 0.0012, 0.003), 'ckp_white', T(-0.380, CON_TOP + 0.0505, -0.42 + i * 0.04), bevel=0.0)
# Right: side-stick housing + forearm rest
box('Stick_Housing', (0.120, 0.045, 0.160), 'ckp_bezel', T(0.330, CON_TOP + 0.035, -0.335), bevel=0.008)
box('Armrest', (0.105, 0.050, 0.290), 'ckp_seat', T(0.330, CON_TOP + 0.050, -0.060), bevel=0.012, seg=3)

# Gear panel on the left cheek: hazard-striped frame around the lever slot
GEAR_M = T(-0.392, -0.352, -0.590) @ Ry(18) @ Rx(-10)
box('Gear_Panel', (0.088, 0.112, 0.040), 'ckp_bezel', GEAR_M, bevel=0.004)
for i in range(9):
    box('Gear_Stripe', (0.060, 0.0092, 0.004), 'ckp_yellow' if i % 2 == 0 else 'ckp_black',
        GEAR_M @ T(0, -0.0415 + i * 0.0104, 0.021), bevel=0.0)
box('Gear_Slot', (0.018, 0.074, 0.005), 'ckp_black', GEAR_M @ T(0, 0, 0.0235), bevel=0.0)
box('Gear_Lights', (0.016, 0.040, 0.006), 'ckp_lcd', GEAR_M @ T(0.033, 0.0, 0.022), bevel=0.001)

# ================================================================== 5. SEAT, FLOOR, PEDALS
box('Floor', (0.86, 0.04, 1.40), 'ckp_floor', T(0, -1.02, -0.30))
box('Seat_Pan', (0.44, 0.10, 0.46), 'ckp_seat', T(0, -0.84, 0.10), bevel=0.025, seg=3)
box('Seat_Back', (0.42, 0.70, 0.12), 'ckp_seat', T(0, -0.46, 0.36) @ Rx(-12), bevel=0.03, seg=3)
box('Headbox', (0.30, 0.26, 0.16), 'ckp_seat', T(0, 0.08, 0.43) @ Rx(-12), bevel=0.03, seg=3)
for s in (-1, 1):
    box('Seat_Rail', (0.04, 0.80, 0.06), 'ckp_bezel', T(s * 0.25, -0.50, 0.40) @ Rx(-12), bevel=0.006)
for x in (-0.07, 0.0, 0.07):
    box('Eject_Handle', (0.06 if x == 0 else 0.016, 0.016, 0.03), 'ckp_yellow', T(x, -0.78, -0.13), bevel=0.004)
for s in (-1, 1):
    box('Pedal', (0.09, 0.16, 0.025), 'ckp_bezel', T(s * 0.13, -0.92, -0.86) @ Rx(-25), bevel=0.006)

# ================================================================== 6. HUD MOUNT
box('HUD_Body', (0.205, 0.075, 0.175), 'ckp_hudframe', T(0, -0.150, -0.830), bevel=0.008)
HUD_M = T(*HUD_ANCHOR) @ Rx(HUD_TILT)
for s in (-1, 1):
    box('HUD_Post', (0.012, 0.165, 0.020), 'ckp_hudframe', HUD_M @ T(s * 0.124, 0.070, 0), bevel=0.003)
box('HUD_Sill', (0.262, 0.012, 0.024), 'ckp_hudframe', HUD_M @ T(0, -0.008, 0), bevel=0.003)
hud_anchor = empty('HUD_Anchor', HUD_ANCHOR)

# ================================================================== 7. ANIMATED HOTAS + GEAR LEVER
stick = empty('Stick_Gimbal', (0.330, CON_TOP + 0.058, -0.345))
mk('Stick_Boot', bm_cyl(0.034, 0.016, 0.040, 20, 'Y'), 'ckp_black', T(0, 0.020, 0), parent=stick, static=False)
mk('Stick_Shaft', bm_cyl(0.012, 0.012, 0.050, 14, 'Y'), 'ckp_bezel', T(0, 0.060, -0.002), parent=stick, static=False)
mk('Stick_Grip', bm_box(0.040, 0.105, 0.050), 'ckp_black', T(-0.002, 0.130, -0.010) @ Rx(-10),
   parent=stick, subsurf=2, smooth=True, static=False)
mk('Stick_Pommel', bm_box(0.044, 0.030, 0.062), 'ckp_black', T(-0.003, 0.185, -0.020) @ Rx(-18),
   parent=stick, subsurf=2, smooth=True, static=False)
for x, y, z, r, mat in ((-0.010, 0.200, -0.006, 0.0075, 'ckp_white'), (0.010, 0.198, -0.010, 0.0065, 'ckp_white'),
                        (0.000, 0.190, 0.012, 0.0055, 'ckp_red')):
    mk('Stick_Hat', bm_cyl(r, r * 0.85, 0.010, 12, 'Y'), mat, T(x, y, z) @ Rx(-25), parent=stick, static=False)
box('Stick_Trigger', (0.014, 0.024, 0.010), 'ckp_metal', T(0, 0.150, -0.040) @ Rx(15), parent=stick, static=False, bevel=0.002)

throttles = []
for side, x in (('L', -0.345), ('R', -0.300)):
    p = empty('Throttle_' + side, (x, CON_TOP + 0.052, -0.300))
    box('Throttle_Arm', (0.010, 0.090, 0.018), 'ckp_metal', T(0, 0.045, 0), parent=p, static=False, bevel=0.002)
    mk('Throttle_Grip', bm_box(0.036, 0.048, 0.075), 'ckp_black', T(0.002 if side == 'R' else -0.002, 0.104, -0.006),
       parent=p, subsurf=2, smooth=True, static=False)
    if side == 'L':
        for i, (bx, by, bz) in enumerate(((-0.012, 0.128, -0.010), (-0.012, 0.122, 0.018), (-0.019, 0.108, -0.030))):
            mk('Throttle_Btn', bm_cyl(0.0045, 0.004, 0.008, 10, 'Y'), 'ckp_white' if i else 'ckp_red',
               T(bx, by, bz), parent=p, static=False)
    throttles.append(p)

gear = empty('Gear_Handle', GEAR_M.to_translation() + (GEAR_M.to_3x3() @ Vector((0, 0, 0.024))))
mk('Gear_Shaft', bm_cyl(0.0045, 0.0045, 0.060, 10, 'Z'), 'ckp_metal', T(0, 0, 0.030), parent=gear, static=False)
mk('Gear_Knob', bm_cyl(0.014, 0.014, 0.012, 18, 'X'), 'ckp_gearknob', T(0, 0, 0.064), parent=gear, static=False)

log('built %d static parts' % len(STATIC))

# ================================================================== 8. MERGE STATIC (no bpy.ops.object.join: hangs headless)
def merge_static(obs, name):
    dg = bpy.context.evaluated_depsgraph_get()
    bm = bmesh.new()
    mats, mat_ix = [], {}
    for ob in obs:
        src = ob.material_slots[0].material
        if src.name not in mat_ix:
            cp = src.copy(); cp.name = src.name + '_ao'
            mat_ix[src.name] = len(mats); mats.append(cp)
        mi = mat_ix[src.name]
        ev = ob.evaluated_get(dg)
        me = ev.to_mesh()
        M = ob.matrix_world.copy()
        vs = [bm.verts.new(M @ v.co) for v in me.vertices]
        for p in me.polygons:
            try:
                f = bm.faces.new([vs[i] for i in p.vertices])
            except ValueError:
                continue
            f.material_index = mi
            f.smooth = p.use_smooth
        ev.to_mesh_clear()
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.00002)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me); bm.free()
    for m in mats: me.materials.append(m)
    ob = bpy.data.objects.new(name, me)
    COL.objects.link(ob)
    for o in obs:
        bpy.data.objects.remove(o, do_unlink=True)
    return ob

static = merge_static(STATIC, 'Cockpit_Static')
log('merged static: %d verts, %d faces, %d materials' % (len(static.data.vertices), len(static.data.polygons), len(static.data.materials)))

# ================================================================== 9. UV + AO BAKE
bpy.context.view_layer.update()
for o in scene.objects:
    o.select_set(False)
bpy.context.view_layer.objects.active = static
static.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.smart_project(angle_limit=66 * D2R, island_margin=0.0025, area_weight=0.0, correct_aspect=True, scale_to_bounds=False)
bpy.ops.object.mode_set(mode='OBJECT')
# Atlas texel scale (UV units per metre) so the runtime can tile detail maps
# (diamond plate) at a real-world size on top of the AO atlas UVs.
_uv = static.data.uv_layers.active.data
_wa = _ua = 0.0
for p in static.data.polygons:
    pts = [_uv[li].uv for li in p.loop_indices]
    a = sum(pts[i].x * pts[(i + 1) % len(pts)].y - pts[(i + 1) % len(pts)].x * pts[i].y for i in range(len(pts)))
    _wa += p.area; _ua += abs(a) * 0.5
UV_PER_M = math.sqrt(_ua / _wa)
static['uv_per_m'] = round(UV_PER_M, 4)
log('uv unwrapped, %.3f uv/m' % UV_PER_M)

world = bpy.data.worlds.new('World')
scene.world = world
try:
    world.light_settings.distance = AO_DIST
except Exception as e:
    log('ao distance not set', e)

ao_img = bpy.data.images.new('f22_cockpit_ao', AO_RES, AO_RES, alpha=False)
scene.render.engine = 'CYCLES'
scene.cycles.device = 'CPU'
scene.cycles.samples = AO_SAMPLES
for m in static.data.materials:
    nt = m.node_tree
    n = nt.nodes.new('ShaderNodeTexImage'); n.image = ao_img; n.name = 'AO'
    nt.nodes.active = n

if NOBAKE:
    ao_img.generated_color = (1, 1, 1, 1)
else:
    bpy.ops.object.bake(type='AO', margin=8, use_clear=True)
    log('ao baked')
ao_path = os.path.join(bpy.app.tempdir or os.path.dirname(OUT), 'f22_cockpit_ao.png')
ao_img.filepath_raw = ao_path
ao_img.file_format = 'PNG'
ao_img.save()
for m in static.data.materials:
    nt = m.node_tree
    b = nt.nodes.get('Principled BSDF')
    nt.links.new(nt.nodes['AO'].outputs['Color'], b.inputs['Base Color'])

# ================================================================== 10. PREVIEW RENDER (optional)
if PREVIEW:
    for m in static.data.materials:   # preview only: multiply the tint back in
        nt = m.node_tree; b = nt.nodes.get('Principled BSDF')
        mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'; mix.blend_type = 'MULTIPLY'
        mix.inputs['Factor'].default_value = 1.0
        mix.inputs[7].default_value = (*hex_lin(m['ckp_rgb']), 1)
        nt.links.new(nt.nodes['AO'].outputs['Color'], mix.inputs[6])
        nt.links.new(mix.outputs[2], b.inputs['Base Color'])
    cam_d = bpy.data.cameras.new('cam'); cam_d.sensor_fit = 'VERTICAL'; cam_d.angle = 74 * D2R
    cam_d.clip_start = 0.02
    cam = bpy.data.objects.new('cam', cam_d); COL.objects.link(cam)
    cam.matrix_world = Rx(-15)
    scene.camera = cam
    sun_d = bpy.data.lights.new('sun', 'SUN'); sun_d.energy = 3.0
    sun = bpy.data.objects.new('sun', sun_d); COL.objects.link(sun)
    sun.matrix_world = Ry(-35) @ Rx(-55)
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.55, 0.62, 0.72, 1)
    world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.9
    scene.render.resolution_x, scene.render.resolution_y = 1280, 720
    scene.cycles.samples = 48
    scene.render.filepath = PREVIEW
    bpy.ops.render.render(write_still=True)
    log('preview ->', PREVIEW)
    for m in static.data.materials:   # restore export wiring
        nt = m.node_tree; b = nt.nodes.get('Principled BSDF')
        nt.links.new(nt.nodes['AO'].outputs['Color'], b.inputs['Base Color'])
    for o in (cam, sun): bpy.data.objects.remove(o, do_unlink=True)

# ================================================================== 11. EXPORT
bpy.ops.export_scene.gltf(
    filepath=OUT, export_format="GLB", export_yup=False, export_apply=True,
    export_image_format="JPEG", export_jpeg_quality=88, export_cameras=False, export_lights=False,
    export_unused_images=False, export_extras=True, export_animations=False, use_selection=False)
log('exported', OUT, os.path.getsize(OUT))

dg = bpy.context.evaluated_depsgraph_get()
tris = 0
for o in COL.all_objects:
    if o.type == 'MESH':
        me = o.evaluated_get(dg).to_mesh(); me.calc_loop_triangles(); tris += len(me.loop_triangles); o.evaluated_get(dg).to_mesh_clear()
report = {
    'glb_bytes': os.path.getsize(OUT), 'tris': tris, 'ao_res': AO_RES, 'ao_baked': not NOBAKE,
    'static_materials': [m.name for m in static.data.materials],
    'nodes': {o.name: [round(c, 4) for c in o.matrix_world.to_translation()] for o in COL.all_objects
              if o.type == 'EMPTY' or o.name.startswith('Screen_')},
    'panel_tilt_deg': PANEL_TILT, 'hud_tilt_deg': HUD_TILT, 'uv_per_m': round(UV_PER_M, 4),
}
with open(REPORT, 'w', encoding='utf-8') as fh:
    json.dump(report, fh, indent=2)
log('report', REPORT, 'tris', tris)
