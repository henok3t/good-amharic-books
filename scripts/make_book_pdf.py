"""Typeset a converted book as a clean A5 PDF (and merge its original scans into one PDF).

    python3 scripts/make_book_pdf.py <book id> <out dir> [--cover cover.jpg] [--scans part1.pdf part2.pdf ...]

Writes <out dir>/<id>-text.pdf (typeset from data/text/<id>.json) and, with --scans, <out dir>/<id>-scan.pdf.
Fonts: Noto Serif Ethiopic / Noto Sans Ethiopic (Debian packages fonts-noto-core, fonts-noto-extra).
"""
import argparse, html, json, os, re
from datetime import date

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
esc = lambda s: html.escape(s or '', quote=True)

CSS = """
@page { size: 148mm 210mm; margin: 18mm 16mm 20mm 18mm;
  @top-center { content: string(chapter); font: 8pt 'Noto Sans Ethiopic'; color: #7a6a50; }
  @bottom-center { content: counter(page); font: 9pt 'Noto Sans Ethiopic'; color: #555; } }
@page :first { margin: 0; @top-center { content: none; } @bottom-center { content: none; } }
@page front { @top-center { content: none; } @bottom-center { content: none; } }
@page contents { @top-center { content: none; } }
html { font-family: 'Noto Serif Ethiopic', serif; font-size: 10.6pt; line-height: 1.72; color: #1d1b18; }
body { margin: 0; }
.cover { page: first; height: 210mm; display: flex; flex-direction: column; align-items: center; justify-content: center;
  background: #173a2c; color: #f3e7c9; text-align: center; break-after: page; }
.cover img { max-width: 104mm; max-height: 132mm; box-shadow: 0 2mm 6mm rgba(0,0,0,.4); margin-bottom: 9mm; }
.cover h1 { font-size: 26pt; margin: 0; line-height: 1.3; color: #e8b54a; }
.cover .en { font-family: 'Noto Sans Ethiopic'; font-size: 12pt; margin-top: 2mm; color: #f3e7c9; }
.cover .author { font-size: 13pt; margin-top: 6mm; }
.titlepage { page: front; text-align: center; padding-top: 40mm; break-after: page; }
.titlepage h1 { font-size: 24pt; margin: 0 0 3mm; }
.titlepage .en { font-family: 'Noto Sans Ethiopic'; font-size: 12pt; color: #555; }
.titlepage .author { font-size: 14pt; margin: 14mm 0; }
.titlepage .note { position: absolute; bottom: 0; left: 0; right: 0; font: 7.5pt/1.5 'Noto Sans Ethiopic'; color: #777; }
.front { page: front; text-align: center; break-after: page; padding-top: 12mm; }
.front p { margin: 0 0 2.5mm; }
.contents { page: contents; break-after: page; }
.contents h2, h2.chapter { font-size: 17pt; text-align: center; margin: 6mm 0 8mm; color: #173a2c; line-height: 1.35; }
.contents ol { list-style: none; padding: 0; margin: 0; font-size: 10pt; }
.contents li { margin: 0 0 1.6mm; }
.contents li.l2 { padding-left: 7mm; font-size: 9.3pt; color: #333; }
.contents a { color: inherit; text-decoration: none; }
.contents a::after { content: leader('.') target-counter(attr(href), page); }
h2.chapter { break-before: page; string-set: chapter attr(data-title); bookmark-level: 1; padding-top: 6mm; }
h3 { font-size: 12pt; margin: 5mm 0 2mm; color: #173a2c; bookmark-level: 2; break-after: avoid; line-height: 1.4; }
p { margin: 0 0 1.4mm; text-indent: 1.3em; text-align: justify; orphans: 2; widows: 2; }
p.c { text-align: center; text-indent: 0; }
p.li { text-indent: -1.1em; padding-left: 1.1em; }
h2.chapter + p, h3 + p { text-indent: 0; }
.pg { float: right; margin-right: -13mm; width: 10mm; text-align: left; font: 6.5pt 'Noto Sans Ethiopic'; color: #a59a86; text-indent: 0; }
.end { text-align: center; margin-top: 10mm; color: #7a6a50; }
"""

