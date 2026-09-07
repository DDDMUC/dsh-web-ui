#!/usr/bin/env python3
"""
Blue-throated Bee-eater pet sprite generator (dsh-pet contribution) — refined
vector-illustration pipeline (rework round).

Vector-style rendering with pycairo at 8x supersampling, two passes per frame:

  1. color pass  — opaque ARGB? no: RGB24 surface, all fills use linear/radial
     gradients (skirted palette), thin structural outlines (0.8 px at 1x) and
     light feather detail strokes;
  2. alpha pass  — FORMAT_A8 surface with the same drawing calls: shape
     coverage + soft contact-shadow gradient become the alpha channel.

Final RGBA = color RGB merged with the A8 mask, then LANCZOS downscaled to a
192x208 cell. Two-pass avoids cairo's premultiplied ARGB32 conversion and
keeps everything in Pillow without numpy.

Design (refined mascot style, still repository-original, Apache-2.0):
  - Blue-throated Bee-eater anatomy: chestnut crown, black eye-mask with white
    lore, azure throat, teal-green body, azure wing primaries and tail
    streamers, slim curved dark beak, short legs with claws;
  - perched states on a twig perch with a soft contact shadow; flight states
    without perch, far wing rendered semi-transparent;
  - wings layered: coverts -> secondaries -> separated primary fingers with a
    light edge; subtle feather strokes on back and coverts.

Palette is derived from the blue-throated-bee-eater skin tokens.

Row order and frame counts follow the hatch-pet sprite2d contract:
idle, running-right, running-left, waving, jumping, failed, waiting, running,
review with per-row frames [6, 8, 8, 4, 5, 8, 6, 6, 6].

Re-run: python3 docs/archive/blue-throated-bee-eater-pet/gen-pet.py
"""

import math
import os
import cairo
from PIL import Image, ImageDraw, ImageFont

SS = 8  # supersample factor
CW, CH = 192, 208  # cell size at 1x
COLUMNS = 8
ROWS = 9

# --- palette (skin-anchored, gradient pairs) ---------------------------------
AZURE = (79, 169, 232)        # light azure #4fa9e8
AZURE_D = (28, 108, 176)      # deep azure #1c6cb0
AZURE_L = (127, 196, 242)     # pale azure #7fc4f2
TEAL = (92, 184, 165)         # light teal #5cb8a5
TEAL_D = (46, 125, 111)       # deep teal #2e7d70
TEAL_XD = (42, 111, 100)      # wing covert deep #2a6f64
TEAL_C = (70, 160, 141)       # covert mid #46a08d
BELLY = (249, 252, 253)       # #f9fcfd
BELLY_D = (215, 233, 240)     # #d7e9f0
CROWN = (204, 136, 80)        # chestnut light #cc8850
CROWN_D = (143, 79, 43)       # chestnut deep #8f4f2b
THROAT = (63, 151, 226)       # #3f97e2
THROAT_D = (31, 111, 190)     # #1f6fbe
BEAK = (34, 57, 74)           # #22394a
BEAK_D = (12, 32, 41)         # #0c2029
INK = (12, 32, 41)            # #0c2029 outlines / eye mask
IRIS = (79, 169, 232)
IRIS_D = (18, 58, 92)
PUPIL = (6, 18, 29)
PERCH = (150, 96, 47)         # #96602f
PERCH_D = (95, 58, 30)        # #5f3a1e
LEAF = (90, 160, 107)         # #5aa06b
LEAF_D = (61, 122, 77)        # #3d7a4d
LEG_C = (108, 122, 132)       # grey-blue legs
WHITE = (255, 255, 255)
SHADOW_A = 0.17

TRACKS = [
    ("idle", 6),
    ("running-right", 8),
    ("running-left", 8),
    ("waving", 4),
    ("jumping", 5),
    ("failed", 8),
    ("waiting", 6),
    ("running", 6),
    ("review", 6),
]

DURATIONS = {
    "idle": [500, 500, 600, 500, 500, 600],
    "running-right": [300, 300, 300, 300, 300, 300, 300, 400],
    "running-left": [300, 300, 300, 300, 300, 300, 300, 400],
    "waving": [450, 450, 450, 450],
    "jumping": [400, 400, 400, 450, 450],
    "failed": [550, 550, 550, 600, 650, 700, 550, 550],
    "waiting": [550, 550, 600, 550, 550, 600],
    "running": [330, 330, 330, 330, 330, 400],
    "review": [650, 650, 650, 650, 650, 650],
}

GROUND = 196.0        # feet baseline on the perch
PERCH_Y = 198.0       # twig top surface

# --- cairo helpers -----------------------------------------------------------

def catmull_cubics(points, closed=False):
    """Catmull-Rom anchor list -> list of cubic (p0,c1,c2,p1) segments."""
    pts = [complex(x, y) for x, y in points]
    n = len(pts)
    if n < 2:
        return []
    if closed:
        seq = [pts[-1]] + pts + [pts[0], pts[1]]
        idx_end = n + 1
    else:
        seq = [pts[0]] + pts + [pts[-1]]
        idx_end = n
    out = []
    for i in range(1, idx_end):
        p0, p1, p2, p3 = seq[i - 1], seq[i], seq[i + 1], seq[i + 2]
        c1 = p1 + (p2 - p0) / 6.0
        c2 = p2 - (p3 - p1) / 6.0
        out.append(((p1.real, p1.imag), (c1.real, c1.imag), (c2.real, c2.imag), (p2.real, p2.imag)))
    return out


def path_shape(ctx, points, closed=True):
    """Build a cairo path from Catmull-Rom anchors (or use raw for polylines)."""
    segs = catmull_cubics(points, closed)
    if not segs:
        return
    first = segs[0][0]
    ctx.move_to(*first)
    for p0, c1, c2, p1 in segs:
        ctx.curve_to(c1[0], c1[1], c2[0], c2[1], p1[0], p1[1])
    ctx.close_path()


