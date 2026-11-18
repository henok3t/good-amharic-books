# Lessons from converting the first book (ዓምደ ሃይማኖት, book 1011)

Problems met so far, why they happen, and what fixes them. Read this when something looks wrong.

## Getting the files
- **The old site's book server is plain HTTP only** (its HTTPS certificate covers only `www`, and HTTPS requests redirect to HTTP).
  The cloud container's proxy carries HTTPS only, so download with the `mirrorBatch` Cloud Function in the Firebase project
  (`functions/index.js`, queue with `scripts/queue_mirror.py`): it fetches on Google's network and writes into the bucket.
  It treats 403 and 404 as "missing on the old site" — 32 of 6,949 files were broken there too.
- Downloads from the bucket are fast (tens of MB/s); OCR reads PDFs straight from the bucket, so most work never downloads at all.

## OCR
- Nearly all PDFs are image scans; about half carry a useless invisible Latin OCR layer (ExperVision) — ignore it.
- A few have a real Unicode text layer (PowerGeez/Nyala fonts, e.g. messengers.pdf): `pdftotext` gives clean Amharic, no OCR needed.
- 150 dpi black-and-white scans are the hardest; Vision still reaches ~1.5-2% character errors there.
- Two-column magazine pages: character accuracy is fine but reading order needs checking.

## Layout rebuilding (`build_book_text.py`)
- Vision's paragraphs split real paragraphs, and its line breaks don't tell a word break from a line end: Amharic breaks words at
  line ends without a hyphen. The builder rejoins using a word list from the book (`glue`). The list gets better with more text.
- Slightly tilted scans make every line look indented against a fixed margin → margins are measured from neighbouring lines.
- An underlined term sits a little lower than its line, so it was read after the line → pieces are grouped into rows by vertical
  centre and ordered left to right.
- Running headers: only remove a top line that repeats on several pages (a fixed "short first line" rule deleted the book title).
- Printed page numbers are smoothed into a sequence; numbers that run backwards in the front matter (contents entries) are dropped.
- Vision misreads ፥ (used as a comma in this book) as `•`, and ። as `"` or a stray `በ`; the builder converts the obvious cases.
- Chapter headings in decorative type: Ethiopic numerals get misread (፩ for ፭, ፲፫ for ፲፬); chapters are matched in order, and
  a bare leftover "ምዕራፍ ፲፫" in front of the clean heading is dropped.

## Contents
- The printed contents page numbers can be wrong (book 1011: chapter 1 printed as 15, actually 13). Never trust them for links;
  locate each entry in the text (fuzzy match near the printed page). Transcribe the contents yourself — OCR scrambles it.
- Some sections listed in the contents have no heading in the body, or a differently worded one. The builder links to a
  differently worded heading but keeps the printed wording; entries with no heading link to the start of the printed page.
- The reader jumps to the exact heading block (`toc[].b`), so sections on the same page land in different places.

## Proofreading
- Scan review: ~300-400 corrections per 20 pages; mostly structure (split paragraphs, run-together lists), punctuation and references.
- Language review afterwards is light (14-41 corrections per 40 pages) but catches real misreads and line-end word splits.
- Helpers refer to page indexes, not printed page numbers. Corrections are tied to the exact text of the build they were made on.
- "Failed" corrections are usually words the builder had already rejoined — check the corrected text is present before worrying.
- The container can restart mid-run: resume stopped helpers with SendMessage to their id (they keep their transcript).

## Reader and site
- The reader shows flowing text: printed page breaks are invisible anchors; book mode measures chapters off-screen and numbers
  its own pages for the current screen and settings. Don't put printed page numbers back into the reading text.
- The PDF text edition paginates itself too: no printed page numbers in the margin, and the book's front pages flow together
  (each front section kept on one page). Chapters start on a new page.
- Full screen: the reader's ⛶ button (or F) uses the browser Fullscreen API (Android, desktop) and gives the page the whole screen;
  iPhone/iPad don't allow it for web pages, so the button explains "Add to Home Screen" (the home-screen app has no browser bars).
  Entering or leaving full screen re-flows and re-numbers the pages.
- After a deploy, phones kept running old code from the browser cache → assets have content-hashed names; index.html and sw.js
  are never cached.
- Some browsers drop non-Latin download file names → PDF downloads use the English title.
- `[hidden]` doesn't hide an element whose CSS sets `display` → `.reader [hidden] { display: none !important }`.

## Privacy and safety
- The repo is public: no book text, catalog data or corrections in git (`data/` is ignored), no email addresses anywhere.
  Storage rules list Firebase UIDs; a privacy check blocks commands that write an email address into files.
- Copyright: the library's books belong to their authors and publishers; the site stays private until the owner has permission.
