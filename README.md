# Good Amharic Books (private rebuild)

A modern, bilingual (English / አማርኛ) rebuild of good-amharic-books.com with search that works in
Amharic and English, including Latin spellings of Amharic words (e.g. `Yohannes` finds `ዮሐንስ`).

**Private preview:** not published. The site is behind Google sign-in, and only Firebase user IDs listed in
`storage.rules` can read the catalog or the books. No book content or catalog data is committed to this repo.

- Firebase project: `good-amharic-books-web` — https://good-amharic-books-web.web.app
- Catalog: `gs://good-amharic-books-web.firebasestorage.app/catalog/catalog.json`
- Book files and images: `gs://good-amharic-books-web.firebasestorage.app/files/<original file name>`

## Layout

| Path | What |
|---|---|
| `web/` | The site: `index.html`, `styles.css`, `src/` (vanilla JS, bundled with esbuild) |
| `web/src/ethiopic.js` | Amharic search normalization: homophone letters (ሀ/ሐ/ኀ, ሰ/ሠ, አ/ዐ, ጸ/ፀ), romanization, prefix stripping |
| `scripts/scrape_catalog.py` | Scrapes the old site's catalog metadata into `data/raw_catalog.json` |
| `scripts/build_catalog.py` | Builds `data/catalog.json` (merges `data/titles.json` when present) |
| `scripts/mirror_files.py` | Copies all book files and images into Cloud Storage (run on a normal computer) |
| `storage.rules` | Who may read the private bucket |

## Commands

```bash
npm install
npm test          # search tests
npm run dev       # local preview at http://localhost:5173 (no sign-in; needs data/catalog.json)
npm run build && firebase deploy --only hosting,storage
```
