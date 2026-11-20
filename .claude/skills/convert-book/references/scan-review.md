# Proofreading an OCR'd Amharic book against its scans

Book: <TITLE — fill in before handing this to reviewers>. For each page index NNN you have:
- `img/NNN.png`: the scanned printed page (about 1140x1700 px). Read it at full resolution by cutting it into 3-4 horizontal
  strips with Python/Pillow (save strips under `_strips/`) and viewing each strip with the Read tool.
- `txt/NNN.txt`: what our OCR pipeline produced: a header line with the page `key`, then numbered blocks
  `[k] type: text`. Types: h1 chapter heading, h2 section heading, p paragraph, c centred line, fn footnote, toc generated contents list.
  "(continues from previous page)" means the block is joined to the last paragraph of the previous page.

Compare them and record corrections so the text reads like the printed page.

## What to fix
1. Structure: a paragraph wrongly split in two (merge), two paragraphs run together (split), a heading shown as a paragraph or
   vice versa (type), list items / numbered items / "term — definition" items run together (split), text in the wrong order,
   missing lines (insert), junk that is not in the print (delete or replace with ""), wrong "continues" join (noncont).
2. Clear OCR misreadings: a word whose letters plainly differ from the print (e.g. ፩ vs ፭, ሀ vs ሁ, a dropped or doubled letter,
   a dash read as "s", "()" garbage, a full stop ። read as a quote or a stray "በ"). Fix the word exactly as printed. Keep the book's own
   spelling and punctuation style; do not modernise or "improve" the text. Bible references: keep as printed (e.g. "ዮሐ 3 ፥ 16").
3. Do not report the running page number or the page header; they are removed on purpose. Do not touch `toc` blocks
   (but note in "notes" if the generated contents list looks wrong on the contents page).

## Output
Write a JSON array to `corr/groupG.json` (your group number) with one object per correction:
- {"page": KEY, "op": "replace", "find": "exact text from the block", "with": "corrected text"}
- {"page": KEY, "op": "type", "find": "start of the block", "t": "h2" | "p" | "c" | "h1" | "fn"}   (fn = footnote)
- {"page": KEY, "op": "split", "find": "exact text where the new paragraph must start", "t": "p" (or "h2", "fn")}
- {"page": KEY, "op": "merge", "find": "start of the block that must be joined to the block before it"}
- {"page": KEY, "op": "delete", "find": "text of the junk block"}
- {"page": KEY, "op": "insert", "after_find": "text in the block it follows (or \"\" for the top of the page)", "t": "p", "x": "missing text"}
- {"page": KEY, "op": "noncont"}   (the first block does not actually continue the previous page)
- {"page": KEY, "op": "cont"}      (the first block continues the last paragraph of the previous page, mid-sentence)
- When the same text occurs in several blocks of a page, add "exact": true (the find is the whole block text), "t_was": "h2"
  (only blocks of that type) or "nth": 1 (0-based: the second matching block) to any find-based operation.
- Tables the OCR scrambled: rebuild one row per block, cells separated by " | " (a row may start with "| " for an empty
  first cell); the reader and the PDF show such rows as a table.
KEY is the `key` from the txt header, e.g. "amid-1.PDF:29:L". `find` must be copied exactly (a unique substring of ONE block,
5-40 characters is ideal). Operations on a page are applied in order, so after a split the text after `find` is a new block.
Prefer a few precise corrections over rewriting whole blocks. Use Unicode Ethiopic.

Also add one final object {"notes": "..."} summarising anything you could not express (e.g. tables, images, illegible spots).
Check the JSON parses: python3 -c "import json;print(len(json.load(open('corr/groupG.json'))))"
Then replay your operations against the txt files (in order) to confirm every `find` matches exactly one block.
Refer to pages by their page index (NNN) in your notes.

Scratch files (cropped strips) go only in a new folder of your own, `_strips/<your group>/`; never delete files you did not create
(other helpers work in the same folder).
