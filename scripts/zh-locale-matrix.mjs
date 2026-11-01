#!/usr/bin/env node
// What each Chinese BCP 47 tag resolves to, and where the outputs diverge.
// Intl is backed by ICU/CLDR, so every value here is the shipped answer.
//
//   node scripts/zh-locale-matrix.mjs [outfile]

import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const OUT =
  process.argv[2] ??
  "public/posts/chinese-locale-tags/artifacts/RESULTS-locale-matrix.txt";

const TAGS = [
  "zh", "zh-Hans", "zh-Hant",
  "zh-CN", "zh-Hans-CN", "zh-TW", "zh-HK", "zh-MO", "zh-SG", "zh-MY",
  "zh-Hant-TW", "zh-Hant-HK", "zh-Hant-MO", "zh-Hans-SG", "zh-Hans-HK",
  "zh-US", "zh-GB", "zh-CA",
  "yue", "yue-Hans-CN", "cmn", "nan", "dng",
  "zh-Latn", "zh-Bopo",
];

const VALIDITY = [
  "zh-TW", "zh-Hant-HK", "zh-Latn-pinyin", "zh-x-private",
  "zh-yue", "zh-min-nan", "zh-CHS", "zh-CHT", "zh-HK-Hant",
];

// 20 surnames: pinyin, stroke, zhuyin and unihan all disagree.
const NAMES = [..."王李張陳劉黃吳周徐孫馬朱胡郭何林高羅鄭梁"];

const INSTANT = new Date(Date.UTC(2026, 0, 15, 4, 5, 6)); // 12:05:06 Taipei

function safe(fn) {
  try {
    return fn();
  } catch (e) {
    return `ERR:${e.name}`;
  }
}

const cur = (tag, code) =>
  safe(() =>
    new Intl.NumberFormat(tag, {
      style: "currency",
      currency: code,
      currencyDisplay: "name",
      maximumFractionDigits: 2,
    }).format(12.5),
  );

const unit = (tag, u) =>
  safe(() =>
    new Intl.NumberFormat(tag, {
      style: "unit",
      unit: u,
      unitDisplay: "long",
    }).format(1),
  );

const fmt = (tag, opts) =>
  safe(() =>
    new Intl.DateTimeFormat(tag, { timeZone: "Asia/Taipei", ...opts }).format(INSTANT),
  );

const rows = TAGS.map((tag) => {
  const loc = safe(() => new Intl.Locale(tag));
  const zones = loc instanceof Intl.Locale ? safe(() => loc.getTimeZones() ?? []) : [];
  return {
    tag,
    canonical: safe(() => Intl.getCanonicalLocales(tag).join(",")),
    script: loc instanceof Intl.Locale ? loc.script ?? "" : "",
    region: loc instanceof Intl.Locale ? loc.region ?? "" : "",
    maximized: loc instanceof Intl.Locale ? loc.maximize().toString() : "ERR",
    week: safe(() => new Intl.Locale(tag).getWeekInfo().firstDay),
    hourCycle: safe(
      () => new Intl.DateTimeFormat(tag, { hour: "numeric" }).resolvedOptions().hourCycle,
    ),
    tz: Array.isArray(zones)
      ? zones.length === 1
        ? zones[0]
        : zones.length > 1
          ? `(${zones.length} zones)`
          : ""
      : "",
    n1e12: safe(() => new Intl.NumberFormat(tag, { notation: "compact" }).format(1e12)),
    hkd: cur(tag, "HKD"),
    twd: cur(tag, "TWD"),
    meter: unit(tag, "meter"),
    mile: unit(tag, "mile"),
    date: fmt(tag, { dateStyle: "full" }),
    time: fmt(tag, { timeStyle: "medium" }),
    roc: fmt(tag, { dateStyle: "long", calendar: "roc" }),
    yesterday: safe(() =>
      new Intl.RelativeTimeFormat(tag, { numeric: "auto" }).format(-1, "day"),
    ),
    list: safe(() =>
      new Intl.ListFormat(tag, { type: "conjunction" }).format(["甲", "乙", "丙"]),
    ),
    sort: safe(() =>
      [...NAMES].sort(new Intl.Collator(tag).compare).join(""),
    ),
  };
});

