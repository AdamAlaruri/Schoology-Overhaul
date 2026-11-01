/* App shell: sidebar, router, theme, live-page observer.
 * Native Schoology DOM is never removed — only hidden on redesigned pages — so its scripts,
 * forms and authentication keep working, and "Classic view" is one click away. */
(() => {
  const S = window.SGO;
  if (S.app) return;
  S.app = true;
  const { h, icon } = S;
  const html = document.documentElement;
  let root, side, main, content, top;

  S.TOP_LINKS = [['portal', 'Portal'], ['help', 'Help']];
  const linkTo = (k) => (S.prefs.topLinks || {})[k] || '/home#/settings'; // unset school links open Settings, where they can be added
  const RAIL = () => [
    ['dashboard', 'Dashboard', 'home', '/home'],
    ['courses', 'Courses', 'book', '/courses'],
    ['groups', 'Groups', 'groups', '/groups'],
    ['calendar', 'Calendar', 'calendar', '/calendar'],
    ['inbox', 'Inbox', 'inbox', '/messages'],
    ['history', 'History', 'clock', '/home/recent-activity'],
    ['help', 'Help', 'help', linkTo('help')],
    ['settings', 'Accessibility', 'access', '/home#/settings'],
  ];

  /* ---------- routing ---------- */
  function routeFor(loc) {
    const p = loc.pathname.replace(/\/+$/, '') || '/';
    if (p === '/home') {
      const hp = S.parseHash(loc.hash);
      if (hp.path.startsWith('/a/')) return 'assignment';
      if (hp.path === '/assignments') return 'assignments';
      if (hp.path === '/settings') return 'settings';
      return 'dashboard';
    }
    if (/[?&]sgo=classic\b/.test(loc.search)) return null; // explicit link to Schoology's own page
    if (p === '/courses') return 'courses';
    if (S.courseRoute(loc)) return 'course';
    if (/^\/calendar(\/.*)?$/.test(p)) return 'calendar';
    if (/^\/messages(\/sent|\/view\/\d+)?$/.test(p)) return 'inbox'; // compose (/messages/new) stays on Schoology's own page
    if (p === '/home/recent-activity') return 'history';
    if (p === '/groups') return 'groups'; // a single group (/group/ID) opens on Schoology's own page
    if (/^\/grades(\/grades)?$/.test(p)) return 'grades';
    return null;
  }
  const route = () => routeFor(location);
  const navKey = (r) => { const p = location.pathname; return r === 'course' ? 'courses' : r || (/^\/course\//.test(p) ? 'courses' : /^\/groups?\b/.test(p) ? 'groups' : /^\/messages/.test(p) ? 'inbox' : /^\/home\/recent-activity/.test(p) ? 'history' : ''); };
  const TITLES = { dashboard: 'Dashboard', courses: 'Courses', assignments: 'Assignments', assignment: 'Assignment', calendar: 'Calendar', grades: 'Grades', settings: 'Settings', inbox: 'Inbox', groups: 'Groups', history: 'History' };

  /* ---------- theme: S.applyTheme (core.js) applies the four saved colours; the UI theme follows the background colour ---------- */
  const themeToggle = () => { const dark = html.classList.contains('sgo-dark'), id = dark ? 'paper' : 'midnight', t = S.THEME_PRESETS.find((x) => x.id === id); S.setAppearance({ accent: t.accent, contour: t.contour, contourGlow: t.contourGlow, background: t.background }); S.render(true); };

  /* ---------- hide native content but keep it alive ---------- */
  function clearHidden() {
    document.querySelectorAll('[data-sgo-hide]').forEach((e) => e.removeAttribute('data-sgo-hide'));
    document.querySelectorAll('[data-sgo-chain]').forEach((e) => e.removeAttribute('data-sgo-chain'));
    html.style.removeProperty('--sgo-top');
  }
  /* The native Schoology top bar is removed entirely. Its links live in the sidebar and Classic view keeps them. */
  function hideNative() {
    clearHidden();
    html.style.setProperty('--sgo-top', '0px');
  }

  /* ---------- shell ---------- */
  function buildShell() {
    root = h('div', { id: 'sgo-root', class: 'sgo' });
    S.modalHost = h('div', { class: 'sgo-mh' });
    document.body.append(root);
  }

  function sidebar(r) {
    const active = navKey(r), who = S.prefs.displayName || S.state.user || '';
    const initials = who.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase() || 'Me';
    const face = S.state.avatar ? h('img', { class: 'sgo-face', src: S.state.avatar, alt: '' }) : h('span', { class: 'sgo-face' }, initials);
    const account = S.menu('Account' + (who ? ': ' + who : ''), [
      ['Assignments', () => S.go('/home#/assignments')], ['Grades', () => S.go('/grades/grades')], ['Resources', () => S.go('/resources')],
      ['Extension settings', () => S.go('/home#/settings')], ['Schoology account', () => S.go('/settings/account')],
      ['Classic view', () => { S.prefs.classic = true; S.savePrefs(); S.render(); }], ['Sign out', () => S.go('/logout')],
    ], h('button', { class: 'sgo-rail-i', type: 'button' }, face, h('span', null, 'Account')));
    const collapsed = !!S.prefs.collapsed;
    return h('nav', { class: 'sgo-rail', 'aria-label': 'Main' }, account,
      RAIL().map(([k, label, ic, href]) => h('a', { class: 'sgo-rail-i', href, 'aria-current': active === k ? 'page' : null, title: label, target: /^https?:/.test(href) ? '_blank' : null, rel: /^https?:/.test(href) ? 'noopener' : null }, icon(ic, 21), h('span', null, label),
        k === 'inbox' && S.state.unread.messages ? h('b', { class: 'sgo-rail-n', 'aria-label': `${S.state.unread.messages} unread` }, S.state.unread.messages) : null)),
      h('button', { class: 'sgo-rail-tog', type: 'button', 'aria-expanded': String(!collapsed), 'aria-label': collapsed ? 'Expand navigation' : 'Collapse navigation', dataset: { fk: 'rail-toggle' },
        onclick: () => { S.prefs.collapsed = !collapsed; S.savePrefs(); S.applyTheme(); S.render(true); } }, icon('left', 17)));
  }

  function topbar() {
    const q = h('input', { class: 'sgo-input sgo-search', type: 'search', placeholder: 'Search assignments…', 'aria-label': 'Search assignments',
      onkeydown: (e) => { if (e.key === 'Enter') { S.ui.assign.q = e.target.value; S.ui.assign.f = 'all'; S.ui.assign.course = ''; S.go('/home#/assignments'); S.render(); } } });
    const dark = html.classList.contains('sgo-dark');
    const links = [['Home', '/home'], ...S.TOP_LINKS.filter(([k]) => k !== 'help').map(([k, label]) => [label, linkTo(k)])];
    return h('div', { class: 'sgo-top' }, q,
      h('nav', { class: 'sgo-toplinks', 'aria-label': 'Site links' }, links.map(([t, href]) => h('a', { href, target: /^https?:/.test(href) ? '_blank' : null, rel: /^https?:/.test(href) ? 'noopener' : null }, t))),
      h('button', { class: 'sgo-icon-btn', title: 'Refresh data', onclick: () => S.hardRefresh() }, icon('reload', 18)),
      h('button', { class: 'sgo-icon-btn', title: dark ? 'Light mode' : 'Dark mode', onclick: themeToggle }, icon(dark ? 'sun' : 'moon', 18)));
  }

  /** Shown when a request reveals that the Schoology session has ended. Existing data stays visible. */
  function banner() {
    if (S.state.session !== 'expired') return null;
    return h('div', { class: 'sgo-banner', role: 'status' }, h('span', null, 'Your Schoology session has expired, so data cannot refresh. What you see is the last saved copy.'),
      h('a', { href: '/login' }, 'Sign in again'));
  }

  /* ---------- render ---------- */
  let lastRoute = '__init', lastSig = '';
  S.render = (keepFocus) => {
    if (!root) return;
    const r = route(), ae = document.activeElement, hadSearch = keepFocus && ae && ae.type === 'search' && root.contains(ae) && ae.classList.contains('sgo-input') && !ae.classList.contains('sgo-search');
    const sel = hadSearch ? ae.selectionStart : 0, scroll = content ? content.scrollTop : 0;
    // Everything is rebuilt, so remember what had keyboard focus and put it back afterwards.
    const fk = ae && root.contains(ae) && ae.dataset ? ae.dataset.fk : '';

    if (S.prefs.classic) {
      html.classList.remove('sgo-app', 'sgo-native'); clearHidden(); lastRoute = null;
      root.replaceChildren(h('button', { class: 'sgo-pill-btn', onclick: () => { S.prefs.classic = false; S.savePrefs(); S.render(); } }, icon('home', 16), 'Back to new design'));
      return;
    }
    const entering = r && (lastRoute === null || lastRoute === '__init' || S.needRelayout);
    if (entering) { S.needRelayout = false; hideNative(); }
    html.classList.toggle('sgo-app', !!r);
    html.classList.toggle('sgo-native', !r);
    const cm = /^\/course\/(\d+)/.exec(location.pathname);
    const cc = cm ? S.courseColor(cm[1], (S.state.courses.find((c) => c.id === cm[1]) || {}).name) : S.prefs.accent;
    html.style.setProperty('--course', cc);
    if (!r && lastRoute !== null) clearHidden();
    lastRoute = r;

    if (!r) {
      html.style.setProperty('--sgo-top', '0px');
      root.replaceChildren(sidebar(null)); return;
    }

    let view;
    try { view = S.views[r]({ path: S.parseHash().path, q: S.parseHash().q }); }
    catch (e) { console.error('[Schoology Overhaul]', e); view = h('div', { class: 'sgo-page' }, h('div', { class: 'sgo-empty' }, h('div', { class: 'sgo-empty-t' }, 'Something went wrong drawing this page'), h('div', { class: 'sgo-empty-s' }, 'Use Classic view in the sidebar to keep working.'))); }
    document.title = (S._title || TITLES[r] || 'Schoology') + ' · Schoology'; S._title = '';
    const sig = r + '|' + location.pathname + location.search + '|' + S.parseHash().path;
    content = h('main', { class: 'sgo-content' + (sig !== lastSig ? ' animate' : ''), id: 'sgo-content' }, view);
    if (sig !== lastSig && (r === 'course' || r === 'assignment') && S._logTitle) S.logVisit(r, S._logTitle, location.pathname + location.search + (r === 'assignment' ? location.hash : ''));
    S._logTitle = '';
    lastSig = sig;
    root.replaceChildren(sidebar(r), h('div', { class: 'sgo-main' }, topbar(), banner(), content), S.modalHost);
    content.scrollTop = content.classList.contains('animate') ? 0 : scroll; // a different page starts at the top
    if (hadSearch) { const i = content.querySelector('input[type=search]'); if (i) { i.focus(); try { i.setSelectionRange(sel, sel); } catch (e) { /* ignore */ } } }
    if (fk) { const el = root.querySelector(`[data-fk="${CSS.escape(fk)}"]`) || root.querySelector('[data-fk-fallback]'); if (el) el.focus({ preventScroll: true }); }
  };

  S.hardRefresh = async () => {
    S.state.loading = true; S.render(true);
    const r = route() || 'native';
    S.scrapeLive(document, hostIsHome);
    if (S.resetSocial) S.resetSocial();
    await S.refresh(r, { force: true });
    S.render(true);
  };

  // Client-side navigation changes the URL but not the document, so remember which Schoology page is really loaded.
  const hostIsHome = location.pathname.replace(/\/+$/, '') === '/home';

  /* ---------- live observer (Schoology fills its page asynchronously) ---------- */
  let obs, obsStop;
  function observe() {
    if (obs) obs.disconnect();
    const scrape = S.debounce(() => { if (S.scrapeLive(document, hostIsHome)) S.render(true); }, 700);
    obs = new MutationObserver((muts) => { if (muts.some((m) => !root.contains(m.target))) scrape(); });
    obs.observe(document.body, { childList: true, subtree: true });
    clearTimeout(obsStop); obsStop = setTimeout(() => obs && obs.disconnect(), 60000);
    scrape();
  }

  /* ---------- boot & navigation ---------- */
  let lastHref = location.href;
  function onNav() {
    if (location.href === lastHref) return;
    lastHref = location.href; S.closeModal(); S.render(); observe();
    const r = route();
    if (r) S.refresh(r).then((changed) => { if (changed || S.state.session !== 'ok') S.render(true); }); // cache-aware: usually no request at all
  }
  /** Client-side navigation between app pages: no reload, no flash, the shell stays mounted. */
  S.navigate = (href) => {
    const u = new URL(href, location.href);
    if (u.origin !== location.origin || !routeFor(u)) { location.href = u.href; return; }
    if (u.href !== location.href) history.pushState(null, '', u.pathname + u.search + u.hash);
    onNav();
  };
  function interceptLinks() {
    root.addEventListener('click', (e) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const link = e.target.closest && e.target.closest('a[href]');
      if (!link || link.target === '_blank' || link.hasAttribute('download')) return;
      let u; try { u = new URL(link.href, location.href); } catch (x) { return; }
      if (u.origin !== location.origin || !routeFor(u)) return; // anything else (course pages, Schoology pages) navigates normally
      e.preventDefault();
      S.navigate(u.href);
    });
  }

  /* False once the extension has been reloaded or removed; the old script must then stop touching the page. */
  const alive = () => { try { return typeof chrome === 'undefined' || !chrome.runtime || !!chrome.runtime.id; } catch (e) { return false; } };

  /* Other tabs write the same storage keys. Adopt their changes so this tab never overwrites them with stale data. */
  function syncAcrossTabs() {
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.onChanged) return;
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      let redraw = false;
      if (changes.sgo_prefs && changes.sgo_prefs.newValue) {
        const next = Object.assign(S.DEFAULTS(), changes.sgo_prefs.newValue);
        if (JSON.stringify(next) !== JSON.stringify(S.prefs)) { S.prefs = next; redraw = true; }
      }
      if (changes.sgo_cache && changes.sgo_cache.newValue) redraw = S.adoptCache(changes.sgo_cache.newValue) || redraw;
      if (redraw) { S.applyTheme(); S.render(true); }
    });
  }

  (async function boot() {
    const unboot = () => { document.documentElement.classList.remove('sgo-booting'); const b = document.getElementById('sgo-boot'); if (b) b.remove(); };
    if (!document.body || document.querySelector('form#s-user-login, #login-form')) { document.documentElement.classList.remove('sgo-app'); unboot(); return; } // login screen: hand the page back
    await S.loadPrefs(); await S.loadCache();
    S.applyTheme(); buildShell(); interceptLinks(); S.render();
    document.documentElement.dataset.sgoT1 = String(Math.round(performance.now()));
    unboot(); // first real render is on screen: drop the placeholder
    addEventListener('hashchange', onNav); addEventListener('popstate', onNav);
    syncAcrossTabs();
    const tick = setInterval(() => { if (!alive()) { clearInterval(tick); if (obs) obs.disconnect(); return; } onNav(); }, 700); // catches pushState navigation inside Schoology's own scripts
    const clock = setInterval(() => {
      if (!alive()) { clearInterval(clock); return; }
      if (document.hidden || route() !== 'dashboard' || !S.dashStamp) return;
      if (S.dashStamp() !== S._dashStamp) S.render(true); // an item became overdue / today / tomorrow
    }, 30000);
    observe();
    const r = route();
    S.refresh(r || 'native').then(() => S.render(true));
  })();
})();
