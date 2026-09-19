import glob
import os

import nemo_text_processing
from nemo_text_processing.text_normalization.normalize import Normalizer

# ~110 ISO 4217 codes, roughly by traded volume (BIS 2022 first, then common others).
ISO = """USD EUR JPY GBP CNY AUD CAD CHF HKD SGD KRW INR NZD SEK NOK MXN TWD ZAR BRL THB
PLN DKK IDR HUF CZK ILS CLP PHP AED COP SAR MYR RON TRY BGN HRK RSD RUB UAH ISK BAM
MDL GEL AMD AZN BYN ARS PEN UYU VES DOP GTQ CRC PAB JMD TTD BOB PYG HNL NIO CUP
VND PKR BDT LKR NPR KHR MMK KZT UZS MNT KGS TJS TMT AFN IQD IRR JOD KWD LBP OMR QAR
BHD YER SYP NGN KES GHS EGP MAD TND DZD ETB TZS UGX XOF XAF ZMW MUR RWF MZN BWP NAD
SDG FJD PGK""".split()

SYMBOL_TO_ISO = {
    "$": "USD", "US$": "USD", "USD$": "USD",
    "€": "EUR", "£": "GBP", "¥": "JPY", "₩": "KRW", "₹": "INR", "฿": "THB",
    "R$": "BRL", "HK$": "HKD", "hk$": "HKD", "NZ$": "NZD", "nz$": "NZD",
    "C$": "CAD", "A$": "AUD", "S$": "SGD",
    # lowercase tokens in the English table that the ISO-uppercase check misses
    "rs": "INR", "r": "BRL",
}


def common_suffix_len(a: str, b: str) -> int:
    n = 0
    while n < min(len(a), len(b)) and a[-1 - n] == b[-1 - n]:
        n += 1
    return n


base = os.path.dirname(nemo_text_processing.__file__)
langs = ["en", "de", "es", "it", "pt", "sv", "vi", "zh", "ko", "hi", "ar", "hu"]

print("iso\tlang\ttoken\tcategory\tmajor\toutput")
for lang in langs:
    d = os.path.join(base, "text_normalization", lang, "data", "money")
    if not os.path.isdir(d):
        continue
    tok_major = {}
    stems = set()
    for f in sorted(glob.glob(os.path.join(d, "*.tsv"))):
        for line in open(f, encoding="utf-8"):
            line = line.rstrip("\n")
            if not line or line.startswith("#"):
                continue
            cols = line.split("\t")
            if len(cols) < 2:
                continue
            tok, word = cols[0].strip(), cols[1].strip()
            if not tok:
                continue
            if "currenc" in os.path.basename(f):
                tok_major.setdefault(tok, word)
            w = word.strip().lower()
            if w:
                stems.add(w)
                if len(w) > 4:
                    stems.add(w[:4])
    try:
        n = Normalizer(input_case="cased", lang=lang)
    except Exception:
        continue
    # Control: a token that is definitely not a currency -> digit-by-digit tail.
    try:
        control = n.normalize("QZX123.45", verbose=False, punct_post_process=False)
    except Exception:
        control = ""
    iso_tok = {}
    for tok, major in tok_major.items():
        iso = tok.upper() if tok.upper() in ISO else SYMBOL_TO_ISO.get(tok)
        if iso and iso not in iso_tok:
            iso_tok[iso] = (tok, major)
    for iso in ISO:
        if iso not in iso_tok:
            continue
        tok, major = iso_tok[iso]
        s = tok + "123.45"
        try:
            out = n.normalize(s, verbose=False, punct_post_process=False)
        except Exception as e:
            print(f"{iso}\t{lang}\t{tok}\terr\t{major}\tERR {type(e).__name__}")
            continue
        verbatim = common_suffix_len(control, out) >= 10
        named = any(st in out.lower() for st in stems)
        if verbatim and named:
            cat = "symbol"      # currency word spoken, amount still digit-by-digit
        elif verbatim:
            cat = "text"        # nothing currency-specific
        elif named:
            cat = "money"       # major unit (and usually minor) spoken
        else:
            cat = "other"
        print(f"{iso}\t{lang}\t{tok}\t{cat}\t{major}\t{out}")
