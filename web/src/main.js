import { watchUser, signIn, logOut, loadCatalog, fileUrl, loadText, scanUrl } from './firebase.js';
import { openReader } from './reader.js';
import { idbGet, idbSet, idbDel, idbKeys, local } from './store.js';
import { buildIndex, search } from './search.js';
import { t, lang, setLang, groupName, groupIcon, langName, GROUPS } from './i18n.js';

const app = document.getElementById('app');
const state = { user: null, catalog: null, index: null, byId: new Map(), error: null };
const PAGE = 48;

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const hue = (id) => (id * 47) % 360;
const isAudio = (f) => /\.mp3$/i.test(f || '');

function route() {
  const [path, qs] = (location.hash.slice(1) || '/').split('?');
  return { parts: path.split('/').filter(Boolean), params: new URLSearchParams(qs || '') };
}
function go(hash, replace = false) {
  if (replace) history.replaceState(null, '', hash); else location.hash = hash.slice(1);
}

// ---------- shell ----------
function header() {
  const r = route().parts[0] || '';
  const nav = (href, key, active) => `<a href="${href}" class="${active ? 'active' : ''}">${t(key)}</a>`;
  const u = state.user;
  return `<header class="top">
    <a class="brand" href="#/"><span class="mark">መ</span><span class="brand-text"><b>${t('siteName')}</b><small>${lang() === 'am' ? 'Good Amharic Books' : 'መልካም የአማርኛ መጻሕፍት'}</small></span></a>
    <nav>${nav('#/', 'home', r === '')}${nav('#/library', 'library', r === 'library' || r === 'book')}${nav('#/reading', 'reading', r === 'reading')}${nav('#/about', 'about', r === 'about')}</nav>
    <div class="top-actions">
      ${installPrompt ? `<button class="btn install" data-action="install">⤓ ${t('install')}</button>` : ''}
      <div class="lang-toggle" role="group" aria-label="Language">
        <button data-lang="en" class="${lang() === 'en' ? 'on' : ''}">EN</button><button data-lang="am" class="${lang() === 'am' ? 'on' : ''}">አማ</button>
      </div>
      ${u ? `<button class="avatar" data-action="signout" title="${esc(t('signOut'))} (${esc(u.email)})">${u.photoURL ? `<img src="${esc(u.photoURL)}" alt="" referrerpolicy="no-referrer">` : esc((u.email || '?')[0].toUpperCase())}</button>` : ''}
    </div>
  </header>`;
}
const footer = () => `<footer class="foot"><span>${t('aboutPreview')}</span><a href="#/about">${t('about')}</a></footer>`;

function tabbar() {
  const r = route().parts[0] || '';
  const tab = (href, icon, key, on) => `<a href="${href}" class="${on ? 'on' : ''}"><span class="ti">${icon}</span><span>${t(key)}</span></a>`;
  return `<nav class="tabbar">${tab('#/', '⌂', 'home', r === '')}${tab('#/library', '⌕', 'library', r === 'library' || r === 'book')}${tab('#/reading', '📖', 'reading', r === 'reading')}${tab('#/about', 'ⓘ', 'about', r === 'about')}</nav>`;
}
function frame(body) { app.innerHTML = `${header()}<main>${body}</main>${footer()}${tabbar()}`; observeFiles(); }

// ---------- pieces ----------
function titleBlock(b, big = false) {
  if (b.titleAm || b.titleEn) {
    return `<div class="title ${big ? 'big' : ''}">${b.titleAm ? `<span class="am">${esc(b.titleAm)}</span>` : ''}${b.titleEn ? `<span class="en">${esc(b.titleEn)}</span>` : ''}</div>`;
  }
  const fallback = `<span class="title-fallback">${esc(t('untitled', { id: b.id }))}</span>`;
  return b.titleImage
    ? `<div class="title title-img ${big ? 'big' : ''}" data-file="${esc(b.titleImage)}" data-kind="img">${fallback}</div>`
    : `<div class="title">${fallback}</div>`;
}

