#!/usr/bin/env python3
"""Build the original SVG shape diagrams and the question manifest for the
ESL shapes visual set (registry package esl-g7-shapes-visual-20261021).

Usage: python3 content/registry-visual-packages/2026-10-21-esl-shapes/build.py
Writes checksum-addressed SVGs to public/question-assets/2026-10-21/ and
manifest.json next to this script. Output is deterministic.
"""
import hashlib, json, math, os, random

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
ASSET_DIR = os.path.join(ROOT, "public", "question-assets", "2026-10-21")
HERE = os.path.dirname(os.path.abspath(__file__))

BG, BORDER, HEAD, INK, HIDDEN = "#0f172a", "#334155", "#67e8f9", "#e2e8f0", "#64748b"
CYAN, AMBER = "#22d3ee", "#fbbf24"
FONT = 'font-family="Inter, Arial, sans-serif"'

def f(v):
    s = f"{v:.1f}"
    return s[:-2] if s.endswith(".0") else s

def card(title, heading, body):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360" role="img">\n'
            f'  <title>{title}</title>\n'
            f'  <rect width="640" height="360" rx="24" fill="{BG}"/>\n'
            f'  <rect x="1" y="1" width="638" height="358" rx="23" fill="none" stroke="{BORDER}" stroke-width="2"/>\n'
            f'  <text x="32" y="42" fill="{HEAD}" {FONT} font-size="17" font-weight="800" text-anchor="start">{heading}</text>\n'
            f'  <path d="M32 58H608" stroke="{BORDER}" stroke-width="2"/>\n'
            f'{body}\n</svg>\n')

# ---------- polyhedra (parallel oblique projection, back-face culling) ----------
A, B = 0.45, 0.32           # proj(x,y,z) = (x + A z, -(y + B z)); viewer direction (A, B, -1)
VIEW = (A, B, -1.0)

def proj(p):
    x, y, z = p
    return (x + A * z, -(y + B * z))

def sub(a, b): return tuple(i - j for i, j in zip(a, b))
def dot(a, b): return sum(i * j for i, j in zip(a, b))
def cross(a, b): return (a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0])

def poly_parts(verts, faces):
    c = tuple(sum(v[i] for v in verts) / len(verts) for i in range(3))
    vis_faces, edges = [], {}
    for fi, face in enumerate(faces):
        p0, p1, p2 = verts[face[0]], verts[face[1]], verts[face[2]]
        n = cross(sub(p1, p0), sub(p2, p0))
        fc = tuple(sum(verts[k][i] for k in face) / len(face) for i in range(3))
        if dot(n, sub(fc, c)) < 0: n = tuple(-i for i in n)
        ln = math.sqrt(dot(n, n)) or 1
        vis = dot(n, VIEW) > 1e-6
        if vis: vis_faces.append((fi, face, dot(n, (0.3, 0.9, -0.4)) / ln))
        for k in range(len(face)):
            e = tuple(sorted((face[k], face[(k + 1) % len(face)])))
            edges[e] = edges.get(e, False) or vis
    return vis_faces, edges

