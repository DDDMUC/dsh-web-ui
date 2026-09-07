#!/usr/bin/env python3
"""
Blue-throated Bee-eater pet sprite generator (dsh-pet contribution).

Draws a flat-illustration Blue-throated Bee-eater (Merops philippinus) with
Pillow, at 4x supersampling, and emits:

  packages/dsh-pet/assets/blue-throated-bee-eater/
    spritesheet.webp    1536x1872 atlas (8 columns x 9 rows, 192x208 cells)
    previews/<track>.gif  one animated preview per track (192x208)

plus docs/archive/blue-throated-bee-eater-pet/contact-sheet.png for review.
pet.json is maintained next to the assets.

Palette follows the blue-throated-bee-eater skin (azure #2b87d8, chestnut
#b26a3b, deep blue-ink outlines, cream surface); the body teal is derived
from the bird's real plumage so it harmonises with the azure family.
Artwork is repository-original (Apache-2.0).

Row order and frame counts follow the hatch-pet sprite2d contract:
idle, running-right, running-left, waving, jumping, failed, waiting, running,
review with per-row frames [6, 8, 8, 4, 5, 8, 6, 6, 6].

Re-run: python3 docs/archive/blue-throated-bee-eater-pet/gen-pet.py
"""

import math
import os
from PIL import Image, ImageDraw, ImageFont

SS = 4  # supersample factor
CW, CH = 192, 208  # cell size at 1x
COLUMNS = 8
ROWS = 9

# --- palette (skin-anchored) ------------------------------------------------
AZURE = (43, 135, 216)       # #2b87d8 brand azure - throat, wing primaries
AZURE_L = (65, 163, 232)     # #41a3e8 light azure - tail streamers
AZURE_D = (28, 108, 176)     # shaded azure
TEAL = (63, 160, 143)        # #3fa08f body green-teal
TEAL_D = (46, 125, 111)      # shaded teal - wing coverts, back shading
TEAL_L = (92, 184, 165)      # light teal highlight
CROWN = (178, 106, 59)       # #b26a3b chestnut crown
CROWN_D = (143, 79, 43)      # shaded chestnut
INK = (12, 32, 41)           # #0c2029 eye mask, outlines
INK_D = (18, 43, 54)         # #122b36 beak
BELLY = (238, 246, 249)      # #eef6f9 cream belly
BELLY_S = (205, 226, 234)    # shaded cream
LEG_D = (93, 107, 118)       # shaded leg
WHITE = (255, 255, 255)

OUTLINE = INK
OUTLINE_W = 2.2  # outline width at 1x

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

GROUND = 196.0  # feet baseline

# --- vector helpers ----------------------------------------------------------

def smooth(points, closed=False, samples=14):
    """Catmull-Rom spline through the anchor points -> dense polyline."""
    pts = [complex(x, y) for x, y in points]
    n = len(pts)
    if n < 2:
        return points
    if closed:
        seq = [pts[-1]] + pts + [pts[0], pts[1]]
    else:
        seq = [pts[0]] + pts + [pts[-1]]
    out = []
    for i in range(1, len(seq) - 2):
        p0, p1, p2, p3 = seq[i - 1], seq[i], seq[i + 1], seq[i + 2]
        for t in range(samples):
            u = t / samples
            v = 1 - u
            z = 0.5 * (2 * p1 + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u
                       + (-p0 + 3 * p1 - 3 * p2 + p3) * u * u * u)
            out.append((z.real, z.imag))
    if not closed:
        out.append((seq[-2].real, seq[-2].imag))
    return out


def ellipse_path(cx, cy, rx, ry, steps=48):
    return [
        (cx + rx * math.cos(2 * math.pi * i / steps),
         cy + ry * math.sin(2 * math.pi * i / steps))
        for i in range(steps)
    ]


def poly(d, pts, fill, outline=None, width=OUTLINE_W, closed=True):
    pts = [(x * SS, y * SS) for x, y in pts]
    if closed:
        d.polygon(pts, fill=fill)
        if outline:
            d.line(pts + [pts[0]], fill=outline, width=int(width * SS), joint="curve")
    else:
        d.line(pts, fill=fill, width=int(width * SS), joint="curve")