function coverBlock(b) {
  return `<div class="cover" style="--h:${hue(b.id)}" ${b.cover ? `data-file="${esc(b.cover)}" data-kind="bg"` : ''}>
    <div class="cover-ph"><span class="ico">${groupIcon(b.group)}</span><span>${esc(groupName(b.group, lang()))}</span></div></div>`;
}

function card(b) {
  return `<a class="card" href="#/book/${b.id}">${coverBlock(b)}${b.hasText ? `<span class="badge-text">${t('readable')}</span>` : ''}<div class="meta">${titleBlock(b)}
    <div class="author">${esc(b.author || t('unknownAuthor'))}</div>
    <div class="chips"><span>${esc(groupName(b.group, lang()))}</span>${b.langs.slice(0, 2).map((l) => `<span class="lang">${esc(langName(l, lang()))}</span>`).join('')}</div></div></a>`;
}

function searchForm(value = '', big = false) {
  return `<form class="search ${big ? 'big' : ''}" data-action="search">
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10.5 3a7.5 7.5 0 0 1 5.96 12.06l4.24 4.24-1.4 1.4-4.24-4.24A7.5 7.5 0 1 1 10.5 3Zm0 2a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11Z"/></svg>
    <input name="q" type="search" value="${esc(value)}" placeholder="${esc(t('searchPlaceholder'))}" autocomplete="off" aria-label="${esc(t('search'))}">
    <button type="submit">${t('search')}</button></form>`;
}

// ---------- views ----------
function homeView() {
  const { books, groups } = state.catalog;
  const langsCount = new Set(books.flatMap((b) => b.langs)).size;
  const sorted = [...groups].sort((a, b) => b.count - a.count);
  const picks = [...books].sort((a, b) => ((a.id * 7919) % 1009) - ((b.id * 7919) % 1009)).slice(0, 12);
  frame(`<section class="hero"><div class="hero-inner">
      <p class="eyebrow">ንባብ ለሁሉ · Reading for everyone</p>
      <h1>${t('heroTitle')}</h1><p class="lead">${t('heroSub', { n: books.length.toLocaleString() })}</p>
      ${searchForm('', true)}
      <div class="stats"><div><b>${books.length.toLocaleString()}</b><span>${t('books')}</span></div>
        <div><b>${groups.length}</b><span>${t('categories')}</span></div><div><b>${langsCount}</b><span>${t('languages')}</span></div></div>
    </div></section>
    <section class="wrap"><div class="section-head"><h2>${t('browse')}</h2><a href="#/library">${t('allBooks')} →</a></div>
      <div class="groups">${sorted.map((g) => `<a class="group" href="#/library?g=${encodeURIComponent(g.name)}" style="--h:${hue(g.name.length * 13 + g.count)}">
        <span class="ico">${groupIcon(g.name)}</span><span class="g-name">${esc(groupName(g.name, lang()))}</span>
        <span class="g-alt">${esc(groupName(g.name, lang() === 'am' ? 'en' : 'am'))}</span><span class="g-count">${g.count}</span></a>`).join('')}</div>
    </section>
    <section class="wrap"><div class="section-head"><h2>${lang() === 'am' ? 'ለእርስዎ የተመረጡ' : 'Discover'}</h2></div>
      <div class="grid">${picks.map(card).join('')}</div></section>`);
}

