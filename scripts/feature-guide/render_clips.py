"""Render the feature guide's silent demo clips and posters from captured footage.

Usage: python render_clips.py --raw RAW_DIR [--ffmpeg FFMPEG] [--only ID ...] [--sheets DIR]

RAW_DIR holds one folder per scene from capture.mjs: CDP screencast JPEG frames of the real app at 1920x1080
(1280x720 CSS px at device scale 1.5) and frames.json with their timestamps, the capture's marks and every real
mouse event the capture dispatched. For each clip in clips.json this script:

- plays the scene's frames between two marks at real speed (a span can be retimed with "speed", or left out with
  "cut" where a page is still loading), at a fixed frame rate, holding the latest frame while the page is unchanged;
- draws a pointer and a click ring where the recorded mouse was (headless frames contain no cursor);
- optionally crops to a 16:9 region of the page (CSS px) so small text stays readable;
- encodes H.264 (yuv420p, faststart) with no audio stream at all, and a WebP poster of the clip's result.

It then writes guideMedia.json (measured duration, size and bytes of every clip and poster) for the app.
Needs Python 3 with Pillow and NumPy, and ffmpeg built with libx264 and libwebp.
"""
import argparse
import bisect
import json
import os
import re
import subprocess
import sys
from functools import lru_cache
from multiprocessing import Pool

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
MANIFEST = os.path.join(HERE, "clips.json")
OUT_DIR = os.path.join(REPO, "public", "feature-guide")
MEDIA_JSON = os.path.join(REPO, "src", "features", "featureGuide", "guideMedia.json")
FRAME_W, FRAME_H = 1920, 1080

args = None
CFG = {}


# ----------------------------------------------------------------------------- scenes
@lru_cache(maxsize=None)
def scene_meta(name):
    meta = json.load(open(os.path.join(args.raw, name, "frames.json")))
    fr = meta["frames"]
    t0 = fr[0]["t"]
    dpr = meta.get("dpr", 1.5)
    pts = meta.get("pointer", [])
    presses = [p["t"] - t0 for i, p in enumerate(pts) if p["down"] and (i == 0 or not pts[i - 1]["down"])]
    return {
        "times": [f["t"] - t0 for f in fr],
        "paths": [os.path.join(args.raw, name, os.path.basename(f["f"])) for f in fr],
        "marks": {m["label"]: m["t"] - t0 for m in meta["marks"]},
        "presses": presses,
        "dpr": dpr,
        "pointer": [(p["t"] - t0, p["x"] * dpr, p["y"] * dpr, p["down"]) for p in pts],
    }


def stime(scene, e):
    """Scene time from a number, a mark name, p<n> (the n-th mouse press) or 'end', each optionally +/- seconds."""
    if isinstance(e, (int, float)):
        return float(e)
    m = re.match(r"^([A-Za-z_][\w]*)\s*([+-]\s*[\d.]+)?$", e)
    if not m:
        raise ValueError(f"bad time {e!r}")
    name, off = m.group(1), float((m.group(2) or "0").replace(" ", ""))
    sm = scene_meta(scene)
    if name in sm["marks"]:
        return sm["marks"][name] + off
    if re.match(r"^p\d+$", name):
        return sm["presses"][int(name[1:]) - 1] + off
    raise KeyError(f"{scene}: unknown mark {name!r}")


def plan_for(clip):
    """[(out0, out1, scene0, speed)] covering the clip, from its marks and optional retimed spans."""
    sc = clip["scene"]
    a, b = stime(sc, clip["from"]), stime(sc, clip["to"])
    spans = [(stime(sc, x), stime(sc, y), float(v)) for x, y, v in clip.get("speed", [])]
    # A cut leaves a span out (a page still loading, a placeholder flash): the clip goes straight past it.
    spans += [(stime(sc, x), stime(sc, y), None) for x, y in clip.get("cut", [])]
    plan, t, cur = [], 0.0, a
    for x, y, v in sorted(spans):
        x, y = max(x, a), min(y, b)
        if y <= x:
            continue
        if x > cur:
            plan.append((t, t + (x - cur), cur, 1.0))
            t += x - cur
        if v is not None:
            plan.append((t, t + (y - x) / v, x, v))
            t += (y - x) / v
        cur = y
    if b > cur:
        plan.append((t, t + (b - cur), cur, 1.0))
    return plan


def scene_at(plan, u):
    for o0, o1, s0, v in plan:
        if u <= o1:
            return s0 + (max(0.0, u - o0)) * v
    o0, o1, s0, v = plan[-1]
    return s0 + (o1 - o0) * v


