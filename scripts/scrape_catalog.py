"""Scrape the good-amharic-books.com catalog (metadata only) into data/raw_catalog.json.

Only https://www.good-amharic-books.com is used. Book files and title images live on
books.good-amharic-books.com; their URLs are recorded, not downloaded.
"""
import concurrent.futures as cf, html, json, re, sys, time, urllib.parse, urllib.request, urllib.error, os

BASE = "https://www.good-amharic-books.com"
OUT = sys.argv[1] if len(sys.argv) > 1 else "data/raw_catalog.json"

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k): return None
opener = urllib.request.build_opener(NoRedirect)
UA = {"User-Agent": "Mozilla/5.0 (catalog mirror)"}

def get(path, tries=4):
    for i in range(tries):
        try:
            r = opener.open(urllib.request.Request(BASE + path, headers=UA), timeout=60)
            return r.status, r.read().decode("utf-8", "replace"), None
        except urllib.error.HTTPError as e:
            if e.code in (301, 302, 303, 307, 308):
                return e.code, "", e.headers.get("Location")
            if e.code == 404: return 404, "", None
            err = e
        except Exception as e:
            err = e
        time.sleep(2 * (i + 1))
    raise RuntimeError(f"{path}: {err}")

def clean(s):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", s))).strip()

# 1. List pages
rows = {}
p = 1
while True:
    _, body, _ = get(f"/library?list=1&p={p}")
    found = re.findall(r'<tr><td align="center"><a href="\./\?page=library&id=(\d+)"><img src="([^"]+)"[^>]*></a></td><td>(.*?)</td><td>(.*?)</td><td>(.*?)</td></tr>', body, re.S)
    if not found: break
    for bid, img, author, lang, cat in found:
        rows.setdefault(int(bid), {"id": int(bid), "titleImage": img, "author": clean(author), "language": clean(lang), "category": clean(cat)})
    print("list page", p, len(found), file=sys.stderr)
    p += 1
    if p > 40: break

# 2. Category pages (index, counts, images, membership incl. books missing from list)
_, lib, _ = get("/library")
cats = []
for slug in dict.fromkeys(re.findall(r'\./library\?category=([^"&]+)"', lib)):
    name = urllib.parse.unquote_plus(slug)
    _, body, _ = get(f"/library?category={slug}")
    ids = [int(x) for x in dict.fromkeys(re.findall(r'library\?id=(\d+)', body))]
    imgs = dict(re.findall(r'library\?id=(\d+)"[^>]*>\s*<img src="([^"]+)"', body))
    for bid in ids:
        r = rows.setdefault(bid, {"id": bid, "titleImage": imgs.get(str(bid)), "author": "", "language": "", "category": name})
        r.setdefault("categories", [])
        if name not in r["categories"]: r["categories"].append(name)
    cats.append({"name": name, "count": len(ids)})
    print("category", name, len(ids), file=sys.stderr)

# 3. Detail pages + file links
def detail(bid):
    _, body, _ = get(f"/library?id={bid}")
    b = body[body.find("<body"):]
    cover = re.findall(r'src="(http://books\.good-amharic-books\.com/[^"]+)"', b)
    cover = [c for c in cover if "/images/" not in c]
    parts = []
    for gid, attrs, inner in re.findall(r'<a href="\./library\?getbook=(\d+)"([^>]*)>(.*?)</a>', b, re.S):
        m = re.search(r"_trackPageview', '([^']+)'", attrs)
        pt = {"getbook": int(gid), "label": clean(inner.replace("<br>", " · "))}
        if m:
            pt["url"] = "http://books.good-amharic-books.com/" + m.group(1)
        else:
            pt["url"] = get(f"/library?getbook={gid}")[2]
        parts.append(pt)
    main = re.sub(r"<script.*?</script>|<style.*?</style>", "", b, flags=re.S)
    return bid, {"covers": cover, "parts": parts, "text": clean(main)}

with cf.ThreadPoolExecutor(4) as ex:
    for n, (bid, d) in enumerate(ex.map(detail, sorted(rows))):
        rows[bid].update(d)
        if n % 50 == 0: print("detail", n, len(rows), file=sys.stderr)

os.makedirs(os.path.dirname(OUT) or ".", exist_ok=True)
json.dump({"categories": cats, "books": [rows[k] for k in sorted(rows)]}, open(OUT, "w"), ensure_ascii=False, indent=1)
print("books", len(rows), "categories", len(cats), file=sys.stderr)
