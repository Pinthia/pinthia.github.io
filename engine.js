// Pinthia web engine: runs in the browser and reaches Pinterest through the Pinthia proxy (worker/worker.js).
// It reads Pinterest's public web endpoints, builds the zip in memory and hands it to the download manager.
// Needs the host permissions listed in manifest.json (they let the extension page read pinterest.com / pinimg.com).
(function () {
  'use strict';
  const PROXY = globalThis.PINTHIA_PROXY || 'https://pinthia-proxy.pinthia.workers.dev/';
  const fetch = (u, o) => globalThis.fetch(PROXY + '?u=' + encodeURIComponent(String(u)), o); // every Pinterest request goes through the proxy
  const BASE = 'https://www.pinterest.com';
  const CONCURRENCY = 6;
  const RESERVED = new Set(['pin', 'search', 'ideas', 'today', 'settings', 'business', 'login', 'signup', 'explore', 'categories', 'topics', 'news_hub', 'resource', 'password', 'about']);

  class UserError extends Error {}
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  /* ---------- Pinterest ---------- */
  async function resource(name, options, sourceUrl, handler, attempt = 0) {
    const u = new URL(`${BASE}/resource/${name}/get/`);
    u.searchParams.set('source_url', sourceUrl);
    u.searchParams.set('data', JSON.stringify({ options, context: {} }));
    let res;
    try {
      res = await fetch(u, { headers: { Accept: 'application/json', 'X-Pinterest-PWS-Handler': handler }, credentials: 'omit', signal: AbortSignal.timeout(30000) });
    } catch (e) {
      if (attempt < 3) { await sleep(1000 * 2 ** attempt); return resource(name, options, sourceUrl, handler, attempt + 1); }
      throw e;
    }
    if ((res.status === 429 || res.status >= 500) && attempt < 4) { await sleep(1500 * 2 ** attempt); return resource(name, options, sourceUrl, handler, attempt + 1); }
    const text = await res.text();
    let json;
    try { json = JSON.parse(text); } catch { throw new Error(`Pinterest returned an unexpected response (${res.status})`); }
    const rr = json.resource_response || {};
    if (res.status === 404 || rr.error) {
      const err = new UserError(rr.error?.message || `Not found (${res.status})`);
      err.status = res.status;
      throw err;
    }
    return rr;
  }

  async function* paginate(name, options, sourceUrl, handler) {
    let bookmark;
    for (;;) {
      const rr = await resource(name, { ...options, ...(bookmark ? { bookmarks: [bookmark] } : {}) }, sourceUrl, handler);
      const data = Array.isArray(rr.data) ? rr.data : [];
      for (const item of data) yield item;
      bookmark = rr.bookmark;
      if (!bookmark || bookmark === '-end-' || data.length === 0) return;
    }
  }

  async function parseInput(raw) {
    let input = String(raw || '').trim();
    if (!input) throw new UserError('Paste a Pinterest board link.');
    if (!/^https?:\/\//i.test(input)) input = 'https://' + input.replace(/^\/+/, '');
    let url;
    try { url = new URL(input); } catch { throw new UserError("That doesn't look like a link."); }
    if (/(^|\.)pin\.it$/i.test(url.hostname)) {
      const res = await fetch(url, { redirect: 'follow', credentials: 'omit', signal: AbortSignal.timeout(15000) });
      url = new URL(res.headers.get('X-Final-Url') || res.url);
    }
    if (!/(^|\.)pinterest\.[a-z.]+$/i.test(url.hostname)) throw new UserError('Only Pinterest links are supported (pinterest.com/… or pin.it/…).');
    const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
    if (!parts.length || RESERVED.has(parts[0].toLowerCase())) throw new UserError('Paste a link to a board, a board section, or a profile, not a single pin or search page.');
    const [username, slug, sectionSlug] = parts;
    if (!slug || slug.startsWith('_')) return { kind: 'profile', username };
    return { kind: sectionSlug ? 'section' : 'board', username, slug, sectionSlug };
  }

  async function getBoard(username, slug) {
    const b = (await resource('BoardResource', { username, slug, field_set_key: 'detailed' }, `/${username}/${slug}/`, 'www/[username]/[slug].js')).data;
    return {
      id: b.id, name: b.name, url: b.url, username, slug,
      pinCount: b.pin_count ?? 0, sectionCount: b.section_count ?? 0,
      cover: b.image_cover_hd_url || b.image_cover_url || b.images?.['474x']?.[0]?.url || null,
      covers: (b.images?.['474x'] || []).slice(0, 12).map((x) => x.url),
      owner: b.owner?.full_name || username,
    };
  }
  async function getSections(board) {
    if (!board.sectionCount) return [];
    const out = [];
    for await (const s of paginate('BoardSectionsResource', { board_id: board.id }, `/${board.username}/${board.slug}/`, 'www/[username]/[slug].js')) {
      out.push({ id: s.id, title: s.title, slug: s.slug, pinCount: s.pin_count ?? 0 });
    }
    return out;
  }
  async function getSectionBySlug(board, sectionSlug) {
    const s = (await resource('BoardSectionResource', { board_slug: board.slug, section_slug: sectionSlug, username: board.username }, `/${board.username}/${board.slug}/${sectionSlug}/`, 'www/[username]/[slug]/[section_slug].js')).data;
    return { id: s.id, title: s.title, slug: s.slug, pinCount: s.pin_count ?? 0 };
  }
  async function getProfile(username) {
    const src = `/${username}/`;
    const u = (await resource('UserResource', { username, field_set_key: 'profile' }, src, 'www/[username].js')).data;
    const boards = [];
    for await (const b of paginate('BoardsResource', { username, page_size: 50, privacy_filter: 'all', sort: 'custom', field_set_key: 'detailed' }, src, 'www/[username].js')) {
      if (b.type && b.type !== 'board') continue;
      const [, bu, bs] = (b.url || '').split('/');
      boards.push({
        id: b.id, name: b.name, url: b.url, username: bu || username, slug: bs,
        pinCount: b.pin_count ?? 0, sectionCount: b.section_count ?? 0,
        cover: b.image_cover_hd_url || b.image_cover_url || null,
        covers: (b.images?.['474x'] || []).slice(0, 12).map((x) => x.url),
      });
    }
    return { username, name: u.full_name || username, boards };
  }

  async function pinsPage(board, section, bookmark) {
    const bm = bookmark ? { bookmarks: [bookmark] } : {};
    let rr;
    if (section) {
      rr = await resource('BoardSectionPinsResource', { section_id: section.id, page_size: 50, ...bm }, `/${board.username}/${board.slug}/${section.slug}/`, 'www/[username]/[slug]/[section_slug].js');
    } else {
      const src = `/${board.username}/${board.slug}/`;
      rr = await resource('BoardFeedResource', { board_id: board.id, board_url: src, page_size: 50, field_set_key: 'react_grid_pin', ...bm }, src, 'www/[username]/[slug].js');
    }
    const data = Array.isArray(rr.data) ? rr.data : [];
    const next = rr.bookmark && rr.bookmark !== '-end-' && data.length ? rr.bookmark : null;
    return { pins: data.filter((p) => p?.type === 'pin'), next };
  }
  // Pinterest's main feed returns EVERY pin, section pins included (different ids). Drop one feed pin per
  // section pin, matched by image, to get only the unsorted ones.
  const unsortedCount = (b) => (b.sections?.length ? Math.max(0, b.pinCount - b.sections.reduce((n, s) => n + s.pinCount, 0)) : b.pinCount);
  function sectionSigCounts(board) {
    return (board._sigs ||= (async () => {
      const m = new Map();
      for (const s of board.sections || []) { let bm; for (;;) { const { pins: ps, next } = await pinsPage(board, s, bm); for (const p of ps) m.set(p.image_signature, (m.get(p.image_signature) || 0) + 1); if (!next) break; bm = next; } }
      return m;
    })());
  }
  async function mainPage(board, bookmark) {
    const base = await sectionSigCounts(board);
    const states = (board._mainState ||= new Map());
    const remaining = new Map((bookmark && states.get(bookmark)) || base);
    const { pins, next } = await pinsPage(board, null, bookmark);
    const kept = [];
    for (const p of pins) { const left = remaining.get(p.image_signature) || 0; if (left > 0) remaining.set(p.image_signature, left - 1); else kept.push(p); }
    if (next) states.set(next, remaining);
    return { pins: kept, next };
  }
  async function* allPins(board, section) {
    const paged = !section && board.sections?.length ? (bm) => mainPage(board, bm) : (bm) => pinsPage(board, section, bm);
    let bm;
    for (;;) {
      const { pins, next } = await paged(bm);
      for (const p of pins) yield p;
      if (!next) return;
      bm = next;
    }
  }
  async function* allPinsOld(board, section) {
    let bm;
    for (;;) {
      const { pins, next } = await pinsPage(board, section, bm);
      for (const p of pins) yield p;
      if (!next) return;
      bm = next;
    }
  }

  function pinMedia(p) {
    const out = [];
    const pickVideo = (vl) => {
      if (!vl) return null;
      const v = vl.V_720P || vl.V_EXP7 || vl.V_EXP6 || vl.V_EXP5 || vl.V_EXP4 || Object.values(vl).find((x) => /\.mp4(\?|$)/.test(x?.url || ''));
      return v?.url || null;
    };
    const bestImage = (imgs) => imgs?.orig?.url || imgs?.originals?.url || imgs?.['1200x']?.url || imgs?.['736x']?.url || null;
    const smallImage = (imgs) => imgs?.['736x']?.url || imgs?.['474x']?.url || null;
    const v = pickVideo(p.videos?.video_list);
    if (v) out.push({ url: v });
    if (!out.length && p.story_pin_data?.pages?.length) {
      for (const page of p.story_pin_data.pages) {
        for (const block of page.blocks || []) {
          const bv = pickVideo(block.video?.video_list);
          if (bv) { out.push({ url: bv }); continue; }
          const img = block.image?.images;
          const u = img?.originals?.url || img?.orig?.url || img?.['736x']?.url;
          if (u) out.push({ url: u, fallback: img?.['736x']?.url });
        }
      }
    }
    if (!out.length && p.carousel_data?.carousel_slots?.length) {
      for (const s of p.carousel_data.carousel_slots) { const u = bestImage(s.images); if (u) out.push({ url: u, fallback: smallImage(s.images) }); }
    }
    if (!out.length) { const u = bestImage(p.images); if (u) out.push({ url: u, fallback: smallImage(p.images) }); }
    return out;
  }

  let ctrl = null; // aborts everything in flight when the user presses Stop
  const stopped = () => !!ctrl && ctrl.signal.aborted;
  const cancelError = () => Object.assign(new Error('Stopped'), { name: 'Cancel' });

  async function fetchMedia(url, attempt = 0) {
    if (stopped()) throw cancelError();
    try {
      const t = new AbortController(), timer = setTimeout(() => t.abort(), 120000);
      ctrl?.signal.addEventListener('abort', () => t.abort(), { once: true });
      let res;
      try { res = await fetch(url, { credentials: 'omit', signal: t.signal }); } finally { clearTimeout(timer); }
      if (res.status === 429 || res.status >= 500) throw Object.assign(new Error(`HTTP ${res.status}`), { retry: true });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return new Uint8Array(await res.arrayBuffer());
    } catch (e) {
      if (stopped()) throw cancelError();
      if ((e.retry || e.name === 'TimeoutError' || e.name === 'AbortError' || e.name === 'TypeError') && attempt < 3) { await sleep(800 * 2 ** attempt); return fetchMedia(url, attempt + 1); }
      throw e;
    }
  }

  /* ---------- helpers shared with the server version ---------- */
  function sanitize(name, fallback = 'Untitled') {
    const s = String(name ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim().replace(/^[.\s]+|[.\s]+$/g, '').slice(0, 80).trim();
    return s || fallback;
  }
  const extOf = (url) => { const m = new URL(url).pathname.match(/\.([a-z0-9]{2,5})$/i); return m ? m[1].toLowerCase() : 'jpg'; };
  const pinTitle = (p) => p.title?.trim() || p.grid_title?.trim() || p.auto_alt_text?.trim()?.slice(0, 60) || p.id;
  async function mapLimit(items, limit, fn) {
    let i = 0;
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => { while (i < items.length) { const k = i++; await fn(items[k], k); } }));
  }

  function toItem(p) {
    const media = pinMedia(p);
    const img = p.images || {};
    const thumb = img['474x']?.url || img['236x']?.url || img['736x']?.url || img.orig?.url || null;
    const hasVideo = media.some((m) => /\.(mp4|mov|m3u8)(\?|$)/i.test(m.url));
    const isGif = !hasVideo && media.some((m) => /\.gif(\?|$)/i.test(m.url));
    return { id: p.id, title: pinTitle(p), thumb, kind: hasVideo ? 'video' : isGif ? 'gif' : 'image', media };
  }

  const pinStore = new Map();
  function remember(scope, folder, item) {
    pinStore.set(`${scope}|${item.id}`, { item, folder });
    if (pinStore.size > 150000) pinStore.delete(pinStore.keys().next().value);
  }
  function findScope(info, scope) {
    const [type, id] = scope.split(':');
    const pre = info.kind === 'profile' ? sanitize(info.title, 'Pinterest') + '/' : '';
    for (const b of info.boards) {
      if (type === 'r' && b.id === id) return { board: b, section: null, folder: pre + sanitize(b.name) };
      for (const sec of b.sections || []) if (type === 's' && sec.id === id) return { board: b, section: sec, folder: `${pre}${sanitize(b.name)}/${sanitize(sec.title)}` };
    }
    throw new UserError('That section no longer exists. Reload the board.');
  }

  const cache = new Map();
  async function inspect(rawUrl) {
    const key = String(rawUrl).trim();
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < 15 * 60 * 1000) return hit.data;
    const target = await parseInput(rawUrl);
    let data;
    try {
      if (target.kind === 'profile') {
        const prof = await getProfile(target.username);
        if (!prof.boards.length) throw new UserError('This profile has no public boards.');
        await mapLimit(prof.boards, 4, async (b) => { b.sections = await getSections(b).catch(() => []); b.unsorted = unsortedCount(b); });
        data = { kind: 'profile', title: prof.name, boards: prof.boards };
      } else {
        const board = await getBoard(target.username, target.slug);
        if (target.kind === 'section') { board.sections = [await getSectionBySlug(board, target.sectionSlug)]; board.sectionOnly = true; }
        else { board.sections = await getSections(board); board.unsorted = unsortedCount(board); }
        data = { kind: target.kind, title: board.name, boards: [board] };
      }
    } catch (e) {
      if (e instanceof UserError && e.status === 404) throw new UserError("Couldn't find that on Pinterest. Check the link, and make sure the board is public (secret boards can't be downloaded).");
      throw e;
    }
    cache.set(key, { at: Date.now(), data });
    if (cache.size > 100) cache.delete(cache.keys().next().value);
    return data;
  }

  async function pins(url, scope, bookmark) {
    const info = await inspect(url);
    const { board, section, folder } = findScope(info, scope);
    const { pins: raw, next } = !section && board.sections?.length ? await mainPage(board, bookmark || undefined) : await pinsPage(board, section, bookmark || undefined);
    const items = raw.map(toItem);
    items.forEach((it) => remember(scope, folder, it));
    return { items: items.map(({ media, ...rest }) => ({ ...rest, files: media.length })), next };
  }

  /* ---------- zip (stored, in memory as Blob parts, ZIP64 when needed) ---------- */
  const CRC = new Uint32Array(256);
  for (let i = 0; i < 256; i++) { let c = i; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; CRC[i] = c >>> 0; }
  function crc32(u8) { let c = -1; for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; }

  class Zip {
    constructor() { this.parts = []; this.offset = 0; this.entries = []; this.names = new Set(); this.enc = new TextEncoder(); }
    uniqueName(name) {
      if (!this.names.has(name.toLowerCase())) { this.names.add(name.toLowerCase()); return name; }
      const slash = name.lastIndexOf('/'), dot = name.lastIndexOf('.');
      const base = dot > slash ? name.slice(0, dot) : name, ext = dot > slash ? name.slice(dot) : '';
      for (let i = 2; ; i++) { const n = `${base} (${i})${ext}`; if (!this.names.has(n.toLowerCase())) { this.names.add(n.toLowerCase()); return n; } }
    }
    add(name, data) {
      const nameBuf = this.enc.encode(name), crc = crc32(data), d = new Date();
      const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
      const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
      const h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
      h.setUint16(10, time, true); h.setUint16(12, date, true); h.setUint32(14, crc, true);
      h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, nameBuf.length, true); h.setUint16(28, 0, true);
      const entry = { nameBuf, crc, size: data.length, offset: this.offset, time, date };
      this.parts.push(h.buffer, nameBuf, new Blob([data])); // Blob lets the browser keep big data off the JS heap
      this.offset += 30 + nameBuf.length + data.length;
      this.entries.push(entry);
    }
    finish() {
      const cdStart = this.offset; let cdSize = 0;
      for (const e of this.entries) {
        const z64 = e.offset >= 0xffffffff;
        const c = new DataView(new ArrayBuffer(46 + (z64 ? 12 : 0)));
        c.setUint32(0, 0x02014b50, true); c.setUint16(4, (3 << 8) | 45, true); c.setUint16(6, z64 ? 45 : 20, true); c.setUint16(8, 0x0800, true);
        c.setUint16(12, e.time, true); c.setUint16(14, e.date, true); c.setUint32(16, e.crc, true);
        c.setUint32(20, e.size, true); c.setUint32(24, e.size, true); c.setUint16(28, e.nameBuf.length, true); c.setUint16(30, z64 ? 12 : 0, true);
        c.setUint32(38, (0o100644 << 16) >>> 0, true); c.setUint32(42, z64 ? 0xffffffff : e.offset, true);
        if (z64) { c.setUint16(46, 1, true); c.setUint16(48, 8, true); c.setBigUint64(50, BigInt(e.offset), true); }
        this.parts.push(c.buffer, e.nameBuf);
        cdSize += c.byteLength + e.nameBuf.length;
      }
      const count = this.entries.length, needZ64 = count >= 0xffff || cdStart >= 0xffffffff || cdSize >= 0xffffffff;
      if (needZ64) {
        const at = cdStart + cdSize;
        const r = new DataView(new ArrayBuffer(56 + 20));
        r.setUint32(0, 0x06064b50, true); r.setBigUint64(4, 44n, true); r.setUint16(12, (3 << 8) | 45, true); r.setUint16(14, 45, true);
        r.setBigUint64(24, BigInt(count), true); r.setBigUint64(32, BigInt(count), true); r.setBigUint64(40, BigInt(cdSize), true); r.setBigUint64(48, BigInt(cdStart), true);
        r.setUint32(56, 0x07064b50, true); r.setBigUint64(64, BigInt(at), true); r.setUint32(72, 1, true);
        this.parts.push(r.buffer);
      }
      const e = new DataView(new ArrayBuffer(22));
      e.setUint32(0, 0x06054b50, true); e.setUint16(8, Math.min(count, 0xffff), true); e.setUint16(10, Math.min(count, 0xffff), true);
      e.setUint32(12, needZ64 ? 0xffffffff : cdSize, true); e.setUint32(16, needZ64 ? 0xffffffff : cdStart, true);
      this.parts.push(e.buffer);
      return new Blob(this.parts, { type: 'application/zip' });
    }
  }

