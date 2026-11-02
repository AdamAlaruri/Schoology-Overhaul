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
  /* Eight destinations. The first four are the everyday ones: on a phone they stay in the bottom bar and the rest move into "More". */
  const RAIL = () => [
    ['dashboard', 'Dashboard', 'home', '/home', 1],
    ['courses', 'Courses', 'book', '/courses', 1],
    ['assignments', 'Assignments', 'tasks', '/home#/assignments', 1],
    ['calendar', 'Calendar', 'calendar', '/calendar', 1],
    ['grades', 'Grades', 'grades', '/grades/grades', 0],
    ['inbox', 'Messages', 'inbox', '/messages', 0],
    ['groups', 'Groups', 'groups', '/groups', 0],
    ['settings', 'Settings', 'settings', '/home#/settings', 0],
  ];

  /* ---------- routing ---------- */
  function routeFor(loc) {
    const p = loc.pathname.replace(/\/+$/, '') || '/';
    if (p === '/home') {
      const hp = S.parseHash(loc.hash);
      if (hp.path.startsWith('/a/')) return 'assignment';
      if (hp.path === '/assignments') return 'assignments';
      if (hp.path === '/settings') return 'settings';
      if (hp.path === '/posts') return 'posts';
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
  const navKey = (r) => { const p = location.pathname; return r === 'course' ? 'courses' : r === 'posts' ? 'dashboard' : r === 'assignment' ? 'assignments' : r || (/^\/course\//.test(p) ? 'courses' : /^\/groups?\b/.test(p) ? 'groups' : /^\/messages/.test(p) ? 'inbox' : ''); };
  const TITLES = { dashboard: 'Dashboard', courses: 'Courses', assignments: 'Assignments', assignment: 'Assignment', calendar: 'Calendar', grades: 'Grades', settings: 'Settings', posts: 'Class posts', inbox: 'Messages', groups: 'Groups' };

  /* ---------- theme: S.applyTheme (core.js) applies the four saved colours; the UI theme follows the background colour ---------- */
  const themeToggle = () => { const dark = html.classList.contains('sgo-dark'), id = dark ? 'light' : 'dark', t = S.THEME_PRESETS.find((x) => x.id === id); S.setAppearance({ accent: t.accent, background: t.background }); S.render(true); };

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
    const active = navKey(r), who = S.prefs.displayName || S.state.user || '', dark = html.classList.contains('sgo-dark'), portal = (S.prefs.topLinks || {}).portal;
    const initials = who.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase() || 'Me';
    const face = S.state.avatar ? h('img', { class: 'sgo-face', src: S.state.avatar, alt: '' }) : h('span', { class: 'sgo-face' }, initials);
    const utility = [['Class posts', () => S.go('/home#/posts')], ['Refresh data', () => S.hardRefresh()], [dark ? 'Switch to light mode' : 'Switch to dark mode', themeToggle], portal ? ['School portal', () => window.open(portal, '_blank', 'noopener')] : null,
      ['Resources', () => S.go('/resources')], ['Schoology account', () => S.go('/settings/account')], ['Classic view', () => { S.prefs.classic = true; S.savePrefs(); S.render(); }], ['Sign out', () => S.go('/logout')]];
    const account = S.menu('Account' + (who ? ': ' + who : ''), utility, h('button', { class: 'sgo-rail-i sgo-rail-acct', type: 'button' }, face, h('span', null, who ? who.split(' ')[0] : 'Account')));
    const items = RAIL(), collapsed = !!S.prefs.collapsed;
    const more = S.menu('More', [...items.filter((x) => !x[4]).map(([, label, , href]) => [label, () => S.go(href)]), ...utility.filter(Boolean)], h('button', { class: 'sgo-rail-i sgo-rail-more', type: 'button' }, icon('dots', 21), h('span', null, 'More')));
    return h('nav', { class: 'sgo-rail', 'aria-label': 'Main' }, account,
      items.map(([k, label, ic, href, primary]) => h('a', { class: 'sgo-rail-i' + (primary ? '' : ' sec'), href, 'aria-current': active === k ? 'page' : null, title: label },
        icon(ic, 21), h('span', null, label), k === 'inbox' && S.state.unread.messages ? h('b', { class: 'sgo-rail-n', 'aria-label': `${S.state.unread.messages} unread` }, S.state.unread.messages) : null)),
      more,
      h('button', { class: 'sgo-rail-tog', type: 'button', 'aria-expanded': String(!collapsed), 'aria-label': collapsed ? 'Expand navigation' : 'Collapse navigation', dataset: { fk: 'rail-toggle' },
        onclick: () => { S.prefs.collapsed = !collapsed; S.savePrefs(); S.applyTheme(); S.render(true); } }, icon('left', 17)));
  }

  /* ---------- notifications: a bell with an unread count, the list as history, and any connection problem on top ---------- */
  const KIND = { grade: ['grades', 'Grade'], assignment: ['notepad', 'Assignment'], deadline: ['clock', 'Deadline'] };
  const pct = (n) => (n.possible ? Math.round((n.earned / n.possible) * 1000) / 10 + '%' : '');
  const stampOf = (ts) => `${S.fmtDate(ts)} · ${S.fmtTime(ts)}`;
  /** Where a notification leads, and its readable title and detail. All text comes from the stored real event. */
  const describe = (n) => {
    if (n.kind === 'grade') return {
      kind: n.change === 'changed' ? 'Grade changed' : 'New grade', title: (n.change === 'changed' ? 'Grade changed: ' : 'New grade: ') + n.title,
      detail: n.change === 'changed' && n.prevEarned != null ? `${n.prevEarned} → ${n.earned}${n.possible != null ? ' / ' + n.possible : ''}${pct(n) ? ' · ' + pct(n) : ''}` : `${n.earned}${n.possible != null ? ' / ' + n.possible : ''}${pct(n) ? ' · ' + pct(n) : ''}`,
      href: n.courseId ? `/course/${n.courseId}/student_grades` : '/grades/grades' };
    if (n.kind === 'assignment') return { kind: 'New assignment', title: 'New assignment: ' + n.title, detail: n.due ? 'Due ' + S.fmtDate(n.due) : 'No due date', href: n.href };
    return { kind: 'Due soon', title: 'Due soon: ' + n.title, detail: 'Due ' + S.fmtDate(n.due) + (new Date(n.due).getHours() || new Date(n.due).getMinutes() ? ' · ' + S.fmtTime(n.due) : ''), href: n.href };
  };
  S.describeNotif = describe;
  function notifPanel(list, issues) {
    const ui = S.ui, filter = ui.notifFilter || 'all', shown = filter === 'unread' ? list.filter((n) => !n.read) : list;
    const row = (n) => { const d = describe(n), [ic, label] = KIND[n.kind] || KIND.grade;
      return h('li', { class: 'notif-i' + (n.read ? '' : ' unread') },
        h('span', { class: 'notif-ic', title: label }, icon(ic, 18)),
        h('div', { class: 'notif-b' },
          h('a', { class: 'notif-t', href: d.href || '/home', onclick: () => { S.markNotifRead(n.id); ui.notifOpen = false; } }, n.read ? null : h('i', { class: 'notif-dot', 'aria-label': 'Unread' }), d.title),
          h('p', { class: 'notif-d' }, d.detail),
          h('p', { class: 'notif-m' }, [S.cn(n.courseId, n.course) || n.course, stampOf(n.at)].filter(Boolean).join(' · '))),
        n.read ? null : h('button', { class: 'sgo-icon-btn notif-r', type: 'button', title: 'Mark as read', 'aria-label': 'Mark ' + d.title + ' as read', onclick: () => { S.markNotifRead(n.id); S.render(true); } }, icon('check', 16)));
    };
    const issue = (x) => h('li', { class: 'notif-i issue' }, h('span', { class: 'notif-ic', title: 'Connection' }, icon('alert', 18)),
      h('div', { class: 'notif-b' }, h('b', { class: 'notif-t' }, x.title), h('p', { class: 'notif-d' }, x.detail), x.href ? h('a', { class: 'sgo-btn ghost notif-cta', href: x.href }, x.cta || 'Open') : null));
    const anyRead = list.some((n) => n.read), anyUnread = list.some((n) => !n.read);
    return h('div', { class: 'notif-p', role: 'dialog', 'aria-label': 'Notifications' },
      h('div', { class: 'notif-h' }, h('b', null, 'Notifications'),
        h('div', { class: 'notif-ha' }, anyUnread ? h('button', { class: 'sgo-btn ghost', type: 'button', onclick: () => { S.markAllNotifsRead(); S.render(true); } }, 'Mark all read') : null,
          anyRead ? h('button', { class: 'sgo-btn ghost', type: 'button', onclick: () => S.openConfirm({ title: 'Clear read notifications?', body: 'Notifications you have read are removed from this list. Unread ones stay. Nothing changes in Schoology.', ok: 'Clear', danger: true, onOk: () => { S.clearReadNotifs(); S.render(true); } }) }, 'Clear read') : null)),
      h('div', { class: 'sgo-seg notif-f', role: 'group', 'aria-label': 'Show' }, [['all', 'All'], ['unread', 'Unread']].map(([k, l]) => h('button', { type: 'button', class: filter === k ? 'on' : '', 'aria-pressed': String(filter === k), onclick: () => { ui.notifFilter = k; S.render(true); } }, l))),
      issues.length || shown.length ? h('ul', { class: 'notif-l' }, issues.map(issue), shown.map(row))
        : h('p', { class: 'sgo-muted notif-none' }, filter === 'unread' ? 'You have read everything.' : 'No notifications yet. New grades, new assignments and deadlines within 24 hours appear here.'));
  }
  function notifications() {
    const list = S.notifs(), n = S.unreadNotifs(), issues = S.syncIssues(), open = !!S.ui.notifOpen;
    return h('div', { class: 'sgo-notif' },
      h('button', { class: 'sgo-icon-btn sgo-bell' + (issues.length ? ' warn' : ''), type: 'button', title: 'Notifications', 'aria-haspopup': 'dialog', 'aria-expanded': String(open), dataset: { fk: 'bell' },
        'aria-label': 'Notifications' + (n ? `, ${n} unread` : '') + (issues.length ? ', connection problem' : ''), onclick: (e) => { e.stopPropagation(); S.ui.notifOpen = !open; S.render(true); } },
        icon('bell', 18), n ? h('b', { class: 'sgo-bell-n' }, n > 9 ? '9+' : n) : issues.length ? h('b', { class: 'sgo-bell-n warn' }, '!') : null),
      open ? notifPanel(list, issues) : null);
  }
  document.addEventListener('click', (e) => { if (S.ui && S.ui.notifOpen && !(e.target.closest && e.target.closest('.sgo-notif'))) { S.ui.notifOpen = false; if (S.render) S.render(true); } });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && S.ui && S.ui.notifOpen) { S.ui.notifOpen = false; S.render(true); } });
  // the accent colour picker closes on a click elsewhere or Escape
  document.addEventListener('click', (e) => { if (S.ui && S.ui.accentOpen && !(e.target.closest && e.target.closest('.acc-wrap'))) { S.ui.accentOpen = false; S.render(true); } });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && S.ui && S.ui.accentOpen) { S.ui.accentOpen = false; S.render(true); } });

  /* The top bar holds only search and the notification bell; everything else lives in the navigation or the account menu. */
  function topbar() {
    const q = h('input', { class: 'sgo-input sgo-search', type: 'search', placeholder: 'Search assignments', 'aria-label': 'Search assignments',
      onkeydown: (e) => { if (e.key === 'Enter') { S.ui.assign.q = e.target.value; S.ui.assign.f = 'all'; S.ui.assign.course = ''; S.go('/home#/assignments'); S.render(); } } });
    return h('div', { class: 'sgo-top' }, q, notifications());
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
