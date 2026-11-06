/* Runs at document_start, before Schoology paints anything.
 * On the pages this extension redesigns it switches the page to the app look immediately, applies the saved colours, draws the
 * topographic background and shows a lightweight placeholder, so the original Schoology page can never flash while the main
 * scripts load. Safety net: if the main scripts never start, the page is handed back to Schoology after a few seconds. */
(() => {
  const html = document.documentElement;
  const p = location.pathname.replace(/\/+$/, '') || '/';
  const classic = /[?&]sgo=classic\b/.test(location.search); // the explicit "Open in Schoology" link: show the original page
  const C = window.SGO_COLOR, T = window.SGO_TOPO;
  const DEFAULTS = { accent: '#f0b46c', contour: '#d9b98a', contourGlow: '#c8843f', background: '#12100e' };
  const DARK_BG = '#12100e', DARK_ACCENT = '#f0b46c';

  /* The four colours that define the look. They are CSS variables on <html>: the contour map, its glow, the page surface and every
   * interactive element read them, so a change here recolours the real paths and controls at once. The theme (light or dark UI)
   * follows the background colour, so text always has the right contrast. Also called by the app whenever a colour changes. */
  const rgbOf = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const mixTo = (hex, to, p) => { const A = rgbOf(hex), B = rgbOf(to); return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * p).toString(16).padStart(2, '0')).join(''); };
  /** The chosen accent, adjusted only as much as needed to reach 4.5:1 on the background: darker on light pages, lighter on dark ones. */
  const fitAccent = (accent, bg) => {
    if (C.contrast(accent, bg) >= 4.5) return accent;
    const to = C.isDark(bg) ? '#ffffff' : '#000000';
    for (let p = 0.04; p <= 1; p += 0.04) { const c = mixTo(accent, to, p); if (C.contrast(c, bg) >= 4.5) return c; }
    return C.isDark(bg) ? DARK_ACCENT : '#1769d6';
  };
  window.__sgoTheme = (prefs) => {
    const pick = (k) => C.normHex(prefs && prefs[k]) || DEFAULTS[k], st = html.style;
    // Theme mode: 'light', 'dark' or 'system' override the saved background's brightness; unset keeps whatever the student's colours imply.
    const mode = prefs && prefs.themeMode, sysDark = !!(window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
    const wantDark = mode === 'dark' || (mode === 'system' && sysDark), wantLight = mode === 'light' || (mode === 'system' && !sysDark);
    let bg = pick('background'), accent = pick('accent');
    if (wantDark && !C.isDark(bg)) bg = DARK_BG; else if (wantLight && C.isDark(bg)) bg = '#f8fafc';
    accent = fitAccent(accent, bg); // an accent that cannot be read on this background keeps its hue and is darkened or lightened until it can
    st.setProperty('--app-background', bg);
    st.setProperty('--contour-color', pick('contour'));
    st.setProperty('--contour-glow', pick('contourGlow'));
    st.setProperty('--accent', accent);
    st.setProperty('--on-accent', C.onAccent(accent));
    html.classList.toggle('sgo-dark', C.isDark(bg));
    // the map itself: shown or hidden, how dense and which seed (its blur is fixed in theme.css)
    html.classList.toggle('sgo-compact', !!(prefs && prefs.density === 'compact')); // spacing only; type size and layout stay the same
    html.dataset.sgoTopo = prefs && prefs.topoOn === false ? 'off' : 'on';
    // accessibility: text size, high contrast and reduced motion are plain classes, so they apply before first paint
    html.classList.toggle('sgo-contrast', !!(prefs && prefs.highContrast));
    html.classList.toggle('sgo-reduce-motion', !!(prefs && prefs.reduceMotion));
    html.classList.toggle('sgo-text-lg', !!(prefs && prefs.textSize === 'lg'));
    html.classList.toggle('sgo-text-xl', !!(prefs && prefs.textSize === 'xl'));
    st.setProperty('--topo-w', String({ thin: .55, standard: 1, bold: 1.9 }[(prefs && prefs.topoWeight) || 'standard'] || 1)); // line weight scales both the index and the ordinary contours
    buildLayer((prefs && prefs.topoDensity) || 'standard', Number(prefs && prefs.topoSeed) || 20260);
    buildArt(pick('contour'), prefs);
  };

  /* Small contour pieces for the hero, featured and hovered course cards, section dividers, the navigation rail and empty states.
   * Each is generated once from the same contour engine as the background, written as a data-URI image (so the dashboard repeats
   * no SVG markup) and exposed as a CSS variable. CSS decides where it shows, how strongly and under which mask. */
  const ART = { hero: [960, 360, 7311], card: [560, 320, 4402], divider: [1600, 90, 9121], rail: [160, 220, 2207], empty: [640, 240, 5530] };
  let artKey = '';
  /** The small contour pieces follow the map settings: line density, line weight and which map (the seed), as well as the colour. */
  function buildArt(color, prefs) {
    if (!html.classList.contains('sgo-app')) return;
    const dens = (prefs && prefs.topoDensity) || 'standard', wKey = (prefs && prefs.topoWeight) || 'standard', seedPref = Number(prefs && prefs.topoSeed) || 20260;
    const key = [color, dens, wKey, seedPref].join('|');
    if (artKey === key) return;
    artKey = key;
    const sw = { thin: 0.55, standard: 1, bold: 1.9 }[wKey] || 1, shift = seedPref - 20260;
    for (const [name, [w, h, seed]] of Object.entries(ART)) {
      const m = T.build(w, h, seed + shift, 'small-' + (['light', 'standard', 'dense'].includes(dens) ? dens : 'standard'));
      const paths = m.paths.map((x) => `<path d="${x.d}"${x.major ? '' : ' stroke-opacity="' + x.o + '"'}/>`).join('');
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round">${paths}</svg>`;
      html.style.setProperty('--topo-' + name, `url("data:image/svg+xml,${encodeURIComponent(svg)}")`);
    }
  }

  /* One fixed full-viewport SVG behind everything. The geometry is generated once (see topo.js) and kept for the page's life. */
  let drawn = '', want = null, timer = 0, firstBuild = true;
  function buildLayer(density, seed) {
    if (!html.classList.contains('sgo-app') && !document.getElementById('sgo-bg')) return; // plain Schoology pages never get the map
    let el = document.getElementById('sgo-bg');
    if (!el) { el = document.createElement('div'); el.id = 'sgo-bg'; el.setAttribute('aria-hidden', 'true'); html.append(el); }
    want = [density, seed];
    if (density + ':' + seed === drawn) return; // the same map is never rebuilt
    clearTimeout(timer);
    // The first map waits a moment so the interface paints first and the saved settings arrive (one build instead of two), then fades in.
    // Changes made later, in Settings, apply at once.
    timer = setTimeout(() => {
      const [d, s] = want, key = d + ':' + s;
      if (key === drawn) return;
      drawn = key;
      el.innerHTML = T.svg(1600, 900, s, d);
      if (firstBuild) { firstBuild = false; setTimeout(() => el.classList.add('ready'), 30); } else el.classList.add('ready');
    }, firstBuild ? 100 : 0);
  }

  // Keep this list in step with routeFor() in app.js.
  const isApp = !classic && (p === '/home' || p === '/courses' || p === '/groups' || /^\/calendar(\/.*)?$/.test(p) || /^\/messages(\/sent|\/new|\/view\/\d+)?$/.test(p) || /^\/grades(\/grades)?$/.test(p) || /^\/course\/\d+(\/(materials|updates|student_grades|info))?$/.test(p));
  html.dataset.sgoT0 = String(Math.round(performance.now()));
  if (!isApp) { html.classList.add('sgo-native'); return; } // native pages keep their layout; the sidebar space is reserved up front

  html.classList.add('sgo-app', 'sgo-booting');
  window.__sgoTheme(null); // defaults first (black, blue), then the saved colours as soon as storage answers

  const boot = document.createElement('div');
  boot.id = 'sgo-boot';
  boot.setAttribute('aria-hidden', 'true');
  boot.innerHTML = '<div class="sgo-boot-side"><i class="b-logo"></i><i class="b-line"></i><i class="b-line"></i><i class="b-line"></i><i class="b-line"></i><i class="b-line"></i></div>' +
    '<div class="sgo-boot-main"><i class="b-h"></i><div class="b-cards"><i></i><i></i><i></i><i></i></div><i class="b-block"></i></div>';
  html.append(boot);

  const giveBack = () => { html.classList.remove('sgo-app', 'sgo-booting'); boot.remove(); };
  try {
    chrome.storage.local.get('sgo_prefs', (r) => {
      const prefs = r && r.sgo_prefs;
      if (!prefs) return;
      if (prefs.classic) { giveBack(); return; }
      window.__sgoTheme(prefs);
      html.classList.toggle('sgo-collapsed', !!prefs.collapsed);
    });
  } catch (e) { /* storage unavailable: keep defaults */ }

  setTimeout(() => { if (!document.getElementById('sgo-root')) giveBack(); }, 8000);
})();
