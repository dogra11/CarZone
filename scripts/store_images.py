"""
store_images.py - Original product shots for the CarZone accessories store.

Every product in scripts/data/store-catalog.json gets two images:
  products/<slug>-1.jpg   hero shot   (studio backdrop, soft spotlight, floor reflection)
  products/<slug>-2.jpg   detail shot (closer, slightly rotated, warm accent light)
plus category banners (categories/<slug>.jpg), the store hero (store-hero.jpg) and two
promo banners (promo-care.jpg, promo-tech.jpg).

The products are drawn from simple shapes by "kind" (seat, mat, bottle, dashcam ...) using
the product colour from the catalogue. Brands are fictional; no real logos are drawn.
Called from generate_images.py (python scripts/generate_images.py --store).
"""
import json
import math
import random
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

import generate_images as g

SS = g.SS
CATALOG = Path(__file__).resolve().parent / "data" / "store-catalog.json"


# ---------------------------------------------------------------------------
# Colour + shape helpers
# ---------------------------------------------------------------------------
def mix(c, t, k):
    return tuple(int(c[i] + (t[i] - c[i]) * k) for i in range(3))


def light(c, k=0.35):
    return mix(c, (255, 255, 255), k)


def dark(c, k=0.45):
    return mix(c, (0, 0, 0), k)


def shape_mask(size, kind, geom, radius=0):
    m = Image.new("L", size, 0)
    d = ImageDraw.Draw(m)
    if kind == "rect":
        d.rounded_rectangle(geom, radius=radius, fill=255)
    elif kind == "ellipse":
        d.ellipse(geom, fill=255)
    else:
        d.polygon(geom, fill=255)
    return m


def fill(layer, kind, geom, top, bottom=None, radius=0, alpha=255, horizontal=False):
    """Fills a shape with a vertical (or horizontal) gradient - gives products a lit, 3-D look."""
    W, H = layer.size
    bottom = bottom or dark(top)
    mask = shape_mask((W, H), kind, geom, radius)
    box = mask.getbbox()
    if not box:
        return mask
    x0, y0, x1, y1 = box
    grad = np.zeros((H, W, 4), dtype=np.float32)
    if horizontal:
        t = np.clip((np.arange(W) - x0) / max(1, x1 - x0), 0, 1)[None, :, None]
    else:
        t = np.clip((np.arange(H) - y0) / max(1, y1 - y0), 0, 1)[:, None, None]
    grad[..., :3] = np.array(top, np.float32) * (1 - t) + np.array(bottom, np.float32) * t
    grad[..., 3] = np.array(mask, np.float32) * (alpha / 255)
    layer.alpha_composite(Image.fromarray(grad.astype("uint8"), "RGBA"))
    return mask


def gloss(layer, box, strength=110, blur=10):
    """Soft white highlight (specular reflection)."""
    hl = Image.new("RGBA", layer.size, (0, 0, 0, 0))
    ImageDraw.Draw(hl).ellipse(box, fill=(255, 255, 255, strength))
    layer.alpha_composite(hl.filter(ImageFilter.GaussianBlur(blur * SS)))


def text(layer, xy, s, size, color=(240, 240, 240), anchor="mm", weight="Bold"):
    ImageDraw.Draw(layer).text(xy, s, font=g.font(int(size), weight), fill=color, anchor=anchor)


# ---------------------------------------------------------------------------
# Product drawers. Each draws onto an RGBA layer (W x H) with the floor at y = F,
# centred on x = cx, with an overall size unit u (about 1/10 of the width).
# ---------------------------------------------------------------------------
def p_seat(L, cx, F, u, c, rng):
    fill(L, "rect", [cx - 1.6 * u, F - 6.6 * u, cx - 0.2 * u, F - 5.7 * u], light(c, 0.1), dark(c, 0.3), radius=int(0.4 * u))
    fill(L, "poly", [(cx - 2.4 * u, F - 5.6 * u), (cx + 0.6 * u, F - 5.6 * u), (cx + 1.0 * u, F - 1.6 * u), (cx - 2.6 * u, F - 1.6 * u)], light(c, 0.15), dark(c, 0.35))
    fill(L, "rect", [cx - 3.0 * u, F - 2.0 * u, cx + 2.8 * u, F - 0.6 * u], c, dark(c, 0.55), radius=int(0.5 * u))
    d = ImageDraw.Draw(L)
    tan = (196, 150, 98)
    for i in range(4):
        x = cx - 2.0 * u + i * 0.75 * u
        d.line([(x, F - 5.3 * u), (x + 0.1 * u, F - 1.9 * u)], fill=tan + (200,), width=max(2, int(0.06 * u)))
    for i in range(5):
        y = F - 5.0 * u + i * 0.7 * u
        d.line([(cx - 2.3 * u, y), (cx + 0.6 * u, y)], fill=(0, 0, 0, 70), width=max(2, int(0.05 * u)))
    gloss(L, [cx - 2.0 * u, F - 5.4 * u, cx - 0.6 * u, F - 3.4 * u], 60)
    fill(L, "rect", [cx - 0.7 * u, F - 0.6 * u, cx - 0.4 * u, F], (60, 60, 66))


