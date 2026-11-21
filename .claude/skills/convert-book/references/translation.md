# Translating a converted book into English (done first for መድሎተ ጽድቅ, book 1289)

The translation is a second text file, `text/<id>.en.json`, with exactly the same pages and blocks as the Amharic, so the
reader can switch languages (Amharic / English / both) on the same page, and bookmarks, search hits and the original-scan view
all line up. Script: `scripts/translate_book.py`. Do the translation only after the Amharic is final (proofread, language
review, contents): the block ids are frozen when the translation starts.

## Pipeline
```bash
W=<scratchpad>/t<id>
python3 scripts/translate_book.py init <id> $W        # freeze source.json, units.json, parts/NN.am.txt (~25 pages each), glossary-input/
```
- **Units**: one per block; a paragraph that runs over a printed page is one unit (Amharic verb-final order means half a
  sentence can't be translated); its continuation blocks get "" in English and keep their page anchor. Contents blocks are
  not translated (the reader draws the translated contents).
- **Agents** (Agent tool, background, one per part per stage; instructions live in the work folder):
  1. `STAGE-glossary.md` — one terminology agent: GLOSSARY.md (500+ rows), toc_en.json (every contents entry), meta_en.json
     (title, subtitle, translator's note), book notes appended to STYLE.md. STYLE.md holds the owner's decisions.
  2. `STAGE-tr.md` translator → `parts/NN.tr.txt` (every unit, `[id]` + text).
  3. `STAGE-mean.md` meaning, 4. `STAGE-scr.md` Scripture & sources, 5. `STAGE-read.md` readability,
     6. `STAGE-theo.md` theology (final say) — reviewers follow `REVIEW-common.md` and write only changed units
     (`[id]`, full text, `WHY:`) to `parts/NN.<stage>.txt`.
  7. `STAGE-cons.md` — one whole-book consistency editor → `consistency.txt`, split with `translate_book.py split-cons`.
- Before every review stage: `python3 scripts/translate_book.py render $W NN` writes `NN.en.txt` (current English) and
  `NN.flags.txt` (missing numbers, Ethiopic left, length ratio, table cells, numbers/names changed by the previous stage).
- Finish: `translate_book.py assemble <id> $W` (typographic quotes, translated contents, meta) →
  `make_book_pdf.py <id> data/pdf --cover … --lang en` → `build_catalog.py` (hasEn, pdfTextEn) → upload `text/<id>.en.json`,
  `pdf/<id>-text-en.pdf`, catalog → deploy.

## Decisions that worked (book 1289)
- Scripture translated from the book's Amharic (Ethiopian/Septuagint text), public-domain wording (World English Bible /
  modernized KJV) where the meaning matches, never NIV/ESV/NKJV/RSV text; Psalm numbers as in the book + [English number].
  The Scripture reviewers found dozens of verses where copyrighted or remembered wording had crept in.
- Fathers quoted from the English originals the author gives (footnotes, parenthesized English); the parenthesized duplicate
  unit is left empty.
- Ge'ez quotations stay in Ethiopic script (followed by the English of the book's Amharic rendering); flagged but allowed.
- Core terms transliterated with a gloss at first use per chapter (Tehadiso, Tewahedo, Kidase, Fithat…), the rest translated.
- The theology reviewers mattered: they caught Nestorian-sounding phrasing ("the incarnate Word with whom the Word was
  united"), Anselm's "satisfaction" in the author's own voice, "Fathers" for the Old Testament patriarchs (አበው), ቀኖና as
  "canon" instead of penance, and readability edits that had loosened doctrinal points.

## Cost and quota
16 parts × 5 stages + glossary + consistency ≈ 82 agent runs of ~250k tokens each (~20 M tokens) for a 470-page book.
The 5-hour usage limit stopped the run once: helpers stop with "resets at HH:MM"; their work so far is kept. Keep a backup
timer (`send_later`, ~5 h ahead, moved forward as work proceeds), write RESUME.txt (helper ids per part and stage), back up
the work folder to the bucket every 10 minutes, and resume each helper with SendMessage after the reset (test one first —
the limit can lift before the stated time).