def stroke_path(p, points, width, stops=None, alpha=1.0, taper=1.0):
    """Open-path rounded stroke (feather finger / streamer style). stops:
    [(pos, color, alpha)] for a linear gradient along anchor[0]->anchor[-1]."""
    segs = catmull_cubics(points, closed=False)
    if not segs:
        return
    ctx = p.ctx
    ctx.save()
    ctx.set_line_cap(cairo.LINE_CAP_ROUND)
    ctx.set_line_join(cairo.LINE_JOIN_ROUND)
    ctx.set_line_width(width)
    ctx.move_to(segs[0][0][0], segs[0][0][1])
    for p0, c1, c2, p1 in segs:
        ctx.curve_to(c1[0], c1[1], c2[0], c2[1], p1[0], p1[1])
    if stops:
        x0, y0 = points[0]
        x1, y1 = points[-1]
        g = cairo.LinearGradient(x0, y0, x1, y1)
        for pos, col, a in stops:
            if p.mask:
                g.add_color_stop_rgba(pos, 1, 1, 1, a * alpha)
            else:
                g.add_color_stop_rgba(pos, *rgba(col, a * alpha))
        ctx.set_source(g)
    else:
        ctx.set_source_rgba(1, 1, 1, alpha) if p.mask else ctx.set_source_rgba(*rgba((255, 255, 255), alpha))
    ctx.stroke()
    ctx.restore()


def ellipse_path(ctx, cx, cy, rx, ry):
    ctx.save()
    ctx.translate(cx, cy)
    ctx.scale(rx, ry)
    ctx.arc(0, 0, 1, 0, 2 * math.pi)
    ctx.restore()


def rgb(c):
    return tuple(v / 255.0 for v in c)


def rgba(c, a=1.0):
    return (*rgb(c), a)


class Painter:
    """Wraps a cairo context; in mask mode every source is white with the same
    alpha structure, so the A8 surface captures shape coverage + soft shadows."""

    def __init__(self, ctx, mask=False):
        self.ctx = ctx
        self.mask = mask

    def fill(self, color, alpha=1.0):
        if self.mask:
            self.ctx.set_source_rgba(1, 1, 1, alpha)
        else:
            self.ctx.set_source_rgba(*rgba(color, alpha))
        self.ctx.fill_preserve()

    def stroke(self, color, width, alpha=1.0):
        if self.mask:
            self.ctx.set_source_rgba(1, 1, 1, alpha)
        else:
            self.ctx.set_source_rgba(*rgba(color, alpha))
        self.ctx.set_line_width(width)
        self.ctx.set_line_join(cairo.LINE_JOIN_ROUND)
        self.ctx.stroke()

    def linear(self, c0, c1, x0, y0, x1, y1, alpha=1.0):
        g = cairo.LinearGradient(x0, y0, x1, y1)
        g.add_color_stop_rgba(0, *rgba(c0, alpha))
        g.add_color_stop_rgba(1, *rgba(c1, alpha))
        if self.mask:
            g = cairo.LinearGradient(x0, y0, x1, y1)
            g.add_color_stop_rgba(0, 1, 1, 1, alpha)
            g.add_color_stop_rgba(1, 1, 1, 1, alpha)
        self.ctx.set_source(g)
        self.ctx.fill()

    def radial(self, c0, c1, cx, cy, r0, r1, alpha0=1.0, alpha1=1.0):
        if self.mask:
            g = cairo.RadialGradient(cx, cy, r0, cx, cy, r1)
            g.add_color_stop_rgba(0, 1, 1, 1, alpha0)
            g.add_color_stop_rgba(1, 1, 1, 1, alpha1)
            self.ctx.set_source(g)
            self.ctx.fill()
            return
        g = cairo.RadialGradient(cx, cy, r0, cx, cy, r1)
        g.add_color_stop_rgba(0, *rgba(c0, alpha0))
        g.add_color_stop_rgba(1, *rgba(c1, alpha1))
        self.ctx.set_source(g)
        self.ctx.fill()

    def multilinear(self, stops, x0, y0, x1, y1):
        """stops: [(pos, color, alpha)]."""
        g = cairo.LinearGradient(x0, y0, x1, y1)
        for pos, col, a in stops:
            if self.mask:
                g.add_color_stop_rgba(pos, 1, 1, 1, a)
            else:
                g.add_color_stop_rgba(pos, *rgba(col, a))
        self.ctx.set_source(g)
        self.ctx.fill()


def transform_anchors(points, cx, cy, rot=0.0, scale=1.0, dx=0.0, dy=0.0):
    r = math.radians(rot)
    cosr, sinr = math.cos(r), math.sin(r)
    out = []
    for x, y in points:
        rx = (x - cx) * scale
        ry = (y - cy) * scale
        out.append((rx * cosr - ry * sinr + cx + dx, rx * sinr + ry * cosr + cy + dy))
    return out


# --- component drawing (1x space, facing right) ------------------------------
# Skeleton: perch top y=198, feet (95/104, 196), hips ~ (98,164), chest
# (114,116), nape (96,94), head center (114,76) r 26, beak tip (176,86).

def draw_shadow(p, pose, dx=0.0, dy=0.0, wide=1.0):
    """Soft contact shadow on the perch (alpha pass only, black in color pass)."""
    cx, cy = 98 + dx, PERCH_Y + 6 + dy / 3
    r = 58 * wide
    ellipse_path(p.ctx, cx, cy, r, 7.5)
    if p.mask:
        p.radial(None, None, cx, cy, 2, r, alpha0=SHADOW_A, alpha1=0.0)
    else:
        g = cairo.RadialGradient(cx, cy, 2, cx, cy, r)
        g.add_color_stop_rgba(0, 0, 0, 0, SHADOW_A)
        g.add_color_stop_rgba(1, 0, 0, 0, 0)
        p.ctx.set_source(g)
        p.ctx.fill()