def p_mat(L, cx, F, u, c, rng):
    poly = [(cx - 3.6 * u, F - 0.4 * u), (cx + 3.6 * u, F - 0.4 * u), (cx + 2.4 * u, F - 3.8 * u), (cx - 2.6 * u, F - 3.8 * u)]
    fill(L, "poly", [(x, y + 0.35 * u) for x, y in poly], dark(c, 0.6), dark(c, 0.75))
    fill(L, "poly", poly, light(c, 0.12), dark(c, 0.4))
    d = ImageDraw.Draw(L)
    for i in range(1, 12):
        t = i / 12
        d.line([(cx - 3.6 * u + 7.2 * u * t, F - 0.4 * u), (cx - 2.6 * u + 5.0 * u * t, F - 3.8 * u)], fill=(0, 0, 0, 80), width=max(2, int(0.07 * u)))
    for j in range(1, 6):
        t = j / 6
        y = F - 0.4 * u - 3.4 * u * t
        d.line([(cx - 3.6 * u + 1.0 * u * t, y), (cx + 3.6 * u - 1.2 * u * t, y)], fill=(255, 255, 255, 35), width=max(2, int(0.05 * u)))
    d.line(poly + [poly[0]], fill=light(c, 0.4) + (160,), width=max(2, int(0.1 * u)))


def p_wheel(L, cx, F, u, c, rng):
    cy, R = F - 3.3 * u, 2.9 * u
    fill(L, "ellipse", [cx - R, cy - R, cx + R, cy + R], light(c, 0.15), dark(c, 0.5))
    fill(L, "ellipse", [cx - R * 0.78, cy - R * 0.78, cx + R * 0.78, cy + R * 0.78], (14, 16, 20), (6, 7, 9))
    for a in (200, 340, 90):
        r = math.radians(a)
        fill(L, "poly", [(cx - 0.35 * u, cy), (cx + 0.35 * u, cy), (cx + math.cos(r) * R * 0.8 + 0.3 * u, cy + math.sin(r) * R * 0.8), (cx + math.cos(r) * R * 0.8 - 0.3 * u, cy + math.sin(r) * R * 0.8)], (60, 64, 72), (30, 32, 38))
    fill(L, "ellipse", [cx - 0.9 * u, cy - 0.9 * u, cx + 0.9 * u, cy + 0.9 * u], (70, 74, 84), (24, 26, 30))
    d = ImageDraw.Draw(L)
    for i in range(36):
        a = math.radians(i * 10)
        d.line([(cx + math.cos(a) * R * 0.82, cy + math.sin(a) * R * 0.82), (cx + math.cos(a) * R * 0.97, cy + math.sin(a) * R * 0.97)], fill=light(c, 0.5) + (110,), width=max(2, int(0.04 * u)))
    gloss(L, [cx - R * 0.8, cy - R, cx + R * 0.2, cy - R * 0.55], 70)


def p_bag(L, cx, F, u, c, rng):
    fill(L, "rect", [cx - 3.2 * u, F - 3.2 * u, cx + 3.2 * u, F], c, dark(c, 0.55), radius=int(0.3 * u))
    fill(L, "poly", [(cx - 3.2 * u, F - 3.2 * u), (cx + 3.2 * u, F - 3.2 * u), (cx + 2.7 * u, F - 3.9 * u), (cx - 2.7 * u, F - 3.9 * u)], light(c, 0.25), c)
    d = ImageDraw.Draw(L)
    for x in (-1.1, 1.1):
        d.line([(cx + x * u, F - 3.2 * u), (cx + x * u, F)], fill=(0, 0, 0, 90), width=max(2, int(0.08 * u)))
    for x in (-2.15, 0, 2.15):
        fill(L, "rect", [cx + (x - 0.85) * u, F - 1.9 * u, cx + (x + 0.85) * u, F - 0.4 * u], dark(c, 0.2), dark(c, 0.5), radius=int(0.15 * u))
    for x in (-1.6, 1.6):
        d.arc([cx + (x - 0.6) * u, F - 4.7 * u, cx + (x + 0.6) * u, F - 3.4 * u], 180, 360, fill=(30, 30, 34, 255), width=max(3, int(0.18 * u)))


def p_cover(L, cx, F, u, c, rng):
    car, _ = g.draw_car(L.size, cx - 4.3 * u, F, 8.6 * u, "sedan", c, (230, 235, 245), (230, 235, 245), c, c)
    arr = np.array(car).astype(np.float32)
    a = arr[..., 3:4] / 255
    grey = arr[..., :3].mean(axis=2, keepdims=True)
    arr[..., :3] = grey * 0.45 + np.array(c, np.float32) * 0.55
    arr[..., 3:4] = a * 255
    L.alpha_composite(Image.fromarray(arr.astype("uint8"), "RGBA"))
    d = ImageDraw.Draw(L)
    for i in range(7):
        x = cx - 3.5 * u + i * 1.15 * u + rng.uniform(-0.2, 0.2) * u
        d.line([(x, F - 2.5 * u), (x + rng.uniform(-0.4, 0.4) * u, F - 0.7 * u)], fill=(255, 255, 255, 50), width=max(2, int(0.08 * u)))


def p_spoiler(L, cx, F, u, c, rng):
    fill(L, "poly", [(cx - 4 * u, F - 3.6 * u), (cx + 4 * u, F - 3.6 * u), (cx + 3.6 * u, F - 2.9 * u), (cx - 3.6 * u, F - 2.9 * u)], light(c, 0.3), dark(c, 0.4))
    for x in (-2.2, 2.2):
        fill(L, "poly", [(cx + (x - 0.25) * u, F - 3.0 * u), (cx + (x + 0.25) * u, F - 3.0 * u), (cx + (x + 0.45) * u, F - 0.6 * u), (cx + (x - 0.45) * u, F - 0.6 * u)], c, dark(c, 0.6))
    fill(L, "rect", [cx - 4.2 * u, F - 3.9 * u, cx - 3.8 * u, F - 2.8 * u], dark(c, 0.2), dark(c, 0.6))
    fill(L, "rect", [cx + 3.8 * u, F - 3.9 * u, cx + 4.2 * u, F - 2.8 * u], dark(c, 0.2), dark(c, 0.6))
    gloss(L, [cx - 3 * u, F - 3.75 * u, cx + 2 * u, F - 3.35 * u], 120, 4)


