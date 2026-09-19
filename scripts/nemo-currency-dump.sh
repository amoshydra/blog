#!/usr/bin/env bash
# Run NVIDIA NeMo text-processing over currency forms in every language it
# supports, inside a Podman container (Python + pynini), so nothing Python is
# installed on the host.
#
# Usage: scripts/nemo-currency-dump.sh [output-dir]
# Writes: RESULTS-nemo-langs.txt, RESULTS-nemo-currencies.txt,
#         RESULTS-nemo-coverage.tsv
set -eu

here=$(cd "$(dirname "$0")" && pwd)
out="${1:-$here/../public/posts/screen-reader-currency-announcements/artifacts}"
image="nemo-tn"

podman image exists "$image" || podman build -t "$image" "$here/nemo"

run() {
  podman run --rm -v "$here/nemo:/work:Z" "$image" python "/work/$1"
}

run langs.py           > "$out/RESULTS-nemo-langs.txt"
run currency_tokens.py > "$out/RESULTS-nemo-currencies.txt"
run coverage.py        > "$out/RESULTS-nemo-coverage.tsv"

echo "wrote $out/RESULTS-nemo-{langs,currencies}.txt and coverage.tsv" >&2