def draw_perch(p, pose, dx=0.0, dy=0.0):
    """Twig perch with a stub and two leaves."""
    top = PERCH_Y + dy
    p.ctx.save()
    p.ctx.set_line_cap(cairo.LINE_CAP_ROUND)
    p.ctx.set_line_width(6.0)
    if p.mask:
        p.ctx.set_source_rgba(1, 1, 1, 1)
    else:
        g = cairo.LinearGradient(26, top - 3, 26, top + 3)
        g.add_color_stop_rgba(0, *rgba(PERCH))
        g.add_color_stop_rgba(1, *rgba(PERCH_D))
        p.ctx.set_source(g)
    p.ctx.move_to(26, top + 5)
    p.ctx.curve_to(60, top + 1, 110, top + 1, 152, top + 6)
    p.ctx.stroke()
    # branch stub
    if not p.mask:
        p.ctx.set_source_rgba(*rgba(PERCH_D))
    else:
        p.ctx.set_source_rgba(1, 1, 1, 1)
    p.ctx.set_line_width(3.5)
    p.ctx.move_to(66, top + 4)
    p.ctx.curve_to(76, top + 12, 86, top + 6, 94, top + 12)
    p.ctx.stroke()
    p.ctx.restore()
    # two leaves (small angled ellipses)
    for lx, rot in ((92, 0.5), (84, -0.7)):
        p.ctx.save()
        p.ctx.translate(lx, top + 8)
        p.ctx.rotate(rot)
        ellipse_path(p.ctx, 0, 0, 9, 3.6)
        if p.mask:
            p.ctx.set_source_rgba(1, 1, 1, 1)
        else:
            g = cairo.LinearGradient(-9, 0, 9, 0)
            g.add_color_stop_rgba(0, *rgba(LEAF))
            g.add_color_stop_rgba(1, *rgba(LEAF_D))
            p.ctx.set_source(g)
        p.ctx.fill()
        p.ctx.restore()


def draw_tail(p, pose, cx=84, cy=160, rot=0.0, dx=0.0, dy=0.0):
    sway = pose.get("tail_sway", 0.0)
    scale = pose.get("tail_scale", 1.0)
    drop = pose.get("tail_droop", 0.0)
    specs = [
        (-7, 74, AZURE_L, 7.5),
        (5, 66, AZURE, 6.5),
        (-19, 52, AZURE, 5.0),
        (16, 46, AZURE_L, 4.2),
    ]
    for off, length, c0, w in specs:
        a = math.radians(150 + sway * 1.4 + off * 1.6 + drop * 20)
        bx, by = cx + dx, cy + dy
        tip = (bx - math.cos(a) * (length * scale), by + math.sin(a) * (length * scale))
        mid = ((bx + tip[0]) / 2 - math.sin(a) * 4, (by + tip[1]) / 2 - math.cos(a) * 4)
        p.ctx.save()
        p.ctx.set_line_cap(cairo.LINE_CAP_ROUND)
        p.ctx.set_line_width(w)
        if p.mask:
            p.ctx.set_source_rgba(1, 1, 1, 1)
        else:
            p.ctx.set_source_rgba(*rgba(c0))
        p.ctx.move_to(bx, by)
        p.ctx.curve_to(mid[0], mid[1], mid[0], mid[1], tip[0], tip[1])
        p.ctx.stroke()
        # lighter edge
        if not p.mask:
            p.ctx.set_source_rgba(*rgba(AZURE_L, 0.35))
        else:
            p.ctx.set_source_rgba(1, 1, 1, 0.35)
        p.ctx.set_line_width(w * 0.4)
        p.ctx.move_to(bx, by)
        p.ctx.curve_to(mid[0], mid[1] - w * 0.2, mid[0], mid[1] - w * 0.2, tip[0], tip[1] - 1.5)
        p.ctx.stroke()
        p.ctx.restore()


def draw_body(p, pose, org=(100, 130), rot=0.0, dx=0.0, dy=0.0, breath=0.0, belly=True):
    pts = transform_anchors(smooth_anchors_body(), org[0], org[1], rot,
                            1.0 + breath * 0.012, dx, dy)
    path_shape(p.ctx, pts)
    p.multilinear([(0.0, TEAL, 1), (0.55, TEAL, 1), (1.0, TEAL_D, 1)],
                  88 + dx, 96 + dy, 84 + dx, 176 + dy)
    p.stroke(INK, 0.8, 0.9)
    if belly:
        # cream belly (lower-front)
        belly = transform_anchors([
            (120, 112), (130, 132), (123, 156), (100, 170), (80, 152),
        ], org[0], org[1], rot, 1.0, dx, dy)
        path_shape(p.ctx, belly)
        p.multilinear([(0.0, BELLY, 1), (1.0, BELLY_D, 1)], 112 + dx, 116 + dy, 100 + dx, 168 + dy)
    # back shade overlay
    shade = transform_anchors([
        (78, 106), (70, 132), (72, 152), (82, 164),
    ], org[0], org[1], rot, 1.0, dx, dy)
    path_shape(p.ctx, shade)
    p.fill(TEAL_D, 0.35)
    # feather strokes on the back
    if not p.mask:
        p.ctx.set_source_rgba(*rgba(INK, 0.10))
        p.ctx.set_line_width(0.6)
        for k in range(3):
            ya = 132 + k * 10
            p.ctx.move_to(74, ya)
            p.ctx.curve_to(84, ya + 4, 96, ya + 2, 106, ya - 4)
            p.ctx.stroke()


def smooth_anchors_body():
    return [
        (114, 96), (128, 108), (131, 132), (122, 154), (100, 168), (80, 158), (74, 134), (84, 106),
    ]