def p_garnish(L, cx, F, u, c, rng):
    for k, y in enumerate((F - 3.2 * u, F - 1.6 * u)):
        fill(L, "rect", [cx - 4 * u, y - 0.35 * u, cx + 4 * u, y + 0.35 * u], (245, 247, 250), (120, 126, 136), radius=int(0.35 * u))
        gloss(L, [cx - 3.5 * u, y - 0.3 * u, cx + 1 * u, y - 0.05 * u], 170, 3)


def p_flap(L, cx, F, u, c, rng):
    for x in (-1.8, 1.8):
        fill(L, "poly", [(cx + (x - 1.2) * u, F - 5 * u), (cx + (x + 1.2) * u, F - 5 * u), (cx + (x + 1.3) * u, F - 0.2 * u), (cx + (x - 1.3) * u, F - 0.2 * u)], light(c, 0.15), dark(c, 0.5))
        d = ImageDraw.Draw(L)
        for i in range(5):
            y = F - 4.2 * u + i * 0.8 * u
            d.line([(cx + (x - 0.9) * u, y), (cx + (x + 0.9) * u, y)], fill=(255, 255, 255, 35), width=max(2, int(0.1 * u)))


def p_visor(L, cx, F, u, c, rng):
    for k, y in enumerate((F - 3.6 * u, F - 1.7 * u)):
        fill(L, "poly", [(cx - 4 * u, y + 0.5 * u), (cx - 3.2 * u, y - 0.4 * u), (cx + 3.8 * u, y - 0.6 * u), (cx + 4 * u, y - 0.1 * u), (cx + 3.4 * u, y + 0.5 * u)], (60, 66, 80), (12, 14, 18), alpha=220)
        gloss(L, [cx - 2.8 * u, y - 0.35 * u, cx + 2.4 * u, y - 0.05 * u], 90, 3)


def p_screen(L, cx, F, u, c, rng):
    fill(L, "rect", [cx - 3.6 * u, F - 5 * u, cx + 3.6 * u, F - 0.6 * u], (40, 42, 48), (12, 13, 16), radius=int(0.35 * u))
    fill(L, "rect", [cx - 3.3 * u, F - 4.7 * u, cx + 3.3 * u, F - 0.9 * u], (20, 60, 130), (8, 16, 36), radius=int(0.15 * u))
    for i, (x, y) in enumerate([(-2.2, -3.6), (-0.6, -3.6), (1.0, -3.6), (-2.2, -2.2), (-0.6, -2.2), (1.0, -2.2)]):
        col = [g.BLUE, g.GOLD, (60, 200, 140), (230, 90, 90), (150, 110, 255), (240, 240, 245)][i]
        fill(L, "rect", [cx + x * u, F + y * u, cx + (x + 1.1) * u, F + (y + 1.0) * u], light(col, 0.2), dark(col, 0.3), radius=int(0.2 * u))
    fill(L, "rect", [cx + 2.3 * u, F - 4.4 * u, cx + 3.1 * u, F - 1.2 * u], (30, 40, 60), (14, 18, 28), radius=int(0.1 * u))
    gloss(L, [cx - 3.2 * u, F - 4.8 * u, cx + 0.5 * u, F - 3.8 * u], 50, 8)
    fill(L, "rect", [cx - 0.8 * u, F - 0.6 * u, cx + 0.8 * u, F], (30, 32, 36))


def p_dashcam(L, cx, F, u, c, rng):
    fill(L, "rect", [cx - 2.6 * u, F - 4.0 * u, cx + 2.6 * u, F - 0.8 * u], (52, 55, 62), (14, 15, 18), radius=int(0.6 * u))
    fill(L, "ellipse", [cx - 1.4 * u, F - 3.6 * u, cx + 1.4 * u, F - 0.8 * u], (90, 94, 104), (20, 22, 26))
    fill(L, "ellipse", [cx - 0.95 * u, F - 3.15 * u, cx + 0.95 * u, F - 1.25 * u], (20, 40, 90), (2, 4, 10))
    gloss(L, [cx - 0.6 * u, F - 2.9 * u, cx - 0.05 * u, F - 2.4 * u], 200, 2)
    fill(L, "rect", [cx - 0.5 * u, F - 4.9 * u, cx + 0.5 * u, F - 4.0 * u], (40, 42, 48), (20, 21, 24))
    fill(L, "ellipse", [cx + 1.8 * u, F - 3.6 * u, cx + 2.1 * u, F - 3.3 * u], (255, 60, 60), (160, 20, 20))


def p_camera(L, cx, F, u, c, rng):
    fill(L, "rect", [cx - 2.4 * u, F - 3.0 * u, cx + 1.4 * u, F - 1.2 * u], (60, 64, 72), (18, 19, 22), radius=int(0.9 * u))
    fill(L, "ellipse", [cx + 0.5 * u, F - 3.1 * u, cx + 2.4 * u, F - 1.1 * u], (90, 94, 104), (24, 26, 30))
    fill(L, "ellipse", [cx + 0.95 * u, F - 2.65 * u, cx + 1.95 * u, F - 1.55 * u], (30, 60, 140), (2, 4, 12))
    gloss(L, [cx - 2 * u, F - 2.9 * u, cx + 0.5 * u, F - 2.5 * u], 90, 3)
    ImageDraw.Draw(L).line([(cx - 2.4 * u, F - 2.1 * u), (cx - 3.8 * u, F - 1.0 * u), (cx - 3.0 * u, F - 0.2 * u)], fill=(20, 20, 22, 255), width=int(0.15 * u))


