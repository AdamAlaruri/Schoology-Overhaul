/* Runs at document_start, before Schoology paints anything.
 * On the pages this extension redesigns it switches the page to the app look immediately and shows a lightweight
 * placeholder, so the original Schoology page can never flash while the main scripts load.
 * Safety net: if the main scripts never start, the page is handed back to Schoology after a few seconds. */
(() => {
  const html = document.documentElement;
  const p = location.pathname.replace(/\/+$/, '') || '/';
  const isApp = p === '/home' || p === '/courses' || p === '/calendar' || /^\/grades(\/grades)?$/.test(p);
  html.dataset.sgoT0 = String(Math.round(performance.now()));
  if (!isApp) { html.classList.add('sgo-native'); return; } // native pages keep their layout; the sidebar space is reserved up front

  const dark = matchMedia('(prefers-color-scheme: dark)').matches;
  html.classList.add('sgo-app', 'sgo-booting');
  html.classList.toggle('sgo-dark', dark);

  const boot = document.createElement('div');
  boot.id = 'sgo-boot';
  boot.setAttribute('aria-hidden', 'true');
  boot.innerHTML = '<div class="sgo-boot-side"><i class="b-logo"></i><i class="b-line"></i><i class="b-line"></i><i class="b-line"></i><i class="b-line"></i><i class="b-line"></i></div>' +
    '<div class="sgo-boot-main"><i class="b-h"></i><div class="b-cards"><i></i><i></i><i></i><i></i></div><i class="b-block"></i></div>';
  html.append(boot);

  const giveBack = () => { html.classList.remove('sgo-app', 'sgo-booting'); boot.remove(); };
  // Theme and layout preferences, applied as early as storage can answer (well before first paint).
  try {
    chrome.storage.local.get('sgo_prefs', (r) => {
      const prefs = r && r.sgo_prefs;
      if (!prefs) return;
      if (prefs.classic) { giveBack(); return; }
      const t = prefs.theme;
      html.classList.toggle('sgo-dark', t === 'dark' || (t === 'system' && dark) || (!t && dark));
      if (prefs.accent) html.style.setProperty('--accent', prefs.accent);
      html.classList.toggle('sgo-collapsed', !!prefs.collapsed);
    });
  } catch (e) { /* storage unavailable: keep defaults */ }

  setTimeout(() => { if (!document.getElementById('sgo-root')) giveBack(); }, 8000);
})();
