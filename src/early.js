/* Runs at document_start, before Schoology paints anything.
 * On the pages this extension redesigns it switches the page to the app look immediately and shows a lightweight
 * placeholder, so the original Schoology page can never flash while the main scripts load.
 * Safety net: if the main scripts never start, the page is handed back to Schoology after a few seconds. */
(() => {
  const html = document.documentElement;
  const p = location.pathname.replace(/\/+$/, '') || '/';
  const classic = /[?&]sgo=classic\b/.test(location.search); // the explicit "Open in Schoology" link: show the original page

  /* Background behind the whole interface: one fixed layer (#sgo-bg) holding three soft blurred lights, or a picture,
   * or a solid colour. Everything is driven by CSS variables on <html>. The default is "ambient": the blob colours are generated
   * from the application's accent colour and the active theme (see ambient.js), and change smoothly when either changes.
   * The main scripts reuse these functions when the person changes the background, the accent or the theme. */
  const ctx = (window.__sgoCtx = window.__sgoCtx || { accent: '', dark: false });
  const isAmbient = (b) => b && (b.kind === 'auto' || b.kind === 'default' || b.kind === 'ambient');
  let last = null;
  const buildLayer = () => {
    if (document.getElementById('sgo-bg')) return;
    const el = document.createElement('div'); el.id = 'sgo-bg'; el.setAttribute('aria-hidden', 'true');
    /* Fixed, hand-authored SVG geometry: independent organic regions and nested Bézier contours. */
    el.innerHTML = `<svg class="sgo-topographic" viewBox="0 0 1920 1080" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs><filter id="sgo-contour-glow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="5"/></filter></defs>
      <g class="contour-glow"><path d="M-90 242C126 22 326 328 555 160S986 10 1172 207s357 52 558-104 309-14 286 75"/></g>
      <g class="contour deep"><path d="M-90 242C126 22 326 328 555 160S986 10 1172 207s357 52 558-104 309-14 286 75"/><path d="M-60 286C148 66 339 370 568 204S982 55 1158 247s370 54 578-96 288-8 264 76"/><path d="M-28 330C170 110 354 411 581 247S980 102 1144 288s383 56 598-87 267-2 242 77"/><path d="M4 374C192 154 369 452 594 290S978 149 1130 329s396 58 618-78 246 4 220 78"/></g>
      <g class="contour mid"><path d="M1225 168c112-104 327-105 457 4 143 120 107 335-54 425-159 89-390 27-447-149-37-114-13-207 44-280Z"/><path d="M1262 204c103-80 292-83 405 12 117 99 86 274-48 347-133 72-323 21-370-127-30-95-9-171 13-232Z"/><path d="M1296 239c86-58 239-62 334 18 94 80 68 214-43 269-108 54-260 15-299-103-25-73-9-130 8-184Z"/><path d="M1329 273c68-38 186-42 260 22 71 61 49 158-35 199-82 40-194 9-224-76-19-54-7-96-1-145Z"/></g>
      <g class="contour fine"><path d="M116 708c142-119 359-95 474 33 115 128 53 343-119 405-173 62-383-42-408-220-15-105 2-164 53-218Z"/><path d="M155 740c123-93 309-74 405 35 94 107 42 284-102 334-142 49-309-36-331-183-13-84 1-132 28-186Z"/><path d="M193 772c102-69 253-55 331 36 76 88 32 228-84 268-114 39-246-30-264-147-10-64 1-102 17-157Z"/><path d="M230 803c80-47 198-37 259 37 59 70 24 176-67 206-90 29-190-24-202-113-7-46 2-76 10-130Z"/><path d="M782 820c144-122 353-82 450 49 92 124 23 313-141 363-158 48-336-56-348-219-7-88 3-142 39-193Z"/><path d="M821 850c117-92 287-61 365 48 73 102 17 252-115 290-126 36-266-49-276-180-5-68 4-108 26-158Z"/></g>
    </svg><div class="amb"><i></i><i></i><i></i></div>`;
    html.append(el);
  };
  const paintAmbient = () => {
    const A = window.SGO_AMBIENT, b = last || {};
    html.dataset.sgoBg = isAmbient(b) ? 'ambient' : b.kind === 'color' ? 'color' : b.kind === 'topographic' ? 'topographic' : 'image';
    if (!A || !isAmbient(b)) return;
    // the accent: what the app says it is, else whatever the --accent custom property currently resolves to, else the brand cyan
    const accent = A.parse(ctx.accent) ? ctx.accent : getComputedStyle(html).getPropertyValue('--accent');
    const p = A.palette(accent, ctx.dark, b.kind === 'ambient' ? b.id : 'auto', b.intensity);
    html.style.setProperty('--amb-base', p.base);
    p.colors.forEach((c, i) => html.style.setProperty('--amb-' + (i + 1), c));
    html.style.setProperty('--amb-blur', 50 + (b.ambBlur == null ? 8 : b.ambBlur) * 4 + 'px');
  };
  window.__sgoAmbient = paintAmbient;
  window.__sgoBg = (bg) => {
    last = bg || { kind: 'topographic' };
    const set = (k, v) => (v == null || v === '' ? html.style.removeProperty(k) : html.style.setProperty(k, v));
    const b = last, picture = !isAmbient(b);
    set('--bgi', !picture ? '' : b.kind === 'color' ? 'none' : b.css || '');
    set('--bgc', !picture ? '' : b.kind === 'color' ? b.color : b.kind === 'preset' ? b.color || '' : '');
    set('--bgs', picture ? b.size || '' : '');
    set('--bg-blur', picture && b.blur != null ? b.blur + 'px' : '');
    set('--bg-bright', picture && b.bright != null ? String(b.bright) : '');
    set('--bg-overlay', b.overlay == null ? '' : String(b.overlay));
    buildLayer(); paintAmbient();
  };

  // Keep this list in step with routeFor() in app.js.
  const isApp = !classic && (p === '/home' || p === '/home/recent-activity' || p === '/courses' || p === '/groups' || /^\/calendar(\/.*)?$/.test(p) || /^\/messages(\/sent|\/view\/\d+)?$/.test(p) || /^\/grades(\/grades)?$/.test(p) || /^\/course\/\d+(\/(materials|updates|student_grades|info))?$/.test(p));
  html.dataset.sgoT0 = String(Math.round(performance.now()));
  if (!isApp) { html.classList.add('sgo-native'); return; } // native pages keep their layout; the sidebar space is reserved up front

  const dark = matchMedia('(prefers-color-scheme: dark)').matches;
  html.classList.add('sgo-app', 'sgo-booting');
  html.classList.toggle('sgo-dark', dark); ctx.dark = dark;
  window.__sgoBg(null);

  const boot = document.createElement('div');
  boot.id = 'sgo-boot';
  boot.setAttribute('aria-hidden', 'true');
  boot.innerHTML = '<div class="sgo-boot-side"><i class="b-logo"></i><i class="b-line"></i><i class="b-line"></i><i class="b-line"></i><i class="b-line"></i><i class="b-line"></i></div>' +
    '<div class="sgo-boot-main"><i class="b-h"></i><div class="b-cards"><i></i><i></i><i></i><i></i></div><i class="b-block"></i></div>';
  html.append(boot);

  const giveBack = () => { html.classList.remove('sgo-app', 'sgo-booting'); boot.remove(); };
  // Theme, layout and background preferences, applied as early as storage can answer (well before first paint).
  try {
    chrome.storage.local.get(['sgo_prefs', 'sgo_bg'], (r) => {
      const prefs = r && r.sgo_prefs;
      if (prefs && prefs.classic) { giveBack(); return; }
      if (prefs) {
        const t = prefs.theme;
        html.classList.toggle('sgo-dark', ctx.dark = t === 'dark' || (t === 'system' && dark) || (!t && dark));
        if (prefs.accent && (prefs.designV >= 3 || (prefs.accent !== '#5b6cff' && prefs.accent !== '#2f8f83'))) { html.style.setProperty('--accent', prefs.accent); ctx.accent = prefs.accent; } // an old default accent is replaced once the main script migrates it
        html.classList.toggle('sgo-collapsed', !!prefs.collapsed);
      }
      window.__sgoBg(r && r.sgo_bg ? r.sgo_bg : null);
    });
  } catch (e) { /* storage unavailable: keep defaults */ }

  setTimeout(() => { if (!document.getElementById('sgo-root')) giveBack(); }, 8000);
})();
