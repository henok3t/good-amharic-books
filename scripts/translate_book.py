"""Translation pipeline for a converted book (Amharic -> English), run by helper agents in stages.

    python3 scripts/translate_book.py init <book id> <work dir>      # freeze the source, split into parts, glossary material
    python3 scripts/translate_book.py render <work dir> <part>        # write parts/NN.en.txt (current English) + NN.flags.txt
    python3 scripts/translate_book.py status <work dir>               # which stage each part has reached
    python3 scripts/translate_book.py check <work dir> [part]         # automatic checks on the current English
    python3 scripts/translate_book.py assemble <book id> <work dir>   # write data/text/<id>.en.json

Units: every block of the Amharic text is a unit, except paragraphs that continue across a printed page break, which are
joined to the paragraph they continue (Amharic word order means half a sentence can't be translated on its own); the
continuation blocks get an empty English text and keep their page anchor. Contents blocks are not translated (the reader
draws them from the translated contents).

Stages, in order: tr (translator) -> mean (meaning) -> scr (scripture & sources) -> read (readability) -> theo (theology).
Each stage writes parts/NN.<stage>.txt in the unit format:

    [61-2]
    English text of the unit, one paragraph
    WHY: optional reason (reviewers only)

The translator gives every unit; reviewers give only the units they change (the full new text). Later stages win.
"""
import json, os, re, sys, shutil, hashlib
from collections import Counter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STAGES = ['tr', 'mean', 'scr', 'read', 'theo']
ETH = re.compile(r'[ሀ-፿]')
UNIT_RE = re.compile(r'^\[(\d+-\d+)\]\s*$', re.M)


def load(work):
    return json.load(open(os.path.join(work, 'source.json'))), json.load(open(os.path.join(work, 'units.json')))


def build_units(pages):
    units, last_p = [], None
    for i, pg in enumerate(pages):
        for k, b in enumerate(pg['blocks']):
            if b['t'] == 'toc': continue
            uid = f'{i}-{k}'
            if b['t'] == 'p' and b.get('cont') and k == 0 and last_p is not None:
                last_p['ids'].append(uid); last_p['x'] += ' ' + b['x']; continue
            u = {'id': uid, 'ids': [uid], 't': b['t'], 'x': b['x'], 'page': i}
            units.append(u)
            if b['t'] == 'p': last_p = u
            elif b['t'] != 'fn': last_p = None        # footnotes between the halves don't break the paragraph
    return units


def split_parts(pages, units, target=24, hard=32):
    """Cut at page starts that begin a new unit (not the second half of a joined paragraph), preferring pages that open
    with a heading; parts are about `target` pages, never more than `hard` unless no cut is possible."""
    owner = {x: u for u in units for x in u['ids']}
    def clean_start(i):
        ks = [k for k, b in enumerate(pages[i]['blocks']) if b['t'] != 'toc']
        if not ks: return False
        u = owner.get(f'{i}-{ks[0]}')
        return u is not None and u['ids'][0] == f'{i}-{ks[0]}'
    parts, cur = [], 0
    for i in range(1, len(pages)):
        if not clean_start(i): continue
        head = pages[i]['blocks'][0]['t'] in ('h1', 'h2') if pages[i]['blocks'] else False
        n = i - cur
        if (n >= target and head) or n >= hard:
            parts.append((cur, i)); cur = i
    if parts and len(pages) - cur < target // 3: cur = parts.pop()[0]   # don't leave a tiny last part
    parts.append((cur, len(pages)))
    return parts


