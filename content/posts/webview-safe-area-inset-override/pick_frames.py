#!/usr/bin/env python3
"""Pull settled device-framed stills out of the two Duo screen recordings.

Filenames contain a narrow no-break space (U+202F) before AM/PM, so everything
globs rather than being passed through the shell's word splitting.

The device is found per frame from its own dark pixels; the recorder toolbar is
excluded by only scanning the top 86% of the canvas.
"""
import pathlib
import subprocess
import sys

W, H = 1158, 1196
DESKTOP = pathlib.Path.home() / "Desktop"
OUT = pathlib.Path("/tmp/pick")

# label -> (video mtime-order index, timestamp seconds)
JOBS = [
    ("270-outer-portrait",  0, 9),
    ("270-outer-landscape", 0, 17),
    ("270-inner-landscape", 0, 24),
    ("270-inner-portrait",  0, 45),
    ("271-inner-landscape", 1, 8),
    ("271-outer-landscape", 1, 12),
    ("271-outer-portrait",  1, 14),
    ("271-inner-portrait",  1, 0),
]


def videos():
    vs = sorted(
        DESKTOP.glob("Screen*2026-10-01*.mov"),
        key=lambda p: p.stat().st_mtime,
        reverse=True,
    )
    return vs


def device_box(raw: bytes):
    def dark(x, y):
        i = (y * W + x) * 3
        return (raw[i] + raw[i + 1] + raw[i + 2]) / 3 < 90
    xs, ys = [], []
    for y in range(0, int(H * 0.86), 2):
        for x in range(0, W, 2):
            if dark(x, y):
                xs.append(x)
                ys.append(y)
    if not xs:
        return None
    x0 = max(0, min(xs) - 6)
    y0 = max(0, min(ys) - 6)
    x1 = min(W - 1, max(xs) + 6)
    y1 = min(H - 1, max(ys) + 6)
    return x0, y0, x1 - x0 + 1, y1 - y0 + 1


def main():
    vs = videos()
    print("recordings found (newest first):")
    for v in vs:
        print("  ", v.name)
    if len(vs) < 2:
        sys.exit("need two recordings")
    # newest is the 27.0 take, the one before it is 27.1
    by_sdk = {0: vs[0], 1: vs[1]}

    OUT.mkdir(parents=True, exist_ok=True)
    for f in OUT.glob("*.png"):
        f.unlink()

    for label, idx, t in JOBS:
        vid = by_sdk[idx]
        raw = "/tmp/_one.raw"
        subprocess.run(
            ["ffmpeg", "-y", "-v", "error", "-ss", str(t), "-i", str(vid),
             "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", raw],
            check=True,
        )
        data = pathlib.Path(raw).read_bytes()
        box = device_box(data)
        if not box:
            print(f"{label}: NO DEVICE at t={t}")
            continue
        x, y, w, h = box
        dst = OUT / f"{label}.png"
        subprocess.run(
            ["ffmpeg", "-y", "-v", "error", "-ss", str(t), "-i", str(vid),
             "-frames:v", "1",
             "-vf", f"crop={w}:{h}:{x}:{y}", str(dst)],
            check=True,
        )
        print(f"{label}: {w}x{h}  <- t={t}s  {vid.name[:28]}")


if __name__ == "__main__":
    main()
