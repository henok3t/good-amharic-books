"""Build the readable text of a book from Cloud Vision OCR output.

    python3 scripts/build_book_text.py <book id> <dir with <file stem>/output-*.json>

Layout is rebuilt from line positions (not Vision's paragraphs, which often split mid-paragraph):
  * a paragraph starts at an indented line, or after a line that ends early with sentence punctuation;
  * a heading is a short line that is centred or taller than body text and is not mid-sentence;
  * the book's own contents pages are replaced by a contents list parsed from them;
  * front matter (title page, imprint) is kept as centred lines.
Per-page fixes from proofreading are applied from data/corrections/<id>.json (see apply_corrections).

Writes data/text/<id>.json:
  { id, titleAm, titleEn, author, pages: [ { n, kind?, src: {file, page, half}, conf, blocks: [ {t, x, cont?} ] } ], toc }
  block types: h1 (chapter), h2 (section), p (paragraph), c (centred line), toc (contents list), pre (verbatim lines)
"""
import glob, json, os, re, statistics, sys
from collections import Counter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ETH_NUM = '፩፪፫፬፭፮፯፰፱፲፳፴፵፶፷፸፹፺፻፼'
NUM_WORDS = ('አንድ', 'ሁለት', 'ሦስት', 'ሶስት', 'አራት', 'አምስት', 'ስድስት', 'ሰባት', 'ስምንት', 'ዘጠኝ', 'አሥር', 'አስር',
             'አሥራ', 'አስራ', 'ሃያ', 'ሀያ', 'አንደኛ', 'ሁለተኛ', 'ሦስተኛ', 'ሶስተኛ', 'አራተኛ', 'አምስተኛ', 'ስድስተኛ', 'ሰባተኛ', 'ስምንተኛ', 'ዘጠነኛ', 'አሥረኛ', 'አስረኛ')
CHAPTER_RE = re.compile(r'^(ምዕራፍ|ክፍል)\s*([\d' + ETH_NUM + r']|(' + '|'.join(NUM_WORDS) + r')(\s|$|[\s(]))')
END_PUNCT = ('።', '?', '!', '፧', '»', '”', '፡፡', '!»', '?»')
ETH = re.compile(r'^[ሀ-፿]+$')
LEX = Counter()

# ---------- text cleanup ----------
def norm_punct(s):
    s = re.sub(r'፡\s*፡', '።', s)                       # two word-space marks used as a full stop
    s = re.sub(r'(?<=[ሀ-፿])\s*::', ' ።', s)
    s = re.sub(r'\s*([።፣፤፥፦])', r' \1', s)              # one space before Ethiopic punctuation (common Amharic style)
    s = re.sub(r'([።፣፤፥፦])(?=[^\s\d])', r'\1 ', s)
    s = s.replace('« ', '«').replace(' »', '»').replace('“ ', '“').replace(' ”', '”')
    s = re.sub(r'\(\s+', '(', s); s = re.sub(r'\s+\)', ')', s)
    s = re.sub(r'(\d)\s*([፥፡:])\s*(\d)', r'\1 ፥ \3', s)     # Bible references: 4 ፥ 5
    return re.sub(r'[ \t]+', ' ', s).strip()

def norm_quotes(s):
    # Vision often reads the full stop ። as a straight quote between sentences
    if '"' in s and not re.search(r'"[ሀ-፿]', s):
        s = re.sub(r'(?<=[ሀ-፿]) " (?=[ሀ-፿])', ' ። ', s)
        s = re.sub(r'(?<=[ሀ-፿]) "$', ' ።', s)
    return s

def unspace_letters(s):
    """'ዓ ም ደ ሃ ይ ማ ኖ ት' (letter-spaced display type) -> 'ዓምደ ሃይማኖት' when it is clearly letter-spaced."""
    toks = s.split()
    if len(toks) >= 3 and all(len(t) == 1 and ETH.match(t) for t in toks):
        joined = ''.join(toks)
        # split back into words using the lexicon when possible
        for i in range(2, len(joined) - 1):
            if LEX[joined[:i]] and LEX[joined[i:]]: return joined[:i] + ' ' + joined[i:]
        return joined
    return s

def glue(a_text, b_text):
    """Join two consecutive lines: Amharic breaks words at line ends without a hyphen."""
    a = a_text.split()[-1] if a_text.split() else ''
    b = b_text.split()[0] if b_text.split() else ''
    if a_text.endswith('-') and b: return a_text[:-1] + b_text
    if ETH.match(a or '-') and ETH.match(b or '-'):
        ca, cb, cab = LEX[a], LEX[b], LEX[a + b]
        if cab > 0 and cab >= min(ca, cb): return a_text + b_text
        if ca == 0 and cb == 0 and (min(len(a), len(b)) <= 2 or len(a) + len(b) <= 6): return a_text + b_text
        if len(b) <= 2 and cb <= 1 and ca == 0: return a_text + b_text
    return a_text + ' ' + b_text

