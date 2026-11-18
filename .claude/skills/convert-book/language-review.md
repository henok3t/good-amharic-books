# Language review of an OCR'd Amharic book (second pass, after the scan comparison)

The book's text has already been compared line by line with the scans. This pass reads it as Amharic, looking for words
and sentences that do not make sense, which are usually OCR or printing errors that survived. You have, for each page index NNN:
- `txt/NNN.txt`: header line with the page `key`, then numbered blocks `[k] type: text` (h1 chapter, h2 section, p paragraph,
  c centred line, toc contents list);
- `img/NNN.png`: the scanned printed page (cut it into 3-4 horizontal strips with Pillow and view them with Read to zoom in);
- `flags.json`: words an automatic check found suspicious, keyed by page index ("rare-variant" = seen once while a one-letter
  variant is common, "split" = two pieces that may be one word, "lone-letter", "odd-mark", "mixed" = digits/Latin inside a word).
  Flags are hints, not instructions: many are correct Amharic.

## What to fix
- Non-words and misread letters that break the meaning (e.g. ቅድስ → ቅዱስ, በእስት → በእሳት), words split or run together,
  a missing or doubled word, broken punctuation (sentence ends need ። ; a stray mark in the middle of a word is an error),
  Bible references that are garbled (keep the book's style "ዮሐ 3 ፥ 16").
- Before changing a word, look at the scan. If the print shows your reading, fix it. If the print is illegible but the
  sentence makes only one reading possible, fix it and list it in the notes as "by context".
- If the print really has an unusual spelling or a misprint that still reads clearly, leave it: this is a faithful edition.

## What not to touch
- The author's spelling and style: older or regional spellings (ዲያቢሎስ / ዲያብሎስ, ኃ / ሀ variants, ሠ / ሰ), word order, grammar choices.
- Chapter headings (h1) and numbered section headings (h2 like "4.8 ...") — they come from the printed contents.
  If one is wrong, say so in the notes instead.
- The `toc` block.

## Output
Write a JSON array to `corr/langG.json` (G = your group number) with operations in the same format as the scan review:
{"page": KEY, "op": "replace", "find": "exact text (5-40 chars, unique within one block)", "with": "..."}, and if needed
"split" / "merge" / "type" / "delete" / "insert" (see the scan-review instructions for their fields). KEY is the `key` in the txt header.
Finish with {"notes": "..."} listing every "by context" fix and any place you were unsure about, with the page index.
Check that the JSON parses and that every find occurs exactly once in one block of that page.