class Canvas:
    """Collects primitives in model space, then fits them into a box."""
    def __init__(self): self.items = []; self.pts = []
    def add(self, kind, pts, **kw):
        self.items.append((kind, pts, kw)); self.pts.extend(pts)
    def render(self, box, max_scale=1.0):
        x0, y0, x1, y1 = box
        xs = [p[0] for p in self.pts]; ys = [p[1] for p in self.pts]
        w, h = max(xs) - min(xs), max(ys) - min(ys)
        s = min((x1 - x0) / w, (y1 - y0) / h, max_scale)
        ox = x0 + ((x1 - x0) - w * s) / 2 - min(xs) * s
        oy = y0 + ((y1 - y0) - h * s) / 2 - min(ys) * s
        T = lambda p: (ox + p[0] * s, oy + p[1] * s)
        out = []
        for kind, pts, kw in self.items:
            if kind == "poly":
                d = "M" + "L".join(f"{f(T(p)[0])} {f(T(p)[1])}" for p in pts) + "Z"
                out.append(f'<path d="{d}" fill="{kw["fill"]}" fill-opacity="{kw.get("op", 1)}" stroke="none"/>')
            elif kind == "line":
                (a, b) = (T(pts[0]), T(pts[1]))
                dash = ' stroke-dasharray="9 8"' if kw.get("hidden") else ""
                col = kw.get("color", HIDDEN if kw.get("hidden") else INK)
                wdt = kw.get("w", 3 if kw.get("hidden") else 4)
                out.append(f'<path d="M{f(a[0])} {f(a[1])}L{f(b[0])} {f(b[1])}" stroke="{col}" stroke-width="{wdt}" stroke-linecap="round"{dash} fill="none"/>')
            elif kind == "path":   # polyline through points
                d = "M" + "L".join(f"{f(T(p)[0])} {f(T(p)[1])}" for p in pts)
                dash = ' stroke-dasharray="9 8"' if kw.get("hidden") else ""
                col = kw.get("color", HIDDEN if kw.get("hidden") else INK)
                wdt = kw.get("w", 3 if kw.get("hidden") else 4)
                fill = kw.get("fill", "none")
                out.append(f'<path d="{d}" stroke="{col}" stroke-width="{wdt}" stroke-linecap="round" stroke-linejoin="round"{dash} fill="{fill}"/>')
            elif kind == "text":
                p = T(pts[0])
                out.append(f'<text x="{f(p[0])}" y="{f(p[1])}" fill="{kw.get("color", AMBER)}" {FONT} font-size="{kw.get("size", 26)}" font-weight="800" text-anchor="middle">{kw["t"]}</text>')
        return "\n  ".join(out)

def shade(light):
    a = 0.18 + 0.22 * max(0.0, light)
    return a

def draw_poly(cv, verts, faces, highlight=None):
    vis_faces, edges = poly_parts(verts, faces)
    for fi, face, light in vis_faces:
        col = AMBER if highlight == ("face", fi) else CYAN
        op = 0.55 if highlight == ("face", fi) else shade(light)
        cv.add("poly", [proj(verts[k]) for k in face], fill=col, op=f(op) if op >= 0.1 else "0.2")
    for (i, j), vis in sorted(edges.items(), key=lambda e: e[1]):
        hl = highlight == ("edge", (i, j))
        cv.add("line", [proj(verts[i]), proj(verts[j])], hidden=not vis,
               **({"color": AMBER, "w": 8} if hl else {}))

def box(w, h, d):
    v = [(0,0,0),(w,0,0),(w,h,0),(0,h,0),(0,0,d),(w,0,d),(w,h,d),(0,h,d)]
    fcs = [(0,1,2,3),(4,5,6,7),(0,1,5,4),(3,2,6,7),(0,3,7,4),(1,2,6,5)]
    return v, fcs

def prism(base2d, d):
    n = len(base2d)
    v = [(x, y, 0) for x, y in base2d] + [(x, y, d) for x, y in base2d]
    fcs = [tuple(range(n)), tuple(range(n, 2*n))] + [(k, (k+1) % n, (k+1) % n + n, k + n) for k in range(n)]
    return v, fcs

def pyramid(base3d, apex):
    n = len(base3d)
    v = list(base3d) + [apex]
    fcs = [tuple(range(n))] + [(k, (k+1) % n, n) for k in range(n)]
    return v, fcs

# ---------- curved solids (screen space) ----------
K = 0.32  # ellipse squash for horizontal circles (screen space, y down)

def arc(cx, cy, rx, ry, a0, a1, n=48):
    return [(cx + rx*math.cos(a0 + (a1-a0)*k/n), cy + ry*math.sin(a0 + (a1-a0)*k/n)) for k in range(n+1)]

def draw_cylinder(cv, r=80, h=170, dx=0):
    ry = r*K
    front = arc(dx, 0, r, ry, 0, math.pi)            # lower arc of base (y down => sin>0 is front)
    back = arc(dx, 0, r, ry, math.pi, 2*math.pi)
    top = arc(dx, -h, r, ry, 0, 2*math.pi, 96)
    cv.add("poly", front + [(dx - r, -h), (dx + r, -h)], fill=CYAN, op="0.22")
    cv.add("poly", top, fill=CYAN, op="0.4")
    cv.add("path", back, hidden=True); cv.add("path", front); cv.add("path", top)
    cv.add("line", [(dx - r, 0), (dx - r, -h)]); cv.add("line", [(dx + r, 0), (dx + r, -h)])

