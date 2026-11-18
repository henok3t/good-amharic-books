"""Render PDF pages to WebP images for the reader's "original page" view.

    python3 scripts/render_scans.py <out dir> file1.pdf [file2.pdf ...]
Writes <out dir>/<file stem>/<page>.webp (page numbers start at 1), 1400 px on the long side.
"""
import os, subprocess, sys, tempfile
from PIL import Image
out = sys.argv[1]
for pdf in sys.argv[2:]:
    stem = os.path.splitext(os.path.basename(pdf))[0]
    os.makedirs(f'{out}/{stem}', exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        subprocess.run(['pdftoppm', '-r', '150', '-gray', '-png', pdf, f'{tmp}/p'], check=True, capture_output=True)
        for f in sorted(os.listdir(tmp)):
            n = int(f.split('-')[-1].split('.')[0])
            im = Image.open(f'{tmp}/{f}'); im.thumbnail((1400, 1400))
            im.save(f'{out}/{stem}/{n}.webp', 'WEBP', quality=60)
    print(stem, len(os.listdir(f'{out}/{stem}')), 'pages')
