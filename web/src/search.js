import { analyze, analyzeForIndex, matchWord } from './ethiopic.js';
import { groupName, langName } from './i18n.js';

// Weighted fields per book; English and Amharic names of the category and language are both searchable.
function fieldsOf(b) {
  return [
    [3, `${b.titleAm} ${b.titleEn}`],
    [2, b.author],
    [1, `${groupName(b.group, 'en')} ${groupName(b.group, 'am')} ${b.category}`],
    [1, b.langs.map((l) => `${langName(l, 'en')} ${langName(l, 'am')}`).join(' ')],
    [0.6, b.parts.map((p) => p.label).join(' ')],
    [0.6, b.keywords],
  ].map(([weight, text]) => ({ weight, words: analyzeForIndex(text) }));
}

export function buildIndex(books) {
  return books.map((b) => ({ book: b, fields: fieldsOf(b) }));
}

// Every query word must match somewhere; the best match per word counts, weighted by field.
export function search(index, query) {
  const q = analyze(query);
  if (!q.length) return index.map((e) => ({ book: e.book, score: 0 }));
  const results = [];
  for (const e of index) {
    let total = 0;
    for (const qw of q) {
      let best = 0;
      for (const f of e.fields) for (const w of f.words) {
        const s = matchWord(qw, w) * f.weight;
        if (s > best) best = s;
      }
      if (!best) { total = 0; break; }
      total += best;
    }
    if (total) results.push({ book: e.book, score: total });
  }
  return results.sort((a, b) => b.score - a.score);
}