def strip(d, pts, width, fill, outline=None, ow=1.2):
    """Filled ribbon along a polyline, with rounded caps."""
    n = len(pts)
    if n < 2:
        return pts
    left, right = [], []
    for i in range(n):
        x0, y0 = pts[max(0, i - 1)]
        x1, y1 = pts[min(n - 1, i + 1)]
        dx, dy = x1 - x0, y1 - y0
        ln = math.hypot(dx, dy) or 1.0
        nx, ny = -dy / ln, dx / ln
        left.append((pts[i][0] + nx * width / 2, pts[i][1] + ny * width / 2))
        right.append((pts[i][0] - nx * width / 2, pts[i][1] - ny * width / 2))
    ring = left + list(reversed(right))
    poly(d, ring, fill, outline, ow)
    tipx, tipy = pts[-1]
    d.ellipse([(tipx - width / 2) * SS, (tipy - width / 2) * SS,
               (tipx + width / 2) * SS, (tipy + width / 2) * SS],
              fill=fill, outline=None)
    return pts


def transform(pts, cx, cy, rot=0.0, scale=1.0, dx=0.0, dy=0.0):
    r = math.radians(rot)
    cosr, sinr = math.cos(r), math.sin(r)
    out = []
    for x, y in pts:
        rx = (x - cx) * scale
        ry = (y - cy) * scale
        nx = rx * cosr - ry * sinr
        ny = rx * sinr + ry * cosr
        out.append((nx + cx + dx, ny + cy + dy))
    return out


# --- component drawers (1x coordinate space, facing right) -------------------
# Skeleton: ground 196, feet ~ (92,196)/(102,196), hips ~ (94,158), chest
# (112,112), nape (94,92), head center (112,78) r 30, beak to (186,92).

def draw_tail(d, pose, cx=80, cy=164, rot=0.0, dx=0.0, dy=0.0):
    sway = pose.get("tail_sway", 0.0)
    scale = pose.get("tail_scale", 1.0)
    specs = [
        (-7, 78, AZURE, 9.0),
        (5, 70, AZURE_L, 8.0),
        (-19, 56, AZURE_L, 6.0),
        (16, 50, AZURE, 5.5),
    ]
    drop = pose.get("tail_droop", 0.0)
    for off, length, color, w in specs:
        a = math.radians(150 + sway * 1.4 + off * 1.6 + drop * 20)
        base = (cx, cy)
        tip = (base[0] - math.cos(a) * (length * scale),
               base[1] + math.sin(a) * (length * scale))
        mid = ((base[0] + tip[0]) / 2 - math.sin(a) * 4,
               (base[1] + tip[1]) / 2 - math.cos(a) * 4)
        pts = [(bx + dx, by + dy) for bx, by in ([base, mid, tip])]
        strip(d, pts, w, color, OUTLINE, 1.0)


def draw_body(d, pose, org=(100, 130), rot=0.0, dx=0.0, dy=0.0, breath=0.0):
    pts = smooth([
        (112, 96), (128, 108), (132, 132), (124, 154), (100, 170), (78, 160), (72, 136), (82, 108),
    ], closed=True, samples=18)
    pts = transform(pts, org[0], org[1], rot, 1.0 + breath * 0.01, dx, dy)
    poly(d, pts, TEAL, OUTLINE, OUTLINE_W)
    belly = smooth([
        (118, 110), (130, 130), (122, 154), (98, 168), (80, 152),
    ], closed=True, samples=16)
    belly = transform(belly, org[0], org[1], rot, 1.0, dx, dy)
    poly(d, belly, BELLY, None)
    bshade = smooth([
        (118, 110), (128, 128), (122, 152), (110, 162),
    ], closed=True, samples=12)
    bshade = transform(bshade, org[0], org[1], rot, 1.0, dx, dy)
    poly(d, bshade, BELLY_S, None)


def wing_folded(d, pose, sx=106, sy=124, rot=0.0, dx=0.0, dy=0.0, droop=0.0):
    pts = smooth([
        (sx, sy),
        (sx + 16, sy + 8 + droop * 6), (sx + 21, sy + 28 + droop * 10), (sx + 6, sy + 42 + droop * 14),
        (sx - 12, sy + 33 + droop * 10), (sx - 18, sy + 14 + droop * 4), (sx - 9, sy + 2),
    ], closed=True, samples=14)
    pts = transform(pts, sx, sy, rot, 1.0, dx, dy)
    poly(d, pts, TEAL_D, OUTLINE, 1.6)
    for k in range(3):
        t = k * 8.0
        tips = smooth([
            (sx - 6 + t * 0.2, sy + 30 + droop * 10),
            (sx - 30 - t * 0.5, sy + 40 - t * 0.4 + droop * 8),
            (sx - 52 - t * 0.8, sy + 33 - t * 0.3),
        ])
        tips = transform(tips, sx, sy, rot, 1.0, dx, dy)
        strip(d, tips, 8.0 - k * 1.2, AZURE_D if k == 1 else AZURE, OUTLINE, 1.1)