# ----------------------------------------------------------------------------- pointer
def pointer_sprite():
    k = 8
    pts = [(3, 2), (3, 24), (9, 18.5), (13, 27), (17, 25.2), (13, 16.8), (21, 16.8)]
    im = Image.new("RGBA", (34 * k, 40 * k), (0, 0, 0, 0))
    sh = Image.new("L", im.size, 0)
    ImageDraw.Draw(sh).polygon([((x + 4) * k, (y + 6) * k) for x, y in pts], fill=90)
    im.putalpha(sh.filter(ImageFilter.GaussianBlur(2.2 * k)))
    im = Image.composite(Image.new("RGBA", im.size, (0, 0, 0, 255)), Image.new("RGBA", im.size, (0, 0, 0, 0)), im.getchannel("A"))
    ImageDraw.Draw(im).polygon([((x + 4) * k, (y + 4) * k) for x, y in pts], fill=(31, 29, 26, 255), outline=(255, 253, 249, 255), width=int(2 * k))
    return im, (7 * k, 6 * k)


def pointer_at(track, ts, st):
    if not track:
        return None
    i = bisect.bisect_right(ts, st) - 1
    if i < 0:
        return track[0][1], track[0][2], False, None
    t, x, y, down = track[i]
    if i + 1 < len(track) and track[i + 1][0] - t < 0.12:
        t2, x2, y2, _ = track[i + 1]
        u = (st - t) / max(1e-6, t2 - t)
        x, y = x + (x2 - x) * u, y + (y2 - y) * u
    since = None
    for j in range(i, -1, -1):
        if track[j][3] and (j == 0 or not track[j - 1][3]):
            since = st - track[j][0]
            break
    return x, y, down, since


def draw_pointer(img, sm, st, crop, out_w):
    p = pointer_at(sm["pointer"], CFG.setdefault(("ts", id(sm)), [q[0] for q in sm["pointer"]]), st)
    if not p:
        return img
    x, y, down, since = p
    x0, y0, cw, ch = crop
    s = out_w / cw
    ox, oy = (x - x0) * s, (y - y0) * s
    W, H = img.size
    edge = min(ox, W - ox - 26 * s, oy, H - oy - 34 * s) / 40
    if edge <= 0:
        return img
    img = img.convert("RGBA")
    css = sm["dpr"] * s
    if since is not None and since < 0.45:
        u = since / 0.45
        r = (0.4 + 0.75 * u) * 17 * css
        ring = Image.new("RGBA", img.size, (0, 0, 0, 0))
        ImageDraw.Draw(ring).ellipse((ox - r, oy - r, ox + r, oy + r), outline=(201, 96, 70, int(235 * (1 - u))), width=max(2, int(2.6 * css)))
        img.alpha_composite(ring)
    spr, (hx, hy) = CFG["sprite"]
    scale = 24 / 26 * css / 8 * (0.86 if down else 1.0)
    small = spr.resize((max(1, int(spr.width * scale)), max(1, int(spr.height * scale))), Image.LANCZOS)
    if edge < 1:
        small.putalpha(small.getchannel("A").point(lambda v: int(v * edge)))
    img.alpha_composite(small, (int(round(ox - hx * scale)), int(round(oy - hy * scale))))
    return img.convert("RGB")


@lru_cache(maxsize=6)
def decode(path):
    return Image.open(path).convert("RGB")


def crop_px(clip, dpr):
    c = clip.get("crop")
    if not c:
        return (0, 0, FRAME_W, FRAME_H)
    x, y, w, h = (round(v * dpr) for v in c)
    if abs(w / h - 16 / 9) > 0.01:
        raise ValueError(f"{clip['id']}: crop must be 16:9, got {c}")
    if x < 0 or y < 0 or x + w > FRAME_W or y + h > FRAME_H:
        raise ValueError(f"{clip['id']}: crop {c} leaves the frame")
    return (x, y, w, h)


def frame(clip, plan, u, out_w, out_h):
    sm = scene_meta(clip["scene"])
    st = scene_at(plan, u)
    i = max(0, bisect.bisect_right(sm["times"], st) - 1)
    crop = crop_px(clip, sm["dpr"])
    x0, y0, cw, ch = crop
    img = decode(sm["paths"][i]).resize((out_w, out_h), Image.LANCZOS, box=(x0, y0, x0 + cw, y0 + ch))
    return draw_pointer(img, sm, st, crop, out_w)


# ----------------------------------------------------------------------------- encode
def render(clip):
    fps, out_w, out_h = CFG["fps"], CFG["width"], CFG["height"]
    plan = plan_for(clip)
    dur = plan[-1][1]
    n = int(round(dur * fps))
    mp4 = os.path.join(OUT_DIR, clip["id"] + ".mp4")
    tmp = mp4 + ".part.mp4"
    enc = CFG["encode"]
    cmd = [args.ffmpeg, "-hide_banner", "-loglevel", "error", "-y",
           "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{out_w}x{out_h}", "-r", str(fps), "-i", "-",
           "-an", "-c:v", "libx264", "-preset", enc["preset"], "-crf", str(clip.get("crf", enc["crf"])), "-tune", enc["tune"],
           "-profile:v", "high", "-pix_fmt", "yuv420p", "-g", str(fps * 2), "-movflags", "+faststart",
           "-map_metadata", "-1", "-metadata", f"title=Verse Together feature guide: {clip['id']}", tmp]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    poster_u = None
    if clip.get("poster"):
        poster_u = local_of(plan, stime(clip["scene"], clip["poster"]))
    poster_img = None
    for k in range(n):
        u = k / fps
        img = frame(clip, plan, u, out_w, out_h)
        proc.stdin.write(np.asarray(img, dtype=np.uint8).tobytes())
        if poster_u is not None and poster_img is None and u >= poster_u:
            poster_img = img
    proc.stdin.close()
    if proc.wait() != 0:
        raise RuntimeError(f"ffmpeg failed for {clip['id']}")
    os.replace(tmp, mp4)
    if poster_img is None:
        poster_img = frame(clip, plan, (n - 1) / fps, out_w, out_h)  # the result the clip ends on
    webp = os.path.join(OUT_DIR, clip["id"] + ".webp")
    pw = CFG["poster"]["width"]
    poster_img.resize((pw, round(pw * out_h / out_w)), Image.LANCZOS).save(webp, "WEBP", quality=CFG["poster"]["quality"], method=6)
    return probe(mp4, webp)


