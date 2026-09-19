from nemo_text_processing.text_normalization.normalize import Normalizer

langs = ["en", "de", "es", "fr", "it", "pt", "sv", "vi", "zh", "ko", "hi", "ar", "hu", "ru", "hy"]
forms = ["$123.45", "USD123.45", "USD 123.45", "SGD123.45", "CNY123.45", "TWD123.45",
         "ZAR123.45", "€123.45", "£123.45", "¥123.45", "100 USD"]

for lang in langs:
    try:
        n = Normalizer(input_case="cased", lang=lang)
    except Exception as e:
        print(f"## {lang}: UNAVAILABLE ({type(e).__name__}: {e})")
        continue
    print(f"## {lang}")
    for s in forms:
        try:
            out = n.normalize(s, verbose=False, punct_post_process=False)
        except Exception as e:
            out = f"ERR {type(e).__name__}: {e}"
        print(f"   {s:12} -> {out}")
