// Copies book files from the old site (plain HTTP only) into the private Storage bucket.
// Triggered by Pub/Sub messages on topic "mirror-batch": { "batch": "0007", "files": ["a.pdf", ...] }.
// Re-sending a batch is safe: files already in the bucket are skipped.
import { onMessagePublished } from 'firebase-functions/v2/pubsub';
import { initializeApp } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

initializeApp();
const SOURCE = 'http://books.good-amharic-books.com/';
const TYPES = { pdf: 'application/pdf', mp3: 'audio/mpeg', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', png: 'image/png', txt: 'text/plain' };

async function copyOne(bucket, name) {
  const dest = bucket.file(`files/${name}`);
  const [exists] = await dest.exists();
  if (exists) return { name, status: 'skip' };
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(SOURCE + encodeURIComponent(name).replace(/%2F/g, '/'), { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (res.status === 404 || res.status === 403) return { name, status: 'missing', note: `HTTP ${res.status}` };
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const type = (res.headers.get('content-type') || '').includes('text/html')
        ? null : TYPES[name.split('.').pop().toLowerCase()] || res.headers.get('content-type');
      if (!type) return { name, status: 'missing', note: 'server returned an HTML page' };
      await pipeline(Readable.fromWeb(res.body), dest.createWriteStream({ resumable: false, contentType: type }));
      const [meta] = await dest.getMetadata();
      return { name, status: 'ok', size: Number(meta.size) };
    } catch (e) { lastErr = e; await new Promise((r) => setTimeout(r, 2000 * (attempt + 1))); }
  }
  return { name, status: 'failed', error: String(lastErr) };
}

export const mirrorBatch = onMessagePublished(
  { topic: 'mirror-batch', region: 'us-central1', timeoutSeconds: 540, memory: '1GiB', maxInstances: 4, concurrency: 1 },
  async (event) => {
    const { batch, files } = event.data.message.json;
    const bucket = getStorage().bucket();
    const results = [];
    for (let i = 0; i < files.length; i += 4) {
      results.push(...await Promise.all(files.slice(i, i + 4).map((f) => copyOne(bucket, f))));
    }
    await bucket.file(`mirror-report/${batch}.json`).save(JSON.stringify(results), { contentType: 'application/json' });
  },
);

// Counts pages of PDFs already in the bucket (for OCR cost estimates).
// Topic "count-batch": { "batch": "c0001", "files": ["a.pdf", ...] } -> page-report/<batch>.json
import { PDFDocument } from 'pdf-lib';
export const countPages = onMessagePublished(
  { topic: 'count-batch', region: 'us-central1', timeoutSeconds: 540, memory: '2GiB', maxInstances: 6, concurrency: 1 },
  async (event) => {
    const { batch, files } = event.data.message.json;
    const bucket = getStorage().bucket();
    const results = [];
    for (const name of files) {
      try {
        const [buf] = await bucket.file(`files/${name}`).download();
        let pages;
        try { pages = (await PDFDocument.load(buf, { ignoreEncryption: true, updateMetadata: false })).getPageCount(); }
        catch { pages = (buf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length; }
        results.push({ name, pages, bytes: buf.length });
      } catch (e) { results.push({ name, error: String(e) }); }
    }
    await bucket.file(`page-report/${batch}.json`).save(JSON.stringify(results), { contentType: 'application/json' });
  },
);