function libraryView(params) {
  const { groups, books } = state.catalog;
  const q = params.get('q') || '', g = params.get('g') || '', l = params.get('l') || '', s = params.get('s') || '';
  const langs = [...new Set(books.flatMap((b) => b.langs))].sort((a, b) => books.filter((x) => x.langs.includes(b)).length - books.filter((x) => x.langs.includes(a)).length);
  const sortedGroups = [...groups].sort((a, b) => groupName(a.name, lang()).localeCompare(groupName(b.name, lang())));
  frame(`<section class="wrap library">
    <div class="lib-head">${searchForm(q)}
      <div class="filters">
        <select data-filter="g"><option value="">${t('allCategories')}</option>${sortedGroups.map((x) => `<option value="${esc(x.name)}" ${x.name === g ? 'selected' : ''}>${esc(groupName(x.name, lang()))} (${x.count})</option>`).join('')}</select>
        <select data-filter="l"><option value="">${t('allLanguages')}</option>${langs.map((x) => `<option value="${x}" ${x === l ? 'selected' : ''}>${esc(langName(x, lang()))}</option>`).join('')}</select>
        <select data-filter="s"><option value="">${t('sortRelevance')}</option><option value="title" ${s === 'title' ? 'selected' : ''}>${t('sortTitle')}</option><option value="author" ${s === 'author' ? 'selected' : ''}>${t('sortAuthor')}</option></select>
      </div></div>
    <div class="chip-row"><button data-readable class="${params.get('t') ? 'on' : ''}">📖 ${t('readableText')}</button>${sortedGroups.map((x) => `<button data-group="${esc(x.name)}" class="${x.name === g ? 'on' : ''}">${groupIcon(x.name)} ${esc(groupName(x.name, lang()))}</button>`).join('')}</div>
    <div id="results"></div></section>`);
  renderResults(PAGE);
}

function currentResults() {
  const p = route().params;
  const q = p.get('q') || '', g = p.get('g') || '', l = p.get('l') || '', s = p.get('s') || '';
  let rows = search(state.index, q).map((r) => r.book);
  if (g) rows = rows.filter((b) => b.group === g);
  if (l) rows = rows.filter((b) => b.langs.includes(l));
  if (p.get('t')) rows = rows.filter((b) => b.hasText);
  const key = (b) => (s === 'author' ? b.author : (b.titleAm || b.titleEn || `~${String(b.id).padStart(5, '0')}`)) || '~';
  if (s || !q) rows = [...rows].sort((a, b) => key(a).localeCompare(key(b), lang()) || a.id - b.id);
  return rows;
}

function renderResults(limit) {
  const el = document.getElementById('results'); if (!el) return;
  const rows = currentResults();
  el.dataset.limit = limit;
  el.innerHTML = `<p class="count">${t('results', { n: rows.length.toLocaleString() })}</p>
    ${rows.length ? `<div class="grid">${rows.slice(0, limit).map(card).join('')}</div>` : `<div class="empty">📭 ${t('noResults')}</div>`}
    ${rows.length > limit ? `<div class="more"><button data-action="more">${t('showMore')}</button></div>` : ''}`;
  observeFiles();
}

function bookView(id) {
  const b = state.byId.get(Number(id));
  if (!b) return go('#/library', true), libraryView(new URLSearchParams());
  const partLabel = (p, i) => p.label || (b.parts.length === 1 ? t('fullBook') : t('part', { n: i + 1 }));
  const related = state.catalog.books.filter((x) => x.group === b.group && x.id !== b.id && (!b.author || x.author === b.author || true)).slice(0, 6);
  frame(`<section class="wrap book">
    <a class="back" href="javascript:history.back()">${t('back')}</a>
    <div class="book-grid">${coverBlock(b)}
      <div class="book-info">${titleBlock(b, true)}${(b.titleAm || b.titleEn) && b.titleImage ? `<div class="title-img orig" data-file="${esc(b.titleImage)}" data-kind="img"></div>` : ''}
        <dl><dt>${t('author')}</dt><dd>${b.author ? `<a href="#/library?q=${encodeURIComponent(b.author)}">${esc(b.author)}</a>` : esc(t('unknownAuthor'))}</dd>
          <dt>${t('category')}</dt><dd><a href="#/library?g=${encodeURIComponent(b.group)}">${groupIcon(b.group)} ${esc(groupName(b.group, lang()))}</a></dd>
          <dt>${t('language')}</dt><dd>${b.langs.map((l) => esc(langName(l, lang()))).join(', ')}</dd></dl>
        ${b.hasText ? readCta(b) : ''}
        <h3>${b.hasText ? t('originalScans') : t('files')} <small>(${b.parts.length})</small></h3>
        <ol class="parts">${b.parts.map((p, i) => `<li><span class="p-label">${esc(partLabel(p, i))}</span>
          ${p.file ? (isAudio(p.file)
            ? `<span class="p-actions"><button class="btn" data-action="listen" data-file="${esc(p.file)}">▶ ${t('listen')}</button></span><div class="audio-slot"></div>`
            : `<span class="p-actions"><button class="btn primary" data-action="read" data-file="${esc(p.file)}">${t('read')}</button><button class="btn" data-action="download" data-file="${esc(p.file)}" data-name="${esc(p.file)}">↓ ${t('download')}</button></span>`)
            : `<span class="p-gone">${t('gone')}</span>`}
          <div class="p-error" hidden>${t('notCopied')}</div></li>`).join('')}</ol>
        <p class="note">${t('pdfNote')}</p>
      </div></div>
    ${related.length ? `<div class="section-head"><h2>${esc(groupName(b.group, lang()))}</h2><a href="#/library?g=${encodeURIComponent(b.group)}">${t('allBooks')} →</a></div><div class="grid">${related.map(card).join('')}</div>` : ''}
  </section>`);
}