def wing_spread(d, sx, sy, angle, rot, dx, dy, span=110.0, covert=None, prim=None):
    """Spread wing: covert block + primary fan from the shoulder. angle: deg, up+."""
    a = math.radians(angle)
    dirx, diry = math.cos(a), -math.sin(a)
    cov = smooth([
        (sx, sy),
        (sx + dirx * 26 - diry * 22, sy + diry * 26 + dirx * 22),
        (sx + dirx * 62, sy + diry * 62),
        (sx + dirx * 46 + diry * 17, sy + diry * 46 - dirx * 17),
        (sx + dirx * 13 + diry * 15, sy + diry * 13 - dirx * 15),
    ], closed=True, samples=10)
    cov = transform(cov, sx, sy, rot, 1.0, dx, dy)
    poly(d, cov, covert or TEAL_D, OUTLINE, 1.6)
    for k in range(6):
        fang = angle - 32 + k * 13
        fa = math.radians(fang)
        fx, fy = math.cos(fa), -math.sin(fa)
        base = (sx + dirx * 52, sy + diry * 52)
        sidex, sidey = math.cos(math.radians(angle + 90)), math.sin(math.radians(angle + 90))
        b = (base[0] + sidex * (k - 2.5) * 5.5, base[1] + sidey * (k - 2.5) * 5.5)
        tip = (b[0] + fx * span * 0.55, b[1] + fy * span * 0.55)
        mid = (b[0] + fx * span * 0.27, b[1] + fy * span * 0.27)
        pts = smooth([(b[0] - 5, b[1]), mid, tip])
        pts = transform(pts, sx, sy, rot, 1.0, dx, dy)
        strip(d, pts, 11.0, prim if k % 2 == 0 else AZURE_D, OUTLINE, 1.1)


def draw_head(d, pose, hx=112, hy=78, pitch=0.0, tilt=0.0, blink=False, rot=0.0, dx=0.0, dy=0.0):
    hpts = ellipse_path(hx, hy + 2, 30, 28, 44)
    hpts = transform(hpts, hx, hy + 2, pitch * 0.6, 1.0, tilt * 0.16, 0)
    hpts = transform(hpts, hx, hy, rot, 1.0, dx, dy)
    poly(d, hpts, TEAL, OUTLINE, OUTLINE_W)
    # crown cap
    crx, cry = hx - 4.0 - pitch * 0.10, hy - 9.0
    crown = ellipse_path(crx, cry, 29, 16, 36)
    crown = transform(crown, crx, cry, -pitch * 0.5, 1.0, 0, 0)
    crown = transform(crown, hx, hy, rot, 1.0, dx, dy)
    poly(d, crown, CROWN, OUTLINE, 1.6)
    # eye mask band
    eyex, eyey = hx + 15.0, hy - 1.0 - pitch * 0.3
    mask = smooth([
        (eyex + 13, eyey - 2), (eyex + 8, eyey - 8), (hx - 12, eyey - 8), (hx - 27, eyey + 1),
        (hx - 26, eyey + 6), (hx - 5, eyey + 6), (eyex + 11, eyey + 4),
    ], closed=True, samples=10)
    mask = transform(mask, hx, hy, rot + pitch * 0.5, 1.0, dx, dy)
    poly(d, mask, INK, None)
    # eye
    if blink:
        eye = [(eyex - 8, eyey), (eyex + 8, eyey)]
        eye = transform(eye, hx, hy, rot + pitch * 0.5, 1.0, dx, dy)
        eye = [(x * SS, y * SS) for x, y in eye]
        d.line(eye, fill=INK, width=int(2.6 * SS))
    else:
        eye = ellipse_path(eyex, eyey, 9.0, 9.0, 26)
        eye = transform(eye, hx, hy, rot + pitch * 0.5, 1.0, dx, dy)
        poly(d, eye, WHITE, OUTLINE, 1.4)
        iris = ellipse_path(eyex + 1.8, eyey + 0.6, 4.6, 4.6, 22)
        iris = transform(iris, hx, hy, rot + pitch * 0.5, 1.0, dx, dy)
        poly(d, iris, INK_D, None)
        glint = ellipse_path(eyex + 3.2, eyey - 2.0, 1.8, 1.8, 14)
        glint = transform(glint, hx, hy, rot + pitch * 0.5, 1.0, dx, dy)
        poly(d, glint, WHITE, None)
    # azure throat + white chin bib
    throat = smooth([
        (hx + 27, hy + 10), (hx + 22, hy + 32), (hx + 2, hy + 37), (hx - 10, hy + 22), (hx - 3, hy + 10),
    ], closed=True, samples=12)
    throat = transform(throat, hx, hy, rot + pitch * 0.5, 1.0, dx, dy)
    poly(d, throat, AZURE, None)
    bib = smooth([
        (hx + 18, hy + 8), (hx + 14, hy + 15), (hx + 5, hy + 17), (hx + 0, hy + 11),
    ], closed=True, samples=8)
    bib = transform(bib, hx, hy, rot + pitch * 0.5, 1.0, dx, dy)
    poly(d, bib, WHITE, None)
    # beak (slender, gently curved down)
    bpitch = pitch * 0.9
    beak = smooth([
        (hx + 26, hy + 4),
        (hx + 46, hy + 3 - bpitch),
        (hx + 62, hy + 8 - bpitch * 1.7),
        (hx + 68, hy + 15 - bpitch * 2.4),
        (hx + 60, hy + 17 - bpitch * 2.2),
        (hx + 42, hy + 14 - bpitch * 0.8),
        (hx + 25, hy + 11),
    ], closed=True, samples=8)
    beak = transform(beak, hx, hy, rot, 1.0, dx, dy)
    poly(d, beak, INK_D, None)


