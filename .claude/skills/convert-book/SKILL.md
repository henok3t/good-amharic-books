---
name: convert-book
description: Step-by-step workflow for turning a scanned book in the Good Amharic Books library into proofread, readable text for the site's reader plus a typeset PDF. Covers OCR with Cloud Vision, rebuilding layout, transcribing the contents, page-by-page proofreading against the scans, an Amharic language review, PDF generation, upload and deploy. Use it whenever someone asks to convert, OCR, digitise, proofread or "make readable" one or more books from this library, to add a book to the reader, to fix a converted book's text or contents, or to regenerate a book's PDF — even if they just name a book title (e.g. "do ዓምደ ሃይማኖት next" or "convert the Scripture books").
---

# Convert a scanned book into proofread text, reader data and PDFs

This is the process used for ዓምደ ሃይማኖት (Pillar of Faith, book 1011), the first book converted. Every step has a script in
`scripts/`; the judgement calls are explained so you can adapt them to books that are laid out differently.

What you produce for book `<id>`, all in the **private** bucket `gs://good-amharic-books-web.firebasestorage.app`:
- `text/<id>.json` — the book as pages of blocks (headings, paragraphs, lists) plus a contents list; the reader uses it.
- `scans/<file stem>/<page>.webp` — page images for the reader's "original page" view.
- `pdf/<id>-text.pdf` (typeset A5 edition) and `pdf/<id>-scan.pdf` (original scans merged).
- `catalog/catalog.json` updated with `hasText`, `pdfText`, `pdfScan` for the book.

Ground rules (why they matter):
- **The repo is public.** Commit code only. `data/` (catalog, text, corrections, PDFs) is git-ignored on purpose; never paste
  book text into code, commits or issues, and never write anyone's email address into files (access rules use Firebase UIDs).
- **Faithful edition.** Fix what OCR or the printer broke; keep the author's spelling, style and grammar.
- **Costs are real.** Cloud Vision is about $1.50 per 1,000 PDF pages (first 1,000/month free). The two review passes are the
  expensive part in model usage (roughly 2 M tokens for a 170-page book). Tell the user the expected cost for big batches first.

## 0. Prerequisites

- Firebase CLI signed in as the project owner (`firebase login:list`). For REST calls use an access token:
  `gcloud auth print-access-token` if gcloud is signed in, otherwise the token in `~/.config/configstore/firebase-tools.json`
  (`tokens.access_token`; run any `firebase` command first to refresh it). Scripts read it from `ACCESS_TOKEN`; gcloud reads
  `CLOUDSDK_AUTH_ACCESS_TOKEN`.
- Tools: poppler (`pdftoppm`, `pdfinfo`, `pdffonts`), Python with Pillow, pypdf, rapidfuzz, weasyprint; fonts
  `fonts-noto-core fonts-noto-extra` (Noto Serif/Sans Ethiopic). `pip install rapidfuzz weasyprint`; `apt-get install fonts-noto-core fonts-noto-extra`.
- The book's PDFs must already be in the bucket under `files/`. If a file is missing there, the old site
  (books.good-amharic-books.com) only serves plain HTTP, which this container cannot fetch: queue it for the `mirrorBatch`
  Cloud Function instead (`scripts/queue_mirror.py`, see README).
- Work in the scratchpad for bulky intermediate files (OCR JSON, review packages); keep `data/` for results.

## 1. Look at the book

```bash
python3 -c "import json;b=[b for b in json.load(open('data/catalog.json'))['books'] if b['id']==<id>][0];print(b['titleAm'],b['titleEn'],b['parts'])"
gcloud storage cp gs://good-amharic-books-web.firebasestorage.app/files/<part>.pdf <work>/pdfs/
pdfinfo <file>; pdffonts <file>; pdftotext -l 3 <file> - | head; pdftoppm -f 5 -l 5 -r 60 -png -singlefile <file> <work>/peek
```
Check and note: scanned images or real text (most are scans; a few have a Unicode text layer, which needs no OCR — extract it with
`pdftotext` instead), two-page spreads or single pages, resolution (150 dpi is harder than 300), columns, a printed contents page,
footnotes, lists, decorative headings. Look at a few page images yourself.

