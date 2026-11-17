'use strict';
const $ = (id) => document.getElementById(id);
const fmt = (n) => Number(n || 0).toLocaleString();
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const CSSq = (s) => String(s).replace(/"/g, '\\"');

const ICON = {
  right: '<svg class="ar" viewBox="0 0 24 24"><path d="M4 12h15"/><path d="M13 6l6 6-6 6"/></svg>',
  left: '<svg class="ar" viewBox="0 0 24 24"><path d="M20 12H5"/><path d="M11 6l-6 6 6 6"/></svg>',
  open: '<svg class="ar" viewBox="0 0 24 24"><path d="M7 17L17 7"/><path d="M8 7h9v9"/></svg>',
  down: '<svg class="ar" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>',
  up: '<svg class="ar" viewBox="0 0 24 24"><path d="M6 15l6-6 6 6"/></svg>',
  done: '<svg class="ar" viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7"/></svg>',
  save: '<svg class="ar" viewBox="0 0 24 24"><path d="M12 4v12"/><path d="M6 11l6 6 6-6"/><path d="M5 20h14"/></svg>',
  folder: '<svg viewBox="3 5 18 14"><path class="b" d="M3 5h6.5l2 2.5H21V19H3z"/><path class="k" d="M9.2 13.2l1.7 1.7 3.5-3.6"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7"/></svg>',
};
$('go').innerHTML = 'Load';
$('optBtn').innerHTML = 'Options';
$('back').innerHTML = ICON.left + 'All boards';

/* ---------- nav ---------- */
function showPanel(which) {
  document.body.classList.toggle('page-other', !!which); // Extension and About are their own pages
  $('about').classList.toggle('on', which === 'about'); $('extPanel').hidden = which !== 'ext'; $('appPanel').hidden = which !== 'app';
  $('navApp').classList.toggle('on', which === 'app');
  $('navAbout').classList.toggle('on', which === 'about'); $('navExt').classList.toggle('on', which === 'ext'); $('navDl').classList.toggle('on', !which);
}
const setMenu = (open) => { document.querySelector('header').classList.toggle('open', open); $('burger').setAttribute('aria-expanded', open); };
if (matchMedia('(hover: hover) and (pointer: fine)').matches) $('url').focus();
$('burger').onclick = () => setMenu(!document.querySelector('header').classList.contains('open'));
$('navAbout').onclick = () => { showPanel('about'); setMenu(false); };
$('navExt').onclick = () => { showPanel('ext'); setMenu(false); };
$('navApp').onclick = () => { showPanel('app'); setMenu(false); };
$('navDl').onclick = () => { showPanel(null); setMenu(false); };
// already installed: the extension itself, or the website after the Pinthia extension marked this page
const hideExt = () => { $('navExt').hidden = true; if (!$('extPanel').hidden) showPanel(''); };
if (engine.kind === 'extension' || document.documentElement.hasAttribute('data-pinthia-extension')) hideExt();
window.addEventListener('pinthia-extension', hideExt);

/* ---------- extension install: show the steps for the browser you are in ---------- */
const BROWSERS = (() => {
  const copy = (t) => `<code>${t}</code> <button type="button" class="copy" data-copy="${t}">Copy</button>`;
  return [
    { name: 'Safari', steps: ['Unzip the download.', 'In Safari open Settings <svg class="ar sep" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg> Advanced and tick <b>Show features for web developers</b>.', 'In the menu bar choose <b>Develop</b> <svg class="ar sep" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg> <b>Developer Settings…</b> and tick <b>Allow unsigned extensions</b>.', 'Click <b>Add Temporary Extension…</b> and pick the <b>extension</b> folder from the download.', 'Open Settings <svg class="ar sep" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg> Extensions and tick <b>Pinthia</b>. Allow it on pinterest.com.', 'Safari forgets the extension when you quit it. To bring it back, repeat the last three steps.'] },
    { name: 'Chrome, Brave, Firefox', steps: ['Coming soon.'] },
  ];
})();
const USING = ['Open a board on Pinterest and click the <b>Pinthia</b> button in your toolbar. It opens with that board loaded.', 'Tick what you want and press <b>Download</b>.'];
$('extSteps').innerHTML = BROWSERS.map((b) => `<section class="browser"><h3>${b.name}</h3><ul class="steps">${b.steps.map((t) => `<li>${t}</li>`).join('')}</ul></section>`).join('') + `<section class="browser"><h3>Using it</h3><ul class="steps">${USING.map((t) => `<li>${t}</li>`).join('')}</ul></section>`;

$('extPanel').addEventListener('click', (e) => {
  const c = e.target.closest('[data-copy]'); if (!c) return;
  navigator.clipboard?.writeText(c.dataset.copy).then(() => { c.textContent = 'Copied'; setTimeout(() => (c.textContent = 'Copy'), 1500); }).catch(() => {});
});

/* ---------- install as app (phones and tablets) ---------- */
{
  const ua = navigator.userAgent, ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  const arrow = '<svg class="ar sep" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>';
  const steps = ios ? ['Open Pinthia in <b>Safari</b>.', 'Tap the <b>Share</b> button (the square with an arrow up).', 'Scroll down and tap <b>Add to Home Screen</b>, then <b>Add</b>.', 'Open Pinthia from your home screen. In the Pinterest app, tap Share on a board and <b>Copy link</b>, then open Pinthia and tap <b>Paste</b>.']
    : ['Open the browser menu (<b>⋮</b>).', 'Tap <b>Install app</b> or <b>Add to Home screen</b>.', 'Open Pinthia from your home screen. In the Pinterest app, tap Share on a board and pick <b>Pinthia</b>.'];
  $('appSteps').innerHTML = steps.map((t) => `<li>${t}</li>`).join('');
  let deferred = null;
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; $('appInstall').hidden = false; $('appSteps').parentElement.hidden = true; });
  $('appInstall').onclick = async () => { if (!deferred) return; deferred.prompt(); await deferred.userChoice.catch(() => {}); deferred = null; $('appInstall').hidden = true; $('appSteps').parentElement.hidden = false; };
  window.addEventListener('appinstalled', () => { $('navApp').hidden = true; showPanel(null); });
  if (standalone || engine.kind === 'extension') $('navApp').hidden = true;
  else $('navApp').hidden = false; // shown only on narrow or touch screens by CSS
}

