// Candidate transcript options for a clip.
//
// The transcripts in transcripts.json are machine predictions ("~" prefix).
// This module proposes a small, deduped set of plausible read-outs for the
// human to choose from, plus the free-text "other" the UI always offers.
//
// Sources, strongest first:
//   - the existing draft (predicted)
//   - NVIDIA NeMo text-normalization output for the same locale/input
//     (artifacts/RESULTS-nemo-langs.txt) — a real normalizer's string
//   - Intl.NumberFormat / Intl.DisplayNames renderings in the clip's locale
//     (localized name / code / symbol / plain-decimal written forms)
//   - the raw form, and the spelled code followed by the digits
//
// These are prompts, not answers. The point is that a correct read-out is
// usually one of these shapes; anything else goes in "other".

const SYMBOL_TO_CODE = {
  $: "USD",
  "US$": "USD",
  "€": "EUR",
  "£": "GBP",
  "¥": "JPY",
  "₩": "KRW",
  "₹": "INR",
  "฿": "THB",
  "R$": "BRL",
};

// Locale whose NeMo language key we can borrow without changing language.
// (Deliberately excludes zh-TW/en-GB/en-IN: NeMo's data is a different locale.)
const LOCALE_TO_NEMO = {
  "en-US": "en",
  "de-DE": "de",
  "es-ES": "es",
  "it-IT": "it",
  "zh-CN": "zh",
};

// e.g. "USD123.45", "$123.45", "IDR123,45", "IDR123" -> { prefix, digits }
export function splitForm(form) {
  const m = /^([^\d]+?)(\d[\d.,]*)$/.exec(form.trim());
  if (!m) return { prefix: "", digits: form };
  return { prefix: m[1], digits: m[2] };
}

export function codeFromForm(form) {
  const { prefix } = splitForm(form);
  if (!prefix) return null;
  if (SYMBOL_TO_CODE[prefix]) return SYMBOL_TO_CODE[prefix];
  if (/^[A-Za-z]{3}$/.test(prefix)) return prefix.toUpperCase();
  return null;
}

function decimalSeparator(locale) {
  try {
    const part = new Intl.NumberFormat(locale).formatToParts(1.1).find((p) => p.type === "decimal");
    return part ? part.value : ".";
  } catch {
    return ".";
  }
}

// Parse the digits as a number in the clip's locale.
export function amountFromForm(form, locale) {
  const { digits } = splitForm(form);
  const sep = decimalSeparator(locale);
  let normalized = digits;
  if (sep === ",") normalized = normalized.replace(/,/g, ".");
  else normalized = normalized.replace(/,/g, ""); // thousands
  const value = Number.parseFloat(normalized);
  return Number.isFinite(value) ? value : null;
}

// Parse artifacts/RESULTS-nemo-langs.txt into { lang: { input: output } }.
export function parseNemo(text) {
  const out = {};
  let lang = null;
  for (const line of text.split("\n")) {
    const heading = /^##\s+([a-z]{2})\b/.exec(line);
    if (heading) {
      lang = heading[1];
      out[lang] ??= {};
      continue;
    }
    if (!lang) continue;
    const m = /^\s*(.+?)\s*->\s*(.+?)\s*$/.exec(line);
    if (m && !m[1].startsWith("##")) out[lang][m[1].trim()] = m[2].trim();
  }
  return out;
}

// The NeMo artifact only carries the "123.45" amount, and codes are looked up
// as symbols where NeMo has them (€ for EUR, £ for GBP, ¥ for JPY).
function nemoFor(locale, form, nemo) {
  const lang = LOCALE_TO_NEMO[locale];
  if (!lang || !nemo[lang]) return null;
  const { prefix, digits } = splitForm(form);
  if (digits.replace(",", ".") !== "123.45") return null;
  const keys = [];
  if (SYMBOL_TO_CODE[prefix]) {
    keys.push(prefix === "US$" ? "$" : prefix);
  } else if (/^[A-Za-z]{3}$/.test(prefix)) {
    const code = prefix.toUpperCase();
    const symbolOf = { EUR: "€", GBP: "£", JPY: "¥" }[code];
    if (symbolOf) keys.push(`${symbolOf}123.45`);
    keys.push(`${code}123.45`);
  }
  for (const key of keys) if (nemo[lang][key]) return nemo[lang][key];
  return null;
}

function uniq(list) {
  const seen = new Set();
  const out = [];
  for (const item of list) {
    const value = (item.value ?? "").trim();
    if (!value) continue;
    const norm = value.normalize("NFC");
    if (seen.has(norm)) continue;
    seen.add(norm);
    out.push({ ...item, value });
  }
  return out;
}

// row: { locale, form, file }; transcripts: parsed transcripts.json
export function buildOptions(row, transcripts, nemo) {
  const { locale, form, file } = row;
  const code = codeFromForm(form);
  const amount = amountFromForm(form, locale);
  const draft = (transcripts[file] ?? "").replace(/^~\s*/, "").trim();
  const { digits } = splitForm(form);
  const options = [];

  if (draft) options.push({ value: draft, origin: "draft", note: "predicted draft" });

  const nemoAlt = nemoFor(locale, form, nemo);
  if (nemoAlt) options.push({ value: nemoAlt, origin: "nemo", note: "NeMo normalizer" });

  if (code && amount !== null) {
    const attempts = [
      ["name", { style: "currency", currency: code, currencyDisplay: "name" }],
      ["code", { style: "currency", currency: code, currencyDisplay: "code" }],
      ["symbol", { style: "currency", currency: code, currencyDisplay: "symbol" }],
      ["decimal", { style: "decimal" }],
    ];
    for (const [kind, opts] of attempts) {
      try {
        const value = new Intl.NumberFormat(locale, opts).format(amount);
        options.push({ value, origin: `intl:${kind}`, note: `Intl ${kind}` });
      } catch {
        /* locale/currency unsupported in this ICU build */
      }
    }
  }

  if (code) {
    options.push({
      value: `${code.split("").join(" ")} ${digits}`,
      origin: "code-spelled",
      note: "spelled code + digits",
    });
  }
  options.push({ value: form, origin: "literal", note: "the input, verbatim" });

  return uniq(options);
}