def p_sensor(L, cx, F, u, c, rng):
    fill(L, "rect", [cx - 1.6 * u, F - 2.4 * u, cx + 1.6 * u, F - 0.3 * u], (40, 42, 48), (14, 15, 18), radius=int(0.2 * u))
    for i, x in enumerate((-3.4, -1.4, 1.4, 3.4)):
        y = F - 4.3 * u if i in (1, 2) else F - 3.8 * u
        fill(L, "ellipse", [cx + (x - 0.6) * u, y - 0.6 * u, cx + (x + 0.6) * u, y + 0.6 * u], light(c, 0.2), dark(c, 0.4))
        fill(L, "ellipse", [cx + (x - 0.35) * u, y - 0.35 * u, cx + (x + 0.35) * u, y + 0.35 * u], dark(c, 0.3), dark(c, 0.7))


def p_tpms(L, cx, F, u, c, rng):
    fill(L, "rect", [cx - 2.0 * u, F - 4.2 * u, cx + 2.0 * u, F - 1.4 * u], (36, 38, 44), (12, 13, 16), radius=int(0.4 * u))
    fill(L, "rect", [cx - 1.7 * u, F - 3.9 * u, cx + 1.7 * u, F - 1.7 * u], (10, 30, 60), (4, 10, 22), radius=int(0.2 * u))
    for i, (x, y) in enumerate([(-0.8, -3.3), (0.8, -3.3), (-0.8, -2.2), (0.8, -2.2)]):
        text(L, (cx + x * u, F + y * u), "32", 0.6 * u, (110, 200, 255))
    for x in (-3.4, -2.6, 2.6, 3.4):
        fill(L, "rect", [cx + (x - 0.3) * u, F - 1.1 * u, cx + (x + 0.3) * u, F - 0.1 * u], (220, 222, 228), (110, 114, 122), radius=int(0.12 * u))


def p_plug(L, cx, F, u, c, rng):
    fill(L, "rect", [cx - 1.0 * u, F - 5.0 * u, cx + 1.0 * u, F - 1.6 * u], light(c, 0.15), dark(c, 0.55), radius=int(0.5 * u))
    fill(L, "rect", [cx - 0.6 * u, F - 1.6 * u, cx + 0.6 * u, F - 0.2 * u], (210, 214, 222), (120, 124, 132), radius=int(0.1 * u))
    for y in (-4.3, -3.4):
        fill(L, "rect", [cx - 0.55 * u, F + y * u, cx + 0.55 * u, F + (y + 0.45) * u], (8, 8, 10), (20, 20, 24), radius=int(0.05 * u))
    fill(L, "ellipse", [cx - 0.2 * u, F - 2.5 * u, cx + 0.2 * u, F - 2.1 * u], g.BLUE, light(g.BLUE))
    gloss(L, [cx - 0.8 * u, F - 4.9 * u, cx - 0.2 * u, F - 2.0 * u], 70, 3)


def p_bulb(L, cx, F, u, c, rng):
    for x in (-1.5, 1.5):
        fill(L, "rect", [cx + (x - 0.7) * u, F - 2.2 * u, cx + (x + 0.7) * u, F - 0.2 * u], (60, 62, 70), (20, 21, 24), radius=int(0.1 * u))
        d = ImageDraw.Draw(L)
        for i in range(6):
            y = F - 2.0 * u + i * 0.32 * u
            d.line([(cx + (x - 0.75) * u, y), (cx + (x + 0.75) * u, y)], fill=(0, 0, 0, 160), width=max(2, int(0.06 * u)))
        fill(L, "rect", [cx + (x - 0.35) * u, F - 5.2 * u, cx + (x + 0.35) * u, F - 2.2 * u], (240, 242, 246), (150, 154, 162), radius=int(0.3 * u))
        for y in (-4.6, -3.8, -3.0):
            fill(L, "rect", [cx + (x - 0.38) * u, F + y * u, cx + (x - 0.1) * u, F + (y + 0.4) * u], (255, 250, 220), (255, 220, 120))
        glow = Image.new("RGBA", L.size, (0, 0, 0, 0))
        ImageDraw.Draw(glow).ellipse([cx + (x - 1.2) * u, F - 5.4 * u, cx + (x + 1.2) * u, F - 2.6 * u], fill=(255, 245, 210, 60))
        L.alpha_composite(glow.filter(ImageFilter.GaussianBlur(14 * SS)))


def p_lamp(L, cx, F, u, c, rng):
    for x in (-1.9, 1.9):
        cy = F - 2.4 * u
        fill(L, "ellipse", [cx + (x - 1.7) * u, cy - 1.7 * u, cx + (x + 1.7) * u, cy + 1.7 * u], (70, 74, 82), (16, 17, 20))
        fill(L, "ellipse", [cx + (x - 1.35) * u, cy - 1.35 * u, cx + (x + 1.35) * u, cy + 1.35 * u], light(c, 0.5), c)
        fill(L, "ellipse", [cx + (x - 0.5) * u, cy - 0.5 * u, cx + (x + 0.5) * u, cy + 0.5 * u], (255, 255, 240), light(c, 0.3))
        gloss(L, [cx + (x - 1.1) * u, cy - 1.2 * u, cx + (x - 0.1) * u, cy - 0.5 * u], 120, 3)


