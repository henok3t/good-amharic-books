"""Build the readable text of a book from Cloud Vision OCR output.

    python3 scripts/build_book_text.py <book id> <dir with ocr/vision/<file stem>/output-*.json>

Writes data/text/<id>.json:
  { id, title, pages: [ { n: printed page label, src: {file, page, half}, conf, blocks: [ {t: 'h1'|'h2'|'p'|'pre', x: text, cont?} ] } ],
    toc: [ {title, level, page: index into pages} ] }
"""
import glob, json, os, re, statistics, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ETH_DIGITS = dict(zip('፩፪፫፬፭፮፯፰፱', range(1, 10)))
END_PUNCT = ('።', '?', '!', '፧', '"', '»', '”', ')', '፡፡')

def norm_punct(s):
    s = re.sub(r'፡\s*፡', '።', s)          # two wordspace marks used as a full stop
    s = re.sub(r'(?<=[ሀ-፿])\s*::', ' ።', s)
    s = re.sub(r'\s+([።፣፤፥፦?!])', r' \1', s)  # keep the common Amharic spacing before punctuation, but single
    s = re.sub(r'[ \t]+', ' ', s).strip()
    return s

def norm_quotes(s):
    # Vision often reads the full stop ። as a straight quote between sentences
    if s.count('"') and not re.search(r'"[\u1200-\u137F]', s):
        s = re.sub(r'(?<=[\u1200-\u137F]) " (?=[\u1200-\u137F])', ' ። ', s)
        s = re.sub(r'(?<=[\u1200-\u137F]) "$', ' ።', s)
    return s

def para_lines(par):
    """Lines of a Vision paragraph: [(text, y_top, y_bottom, height)]"""
    lines, cur, ys = [], '', []
    for w in par['words']:
        for s in w['symbols']:
            cur += s['text']
            br = s.get('property', {}).get('detectedBreak', {}).get('type')
            if br in ('SPACE', 'SURE_SPACE'): cur += ' '
            if br in ('EOL_SURE_SPACE', 'LINE_BREAK', 'HYPHEN'):
                lines.append(cur.strip()); cur = ''
        v = w['boundingBox']['normalizedVertices']
        ys.append((v[0].get('y', 0), v[2].get('y', 0)))
    if cur.strip(): lines.append(cur.strip())
    return lines, ys

ETH = re.compile(r'^[\u1200-\u137F]+$')
LEX = {}

def build_lexicon(all_lines):
    """Count words that sit inside lines (never split by a line break)."""
    from collections import Counter
    c = Counter()
    for l in all_lines:
        ws = l.split()
        for w in ws[1:-1]:
            if ETH.match(w): c[w] += 1
    return c

def join_lines(lines):
    out = ''
    for l in lines:
        if not out: out = l; continue
        a = out.split()[-1] if out.split() else ''
        b = l.split()[0] if l.split() else ''
        glue = ' '
        if ETH.match(a or '-') and ETH.match(b or '-'):
            ca, cb, cab = LEX.get(a, 0), LEX.get(b, 0), LEX.get(a + b, 0)
            if cab > 0 and cab >= min(ca, cb):
                glue = ''
            elif ca == 0 and cb == 0 and (min(len(a), len(b)) <= 2 or len(a) + len(b) <= 6):
                glue = ''
            elif len(b) <= 2 and cb <= 1 and ca == 0:
                glue = ''
        out += glue + l
    return out

def bbox(o):
    v = o['boundingBox']['normalizedVertices']
    xs = [p.get('x', 0) for p in v]; ys = [p.get('y', 0) for p in v]
    return min(xs), min(ys), max(xs), max(ys)

def is_page_number(text):
    t = text.strip().strip('-–— .')
    return bool(re.fullmatch(r'\d{1,4}', t)) or (0 < len(t) <= 4 and all(ch in ETH_DIGITS or ch in '፲፳፴፵፶፷፸፹፺፻' for ch in t))

