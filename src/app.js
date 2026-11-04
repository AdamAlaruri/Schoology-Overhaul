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

  S.TOP_LINKS = [['portal', 'Portal']];
  const linkTo = (k) => (S.prefs.topLinks || {})[k] || '/home#/settings'; // unset school links open Settings, where they can be added
  const RAIL = () => [
    ['dashboard', 'Dashboard', 'home', '/home'],
    ['courses', 'Courses', 'book', '/courses'],
    ['assignments', 'Assignments', 'notepad', '/home#/assignments'],
    ['grades', 'Grades', 'sheet', '/grades/grades'],
    ['search', 'Search', 'search', ''],
    ['groups', 'Groups', 'groups', '/groups'],
    ['calendar', 'Calendar', 'calendar', '/calendar'],
    ['inbox', 'Inbox', 'inbox', '/messages'],
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
    if (/^\/messages(\/sent|\/new|\/view\/\d+)?$/.test(p)) return 'inbox';
    if (p === '/groups') return 'groups'; // a single group (/group/ID) opens on Schoology's own page
    if (/^\/grades(\/grades)?$/.test(p)) return 'grades';
    return null;
  }
  const route = () => routeFor(location);
  const navKey = (r) => { const p = location.pathname; return r === 'course' ? 'courses' : r === 'assignment' ? 'assignments' : r || (/^\/course\//.test(p) ? 'courses' : /^\/groups?\b/.test(p) ? 'groups' : /^\/messages/.test(p) ? 'inbox' : ''); };
  const TITLES = { dashboard: 'Dashboard', courses: 'Courses', assignments: 'Assignments', assignment: 'Assignment', calendar: 'Calendar', grades: 'Grades', settings: 'Settings', inbox: 'Inbox', groups: 'Groups' };

  /* ---------- theme: S.applyTheme (core.js) applies the four saved colours; the UI theme follows the background colour ---------- */
  const themeToggle = () => { const dark = html.classList.contains('sgo-dark'), id = dark ? 'paper' : 'hearth', t = S.THEME_PRESETS.find((x) => x.id === id); S.applyLook(t); S.render(true); };

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
    const initial = (who.trim()[0] || 'Me').toUpperCase(); // the first letter of the name; profile pictures are not shown anywhere
    const face = h('span', { class: 'sgo-face', 'aria-hidden': 'true' }, initial);
    const account = S.menu('Account' + (who ? ': ' + who : ''), [
      ['Edit name…', () => S.openNameEditor()], ['Assignments', () => S.go('/home#/assignments')], ['Grades', () => S.go('/grades/grades')], ['Resources', () => S.go('/resources')],
      ['Extension settings', () => S.go('/home#/settings')], ['Schoology account', () => S.go('/settings/account')],
      ['Classic view', () => { S.prefs.classic = true; S.savePrefs(); S.render(); }], ['Sign out', () => S.go('/logout')],
    ], h('button', { class: 'sgo-rail-i', type: 'button' }, face, h('span', null, 'Account')));
    const collapsed = !!S.prefs.collapsed;
    return h('nav', { class: 'sgo-rail', 'aria-label': 'Main', onclick: (e) => { if (e.target.closest && e.target.closest('a, .sgo-rail-search')) closeNav(); } },
      h('button', { class: 'sgo-rail-x', type: 'button', 'aria-label': 'Close navigation menu', onclick: closeNav }, icon('plus', 20)), account,
      RAIL().map(([k, label, ic, href]) => k === 'search'
        ? h('button', { class: 'sgo-rail-i sgo-rail-search', type: 'button', 'data-tip': label, 'aria-haspopup': 'dialog', 'aria-keyshortcuts': '/ Control+K', 'aria-current': active === k ? 'page' : null, onclick: () => S.openSearch() }, icon(ic, 21), h('span', null, label))
        : h('a', { class: 'sgo-rail-i', href, 'aria-current': active === k ? 'page' : null, 'data-tip': label, target: /^https?:/.test(href) ? '_blank' : null, rel: /^https?:/.test(href) ? 'noopener' : null }, icon(ic, 21), h('span', null, label),
        k === 'inbox' && S.state.unread.messages ? h('b', { class: 'sgo-rail-n', 'aria-label': `${S.state.unread.messages} unread` }, S.state.unread.messages) : null)),
      h('div', { class: 'rail-topo', 'aria-hidden': 'true' }),
      h('button', { class: 'sgo-rail-i sgo-rail-tog', type: 'button', 'data-tip': collapsed ? 'Expand' : 'Collapse', 'aria-expanded': String(!collapsed), 'aria-label': collapsed ? 'Expand navigation' : 'Collapse navigation', dataset: { fk: 'rail-toggle' },
        onclick: (e) => {
          // Flip the class on the live page instead of rebuilding it: the rail node survives, so its width, labels and chevron all animate.
          const next = !S.prefs.collapsed, b = e.currentTarget;
          S.prefs.collapsed = next; S.savePrefs();
          html.classList.toggle('sgo-collapsed', next);
          b.setAttribute('aria-expanded', String(!next)); b.setAttribute('aria-label', next ? 'Expand navigation' : 'Collapse navigation'); b.dataset.tip = next ? 'Expand' : 'Collapse';
          b.lastChild.textContent = next ? 'Expand' : 'Collapse';
        } }, icon('left', 20), h('span', null, collapsed ? 'Expand' : 'Collapse')));
  }

  /* ---------- grade updates: a bell with an unread count and a small list ---------- */
  const pct = (n) => (n.possible ? Math.round((n.earned / n.possible) * 1000) / 10 + '%' : '');
  function notifPanel(list) {
    const row = (n) => h('li', { class: 'notif-i' + (n.read ? '' : ' unread') },
      h('div', { class: 'notif-t' },
        h('a', { href: '/grades/grades', onclick: () => { S.markGradeRead(n.id); S.ui.notifOpen = false; } }, n.title),
        h('span', { class: 'notif-g' }, `${n.earned}${n.possible != null ? ' / ' + n.possible : ''}${pct(n) ? ' · ' + pct(n) : ''}`)),
      h('div', { class: 'notif-m' }, [S.cn(n.courseId, n.course) || n.course, n.due && 'Due ' + n.due.replace(/^Due:?\s*/i, ''), 'Seen ' + S.fmtDate(n.at)].filter(Boolean).join(' · ')),
      n.read ? null : h('button', { class: 'sgo-icon-btn notif-r', type: 'button', title: 'Mark as read', 'aria-label': 'Mark ' + n.title + ' as read', onclick: () => { S.markGradeRead(n.id); S.render(true); } }, icon('check', 16)));
    return h('div', { class: 'notif-p', role: 'dialog', 'aria-label': 'Grade updates' },
      h('div', { class: 'notif-h' }, h('b', null, 'Grade updates'), list.some((n) => !n.read) ? h('button', { class: 'sgo-btn ghost', type: 'button', onclick: () => { S.markAllGradesRead(); S.render(true); } }, 'Mark all as read') : null),
      list.length ? h('ul', { class: 'notif-l' }, list.map(row)) : h('p', { class: 'sgo-muted notif-none' }, 'No grade updates yet. When a teacher grades an assignment, it shows up here.'));
  }
  function notifications() {
    const list = S.prefs.gradeNotifs || [], n = S.unreadGrades(), open = !!S.ui.notifOpen;
    return h('div', { class: 'sgo-notif' },
      h('button', { class: 'sgo-icon-btn sgo-bell', type: 'button', title: 'Grade updates', 'aria-haspopup': 'dialog', 'aria-expanded': String(open), dataset: { fk: 'bell' },
        'aria-label': n ? `Grade updates, ${n} unread` : 'Grade updates', onclick: (e) => { e.stopPropagation(); S.ui.notifOpen = !open; if (S.ui.notifOpen) { S.ui.themeOpen = false; S.ui.accentOpen = false; } S.render(true); } },
        icon('bell', 18), n ? h('b', { class: 'sgo-bell-n' }, n > 9 ? '9+' : n) : null),
      open ? notifPanel(list) : null);
  }
  document.addEventListener('click', (e) => { if (S.ui && S.ui.notifOpen && !(e.target.closest && e.target.closest('.sgo-notif:not(.thm-wrap)'))) { S.ui.notifOpen = false; if (S.render) S.render(true); } });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && S.ui && S.ui.notifOpen) { S.ui.notifOpen = false; S.render(true); } });
  // the accent colour picker closes on a click elsewhere or Escape
  document.addEventListener('click', (e) => { if (S.ui && S.ui.accentOpen && !(e.target.closest && e.target.closest('.acc-wrap'))) { S.ui.accentOpen = false; S.render(true); } });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && S.ui && S.ui.accentOpen) { S.ui.accentOpen = false; S.render(true); } });

  /* Quick colour themes: one button, a small panel of looks. The layout never changes; only the four appearance colours do. */
  const applyLook = (t) => { S.applyLook(t); S.ui.themeOpen = false; S.render(true); };
  function themePicker() {
    const open = !!S.ui.themeOpen;
    const panel = open && h('div', { class: 'thm-p', role: 'dialog', 'aria-label': 'Colour theme' },
      h('div', { class: 'notif-h' }, h('b', null, 'Colour theme')),
      h('div', { class: 'thm-grid' }, S.THEME_PRESETS.map((t) => h('button', { type: 'button', class: 'thm-i' + (S.sameLook(t) ? ' on' : ''), 'aria-pressed': String(S.sameLook(t)), dataset: { fk: 'thm-' + t.id }, onclick: () => applyLook(t) },
        h('span', { class: 'thm-sw', style: { background: `radial-gradient(circle at 78% 22%, ${t.contourGlow}, transparent 62%), ${t.background}`, boxShadow: `inset 0 0 0 1px ${t.contour}55` } }, h('i', { style: { background: S.prefs.accent } })),
        h('span', { class: 'thm-n' }, h('b', null, t.name), h('small', null, t.note))))),
      h('button', { class: 'link', type: 'button', onclick: () => { S.ui.themeOpen = false; S.render(true); S.openAppearance(); } }, 'Customise appearance', icon('right', 14)));
    return h('div', { class: 'sgo-notif thm-wrap' },
      h('button', { class: 'sgo-icon-btn', type: 'button', title: 'Colour theme', 'aria-label': 'Colour theme', 'aria-haspopup': 'dialog', 'aria-expanded': String(open), dataset: { fk: 'thm-btn' }, onclick: (e) => { e.stopPropagation(); S.ui.themeOpen = !open; if (S.ui.themeOpen) S.ui.notifOpen = false; S.render(true); } }, icon('palette', 18)),
      panel || null);
  }
  document.addEventListener('click', (e) => { if (S.ui && S.ui.themeOpen && !(e.target.closest && e.target.closest('.thm-wrap'))) { S.ui.themeOpen = false; S.render(true); } });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && S.ui && S.ui.themeOpen) { S.ui.themeOpen = false; S.render(true); const b = document.querySelector('[data-fk="thm-btn"]'); if (b) b.focus(); } });

  /* On narrow screens the rail is a slide-in menu instead of a bar along the bottom. One large button opens it. */
  const closeNav = () => { html.classList.remove('sgo-nav-open'); const f = document.querySelector('.sgo-fab'); if (f) f.setAttribute('aria-expanded', 'false'); };
  const openNav = () => { html.classList.add('sgo-nav-open'); const f = document.querySelector('.sgo-fab'); if (f) f.setAttribute('aria-expanded', 'true'); const first = document.querySelector('.sgo-rail .sgo-rail-i'); if (first) setTimeout(() => first.focus({ preventScroll: true }), 60); };
  const navControls = () => [
    h('div', { class: 'sgo-scrim', 'aria-hidden': 'true', onclick: closeNav }),
    h('button', { class: 'sgo-fab', type: 'button', 'aria-label': 'Open navigation menu', 'aria-expanded': String(html.classList.contains('sgo-nav-open')), dataset: { fk: 'nav-fab' }, onclick: openNav }, icon('menu', 24), h('span', null, 'Menu'))];
  /* The Menu button floats over the page on phones. It slips out of the way while the page is scrolled down, so it never covers the words being read, and comes back on scroll up, at the top, or when focused. */
  let fabY = 0;
  document.addEventListener('scroll', (e) => {
    const t = e.target; if (!t || !t.classList || !t.classList.contains('sgo-content')) return;
    const y = t.scrollTop;
    if (y > fabY + 6 && y > 96) html.classList.add('sgo-fab-hide'); else if (y < fabY - 6 || y <= 96) html.classList.remove('sgo-fab-hide');
    fabY = y;
  }, true);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && html.classList.contains('sgo-nav-open')) { closeNav(); const f = document.querySelector('.sgo-fab'); if (f) f.focus(); } });

  function topbar() {
    const dark = html.classList.contains('sgo-dark');
    // No bar: just the four utility buttons, grouped in one quiet pill at the top-right.
    return h('div', { class: 'sgo-top' }, h('div', { class: 'sgo-util', role: 'toolbar', 'aria-label': 'Utilities' },
      notifications(),
      themePicker(),
      h('button', { class: 'sgo-icon-btn', type: 'button', title: 'Refresh data', 'aria-label': 'Refresh data', onclick: () => S.hardRefresh() }, icon('reload', 18)),
      h('button', { class: 'sgo-icon-btn', type: 'button', title: dark ? 'Light mode' : 'Dark mode', 'aria-label': dark ? 'Switch to light mode' : 'Switch to dark mode', onclick: themeToggle }, icon(dark ? 'sun' : 'moon', 18))));
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
    html.dataset.sgoRoute = r || '';
    html.classList.toggle('sgo-app', !!r);
    html.classList.toggle('sgo-native', !r);
    const cm = /^\/course\/(\d+)/.exec(location.pathname);
    const cc = cm ? S.tint(cm[1], (S.state.courses.find((c) => c.id === cm[1]) || {}).name) : S.prefs.accent;
    html.style.setProperty('--course', cc);
    if (!r && lastRoute !== null) clearHidden();
    lastRoute = r;

    if (!r) {
      html.style.setProperty('--sgo-top', '0px');
      root.replaceChildren(sidebar(null), ...navControls()); return;
    }

    let view;
    try { view = S.views[r]({ path: S.parseHash().path, q: S.parseHash().q }); }
    catch (e) { console.error('[Schoology Overhaul]', e); view = h('div', { class: 'sgo-page' }, h('div', { class: 'sgo-empty' }, h('div', { class: 'sgo-empty-t' }, 'Something went wrong drawing this page'), h('div', { class: 'sgo-empty-s' }, 'Use Classic view in the sidebar to keep working.'))); }
    document.title = (S._title || TITLES[r] || 'Schoology') + ' · Schoology'; S._title = '';
    const sig = r + '|' + location.pathname + location.search + '|' + S.parseHash().path;
    content = h('main', { class: 'sgo-content' + (sig !== lastSig ? ' animate' : ''), id: 'sgo-content' }, view);
    lastSig = sig;
    root.replaceChildren(sidebar(r), ...navControls(), h('div', { class: 'sgo-main' }, topbar(), banner(), content), S.modalHost);
    content.scrollTop = content.classList.contains('animate') ? 0 : scroll; // a different page starts at the top
    syncGutter();
    if (hadSearch) { const i = content.querySelector('input[type=search]'); if (i) { i.focus(); try { i.setSelectionRange(sel, sel); } catch (e) { /* ignore */ } } }
    if (fk) { const el = root.querySelector(`[data-fk="${CSS.escape(fk)}"]`) || root.querySelector('[data-fk-fallback]'); if (el) el.focus({ preventScroll: true }); }
  };

  /* The page scrolls inside .sgo-content, so its scrollbar narrows the page. The top bar needs the same width to line its icons up with the page's right edge. */
  function syncGutter() {
    if (!content) return;
    const w = content.offsetWidth - content.clientWidth;
    if (html.style.getPropertyValue('--sgo-sbw') !== w + 'px') html.style.setProperty('--sgo-sbw', w + 'px');
  }
  addEventListener('resize', syncGutter);

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
    if (r) S.refresh(r).then((changed) => { if (changed || S.state.session !== 'ok') S.render(true); }, (e) => console.error('[Schoology Overhaul]', e)); // cache-aware: usually no request at all
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
    try {
      await Promise.all([S.loadPrefs(), S.loadCache()]); // two independent storage reads: no need to wait for one before starting the other
      S.applyTheme(); buildShell(); interceptLinks(); S.render();
    } catch (e) { // never leave the loading placeholder up: hand the page back to Schoology
      console.error('[Schoology Overhaul] could not start', e);
      document.documentElement.classList.remove('sgo-app'); unboot(); return;
    }
    document.documentElement.dataset.sgoT1 = String(Math.round(performance.now()));
    unboot(); // first real render is on screen: drop the placeholder
    addEventListener('hashchange', onNav); addEventListener('popstate', onNav);
    syncAcrossTabs();
    const tick = setInterval(() => { if (!alive()) { clearInterval(tick); if (obs) obs.disconnect(); return; } if (!document.hidden) onNav(); }, 700); // catches pushState navigation inside Schoology's own scripts
    const clock = setInterval(() => {
      if (!alive()) { clearInterval(clock); return; }
      if (document.hidden || route() !== 'dashboard' || !S.dashStamp) return;
      if (S.dashStamp() !== S._dashStamp) S.render(true); // an item became overdue / today / tomorrow
    }, 30000);
    observe();
    const r = route();
    S.refresh(r || 'native').catch((e) => console.error('[Schoology Overhaul]', e)).then(() => S.render(true)); // always draw once data (or its failure) is known
  })();
})();
