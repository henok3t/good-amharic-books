// Search helpers for Ethiopic (Ge'ez script) and Latin text.

// Rows of the Ethiopic block (U+1200..U+135F), 8 letters each: consonant used for romanization.
const ROWS = ['h','l','h','m','s','r','s','sh','q','qw','q','qw','b','v','t','ch','h','hw','n','ny','',
  'k','kw','kh','kw','w','','z','zh','y','d','d','j','g','gw','g','t','ch','p','ts','ts','f','p',''];
const VOWELS = ['e','u','i','a','e','','o','wa'];

// Letters that sound the same in Amharic: fold the row onto its common twin.
// ሐ, ኀ -> ሀ ; ሠ -> ሰ ; ዐ -> አ ; ፀ -> ጸ
const FOLD_ROWS = { 0x1210: 0x1200, 0x1280: 0x1200, 0x1220: 0x1230, 0x12D0: 0x12A0, 0x1340: 0x1338 };

export function isEthiopic(s) { return /[ሀ-፿]/.test(s); }

export function foldEthiopic(s) {
  let out = '';
  for (const ch of s) {
    let cp = ch.codePointAt(0);
    if (cp >= 0x1200 && cp <= 0x135F) {
      const row = cp & ~7, order = cp & 7;
      const target = FOLD_ROWS[row];
      if (target !== undefined) cp = target + order;
      // ሀ/ሃ and አ/ኣ are written interchangeably
      if ((cp === 0x1203) || (cp === 0x12A3)) cp -= 3;
    }
    out += String.fromCodePoint(cp);
  }
  return out;
}

export function romanize(s) {
  let out = '';
  for (const ch of s) {
    const cp = ch.codePointAt(0);
    if (cp >= 0x1200 && cp <= 0x135F) {
      const row = (cp - 0x1200) >> 3, order = cp & 7;
      const c = ROWS[row] ?? '';
      let v = VOWELS[order];
      if (c === '' && order === 0) v = 'a';
      out += c + v;
    } else if (cp >= 0x1361 && cp <= 0x1368) {
      out += ' ';
    } else out += ch;
  }
  return out;
}

// Make Latin spellings comparable: lowercase, strip accents, unify common transliteration variants.
export function normLatin(s) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/['`’ʼʻ]/g, '')
    .replace(/ph/g, 'f').replace(/ch|tch|c(?=h)/g, 'C').replace(/sh/g, 'S').replace(/ts|tz|ts/g, 'X')
    .replace(/zh/g, 'Z').replace(/ny|gn/g, 'N').replace(/kh|q|c/g, 'k').replace(/v/g, 'b')
    .replace(/([a-z])\1+/g, '$1');
}

export function skeleton(latinNorm) { return latinNorm.replace(/[aeiou]/g, ''); }

export function words(s) {
  return s.split(/[\s፡-፨.,;:!?()\[\]{}"«»/\\|·\-–—_]+/u).filter(Boolean);
}

// Normalized forms of a piece of text, word by word: [{ text, latin, skel }]
export function analyze(text) {
  return words(foldEthiopic(String(text || '').toLowerCase())).map((w) => {
    const latin = normLatin(isEthiopic(w) ? romanize(w) : w);
    return { text: w, latin, skel: skeleton(latin) };
  });
}

function editDistanceAtMost1(a, b) {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

// Score one query word against one analyzed word (0 = no match).
export function matchWord(q, w) {
  if (w.text.startsWith(q.text)) return w.text === q.text ? 6 : 5;
  if (q.text.length >= 3 && w.text.includes(q.text)) return 3;
  if (q.latin.length >= 2 && w.latin.startsWith(q.latin)) return 4;
  if (q.skel.length >= 2 && w.skel.startsWith(q.skel)) return 2;
  if (q.latin.length >= 5 && editDistanceAtMost1(q.latin, w.latin.slice(0, q.latin.length + 1))) return 1.5;
  return 0;
}

// For indexing: also add Ethiopic words without a leading የ/በ/ለ/ከ ("of", "in", "for", "from").
const PREFIXES = new Set(['የ', 'በ', 'ለ', 'ከ']);
export function analyzeForIndex(text) {
  const out = analyze(text);
  for (const w of [...out]) {
    const first = w.text[0];
    if (PREFIXES.has(first) && [...w.text].length >= 3) {
      const rest = w.text.slice(1), latin = normLatin(romanize(rest));
      out.push({ text: rest, latin, skel: skeleton(latin) });
    }
  }
  return out;
}
