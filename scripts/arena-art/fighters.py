"""Build, rig, animate and render the four arena fighters as sprite strips.

Run with the bpy module (Blender 4.2) in the background:
    python fighters.py <out_dir> <fighter> [<fighter> ...]

Each fighter faces +X (screen right; the game mirrors it when aiming left), seen from an
orthographic camera tilted down 35 degrees. Rendered with Cycles on the CPU at 512 px and
downscaled to 256 px per frame. Freestyle draws the outlines.
"""
import json
import math
import os
import sys

import bpy
from mathutils import Matrix, Vector

OUT = sys.argv[1]
WANT = sys.argv[2:] or ['rivet', 'fizz', 'vex', 'boulder']
# (name, frames in the loop, which of those frames to render)
ANIMS = [('idle', 8, range(8)), ('run', 10, range(10)), ('attack', 8, range(2, 8)), ('ko', 10, range(10))]
DIRS = 8          # 0 = right, then clockwise on screen in 45-degree steps: down-right, down, ... up-right
RES = 320         # rendered size; frames are downscaled to OUT_PX for clean edges
OUT_PX = 160
FACING = 0.0      # set per direction: Blender yaw for a screen angle a is -a
rad = math.radians


# ---------------------------------------------------------------- scene
def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = 16
    sc.cycles.use_denoising = True
    try:
        sc.cycles.denoiser = 'OPENIMAGEDENOISE'
    except TypeError:
        pass
    sc.cycles.max_bounces = 4
    sc.render.resolution_x = sc.render.resolution_y = RES
    sc.render.film_transparent = True
    sc.render.image_settings.file_format = 'PNG'
    sc.render.image_settings.color_mode = 'RGBA'
    sc.view_settings.view_transform = 'Standard'
    sc.view_settings.look = 'None'
    sc.render.fps = 12

    world = bpy.data.worlds.new('World'); sc.world = world; world.use_nodes = True
    bg = world.node_tree.nodes['Background']; bg.inputs[0].default_value = (0.78, 0.8, 0.9, 1); bg.inputs[1].default_value = 0.35

    sun = bpy.data.lights.new('Sun', 'SUN'); sun.energy = 2.1; sun.angle = rad(4)
    so = bpy.data.objects.new('Sun', sun); sc.collection.objects.link(so)
    so.rotation_euler = (rad(48), rad(-28), rad(-30))
    rim = bpy.data.lights.new('Rim', 'SUN'); rim.energy = 0.9; rim.color = (1.0, 0.9, 0.75)
    ro = bpy.data.objects.new('Rim', rim); sc.collection.objects.link(ro)
    ro.rotation_euler = (rad(-60), rad(0), rad(160))

    cam = bpy.data.cameras.new('Cam'); cam.type = 'ORTHO'; cam.ortho_scale = 2.55
    co = bpy.data.objects.new('Cam', cam); sc.collection.objects.link(co); sc.camera = co
    elev = rad(35); dist = 12; target = Vector((0.0, 0, 0.92))
    co.location = target + Vector((0, -dist * math.cos(elev), dist * math.sin(elev)))
    co.rotation_euler = (rad(90) - elev, 0, 0)

    sc.render.use_freestyle = True
    sc.render.line_thickness_mode = 'ABSOLUTE'
    sc.render.line_thickness = 1.0
    fs = bpy.context.view_layer.freestyle_settings
    fs.crease_angle = rad(120)
    ls = fs.linesets[0] if len(fs.linesets) else fs.linesets.new('Lines')
    ls.select_silhouette = True; ls.select_border = True; ls.select_crease = True; ls.select_external_contour = True
    if ls.linestyle is None:
        ls.linestyle = bpy.data.linestyles.new('Ink')
    st = ls.linestyle; st.color = (0.09, 0.05, 0.04); st.thickness = 2.2
    return sc


# ---------------------------------------------------------------- materials
_mats = {}


