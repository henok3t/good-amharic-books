"""Copy every book file and image from the old site into the private Cloud Storage bucket.

Run this on your own computer (the old server only serves these files over plain HTTP):

    gcloud auth login                       # sign in with the account that owns the project
    python3 scripts/mirror_files.py

It reads the file list from the catalog already in the bucket, downloads into ./mirror/
(re-runnable: finished files are skipped), then uploads with `gcloud storage rsync`.
Files the old server no longer has are listed in mirror/_missing.txt.
"""
import concurrent.futures as cf, json, os, subprocess, sys, time, urllib.error, urllib.request

BUCKET = "gs://good-amharic-books-web.firebasestorage.app"
SOURCE = "http://books.good-amharic-books.com/"
OUT = "mirror"

def files_from_catalog():
    raw = subprocess.run(["gcloud", "storage", "cat", f"{BUCKET}/catalog/catalog.json"], check=True, capture_output=True).stdout
    names = set()
    for b in json.loads(raw)["books"]:
        names.update(x for x in [b.get("titleImage"), b.get("cover")] if x)
        names.update(p["file"] for p in b["parts"] if p.get("file"))
    return sorted(names)

def fetch(name):
    dest = os.path.join(OUT, name)
    if os.path.exists(dest) and os.path.getsize(dest) > 0:
        return name, "skip", os.path.getsize(dest)
    url = SOURCE + urllib.request.quote(name)
    for attempt in range(4):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"}), timeout=120) as r:
                tmp = dest + ".part"
                with open(tmp, "wb") as f:
                    while chunk := r.read(1 << 16):
                        f.write(chunk)
                os.replace(tmp, dest)
                return name, "ok", os.path.getsize(dest)
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return name, "missing", 0
        except Exception:
            pass
        time.sleep(3 * (attempt + 1))
    return name, "failed", 0

def main():
    os.makedirs(OUT, exist_ok=True)
    names = files_from_catalog()
    print(f"{len(names)} files to copy", flush=True)
    done = total = 0; missing, failed = [], []
    with cf.ThreadPoolExecutor(4) as ex:
        for name, status, size in ex.map(fetch, names):
            done += 1; total += size
            if status == "missing": missing.append(name)
            if status == "failed": failed.append(name)
            if done % 100 == 0 or done == len(names):
                print(f"  {done}/{len(names)}  {total / 1e9:.2f} GB  missing {len(missing)}  failed {len(failed)}", flush=True)
    open(os.path.join(OUT, "_missing.txt"), "w").write("\n".join(missing + failed) + "\n")
    print("Uploading to Cloud Storage...", flush=True)
    subprocess.run(["gcloud", "storage", "rsync", "--recursive", "--exclude", r"^_missing\.txt$|\.part$",
                    OUT, f"{BUCKET}/files"], check=True)
    print(f"Done. {len(missing)} missing on the old server, {len(failed)} failed (re-run to retry).")

if __name__ == "__main__":
    sys.exit(main())
