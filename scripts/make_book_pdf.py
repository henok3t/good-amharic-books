"""Typeset a converted book as a clean A5 PDF (and merge its original scans into one PDF).

    python3 scripts/make_book_pdf.py <book id> <out dir> [--cover cover.jpg] [--scans part1.pdf part2.pdf ...] [--lang en]

Writes <out dir>/<id>-text.pdf (typeset from data/text/<id>.json) and, with --scans, <out dir>/<id>-scan.pdf.
Fonts: Noto Serif Ethiopic / Noto Sans Ethiopic (Debian packages fonts-noto-core, fonts-noto-extra).
"""
import argparse, html, json, os, re
from datetime import date

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
esc = lambda s: html.escape(s or '', quote=True)

CSS = """
@page { size: 148mm 210mm; margin: 18mm 15mm 21mm 20mm;
  @top-center { font: 7.8pt 'Noto Sans Ethiopic', 'Noto Sans'; color: #7a6a50; letter-spacing: .02em; }
  @bottom-center { content: counter(page); font: 8.6pt 'Noto Sans Ethiopic', 'Noto Sans'; color: #555; }
  @footnote { border-top: 0.4pt solid #c9b98f; margin-top: 3mm; padding-top: 1.5mm; } }
@page :left  { margin: 18mm 20mm 21mm 15mm; @top-center { content: string(booktitle); } }
@page :right { margin: 18mm 15mm 21mm 20mm; @top-center { content: string(chapter, first-except); } }
@page :blank { @top-center { content: none; } @bottom-center { content: none; } }
@page cover { margin: 0; @top-center { content: none; } @bottom-center { content: none; } }
@page front { @top-center { content: none; } @bottom-center { content: counter(page, lower-roman); } }
@page fronttitle { @top-center { content: none; } @bottom-center { content: none; } }
@page :nth(1 of body) { counter-reset: page 1; }
html { font-family: 'Noto Serif Ethiopic', 'Noto Serif', serif; font-size: 10.6pt; line-height: 1.72; color: #1d1b18; }
body { margin: 0; string-set: booktitle attr(data-title); }
.cover { page: cover; height: 210mm; display: flex; flex-direction: column; align-items: center; justify-content: center;
  background: #173a2c; color: #f3e7c9; text-align: center; break-after: page; }
.cover img { max-width: 104mm; max-height: 132mm; box-shadow: 0 2mm 6mm rgba(0,0,0,.4); margin-bottom: 9mm; }
.cover h1 { font-size: 26pt; margin: 0; line-height: 1.3; color: #e8b54a; bookmark-level: none; }
.cover .en { font-family: 'Noto Sans Ethiopic', 'Noto Sans'; font-size: 12pt; margin-top: 2mm; color: #f3e7c9; }
.cover .author { font-size: 13pt; margin-top: 6mm; }
.halftitle, .titlepage { page: fronttitle; break-before: right; text-align: center; hyphens: manual; }
.halftitle { padding-top: 60mm; font-size: 16pt; }
.titlepage { padding-top: 34mm; }
.titlepage h1 { font-size: 24pt; margin: 0 0 3mm; line-height: 1.3; bookmark-level: none; }
.titlepage .sub { font-family: 'Noto Sans Ethiopic', 'Noto Sans'; font-size: 11pt; color: #555; }
.titlepage .author { font-size: 14pt; margin: 16mm 0 4mm; }
.titlepage .imprint { margin-top: 30mm; font-size: 9pt; color: #555; line-height: 1.5; }
.copyright { page: fronttitle; break-before: left; padding-top: 70mm; font-size: 8pt; line-height: 1.5; color: #444;
  text-align: left; hyphens: manual; }
.copyright p { margin: 0 0 2mm; text-indent: 0; text-align: left; }
.fsec { page: front; break-before: right; }
h2.front { font-size: 14pt; text-align: center; margin: 14mm 0 8mm; color: #173a2c; line-height: 1.35; hyphens: manual; bookmark-level: 1;
  string-set: chapter content(); }
.contents { page: front; break-before: right; }
.contents h2 { font-size: 16pt; text-align: center; margin: 10mm 0 8mm; color: #173a2c; bookmark-level: 1; string-set: chapter content(); }
.contents ol { list-style: none; padding: 0; margin: 0; font-size: 9.6pt; line-height: 1.45; }
.contents li { margin: 0 0 1.4mm; padding-left: 6mm; text-indent: -6mm; padding-right: 9mm; hyphens: manual; text-align: left; }
.contents li.l1 { font-weight: 600; margin-top: 2.2mm; }
.contents li.part { font-weight: 700; margin-top: 4mm; letter-spacing: .02em; color: #173a2c; }
.contents li.l2 { margin-left: 6mm; font-size: 9.1pt; color: #333; }
.contents li.l3 { margin-left: 12mm; font-size: 8.7pt; color: #444; }
.contents li.l4, .contents li.l5, .contents li.l6 { margin-left: 18mm; font-size: 8.4pt; color: #555; }
.contents a { color: inherit; text-decoration: none; }
.contents a::after { content: leader('.') target-counter(attr(href), page); margin-right: -9mm; }
.contents a.fr::after { content: leader('.') target-counter(attr(href), page, lower-roman); }
.contents li.absent { color: #aaa; }
.contents .absnote { margin-top: 4mm; font-size: 8pt; color: #777; text-indent: 0; }
main { page: body; }
.parttitle { break-before: right; break-after: page; padding-top: 52mm; text-align: center; hyphens: manual; }
.parttitle h2 { font-size: 20pt; line-height: 1.35; color: #173a2c; margin: 0; bookmark-level: 1; string-set: chapter attr(data-title); }
.label { display: block; font-size: 9.5pt; letter-spacing: .14em; text-transform: uppercase; color: #8a7a5a; margin-bottom: 5mm; font-weight: 600; }
h2.chapter { break-before: right; string-set: chapter attr(data-title); bookmark-level: 1; padding-top: 16mm; margin: 0 0 9mm;
  font-size: 17pt; text-align: center; color: #173a2c; line-height: 1.35; hyphens: manual; }
h3 { color: #173a2c; break-after: avoid; line-height: 1.4; hyphens: manual; text-align: left; }
h3.l2 { font-size: 12pt; margin: 6mm 0 2mm; bookmark-level: 2; }
h3.l3 { font-size: 11pt; margin: 5mm 0 1.8mm; bookmark-level: 3; }
h3.l4 { font-size: 10.6pt; margin: 4mm 0 1.5mm; font-style: italic; bookmark-level: 4; }
h3.pt { font-size: 10.4pt; margin: 3.5mm 0 1.2mm; font-weight: 600; bookmark-level: none; }
h3 + p { orphans: 3; }
p { margin: 0 0 1.4mm; text-indent: 1.3em; text-align: justify; orphans: 2; widows: 2; }
p.c { text-align: center; text-indent: 0; hyphens: manual; }
p.li { text-indent: -1.2em; padding-left: 1.2em; }
p.bq { margin: 1.8mm 0 2.4mm 5mm; padding-left: 4.2mm; text-indent: -4.2mm; font-size: 9.6pt; line-height: 1.55; }
p.qt { margin: 1.8mm 4mm 2.4mm 6mm; text-indent: 0; font-size: 9.6pt; line-height: 1.55; }
p.cm { padding-left: 4.2mm; text-indent: -4.2mm; }
p.bq + p.bq, p.qt + p.qt { margin-top: 0; }
p.src { text-align: right; text-indent: 0; font-size: 8.8pt; margin: -1mm 0 2.4mm; hyphens: manual; color: #333; }
h2.chapter + p, h3 + p, .label + p, h2.front + p { text-indent: 0; }
.fnote { float: footnote; font-size: 7.8pt; line-height: 1.42; text-align: left; text-indent: 0; color: #333; hyphens: manual; }
html[lang=am] .fnote { font-size: 8.4pt; }
::footnote-call { content: counter(footnote); vertical-align: super; font-size: 62%; line-height: 0; }
::footnote-marker { content: counter(footnote) ".\\2002"; }
.tbl { border-collapse: collapse; width: 100%; margin: 2mm 0 3mm; font-size: 8.4pt; line-height: 1.38; hyphens: manual; }
.tbl td, .tbl th { border: 0.4pt solid #c9b98f; padding: 1mm 1.4mm; vertical-align: top; text-align: left; font-weight: normal; }
.tbl thead { display: table-header-group; }
.tbl thead th { background: #f3ecd9; font-weight: bold; }
.tbl tr { break-inside: avoid; }
.tbl.wide { table-layout: fixed; font-size: 7.2pt; }
.end { text-align: center; margin-top: 10mm; color: #7a6a50; }
.endnote { text-align: center; font-size: 8.6pt; color: #777; margin-top: 8mm; text-indent: 0; }
"""