def p_strip(L, cx, F, u, c, rng):
    glow = Image.new("RGBA", L.size, (0, 0, 0, 0))
    d, dg = ImageDraw.Draw(L), ImageDraw.Draw(glow)
    for k, col in enumerate([c, g.BLUE, (180, 90, 255)]):
        pts = [(cx - 4 * u + i * 0.4 * u, F - (2.4 + k * 1.1) * u + math.sin(i * 0.6 + k) * 0.5 * u) for i in range(21)]
        dg.line(pts, fill=col + (160,), width=int(0.7 * u))
        d.line(pts, fill=light(col, 0.5) + (255,), width=int(0.18 * u))
    L.alpha_composite(glow.filter(ImageFilter.GaussianBlur(10 * SS)), (0, 0))
    fill(L, "rect", [cx - 1.0 * u, F - 0.9 * u, cx + 1.0 * u, F - 0.1 * u], (30, 32, 36), (12, 12, 14), radius=int(0.2 * u))


def p_bottle(L, cx, F, u, c, rng):
    fill(L, "rect", [cx - 1.3 * u, F - 5.0 * u, cx + 1.3 * u, F], light(c, 0.2), dark(c, 0.45), radius=int(0.45 * u), horizontal=True)
    fill(L, "rect", [cx - 0.5 * u, F - 5.8 * u, cx + 0.5 * u, F - 4.9 * u], (230, 232, 236), (120, 124, 130))
    fill(L, "poly", [(cx - 0.5 * u, F - 6.3 * u), (cx + 0.7 * u, F - 6.3 * u), (cx + 1.5 * u, F - 6.0 * u), (cx + 0.5 * u, F - 5.7 * u), (cx - 0.5 * u, F - 5.7 * u)], (40, 42, 48), (18, 19, 22))
    fill(L, "rect", [cx - 1.1 * u, F - 3.8 * u, cx + 1.1 * u, F - 1.0 * u], (245, 245, 248), (200, 204, 212), radius=int(0.15 * u))
    fill(L, "rect", [cx - 1.1 * u, F - 3.8 * u, cx + 1.1 * u, F - 3.2 * u], dark(c, 0.2), dark(c, 0.4))
    d = ImageDraw.Draw(L)
    for i in range(3):
        d.line([(cx - 0.8 * u, F - (2.6 - i * 0.45) * u), (cx + (0.8 - i * 0.3) * u, F - (2.6 - i * 0.45) * u)], fill=(80, 84, 92, 200), width=max(2, int(0.1 * u)))
    gloss(L, [cx - 1.1 * u, F - 4.8 * u, cx - 0.6 * u, F - 0.4 * u], 120, 3)


def p_tin(L, cx, F, u, c, rng):
    fill(L, "rect", [cx - 2.6 * u, F - 2.2 * u, cx + 2.6 * u, F - 0.2 * u], c, dark(c, 0.55), horizontal=True)
    fill(L, "ellipse", [cx - 2.6 * u, F - 0.9 * u, cx + 2.6 * u, F + 0.4 * u], dark(c, 0.3), dark(c, 0.6))
    fill(L, "ellipse", [cx - 2.6 * u, F - 2.9 * u, cx + 2.6 * u, F - 1.5 * u], light(c, 0.35), c)
    fill(L, "ellipse", [cx - 1.6 * u, F - 2.6 * u, cx + 1.6 * u, F - 1.8 * u], (250, 230, 170), (210, 170, 90))
    gloss(L, [cx - 2.2 * u, F - 1.9 * u, cx - 1.2 * u, F - 0.6 * u], 90, 3)


def p_cloth(L, cx, F, u, c, rng):
    for i, col in enumerate([c, mix(c, g.BLUE, 0.5), mix(c, g.GOLD, 0.6)]):
        y = F - 0.9 * u - i * 1.0 * u
        fill(L, "rect", [cx - 3.0 * u + i * 0.3 * u, y - 0.95 * u, cx + 3.0 * u - i * 0.2 * u, y], light(col, 0.15), dark(col, 0.35), radius=int(0.35 * u))
        d = ImageDraw.Draw(L)
        for k in range(26):
            x = cx - 2.8 * u + k * 0.22 * u
            d.line([(x, y - 0.85 * u), (x + 0.1 * u, y - 0.1 * u)], fill=(255, 255, 255, 25), width=2)


def p_polisher(L, cx, F, u, c, rng):
    fill(L, "ellipse", [cx - 2.4 * u, F - 1.4 * u, cx + 2.4 * u, F - 0.1 * u], (230, 230, 235), (150, 150, 158))
    fill(L, "rect", [cx - 0.9 * u, F - 2.4 * u, cx + 0.9 * u, F - 1.0 * u], (40, 42, 48), (16, 17, 20))
    fill(L, "rect", [cx - 3.6 * u, F - 4.0 * u, cx + 2.2 * u, F - 2.2 * u], light(c, 0.15), dark(c, 0.5), radius=int(0.9 * u))
    fill(L, "rect", [cx - 3.9 * u, F - 3.6 * u, cx - 2.6 * u, F - 2.6 * u], (30, 32, 36), (12, 12, 14), radius=int(0.4 * u))
    fill(L, "rect", [cx + 1.4 * u, F - 4.9 * u, cx + 2.0 * u, F - 3.9 * u], (30, 32, 36), (12, 12, 14), radius=int(0.2 * u))
    gloss(L, [cx - 3.0 * u, F - 3.95 * u, cx + 1.4 * u, F - 3.5 * u], 110, 3)


