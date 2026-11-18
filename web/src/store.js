// Tiny IndexedDB key-value store for offline books and the cached catalog (stays on this device).
let dbp;
function db() {
  dbp ??= new Promise((resolve, reject) => {
    const r = indexedDB.open('gab', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  return dbp;
}
function tx(mode, fn) {
  return db().then((d) => new Promise((resolve, reject) => {
    const t = d.transaction('kv', mode); const req = fn(t.objectStore('kv'));
    t.oncomplete = () => resolve(req?.result); t.onerror = () => reject(t.error);
  }));
}
export const idbGet = (k) => tx('readonly', (s) => s.get(k)).catch(() => undefined);
export const idbSet = (k, v) => tx('readwrite', (s) => s.put(v, k));
export const idbDel = (k) => tx('readwrite', (s) => s.delete(k));
export const idbKeys = () => tx('readonly', (s) => s.getAllKeys()).catch(() => []);

// Small preferences and reading progress live in localStorage.
export const local = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { localStorage.setItem(k, JSON.stringify(v)); },
};