def toon(name, color, gloss=0.0, emit=0.12, metal=False):
    key = name
    if key in _mats:
        return _mats[key]
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    diff = nt.nodes.new('ShaderNodeBsdfToon'); diff.component = 'DIFFUSE'
    diff.inputs['Color'].default_value = (*color, 1); diff.inputs['Size'].default_value = 0.62; diff.inputs['Smooth'].default_value = 0.04
    em = nt.nodes.new('ShaderNodeEmission'); em.inputs['Color'].default_value = (*color, 1); em.inputs['Strength'].default_value = emit
    gl = nt.nodes.new('ShaderNodeBsdfToon'); gl.component = 'GLOSSY'
    gc = tuple(min(1, c * 1.3 + 0.25) for c in color) if metal else (1, 1, 1)
    gl.inputs['Color'].default_value = (*gc, 1); gl.inputs['Size'].default_value = 0.22 if metal else 0.12; gl.inputs['Smooth'].default_value = 0.08
    # diffuse + a little emission to lift the shadow band, plus a weighted toon highlight
    a1 = nt.nodes.new('ShaderNodeAddShader'); nt.links.new(diff.outputs[0], a1.inputs[0]); nt.links.new(em.outputs[0], a1.inputs[1])
    a2 = nt.nodes.new('ShaderNodeAddShader')
    glw = nt.nodes.new('ShaderNodeMixShader'); glw.inputs['Fac'].default_value = (0.28 if metal else gloss)
    blk = nt.nodes.new('ShaderNodeEmission'); blk.inputs['Strength'].default_value = 0
    nt.links.new(blk.outputs[0], glw.inputs[1]); nt.links.new(gl.outputs[0], glw.inputs[2])
    nt.links.new(a1.outputs[0], a2.inputs[0]); nt.links.new(glw.outputs[0], a2.inputs[1])
    nt.links.new(a2.outputs[0], out.inputs[0])
    _mats[key] = m
    return m


def glow(name, color, strength=4.0):
    if name in _mats:
        return _mats[name]
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial'); em = nt.nodes.new('ShaderNodeEmission')
    em.inputs['Color'].default_value = (*color, 1); em.inputs['Strength'].default_value = strength
    nt.links.new(em.outputs[0], out.inputs[0]); _mats[name] = m
    return m


# ---------------------------------------------------------------- parts and rig
def pivot(name, loc, parent=None):
    e = bpy.data.objects.new(name, None); bpy.context.scene.collection.objects.link(e)
    e.empty_display_size = 0.1
    if parent is not None:
        e.parent = parent
        bpy.context.view_layer.update()
        e.matrix_world = Matrix.Translation(loc)
        bpy.context.view_layer.update()
    else:
        e.location = loc
    e.rotation_mode = 'XYZ'
    return e


def part(kind, size, loc, mat, parent, rot=(0, 0, 0), bevel=0.0, smooth=True, segs=16, rings=10, outline=True):
    if kind == 'sphere':
        bpy.ops.mesh.primitive_uv_sphere_add(segments=segs, ring_count=rings, radius=1)
    elif kind == 'cyl':
        bpy.ops.mesh.primitive_cylinder_add(vertices=segs, radius=1, depth=2)
    elif kind == 'cone':
        bpy.ops.mesh.primitive_cone_add(vertices=segs, radius1=1, radius2=0, depth=2)
    elif kind == 'torus':
        bpy.ops.mesh.primitive_torus_add(major_segments=segs, minor_segments=8, major_radius=1, minor_radius=0.25)
    else:
        bpy.ops.mesh.primitive_cube_add(size=2)
    o = bpy.context.active_object
    o.scale = size; o.rotation_euler = tuple(rad(r) for r in rot); o.location = loc
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel:
        b = o.modifiers.new('Bevel', 'BEVEL'); b.width = bevel; b.segments = 2; b.limit_method = 'ANGLE'
    if smooth:
        bpy.ops.object.shade_smooth()
    else:
        bpy.ops.object.shade_flat()
    o.data.materials.append(mat)
    bpy.context.view_layer.update()
    mw = o.matrix_world.copy()
    o.parent = parent
    o.matrix_world = mw
    return o


