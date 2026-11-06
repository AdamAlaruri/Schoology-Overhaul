/* Native document reader. Opens a course file inside the app instead of Schoology's document-viewer popup.
 * The file is fetched same-origin with the signed-in session (like every other read here), turned into a blob in memory
 * and shown by the browser's own viewers: PDFs, images, video, audio and text. Anything else offers Download.
 * Nothing is uploaded and nothing is stored. */
(() => {
  const S = window.SGO;
  if (S.openDoc) return;
  const { h, icon } = S;

  const EXT_TYPE = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml',
    mp4: 'video/mp4', mov: 'video/mp4', webm: 'video/webm', mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4', txt: 'text/plain', csv: 'text/plain' };
  const extOf = (s) => (/\.([a-z0-9]{2,5})(?:[?#]|$)/i.exec(s || '') || [])[1]?.toLowerCase() || '';

  /** Schoology links documents through a viewer page (/attachment/ID/docviewer); the real bytes are at /attachment/ID/download. */
  S.docSource = (href) => {
    if (!href) return '';
    let u; try { u = new URL(href, location.origin); } catch (e) { return ''; }
    if (u.origin !== location.origin) return '';
    const m = /^\/attachment\/(\d+)\/(?:docviewer|view|preview)\b/.exec(u.pathname);
    return m ? `/attachment/${m[1]}/download` : u.pathname + u.search;
  };
  /** True for links the reader can handle: same-origin attachments and files. */
  S.isDocLink = (href) => /^\/?attachment\/\d+|\/attachment\/\d+\//i.test(S.docSource(href) || '');

  let current = null;
  const close = () => {
    if (!current) return;
    document.removeEventListener('keydown', current.onKey, true);
    if (current.url) URL.revokeObjectURL(current.url);
    current.root.remove(); document.documentElement.classList.remove('sgo-reading');
    const back = current.opener; current = null;
    if (back && back.isConnected) back.focus();
  };

  S.openDoc = async (opts) => {
    close();
    const src = S.docSource(opts.href), name = opts.name || 'Document';
    const body = h('div', { class: 'rd-body' }, h('div', { class: 'sgo-skel rd-skel' }));
    const actions = h('span', { class: 'rd-acts' });
    const root = h('div', { class: 'rd', role: 'dialog', 'aria-modal': 'true', 'aria-label': name },
      h('div', { class: 'rd-bar' },
        h('button', { class: 'sgo-btn ghost', type: 'button', onclick: close }, icon('left', 16), 'Back'),
        h('b', { class: 'rd-title' }, name), actions),
      body);
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
    document.addEventListener('keydown', onKey, true);
    const me = (current = { root, onKey, url: '', opener: document.activeElement });
    (S.modalHost || document.body).append(root); document.documentElement.classList.add('sgo-reading');
    const fail = (msg) => body.replaceChildren(h('div', { class: 'sgo-empty' }, h('div', { class: 'sgo-empty-t' }, 'This file could not be opened here'), h('div', { class: 'sgo-empty-s' }, msg),
      src ? h('a', { class: 'sgo-btn', href: src, download: name }, icon('download', 16), 'Download') : null));
    if (!src) return fail('There is no file address for it.');
    try {
      const r = await fetch(src, { credentials: 'same-origin' });
      if (r.status === 401 || (r.redirected && /\/login/.test(r.url))) { S.state.session = 'expired'; throw new Error('Your Schoology session has ended. Sign in again.'); }
      if (!r.ok) throw new Error('Schoology answered with HTTP ' + r.status + '.');
      const raw = await r.blob(), head = (r.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
      if (current !== me) return; // closed or replaced while loading
      const ext = extOf(opts.name) || extOf(r.url) || extOf(src);
      // The server often answers application/octet-stream; trust the file extension then.
      const type = (head && head !== 'application/octet-stream' && head !== 'binary/octet-stream' ? head : EXT_TYPE[ext]) || head || 'application/octet-stream';
      if (/^text\/html/.test(type)) throw new Error('Schoology returned a web page instead of the file.');
      const blob = raw.type === type ? raw : new Blob([raw], { type });
      const url = me.url = URL.createObjectURL(blob);
      let view;
      if (type === 'application/pdf') view = h('iframe', { class: 'rd-frame', src: url, title: name });
      else if (/^image\//.test(type)) view = h('div', { class: 'rd-media' }, h('img', { src: url, alt: name }));
      else if (/^video\//.test(type)) view = h('div', { class: 'rd-media' }, h('video', { src: url, controls: true }));
      else if (/^audio\//.test(type)) view = h('div', { class: 'rd-media' }, h('audio', { src: url, controls: true }));
      else if (/^text\//.test(type)) { view = h('pre', { class: 'rd-text' }, ''); blob.text().then((t) => { view.textContent = t.slice(0, 400000); }); }
      else return fail('Its type (' + (ext ? ext.toUpperCase() : type) + ') cannot be shown in the browser. Download it to open it in another app.'), actions.replaceChildren(h('a', { class: 'sgo-btn', href: url, download: name }, icon('download', 16), 'Download'));
      body.replaceChildren(view);
      actions.replaceChildren(
        h('a', { class: 'sgo-btn ghost', href: url, target: '_blank', rel: 'noopener' }, icon('external', 16), 'New tab'),
        h('a', { class: 'sgo-btn', href: url, download: name }, icon('download', 16), 'Download'));
    } catch (e) { if (current === me) fail(String(e.message || e)); }
  };

  /** Click handler for file links: plain left-clicks open the reader; modified clicks keep their normal meaning. */
  S.docClick = (opts) => (e) => {
    if (e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault(); S.openDoc(opts);
  };
})();
