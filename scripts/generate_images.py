"""
generate_images.py - Creates every image used by the CarZone website.

All artwork is ORIGINAL and drawn in code with Pillow + NumPy, so the project has no
copyright issues and works fully offline. Scenes are rendered at 2x size and then
downsampled ("supersampling") for smooth, anti-aliased edges.

Output (client/public/assets/images/):
  hero.jpg, about.jpg, dashboard-banner.jpg, auth-side.jpg, map-fallback.jpg
  services/<slug>.jpg (9), gallery/gallery-1..6.jpg, avatars/avatar-*.jpg
  products/<slug>-1.jpg + -2.jpg, categories/<slug>.jpg, store-hero.jpg, promo-*.jpg (store_images.py)
  logo.svg (wordmark), logo-light.svg (wordmark for white paper), logo-mark.svg (icon),
  favicon.svg, fallback.svg, avatar-fallback.svg

Run:  python scripts/generate_images.py            everything   (needs: pip install pillow numpy)
      python scripts/generate_images.py --store    only logos + store images (faster)
To use real photos instead, just replace a file with your own image of the SAME name.
"""
import math
import random
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "client" / "public" / "assets" / "images"
FONT_DIR = ROOT / "client" / "public" / "assets" / "fonts"
SS = 2  # supersampling factor

BLUE = (47, 140, 255)
GOLD = (201, 169, 97)


# ---------------------------------------------------------------------------
# Basic helpers
# ---------------------------------------------------------------------------
def font(size, weight="Bold"):
    """Montserrat from the system (same family as the website), falling back to the default font."""
    for path in ["/usr/share/fonts/truetype/google-fonts/ofl/montserrat/Montserrat[wght].ttf",
                 "C:/Windows/Fonts/segoeuib.ttf", "C:/Windows/Fonts/arialbd.ttf"]:
        try:
            f = ImageFont.truetype(path, size)
            try:
                f.set_variation_by_name(weight)
            except Exception:
                pass
            return f
        except OSError:
            continue
    return ImageFont.load_default()


def to_img(arr):
    return Image.fromarray(np.clip(arr, 0, 255).astype("uint8"), "RGB")


def vertical_gradient(w, h, stops):
    y = np.linspace(0, 1, h)
    out = np.zeros((h, w, 3), dtype=np.float32)
    for c in range(3):
        col = np.interp(y, [s[0] for s in stops], [s[1][c] for s in stops])
        out[..., c] = col[:, None]
    return out


def add_glow(arr, cx, cy, rx, ry, color, strength):
    """Additive soft light (Gaussian ellipse) - used for studio lights and colour glows."""
    h, w, _ = arr.shape
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    g = np.exp(-(((xx - cx) / rx) ** 2 + ((yy - cy) / ry) ** 2))
    for c in range(3):
        arr[..., c] += g * color[c] * strength
    return arr


def vignette(arr, strength=0.55):
    h, w, _ = arr.shape
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    d = np.sqrt(((xx - w / 2) / (w / 2)) ** 2 + ((yy - h / 2) / (h / 2)) ** 2)
    arr *= (1 - strength * np.clip(d - 0.35, 0, 1.2) / 1.2)[..., None]
    return arr


def add_noise(arr, amount=3.0, seed=1):
    rng = np.random.default_rng(seed)
    arr += rng.normal(0, amount, arr.shape[:2])[..., None]
    return arr


def studio_background(w, h, floor_y, blue_at=(0.7, 0.45), gold_at=(0.85, 0.2), seed=1):
    arr = vertical_gradient(w, h, [(0, (9, 11, 15)), (floor_y / h, (14, 17, 23)), (min(1, floor_y / h + 0.02), (10, 12, 16)), (1, (4, 5, 7))])
    add_glow(arr, w * blue_at[0], h * blue_at[1], w * 0.35, h * 0.35, BLUE, 0.35)
    add_glow(arr, w * gold_at[0], h * gold_at[1], w * 0.22, h * 0.25, GOLD, 0.22)
    add_glow(arr, w * 0.55, floor_y, w * 0.6, h * 0.025, (150, 190, 255), 0.25)  # horizon light line
    # Soft-box studio lights near the ceiling
    add_glow(arr, w * 0.5, h * 0.02, w * 0.28, h * 0.035, (220, 232, 255), 0.55)
    return add_noise(vignette(arr), 2.2, seed)


def catmull_rom(points, samples=14):
    """Smooth curve through the given points (open spline)."""
    pts = [points[0]] + list(points) + [points[-1]]
    out = []
    for i in range(1, len(pts) - 2):
        p0, p1, p2, p3 = pts[i - 1], pts[i], pts[i + 1], pts[i + 2]
        for t in np.linspace(0, 1, samples, endpoint=False):
            t2, t3 = t * t, t * t * t
            out.append(tuple(0.5 * ((2 * p1[k]) + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2
                                    + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3) for k in range(2)))
    out.append(points[-1])
    return out


def mask_from_polygon(size, poly):
    m = Image.new("L", size, 0)
    ImageDraw.Draw(m).polygon(poly, fill=255)
    return m


def gradient_fill(size, mask, top_color, bottom_color, y0, y1):
    """RGBA image of a vertical gradient between y0 and y1, cut out by mask."""
    w, h = size
    y = np.clip((np.arange(h) - y0) / max(1, (y1 - y0)), 0, 1)
    arr = np.zeros((h, w, 3), dtype=np.float32)
    for c in range(3):
        arr[..., c] = (top_color[c] + (bottom_color[c] - top_color[c]) * y)[:, None]
    img = to_img(arr).convert("RGBA")
    img.putalpha(mask)
    return img


def sparkle(layer, x, y, size, color=(255, 255, 255), glow=True):
    d = ImageDraw.Draw(layer)
    s = size
    for (dx, dy, l, wdt) in [(1, 0, s, s * 0.09), (0, 1, s, s * 0.09), (0.7, 0.7, s * 0.45, s * 0.06), (0.7, -0.7, s * 0.45, s * 0.06)]:
        px, py = -dy, dx
        d.polygon([(x - dx * l, y - dy * l), (x + px * wdt, y + py * wdt), (x + dx * l, y + dy * l), (x - px * wdt, y - py * wdt)], fill=color + (235,))
    if glow:
        g = Image.new("RGBA", layer.size, (0, 0, 0, 0))
        ImageDraw.Draw(g).ellipse([x - s * 0.5, y - s * 0.5, x + s * 0.5, y + s * 0.5], fill=color + (120,))
        layer.alpha_composite(g.filter(ImageFilter.GaussianBlur(s * 0.35)))


def droplet(d, x, y, r, base=(200, 220, 255)):
    """A single glossy water bead: dark rim, transparent body, bright highlight."""
    d.ellipse([x - r, y - r, x + r, y + r], fill=(10, 14, 22, 120))
    d.ellipse([x - r * 0.86, y - r * 0.86, x + r * 0.86, y + r * 0.86], fill=base + (60,))
    d.ellipse([x - r * 0.55, y - r * 0.62, x - r * 0.05, y - r * 0.12], fill=(255, 255, 255, 200))
    d.ellipse([x + r * 0.2, y + r * 0.3, x + r * 0.55, y + r * 0.6], fill=(255, 255, 255, 70))