/* ---------- download options (remembered) ---------- */
let opt = { image: true, gif: true, video: true, structure: 'folders', figma: false, zip: false };
try { Object.assign(opt, JSON.parse(localStorage.getItem('pinthia-opt') || '{}')); } catch {}
opt.figma = opt.figma === true || opt.figma === '1'; opt.zip = opt.zip === true; // older saved settings used other values
const saveOpt = () => { try { localStorage.setItem('pinthia-opt', JSON.stringify(opt)); } catch {} };

/*
  Selection model
  - A folder is checked (included) unless it is in S.off.
  - Inside a CHECKED folder every pin counts; clicking a pin DESELECTS it (S.excl).
  - Inside an UNCHECKED folder nothing counts; clicking a pin SELECTS it (S.picked).
*/
const S = {
  url: '', info: null, profile: null, profileUrl: '', nodes: [], mode: 'board',
  sc: {}, off: new Set(), excl: new Set(), picked: new Set(), expanded: new Set(), view: new Set(),
  over: {}, scrollX: {}, downloading: false, title: '',
};

const note = (t, err) => { $('note').textContent = t || ''; $('note').className = err ? 'err' : ''; };

/* ---------- link field ---------- */
// Once a board is loaded, clicking the field empties it so you can paste another link.
// Leave without typing and the current link comes back.
const urlBox = $('url'), PLACEHOLDER = urlBox.placeholder;
let keptUrl = '';
urlBox.addEventListener('focus', () => {
  if (!document.body.classList.contains('loaded')) return;
  keptUrl = urlBox.value; urlBox.value = ''; syncGo(); urlBox.placeholder = 'Paste another link';
});
urlBox.addEventListener('blur', () => {
  if (keptUrl && !urlBox.value.trim()) urlBox.value = keptUrl; syncGo(); syncGo();
  keptUrl = ''; urlBox.placeholder = PLACEHOLDER; urlBox.scrollLeft = 0;
});

