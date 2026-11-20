// Full-screen reader for books that have been converted to text.
// The text flows freely: printed page breaks are invisible anchors (used for position, bookmarks and the original-scan view),
// and book mode numbers its own pages from the current screen, font, size and spacing.
import { foldEthiopic, isEthiopic, analyze, matchWord } from './ethiopic.js';
import { local } from './store.js';

const SIZES = [16, 18, 20, 22, 25, 28, 32];
const SPACING = [1.6, 1.8, 2.0, 2.3];
const FONTS = {
  serif: ["'Noto Serif Ethiopic'", 'Serif', 'ሰሪፍ'],
  sans: ["'Noto Sans Ethiopic'", 'Sans', 'ሳንስ'],
  abyssinica: ["'Abyssinica SIL'", 'Abyssinica', 'አቢሲኒካ'],
};
const THEMES = ['light', 'sepia', 'dark'];
const DEFAULTS = { size: 2, spacing: 1, font: 'serif', theme: 'sepia', width: 'normal', justify: false, mode: 'book' };

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const LIST_ITEM = /^([—–•-]\s|([ሀ-ፐ]|\d{1,2}(ኛ)?)[./)]\s?)/;

const L = {
  en: { contents: 'Contents', bookmarks: 'Bookmarks', search: 'Search in this book', settings: 'Reading settings', page: 'Page',
    original: 'Original page', noBookmarks: 'No bookmarks yet. Tap ☆ to bookmark where you are.', results: '{n} results',
    noResults: 'No matches.', size: 'Text size', spacing: 'Line spacing', font: 'Font', theme: 'Theme', width: 'Width', justify: 'Justify text',
    light: 'Light', sepia: 'Sepia', dark: 'Dark', narrow: 'Narrow', normal: 'Normal', wide: 'Wide', back: 'Back',
    offline: 'Available offline', download: 'Download for offline reading', downloading: 'Saving…', removeOffline: 'Remove offline copy',
    ocrNote: 'Converted from a scanned book and proofread. To compare any passage with the printed book, tap 📄 above.',
    pdf: 'Download as PDF (text edition)', fullSpread: 'Show both pages', mode: 'Layout', book: 'Book (turn pages)', scroll: 'Scroll',
    tapHint: 'Tap the edges or swipe to turn the page', openImage: 'Open image', close: 'Close', printed: 'printed page',
    absent: 'not in the scanned copy', fullscreen: 'Full screen', fsIos: 'iPhone and iPad don\u2019t allow full screen for web pages. For full-screen reading, add this site to your home screen: tap Share, then “Add to Home Screen”, and open it from there.' },
  am: { contents: 'ማውጫ', bookmarks: 'ምልክቶች', search: 'በዚህ መጽሐፍ ውስጥ ፈልግ', settings: 'የንባብ ቅንብሮች', page: 'ገጽ',
    original: 'ዋናው ገጽ', noBookmarks: 'እስካሁን ምልክት የለም። ያሉበትን ቦታ ለማስቀመጥ ☆ን ይንኩ።', results: '{n} ውጤቶች',
    noResults: 'ምንም አልተገኘም።', size: 'የፊደል መጠን', spacing: 'የመስመር ክፍተት', font: 'ፊደል', theme: 'ገጽታ', width: 'ስፋት', justify: 'ጽሑፉን አስተካክል',
    light: 'ብሩህ', sepia: 'ሴፒያ', dark: 'ጨለማ', narrow: 'ጠባብ', normal: 'መደበኛ', wide: 'ሰፊ', back: 'ተመለስ',
    offline: 'ያለ ኢንተርኔት ይገኛል', download: 'ያለ ኢንተርኔት ለማንበብ አውርድ', downloading: 'በማስቀመጥ ላይ…', removeOffline: 'የተቀመጠውን ቅጂ አጥፋ',
    ocrNote: 'ከተቃኘ መጽሐፍ ተቀይሮ የተገመገመ ነው። ማንኛውንም ክፍል ከታተመው መጽሐፍ ጋር ለማነጻጸር ከላይ 📄ን ይንኩ።',
    pdf: 'እንደ PDF አውርድ (የጽሑፍ እትም)', fullSpread: 'ሁለቱንም ገጾች አሳይ', mode: 'አቀማመጥ', book: 'መጽሐፍ (ገጽ መግለጥ)', scroll: 'ማሸብለል',
    tapHint: 'ገጽ ለመግለጥ ጠርዙን ይንኩ ወይም ያንሸራትቱ', openImage: 'ምስሉን ክፈት', close: 'ዝጋ', printed: 'የታተመ ገጽ',
    absent: 'በተቃኘው ቅጂ የለም', fullscreen: 'ሙሉ ገጽ', fsIos: 'iPhone እና iPad ለድረ-ገጾች ሙሉ ገጽ አይፈቅዱም። በሙሉ ገጽ ለማንበብ ይህን ገጽ በመነሻ ገጽዎ ላይ ያክሉ፦ Share ን ይንኩ፣ “Add to Home Screen” ን ይምረጡ፣ ከዚያ ይክፈቱት።' },
};