def finish(arr_or_img, size, path, quality=88):
    img = arr_or_img if isinstance(arr_or_img, Image.Image) else to_img(arr_or_img)
    img = img.convert("RGB").resize(size, Image.LANCZOS)
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, "JPEG", quality=quality, optimize=True, progressive=True)
    print("  wrote", path.relative_to(ROOT) if path.is_relative_to(ROOT) else path)


# ---------------------------------------------------------------------------
# Cars
# ---------------------------------------------------------------------------
CAR_STYLES = {
    # Profiles use real-world proportions: x = 0 (rear) .. 1 (front), y = height as a fraction of length.
    "sedan": dict(upper=[(0.01, 0.06), (0.0, 0.11), (0.005, 0.17), (0.03, 0.20), (0.14, 0.21), (0.24, 0.215), (0.33, 0.275), (0.45, 0.295), (0.55, 0.29), (0.60, 0.275), (0.70, 0.205), (0.85, 0.185), (0.96, 0.165), (0.995, 0.13), (1.0, 0.09), (0.985, 0.055)],
                  glass=[(0.255, 0.214), (0.33, 0.265), (0.45, 0.282), (0.55, 0.278), (0.60, 0.263), (0.685, 0.21)], belt=0.212, sill=0.06, wheels=(0.18, 0.80), r=0.068),
    "coupe": dict(upper=[(0.012, 0.055), (0.0, 0.10), (0.008, 0.16), (0.05, 0.185), (0.17, 0.195), (0.29, 0.215), (0.38, 0.25), (0.48, 0.258), (0.56, 0.248), (0.65, 0.20), (0.74, 0.172), (0.88, 0.158), (0.965, 0.14), (1.0, 0.095), (0.988, 0.05)],
                  glass=[(0.30, 0.193), (0.38, 0.24), (0.48, 0.247), (0.555, 0.238), (0.63, 0.196)], belt=0.19, sill=0.055, wheels=(0.18, 0.80), r=0.07),
    "suv": dict(upper=[(0.01, 0.09), (0.0, 0.15), (0.006, 0.23), (0.02, 0.30), (0.05, 0.345), (0.25, 0.36), (0.55, 0.357), (0.63, 0.34), (0.72, 0.262), (0.82, 0.245), (0.94, 0.232), (0.99, 0.20), (1.0, 0.14), (0.99, 0.09)],
                glass=[(0.045, 0.262), (0.07, 0.33), (0.25, 0.345), (0.55, 0.342), (0.615, 0.325), (0.70, 0.262)], belt=0.258, sill=0.09, wheels=(0.18, 0.80), r=0.08),
    "hatch": dict(upper=[(0.02, 0.07), (0.0, 0.13), (0.012, 0.22), (0.04, 0.29), (0.09, 0.34), (0.40, 0.355), (0.52, 0.345), (0.63, 0.26), (0.72, 0.235), (0.87, 0.215), (0.97, 0.185), (1.0, 0.13), (0.985, 0.07)],
                  glass=[(0.055, 0.252), (0.10, 0.325), (0.40, 0.34), (0.51, 0.332), (0.61, 0.255)], belt=0.25, sill=0.07, wheels=(0.17, 0.81), r=0.078),
}


def draw_wheel(layer, cx, cy, r, rim=(205, 210, 220), caliper=GOLD, spokes=5):
    d = ImageDraw.Draw(layer)
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(10, 10, 12, 255))
    d.ellipse([cx - r * 0.93, cy - r * 0.93, cx + r * 0.93, cy + r * 0.93], outline=(42, 44, 50, 255), width=max(2, int(r * 0.05)))
    rr = r * 0.68
    d.ellipse([cx - rr, cy - rr, cx + rr, cy + rr], fill=(26, 28, 33, 255))
    # brake caliper peeking through the spokes
    d.pieslice([cx - rr * 0.82, cy - rr * 0.82, cx + rr * 0.82, cy + rr * 0.82], 200, 260, fill=caliper + (255,))
    d.ellipse([cx - rr * 0.55, cy - rr * 0.55, cx + rr * 0.55, cy + rr * 0.55], fill=(55, 58, 66, 255))
    for i in range(spokes):
        a = i * 2 * math.pi / spokes - math.pi / 2
        for off in (-0.13, 0.13):
            b = a + off
            tip = (cx + math.cos(b) * rr * 0.97, cy + math.sin(b) * rr * 0.97)
            base1 = (cx + math.cos(a + 0.42) * rr * 0.2, cy + math.sin(a + 0.42) * rr * 0.2)
            base2 = (cx + math.cos(a - 0.42) * rr * 0.2, cy + math.sin(a - 0.42) * rr * 0.2)
            d.polygon([base1, tip, base2], fill=rim + (255,))
    d.ellipse([cx - rr, cy - rr, cx + rr, cy + rr], outline=tuple(min(255, c + 25) for c in rim) + (255,), width=max(2, int(r * 0.06)))
    d.ellipse([cx - rr * 0.2, cy - rr * 0.2, cx + rr * 0.2, cy + rr * 0.2], fill=(30, 32, 38, 255), outline=rim + (255,), width=max(1, int(r * 0.03)))


