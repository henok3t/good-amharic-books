import { test } from 'node:test';
import assert from 'node:assert/strict';
import { foldEthiopic, romanize, normLatin, skeleton } from '../web/src/ethiopic.js';

// i18n.js touches localStorage at import time
globalThis.localStorage = { getItem: () => null, setItem() {} };
globalThis.document = { documentElement: {} };
const { buildIndex, search } = await import('../web/src/search.js');

const book = (id, titleAm, titleEn, author, group = 'Christian Life') =>
  ({ id, titleAm, titleEn, author, group, category: group, langs: ['am'], parts: [], keywords: '' });
const books = [
  book(1, 'የዮሐንስ ወንጌል', 'The Gospel of John', 'SIM', 'New Testament Studies'),
  book(2, 'ቅዱስ ጳውሎስ', 'Saint Paul', 'Debebe Haile Yorgis', 'Biography'),
  book(3, 'ጸሎት', 'Prayer', 'Prince, Derek'),
  book(4, 'ታሪክ', 'History of Ethiopia', 'Lapiso Dilaybo', 'History'),
];
const idx = buildIndex(books);
const ids = (q) => search(idx, q).map((r) => r.book.id);

test('homophone letters fold together', () => {
  assert.equal(foldEthiopic('ሐ'), 'ሀ'); assert.equal(foldEthiopic('ኀ'), 'ሀ');
  assert.equal(foldEthiopic('ሠላም'), 'ሰላም'); assert.equal(foldEthiopic('ፀሎት'), 'ጸሎት'); assert.equal(foldEthiopic('ዐይን'), 'አይን');
});
test('romanization skeleton matches common spellings', () => {
  assert.equal(skeleton(normLatin(romanize('ዮሐንስ'))), skeleton(normLatin('Yohannes')));
  assert.equal(skeleton(normLatin(romanize('ቅዱስ'))), skeleton(normLatin('kidus')));
});
test('Amharic queries, including homophone spellings', () => {
  assert.deepEqual(ids('ዮሐንስ'), [1]);
  assert.deepEqual(ids('ዮሀንስ'), [1]);
  assert.deepEqual(ids('ፀሎት'), [3]);
});
test('English and transliterated queries', () => {
  assert.deepEqual(ids('gospel john'), [1]);
  assert.deepEqual(ids('yohannes'), [1]);
  assert.deepEqual(ids('kidus'), [2]);
  assert.deepEqual(ids('derek prince'), [3]);
  assert.deepEqual(ids('ethiopia'), [4]);
});
test('category names are searchable in both languages', () => {
  assert.ok(ids('biography').includes(2));
  assert.ok(ids('ታሪክ').includes(4));
});
test('all words must match', () => { assert.deepEqual(ids('john prayer'), []); });
