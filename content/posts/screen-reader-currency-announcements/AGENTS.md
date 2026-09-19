# screen-reader-currency-announcements

This post claims that a currency announcement is produced by the **speech
synthesizer's text normalizer**, not by the browser and not by the screen
reader. That claim is load-bearing and rests on a few kinds of evidence.

## Layout

- `index.mdx` — the post.
- `hero.webp` — cover.
- `public/posts/screen-reader-currency-announcements/currency-announcements.html`
  — the live demo page (plain text nodes, one per currency format). Linked from
  the post.
- `public/posts/screen-reader-currency-announcements/artifacts/` — the engine
  measurements: `currencies.txt` (top-20 list), `RESULTS-espeak.txt` (phoneme
  dump), `RESULTS-flite.txt` (normalised words), `RESULTS-nemo-langs.txt`,
  `RESULTS-nemo-currencies.txt` and `RESULTS-nemo-coverage.tsv` (NeMo, per
  language).
- `scripts/currency-espeak-dump.sh`, `scripts/currency-flite-dump.sh` —
  regenerate the dumps. `espeak-ng` / `flite` must be on PATH. The post's
  eSpeak and Flite columns are measured, not inferred.
- `scripts/nemo/` + `scripts/nemo-currency-dump.sh` — the NeMo text-processing
  sweep (Podman; Python + pynini, nothing installed on the host).

## Regenerating the engine dumps

```bash
./scripts/currency-espeak-dump.sh \
  public/posts/screen-reader-currency-announcements/artifacts/RESULTS-espeak.txt
./scripts/currency-flite-dump.sh \
  public/posts/screen-reader-currency-announcements/artifacts/RESULTS-flite.txt
./scripts/nemo-currency-dump.sh          # builds nemo-tn image on first run
```

eSpeak is captured as phonemes and Flite as normalised words (`-pw`), so the
evidence is each engine's own output rather than a human transcription. Flite's
voice comes from the `extra/flite` Arch package (`flite_cmu_us_slt`); set
`FLITE_BIN` to point elsewhere. Non-ASCII symbols (£, €, ¥) are not currency to
Flite and are marked `?` in the dump for that reason.

## What can and cannot be re-run here

- **Re-runnable (no Windows needed):** the browser half. Dump the accessibility
  tree of `currency-announcements.html` and confirm Chrome exposes the raw
  string for every format.
  - DevTools: **Elements → Accessibility**, or the **Accessibility** pane's full
    AX tree.
  - Or headless, via the DevTools protocol's `Accessibility.getFullAXTree`.
  - The post's blog build does not depend on this; the snippet in the post is a
    representative excerpt.
- **Not re-runnable here:** the screen-reader / synthesizer half needs Windows
  (NVDA, Narrator), Android (TalkBack) or iOS (VoiceOver). The post cites the
  issue trackers, vendor docs and a published five-screen-reader comparison
  rather than re-running them. If you re-test, record the **synthesizer** — the
  whole point is that the engine, not the reader, decides.

## Facts to keep honest if edited

Every factual claim carries a footnote and every footnote is used; keep that
true when editing. Footnote identifiers are renumbered by first reference at
render time, so the number shown in the page will not match the `[^n]` label in
the source. Do not add a claim without adding its source.

- The expansion is documented as a synthesizer feature (SAPI `CONTEXT` tag
  `Currency`); NVDA issue #953 was closed as synthesizer-specific; NVDA PR
  #14266 names OneCore, SAPI5 and IBMTTS as the synthesizers that rewrite
  `USD 4` into "four US dollars", and eSpeak NG as the one that does not.
- The currency set is a short per-locale table. `$`/`USD` for `en-US`;
  `$`/`AUD` for `en-AU`; `¥`/`JPY` for `ja-JP` (Genesys docs).