def draw_car(canvas_size, x0, ground, length, style="sedan", color=(20, 22, 28), rim_light=BLUE, rim2=GOLD,
             wheel_rim=(205, 210, 220), caliper=GOLD, headlight=(220, 235, 255)):
    """Returns (car_layer RGBA, body_mask L) for a stylised luxury car side profile."""
    st = CAR_STYLES[style]
    W, H = canvas_size
    P = lambda x, y: (x0 + x * length, ground - y * length)  # noqa: E731
    r = st["r"]
    sill = st["sill"]

    upper = [P(*p) for p in catmull_rom(st["upper"], 16)]
    lower = []
    R = r * 1.24
    for wx in (st["wheels"][1], st["wheels"][0]):          # front arch first (path runs front -> rear)
        dy = sill - r
        dx = math.sqrt(max(R * R - dy * dy, 0))
        lower.append(P(wx + dx, sill))
        start = math.atan2(dy, dx)
        for t in np.linspace(start, math.pi - start, 28):
            lower.append(P(wx + math.cos(t) * R, r + math.sin(t) * R))
        lower.append(P(wx - dx, sill))
    lower = [P(0.95, sill + 0.005)] + lower + [P(0.04, sill + 0.005)]
    body_poly = upper + lower
    body_mask = mask_from_polygon(canvas_size, body_poly)

    top_y = min(p[1] for p in upper)
    car = Image.new("RGBA", canvas_size, (0, 0, 0, 0))
    light = tuple(min(255, int(c * 1.9 + 38)) for c in color)
    dark = tuple(int(c * 0.35) for c in color)
    car.alpha_composite(gradient_fill(canvas_size, body_mask, light, dark, top_y, ground - sill * length))

    # Glossy reflection band just below the shoulder line
    band = Image.new("RGBA", canvas_size, (0, 0, 0, 0))
    bd = ImageDraw.Draw(band)
    belt_y = ground - st["belt"] * length
    bd.rectangle([x0, belt_y + length * 0.008, x0 + length, belt_y + length * 0.03], fill=(255, 255, 255, 60))
    band = band.filter(ImageFilter.GaussianBlur(length * 0.012))
    band.putalpha(Image.composite(band.getchannel("A"), Image.new("L", canvas_size, 0), body_mask))
    car.alpha_composite(band)

    # Rim lights tracing the roof line (blue) and the rear (gold)
    rim_layer = Image.new("RGBA", canvas_size, (0, 0, 0, 0))
    rd = ImageDraw.Draw(rim_layer)
    rd.line(upper[len(upper) // 5: -len(upper) // 8], fill=rim_light + (255,), width=max(3, int(length * 0.006)), joint="curve")
    rd.line(upper[: len(upper) // 4], fill=rim2 + (230,), width=max(3, int(length * 0.005)), joint="curve")
    glow = rim_layer.filter(ImageFilter.GaussianBlur(length * 0.006))
    inner = Image.composite(glow.getchannel("A"), Image.new("L", canvas_size, 0), body_mask)
    glow.putalpha(inner)
    car.alpha_composite(glow)
    car.alpha_composite(rim_layer.filter(ImageFilter.GaussianBlur(length * 0.0015)))

    # Glass
    gpts = [P(*p) for p in catmull_rom(st["glass"], 12)]
    gpts += [P(st["glass"][-1][0] - 0.01, st["belt"]), P(st["glass"][0][0] + 0.01, st["belt"])]
    gmask = mask_from_polygon(canvas_size, gpts)
    gy0 = min(p[1] for p in gpts)
    car.alpha_composite(gradient_fill(canvas_size, gmask, (40, 48, 62), (6, 7, 10), gy0, belt_y))
    streak = Image.new("RGBA", canvas_size, (0, 0, 0, 0))
    gx = [p[0] for p in gpts]
    gxs, gxe = min(gx), max(gx)
    sx = gxs + (gxe - gxs) * 0.55
    ImageDraw.Draw(streak).polygon([(sx, gy0), (sx + length * 0.05, gy0), (sx - length * 0.03, belt_y), (sx - length * 0.07, belt_y)], fill=(200, 220, 255, 55))
    streak.putalpha(Image.composite(streak.getchannel("A"), Image.new("L", canvas_size, 0), gmask))
    car.alpha_composite(streak)
    # B-pillar
    bx = st["glass"][0][0] + (st["glass"][-1][0] - st["glass"][0][0]) * 0.52
    d = ImageDraw.Draw(car)
    d.polygon([P(bx - 0.008, st["belt"]), P(bx + 0.008, st["belt"]), P(bx + 0.002, st["glass"][2][1] - 0.01), P(bx - 0.014, st["glass"][2][1] - 0.01)], fill=dark + (255,))

    # Door seams, handles, character line
    for dx in (bx - 0.005, st["glass"][-1][0] + 0.02):
        d.line([P(dx, st["belt"] - 0.01), P(dx - 0.006, sill + 0.01)], fill=dark + (200,), width=max(1, int(length * 0.0022)))
    for hx in (bx - 0.11, bx + 0.05):
        d.rounded_rectangle([*P(hx, st["belt"] - 0.022), *P(hx + 0.04, st["belt"] - 0.03)], radius=length * 0.004, fill=light + (200,))
    cl = [P(x, st["belt"] - 0.045 - 0.006 * math.sin(x * math.pi)) for x in np.linspace(0.06, 0.94, 40)]
    d.line(cl, fill=(255, 255, 255, 70), width=max(1, int(length * 0.002)))

    # Lights
    hl = Image.new("RGBA", canvas_size, (0, 0, 0, 0))
    hd = ImageDraw.Draw(hl)
    fy = st["upper"][-4][1] - 0.022
    hd.polygon([P(0.90, fy + 0.008), P(0.975, fy + 0.004), P(0.985, fy - 0.012), P(0.905, fy - 0.004)], fill=headlight + (255,))
    ty = st["upper"][3][1] - 0.025
    hd.polygon([P(0.004, ty + 0.008), P(0.07, ty + 0.01), P(0.07, ty - 0.002), P(0.006, ty - 0.006)], fill=(255, 40, 50, 255))
    car.alpha_composite(hl.filter(ImageFilter.GaussianBlur(length * 0.012)))
    car.alpha_composite(hl.filter(ImageFilter.GaussianBlur(length * 0.003)))
    car.alpha_composite(hl)

    for wx in st["wheels"]:
        cx, cy = P(wx, r)
        draw_wheel(car, cx, cy, r * length, rim=wheel_rim, caliper=caliper)
    return car, body_mask


def place_car(base_img, car, x0, ground, length, reflection=0.2):
    """Adds contact shadow and a glossy floor reflection, then the car itself."""
    W, H = base_img.size
    shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(shadow).ellipse([x0 + length * 0.02, ground - length * 0.025, x0 + length * 0.98, ground + length * 0.03], fill=(0, 0, 0, 230))
    base_img.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(length * 0.018)))
    if reflection:
        top = int(ground - length * 0.7)
        crop = car.crop((0, max(0, top), W, int(ground)))
        refl = crop.transpose(Image.FLIP_TOP_BOTTOM)
        h = refl.size[1]
        fade = np.linspace(reflection, 0, h)[:, None] * np.ones((1, W))
        alpha = (np.array(refl.getchannel("A"), dtype=np.float32) * fade).astype("uint8")
        refl.putalpha(Image.fromarray(alpha))
        layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        layer.alpha_composite(refl.filter(ImageFilter.GaussianBlur(max(3, length * 0.005))), (0, int(ground)))
        base_img.alpha_composite(layer)
    base_img.alpha_composite(car)


def add_foam(layer, body_mask, rng, density=1.0, length=1000):
    """Snow-foam blobs clinging to the upper body of the car."""
    W, H = layer.size
    foam = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    fd = ImageDraw.Draw(foam)
    bbox = body_mask.getbbox()
    mask_np = np.array(body_mask)
    for _ in range(int(2600 * density)):
        x = rng.uniform(bbox[0], bbox[2])
        y = rng.uniform(bbox[1], bbox[1] + (bbox[3] - bbox[1]) * 0.78)
        if mask_np[int(min(y, H - 1)), int(min(x, W - 1))] == 0:
            continue
        rad = rng.uniform(0.006, 0.02) * length
        shade = rng.randint(205, 250)
        fd.ellipse([x - rad, y - rad, x + rad, y + rad], fill=(shade, shade + 3 if shade < 252 else 255, 255, 240))
        fd.ellipse([x - rad * 0.5, y - rad * 0.6, x, y - rad * 0.1], fill=(255, 255, 255, 255))
    for _ in range(int(60 * density)):  # drips
        x = rng.uniform(bbox[0] + 20, bbox[2] - 20)
        y = rng.uniform(bbox[1] + (bbox[3] - bbox[1]) * 0.4, bbox[3] - (bbox[3] - bbox[1]) * 0.2)
        if mask_np[int(y), int(x)] == 0:
            continue
        l = rng.uniform(0.02, 0.06) * length
        fd.rounded_rectangle([x - 3, y, x + 3, y + l], radius=3, fill=(235, 242, 255, 200))
    foam = foam.filter(ImageFilter.GaussianBlur(1.2))
    clip = Image.composite(foam.getchannel("A"), Image.new("L", (W, H), 0), body_mask.filter(ImageFilter.MaxFilter(9)))
    foam.putalpha(clip)
    shadow = foam.copy()
    shadow = Image.new("RGBA", (W, H), (70, 90, 120, 0))
    shadow.putalpha(clip.filter(ImageFilter.GaussianBlur(6)).point(lambda v: int(v * 0.4)))
    layer.alpha_composite(shadow, (4, 6))
    layer.alpha_composite(foam)


def draw_motorcycle(layer, x0, ground, L, body=(230, 110, 30), frame=(25, 26, 30), chrome=(200, 205, 215)):
    d = ImageDraw.Draw(layer)
    P = lambda x, y: (x0 + x * L, ground - y * L)  # noqa: E731
    r = 0.17
    for wx in (0.17, 0.83):
        cx, cy = P(wx, r)
        R = r * L
        d.ellipse([cx - R, cy - R, cx + R, cy + R], fill=(10, 10, 12, 255))
        d.ellipse([cx - R * 0.78, cy - R * 0.78, cx + R * 0.78, cy + R * 0.78], fill=(32, 34, 40, 255))
        for i in range(10):
            a = i * math.pi / 5
            d.line([(cx, cy), (cx + math.cos(a) * R * 0.76, cy + math.sin(a) * R * 0.76)], fill=chrome + (255,), width=max(2, int(L * 0.006)))
        d.ellipse([cx - R * 0.42, cy - R * 0.42, cx + R * 0.42, cy + R * 0.42], outline=GOLD + (255,), width=max(2, int(L * 0.01)))
        d.ellipse([cx - R * 0.1, cy - R * 0.1, cx + R * 0.1, cy + R * 0.1], fill=chrome + (255,))
    # swing arm, frame, forks
    d.line([P(0.17, r), P(0.45, 0.32)], fill=frame + (255,), width=int(L * 0.03))
    d.line([P(0.83, r), P(0.68, 0.70)], fill=chrome + (255,), width=int(L * 0.022))
    d.line([P(0.45, 0.32), P(0.66, 0.66)], fill=frame + (255,), width=int(L * 0.03))
    # engine
    d.rounded_rectangle([*P(0.38, 0.47), *P(0.60, 0.24)], radius=L * 0.02, fill=(70, 74, 82, 255))
    for i in range(5):
        y = 0.44 - i * 0.04
        d.line([P(0.40, y), P(0.58, y)], fill=(120, 126, 136, 255), width=max(2, int(L * 0.006)))
    # exhaust
    d.line([P(0.45, 0.26), P(0.26, 0.24), P(0.10, 0.30)], fill=chrome + (255,), width=int(L * 0.03), joint="curve")
    # tank, seat, tail
    tank = catmull_rom([(0.40, 0.56), (0.45, 0.66), (0.56, 0.70), (0.66, 0.67), (0.66, 0.56), (0.52, 0.52), (0.40, 0.56)], 10)
    d.polygon([P(*p) for p in tank], fill=body + (255,))
    d.polygon([P(0.47, 0.67), P(0.56, 0.695), P(0.63, 0.675), P(0.56, 0.66)], fill=tuple(min(255, c + 70) for c in body) + (255,))
    d.polygon([P(0.22, 0.61), P(0.42, 0.60), P(0.42, 0.565), P(0.25, 0.575)], fill=(18, 18, 20, 255))
    d.polygon([P(0.08, 0.66), P(0.24, 0.63), P(0.25, 0.575), P(0.12, 0.59)], fill=body + (255,))
    # headlight, handlebar
    d.polygon([P(0.66, 0.72), P(0.76, 0.70), P(0.78, 0.60), P(0.68, 0.58)], fill=frame + (255,))
    hl = Image.new("RGBA", layer.size, (0, 0, 0, 0))
    ImageDraw.Draw(hl).ellipse([*P(0.745, 0.69), *P(0.79, 0.62)], fill=(220, 235, 255, 255))
    layer.alpha_composite(hl.filter(ImageFilter.GaussianBlur(L * 0.02)))
    layer.alpha_composite(hl)
    d.line([P(0.62, 0.80), P(0.70, 0.76)], fill=frame + (255,), width=int(L * 0.014))


# ---------------------------------------------------------------------------
# Scenes
# ---------------------------------------------------------------------------
def scene_car(size, style, color, out, car_x=0.11, car_len=0.78, ground=0.72, blue_at=(0.5, 0.42), gold_at=(0.85, 0.18),
              extras=None, seed=1, rim=BLUE, rim2=GOLD, wheel_rim=(205, 210, 220), caliper=GOLD):
    W, H = size[0] * SS, size[1] * SS
    rng = random.Random(seed)
    base = to_img(studio_background(W, H, H * ground, blue_at, gold_at, seed)).convert("RGBA")
    length = W * car_len
    car, mask = draw_car((W, H), W * car_x, H * ground, length, style, color, rim, rim2, wheel_rim, caliper)
    if extras and "foam" in extras:
        add_foam(car, mask, rng, extras.get("foam", 1.0), length)
    place_car(base, car, W * car_x, H * ground, length)
    fx = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    fd = ImageDraw.Draw(fx)
    if extras and "spray" in extras:
        for _ in range(26):  # water jets from the left
            y = rng.uniform(H * 0.25, H * 0.7)
            fd.line([(0, y), (W * rng.uniform(0.25, 0.45), y + rng.uniform(-40, 80))], fill=(190, 215, 255, rng.randint(25, 60)), width=rng.randint(2, 6))
        fx = fx.filter(ImageFilter.GaussianBlur(3))
        fd = ImageDraw.Draw(fx)
    if extras and "drops" in extras:
        for _ in range(int(extras["drops"])):
            droplet(fd, rng.uniform(0, W), rng.uniform(0, H * ground), rng.uniform(3, 11) * SS)
    if extras and "bubbles" in extras:
        for _ in range(60):
            x, y, rad = rng.uniform(0, W), rng.uniform(0, H * 0.75), rng.uniform(6, 26) * SS
            fd.ellipse([x - rad, y - rad, x + rad, y + rad], outline=(220, 235, 255, 120), width=2)
            fd.ellipse([x - rad * 0.5, y - rad * 0.6, x - rad * 0.1, y - rad * 0.25], fill=(255, 255, 255, 140))
    base.alpha_composite(fx)
    if extras and "sparkles" in extras:
        sp = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        for _ in range(int(extras["sparkles"])):
            sparkle(sp, rng.uniform(W * car_x, W * (car_x + car_len)), rng.uniform(H * ground - length * 0.34, H * ground - length * 0.07), rng.uniform(14, 34) * SS, rng.choice([(255, 255, 255), (255, 236, 190)]))
        base.alpha_composite(sp)
    finish(base, size, out)


def scene_bike(size, out, body=(230, 110, 30), seed=3, drops=40):
    W, H = size[0] * SS, size[1] * SS
    rng = random.Random(seed)
    ground = H * 0.82
    base = to_img(studio_background(W, H, ground, (0.45, 0.4), (0.8, 0.2), seed)).convert("RGBA")
    L = W * 0.62
    bike = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    draw_motorcycle(bike, W * 0.19, ground, L, body)
    place_car(base, bike, W * 0.19, ground, L, reflection=0.18)
    fx = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    fd = ImageDraw.Draw(fx)
    for _ in range(drops):
        droplet(fd, rng.uniform(W * 0.15, W * 0.85), rng.uniform(H * 0.15, ground - 20), rng.uniform(3, 9) * SS)
    base.alpha_composite(fx)
    sp = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    for _ in range(5):
        sparkle(sp, rng.uniform(W * 0.3, W * 0.7), rng.uniform(H * 0.25, H * 0.5), rng.uniform(16, 30) * SS)
    base.alpha_composite(sp)
    finish(base, size, out)


def paint_surface(W, H, color, seed):
    """Close-up of a curved, glossy car panel with soft reflections."""
    arr = vertical_gradient(W, H, [(0, tuple(c * 0.25 for c in color)), (0.35, tuple(min(255, c * 1.3 + 30) for c in color)), (0.55, color), (1, tuple(c * 0.2 for c in color))])
    add_glow(arr, W * 0.3, H * 0.32, W * 0.45, H * 0.06, (255, 255, 255), 0.35)
    add_glow(arr, W * 0.8, H * 0.25, W * 0.2, H * 0.2, BLUE, 0.3)
    add_glow(arr, W * 0.1, H * 0.8, W * 0.3, H * 0.25, GOLD, 0.18)
    return add_noise(vignette(arr, 0.45), 1.6, seed)


def scene_beads(size, out, color=(14, 18, 28), seed=5, hexes=True):
    W, H = size[0] * SS, size[1] * SS
    rng = random.Random(seed)
    base = to_img(paint_surface(W, H, color, seed)).convert("RGBA")
    if hexes:
        hx = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        hd = ImageDraw.Draw(hx)
        s = 46 * SS
        for row in range(int(H / (s * 1.5)) + 2):
            for col in range(int(W / (s * 1.732)) + 2):
                cx = col * s * 1.732 + (row % 2) * s * 0.866
                cy = row * s * 1.5
                pts = [(cx + s * math.cos(math.radians(60 * k + 30)), cy + s * math.sin(math.radians(60 * k + 30))) for k in range(6)]
                a = int(70 * max(0, 1 - abs(cx - W * 0.62) / (W * 0.5)))
                hd.polygon(pts, outline=BLUE + (a,))
        base.alpha_composite(hx.filter(ImageFilter.GaussianBlur(0.8)))
    beads = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    bd = ImageDraw.Draw(beads)
    for _ in range(420):
        y = rng.uniform(0, H)
        r = rng.uniform(4, 26) * SS * (0.45 + y / H)
        droplet(bd, rng.uniform(0, W), y, r)
    base.alpha_composite(beads)
    sp = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    for _ in range(4):
        sparkle(sp, rng.uniform(W * 0.2, W * 0.9), rng.uniform(H * 0.15, H * 0.5), rng.uniform(20, 40) * SS)
    base.alpha_composite(sp)
    finish(base, size, out)


def scene_polish(size, out, color=(150, 18, 26), seed=7):
    W, H = size[0] * SS, size[1] * SS
    rng = random.Random(seed)
    base = to_img(paint_surface(W, H, color, seed)).convert("RGBA")
    cx, cy, R = W * 0.6, H * 0.55, H * 0.26
    # swirl-free "corrected" halo around the pad
    halo = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    hd = ImageDraw.Draw(halo)
    for i in range(14):
        rr = R * (1.25 + i * 0.12)
        hd.arc([cx - rr, cy - rr * 0.55, cx + rr, cy + rr * 0.55], 190 + i * 7, 330 + i * 5, fill=(255, 255, 255, 40), width=3 * SS)
    base.alpha_composite(halo.filter(ImageFilter.GaussianBlur(2)))
    shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(shadow).ellipse([cx - R * 1.05, cy - R * 0.45, cx + R * 1.1, cy + R * 0.7], fill=(0, 0, 0, 180))
    base.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(30)))
    m = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(m)
    # polisher pad (gold foam) seen in perspective
    d.ellipse([cx - R, cy - R * 0.42, cx + R, cy + R * 0.42], fill=(170, 130, 60, 255))
    d.ellipse([cx - R * 0.96, cy - R * 0.5, cx + R * 0.96, cy + R * 0.32], fill=(225, 180, 95, 255))
    for k in range(8):
        a = k * math.pi / 4
        d.line([(cx, cy - R * 0.09), (cx + math.cos(a) * R * 0.9, cy - R * 0.09 + math.sin(a) * R * 0.38)], fill=(200, 155, 75, 255), width=4 * SS)
    # machine body
    d.rounded_rectangle([cx - R * 0.42, cy - R * 1.4, cx + R * 0.42, cy - R * 0.35], radius=R * 0.18, fill=(32, 35, 42, 255))
    d.rounded_rectangle([cx - R * 0.3, cy - R * 1.32, cx + R * 0.05, cy - R * 0.45], radius=R * 0.12, fill=(60, 66, 78, 255))
    d.rounded_rectangle([cx - R * 1.6, cy - R * 1.25, cx - R * 0.35, cy - R * 0.98], radius=R * 0.12, fill=(28, 30, 36, 255))
    d.rounded_rectangle([cx + R * 0.3, cy - R * 1.2, cx + R * 1.2, cy - R * 1.0], radius=R * 0.1, fill=(28, 30, 36, 255))
    d.rectangle([cx - R * 0.36, cy - R * 0.8, cx + R * 0.36, cy - R * 0.72], fill=BLUE + (255,))
    base.alpha_composite(m)
    sp = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    for _ in range(6):
        sparkle(sp, rng.uniform(W * 0.05, W * 0.45), rng.uniform(H * 0.2, H * 0.6), rng.uniform(18, 36) * SS)
    base.alpha_composite(sp)
    finish(base, size, out)