def draw_cone(cv, r=90, h=190, dx=0, tip_down=False):
    ry = r*K
    if tip_down:
        top = arc(dx, -h, r, ry, 0, 2*math.pi, 96)
        cv.add("poly", [(dx, 0), (dx + r, -h)] + arc(dx, -h, r, ry, 0, math.pi) + [(dx - r, -h)], fill=CYAN, op="0.25")
        cv.add("poly", top, fill=CYAN, op="0.4"); cv.add("path", top)
        cv.add("line", [(dx, 0), (dx - r, -h)]); cv.add("line", [(dx, 0), (dx + r, -h)])
        return
    front = arc(dx, 0, r, ry, 0, math.pi); back = arc(dx, 0, r, ry, math.pi, 2*math.pi)
    cv.add("poly", [(dx, -h)] + [(dx + r, 0)] + front + [(dx - r, 0)], fill=CYAN, op="0.25")
    cv.add("path", back, hidden=True); cv.add("path", front)
    cv.add("line", [(dx, -h), (dx - r, 0)]); cv.add("line", [(dx, -h), (dx + r, 0)])

def circle_pts(cx, cy, r, n=96, a0=0, a1=2*math.pi):
    return [(cx + r*math.cos(a0 + (a1-a0)*k/n), cy + r*math.sin(a0 + (a1-a0)*k/n)) for k in range(n+1)]

def draw_sphere(cv, r=110, dx=0):
    cv.add("poly", circle_pts(dx, 0, r), fill=CYAN, op="0.22")
    cv.add("poly", circle_pts(dx - r*0.38, -r*0.4, r*0.28), fill="#ffffff", op="0.12")
    cv.add("path", arc(dx, 0, r, r*K, math.pi, 2*math.pi), hidden=True)
    cv.add("path", arc(dx, 0, r, r*K, 0, math.pi), w=3)
    cv.add("path", circle_pts(dx, 0, r))

def draw_hemisphere(cv, r=120, dx=0):
    ry = r*K
    dome = arc(dx, 0, r, r, math.pi, 2*math.pi, 64)    # upper half circle
    front = arc(dx, 0, r, ry, 0, math.pi)
    cv.add("poly", dome + front[::-1][1:], fill=CYAN, op="0.24")
    cv.add("path", arc(dx, 0, r, ry, math.pi, 2*math.pi), hidden=True)
    cv.add("path", front); cv.add("path", dome)

# ---------- shape library (model units) ----------
def S_cube(cv, hl=None):
    v, fc = box(150, 150, 150); draw_poly(cv, v, fc, hl)
def S_cuboid(cv, hl=None):
    v, fc = box(240, 110, 120); draw_poly(cv, v, fc, hl)
def S_triprism(cv, hl=None):
    v, fc = prism([(0, 0), (170, 0), (85, 140)], 230); draw_poly(cv, v, fc, hl)
def S_hexprism(cv, hl=None):
    r = 85; base = [(r + r*math.cos(math.pi/6 + k*math.pi/3), r + r*math.sin(math.pi/6 + k*math.pi/3)) for k in range(6)]
    v, fc = prism(base, 200); draw_poly(cv, v, fc, hl)
def S_sqpyr(cv, hl=None):
    s = 180; v, fc = pyramid([(0,0,0),(s,0,0),(s,0,s),(0,0,s)], (s/2, 190, s/2)); draw_poly(cv, v, fc, hl)
def S_tripyr(cv, hl=None):
    v, fc = pyramid([(0,0,0),(230,0,0),(80,0,200)], (105, 200, 70)); draw_poly(cv, v, fc, hl)
def S_cyl(cv, hl=None): draw_cylinder(cv)
def S_cone(cv, hl=None): draw_cone(cv)
def S_sphere(cv, hl=None): draw_sphere(cv)
def S_hemi(cv, hl=None): draw_hemisphere(cv)

def solo(fn, heading, title, **kw):
    cv = Canvas(); fn(cv, **kw)
    return card(title, heading, "  " + cv.render((150, 80, 490, 336)))