def base_rig(hip=0.55, shoulder=1.05, shoulder_y=0.5, hip_y=0.2, head_z=1.45):
    root = pivot('root', Vector((0, 0, 0)))
    body = pivot('body', Vector((0, 0, hip)), root)
    head = pivot('head', Vector((0, 0, head_z)), body)
    armF = pivot('armF', Vector((0, -shoulder_y, shoulder)), body)
    armB = pivot('armB', Vector((0, shoulder_y, shoulder)), body)
    legF = pivot('legF', Vector((0, -hip_y, hip)), root)
    legB = pivot('legB', Vector((0, hip_y, hip)), root)
    return dict(root=root, body=body, head=head, armF=armF, armB=armB, legF=legF, legB=legB)


# ---------------------------------------------------------------- fighters
def build_rivet():
    R = base_rig(hip=0.5, shoulder=0.95, shoulder_y=0.62, hip_y=0.26, head_z=1.3)
    orange = toon('rv_orange', (0.95, 0.42, 0.08)); dark = toon('rv_dark', (0.2, 0.21, 0.24), metal=True)
    steel = toon('rv_steel', (0.55, 0.57, 0.6), metal=True); yellow = toon('rv_yellow', (0.98, 0.72, 0.1))
    lens = glow('rv_lens', (0.1, 0.45, 1.0), 1.1); pupil = toon('rv_pupil', (0.02, 0.03, 0.06)); rim = toon('rv_rim', (0.3, 0.3, 0.33), metal=True)
    hazard = toon('rv_black', (0.06, 0.06, 0.07))
    b, h = R['body'], R['head']
    part('sphere', (0.62, 0.6, 0.6), (0, 0, 0.98), orange, b, segs=20, rings=12)  # round body-head
    part('cyl', (0.615, 0.615, 0.035), (0, 0, 0.98), dark, b, segs=28)  # belt seam
    part('cyl', (0.2, 0.2, 0.08), (0, 0, 1.6), dark, h, smooth=False, segs=8)  # top cap
    part('cyl', (0.06, 0.06, 0.12), (0.06, 0, 1.74), steel, h, segs=8)  # bolt stalk
    for dy in (-0.21, 0.21):  # goggles
        part('cyl', (0.17, 0.17, 0.08), (0.52, dy, 1.24), rim, h, rot=(0, 75, 0), segs=16)
        part('cyl', (0.125, 0.125, 0.05), (0.58, dy, 1.26), lens, h, rot=(0, 75, 0), segs=16)
        part('sphere', (0.035, 0.06, 0.06), (0.625, dy - 0.03, 1.27), pupil, h, segs=10, rings=8)
    part('cyl', (0.585, 0.585, 0.03), (0, 0, 1.24), dark, h, segs=28)  # goggle strap
    for i in range(7):  # rivets around the belt
        a = rad(-80 + i * 26)
        part('sphere', (0.045, 0.045, 0.045), (0.61 * math.cos(a), 0.61 * math.sin(a), 0.98), steel, b, segs=8, rings=6)
    part('cube', (0.08, 0.09, 0.18), (-0.62, 0, 1.0), steel, b, bevel=0.02)  # back tank
    for arm, s in ((R['armF'], -1), (R['armB'], 1)):
        y = 0.62 * s
        part('sphere', (0.2, 0.2, 0.2), (0, y, 0.95), orange, arm)
        part('cyl', (0.09, 0.09, 0.2), (0, y, 0.7), dark, arm, segs=10)
        part('sphere', (0.13, 0.13, 0.13), (0, y, 0.48), steel, arm)
    for leg, s in ((R['legF'], -1), (R['legB'], 1)):
        y = 0.26 * s
        part('cyl', (0.09, 0.09, 0.15), (0, y, 0.3), dark, leg, segs=10)
        part('cube', (0.2, 0.13, 0.09), (0.05, y, 0.09), orange, leg, bevel=0.04)
    # rivet gun, held in the front hand
    gun = pivot('weapon', Vector((0, -0.62, 0.48)), R['armF'])
    part('cube', (0.26, 0.13, 0.15), (0.12, -0.62, 0.48), yellow, gun, bevel=0.03)
    for i in range(3):
        part('cube', (0.02, 0.135, 0.155), (0.0 + i * 0.12, -0.62, 0.48), hazard, gun)
    part('cube', (0.06, 0.07, 0.14), (-0.02, -0.62, 0.36), dark, gun, bevel=0.02)  # grip
    part('cyl', (0.07, 0.07, 0.16), (0.48, -0.62, 0.5), dark, gun, rot=(0, 90, 0), segs=10)  # barrel
    part('cyl', (0.09, 0.09, 0.03), (0.63, -0.62, 0.5), steel, gun, rot=(0, 90, 0), segs=10)
    part('cube', (0.07, 0.06, 0.12), (0.1, -0.62, 0.68), dark, gun, bevel=0.02)  # ammo hopper
    flash = pivot('flash', Vector((0.78, -0.62, 0.5)), gun)
    part('sphere', (0.16, 0.12, 0.12), (0.8, -0.62, 0.5), glow('flash_hot', (1.0, 0.55, 0.12), 2.4), flash, segs=10, rings=6)
    gun.scale = (1.45, 1.45, 1.45)
    R['weapon'] = gun; R['flash'] = flash
    R['hold'] = -rad(80)  # front arm raised to aim the gun forward
    R['kind'] = 'gun'
    return R