const show = (s) =>
  String(s).replace(/ /g, "\u2423").replace(/\u00A0/g, "<NBSP>");

const out = [];
const w = (...s) => out.push(...s);

w(
  "# Chinese locale matrix",
  `# node ${process.version}  icu ${process.versions.icu}  cldr ${process.versions.cldr}`,
  `# instant ${INSTANT.toISOString()}  zone Asia/Taipei`,
  "",
  "## 1. resolution",
  "# tag\tcanonical\tscript\tregion\tmaximize()\tweek_start\thour_cycle\tdefault_tz",
  ...rows.map((r) =>
    [r.tag, r.canonical, r.script, r.region, r.maximized, r.week, r.hourCycle, r.tz].join("\t"),
  ),
  "",
  "## 2. formatting",
  "# tag\t1e12\tHKD\tTWD\tmetre\tmile\tdate\ttime\troc_calendar\tyesterday\tlist\tsort(20 names)",
  ...rows.map((r) =>
    [
      r.tag, r.n1e12, show(r.hkd), show(r.twd), show(r.meter), show(r.mile),
      show(r.date), show(r.time), show(r.roc), show(r.yesterday), show(r.list), r.sort,
    ].join("\t"),
  ),
  "",
  "## 3. tag validity",
  "# input\tcanonical\tmaximize()",
  ...VALIDITY.map((t) =>
    [
      t,
      safe(() => Intl.getCanonicalLocales(t).join(",")),
      safe(() => new Intl.Locale(t).maximize().toString()),
    ].join("\t"),
  ),
  "",
  "## 4. are these tag pairs the same locale?",
  "# pair\tidentical formatting",
  ...[
    ["zh", "zh-Hans-CN"],
    ["zh-HK", "zh-Hant-HK"],
    ["zh-MO", "zh-Hant-MO"],
    ["zh-TW", "zh-Hant-TW"],
    ["zh-SG", "zh-Hans-SG"],
  ]
    .map(([a, b]) => {
      const ra = rows.find((r) => r.tag === a);
      const rb = rows.find((r) => r.tag === b);
      const skip = ["tag", "canonical", "maximized", "script", "region"];
      const diff = Object.keys(ra).filter((k) => !skip.includes(k) && ra[k] !== rb[k]);
      return `${a} vs ${b}\t${diff.length === 0 ? "yes" : `no: ${diff.join(", ")}`}`;
    }),
  "",
  "## 5. extension probes",
  "# tag\tcollation\t123\t1e12",
  ...[
    "zh-Hant",
    "zh-Hant-u-co-pinyin",
    "zh-Hant-u-co-zhuyin",
    "zh-Hant-u-co-unihan",
    "zh-Hans-u-nu-hanidec",
    "zh-Hant-TW-u-ca-roc",
  ].map((t) =>
    [
      t,
      safe(() => new Intl.Collator(t).resolvedOptions().collation),
      safe(() => new Intl.NumberFormat(t).format(123)),
      safe(() => new Intl.NumberFormat(t, { notation: "compact" }).format(1e12)),
    ].join("\t"),
  ),
  "",
  "## 6. maximize and minimize",
  "# tag\tmaximize()\tminimize()",
  ...[
    "zh",
    "zh-Hans",
    "zh-Hant",
    "zh-Hans-CN",
    "zh-Hant-TW",
    "zh-HK",
    "zh-Hant-HK",
    "zh-Hans-HK",
    "zh-SG",
    "yue",
  ].map((t) =>
    [
      t,
      safe(() => new Intl.Locale(t).maximize().toString()),
      safe(() => new Intl.Locale(t).minimize().toString()),
    ].join("\t"),
  ),
  "",
);

const text = out.join("\n") + "\n";
await mkdir(dirname(OUT), { recursive: true });
await writeFile(OUT, text);
process.stdout.write(text);