def scene_interior(size, out, accent=BLUE, seed=9):
    W, H = size[0] * SS, size[1] * SS
    arr = vertical_gradient(W, H, [(0, (40, 50, 66)), (0.3, (14, 17, 23)), (1, (5, 6, 8))])
    add_glow(arr, W * 0.5, H * 0.05, W * 0.6, H * 0.2, (180, 200, 230), 0.5)  # windshield light
    base = to_img(add_noise(vignette(arr, 0.5), 2, seed)).convert("RGBA")
    d = ImageDraw.Draw(base)
    # dashboard
    dash = catmull_rom([(0, 0.38), (0.2, 0.33), (0.5, 0.31), (0.8, 0.33), (1, 0.38)], 20)
    d.polygon([(x * W, y * H) for x, y in dash] + [(W, H * 0.6), (0, H * 0.6)], fill=(20, 22, 27, 255))
    amb = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(amb).line([(x * W, y * H + 18 * SS) for x, y in dash], fill=accent + (255,), width=4 * SS)
    base.alpha_composite(amb.filter(ImageFilter.GaussianBlur(6 * SS)))
    base.alpha_composite(amb)
    d = ImageDraw.Draw(base)
    # centre screen
    d.rounded_rectangle([W * 0.43, H * 0.36, W * 0.6, H * 0.5], radius=10 * SS, fill=(12, 26, 48, 255), outline=(60, 90, 140, 255), width=2 * SS)
    for i in range(4):
        d.rounded_rectangle([W * 0.45, H * (0.38 + i * 0.028), W * (0.5 + i * 0.02), H * (0.392 + i * 0.028)], radius=4, fill=(80, 150, 255, 200))
    # steering wheel
    cx, cy, R = W * 0.27, H * 0.56, H * 0.24
    d.ellipse([cx - R, cy - R, cx + R, cy + R], outline=(30, 31, 36, 255), width=int(R * 0.16))
    d.arc([cx - R, cy - R, cx + R, cy + R], 200, 330, fill=(60, 62, 70, 255), width=int(R * 0.05))
    for a in (200, 340, 90):
        rad = math.radians(a)
        d.line([(cx, cy), (cx + math.cos(rad) * R * 0.92, cy + math.sin(rad) * R * 0.92)], fill=(36, 38, 44, 255), width=int(R * 0.14))
    d.ellipse([cx - R * 0.28, cy - R * 0.28, cx + R * 0.28, cy + R * 0.28], fill=(40, 42, 50, 255))
    d.ellipse([cx - R * 0.08, cy - R * 0.08, cx + R * 0.08, cy + R * 0.08], fill=GOLD + (255,))
    # seats in the foreground
    for sx, flip in ((0.18, 1), (0.82, -1)):
        x0 = W * sx
        seat = [(x0 - W * 0.17, H), (x0 - W * 0.15, H * 0.72), (x0 - W * 0.1, H * 0.62), (x0 + W * 0.1, H * 0.62), (x0 + W * 0.15, H * 0.72), (x0 + W * 0.17, H)]
        d.polygon(seat, fill=(52, 38, 30, 255))
        for k in range(-3, 4):
            d.line([(x0 + k * W * 0.03, H * 0.66), (x0 + k * W * 0.036, H)], fill=(80, 60, 46, 255), width=2 * SS)
        d.rounded_rectangle([x0 - W * 0.06, H * 0.5, x0 + W * 0.06, H * 0.62], radius=18 * SS, fill=(46, 34, 27, 255))
    hl = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(hl).polygon([(W * 0.62, H * 0.62), (W * 0.7, H * 0.62), (W * 0.72, H), (W * 0.6, H)], fill=(255, 220, 170, 40))
    base.alpha_composite(hl.filter(ImageFilter.GaussianBlur(20)))
    rng = random.Random(seed)
    sp = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    for _ in range(5):
        sparkle(sp, rng.uniform(W * 0.1, W * 0.9), rng.uniform(H * 0.45, H * 0.8), rng.uniform(14, 26) * SS)
    base.alpha_composite(sp)
    finish(base, size, out)


