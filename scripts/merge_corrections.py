"""Merge proofreading correction files (group0.json ... groupN.json) into data/corrections/<id>.json.

    python3 scripts/merge_corrections.py <book id> <dir with group*.json> [extra.json ...]
"""
import glob, json, os, re, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
book, d = sys.argv[1], sys.argv[2]
out, notes = [], []
for f in sorted(glob.glob(f'{d}/group*.json'), key=lambda f: int(re.search(r'group(\d+)', f).group(1))):
    for c in json.load(open(f)):
        (out if 'op' in c else notes).append(c)
for f in sys.argv[3:]: out += json.load(open(f))
json.dump(out, open(os.path.join(ROOT, f'data/corrections/{book}.json'), 'w'), ensure_ascii=False, indent=0)
json.dump(notes, open(os.path.join(ROOT, f'data/corrections/{book}.notes.json'), 'w'), ensure_ascii=False, indent=1)
print(len(out), 'corrections,', len(notes), 'notes')