def lineup(fns, title, heading="LOOK AT THE SHAPES"):
    parts = []
    xs = [(40, 175), (180, 315), (325, 460), (465, 600)]
    for (x0, x1), fn, lab in zip(xs, fns, "ABCD"):
        cv = Canvas(); fn(cv)
        parts.append(cv.render((x0 + 8, 92, x1 - 8, 280)))
        parts.append(f'<text x="{f((x0+x1)/2)}" y="324" fill="{AMBER}" {FONT} font-size="28" font-weight="800" text-anchor="middle">{lab}</text>')
    return card(title, heading, "  " + "\n  ".join(parts))

def pair(fnA, fnB, title, heading="SHAPE A AND SHAPE B"):
    parts = []
    for (x0, x1), fn, lab in zip([(60, 300), (340, 580)], [fnA, fnB], "AB"):
        cv = Canvas(); fn(cv)
        parts.append(cv.render((x0 + 20, 88, x1 - 20, 286)))
        parts.append(f'<text x="{f((x0+x1)/2)}" y="326" fill="{AMBER}" {FONT} font-size="28" font-weight="800" text-anchor="middle">{lab}</text>')
    return card(title, heading, "  " + "\n  ".join(parts))

# flat shapes (screen space)
def F_circle(cv): cv.add("poly", circle_pts(0, 0, 100), fill=CYAN, op="0.3"); cv.add("path", circle_pts(0, 0, 100))
def F_hexagon(cv):
    p = [(100*math.cos(math.pi/6 + k*math.pi/3), 100*math.sin(math.pi/6 + k*math.pi/3)) for k in range(7)]
    cv.add("poly", p, fill=CYAN, op="0.3"); cv.add("path", p)
def F_triangle(cv):
    p = [(0, -110), (115, 80), (-115, 80), (0, -110)]; cv.add("poly", p, fill=CYAN, op="0.3"); cv.add("path", p)
def F_rect(cv):
    p = [(0, 0), (220, 0), (220, 120), (0, 120), (0, 0)]; cv.add("poly", p, fill=CYAN, op="0.3"); cv.add("path", p)

# ---------- real-world objects ----------
def O_tent(cv):
    v, fc = prism([(0, 0), (200, 0), (100, 150)], 260); draw_poly(cv, v, fc)
    door = [proj((60, 0, 0)), proj((100, 105, 0)), proj((140, 0, 0))]
    cv.add("path", door, color=AMBER, w=4)
    cv.add("line", [proj((-40, 0, -20)), proj((330, 0, -20))], color=HIDDEN, w=2)
def O_tin(cv):
    draw_cylinder(cv, r=85, h=180)
    lo = arc(0, -55, 85, 85*K, 0, math.pi); hi = arc(0, -125, 85, 85*K, 0, math.pi)
    cv.add("poly", lo + hi[::-1], fill=AMBER, op="0.45")
    cv.add("path", lo, color=AMBER, w=3); cv.add("path", hi, color=AMBER, w=3)
def O_icecream(cv):
    draw_cone(cv, r=70, h=200, tip_down=True)
    for k, (x, y) in enumerate([(-38, -222), (0, -252), (38, -222)]):
        cv.add("poly", circle_pts(x, y, 46 if k == 1 else 40), fill="#f9a8d4", op="0.85")
def O_dome(cv):
    draw_hemisphere(cv, r=130)
    cv.add("line", [(-200, 0), (200, 0)], color=HIDDEN, w=2)
    ry = 130*K
    cv.add("path", [(-22, ry), (-22, ry - 55), (22, ry - 55), (22, ry)], color=AMBER, w=4)

def obj(fn, title):
    cv = Canvas(); fn(cv)
    return card(title, "WHAT SHAPE IS THIS OBJECT?", "  " + cv.render((150, 80, 490, 336)))