/* ---------- loading a link ---------- */
// Load stays dimmed until there is a link to load
// With an empty field the button turns into Paste (reads the clipboard: Pinterest app > Share > Copy link, then Paste here)
const canPaste = !!navigator.clipboard?.readText && matchMedia('(pointer: coarse)').matches;
let busy = false;
const syncGo = () => {
  const has = !!urlBox.value.trim();
  $('go').disabled = busy || (!has && !canPaste);
  if (!busy) $('go').textContent = has || !canPaste ? 'Load' : 'Paste';
};
urlBox.addEventListener('input', syncGo); syncGo();
// pulls the Pinterest link out of whatever was shared or copied ("Check out this board https://pin.it/abc")
const findLink = (t) => (String(t || '').match(/https?:\/\/(?:[\w-]+\.)*(?:pinterest\.[a-z.]+|pin\.it)\/[^\s"'<>]*/i) || [])[0] || '';
$('form').addEventListener('submit', async (e) => {
  e.preventDefault();
  let v = urlBox.value.trim();
  if (!v && canPaste) {
    try { v = findLink(await navigator.clipboard.readText()); } catch { /* denied */ }
    if (!v) return note('No Pinterest link on the clipboard. In the Pinterest app tap Share, then Copy link.', true);
    urlBox.value = v; syncGo();
  }
  load(findLink(v) || v);
});
// Shared straight to the app (Android: Share > Pinthia), or opened with ?url=
{
  const q = new URLSearchParams(location.search);
  const shared = findLink(q.get('url')) || findLink(q.get('text')) || findLink(q.get('title'));
  if (shared) { urlBox.value = shared; history.replaceState(null, '', location.pathname); syncGo(); load(shared); }
}

async function load(url, fromProfile = false) {
  if (!url) return;
  if (!fromProfile) S.profile = null;
  busy = true; $('go').disabled = true; $('go').textContent = 'Loading…'; note('');
  try {
    const info = await engine.inspect(url);
    S.url = url; S.info = info; note('');
    urlBox.value = url; keptUrl = ''; urlBox.blur(); urlBox.scrollLeft = 0; // shows the loaded link; the next click empties it
    if (info.kind === 'profile') { S.profile = info; S.profileUrl = url; }
    build(info);
    window.scrollTo(0, 0);
  } catch (err) {
    note(err.message === 'Failed to fetch' ? "Can't reach Pinterest or the server." : err.message, true);
  } finally { busy = false; syncGo(); }
}

function scopeOf(key, count) { return (S.sc[key] ||= { key, count, items: [], next: undefined, loading: false }); }

function build(info) {
  S.off.clear(); S.excl.clear(); S.picked.clear(); S.expanded.clear(); S.view.clear(); S.over = {}; S.scrollX = {}; S.sc = {};
  const nodes = [], sectionOnly = info.kind === 'section';
  for (const b of info.boards) {
    const kids = b.sections.map((s) => { scopeOf('s:' + s.id, s.pinCount); return { id: 's:' + s.id, label: s.title, count: s.pinCount, scope: 's:' + s.id, kids: [] }; });
    // Pins on the board but in no section go in "Main". If everything is sorted into sections there is no Main.
    const unsorted = b.unsorted ?? b.pinCount;
    const hasOwn = !sectionOnly && (unsorted > 0 || !b.sections.length);
    if (hasOwn) scopeOf('r:' + b.id, unsorted);
    const total = (hasOwn ? unsorted : 0) + kids.reduce((n, k) => n + k.count, 0);
    const ownKid = hasOwn && kids.length ? { id: 'r:' + b.id, label: 'Main', count: unsorted, scope: 'r:' + b.id, kids: [] } : null;
    if (sectionOnly) nodes.push(kids[0]);
    else nodes.push({ id: 'b:' + b.id, label: b.name, count: total, board: b, scope: hasOwn && !kids.length ? 'r:' + b.id : null, kids: ownKid ? [ownKid, ...kids] : kids });
  }
  S.nodes = nodes; S.mode = info.kind === 'profile' ? 'profile' : 'board';
  S.title = S.mode === 'profile' ? info.title : sectionOnly ? info.boards[0].sections[0].title : info.title;

  document.body.classList.add('loaded');
  $('cabinet').classList.add('on'); $('front').classList.add('on');
  $('title').textContent = S.title;
  const secs = nodes.reduce((n, x) => n + x.kids.length, 0), pins = allScopes().reduce((n, k) => n + S.sc[k].count, 0);
  $('meta').textContent = S.mode === 'profile' ? `${fmt(nodes.length)} boards · ${pinWord(pins)}` : `${pinWord(pins)}${secs ? ` · ${secs} section${secs === 1 ? '' : 's'}` : ''}${info.boards[0]?.owner ? ` · by ${info.boards[0].owner}` : ''}`;
  $('back').hidden = !(S.profile && S.mode === 'board'); $('tools').hidden = $('back').hidden;
  renderTree(); renderFront(); renderOpts();
}

const allScopes = () => Object.keys(S.sc);
const nodeScopes = (n) => [n.scope, ...n.kids.flatMap(nodeScopes)].filter(Boolean);
const findNode = (id, list = S.nodes) => { for (const n of list) { if (n.id === id) return n; const f = findNode(id, n.kids); if (f) return f; } return null; };
const pinWord = (n) => `${fmt(n)} ${n === 1 ? 'pin' : 'pins'}`;
const itemsWord = (n) => `${fmt(n)} ${n === 1 ? 'item' : 'items'}`;

/* ---------- selection helpers ---------- */
const included = (k) => !S.off.has(k);
const pinKey = (k, id) => k + '|' + id;
const pinOn = (k, id) => (included(k) ? !S.excl.has(pinKey(k, id)) : S.picked.has(pinKey(k, id)));
function scopeOverrides(k) { const pre = k + '|'; return [...S.excl, ...S.picked].filter((x) => x.startsWith(pre)); }
function clearOverrides(k) { const pre = k + '|'; for (const x of [...S.excl]) if (x.startsWith(pre)) S.excl.delete(x); for (const x of [...S.picked]) if (x.startsWith(pre)) S.picked.delete(x); }
const scopeFull = (k) => included(k) && !scopeOverrides(k).length; // everything inside is selected
function setScope(k, on) { on ? S.off.delete(k) : S.off.add(k); clearOverrides(k); }

function labHtml(n, subtitle) {
  return `<div class="lab"><button class="fcb" type="button" data-cb="${esc(n.id)}" data-state="all" title="Include in download" aria-label="Include ${esc(n.label)}">${ICON.folder}</button>
    <div class="lt"><span class="nm">${esc(n.label)}</span><span class="ct num">${subtitle}</span></div></div>`;
}
function rowHtml(n, depth) {
  const sub = ''; // a master folder shows its count on the content line instead
  const con = n.scope
    ? `<div class="strip" data-sheet="${esc(n.scope)}"></div><div class="more" data-tools="${esc(n.scope)}"></div>`
    : `<div class="rh"><span class="subl">${itemsWord(n.count)} · ${n.kids.length} folder${n.kids.length === 1 ? '' : 's'}</span></div>`;
  return `<div class="row g d${depth}${n.scope ? '' : ' master'}" data-id="${esc(n.id)}"><div class="c1">${labHtml(n, sub)}</div><div class="c2">${con}</div></div>` + n.kids.map((k) => rowHtml(k, depth + 1)).join('');
}
function boardRowHtml(n) {
  const b = n.board, imgs = [...new Set(b.covers?.length ? b.covers : b.cover ? [b.cover] : [])].slice(0, 12);
  const sub = `${itemsWord(n.count)}${b.sections.length ? ` · ${b.sections.length} folder${b.sections.length === 1 ? '' : 's'}` : ''}`;
  return `<div class="row g" data-id="${esc(n.id)}"><div class="c1">${labHtml(n, sub)}</div>
    <div class="c2"><div class="rh"><button type="button" data-open>Open ${ICON.open}</button></div>
    <div class="strip one" data-cover>${imgs.map((u) => `<div class="pin cover"><img src="${esc(u)}" alt="" loading="lazy" referrerpolicy="no-referrer"></div>`).join('') || '<div class="empty">No preview</div>'}</div></div></div>`;
}

let rowObs;
function renderTree() {
  rowObs?.disconnect();
  if (S.mode === 'profile') $('tree').innerHTML = S.nodes.map(boardRowHtml).join('');
  else {
    $('tree').innerHTML = S.nodes.map((n) => rowHtml(n, 0)).join('');
    rowObs = new IntersectionObserver((en) => en.forEach((e) => {
      if (!e.isIntersecting) return;
      rowObs.unobserve(e.target);
      const k = e.target.querySelector('[data-sheet]')?.dataset.sheet; if (k) ensureLoaded(S.sc[k]);
    }), { rootMargin: '400px 0px' });
    allScopes().forEach((k) => { renderStrip(k); const el = sheetEl(k); el && rowObs.observe(el.closest('.row')); });
  }
  updateChecks();
}

/* ---------- clicks ---------- */
$('tree').addEventListener('click', (e) => {
  const cb = e.target.closest('.fcb');
  if (cb) { const n = findNode(cb.dataset.cb); toggleCheck(n, !nodeScopes(n).every(scopeFull)); return; }
  const row = e.target.closest('.row');
  if (e.target.closest('[data-open]') || e.target.closest('.pin.cover')) return openBoard(findNode(row.dataset.id));
  const pin = e.target.closest('.pin'); if (pin) return togglePin(pin);
  const ex = e.target.closest('[data-expand]'); if (ex) return toggleExpand(ex.dataset.expand);
  const va = e.target.closest('[data-viewall]'); if (va) return toggleView(va.dataset.viewall);
});
function openBoard(n) { load('https://www.pinterest.com' + n.board.url, true); }

function refresh(scopes) { scopes.forEach(keepScroll); updateChecks(); renderFront(); }
function keepScroll(k) { sheetEl(k) ? renderStrip(k) : refreshViews(k); }
function toggleCheck(n, on) { setMsg(''); const ks = nodeScopes(n); ks.forEach((k) => setScope(k, on)); refresh(ks); }
function updateChecks() {
  document.querySelectorAll('.fcb').forEach((cb) => {
    const sc = nodeScopes(findNode(cb.dataset.cb));
    cb.dataset.state = sc.length && sc.every(scopeFull) ? 'all' : 'none'; // anything less than everything shows the empty folder
    cb.setAttribute('aria-pressed', cb.dataset.state === 'all');
  });
}
$('allOn').onclick = () => { setMsg(''); S.off.clear(); S.excl.clear(); S.picked.clear(); refresh(allScopes()); };
$('allOff').onclick = clearAll;
function clearAll() { setMsg(''); allScopes().forEach((k) => S.off.add(k)); S.excl.clear(); S.picked.clear(); refresh(allScopes()); }
$('back').onclick = () => { S.info = S.profile; S.url = S.profileUrl; build(S.profile); window.scrollTo(0, 0); };

/* ---------- pins ---------- */
const sheetEl = (k) => document.querySelector(`[data-sheet="${CSSq(k)}"]`);
const toolsEl = (k) => document.querySelector(`[data-tools="${CSSq(k)}"]`);
const endObs = {};

function pinHtml(k, it) {
  const key = pinKey(k, it.id), on = pinOn(k, it.id);
  const cls = on ? ' sel' : included(k) ? ' dim' : '';
  return `<button class="pin${cls}" data-key="${esc(key)}" type="button" aria-pressed="${on}" title="${esc(it.title)}">${it.thumb ? `<img src="${esc(it.thumb)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ''}${it.kind !== 'image' ? `<span class="kind">${it.kind === 'gif' ? 'GIF' : 'VIDEO'}</span>` : ''}<span class="chk">${ICON.check}</span></button>`;
}

function renderStrip(k) {
  const el = sheetEl(k); if (!el) return refreshViews(k);
  const sc = S.sc[k], cols = colsNow(), solo = S.mode !== 'profile' && S.nodes.length === 1 && !S.nodes[0].kids.length;
  const wrapped = solo || S.expanded.has(k); // a lone board with no subfolders just shows everything
  const shown = wrapped ? sc.items : sc.items.slice(0, cols);
  let html;
  if (!sc.items.length) html = sc.next === null ? '<div class="empty">Nothing here.</div>' : Array.from({ length: Math.min(cols, sc.count || cols) }, () => '<div class="skeleton"></div>').join('');
  else {
    html = shown.map((it) => pinHtml(k, it)).join('');
    if (sc.next !== null && (wrapped || sc.items.length < cols)) html += (sc.loading ? '<div class="skeleton"></div><div class="skeleton"></div>' : '') + '<i class="end"></i>';
  }
  el.innerHTML = html;
  const t = toolsEl(k);
  const total = Math.max(sc.count || 0, sc.items.length);
  if (t) t.innerHTML = solo ? '' : total > cols ? `<button type="button" data-expand="${esc(k)}">${wrapped ? 'Show less' : 'Show all'} <em>${itemsWord(total)}</em></button>` : `<span class="num">${itemsWord(total)}</span>`;
  endObs[k]?.disconnect();
  const end = el.querySelector('.end');
  if (end) { endObs[k] = new IntersectionObserver((en) => { if (en[0].isIntersecting) loadMore(sc); }, { rootMargin: '500px' }); endObs[k].observe(end); }
  refreshViews(k);
}
let lastCols = 0;
const colsNow = () => parseInt(getComputedStyle(document.documentElement).getPropertyValue('--cols')) || 5;
window.addEventListener('resize', () => { const c = colsNow(); if (c !== lastCols) { lastCols = c; allScopes().forEach(renderStrip); } }); // tile count follows the window

function toggleExpand(k) { S.expanded.has(k) ? S.expanded.delete(k) : S.expanded.add(k); renderStrip(k); }

function togglePin(p) {
  setMsg('');
  const key = p.dataset.key, k = key.split('|')[0];
  const set = included(k) ? S.excl : S.picked;
  set.has(key) ? set.delete(key) : set.add(key);
  const on = pinOn(k, key.slice(k.length + 1)), cls = on ? 'sel' : included(k) ? 'dim' : '';
  document.querySelectorAll(`.pin[data-key="${CSSq(key)}"]`).forEach((el) => { el.classList.remove('sel', 'dim'); if (cls) el.classList.add(cls); el.setAttribute('aria-pressed', on); });
  updateChecks(); renderFront();
}

function setMsg(t) { $('dlmsg').textContent = t || ''; $('dlmsg').hidden = !t; }

async function loadMore(sc) {
  if (!sc || sc.loading || sc.next === null) return;
  sc.loading = true; renderStrip(sc.key);
  try {
    const r = await engine.pins(S.url, sc.key, sc.next || undefined);
    const seen = new Set(sc.items.map((i) => i.id));
    r.items.forEach((i) => { if (!seen.has(i.id)) sc.items.push(i); });
    sc.next = r.next;
  } catch (e) { sc.next = null; note(e.message, true); }
  finally { sc.loading = false; renderStrip(sc.key); }
  if (sc.next && !sc.items.length) loadMore(sc); // empty page, keep going
}
function ensureLoaded(sc) { if (sc && sc.next === undefined && !sc.loading) loadMore(sc); }

/* ---------- "View all": every pin of a master folder combined in one grid ---------- */
const viewObs = {};
let viewQueued = false;
function toggleView(id) {
  S.view.has(id) ? S.view.delete(id) : S.view.add(id);
  const n = findNode(id);
  if (S.view.has(id)) nodeScopes(n).forEach((k) => ensureLoaded(S.sc[k]));
  renderView(id);
}
function refreshViews(k) {
  if (!S.view.size || viewQueued) return;
  viewQueued = true;
  requestAnimationFrame(() => { viewQueued = false; for (const id of S.view) { const n = findNode(id); if (n) renderView(id); } });
}
function renderView(id) {
  const el = document.querySelector(`[data-vsheet="${CSSq(id)}"]`), btn = document.querySelector(`[data-viewall="${CSSq(id)}"]`); if (!el) return;
  const open = S.view.has(id), n = findNode(id), ks = nodeScopes(n);
  el.hidden = !open; btn.textContent = open ? 'Hide' : 'View all';
  viewObs[id]?.disconnect();
  if (!open) { el.innerHTML = ''; return; }
  const items = ks.flatMap((k) => S.sc[k].items.map((it) => pinHtml(k, it)));
  const more = ks.some((k) => S.sc[k].next !== null);
  el.innerHTML = (items.length ? items.join('') : Array.from({ length: 8 }, () => '<div class="skeleton"></div>').join('')) + (more ? '<i class="end"></i>' : '');
  const end = el.querySelector('.end');
  if (end) {
    // keep every subfolder growing evenly, so a huge Main doesn't starve the small ones
    viewObs[id] = new IntersectionObserver((en) => {
      if (!en[0].isIntersecting) return;
      const next = ks.map((k) => S.sc[k]).filter((s) => s.next !== null && !s.loading).sort((a, b) => a.items.length - b.items.length)[0];
      if (next) loadMore(next);
    }, { rootMargin: '600px' });
    viewObs[id].observe(end);
  }
}

/* ---------- options ---------- */
const OPTS = [
  { title: 'File types', multi: true, choices: [['image', 'Images'], ['gif', 'GIFs'], ['video', 'Videos']] },
  { title: 'Zip layout', key: 'structure', choices: [['folders', 'Boardlike'], ['flat', '1 folder'], ['sub', 'Subfolders']] },
  { title: 'Extras', multi: true, choices: [['figma', 'Figma ready'], ['zip', 'Zip file']] },
];
function renderOpts() {
  $('opts').innerHTML = `<div class="ogrid g">${OPTS.map((g, i) => `<div class="${i ? 'c2' : 'c1'}"><div class="chips" role="group" aria-label="${g.title}">${g.choices.map(([v, l]) => {
    const on = g.multi ? opt[v] : (opt[g.key] || '') === v;
    return `<button type="button" class="o${on ? ' on' : ''}" data-g="${g.key || ''}" data-v="${v}" aria-pressed="${on}">${l}</button>`;
  }).join('')}</div></div>`).join('')}</div>`;
}
$('opts').addEventListener('click', (e) => {
  const c = e.target.closest('.o'); if (!c) return;
  const { g, v } = c.dataset;
  if (g) opt[g] = v;
  else { const types = ['image', 'gif', 'video']; if (types.includes(v) && opt[v] && types.filter((t) => opt[t]).length === 1) return; opt[v] = !opt[v]; }
  saveOpt(); renderOpts();
});
const closeOpts = () => { $('front').classList.remove('optsopen'); $('optBtn').setAttribute('aria-expanded', false); };
$('scrim').onclick = closeOpts;
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeOpts(); setMenu(false); } });
$('optBtn').onclick = () => { const o = $('front').classList.toggle('optsopen'); $('optBtn').setAttribute('aria-expanded', o); };

