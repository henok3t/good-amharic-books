"""Turn data/raw_catalog.json (+ optional data/titles.json) into data/catalog.json for the site.

titles.json maps book id -> {"am": "...", "en": "..."} (transcribed from the title images).
Storage layout used by the site:  files/<original file name>   (PDF / MP3 parts, title + cover images)
"""
import json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
raw = json.load(open(os.path.join(ROOT, "data/raw_catalog.json")))
tpath = os.path.join(ROOT, "data/titles.json")
titles = json.load(open(tpath)) if os.path.exists(tpath) else {}
mpath = os.path.join(ROOT, "data/missing.txt")
missing = set(open(mpath).read().split("\n")) if os.path.exists(mpath) else set()  # gone from the old server too

LANGS = [  # (prefix, code)
    ("amh", "am"), ("anh", "am"), ("tig", "ti"), ("eng", "en"), ("gre", "el"), ("geez", "gez"),
    ("oro", "om"), ("hayd", "hdy"), ("wol", "wal"), ("som", "so"), ("harar", "har"), ("kamb", "ktb"),
    ("kaff", "kbr"), ("kons", "kxc"), ("aari", "aiw"), ("gura", "sgw"), ("heb", "he"),
]
def langs(s):
    out = []
    for tok in re.split(r"[/\-\s]+", re.sub(r"<.*", "", s.lower())):
        for pre, code in LANGS:
            if tok.startswith(pre) and code not in out:
                out.append(code)
    return out or ["am"]

def group(cat):
    return re.sub(r"\s+\d+$", "", cat).strip()

def fname(url):
    return url.rsplit("/", 1)[-1] if url and "books.good-amharic-books.com/" in url else None

books, files = [], set()
for b in raw["books"]:
    parts = []
    for p in b["parts"]:
        f = fname(p["url"])
        # Nothing is ever linked to the old site: a part without a copied file is marked gone.
        gone = not f or f in missing
        parts.append({"label": re.sub(r"^[\s·]+|[\s·]+$", "", p["label"]), "file": None if gone else f,
                      "url": None, **({"gone": True} if gone else {})})
        if f: files.add(f)
    imgs = [fname(u) for u in ([b.get("titleImage")] + b.get("covers", [])) if fname(u)]
    title_img = fname(b.get("titleImage")) or (imgs[0] if imgs else None)
    covers = [i for i in dict.fromkeys(imgs) if i != title_img]
    files.update(i for i in [title_img] + covers if i)
    t = titles.get(str(b["id"]), {})
    slug = " ".join(sorted({re.sub(r"[-_]?(tit|cov|cr|title|titlebig|coverbig|all|\d+[a-z]?)$", "", os.path.splitext(f or "")[0].lower(), flags=re.I) for f in [title_img] + [p["file"] for p in parts] if f}))
    books.append({
        "id": b["id"],
        "titleAm": t.get("am", ""), "titleEn": t.get("en", ""),
        "author": "" if b["author"].strip("? ") == "" else b["author"],
        "langs": langs(b["language"]),
        "category": b["category"], "group": group(b["category"]),
        "titleImage": title_img, "cover": covers[0] if covers else None,
        "parts": parts, "keywords": slug,
        **({"hasText": True} if os.path.exists(os.path.join(ROOT, f"data/text/{b['id']}.json")) else {}),
        **({"pdfText": True} if os.path.exists(os.path.join(ROOT, f"data/pdf/{b['id']}-text.pdf")) else {}),
        **({"pdfScan": True} if os.path.exists(os.path.join(ROOT, f"data/pdf/{b['id']}-scan.pdf")) else {}),
        **({"hasEn": True} if os.path.exists(os.path.join(ROOT, f"data/text/{b['id']}.en.json")) else {}),
        **({"pdfTextEn": True} if os.path.exists(os.path.join(ROOT, f"data/pdf/{b['id']}-text-en.pdf")) else {}),
    })

cats = {}
for b in books:
    cats.setdefault(b["group"], 0); cats[b["group"]] += 1
out = {"generated": True, "groups": [{"name": k, "count": v} for k, v in cats.items()], "books": books}
json.dump(out, open(os.path.join(ROOT, "data/catalog.json"), "w"), ensure_ascii=False, separators=(",", ":"))
open(os.path.join(ROOT, "data/files.txt"), "w").write("\n".join(sorted(files)) + "\n")
print(len(books), "books,", len(cats), "groups,", len(files), "files,", sum(1 for b in books if b["titleAm"]), "titled", file=sys.stderr)