def cmd_init(book_id, work):
    os.makedirs(os.path.join(work, 'parts'), exist_ok=True)
    src = os.path.join(ROOT, f'data/text/{book_id}.json')
    shutil.copy(src, os.path.join(work, 'source.json'))
    text = json.load(open(src)); pages = text['pages']
    units = build_units(pages)
    # a unit whose page has a continuation from the previous page must not start a part: map page -> joined
    parts = split_parts(pages, units)
    toc = text['toc']
    head_title = {f"{t['page']}-{t['b']}": n for n, t in enumerate(toc) if t.get('b') is not None and t.get('b', -1) >= 0}
    meta = {'book': book_id, 'sha1': hashlib.sha1(open(src, 'rb').read()).hexdigest(), 'parts': parts,
            'units': len(units), 'pages': len(pages)}
    json.dump({'meta': meta, 'units': units, 'head_toc': head_title}, open(os.path.join(work, 'units.json'), 'w'), ensure_ascii=False)
    for n, (a, b) in enumerate(parts):
        us = [u for u in units if a <= u['page'] < b]
        out = [f'# Part {n:02d}: page indexes {a}-{b - 1} (printed {pages[a].get("n") or "?"}-{pages[b - 1].get("n") or "?"}), {len(us)} units\n']
        for u in us:
            extra = f' | contents entry {head_title[u["id"]]}' if u['id'] in head_title else ''
            joined = ' | joined across a page break' if len(u['ids']) > 1 else ''
            out.append(f'[{u["id"]}] {u["t"]}{extra}{joined}\n{u["x"]}\n')
        open(os.path.join(work, 'parts', f'{n:02d}.am.txt'), 'w').write('\n'.join(out))
    # material for the glossary agent
    g = os.path.join(work, 'glossary-input'); os.makedirs(g, exist_ok=True)
    open(os.path.join(g, 'contents.txt'), 'w').write('\n'.join(
        f'{n}\tlevel {t["level"]}\t{"ABSENT " if t.get("absent") else ""}{t["title"]}' for n, t in enumerate(toc)))
    heads = [f'[{u["id"]}] {u["t"]}: {u["x"]}' for u in units if u['t'] in ('h1', 'h2')]
    open(os.path.join(g, 'headings.txt'), 'w').write('\n'.join(heads))
    allx = '\n'.join(u['x'] for u in units)
    refs = Counter(m.group(1).strip() for m in re.finditer(r'\(?\s*((?:[1-3]\s?)?[ሀ-፿]{1,7}\.?)\s*\d{1,3}\s*[፥:፡]\s*\d', allx))
    open(os.path.join(g, 'bible-abbreviations.txt'), 'w').write('\n'.join(f'{c}\t{a}' for a, c in refs.most_common(150)))
    words = Counter(w for w in re.findall(r'[ሀ-፿]+', allx) if len(w) > 2)
    open(os.path.join(g, 'frequent-words.txt'), 'w').write('\n'.join(f'{c}\t{w}' for w, c in words.most_common(700)))
    saints = Counter(m.group(0) for m in re.finditer(r'(?:ቅዱስ|ቅድስት|ቅ\.|አባ|አቡነ|ማር)\s+[ሀ-፿]+(?:\s+(?:ዘ[ሀ-፿]+|አፈ ወርቅ|ነባቤ መለኰት|ሐዋርያዊ))?', allx))
    open(os.path.join(g, 'names.txt'), 'w').write('\n'.join(f'{c}\t{s}' for s, c in saints.most_common(250)))
    latin = [f'[{u["id"]}] {u["x"]}' for u in units if len(re.findall(r'[A-Za-z]', u['x'])) > 40]
    open(os.path.join(g, 'english-in-the-book.txt'), 'w').write('\n\n'.join(latin))
    front = [f'[{u["id"]}] {u["t"]}: {u["x"]}' for u in units if u['page'] < 27]
    open(os.path.join(g, 'front-matter.txt'), 'w').write('\n'.join(front))
    print(f'{len(units)} units in {len(parts)} parts:', ' '.join(f'{a}-{b - 1}' for a, b in parts))


def parse_units(path):
    if not os.path.exists(path): return {}
    s = open(path).read()
    nm = re.search(r'^NOTES:', s, re.M)                  # the agent's notes at the end are not part of the last unit
    if nm: s = s[:nm.start()]
    marks = list(UNIT_RE.finditer(s)); out = {}
    for n, m in enumerate(marks):
        body = s[m.end(): marks[n + 1].start() if n + 1 < len(marks) else len(s)].strip()
        why = ''
        wm = re.search(r'\n?WHY:\s*(.*)\Z', body, re.S)
        if wm: why = wm.group(1).strip(); body = body[:wm.start()].strip()
        out[m.group(1)] = {'x': body, 'why': why}
    return out