# ---------- OCR geometry ----------
def vision_lines(page_obj):
    """All text lines on a Vision page: [{x, x0, y0, x1, y1, h, conf}] (coordinates normalised 0..1)."""
    lines = []
    for blk in page_obj['blocks']:
        for par in blk['paragraphs']:
            cur, box, confs = '', None, []
            for w in par['words']:
                v = w['boundingBox']['normalizedVertices']
                xs = [p.get('x', 0) for p in v]; ys = [p.get('y', 0) for p in v]
                wb = (min(xs), min(ys), max(xs), max(ys))
                box = wb if box is None else (min(box[0], wb[0]), min(box[1], wb[1]), max(box[2], wb[2]), max(box[3], wb[3]))
                confs.append(w.get('confidence', 0))
                for s in w['symbols']:
                    cur += s['text']
                    br = s.get('property', {}).get('detectedBreak', {}).get('type')
                    if br in ('SPACE', 'SURE_SPACE'): cur += ' '
                    elif br == 'HYPHEN': cur += '-'
                    if br in ('EOL_SURE_SPACE', 'LINE_BREAK', 'HYPHEN'):
                        if cur.strip(): lines.append({'x': cur.strip(), 'x0': box[0], 'y0': box[1], 'x1': box[2], 'y1': box[3], 'conf': statistics.mean(confs)})
                        cur, box, confs = '', None, []
            if cur.strip() and box: lines.append({'x': cur.strip(), 'x0': box[0], 'y0': box[1], 'x1': box[2], 'y1': box[3], 'conf': statistics.mean(confs)})
    for l in lines: l['h'] = l['y1'] - l['y0']
    return merge_same_row(lines)

def merge_same_row(lines):
    """Vision sometimes returns one printed line as several pieces (e.g. an underlined term sits a little lower):
    group pieces whose vertical centres overlap, order them left to right, and join neighbours."""
    lines.sort(key=lambda l: (l['y0'] + l['y1']) / 2)
    rows = []
    for l in lines:
        c = (l['y0'] + l['y1']) / 2
        row = rows[-1] if rows else None
        if row and abs(c - row['c']) < min(l['h'], row['h']) * 0.55: row['items'].append(l); continue
        rows.append({'c': c, 'h': l['h'], 'items': [l]})
    out = []
    for row in rows:
        items = sorted(row['items'], key=lambda l: l['x0'])
        cur = dict(items[0])
        for l in items[1:]:
            if 0 <= l['x0'] - cur['x1'] < 0.06 or l['x0'] < cur['x1']:
                cur['x'] += ' ' + l['x']; cur['x1'] = max(cur['x1'], l['x1'])
                cur['y0'] = min(cur['y0'], l['y0']); cur['y1'] = max(cur['y1'], l['y1']); cur['h'] = max(cur['h'], l['h'])
            else:
                out.append(cur); cur = dict(l)
        out.append(cur)
    return out

def split_halves(lines, landscape):
    if not landscape: return [lines]
    spans = [(l['x0'], l['x1']) for l in lines]
    best, gut = -1, 0.5
    for g in [i / 200 for i in range(70, 131)]:
        crossing = sum(1 for a, b in spans if a < g < b)
        left = max([b for a, b in spans if b <= g], default=0); right = min([a for a, b in spans if a >= g], default=1)
        score = (right - left) - crossing * 0.05
        if score > best: best, gut = score, g
    return [[l for l in lines if (l['x0'] + l['x1']) / 2 < gut], [l for l in lines if (l['x0'] + l['x1']) / 2 >= gut]]

HEADERS = set()
HEADER_TEXT = ''          # set when most pages share one running header (fuzzy, OCR varies)
FOOTNOTES = False         # set when many pages end with numbered footnotes
def norm_header(t): return re.sub(r'[\d\s' + ETH_NUM + r'.\-–—]', '', t)

def is_page_number(t):
    t = t.strip().strip('-–—. ')
    return bool(re.fullmatch(r'\d{1,4}', t)) or (0 < len(t) <= 4 and all(ch in ETH_NUM for ch in t))