def local_of(plan, st):
    for o0, o1, s0, v in plan:
        if st <= s0 + (o1 - o0) * v + 1e-6:
            return o0 + max(0.0, st - s0) / v
    return plan[-1][1]


def probe(mp4, webp):
    """Measure the encoded file with ffmpeg itself, and refuse anything but a single H.264 yuv420p video stream."""
    out = subprocess.run([args.ffmpeg, "-hide_banner", "-i", mp4], capture_output=True, text=True).stderr
    streams = re.findall(r"Stream #\d+:\d+.*?: (\w+): (.*)", out)
    if len(streams) != 1 or streams[0][0] != "Video" or not streams[0][1].startswith("h264") or "yuv420p" not in streams[0][1]:
        raise RuntimeError(f"{mp4}: expected exactly one H.264 yuv420p video stream and no audio, got {streams}")
    h, m, sec = re.search(r"Duration: (\d+):(\d+):([\d.]+)", out).groups()
    w, ht = map(int, re.search(r", (\d{3,4})x(\d{3,4})", streams[0][1]).groups())
    return {
        "durationSeconds": round(int(h) * 3600 + int(m) * 60 + float(sec), 2),
        "width": w,
        "height": ht,
        "videoBytes": os.path.getsize(mp4),
        "posterBytes": os.path.getsize(webp),
    }


def sheet(clip, path):
    """Review sheet: one frame per second of the rendered clip."""
    plan = plan_for(clip)
    dur = plan[-1][1]
    tiles = [frame(clip, plan, min(dur - 0.04, t), 480, 270) for t in np.arange(0, dur, 1.0)]
    cols = 6
    rows = (len(tiles) + cols - 1) // cols
    sh = Image.new("RGB", (480 * cols, 270 * rows), (30, 30, 30))
    for k, im in enumerate(tiles):
        ImageDraw.Draw(im).text((6, 6), f"{k}s", fill=(200, 40, 40))
        sh.paste(im, ((k % cols) * 480, (k // cols) * 270))
    sh.save(path, quality=80)


def init_worker(a, output):
    global args
    args = a
    CFG.update(output)
    CFG["sprite"] = pointer_sprite()


def render_one(clip):
    return clip["id"], render(clip)


def main():
    global args
    ap = argparse.ArgumentParser()
    ap.add_argument("--raw", required=True)
    ap.add_argument("--ffmpeg", default="ffmpeg")
    ap.add_argument("--only", nargs="*")
    ap.add_argument("--sheets")
    ap.add_argument("--jobs", type=int, default=1)
    args = ap.parse_args()
    man = json.load(open(MANIFEST))
    CFG.update(man["output"])
    CFG["sprite"] = pointer_sprite()
    os.makedirs(OUT_DIR, exist_ok=True)
    media = json.load(open(MEDIA_JSON)) if os.path.exists(MEDIA_JSON) else {}
    ids = [c["id"] for c in man["clips"]]
    if len(ids) != len(set(ids)):
        sys.exit("duplicate clip ids in clips.json")
    todo = [c for c in man["clips"] if not args.only or c["id"] in args.only]
    if args.sheets:
        os.makedirs(args.sheets, exist_ok=True)
        for clip in todo:
            sheet(clip, os.path.join(args.sheets, clip["id"] + ".jpg"))
        return
    with Pool(max(1, args.jobs), initializer=init_worker, initargs=(args, man["output"])) as pool:
        for cid, m in pool.imap_unordered(render_one, todo):
            media[cid] = m
            print(f"{cid:28s} {m['durationSeconds']:6.2f}s {m['videoBytes'] / 1e6:5.2f} MB  poster {m['posterBytes'] / 1e3:5.1f} kB", flush=True)
    media = {k: media[k] for k in ids if k in media}  # manifest order; drops clips no longer listed
    with open(MEDIA_JSON, "w") as f:
        json.dump(media, f, indent=2)
        f.write("\n")
    total = sum(m["videoBytes"] + m["posterBytes"] for m in media.values())
    print(f"{len(media)} clips, {total / 1e6:.1f} MB with posters")


if __name__ == "__main__":
    main()