def scene_engine(size, out, seed=11):
    W, H = size[0] * SS, size[1] * SS
    arr = vertical_gradient(W, H, [(0, (12, 14, 18)), (1, (4, 5, 6))])
    add_glow(arr, W * 0.5, H * 0.45, W * 0.45, H * 0.4, BLUE, 0.25)
    add_glow(arr, W * 0.2, H * 0.1, W * 0.25, H * 0.2, GOLD, 0.15)
    base = to_img(add_noise(vignette(arr), 2, seed)).convert("RGBA")
    d = ImageDraw.Draw(base)
    # engine cover with metallic gradient
    cover = mask_from_polygon((W, H), [(W * 0.22, H * 0.28), (W * 0.78, H * 0.28), (W * 0.84, H * 0.72), (W * 0.16, H * 0.72)])
    base.alpha_composite(gradient_fill((W, H), cover, (120, 128, 140), (28, 30, 36), H * 0.28, H * 0.72))
    for i in range(7):
        x = W * (0.3 + i * 0.065)
        d.rounded_rectangle([x, H * 0.36, x + W * 0.035, H * 0.64], radius=10 * SS, fill=(42, 45, 52, 255), outline=(150, 158, 170, 255), width=2 * SS)
    d.rounded_rectangle([W * 0.42, H * 0.42, W * 0.58, H * 0.56], radius=14 * SS, fill=(18, 20, 24, 255))
    f = font(int(42 * SS), "ExtraBold")
    d.text((W * 0.5, H * 0.49), "V8", font=f, anchor="mm", fill=GOLD + (255,))
    # pipes, reservoirs, battery
    d.line([(W * 0.1, H * 0.2), (W * 0.2, H * 0.32), (W * 0.24, H * 0.5)], fill=(60, 64, 72, 255), width=28 * SS, joint="curve")
    d.line([(W * 0.9, H * 0.82), (W * 0.82, H * 0.66)], fill=(60, 64, 72, 255), width=24 * SS)
    for (x, y, c) in ((0.88, 0.25, (240, 200, 60)), (0.1, 0.78, (60, 140, 255)), (0.92, 0.45, (230, 230, 235))):
        d.ellipse([W * x - 34 * SS, H * y - 34 * SS, W * x + 34 * SS, H * y + 34 * SS], fill=(25, 27, 32, 255))
        d.ellipse([W * x - 22 * SS, H * y - 22 * SS, W * x + 22 * SS, H * y + 22 * SS], fill=c + (255,))
    d.rounded_rectangle([W * 0.02, H * 0.3, W * 0.13, H * 0.55], radius=8 * SS, fill=(30, 32, 38, 255))
    rng = random.Random(seed)
    fx = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    fd = ImageDraw.Draw(fx)
    for _ in range(70):
        droplet(fd, rng.uniform(W * 0.15, W * 0.85), rng.uniform(H * 0.25, H * 0.75), rng.uniform(2, 7) * SS)
    base.alpha_composite(fx)
    sp = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    for _ in range(5):
        sparkle(sp, rng.uniform(W * 0.2, W * 0.8), rng.uniform(H * 0.25, H * 0.7), rng.uniform(16, 30) * SS)
    base.alpha_composite(sp)
    finish(base, size, out)


