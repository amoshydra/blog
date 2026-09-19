#!/usr/bin/env bash
# Dump Flite's read-out of currency forms by printing its normalised words
# (`-pw`). Shows Flite's currency expansion (`$` only) and its edge cases.
#
# Usage: scripts/currency-flite-dump.sh [output.txt]
# Requires `flite` (or set FLITE_BIN). The built-in US English voice is used.
# Output is ASCII: non-`$` symbols are labelled with an ASCII tag because Flite
# passes those symbols through as raw bytes.
set -u

FLITE_BIN="${FLITE_BIN:-flite_cmu_us_slt}"

# label<TAB>text-to-speak
forms=$(cat <<'FORMS'
$123.45	$123.45
$1	$1
$1.01	$1.01
$1.5	$1.5
$0.50	$0.50
$.50	$.50
$0.01	$0.01
$0	$0
$12.345	$12.345
$1,234.56	$1,234.56
$1000000	$1000000
$1 million	$1 million
$1M	$1M
-$5.00	-$5.00
US$123.45	US$123.45
GBP-symbol123.45	£123.45
EUR-symbol123.45	€123.45
JPY-symbol123.45	¥123.45
USD123.45	USD123.45
EUR123.45	EUR123.45
SGD123.45	SGD123.45
AUD123.45	AUD123.45
THB123.45	THB123.45
123.45	123.45
FORMS
)

emit() {
  ver=$("$FLITE_BIN" --version 2>/dev/null | tr '\n' ' ' | grep -o 'flite-[0-9][^ ]*' | head -1)
  printf '# %s %s\n' "${FLITE_BIN##*/}" "$ver"
  printf '%-20s %s\n' 'input' 'normalised words'
  while IFS=$'\t' read -r label text; do
    words=$("$FLITE_BIN" -t "$text" -o none -pw 2>/dev/null | tr '\n' ' ' | sed 's/ *$//')
    words=$(printf '%s' "$words" | LC_ALL=C sed 's/[^ -~]/?/g')
    printf '%-20s %s\n' "$label" "$words"
  done <<< "$forms"
}

if [ "${1:-}" != "" ]; then
  emit > "$1"; echo "wrote $1" >&2
else
  emit
fi