// Figma file: one SVG per folder with every image embedded. Drag it into Figma and each pin becomes its own image layer.
function imageSize(b) {
  try {
    if (b[0] === 0x89 && b[1] === 0x50) return [(b[16] << 24 | b[17] << 16 | b[18] << 8 | b[19]) >>> 0, (b[20] << 24 | b[21] << 16 | b[22] << 8 | b[23]) >>> 0];
    if (b[0] === 0x47 && b[1] === 0x49) return [b[6] | b[7] << 8, b[8] | b[9] << 8];
    if (b[0] === 0xff && b[1] === 0xd8) {
      for (let i = 2; i < b.length - 9;) {
        if (b[i] !== 0xff) { i++; continue; }
        const m = b[i + 1], len = b[i + 2] << 8 | b[i + 3];
        if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return [b[i + 7] << 8 | b[i + 8], b[i + 5] << 8 | b[i + 6]];
        i += 2 + len;
      }
    }
    if (b[0] === 0x52 && b[8] === 0x57) { // RIFF....WEBP
      const t = String.fromCharCode(b[12], b[13], b[14], b[15]);
      if (t === 'VP8X') return [1 + (b[24] | b[25] << 8 | b[26] << 16), 1 + (b[27] | b[28] << 8 | b[29] << 16)];
      if (t === 'VP8L') return [1 + ((b[21] | b[22] << 8) & 0x3fff), 1 + ((b[22] >> 6 | b[23] << 2 | b[24] << 10) & 0x3fff)];
      if (t === 'VP8 ') return [(b[26] | b[27] << 8) & 0x3fff, (b[28] | b[29] << 8) & 0x3fff];
    }
  } catch {}
  return null;
}
function figmaSvg(imgs, cols = 5, tile = 240, gap = 20) {
  const heights = Array(cols).fill(0), parts = [];
  imgs.forEach((im, i) => {
    const [w, h] = im.size || [3, 4], th = Math.max(40, Math.round(tile * h / w));
    const c = heights.indexOf(Math.min(...heights)), x = c * (tile + gap), y = heights[c];
    heights[c] += th + gap;
    parts.push(`<image id="${i + 1}" x="${x}" y="${y}" width="${tile}" height="${th}" preserveAspectRatio="none" href="data:${im.mime};base64,${im.b64}"/>`);
  });
  const W = cols * tile + (cols - 1) * gap, H = Math.max(...heights) - gap;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">\n${parts.join('\n')}\n</svg>\n`;
}
const FIGMA_MIME = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp' };
const FIGMA_MAX = 150; // per folder, keeps the file light enough for Figma