function readCta(b) {
  const pr = local.get(`gab-progress-${b.id}`, null);
  return `<div class="read-cta"><a class="btn primary big" href="#/read/${b.id}">📖 ${pr ? t('continueAt', { p: pr.label, pct: pr.pct }) : t('readNow')}</a>
    <span class="read-note">${t('readNote')}</span>${pr ? `<div class="progress"><i style="width:${pr.pct}%"></i></div>` : ''}</div>`;
}

async function readingView() {
  const recent = local.get('gab-recent', []).map((id) => state.byId.get(id)).filter(Boolean);
  const offline = new Set((await idbKeys()).filter((k) => String(k).startsWith('text:')).map((k) => Number(String(k).slice(5))));
  const readable = state.catalog.books.filter((b) => b.hasText);
  const row = (b) => {
    const pr = local.get(`gab-progress-${b.id}`, null);
    return `<a class="reading-row" href="#/read/${b.id}">${coverBlock(b)}<div class="meta">${titleBlock(b)}<div class="author">${esc(b.author || '')}</div>
      ${pr ? `<div class="progress"><i style="width:${pr.pct}%"></i></div><small>${t('pageOf', { p: pr.label, pct: pr.pct })}</small>` : `<small>${t('notStarted')}</small>`}
      ${offline.has(b.id) ? `<small class="offline-tag">✓ ${t('offlineReady')}</small>` : ''}</div></a>`;
  };
  if (route().parts[0] !== 'reading') return;
  frame(`<section class="wrap reading">
    <h1>${t('reading')}</h1>
    ${recent.length ? `<h2>${t('continueReading')}</h2><div class="reading-list">${recent.map(row).join('')}</div>` : `<p class="muted">${t('noReading')}</p>`}
    <h2>${t('readableBooks')} <small>(${readable.length})</small></h2>
    <div class="reading-list">${readable.map(row).join('')}</div>
    <div class="notice">${t('readableSoon')}</div>
    ${isIos() && !standalone() ? `<div class="notice ios">📲 ${t('iosInstall')}</div>` : ''}
  </section>`);
}

