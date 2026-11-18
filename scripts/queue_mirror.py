"""Queue files for a batch Cloud Function: mirror-batch (copy from old site) or count-batch (count PDF pages).

    ACCESS_TOKEN=$(gcloud auth print-access-token) python3 scripts/queue_mirror.py data/files.txt [prefix] [topic]

Files already in the bucket are skipped by the function, so re-queuing is safe.
"""
import base64, json, os, sys, urllib.request

PROJECT = "good-amharic-books-web"
names = [l.strip() for l in open(sys.argv[1]) if l.strip()]
prefix = sys.argv[2] if len(sys.argv) > 2 else "b"
TOPIC = sys.argv[3] if len(sys.argv) > 3 else "mirror-batch"
SIZE = int(os.environ.get("BATCH_SIZE", 30))
msgs = [{"data": base64.b64encode(json.dumps({"batch": f"{prefix}{i // SIZE:04d}", "files": names[i:i + SIZE]}).encode()).decode()}
        for i in range(0, len(names), SIZE)]
for i in range(0, len(msgs), 50):
    req = urllib.request.Request(f"https://pubsub.googleapis.com/v1/projects/{PROJECT}/topics/{TOPIC}:publish",
        data=json.dumps({"messages": msgs[i:i + 50]}).encode(),
        headers={"Authorization": f"Bearer {os.environ['ACCESS_TOKEN']}", "Content-Type": "application/json"})
    urllib.request.urlopen(req).read()
print(f"queued {len(names)} files in {len(msgs)} batches")
