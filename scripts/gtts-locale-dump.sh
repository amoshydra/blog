#!/usr/bin/env bash
# Synthesize currency strings across TTS locales on a connected Android device,
# using the harness activity (scripts/android-tts-harness/). Requires: adb, the
# harness APK installed, and a TTS engine (default com.google.android.tts).
#
# Amounts use each locale's own decimal separator (CLDR: comma for id-ID, de-DE,
# fr-FR, es-ES, it-IT, nl-NL; period elsewhere). Per locale the set is:
#   USD123<dec>45  SGD123<dec>45  $123<dec>45  USD0<dec>10  <local>123<dec>45
#   ... plus a whole-unit <local>123 for currencies whose engine reads the
#   decimal oddly (ja-JP, en-IN, id-ID), and a wrong-separator <local> control
#   for the comma locales.
#
# Usage: scripts/gtts-locale-dump.sh [output-dir]
# Prints a TSV manifest (locale, form, file, bytes).
set -eu

PKG="com.amoshydra.androidapp"
ENGINE="${ENGINE:-com.google.android.tts}"
OUT="${1:-/tmp/opencode/gtts-out}"
mkdir -p "$OUT"

# Override with LOCALES="ja-JP ta-IN" to render a subset.
if [ -n "${LOCALES:-}" ]; then
  read -r -a locales <<< "$LOCALES"
else
  locales=(en-US en-GB en-IN id-ID yue-HK zh-CN zh-TW th-TH ja-JP ta-IN de-DE fr-FR es-ES it-IT nl-NL)
fi

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

# "$" -> SYM, "." -> p, "," -> c, then anything else non-alphanumeric -> "_".
slug_for() { printf '%s' "$1" | sed 's/\$/SYM/g; s/\./p/g; s/,/c/g' | tr -c '[:alnum:]' '_'; }

# Quote a value for the shell on the *device*. `adb shell` re-parses its
# command remotely, so an unquoted "$123.45" loses "$1" to the device shell and
# the engine hears "23.45".
dq() { printf "'%s'" "$(printf '%s' "$1" | sed "s/'/'\\''/g")"; }

adb shell svc power stayon usb >/dev/null 2>&1 || true
adb shell input keyevent KEYCODE_WAKEUP >/dev/null 2>&1 || true

echo -e "locale\tform\tfile\tbytes"
for loc in "${locales[@]}"; do
  dec=$(decimal_for "$loc")
  cur=$(local_code "$loc")

  forms=("USD123${dec}45" "SGD123${dec}45" "\$123${dec}45" "USD0${dec}10")
  local_forms=("${cur}123${dec}45")
  # Currencies whose engine reads the decimal form oddly: add the whole-unit form.
  case "$loc" in
    ja-JP | en-IN | ta-IN | id-ID) local_forms+=("${cur}123") ;;
  esac
  wrong=$(wrong_for "$loc")
  [ -n "$wrong" ] && local_forms+=("${cur}123${wrong}45")

  for f in "${local_forms[@]}"; do
    case " ${forms[*]} " in *" $f "*) ;; *) forms+=("$f") ;; esac
  done

  for form in "${forms[@]}"; do
    name="${loc}_$(slug_for "$form")"
    adb shell am force-stop "$PKG" >/dev/null 2>&1 || true
    # Delete any file from a previous run first: the wait loop below trusts a
    # steady nonzero size, and a stale file would satisfy that instantly.
    adb shell rm -f "/sdcard/Android/data/$PKG/files/$name.wav" >/dev/null 2>&1 || true
    adb shell "am start -n $PKG/.TtsActivity --es engine $(dq "$ENGINE") \
      --es locale $(dq "$loc") --es text $(dq "$form") --es out $(dq "$name")" \
      >/dev/null 2>&1 || true
    bytes=0
    prev=-1
    for _ in $(seq 1 60); do
      bytes=$(adb shell stat -c %s "/sdcard/Android/data/$PKG/files/$name.wav" 2>/dev/null | tr -d '\r' || echo 0)
      case "$bytes" in ''|*[!0-9]*) bytes=0 ;; esac
      if [ "$bytes" -gt 2000 ] && [ "$bytes" = "$prev" ]; then break; fi
      prev="$bytes"
      sleep 0.5
    done
    adb pull "/sdcard/Android/data/$PKG/files/$name.wav" "$OUT/" >/dev/null 2>&1 || true
    printf '%s\t%s\t%s.wav\t%s\n' "$loc" "$form" "$name" "$bytes"
  done
done