def build_fizz():
    R = base_rig(hip=0.42, shoulder=0.85, shoulder_y=0.6, hip_y=0.24, head_z=1.1)
    green = toon('fz_green', (0.2, 0.68, 0.06), gloss=0.22); deep = toon('fz_deep', (0.08, 0.38, 0.04))
    white = toon('fz_white', (0.97, 0.97, 0.95)); black = toon('fz_black', (0.03, 0.03, 0.03))
    mouth = toon('fz_mouth', (0.45, 0.06, 0.08)); glass = glow('fz_glass', (0.3, 0.9, 0.2), 0.8)
    bub = glow('fz_bubble', (0.55, 1.0, 0.4), 0.9)
    b, h = R['body'], R['head']
    part('sphere', (0.58, 0.56, 0.62), (0, 0, 0.98), green, b, segs=20, rings=14)
    for (x, y, z, r) in ((0.3, -0.4, 1.3, 0.05), (-0.35, -0.3, 0.7, 0.04), (0.1, -0.52, 0.8, 0.035), (-0.2, -0.45, 1.25, 0.03)):
        part('sphere', (r, r, r), (x, y, z), deep, b, segs=8, rings=6)  # dimples
    for dy, sz in ((-0.2, 0.15), (0.17, 0.13)):  # big cartoon eyes
        part('sphere', (sz, sz, sz * 1.15), (0.47, dy, 1.17), white, h, segs=14)
        part('sphere', (sz * .5, sz * .5, sz * .58), (0.6, dy - 0.01, 1.16), black, h, segs=10)
    part('sphere', (0.1, 0.16, 0.07), (0.52, -0.04, 0.88), mouth, h, segs=12)  # open grin
    part('cyl', (0.36, 0.36, 0.07), (-0.04, 0, 1.6), deep, h, segs=20, smooth=False)  # bottle-cap hat
    for i in range(20):
        a = i / 20 * math.tau
        part('cube', (0.025, 0.025, 0.07), (-0.04 + 0.37 * math.cos(a), 0.37 * math.sin(a), 1.6), deep, h, rot=(0, 0, math.degrees(a)))
    bubs = pivot('bubbles', Vector((0, 0, 1.8)), h)
    for (x, y, z, r) in ((0.05, 0, 1.85, 0.06), (0.15, -0.05, 2.0, 0.045), (0.02, 0.02, 2.12, 0.035)):
        part('sphere', (r, r, r), (x, y, z), bub, bubs, segs=8, rings=6)
    for arm, s in ((R['armF'], -1), (R['armB'], 1)):
        part('sphere', (0.13, 0.13, 0.2), (0, 0.6 * s, 0.68), green, arm)
    for leg, s in ((R['legF'], -1), (R['legB'], 1)):
        part('sphere', (0.15, 0.13, 0.22), (0.04, 0.24 * s, 0.2), green, leg)
    bottle = pivot('weapon', Vector((0, -0.6, 0.52)), R['armF'])
    part('cyl', (0.09, 0.09, 0.15), (0.0, -0.66, 0.6), glass, bottle, segs=12)
    part('cone', (0.09, 0.09, 0.07), (0.0, -0.66, 0.81), glass, bottle, segs=12)
    part('cyl', (0.04, 0.04, 0.05), (0.0, -0.66, 0.92), glass, bottle, segs=10)
    part('cyl', (0.055, 0.055, 0.025), (0.0, -0.66, 0.98), deep, bottle, segs=10)
    flash = pivot('flash', Vector((0.0, -0.66, 1.05)), bottle)
    part('sphere', (0.12, 0.12, 0.12), (0.0, -0.66, 1.08), glow('fz_pop', (0.85, 1.0, 0.5), 5), flash, segs=10, rings=6)
    R['weapon'] = bottle; R['flash'] = flash; R['bubbles'] = bubs
    R['hold'] = -rad(20)
    R['kind'] = 'throw'
    return R