def scene_banner(size, out, seed=13):
    W, H = size[0] * SS, size[1] * SS
    ground = H * 0.86
    arr = studio_background(W, H, ground, (0.75, 0.5), (0.95, 0.2), seed)
    for i in range(5):  # LED ceiling strips
        add_glow(arr, W * (0.15 + i * 0.18), H * 0.04, W * 0.07, H * 0.02, (200, 220, 255), 0.6)
    base = to_img(arr).convert("RGBA")
    for x, style, color, ln in ((0.40, "suv", (210, 214, 222), 0.26), (0.70, "coupe", (16, 40, 96), 0.28)):
        L = W * ln
        car, _ = draw_car((W, H), W * x, ground, L, style, color)
        place_car(base, car, W * x, ground, L, 0.16)
    finish(base, size, out)


def scene_map(size, out, seed=17):
    W, H = size[0] * SS, size[1] * SS
    arr = vertical_gradient(W, H, [(0, (14, 18, 26)), (1, (9, 12, 18))])
    base = to_img(add_noise(arr, 1.5, seed)).convert("RGBA")
    d = ImageDraw.Draw(base)
    rng = random.Random(seed)
    for _ in range(9):  # parks
        x, y = rng.uniform(0, W), rng.uniform(0, H)
        d.rounded_rectangle([x, y, x + rng.uniform(80, 220) * SS, y + rng.uniform(60, 160) * SS], radius=20 * SS, fill=(18, 40, 32, 255))
    d.line([(0, H * 0.82), (W * 0.3, H * 0.74), (W * 0.55, H * 0.86), (W, H * 0.78)], fill=(18, 40, 70, 255), width=36 * SS, joint="curve")  # river
    for i in range(-6, 30):  # minor streets
        x = i * 70 * SS + rng.uniform(-10, 10)
        d.line([(x, 0), (x + 180 * SS, H)], fill=(30, 36, 48, 255), width=3 * SS)
    for j in range(0, 16):
        y = j * 60 * SS + rng.uniform(-8, 8)
        d.line([(0, y), (W, y - 90 * SS)], fill=(30, 36, 48, 255), width=3 * SS)
    d.line([(0, H * 0.62), (W, H * 0.38)], fill=(70, 80, 100, 255), width=14 * SS)   # Baner road
    d.line([(W * 0.62, 0), (W * 0.42, H)], fill=(60, 70, 90, 255), width=10 * SS)    # Balewadi road
    d.line([(W * 0.05, 0), (W * 0.2, H)], fill=(150, 120, 60, 255), width=12 * SS)   # highway
    f = font(20 * SS, "SemiBold")
    for text, x, y in (("BANER", 0.32, 0.3), ("BALEWADI", 0.78, 0.22), ("AUNDH", 0.7, 0.72), ("MUMBAI-BENGALURU HWY", 0.17, 0.12), ("BANER ROAD", 0.24, 0.52)):
        d.text((W * x, H * y), text, font=f, fill=(120, 132, 155, 255), anchor="mm")
    cx, cy = W * 0.52, H * 0.47
    glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(glow).ellipse([cx - 120 * SS, cy - 120 * SS, cx + 120 * SS, cy + 120 * SS], fill=GOLD + (90,))
    base.alpha_composite(glow.filter(ImageFilter.GaussianBlur(50 * SS)))
    d = ImageDraw.Draw(base)
    d.ellipse([cx - 26 * SS, cy - 26 * SS, cx + 26 * SS, cy + 26 * SS], fill=GOLD + (255,), outline=(255, 240, 200, 255), width=4 * SS)
    d.ellipse([cx - 9 * SS, cy - 9 * SS, cx + 9 * SS, cy + 9 * SS], fill=(14, 18, 26, 255))
    finish(base, size, out)


