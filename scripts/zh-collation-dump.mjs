#!/usr/bin/env node
// Dumps how ICU resolves each Chinese collation type requested through the
// BCP 47 `-u-co-` extension.
//
//   node scripts/zh-collation-dump.mjs [outfile]
//
// Writes tab-separated results. Default outfile is the artifact path used by
// the post.

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const OUT =
  process.argv[2] ??
  "public/posts/chinese-locale-tags/artifacts/RESULTS-collation-types.txt";

// 20 surnames, chosen because pinyin, stroke, zhuyin and unihan all disagree.
const NAMES = [..."王李張陳劉黃吳周徐孫馬朱胡郭何林高羅鄭梁"];

// A wider set only for the "did the type take effect" comparison.
const WIDE = [
  ..."王李張陳劉黃吳周徐孫馬朱胡郭何林高羅鄭梁謝宋唐許韓馮鄧曹彭曾蕭田董潘袁蔡蔣余杜葉程魏蘇呂丁沈任姚盧傅鍾姜崔譚陸汪范金石廖賈夏韋付方白鄒孟熊秦邱江尹薛閻段雷侯龍",
];

const TYPES = [
  "pinyin",
  "stroke",
  "zhuyin",
  "unihan",
  "big5han",
  "gb2312",
  "gb2312han",
];

// CLDR aliases whose long form cannot fit a Unicode extension value.
const ALIASES = [
  ["gb2312", "gb2312han"],
  ["trad", "traditional"],
  ["dict", "dictionary"],
  ["phonebk", "phonebook"],
];

function attempt(fn) {
  try {
    return { ok: true, value: fn() };
  } catch (e) {
    return { ok: false, value: `${e.name}: ${e.message}` };
  }
}

function order(tag, chars) {
  const c = new Intl.Collator(tag);
  return [...chars].sort(c.compare).join("");
}

const lines = [];
const add = (...s) => lines.push(...s);

add(`# Chinese collation types through -u-co-`);
add(`# node ${process.version}  icu ${process.versions.icu}  cldr ${process.versions.cldr}`);
add(`# generated ${new Date().toISOString()}`);
add("");

add(`# requested\tcanonical\tresolved\tapplied\torder(${NAMES.length} surnames)`);
for (const type of TYPES) {
  const tag = `zh-Hant-u-co-${type}`;
  const canon = attempt(() => Intl.getCanonicalLocales(tag)[0]);
  if (!canon.ok) {
    add(`${type}\t-\t-\tno (${canon.value})\t-`);
    continue;
  }
  const resolved = attempt(
    () => new Intl.Collator(tag).resolvedOptions().collation,
  );
  const ordered = attempt(() => order(tag, NAMES));
  const applied = resolved.ok && resolved.value === type ? "yes" : "no";
  add(
    `${type}\t${canon.value}\t${resolved.value}\t${applied}\t${ordered.value}`,
  );
}
add("");

add(`# does the requested type change the order? (${WIDE.length} characters, zh-Hant)`);
const defaults = { zh: "pinyin", "zh-Hant": "stroke" };
for (const [locale, dflt] of Object.entries(defaults)) {
  add(`# locale ${locale} default=${dflt}`);
  const base = order(`${locale}-u-co-${dflt}`, WIDE);
  for (const type of TYPES) {
    const tag = `${locale}-u-co-${type}`;
    const got = attempt(() => order(tag, WIDE));
    add(
      `${type}\t${got.ok ? (got.value === base ? "same as default" : "differs") : "unavailable"}`,
    );
  }
  add("");
}

add("# alias reachability (Unicode extension values are 3-8 alphanumerics)");
add("# long form\tlength\tcanonical");
for (const [short, long] of ALIASES) {
  const canon = attempt(() => Intl.getCanonicalLocales(`zh-u-co-${long}`)[0]);
  add(
    `${long}\t${long.length}\t${canon.ok ? canon.value : `rejected, ${canon.value}`}`,
  );
  const shortCanon = attempt(() => Intl.getCanonicalLocales(`zh-u-co-${short}`)[0]);
  add(
    `${short}\t${short.length}\t${shortCanon.ok ? shortCanon.value : `rejected, ${shortCanon.value}`}`,
  );
}

const text = lines.join("\n") + "\n";
await mkdir(dirname(OUT), { recursive: true });
await writeFile(OUT, text);
console.log(text);