def build_vex():
    R = base_rig(hip=0.75, shoulder=1.3, shoulder_y=0.3, hip_y=0.15, head_z=1.6)
    purple = toon('vx_purple', (0.38, 0.16, 0.7)); dark = toon('vx_dark', (0.14, 0.07, 0.25))
    armor = toon('vx_armor', (0.35, 0.33, 0.45), metal=True); visor = glow('vx_visor', (0.1, 0.8, 1.0), 1.5)
    gun = toon('vx_gun', (0.3, 0.31, 0.38), metal=True); cape = toon('vx_cape', (0.3, 0.1, 0.55))
    b, h = R['body'], R['head']
    part('cone', (0.3, 0.24, 0.35), (0, 0, 1.05), purple, b, rot=(180, 0, 0), segs=12)  # torso tapers to the waist
    part('cyl', (0.17, 0.15, 0.12), (0, 0, 0.78), dark, b, segs=12)  # belt
    part('sphere', (0.26, 0.24, 0.26), (0.02, 0, 1.62), dark, h, segs=16)  # face shadow
    part('cone', (0.33, 0.31, 0.42), (-0.08, 0, 1.72), purple, h, rot=(0, -30, 0), segs=14)  # hood
    part('cube', (0.05, 0.16, 0.035), (0.25, 0, 1.62), visor, h)  # glowing visor slit
    capeP = pivot('cape', Vector((-0.15, 0, 1.35)), b)
    part('cone', (0.38, 0.12, 0.55), (-0.3, 0, 0.95), cape, capeP, rot=(0, 18, 0), segs=4, smooth=False)
    for arm, s in ((R['armF'], -1), (R['armB'], 1)):
        y = 0.3 * s
        part('sphere', (0.12, 0.12, 0.12), (0, y, 1.3), armor, arm)
        part('cyl', (0.06, 0.06, 0.22), (0, y, 1.05), dark, arm, segs=8)
        part('sphere', (0.07, 0.07, 0.07), (0, y, 0.82), armor, arm)
    for leg, s in ((R['legF'], -1), (R['legB'], 1)):
        y = 0.15 * s
        part('cyl', (0.08, 0.08, 0.3), (0, y, 0.45), dark, leg, segs=8)
        part('cube', (0.15, 0.08, 0.12), (0.04, y, 0.11), armor, leg, bevel=0.03, smooth=False)
        part('cone', (0.08, 0.06, 0.1), (0.0, y, 0.33), armor, leg, segs=4, rot=(0, 0, 45), smooth=False)  # knee spike
    rifle = pivot('weapon', Vector((0, -0.3, 0.82)), R['armF'])
    part('cube', (0.2, 0.05, 0.08), (0.0, -0.32, 0.82), gun, rifle, bevel=0.02)  # stock/body
    part('cyl', (0.035, 0.035, 0.42), (0.6, -0.32, 0.84), gun, rifle, rot=(0, 90, 0), segs=10)  # long rail
    part('cube', (0.38, 0.012, 0.02), (0.6, -0.32, 0.89), visor, rifle)  # glowing rail line
    part('cyl', (0.045, 0.045, 0.12), (0.12, -0.32, 0.95), dark, rifle, rot=(0, 90, 0), segs=10)  # scope
    part('cyl', (0.05, 0.05, 0.04), (1.03, -0.32, 0.84), visor, rifle, rot=(0, 90, 0), segs=10)  # emitter tip
    flash = pivot('flash', Vector((1.15, -0.32, 0.84)), rifle)
    part('sphere', (0.22, 0.09, 0.09), (1.2, -0.32, 0.84), glow('vx_beam', (0.5, 0.95, 1.0), 7), flash, segs=10, rings=6)
    R['weapon'] = rifle; R['flash'] = flash; R['cape'] = capeP
    R['hold'] = -rad(78)
    R['kind'] = 'rifle'
    return R


