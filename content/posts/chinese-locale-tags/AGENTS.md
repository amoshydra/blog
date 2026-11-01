# chinese-locale-tags

An introduction to Chinese locale tags for the two-locale app: the frame is what
`zh` alone means, what each slot adds, and how the tools that read the tag
disagree. Measurements over definitions.

## Layout

- `index.mdx` — the post.
- `hero.webp` — cover.
- `public/posts/chinese-locale-tags/tag-playground.html` — the live panel:
  type a tag, see what *this browser's* ICU does with it. Standalone HTML, no
  build step, no dependencies.
- `src/components/mdx/TagPlayground.astro` — same-origin iframe wrapper. The
  frame reports its height with `postMessage`, so the panel never scrolls
  inside the post. `Open in a tab` points at the same page.
- `src/components/mdx/CldrZhTimeline.astro` — the release timeline. Data is
  inline (region, first release, removal date); release dates come from
  https://cldr.unicode.org/index/downloads. The 2008 add-and-revert is in the
  caption because it never shipped.
- `public/posts/chinese-locale-tags/artifacts/RESULTS-locale-matrix.txt` — 25
  tags: resolution, formatting, validity, region-versus-script identity,
  extension probes, and maximize/minimize round trips.
- `public/posts/chinese-locale-tags/artifacts/RESULTS-collation-types.txt` — the
  `-u-co-` sweep.
- `public/posts/chinese-locale-tags/artifacts/RESULTS-tooling.txt` — plural
  categories, collator comparisons, NFKC, eSpeak voice selection.
- `scripts/zh-locale-matrix.mjs`, `scripts/zh-collation-dump.mjs`,
  `scripts/zh-tooling-probe.mjs` — regenerate the three artifacts.
- `scripts/apple-voice-probe.swift` — compiles for macOS or the iOS simulator
  and prints the resolved voice per tag. Read-only, no audio.
- `public/posts/chinese-locale-tags/artifacts/RESULTS-apple-voices.txt` — the
  Apple output for macOS 27.0.1 and iOS 18.6, 26.5, 27.0, 27.1 and 27.2.
- Artifact links in the post are relative (`artifacts/...`), not
  `/blog/posts/...`, so they resolve on the root-mounted PR preview and on the
  `/blog` production host.

## Regenerating

```sh
node scripts/zh-locale-matrix.mjs
node scripts/zh-collation-dump.mjs
node scripts/zh-tooling-probe.mjs
```

The third shells out to `espeak-ng` and skips that section when it is missing.

## Facts to keep honest if edited

- `zh` is identical to `zh-Hans-CN` for every formatter output, but not as an
  identifier: `getCanonicalLocales` keeps `zh`, and `getTimeZones()` returns
  nothing for `zh` and two zones for `zh-Hans-CN`. The artifact's section 4
  reports `no: tz` for the pair, which is correct. Do not restore a
  "byte-for-byte" or "every field" claim.
- `zh-Hant` maximises to `zh-Hant-TW`. There is no neutral Traditional locale.
  Never write "Traditional Chinese" without naming the region in the same
  paragraph.
- `maximize()` and `minimize()` are not inverses as strings, only as locales.
  `minimize()` favours the region (`zh-Hant-TW` → `zh-TW`); CLDR's `favorScript`
  mode is not exposed by `Intl`. Store the explicit tag; use the minimized form
  only for URLs and labels, because the short form depends on the CLDR table.
- The likely-subtags table is generated from `country_language_population.tsv`,
  not hand-picked: the 15 `zh-<region>` keys are exactly the territories whose
  population row carries `zh_Hant`. HK, MO and TW date from CLDR 1.5.1 (2007);
  the other 12 arrived in CLDR 23 (2013), when the file became generated. There
  were 16 keys from CLDR 23 to 37: CLDR-13396 changed Malaysia's row to `zh`
  and `zh_MY` disappeared in CLDR 38 (2020-10-28). `zh-CA` and `zh-SG` never existed. "No Hans
  key" is structural, because the generator drops redundant
  `zh-XX -> zh-Hans-XX` rows. Do not call the list fixed, hand-picked or a
  census. CLDR 49 is unchanged; CLDR 50 is not released.
- `cmn` canonicalises to `zh`; `yue` does not. This is CLDR's alias table, not
  BCP 47.
- `zh` defaults to `pinyin` collation, `zh-Hant` to `stroke`.
- `zh-Hans-HK` is a real tag (IANA, added 2005) with real CLDR data, and it
  minimises to itself. Its behaviour is field-dependent: region-keyed formats
  (currency spacing, day period, 12-hour clock, week start) follow Hong Kong,
  while script-keyed vocabulary, collation and compact patterns stay Simplified.
  `1T` belongs to the Hant-HK numbers data, not to Hong Kong, so do not
  generalise "Hong Kong uses 1T" to the Hans tag.
- `big5han` and `gb2312` are deprecated and fall back silently. `gb2312han` is 9
  characters against `alphanum{3,8}`, so it throws before any type lookup; the
  8-character `gb2312ha` parses. Keep that pair.