def draw_wing_folded(p, pose, sx=108, sy=122, rot=0.0, dx=0.0, dy=0.0, droop=0.0):
    """Layered folded wing: coverts + secondaries + crossed primaries."""
    cov = transform_anchors(smooth_anchors_wing_cov(droop), sx, sy, rot, 1.0, dx, dy)
    path_shape(p.ctx, cov)
    p.multilinear([(0.0, TEAL_C, 1), (1.0, TEAL_D, 1)], sx, sy, sx + 4 * droop, sy + 44 + droop * 14)
    p.stroke(INK, 0.75, 0.85)
    # secondaries: two rounded feathers below the covert edge
    for k in range(2):
        path_shape(p.ctx, transform_anchors([
            (sx + 4, sy + 34 + droop * 10 + k * 2), (sx - 14, sy + 42 + droop * 12 + k * 2),
            (sx - 34, sy + 40 + droop * 10 + k * 2), (sx - 26, sy + 26 + droop * 6 + k * 2),
            (sx - 4, sy + 24 + droop * 6 + k * 2),
        ], sx, sy, rot, 1.0, dx, dy))
        p.fill(AZURE_D if k % 2 else AZURE, 0.95)
        p.stroke(INK, 0.6, 0.7)
    # crossed primaries pointing down-back (rounded feather fingers)
    for k in range(3):
        t = k * 8.0
        stroke_path(p, transform_anchors([
            (sx - 6, sy + 28 + droop * 10),
            (sx - 30 - t * 0.5, sy + 44 - t * 0.35 + droop * 8),
            (sx - 56 - t * 0.8, sy + 36 - t * 0.25),
        ], sx, sy, rot, 1.0, dx, dy), 7.5 - k * 1.2,
            stops=[(0.0, AZURE if k % 2 else AZURE_L, 1), (1.0, AZURE_D, 1)])
    # light edge on the covert front
    if not p.mask:
        p.ctx.set_source_rgba(*rgba(AZURE_L, 0.30))
        p.ctx.set_line_width(0.7)
        p.ctx.move_to(sx + 2, sy + 6)
        p.ctx.curve_to(sx + 12, sy + 14, sx + 13, sy + 26, sx + 6, sy + 38)
        p.ctx.stroke()


def smooth_anchors_wing_cov(droop=0.0):
    return [
        (109, 114), (124, 122), (127, 140), (116, 158),
        (98, 164), (84, 152), (84, 132), (94, 118),
    ]


def draw_wing_spread(p, pose, sx, sy, angle, rot, dx, dy, span=110.0, behind=False):
    """Spread wing layered: covert block (gradient), secondaries, primary fan."""
    a = math.radians(angle)
    dirx, diry = math.cos(a), -math.sin(a)
    # covert block
    cov = transform_anchors([
        (sx, sy),
        (sx + dirx * 26 - diry * 22, sy + diry * 26 + dirx * 22),
        (sx + dirx * 66, sy + diry * 66),
        (sx + dirx * 50 + diry * 18, sy + diry * 50 - dirx * 18),
        (sx + dirx * 14 + diry * 16, sy + diry * 14 - dirx * 16),
    ], sx, sy, rot, 1.0, dx, dy)
    path_shape(p.ctx, cov)
    p.multilinear([(0.0, TEAL_C, 1), (1.0, TEAL_XD, 1)], sx, sy, sx + dirx * 60, sy + diry * 60)
    p.stroke(INK, 0.75, 0.85)
    # feather texture on coverts
    if not p.mask:
        p.ctx.set_source_rgba(*rgba(INK, 0.10))
        p.ctx.set_line_width(0.6)
        for k in range(3):
            fk = math.radians(angle - 14 + k * 10)
            px0 = sx + math.cos(fk) * 30
            py0 = sy - math.sin(fk) * 30
            p.ctx.move_to(px0, py0)
            px1 = sx + math.cos(fk) * 46
            py1 = sy - math.sin(fk) * 46
            p.ctx.curve_to(px1, py1, px1, py1, px1, py1)
            p.ctx.stroke()
    # secondaries: 3 rounded feathers along the wing edge
    for k in range(3):
        fa = math.radians(angle - 22 + k * 9)
        fx, fy = math.cos(fa), -math.sin(fa)
        b = (sx + dirx * 52, sy + diry * 52)
        tip = (b[0] + fx * span * 0.34, b[1] + fy * span * 0.34)
        path_shape(p.ctx, transform_anchors([
            (b[0] - 4, b[1]), tip, (b[0] + 2, b[1] + 4),
        ], sx, sy, rot, 1.0, dx, dy))
        p.fill(AZURE_D, 0.92)
    # primaries: separated fingers with lighter edge (rounded stroke ribbons)
    for k in range(6):
        fang = angle - 24 + k * 10
        fa = math.radians(fang)
        fx, fy = math.cos(fa), -math.sin(fa)
        base = (sx + dirx * 56, sy + diry * 56)
        sidex, sidey = math.cos(math.radians(angle + 90)), math.sin(math.radians(angle + 90))
        b = (base[0] + sidex * (k - 2.5) * 4.6, base[1] + sidey * (k - 2.5) * 4.6)
        tip = (b[0] + fx * span * 0.50, b[1] + fy * span * 0.50)
        mid = (b[0] + fx * span * 0.24, b[1] + fy * span * 0.24)
        stroke_path(p, transform_anchors([
            (b[0] - 5, b[1]), mid, tip,
        ], sx, sy, rot, 1.0, dx, dy), 11.0,
            stops=[(0.0, AZURE if not behind else TEAL_D, 1),
                   (1.0, AZURE_D if not behind else TEAL_XD, 1)],
            alpha=0.96 if not behind else 0.82)
        if not behind and not p.mask:
            p.ctx.set_source_rgba(*rgba(AZURE_L, 0.35))
            p.ctx.set_line_width(2.4)
            p.ctx.move_to(b[0] - 4, b[1] - 3)
            p.ctx.curve_to(mid[0], mid[1] - 3, mid[0], mid[1] - 3, tip[0], tip[1] - 3)
            p.ctx.stroke()
    if behind:
        # depth: darken the far wing softly over its region
        if not p.mask:
            p.ctx.set_source_rgba(*rgba(INK, 0.05))
        else:
            p.ctx.set_source_rgba(1, 1, 1, 0.96)
        p.ctx.set_operator(cairo.OPERATOR_ATOP)
        ellipse_path(p.ctx, sx + dirx * 40, sy + diry * 40, span * 0.55, span * 0.38)
        p.ctx.fill()
        p.ctx.set_operator(cairo.OPERATOR_OVER)