def build_boulder():
    R = base_rig(hip=0.55, shoulder=1.2, shoulder_y=0.72, hip_y=0.32, head_z=1.55)
    sand = toon('bd_sand', (0.6, 0.45, 0.27)); sand2 = toon('bd_sand2', (0.46, 0.33, 0.19))
    brass = toon('bd_brass', (0.7, 0.43, 0.08), metal=True); dark = toon('bd_dark', (0.12, 0.09, 0.07))
    eye = glow('bd_eye', (1.0, 0.6, 0.15), 1.4); smoke = toon('bd_smoke', (0.7, 0.7, 0.72))
    b, h = R['body'], R['head']
    part('cube', (0.55, 0.5, 0.48), (0, 0, 1.05), sand, b, bevel=0.08, smooth=False)  # big torso block
    for (x, z) in ((0.56, 1.25), (0.56, 0.85)):
        part('cube', (0.02, 0.48, 0.012), (x, 0, z), sand2, b)  # brick seams
    part('cube', (0.08, 0.36, 0.3), (0.53, 0, 1.0), brass, b, bevel=0.04)  # brass chest plate
    for i in range(4):
        part('cube', (0.02, 0.04, 0.16), (0.62, -0.15 + i * 0.1, 0.95), dark, b)  # grille slots
    part('cube', (0.3, 0.3, 0.2), (0.15, 0, 1.62), sand, h, bevel=0.05, smooth=False)  # small head
    for dy in (-0.11, 0.11):
        part('cube', (0.02, 0.05, 0.04), (0.45, dy, 1.65), eye, h)
    part('cyl', (0.1, 0.1, 0.12), (-0.2, 0, 1.8), brass, h, segs=12)  # chimney
    sm = pivot('smoke', Vector((-0.2, 0, 1.98)), h)
    for (x, z, r) in ((-0.22, 2.0, 0.08), (-0.3, 2.12, 0.1), (-0.4, 2.2, 0.07)):
        part('sphere', (r, r, r), (x, 0, z), smoke, sm, segs=10, rings=6)
    for arm, s in ((R['armF'], -1), (R['armB'], 1)):
        y = 0.72 * s
        part('sphere', (0.26, 0.24, 0.24), (0, y, 1.2), brass, arm, segs=14)  # brass shoulder
        part('cube', (0.16, 0.16, 0.26), (0, y, 0.85), sand2, arm, bevel=0.05, smooth=False)
        part('sphere', (0.3, 0.28, 0.28), (0.04, y, 0.45), brass, arm, segs=14)  # huge fist
    for leg, s in ((R['legF'], -1), (R['legB'], 1)):
        y = 0.32 * s
        part('cube', (0.2, 0.18, 0.28), (0.02, y, 0.28), sand2, leg, bevel=0.05, smooth=False)
    fist = pivot('weapon', Vector((0.04, -0.72, 0.45)), R['armF'])
    flash = pivot('flash', Vector((0.45, -0.72, 0.45)), fist)
    part('sphere', (0.2, 0.25, 0.25), (0.45, -0.72, 0.45), glow('bd_impact', (1.0, 0.8, 0.4), 5), flash, segs=10, rings=6)
    R['weapon'] = fist; R['flash'] = flash; R['smoke'] = sm; R['ko_dx'] = 0.3
    R['hold'] = -rad(10)
    R['kind'] = 'punch'
    return R


BUILDERS = dict(rivet=build_rivet, fizz=build_fizz, vex=build_vex, boulder=build_boulder)