- `-u-nu-hanidec` applies to currency and percent too (`¥一二.五〇`, `二五%`).
- Apple voice selection is measured, not inferred. On iOS 18.6, bare `yue`
  resolves to Sinji (`zh-HK`) but `yue-Hant-HK` and `yue-Hans-CN` return nil. In
  iOS 26.5+ and macOS 27, Sinji reports `yue-HK` and every `yue` form resolves.
  For `zh` tags the region decides the voice and the script is ignored, so
  `zh-Hans-HK` also gets Cantonese. `zh-Hant` picked Meijia (`zh-TW`) on 18.6
  but picks Tingting (`zh-CN`) from 26.5, despite maximizing to `zh-Hant-TW`.
  In 26.5+ the resolver is region-only for `zh`: TW gets Meijia, HK and MO get
  Sinji, every other region tested gets Tingting (`zh-CN`), regardless of
  script. `zh-Hant-TW` gets Meijia on every version. 18.6 was inconsistent:
  `zh-Hans-TW` and `zh-Hant-MO` got Tingting there. Do not write "the script is
  always ignored"; it is ignored in 26.5+ only. These are simulator results;
  device voice inventories can differ, and Siri voices are not available to
  third-party apps.
- i18next behaviour comes from `src/LanguageUtils.js`, not from running the
  library: full code, then script part, then language part, then `fallbackLng`.
  Do not claim the post measured a running i18next app.
- The i18next advice is source-derived from v26.6.0 and spot-checked in a
  harness. `fallbackLng` entries are appended, not re-resolved, and a specific
  entry suppresses `default`. A lone `zh-HK` resolves to `zh-Hans`; an array
  ending in `en` resolves to `en`; `getFixedT("zh-HK")` returns `en`.
  `convertDetectedLanguage` belongs to the detector plugin (browser 7.1+,
  http-middleware 3.6+). Normalize with `Intl.Locale.maximize()` at every entry
  point, map `yue`/`zh-yue` to `zh-Hant-HK` without a yue bundle, and keep
  `zh-Hans-HK` if shipped. The converter rewrites `i18n.language`, and the
  formatter follows it. Server-side, the parser splits `zh-Hant-HK`; use both
  `lookupHeaderRegex` and the converter. v25 changed best-match to try the
  script part; v26 removed `interpolation.format`.
- The HTTP guidance (`Content-Language` is what was served, `Vary:
  Accept-Language`, path-based locale) is engineering practice, not measured in
  this post. The HK override rule (under ~10% of strings) is a heuristic, not a
  measurement. The MySQL collation `utf8mb4_zh_0900_as_cs` is version-specific;
  check it against the target server.
- eSpeak NG 1.52.0 maps every `zh*` tag except `zh-yue` to the same Mandarin
  voice; `yue*` and `zh-yue` map to Cantonese. `zh-yue` still resolves even
  though `Intl` rejects it. Do not generalise this to screen readers with regional voices;
  the post says engines can use regional voices when they ship them.
- `Intl.Collator(..., { sensitivity: "base" })` does **not** equate 台/臺,
  里/裡, 后/後. Do not add a claim that collation helps with variant search.
- NFC/NFKC do not convert script. They fold width and compatibility forms only.

## Theme

The playground follows the post's toggle instead of `prefers-color-scheme`
alone:

- The iframe page reads `parent.document.documentElement.dataset.colorScheme`
  in an inline head script, so it paints in the right scheme before first paint.
  Standalone tabs fall back to the OS through `color-scheme: light dark`.
- `TagPlayground.astro` observes `<html>` for `data-color-scheme` changes and
  posts `{ type: "zh-playground-theme", theme }` to the frame.
- `?theme=dark` or `?theme=light` on the page URL overrides both, which is handy
  when sharing a link.
- Colours use `light-dark()` inside an `@supports` block, with static light
  values declared first so an unsupported browser keeps a readable page.

## What can and cannot be re-run here

- **Re-runnable:** the three Node scripts, and the Apple probe on a Mac with
  Xcode. The probe needs `xcrun swiftc` and, for iOS, a booted simulator.
- **Re-runnable in the reader's browser:** the playground page. It runs the
  same `Intl` probes against the reader's own ICU, so its numbers can differ
  from the Node tables. That is intended; both the page and the post say so.
  It cannot run the eSpeak probe.
- **Not measured:** a real i18next app, NVDA, VoiceOver, TalkBack, Windows SAPI
  voices, browsers other than the installed Chrome, and glyph rendering under
  `lang`. The post cites sources for those and says which one it measured.
- **Not covered:** `Accept-Language` distributions. The post only notes that the
  region is what browsers send upstream.

## Hero

Base art generated with the local ComfyUI **MOSS-Image** model
(`moss_image_sft_int8_convrot.safetensors`, ComfyUI 0.43.1 native support):
`1536×768`, 30 steps, CFG 2.5, `er_sde` / `simple`, skip-layer guidance on
`single_layers:"22"` for 0 to 0.5, seed `12345`. The prompt asks for three glass
tubes holding the same four cubes in three different permutations, with the left
half left empty. The raw render is
`.hero-candidates/moss-locale-banner_00001_.png`.

Text is composited with ImageMagick + Pango, not model-rendered: kicker at
`+130+170`, headline at `+128+235`, the three `tag -> value` rows at `+132+565`,
`+660`, `+745`. Each row is one source line in its `pango:` file because Pango
turns source newlines into hard breaks. To change the headline, re-render the
Pango layer and re-composite; do not paint over the type.
