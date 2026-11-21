"""Book-standard formatting fixes for a finished book, applied to the Amharic text and (if present) the English translation.

    python3 scripts/apply_format.py <book id>

Reads data/corrections/<id>-format.json and edits data/text/<id>.json and data/text/<id>.en.json in place. Run it again after
every rebuild (build_book_text.py) or re-assembly (translate_book.py assemble); every step is idempotent.

Format file:
  {"blocks": [{"id": "20-5", "lang": "both|am|en", "t": "h2", "x": "new text", "sub": [[regex, repl], ...]}, ...],
   "toc": [{"num": "5.5", "page": 289, "b": 0, "level": 3}, ...]}   (contents entries are re-sorted into reading order)
Block types are changed in both languages (they share one structure). Generic typography (both languages):
  - straight quotes → curly; ". . ." / "..." → "…"; a spaced hyphen between words → en dash; digit ranges with "-" → "–"
  - Amharic: no-break space before ። ፣ ፤ ፥ ፦ (punctuation never starts a line), "17 ፥ 5" kept together
  - headings: no trailing ; . ። ፣ ፤
"""
import json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NB, NNB = ' ', ' '


def curly(t):
    t = re.sub(r'(^|[\s(\[—–\-‘])"', r'\1“', t); t = t.replace('"', '”')
    t = re.sub(r"(^|[\s(\[—–\-“])'", r'\1‘', t); t = t.replace("'", '’')
    return t


def typography(x, lang, t):
    if not x: return x
    x = re.sub(r'\.\s?\.\s?\.(?!\.)', '…', x)                      # ". . ." and "..." → "…"
    x = re.sub(r'(?<=[^\s\d]) - (?=\S)|(?<=\S) - (?=[^\s\d])', ' – ', x)   # spaced hyphen used as a dash
    x = re.sub(r'(?<=\d) ?- ?(?=\d)', '–', x)                      # 117-118, 1932 - 1982 → en dash
    if '"' in x or "'" in x: x = curly(x)
    if lang == 'am':
        x = re.sub(r'[  ]+([።፣፤፥፦፧፨])', NB + r'\1', x)         # Ethiopic punctuation never starts a line
        x = re.sub(r'(\d)[\s  ]*፥[\s  ]*(\d)', r'\1' + NNB + '፥' + NNB + r'\2', x)
    if t in ('h1', 'h2'): x = re.sub(r'[\s ]*[;.።፣፤]+$', '', x)
    return x


SUP = str.maketrans('0123456789', '⁰¹²³⁴⁵⁶⁷⁸⁹')
NOT_CALL = re.compile(r'(?:\b(?:Ps|p|pp|no|nos|sec|secs|ch|vol|Vol|Lecture|Homily|Letter|Ep|Oration|Book|Chapter|Part|vv?|ff)|ቁ|ገጽ|ምዕ|ምዕራፍ|ክፍል|ትምህርት|መልእክት|ድርሳን)\.?\s*$')


def superscript_calls(tx, log):
    """Footnote numbers left as plain digits in the text ("Christians.” 30 The …") become superscript calls, but only for
    numbers of notes printed on the same or the next page, right after punctuation, and never after "p.", "no.", "Ps." …"""
    pages = tx['pages']
    nums_on = [{int(m.group(1)) for b in p['blocks'] if b['t'] == 'fn' for m in [re.match(r'^\*?(\d{1,3})\b', b['x'].strip())] if m}
               for p in pages]
    for i, p in enumerate(pages):
        cand = nums_on[i] | (nums_on[i + 1] if i + 1 < len(pages) else set())
        if not cand: continue
        for k, b in enumerate(p['blocks']):
            if b['t'] in ('fn', 'toc') or not b['x']: continue
            def rep(m):
                n = int(m.group(2))
                if n not in cand or NOT_CALL.search(b['x'][:m.start(2)]): return m.group(0)
                log.append(f'{i}-{k}: …{b["x"][max(0, m.start() - 25):m.end() + 10]!r}')
                return m.group(1) + m.group(2).translate(SUP)
            nx = re.sub(r'(?<![\d\u00a0 ]\d)(?<!\d)([.”’)\]።?!:;,፡](?:[ \u00a0])?)(\d{1,3})(?=[\s\u00a0.,;:”)]|$)', rep, b['x'])
            b['x'] = nx


def main(book_id):
    fmt_path = os.path.join(ROOT, f'data/corrections/{book_id}-format.json')
    fmt = json.load(open(fmt_path)) if os.path.exists(fmt_path) else {}
    files = {'am': os.path.join(ROOT, f'data/text/{book_id}.json'), 'en': os.path.join(ROOT, f'data/text/{book_id}.en.json')}
    texts = {k: json.load(open(f)) for k, f in files.items() if os.path.exists(f)}
    changed = 0
    for op in fmt.get('blocks', []):
        i, k = map(int, op['id'].split('-'))
        for lang, tx in texts.items():
            b = tx['pages'][i]['blocks'][k]
            if 't' in op and b['t'] != op['t']: b['t'] = op['t']; changed += 1      # types: both languages
            if op.get('lang', 'both') not in ('both', lang): continue
            if 'x' in op:
                val = op['x'] if isinstance(op['x'], str) else op['x'].get(lang)
                if val is not None and b['x'] != val: b['x'] = val; changed += 1
            for pat, rep in op.get('sub', []):
                nx = re.sub(pat, rep, b['x'])
                if nx != b['x']: b['x'] = nx; changed += 1
    calls = []
    for lang, tx in texts.items():
        before = sum(len(b['x']) for p in tx['pages'] for b in p['blocks'])
        superscript_calls(tx, calls)
    if calls:
        open(os.path.join(ROOT, f'data/corrections/{book_id}-calls.log'), 'a').write('\n'.join(calls) + '\n'); changed += len(calls)
    for lang, tx in texts.items():
        for t in fmt.get('toc_add', []):                    # numbered headings the printed contents leaves out
            if not any(x['page'] == t['page'] and x.get('b') == t['b'] for x in tx['toc']):
                tx['toc'].append({'level': t['level'], 'page': t['page'], 'b': t['b'], 'title': tx['pages'][t['page']]['blocks'][t['b']]['x']})
                changed += 1
        for p in tx['pages']:
            for b in p['blocks']:
                nx = typography(b['x'], lang, b['t'])
                if nx != b['x']: b['x'] = nx; changed += 1
        toc = tx['toc']
        for op in fmt.get('toc', []):                      # entries are matched by section number, so re-runs are safe
            hits = [t for t in toc if t['title'].startswith(op['num'] + ' ')]
            for t in hits:
                for key in ('page', 'b', 'level'):
                    if key in op: t[key] = op[key]
        for t in toc:
            t['title'] = curly(t['title']) if ('"' in t['title'] or "'" in t['title']) else t['title']
        order = sorted(range(len(toc)), key=lambda n: (toc[n]['page'] if not toc[n].get('absent') else 10 ** 6,
                                                        toc[n].get('b') if toc[n].get('b') is not None and toc[n]['b'] >= 0 else -1, n))
        if order != list(range(len(toc))):
            tx['toc'] = [toc[n] for n in order]; changed += 1
    for lang, tx in texts.items():
        for key, val in fmt.get('meta', {}).get(lang, {}).items():
            if tx.get(key) != val: tx[key] = val; changed += 1
        json.dump(tx, open(files[lang], 'w'), ensure_ascii=False, separators=(',', ':') if lang == 'en' else None)
    print(f'{book_id}: {changed} formatting changes in', ', '.join(texts))


if __name__ == '__main__':
    main(int(sys.argv[1]))