/* ---------- bottom bar / download ---------- */
function setDl(text, disabled) { $('dl').innerHTML = esc(text); $('dl').disabled = disabled; }
function totals() {
  const inc = allScopes().filter(included);
  const pins = inc.reduce((n, k) => n + S.sc[k].count, 0) - S.excl.size + S.picked.size;
  const units = S.mode === 'profile' ? S.nodes.filter((n) => nodeScopes(n).some(included)).length : inc.length;
  return { units, pins: Math.max(0, pins) };
}
// Not enough room? Drop the word "selected" first, then the item count
function fitSum() {
  const el = $('sum'); el.classList.remove('short', 'shorter');
  if (el.scrollWidth > el.clientWidth) el.classList.add('short');
  if (el.scrollWidth > el.clientWidth) el.classList.add('shorter');
}
window.addEventListener('resize', fitSum);
function renderFront() {
  if (S.downloading || !S.nodes.length) return;
  const { units, pins } = totals();
  const unit = S.mode === 'profile' ? 'board' : 'folder';
  const label = units ? `${fmt(units)} ${unit}${units === 1 ? '' : 's'}<span class="selw"> selected</span>` : S.picked.size ? 'Items picked' : 'Nothing selected';
  $('sum').innerHTML = pins ? `${label}<em> · ${itemsWord(pins)}</em>` : label; fitSum();
  setDl(pins ? `Download ${itemsWord(pins)}` : 'Select to download', !pins);
  const allChecked = allScopes().every(scopeFull);
  $('allOn').hidden = allChecked; $('allOff').hidden = !pins;
}
function params() {
  const types = ['image', 'gif', 'video'].filter((t) => opt[t]).join(',');
  return { url: S.url, types, structure: opt.structure, figma: opt.figma ? '1' : '', format: !opt.zip && (engine.kind === 'web' || window.showDirectoryPicker) ? 'files' : 'zip', skip: [...S.off].join(','), exclude: [...S.excl].join('\n'), sel: [...S.picked].join('\n') };
}
$('dl').onclick = () => startDownload(params());

