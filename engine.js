// Web engine: the page talks to the Pinthia server. (The browser extension ships its own engine.js
// that does the same work inside the browser, so app.js runs unchanged in both.)
let current = null;
// Opened straight from disk (file://)? There is no server behind the page, so talk to the local one.
const API = location.protocol === 'file:' ? 'http://localhost:3000' : '';
const cancelError = () => Object.assign(new Error('Stopped'), { name: 'Cancel' });


// "Plain folder": the server (running on this computer) saves the files into Downloads. Anywhere else it sends a zip.
async function downloadFiles(fields, onProgress) {
  const job = crypto.randomUUID?.() || String(Math.random()).slice(2);
  const ctl = new AbortController(), me = (current = { job, cancelled: false, ctl });
  (async () => {
    while (!me.cancelled && !me.over) {
      try { const r = await fetch(API + '/api/progress?job=' + encodeURIComponent(job)); if (r.ok) onProgress(await r.json()); } catch {}
      await new Promise((r) => setTimeout(r, 1000));
    }
  })();
  try {
    const r = await fetch(API + '/api/download', { method: 'POST', signal: ctl.signal, headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ ...fields, job, format: 'files' }) });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Something went wrong.');
    let saved = false;
    if ((r.headers.get('Content-Type') || '').includes('json')) saved = true;
    else {
      const blob = await r.blob(), m = /filename\*=UTF-8''([^;]+)/.exec(r.headers.get('Content-Disposition') || '');
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = m ? decodeURIComponent(m[1]) : 'Pinterest.zip'; a.hidden = true;
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 120000);
    }
    me.over = true; current = null;
    const p = await fetch(API + '/api/progress?job=' + encodeURIComponent(job)).then((x) => x.json()).catch(() => ({ finished: true }));
    onProgress(p); return { ...p, saved };
  } catch (e) {
    me.over = true; current = null;
    if (me.cancelled || e.name === 'AbortError') throw cancelError();
    throw e;
  }
}

window.engine = {
  kind: 'web',

  async inspect(url) {
    return request('/api/inspect', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) });
  },

  async pins(url, scope, bookmark) {
    const q = new URLSearchParams({ url, scope });
    if (bookmark) q.set('bookmark', bookmark);
    return request('/api/pins?' + q);
  },

  // Starts a zip download in the browser's download manager and reports progress until it ends.
  download(fields, onProgress) {
    if (fields.format === 'files') return downloadFiles(fields, onProgress);
    const job = crypto.randomUUID?.() || String(Math.random()).slice(2);
    fields = { ...fields, job };
    let frame = document.getElementById('dlframe');
    if (!frame) { frame = document.createElement('iframe'); frame.id = frame.name = 'dlframe'; frame.hidden = true; document.body.appendChild(frame); }
    const form = document.createElement('form');
    form.method = 'POST'; form.action = API + '/api/download'; form.target = 'dlframe'; form.hidden = true;
    for (const [k, v] of Object.entries(fields)) { const i = document.createElement('input'); i.type = 'hidden'; i.name = k; i.value = v ?? ''; form.appendChild(i); }
    document.body.appendChild(form); form.submit(); form.remove();

    const started = Date.now();
    return new Promise((resolve, reject) => {
      current = { job, frame, reject, cancelled: false };
      const me = current;
      const tick = async () => {
        if (me.cancelled) return;
        let p = null;
        try { const r = await fetch(API + '/api/progress?job=' + encodeURIComponent(job)); p = r.ok ? await r.json() : null; } catch {}
        if (!p) {
          if (Date.now() - started > 20000) { me.cancelled = true; current = null; frame.src = 'about:blank'; return reject(new Error("Download didn't start. Try again.")); }
          return setTimeout(tick, 1000);
        }
        if (me.cancelled) return;
        onProgress(p);
        if (p.finished) { current = null; return p.error ? reject(new Error('The download stopped: ' + p.error)) : resolve(p); }
        setTimeout(tick, 1000);
      };
      tick();
    });
  },

  // Stops the running download: closes the zip stream in the browser and tells the server to quit.
  stop() {
    if (!current) return;
    const { job, frame, reject, ctl } = current;
    current.cancelled = true; current = null;
    if (frame) frame.src = 'about:blank';
    ctl?.abort();
    fetch(API + '/api/cancel?job=' + encodeURIComponent(job), { method: 'POST' }).catch(() => {});
    reject?.(cancelError());
  },
};

async function request(path, o) {
  let r;
  try { r = await fetch(API + path, o); }
  catch { throw new Error(API ? 'The Pinthia server is not running. Run "npm start" in the project folder, or open http://localhost:3000.' : "Can't reach the Pinthia server."); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'Something went wrong.');
  return j;
}
