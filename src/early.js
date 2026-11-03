/* Runs at document_start, before Schoology paints anything.
 * On the pages this extension redesigns it switches the page to the app look immediately, applies the saved colours, draws the
 * topographic background and shows a lightweight placeholder, so the original Schoology page can never flash while the main
 * scripts load. Safety net: if the main scripts never start, the page is handed back to Schoology after a few seconds. */
(() => {
  const html = document.documentElement;
  const p = location.pathname.replace(/\/+$/, '') || '/';
  const classic = /[?&]sgo=classic\b/.test(location.search); // the explicit "Open in Schoology" link: show the original page
  const C = window.SGO_COLOR, T = window.SGO_TOPO;
  const DEFAULTS = { accent: '#8aa8ff', contour: '#c9b79c', contourGlow: '#b97c3f', background: '#151311' };

  /* The four colours that define the look. They are CSS variables on <html>: the contour map, its glow, the page surface and every
   * interactive element read them, so a change here recolours the real paths and controls at once. The theme (light or dark UI)
   * follows the background colour, so text always has the right contrast. Also called by the app whenever a colour changes. */
  window.__sgoTheme = (prefs) => {
    const pick = (k) => C.normHex(prefs && prefs[k]) || DEFAULTS[k], st = html.style;
    const bg = pick('background'), accent = pick('accent');
    st.setProperty('--app-background', bg);
    st.setProperty('--contour-color', pick('contour'));
    st.setProperty('--contour-glow', pick('contourGlow'));
    st.setProperty('--accent', accent);
    st.setProperty('--on-accent', C.onAccent(accent));
    html.classList.toggle('sgo-dark', C.isDark(bg));
    // the map itself: shown or hidden, how dense and which seed (its blur is fixed in theme.css)
    html.dataset.sgoTopo = prefs && prefs.topoOn === false ? 'off' : 'on';
    st.setProperty('--topo-w', String({ thin: .55, standard: 1, bold: 1.9 }[(prefs && prefs.topoWeight) || 'standard'] || 1)); // line weight scales both the index and the ordinary contours
    buildLayer((prefs && prefs.topoDensity) || 'standard', Number(prefs && prefs.topoSeed) || 20260);
    buildArt(pick('contour'));
  };

  /* Small contour pieces for the hero, featured and hovered course cards, section dividers, the navigation rail and empty states.
   * Each is generated once from the same contour engine as the background, written as a data-URI image (so the dashboard repeats
   * no SVG markup) and exposed as a CSS variable. CSS decides where it shows, how strongly and under which mask. */
  const ART = { hero: [960, 360, 7311, 'light'], card: [560, 320, 4402, 'light'], divider: [1600, 90, 9121, 'light'], rail: [160, 220, 2207, 'light'], empty: [640, 240, 5530, 'light'] };
  let artKey = '';
  function buildArt(color) {
    if (artKey === color || !html.classList.contains('sgo-app')) return;
    artKey = color;
    for (const [name, [w, h, seed, density]] of Object.entries(ART)) {
      const m = T.build(w, h, seed, density);
      const paths = m.paths.map((x) => `<path d="${x.d}"${x.major ? '' : ' stroke-opacity="' + x.o + '"'}/>`).join('');
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" fill="none" stroke="${color}" stroke-width="1" stroke-linecap="round">${paths}</svg>`;
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
