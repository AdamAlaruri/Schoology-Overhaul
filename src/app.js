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

  const NAV = [
    ['dashboard', 'Dashboard', 'home', '/home'],
    ['courses', 'Courses', 'book', '/courses'],
    ['assignments', 'Assignments', 'tasks', '/home#/assignments'],
    ['calendar', 'Calendar', 'calendar', '/calendar'],
    ['grades', 'Grades', 'grades', '/grades/grades'],
    ['resources', 'Resources', 'folder', '/resources'],
    ['settings', 'Settings', 'settings', '/home#/settings'],
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
    if (p === '/courses') return 'courses';
    if (p === '/calendar') return 'calendar';
    if (/^\/grades(\/grades)?$/.test(p)) return 'grades';
    return null;
  }
  const route = () => routeFor(location);
  const navKey = (r) => r === 'assignment' ? 'assignments' : r || (/^\/course\//.test(location.pathname) ? 'courses' : /^\/resources/.test(location.pathname) ? 'resources' : '');
  const TITLES = { dashboard: 'Dashboard', courses: 'Courses', assignments: 'Assignments', assignment: 'Assignment', calendar: 'Calendar', grades: 'Grades', settings: 'Settings' };

  /* ---------- theme ---------- */
  S.applyTheme = () => {
    const t = S.prefs.theme, dark = t === 'dark' || (t === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
    html.classList.toggle('sgo-dark', dark);
    html.style.setProperty('--accent', S.prefs.accent);
    html.classList.toggle('sgo-collapsed', !!S.prefs.collapsed);
  };
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => S.applyTheme());

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
    const active = navKey(r), m = /^\/course\/(\d+)/.exec(location.pathname), cur = m && m[1];
    const nav = NAV.map(([k, label, ic, href]) => h('a', { class: 'sgo-nav' + (active === k ? ' on' : ''), href, title: label }, icon(ic, 19), h('span', null, label)));
    const courses = S.orderedCourses().slice(0, 14).map((c) => h('a', { class: 'sgo-cl' + (cur === c.id ? ' on' : ''), href: `/course/${c.id}/materials`, title: S.cn(c.id, c.name) },
      h('i', { style: { background: S.courseColor(c.id, c.name) } }), h('span', null, S.cn(c.id, c.name))));
    const thisCourse = cur && h('div', { class: 'sgo-sidegrp' }, h('div', { class: 'sgo-side-l' }, 'This course'),
      [['Materials', `/course/${cur}/materials`], ['Updates', `/course/${cur}/updates`], ['Assignments', `/home#/assignments?course=${cur}`], ['Members', `/course/${cur}/members`]]
        .map(([l, u]) => h('a', { class: 'sgo-cl', href: u }, h('span', null, l))));
    return h('aside', { class: 'sgo-side' },
      h('div', { class: 'sgo-brand' }, h('div', { class: 'sgo-logo' }, 'S'), h('b', null, 'Schoology'),
        h('button', { class: 'sgo-icon-btn', title: 'Collapse sidebar', onclick: () => { S.prefs.collapsed = !S.prefs.collapsed; S.savePrefs(); S.applyTheme(); } }, icon('panel', 17))),
      h('nav', { class: 'sgo-navs' }, nav),
      thisCourse,
      courses.length ? h('div', { class: 'sgo-sidegrp' },
        h('button', { class: 'sgo-side-l sgo-side-toggle', 'aria-expanded': String(!!S.prefs.classesOpen), onclick: () => { S.prefs.classesOpen = !S.prefs.classesOpen; S.savePrefs(); S.render(true); } },
          h('span', null, 'Classes'), h('span', { class: 'sgo-side-n' }, S.state.courses.length), h('span', { class: 'sgo-chev' + (S.prefs.classesOpen ? ' open' : '') }, icon('right', 14))),
        S.prefs.classesOpen && courses) : null,
      h('div', { class: 'sgo-side-foot' },
        h('button', { class: 'sgo-nav', title: 'Switch to the original Schoology layout', onclick: () => { S.prefs.classic = true; S.savePrefs(); S.render(); } }, icon('external', 19), h('span', null, 'Classic view')),
        h('a', { class: 'sgo-nav', href: '/logout', title: 'Sign out' }, icon('logout', 19), h('span', null, 'Sign out'))));
  }

  function topbar() {
    const q = h('input', { class: 'sgo-input sgo-search', type: 'search', placeholder: 'Search assignments…', 'aria-label': 'Search assignments',
      onkeydown: (e) => { if (e.key === 'Enter') { S.ui.assign.q = e.target.value; S.ui.assign.f = 'all'; S.ui.assign.course = ''; S.go('/home#/assignments'); S.render(); } } });
    const dark = html.classList.contains('sgo-dark');
    return h('div', { class: 'sgo-top' }, q,
      h('span', { class: 'sgo-status' }, S.state.loading ? 'Updating…' : S.state.lastRefresh ? 'Updated ' + S.fmtTime(S.state.lastRefresh) : ''),
      h('button', { class: 'sgo-icon-btn', title: 'Refresh data', onclick: () => S.hardRefresh() }, icon('reload', 18)),
      h('button', { class: 'sgo-icon-btn', title: dark ? 'Light mode' : 'Dark mode', onclick: () => { S.prefs.theme = dark ? 'light' : 'dark'; S.savePrefs(); S.applyTheme(); S.render(true); } }, icon(dark ? 'sun' : 'moon', 18)),
      (S.prefs.displayName || S.state.user) && h('span', { class: 'sgo-user', title: S.prefs.displayName || S.state.user }, (S.prefs.displayName || S.state.user).split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()));
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
    document.title = (TITLES[r] || 'Schoology') + ' · Schoology';
    const sig = r + '|' + location.pathname + '|' + S.parseHash().path;
    content = h('main', { class: 'sgo-content' + (sig !== lastSig ? ' animate' : ''), id: 'sgo-content' }, view);
    lastSig = sig;
    root.replaceChildren(sidebar(r), h('div', { class: 'sgo-main' }, topbar(), banner(), content), S.modalHost);
    content.scrollTop = scroll;
    if (hadSearch) { const i = content.querySelector('input[type=search]'); if (i) { i.focus(); try { i.setSelectionRange(sel, sel); } catch (e) { /* ignore */ } } }
  };

  S.hardRefresh = async () => {
    S.state.loading = true; S.render(true);
    const r = route() || 'native';
    if (r === 'dashboard' || r === 'grades') S.scrapeLive(document, scopeFor(r));
    await S.refresh(r === 'native' ? 'courses' : r, { force: true });
    S.render(true);
  };

  const scopeFor = (r) => r === 'dashboard' ? ['courses', 'upcoming', 'overdue', 'feed', 'banners'] : r === 'grades' ? ['courses', 'grades'] : ['courses'];

  /* ---------- live observer (Schoology fills its page asynchronously) ---------- */
  let obs, obsStop;
  function observe() {
    if (obs) obs.disconnect();
    const r = route();
    if (!r && !/^\/course\//.test(location.pathname)) return;
    const scrape = S.debounce(() => { const key = route() || 'native'; if (S.scrapeLive(document, scopeFor(key))) S.render(true); }, 700);
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
    // Fallback: if Schoology's own page never supplied assignments, fetch them ourselves once.
    setTimeout(() => { if (alive() && !Object.keys(S.state.items).length) S.refresh(route() || 'native', { items: true }).then(() => S.render(true)); }, 5000);
  })();
})();
