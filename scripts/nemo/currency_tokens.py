import glob
import os

import nemo_text_processing
from nemo_text_processing.text_normalization.normalize import Normalizer

# Every language with a currency table (dir `text_normalization/<lang>/data/money`).
base = os.path.dirname(nemo_text_processing.__file__)
langs = ["en", "de", "es", "it", "pt", "sv", "vi", "zh", "ko", "hi", "ar", "hu"]

for lang in langs:
    d = os.path.join(base, "text_normalization", lang, "data", "money")
    if not os.path.isdir(d):
        print(f"## {lang}: no money dir")
        continue
    tokens = []
    for f in sorted(glob.glob(os.path.join(d, "*currenc*.tsv"))):
        for line in open(f, encoding="utf-8"):
            line = line.rstrip("\n")
            if not line or line.startswith("#"):
                continue
            tok = line.split("\t")[0].strip()
            if tok and tok not in tokens:
                tokens.append(tok)
    try:
        n = Normalizer(input_case="cased", lang=lang)
    except Exception as e:
        print(f"## {lang}: UNAVAILABLE ({e})")
        continue
    print(f"## {lang} ({len(tokens)} tokens)")
    for tok in tokens:
        s = tok + "123.45"
        try:
            out = n.normalize(s, verbose=False, punct_post_process=False)
        except Exception as e:
            out = f"ERR {type(e).__name__}"
        print(f"   {s:16} -> {out}")