function onProgress(p) {
  if (p.done > 0) { $('track').classList.remove('indet'); $('track').firstElementChild.style.width = Math.min(100, p.estimate ? (p.done / p.estimate) * 100 : 0) + '%'; }
  $('nums').textContent = `${fmt(p.done)} / ${fmt(p.estimate)}`;
}
let stopTimer;
async function startDownload(fields) {
  setMsg('');
  S.downloading = true; $('front').classList.add('busy'); $('front').classList.remove('optsopen');
  $('track').classList.add('indet'); $('track').firstElementChild.style.width = '0'; $('nums').textContent = 'Starting…';
  // not instant? offer a way out after 10 seconds
  $('stop').hidden = true; clearTimeout(stopTimer); stopTimer = setTimeout(() => { $('stop').hidden = false; }, 10000);
  try {
    const r = await engine.download(fields, onProgress);
    $('track').classList.remove('indet'); $('track').firstElementChild.style.width = '100%'; $('nums').innerHTML = `Done ${ICON.done}${r?.saved ? ' <em>Saved in Downloads</em>' : ''}`;
    if (r?.capped) setMsg('Sorry, downloads are limited to 100 pins. It costs me money.');
    setTimeout(finish, 2500);
  } catch (e) {
    setMsg(e.name === 'Cancel' ? 'Stopped.' : e.message);
    finish();
  }
}
$('stop').onclick = () => { $('stop').disabled = true; engine.stop(); };
function finish() { clearTimeout(stopTimer); $('stop').hidden = true; $('stop').disabled = false; S.downloading = false; $('front').classList.remove('busy'); renderFront(); }

/* keep the last folder clear of the bottom bar, whatever its height (options open, wrapped text) */
new ResizeObserver(() => { $('main').style.paddingBottom = $('front').offsetHeight + 'px'; }).observe($('front'));

/* ?url=… opens a link straight away (the extension uses this for the page you were on) */
const startUrl = new URLSearchParams(location.search).get('url');
if (startUrl) { $('url').value = startUrl; syncGo(); load(startUrl); }

/* the logo starts over */
$('logo').onclick = () => { engine.stop?.(); location.href = location.pathname; };