def draw_head(p, pose, hx=114, hy=76, pitch=0.0, tilt=0.0, blink=False, sad=False,
              rot=0.0, dx=0.0, dy=0.0):
    # head shape (rounder, slightly taller)
    ellipse_path(p.ctx, hx + 0, hy + 2 + dx * 0, 26, 25)
    p.multilinear([(0.0, TEAL, 1), (1.0, TEAL_D, 1)], hx - 20, hy - 18, hx + 16, hy + 24)
    p.stroke(INK, 0.8, 0.9)
    # chestnut crown cap: fuller, sits on the head top
    crx, cry = hx - 4.0 - pitch * 0.10, hy - 9.0
    ellipse_path(p.ctx, crx, cry, 25, 16)
    p.radial(CROWN, CROWN_D, crx - 6, cry - 5, 2, 26)
    p.stroke(INK, 0.7, 0.85)
    # white lore before the eye
    ellipse_path(p.ctx, hx + 20, hy - 2, 3.2, 2.6)
    p.fill(WHITE, 0.95)
    # black eye mask: thin band through the eye with soft ends
    mask = transform_anchors([
        (hx + 26, hy - 2), (hx + 20, hy - 7.5), (hx - 10, hy - 8), (hx - 25, hy - 1),
        (hx - 24, hy + 3.5), (hx - 3, hy + 3.5), (hx + 24, hy + 1),
    ], hx, hy, rot + pitch * 0.5, 1.0, dx, dy)
    path_shape(p.ctx, mask)
    p.fill(INK, 0.95)
    # eye: white sclera + moderate blue-gradient iris + small pupil + glints
    eyex, eyey = hx + 15.5, hy - 1.0
    if blink:
        if not p.mask:
            p.ctx.set_source_rgba(*rgba(INK, 0.95))
        else:
            p.ctx.set_source_rgba(1, 1, 1, 1)
        p.ctx.set_line_width(1.5)
        p.ctx.move_to(eyex - 7, eyey)
        p.ctx.curve_to(eyex, eyey + 2.2, eyex, eyey + 2.2, eyex + 7, eyey)
        p.ctx.stroke()
    else:
        ellipse_path(p.ctx, eyex, eyey, 7.2, 7.2)
        p.fill(WHITE, 1)
        ellipse_path(p.ctx, eyex + 0.4, eyey + 0.3, 4.8, 4.8)
        p.radial(IRIS, IRIS_D, eyex + 0.4, eyey + 0.3, 0.5, 4.8)
        ellipse_path(p.ctx, eyex + 1.0, eyey + 0.9, 2.1, 2.1)
        p.fill(PUPIL, 1)
        ellipse_path(p.ctx, eyex - 0.6, eyey - 2.0, 1.9, 1.9)
        p.fill(WHITE, 0.96)
        ellipse_path(p.ctx, eyex + 1.8, eyey + 1.2, 0.9, 0.9)
        p.fill(WHITE, 0.9)
    # sad lid (slight upper lid line when failed)
    if sad:
        if not p.mask:
            p.ctx.set_source_rgba(*rgba(INK, 0.8))
        else:
            p.ctx.set_source_rgba(1, 1, 1, 1)
        p.ctx.set_line_width(1.1)
        p.ctx.move_to(eyex - 7.5, eyey - 3.5)
        p.ctx.curve_to(eyex, eyey - 4.2, eyex, eyey - 4.2, eyex + 7.5, eyey - 3.5)
        p.ctx.stroke()
    # azure throat (v-shaped) with gradient + white chin bib
    throat = transform_anchors([
        (hx + 27, hy + 10), (hx + 21, hy + 30), (hx + 2, hy + 35), (hx - 9, hy + 21), (hx - 3, hy + 10),
    ], hx, hy, rot + pitch * 0.5, 1.0, dx, dy)
    path_shape(p.ctx, throat)
    p.multilinear([(0.0, THROAT, 1), (1.0, THROAT_D, 1)], hx + 24, hy + 12, hx + 2, hy + 34)
    # white chin bib
    bib = transform_anchors([
        (hx + 21, hy + 9), (hx + 15, hy + 17), (hx + 4, hy + 19), (hx + 1, hy + 12),
    ], hx, hy, rot + pitch * 0.5, 1.0, dx, dy)
    path_shape(p.ctx, bib)
    p.fill(WHITE, 0.95)
    # beak: slim curved, gradient charcoal, subtle top highlight
    bpitch = pitch * 0.9
    beak = transform_anchors([
        (hx + 24, hy + 6),
        (hx + 41, hy + 5 - bpitch),
        (hx + 54, hy + 9 - bpitch * 1.7),
        (hx + 60, hy + 14 - bpitch * 2.4),
        (hx + 53, hy + 15.5 - bpitch * 2.2),
        (hx + 37, hy + 12.5 - bpitch * 0.8),
        (hx + 23, hy + 10.5),
    ], hx, hy, rot, 1.0, dx, dy)
    path_shape(p.ctx, beak)
    p.multilinear([(0.0, BEAK, 1), (1.0, BEAK_D, 1)], hx + 38, hy + 5, hx + 42, hy + 15)
    p.stroke(INK, 0.6, 0.8)
    if not p.mask:
        p.ctx.set_source_rgba(*rgba(AZURE_L, 0.28))
        p.ctx.set_line_width(0.7)
        p.ctx.move_to(hx + 27, hy + 7)
        p.ctx.curve_to(hx + 44, hy + 6, hx + 53, hy + 9, hx + 58, hy + 13)
        p.ctx.stroke()


