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

## Lessons from መድሎተ ጽድቅ (book 1289, 473 pages, 24 + 12 helpers)
- **The library's copy can be incomplete.** Its last PDF ended at printed page 476 while the contents runs to 519. Check the
  catalog's part labels ("Part 9 - Pages 426 - 476") against the contents. Entries printed more than two pages after the last
  page label are marked `absent` and shown greyed ("not in the scanned copy"); tell the user.
- **Running header with the page number in it** (header row "መድሎተ ጽድቅ 296"): the builder detects a repeated first line
  (`HEADER_TEXT`), takes the page label from that row and ignores bottom numbers, which here are footnote numbers.
- **Footnotes**: books with many small-type notes at the page bottom get `fn` blocks; the reader and PDF show them after the
  paragraph they interrupt. Old INSTRUCTIONS copies lacked `fn`/`cont`, so helpers wrote "no op for that" in their notes:
  collect those (cross-page joins, footnote retypes, stray blocks) into `<id>.extra.json` as you read each report.
- **Book-wide fixes** go in `<id>.extra.json` as `{"page": "*", "op": "sub", "pattern": regex, "with": ...}` (applied after the
  page operations, e.g. the magazine name ጮራ read as "(ራ", bullet glyphs ◎ © ○ ☞ unified to ◉).
- **Decorative heading fonts** can't be read even on the scan (chapter 1's title prints as "መኃትው"); keep the printed form
  and report it rather than guessing. Chapters printed without a title show as just "ምዕራፍ 2".
- **Duplicate scans** at part boundaries (part 7 ends and part 8 starts on the same printed page): delete one copy's blocks.
- **Concurrency**: at most 20 helpers at a time; start the rest as reports come in. Starting the language review only after
  every scan group is merged keeps the block texts stable.

## Reader performance (book mode)
- Long chapters made the phone reader slow: every chapter is cut into segments of about 9 printed pages at section
  headings (`segs` in reader.js); page numbers are measured segment by segment in idle time and cached per screen and settings.
- Move the text strip with Web Animations (a paused animation whose `currentTime` follows the finger), never by setting
  `style.transform` on every pointer move: on a 20-column strip Chrome re-layered everything each frame (4.5 s of "Layerize"
  in a 3-swipe trace at 4x CPU slowdown, 20-30 fps) versus 60 fps with the animation.
- Swipes must work when they start on a button (the contents list); suppress the click after a drag.

## Per-book layout options (ሕይወተ ወራዙት, 1427)
`data/corrections/<id>-layout.json` switches on builder rules a book needs; all are off by default so finished books rebuild
byte-identically (check with `cmp` after any builder change: books 1011 and 1289 each lost 30-120 corrections to one
"harmless" rule change). Options:
- `wide_first_indent`: first lines indented ~8%; without it the second line looked like a hanging-indent "outdent" and every
  paragraph was split after its first line (median paragraph 71 chars instead of ~200). Also starts a paragraph at an
  indented line after a short line that ends without punctuation (e.g. a Bible reference "ዮሐ16፥21").
- `foot_numbers`: a running header without a number (alternating "<title>" / "<subtitle>") and the page number at the foot.
- `chapter_not_full_line`: a full-width line that starts "ምዕራፍ …" is a sentence (an introduction summarising chapters), not a heading.
- `deskew`: levels tilted scans before lines are grouped, each half of a spread on its own (slopes up to 0.05 in 1427 made
  neighbouring rows merge and scrambled whole pages). Measure first: median slope per half from first/last word centres.
- `drop_pages`: ["<file>:<pdf page>"]: a spread scanned twice, at the end of one file and the start of the next (look for
  near-identical page texts across file boundaries).
- `contents_pages`: ["<file>:<pdf page>:<L|R|F>"] when the contents isn't recognised (page ranges "14-16", "ማውጫ" merged
  with the column header).
The layout file is read at the start of `main`; options read later silently do nothing.

## Lessons from ሕይወተ ወራዙት (1427)
- **Contents vs body headings**: the printed contents had misprints and abbreviations (ሕልም for ሕልመ, ዓይቶች, a dropped በ,
  shortened titles). `headings_from_body` in the layout file keeps each numbered section heading as printed in the body
  (the differences are logged to `<id>-headings.log.json`); the contents still decides where sections are.
- **A chapter named like its first section** (ምዕራፍ አንድ / 1.1 የሕይወት አጀማመር): the x.1 entry links to the chapter heading
  (the builder keeps a "claimed" set), and the PDF and reader share one anchor for both entries.
- **The printed contents' last pages can be wrong by several pages** (chapter 11 at 272 in the contents, 268 in the body):
  check the last chapters' opening pages against the scans.
- **Book-wide fixes go in `<id>.extra.json` as `sub` ops and run in list order**: merge scan corrections, then extra, then the
  language corrections (the language reviewers saw text after the book-wide fixes). Here: ‹‹ ›› and lone ‹ › → « », ÷ → ፥.
- **Formatting reviewers** found real problems both times: stranded invocation/signature lines, contents entries without page
  numbers, a bibliography hang too narrow for two-digit numbers, long lettered points set with a hanging indent, spread labels
  counting a page twice, unnumbered headings treated as main sections (forced page breaks). Keep this step.

## Privacy and safety
- The repo is public: no book text, catalog data or corrections in git (`data/` is ignored), no email addresses anywhere.
  Storage rules list Firebase UIDs; a privacy check blocks commands that write an email address into files.
- Copyright: the library's books belong to their authors and publishers; the site stays private until the owner has permission.
