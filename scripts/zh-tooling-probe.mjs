#!/usr/bin/env node
// How tools other than the formatter read a Chinese tag.
//
//   node scripts/zh-tooling-probe.mjs [outfile]
//
// Covers: plural categories, collator equivalence, Unicode normalization, and
// (if espeak-ng is on PATH) the voice each tag selects.

import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { spawnSync } from "node:child_process";

const OUT =
  process.argv[2] ??
  "public/posts/chinese-locale-tags/artifacts/RESULTS-tooling.txt";

const out = [];
const w = (...s) => out.push(...s);
const safe = (fn) => {
  try {
    return fn();
  } catch (e) {
    return `ERR:${e.name}`;
  }
};

w(
  "# How other tools read a Chinese tag",
  `# node ${process.version}  icu ${process.versions.icu}  cldr ${process.versions.cldr}`,
  "",
);

w("## plural categories (Intl.PluralRules, then ICU MessageFormat uses the same data)");
w("# locale\t0\t1\t2\t10");
for (const tag of ["en", "zh", "zh-Hant", "zh-HK", "yue"]) {
  const pr = new Intl.PluralRules(tag);
  w([tag, ...[0, 1, 2, 10].map((n) => pr.select(n))].join("\t"));
}
w("");

w("## does collation equate variant characters? (sensitivity: base)");
w("# pair\tzh\tzh-Hant\tnote");
for (const [a, b] of [
  ["台", "臺"],
  ["里", "裡"],
  ["后", "後"],
  ["面", "麵"],
  ["干", "乾"],
]) {
  const zh = new Intl.Collator("zh", { sensitivity: "base" }).compare(a, b);
  const hant = new Intl.Collator("zh-Hant", { sensitivity: "base" }).compare(a, b);
  w([`${a}/${b}`, zh, hant, zh === 0 ? "equal" : "different at primary weight"].join("\t"));
}
w("");

w("## Unicode normalization does not convert script");
for (const s of ["後", "后", "ＡＢＣ", "㈱", "Ⅻ", "ｶﾀｶﾅ"]) {
  w(
    [
      s,
      `NFC=${s.normalize("NFC") === s ? "unchanged" : s.normalize("NFC")}`,
      `NFKC=${s.normalize("NFKC") === s ? "unchanged" : s.normalize("NFKC")}`,
    ].join("\t"),
  );
}
w("");

w("## text-to-speech voice selected by tag (eSpeak NG, phoneme output for 你好)");
const probe = spawnSync("espeak-ng", ["--version"], { encoding: "utf8" });
if (probe.error) {
  w("# espeak-ng not on PATH, skipped");
} else {
  w(`# ${probe.stdout.split("\n")[0]}`);
  w("# tag\tphonemes");
  for (const tag of [
    "zh", "zh-CN", "zh-TW", "zh-HK", "zh-Hant", "zh-Hant-HK",
    "zh-Hans", "cmn", "yue", "yue-Hant-HK", "zh-yue",
  ]) {
    const r = spawnSync("espeak-ng", ["-v", tag, "-q", "-x", "你好"], {
      encoding: "utf8",
    });
    w([tag, r.status === 0 ? r.stdout.trim() : `failed: ${r.stderr.trim()}`].join("\t"));
  }
}
w("");

const text = out.join("\n") + "\n";
await mkdir(dirname(OUT), { recursive: true });
await writeFile(OUT, text);
process.stdout.write(text);
