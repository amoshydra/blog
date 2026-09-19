// Category colouring for the currency transcripts.
//
// Splits a read-out into currency / number / decimal-point / minor-unit spans
// so a reader who cannot read the script can still see the structure. The
// vocabulary is small and finite (the gallery's 15 locales), so the classifier
// is a curated lexicon rather than a general tokenizer. Unknown tokens stay
// plain.

const POINT = new Set([
  "point", "dot", "komma", "koma", "virgule", "punto", "punt", "virgola", "titik",
  "点", "點", "புள்ளி", "จุด",
]);

// minor unit (cents/pence/…); "cent" is handled per locale below because French
// "cent" means one hundred.
const MINOR = new Set([
  "cent", "cents", "centesimi", "centesimo", "céntimo", "céntimos", "centavo",
  "centavos", "centime", "centimes", "pence", "penny", "paise", "paisa", "sen",
  "satang", "satangs", "セント", "美分", "เซ็นต์", "สตางค์", "சென்ட்",
]);

const NUMBER = new Set([
  // English
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
  "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen",
  "seventeen", "eighteen", "nineteen", "twenty", "thirty", "forty", "fifty",
  "sixty", "seventy", "eighty", "ninety", "hundred", "thousand", "million", "billion",
  // German
  "null", "eins", "ein", "eine", "zwei", "drei", "vier", "fünf", "sechs", "sieben",
  "acht", "neun", "zehn", "elf", "zwölf", "zwanzig", "dreißig", "vierzig",
  "fünfzig", "sechzig", "siebzig", "achtzig", "neunzig", "hundert", "tausend",
  "einhundertdreiundzwanzig", "fünfundvierzig",
  // French
  "zéro", "un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf",
  "dix", "onze", "douze", "vingt", "trente", "quarante", "cinquante", "soixante",
  "cent", "mille", "vingt-trois", "quarante-cinq",
  // Spanish
  "cero", "uno", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho",
  "nueve", "diez", "once", "doce", "veinte", "treinta", "cuarenta", "cincuenta",
  "sesenta", "setenta", "ochenta", "noventa", "cien", "ciento", "mil", "veintitrés",
  // Italian
  "zero", "uno", "due", "tre", "quattro", "cinque", "sei", "sette", "otto", "nove",
  "dieci", "undici", "dodici", "venti", "trenta", "quaranta", "cinquanta",
  "sessanta", "settanta", "ottanta", "novanta", "cento", "mille",
  "centoventitré", "quarantacinque",
  // Dutch
  "nul", "een", "twee", "drie", "vier", "vijf", "zes", "zeven", "acht", "negen",
  "tien", "elf", "twaalf", "twintig", "dertig", "veertig", "vijftig", "zestig",
  "zeventig", "tachtig", "negentig", "honderd", "duizend",
  "honderddrieëntwintig", "vijfenveertig",
  // Indonesian
  "nol", "satu", "dua", "tiga", "empat", "lima", "enam", "tujuh", "delapan",
  "sembilan", "sepuluh", "sebelas", "puluh", "seratus", "seribu", "ribu", "juta",
  // Tamil
  "நூற்று", "இருபத்து", "இருபத்தி", "மூன்று", "நான்கு", "ஐந்து", "ஒன்று",
  "பூஜ்யம்", "நாற்பத்தைந்து",
]);

const CURRENCY_RE =
  /dollar|dólar|dolar|euro|pound|rupee|rupiah|baht|franc|krona|krone|peso|yen|yuan|won|real|singapor|singapur|singapura|singapour|amerik|american|americain|américain|united|states|british|indian|estadounidense|serikat/i;

// ISO 4217 codes read out as codes, and Tamil words/letter-names used when the
// engine spells a code (யு எஸ் டி = "U S D").
const CURRENCY_CODES_RE =
  /^(USD|EUR|JPY|GBP|CNY|AUD|CAD|CHF|HKD|SGD|KRW|INR|NZD|SEK|NOK|MXN|TWD|ZAR|BRL|THB|IDR|JP)$/i;
const CURRENCY_TOKENS = new Set([
  "டாலர்", "ரூபாய்", "பாத்",
  "யு", "எஸ்", "ஜி", "டி", "ஐ", "என்", "ஆர்",
]);