let readerHandle;
async function readerView(id) {
  const b = state.byId.get(Number(id));
  if (!b || !b.hasText) return go(`#/book/${id}`, true), render();
  app.innerHTML = `<div class="boot"><div class="spinner"></div></div>`;
  let text = await idbGet(`text:${b.id}`);
  const wasOffline = Boolean(text);
  try { if (!text || navigator.onLine) { const fresh = await loadText(b.id); text = fresh; if (wasOffline) idbSet(`text:${b.id}`, fresh); } }
  catch (e) { if (!text) { app.innerHTML = `<div class="boot"><p>${esc(t('textUnavailable'))}</p><a class="btn" href="#/book/${b.id}">${t('back')}</a></div>`; return; } }
  if (route().parts[0] !== 'read' || route().parts[1] !== String(b.id)) return;
  let saved = wasOffline;
  readerHandle = openReader(app, {
    book: b, text, lang: lang(), scanUrl,
    offline: { has: () => saved, save: async () => { await idbSet(`text:${b.id}`, text); saved = true; }, remove: async () => { await idbDel(`text:${b.id}`); saved = false; } },
    onExit: () => { readerHandle = null; history.length > 1 ? history.back() : go(`#/book/${b.id}`); },
  });
}

const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone;

function aboutView() {
  frame(`<section class="wrap prose"><h1>${t('aboutTitle')}</h1><p>${t('aboutBody')}</p>
    <div class="notice">🔒 ${t('aboutPreview')}</div>
    <p><a class="btn" href="http://www.good-amharic-books.com" target="_blank" rel="noopener">${t('original')} ↗</a></p></section>`);
}

function gateView(kind) {
  const u = state.user;
  app.innerHTML = `<div class="gate"><div class="gate-card">
    <div class="lang-toggle small" role="group"><button data-lang="en" class="${lang() === 'en' ? 'on' : ''}">EN</button><button data-lang="am" class="${lang() === 'am' ? 'on' : ''}">አማ</button></div>
    <span class="mark big">መ</span><h1>${t('siteName')}</h1><p class="gate-kicker">🔒 ${t('signInTitle')}</p>
    ${kind === 'loading' ? `<div class="spinner"></div>` : kind === 'denied'
      ? `<p>${t('noAccess', { email: `<b>${esc(u?.email)}</b>` })}</p><button class="btn primary" data-action="switch">${t('useOther')}</button>`
      : `<p>${t('signInBody')}</p><button class="btn google" data-action="signin"><svg viewBox="0 0 48 48" width="20" height="20"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2c-2 1.5-4.5 2.4-7.2 2.4-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>${t('signIn')}</button>`}
    ${state.error ? `<p class="err">${esc(state.error)}</p>` : ''}</div></div>`;
}

function render() {
  if (!state.user) return gateView(state.user === null ? 'signin' : 'loading');
  if (state.denied) return gateView('denied');
  if (!state.catalog) return gateView('loading');
  const { parts, params } = route();
  document.title = `${t('siteName')}`;
  if (parts[0] !== 'read' && readerHandle) { readerHandle.cleanup(); readerHandle = null; }
  if (parts[0] === 'read') return readerView(parts[1]);
  if (parts[0] === 'reading') readingView();
  else if (parts[0] === 'library') libraryView(params);
  else if (parts[0] === 'book') bookView(parts[1]);
  else if (parts[0] === 'about') aboutView();
  else homeView();
  if (!route().params.get('keep')) window.scrollTo(0, 0);
}

// ---------- private files ----------
let io;
function observeFiles() {
  io?.disconnect();
  io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { io.unobserve(e.target); loadInto(e.target); }
  }, { rootMargin: '300px' });
  app.querySelectorAll('[data-file][data-kind]').forEach((el) => io.observe(el));
}
function loadInto(el) {
  fileUrl(el.dataset.file).then((url) => {
    if (el.dataset.kind === 'bg') { el.style.backgroundImage = `url("${url}")`; el.classList.add('loaded'); }
    else { el.innerHTML = `<img src="${url}" alt="">`; el.classList.add('loaded'); }
  }).catch(() => el.classList.add('missing'));
}

async function openFile(btn, mode) {
  const li = btn.closest('li'); const err = li?.querySelector('.p-error');
  const win = mode === 'read' ? window.open('', '_blank') : null;
  if (win) win.document.write(`<p style="font:16px system-ui;padding:2rem">${t('loading')}</p>`);
  btn.disabled = true;
  try {
    const url = await fileUrl(btn.dataset.file);
    if (mode === 'read') win.location.href = url;
    else if (mode === 'download') { const a = document.createElement('a'); a.href = url; a.download = btn.dataset.name; a.click(); }
    else if (mode === 'listen') { li.querySelector('.audio-slot').innerHTML = `<audio controls autoplay src="${url}"></audio>`; }
  } catch { win?.close(); if (err) err.hidden = false; }
  finally { btn.disabled = false; }
}

