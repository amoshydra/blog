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
- `public/posts/chinese-locale-tags/artifacts/RESULTS-locale-matrix.txt` — 24
  tags: resolution, formatting, validity, region-versus-script identity,
  extension probes, and maximize/minimize round trips.
- `public/posts/chinese-locale-tags/artifacts/RESULTS-collation-types.txt` — the
  `-u-co-` sweep.
- `public/posts/chinese-locale-tags/artifacts/RESULTS-tooling.txt` — plural
  categories, collator comparisons, NFKC, eSpeak voice selection.
- `scripts/zh-locale-matrix.mjs`, `scripts/zh-collation-dump.mjs`,
  `scripts/zh-tooling-probe.mjs` — regenerate the three artifacts.

## Regenerating

```sh
node scripts/zh-locale-matrix.mjs
node scripts/zh-collation-dump.mjs
node scripts/zh-tooling-probe.mjs
```

The third shells out to `espeak-ng` and skips that section when it is missing.

## Facts to keep honest if edited

- `zh` is identical to `zh-Hans-CN` in every measured field. That is the whole
  premise; keep the artifact section that proves it.
- `zh-Hant` maximises to `zh-Hant-TW`. There is no neutral Traditional locale.
  Never write "Traditional Chinese" without naming the region in the same
  paragraph.
- `maximize()` and `minimize()` are not inverses as strings, only as locales.
  `minimize()` favours the region (`zh-Hant-TW` → `zh-TW`); CLDR's `favorScript`
  mode is not exposed by `Intl`.
- The likely-subtags list has 18 explicit `zh-*` entries, all regional ones
  mapping to Hant, with no explicit Hans entry. The post calls it editorial;
  keep that, because the list is not a demographic claim.
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
- i18next behaviour comes from `src/LanguageUtils.js`, not from running the
  library: full code, then script part, then language part, then `fallbackLng`.
  Do not claim the post measured a running i18next app.
- eSpeak NG 1.52.0 maps every `zh*` tag to the same Mandarin voice and only
  `yue*` to Cantonese. `zh-yue` still maps to Cantonese there even though `Intl`
  rejects it. Do not generalise this to screen readers with regional voices;
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

- **Re-runnable:** the three scripts. All are Node `Intl` plus an optional
  `espeak-ng` call.
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