const DIGITS_RE = /^[0-9][0-9.,\u066b\u066c]*$/;

function classifyToken(token, locale) {
  const lower = token
    .toLowerCase()
    .replace(/^[\s.,;:!?'"“”‘’()[\]…-]+|[\s.,;:!?'"“”‘’()[\]…-]+$/gu, "");
  if (!lower) return "other";
  if (POINT.has(lower)) return "point";
  if (lower === "cent" && locale.startsWith("fr")) return "number"; // French "cent" = 100
  if (MINOR.has(lower)) return "minor";
  if (DIGITS_RE.test(token) || NUMBER.has(lower)) return "number";
  if (CURRENCY_CODES_RE.test(token) || CURRENCY_TOKENS.has(token)) return "currency";
  if (CURRENCY_RE.test(token)) return "currency";
  return "other";
}

// Collapse neighbouring spans of the same kind (e.g. the per-character CJK
// number runs) so the rendered HTML has one span per run.
function mergeSpans(spans) {
  const out = [];
  for (const span of spans) {
    const last = out[out.length - 1];
    if (last && last.kind === span.kind && span.kind !== "other") last.text += span.text;
    else out.push({ ...span });
  }
  return out;
}

// ---- CJK / Thai: no word spaces, so scan by longest alternative -------------

const CJK_RULES = [
  ["currency", [
    "シンガポールドル", "新加坡元", "新台币", "新台幣", "人民币", "人民幣", "日本円",
    "米ドル", "ドル", "美元", "欧元", "歐元", "英镑", "英鎊", "港元", "元", "円", "JP",
  ]],
  ["point", ["点", "點"]],
  ["minor", ["美分", "セント"]],
  // number chars: 零〇一二三四五六七八九十百千万亿两
  ["number", [/\u96f6|\u3007|\u4e00|\u4e8c|\u4e09|\u56db|\u4e94|\u516d|\u4e03|\u516b|\u4e5d|\u5341|\u767e|\u5343|\u4e07|\u4ebf|\u4e24/]],
];

const THAI_RULES = [
  ["currency", ["ดอลลาร์", "สิงคโปร์", "บาท"]],
  ["point", ["จุด"]],
  ["minor", ["เซ็นต์", "สตางค์"]],
  ["number", [/(?:หนึ่ง|สอง|สาม|สี่|ห้า|หก|เจ็ด|แปด|เก้า|สิบ|ร้อย|พัน|หมื่น|แสน|ล้าน|ยี่|ศูนย์)+/]],
];

function classifyByScan(text, rules) {
  const out = [];
  let i = 0;
  let plain = "";
  const flush = () => {
    if (plain) out.push({ text: plain, kind: "other" });
    plain = "";
  };
  while (i < text.length) {
    let best = null;
    for (const [kind, alts] of rules) {
      for (const alt of alts) {
        let m = null;
        if (typeof alt === "string") {
          if (text.startsWith(alt, i)) m = alt;
        } else {
          const mm = text.slice(i).match(alt);
          if (mm && mm.index === 0) m = mm[0];
        }
        if (m && (!best || m.length > best.text.length)) best = { text: m, kind };
      }
    }
    if (best) {
      flush();
      out.push({ text: best.text, kind: best.kind });
      i += best.text.length;
    } else {
      plain += text[i];
      i += 1;
    }
  }
  flush();
  return out;
}

function isScripted(locale) {
  return /^(zh|yue|ja|th)/.test(locale);
}

export function classifyTranscript(text, locale) {
  if (isScripted(locale)) {
    return mergeSpans(classifyByScan(text, /^th/.test(locale) ? THAI_RULES : CJK_RULES));
  }
  const tokens = text.split(/(\s+)/); // keep whitespace
  return mergeSpans(
    tokens
      .filter((t) => t !== "")
      .map((t) => (/\s/.test(t) ? { text: t, kind: "other" } : { text: t, kind: classifyToken(t, locale) }))
  );
}

const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };

export function renderTranscriptHtml(text, locale) {
  return classifyTranscript(text, locale)
    .map(({ text: t, kind }) => {
      const safe = t.replace(/[&<>"]/g, (c) => ESC[c]);
      return kind === "other" ? safe : `<span class="tx tx-${kind}">${safe}</span>`;
    })
    .join("");
}