def split_halves(paras, landscape):
    if not landscape:
        return [paras]
    # gutter = widest empty vertical band near the middle
    xs = sorted((p['x0'], p['x1']) for p in paras)
    best, gut = 0, 0.5
    for g in [i / 200 for i in range(70, 131)]:
        if any(a < g < b for a, b in xs): continue
        left = max([b for a, b in xs if b <= g], default=0); right = min([a for a, b in xs if a >= g], default=1)
        if right - left > best: best, gut = right - left, g
    return [[p for p in paras if (p['x0'] + p['x1']) / 2 < gut], [p for p in paras if (p['x0'] + p['x1']) / 2 >= gut]]

def build_page(paras, line_h):
    """paras of one printed page -> (label, blocks)"""
    if not paras: return None, []
    paras.sort(key=lambda p: (round(p['y0'], 2), p['x0']))
    label = None
    body = []
    for i, p in enumerate(paras):
        txt = ' '.join(p['lines'])
        if is_page_number(txt) and (p['y0'] > 0.85 or p['y1'] < 0.12):
            label = txt.strip(); continue
        body.append(p)
    # running header: first item, short, near the top, and the page has more text below
    if len(body) > 2 and body[0]['y1'] < 0.09 and len(' '.join(body[0]['lines'])) < 45:
        body = body[1:]
    blocks = []
    for p in body:
        lines = [norm_punct(l) for l in p['lines'] if l.strip()]
        if not lines: continue
        if len(''.join(lines).strip(' .,-·')) <= 2 and not ''.join(lines).strip().isdigit(): continue  # stray marks / OCR noise
        txt = norm_quotes(join_lines(lines))
        digit_end = sum(1 for l in lines if re.search(r'(\d+|[፩-፼]+)\s*$', l))
        if len(lines) >= 3 and digit_end >= len(lines) * 0.6:
            blocks.append({'t': 'pre', 'x': '\n'.join(lines)}); continue
        tall = p['h'] > line_h * 1.35
        if re.match(r'^ምዕራፍ\s*([\d፩-፼]+)', txt) and len(txt) < 60:
            blocks.append({'t': 'h1', 'x': txt})
        elif (tall or len(lines) == 1) and len(txt) < 60 and not txt.endswith(END_PUNCT):
            blocks.append({'t': 'h2', 'x': txt})
        else:
            blocks.append({'t': 'p', 'x': txt})
    # chapter heading followed by its title: merge "ምዕራፍ ፲" + "ታቦት ጽላት"; section number + title
    out = []
    for b in blocks:
        if out and out[-1]['t'] == 'h2' and b['t'] in ('h2', 'p') and re.fullmatch(r'[\d፩-፼]+(\.[\d]+)*\.?', out[-1]['x'].strip()) and len(b['x']) < 80:
            out[-1]['x'] += ' ' + b['x']; continue
        if out and out[-1]['t'] == 'h1' and b['t'] == 'h2' and '·' not in out[-1]['x'] and len(out[-1]['x']) < 14:
            out[-1]['x'] += ' · ' + b['x']; continue
        out.append(b)
    return label, out

def fix_labels(pages):
    """Printed page numbers run in sequence: replace outliers and fill gaps from the neighbours."""
    nums = [int(p['n']) if p['n'] and p['n'].isdigit() else None for p in pages]
    offs = [n - i if n is not None else None for i, n in enumerate(nums)]
    for i in range(len(pages)):
        window = [o for o in offs[max(0, i - 6): i + 7] if o is not None]
        if len(window) < 3: continue
        mode = max(set(window), key=window.count)
        if window.count(mode) >= 3 and i + mode >= 1:
            pages[i]['n'] = str(i + mode)
    # front matter: a number larger than a later page's number is not a page number (e.g. contents entries)
    nxt = None
    for p in reversed(pages):
        n = int(p['n']) if p['n'] and p['n'].isdigit() else None
        if n is None: continue
        if nxt is not None and n >= nxt: p['n'] = None
        else: nxt = n

