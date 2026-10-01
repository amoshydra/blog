#!/usr/bin/env python3
"""Find the runs of frames where the device holds still, in a screen recording.

A settled pose has a device bounding box that does not move or resize. Rotation
and folding animate it, so grouping consecutive frames by an unchanged bbox
separates the poses worth looking at from the transitions, without having to
guess a timestamp or trust an aspect ratio.
"""
import pathlib, subprocess, sys

W, H = 1158, 1196
FS = W * H * 3
FPS = 2
TOL = 2  # px; absorbs encoder noise without merging genuinely different poses


def device_bbox(buf):
    xs, ys = [], []
    for y in range(0, int(H * 0.86), 2):
        row = y * W
        for x in range(0, W, 2):
            i = (row + x) * 3
            if (buf[i] + buf[i + 1] + buf[i + 2]) / 3 < 90:
                xs.append(x); ys.append(y)
    if not xs:
        return None
    x0, y0 = max(0, min(xs) - 6), max(0, min(ys) - 6)
    x1, y1 = min(W - 1, max(xs) + 6), min(H - 1, max(ys) + 6)
    return x0, y0, x1 - x0 + 1, y1 - y0 + 1


def main(video, outdir, tag):
    raw = "/tmp/recheck/_all.raw"
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", str(video), "-vf", f"fps={FPS}",
                    "-f", "rawvideo", "-pix_fmt", "rgb24", raw], check=True)
    data = pathlib.Path(raw).read_bytes()
    n = len(data) // FS

    boxes = []
    for i in range(n):
        boxes.append(device_bbox(data[i * FS:(i + 1) * FS]))

    runs, cur = [], None
    for i, b in enumerate(boxes):
        if b is None:
            if cur: runs.append(cur); cur = None
            continue
        if cur and abs(b[2] - cur["w"]) <= TOL and abs(b[3] - cur["h"]) <= TOL:
            cur["end"] = i; cur["n"] += 1; cur["frames"].append(i)
        else:
            if cur: runs.append(cur)
            cur = {"start": i, "end": i, "n": 1, "w": b[2], "h": b[3],
                   "x": b[0], "y": b[1], "frames": [i]}
    if cur: runs.append(cur)

    out = pathlib.Path(outdir); out.mkdir(parents=True, exist_ok=True)
    for f in out.glob("*.png"): f.unlink()

    kept = []
    for r in runs:
        if r["n"] < 3:            # 1.5s at 2fps; transitions never hold this long
            continue
        mid = r["frames"][len(r["frames"]) // 2]
        t = mid / FPS
        dst = out / f"{tag}-r{len(kept):02d}-t{t:.0f}.png"
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-ss", f"{t:.2f}", "-i", str(video),
                        "-frames:v", "1", "-vf", f"crop={r['w']}:{r['h']}:{r['x']}:{r['y']}",
                        str(dst)], check=True)
        r["file"] = dst.name; r["t"] = t
        kept.append(r)

    print(f"{tag}: {n} frames, {len(runs)} runs, {len(kept)} held >= {3/FPS:.1f}s")
    for i, r in enumerate(kept):
        print(f"  r{i:02d}  t={r['t']:6.2f}s  {r['w']}x{r['h']}  held {r['n']/FPS:4.1f}s  {r['file']}")
    return kept


if __name__ == "__main__":
    main(pathlib.Path(sys.argv[1]), sys.argv[2], sys.argv[3])