def draw_legs(d, pose, rot=0.0, dx=0.0, dy=0.0, tucked=False, crouch=0.0):
    if tucked:
        pts = ellipse_path(82 + dx, 168 + dy, 12, 6, 16)
        poly(d, pts, LEG_D, OUTLINE, 1.1)
        return
    ground = GROUND + dy
    for lx, top in ((95, 171), (104, 169)):
        x = lx + dx
        t = top + crouch * 22 + dy
        d.line([(x * SS, t * SS), ((x - 1) * SS, (ground - 2) * SS)], fill=LEG_D, width=int(3.0 * SS))
        for tx in (-5, 0, 5):
            d.line([((x - 1) * SS, (ground - 2) * SS), ((x - 1 + tx) * SS, (ground + 4) * SS)],
                   fill=LEG_D, width=int(2.2 * SS))


def draw_front(d, pose, dx=0.0, dy=0.0):
    """Frontal hover view (running track)."""
    body = ellipse_path(96 + dx, 124 + dy, 30, 44, 44)
    poly(d, body, TEAL, OUTLINE, OUTLINE_W)
    belly = ellipse_path(96 + dx, 142 + dy, 19, 22, 36)
    poly(d, belly, BELLY, None)
    ang = pose.get("wing_angle", 40)
    a = math.radians(ang)
    for side in (-1, 1):
        sx = 96 + dx + side * 24
        sy = 102 + dy
        cov = smooth([
            (sx, sy),
            (sx + side * 52, sy - 18 * math.sin(a)),
            (sx + side * 88, sy - 36 * math.sin(a)),
            (sx + side * 92, sy - 40 * math.sin(a) + 16),
            (sx + side * 24, sy + 14),
        ], closed=True, samples=10)
        poly(d, cov, TEAL_D, OUTLINE, 1.5)
        for k in range(5):
            tipx = 96 + dx + side * (62 + k * 7)
            tipy = sy - (50 + k * 6) * math.sin(a) + (k - 2) * 5
            midx = 96 + dx + side * (44 + k * 4)
            midy = sy - (36 + k * 4) * math.sin(a)
            pts = smooth([(96 + dx + side * 30, sy + 2), (midx, midy), (tipx, tipy)])
            strip(d, pts, 12.0, AZURE if k % 2 == 0 else AZURE_D, OUTLINE, 1.1)
    head = ellipse_path(96 + dx, 64 + dy, 29, 27, 40)
    poly(d, head, TEAL, OUTLINE, OUTLINE_W)
    crown = ellipse_path(96 + dx, 52 + dy, 26, 13, 30)
    poly(d, crown, CROWN, OUTLINE, 1.6)
    mask = smooth([
        (96 + dx - 25, 61 + dy), (96 + dx - 11, 52 + dy), (96 + dx + 11, 52 + dy), (96 + dx + 25, 61 + dy),
        (96 + dx + 22, 66 + dy), (96 + dx - 22, 66 + dy),
    ], closed=True, samples=10)
    poly(d, mask, INK, None)
    for side in (-1, 1):
        eye = ellipse_path(96 + dx + side * 10, 60 + dy, 5.6, 6.0, 22)
        poly(d, eye, WHITE, None)
        iris = ellipse_path(96 + dx + side * 10.5, 60.6 + dy, 2.9, 3.1, 16)
        poly(d, iris, INK_D, None)
    beak = smooth([
        (96 + dx - 5, 80 + dy), (96 + dx + 5, 80 + dy), (96 + dx, 99 + dy),
    ], closed=True, samples=6)
    poly(d, beak, INK_D, None)
    thr = smooth([
        (96 + dx - 16, 76 + dy), (96 + dx - 9, 89 + dy), (96 + dx + 9, 89 + dy), (96 + dx + 16, 76 + dy),
    ], closed=True, samples=8)
    poly(d, thr, AZURE, None)
    pts = ellipse_path(96 + dx, 162 + dy, 12, 7, 16)
    poly(d, pts, LEG_D, OUTLINE, 1.1)