def parse_printed_contents(pages, contents_idx):
    """Entries from the book's own contents pages: [(level, title, printed page)]."""
    toks = []
    for i in contents_idx:
        for b in pages[i]['blocks']:
            for line in b['x'].split('\n'):
                toks += re.sub(r'[.…]{2,}', ' ', line).split()
    entries, cur = [], None
    def close():
        if cur and cur['title'].strip(): entries.append(cur)
    k = 0
    while k < len(toks):
        t = toks[k]
        if t == 'ምዕራፍ' and k + 1 < len(toks) and re.fullmatch(r'\d{1,2}', toks[k + 1]):
            close(); cur = {'level': 1, 'num': toks[k + 1], 'title': '', 'page': None}; k += 2; continue
        if re.fullmatch(r'\d{1,2}[.,]\d{1,2}', t):
            close(); cur = {'level': 2, 'num': t.replace(',', '.'), 'title': '', 'page': None}; k += 1; continue
        if re.fullmatch(r'\d{1,3}\.?', t):
            n = int(t.rstrip('.'))
            target = cur if cur and cur['page'] is None else (entries[-1] if entries and entries[-1]['page'] is None else None)
            if target is not None and cur is not None and target is cur and not cur['title']:
                pass
            elif target is not None:
                target['page'] = n
            k += 1; continue
        if cur is not None and t not in '·፥:፡\'?' and not t.startswith('$'):
            if cur['page'] is None: cur['title'] += (' ' if cur['title'] else '') + t
            else:
                close(); cur = {'level': 2, 'num': '', 'title': t, 'page': None}  # unnumbered entry
        k += 1
    close()
    entries = [e for e in entries if re.search(r'[\u1200-\u137F]', e['title'])]
    for i, e in enumerate(entries):                     # chapter without a page: use its first section's page
        if e['level'] == 1 and not e['page']:
            e['page'] = next((x['page'] for x in entries[i + 1:] if x['page']), None)
    kept, chapter, last = [], None, 0
    for e in entries:
        if not e['page']: continue
        if e['level'] == 1:
            chapter = e['num']
        elif e['num'] and chapter and e['num'].split('.')[0] != chapter:
            if chapter.isdigit() and e['num'].split('.')[0] == str(int(chapter) + 1) and e['page'] >= last:
                chapter = str(int(chapter) + 1)              # chapter line lost in OCR: start it at its section
                kept.append({'level': 1, 'num': chapter, 'title': '', 'page': e['page']})
            else:
                continue                                   # misread or misplaced section number
        if e['page'] < last: continue
        kept.append(e); last = e['page']
    return kept