def current(work, part, upto=None):
    """English for every unit of the part after the stages up to and including `upto`; returns (english, last stage)."""
    eng, last = {}, None
    for st in STAGES:
        f = os.path.join(work, 'parts', f'{part:02d}.{st}.txt')
        if os.path.exists(f):
            for k, v in parse_units(f).items(): eng[k] = v['x']
            last = st
        if st == upto: break
    return eng, last


def part_units(work, part):
    _, U = load(work)
    a, b = U['meta']['parts'][part]
    return [u for u in U['units'] if a <= u['page'] < b], U


NUM = re.compile(r'\d+')
ETH_DIGITS = {c: v for c, v in zip('፩፪፫፬፭፮፯፰፱', range(1, 10))}


def proper(t):
    """Capitalized words that are not at the start of a sentence (likely names and titles)."""
    return {m.group(0) for m in re.finditer(r'\b[A-Z][a-z]{3,}\b', t)
            if m.start() > 0 and not re.search(r'[.!?:;“"(\[—–-]\s*$|^\s*$', t[max(0, m.start() - 3):m.start()])}


def checks(units, eng, prev=None):
    flags = []
    for u in units:
        e = eng.get(u['id'])
        if e is None: flags.append(f'[{u["id"]}] MISSING: no English for this unit'); continue
        if u['t'] in ('p', 'fn') and re.fullmatch(r'\(.*\)', u['x'].strip(), re.S) and len(re.findall(r'[A-Za-z]', u['x'])) > 20 and e == '':
            continue                                    # English original of the quotation above, used in its translation
        if not e.strip(): flags.append(f'[{u["id"]}] EMPTY English'); continue
        if ETH.search(e): flags.append(f'[{u["id"]}] ETHIOPIC SCRIPT in English (only Geez quotations may stay): {"".join(ETH.findall(e))[:30]}')
        am_nums = Counter(NUM.findall(u['x'])); en_nums = Counter(NUM.findall(e))
        lost = [n for n in am_nums if en_nums[n] < am_nums[n]]
        if lost: flags.append(f'[{u["id"]}] NUMBERS not in English: {" ".join(lost[:8])}')
        r = len(e) / max(1, len(u['x']))
        if len(u['x']) > 60 and (r < 0.9 or r > 3.6): flags.append(f'[{u["id"]}] LENGTH ratio {r:.2f} (omission or addition?)')
        if u['t'] in ('h1', 'h2') and len(e) > 220: flags.append(f'[{u["id"]}] HEADING is long')
        if ' | ' in u['x'] and e.count(' | ') != u['x'].count(' | '): flags.append(f'[{u["id"]}] TABLE cells: {u["x"].count(" | ")} separators in Amharic, {e.count(" | ")} in English')
        if prev is not None and u['id'] in prev and prev[u['id']] != e:   # a later stage changed it: numbers and names must survive
            pn, en = Counter(NUM.findall(prev[u['id']])), Counter(NUM.findall(e))
            if pn != en: flags.append(f'[{u["id"]}] CHANGED NUMBERS since the previous stage: {sorted((pn - en).elements())[:6]} -> {sorted((en - pn).elements())[:6]}')
            pc, ec = proper(prev[u['id']]), proper(e)
            gone = pc - ec - {'The', 'This', 'That', 'These', 'There', 'They', 'When', 'What', 'However', 'Therefore', 'Thus', 'Then', 'And', 'But', 'For'}
            if gone: flags.append(f'[{u["id"]}] NAMES dropped since the previous stage: {", ".join(sorted(gone)[:6])}')
    return flags