// ---------- events ----------
function setParam(k, v) {
  const { params } = route();
  if (v) params.set(k, v); else params.delete(k);
  go(`#/library?${params}`, true);
  renderResults(PAGE);
}
let typing;
app.addEventListener('input', (e) => {
  if (e.target.name === 'q' && route().parts[0] === 'library') {
    clearTimeout(typing); typing = setTimeout(() => setParam('q', e.target.value.trim()), 150);
  }
});
app.addEventListener('change', (e) => {
  const f = e.target.dataset.filter; if (!f) return;
  setParam(f, e.target.value);
  if (f === 'g') app.querySelectorAll('[data-group]').forEach((b) => b.classList.toggle('on', b.dataset.group === e.target.value));
});
app.addEventListener('submit', (e) => {
  if (e.target.dataset.action !== 'search') return;
  e.preventDefault();
  const q = new FormData(e.target).get('q').trim();
  if (route().parts[0] === 'library') setParam('q', q);
  else go(`#/library${q ? `?q=${encodeURIComponent(q)}` : ''}`);
});
app.addEventListener('click', async (e) => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.lang) { setLang(b.dataset.lang); return render(); }
  if (b.dataset.readable !== undefined) {
    b.classList.toggle('on'); return setParam('t', b.classList.contains('on') ? '1' : '');
  }
  if (b.dataset.action === 'install' && installPrompt) { installPrompt.prompt(); installPrompt = null; return render(); }
  if (b.dataset.group !== undefined) {
    const on = !b.classList.contains('on');
    app.querySelectorAll('[data-group]').forEach((x) => x.classList.toggle('on', on && x === b));
    const sel = app.querySelector('[data-filter="g"]'); if (sel) sel.value = on ? b.dataset.group : '';
    return setParam('g', on ? b.dataset.group : '');
  }
  const a = b.dataset.action;
  if (a === 'signin' || a === 'switch') {
    state.error = null;
    try { if (a === 'switch') await logOut(); await signIn(); } catch (err) { state.error = err.code || String(err); render(); }
  } else if (a === 'signout') { await logOut(); }
  else if (a === 'more') { renderResults(Number(document.getElementById('results').dataset.limit) + PAGE); }
  else if (a === 'read' || a === 'download' || a === 'listen') openFile(b, a);
});
window.addEventListener('hashchange', render);

let installPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installPrompt = e; if (state.catalog && route().parts[0] !== 'read') render(); });
if (!__DEV__ && 'serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});

function useCatalog(c) {
  state.catalog = c; state.index = buildIndex(c.books); state.byId = new Map(c.books.map((b) => [b.id, b]));
}
if (__DEV__) {
  // Local preview only (npm run dev): no sign-in, catalog from public/dev/.
  state.user = { email: 'preview@localhost' };
  fetch('/dev/catalog.json').then((r) => r.json()).then((c) => { useCatalog(c); render(); });
} else {
  watchUser(async (user) => {
    state.user = user; state.denied = false; state.catalog = null;
    if (!user) return render();
    render();
    try { const c = await loadCatalog(); useCatalog(c); idbSet('catalog', c); } catch (err) {
      const cached = await idbGet('catalog');
      if (cached && (!navigator.onLine || err.code === 'storage/retry-limit-exceeded' || err.code === 'storage/unknown')) { useCatalog(cached); return render(); }
      if (err.code === 'storage/unauthorized' || err.code === 'storage/unauthenticated') state.denied = true;
      else state.error = err.code || String(err);
    }
    render();
  });
  state.user = undefined; // "loading" until Firebase reports
}
setLang(lang());
render();