## 2. OCR with Cloud Vision

```bash
ACCESS_TOKEN=... python3 scripts/ocr_vision.py <part1>.pdf <part2>.pdf     # reads files/ in the bucket, writes ocr/vision/<stem>/
gcloud storage cp -r gs://good-amharic-books-web.firebasestorage.app/ocr/vision/<stem> <work>/vision/
```
Vision beat Tesseract on every test page (about 1.6% vs 4.9% character errors on 12 hand-checked pages), and Amharic is supported.
It handles rotated spreads. Many books at once: pass all their files in one call.

## 3. First build and check

```bash
python3 scripts/build_book_text.py <id> <work>/vision
```
The builder rebuilds the layout from line positions (Vision's own paragraphs split mid-paragraph): local margins (scans are often
tilted), indents, hanging indents, "term — definition" items, dashes and numbered items, centred or tall lines as headings, words
broken at line ends rejoined with a word list built from the book itself, running headers removed only if repeated on several
pages, page labels smoothed into a sequence. Check:
- block counts in the output line (hundreds of `h2` = headings over-detected; very short paragraphs = paragraphs over-split);
- `python3 -c` over `data/text/<id>.json`: all `h1` texts, paragraph length median (~150-250 chars is normal), page labels;
- open 3-4 pages next to their scans. If a pattern is wrong on many pages, fix the builder (generic rule), not the pages.

## 4. Contents

The printed contents page is the best source for chapter and section titles, but OCR scrambles it and its page numbers can be
off (in book 1011 by up to two pages). So transcribe it yourself:
1. Render the contents pages at 200 dpi, cut each in two strips, and read them with the Read tool.
2. Write `data/corrections/<id>-toc.json`: `[{"level":1,"title":"መግቢያ","page":9}, {"level":1,"num":"1","title":"…","page":15},
   {"level":2,"num":"2.1","title":"…","page":29}, …]` with titles exactly as printed and the printed page numbers.
3. Rebuild. Each entry is located in the text by fuzzy match near its printed page; matching headings get the clean title, and
   chapters prefer real `ምዕራፍ` headings (Ethiopic numerals like ፩ ፭ are often misread). The output tells how many entries were
   found as headings in the text; the rest still link to the right page.

Without a printed contents page the builder falls back to the chapter headings it detected.

## 5. Proofread against the scans

```bash
python3 scripts/make_review_package.py <id> <work>/pdfs <work>/review     # img/NNN.png + txt/NNN.txt per page index
cp .claude/skills/convert-book/scan-review.md <work>/review/INSTRUCTIONS.md   # fill in the book title at the top
```
Split the pages into groups of about 20 and start one helper (Agent tool, general-purpose, background) per group with a short
prompt: work directory, "read INSTRUCTIONS.md and follow it", its page index range, its output `corr/groupG.json`, and "reply only
with the number of corrections and a one-line summary". Typical result: 300-400 corrections per 20 pages (merging split
paragraphs, splitting run-together lists, punctuation misread as `* • " '`, garbled Bible references, letter misreads).

Important details:
- Corrections refer to the exact block text of the build they were made on. **Don't change the builder's layout rules between
  making the package and applying the corrections**, or many will fail to match. (Contents/heading steps run after corrections, so
  editing `<id>-toc.json` is safe.)
- Helpers talk about page **indexes** (NNN), not printed page numbers. Their notes may ask for things the operations can't do
  (e.g. "this page continues the previous one"): add those to `data/corrections/<id>.extra.json` (`{"page": KEY, "op": "cont"}`).
- If the container restarts, resume a stopped helper with SendMessage to its id; it continues from its saved transcript.

