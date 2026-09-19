#!/usr/bin/env bash
# Dump eSpeak NG's read-out of the top-20 currencies (BIS Triennial 2022 FX
# turnover) as phonemes, so the evidence is the engine's own normalisation
# rather than a human transcription.
#
# Usage: scripts/currency-espeak-dump.sh [output.txt]
#   (default: stdout)
#
# Requires espeak-ng on PATH. See the post
# content/posts/screen-reader-currency-announcements/ for the commentary.
set -u

currencies=$(cat <<'EOF'
USD	$
EUR	€
JPY	¥
GBP	£
CNY	-
AUD	-
CAD	-
CHF	-
HKD	-
SGD	-
KRW	₩
INR	₹
NZD	-
SEK	-
NOK	-
MXN	-
TWD	-
ZAR	-
BRL	R$
THB	฿
EOF
)

emit() {
  while IFS=$'\t' read -r code symbol; do
    printf '%-12s %s\n' "${code}123.45" "$(espeak-ng -q -x "${code}123.45" 2>/dev/null)"
    if [ "$symbol" != "-" ]; then
      printf '%-12s %s\n' "${symbol}123.45" "$(espeak-ng -q -x "${symbol}123.45" 2>/dev/null)"
    fi
  done <<< "$currencies"
}

if [ "${1:-}" != "" ]; then
  emit > "$1"
  echo "wrote $1" >&2
else
  emit
fi