def p_vacuum(L, cx, F, u, c, rng):
    fill(L, "poly", [(cx + 1.2 * u, F - 2.6 * u), (cx + 4.2 * u, F - 1.0 * u), (cx + 4.2 * u, F - 0.5 * u), (cx + 1.2 * u, F - 1.6 * u)], (50, 52, 58), (20, 21, 24))
    fill(L, "rect", [cx - 2.6 * u, F - 3.2 * u, cx + 1.6 * u, F - 1.0 * u], (210, 220, 235), (90, 100, 120), radius=int(1.0 * u), alpha=235)
    fill(L, "rect", [cx - 3.6 * u, F - 4.8 * u, cx - 1.2 * u, F - 3.0 * u], light(c, 0.15), dark(c, 0.5), radius=int(0.6 * u))
    fill(L, "rect", [cx - 3.8 * u, F - 3.2 * u, cx - 2.4 * u, F - 0.3 * u], light(c, 0.1), dark(c, 0.55), radius=int(0.5 * u))
    gloss(L, [cx - 2.2 * u, F - 3.1 * u, cx + 0.8 * u, F - 2.6 * u], 140, 3)


def p_extinguisher(L, cx, F, u, c, rng):
    fill(L, "rect", [cx - 1.2 * u, F - 5.2 * u, cx + 1.2 * u, F], (230, 50, 50), (110, 14, 18), radius=int(1.0 * u), horizontal=True)
    fill(L, "rect", [cx - 0.4 * u, F - 6.0 * u, cx + 0.4 * u, F - 5.1 * u], (60, 62, 68), (24, 25, 28))
    fill(L, "poly", [(cx - 0.4 * u, F - 6.2 * u), (cx + 1.6 * u, F - 6.4 * u), (cx + 1.6 * u, F - 6.0 * u), (cx - 0.4 * u, F - 5.8 * u)], (40, 42, 48), (18, 19, 22))
    ImageDraw.Draw(L).line([(cx + 0.4 * u, F - 5.6 * u), (cx + 1.8 * u, F - 4.8 * u), (cx + 1.5 * u, F - 2.4 * u)], fill=(20, 20, 22, 255), width=int(0.2 * u))
    fill(L, "rect", [cx - 1.0 * u, F - 3.4 * u, cx + 1.0 * u, F - 1.6 * u], (245, 245, 248), (200, 204, 212), radius=int(0.1 * u))
    gloss(L, [cx - 1.0 * u, F - 5.0 * u, cx - 0.5 * u, F - 0.4 * u], 120, 3)


def p_lock(L, cx, F, u, c, rng):
    fill(L, "poly", [(cx - 4 * u, F - 2.0 * u), (cx + 3.6 * u, F - 3.2 * u), (cx + 3.8 * u, F - 2.6 * u), (cx - 3.8 * u, F - 1.4 * u)], light(c, 0.2), dark(c, 0.5))
    fill(L, "rect", [cx - 1.0 * u, F - 3.4 * u, cx + 1.2 * u, F - 1.0 * u], (60, 62, 70), (20, 21, 24), radius=int(0.4 * u))
    for x in (-3.4, 3.0):
        ImageDraw.Draw(L).arc([cx + (x - 0.8) * u, F - 4.0 * u, cx + (x + 0.8) * u, F - 1.6 * u], 180, 360, fill=(220, 222, 228, 255), width=int(0.25 * u))
    fill(L, "ellipse", [cx - 0.2 * u, F - 2.5 * u, cx + 0.4 * u, F - 1.9 * u], (200, 170, 90), (120, 96, 40))


def p_tracker(L, cx, F, u, c, rng):
    fill(L, "rect", [cx - 2.0 * u, F - 2.6 * u, cx + 2.0 * u, F - 0.3 * u], (46, 48, 54), (14, 15, 18), radius=int(0.5 * u))
    fill(L, "rect", [cx + 1.2 * u, F - 4.8 * u, cx + 1.5 * u, F - 2.6 * u], (30, 32, 36), (10, 10, 12), radius=int(0.1 * u))
    for i, col in enumerate([(60, 220, 120), g.BLUE, (255, 80, 80)]):
        fill(L, "ellipse", [cx - 1.4 * u + i * 0.6 * u, F - 2.1 * u, cx - 1.1 * u + i * 0.6 * u, F - 1.8 * u], col, col)
    gloss(L, [cx - 1.8 * u, F - 2.5 * u, cx + 1.0 * u, F - 2.1 * u], 80, 3)


def p_rack(L, cx, F, u, c, rng):
    for x in (-3.2, 3.2):
        fill(L, "poly", [(cx + (x - 0.4) * u, F - 0.3 * u), (cx + (x + 0.4) * u, F - 0.3 * u), (cx + (x + 0.25) * u, F - 2.4 * u), (cx + (x - 0.25) * u, F - 2.4 * u)], (50, 52, 58), (18, 19, 22))
    for k, y in enumerate((F - 2.8 * u, F - 3.8 * u)):
        fill(L, "rect", [cx - 4.3 * u + k * 0.5 * u, y - 0.3 * u, cx + 4.3 * u - k * 0.5 * u, y + 0.3 * u], light(c, 0.35), dark(c, 0.4), radius=int(0.3 * u))


def p_inflator(L, cx, F, u, c, rng):
    fill(L, "rect", [cx - 2.4 * u, F - 3.4 * u, cx + 2.4 * u, F - 0.2 * u], light(c, 0.15), dark(c, 0.55), radius=int(0.7 * u))
    fill(L, "rect", [cx - 1.5 * u, F - 2.9 * u, cx + 0.6 * u, F - 1.5 * u], (10, 30, 60), (4, 10, 20), radius=int(0.2 * u))
    text(L, (cx - 0.45 * u, F - 2.2 * u), "35", 0.9 * u, (110, 200, 255))
    fill(L, "rect", [cx + 1.0 * u, F - 4.2 * u, cx + 2.0 * u, F - 3.4 * u], (40, 42, 48), (20, 21, 24), radius=int(0.2 * u))
    ImageDraw.Draw(L).line([(cx + 2.4 * u, F - 1.6 * u), (cx + 3.6 * u, F - 1.2 * u), (cx + 3.9 * u, F - 0.3 * u)], fill=(20, 20, 22, 255), width=int(0.2 * u))


