# Claims review — handover

Review of `index.mdx` for factual accuracy. Every claim was checked against the
post's own committed artifacts (`artifacts/`, `transcripts.json`, `scripts/`)
and against the upstream sources it cites. Revisions are pinned so the checks
stay valid after upstream branches move.

Verdict: the thesis and the measured appendices hold up. The items below are
wording/evidence defects, not a problem with the argument. The first two are
outright false as written; the rest are unsupported or internally inconsistent.

## Correction found after the first pass — NVDA's default engine

The first pass accepted the post's framing "with a Microsoft voice selected".
The author then flagged that they did not change the synthesizer — they opened
NVDA on a Windows 10 machine and ran the test. NVDA's own source confirms the
default is **Windows OneCore**, so the observation is the out-of-the-box reading:

- `source/config/configSpec.py`: `synth = string(default=auto)`
- `source/synthDriverHandler.py`: `defaultSynthPriorityList = ["oneCore", "espeak", "silence"]`
- NV Access, "Synthesizer options": "NVDA uses Windows OneCore by default."

eSpeak NG is bundled but is the fallback, and it does not expand currency. The
intro was rewritten to say NVDA speaks through Windows OneCore by default
(footnote [^37]) and that eSpeak NG is the fallback. The earlier "select a
Microsoft voice" / "does not do this out of the box" wording was wrong and is gone.

## Summary

Status column: ✅ = fixed in the working tree (pending commit). All eight were
applied; see "Resolutions applied" below for the exact change to each. Line
numbers here are the pre-fix revision of `index.mdx` (the post was at 477 lines
when reviewed).

| # | Where | Claim | Verdict | Status |
|---|---|---|---|---|
| 1 | lines 29, 157, 208; fn [^17] | TalkBack "contains no currency or money handling" / "no table at all" | **False** — it ships a currency symbol map | ✅ |
| 2 | line 207; fn [^13] | eSpeak's "only currency-code entry is `usd`" | **False** — `eur` is a second one | ✅ |
| 3 | lines 143–149, 322 | JAWS reads `¥`/`€` "as money"; `£` money to every reader | **Unsupported + internally inconsistent** | ✅ |
| 4 | line 347 | NeMo `zh` "keys on codes, not symbols" | **False** — its table carries symbols too | ✅ |
| 5 | line 240 | Flite comment "just read as mumble point mumble" | Misquote (source: "simply read as…") | ✅ |
| 6 | line 359 | "about 110 ISO codes" | 105 in the committed sweep | ✅ |
| 7 | fn [^2] | PR #14266 sourced for "eSpeak NG ships with NVDA" | PR does not say that (fact is true, cited at [^11]) | ✅ |
| 8 | lines 19, 29; fn [^16] | Onsman sourced for `USD`/`SGD` results | Onsman never tested those codes | ✅ (main claim) |

Also fixed while in there (not in the original handover list): `AGENTS.md`
transcript counts said 81, the verified set is 90; and `index.mdx` "all 81 codes
its table carries" now says "all 81 of the swept codes its table carries".

## Resolutions applied (working tree, pending commit)

- **1 TalkBack.** TL;DR: "NVDA and TalkBack ship no table" → "ship no amount
  table of their own — each carries only a symbol dictionary [^1] [^17]".
  TalkBack section: "contains no currency or money handling, only a speech
  compositor and a `NumberAdjustor`" → "carries a currency symbol dictionary —
  `$`, `€`, `£`, `¥` and others mapped to spoken names — but no currency-amount
  table". Open-engines list: "carry no currency table" → "carry no
  currency-amount table, only symbol maps". Footnote [^17] rewritten to name
  `TALKBACK_PUNCTUATION_AND_SYMBOL` in `SpeechCleanupUtils.java`. `AGENTS.md`
  TalkBack bullet updated.
- **2 eSpeak.** Prose names both entries (`usd $abbrev $allcaps` and
  `eur jU@ $only`); footnote [^13] gives both with line numbers. `AGENTS.md`
  eSpeak bullet updated.
- **3 JAWS / £.** Table row now: money `£123`; does not `$123`, `¥123`, `€123`,
  `AUD123`, `THB123`. "`£58.96` is money to every reader tested" → money in NVDA,
  Narrator, VoiceOver and JAWS, plain decimal in TalkBack, cited [^16].
- **4 zh.** "keys on codes, not symbols" → "keys on ISO codes *and* currency
  symbols"; cited [^35]. "all 81 codes its table carries" → "all 81 of the swept
  codes its table carries".