- **TalkBack** is open source and has no currency code; it hands text to the
  Android TTS engine, whose default (Google's Speech Recognition & Synthesis) is
  closed. **VoiceOver** and Apple's synthesizers are closed; the mechanism is
  visible through `AVSpeechSynthesizer` and Apple's ICU4X #495 write-up.
- **Open-source tables exist but are incomplete:** Google Sparrowhawk's money
  grammar is `$`/`£`/`€`; NVIDIA NeMo's English table is ~40 entries and has no
  `sgd`; eSpeak NG has none (its only currency-adjacent entry is
  `usd $abbrev $allcaps`). CLDR has display names for every ISO 4217 code but no
  subunit names and no spoken-form grammar.
- **Where the expansion lives (open source):** Flite
  `lang/usenglish/us_text.c` (`us_tokentowords_one()`, "US money"); eSpeak NG
  `dictsource/en_list:126` and `dictsource/en_rules:7118` (symbol → word only);
  NeMo `text_normalization/en/taggers/money.py` + `verbalizers/money.py` +
  `data/money/*.tsv`; Sparrowhawk
  `documentation/grammars/en_toy/{classify,verbalize}/money.{grm,tsv}`;
  num2words `num2words/base.py` (`CURRENCY_FORMS`) + `lang_EU.py`.
- **Top-20 coverage (measured, `artifacts/RESULTS-nemo-coverage.tsv`):** NeMo
  English reads 7 as money (USD, EUR, JPY, GBP, HKD, KRW, THB) and 7 more as
  text (CAD, CHF, INR, NZD, SEK, NOK, BRL); num2words ~11; Sparrowhawk 3; Flite
  1 (`$` only); eSpeak 0 as money, 7 symbols named. In English none of them
  names SGD, CNY, TWD or ZAR; NeMo's Chinese model names all four.
- **The concatenated form is the weak evidence.** Every open normalizer measured
  here spells `USD123.45`; only the Microsoft engine produced a money reading
  from a code glued to a number, and its table is unpublished. Do not present
  the concatenated case as measured on the open engines.
- **Locale matters, in the open normalizer too.** NeMo English classifies `$`
  or `US$` but not a bare `USD`; NeMo Chinese keys on ISO codes, so
  `SGD123.45` → 新加坡元. Only `en`, `hi` and `ar` give a full major+minor
  reading; `pt` and `vi` raise `FstOpError` on `€`/`£`/`¥` that their own tables
  list. Do not generalise an English result to other locales, or the reverse.
- Do not claim a specific OneCore list beyond "USD is in, SGD is not" (from the
  observation that prompted the post) — the full table is not public.

## Hero

Base art generated with the local ComfyUI **krea2** pipeline (see the
`comfyui-image-gen` skill): soft 3D claymorphism, deliberately composed with
empty space in the upper-left for the text. The kicker/title/read-out lines are
**composited with ImageMagick + Pango**, not model-rendered, so the text is
exact and the mixed font sizes share a baseline. To change the headline, re-run
the Pango overlay and re-composite; do not try to edit the text pixels.

## Android / Google TTS audio (closed engine)

- `scripts/android-tts-harness/` — a headless `TtsActivity` added to the
  `android-simple-webview` app; build with `./podman-build.sh build-apk` in a
  copy of that repo, then `adb install -r`.
- `scripts/gtts-locale-dump.sh` — runs the locale × string matrix on the device
  and pulls WAVs. Committed clips are `artifacts/gtts/*.mp3` with the manifest
  `artifacts/RESULTS-gtts-locales.tsv`.
- `src/components/mdx/CurrencyAudioGallery.astro` — the in-post player. It
  reads the manifest `artifacts/RESULTS-gtts-locales.tsv` at build time (and
  checks each file exists), so the table cannot drift from the clips and the
  form column can show locale currencies without parsing filenames. Requires an
  explicit MDX import (auto-import from `src/components` did not pick it up
  here).
- `content/posts/screen-reader-currency-announcements/transcripts.json` — the
  transcripts, keyed by clip filename. A value starting with `~` is a **draft**:
  a prediction composed from documented engine behaviour plus CLDR currency
  names (`Intl.DisplayNames`), never from listening. The gallery labels those
  `predicted` and dims them. Delete the leading `~` once a line is verified
  against its clip, and the label disappears. Values with no `~` are treated as
  verified readings.

**Amounts use the locale's own decimal separator** (verified against CLDR via
`Intl.NumberFormat`): comma for `id-ID`, `de-DE`, `fr-FR`, `es-ES`, `it-IT`,
`nl-NL`; period for `en-US`, `en-GB`, `en-IN`, `zh-CN`, `zh-TW`, `yue-HK`,
`th-TH`. Per locale the sweep renders `USD123<sep>45`, `SGD123<sep>45`,
`$123<sep>45`, `USD0<sep>10` (cents only), then the locale's own currency (last)
— plus `<local>123` for `id-ID`, and a wrong-separator `<local>123.45` control
for the comma locales. `en-US`'s own currency is `USD`, so the shared
`USD123.45` row is dropped and only the final local row remains.

Filenames use a slug (`$`→`SYM`, `.`→`p`, `,`→`c`) so `IDR123.45` and
`IDR123,45` cannot collide; the displayed form comes from the manifest, never
from the filename.
- To install Google TTS on a de-Googled device: the APKPure APK is v1-signed
  only and Android rejects it; re-sign with v2 (`zipalign` + `apksigner sign
  --v1-signing-enabled true --v2-signing-enabled true`) and it installs.
  eSpeak NG's F-Droid APK ships no voice data and cannot initialise headless.
- This yields **audio only**: `TextToSpeech` never returns the normalised text,
  and ASR collapses numbers to digits, so do not claim a transcribed read-out.
  The `money` schema claim comes from `en_verbalize_spec.pb` in the APK.
