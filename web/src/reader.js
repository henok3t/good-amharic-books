// Full-screen reader for books that have been converted to text.
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

const L = {
  en: { contents: 'Contents', bookmarks: 'Bookmarks', search: 'Search in this book', settings: 'Reading settings', page: 'Page',
    original: 'Original page', noBookmarks: 'No bookmarks yet. Tap ☆ to bookmark the page you are on.', results: '{n} results',
    noResults: 'No matches.', size: 'Text size', spacing: 'Line spacing', font: 'Font', theme: 'Theme', width: 'Width', justify: 'Justify text',
    light: 'Light', sepia: 'Sepia', dark: 'Dark', narrow: 'Narrow', normal: 'Normal', wide: 'Wide', back: 'Back',
    offline: 'Available offline', download: 'Download for offline reading', downloading: 'Saving…', removeOffline: 'Remove offline copy',
    ocrNote: 'Converted from a scanned book by OCR. Some words may be misread — tap a page number to compare with the original.',
    pdf: 'Download as PDF (text edition)', fullSpread: 'Show both pages', mode: 'Layout', book: 'Book (turn pages)', scroll: 'Scroll',
    tapHint: 'Tap the edges or swipe to turn the page', openImage: 'Open image', close: 'Close', of: 'of' },
  am: { contents: 'ማውጫ', bookmarks: 'ምልክቶች', search: 'በዚህ መጽሐፍ ውስጥ ፈልግ', settings: 'የንባብ ቅንብሮች', page: 'ገጽ',
    original: 'ዋናው ገጽ', noBookmarks: 'እስካሁን ምልክት የለም። ያሉበትን ገጽ ለማስቀመጥ ☆ን ይንኩ።', results: '{n} ውጤቶች',
    noResults: 'ምንም አልተገኘም።', size: 'የፊደል መጠን', spacing: 'የመስመር ክፍተት', font: 'ፊደል', theme: 'ገጽታ', width: 'ስፋት', justify: 'ጽሑፉን አስተካክል',
    light: 'ብሩህ', sepia: 'ሴፒያ', dark: 'ጨለማ', narrow: 'ጠባብ', normal: 'መደበኛ', wide: 'ሰፊ', back: 'ተመለስ',
    offline: 'ያለ ኢንተርኔት ይገኛል', download: 'ያለ ኢንተርኔት ለማንበብ አውርድ', downloading: 'በማስቀመጥ ላይ…', removeOffline: 'የተቀመጠውን ቅጂ አጥፋ',
    ocrNote: 'ከተቃኘ መጽሐፍ በOCR የተቀየረ ነው። አንዳንድ ቃላት በስህተት ሊነበቡ ይችላሉ — ከዋናው ጋር ለማነጻጸር የገጽ ቁጥሩን ይንኩ።',
    pdf: 'እንደ PDF አውርድ (የጽሑፍ እትም)', fullSpread: 'ሁለቱንም ገጾች አሳይ', mode: 'አቀማመጥ', book: 'መጽሐፍ (ገጽ መግለጥ)', scroll: 'ማሸብለል',
    tapHint: 'ገጽ ለመግለጥ ጠርዙን ይንኩ ወይም ያንሸራትቱ', openImage: 'ምስሉን ክፈት', close: 'ዝጋ', of: 'ከ' },
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
  const pageLabel = (i) => pages[i].n || roman(i + 1);
  const pct = (i) => Math.round(((i + 1) / pages.length) * 100);

  function blockHtml(b, marks) {
    let x = esc(b.x);
    if (marks) x = highlight(x, marks);
    if (b.t === 'h1') return `<h2 class="r-h1">${x}</h2>`;
    if (b.t === 'h2') return `<h3 class="r-h2">${x}</h3>`;
    if (b.t === 'pre') return `<pre class="r-pre">${x}</pre>`;
    if (b.t === 'toc') return `<nav class="r-tocblock"><ol>${text.toc.map((t) => `<li class="lvl${t.level}"><button data-go="${t.page}"><span>${esc(t.title)}</span><small>${esc(pageLabel(t.page))}</small></button></li>`).join('')}</ol></nav>`;
    if (b.t === 'c') return `<p class="r-c">${x}</p>`;
    const li = !b.cont && /^([—–•-]\s|([ሀ-ፐ]|\d{1,2}(ኛ)?)[./)]\s?)/.test(b.x);
    return `<p class="${b.cont ? 'cont' : ''}${li ? ' li' : ''}">${x}</p>`;
  }
  const pageHtml = (p, i, marks) => `<section class="r-page" data-i="${i}" id="rp-${i}">
      <button class="r-pno" data-orig="${i}" title="${esc(tr('original'))}"><span>${esc(pageLabel(i))}</span></button>
      ${p.blocks.map((b) => blockHtml(b, marks)).join('')}</section>`;

  root.innerHTML = `<div class="reader" data-theme="${prefs.theme}">
    <header class="r-top">
      <button class="r-icon" data-act="exit" aria-label="${esc(tr('back'))}">←</button>
      <div class="r-title"><b>${esc(book.titleAm || text.titleAm)}</b><small>${esc(book.author || '')}</small></div>
      <button class="r-icon" data-act="toc" aria-label="${esc(tr('contents'))}">☰</button>
      <button class="r-icon" data-act="search" aria-label="${esc(tr('search'))}">⌕</button>
      <button class="r-icon" data-act="bookmark" aria-label="${esc(tr('bookmarks'))}">☆</button>
      <button class="r-icon" data-act="settings" aria-label="${esc(tr('settings'))}">Aa</button>
    </header>
    <main class="r-body" tabindex="-1"><article class="r-text">
      <p class="r-note">ⓘ ${esc(tr('ocrNote'))}</p>
      ${pages.map((p, i) => pageHtml(p, i)).join('')}
    </article></main>
    <div class="r-book" hidden><div class="r-sheet"><div class="r-cols r-text"></div></div><p class="r-hint">${esc(tr('tapHint'))}</p></div>
    <footer class="r-bottom">
      <input type="range" min="0" max="${pages.length - 1}" value="${current}" aria-label="${esc(tr('page'))}">
      <span class="r-pos"></span>
    </footer>
    <div class="r-scrim" hidden></div>
    <aside class="r-panel" hidden></aside>
  </div>`;

  const el = root.querySelector('.reader'), body = el.querySelector('.r-body'), range = el.querySelector('input[type=range]');
  const pos = el.querySelector('.r-pos'), panelEl = el.querySelector('.r-panel'), scrim = el.querySelector('.r-scrim');
  const bookEl = el.querySelector('.r-book'), sheet = el.querySelector('.r-sheet'), cols = el.querySelector('.r-cols');

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

  function updatePos() {
    range.value = current;
    pos.textContent = `${tr('page')} ${pageLabel(current)} · ${pct(current)}%`;
    const bms = local.get(bmKey, []);
    el.querySelector('[data-act="bookmark"]').textContent = bms.some((b) => b.page === current) ? '★' : '☆';
  }
  function saveProgress() {
    local.set(progKey, { page: current, total: pages.length, label: pageLabel(current), pct: pct(current), ts: Date.now() });
    const recent = local.get('gab-recent', []).filter((id) => id !== book.id);
    local.set('gab-recent', [book.id, ...recent].slice(0, 20));
  }
  let jumping = 0;
  function goTo(i, smooth = false) {
    current = Math.max(0, Math.min(pages.length - 1, i));
    if (prefs.mode === 'book') { bookShowPage(current); updatePos(); saveProgress(); return; }
    jumping = Date.now(); el.classList.remove('immersive');
    document.getElementById(`rp-${current}`)?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' });
    updatePos(); saveProgress();
  }

  // ---------- book mode: chapters set in columns, one column per page (two on wide screens) ----------
  const chapterStarts = [...new Set([0, ...text.toc.filter((t) => t.level === 1).map((t) => t.page)])].sort((a, b) => a - b);
  if (chapterStarts.length < 2) for (let k = 12; k < pages.length; k += 12) chapterStarts.push(k);
  const chapterOf = (i) => chapterStarts.reduce((a, s, k) => (s <= i ? k : a), 0);
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let chap = -1, col = 0, ncols = 1, perView = 1, step = 1, padX = 22, flipping = false;
  function metrics() {
    const w = sheet.clientWidth, h = sheet.clientHeight;
    perView = w >= 980 ? 2 : 1;
    padX = perView === 2 ? 44 : Math.max(18, Math.round(w * 0.06));
    const colW = (w - 2 * padX * perView) / perView;
    step = w / perView;
    Object.assign(cols.style, { height: `${h}px`, width: `${w}px`, padding: `0 ${padX}px`, columnWidth: `${colW}px`, columnGap: `${2 * padX}px` });
    sheet.classList.toggle('spread', perView === 2);
  }
  function renderChapter(k, marks) {
    chap = k;
    const a = chapterStarts[k], b = chapterStarts[k + 1] ?? pages.length;
    cols.innerHTML = (k === 0 ? `<p class="r-note">ⓘ ${esc(tr('ocrNote'))}</p>` : '')
      + pages.slice(a, b).map((p, j) => pageHtml(p, a + j, marks && marks.page === a + j ? marks.word : null)).join('')
      + (b === pages.length ? '<p class="r-end">❖ ❖ ❖</p>' : '');
    metrics();
    ncols = Math.max(1, Math.round((cols.scrollWidth - 2 * padX + 2 * padX) / step));
  }
  const colOf = (node) => Math.max(0, Math.floor((node.offsetLeft - padX + 2) / step));
  function setCol(c) {
    col = Math.max(0, Math.min(c - (c % perView), Math.max(0, ncols - 1)));
    cols.style.transform = `translateX(${-col * step}px)`;
    // the source page whose text is showing at the top of the view
    let at = chapterStarts[chap];
    cols.querySelectorAll('.r-page').forEach((sec) => { if (colOf(sec) <= col) at = Number(sec.dataset.i); });
    current = at; updatePos(); saveProgress();
  }
  function bookShowPage(i, marks) {
    const k = chapterOf(i);
    if (k !== chap || marks) renderChapter(k, marks);
    const target = marks ? cols.querySelector('mark') : document.getElementById(`rp-${i}`);
    setCol(target ? colOf(target) : 0);
  }
  function flip(dir) {
    if (flipping) return;
    const lastView = col + perView >= ncols, firstView = col === 0;
    if (dir > 0 && lastView && chap >= chapterStarts.length - 1) return;
    if (dir < 0 && firstView && chap === 0) return;
    const snap = cols.cloneNode(true);
    const w = sheet.clientWidth;
    const turn = document.createElement('div');
    const half = perView === 2;
    turn.className = `r-turn ${dir > 0 ? 'fwd' : 'back'}`;
    Object.assign(turn.style, half ? { left: dir > 0 ? `${w / 2}px` : '0px', width: `${w / 2}px` } : { left: '0px', width: `${w}px` });
    snap.style.transform = `translateX(${-col * step - (half && dir > 0 ? w / 2 : 0)}px)`;
    turn.appendChild(snap); turn.insertAdjacentHTML('beforeend', '<i class="r-shade"></i>');
    // move the real pages underneath
    if (dir > 0) { if (lastView) { renderChapter(chap + 1); setCol(0); } else setCol(col + perView); }
    else if (firstView) { renderChapter(chap - 1); setCol(ncols - 1); } else setCol(col - perView);
    if (reduceMotion) return;
    flipping = true; sheet.appendChild(turn);
    const anim = turn.animate([{ transform: 'rotateY(0deg)' }, { transform: `rotateY(${dir > 0 ? -180 : 180}deg)` }],
      { duration: 620, easing: 'cubic-bezier(.45,.05,.35,1)' });
    turn.querySelector('.r-shade').animate([{ opacity: 0 }, { opacity: 0.55 }], { duration: 620, easing: 'ease-in' });
    anim.onfinish = anim.oncancel = () => { turn.remove(); flipping = false; };
  }
  // taps on the edges and swipes turn pages; a tap in the middle shows or hides the bars
  let down = null;
  bookEl.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, t: Date.now() }; });
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
  const onResize = () => { clearTimeout(resizeT); resizeT = setTimeout(() => { if (prefs.mode === 'book') { const keep = current; renderChapter(chapterOf(keep)); bookShowPage(keep); } }, 150); };
  window.addEventListener('resize', onResize);

  // Track the page being read.
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { current = Number(e.target.dataset.i); updatePos(); saveProgress(); }
  }, { root: body, rootMargin: '-30% 0px -65% 0px' });
  el.querySelectorAll('.r-page').forEach((s) => io.observe(s));

  // Hide the bars while scrolling down; show them when scrolling up or tapping the text.
  let lastY = 0;
  body.addEventListener('scroll', () => {
    const y = body.scrollTop;
    if (Date.now() - jumping < 600) { lastY = y; return; }   // jumps from the contents, search or slider keep the bars
    if (Math.abs(y - lastY) > 12) { el.classList.toggle('immersive', y > lastY && y > 80); lastY = y; }
  }, { passive: true });
  body.addEventListener('click', (e) => {
    if (e.target.closest('button, a') || String(getSelection()).length) return;
    el.classList.toggle('immersive');
  });
  range.addEventListener('input', () => { pos.textContent = `${tr('page')} ${pageLabel(Number(range.value))} · ${pct(Number(range.value))}%`; });
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
    const toc = text.toc.length ? text.toc : pages.map((p, i) => ({ title: `${tr('page')} ${pageLabel(i)}`, level: 1, page: i })).filter((_, i) => i % 10 === 0);
    const activeIdx = toc.reduce((a, t, k) => (t.page <= current ? k : a), 0);
    panelEl.innerHTML = `${panelHead(tr('contents'))}
      <ol class="rp-toc">${toc.map((t, k) => `<li class="lvl${t.level} ${k === activeIdx ? 'on' : ''}"><button data-go="${t.page}"><span>${esc(t.title)}</span><small>${esc(pageLabel(t.page))}</small></button></li>`).join('')}</ol>
      <h4 class="rp-sub">${esc(tr('bookmarks'))}</h4>
      ${bms.length ? `<ol class="rp-toc">${bms.map((b) => `<li><button data-go="${b.page}"><span>★ ${esc(snippet(b.page))}</span><small>${esc(pageLabel(b.page))}</small></button></li>`).join('')}</ol>` : `<p class="rp-empty">${esc(tr('noBookmarks'))}</p>`}`;
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
    const results = [];
    const eth = isEthiopic(q);
    const fq = foldEthiopic(q.toLowerCase().trim());
    const qwords = analyze(q);
    pages.forEach((p, i) => p.blocks.forEach((b) => {
      if (results.length >= 300) return;
      if (eth) {
        const ft = foldEthiopic(b.x.toLowerCase()); let k = ft.indexOf(fq);
        while (k >= 0 && results.length < 300) { results.push({ page: i, text: b.x, at: k, len: fq.length }); k = ft.indexOf(fq, k + fq.length); }
      } else {
        const ws = analyze(b.x);
        if (qwords.every((qw) => ws.some((w) => matchWord(qw, w) >= 2))) {
          const hit = ws.find((w) => matchWord(qwords[0], w) >= 2);
          const at = hit ? foldEthiopic(b.x.toLowerCase()).indexOf(hit.text) : 0;
          results.push({ page: i, text: b.x, at: Math.max(0, at), len: hit ? hit.text.length : 0 });
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
        return `<li><button data-hit="${k}"><small>${esc(tr('page'))} ${esc(pageLabel(h.page))}</small><span>${s ? '…' : ''}${esc(h.text.slice(s, h.at))}<mark>${esc(h.text.slice(h.at, h.at + h.len))}</mark>${esc(h.text.slice(h.at + h.len, e))}${e < h.text.length ? '…' : ''}</span></button></li>`;
      }).join('')}</ol>`;
  }
  function highlight(html, word) {
    if (!word) return html;
    const re = new RegExp(word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
    return html.replace(re, (m) => `<mark>${m}</mark>`);
  }
  function showHit(h) {
    if (prefs.mode === 'book') { closePanel(); bookShowPage(h.page, { page: h.page, word: esc(h.text.slice(h.at, h.at + h.len)) }); return; }
    const sec = document.getElementById(`rp-${h.page}`);
    el.querySelectorAll('.r-page mark').forEach((m) => m.replaceWith(m.textContent));
    const word = h.text.slice(h.at, h.at + h.len);
    sec.outerHTML = pageHtml(pages[h.page], h.page, esc(word));
    const fresh = document.getElementById(`rp-${h.page}`); io.observe(fresh);
    closePanel();
    (fresh.querySelector('mark') || fresh).scrollIntoView({ block: 'center' });
    current = h.page; updatePos(); saveProgress();
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
    panelEl.innerHTML = `${panelHead(`${tr('original')} · ${tr('page')} ${pageLabel(i)}`)}
      <div class="rp-scan ${full || src.half === 'F' ? '' : 'half-' + src.half}"><div class="spinner"></div></div>
      <div class="rp-row">${src.half !== 'F' ? `<button class="btn" data-orig-full="${i}" data-full="${full ? 0 : 1}">${esc(full ? tr('original') : tr('fullSpread'))}</button>` : ''}
        <button class="btn" data-open-scan="${i}">↗ ${esc(tr('openImage'))}</button></div>`;
    scanUrl(src.file, src.page).then((url) => {
      const box = panelEl.querySelector('.rp-scan'); if (box) box.innerHTML = `<img src="${url}" alt="">`;
    }).catch(() => { const box = panelEl.querySelector('.rp-scan'); if (box) box.innerHTML = '<p class="rp-empty">—</p>'; });
  }

  // ---------- events ----------
  el.addEventListener('click', async (e) => {
    const b = e.target.closest('button'); if (!b) return;
    const act = b.dataset.act;
    if (act === 'exit') { cleanup(); onExit(); }
    else if (act === 'close') closePanel();
    else if (act === 'toc' || act === 'search' || act === 'settings') panel === act ? closePanel() : openPanel(act);
    else if (act === 'bookmark') {
      let bms = local.get(bmKey, []);
      bms = bms.some((x) => x.page === current) ? bms.filter((x) => x.page !== current) : [...bms, { page: current, ts: Date.now() }].sort((a, c) => a.page - c.page);
      local.set(bmKey, bms); updatePos();
    } else if (act === 'pdf') {
      const a = document.createElement('a'); a.href = await pdf(); a.download = `${book.titleAm || book.id}.pdf`; a.click();
    } else if (act === 'offline') {
      b.disabled = true; b.textContent = tr('downloading');
      await (offline.has() ? offline.remove() : offline.save()); renderSettings();
    } else if (b.dataset.go !== undefined) { closePanel(); goTo(Number(b.dataset.go)); }
    else if (b.dataset.hit !== undefined) showHit(searchState.results[Number(b.dataset.hit)]);
    else if (b.dataset.orig !== undefined) openPanel('original', Number(b.dataset.orig));
    else if (b.dataset.origFull !== undefined) renderOriginal(Number(b.dataset.origFull), b.dataset.full === '1');
    else if (b.dataset.openScan !== undefined) { const s = pages[Number(b.dataset.openScan)].src; window.open(await scanUrl(s.file, s.page), '_blank'); }
    else if (b.dataset.step) { prefs[b.dataset.step] = Math.max(0, Math.min(SIZES.length - 1, prefs[b.dataset.step] + Number(b.dataset.d))); applyPrefs(); relayout(); renderSettings(); }
    else if (b.dataset.pref) {
      const v = b.dataset.val; prefs[b.dataset.pref] = v === 'true' ? true : v === 'false' ? false : /^\d+$/.test(v) ? Number(v) : v;
      const keep = current; applyPrefs(); relayout(keep); renderSettings();
    }
  });
  function relayout(keep = current) {
    if (prefs.mode === 'book') { chap = -1; requestAnimationFrame(() => bookShowPage(keep)); }
    else requestAnimationFrame(() => goTo(keep));
  }
  scrim.addEventListener('click', closePanel);
  const onKey = (e) => {
    if (e.target.closest('input')) { if (e.key === 'Escape') closePanel(); return; }
    if (e.key === 'Escape') panel ? closePanel() : (cleanup(), onExit());
    else if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') prefs.mode === 'book' ? flip(1) : goTo(current + 1);
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp') prefs.mode === 'book' ? flip(-1) : goTo(current - 1);
  };
  document.addEventListener('keydown', onKey);
  function cleanup() { io.disconnect(); document.removeEventListener('keydown', onKey); window.removeEventListener('resize', onResize); document.querySelector('meta[name="theme-color"]')?.setAttribute('content', '#1f4d3a'); }

  applyPrefs(); updatePos();
  requestAnimationFrame(() => goTo(current));
  return { cleanup };
}
