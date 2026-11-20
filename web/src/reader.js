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
  const TABLE_ROW = / \| /;
  function flowHtml(a, b, mark) {
    let html = '', openP = false, openT = false, notes = '';   // footnotes wait until the paragraph they interrupt has ended
    const closeP = () => { if (openP) { html += '</p>'; openP = false; } if (openT) { html += '</tbody></table></div>'; openT = false; }
      if (notes) { html += `<aside class="r-fn">${notes}</aside>`; notes = ''; } };
    for (let i = a; i < b; i++) {
      const anchor = `<span class="pm" id="pm-${i}" data-i="${i}"></span>`;
      const bl = pages[i].blocks;
      if (!bl.length) { html += anchor; continue; }
      bl.forEach((blk, k) => {
        const id = `b-${i}-${k}`, m = k === 0 ? anchor : '';
        const x = markText(blk.x, mark && mark.page === i && mark.block === k ? mark : null);
        if (blk.t === 'fn') { const n = `<p id="${id}">${m}${x}</p>`; if (openP) notes += n; else html += `<aside class="r-fn">${n}</aside>`; return; }
        if (blk.t === 'p' && blk.cont && k === 0 && openP) { html += ` ${m}<span id="${id}">${x}</span>`; return; }  // paragraph runs on across the printed page break
        if (blk.t === 'p' && TABLE_ROW.test(blk.x)) {                 // "a | b | c" rows (rebuilt tables) become a real table
          if (openP) closeP();
          if (!openT) { html += '<div class="r-tablewrap"><table class="r-table"><tbody>'; openT = true; }
          html += `<tr id="${id}">${x.split(' | ').map((c, n) => `<td>${n ? '' : m}${c}</td>`).join('')}</tr>`; return;
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
    <div class="r-book" hidden><div class="r-sheet"><div class="r-cols r-text"></div></div><p class="r-hint">${esc(tr('tapHint'))}</p></div>
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
  const bookEl = el.querySelector('.r-book'), sheet = el.querySelector('.r-sheet'), cols = el.querySelector('.r-cols');
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

  // ---------- book mode: chapters set in columns; one column = one page (two per view on wide screens) ----------
  const chapterStarts = [...new Set([0, ...toc.filter((t) => t.level === 1 && !t.absent).map((t) => t.page)])].sort((a, b) => a - b);
  if (chapterStarts.length < 2) for (let k = 12; k < pages.length; k += 12) chapterStarts.push(k);
  const chapterOf = (i) => chapterStarts.reduce((a, s, k) => (s <= i ? k : a), 0);
  const chapterHtml = (k, mark) => {
    const a = chapterStarts[k], b = chapterStarts[k + 1] ?? pages.length;
    return (k === 0 ? note() : '') + flowHtml(a, b, mark) + (b === pages.length ? '<p class="r-end">❖ ❖ ❖</p>' : '');
  };
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let chap = -1, col = 0, ncols = 1, perView = 1, step = 1, padX = 22, flipping = false;
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
    chap = k; cols.innerHTML = chapterHtml(k, mark); metrics(); ncols = countCols(cols);
  }
  function setCol(c) {
    col = Math.max(0, Math.min(c - (c % perView), Math.max(0, ncols - 1)));
    cols.style.transform = `translateX(${-col * step}px)`;
    let at = chapterStarts[chap];                         // the printed page whose text is at the top of the view
    cols.querySelectorAll('.pm').forEach((a) => { if (colOf(a) <= col) at = Number(a.dataset.i); });
    current = at; updatePos(); saveProgress();
  }
  function bookShow(i, { id, mark } = {}) {
    const k = chapterOf(i);
    if (k !== chap || mark) renderChapter(k, mark);
    const target = mark ? cols.querySelector('mark') : cols.querySelector(`#${CSS.escape(id || `pm-${i}`)}`);
    setCol(target ? colOf(target) : 0);
  }
  function flip(dir) {
    if (flipping) return;
    const lastView = col + perView >= ncols, firstView = col === 0;
    if (dir > 0 && lastView && chap >= chapterStarts.length - 1) return;
    if (dir < 0 && firstView && chap === 0) return;
    const snap = cols.cloneNode(true), w = sheet.clientWidth, half = perView === 2;
    snap.querySelectorAll('[id]').forEach((n) => n.removeAttribute('id'));
    const turn = document.createElement('div');
    turn.className = `r-turn ${dir > 0 ? 'fwd' : 'back'}`;
    Object.assign(turn.style, half ? { left: dir > 0 ? `${w / 2}px` : '0px', width: `${w / 2}px` } : { left: '0px', width: `${w}px` });
    snap.style.transform = `translateX(${-col * step - (half && dir > 0 ? w / 2 : 0)}px)`;
    turn.appendChild(snap); turn.insertAdjacentHTML('beforeend', '<i class="r-shade"></i>');
    if (dir > 0) { if (lastView) { renderChapter(chap + 1); setCol(0); } else setCol(col + perView); }
    else if (firstView) { renderChapter(chap - 1); setCol(ncols - 1); } else setCol(col - perView);
    if (reduceMotion) return;
    flipping = true; sheet.appendChild(turn);
    const anim = turn.animate([{ transform: 'rotateY(0deg)' }, { transform: `rotateY(${dir > 0 ? -180 : 180}deg)` }], { duration: 620, easing: 'cubic-bezier(.45,.05,.35,1)' });
    turn.querySelector('.r-shade').animate([{ opacity: 0 }, { opacity: 0.55 }], { duration: 620, easing: 'ease-in' });
    anim.onfinish = anim.oncancel = () => { turn.remove(); flipping = false; };
  }

  // Page numbers for the whole book at the current layout: measure each chapter off-screen, a few per frame.
  const layout = { total: 0, offset: [], tocPage: [] };
  let measureRun = 0;
  function measure() {
    const run = ++measureRun;
    const box = document.createElement('div'); box.className = 'r-cols r-text r-measure'; box.setAttribute('aria-hidden', 'true');
    sheet.appendChild(box); metrics(box);
    const counts = [], tocCol = [];
    let k = 0;
    const work = () => {
      if (run !== measureRun) { box.remove(); return; }
      const until = performance.now() + 12;
      while (k < chapterStarts.length && performance.now() < until) {
        box.innerHTML = chapterHtml(k);
        counts[k] = countCols(box);
        toc.forEach((t, n) => { if (chapterOf(t.page) === k) { const node = box.querySelector(`#${CSS.escape(targetId(t))}`); tocCol[n] = [k, node ? colOf(node) : 0]; } });
        k++;
      }
      if (k < chapterStarts.length) { requestAnimationFrame(work); return; }
      box.remove();
      layout.offset = counts.reduce((acc, c, i) => { acc.push(i ? acc[i - 1] + counts[i - 1] : 0); return acc; }, []);
      layout.total = counts.reduce((a, b) => a + b, 0);
      layout.tocPage = tocCol.map(([kk, c]) => layout.offset[kk] + c + 1);
      el.querySelectorAll('[data-tkp]').forEach((s) => { s.textContent = tocPageText(Number(s.dataset.tkp)); });
      if (panel === 'toc') renderToc();
      updatePos();
    };
    requestAnimationFrame(work);
  }
  function tocPageText(n) { return prefs.mode === 'book' && layout.total && layout.tocPage[n] ? String(layout.tocPage[n]) : ''; }

  // taps on the edges and swipes turn pages; a tap in the middle shows or hides the bars
  let down = null;
  bookEl.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY }; });
  bookEl.addEventListener('pointerup', (e) => {
    if (!down || e.target.closest('button, a')) { down = null; return; }
    const dx = e.clientX - down.x, dy = e.clientY - down.y; const r = bookEl.getBoundingClientRect(); down = null;
    if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy)) { flip(dx < 0 ? 1 : -1); return; }
    if (Math.abs(dx) > 10 || Math.abs(dy) > 10 || String(getSelection()).length) return;
    const x = (e.clientX - r.left) / r.width;
    if (x > 0.68) flip(1); else if (x < 0.32) flip(-1); else el.classList.toggle('immersive');
  });
  bookEl.addEventListener('wheel', (e) => { if (Math.abs(e.deltaX) > 30 || Math.abs(e.deltaY) > 40) { e.preventDefault(); flip((e.deltaX || e.deltaY) > 0 ? 1 : -1); } }, { passive: false });
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
    else if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') prefs.mode === 'book' ? flip(1) : body.scrollBy({ top: body.clientHeight * 0.9 });
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp') prefs.mode === 'book' ? flip(-1) : body.scrollBy({ top: -body.clientHeight * 0.9 });
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