def avatar(initials, colors, out, size=256):
    S = size * SS
    arr = np.zeros((S, S, 3), dtype=np.float32)
    yy, xx = np.mgrid[0:S, 0:S].astype(np.float32)
    t = (xx + yy) / (2 * S)
    for c in range(3):
        arr[..., c] = colors[0][c] * (1 - t) + colors[1][c] * t
    add_glow(arr, S * 0.3, S * 0.25, S * 0.5, S * 0.4, (255, 255, 255), 0.18)
    img = to_img(arr).convert("RGBA")
    d = ImageDraw.Draw(img)
    d.text((S / 2, S / 2 + 4 * SS), initials, font=font(int(S * 0.36), "Bold"), anchor="mm", fill=(255, 255, 255, 240))
    finish(img, (size, size), out, 90)


# ---------------------------------------------------------------------------
# SVG files (logo, favicon, fallbacks)
# ---------------------------------------------------------------------------
# Original CarZone mark: a shield with a car silhouette, a water drop and a shine star.
LOGO_MARK = """<defs>
    <linearGradient id="czb" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7cc0ff"/><stop offset="0.5" stop-color="#2f8cff"/><stop offset="1" stop-color="#123e96"/></linearGradient>
    <linearGradient id="czg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f3dda4"/><stop offset="1" stop-color="#b8923f"/></linearGradient>
  </defs>
  <path d="M32 3 L56 11 V30 C56 45 46 55 32 61 C18 55 8 45 8 30 V11 Z" fill="#0b0d11" stroke="url(#czb)" stroke-width="3.2" stroke-linejoin="round"/>
  <path d="M15 40 L18 33 C19 31 20.5 30 23 29.6 L27 25.8 C28 24.9 29.2 24.5 30.6 24.5 H38 C39.6 24.5 41 25.2 42 26.4 L45 29.8 C47.6 30.3 49 31.8 49.4 34 L50 40 Z" fill="url(#czb)"/>
  <path d="M28.6 29.2 L30.8 26.9 H37.6 L40 29.2 Z" fill="#0b0d11" opacity="0.85"/>
  <circle cx="22.5" cy="41" r="4" fill="#0b0d11" stroke="#cfd6e2" stroke-width="2"/>
  <circle cx="42.5" cy="41" r="4" fill="#0b0d11" stroke="#cfd6e2" stroke-width="2"/>
  <path d="M32 10.5 C32 10.5 27.5 15.8 27.5 18.6 a4.5 4.5 0 0 0 9 0 C36.5 15.8 32 10.5 32 10.5 Z" fill="url(#czg)"/>
  <path d="M46 14 l1.1 2.9 2.9 1.1 -2.9 1.1 -1.1 2.9 -1.1 -2.9 -2.9 -1.1 2.9 -1.1 Z" fill="url(#czg)"/>
  <path d="M20 49 C25 52.5 39 52.5 44 49" fill="none" stroke="url(#czg)" stroke-width="2" stroke-linecap="round"/>"""


def wordmark(text_fill, sub_fill):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 250 64" width="250" height="64">\n  {LOGO_MARK}\n'
            f'  <text x="70" y="36" font-family="Montserrat, Segoe UI, Arial, sans-serif" font-size="27" font-weight="800" letter-spacing="0.5" fill="{text_fill}">Car<tspan fill="#2f8cff">Zone</tspan></text>\n'
            f'  <text x="71" y="53" font-family="Montserrat, Segoe UI, Arial, sans-serif" font-size="9.5" font-weight="600" letter-spacing="2.4" fill="{sub_fill}">WASH · DETAILING · ACCESSORIES</text>\n</svg>\n')


