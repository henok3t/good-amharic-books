"""OCR book PDFs in the bucket with Cloud Vision (async, reads/writes Cloud Storage directly).

    ACCESS_TOKEN=$(gcloud auth print-access-token) python3 scripts/ocr_vision.py amid-1.PDF amid-2.PDF

Results: gs://<bucket>/ocr/vision/<file stem>/output-*.json (one JSON per 20 pages).
"""
import json, os, sys, time, urllib.request

PROJECT = "good-amharic-books-web"
BUCKET = "good-amharic-books-web.firebasestorage.app"

def call(url, body=None):
    req = urllib.request.Request(url, data=json.dumps(body).encode() if body is not None else None, headers={
        "Authorization": f"Bearer {os.environ['ACCESS_TOKEN']}", "Content-Type": "application/json", "X-Goog-User-Project": PROJECT})
    return json.load(urllib.request.urlopen(req, timeout=120))

def submit(files):
    reqs = [{
        "inputConfig": {"gcsSource": {"uri": f"gs://{BUCKET}/files/{f}"}, "mimeType": "application/pdf"},
        "features": [{"type": "DOCUMENT_TEXT_DETECTION"}],
        "imageContext": {"languageHints": ["am"]},
        "outputConfig": {"gcsDestination": {"uri": f"gs://{BUCKET}/ocr/vision/{os.path.splitext(f)[0]}/"}, "batchSize": 20},
    } for f in files]
    return call("https://vision.googleapis.com/v1/files:asyncBatchAnnotate", {"requests": reqs})["name"]

if __name__ == "__main__":
    op = submit(sys.argv[1:])
    print("operation", op, flush=True)
    while True:
        r = call(f"https://vision.googleapis.com/v1/{op}")
        if r.get("done"):
            print("error" if "error" in r else "done", json.dumps(r.get("error", ""))[:300]); break
        time.sleep(10)