- **5 Flite.** Comment `just` → `simply`.
- **6 Sweep size.** "about 110 ISO codes" → "105 ISO codes".
- **7 fn [^2].** Removed the unsourced "eSpeak NG ships with NVDA" clause; the
  fact is already cited at [^11].
- **8 fn [^16] / USD-SGD.** Dropped [^16] from the USD/SGD claim; Onsman now
  cited for the "short and rarely published" variation and the £ detail. The
  opening Narrator sentence now cites [^2] [^16]: the PR establishes OneCore
  expands `USD`, and Onsman shows Narrator behaves as NVDA.

Pinned revisions used:

- `google/talkback` @ `229212fdf5842191d0a93fc95d9ca1423b346866` (2026-03-23)
- `espeak-ng/espeak-ng` @ `699e79690f23e2558d990a3a78b0050745b96932`
- `NVIDIA/NeMo-text-processing` @ `ddadfb2a38d2bc6b8cc6232c4f915eb60f500688`
- `festvox/flite` @ `6c9f20dc915b17f5619340069889db0aa007fcdc`
- `google/sparrowhawk` @ `a0503e26a433fbd3a9ff81ba7a08819e4a3bb668`
- `savoirfairelinux/num2words` @ `07814cb114157f582c40a00119c2e9faba8dcee2`
- Onsman, "Money Talks! Formatting Currency in Web Content" (OZeWAI, 2024-01-12)

---

## 1. TalkBack does contain currency handling — false as written — ✅ resolved

Post:

> line 157: "Its source contains no currency or money handling, only a speech compositor and a `NumberAdjustor` for sliders [^17]."
>
> line 29: "NVDA and TalkBack ship no table at all"
>
> line 208: "`NVDA` [^1] and `TalkBack` [^17] are open source and likewise carry no currency table."
>
> fn [^17]: "no currency or money handling in its source (speech compositor and `NumberAdjustor` only)."

Evidence — `google/talkback` @ `229212f`, file
`utils/src/main/java/com/google/android/accessibility/utils/output/SpeechCleanupUtils.java`:

- line 87–88: `private static final ImmutableMap<Character, Pair<Integer, Integer>> TALKBACK_PUNCTUATION_AND_SYMBOL`
- lines 123–131 (verbatim):

  ```java
  // Currency
  .put('$', new Pair<>(R.string.symbol_dollar_sign, ALL))
  .put('€', new Pair<>(R.string.symbol_euro, ALL))
  .put('£', new Pair<>(R.string.symbol_pound_sterling, ALL))
  .put('¥', new Pair<>(R.string.symbol_yen, ALL))
  .put('₱', new Pair<>(R.string.symbol_currency_peso, ALL))
  .put('₹', new Pair<>(R.string.symbol_rupee, MOST))
  .put('₫', new Pair<>(R.string.symbol_currency_dong, ALL))
  .put('¤', new Pair<>(R.string.symbol_currency_sign, ALL))
  ```

  plus `￦`/`₩`/`¢` at lines 99, 159–160.

- `cleanUp()` (line 256) resolves a single character through
  `getCleanValueFor()` (line 359), which reads that same map.
- `cleanUp()` is called in TalkBack's speech path:
  `talkback/.../compositor/Compositor.java:529`
  `ttsOutput = SpeechCleanupUtils.cleanUp(mContext, ttsOutput);`