def write_svgs():
    (OUT / "logo-mark.svg").write_text(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">\n  {LOGO_MARK}\n</svg>\n', encoding="utf-8")
    (OUT / "logo.svg").write_text(wordmark("#f3f5f8", "#c9a961"), encoding="utf-8")
    (OUT / "logo-light.svg").write_text(wordmark("#0b0d11", "#8e7135"), encoding="utf-8")
    (OUT / "favicon.svg").write_text(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#0b0d11"/><g transform="translate(3 3) scale(0.906)">{LOGO_MARK}</g></svg>\n', encoding="utf-8")
    (OUT / "fallback.svg").write_text("""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 800" preserveAspectRatio="xMidYMid slice">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#151922"/><stop offset="1" stop-color="#07080b"/></linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.45" r="0.5"><stop offset="0" stop-color="#2f8cff" stop-opacity="0.35"/><stop offset="1" stop-color="#2f8cff" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="1200" height="800" fill="url(#bg)"/><rect width="1200" height="800" fill="url(#glow)"/>
  <g transform="translate(440 300)" fill="none" stroke="#5aa6ff" stroke-width="10" stroke-linecap="round" stroke-linejoin="round" opacity="0.85">
    <path d="M60 170H40a20 20 0 0 1-20-20v-40a20 20 0 0 1 6-14l30-26 22-40a20 20 0 0 1 17-10h130a20 20 0 0 1 17 10l22 40 30 26a20 20 0 0 1 6 14v40a20 20 0 0 1-20 20h-20M100 170h120M60 80h220"/>
    <circle cx="80" cy="170" r="28"/><circle cx="260" cy="170" r="28"/>
  </g>
  <text x="600" y="610" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="34" font-weight="600" letter-spacing="8" fill="#c9a961">CARZONE</text>
</svg>
""", encoding="utf-8")
    (OUT / "avatar-fallback.svg").write_text("""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
  <defs><linearGradient id="a" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1f242e"/><stop offset="1" stop-color="#0b0d11"/></linearGradient></defs>
  <rect width="128" height="128" fill="url(#a)"/>
  <circle cx="64" cy="50" r="22" fill="#5d6574"/><path d="M22 118c4-24 22-36 42-36s38 12 42 36" fill="#5d6574"/>
</svg>
""", encoding="utf-8")
    print("  wrote SVG logo, favicon and fallbacks")


# ---------------------------------------------------------------------------
def main():
    import sys
    OUT.mkdir(parents=True, exist_ok=True)
    write_svgs()
    import store_images  # noqa: E402  (same folder)
    if "--store" in sys.argv:
        store_images.generate(OUT)
        return
    svc = OUT / "services"
    gal = OUT / "gallery"

    print("Hero & page images")
    scene_car((1920, 1080), "coupe", (16, 18, 24), OUT / "hero.jpg", car_x=0.38, car_len=0.60, ground=0.78, blue_at=(0.72, 0.5), gold_at=(0.92, 0.22), extras={"sparkles": 6}, seed=21)
    scene_polish((1200, 900), OUT / "about.jpg", color=(18, 20, 26), seed=22)
    scene_banner((1800, 460), OUT / "dashboard-banner.jpg")
    scene_car((1000, 1400), "sedan", (20, 24, 34), OUT / "auth-side.jpg", car_x=-0.15, car_len=1.25, ground=0.66, blue_at=(0.5, 0.4), gold_at=(0.8, 0.12), extras={"sparkles": 4}, seed=23)
    scene_map((1200, 700), OUT / "map-fallback.jpg")

    print("Service images")
    scene_car((1200, 800), "sedan", (60, 80, 110), svc / "basic-exterior-wash.jpg", extras={"spray": 1, "drops": 60}, seed=31)
    scene_car((1200, 800), "sedan", (14, 15, 20), svc / "premium-wash.jpg", gold_at=(0.3, 0.2), extras={"sparkles": 7}, seed=32, rim=GOLD, rim2=BLUE)
    scene_interior((1200, 800), svc / "interior-cleaning.jpg", seed=33)
    scene_car((1200, 800), "suv", (200, 205, 215), svc / "foam-wash.jpg", car_x=0.1, car_len=0.8, extras={"foam": 1.0, "bubbles": 1}, seed=34)
    scene_beads((1200, 800), svc / "ceramic-coating.jpg", color=(12, 20, 40), seed=35)
    scene_polish((1200, 800), svc / "wax-polishing.jpg", color=(140, 16, 24), seed=36)
    scene_engine((1200, 800), svc / "engine-cleaning.jpg", seed=37)
    scene_car((1200, 800), "coupe", (226, 228, 232), svc / "full-detailing.jpg", extras={"sparkles": 10}, seed=38, wheel_rim=(40, 42, 48), caliper=(220, 40, 50))
    scene_bike((1200, 800), svc / "bike-wash.jpg", seed=39)

    print("Gallery images")
    scene_car((1200, 900), "coupe", (18, 50, 120), gal / "gallery-1.jpg", car_len=0.84, car_x=0.08, ground=0.74, extras={"sparkles": 5}, seed=41)
    scene_car((1200, 900), "sedan", (30, 32, 40), gal / "gallery-2.jpg", car_len=0.84, car_x=0.08, ground=0.74, extras={"foam": 1.2, "bubbles": 1}, seed=42)
    scene_beads((1200, 900), gal / "gallery-3.jpg", color=(8, 9, 12), seed=43, hexes=False)
    scene_car((1200, 900), "suv", (232, 234, 238), gal / "gallery-4.jpg", car_len=0.84, car_x=0.08, ground=0.76, extras={"sparkles": 6}, seed=44, wheel_rim=(45, 47, 52))
    scene_interior((1200, 900), gal / "gallery-5.jpg", accent=GOLD, seed=45)
    scene_bike((1200, 900), gal / "gallery-6.jpg", body=(20, 22, 28), seed=46, drops=20)

    print("Avatars")
    people = [("avatar-admin", "VR", ((201, 169, 97), (110, 84, 34))), ("avatar-1", "RS", ((47, 140, 255), (20, 60, 150))),
              ("avatar-2", "PK", ((216, 90, 120), (110, 30, 70))), ("avatar-3", "AP", ((40, 170, 120), (15, 80, 60))),
              ("avatar-4", "SI", ((150, 110, 255), (70, 40, 160))), ("avatar-5", "KM", ((240, 150, 60), (140, 70, 20))),
              ("avatar-6", "AD", ((60, 190, 220), (20, 90, 120))), ("avatar-7", "IS", ((120, 130, 150), (50, 56, 70)))]
    for name, initials, cols in people:
        avatar(initials, cols, OUT / "avatars" / f"{name}.jpg")

    store_images.generate(OUT)


if __name__ == "__main__":
    main()