def draw_legs(p, pose, dx=0.0, dy=0.0, crouch=0.0, tucked=False, jump=0.0):
    if tucked:
        ellipse_path(p.ctx, 86 + dx, 162 + dy, 11, 5)
        p.fill(LEG_C, 0.95)
        return
    color = LEG_C
    ground = PERCH_Y - 1.5 + dy + jump
    for lx, top in ((95, 168), (106, 166)):
        x = lx + dx
        t = top + crouch * 16 + dy
        p.ctx.save()
        p.ctx.set_line_cap(cairo.LINE_CAP_ROUND)
        p.ctx.set_line_width(2.6)
        if p.mask:
            p.ctx.set_source_rgba(1, 1, 1, 1)
        else:
            p.ctx.set_source_rgba(*rgba(color))
        p.ctx.move_to(x - 1, t)
        p.ctx.curve_to(x - 2, t + 12, x - 1, ground, x - 1, ground)
        p.ctx.stroke()
        # claws gripping the perch
        for tx in (-5, 0, 5):
            p.ctx.set_line_width(1.9)
            p.ctx.move_to(x - 1, ground)
            p.ctx.curve_to(x - 1 + tx, ground + 1, x - 1 + tx, ground + 2.5, x - 1 + tx, ground + 3.5)
            p.ctx.stroke()
        p.ctx.restore()


# --- pose renderer -----------------------------------------------------------

def render_cell(pose, mirror=False):
    w = CW * SS
    h = CH * SS
    col = cairo.ImageSurface(cairo.FORMAT_RGB24, w, h)
    al = cairo.ImageSurface(cairo.FORMAT_A8, w, h)
    ctxc = cairo.Context(col)
    ctxc.set_source_rgba(0, 0, 0, 1)
    ctxc.paint()
    ctxa = cairo.Context(al)
    ctxa.set_source_rgba(0, 0, 0, 0)
    ctxa.paint()
    for ctx, surf in ((ctxc, col), (ctxa, al)):
        ctx.scale(SS, SS)
        draw_bird(Painter(ctx, mask=(surf is al)), pose)
    # merge: color RGB + alpha mask (cairo RGB24 is 4 bytes/pixel BGRA)
    col_img = Image.frombuffer('RGBA', (w, h), bytes(col.get_data()), 'raw', 'BGRA', w * 4, 1).convert('RGB')
    a_img = Image.frombuffer('L', (w, h), bytes(al.get_data()), 'raw', 'L', w, 1)
    rgba = col_img.convert('RGBA')
    rgba.putalpha(a_img)
    rgba = rgba.resize((CW, CH), Image.LANCZOS)
    return rgba.transpose(Image.FLIP_LEFT_RIGHT) if mirror else rgba


def draw_bird(p, pose):
    rot = pose.get("rot", 0.0)
    dx = pose.get("dx", 0.0)
    dy = pose.get("dy", 0.0)
    breath = pose.get("breath", 0.0)
    mode = pose.get("mode", "perch")
    org = (100, 132)

    if mode in ("front", "running"):
        draw_front(p, pose, dx=dx, dy=dy)
        return

    if mode in ("fly", "running-right", "running-left"):
        draw_tail(p, pose, rot=rot * 0.6, dx=dx, dy=dy)
        draw_wing_spread(p, pose, 110 + dx, 128 + dy, pose.get("wing_angle", 30) * 0.88,
                         rot, dx - 5, dy - 4, span=86, behind=True)
        draw_body(p, pose, org=org, rot=rot, dx=dx, dy=dy, breath=breath, belly=False)
        draw_legs(p, pose, dx=dx, dy=dy, tucked=True)
        draw_wing_spread(p, pose, 114 + dx, 124 + dy, pose.get("wing_angle", 30),
                         rot, dx, dy, span=106)
        draw_head(p, pose, hx=128 + dx, hy=66 + dy, rot=rot, dx=dx, dy=dy, pitch=pose.get("pitch", -6))
        return

    # perched family -----------------------------------------------------------
    draw_shadow(p, pose, dx=dx, dy=dy)
    draw_perch(p, pose, dx=dx, dy=dy)
    draw_tail(p, pose, rot=rot * 0.6, dx=dx, dy=dy)

    if mode == "jump":
        wings = pose.get("wings", "spread")
        if wings == "spread":
            draw_wing_spread(p, pose, 116 + dx, 126 + dy, 74, rot, dx, dy, span=84, behind=True)
        draw_body(p, pose, org=org, rot=rot, dx=dx, dy=dy, breath=breath)
        draw_legs(p, pose, dx=dx, dy=dy, crouch=pose.get("crouch", 0),
                  tucked=pose.get("legs", "stand") == "tuck", jump=pose.get("jump", 0))
        if wings == "folded":
            draw_wing_folded(p, pose, sx=112 + dx, sy=122 + dy, rot=rot, dx=dx, dy=dy)
        else:
            draw_wing_spread(p, pose, 114 + dx, 120 + dy, pose.get("wing_angle", 40),
                             rot, dx, dy, span=84)
        draw_head(p, pose, hx=118 + dx, hy=80 + dy, rot=rot, dx=dx, dy=dy,
                  blink=pose.get("blink", False), pitch=pose.get("pitch", 0),
                  tilt=pose.get("tilt", 0))
        return

    draw_body(p, pose, org=org, rot=rot, dx=dx, dy=dy, breath=breath)
    draw_legs(p, pose, dx=dx, dy=dy, crouch=pose.get("crouch", 0))
    if pose.get("wing") == "spread":
        draw_wing_spread(p, pose, 114 + dx, 126 + dy, pose.get("wing_angle", 60),
                         rot, dx, dy, span=78, behind=True)
        draw_wing_spread(p, pose, 112 + dx, 122 + dy, pose.get("wing_angle", 60),
                         rot, dx, dy, span=86)
    elif pose.get("wing") == "wave":
        draw_wing_spread(p, pose, 110 + dx, 116 + dy, pose.get("wing_angle", 60),
                         rot, dx, dy, span=96)
        draw_wing_folded(p, pose, sx=114 + dx, sy=126 + dy, rot=rot, dx=dx, dy=dy)
    else:
        draw_wing_folded(p, pose, sx=112 + dx, sy=122 + dy, rot=rot, dx=dx, dy=dy,
                         droop=pose.get("droop", 0))
    draw_head(p, pose, hx=116 + dx, hy=80 + dy, rot=rot, dx=dx, dy=dy,
              blink=pose.get("blink", False), pitch=pose.get("pitch", 0),
              tilt=pose.get("tilt", 0), sad=(mode == "failed"))