def p_holder(L, cx, F, u, c, rng):
    fill(L, "rect", [cx - 0.3 * u, F - 2.4 * u, cx + 0.3 * u, F - 0.4 * u], (40, 42, 48), (16, 17, 20))
    fill(L, "ellipse", [cx - 1.3 * u, F - 0.8 * u, cx + 1.3 * u, F], (50, 52, 58), (20, 21, 24))
    fill(L, "rect", [cx - 1.6 * u, F - 6.0 * u, cx + 1.6 * u, F - 2.2 * u], (24, 26, 30), (8, 9, 11), radius=int(0.35 * u))
    fill(L, "rect", [cx - 1.4 * u, F - 5.8 * u, cx + 1.4 * u, F - 2.4 * u], (30, 90, 180), (60, 30, 120), radius=int(0.25 * u))
    for x in (-1.8, 1.8):
        fill(L, "rect", [cx + (x - 0.25) * u, F - 4.6 * u, cx + (x + 0.25) * u, F - 3.4 * u], light(c, 0.2), dark(c, 0.5), radius=int(0.1 * u))
    gloss(L, [cx - 1.3 * u, F - 5.7 * u, cx, F - 4.6 * u], 60, 5)


def p_shade(L, cx, F, u, c, rng):
    poly = [(cx - 4 * u, F - 0.3 * u), (cx + 4 * u, F - 0.3 * u), (cx + 3.4 * u, F - 4.2 * u), (cx - 3.4 * u, F - 4.2 * u)]
    fill(L, "poly", poly, (235, 238, 244), (140, 146, 158))
    d = ImageDraw.Draw(L)
    for i in range(1, 8):
        t = i / 8
        d.line([(cx - 4 * u + 8 * u * t, F - 0.3 * u), (cx - 3.4 * u + 6.8 * u * t, F - 4.2 * u)], fill=(90, 96, 108, 140), width=max(2, int(0.06 * u)))
    d.line(poly + [poly[0]], fill=dark(c, 0.1) + (255,), width=int(0.15 * u))
    gloss(L, [cx - 2.5 * u, F - 4.0 * u, cx + 1.0 * u, F - 2.6 * u], 90, 8)


def p_cushion(L, cx, F, u, c, rng):
    fill(L, "ellipse", [cx - 3.2 * u, F - 3.6 * u, cx + 3.2 * u, F - 0.2 * u], light(c, 0.2), dark(c, 0.45))
    fill(L, "ellipse", [cx - 1.0 * u, F - 3.0 * u, cx + 1.0 * u, F - 1.4 * u], dark(c, 0.15), dark(c, 0.35))
    gloss(L, [cx - 2.4 * u, F - 3.4 * u, cx + 0.4 * u, F - 2.4 * u], 50, 8)


def p_pillow(L, cx, F, u, c, rng):
    fill(L, "rect", [cx - 3.0 * u, F - 3.6 * u, cx + 3.0 * u, F - 0.2 * u], light(c, 0.2), dark(c, 0.45), radius=int(1.4 * u))
    d = ImageDraw.Draw(L)
    for i in range(4):
        d.arc([cx - 2.6 * u, F - 3.2 * u + i * 0.7 * u, cx + 2.6 * u, F - 1.8 * u + i * 0.7 * u], 200, 340, fill=(255, 255, 255, 40), width=max(2, int(0.06 * u)))
    gloss(L, [cx - 2.2 * u, F - 3.4 * u, cx + 0.6 * u, F - 2.4 * u], 50, 8)


def p_jar(L, cx, F, u, c, rng):
    fill(L, "rect", [cx - 1.6 * u, F - 3.4 * u, cx + 1.6 * u, F], light(c, 0.3), dark(c, 0.35), radius=int(0.5 * u), alpha=225, horizontal=True)
    fill(L, "rect", [cx - 1.7 * u, F - 4.3 * u, cx + 1.7 * u, F - 3.3 * u], (40, 42, 48), (14, 15, 18), radius=int(0.2 * u))
    fill(L, "rect", [cx - 1.2 * u, F - 2.3 * u, cx + 1.2 * u, F - 0.8 * u], (245, 245, 248), (200, 204, 212), radius=int(0.1 * u))
    gloss(L, [cx - 1.4 * u, F - 3.2 * u, cx - 0.8 * u, F - 0.3 * u], 120, 3)


def p_helmet(L, cx, F, u, c, rng):
    fill(L, "ellipse", [cx - 3.0 * u, F - 5.6 * u, cx + 3.0 * u, F - 0.2 * u], light(c, 0.2), dark(c, 0.5))
    fill(L, "poly", [(cx - 0.4 * u, F - 3.6 * u), (cx + 3.0 * u, F - 3.8 * u), (cx + 2.8 * u, F - 1.6 * u), (cx + 0.2 * u, F - 1.4 * u)], (40, 50, 70), (8, 10, 16), alpha=240)
    fill(L, "rect", [cx - 3.1 * u, F - 1.0 * u, cx + 3.1 * u, F - 0.2 * u], (24, 25, 28), (10, 10, 12), radius=int(0.3 * u))
    gloss(L, [cx - 2.2 * u, F - 5.3 * u, cx + 0.2 * u, F - 4.2 * u], 140, 6)


