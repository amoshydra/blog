#!/usr/bin/env bash
# Convert the WAVs received from the Windows TTS run into mp3 for the gallery,
# and write one manifest per Windows engine (onecore / sapi).
#
# Usage: scripts/gtts-windows-import.sh <inbox> <artifacts-dir>
#   <inbox>          where the WAVs + manifest.tsv were delivered
#   <artifacts-dir>  e.g. public/posts/screen-reader-currency-announcements/artifacts
#
# Writes <artifacts-dir>/<engine>/<name>.mp3 and
#        <artifacts-dir>/RESULTS-gtts-windows-<engine>.tsv  (locale form file bytes)
# The inbox manifest columns are: engine  locale  form  file  bytes
set -eu

IN="${1:?usage: gtts-windows-import.sh <inbox> <artifacts-dir>}"
OUT="${2:?usage: gtts-windows-import.sh <inbox> <artifacts-dir>}"
MAN="$IN/manifest.tsv"
[ -f "$MAN" ] || { echo "no manifest.tsv in $IN" >&2; exit 1; }
mkdir -p "$OUT"

# WAV -> mp3, grouped by engine.
tail -n +2 "$MAN" | while IFS=$'\t' read -r engine locale form file bytes; do
  [ -z "${engine:-}" ] && continue
  src="$IN/$file"
  if [ ! -f "$src" ]; then echo "missing $file" >&2; continue; fi
  base="${file%.wav}"
  mkdir -p "$OUT/$engine"
  ffmpeg -y -loglevel error -i "$src" -ar 22050 -ac 1 -b:a 32k "$OUT/$engine/$base.mp3"
done

# One manifest per engine, pointing at the .mp3 files.
for eng in $(tail -n +2 "$MAN" | cut -f1 | sort -u); do
  [ -z "$eng" ] && continue
  case "$eng" in
    onecore) label="Microsoft OneCore (Windows)" ;;
    sapi) label="Microsoft SAPI 5 (Windows)" ;;
    *) label="Microsoft $eng (Windows)" ;;
  esac
  {
    echo "# engine: $label"
    printf 'locale\tform\tfile\tbytes\n'
    tail -n +2 "$MAN" | while IFS=$'\t' read -r e2 loc form file bytes; do
      [ "$e2" = "$eng" ] || continue
      printf '%s\t%s\t%s.mp3\t%s\n' "$loc" "$form" "${file%.wav}" "$bytes"
    done
  } > "$OUT/RESULTS-gtts-windows-$eng.tsv"
  n=$(($(wc -l < "$OUT/RESULTS-gtts-windows-$eng.tsv") - 2))
  echo "wrote $OUT/RESULTS-gtts-windows-$eng.tsv ($n rows)"
done

echo "mp3s under $OUT/<engine>/"