def draw_front(p, pose, dx=0.0, dy=0.0):
    """Frontal hover view (running track): compact body, wide soft wings."""
    # body
    body = ellipse_path(p.ctx, 96 + dx, 124 + dy, 26, 38)
    p.multilinear([(0.0, TEAL, 1), (1.0, TEAL_D, 1)], 96 + dx, 90 + dy, 96 + dx, 158 + dy)
    p.stroke(INK, 0.8, 0.9)
    belly = ellipse_path(p.ctx, 96 + dx, 142 + dy, 15, 16)
    p.fill(BELLY, 0.92)
    ang = pose.get("wing_angle", 40)
    a = math.radians(ang)
    for side in (-1, 1):
        sx = 96 + dx + side * 22
        sy = 104 + dy
        cov = transform_anchors([
            (sx, sy),
            (sx + side * 40, sy - 10 * math.sin(a) + 8),
            (sx + side * 64, sy - 24 * math.sin(a) + 12),
            (sx + side * 68, sy - 26 * math.sin(a) + 22),
            (sx + side * 22, sy + 14),
        ], sx, sy, 0, 1.0, 0, 0)
        path_shape(p.ctx, cov)
        p.multilinear([(0.0, TEAL_C, 1), (1.0, TEAL_XD, 1)], sx, sy, sx + side * 64, sy + 14)
        p.stroke(INK, 0.65, 0.85)
        for k in range(4):
            tipx = 96 + dx + side * (58 + k * 6)
            tipy = sy - (30 + k * 5) * math.sin(a) + (k - 1.5) * 4 + 16
            midx = 96 + dx + side * (42 + k * 4)
            midy = sy - (22 + k * 4) * math.sin(a) + 8
            stroke_path(p, transform_anchors([
                (96 + dx + side * 28, sy + 4), (midx, midy), (tipx, tipy),
            ], sx, sy, 0, 1.0, 0, 0), 10.0,
                stops=[(0.0, AZURE, 1), (1.0, AZURE_D, 1)], alpha=0.95)
    # head
    head = ellipse_path(p.ctx, 96 + dx, 62 + dy, 26, 25)
    p.multilinear([(0.0, TEAL, 1), (1.0, TEAL_D, 1)], 96 + dx - 18, 46 + dy, 96 + dx + 18, 86 + dy)
    p.stroke(INK, 0.8, 0.9)
    crown = ellipse_path(p.ctx, 96 + dx, 52 + dy, 24, 12)
    p.radial(CROWN, CROWN_D, 92 + dx, 48 + dy, 2, 25)
    p.stroke(INK, 0.7, 0.85)
    # thin mask band across both eyes
    mask = transform_anchors([
        (96 + dx - 23, 57 + dy), (96 + dx - 10, 53 + dy), (96 + dx + 10, 53 + dy), (96 + dx + 23, 57 + dy),
        (96 + dx + 21, 61 + dy), (96 + dx - 21, 61 + dy),
    ], 96 + dx, 60 + dy, 0, 1.0, 0, 0)
    path_shape(p.ctx, mask)
    p.fill(INK, 0.95)
    # eyes with highlights
    for side in (-1, 1):
        ellipse_path(p.ctx, 96 + dx + side * 11, 57 + dy, 6.0, 6.4)
        p.fill(WHITE, 1)
        ellipse_path(p.ctx, 96 + dx + side * 11.6, 57.8 + dy, 3.4, 3.8)
        p.radial(IRIS, IRIS_D, 96 + dx + side * 11.6, 57.8 + dy, 0.4, 3.8)
        ellipse_path(p.ctx, 96 + dx + side * 12.2, 58.6 + dy, 1.5, 1.7)
        p.fill(PUPIL, 1)
        ellipse_path(p.ctx, 96 + dx + side * 10.2, 55.6 + dy, 1.5, 1.5)
        p.fill(WHITE, 0.95)
    # beak pointing at the viewer
    beak = transform_anchors([
        (96 + dx - 4.5, 69 + dy), (96 + dx + 4.5, 69 + dy), (96 + dx, 86 + dy),
    ], 96 + dx, 72 + dy, 0, 1.0, 0, 0)
    path_shape(p.ctx, beak)
    p.multilinear([(0.0, BEAK, 1), (1.0, BEAK_D, 1)], 96 + dx, 71 + dy, 96 + dx, 85 + dy)
    # azure throat
    thr = transform_anchors([
        (96 + dx - 14, 67 + dy), (96 + dx - 8, 78 + dy), (96 + dx + 8, 78 + dy), (96 + dx + 14, 67 + dy),
    ], 96 + dx, 70 + dy, 0, 1.0, 0, 0)
    path_shape(p.ctx, thr)
    p.multilinear([(0.0, THROAT, 1), (1.0, THROAT_D, 1)], 96 + dx - 12, 68 + dy, 96 + dx, 78 + dy)
    # tucked legs
    ellipse_path(p.ctx, 96 + dx, 158 + dy, 11, 6)
    p.fill(LEG_C, 0.9)