DRAWERS = {name[2:]: fn for name, fn in globals().items() if name.startswith("p_")}


# ---------------------------------------------------------------------------
# Studio composition
# ---------------------------------------------------------------------------
def studio(W, H, floor, accent, seed):
    arr = g.vertical_gradient(W, H, [(0, (26, 30, 38)), (floor / H, (12, 14, 18)), (1, (6, 7, 9))])
    g.add_glow(arr, W * 0.5, H * 0.38, W * 0.42, H * 0.42, (60, 70, 90), 0.55)
    g.add_glow(arr, W * 0.82, H * 0.2, W * 0.3, H * 0.3, accent, 0.28)
    g.add_glow(arr, W * 0.5, floor, W * 0.5, H * 0.02, (150, 180, 230), 0.18)
    g.vignette(arr, 0.5)
    g.add_noise(arr, 2.0, seed)
    return g.to_img(arr).convert("RGBA")


def compose(product, base, floor, reflection=0.22):
    W, H = base.size
    bbox = product.getbbox() or (0, 0, W, H)
    shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    w = bbox[2] - bbox[0]
    ImageDraw.Draw(shadow).ellipse([bbox[0] + w * 0.05, floor - H * 0.02, bbox[2] - w * 0.05, floor + H * 0.025], fill=(0, 0, 0, 200))
    base.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(H * 0.015)))
    crop = product.crop((0, int(bbox[1]), W, int(floor)))
    refl = crop.transpose(Image.FLIP_TOP_BOTTOM)
    h = refl.size[1]
    if h > 0:
        fade = np.linspace(reflection, 0, h)[:, None] * np.ones((1, W))
        refl.putalpha(Image.fromarray((np.array(refl.getchannel("A"), np.float32) * fade).astype("uint8")))
        layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        layer.alpha_composite(refl.filter(ImageFilter.GaussianBlur(3)), (0, int(floor)))
        base.alpha_composite(layer)
    base.alpha_composite(product)


def render_product(kind, color, size, out, seed, variant=1):
    W, H = size[0] * SS, size[1] * SS
    rng = random.Random(seed)
    floor = H * 0.8
    accent = g.BLUE if variant == 1 else g.GOLD
    base = studio(W, H, floor, accent, seed)
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    u = min(W / (10.5 if variant == 1 else 8.8), floor / (7.6 if variant == 1 else 6.9))
    DRAWERS.get(kind, p_bag)(layer, W / 2, floor, u, tuple(color), rng)
    if variant == 2:
        layer = layer.rotate(-6, resample=Image.BICUBIC, center=(W / 2, floor))
    compose(layer, base, floor)
    g.finish(base, size, out, 86)


def product_layer(kind, color, W, H, cx, floor, u, seed):
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    DRAWERS.get(kind, p_bag)(layer, cx, floor, u, tuple(color), random.Random(seed))
    return layer


def banner(size, items, out, seed, accent=g.BLUE, car=None):
    """Wide scene: optional car on the left, a row of products on the right."""
    W, H = size[0] * SS, size[1] * SS
    floor = H * 0.82
    base = studio(W, H, floor, accent, seed)
    if car:
        length = W * car[2]
        layer, _ = g.draw_car((W, H), W * car[1], floor, length, car[0], car[3], g.BLUE, g.GOLD)
        g.place_car(base, layer, W * car[1], floor, length)
    n = len(items)
    start, span = (0.56, 0.4) if car else (0.12, 0.76)
    for i, (kind, color) in enumerate(items):
        cx = W * (start + span * (i + 0.5) / n)
        u = min(W * span / n / 9.5, H / 8.5)
        compose(product_layer(kind, color, W, H, cx, floor, u, seed + i), base, floor, 0.16)
    g.finish(base, size, out, 86)


def generate(out_dir):
    data = json.loads(CATALOG.read_text(encoding="utf-8"))
    prod_dir, cat_dir = out_dir / "products", out_dir / "categories"
    print("Product images")
    for i, p in enumerate(data["products"]):
        render_product(p["kind"], p["color"], (800, 600), prod_dir / f"{p['slug']}-1.jpg", 100 + i, 1)
        render_product(p["kind"], p["color"], (800, 600), prod_dir / f"{p['slug']}-2.jpg", 300 + i, 2)
    print("Category banners")
    for j, c in enumerate(data["categories"]):
        items = [(p["kind"], p["color"]) for p in data["products"] if p["category"] == c["slug"]]
        seen, picked = set(), []
        for k in items:
            if k[0] not in seen:
                seen.add(k[0])
                picked.append(k)
        banner((1200, 600), picked[:3], cat_dir / f"{c['slug']}.jpg", 500 + j, g.GOLD if j % 2 else g.BLUE)
    print("Store hero & promos")
    banner((1920, 800), [("dashcam", (40, 40, 40)), ("bottle", (40, 120, 220)), ("seat", (150, 100, 60))], out_dir / "store-hero.jpg", 600,
           car=("suv", 0.04, 0.5, (22, 26, 34)))
    banner((1200, 500), [("bottle", (200, 40, 50)), ("tin", (200, 160, 60)), ("cloth", (40, 120, 220)), ("polisher", (230, 120, 30))], out_dir / "promo-care.jpg", 610, g.GOLD)
    banner((1200, 500), [("screen", (40, 40, 40)), ("dashcam", (40, 40, 40)), ("plug", (30, 30, 34)), ("tpms", (40, 40, 40))], out_dir / "promo-tech.jpg", 620, g.BLUE)
