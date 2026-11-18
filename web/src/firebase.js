import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signInWithRedirect, signOut } from 'firebase/auth';
import { getStorage, ref, getBlob, getBytes } from 'firebase/storage';

// Public web config (not secret). Access is enforced by storage.rules.
const app = initializeApp({
  apiKey: 'AIzaSyDOJ5HZ5YPyHxeb8e6RPFupol44e3fUaHE',
  authDomain: 'good-amharic-books-web.firebaseapp.com',
  projectId: 'good-amharic-books-web',
  storageBucket: 'good-amharic-books-web.firebasestorage.app',
  messagingSenderId: '818404973416',
  appId: '1:818404973416:web:8a8673883ff808108f54dd',
});
const auth = getAuth(app);
const storage = getStorage(app);

export function watchUser(cb) { return onAuthStateChanged(auth, cb); }
export async function signIn() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  try { await signInWithPopup(auth, provider); }
  catch (e) { if (e.code === 'auth/popup-blocked') await signInWithRedirect(auth, provider); else throw e; }
}
export function logOut() { return signOut(auth); }

export async function loadCatalog() {
  const bytes = await getBytes(ref(storage, 'catalog/catalog.json'));
  return JSON.parse(new TextDecoder().decode(bytes));
}

// Object URLs for private files, cached; at most 6 downloads at a time.
const cache = new Map();
let active = 0; const queue = [];
function pump() {
  while (active < 6 && queue.length) {
    const job = queue.shift(); active++;
    getBlob(ref(storage, job.path)).then((b) => job.resolve(URL.createObjectURL(b)), job.reject)
      .finally(() => { active--; pump(); });
  }
}
export function fileUrl(name) { return storageUrl(`files/${name}`); }
export function scanUrl(file, page) {
  if (__DEV__) return Promise.resolve(`/dev/scans/${file.replace(/\.[^.]+$/, '')}/${page}.webp`);
  return storageUrl(`scans/${file.replace(/\.[^.]+$/, '')}/${page}.webp`); }
export async function loadText(id) {
  if (__DEV__) return (await fetch(`/dev/text/${id}.json`)).json();
  const bytes = await getBytes(ref(storage, `text/${id}.json`));
  return JSON.parse(new TextDecoder().decode(bytes));
}
export function storageUrl(path) {
  if (!cache.has(path)) {
    cache.set(path, new Promise((resolve, reject) => { queue.push({ path, resolve, reject }); pump(); }));
    cache.get(path).catch(() => cache.delete(path));
  }
  return cache.get(path);
}