# ---------- page layout ----------
def footnote_start(lines):
    """Index (in y order) of the first footnote line: in the bottom 40%, after a clear gap, starting with a note number."""
    L = sorted(lines, key=lambda l: l['y0'])
    if len(L) < 8: return None
    gaps = [b['y0'] - a['y1'] for a, b in zip(L, L[1:]) if b['y0'] > a['y1']]
    typical = statistics.median(gaps) if gaps else 0.005
    for i in range(len(L) // 2, len(L)):
        l = L[i]
        if l['y0'] < 0.6: continue
        gap = l['y0'] - L[i - 1]['y1']
        if gap > max(typical * 1.8, 0.012) and re.match(r'^\*?\d{1,3}\s+\S', l['x']):
            return i
    return None

def layout_page(lines):
    """Lines of one printed page -> (page label, blocks)."""
    if not lines: return None, []
    lines = sorted(lines, key=lambda l: (round(l['y0'], 3), l['x0']))
    label = None
    ys = [l['y0'] for l in lines]; top, bottom = min(ys), max(l['y1'] for l in lines)
    # books with a running header on most pages (e.g. "<title>  151"): drop the header row, take the number from it
    if HEADER_TEXT:
        from rapidfuzz import fuzz
        def is_head(l):
            t = norm_header(l['x']); r = fuzz.ratio(t, HEADER_TEXT)
            return l['y0'] < 0.12 and (r >= 60 or (r >= 45 and l['y0'] < 0.08 and len(t) <= len(HEADER_TEXT) * 1.5))
        head = next((l for l in lines[:4] if is_head(l)), None)
        if head:
            row = [l for l in lines if abs(l['y0'] - head['y0']) < max(head['h'], 0.01) * 0.8]
            for l in row:
                m = re.search(r'\b(\d{1,4})\b', l['x'].replace('°', ' '))
                if m and not label: label = m.group(1)
            lines = [l for l in lines if l not in row]
            if not lines: return label, []
            ys = [l['y0'] for l in lines]; top, bottom = min(ys), max(l['y1'] for l in lines)
    body = []
    for l in lines:
        near_edge = l['y0'] - top < 0.04 or bottom - l['y1'] < 0.04
        if is_page_number(l['x']) and near_edge and not HEADER_TEXT: label = l['x'].strip(' -–—.'); continue
        if len(l['x'].strip(' .,-·\'"')) <= 1 and not l['x'].strip().isdigit(): continue      # specks
        body.append(l)
    if not body: return label, []
    notes = []
    if FOOTNOTES:
        fs = footnote_start(body)
        if fs is not None:
            body = sorted(body, key=lambda l: l['y0'])
            for l in body[fs:]:
                t = norm_punct(l['x'])
                if re.match(r'^\*?\d{1,3}\s+\S', t) or not notes: notes.append(t)
                else: notes[-1] = glue(notes[-1], t)
            body = body[:fs]
            if not body: return label, [{'t': 'fn', 'x': n} for n in notes]
    # running header: the same short top line repeated on several pages (found in main(), passed in HEADERS)
    if len(body) > 3 and norm_header(body[0]['x']) in HEADERS:
        body = body[1:]
    # margins measured locally, so slightly tilted scans don't make every line look indented
    def margins(i):
        win = body[max(0, i - 5): i + 6]
        x0 = sorted(l['x0'] for l in win); x1 = sorted(l['x1'] for l in win)
        return x0[len(x0) // 4], x1[len(x1) * 3 // 4]
    M = [margins(i) for i in range(len(body))]
    W = max(statistics.median([r - l for l, r in M]), 1e-6)
    H = statistics.median([l['h'] for l in body])
    blocks, para = [], None
    def flush():
        nonlocal para
        if para: blocks.append({'t': 'p', 'x': para}); para = None
    prev = None
    for li, l in enumerate(body):
        text = norm_punct(l['x'])
        L, R = M[li]
        indent = (l['x0'] - L) / W
        right_gap = (R - l['x1']) / W
        centered = indent > 0.07 and right_gap > 0.07 and abs(indent - right_gap) < 0.12
        tall = l['h'] > H * 1.28
        prev_ended = prev is None or prev['end']
        heading = (centered or tall) and len(text) < 75 and not text.endswith(('።', '፣', '፤', '፥')) and prev_ended
        if CHAPTER_RE.match(text) and len(text) < 70 and (text.startswith('ምዕራፍ') or prev_ended):
            flush(); blocks.append({'t': 'h1', 'x': text}); prev = {'end': True, 'head': True}; continue
        if heading:
            flush()
            if blocks and blocks[-1]['t'] in ('h1', 'h2') and prev and prev.get('head'):
                if blocks[-1]['t'] == 'h1' and '·' not in blocks[-1]['x']: blocks[-1]['x'] += ' · ' + text
                else: blocks[-1]['x'] = glue(blocks[-1]['x'], text)
            else:
                blocks.append({'t': 'h2', 'x': text})
            prev = {'end': True, 'head': True}; continue
        bullet = bool(re.match(r'^([ሀ-ፐ]|\d{1,2}|[a-z])[.)/]\s|^[—–•-]\s?', text))
        prev_punct = bool(prev and prev.get('punct'))
        term = bool(re.match(r'^\S.{1,40}?\s[—–]\s', text))       # "term — definition"
        outdent = bool(prev and prev.get('indent', 0) - indent > 0.05)  # back at the margin after hanging lines
        new_para = (para is None or bullet or term or outdent or (prev and prev.get('head'))
                    or (indent > 0.035 and prev_punct)            # indented first line after a finished sentence
                    or (prev and prev.get('short') and prev_punct)) # previous line ended early with a full stop
        if new_para:
            flush(); para = text
        else:
            para = glue(para, text)                              # includes hanging-indent continuation lines
        short = right_gap > 0.12
        punct = text.endswith(END_PUNCT + ('።', ':', '"', '.'))
        prev = {'end': short and punct, 'short': short, 'punct': punct, 'head': False, 'indent': indent}
    flush()
    for b in blocks: b['x'] = norm_quotes(b['x'])
    return label, blocks + [{'t': 'fn', 'x': n} for n in notes]

# ---------- page labels and contents ----------
def fix_labels(pages):
    """Printed page numbers run in sequence: replace outliers and fill gaps from the neighbours."""
    nums = [int(p['n']) if p['n'] and p['n'].isdigit() else None for p in pages]
    offs = [n - i if n is not None else None for i, n in enumerate(nums)]
    for i in range(len(pages)):
        window = [o for o in offs[max(0, i - 6): i + 7] if o is not None]
        if len(window) < 3: continue
        mode = max(set(window), key=window.count)
        if window.count(mode) >= 3 and i + mode >= 1: pages[i]['n'] = str(i + mode)
    nxt = None
    for p in reversed(pages):                            # front matter: numbers that run backwards are not page numbers
        n = int(p['n']) if p['n'] and p['n'].isdigit() else None
        if n is None: continue
        if nxt is not None and n >= nxt: p['n'] = None
        else: nxt = n

def is_contents_page(p):
    lines = [l['x'] for l in p['_lines']]
    trailing = sum(1 for l in lines if re.search(r'(\.{3,}|…)|\s\d{1,3}\.?$', l))
    return trailing >= 4 or any(re.sub(r'\s', '', l) == 'ማውጫ' for l in lines[:3]) and trailing >= 2

def parse_printed_contents(pages, idx):
    """Entries from the book's own contents pages: [{level, num, title, page}] in reading order."""
    toks = []
    for i in idx:
        for l in pages[i]['_lines']: toks += re.sub(r'[.…]{2,}', ' ', l['x']).split()
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
            target = cur if cur and cur['page'] is None and cur['title'] else (entries[-1] if entries and entries[-1]['page'] is None else None)
            if target is not None: target['page'] = int(t.rstrip('.'))
            k += 1; continue
        if cur is not None and t not in '·፥:፡\'?' and not t.startswith('$'):
            if cur['page'] is None: cur['title'] += (' ' if cur['title'] else '') + t
            else: close(); cur = {'level': 2, 'num': '', 'title': t, 'page': None}
        k += 1
    close()
    entries = [e for e in entries if re.search(r'[ሀ-፿]', e['title'])]
    for i, e in enumerate(entries):
        if e['level'] == 1 and not e['page']: e['page'] = next((x['page'] for x in entries[i + 1:] if x['page']), None)
    kept, chapter, last = [], None, 0
    for e in entries:
        if not e['page']: continue
        if e['level'] == 1: chapter = e['num']
        elif e['num'] and chapter and e['num'].split('.')[0] != chapter:
            if chapter.isdigit() and e['num'].split('.')[0] == str(int(chapter) + 1) and e['page'] >= last:
                chapter = str(int(chapter) + 1); kept.append({'level': 1, 'num': chapter, 'title': '', 'page': e['page']})
            else: continue
        if e['page'] < last: continue
        kept.append(e); last = e['page']
    return kept

# ---------- corrections from proofreading ----------
def apply_corrections(pages, book_id):
    """data/corrections/<id>.json: [{"page": "<file>:<pdf page>:<half>", "op": ..., ...}]
    ops: replace {find, with} | type {find, t} | merge {find} (into previous block) | split {find} (new paragraph at find)
         delete {find} | insert {after_find|"" , t, x} | noncont {} (first block does not continue the previous page)
         cont {} (first block continues the last paragraph of the previous page)
    optional on find-ops: "nth" (0-based, which matching block), "t_was" (only blocks of that type), "exact" (whole block)
    sub {pattern, with} with page "*": regex replacement over every block (book-wide misreadings, bullet glyphs)"""
    path = os.path.join(ROOT, f'data/corrections/{book_id}.json')
    if not os.path.exists(path): return 0
    by_key = {f"{p['src']['file']}:{p['src']['page']}:{p['src']['half']}": p for p in pages}
    done, failed = 0, []
    for c in json.load(open(path)):
        if 'op' not in c: continue
        if c['op'] == 'sub':                               # book-wide regex fix: {"page": "*", "op": "sub", "pattern", "with"}
            n = 0
            for pg in pages:
                for blk in pg['blocks']:
                    blk['x'], m = re.subn(c['pattern'], c['with'], blk['x']); n += m
            done += 1 if n else 0
            if not n: failed.append(c)
            continue
        p = by_key.get(c['page'])
        if not p: failed.append(c); continue
        bl = p['blocks']
        find = c.get('find', '')
        hits = [i for i, b in enumerate(bl) if find and (b['x'].strip() == find if c.get('exact') else find in b['x'])
                and ('t_was' not in c or b['t'] == c['t_was'])]
        k = hits[c.get('nth', 0)] if len(hits) > c.get('nth', 0) else None      # nth / t_was pick among repeated texts
        op = c['op']
        if op == 'replace' and k is not None: bl[k]['x'] = bl[k]['x'].replace(find, c['with']); done += 1
        elif op == 'type' and k is not None: bl[k]['t'] = c['t']; done += 1
        elif op == 'delete' and k is not None: bl.pop(k); done += 1
        elif op == 'merge' and k: bl[k - 1]['x'] = glue(bl[k - 1]['x'], bl[k]['x']); bl.pop(k); done += 1
        elif op == 'split' and k is not None:
            at = bl[k]['x'].index(find); a, b = bl[k]['x'][:at].rstrip(), bl[k]['x'][at:]
            if a: bl[k]['x'] = a; bl.insert(k + 1, {'t': c.get('t', 'p'), 'x': b}); done += 1
        elif op == 'insert':
            at = next((i + 1 for i, b in enumerate(bl) if c.get('after_find') and c['after_find'] in b['x']), 0)
            bl.insert(at, {'t': c['t'], 'x': c['x']}); done += 1
        elif op == 'noncont' and bl: bl[0].pop('cont', None); bl[0]['nocont'] = True; done += 1
        elif op == 'cont' and bl: bl[0]['forcecont'] = True; done += 1
        else: failed.append(c)
    if failed:
        json.dump(failed, open(os.path.join(ROOT, f'data/corrections/{book_id}.failed.json'), 'w'), ensure_ascii=False, indent=1)
    return done

# ---------- clean contents (transcribed from the printed contents pages) ----------
def fold(t):
    t = re.sub(r'[\s.…:፡።፣፤፥?!«»“”"\'()\-–—·]', '', t)
    for a, b in (('ሐ', 'ሀ'), ('ኀ', 'ሀ'), ('ሠ', 'ሰ'), ('ዐ', 'አ'), ('ፀ', 'ጸ')): t = t.replace(a, b)
    return t

def num_word(n):
    words = ['', 'አንድ', 'ሁለት', 'ሦስት', 'አራት', 'አምስት', 'ስድስት', 'ሰባት', 'ስምንት', 'ዘጠኝ', 'አሥር', 'አሥራ አንድ', 'አሥራ ሁለት',
             'አሥራ ሦስት', 'አሥራ አራት', 'አሥራ አምስት', 'አሥራ ስድስት', 'አሥራ ሰባት', 'አሥራ ስምንት', 'አሥራ ዘጠኝ', 'ሃያ']
    return words[int(n)] if n and n.isdigit() and int(n) < len(words) else ''

def eth_num(n):
    if not n or not n.isdigit(): return ''
    n = int(n); ones = ' ፩፪፫፬፭፮፯፰፱'; tens = ' ፲፳፴፵፶፷፸፹፺'
    return (tens[n // 10] if n >= 10 else '') + (ones[n % 10] if n % 10 else '')

def use_clean_contents(pages, toc, book_id, first_body):
    """data/corrections/<id>-toc.json: [{level, num?, title, page (printed)}]. Each entry is located in the text near its
    printed page (the printed numbers can be a few pages off); matching headings get the clean title."""
    path = os.path.join(ROOT, f'data/corrections/{book_id}-toc.json')
    if not os.path.exists(path): return toc
    from rapidfuzz import fuzz
    entries = json.load(open(path))
    label_idx = {int(p['n']): i for i, p in enumerate(pages) if i >= first_body and p['n'] and p['n'].isdigit()}
    def near(n):
        for d in range(0, 6):
            for c in (n + d, n - d):
                if c in label_idx: return label_idx[c]
        return first_body
    out, last = [], first_body
    max_label = max(label_idx) if label_idx else 0
    for e in entries:
        if max_label and e["page"] > max_label + 2:            # printed after the last scanned page: not in this copy
            title = ((f"ምዕራፍ {e['num']}" + (' · ' if e['title'] else '')) if e['level'] == 1 and e.get('num') else (e['num'] + ' ' if e.get('num') else '')) + e['title']
            out.append({'title': title, 'level': e['level'], 'page': len(pages) - 1, 'absent': True}); continue
        title = ((f"ምዕራፍ {e['num']}" + (' · ' if e['title'] else '')) if e['level'] == 1 and e.get('num') else (e['num'] + ' ' if e.get('num') else '')) + e['title']
        want = fold(e['title']); guess = max(near(e['page']), last)
        best = (0, None, None, None); loose = (0, None, None, None)
        window = range(max(first_body, guess - 4), min(len(pages), guess + 5))
        chapter_heads = e['level'] == 1 and e.get('num') and any(b['t'] == 'h1' and b['x'].startswith('ምዕራፍ') for i in window if i >= last for b in pages[i]['blocks'])
        for i in window:
            if i < last: continue
            for k, b in enumerate(pages[i]['blocks']):
                if b['t'] in ('toc', 'c'): continue
                if chapter_heads and not (b['t'] == 'h1' and b['x'].startswith('ምዕራፍ')): continue   # chapters: real chapter headings only
                head = fold(b['x'][:len(e['title']) + 30])
                if e['level'] == 1 and b['t'] == 'h1':           # chapters come in order: any chapter heading nearby, number preferred
                    nums = {e.get('num', '-'), eth_num(e.get('num', '')), num_word(e.get('num', ''))}
                    score = 100 if any(re.search(r'ምዕራፍ\s*' + re.escape(n) + r'(?![\d፩-፼])', b['x']) for n in nums if n) else max(88, fuzz.partial_ratio(want, head))
                else: score = fuzz.partial_ratio(want, head) if len(want) >= 3 else (100 if head.startswith(want) else 0)
                raw = score
                score -= abs(i - guess) * 1.5                    # prefer the expected page
                if b['t'] in ('h1', 'h2'): score += 4
                if score > best[0]: best = (score, i, k, b)
                if b['t'] == 'h2' and raw >= 60 and abs(i - guess) <= 2 and raw > loose[0]: loose = (raw, i, k, b)
        score, i, k, b = best
        if (b is None or score < 78) and loose[3] is not None and e['level'] >= 2:
            # the body words the section heading differently: link to it, keep the printed wording
            _, i, k, b = loose
            out.append({'title': title, 'level': 2, 'page': i, '_blk': b}); last = i
            continue
        if b is not None and score >= 78:
            if e['level'] == 1:
                if b['t'] != 'h1' and len(b['x']) > len(e['title']) + 30: pages[i]['blocks'].insert(k, {'t': 'h1', 'x': title})
                else:
                    b['t'] = 'h1'; b['x'] = title
                    nxt = pages[i]['blocks'][k + 1] if k + 1 < len(pages[i]['blocks']) else None
                    if nxt and nxt['t'] in ('p', 'h2', 'c') and fold(nxt['x']) == want: pages[i]['blocks'].pop(k + 1)   # title line repeated under the heading
            else:
                al = fuzz.partial_ratio_alignment(want, fold(b['x']))
                if b['t'] == 'h2' or len(fold(b['x'])) <= len(want) + 12:
                    b['t'] = 'h2'; b['x'] = title
                elif al and al.dest_start <= 3:                    # title runs into the paragraph: split it off
                    folded, cut, n = b['x'], 0, 0
                    for cut, ch in enumerate(folded):
                        if fold(ch): n += 1
                        if n >= al.dest_end: break
                    rest = b['x'][cut + 1:].lstrip(' :-—–፡።፣፤፥')
                    pages[i]['blocks'][k:k + 1] = [{'t': 'h2', 'x': title}] + ([{'t': 'p', 'x': rest}] if rest else [])
                else:
                    pages[i]['blocks'].insert(k, {'t': 'h2', 'x': title})
            out.append({'title': title, 'level': e['level'], 'page': i}); last = i
        else:
            idx = max(near(e['page']), last)
            out.append({'title': title, 'level': e['level'], 'page': idx}); last = idx
    # headings marked during proofreading that the printed contents doesn't list (e.g. the bibliography)
    listed = {(t['page'], t['title']) for t in out}
    for i, p in enumerate(pages):
        for b in p['blocks']:
            if b['t'] == 'h1' and i >= first_body and (i, b['x']) not in listed and not re.fullmatch(r'ምዕራፍ\s*\S{1,3}\s*[·፥:፡]?\s*', b['x']):
                out.append({'title': b['x'], 'level': 1, 'page': i})
    out.sort(key=lambda t: t['page'])
    # a bare "ምዕራፍ ፲፫" left in front of the clean chapter heading (its number misread) is a duplicate
    titles = {t['title'] for t in out}
    for p in pages:
        bl = p['blocks']
        for k in range(len(bl) - 1, -1, -1):
            if bl[k]['t'] == 'h1' and bl[k]['x'] not in titles and re.fullmatch(r'ምዕራፍ\s*\S{1,3}\s*[·፥:፡]?\s*', bl[k]['x']) \
                    and k + 1 < len(bl) and bl[k + 1]['x'] in titles:
                bl.pop(k)
    return out

# ---------- main ----------
def main(book_id, ocr_dir):
    cat = json.load(open(os.path.join(ROOT, 'data/catalog.json')))
    book = next(b for b in cat['books'] if b['id'] == book_id)
    raw = []
    for part in book['parts']:
        if not part.get('file'): continue
        stem = os.path.splitext(part['file'])[0]
        responses = []
        for f in sorted(glob.glob(f'{ocr_dir}/{stem}/output-*.json'), key=lambda f: int(re.search(r'output-(\d+)', f).group(1))):
            responses += json.load(open(f))['responses']
        for r in responses:
            fta = r.get('fullTextAnnotation')
            if not fta: continue
            vp = fta['pages'][0]
            landscape = vp['width'] > vp['height'] * 1.1
            for hi, half in enumerate(split_halves(vision_lines(vp), landscape)):
                if half: raw.append((half, {'file': part['file'], 'page': r['context']['pageNumber'], 'half': ['L', 'R'][hi] if landscape else 'F'}))
    for half, _ in raw:                                  # lexicon from words that sit inside lines
        for l in half:
            for w in l['x'].split()[1:-1]:
                if ETH.match(w): LEX[w] += 1
    global HEADER_TEXT, FOOTNOTES
    from rapidfuzz import fuzz
    firsts = [norm_header(sorted(h, key=lambda l: l['y0'])[0]['x']) for h, _ in raw if len(h) > 3]
    common = Counter(firsts).most_common(1)
    if common and len(common[0][0]) >= 3 and sum(1 for t in firsts if fuzz.ratio(t, common[0][0]) >= 60) >= 0.3 * len(firsts):
        HEADER_TEXT = common[0][0]
    n_notes = sum(1 for h, _ in raw if footnote_start(h) is not None)
    FOOTNOTES = n_notes >= 8 and n_notes >= 0.05 * max(1, len(raw))
    tops = Counter(norm_header(sorted(h, key=lambda l: l['y0'])[0]['x']) for h, _ in raw if len(h) > 3)
    HEADERS.update(t for t, n in tops.items() if n >= 3 and t and len(t) < 45 and not t.startswith('ምዕራፍ'))
    pages = []
    for half, src in raw:
        label, blocks = layout_page(half)
        if blocks: pages.append({'n': label, 'src': src, 'conf': round(statistics.mean(l['conf'] for l in half), 3), 'blocks': blocks, '_lines': half})
    fix_labels(pages)

    # contents pages -> parsed contents list
    cidx = [i for i, p in enumerate(pages[:20]) if is_contents_page(p)]
    if cidx: cidx = list(range(cidx[0], cidx[-1] + 1))
    printed = parse_printed_contents(pages, cidx) if cidx else []
    first_body = (cidx[-1] + 1) if cidx else 0
    label_to_idx = {}
    for i, p in enumerate(pages):
        if i >= first_body and p['n'] and p['n'].isdigit(): label_to_idx.setdefault(int(p['n']), i)
    def nearest(n):
        for d in range(0, 4):
            for c in (n + d, n - d):
                if c in label_to_idx: return label_to_idx[c]
    toc = []
    if sum(1 for e in printed if e['level'] == 1) >= 3:
        for e in printed:
            idx = nearest(e['page'])
            if idx is None: continue
            t = e['title'].strip(' ?."\'·፥')
            if e['level'] == 1 and not t:
                h = next((b['x'] for b in pages[idx]['blocks'] if b['t'] == 'h1'), '')
                t = re.sub(r'^ምዕራፍ\s*\S+\s*[·፥:፡]*\s*', '', h).strip(' ?."\'·፥')
            toc.append({'title': (f"ምዕራፍ {e['num']}" + (f" · {t}" if t else '')) if e['level'] == 1 else ((e['num'] + ' ') if e['num'] else '') + t,
                        'level': e['level'], 'page': idx})
    # unnumbered front sections that appear as headings after the contents (መግቢያ, ልዩ መግለጫ ...)
    first_ch = min([t['page'] for t in toc if t['title'].startswith('ምዕራፍ')], default=len(pages))
    for i in range(first_body, min(first_ch, len(pages))):
        for b in pages[i]['blocks']:
            if b['t'] == 'h2' and len(b['x']) < 30 and not any(t['page'] == i and t['title'] == b['x'] for t in toc):
                b['x'] = unspace_letters(b['x']); toc.append({'title': b['x'], 'level': 1, 'page': i})
    toc.sort(key=lambda t: (t['page'], 1, 0) if t.get('absent') else (t['page'], 0, t['level']))   # absent entries keep printed order
    if not toc:                                          # no printed contents: chapter headings found in the text
        toc = [{'title': b['x'], 'level': 1, 'page': i} for i, p in enumerate(pages) for b in p['blocks'] if b['t'] == 'h1']

    # front matter before the contents: centred display lines
    for i in range(0, cidx[0] if cidx else 0):
        for b in pages[i]['blocks']:
            b['t'] = 'c'; b['x'] = unspace_letters(b['x'])
    # contents pages: one generated, linked contents list
    for n, i in enumerate(cidx):
        pages[i]['kind'] = 'contents'
        pages[i]['blocks'] = [{'t': 'h1', 'x': 'ማውጫ'}, {'t': 'toc', 'x': ''}] if n == 0 else []
    pages = [p for p in pages if p['blocks']]
    # page indexes shift after dropping empty contents pages
    old_to_new = {}
    for new, p in enumerate(pages): old_to_new[id(p)] = new
    # (toc page indexes were computed before the drop)
    shift = lambda i: i - sum(1 for j in cidx[1:] if j < i)
    for t in toc: t['page'] = shift(t['page'])

    fixed = apply_corrections(pages, book_id)
    for p in pages:                                      # a bullet between Ethiopic words is a misread ፥ (clause separator)
        for b in p['blocks']: b['x'] = re.sub(r'(?<=[\u1200-\u137F]) • (?=[\u1200-\u137F“«])', ' ፥ ', b['x'])
    toc = use_clean_contents(pages, toc, book_id, first_body - len(cidx[1:]) if cidx else 0)
    chapters = [] if os.path.exists(os.path.join(ROOT, f'data/corrections/{book_id}-toc.json')) else \
        [t for t in toc if t['level'] == 1 and t['title'].startswith('ምዕራፍ')]
    for i, p in enumerate(pages):                        # chapter headings: clean title from the contents, exact page
        for b in p['blocks']:
            if b['t'] != 'h1' or b['x'] == 'ማውጫ': continue
            near = min(chapters, key=lambda t: abs(t['page'] - i), default=None)
            if near and abs(near['page'] - i) <= 2 and not near.get('_used'):
                b['x'] = near['title']; near['page'] = i; near['_used'] = True
    for t in chapters:                                   # heading not recognised in the text: put it at the top of its page
        if not t.get('_used') and t['page'] < len(pages):
            bl = pages[t['page']]['blocks']
            if bl and bl[0]['t'] in ('h2', 'p') and re.match(r'^ምዕ', bl[0]['x']) and len(bl[0]['x']) < 60: bl.pop(0)
            bl.insert(0, {'t': 'h1', 'x': t['title']})
    for t in toc: t.pop('_used', None)
    toc.sort(key=lambda t: (t['page'], 1, 0) if t.get('absent') else (t['page'], 0, t['level']))   # absent entries keep printed order
    for a, b in zip(pages, pages[1:]):                   # paragraph continuing onto the next page (footnotes in between are skipped)
        last = next((x for x in reversed(a['blocks']) if x['t'] != 'fn'), None)
        first = b['blocks'][0] if b['blocks'] else None
        if last and first and last['t'] == 'p' and first['t'] == 'p' \
                and (not last['x'].endswith(END_PUNCT) or first.get('forcecont')) and not first.get('nocont'):
            first['cont'] = True
    for p in pages:
        for b in p['blocks']: b.pop('nocont', None); b.pop('forcecont', None)
    for p in pages: p.pop('_lines', None)
    for t in toc:                                        # the heading block each contents entry points at (reader jumps there)
        blk = t.pop('_blk', None)
        if t['page'] >= len(pages) or t.get('absent'): continue
        bl = pages[t['page']]['blocks']
        k = next((k for k, b in enumerate(bl) if b is blk), None) if blk is not None else None
        if k is None: k = next((k for k, b in enumerate(bl) if b['x'] == t['title']), None)
        if k is not None: t['b'] = k
    out = {'id': book_id, 'titleAm': book['titleAm'], 'titleEn': book['titleEn'], 'author': book['author'], 'engine': 'cloud-vision',
           'pages': pages, 'toc': toc}
    os.makedirs(os.path.join(ROOT, 'data/text'), exist_ok=True)
    json.dump(out, open(os.path.join(ROOT, f'data/text/{book_id}.json'), 'w'), ensure_ascii=False, separators=(',', ':'))
    c = Counter(b['t'] for p in pages for b in p['blocks'])
    print(f'book {book_id}: {len(pages)} pages, {sum(len(b["x"]) for p in pages for b in p["blocks"])} chars, '
          f'{len(toc)} contents entries, blocks {dict(c)}, corrections applied {fixed}')

if __name__ == '__main__':
    main(int(sys.argv[1]), sys.argv[2])