# ---------- parts of a solid (cube 0..7) ----------
def part(kind):
    cv = Canvas()
    v, fc = box(170, 170, 170)
    if kind == "face": hl, tip = ("face", 5), (170, 85, 85)            # right face (x = w)
    elif kind == "edge": hl, tip = ("edge", (1, 2)), (170, 85, 0)       # front-right vertical edge
    else: hl, tip = None, (170, 170, 0)                                  # front-top-right vertex
    draw_poly(cv, v, fc, hl)
    t = proj(tip)
    if kind == "vertex":
        cv.add("poly", circle_pts(t[0], t[1], 11), fill=AMBER, op="1")
    start = (t[0] + 130, t[1] - 60 if kind != "edge" else t[1] + 20)
    cv.add("line", [start, (t[0] + 16, t[1] - 7 if kind != "edge" else t[1] + 2)], color=AMBER, w=5)
    ux, uy = (t[0] + 16 - start[0]), ((t[1] - 7 if kind != "edge" else t[1] + 2) - start[1])
    L = math.hypot(ux, uy); ux, uy = ux / L, uy / L
    hx, hy = t[0] + 16, (t[1] - 7 if kind != "edge" else t[1] + 2)
    cv.add("poly", [(hx, hy), (hx - 18*ux + 9*uy, hy - 18*uy - 9*ux), (hx - 18*ux - 9*uy, hy - 18*uy + 9*ux)], fill=AMBER, op="1")
    cv.add("text", [(start[0] + 14, start[1] - 4)], t="?", size=34)
    return card("Part of a solid marked with an arrow", "NAME THE MARKED PART", "  " + cv.render((110, 76, 560, 340)))

# ---------- nets (screen space, y down) ----------
def net_poly(cv, pts):
    cv.add("poly", pts, fill=CYAN, op="0.25"); cv.add("path", pts + [pts[0]])
def fold(cv, a, b): cv.add("line", [a, b], hidden=True, color=AMBER, w=3)

def N_cube(cv):
    s = 60; cells = [(1, 0), (0, 1), (1, 1), (2, 1), (3, 1), (1, 2)]
    for cx, cy in cells: net_poly(cv, [(cx*s, cy*s), ((cx+1)*s, cy*s), ((cx+1)*s, (cy+1)*s), (cx*s, (cy+1)*s)])
def N_sqpyr(cv):
    s = 100; h = 90
    net_poly(cv, [(0, 0), (s, 0), (s, s), (0, s)])
    net_poly(cv, [(0, 0), (s, 0), (s/2, -h)]); net_poly(cv, [(s, 0), (s, s), (s + h, s/2)])
    net_poly(cv, [(s, s), (0, s), (s/2, s + h)]); net_poly(cv, [(0, s), (0, 0), (-h, s/2)])
def N_triprism(cv):
    w, l = 90, 200; th = w * math.sqrt(3) / 2
    for k in range(3): net_poly(cv, [(0, k*w), (l, k*w), (l, (k+1)*w), (0, (k+1)*w)])
    net_poly(cv, [(l, w), (l, 2*w), (l + th, 1.5*w)]); net_poly(cv, [(0, w), (0, 2*w), (-th, 1.5*w)])
def N_cyl(cv):
    r = 50; L = 2 * math.pi * r * 0.95
    net_poly(cv, [(0, 0), (L, 0), (L, 150), (0, 150)])
    cv.add("poly", circle_pts(L/2, -r, r), fill=CYAN, op="0.25"); cv.add("path", circle_pts(L/2, -r, r))
    cv.add("poly", circle_pts(L/2, 150 + r, r), fill=CYAN, op="0.25"); cv.add("path", circle_pts(L/2, 150 + r, r))

def net(fn):
    cv = Canvas(); fn(cv)
    return card("A flat net that folds into a solid", "THIS NET FOLDS INTO WHICH SOLID?", "  " + cv.render((120, 74, 520, 342)))

# ---------- question manifest ----------
TAX_UND = "shape-und"; TAX_REM = "shape-rem"; TAX_NET = "shape-net"; TAX_CLASS = "shape-class"
SOLIDS = ["cube", "cuboid", "sphere", "hemisphere", "cone", "cylinder", "triangular prism",
          "hexagonal prism", "square-based pyramid", "triangular pyramid"]