export function openReader(root, { book, text, lang, scanUrl, offline, pdf, onExit }) {
  const tr = (k, v = {}) => Object.entries(v).reduce((s, [a, b]) => s.replace(`{${a}}`, b), L[lang === 'am' ? 'am' : 'en'][k]);
  const prefs = { ...DEFAULTS, ...local.get('gab-reader', {}) };
  const progKey = `gab-progress-${book.id}`, bmKey = `gab-bm-${book.id}`;
  const pages = text.pages;
  let current = Math.min(local.get(progKey, {}).page ?? 0, pages.length - 1);
  let panel = null, searchState = { q: '', results: [] };

  const roman = (n) => [['m', 1000], ['cm', 900], ['d', 500], ['cd', 400], ['c', 100], ['xc', 90], ['l', 50], ['xl', 40], ['x', 10], ['ix', 9], ['v', 5], ['iv', 4], ['i', 1]]
    .reduce((acc, [r, v]) => { while (n >= v) { acc += r; n -= v; } return acc; }, '');
  const printedLabel = (i) => pages[i].n || roman(i + 1);
  const pct = (i) => Math.round(((i + 1) / pages.length) * 100);
  // contents entries point at their heading block (t.b from the builder, else found by title)
  const toc = text.toc.map((t) => ({ ...t, b: t.b ?? pages[t.page]?.blocks.findIndex((b) => b.x === t.title) }));
  const targetId = (t) => (t.b >= 0 ? `b-${t.page}-${t.b}` : `pm-${t.page}`);

  // ---------- flowing text ----------
  function markText(raw, m) { return m ? esc(raw.slice(0, m.at)) + `<mark>${esc(raw.slice(m.at, m.at + m.len))}</mark>` + esc(raw.slice(m.at + m.len)) : esc(raw); }
  const TABLE_ROW = / \| |^\| /;
  function flowHtml(a, b, mark, ab = 0, bb = 0) {        // pages a..b-1; starts at block ab of page a; with bb, also page b's first bb blocks
    let html = '', openP = false, openT = false, notes = '';   // footnotes wait until the paragraph they interrupt has ended
    const closeP = () => { if (openP) { html += '</p>'; openP = false; } if (openT) { html += '</tbody></table></div>'; openT = false; }
      if (notes) { html += `<aside class="r-fn">${notes}</aside>`; notes = ''; } };
    for (let i = a; i < b || (i === b && bb > 0 && i < pages.length); i++) {
      const anchor = `<span class="pm" id="pm-${i}" data-i="${i}"></span>`;
      const bl = pages[i].blocks, from = i === a ? ab : 0, to = i === b ? bb : bl.length;
      if (!bl.length) { if (!from) html += anchor; continue; }
      bl.forEach((blk, k) => {
        if (k < from || k >= to) return;
        const id = `b-${i}-${k}`, m = k === 0 ? anchor : '';
        const x = markText(blk.x, mark && mark.page === i && mark.block === k ? mark : null);
        if (blk.t === 'fn') { const n = `<p id="${id}">${m}${x}</p>`; if (openP) notes += n; else html += `<aside class="r-fn">${n}</aside>`; return; }
        if (blk.t === 'p' && blk.cont && k === 0 && openP) { html += ` ${m}<span id="${id}">${x}</span>`; return; }  // paragraph runs on across the printed page break
        if (blk.t === 'p' && TABLE_ROW.test(blk.x)) {                 // "a | b | c" rows (rebuilt tables) become a real table
          if (openP) closeP();
          if (!openT) { const n = blk.x.split(/ \| |^\| /).length;
            html += `<div class="r-tablewrap"><table class="r-table${n >= 6 ? ' c6' : n >= 4 ? ' c4' : ''}"><tbody>`; openT = true; }
          html += `<tr id="${id}">${x.split(/ \| |^\| /).map((c, n) => `<td>${n ? '' : m}${c}</td>`).join('')}</tr>`; return;
        }
        closeP();
        if (blk.t === 'h1') html += `<h2 class="r-h1" id="${id}">${m}${x}</h2>`;
        else if (blk.t === 'h2') html += `<h3 class="r-h2" id="${id}">${m}${x}</h3>`;
        else if (blk.t === 'pre') html += `<pre class="r-pre" id="${id}">${m}${x}</pre>`;
        else if (blk.t === 'c') html += `<p class="r-c" id="${id}">${m}${x}</p>`;
        else if (blk.t === 'toc') html += `<nav class="r-tocblock" id="${id}">${m}<ol>${toc.map((t, n) =>
          (t.absent ? `<li class="lvl${t.level} absent"><button disabled><span>${esc(t.title)}</span><small>${esc(tr('absent'))}</small></button></li>`
            : `<li class="lvl${t.level}"><button data-tk="${n}"><span>${esc(t.title)}</span><small data-tkp="${n}">${esc(tocPageText(n))}</small></button></li>`)).join('')}</ol></nav>`;
        else { html += `<p id="${id}"${LIST_ITEM.test(blk.x) ? ' class="li"' : ''}>${m}${x}`; openP = true; }
      });
    }
    closeP();
    return html;
  }

  root.innerHTML = `<div class="reader" data-theme="${prefs.theme}">
    <header class="r-top">
      <button class="r-icon" data-act="exit" aria-label="${esc(tr('back'))}">←</button>
      <div class="r-title"><b>${esc(book.titleAm || text.titleAm)}</b><small>${esc(book.author || '')}</small></div>
      <button class="r-icon" data-act="toc" aria-label="${esc(tr('contents'))}">☰</button>
      <button class="r-icon" data-act="search" aria-label="${esc(tr('search'))}">⌕</button>
      <button class="r-icon" data-act="orig" aria-label="${esc(tr('original'))}" title="${esc(tr('original'))}">📄</button>
      <button class="r-icon" data-act="bookmark" aria-label="${esc(tr('bookmarks'))}">☆</button>
      <button class="r-icon" data-act="settings" aria-label="${esc(tr('settings'))}">Aa</button>
      <button class="r-icon r-fs" data-act="fs" aria-label="${esc(tr('fullscreen'))}" title="${esc(tr('fullscreen'))}">⛶</button>
    </header>
    <main class="r-body" tabindex="-1"><article class="r-text"></article></main>
    <div class="r-book" hidden><div class="r-sheet"><div class="r-cols r-text"></div><div class="r-turn" hidden><div class="r-cols r-text"></div><i class="r-shade"></i></div></div><p class="r-hint">${esc(tr('tapHint'))}</p></div>
    <footer class="r-bottom">
      <input type="range" min="0" max="${pages.length - 1}" value="${current}" aria-label="${esc(tr('page'))}">
      <span class="r-pos"></span>
    </footer>
    <div class="r-scrim" hidden></div>
    <aside class="r-panel" hidden></aside>
  </div>`;

  const el = root.querySelector('.reader'), body = el.querySelector('.r-body'), article = el.querySelector('article');
  const range = el.querySelector('input[type=range]'), pos = el.querySelector('.r-pos');
  const panelEl = el.querySelector('.r-panel'), scrim = el.querySelector('.r-scrim');
  const bookEl = el.querySelector('.r-book'), sheet = el.querySelector('.r-sheet'), cols = sheet.querySelector('.r-cols');
  const leaf = sheet.querySelector('.r-turn'), ghost = leaf.querySelector('.r-cols'), shade = leaf.querySelector('.r-shade');
  const note = () => `<p class="r-note">ⓘ ${esc(tr('ocrNote'))}</p>`;

  function applyPrefs() {
    el.dataset.theme = prefs.theme;
    el.style.setProperty('--r-size', `${SIZES[prefs.size]}px`);
    el.style.setProperty('--r-lh', SPACING[prefs.spacing]);
    el.style.setProperty('--r-font', FONTS[prefs.font][0]);
    el.style.setProperty('--r-width', { narrow: '34em', normal: '40em', wide: '52em' }[prefs.width]);
    el.classList.toggle('justify', prefs.justify);
    el.classList.toggle('book', prefs.mode === 'book');
    body.hidden = prefs.mode === 'book'; bookEl.hidden = prefs.mode !== 'book';
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', { light: '#ffffff', sepia: '#f4ecd8', dark: '#141414' }[prefs.theme]);
    local.set('gab-reader', prefs);
  }

  // ---------- position ----------
  function updatePos() {
    range.value = current;
    if (prefs.mode === 'book' && layout.total) {
      const n = layout.offset[chap] + col + 1, last = Math.min(n + perView - 1, layout.total);
      pos.textContent = `${tr('page')} ${n}${last > n ? `–${last}` : ''} / ${layout.total}`;
    } else pos.textContent = `${pct(current)}%`;
    const bms = local.get(bmKey, []);
    el.querySelector('[data-act="bookmark"]').textContent = bms.some((b) => b.page === current) ? '★' : '☆';
  }
  function saveProgress() {
    const p = prefs.mode === 'book' && layout.total ? Math.round(((layout.offset[chap] + col + 1) / layout.total) * 100) : pct(current);
    local.set(progKey, { page: current, total: pages.length, label: prefs.mode === 'book' && layout.total ? String(layout.offset[chap] + col + 1) : printedLabel(current), pct: p, ts: Date.now() });
    const recent = local.get('gab-recent', []).filter((id) => id !== book.id);
    local.set('gab-recent', [book.id, ...recent].slice(0, 20));
  }
  let jumping = 0;
  function goTo(i, id) {
    current = Math.max(0, Math.min(pages.length - 1, i));
    if (prefs.mode === 'book') { bookShow(current, { id }); return; }
    jumping = Date.now(); el.classList.remove('immersive');
    article.querySelector(`#${CSS.escape(id || `pm-${current}`)}`)?.scrollIntoView({ block: 'start' });
    updatePos(); saveProgress();
  }

  // ---------- scroll mode ----------
  let anchors = [];
  function renderScroll(mark) {
    article.innerHTML = note() + flowHtml(0, pages.length, mark) + '<p class="r-end">❖ ❖ ❖</p>';
    anchors = [...article.querySelectorAll('.pm')];
  }
  function trackScroll() {
    const top = body.getBoundingClientRect().top + body.clientHeight * 0.3;
    let lo = 0, hi = anchors.length - 1, at = 0;
    while (lo <= hi) { const mid = (lo + hi) >> 1; if (anchors[mid].getBoundingClientRect().top <= top) { at = mid; lo = mid + 1; } else hi = mid - 1; }
    const i = Number(anchors[at]?.dataset.i ?? 0);
    if (i !== current) { current = i; updatePos(); saveProgress(); }
  }
  let lastY = 0, ticking = false;
  body.addEventListener('scroll', () => {
    if (!ticking) { ticking = true; requestAnimationFrame(() => { ticking = false; trackScroll(); }); }
    const y = body.scrollTop;
    if (Date.now() - jumping < 600) { lastY = y; return; }   // jumps from the contents, search or slider keep the bars
    if (Math.abs(y - lastY) > 12) { el.classList.toggle('immersive', y > lastY && y > 80); lastY = y; }
  }, { passive: true });
  body.addEventListener('click', (e) => { if (!e.target.closest('button, a') && !String(getSelection()).length) el.classList.toggle('immersive'); });

  // ---------- book mode: the text is set in columns, one column = one page (two per view on wide screens) ----------
  // The book is cut into segments: every chapter, and long chapters again at section headings, so that each segment is small
  // enough to lay out quickly on a phone. A segment always starts on a new page.
  const SEG_PAGES = 9;                                     // printed pages per segment before a section heading may start a new one
  const segs = (() => {
    const chapters = toc.filter((t) => t.level === 1 && !t.absent).map((t) => ({ p: t.page, b: Math.max(0, t.b) }));
    const must = new Set(chapters.map((c) => `${c.p}:${c.b}`));
    const heads = [];
    pages.forEach((pg, p) => pg.blocks.forEach((blk, b) => { if (blk.t === 'h1' || blk.t === 'h2' || must.has(`${p}:${b}`)) heads.push({ p, b }); }));
    chapters.forEach((c) => { if (!heads.some((h) => h.p === c.p && h.b === c.b)) heads.push(c); });
    heads.sort((x, y) => x.p - y.p || x.b - y.b);
    const out = [{ p: 0, b: 0 }];
    heads.forEach((h, n) => {
      const last = out[out.length - 1];
      if (h.p === last.p && h.b === last.b) return;
      const nextMust = heads.slice(n + 1).find((x) => must.has(`${x.p}:${x.b}`));
      const room = (nextMust ? nextMust.p : pages.length) - h.p;
      if (must.has(`${h.p}:${h.b}`) || (h.p - last.p >= SEG_PAGES && room >= 3)) out.push(h);
    });
    if (out.length < 2) for (let p = 12; p < pages.length; p += 12) out.push({ p, b: 0 });
    return out;
  })();
  const segOfBlock = (p, b) => segs.reduce((a, s, k) => (s.p < p || (s.p === p && s.b <= b) ? k : a), 0);
  const segOfPage = (i) => segOfBlock(i, 0);
  const segOfId = (id) => { const m = /^b-(\d+)-(\d+)$/.exec(id || ''); return m ? segOfBlock(Number(m[1]), Number(m[2])) : null; };
  const chapterHtml = (k, mark) => {
    const a = segs[k], e = segs[k + 1];
    return (k === 0 ? note() : '') + flowHtml(a.p, e ? e.p : pages.length, mark, a.b, e ? e.b : 0) + (e ? '' : '<p class="r-end">❖ ❖ ❖</p>');
  };
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let chap = -1, col = 0, ncols = 1, perView = 1, step = 1, padX = 22, chapHtml = '', ghostOk = false, turnAnim = null;
  function metrics(target = cols) {
    const w = sheet.clientWidth, h = sheet.clientHeight;
    perView = w >= 980 ? 2 : 1;
    padX = perView === 2 ? 44 : Math.max(18, Math.round(w * 0.06));
    const colW = (w - 2 * padX * perView) / perView;
    step = w / perView;
    Object.assign(target.style, { height: `${h}px`, width: `${w}px`, padding: `0 ${padX}px`, columnWidth: `${colW}px`, columnGap: `${2 * padX}px` });
    sheet.classList.toggle('spread', perView === 2);
  }
  const colOf = (node) => Math.max(0, Math.floor((node.offsetLeft - padX + 2) / step));
  const countCols = (box) => Math.max(1, Math.round(box.scrollWidth / step));
  function renderChapter(k, mark) {
    chap = k; chapHtml = chapterHtml(k, mark); cols.innerHTML = chapHtml; ghostOk = false; metrics(); ncols = countCols(cols);
  }
  const place = (box, c) => { box.style.transform = `translateX(${-c * step}px)`; };
  function setCol(c) {
    col = Math.max(0, Math.min(c - (c % perView), Math.max(0, ncols - 1)));
    place(cols, col);
    let at = segs[chap].p;                                // the printed page whose text is at the top of the view
    cols.querySelectorAll('.pm').forEach((a) => { if (colOf(a) <= col) at = Number(a.dataset.i); });
    current = at; updatePos(); saveProgress();
  }
  function bookShow(i, { id, mark } = {}) {
    const k = mark ? segOfBlock(mark.page, mark.block) : segOfId(id) ?? segOfPage(i);
    if (k !== chap || mark) renderChapter(k, mark);
    const target = mark ? cols.querySelector('mark') : cols.querySelector(`#${CSS.escape(id || `pm-${i}`)}`);
    setCol(target ? colOf(target) : 0);
  }
  const atEnd = () => col + perView >= ncols && chap >= segs.length - 1;
  const atStart = () => col === 0 && chap === 0;
  // move without animation (also used at the end of a swipe and for reduced motion)
  function turn(dir) {
    if (dir > 0) { if (col + perView >= ncols) { renderChapter(chap + 1); setCol(0); } else setCol(col + perView); }
    else if (col === 0) { renderChapter(chap - 1); setCol(ncols - 1); } else setCol(col - perView);
  }
  // Page-turn animation: a copy of the current view (the "leaf", laid out once per segment, not per turn) folds away over the
  // next view. A new turn finishes the running one at once, so fast taps and held arrow keys are never ignored.
  function flip(dir) {
    if (turnAnim) turnAnim.finish();
    if ((dir > 0 && atEnd()) || (dir < 0 && atStart())) return;
    if (reduceMotion) { turn(dir); return; }
    const w = sheet.clientWidth, half = perView === 2;
    if (!ghostOk) { ghost.innerHTML = chapHtml.replace(/ id="[^"]*"/g, ''); metrics(ghost); ghostOk = true; }
    leaf.className = `r-turn ${dir > 0 ? 'fwd' : 'back'}`;
    Object.assign(leaf.style, half ? { left: dir > 0 ? `${w / 2}px` : '0px', width: `${w / 2}px` } : { left: '0px', width: `${w}px` });
    ghost.style.transform = `translateX(${-col * step - (half && dir > 0 ? w / 2 : 0)}px)`;
    leaf.hidden = false;
    turn(dir);
    const opts = { duration: 430, easing: 'cubic-bezier(.3,.1,.3,1)' };
    turnAnim = leaf.animate([{ transform: 'perspective(2200px) rotateY(0deg)' }, { transform: `perspective(2200px) rotateY(${dir > 0 ? -180 : 180}deg)` }], opts);
    const sh = shade.animate([{ opacity: 0 }, { opacity: 0.5 }], opts);
    const done = () => { if (turnAnim === a) { leaf.hidden = true; turnAnim = null; sh.cancel(); } };
    const a = turnAnim; a.onfinish = a.oncancel = done;
  }

  // Page numbers for the whole book at the current layout: each segment is measured off-screen while the reader is idle
  // (never while a finger is on the page), and the result is remembered for this screen size and these settings.
  const layout = { total: 0, offset: [], tocPage: [] };
  const textSig = pages.reduce((n, p) => p.blocks.reduce((m, b) => m + b.x.length, n), 0);
  const layoutKey = `gab-layout-${book.id}`;
  const idle = window.requestIdleCallback ? (fn) => requestIdleCallback(fn, { timeout: 2000 }) : (fn) => setTimeout(() => fn({ timeRemaining: () => 8 }), 40);
  let measureRun = 0, lastInput = 0;
  function applyLayout(counts, tocCol) {
    layout.offset = counts.reduce((acc, c, i) => { acc.push(i ? acc[i - 1] + counts[i - 1] : 0); return acc; }, []);
    layout.total = counts.reduce((a, b) => a + b, 0);
    layout.tocPage = tocCol.map((x) => (x ? layout.offset[x[0]] + x[1] + 1 : 0));
    el.querySelectorAll('[data-tkp]').forEach((s) => { s.textContent = tocPageText(Number(s.dataset.tkp)); });
    if (panel === 'toc') renderToc();
    updatePos();
  }
  function measure() {
    const run = ++measureRun;
    (document.fonts ? document.fonts.ready : Promise.resolve()).then(() => {
      if (run !== measureRun) return;
      const sig = [sheet.clientWidth, sheet.clientHeight, prefs.size, prefs.spacing, prefs.font, prefs.width, prefs.justify, segs.length, textSig].join('|');
      const saved = local.get(layoutKey, null);
      if (saved && saved.sig === sig) { applyLayout(saved.counts, saved.tocCol); return; }
      const box = document.createElement('div'); box.className = 'r-cols r-text r-measure'; box.setAttribute('aria-hidden', 'true');
      sheet.appendChild(box); metrics(box);
      const counts = [], tocCol = [];
      let k = 0;
      const work = (deadline) => {
        if (run !== measureRun) { box.remove(); return; }
        if (Date.now() - lastInput < 700) { idle(work); return; }          // the reader is turning pages: wait
        do {
          box.innerHTML = chapterHtml(k);
          counts[k] = countCols(box);
          toc.forEach((t, n) => {
            if (t.absent) return;
            const kk = t.b >= 0 ? segOfBlock(t.page, t.b) : segOfPage(t.page);
            if (kk === k) { const node = box.querySelector(`#${CSS.escape(targetId(t))}`); tocCol[n] = [k, node ? colOf(node) : 0]; }
          });
          k++;
        } while (k < segs.length && deadline.timeRemaining() > 6);
        if (k < segs.length) { idle(work); return; }
        box.remove();
        try { local.set(layoutKey, { sig, counts, tocCol }); } catch { /* storage full: measure again next time */ }
        applyLayout(counts, tocCol);
      };
      idle(work);
    });
  }
  function tocPageText(n) { return prefs.mode === 'book' && layout.total && layout.tocPage[n] ? String(layout.tocPage[n]) : ''; }

  // ---------- gestures ----------
  // A finger drag moves the page with the finger; letting go past a fifth of the page (or with a quick flick) turns it,
  // otherwise it springs back. Drags work anywhere, also on the contents list. Taps on the edges turn pages with the fold
  // animation, a tap in the middle shows or hides the bars, and a tap on a contents entry opens it.
  // The page follows the finger through a paused animation whose time is moved, and slides home with a short animation:
  // both run on the compositor, which keeps a long text strip moving at full frame rate on a phone (setting style.transform
  // on every move made the browser re-layer the whole strip each frame).
  let drag = null, suppressClick = false, dragAnim = null, slideAnim = null;
  const DRAG_T = 1000;
  function slideFrom(off, ms) {                         // style.transform already holds the destination
    if (slideAnim) slideAnim.cancel();
    slideAnim = cols.animate([{ transform: `translateX(${off}px)` }, { transform: cols.style.transform }], { duration: ms, easing: 'cubic-bezier(.2,.75,.25,1)' });
    const a = slideAnim; a.onfinish = () => { if (slideAnim === a) slideAnim = null; };
  }
  bookEl.addEventListener('pointerdown', (e) => {
    if (!e.isPrimary || e.button > 0) return;
    lastInput = Date.now();
    if (turnAnim) turnAnim.finish();
    if (slideAnim) slideAnim.finish();
    drag = { x0: e.clientX, y0: e.clientY, dx: 0, active: false, touch: e.pointerType !== 'mouse', pts: [[e.clientX, e.timeStamp]], id: e.pointerId };
  });
  bookEl.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    lastInput = Date.now();
    const dx = e.clientX - drag.x0, dy = e.clientY - drag.y0;
    if (!drag.active) {
      if (drag.touch && Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy) * 1.1) {
        drag.active = true; el.classList.add('dragging');
        drag.R = step * 1.25; drag.base = -col * step;
        dragAnim = cols.animate([{ transform: `translateX(${drag.base - drag.R}px)` }, { transform: `translateX(${drag.base + drag.R}px)` }], { duration: DRAG_T, fill: 'both' });
        dragAnim.pause();
        try { bookEl.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
        getSelection().removeAllRanges();
      } else return;
    }
    drag.dx = dx;
    drag.pts.push([e.clientX, e.timeStamp]); if (drag.pts.length > 6) drag.pts.shift();
    const edge = (dx < 0 && col + perView >= ncols) || (dx > 0 && col === 0);   // the next page is in another segment
    drag.edge = edge;
    drag.off = edge ? dx * 0.3 : dx;
    dragAnim.currentTime = Math.max(0, Math.min(DRAG_T, ((drag.off + drag.R) / (2 * drag.R)) * DRAG_T));
  });
  const endDrag = (e, cancelled) => {
    const d = drag; drag = null;
    if (!d || !d.active) return d;
    el.classList.remove('dragging'); suppressClick = true; setTimeout(() => { suppressClick = false; }, 0);
    const off = d.base + (d.off || 0);
    if (dragAnim) { dragAnim.cancel(); dragAnim = null; }
    const [x1, t1] = d.pts[0], [x2, t2] = d.pts[d.pts.length - 1];
    const v = (x2 - x1) / Math.max(1, t2 - t1);                         // px per ms over the last few moves
    const dir = d.dx < 0 ? 1 : -1;
    const go = !cancelled && (Math.abs(d.dx) > step * 0.2 || (Math.abs(v) > 0.35 && Math.sign(v) === Math.sign(d.dx)));
    if (!go || (dir > 0 && atEnd()) || (dir < 0 && atStart())) { slideFrom(off, 220); return null; }
    if (d.edge) { flip(dir); return null; }                               // next segment: render it and fold over
    const left = step - Math.abs(d.off || 0);
    setCol(col + dir * perView);
    slideFrom(off, Math.round(Math.max(140, Math.min(320, left / Math.max(0.6, Math.abs(v))))));
    return null;
  };
  bookEl.addEventListener('pointerup', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    lastInput = Date.now();
    const d = endDrag(e, false);
    if (!d) return;                                                      // it was a drag
    if (e.target.closest('button, a') || String(getSelection()).length) return;
    if (Math.abs(e.clientX - d.x0) > 10 || Math.abs(e.clientY - d.y0) > 10) return;
    const r = bookEl.getBoundingClientRect(), x = (e.clientX - r.left) / r.width;
    if (x > 0.7) flip(1); else if (x < 0.3) flip(-1); else el.classList.toggle('immersive');
  });
  bookEl.addEventListener('pointercancel', (e) => { if (drag && e.pointerId === drag.id) endDrag(e, true); });
  bookEl.addEventListener('click', (e) => { if (suppressClick) { e.stopPropagation(); e.preventDefault(); } }, true);
  // one page per wheel or trackpad gesture (a gesture ends after a short pause), not one per wheel event
  let wheelBusy = false, wheelT;
  bookEl.addEventListener('wheel', (e) => {
    e.preventDefault(); lastInput = Date.now();
    clearTimeout(wheelT); wheelT = setTimeout(() => { wheelBusy = false; }, 180);
    if (wheelBusy) return;
    const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    if (Math.abs(d) > 12) { wheelBusy = true; flip(d > 0 ? 1 : -1); }
  }, { passive: false });
  let resizeT;
  const onResize = () => { clearTimeout(resizeT); resizeT = setTimeout(() => relayout(current), 150); };
  window.addEventListener('resize', onResize);

  range.addEventListener('input', () => {
    const i = Number(range.value);
    pos.textContent = prefs.mode === 'book' && layout.total ? `${tr('page')} ~${Math.max(1, Math.round(((i + 1) / pages.length) * layout.total))} / ${layout.total}` : `${pct(i)}%`;
  });
  range.addEventListener('change', () => goTo(Number(range.value)));

  // ---------- panels ----------
  function openPanel(kind, arg) {
    panel = kind; panelEl.hidden = false; scrim.hidden = false; el.classList.remove('immersive');
    panelEl.className = `r-panel r-panel-${kind}`;
    if (kind === 'toc') renderToc();
    else if (kind === 'search') renderSearch();
    else if (kind === 'settings') renderSettings();
    else if (kind === 'original') renderOriginal(arg, false);
  }
  function closePanel() { panel = null; panelEl.hidden = true; scrim.hidden = true; panelEl.innerHTML = ''; }
  const panelHead = (title) => `<div class="rp-head"><h3>${esc(title)}</h3><button class="r-icon" data-act="close" aria-label="${esc(tr('close'))}">✕</button></div>`;

  function renderToc() {
    const bms = local.get(bmKey, []);
    const activeIdx = toc.reduce((a, t, k) => (t.page <= current ? k : a), 0);
    panelEl.innerHTML = `${panelHead(tr('contents'))}
      <ol class="rp-toc">${toc.map((t, k) => t.absent
        ? `<li class="lvl${t.level} absent"><button disabled><span>${esc(t.title)}</span><small>${esc(tr('absent'))}</small></button></li>`
        : `<li class="lvl${t.level} ${k === activeIdx ? 'on' : ''}"><button data-tk="${k}"><span>${esc(t.title)}</span><small>${esc(tocPageText(k))}</small></button></li>`).join('')}</ol>
      <h4 class="rp-sub">${esc(tr('bookmarks'))}</h4>
      ${bms.length ? `<ol class="rp-toc">${bms.map((b) => `<li><button data-go="${b.page}"><span>★ ${esc(snippet(b.page))}</span></button></li>`).join('')}</ol>` : `<p class="rp-empty">${esc(tr('noBookmarks'))}</p>`}`;
    panelEl.querySelector('.on')?.scrollIntoView({ block: 'center' });
  }
  const snippet = (i) => (pages[i].blocks.find((b) => b.t === 'p')?.x || pages[i].blocks[0]?.x || '').slice(0, 60) + '…';

  function renderSearch() {
    panelEl.innerHTML = `${panelHead(tr('search'))}
      <form class="rp-search"><input name="q" type="search" value="${esc(searchState.q)}" placeholder="ዮሐንስ, Yohannes…" autocomplete="off"></form>
      <div class="rp-results"></div>`;
    const input = panelEl.querySelector('input');
    let t; input.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => runSearch(input.value), 200); });
    panelEl.querySelector('form').addEventListener('submit', (e) => { e.preventDefault(); runSearch(input.value); });
    input.focus();
    if (searchState.q) showResults();
  }
  function runSearch(q) {
    searchState = { q: q.trim(), results: [] };
    if (searchState.q.length < 2) return showResults();
    const results = [], eth = isEthiopic(q), fq = foldEthiopic(q.toLowerCase().trim()), qwords = analyze(q);
    pages.forEach((p, i) => p.blocks.forEach((b, k) => {
      if (results.length >= 300 || b.t === 'toc') return;
      if (eth) {
        const ft = foldEthiopic(b.x.toLowerCase()); let at = ft.indexOf(fq);
        while (at >= 0 && results.length < 300) { results.push({ page: i, block: k, text: b.x, at, len: fq.length }); at = ft.indexOf(fq, at + fq.length); }
      } else {
        const ws = analyze(b.x);
        if (qwords.every((qw) => ws.some((w) => matchWord(qw, w) >= 2))) {
          const hit = ws.find((w) => matchWord(qwords[0], w) >= 2);
          const at = hit ? foldEthiopic(b.x.toLowerCase()).indexOf(hit.text) : 0;
          results.push({ page: i, block: k, text: b.x, at: Math.max(0, at), len: hit ? hit.text.length : 0 });
        }
      }
    }));
    searchState.results = results; showResults();
  }
  function showResults() {
    const box = panelEl.querySelector('.rp-results'); if (!box) return;
    const r = searchState.results;
    if (!searchState.q) { box.innerHTML = ''; return; }
    box.innerHTML = `<p class="rp-count">${r.length ? esc(tr('results', { n: r.length >= 300 ? '300+' : r.length })) : esc(tr('noResults'))}</p>
      <ol class="rp-hits">${r.map((h, k) => {
        const s = Math.max(0, h.at - 40), e = Math.min(h.text.length, h.at + h.len + 60);
        const where = toc.filter((t) => t.page <= h.page && t.level === 1).pop()?.title || '';
        return `<li><button data-hit="${k}"><small>${esc(where)}</small><span>${s ? '…' : ''}${esc(h.text.slice(s, h.at))}<mark>${esc(h.text.slice(h.at, h.at + h.len))}</mark>${esc(h.text.slice(h.at + h.len, e))}${e < h.text.length ? '…' : ''}</span></button></li>`;
      }).join('')}</ol>`;
  }
  function showHit(h) {
    closePanel();
    const mark = { page: h.page, block: h.block, at: h.at, len: h.len };
    current = h.page;
    if (prefs.mode === 'book') { bookShow(h.page, { mark }); return; }
    renderScroll(mark);
    jumping = Date.now(); article.querySelector('mark')?.scrollIntoView({ block: 'center' });
    updatePos(); saveProgress();
  }

  function renderSettings() {
    const opt = (key, values, label) => `<div class="rp-row"><span>${esc(tr(label))}</span><div class="seg">${values.map(([v, txt]) =>
      `<button data-pref="${key}" data-val="${v}" class="${String(prefs[key]) === String(v) ? 'on' : ''}">${txt}</button>`).join('')}</div></div>`;
    panelEl.innerHTML = `${panelHead(tr('settings'))}
      ${opt('mode', [['book', '📖 ' + esc(tr('book'))], ['scroll', '↕ ' + esc(tr('scroll'))]], 'mode')}
      <div class="rp-row"><span>${esc(tr('size'))}</span><div class="seg"><button data-step="size" data-d="-1">A−</button><b>${SIZES[prefs.size]}</b><button data-step="size" data-d="1">A+</button></div></div>
      ${opt('spacing', SPACING.map((v, k) => [k, `${v}`]), 'spacing')}
      ${opt('font', Object.entries(FONTS).map(([k, v]) => [k, `<span style="font-family:${v[0]}">ሀ ${esc(v[lang === 'am' ? 2 : 1])}</span>`]), 'font')}
      ${opt('theme', THEMES.map((v) => [v, esc(tr(v))]), 'theme')}
      ${opt('width', ['narrow', 'normal', 'wide'].map((v) => [v, esc(tr(v))]), 'width')}
      ${opt('justify', [[false, '☰'], [true, '≡']], 'justify')}
      ${pdf ? `<div class="rp-row"><button class="btn wide" data-act="pdf">⤓ ${esc(tr('pdf'))}</button></div>` : ''}
      <div class="rp-row"><button class="btn wide" data-act="offline">${esc(offline.has() ? '✓ ' + tr('offline') + ' · ' + tr('removeOffline') : '⤓ ' + tr('download'))}</button></div>
      <p class="rp-preview" style="font-family:var(--r-font)">${esc((pages.find((p) => p.blocks.some((b) => b.t === 'p'))?.blocks.find((b) => b.t === 'p')?.x || '').slice(0, 140))}…</p>`;
  }

  function renderOriginal(i, full) {
    const src = pages[i].src;
    panelEl.className = 'r-panel r-panel-original';
    panelEl.innerHTML = `${panelHead(`${tr('original')} · ${tr('printed')} ${printedLabel(i)}`)}
      <div class="rp-scan ${full || src.half === 'F' ? '' : 'half-' + src.half}"><div class="spinner"></div></div>
      <div class="rp-row">${i > 0 ? `<button class="btn" data-orig-go="${i - 1}">‹</button>` : ''}
        ${src.half !== 'F' ? `<button class="btn" data-orig-full="${i}" data-full="${full ? 0 : 1}">${esc(full ? tr('original') : tr('fullSpread'))}</button>` : ''}
        <button class="btn" data-open-scan="${i}">↗ ${esc(tr('openImage'))}</button>
        ${i < pages.length - 1 ? `<button class="btn" data-orig-go="${i + 1}">›</button>` : ''}</div>`;
    scanUrl(src.file, src.page).then((url) => {
      const box = panelEl.querySelector('.rp-scan'); if (box) box.innerHTML = `<img src="${url}" alt="">`;
    }).catch(() => { const box = panelEl.querySelector('.rp-scan'); if (box) box.innerHTML = '<p class="rp-empty">—</p>'; });
  }

  // ---------- full screen ----------
  const fsEl = () => document.fullscreenElement || document.webkitFullscreenElement;
  const canFs = !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);
  const standaloneApp = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  function toggleFullscreen() {
    if (!canFs) {                                     // iPhone: the API doesn't exist; the home-screen app has no browser bars
      if (standaloneApp) { el.classList.toggle('immersive'); return; }
      panel = 'fs'; panelEl.hidden = false; scrim.hidden = false; panelEl.className = 'r-panel r-panel-fs';
      panelEl.innerHTML = `${panelHead(tr('fullscreen'))}<p class="rp-empty">📲 ${esc(tr('fsIos'))}</p>`; return;
    }
    if (fsEl()) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    else {
      const req = document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen;
      Promise.resolve(req.call(document.documentElement, { navigationUI: 'hide' })).then(() => el.classList.add('immersive')).catch(() => {});
    }
  }
  const onFsChange = () => {
    el.classList.toggle('fullscreen', !!fsEl());
    el.querySelector('.r-fs').textContent = fsEl() ? '🗗' : '⛶';
    if (!fsEl()) el.classList.remove('immersive');
    onResize();                                       // the page area changed size: re-flow and re-number the pages
  };
  document.addEventListener('fullscreenchange', onFsChange); document.addEventListener('webkitfullscreenchange', onFsChange);

  // ---------- events ----------
  el.addEventListener('click', async (e) => {
    const b = e.target.closest('button'); if (!b) return;
    const act = b.dataset.act;
    if (act === 'exit') { cleanup(); onExit(); }
    else if (act === 'close') closePanel();
    else if (act === 'toc' || act === 'search' || act === 'settings') panel === act ? closePanel() : openPanel(act);
    else if (act === 'orig') panel === 'original' ? closePanel() : openPanel('original', current);
    else if (act === 'fs') toggleFullscreen();
    else if (act === 'bookmark') {
      let bms = local.get(bmKey, []);
      bms = bms.some((x) => x.page === current) ? bms.filter((x) => x.page !== current) : [...bms, { page: current, ts: Date.now() }].sort((a, c) => a.page - c.page);
      local.set(bmKey, bms); updatePos();
    } else if (act === 'pdf') {
      const a = document.createElement('a'); a.href = await pdf();
      a.download = `${(book.titleEn || `Book ${book.id}`).replace(/[^\w .,'()-]+/g, '').trim() || `Book ${book.id}`}.pdf`; a.click();
    } else if (act === 'offline') {
      b.disabled = true; b.textContent = tr('downloading');
      await (offline.has() ? offline.remove() : offline.save()); renderSettings();
    } else if (b.dataset.tk !== undefined) { const t = toc[Number(b.dataset.tk)]; closePanel(); goTo(t.page, targetId(t)); }
    else if (b.dataset.go !== undefined) { closePanel(); goTo(Number(b.dataset.go)); }
    else if (b.dataset.hit !== undefined) showHit(searchState.results[Number(b.dataset.hit)]);
    else if (b.dataset.origGo !== undefined) renderOriginal(Number(b.dataset.origGo), false);
    else if (b.dataset.origFull !== undefined) renderOriginal(Number(b.dataset.origFull), b.dataset.full === '1');
    else if (b.dataset.openScan !== undefined) { const s = pages[Number(b.dataset.openScan)].src; window.open(await scanUrl(s.file, s.page), '_blank'); }
    else if (b.dataset.step) { prefs[b.dataset.step] = Math.max(0, Math.min(SIZES.length - 1, prefs[b.dataset.step] + Number(b.dataset.d))); applyPrefs(); relayout(current); renderSettings(); }
    else if (b.dataset.pref) {
      const v = b.dataset.val; prefs[b.dataset.pref] = v === 'true' ? true : v === 'false' ? false : /^\d+$/.test(v) ? Number(v) : v;
      const keep = current; applyPrefs(); relayout(keep); renderSettings();
    }
  });
  function relayout(keep = current) {
    if (turnAnim) turnAnim.finish();
    layout.total = 0; chap = -1;
    requestAnimationFrame(() => {
      if (prefs.mode === 'book') { article.innerHTML = ''; anchors = []; bookShow(keep); measure(); }
      else { cols.innerHTML = ''; renderScroll(); goTo(keep); }
    });
  }
  scrim.addEventListener('click', closePanel);
  const onKey = (e) => {
    if (e.target.closest('input')) { if (e.key === 'Escape') closePanel(); return; }
    if (e.key === 'Escape') { if (fsEl()) return; panel ? closePanel() : (cleanup(), onExit()); }
    else if (e.key === 'f' || e.key === 'F') toggleFullscreen();
    else if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') { e.preventDefault(); lastInput = Date.now(); prefs.mode === 'book' ? flip(1) : body.scrollBy({ top: body.clientHeight * 0.9 }); }
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); lastInput = Date.now(); prefs.mode === 'book' ? flip(-1) : body.scrollBy({ top: -body.clientHeight * 0.9 }); }
  };
  document.addEventListener('keydown', onKey);
  function cleanup() {
    if (fsEl()) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    document.removeEventListener('fullscreenchange', onFsChange); document.removeEventListener('webkitfullscreenchange', onFsChange);
    measureRun++; document.removeEventListener('keydown', onKey); window.removeEventListener('resize', onResize); document.querySelector('meta[name="theme-color"]')?.setAttribute('content', '#1f4d3a'); }

  applyPrefs();
  updatePos();
  relayout(current);
  return { cleanup };
}
