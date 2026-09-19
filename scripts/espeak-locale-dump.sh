#!/usr/bin/env bash
# Synthesize the currency locale x form matrix with eSpeak NG, mirroring
# scripts/gtts-locale-dump.sh so the forms join across engines in the gallery.
# Runs entirely on the host (espeak-ng + ffmpeg); no Android, no Python.
#
# Locales eSpeak has no voice for are skipped (currently en-IN). zh-CN and
# zh-TW both map to the `cmn` voice, so their audio is identical.
#
# Usage: scripts/espeak-locale-dump.sh [output-dir]
# Writes <output-dir>/<locale>_<slug>.mp3 and prints a TSV manifest to stdout:
#   # engine: eSpeak NG text-to-speech: <version>
#   locale  form  file  bytes  phonemes
# (`bytes` is the intermediate WAV size, matching the gtts manifest convention.)
set -eu

OUT="${1:-/tmp/opencode/espeak-out}"
mkdir -p "$OUT"

locales=(en-US en-GB en-IN id-ID yue-HK zh-CN zh-TW th-TH ja-JP ta-IN de-DE fr-FR es-ES it-IT nl-NL)

voice_for() {
  case "$1" in
    en-US) echo en-us ;; en-GB) echo en-gb ;;
    id-ID) echo id ;; yue-HK) echo yue ;; zh-CN) echo cmn ;; zh-TW) echo cmn ;;
    th-TH) echo th ;; ja-JP) echo ja ;; ta-IN) echo ta ;; de-DE) echo de ;;
    fr-FR) echo fr ;; es-ES) echo es ;; it-IT) echo it ;; nl-NL) echo nl ;;
  esac
}

decimal_for() { case "$1" in id-ID | de-DE | fr-FR | es-ES | it-IT | nl-NL) echo "," ;; *) echo "." ;; esac; }
wrong_for() { case "$1" in id-ID | de-DE | fr-FR | es-ES | it-IT | nl-NL) echo "." ;; *) echo "" ;; esac; }
local_code() {
  case "$1" in
    en-US) echo USD ;; en-GB) echo GBP ;; en-IN) echo INR ;; id-ID) echo IDR ;;
    yue-HK) echo HKD ;; zh-CN) echo CNY ;; zh-TW) echo TWD ;; th-TH) echo THB ;;
    de-DE | fr-FR | es-ES | it-IT | nl-NL) echo EUR ;;
    ja-JP) echo JPY ;;
    ta-IN) echo INR ;;
  esac
}
slug_for() { printf '%s' "$1" | sed 's/\$/SYM/g; s/\./p/g; s/,/c/g' | tr -c '[:alnum:]' '_'; }

version=$(espeak-ng --version 2>/dev/null | head -1)
echo "# engine: ${version}"
echo -e "locale\tform\tfile\tbytes\tphonemes"

tmp="$OUT/.tmp.wav"

# Synthesize one form and print its manifest row.
synth() {
  local form="$1" name="$2"
  espeak-ng -v "$voice" -w "$tmp" "$form"
  local bytes phonemes
  bytes=$(stat -c %s "$tmp")
  ffmpeg -y -loglevel error -i "$tmp" -ar 22050 -ac 1 -b:a 32k "$OUT/$name.mp3"
  phonemes=$(espeak-ng -q -v "$voice" -x "$form")
  printf '%s\t%s\t%s.mp3\t%s\t%s\n' "$loc" "$form" "$name" "$bytes" "$phonemes"
}

for loc in "${locales[@]}"; do
  voice=$(voice_for "$loc")
  if [ -z "$voice" ]; then
    echo "skipping $loc (no eSpeak voice)" >&2
    continue
  fi
  dec=$(decimal_for "$loc")
  cur=$(local_code "$loc")

  forms=("USD123${dec}45" "SGD123${dec}45" "\$123${dec}45" "USD0${dec}10")
  local_forms=("${cur}123${dec}45")
  case "$loc" in
    ja-JP | en-IN | ta-IN | id-ID) local_forms+=("${cur}123") ;;
  esac
  wrong=$(wrong_for "$loc")
  [ -n "$wrong" ] && local_forms+=("${cur}123${wrong}45")
  for f in "${local_forms[@]}"; do
    case " ${forms[*]} " in *" $f "*) ;; *) forms+=("$f") ;; esac
  done

  for form in "${forms[@]}"; do
    synth "$form" "${loc}_$(slug_for "$form")"
  done

  # Manual probe forms from the committed A manifest (symbol/code recognition).
  # Explicit filenames because slug_for() collapses non-ASCII symbols to "_".
  case "$loc" in
    ja-JP) probes=("¥123|JPYsym123" "円123|JPYword123" "JPY 123|JPYspace123") ;;
    ta-IN) probes=("₹123|INRsym123" "ரூபாய்123|INRword123" "INR 123|INRspace123") ;;
    *) probes=() ;;
  esac
  for p in "${probes[@]}"; do
    synth "${p%%|*}" "${loc}_${p##*|}"
  done
done
rm -f "$tmp"