ALTS = {
 "cube": "A line drawing of a solid with six equal square faces. Hidden edges are shown as dashed lines.",
 "cuboid": "A line drawing of a box-shaped solid with six rectangular faces, longer than it is tall. Hidden edges are dashed.",
 "sphere": "A drawing of a perfectly round solid like a ball, with a dashed line around its middle.",
 "hemisphere": "A drawing of a dome-shaped solid: a curved top resting on one flat circular face. The hidden back edge is dashed.",
 "cone": "A drawing of a solid with a circular base and a curved side that rises to one point. The hidden back of the base is dashed.",
 "cylinder": "A drawing of a solid with two equal circular ends joined by a curved side. The hidden back of the bottom circle is dashed.",
 "triangular prism": "A line drawing of a solid with two equal triangular ends joined by three rectangles. Hidden edges are dashed.",
 "hexagonal prism": "A line drawing of a solid with two equal six-sided ends joined by six rectangles. Hidden edges are dashed.",
 "square-based pyramid": "A line drawing of a solid with a square base and four triangular faces meeting at one point. Hidden edges are dashed.",
 "triangular pyramid": "A line drawing of a solid with a triangular base and three triangular faces meeting at one point. Hidden edges are dashed.",
}
FNS = {"cube": S_cube, "cuboid": S_cuboid, "sphere": S_sphere, "hemisphere": S_hemi, "cone": S_cone,
       "cylinder": S_cyl, "triangular prism": S_triprism, "hexagonal prism": S_hexprism,
       "square-based pyramid": S_sqpyr, "triangular pyramid": S_tripyr}
CONFUSE = {
 "cube": ["cuboid", "square", "square-based pyramid"],
 "cuboid": ["cube", "rectangle", "triangular prism"],
 "sphere": ["circle", "hemisphere", "cylinder"],
 "hemisphere": ["sphere", "semicircle", "cone"],
 "cone": ["cylinder", "triangle", "square-based pyramid"],
 "cylinder": ["cone", "circle", "cuboid"],
 "triangular prism": ["triangular pyramid", "triangle", "cuboid"],
 "hexagonal prism": ["hexagon", "triangular prism", "cylinder"],
 "square-based pyramid": ["triangular pyramid", "triangular prism", "cube"],
 "triangular pyramid": ["square-based pyramid", "triangular prism", "triangle"],
}
EXPL = {
 "cube": "Six equal square faces make a cube. A cuboid has rectangular faces that are not all the same.",
 "cuboid": "Six rectangular faces, with a length longer than the height, make a cuboid. A cube has six equal squares.",
 "sphere": "A perfectly round solid like a ball is a sphere. A circle is the flat 2D shape.",
 "hemisphere": "A dome with one flat circular face is half a sphere: a hemisphere.",
 "cone": "One circular base and a curved side rising to a point make a cone.",
 "cylinder": "Two equal circular ends joined by a curved side make a cylinder.",
 "triangular prism": "Two equal triangular ends joined by rectangles make a triangular prism. A pyramid ends in a point.",
 "hexagonal prism": "Two equal six-sided ends joined by rectangles make a hexagonal prism. A hexagon is only the flat end.",
 "square-based pyramid": "A square base with four triangles meeting at a point is a square-based pyramid.",
 "triangular pyramid": "A triangular base with three triangles meeting at a point is a triangular pyramid.",
}
DIFF = {"cube": "easy", "sphere": "easy", "cone": "easy", "cylinder": "easy", "cuboid": "medium", "hemisphere": "medium",
        "triangular prism": "medium", "hexagonal prism": "medium", "square-based pyramid": "medium", "triangular pyramid": "hard"}
STEMS = ["Look at the picture. Which solid is this?", "What is the name of the solid in the picture?",
         "Look at the diagram. What do we call this 3D shape?", "Which word names the shape in the picture?",
         "Look carefully at the faces. Which solid is shown?"]

def slug(s): return s.replace(" ", "-").replace("_", "-")

entries = []  # (asset_key, svg, question dict)
for i, name in enumerate(SOLIDS):
    svg = solo(FNS[name], "WHICH SOLID IS THIS?", "A 3D solid shape drawing")
    entries.append((f"esl-shape-{slug(name)}", svg, dict(
        stem=STEMS[i % len(STEMS)], ans=name, wrong=CONFUSE[name], expl=EXPL[name], diff=DIFF[name],
        tax=[TAX_UND], tags=["picture", slug(name)], alt=ALTS[name])))