EN_CSS = """
html { font-family: 'Noto Serif', 'Noto Serif Ethiopic', serif; font-size: 10.4pt; line-height: 1.6;
  hyphens: auto; hyphenate-limit-chars: 6 3 3; hyphenate-limit-zone: 8%; }
@page { @top-center { font-family: 'Noto Sans', 'Noto Sans Ethiopic'; } @bottom-center { font-family: 'Noto Sans', 'Noto Sans Ethiopic'; } }
.cover h1 { font-family: 'Noto Serif'; font-size: 24pt; }
"""

ETH_NUM = '፩፪፫፬፭፮፯፰፱'
SUP = str.maketrans('0123456789', '⁰¹²³⁴⁵⁶⁷⁸⁹')
LIST_RE = re.compile(r'^([—–•*✟-]\s|\(\d{1,2}\)\s|([ሀ-ፐ]|[a-z]|\d{1,2}(ኛ)?)[./)]\s?)')

def classify(x, prev_cls):
    """Paragraph class: bq (quotation item ❖ ◉), cm (➢ comment), qt (whole paragraph in quotation marks), src (source line),
    li (list item), '' (body)."""
    s = x.strip()
    if re.match(r'^[❖◉◎]\s', s): return 'bq'
    if re.match(r'^➢\s', s): return 'cm'
    if re.fullmatch(r'\([^()]*(\([^()]*\)[^()]*)*\)', s) and len(s) < 220 and prev_cls in ('bq', 'qt', 'src', 'c'): return 'src'
    if re.match(r'^[“"]', s) and re.search(r'[”"]\s*(\([^)]*\))?\s*[።.]?$', s) and len(s) > 60: return 'qt'
    if LIST_RE.match(s): return 'li'
    return ''