def cmd_render(work, part):
    units, U = part_units(work, part)
    eng, last = current(work, part)
    out = [f'# Part {part:02d}: English after stage "{last}"\n']
    for u in units:
        out.append(f'[{u["id"]}]\n{eng.get(u["id"], "<<MISSING>>")}\n')
    open(os.path.join(work, 'parts', f'{part:02d}.en.txt'), 'w').write('\n'.join(out))
    stages_done = [s for s in STAGES if os.path.exists(os.path.join(work, 'parts', f'{part:02d}.{s}.txt'))]
    prev = current(work, part, stages_done[-2])[0] if len(stages_done) >= 2 else None
    fl = checks(units, eng, prev)
    open(os.path.join(work, 'parts', f'{part:02d}.flags.txt'), 'w').write('\n'.join(fl) + '\n')
    print(f'part {part:02d}: stage {last}, {len(units)} units, {len(fl)} flags')


def cmd_status(work):
    _, U = load(work)
    for n, (a, b) in enumerate(U['meta']['parts']):
        done = [s for s in STAGES if os.path.exists(os.path.join(work, 'parts', f'{n:02d}.{s}.txt'))]
        print(f'{n:02d} pages {a:3d}-{b - 1:3d}: {" ".join(done) or "-"}')


def cmd_check(work, part=None):
    _, U = load(work)
    total = 0
    for n in range(len(U['meta']['parts'])) if part is None else [part]:
        units, _ = part_units(work, n)
        eng, last = current(work, n)
        if not eng: continue
        fl = checks(units, eng)
        total += len(fl)
        print(f'part {n:02d} ({last}): {len(fl)} flags'); [print('  ' + f) for f in fl[:12]]
    print('total flags', total)


def curly(t):
    """Straight quotes to typographic ones (some parts were written with straight quotes)."""
    t = re.sub(r'(^|[\s(\[—–-])"', r'\1“', t); t = t.replace('"', '”')
    t = re.sub(r"(^|[\s(\[—–-])'", r'\1‘', t); t = t.replace("'", '’')
    return t


def cmd_assemble(book_id, work):
    src, U = load(work)
    eng = {}
    for n in range(len(U['meta']['parts'])):
        e, last = current(work, n)
        if last != 'theo': print(f'warning: part {n:02d} is only at stage {last}')
        eng.update(e)
    by_unit = {u['id']: u for u in U['units']}
    toc_en = json.load(open(os.path.join(work, 'toc_en.json')))
    pages = []
    missing = 0
    for i, pg in enumerate(src['pages']):
        bl = []
        for k, b in enumerate(pg['blocks']):
            uid = f'{i}-{k}'
            if b['t'] == 'toc': bl.append({'t': 'toc', 'x': ''}); continue
            if uid in by_unit:
                x = eng.get(uid)
                if x is None: missing += 1; x = ''
            else: x = ''                                 # continuation block: its text is in the unit it continues
            nb = {'t': b['t'], 'x': curly(x)}
            if b.get('cont'): nb['cont'] = True
            bl.append(nb)
        pages.append({**{k: v for k, v in pg.items() if k != 'blocks'}, 'blocks': bl})
    toc = [{**t, 'title': toc_en[str(n)] if str(n) in toc_en else t['title']} for n, t in enumerate(src['toc'])]
    meta = json.load(open(os.path.join(work, 'meta_en.json')))
    out = {**{k: v for k, v in src.items() if k not in ('pages', 'toc')}, 'lang': 'en', 'pages': pages, 'toc': toc, **meta}
    json.dump(out, open(os.path.join(ROOT, f'data/text/{book_id}.en.json'), 'w'), ensure_ascii=False, separators=(',', ':'))
    words = sum(len(b['x'].split()) for p in pages for b in p['blocks'])
    print(f'wrote data/text/{book_id}.en.json: {len(pages)} pages, {words} words, {missing} units without English')


if __name__ == '__main__':
    c = sys.argv[1]
    if c == 'init': cmd_init(int(sys.argv[2]), sys.argv[3])
    elif c == 'render': cmd_render(sys.argv[2], int(sys.argv[3]))
    elif c == 'status': cmd_status(sys.argv[2])
    elif c == 'check': cmd_check(sys.argv[2], int(sys.argv[3]) if len(sys.argv) > 3 else None)
    elif c == 'assemble': cmd_assemble(int(sys.argv[2]), sys.argv[3])