def main(book_id, ocr_dir):
    cat = json.load(open(os.path.join(ROOT, 'data/catalog.json')))
    book = next(b for b in cat['books'] if b['id'] == book_id)
    pages, raw = [], []
    for part in book['parts']:
        if not part.get('file'): continue
        stem = os.path.splitext(part['file'])[0]
        responses = []
        for f in sorted(glob.glob(f'{ocr_dir}/{stem}/output-*.json'), key=lambda f: int(re.search(r'output-(\d+)', f).group(1))):
            responses += json.load(open(f))['responses']
        for r in responses:
            pg = r.get('context', {}).get('pageNumber')
            fta = r.get('fullTextAnnotation')
            if not fta: continue
            vp = fta['pages'][0]
            landscape = vp['width'] > vp['height'] * 1.1
            paras = []
            for blk in vp['blocks']:
                for par in blk['paragraphs']:
                    lines, ys = para_lines(par)
                    x0, y0, x1, y1 = bbox(par)
                    hs = [b - a for a, b in ys] or [0]
                    paras.append({'lines': lines, 'x0': x0, 'y0': y0, 'x1': x1, 'y1': y1, 'h': statistics.median(hs), 'conf': par.get('confidence', 0)})
            if not paras: continue
            line_h = statistics.median([p['h'] for p in paras])
            for hi, half in enumerate(split_halves(paras, landscape)):
                raw.append((half, line_h, {'file': part['file'], 'page': pg, 'half': ['L', 'R'][hi] if landscape else 'F'}))
    LEX.update(build_lexicon([l for half, _, _ in raw for p in half for l in p['lines']]))
    for half, line_h, src in raw:
        label, blocks = build_page(half, line_h)
        if not blocks: continue
        conf = statistics.mean([p['conf'] for p in half]) if half else 0
        pages.append({'n': label, 'src': src, 'conf': round(conf, 3), 'blocks': blocks})
    fix_labels(pages)
    # paragraphs that continue onto the next page
    for a, b in zip(pages, pages[1:]):
        last = a['blocks'][-1]; first = b['blocks'][0]
        if last['t'] == 'p' and first['t'] == 'p' and not last['x'].endswith(END_PUNCT):
            first['cont'] = True
    first_ch = 0
    def contents_page(p):
        lines = [l for b in p['blocks'] for l in b['x'].split('\n')]
        return any(b['t'] == 'pre' for b in p['blocks']) or sum(1 for l in lines if re.search(r'(\.{3,}|…)|\s\d{1,3}$', l)) >= 3
    toc = []
    contents_idx = [i for i, p in enumerate(pages[:15]) if contents_page(p)]
    if contents_idx: contents_idx = list(range(contents_idx[0], contents_idx[-1] + 1))  # one continuous run
    printed = parse_printed_contents(pages, contents_idx) if contents_idx else []
    label_to_idx = {}
    for i, p in enumerate(pages):
        if p['n'] and p['n'].isdigit() and i > (contents_idx[-1] if contents_idx else -1): label_to_idx.setdefault(int(p['n']), i)
    def nearest(n):
        for d in range(0, 4):
            for c in (n + d, n - d):
                if c in label_to_idx: return label_to_idx[c]
    if sum(1 for e in printed if e['level'] == 1) >= 3:
        for e in printed:
            idx = nearest(e['page'])
            if idx is None: continue
            t = e['title'].strip(' ?."\'·፥')
            if e['level'] == 1 and not t:                  # title from the chapter heading in the body
                h = next((b['x'] for b in pages[idx]['blocks'] if b['t'] == 'h1'), '')
                t = re.sub(r'^ምዕራፍ\s*\S+\s*[·፥:፡]*\s*', '', h).strip(' ?."\'·፥')
            title = (f"ምዕራፍ {e['num']}" + (f" · {t}" if t else '') if e['level'] == 1 else (e['num'] + ' ' if e['num'] else '') + t)
            toc.append({'title': title, 'level': e['level'], 'page': idx})
        intro = next((i for i, p in enumerate(pages) if i > (contents_idx[-1] if contents_idx else 0) and any(b['t'] == 'h2' and b['x'].replace(' ', '') == 'መግቢያ' for b in p['blocks'])), None)
        if intro is not None: toc.insert(0, {'title': 'መግቢያ', 'level': 1, 'page': intro})
        toc.sort(key=lambda e: e['page'])
    for i, p in enumerate(pages if not toc else []):
        if contents_page(p): continue   # the printed contents pages themselves
        if not first_ch and any(b['t'] == 'h1' for b in p['blocks']): first_ch = i
        for blk in p['blocks']:
            if blk['t'] not in ('h1', 'h2') or len(blk['x']) < 3 or '..' in blk['x'] or '…' in blk['x']: continue
            if blk['t'] == 'h2' and (not first_ch or i < first_ch) and blk['x'].replace(' ', '') not in ('መግቢያ', 'መቅድም', 'ምስጋና', 'ልዩመግለጫ', 'ማውጫ'): continue
            if blk['t'] == 'h2' and i >= first_ch and not re.match(r'^[\d፩-፼]+\.\d+\s+\S', blk['x']): continue
            toc.append({'title': blk['x'], 'level': 1 if blk['t'] == 'h1' else 2, 'page': i})
    out = {'id': book_id, 'titleAm': book['titleAm'], 'titleEn': book['titleEn'], 'author': book['author'], 'engine': 'cloud-vision',
           'pages': pages, 'toc': toc}
    os.makedirs(os.path.join(ROOT, 'data/text'), exist_ok=True)
    json.dump(out, open(os.path.join(ROOT, f'data/text/{book_id}.json'), 'w'), ensure_ascii=False, separators=(',', ':'))
    chars = sum(len(b['x']) for p in pages for b in p['blocks'])
    print(f'book {book_id}: {len(pages)} pages, {chars} chars, {len(toc)} headings, mean conf {statistics.mean([p["conf"] for p in pages]):.3f}')

if __name__ == '__main__':
    main(int(sys.argv[1]), sys.argv[2])
