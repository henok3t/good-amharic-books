"""Make a proofreading package for a converted book: one image of each printed page and its text blocks.

    python3 scripts/make_review_package.py <book id> <dir with the book's PDFs> <out dir> [--dpi 200]

Writes <out>/img/NNN.png (the printed page, spreads cut in half) and <out>/txt/NNN.txt
(header with the page key, then numbered blocks "[k] type: text"). NNN is the page index in data/text/<id>.json.
"""
import argparse, json, os, subprocess, tempfile
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def main():
    ap = argparse.ArgumentParser(); ap.add_argument('book_id', type=int); ap.add_argument('pdf_dir'); ap.add_argument('out')
    ap.add_argument('--dpi', type=int, default=200); a = ap.parse_args()
    d = json.load(open(os.path.join(ROOT, f'data/text/{a.book_id}.json'))); P = d['pages']
    os.makedirs(f'{a.out}/img', exist_ok=True); os.makedirs(f'{a.out}/txt', exist_ok=True)
    toc = '\n'.join(f"  {'  ' if t['level'] == 2 else ''}{t['title']}  -> page {P[t['page']]['n'] or t['page']}" for t in d['toc'])
    cache = {}
    with tempfile.TemporaryDirectory() as tmp:
        for i, p in enumerate(P):
            s = p['src']; k = (s['file'], s['page'])
            if k not in cache:
                subprocess.run(['pdftoppm', '-f', str(s['page']), '-l', str(s['page']), '-r', str(a.dpi), '-gray', '-png', '-singlefile',
                                os.path.join(a.pdf_dir, s['file']), f'{tmp}/p'], check=True)
                cache.clear(); cache[k] = Image.open(f'{tmp}/p.png').copy()
            im = cache[k]; w = im.width
            crop = im if s['half'] == 'F' else (im.crop((0, 0, w // 2 + 40, im.height)) if s['half'] == 'L' else im.crop((w // 2 - 40, 0, w, im.height)))
            crop.save(f'{a.out}/img/{i:03d}.png')
            lines = [f"PAGE INDEX {i}   printed page label: {p['n']}   key: {s['file']}:{s['page']}:{s['half']}   kind: {p.get('kind', '')}"]
            for n, b in enumerate(p['blocks']):
                x = '[generated contents list:]\n' + toc if b['t'] == 'toc' else b['x']
                lines.append(f"[{n}] {b['t']}{' (continues from previous page)' if b.get('cont') else ''}: {x}")
            open(f'{a.out}/txt/{i:03d}.txt', 'w').write('\n'.join(lines) + '\n')
    print(len(P), 'pages ->', a.out)

if __name__ == '__main__':
    main()
