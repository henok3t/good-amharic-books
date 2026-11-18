# Good Amharic Books (private rebuild)

A modern, bilingual (English / አማርኛ) rebuild of good-amharic-books.com with search that works in
Amharic and English, including Latin spellings of Amharic words (e.g. `Yohannes` finds `ዮሐንስ`).

**Private preview:** not published. The site is behind Google sign-in, and only Firebase user IDs listed in
`storage.rules` can read the catalog or the books. No book content or catalog data is committed to this repo.

- Firebase project: `good-amharic-books-web` — https://good-amharic-books-web.web.app
- Catalog: `gs://good-amharic-books-web.firebasestorage.app/catalog/catalog.json`
- Book files and images: `gs://good-amharic-books-web.firebasestorage.app/files/<original file name>`
- Readable text: `.../text/<book id>.json`; scan images: `.../scans/<file stem>/<page>.webp`

## Converting a book to text

```bash
ACCESS_TOKEN=$(gcloud auth print-access-token) python3 scripts/ocr_vision.py amid-1.PDF amid-2.PDF
gcloud storage cp -r gs://good-amharic-books-web.firebasestorage.app/ocr/vision/amid-1 ... ./ocr/vision/
python3 scripts/build_book_text.py 1011 ./ocr/vision && python3 scripts/build_catalog.py
```

Then proofread and publish:

```bash
# per-page corrections (from comparing each page with its scan) and a clean contents list
python3 scripts/merge_corrections.py 1011 ./review/corr data/corrections/1011.extra.json   # -> data/corrections/1011.json
#   data/corrections/1011-toc.json: contents transcribed from the printed contents pages
python3 scripts/build_book_text.py 1011 ./ocr/vision         # applies both; failures -> data/corrections/1011.failed.json
python3 scripts/make_book_pdf.py 1011 data/pdf --cover cover.jpg --scans amid-1.PDF amid-2.PDF
python3 scripts/build_catalog.py                              # flags hasText / pdfText / pdfScan
```

Upload `data/text/<id>.json`, `data/pdf/<id>-*.pdf` and `data/catalog.json` to the bucket (`text/`, `pdf/`, `catalog/`).

OCR test (12 hand-checked pages): Cloud Vision about 1.6% character errors, Tesseract about 4.9%.

## Layout

| Path | What |
|---|---|
| `web/` | The site: `index.html`, `styles.css`, `src/` (vanilla JS, bundled with esbuild) |
| `web/src/ethiopic.js` | Amharic search normalization: homophone letters (ሀ/ሐ/ኀ, ሰ/ሠ, አ/ዐ, ጸ/ፀ), romanization, prefix stripping |
| `scripts/scrape_catalog.py` | Scrapes the old site's catalog metadata into `data/raw_catalog.json` |
| `scripts/build_catalog.py` | Builds `data/catalog.json` (merges `data/titles.json` when present) |
| `scripts/mirror_files.py` | Copies all book files and images into Cloud Storage (run on a normal computer) |
| `web/src/reader.js` | The reading screen: themes, text size, fonts, contents, bookmarks, in-book search, original-page view |
| `web/sw.js`, `web/manifest.webmanifest`, `web/icons/` | Installable app (PWA) and offline app shell; offline book text is kept in IndexedDB |
| `functions/index.js` | Cloud Functions: `mirrorBatch` (copy files from the old site), `countPages` (PDF page counts) |
| `scripts/ocr_vision.py` | OCR book PDFs with Cloud Vision straight from the bucket |
| `scripts/build_book_text.py` | Turn OCR output into a readable book (`text/<id>.json`): spreads split, headers removed, words rejoined, contents parsed |
| `scripts/make_book_pdf.py` | Typeset A5 text-edition PDF (cover, linked contents, bookmarks, original page numbers) and merged scan PDF |
| `scripts/merge_corrections.py` | Merge proofreading correction files |
| `scripts/render_scans.py` | Page images of the scans for the reader's "original page" view (`scans/<file>/<page>.webp`) |
| `storage.rules` | Who may read the private bucket |

## Commands

```bash
npm install
npm test          # search tests
npm run dev       # local preview at http://localhost:5173 (no sign-in; needs data/catalog.json)
npm run build && firebase deploy --only hosting,storage
```