# ---------------------------------------------------------------- animation
def pose(R, anim, i, n):
    t = i / n; w = math.tau * t; kind = R['kind']
    root, body, head, aF, aB, lF, lB = (R[k] for k in ('root', 'body', 'head', 'armF', 'armB', 'legF', 'legB'))
    for o in (body, head, aF, aB, lF, lB, R['weapon'], R['flash']):
        o.rotation_euler = (0, 0, 0)
    root.location = (0, 0, 0); root.rotation_euler = (0, 0, FACING); root.scale = (1, 1, 1)
    _pose_body(R, anim, i, n)
    # Animations move the root forwards or backwards along X; turn that into the fighter's own facing.
    fwd = root.location.x
    root.location.x = fwd * math.cos(FACING); root.location.y = fwd * math.sin(FACING)


def _pose_body(R, anim, i, n):
    t = i / n; w = math.tau * t; kind = R['kind']
    root, body, head, aF, aB, lF, lB = (R[k] for k in ('root', 'body', 'head', 'armF', 'armB', 'legF', 'legB'))
    body.scale = (1, 1, 1); R['flash'].scale = (0.001, 0.001, 0.001)
    hold = R['hold']
    aF.rotation_euler.y = hold; aB.rotation_euler.y = 0.15
    R['weapon'].rotation_euler.y = -hold
    if 'bubbles' in R:
        R['bubbles'].location.z = 0; R['bubbles'].scale = (1, 1, 1)

    if anim == 'idle':
        s = math.sin(w)
        root.location.z = 0.025 * (1 + s)
        body.scale = (1 + 0.025 * s, 1 + 0.025 * s, 1 - 0.03 * s)
        head.rotation_euler.x = rad(3) * math.sin(w + 1)
        aF.rotation_euler.y = hold + rad(4) * s; aB.rotation_euler.y = 0.15 - rad(5) * s
        if 'bubbles' in R:
            R['bubbles'].location.z = 0.12 * t
        if 'smoke' in R:
            R['smoke'].scale = (1 + 0.15 * s,) * 3
        if 'cape' in R:
            R['cape'].rotation_euler.y = rad(6) * math.sin(w)
    elif anim == 'run':
        s = math.sin(w); c = math.cos(w)
        root.location.z = 0.1 * abs(math.sin(w))
        body.rotation_euler.y = rad(10)  # lean into the run
        swing = rad(38 if kind != 'punch' else 26)
        lF.rotation_euler.y = -swing * s; lB.rotation_euler.y = swing * s
        aB.rotation_euler.y = swing * 0.9 * s
        aF.rotation_euler.y = hold - (rad(6) * s if hold < -0.5 else swing * 0.8 * s)
        R['weapon'].rotation_euler.y = -aF.rotation_euler.y if hold < -0.5 else 0
        body.scale = (1, 1, 1 - 0.04 * abs(c))
        if 'cape' in R:
            R['cape'].rotation_euler.y = rad(22 + 8 * s)
        if 'bubbles' in R:
            R['bubbles'].location.x = -0.08
    elif anim == 'attack':
        # wind-up, strike on frame 3, recover
        k = [0.0, -0.5, -1.0, 1.0, 0.8, 0.5, 0.25, 0.08][i]
        if kind == 'gun' or kind == 'rifle':
            kick = max(0.0, k)
            aF.rotation_euler.y = hold + rad(18) * kick
            R['weapon'].rotation_euler.y = -hold - rad(8) * kick
            body.rotation_euler.y = rad(-6) * kick
            root.location.x = -0.06 * kick
            if i in (3, 4):
                f = 1.0 if i == 3 else 0.55
                R['flash'].scale = (f, f, f)
        elif kind == 'throw':
            # arm goes back over the head, then snaps forward
            ang = {0: -0.35, 1: 1.2, 2: 2.3, 3: -1.2, 4: -1.45, 5: -0.9, 6: -0.5, 7: -0.3}[i]
            aF.rotation_euler.y = ang; R['weapon'].rotation_euler.y = -ang * 0.6
            body.rotation_euler.y = rad(-10) if i in (1, 2) else rad(10) if i in (3, 4) else 0
            if i in (3, 4):
                f = 1.0 if i == 3 else 0.6
                R['flash'].scale = (f, f, f)
        else:  # punch
            ang = {0: 0.0, 1: 0.7, 2: 1.0, 3: -1.45, 4: -1.5, 5: -1.0, 6: -0.5, 7: -0.15}[i]
            aF.rotation_euler.y = ang; R['weapon'].rotation_euler.y = -ang
            body.rotation_euler.y = rad(-8) if i in (1, 2) else rad(14) if i in (3, 4) else 0
            body.rotation_euler.z = rad(10) if i in (1, 2) else rad(-14) if i in (3, 4) else 0
            root.location.x = 0.1 if i in (3, 4) else 0
            if i in (3, 4):
                f = 1.0 if i == 3 else 0.55
                R['flash'].scale = (f, f, f)
    elif anim == 'ko':
        # hit, stagger, topple backwards, bounce, settle
        fall = [0, -6, -10, -25, -50, -78, -88, -84, -88, -88][i]
        root.rotation_euler = (0, rad(fall), FACING)
        root.location.x = [0, -0.04, -0.06, 0.05, 0.22, 0.45, 0.6, 0.66, 0.7, 0.7][i] + R.get('ko_dx', 0) * min(1, i / 5)
        root.location.z = [0, 0.08, 0.12, 0.1, 0.05, 0.02, 0.0, 0.05, 0.0, 0.0][i]
        aF.rotation_euler.y = [hold, 0.6, 1.4, 2.2, 2.6, 2.8, 2.9, 2.7, 2.8, 2.8][i]
        aB.rotation_euler.y = [0.15, 0.8, 1.6, 2.4, 2.7, 2.9, 3.0, 2.8, 2.9, 2.9][i]
        lF.rotation_euler.y = rad([0, -10, -20, -30, -40, -45, -50, -35, -40, -40][i])
        lB.rotation_euler.y = rad([0, 5, 10, -10, -25, -35, -40, -30, -32, -32][i])
        head.rotation_euler.y = rad([0, -15, -20, -10, 0, 10, 15, 8, 10, 10][i])
        sq = [1, 1, 1, 1, 1, 1, 0.9, 1.04, 1, 1][i]
        body.scale = (1, 1, sq)