# --- track frame definitions --------------------------------------------------

def track_pose(mode, i):
    p = {"mode": mode}
    if mode == "idle":
        p["breath"] = [0.0, 0.8, 0.3, 1.0, 0.5, 0.2][i]
        p["blink"] = i == 3
        p["tail_sway"] = [-2, 0, 2, 0, -2, 0][i]
    elif mode == "running-right":
        p["wing_angle"] = [10, 45, 75, 88, 75, 45, 15, -12][i]
        p["dy"] = [-6, -2, 2, -2, -6, -2, 2, -2][i]
        p["rot"] = -8
        p["tail_sway"] = 6
        p["tail_scale"] = 1.05
    elif mode == "running-left":
        p["wing_angle"] = [10, 45, 75, 88, 75, 45, 15, -12][i]
        p["dy"] = [-6, -2, 2, -2, -6, -2, 2, -2][i]
        p["rot"] = -8
        p["tail_sway"] = -6
        p["tail_scale"] = 1.05
    elif mode == "waving":
        p["wing"] = "wave"
        p["wing_angle"] = [86, 48, 90, 52][i]
        p["tail_sway"] = [3, -3, 3, -3][i]
        p["breath"] = 0.4
    elif mode == "jumping":
        p["wings"] = "folded" if i == 0 else "spread"
        p["dy"] = [-6, 5, 18, 18, 4][i]
        p["wing_angle"] = [74, 58, 20, -12][max(0, i - 1)]
        p["legs"] = "stand" if i in (0, 4) else "tuck"
        p["rot"] = [6, -4, -8, -6, 2][i]
        p["crouch"] = 1.0 if i == 0 else 0.0
    elif mode == "failed":
        p["rot"] = 9
        p["droop"] = 1.0
        p["blink"] = i in (3, 7)
        p["tail_sway"] = [-1.5, 0, 1.5, 0, -1.5, 0, 1.5, 0][i]
        p["breath"] = [0, 0.5, 0.2, 0.6, 0.1, 0.4, 0.2, 0.5][i]
        p["pitch"] = -14
        p["tail_droop"] = 0.8
    elif mode == "waiting":
        p["tilt"] = [-7, 7, 0, 9, -9, 0][i]
        p["blink"] = i == 3
        p["tail_sway"] = [0, 2, 0, -2, 0, 0][i]
    elif mode == "running":
        p["wing_angle"] = [45, 10, -15, 10, 45, 10][i]
        p["dy"] = [0, -2, 0, 2, 0, -2][i]
    elif mode == "review":
        p["pitch"] = 22
        p["dy"] = [-2, 0, -1, 0, -1, 0][i]
        p["tilt"] = [2, 5, 3, 5, 3, 2][i]
        p["tail_sway"] = [0, 1.5, 0, -1.5, 0, 0][i]
    return p


def mirror_for(mode):
    return mode == "running-left"


def build_frames():
    return {
        name: [render_cell(track_pose(name, i), mirror=mirror_for(name))
               for i in range(n)]
        for name, n in TRACKS
    }


def build_atlas(frames):
    atlas = Image.new("RGBA", (CW * COLUMNS, CH * ROWS), (0, 0, 0, 0))
    for row, (name, n) in enumerate(TRACKS):
        for col in range(n):
            atlas.paste(frames[name][col], (col * CW, row * CH))
    return atlas


def save_gif(frames, name, path):
    # 192 colors + Floyd-Steinberg dithering keeps gradients smooth
    pal = [f.convert("P", palette=Image.Palette.ADAPTIVE, colors=192, dither=Image.Dither.FLOYDSTEINBERG)
           for f in frames]
    pal[0].save(path, save_all=True, append_images=pal[1:],
                duration=DURATIONS[name], loop=0, optimize=True, disposal=2)


def build_contact(frames):
    scale = 2
    pad = 10
    lh = 34
    w = CW * scale * 8 + pad
    h = (CH * scale + lh) * ROWS + pad
    sheet = Image.new("RGBA", (w, h), (245, 250, 252, 255))
    d = ImageDraw.Draw(sheet)
    font = ImageFont.load_default(size=22)
    for row, (name, n) in enumerate(TRACKS):
        y = pad + row * (CH * scale + lh)
        d.text((pad, y + 4), name, fill=(8, 30, 40, 255), font=font)
        for col in range(n):
            cell = frames[name][col].resize((CW * scale, CH * scale), Image.LANCZOS)
            sheet.paste(cell, (pad + col * CW * scale, y + lh), cell)
    return sheet


def main():
    base = os.path.dirname(os.path.abspath(__file__))
    out_dir = os.path.normpath(os.path.join(base, "..", "..", "..", "packages", "dsh-pet", "assets", "blue-throated-bee-eater"))
    frames = build_frames()
    atlas = build_atlas(frames)
    os.makedirs(os.path.join(out_dir, "previews"), exist_ok=True)
    atlas.save(os.path.join(out_dir, "spritesheet.webp"), format="WEBP", lossless=True, quality=100, method=6)
    for name, _ in TRACKS:
        save_gif(frames[name], name, os.path.join(out_dir, "previews", f"{name}.gif"))
    sheet = build_contact(frames)
    sheet.save(os.path.join(base, "contact-sheet.png"))
    print("wrote", out_dir)
    for name, _ in TRACKS:
        g = os.path.join(out_dir, "previews", f"{name}.gif")
        print(name, "->", os.path.getsize(g), "bytes")
    print("spritesheet", os.path.getsize(os.path.join(out_dir, "spritesheet.webp")), "bytes")
    print("contact sheet", os.path.join(base, "contact-sheet.png"))


if __name__ == "__main__":
    main()