# --- pose renderer -----------------------------------------------------------

def draw_bird(d, pose):
    rot = pose.get("rot", 0.0)
    dx = pose.get("dx", 0.0)
    dy = pose.get("dy", 0.0)
    breath = pose.get("breath", 0.0)
    mode = pose.get("mode", "perch")
    org = (100, 132)

    draw_tail(d, pose, rot=rot * 0.6, dx=dx, dy=dy)

    if mode in ("front", "running"):
        draw_front(d, pose, dx=dx, dy=dy)
        return

    if mode in ("fly", "running-right", "running-left"):
        wing_spread(d, 108 + dx, 130 + dy, pose.get("wing_angle", 30) * 0.9, rot, dx - 4, dy - 4,
                    span=86, covert=TEAL_D, prim=AZURE_D)
        draw_body(d, pose, org=org, rot=rot, dx=dx, dy=dy, breath=breath)
        draw_legs(d, pose, rot=rot, dx=dx, dy=dy, tucked=True)
        wing_spread(d, 112 + dx, 126 + dy, pose.get("wing_angle", 30), rot, dx, dy, span=104)
        draw_head(d, pose, hx=126 + dx, hy=66 + dy, rot=rot, dx=dx, dy=dy, pitch=pose.get("pitch", -6))
        return

    if mode == "jump":
        wings = pose.get("wings", "spread")
        if wings == "spread":
            wing_spread(d, 114 + dx, 126 + dy, 74, rot, dx, dy, span=82)
        draw_body(d, pose, org=org, rot=rot, dx=dx, dy=dy, breath=breath)
        draw_legs(d, pose, rot=rot, dx=dx, dy=dy,
                  tucked=pose.get("legs", "stand") == "tuck", crouch=pose.get("crouch", 0))
        if wings == "folded":
            wing_folded(d, pose, sx=110 + dx, sy=124 + dy, rot=rot, dx=dx, dy=dy)
        else:
            wing_spread(d, 112 + dx, 122 + dy, pose.get("wing_angle", 40), rot, dx, dy, span=82)
        draw_head(d, pose, hx=116 + dx, hy=80 + dy, rot=rot, dx=dx, dy=dy,
                  blink=pose.get("blink", False), pitch=pose.get("pitch", 0), tilt=pose.get("tilt", 0))
        return

    draw_body(d, pose, org=org, rot=rot, dx=dx, dy=dy, breath=breath)
    draw_legs(d, pose, rot=rot, dx=dx, dy=dy, crouch=pose.get("crouch", 0))
    if pose.get("wing") == "spread":
        wing_spread(d, 112 + dx, 126 + dy, pose.get("wing_angle", 60), rot, dx, dy,
                    span=76, covert=TEAL_D, prim=AZURE_D)
        wing_spread(d, 110 + dx, 122 + dy, pose.get("wing_angle", 60), rot, dx, dy, span=84)
    elif pose.get("wing") == "wave":
        wing_spread(d, 108 + dx, 116 + dy, pose.get("wing_angle", 60), rot, dx, dy, span=96)
        wing_folded(d, pose, sx=112 + dx, sy=126 + dy, rot=rot, dx=dx, dy=dy)
    else:
        wing_folded(d, pose, sx=110 + dx, sy=124 + dy, rot=rot, dx=dx, dy=dy,
                    droop=pose.get("droop", 0))
    draw_head(d, pose, hx=114 + dx, hy=80 + dy, rot=rot, dx=dx, dy=dy,
              blink=pose.get("blink", False), pitch=pose.get("pitch", 0), tilt=pose.get("tilt", 0))


def render_cell(pose, mirror=False):
    img = Image.new("RGBA", (CW * SS, CH * SS), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    draw_bird(d, pose)
    img = img.resize((CW, CH), Image.LANCZOS)
    return img if not mirror else img.transpose(Image.FLIP_LEFT_RIGHT)


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
    pal = [f.convert("P", palette=Image.Palette.ADAPTIVE, colors=96) for f in frames]
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