def key_all(R, frame):
    for name, o in R.items():
        if isinstance(o, bpy.types.Object):
            o.keyframe_insert('location', frame=frame); o.keyframe_insert('rotation_euler', frame=frame); o.keyframe_insert('scale', frame=frame)


def render_fighter(name):
    """Renders every animation from DIRS directions into one sheet per animation: rows = directions, columns = frames."""
    global FACING
    from PIL import Image
    reset_scene(); _mats.clear()
    R = BUILDERS[name]()
    sc = bpy.context.scene
    tmp = os.path.join(OUT, 'frames', name); os.makedirs(tmp, exist_ok=True)
    meta = {}
    for anim, n, frames in ANIMS:
        frames = list(frames)
        sheet = Image.new('RGBA', (OUT_PX * len(frames), OUT_PX * DIRS), (0, 0, 0, 0))
        for d in range(DIRS):
            FACING = -d * math.pi / 4
            for col, i in enumerate(frames):
                pose(R, anim, i, n)
                bpy.context.view_layer.update()
                p = os.path.join(tmp, f'{anim}_{d}_{i:02d}.png')
                sc.render.filepath = p
                bpy.ops.render.render(write_still=True)
                im = Image.open(p).convert('RGBA').resize((OUT_PX, OUT_PX), Image.LANCZOS)
                sheet.alpha_composite(im, (OUT_PX * col, OUT_PX * d))
            print(f'[{name}] {anim} direction {d + 1}/{DIRS}', flush=True)
        sheet.save(os.path.join(OUT, f'{name}_{anim}.png'), optimize=True)
        meta[anim] = len(frames)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, f'{name}.blend'))
    return meta


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    mp = os.path.join(OUT, 'fighters.json')
    data = json.load(open(mp)) if os.path.exists(mp) else {'frameSize': OUT_PX, 'directions': DIRS, 'fighters': {}}
    for f in WANT:
        data['fighters'][f] = render_fighter(f)
        json.dump(data, open(mp, 'w'), indent=2)
    print('done', flush=True)