```bash
python3 scripts/merge_corrections.py <id> <work>/review/corr data/corrections/<id>.extra.json
python3 scripts/build_book_text.py <id> <work>/vision          # "corrections applied N"; failures -> data/corrections/<id>.failed.json
```
Read `failed.json`: usually the builder had already rejoined that word (check that the corrected text is present). Read the helpers'
notes (`<id>.notes.json`) and keep the list of uncertain readings for the final report.

## 6. Language review (spelling, grammar, sense)

A second pass reads the corrected text as Amharic and fixes what still doesn't make sense, checking the scan before changing a word.
```bash
python3 scripts/flag_words.py <id> > <work>/flags.json         # rare variants, split words, lone letters, odd marks, digits in words
python3 scripts/make_review_package.py <id> <work>/pdfs <work>/review2 && cp <work>/flags.json <work>/review2/
```
Start helpers (about 40 pages each) pointing them to `.claude/skills/convert-book/language-review.md` (and `scan-review.md` for the
operation formats), output `corr/langG.json`. Then merge scan and language corrections together, in that order, and rebuild:
```bash
python3 scripts/merge_corrections.py <id> <work>/review/corr <work>/review2/corr/lang0.json … data/corrections/<id>.extra.json
python3 scripts/build_book_text.py <id> <work>/vision
```
The flags are hints: in Amharic the last letter's vowel is often grammar (ክርስቲያኑ vs ክርስቲያን), and older spellings are not errors.

## 7. Final checks

- `h1` list = every chapter once, with clean titles; contents entries found as headings (aim for most); no duplicates like a bare
  `ምዕራፍ ፲፫` before the clean heading (the builder drops those).
- Leftover junk: `grep` the blocks for `* • ★ ▪ ✓ #` (real footnote asterisks are fine) and for ASCII quotes between Ethiopic words.
- Page labels run in sequence (gaps are noted, not invented).
- Local preview: `npm run dev` (serves `data/` without sign-in) — open `#/read/<id>`, turn pages in book mode on a phone-sized and a
  desktop window, open the contents, search a word, open an original page. A Playwright script with `devices['iPhone 13']` works well.

## 8. Scan images, PDFs, catalog

```bash
python3 scripts/render_scans.py <work>/scans <work>/pdfs/*.pdf         # then upload <work>/scans/* to scans/
gcloud storage cp gs://good-amharic-books-web.firebasestorage.app/files/<cover from catalog> <work>/cover.jpg
python3 scripts/make_book_pdf.py <id> data/pdf --cover <work>/cover.jpg --scans <work>/pdfs/<part1>.pdf <work>/pdfs/<part2>.pdf
python3 scripts/build_catalog.py
```
Look at a few PDF pages (`pdftoppm -f N -l N -r 70`): cover, contents with page numbers, a chapter opening, running header, list items.

## 9. Upload and deploy

```bash
B=gs://good-amharic-books-web.firebasestorage.app
gcloud storage cp data/text/<id>.json $B/text/ --cache-control=no-cache
gcloud storage cp data/pdf/<id>-text.pdf data/pdf/<id>-scan.pdf $B/pdf/ --cache-control=no-cache
gcloud storage cp -r <work>/scans/<stem> $B/scans/
gcloud storage cp data/catalog.json $B/catalog/catalog.json --cache-control=no-cache
npm test && npm run build && firebase deploy --only hosting --project good-amharic-books-web   # only if site code changed
```
Commit and push code changes (scripts, web, skill) to the working branch; `data/` stays local and in the bucket.

## 10. Report to the user

Say what is live and how to see it (reload; the Reading tab lists readable books), pages and corrections counts, how many contents
entries became headings, uncertain readings with page numbers (from the notes), anything not done, and the cost. If you could not
open the live site yourself, say so.

## When things go wrong

See `references/lessons.md` for the problems met so far and their fixes (HTTP-only old site, tilted scans, misread chapter numbers,
contents page numbers off, download file names, browser caching, container restarts, privacy checks).