So TalkBack carries a currency **symbol→name** map. It has no currency **amount**
table — which is the real point — but the sentence as written ("no currency or
money handling", "no table at all") is false.

Suggested fix: distinguish symbol dictionary from amount table, exactly as the
post already does for NVDA at line 66. E.g. "TalkBack carries the same kind of
symbol dictionary NVDA does (its `TALKBACK_PUNCTUATION_AND_SYMBOL` map has `$`,
`€`, `£`, `¥`, …), but no currency-amount table; it hands the number to the
Android TTS engine." `AGENTS.md` repeats the false version and needs the same fix.

---

## 2. eSpeak has two currency-code entries, not one — false as written — ✅ resolved

Post:

> line 207: "the English dictionary's only currency-code entry is `usd $abbrev $allcaps`"
>
> fn [^13]: "the entry `usd $abbrev $allcaps`; `USD` is an abbreviation to be spelled"

Evidence — `espeak-ng` @ `699e796`, `dictsource/en_list`:

- line 574: `eur	jU@	$only`
- line 683: `usd     $abbrev $allcaps`

These are the only two top-20 ISO codes with dictionary entries, and the
committed artifact already reflects `eur`: `artifacts/RESULTS-espeak.txt` line 3
shows `EUR123.45 → j'U@ …` (read as "eur", not spelled E-U-R), while line 2 shows
`$123.45 → d'0l3 …` ("dollar"). So "only currency-code entry" is wrong; there are
two. The load-bearing claim (no amount handling; `USD123.45` is spelled) is
unaffected.

Suggested fix: "the only currency-code entries are `usd $abbrev $allcaps` and
`eur jU@ $only`; neither adds amount handling." Fix `AGENTS.md` too.

---

## 3. JAWS row is unsupported and internally inconsistent — ✅ resolved

Post table (lines 143–149):

| Screen reader (tested versions) | Reads as money | Does not |
|---|---|---|
| JAWS 2024 (Windows) | `£123`, `¥123`, `€123` | `$123`, `AUD123`, `THB123` |

and line 322:

> "`£58.96` is money to every reader tested."

Evidence — Onsman's raw JAWS read-outs (OZeWAI page, "Test results"):

- `$58.96` → "dollar fifty-eight point nine six"
- `€58.96` → "euro fifty-eight point nine six"
- `¥58.96` → "yen fifty-eight point nine six"
- `£58.96` → "fifty-eight pounds and ninety-six pence"

Three problems:

1. Onsman's JAWS gives a true money reading only for `£`. The `€` and `¥` outputs
   are symbol-first decimals — the post's own appendix definition of `symbol`,
   not `money` (line 293: "`money` means the engine names the currency for an
   amount, including its minor unit… `symbol` means it names the symbol but
   reads the amount as a plain decimal").
2. It is internally inconsistent with the same table: JAWS `$` is placed under
   "Does not", yet its read-out ("dollar fifty-eight point nine six") has the
   same shape as the `€`/`¥` read-outs the table calls "money".
3. Onsman's own conclusion says the opposite for yen: "Every screen reader
   recognized the symbol for Yen, and all but JAWS announced the money amount
   correctly."

Caveat, stated for fairness: the post's cells use `€123`/`¥123` (integers)
whereas Onsman tested `€58.96`/`¥58.96`. JAWS *might* read the integer as
"one hundred twenty-three euros", but the cited source does not test that, and
the post presents the table as a condensation of that source.

The `£58.96` sentence has a parallel issue: Onsman's raw TalkBack row is
"fifty-eight pounds point nine six", not a money reading. Onsman's prose claims
all readers "announced the money amount correctly" for the pound, contradicting
his own table; the post followed the prose.

Suggested fix: for JAWS, put `¥`/`€` (and `$`) in "names the symbol" and keep
only `£` as money, or reword the column header to "names the currency" and note
the read-out shape. For line 322, say `£58.96` is money in JAWS, NVDA, Narrator
and VoiceOver, and symbol-plus-decimal in TalkBack.

---

## 4. NeMo `zh` handles symbols too — false as written — ✅ resolved

Post:

> line 347: "Chinese classifies bare ISO codes. NeMo's `zh` model keys on codes, not symbols, so it reads the concatenated form that the English engines spell out."

Evidence — `NeMo-text-processing` @ `ddadfb2`:

- `zh/data/money/currency_major.tsv` has **79 symbol tokens** among its 189
  unique first-column entries, including `$`, `£`, `€`, `¥`, `₩`, `₪`, `₹`, `₽`,
  and code-plus-symbol forms `SGD$`, `NZD$`, `HKD$`, `CAD$`, `JPY¥`.
- `zh/taggers/money.py:68–69` loads both `currency_major.tsv` **and**
  `currency_mandarin.tsv` (bare spoken names: 美元, 欧元, 英镑, …).
- `zh/taggers/money.py:73` comment: `# regular money grammamr with currency symbols $1000`.
- The committed artifact already shows it: `RESULTS-nemo-langs.txt` (`## zh`)
  has `$123.45 → 十二三点四五美元`, `€123.45 → …欧元`, `£123.45 → …英镑`,
  `¥123.45 → …圆`.

The demonstrated point — `zh` reads concatenated ISO codes that English spells
out — is correct and important. The words "not symbols" are not.

Suggested fix: "NeMo's `zh` model keys on ISO codes *and* on currency symbols,
so unlike English it reads the concatenated code form."

Secondary note (lower confidence, wording only): line 376 says "all 81 codes its
table carries". The `zh` table carries 110 pure ISO-code tokens (plus the 79
symbol tokens); 81 is the count that survived the sweep, not the table size.
Reword to "all 81 codes it covers in the sweep" to avoid implying 81 is the
table.

---

## Minor / sourcing notes — ✅ resolved

- **line 240** — snippet comment reads `/* just read as mumble point mumble */`;
  Flite's `lang/usenglish/us_text.c` says `/* simply read as mumble point mumble */`.
  The block is labelled "abridged", so cosmetic only.
- **line 359** — "about 110 ISO codes"; the committed
  `RESULTS-nemo-coverage.tsv` has **105** distinct ISO codes. "About" makes this
  defensible; 105 is the exact figure.
- **fn [^2]** — "[…] and the fact that eSpeak NG ships with NVDA". PR #14266's
  body says only "eSpeak is not impacted". The fact is true but is not sourced
  there; cite the NVDA docs (or drop the clause from the footnote).
- **fn [^16] on lines 19/29** — Onsman tested `$`, `US$`, `A$`, `AU$`, `AUD`,
  `THB`, `VND`, `¥`, `£`, `€`; not `USD` or `SGD`. The `USD`/`SGD` concatenated
  result is the author's own observation and is disclaimed elsewhere; attribute
  it to the observation, not to Onsman.

---

## Could not verify here (not disproven)

- **fn [^22]** — `AVSpeechSynthesizer` reads `$100.99` as "one hundred dollars
  and ninety nine cents". The linked itnext article returned HTTP 403.
- **fn [^36]** — `en_verbalize_spec.pb` with a `money` class inside the Google
  TTS APK. Requires the APK; the committed gallery/`RESULTS-gtts-locales.tsv`
  confirm the harness but not the APK internals.
- **fn [^32]** — BIS 2022 top-20 ordering. `currencies.txt` looks right, but the
  BIS page is JS/PDF and could not be machine-parsed.

## Transcripts

Resolved. All 81 values in `transcripts.json` are now verified against their
clips (no `~` remain), the gallery prose was updated, and non-Latin read-outs
carry a romanization from `transcripts.romanized.json`.

---

## Confirmed accurate (sampled, with pinned source)

- NVDA issue #953 quotes verbatim (jteh, fisher729); closed synthesizer-specific
  by Adriani90. The `$10.00` → "100 dollars" footnote caveat is correct.
- NVDA PR #14266 quote and OneCore/SAPI5/IBMTTS vs eSpeak list exact.
- SAPI `Currency` context and `$34.90` example (Microsoft Learn ms723629).
- Genesys per-locale currency lists; LumenVox "wide list … many ISO 4217 codes";
  OCP code table.
- Flite `usmoney` regex (`lang/usenglish/make_us_regexes:45`), the "US money"
  branch, and all six runtime rows match `RESULTS-flite.txt`.
- eSpeak `en_list:126 _$ d0l3`, `en_rules:7118 $ d0l3`, `usd $abbrev $allcaps`,
  `TranslateNumber` in `numbers.c`.
- NeMo `currency_major.tsv` (~39 entries, no `sgd`), minor units, tagger/
  verbalizer paths; every language table and every coverage count in the post
  reproduces from `RESULTS-nemo-langs.txt` / `RESULTS-nemo-coverage.md`.
- Sparrowhawk classify/verbalize TSVs and the " and "+singularize grammar.
- Onsman raw per-reader read-outs for `$`, `US$`, `A$`, `AUD`, `THB`, `VND`,
  `¥`, `£`, `€`; the AU$ oddity and the `AUD59.96`/`AUD58.96` slip.
- WHATWG HTML issue #12856 (open `<currency>` proposal); ICU4X #495 both quotes
  verbatim; openradar rdar://46031623; Recognizers-Text has `sgd`; Blink
  `ax_node_object.cc` has no `currency`/`NumberFormat`; Ritchie et al. semiotic
  classes and currency reordering.
- Android artifacts: `RESULTS-gtts-voices.txt` header (218 voices / 48 locales)
  and the 15 committed locales in `RESULTS-gtts-locales.tsv`.

## Reproduce

```bash
# TalkBack currency map (finding 1)
git clone --depth 1 https://github.com/google/talkback.git
grep -nE "Currency|symbol_dollar|symbol_euro|symbol_yen" \
  talkback/utils/src/main/java/com/google/android/accessibility/utils/output/SpeechCleanupUtils.java

# eSpeak entries (finding 2)
git clone --depth 1 https://github.com/espeak-ng/espeak-ng.git
grep -nE "^(eur|usd)[[:space:]]" espeak-ng/dictsource/en_list

# NeMo zh symbol tokens (finding 4)
curl -s https://raw.githubusercontent.com/NVIDIA/NeMo-text-processing/main/nemo_text_processing/text_normalization/zh/data/money/currency_major.tsv \
  | cut -f1 | grep -vE "^[A-Z]{3}$" | sort -u

# NeMo language/coverage numbers quoted in the post
#   artifacts/RESULTS-nemo-langs.txt, artifacts/RESULTS-nemo-coverage.md
```