def build_html(book, text, cover):
    pages = text['pages']
    toc = text['toc']
    first_body = next((i for i, p in enumerate(pages) if p.get('kind') == 'contents'), -1) + 1
    anchors = {}
    for k, t in enumerate(toc): anchors.setdefault((t['page'], t['title']), f'toc{k}')
    out = [f'<!doctype html><html lang="am"><head><meta charset="utf-8"><title>{esc(book["titleAm"])}</title>'
           f'<meta name="author" content="{esc(book.get("author"))}"><style>{CSS}</style></head><body>']
    out.append(f'<section class="cover">{f"<img src=\"{esc(cover)}\">" if cover else ""}<h1>{esc(book["titleAm"])}</h1>'
               f'<div class="en">{esc(book.get("titleEn"))}</div><div class="author">{esc(book.get("author"))}</div></section>')
    out.append(f'<section class="titlepage"><h1>{esc(book["titleAm"])}</h1><div class="en">{esc(book.get("titleEn"))}</div>'
               f'<div class="author">{esc(book.get("author"))}</div>'
               f'<div class="note">ይህ ዲጂታል እትም ከተቃኘው መጽሐፍ በOCR ተቀይሮና ተገምግሞ የተዘጋጀ ነው። በኅዳግ ያሉት ቁጥሮች የዋናውን መጽሐፍ ገጾች ያመለክታሉ።<br>'
               f'Digital edition converted from the scanned book; numbers in the margin are the original page numbers. '
               f'Good Amharic Books · private preview · {date.today():%Y-%m-%d}</div></section>')
    for p in pages[:max(first_body - 1, 0)]:                 # the book's own front matter (title page, imprint ...)
        if p.get('kind') == 'contents': continue
        out.append('<section class="front">' + ''.join(f'<p class="c">{esc(b["x"])}</p>' for b in p['blocks'] if b['x'].strip()) + '</section>')
    out.append('<section class="contents"><h2>ማውጫ</h2><ol>' + ''.join(
        f'<li class="l{t["level"]}"><a href="#{anchors[(t["page"], t["title"])]}">{esc(t["title"])}</a></li>' for t in toc
        if t['page'] >= first_body) + '</ol></section>')
    out.append('<main>')
    open_p = False
    for i in range(first_body, len(pages)):
        p = pages[i]
        mark = f'<span class="pg">{esc(p["n"])}</span>' if p.get('n') else ''
        # contents entries whose heading text isn't on the page verbatim: anchor at the page start
        mark += ''.join(f'<a id="{a}"></a>' for key, a in anchors.items() if key[0] == i and not any(b['x'] == key[1] for b in p['blocks']))
        for k, b in enumerate(p['blocks']):
            if b['t'] == 'toc': continue
            x = esc(b['x'])
            m = mark if k == 0 else ''
            if b['t'] == 'p' and b.get('cont') and k == 0 and open_p:
                out.append(f' {m}{x}'); continue               # paragraph continues across the page turn
            if open_p: out.append('</p>'); open_p = False
            ids = [anchors[key] for key in anchors if key[0] == i and key[1] == b['x']]
            idattr = f' id="{ids[0]}"' if ids else ''
            if b['t'] == 'h1': out.append(f'<h2 class="chapter" data-title="{x}"{idattr}>{m}{x}</h2>')
            elif b['t'] == 'h2': out.append(f'<h3{idattr}>{m}{x}</h3>')
            elif b['t'] == 'c': out.append(f'<p class="c"{idattr}>{m}{x}</p>')
            else:
                li = re.match(r'^([—–•-]\s|([ሀ-ፐ]|\d{1,2}(ኛ)?)[./)]\s?)', b['x'])
                out.append(f'<p{idattr}{" class=\"li\"" if li else ""}>{m}{x}'); open_p = True
    if open_p: out.append('</p>')
    out.append('<p class="end">❖ ❖ ❖</p></main></body></html>')
    return ''.join(out)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('book_id', type=int); ap.add_argument('out')
    ap.add_argument('--cover'); ap.add_argument('--scans', nargs='*')
    a = ap.parse_args()
    from weasyprint import HTML
    text = json.load(open(os.path.join(ROOT, f'data/text/{a.book_id}.json')))
    cat = json.load(open(os.path.join(ROOT, 'data/catalog.json')))
    book = next(b for b in cat['books'] if b['id'] == a.book_id)
    os.makedirs(a.out, exist_ok=True)
    doc = build_html(book, text, a.cover and os.path.abspath(a.cover))
    open(os.path.join(a.out, f'{a.book_id}-text.html'), 'w').write(doc)
    pdf = HTML(string=doc, base_url='/').render()
    pdf.metadata.title = book['titleAm']; pdf.metadata.authors = [book.get('author') or '']; pdf.metadata.lang = 'am'
    pdf.write_pdf(os.path.join(a.out, f'{a.book_id}-text.pdf'))
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