LINEUPS = [
 (["cylinder", "cone", "cube", "hemisphere"], "C", "cube"),
 (["square-based pyramid", "triangular prism", "sphere", "cuboid"], "B", "triangular prism"),
 (["hexagonal prism", "cylinder", "triangular pyramid", "cone"], "D", "cone"),
]
for k, (names, lab, ans) in enumerate(LINEUPS):
    svg = lineup([FNS[n] for n in names], "Four solids labelled A to D")
    others = [n for n in names if n != ans]
    alt = "Four solid shapes in a row labelled A, B, C and D: " + ", ".join(
        {"cylinder": "a can shape", "cone": "a shape with a point", "cube": "a box shape", "hemisphere": "a dome",
         "square-based pyramid": "a pointed shape on a square", "triangular prism": "a tent shape", "sphere": "a ball shape",
         "cuboid": "a long box", "hexagonal prism": "a pencil shape", "triangular pyramid": "a pointed shape on a triangle"}[n]
        for n in names) + "."
    entries.append((f"esl-shape-lineup-{k+1}", svg, dict(
        stem=f"Look at the four solids. What is the name of shape {lab}?", ans=ans, wrong=others,
        expl=f"Shape {lab} is a {ans}. " + EXPL[ans], diff="medium", tax=[TAX_UND], tags=["picture", "labelled shapes"], alt=alt)))

OBJS = [
 ("tent", O_tent, "triangular prism", ["triangular pyramid", "cuboid", "cone"], "A camping tent: two triangular ends joined by rectangular sides.",
  "A drawing of a camping tent with a door, standing on the ground. It has two triangular ends and sloping rectangular sides."),
 ("tin", O_tin, "cylinder", ["cone", "cuboid", "sphere"], "A tin of food has two circular ends and a curved side: a cylinder.",
  "A drawing of a food tin with a coloured label band around its middle."),
 ("ice-cream", O_icecream, "cone", ["cylinder", "triangular pyramid", "hemisphere"], "An ice cream cone narrows from a circle to a single point: a cone.",
  "A drawing of an ice cream: three scoops sitting on top of a crispy holder that narrows to a point at the bottom."),
 ("dome", O_dome, "hemisphere", ["sphere", "cone", "cylinder"], "A dome-shaped building is half a sphere, with a flat circular floor: a hemisphere.",
  "A drawing of a round dome-shaped building with a small door, standing on flat ground."),
]
for key, fn, ans, wrong, expl, alt in OBJS:
    entries.append((f"esl-shape-object-{key}", obj(fn, "An everyday object drawn as a solid"), dict(
        stem="Look at the object in the picture. Which solid is it shaped like?", ans=ans, wrong=wrong, expl=expl,
        diff="medium", tax=[TAX_UND], tags=["picture", "real-world objects", slug(ans)], alt=alt)))

PARTS = [
 ("face", ["edge", "vertex", "net"], "A face is a flat surface of a solid. A cube has six faces.",
  "A cube drawing. One whole flat side of the cube is coloured amber and an arrow with a question mark points to it."),
 ("edge", ["face", "vertex", "net"], "An edge is a line where two faces meet. A cube has twelve edges.",
  "A cube drawing. One straight line where two sides meet is thick and amber, and an arrow with a question mark points to it."),
 ("vertex", ["edge", "face", "net"], "A vertex is a corner point where edges meet. A cube has eight vertices.",
  "A cube drawing. One corner point is marked with an amber dot and an arrow with a question mark points to it."),
]
for k, (ans, wrong, expl, alt) in enumerate(PARTS):
    entries.append((f"esl-shape-part-{ans}", part(ans), dict(
        stem="Look at the cube. Which word names the part marked with the arrow?", ans=ans, wrong=wrong, expl=expl,
        diff="easy" if ans == "face" else "medium", tax=[TAX_REM], tags=["picture", "faces edges vertices", ans], alt=alt)))

NETS = [
 ("cube", N_cube, ["cuboid", "square-based pyramid", "triangular prism"], "Six equal squares fold up into a cube.",
  "A flat net made of six equal squares joined edge to edge in a cross pattern."),
 ("square-based-pyramid", N_sqpyr, ["triangular pyramid", "cube", "triangular prism"], "One square with four triangles around it folds into a square-based pyramid.",
  "A flat net made of one square in the middle with a triangle attached to each of its four sides."),
 ("triangular-prism", N_triprism, ["triangular pyramid", "cuboid", "hexagonal prism"], "Three rectangles with a triangle at each end fold into a triangular prism.",
  "A flat net made of three rectangles in a row with one triangle attached at each end."),
 ("cylinder", N_cyl, ["cone", "sphere", "cuboid"], "One rectangle with two equal circles folds into a cylinder: the rectangle rolls into the curved side.",
  "A flat net made of one rectangle with an equal circle touching its top edge and another touching its bottom edge."),
]
for key, fn, wrong, expl, alt in NETS:
    ans = key.replace("-", " ").replace("square based", "square-based")
    entries.append((f"esl-shape-net-{key}", net(fn), dict(
        stem="Look at the net. Which solid does it make when you fold it?", ans=ans, wrong=wrong, expl=expl,
        diff="hard" if key != "cube" else "medium", tax=[TAX_NET], tags=["picture", "nets", key], alt=alt)))