// Saves one file into a folder the user picked (File System Access API; Chrome, Brave, Edge).
async function saveToDir(dir, path, data) {
  const parts = path.split('/').filter((p) => p && p !== '.' && p !== '..'), file = parts.pop();
  for (const p of parts) dir = await dir.getDirectoryHandle(p, { create: true });
  const w = await (await dir.getFileHandle(file, { create: true })).createWritable();
  await w.write(data); await w.close();
}
async function pickFolder() {
  try { return await window.showDirectoryPicker({ mode: 'readwrite' }); }
  catch (e) { if (e.name === 'AbortError') throw Object.assign(new Error('Stopped'), { name: 'Cancel' }); return null; } // no picker here: caller falls back to a zip
}

  /* ---------- building the zip (same rules as the server) ---------- */
  async function buildZip(fields, onProgress, dir) {
    const info = await inspect(fields.url);
    const types = new Set((fields.types || 'image,gif,video').split(','));
    const selected = (fields.sel || '').split('\n').filter(Boolean);
    const exclude = new Set((fields.exclude || '').split('\n').filter(Boolean));
    const skip = new Set((fields.skip || '').split(',').filter(Boolean));
    const large = fields.quality === 'large', flat = fields.structure === 'flat', wantFigma = fields.figma === '1', onlySub = fields.structure === 'sub', figma = new Map();
    const naming = ['title', 'id'].includes(fields.naming) ? fields.naming : 'number';
    const multi = info.kind === 'profile', top = sanitize(info.title, 'Pinterest');

    const plan = [];
    {
      for (const b of info.boards) {
        const boardFolder = multi ? `${top}/${sanitize(b.name)}` : sanitize(b.name);
        for (const s of b.sections || []) if (!skip.has('s:' + s.id)) plan.push({ folder: onlySub ? sanitize(s.title) : `${boardFolder}/${sanitize(s.title)}`, board: b, section: s });
        if (!b.sectionOnly && !(onlySub && b.sections?.length) && (b.unsorted > 0 || !b.sections?.length) && !skip.has('r:' + b.id)) plan.push({ folder: boardFolder, board: b, root: true });
      }
      if (!plan.length && !selected.length) throw new UserError('Nothing selected.');
    }
    const progress = { done: 0, files: 0, failed: 0, estimate: Math.max(0, selected.length + plan.reduce((n, p) => n + (p.section ? p.section.pinCount : (p.board.unsorted ?? p.board.pinCount)), 0) - exclude.size), finished: false, error: null };
    class DirSink extends Zip {
      async add(name, data) { await saveToDir(dir, name, data); }
      finish() { return null; }
    }
    const zip = dir ? new DirSink() : new Zip(), failures = [];
    let flatIdx = 0;
    ctrl = new AbortController();

    async function* items() {
      for (const step of plan) {
        let index = 0;
        for await (const pin of allPins(step.board, step.section || null)) {
          if (stopped()) return;
          if (exclude.has(`${step.section ? 's:' + step.section.id : 'r:' + step.board.id}|${pin.id}`)) { progress.done++; continue; }
          const item = toItem(pin);
          if (!types.has(item.kind)) { progress.done++; continue; }
          yield { folder: step.folder, index: ++index, item };
        }
      }
      {
        const counters = new Map();
        for (const key of selected) {
          if (stopped()) return;
          const hit = pinStore.get(key);
          if (!hit) { progress.failed++; progress.done++; failures.push(`${key}\t\tselection expired, reload the board and select again`); continue; }
          if (!types.has(hit.item.kind)) { progress.done++; continue; }
          const index = (counters.get(hit.folder) || 0) + 1; counters.set(hit.folder, index);
          yield { folder: hit.folder, index, item: hit.item };
        }
      }
    }

    const gen = items();
    async function worker() {
      for (;;) {
        if (stopped()) return;
        const { value, done } = await gen.next();
        if (done) return;
        const item = value.item, folder = flat ? top : value.folder, index = flat ? ++flatIdx : value.index;
        const title = sanitize(sanitize(item.title, item.id).slice(0, 60), item.id);
        const base = naming === 'id' ? item.id : naming === 'title' ? title : `${String(index).padStart(4, '0')} - ${title}`;
        const media = item.media;
        for (let m = 0; m < media.length; m++) {
          const best = media[m].url, small = media[m].fallback;
          let url = large && small ? small : best, data;
          try { data = await fetchMedia(url); }
          catch (e) {
            const alt = url === best ? small : best;
            if (alt) { try { url = alt; data = await fetchMedia(url); } catch {} }
            if (!data) { progress.failed++; failures.push(`${folder}\thttps://www.pinterest.com/pin/${item.id}/\t${e.message}`); continue; }
          }
          const zname = zip.uniqueName(`${folder}/${base}${media.length > 1 ? ` (${m + 1})` : ''}.${extOf(url)}`);
          await zip.add(zname, data);
          if (wantFigma && FIGMA_MIME[extOf(url)]) {
            const list = figma.get(folder) || []; figma.set(folder, list);
            if (list.length < FIGMA_MAX) { const u8 = new Uint8Array(data); let bin = ''; for (let o = 0; o < u8.length; o += 0x8000) bin += String.fromCharCode.apply(null, u8.subarray(o, o + 0x8000)); list.push({ mime: FIGMA_MIME[extOf(url)], size: imageSize(u8), b64: btoa(bin) }); }
          }
          progress.files++;
        }
        if (!media.length) { progress.failed++; failures.push(`${folder}\thttps://www.pinterest.com/pin/${item.id}/\tno downloadable media`); }
        progress.done++;
        onProgress?.({ ...progress });
      }
    }
    try { await Promise.all(Array.from({ length: CONCURRENCY }, worker)); }
    catch (e) { if (stopped()) throw cancelError(); throw e; }
    if (stopped()) throw cancelError();
    if (failures.length) await zip.add('_failed.txt', new TextEncoder().encode('folder\tpin\treason\n' + failures.join('\n') + '\n'));
    if (wantFigma) for (const [folder, imgs] of figma) if (imgs.length) await zip.add(`${folder}/Figma file.svg`, new TextEncoder().encode(figmaSvg(imgs)));
    progress.finished = true; onProgress?.({ ...progress });
    return { blob: zip.finish(), name: `${top}.zip`, progress };
  }

  function save(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name; a.hidden = true;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 120000);
  }

  const engine = {
    kind: 'web',
    inspect,
    pins,
    async download(fields, onProgress) {
      const dir = fields.format === 'files' ? await pickFolder() : null;
      const { blob, name, progress } = await buildZip(fields, onProgress, dir);
      if (blob) save(blob, name);
      return progress;
    },
    stop() { ctrl?.abort(); },
    _buildZip: buildZip, // used by the tests
  };
  (typeof window !== 'undefined' ? window : globalThis).engine = engine;
})();