def head_level(x, toc_level):
    if toc_level: return 'l2' if toc_level <= 2 else ('l3' if toc_level == 3 else 'l4')
    m = re.match(r'^(\d+(?:\.\d+)+)\s', x)
    if m: d = m.group(1).count('.') + 1; return 'l2' if d <= 2 else ('l3' if d == 3 else 'l4')
    if re.match(r'^(\d{1,2}|[a-zሀ-ፐ])[.)]\s', x): return 'pt'
    return 'l3'

def split_label(x):
    """'Part One · On the Saints' -> ('Part One', 'On the Saints'); 'Chapter 2' -> ('Chapter 2', '')."""
    if ' · ' in x: a, b = x.split(' · ', 1); return a, b
    if re.match(r'^(Part|Chapter|ክፍል|ምዕራፍ)\s', x) and len(x) < 30: return x, ''
    return '', x

def build_html(book, text, cover):
    en = text.get('lang') == 'en'
    pages, toc = text['pages'], text['toc']
    first_body = next((i for i, p in enumerate(pages) if p.get('kind') == 'contents'), -1) + 1
    title, other = (text.get('titleEn') or book.get('titleEn'), book['titleAm']) if en else (book['titleAm'], book.get('titleEn'))
    author = book.get('author') if en else (text.get('authorAm') or book.get('author'))
    # contents anchors: the heading block each entry points at (toc[].b), else the start of its page
    anchor_at, page_anchor = {}, {}
    for k, t in enumerate(toc):
        if t.get('absent'): continue
        if t.get('b') is not None and t['b'] >= 0 and t['b'] < len(pages[t['page']]['blocks']): anchor_at.setdefault((t['page'], t['b']), f'toc{k}')
        else: page_anchor.setdefault(t['page'], []).append(f'toc{k}')
    toc_level = {(t['page'], t['b']): t['level'] for t in toc if t.get('b') is not None and not t.get('absent')}
    front_toc = {k for k, t in enumerate(toc) if not t.get('absent') and k < len(toc) and t['level'] == 1 and k == 0}  # the foreword
    out = [f'<!doctype html><html lang="{"en" if en else "am"}"><head><meta charset="utf-8"><title>{esc(title)}</title>'
           f'<meta name="author" content="{esc(author)}"><style>{CSS}{EN_CSS if en else ""}</style></head>'
           f'<body data-title="{esc(title)}">']
    # cover, half-title (recto), title page (recto), copyright page (verso)
    out.append(f'<section class="cover">{f"<img src=\"{esc(cover)}\">" if cover else ""}<h1>{esc(title)}</h1>'
               f'<div class="en">{esc(other)}</div><div class="author">{esc(author)}</div></section>')
    out.append(f'<section class="halftitle">{esc(title)}</section>')
    own_title = [b['x'] for b in pages[0]['blocks'] if b['x'].strip()] if first_body > 1 else []
    imprint = ''.join(f'<div>{esc(x)}</div>' for x in own_title[2:])     # "Prepared by …", date, place
    out.append(f'<section class="titlepage"><h1>{esc(title)}</h1>'
               f'<div class="sub">{esc(text.get("subtitleEn") if en and text.get("subtitleEn") else other)}</div>'
               f'<div class="author">{esc(author)}</div><div class="imprint">{imprint}</div></section>')
    notes_ed = ([text.get('translatorNote', ''), 'English translation of the scanned Amharic edition; its pages do not follow the printed edition.']
                if en else ['ይህ ዲጂታል እትም ከተቃኘው መጽሐፍ ተቀይሮና ተገምግሞ ለንባብ በአዲስ መልክ የተዘጋጀ ነው፤ የገጽ አከፋፈሉ ከዋናው መጽሐፍ ይለያል።',
                            'Digital edition converted from the scanned book, proofread and newly typeset; its pages do not follow the printed edition.'])
    # the book's own front matter: page 1 up to its first heading is the copyright page; each heading starts a new recto section
    front_blocks = [b for p in pages[1:max(first_body - 1, 1)] if p.get('kind') != 'contents' for b in p['blocks'] if b['x'].strip()]
    cut = next((n for n, b in enumerate(front_blocks) if b['t'] in ('h1', 'h2')), len(front_blocks))
    out.append('<section class="copyright">' + ''.join(f'<p>{esc(b["x"])}</p>' for b in front_blocks[:cut]) +
               ''.join(f'<p>{esc(n)}</p>' for n in notes_ed if n) + f'<p>Good Amharic Books · private preview · {date.today():%Y-%m-%d}</p></section>')
    sec = []
    for b in front_blocks[cut:]:
        if b['t'] in ('h1', 'h2'):
            if sec: out.append('</section>')
            out.append(f'<section class="fsec"><h2 class="front">{esc(b["x"])}</h2>'); sec = [b]; continue
        out.append(f'<p class="c">{esc(b["x"])}</p>' if b['t'] == 'c' or len(b['x']) < 90 else f'<p>{esc(b["x"])}</p>')
    if sec: out.append('</section>')
    # contents
    items = []
    for k, t in enumerate(toc):
        if t['page'] < first_body: continue
        is_part = t['level'] == 1 and re.match(r'^(Part|ክፍል)\s', t['title'])
        cls = f'l{t["level"]}{" part" if is_part else ""}{" absent" if t.get("absent") else ""}'
        if t.get('absent'): items.append(f'<li class="{cls}">{esc(t["title"])}</li>')
        else: items.append(f'<li class="{cls}"><a href="#toc{k}"{" class=\"fr\"" if k in front_toc else ""}>{esc(t["title"])}</a></li>')
    absent = [t['title'] for t in toc if t.get('absent') and t['level'] == 1]
    absnote = (f'<p class="absnote">{"Entries in grey are missing from the scanned copy: " if en else "በግራጫ የተጻፉት በተቃኘው ቅጂ የሉም፦ "}'
               f'{esc(", ".join(absent))}.</p>') if absent else ''
    out.append(f'<section class="contents"><h2>{"Contents" if en else "ማውጫ"}</h2><ol>{"".join(items)}</ol>{absnote}</section>')

    # body: the foreword stays in the roman-numbered front matter; arabic page 1 starts at the next chapter
    body_start = next((t['page'] for k, t in enumerate(toc) if k > 0 and t['level'] == 1 and not t.get('absent') and t['page'] >= first_body), first_body)
    blocks = []                                               # flatten (page, k, block) with continuations joined later
    for i in range(first_body, len(pages)):
        for k, b in enumerate(pages[i]['blocks']): blocks.append((i, k, b))
    html_out, open_t, last_p_end = [], None, None
    para = None                                               # {'cls', 'id', 'parts': [...], 'notes': [...]}
    def note_span(x):
        x = re.sub(r'^\*?\d{1,3}\s*', '', x.strip())
        return f'<span class="fnote">{esc(x)}</span>'
    def close_para():
        nonlocal para, last_p_end
        if not para: return
        body = ' '.join(para['parts'])
        for n_raw in para['notes']:
            num = re.match(r'^\*?(\d{1,3})', n_raw.strip())
            sup = num.group(1).translate(SUP) if num else None
            span = note_span(n_raw)
            if sup and sup in body: body = body.replace(sup, span, 1)       # the book marked the place: put the note there
            else: body += span
        tag = f'<p{para["id"]}{(" class=" + chr(34) + para["cls"] + chr(34)) if para["cls"] else ""}>{body}</p>'
        html_out.append(tag); last_p_end = len(html_out) - 1; para = None
    def attach_note(x):                                       # a note with no open paragraph goes with the previous one
        if para is not None: para['notes'].append(x); return
        if last_p_end is not None:
            html_out[last_p_end] = html_out[last_p_end][:-4] + note_span(x) + '</p>'
        else: html_out.append(f'<p class="c">{note_span(x)}</p>')
    def close_table():
        nonlocal open_t
        if open_t is None: return
        rows = open_t
        header = rows and not re.search(r'\d', re.sub(r'<[^>]+>', '', rows[0][0])) and len(rows) > 1
        ncol = max(len(r) for r in rows)
        h = f'<table class="tbl{" wide" if ncol >= 6 else ""}">'
        if header: h += '<thead><tr>' + ''.join(f'<th>{c}</th>' for c in rows[0]) + '</tr></thead>'
        h += '<tbody>' + ''.join('<tr>' + ''.join(f'<td>{c}</td>' for c in r) + '</tr>' for r in rows[1 if header else 0:]) + '</tbody></table>'
        html_out.append(h); open_t = None
    prev_cls = ''
    for idx, (i, k, b) in enumerate(blocks):
        marks = ''.join(f'<a id="{a}"></a>' for a in page_anchor.pop(i, [])) if k == 0 or (i in page_anchor) else ''
        if i == body_start and k == 0 and not html_out[-1:] == ['<!--body-->']: pass
        if b['t'] == 'toc': continue
        if not b['x'].strip():
            if marks: html_out.append(marks)
            continue
        if b['t'] == 'fn':
            if open_t is not None:                            # a note on a table: put it where the cell marks it
                num = re.match(r'^\*?(\d{1,3})', b['x'].strip()); sup = num.group(1).translate(SUP) if num else None
                hit = next(((r, c) for r, row in enumerate(open_t) for c, cell in enumerate(row) if sup and sup in cell), None)
                if hit: r, c = hit; open_t[r][c] = open_t[r][c].replace(sup, note_span(b['x']), 1); continue
            attach_note(b['x']); continue
        x = esc(b['x'])
        aid = anchor_at.get((i, k))
        idattr = f' id="{aid}"' if aid else ''
        if b['t'] == 'p' and b.get('cont') and k == 0 and para is not None:
            para['parts'].append(marks + x); continue
        if b['t'] == 'p' and '|' in b['x'] and re.search(r' \| |^\| ', b['x']):
            close_para()
            cells = [esc(c.strip()) for c in b['x'].split('|')]
            if b['x'].startswith('|'): cells = [''] + cells[1:] if cells[0] == '' else cells
            if open_t is None: open_t = []
            if marks or aid: cells[0] = (marks + (f'<a id="{aid}"></a>' if aid else '')) + cells[0]
            open_t.append(cells); continue
        close_table(); close_para()
        if b['t'] == 'h1':
            lab, ttl = split_label(b['x'])
            label = f'<span class="label">{esc(lab)}</span>' if lab else ''
            if re.match(r'^(Part|ክፍል)\s', b['x']):
                html_out.append(f'<section class="parttitle">{marks}<h2{idattr} data-title="{esc(ttl or lab)}">{label}{esc(ttl)}</h2></section>')
            else:
                html_out.append(f'<h2 class="chapter"{idattr} data-title="{esc(ttl or lab)}">{marks}{label}{esc(ttl)}</h2>')
            prev_cls = 'h'; continue
        if b['t'] == 'h2':
            html_out.append(f'<h3 class="{head_level(b["x"], toc_level.get((i, k)))}"{idattr}>{marks}{x}</h3>'); prev_cls = 'h'; continue
        if b['t'] == 'c':
            cls = 'src' if re.fullmatch(r'\(.*\)', b['x'].strip(), re.S) and len(b['x']) < 220 else 'c'
            html_out.append(f'<p class="{cls}"{idattr}>{marks}{x}</p>'); last_p_end = len(html_out) - 1; prev_cls = cls; continue
        cls = classify(b['x'], prev_cls)
        para = {'cls': cls, 'id': idattr, 'parts': [marks + x], 'notes': []}; prev_cls = cls or 'p'
    close_table(); close_para()
    # the foreword (front matter, roman folios) goes before <main>; the rest is the body with arabic folios from 1
    body_html = ''.join(html_out)
    split_at = None
    if body_start > first_body:
        first_id = next((f'toc{k}' for k, t in enumerate(toc) if t['page'] == body_start and t['level'] == 1 and not t.get('absent')), None)
        if first_id:
            pos = body_html.find(f'id="{first_id}"')
            split_at = body_html.rfind('<', 0, pos) if pos > 0 else None
            if split_at is not None and body_html[max(0, split_at - 30):split_at].endswith('<section class="parttitle">'): split_at -= len('<section class="parttitle">')
    if split_at:
        out.append(f'<section class="fsec">{body_html[:split_at]}</section><main>{body_html[split_at:]}')
    else:
        out.append(f'<main>{body_html}')
    if absent: out.append(f'<p class="endnote">{"The scanned copy ends here; " if en else "የተቃኘው ቅጂ እዚህ ያበቃል፤ "}{esc(", ".join(absent))}'
                          f'{" are not available." if en else " አይገኙም።"}</p>')
    out.append('<p class="end">❖ ❖ ❖</p></main></body></html>')
    return ''.join(out)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('book_id', type=int); ap.add_argument('out')
    ap.add_argument('--cover'); ap.add_argument('--scans', nargs='*'); ap.add_argument('--lang', default='am')
    a = ap.parse_args()
    from weasyprint import HTML
    sfx = '.en' if a.lang == 'en' else ''
    text = json.load(open(os.path.join(ROOT, f'data/text/{a.book_id}{sfx}.json')))
    cat = json.load(open(os.path.join(ROOT, 'data/catalog.json')))
    book = next(b for b in cat['books'] if b['id'] == a.book_id)
    os.makedirs(a.out, exist_ok=True)
    doc = build_html(book, text, a.cover and os.path.abspath(a.cover))
    name = f'{a.book_id}-text{"-en" if a.lang == "en" else ""}'
    open(os.path.join(a.out, f'{name}.html'), 'w').write(doc)
    pdf = HTML(string=doc, base_url='/').render()
    pdf.metadata.title = (text.get('titleEn') or book.get('titleEn')) if a.lang == 'en' else book['titleAm']
    pdf.metadata.authors = [book.get('author') or '']; pdf.metadata.lang = a.lang
    pdf.write_pdf(os.path.join(a.out, f'{name}.pdf'))
    print('text pdf:', len(pdf.pages), 'pages')
    if a.scans:
        from pypdf import PdfWriter, PdfReader
        w = PdfWriter()
        for k, f in enumerate(a.scans):
            start = len(w.pages)
            for pg in PdfReader(f).pages: w.add_page(pg)
            w.add_outline_item(f'{book["titleAm"]} — {k + 1}', start)
        w.add_metadata({'/Title': f'{book["titleAm"]} (original scans)', '/Author': book.get('author') or ''})
        with open(os.path.join(a.out, f'{a.book_id}-scan.pdf'), 'wb') as fh: w.write(fh)
        print('scan pdf:', len(w.pages), 'pages')

if __name__ == '__main__':
    main()
