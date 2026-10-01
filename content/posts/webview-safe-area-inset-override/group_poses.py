#!/usr/bin/env python3
"""Group every frame of a Duo screen recording by pose, then pick one per pose.

Picking a timestamp by hand does not work: the simulator animates the fold and the
rotation, and the device is drawn at an angle in between, which inflates its
bounding box. A half-rolled frame still has a plausible dark bounding box, so
bbox alone cannot tell a settled pose from a transition.

The page itself is near-white, so the bright content region inside the device is
what identifies the pose. On a settled frame that region is an axis-aligned
rectangle whose width/height are the page's viewport in the recording's own
pixels. On a frame caught mid-rotation the same region is a tilted quadrilateral,
so scanning rows and columns for bright pixels returns a box far larger than the
page and the frame is discarded.

For each surviving (sdk, pose) group the frame with the largest content area wins,
which is the one furthest from the screen edges.
"""
import collections
import pathlib
import subprocess
import sys

W, H = 1158, 1196
DESKTOP = pathlib.Path.home() / "Desktop"
FPS = 2
BRIGHT = 150          # 0-255; the demo page is light grey/white throughout
MIN_CONTENT = 0.15    # a real page fills a decent share of the device


def load(video):
    raw = "/tmp/_all.raw"
    subprocess.run(
        ["ffmpeg", "-y", "-v", "error", "-i", str(video),
         "-vf", f"fps={FPS}", "-f", "rawvideo", "-pix_fmt", "rgb24", raw],
        check=True,
    )
    return pathlib.Path(raw).read_bytes(), len(pathlib.Path(raw).read_bytes()) // (W * H * 3)


def bright_bbox(buf, x0, y0, x1, y1, step=3):
    """Tight box of bright pixels within the device, or None if it is not a
    clean axis-aligned rectangle (i.e. the device is mid-rotation)."""
    xs, ys = [], []
    for y in range(y0, y1, step):
        row = y * W
        for x in range(x0, x1, step):
            i = (row + x) * 3
            if (buf[i] + buf[i + 1] + buf[i + 2]) / 3 > BRIGHT:
                xs.append(x)
                ys.append(y)
    if len(xs) < 500:
        return None
    bx0, bx1, by0, by1 = min(xs), max(xs), min(ys), max(ys)
    area = (bx1 - bx0) * (by1 - by0)
    dev = (x1 - x0) * (y1 - y0)
    if area < dev * MIN_CONTENT:
        return None
    # Fill ratio: a settled axis-aligned page fills its box densely. A tilted one
    # scans as a sparse diagonal, so the same bounding box holds far less ink.
    if len(xs) * step * step / max(area, 1) < 0.25:
        return None
    return bx0, by0, bx1 - bx0 + 1, by1 - by0 + 1


def device_bbox(buf):
    xs, ys = [], []
    for y in range(0, int(H * 0.86), 3):
        for x in range(0, W, 3):
            i = (y * W + x) * 3
            if (buf[i] + buf[i + 1] + buf[i + 2]) / 3 < 90:
                xs.append(x)
                ys.append(y)
    if not xs:
        return None
    return (max(0, min(xs) - 6), max(0, min(ys) - 6),
            min(W - 1, max(xs) + 6) - max(0, min(xs) - 6) + 1,
            min(H - 1, max(ys) + 6) - max(0, min(ys) - 6) + 1)


def main(outdir):
    vids = sorted(DESKTOP.glob("Screen*2026-10-01*.mov"),
                  key=lambda p: p.stat().st_mtime, reverse=True)
    if len(vids) < 2:
        sys.exit("need the 27.0 and 27.1 recordings")
    out = pathlib.Path(outdir)
    out.mkdir(parents=True, exist_ok=True)
    for f in out.glob("*.png"):
        f.unlink()

    for sdk, vid in (("27-0", vids[0]), ("27-1", vids[1])):
        data, n = load(vid)
        fs = W * H * 3
        groups = collections.defaultdict(list)
        for i in range(n):
            buf = data[i * fs:(i + 1) * fs]
            dev = device_bbox(buf)
            if not dev:
                continue
            dx, dy, dw, dh = dev
            page = bright_bbox(buf, dx, dy, dx + dw, dy + dh)
            if not page:
                continue
            _, _, pw, ph = page
            key = (round(pw / 10) * 10, round(ph / 10) * 10)
            groups[key].append((i, dev, pw * ph))

        print(f"\n=== SDK {sdk} — {vid.name[:34]}")
        for key in sorted(groups, key=lambda k: -len(groups[k])):
            frames = sorted(groups[key], key=lambda f: -f[2])
            t = frames[0][0] / FPS
            dx, dy, dw, dh = frames[0][1]
            label = f"sdk{sdk}-page{key[0]}x{key[1]}"
            subprocess.run(
                ["ffmpeg", "-y", "-v", "error", "-ss", f"{t:.2f}", "-i", str(vid),
                 "-frames:v", "1", "-vf", f"crop={dw}:{dh}:{dx}:{dy}", str(out / f"{label}.png")],
                check=True)
            print(f"  page {key[0]:>4}x{key[1]:<4} n={len(frames):>3}  best t={t:5.2f}s  device {dw}x{dh}")


if __name__ == "__main__":
    main(sys.argv[1])