entries.append(("esl-shape-pair-circle-sphere", pair(F_circle, S_sphere, "A flat shape next to a solid shape"), dict(
    stem="Shape A is a circle. What is the name of solid shape B?", ans="sphere", wrong=["circle", "hemisphere", "cylinder"],
    expl="A circle is flat (2D). The solid, ball-shaped version is a sphere (3D).", diff="easy", tax=[TAX_CLASS],
    tags=["picture", "2D and 3D", "sphere"], alt="Two shapes labelled A and B. Shape A is a flat round shape. Shape B is a round solid like a ball.")))
entries.append(("esl-shape-pair-hexagon-prism", pair(F_hexagon, S_hexprism, "A flat shape next to a solid shape"), dict(
    stem="Shape A is a hexagon. What is the name of solid shape B?", ans="hexagonal prism", wrong=["hexagon", "hexagonal pyramid", "cylinder"],
    expl="A hexagon is flat (2D). Two hexagons joined by rectangles make the solid hexagonal prism (3D).", diff="medium", tax=[TAX_CLASS],
    tags=["picture", "2D and 3D", "hexagonal-prism"], alt="Two shapes labelled A and B. Shape A is a flat six-sided shape. Shape B is a solid with six-sided ends joined by rectangles.")))
svg = lineup([S_cone, S_cube, F_triangle, S_cyl], "Four shapes labelled A to D", "FLAT OR SOLID?")
entries.append(("esl-shape-flat-or-solid", svg, dict(
    stem="Look at shapes A, B, C and D. Which one is a flat 2D shape?", ans="Shape C", wrong=["Shape A", "Shape B", "Shape D"],
    expl="Shape C is a triangle, which is flat (2D). A is a cone, B is a cube and D is a cylinder: all solid 3D shapes.",
    diff="easy", tax=[TAX_CLASS], tags=["picture", "2D and 3D"],
    alt="Four shapes in a row labelled A to D. C is drawn flat with three straight sides. A, B and D are drawn as solids with depth and dashed hidden edges.")))

def main():
    os.makedirs(ASSET_DIR, exist_ok=True)
    rng = random.Random(20261021 + 7)
    out = []
    for n, (key, svg, q) in enumerate(entries):
        data = svg.encode("utf-8")
        assert len(data) < 100_000 and "<script" not in svg and "<image" not in svg
        sha = hashlib.sha256(data).hexdigest()
        fname = f"{key}.{sha[:12]}.svg"
        with open(os.path.join(ASSET_DIR, fname), "wb") as fh: fh.write(data)
        opts = list(q["wrong"]); rng.shuffle(opts)
        if q["ans"].startswith("Shape "): opts = ["Shape A", "Shape B", "Shape C", "Shape D"]
        else: opts.insert(n % 4, q["ans"])
        assert len(set(o.lower() for o in opts)) == 4 and q["ans"] in opts
        assert 20 <= len(q["alt"]) <= 240, (key, len(q["alt"]))
        out.append({"key": key, "asset": {"file": f"public/question-assets/2026-10-21/{fname}", "sha256": sha,
                    "path": f"/question-assets/2026-10-21/{fname}", "url": f"https://www.brainsheist.com/question-assets/2026-10-21/{fname}"},
                    "question": {"text": q["stem"], "options": opts, "answer": q["ans"], "explanation": q["expl"],
                                 "difficulty": q["diff"], "taxonomy": q["tax"], "tags": q["tags"], "alt": q["alt"]}})
    with open(os.path.join(HERE, "manifest.json"), "w") as fh: json.dump(out, fh, indent=1)
    print(len(out), "assets written")

if __name__ == "__main__":
    main()
