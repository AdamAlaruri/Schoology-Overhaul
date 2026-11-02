/* Runs at document_start, before Schoology paints anything.
 * On the pages this extension redesigns it switches the page to the app look immediately, applies the saved colours and
 * shows a lightweight placeholder, so the original Schoology page can never flash while the main
 * scripts load. Safety net: if the main scripts never start, the page is handed back to Schoology after a few seconds. */
(() => {
  const html = document.documentElement;
  const p = location.pathname.replace(/\/+$/, '') || '/';
  const classic = /[?&]sgo=classic\b/.test(location.search); // the explicit "Open in Schoology" link: show the original page
  const C = window.SGO_COLOR;
  const DEFAULTS = { accent: '#2563eb', background: '#f8fafc' };

  /* Two colours define the look: the accent and a solid page background. They are CSS variables on <html>. The theme (light or dark UI)
   * follows the background colour, so text always has the right contrast. Also called by the app whenever a colour changes. */
  window.__sgoTheme = (prefs) => {
    const pick = (k) => C.normHex(prefs && prefs[k]) || DEFAULTS[k], st = html.style;
    const bg = pick('background'), accent = pick('accent');
    st.setProperty('--app-background', bg);
    st.setProperty('--accent', accent);
    st.setProperty('--on-accent', C.onAccent(accent));
    html.classList.toggle('sgo-dark', C.isDark(bg));
  };

  // Keep this list in step with routeFor() in app.js.
  const isApp = !classic && (p === '/home' || p === '/courses' || p === '/groups' || /^\/calendar(\/.*)?$/.test(p) || /^\/messages(\/sent|\/new|\/view\/\d+)?$/.test(p) || /^\/grades(\/grades)?$/.test(p) || /^\/course\/\d+(\/(materials|updates|student_grades|info))?$/.test(p));
  html.dataset.sgoT0 = String(Math.round(performance.now()));
  if (!isApp) { html.classList.add('sgo-native'); return; } // native pages keep their layout; the sidebar space is reserved up front

  html.classList.add('sgo-app', 'sgo-booting');
  window.__sgoTheme(null); // defaults first (light, blue), then the saved colours as soon as storage answers

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
