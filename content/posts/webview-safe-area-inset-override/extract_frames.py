#!/usr/bin/env python3
"""Extract device-framed frames from a simulator screen recording.

The Simulator window canvas is fixed but the rendered device changes size and
pose, so each frame's device bounding box is detected from its own dark pixels
rather than cropped with one fixed rectangle. The recorder's own toolbar is
excluded by only scanning the top 86% of the frame.
"""
import pathlib
import subprocess
import sys

W, H = 1158, 1196          # the recording's canvas
SAMPLE_FPS = 2
MAX_H = 1400


def device_bbox(raw: bytes):
    """Return (x, y, w, h) of the dark device body, or None."""
    def dark(x, y):
        i = (y * W + x) * 3
        return (raw[i] + raw[i + 1] + raw[i + 2]) / 3 < 90
    xs, ys = [], []
    for y in range(0, int(H * 0.86), 2):
        row = range(0, W, 2)
        for x in row:
            if dark(x, y):
                xs.append(x)
                ys.append(y)
    if not xs:
        return None
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
    # pad 6px to keep the outer bezel edge
    x0, y0 = max(0, x0 - 6), max(0, y0 - 6)
    x1, y1 = min(W - 1, x1 + 6), min(H - 1, y1 + 6)
    return x0, y0, x1 - x0 + 1, y1 - y0 + 1


def main(video, outdir):
    out = pathlib.Path(outdir)
    out.mkdir(parents=True, exist_ok=True)
    for f in out.glob("*.png"):
        f.unlink()

    raw = "/tmp/_frames.raw"
    subprocess.run(
        ["ffmpeg", "-y", "-v", "error", "-i", video,
         "-vf", f"fps={SAMPLE_FPS}", "-f", "rawvideo", "-pix_fmt", "rgb24", raw],
        check=True,
    )
    data = pathlib.Path(raw).read_bytes()
    frame_size = W * H * 3
    n = len(data) // frame_size
    print(f"{n} frames at {SAMPLE_FPS}fps from {W}x{H}")

    made = []
    for i in range(n):
        buf = data[i * frame_size:(i + 1) * frame_size]
        box = device_bbox(buf)
        if not box:
            continue
        x, y, w, h = box
        t = i / SAMPLE_FPS
        dst = out / f"t{t:06.2f}.png"
        subprocess.run(
            ["ffmpeg", "-y", "-v", "error",
             "-ss", f"{t}", "-i", video, "-frames:v", "1",
             "-vf", f"crop={w}:{h}:{x}:{y},scale='min({MAX_H},iw)':-2",
             str(dst)],
            check=True,
        )
        made.append((t, w, h))
        print(f"  t={t:6.2f}  {w}x{h}")

    print(f"\n{len(made)} frames -> {out}")
    # report the distinct shapes so poses are easy to spot
    shapes = sorted({(w, h) for _, w, h in made})
    print("distinct device sizes:")
    for s in shapes:
        print("  ", s)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
