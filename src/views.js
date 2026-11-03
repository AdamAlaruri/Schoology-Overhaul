/* Views: every screen is a pure function of (S.state, S.prefs, S.ui, route) -> DOM element. */
(() => {
  const S = window.SGO;
  if (S.views) return;
  const { h, icon } = S;
  const V = (S.views = {});
  S.ui = { edit: false, assign: { f: 'all', sort: 'due', q: '', course: '' }, cal: null, openGrade: {}, onlyDesc: {} };

  /* ---------- routing helpers ---------- */
  S.parseHash = (hash = location.hash) => {
    const s = hash.replace(/^#/, '');
    const [p, qs] = s.split('?');
    return { path: p || '', q: Object.fromEntries(new URLSearchParams(qs || '')) };
  };
  const detailHref = (it) => '/home#/a/' + encodeURIComponent(it.key);
  const assignmentsHref = (q) => '/home#/assignments' + (q ? '?' + q : '');
  S.go = (href) => (S.navigate ? S.navigate(href) : (location.href = href)); // client-side for app pages, normal navigation otherwise

  /* ---------- shared bits ---------- */
  const pill = (text, cls) => h('span', { class: 'sgo-pill ' + (cls || '') }, text);
  const empty = (title, sub) => h('div', { class: 'sgo-empty' }, h('div', { class: 'sgo-empty-t' }, title), sub && h('div', { class: 'sgo-empty-s' }, sub));
  const dot = (c) => h('span', { class: 'sgo-dot', style: { background: c } });
  const btn = (label, onclick, cls, ic) => h('button', { class: 'sgo-btn ' + (cls || ''), onclick }, ic && icon(ic, 16), label);
  const toggleDone = (it) => { S.prefs.done[it.key] ? delete S.prefs.done[it.key] : (S.prefs.done[it.key] = Date.now()); S.savePrefs(); S.render(); };
  const iso = (ts) => { const d = new Date(ts); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const fromIso = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ''); return m ? new Date(+m[1], +m[2] - 1, +m[3]).getTime() : null; };

  /** Where an assignment opens: its page inside the course when its course is known, otherwise Schoology's own page. */
  const aidOf = (it) => (/\/assignment\/(\d+)/.exec(it.key || it.url || '') || [])[1] || '';
  const itemHref = (it) => (it.manual ? detailHref(it) : it.courseId && aidOf(it) ? `/course/${it.courseId}/materials?tab=assignments&a=${aidOf(it)}` : it.url || detailHref(it));
  const tasksOnly = () => S.allItems().filter((i) => i.type !== 'event');

  /* Four workload groups from the spec. Completed items are listed separately, not as overdue. */
  function categorize(items) {
    const now = Date.now(), c = { overdue: [], today: [], soon: [], later: [], none: [], done: [] };
    items.slice().sort((a, b) => (a.due ?? 9e15) - (b.due ?? 9e15)).forEach((i) => {
      if (S.isDone(i)) c.done.push(i);
      else if (S.isOverdue(i)) c.overdue.push(i);
      else if (S.isStale(i)) return; // past its date, status unknown: not shown as overdue or upcoming
      else if (!i.due) c.none.push(i);
      else if (S.sameDay(i.due, now)) c.today.push(i);
      else if (i.due < S.sod(now) + 8 * S.DAY) c.soon.push(i);
      else c.later.push(i);
    });
    return c;
  }
  function itemCard(it, opts = {}) {
    const done = S.isDone(it), pr = S.priorityOf(it), st = S.statusOf(it), mine = !!it.manual;
    const act = !opts.compact && (mine
      ? h('button', { class: 'sgo-act', title: 'Edit', 'aria-label': 'Edit ' + it.title, onclick: (e) => { e.preventDefault(); S.openNewAssignment(it); } }, icon('edit', 15))
      : h('button', { class: 'sgo-act', title: 'Remove from my tracker', 'aria-label': 'Remove ' + it.title + ' from my tracker', onclick: (e) => { e.preventDefault(); askExclude(it); } }, icon('eyeoff', 15)));
    return h('article', { class: `sgo-item pr-${pr}${done ? ' is-done' : ''}${mine ? ' mine' : ''}`, style: { '--c': S.colorOf(it) } },
      h('button', { class: 'sgo-check' + (done ? ' on' : ''), title: done ? 'Mark as not done' : 'Mark as done (saved only in this browser)', 'aria-pressed': String(done), onclick: () => toggleDone(it) }, icon('check', 14)),
      h('a', { class: 'sgo-item-main', href: detailHref(it) },
        h('div', { class: 'sgo-item-title' }, it.title),
        h('div', { class: 'sgo-item-meta' }, dot(S.colorOf(it)), S.cn(it.courseId, it.courseName) || 'Course', ' · ', S.relDue(it.due), it.due && it.timed ? ' · ' + S.fmtTime(it.due) : '')),
      !opts.compact && h('div', { class: 'sgo-item-side' }, mine && pill('Yours', 'mine'), done || st.id === 'done' ? pill(st.label, 'st-' + st.id) : pr !== 'low' ? pill(S.PRIORITY[pr], 'pr-' + pr) : st.id !== 'upcoming' ? pill(st.label, 'st-' + st.id) : null),
      act);
  }
  const list = (items, opts) => items.length ? h('div', { class: 'sgo-list' }, items.map((i) => itemCard(i, opts))) : null;

  /* ---------- popover menu (three-dot menus, account menu) ---------- */
  let openMenu = null;
  const closeMenu = (refocus) => { if (!openMenu) return; const m = openMenu; openMenu = null; m.panel.hidden = true; m.panel.remove(); m.btn.setAttribute('aria-expanded', 'false'); if (refocus) m.btn.focus(); };
  /** Open menus live on <html>, not inside the card: a card's hover lift (transform) or clipping can never move or cut them off. */
  const menuHost = () => { let hst = document.getElementById('sgo-menus'); if (!hst) { hst = h('div', { id: 'sgo-menus', class: 'sgo' }); document.documentElement.append(hst); } return hst; };
  document.addEventListener('click', () => closeMenu());
  addEventListener('scroll', () => closeMenu(), true);
  /** items: [label, onSelect] pairs; falsy entries are skipped. The panel is fixed-position so a card or rail can never clip it. */
  S.menu = (label, items, trigger, cls) => {
    const btn = trigger || h('button', { class: 'sgo-icon-btn', type: 'button' }, icon('dots', 18));
    btn.setAttribute('aria-haspopup', 'menu'); btn.setAttribute('aria-expanded', 'false'); btn.setAttribute('aria-label', label);
    const panel = h('div', { class: 'sgo-menu-p', role: 'menu', 'aria-label': label, hidden: true,
      onkeydown: (e) => {
        const all = [...panel.querySelectorAll('[role="menuitem"]')], i = all.indexOf(document.activeElement);
        if (e.key === 'Escape') { e.stopPropagation(); closeMenu(true); }
        else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); all[(i + (e.key === 'ArrowDown' ? 1 : -1) + all.length) % all.length].focus(); }
        else if (e.key === 'Tab') closeMenu();
      } },
      items.filter(Boolean).map(([text, fn]) => h('button', { type: 'button', role: 'menuitem', onclick: () => { closeMenu(); fn(); } }, text)));
    btn.addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation();
      const wasOpen = openMenu && openMenu.btn === btn;
      closeMenu();
      if (wasOpen) return;
      panel.hidden = false; menuHost().append(panel);
      const r = btn.getBoundingClientRect(), w = panel.offsetWidth, hgt = panel.offsetHeight;
      panel.style.left = Math.max(8, Math.min(r.left, innerWidth - w - 8)) + 'px';
      panel.style.top = (r.bottom + hgt + 8 > innerHeight ? Math.max(8, r.top - hgt - 4) : r.bottom + 4) + 'px';
      btn.setAttribute('aria-expanded', 'true');
      openMenu = { btn, panel };
      panel.querySelector('[role="menuitem"]').focus();
    });
    return h('div', { class: 'sgo-menu ' + (cls || '') }, btn);
  };

  /* ===================== DASHBOARD ===================== */
  /* Dashboard title, greeting and course cards on the left, a Tasks panel on the right, all from the student's Schoology data. */
  const dui = () => (S.ui.dash = S.ui.dash || { week: 0, course: 'all', tab: 'assignments', expanded: false, ann: {} });
  const mon3 = (ts) => S.MONTHS[new Date(ts).getMonth()].slice(0, 3);
  const shortDate = (ts) => `${mon3(ts)} ${new Date(ts).getDate()}`;
  const daysUntil = (ts, now) => Math.round((S.sod(ts) - S.sod(now)) / S.DAY);
  /** "today", "in 3d", "in 1w": computed from the real due date, in calendar days. */
  const relative = (ts, now) => { const n = daysUntil(ts, now); return n <= 0 ? 'today' : n < 7 ? `in ${n}d` : `in ${Math.round(n / 7)}w`; };
  /** Due within the next 48 hours and not finished: these get a clock mark and their own group in the Tasks panel. */
  const dueSoon = (it, now) => { const end = it.due && (it.timed ? it.due : S.sod(it.due) + S.DAY - 1); return !!end && end > now && end - now <= 2 * S.DAY && !S.isComplete(it) && !S.isOverdue(it); }; // a date without a time means any time that day
  const pctText = (p) => (p == null ? '--%' : (Math.round(p * 100) / 100) + '%');
  /** Changes whenever an item crosses a boundary (becomes overdue, today, tomorrow). The app polls it to refresh the page as time passes. */
  S.dashStamp = () => {
    const now = Date.now();
    return tasksOnly().filter((i) => !S.isComplete(i)).map((i) => i.key + (S.isOverdue(i) ? 'o' : '') + (dueSoon(i, now) ? 's' : '') + (i.due ? daysUntil(i.due, now) : '')).join('|');
  };

  /* ---- shared dashboard helpers ---- */
  const longDate = (ts) => new Date(ts).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many || one + 's'}`;
  /** Urgency from the real due date only. Each state has an icon and a word as well as a colour, so it never relies on colour alone. */
  function urgency(it, now) {
    if (S.isComplete(it)) return { id: 'done', label: 'Completed', icon: 'check' };
    if (S.isOverdue(it)) return { id: 'overdue', label: 'Overdue', icon: 'alert' };
    if (!it.due) return { id: 'later', label: 'No due date', icon: 'clock' };
    const n = daysUntil(it.due, now);
    if (n <= 0) return { id: 'today', label: 'Due today', icon: 'clock' };
    if (n <= 2) return { id: 'soon', label: 'Due soon', icon: 'clock' };
    return { id: 'later', label: 'Upcoming', icon: 'clock' };
  }
  function dueLabel(it, now) {
    if (!it.due) return 'No due date';
    const n = daysUntil(it.due, now), time = it.timed ? ' · ' + S.fmtTime(it.due) : '';
    if (S.isOverdue(it)) return `Was due ${shortDate(it.due)}`;
    return n <= 0 ? 'Due today' + time : n === 1 ? 'Due tomorrow' + time : n < 7 ? `Due ${S.WEEKDAYS[new Date(it.due).getDay()]}, ${shortDate(it.due)}${time}` : `Due ${shortDate(it.due)}${time}`;
  }
  /** Counts a number up (or down) to its new value; the bar's own CSS transition handles the width. Timers, not frames, so it also runs in a background window. */
  function countTo(el, from, to, suffix) {
    el.textContent = from + suffix;
    if (from === to) return;
    setTimeout(() => {
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) { el.textContent = to + suffix; return; }
      const t0 = Date.now(), D = 700;
      const step = () => { const k = Math.min(1, (Date.now() - t0) / D), e = 1 - Math.pow(1 - k, 4); el.textContent = Math.round(from + (to - from) * e) + suffix; if (k < 1) setTimeout(step, 16); };
      step();
    });
  }
  /** A bar that starts at its previous width and eases to the new one. */
  function meter(from, to, cls) {
    const fill = h('i', { style: { width: from + '%' } });
    if (from !== to) setTimeout(() => { fill.getBoundingClientRect(); fill.style.width = to + '%'; });
    return h('div', { class: 'meter ' + (cls || ''), role: 'presentation' }, fill);
  }

  /* The week the dashboard talks about: today and the next six days, plus anything Schoology lists as missing and tasks with no date. */
  function weekOf(t, now) {
    const start = S.sod(now), end = start + 7 * S.DAY;
    const inView = t.filter((i) => (S.isComplete(i) || !S.isStale(i)) && ((i.due && i.due >= start && i.due < end) || i.fromOverdue || S.isOverdue(i) || !i.due))
      .sort((a, b) => (a.due ?? 9e15) - (b.due ?? 9e15));
    const open = inView.filter((i) => !S.isComplete(i)), complete = inView.filter(S.isComplete);
    const overdue = open.filter(S.isOverdue).length, today = open.filter((i) => !S.isOverdue(i) && i.due && daysUntil(i.due, now) <= 0).length;
    return { inView, open, complete, overdue, today, pct: inView.length ? Math.round((complete.length / inView.length) * 100) : 0 };
  }

  /** A live clock and date. It ticks on the minute and stops by itself once the dashboard has left the page. */
  function clock() {
    const time = h('b', { class: 'clk-t' }), ap = h('span', { class: 'clk-ap' }), date = h('span', { class: 'clk-d' });
    const paint = () => {
      const n = new Date(), p = n.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }).match(/^(.*?)\s?([AP]M)?$/i) || [];
      time.textContent = p[1] || n.toLocaleTimeString(); ap.textContent = p[2] || '';
      date.textContent = longDate(n.getTime());
    };
    paint();
    const tick = () => { if (!time.isConnected) return; paint(); setTimeout(tick, 60000 - (Date.now() % 60000) + 50); };
    setTimeout(tick, 60000 - (Date.now() % 60000) + 50);
    return h('div', { class: 'clk', role: 'timer', 'aria-label': 'Current time and date' }, h('div', { class: 'clk-row' }, time, ap), date);
  }

  /** Hero: greeting and one honest sentence about the day on the left with the count of open assignments; the clock on the right. */
  function hero(wk, now, review) {
    const first = (S.prefs.displayName || S.state.user || '').trim().split(/\s+/)[0]; // no name known yet: just the greeting
    const msg = wk.overdue ? `${plural(wk.overdue, 'assignment')} overdue. Start there, then move on to what is due today.`
      : wk.today ? `${plural(wk.today, 'assignment')} due today. Here is what deserves your attention.`
        : wk.open.length ? 'Nothing is due today. Here is what is coming up this week.' : S.quip();
    return h('section', { class: 'hero', 'aria-label': 'Welcome' },
      h('div', { class: 'hero-l' },
        h('h1', null, `${S.greeting()}${first ? ', ' + first : ''}.`),
        h('p', { class: 'hero-msg' }, msg),
        h('div', { class: 'hero-count', role: 'status' }, h('b', { class: 'num' }, wk.open.length), h('span', null, wk.open.length === 1 ? 'assignment to do this week' : 'assignments to do this week'),
          wk.overdue ? h('span', { class: 'badge b-overdue' }, icon('alert', 13), `${wk.overdue} overdue`) : null)),
      h('div', { class: 'hero-r' }, clock()),
      h('div', { class: 'hero-menu' }, S.menu('Dashboard options', [['New task', () => S.openNewAssignment(null)], review ? [`Review ${review} new ${review === 1 ? 'item' : 'items'}`, () => S.go(assignmentsHref())] : null,
        ['All assignments', () => S.go(assignmentsHref())], ['Refresh data', () => S.hardRefresh()], ['Settings', () => S.go('/home#/settings')]])));
  }

  /* A small floating notice, kept outside the page markup: it never moves the layout, survives page redraws, pauses while the pointer or
   * focus is on it, and always leaves the same way (fades and drops out, then is removed). One at a time. */
  S.toast = (message, action) => {
    let host = document.getElementById('sgo-toasts');
    if (!host) { host = h('div', { id: 'sgo-toasts', class: 'sgo', role: 'status', 'aria-live': 'polite' }); document.documentElement.append(host); }
    clearTimeout(S._toastT); host.replaceChildren();
    let paused = false, left = 6000, started = 0;
    const close = () => {
      clearTimeout(S._toastT);
      if (!el.isConnected || el.classList.contains('leaving')) return;
      el.classList.add('leaving'); setTimeout(() => el.remove(), 220);
    };
    const run = () => { started = Date.now(); S._toastT = setTimeout(close, left); };
    const hold = () => { if (paused) return; paused = true; clearTimeout(S._toastT); left = Math.max(1500, left - (Date.now() - started)); };
    const release = () => { if (!paused || el.matches(':hover, :focus-within')) return; paused = false; run(); };
    const el = h('div', { class: 'toast', onmouseenter: hold, onmouseleave: release, onfocusin: hold, onfocusout: () => setTimeout(release, 0) },
      icon('check', 16), h('span', null, message),
      action ? h('button', { class: 'sgo-btn ghost', type: 'button', onclick: () => { close(); action.run(); } }, action.label) : null,
      h('button', { class: 'sgo-icon-btn toast-x', type: 'button', 'aria-label': 'Dismiss', onclick: close }, icon('plus', 16)));
    host.append(el); run();
  };

  /* ---- Today's Priorities ---- */
  function priorityRow(it, now) {
    const u = urgency(it, now), viaSchoology = S.isSubmitted(it), complete = S.isComplete(it), e = S.gradeEntry(it);
    const name = S.cn(it.courseId, it.courseName) || (it.manual ? 'Personal task' : 'Course');
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    // Commit the change, then say so with an Undo that reverses it.
    const commit = () => {
      dui().last = { id: it.key, at: Date.now() };
      toggleDone(it);
      S.toast(complete ? `“${it.title}” marked not complete.` : `“${it.title}” marked complete.`,
        { label: 'Undo', run: () => { dui().last = null; toggleDone(S.allItems().find((i) => i.key === it.key) || it); } });
    };
    const toggle = (e) => {
      if (viaSchoology) return;
      const row = e.currentTarget.closest('.pr');
      if (complete || reduced || !row || row.classList.contains('folding')) { if (!row || !row.classList.contains('folding')) commit(); return; }
      // Completing: the tick draws at once, the row eases shut, and only then the list is redrawn, so nothing jumps.
      e.currentTarget.classList.add('on', 'just'); e.currentTarget.setAttribute('aria-pressed', 'true');
      row.classList.add('u-done', 'folding'); row.style.maxHeight = row.offsetHeight + 'px';
      void row.offsetHeight; // commit the starting height so the collapse is animated
      setTimeout(() => row.classList.add('fold'), 260);
      setTimeout(commit, 260 + 340);
    };
    const tt = dui().last, just = !!tt && tt.id === it.key && Date.now() - tt.at < 1500; // only the item just ticked draws its check
    return h('li', { class: `pr u-${u.id}`, style: { '--c': S.colorOf(it) } },
      h('button', { class: 'pr-check' + (complete ? ' on' : '') + (just ? ' just' : ''), type: 'button', dataset: { fk: 'check-' + it.key }, 'aria-pressed': String(complete), 'aria-disabled': viaSchoology ? 'true' : null,
        title: viaSchoology ? 'Submitted in Schoology' : complete ? 'Mark as not complete' : 'Mark complete',
        'aria-label': (viaSchoology ? 'Submitted in Schoology: ' : complete ? 'Mark not complete: ' : 'Mark complete: ') + it.title, onclick: toggle }, icon('check', 14)),
      h('div', { class: 'pr-main' },
        h('div', { class: 'pr-course' }, h('i'), name),
        h('a', { class: 'pr-title', href: itemHref(it) }, it.title),
        h('div', { class: 'pr-when' }, dueLabel(it, now) + (e && e.possible != null ? ` · ${e.possible} pts` : ''))),
      h('span', { class: 'badge b-' + u.id }, icon(u.icon, 14), u.label),
      h('a', { class: 'pr-open', href: itemHref(it), title: 'Open', 'aria-label': 'Open assignment: ' + it.title }, icon('right', 18)));
  }

  function priorities(t, wk, now) {
    const ui = dui(), byCourse = (i) => ui.course === 'all' || i.courseId === ui.course;
    const rank = (i) => { const u = urgency(i, now).id; return { overdue: 0, today: 1, soon: 2, later: 3 }[u] ?? 4; };
    const open = wk.open.filter(byCourse).sort((a, b) => rank(a) - rank(b) || (a.due ?? 9e15) - (b.due ?? 9e15));
    const done = wk.complete.filter(byCourse), limit = 5, shown = ui.expanded ? open : open.slice(0, limit);
    const empty = h('div', { class: 'sgo-empty topo-empty' }, h('div', { class: 'sgo-empty-t' }, 'No assignments due.'),
      h('div', { class: 'sgo-empty-s' }, done.length ? `You finished everything on your list this week. ${plural(done.length, 'item')} completed.` : 'Nothing needs your attention right now. New work appears here when your teachers post it.'));
    return h('section', { class: 'pri', 'aria-labelledby': 'pri-h' },
      h('div', { class: 'sec-h' },
        h('div', null, h('h2', { id: 'pri-h' }, "Today's Priorities"), h('p', null, 'Your upcoming academic deadlines.')),
        h('div', { class: 'sec-a' },
          h('select', { class: 'sgo-input pri-filter', 'aria-label': 'Filter priorities by course', dataset: { fk: 'course' }, onchange: (e) => { ui.course = e.target.value; ui.expanded = false; S.render(); } },
            h('option', { value: 'all' }, 'All courses'), S.orderedCourses().filter((c) => !hiddenCourse(c)).map((c) => h('option', { value: c.id, selected: ui.course === c.id ? 'selected' : null }, S.cn(c.id, c.name)))),
          h('button', { class: 'sgo-btn', type: 'button', onclick: () => S.openNewAssignment(null) }, icon('plus', 16), 'Add task'))),
      open.length ? h('ul', { class: 'pr-list' }, shown.map((i) => priorityRow(i, now))) : empty,
      open.length > limit ? h('button', { class: 'tp-more', type: 'button', dataset: { fk: 'more' }, onclick: () => { ui.expanded = !ui.expanded; S.render(); } }, ui.expanded ? 'Show fewer' : `Show ${open.length - limit} more`) : null,
      done.length && open.length ? h('details', { class: 'pr-done', open: ui.showDone ? 'open' : null, ontoggle: (e) => { ui.showDone = e.target.open; } },
        h('summary', null, icon('check', 14), `${plural(done.length, 'completed item')} this week`), h('ul', { class: 'pr-list' }, done.map((i) => priorityRow(i, now)))) : null);
  }

  /* Course covers on the dashboard. A cover the student chose always wins. Otherwise: a real photograph when one of the bundled
   * photographs fits the subject, and a typographic banner (course name set large on a soft gradient) for everything else. Schoology's own
   * generic pictures are only used when the student picks "Original". */
  /* Dashboard-only subject matching, most specific first. Each id is a bundled photograph in banners/. Anything unmatched gets a typographic banner. */
  const AUTO_PHOTO = [
    [/econom|financ|market/i, 'economics'],
    [/\bsports?\b|medic|\btsa\b|engineer|anatom|physiolog/i, 'anatomy'],
    [/\bap\s?us\b|\bapush\b|us history|u\.s\. history|american history/i, 'apush'],
    [/biolog|\bbio\b|cell/i, 'cells'],
    [/calc|algebra|geometr|trig|statist|\bmath/i, 'calculus'],
  ];
  const PHOTO_OK = new Set(['history', 'english', 'languages', 'cs']); // the general-purpose photographs
  /** What a course shows when nothing was chosen: a bundled photograph that fits the subject, else a typographic banner. */
  function autoCover(c, name) {
    const text = `${name} ${S.cleanName(c.name)}`, hit = AUTO_PHOTO.find(([re]) => re.test(text)), rec = S.recommendBanner(c.name);
    const id = hit ? hit[1] : PHOTO_OK.has(rec) && !/advis|summer/i.test(text) ? rec : '';
    return id && S.bannerUrl(id) ? { css: S.coverCssFor(c.id, c.name, 'b:' + id) } : { typo: true };
  }
  /** The saved choice: '' automatic, 'orig' Schoology's picture, 't' typographic, 'b:id' a bundled photo, or an uploaded image. */
  function coverFor(c, name) {
    const chosen = S.cmeta(c.id, c.name).cover || '';
    if (chosen === 't') return { typo: true };
    if (chosen) return { css: S.coverCss(c.id, c.name) };
    return autoCover(c, name);
  }
  const hueOf = (hex) => { const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255), mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; if (!d) return 215; const k = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; return Math.round((k * 60 + 360) % 360); };
  /** The course name set large on a soft gradient in the course's own colour. plain: no link (for use inside a button or an already-linked card). */
  function typoBanner(c, name, meta, plain) {
    const hue = hueOf(S.courseColor(c.id, c.name)), t = plain ? h('span', { class: 'dc-typo-t' }, name) : h('a', { class: 'dc-typo-t', href: `/course/${c.id}/materials`, tabindex: '-1', 'aria-hidden': 'true' }, name);
    return h('div', { class: 'dc-typo', style: { '--h': hue } }, h('span', null, meta || 'Course'), t);
  }
  /** Fills a cover element from a resolved choice. */
  function paintCover(el, c, name, cv, plain) {
    el.style.background = cv.css || ''; el.classList.toggle('typo', !!cv.typo);
    el.replaceChildren(...(cv.typo ? [typoBanner(c, name, S.courseCode(c.name) || 'Course', plain)] : []));
  }
  /** Courses that are not part of the school year picture (summer work, advisory) stay off the dashboard. */
  const HIDDEN_COURSE = /summer|advisory/i;
  /** Hidden from the dashboard only; the Courses tab always lists everything. An explicit choice wins; otherwise summer work and advisory start hidden. */
  const hiddenCourse = (c) => { const v = (S.prefs.courseHidden || {})[c.id]; return v === undefined ? HIDDEN_COURSE.test(S.cn(c.id, c.name) || '') || HIDDEN_COURSE.test(c.name || '') : !!v; };
  S.courseHidden = hiddenCourse;
  S.setCourseHidden = (c, hide, quiet) => {
    S.prefs.courseHidden = Object.assign({}, S.prefs.courseHidden, { [c.id]: !!hide }); S.savePrefs(); S.render(true);
    if (!quiet) S.toast(hide ? `“${S.cn(c.id, c.name)}” is hidden from the dashboard. It is still in Courses.` : `“${S.cn(c.id, c.name)}” is back on the dashboard.`, { label: 'Undo', run: () => S.setCourseHidden(c, !hide, true) });
  };
  const resolveCover = (c, name, v) => (v === 't' ? { typo: true } : v === '' ? autoCover(c, name) : { css: S.coverCssFor(c.id, c.name, v) });

  /** The title turned into a text box, in place. Enter or clicking away saves, Escape cancels, and an empty box goes back to Schoology's name. */
  function renameField(c) {
    let done = false;
    const finish = (save, v) => {
      if (done) return; done = true;
      if (save) { const t = (v || '').trim(); S.setCourseMeta(c.id, { name: t && t !== S.autoName(c.name) ? t : '' }); }
      S.ui.renaming = null; S.render(true);
    };
    const input = h('input', { class: 'sgo-input sgo-rename', value: S.cn(c.id, c.name), placeholder: S.autoName(c.name), maxlength: '80', 'aria-label': 'Course name', dataset: { fk: 'rename-' + c.id },
      onkeydown: (e) => { e.stopPropagation(); if (e.key === 'Enter') finish(true, e.target.value); else if (e.key === 'Escape') finish(false); },
      onblur: (e) => finish(true, e.target.value) });
    setTimeout(() => { input.focus(); input.select(); }, 30);
    return input;
  }

  /* ---- courses ---- */
  const visibleCourse = (id) => { const c = S.state.courses.find((x) => x.id === id); return !!c && !hiddenCourse(c); };
  function dashCard(c, tasks, now, featured) {
    const color = S.courseColor(c.id, c.name), name = S.cn(c.id, c.name), g = S.gradeFor(c.id);
    const open = tasks.filter((i) => i.courseId === c.id && !S.isComplete(i) && (S.isOverdue(i) || (i.due && i.due >= S.sod(now)))).sort((a, b) => (S.isOverdue(b) - S.isOverdue(a)) || (a.due ?? 9e15) - (b.due ?? 9e15));
    const next = open[0], u = next && urgency(next, now);
    const news = S.state.announcements.filter((a) => a.courseId === c.id).length;
    const term = (/\((S\d|Q\d|T\d|Y\d?)\)/.exec(c.name + ' ' + (c.section || '')) || [])[1] || (g && g.periods[0] && g.periods[0].name) || '';
    const hasGrade = g && g.percent != null;
    const editing = S.ui.renaming === c.id, cv = coverFor(c, name), metaLine = [S.courseCode(c.name) || c.section, term].filter(Boolean).join(' · ');
    const cover = h('div', { class: 'dc-banner' + (cv.typo ? ' typo' : ''), style: cv.css ? { background: cv.css } : null }, cv.typo ? typoBanner(c, name, S.courseCode(c.name) || 'Course') : null,
      h('button', { class: 'sgo-icon-btn dc-rename', type: 'button', title: 'Rename', 'aria-label': 'Rename ' + name, onclick: () => { S.ui.renaming = c.id; S.render(); } }, icon('edit', 16)),
      S.menu('Options for ' + name, [['Rename', () => { S.ui.renaming = c.id; S.render(); }], ['Change banner', () => S.openBannerPicker(c)], ['Notification icon…', () => S.openIconPicker(c)], ['Colour and name…', () => S.openCourseEditor(c)], ['Move earlier', () => { S.moveCourse(c.id, -1, visibleCourse); S.render(true); }], ['Move later', () => { S.moveCourse(c.id, 1, visibleCourse); S.render(true); }], ['Hide from dashboard', () => S.setCourseHidden(c, true)], ['View assignments', () => S.go(assignmentsHref('course=' + c.id))]], h('button', { class: 'sgo-icon-btn dc-dots', type: 'button' }, icon('dots', 18)), 'dc-menu'));
    if (S.cmeta(c.id, c.name).cover === 'orig') S.guardCover(cover, c.id, c.name);
    const card = h('article', { class: 'dc' + (featured ? ' featured' : '') + (cv.typo && !editing ? ' has-typo' : ''), style: { '--c': color }, 'aria-label': name, dataset: { id: c.id } }, cover,
      h('div', { class: 'dc-body' },
        h('h2', null, editing ? renameField(c) : h('a', { href: `/course/${c.id}/materials` }, name)),
        h('div', { class: 'dc-meta' }, metaLine || 'Course'),
        h('a', { class: 'sgo-icon-btn dc-news', href: `/course/${c.id}/updates`, title: 'Announcements', 'aria-label': news ? `${news} announcements for ${name}` : `Announcements for ${name}` }, icon(S.notifIcon(c), 18), news ? h('span', { class: 'dc-count' }, news) : null)),
      h('div', { class: 'dc-stat' },
        h('span', { class: 'micro' }, hasGrade ? 'Current grade' : 'Grade not available'),
        hasGrade ? h('b', { class: 'dc-gv', 'aria-label': `Current grade ${pctText(g.percent)}` }, pctText(g.percent)) : h('span', { class: 'dc-gna' }, 'Schoology has not reported one')),
      h('div', { class: 'dc-next' },
        h('span', { class: 'micro' }, 'Next assignment'),
        next ? [h('a', { class: 'dc-nt', href: itemHref(next) }, next.title),
          h('div', { class: 'dc-nw' }, h('span', { class: 'badge b-' + u.id }, icon(u.icon, 12), u.label), h('span', null, S.isOverdue(next) ? dueLabel(next, now) : next.due ? shortDate(next.due) : ''))]
          : h('span', { class: 'dc-gna' }, 'Nothing due')));
    if (!editing) bindCourseDrag(card, c);
    return card;
  }

  /* ---- right column: weekly progress, announcements, recent feedback ---- */
  function weeklyCard(wk) {
    const ui = dui(), from = ui.weekPct == null ? wk.pct : ui.weekPct; ui.weekPct = wk.pct;
    const pctEl = h('b', { class: 'num' }); countTo(pctEl, from, wk.pct, '%');
    const note = !wk.inView.length ? 'No work this week. Enjoy the quiet.' : wk.pct === 100 ? 'Everything is done this week. Nicely done.' : wk.pct >= 50 ? 'More than halfway there. Keep going.' : wk.complete.length ? 'Good start. One at a time.' : 'A fresh week. Begin with the first one.';
    return h('section', { class: 'side-card progress', 'aria-labelledby': 'wp-h' },
      h('h3', { id: 'wp-h' }, 'This week'),
      h('div', { class: 'wp-big' }, pctEl, h('span', null, wk.inView.length ? `${wk.complete.length} of ${wk.inView.length} done` : '')),
      meter(from, wk.pct, 'lg'),
      h('p', { class: 'wp-note' }, note),
      h('dl', { class: 'wp-nums' },
        h('div', null, h('dt', null, 'Done'), h('dd', null, wk.complete.length)), h('div', null, h('dt', null, 'To do'), h('dd', null, wk.open.length)), h('div', null, h('dt', null, 'Overdue'), h('dd', { class: wk.overdue ? 'bad' : '' }, wk.overdue))));
  }
  function announcementsCard() {
    const ui = dui(), all = S.state.announcements, shown = ui.annAll ? all : all.slice(0, 3);
    return h('section', { class: 'side-card', 'aria-labelledby': 'an-h' },
      h('div', { class: 'side-h' }, h('h3', { id: 'an-h' }, 'Announcements'), all.length > 3 ? h('button', { class: 'link', type: 'button', dataset: { fk: 'ann-all' }, onclick: () => { ui.annAll = !ui.annAll; S.render(); } }, ui.annAll ? 'Show fewer' : 'View all') : null),
      shown.length ? h('ul', { class: 'an-list' }, shown.map((a, idx) => {
        const id = a.id + ':' + idx, isOpen = !!ui.ann[id];
        return h('li', null, h('button', { type: 'button', dataset: { fk: 'ann-' + id }, 'aria-expanded': String(isOpen), onclick: () => { ui.ann[id] = !isOpen; S.render(); } },
          h('span', { class: 'an-c' }, S.cn(a.courseId, a.courseName) || 'Announcement'), h('b', null, a.body.split(/(?<=[.!?])\s/)[0].slice(0, 80)), h('span', { class: 'an-t' }, [a.author, a.time].filter(Boolean).join(' · '))),
          isOpen ? h('p', null, a.body) : null);
      })) : h('p', { class: 'side-empty' }, 'No announcements right now.'));
  }
  function feedbackCard() {
    const feedback = S.state.grades.flatMap((g) => (g.periods || []).flatMap((p) => p.categories.flatMap((c) => c.items.filter((x) => x.comment).map((x) => ({ x, g })))))
      .map((f) => Object.assign(f, { ts: (S.parseDue(f.x.dueText) || {}).ts || 0 })).sort((a, b) => b.ts - a.ts).slice(0, 3);
    return h('section', { class: 'side-card', 'aria-labelledby': 'fb-h' },
      h('div', { class: 'side-h' }, h('h3', { id: 'fb-h' }, 'Recent feedback'), h('a', { class: 'link', href: '/grades/grades' }, 'All grades')),
      feedback.length ? h('ul', { class: 'fb-list' }, feedback.map(({ x, g }) => { const p = gItemPct(x);
        return h('li', null, h('div', { class: 'fb-t' }, h('b', null, x.title), x.earned != null ? h('span', { class: 'fb-g' }, `${gNum(x.earned)}${x.possible != null ? ' / ' + gNum(x.possible) : ''}${p != null ? ' · ' + p + '%' : ''}`) : null),
          h('span', { class: 'fb-c' }, S.cn(g.courseId, g.courseName)), h('p', null, x.comment.slice(0, 140)), h('a', { class: 'link', href: '/grades/grades' }, 'View details', icon('right', 14))); }))
        : h('p', { class: 'side-empty' }, 'No teacher feedback yet. Comments on graded work show up here.'));
  }

  V.dashboard = () => {
    const now = Date.now(), skip = new Set(S.state.courses.filter(hiddenCourse).map((c) => c.id)), t = tasksOnly().filter((i) => !skip.has(i.courseId)), courses = S.orderedCourses().filter((c) => !skip.has(c.id)), review = S.unreviewedItems().length, wk = weekOf(t, now);
    S._dashStamp = S.dashStamp();
    // the course with the soonest open deadline gets the one contour treatment
    const soonest = courses.map((c) => ({ c, d: Math.min(...t.filter((i) => i.courseId === c.id && !S.isComplete(i) && i.due && i.due >= S.sod(now)).map((i) => i.due), Infinity) })).filter((x) => x.d < Infinity).sort((a, b) => a.d - b.d)[0];
    const cards = courses.length ? h('div', { class: 'dc-grid' }, courses.map((c) => dashCard(c, t, now, soonest && soonest.c.id === c.id)))
      : !S.state.loaded ? h('div', { class: 'dc-grid', 'aria-busy': 'true', 'aria-label': 'Loading courses' }, [0, 1, 2].map(() => h('div', { class: 'sk-row dc-sk' })))
        : empty('No courses found', 'Open Settings → Diagnostics to see what was read from Schoology.');
    return h('div', { class: 'sgo-page dash6' }, hero(wk, now, review),
      h('div', { class: 'dp-main' }, priorities(t, wk, now),
        h('section', { class: 'dp-courses', 'aria-labelledby': 'dp-courses-h' }, h('div', { class: 'sec-h' }, h('div', null, h('h2', { id: 'dp-courses-h' }, 'Your courses'), h('p', null, courses.length ? plural(courses.length, 'course') + ' this term' : 'Detected from your Schoology account'))), cards,
          skip.size ? h('p', { class: 'dc-hidden-note' }, `${plural(skip.size, 'course')} hidden from the dashboard. `, h('a', { class: 'link', href: '/courses' }, 'See everything in Courses', icon('right', 14))) : null),
        h('div', { class: 'topo-div', 'aria-hidden': 'true' })),
      h('aside', { class: 'dp-side-col', 'aria-label': 'Progress and recent activity' }, weeklyCard(wk), announcementsCard(), feedbackCard()));
  };

  function pageHead(title, sub, actions) {
    return h('div', { class: 'sgo-head' }, h('div', null, h('h1', null, title), sub && h('p', null, sub)), actions && h('div', { class: 'sgo-head-a' }, actions));
  }

  /* ===================== COURSES ===================== */
  /** Drag a course card onto another to move it there. The new order is saved and used on every page. Links inside the card are not draggable themselves. */
  function bindCourseDrag(card, c) {
    card.draggable = true;
    card.querySelectorAll('a').forEach((a) => { a.draggable = false; });
    card.addEventListener('dragstart', (e) => { S.ui.dragCourse = c.id; card.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', c.id); } catch (x) { /* ignore */ } });
    card.addEventListener('dragend', () => { S.ui.dragCourse = null; card.classList.remove('dragging'); document.querySelectorAll('.over').forEach((n) => n.classList.remove('over')); });
    card.addEventListener('dragover', (e) => { if (S.ui.dragCourse && S.ui.dragCourse !== c.id) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; card.classList.add('over'); } });
    card.addEventListener('dragleave', (e) => { if (!card.contains(e.relatedTarget)) card.classList.remove('over'); });
    card.addEventListener('drop', (e) => {
      e.preventDefault(); const from = S.ui.dragCourse; S.ui.dragCourse = null;
      if (!from || from === c.id) return;
      const ids = S.orderedCourses().map((x) => x.id); ids.splice(ids.indexOf(c.id), 0, ids.splice(ids.indexOf(from), 1)[0]);
      S.prefs.courseOrder = ids; S.savePrefs(); S.render(true);
    });
  }
  function courseCard(c, opts = {}) {
    const color = S.courseColor(c.id, c.name), name = S.cn(c.id, c.name), custom = !!S.cmeta(c.id, c.name).name;
    const items = tasksOnly().filter((i) => i.courseId === c.id);
    const od = items.filter(S.isOverdue).length, soon = items.filter((i) => !S.isDone(i) && i.due && i.due >= Date.now() && i.due < Date.now() + 7 * S.DAY).length;
    const editing = S.ui.renaming === c.id, canDrag = !opts.dash && !editing;
    const stop = (e) => e.stopPropagation();
    let title;
    if (editing) {
      let done = false;
      const finish = (save, v) => { if (done) return; done = true; if (save) S.setCourseMeta(c.id, { name: v.trim() && v.trim() !== S.autoName(c.name) ? v.trim() : '' }); S.ui.renaming = null; S.render(); };
      title = h('input', { class: 'sgo-input sgo-rename', value: name, placeholder: S.autoName(c.name), maxlength: '80', 'aria-label': 'Course name', onclick: stop, ondblclick: stop,
        onkeydown: (e) => { e.stopPropagation(); if (e.key === 'Enter') finish(true, e.target.value); else if (e.key === 'Escape') finish(false); },
        onblur: (e) => finish(true, e.target.value) });
      setTimeout(() => { title.focus(); title.select(); }, 30);
    } else title = h('div', { class: 'sgo-course-t', title: name }, name);
    const card = h('article', { class: 'sgo-course' + (opts.dash ? ' dash' : ''), style: { '--c': color }, draggable: canDrag ? 'true' : null, dataset: { id: c.id } },
      !editing && h('a', { class: 'sgo-course-link', href: `/course/${c.id}/materials`, draggable: 'false', 'aria-label': 'Open ' + name }),
      h('div', { class: 'sgo-course-cover' }),
      h('div', { class: 'sgo-course-actions' },
        h('button', { class: 'sgo-chip-btn', title: 'Rename', 'aria-label': 'Rename ' + name, onclick: (e) => { stop(e); S.ui.renaming = c.id; S.render(); } }, icon('edit', 15)),
        h('button', { class: 'sgo-chip-btn', title: S.courseHidden(c) ? 'Show on dashboard' : 'Hide from dashboard', 'aria-label': (S.courseHidden(c) ? 'Show on dashboard: ' : 'Hide from dashboard: ') + name, onclick: (e) => { stop(e); S.setCourseHidden(c, !S.courseHidden(c)); } }, icon('eyeoff', 15)),
        h('button', { class: 'sgo-chip-btn', title: 'Customize name & colour', 'aria-label': 'Customize ' + name, onclick: (e) => { stop(e); S.openCourseEditor(c); } }, icon('palette', 15)),
        h('button', { class: 'sgo-chip-btn', title: 'Change banner', 'aria-label': 'Change banner for ' + name, onclick: (e) => { stop(e); S.openBannerPicker(c); } }, icon('image', 15))),
      h('div', { class: 'sgo-course-body' }, title,
        c.name !== name ? h('div', { class: 'sgo-course-raw' }, c.name) : null,
        h('div', { class: 'sgo-course-pills' }, od > 0 && pill(od + ' overdue', 'pr-critical'), soon > 0 && pill(soon + ' this week', 'pr-medium'), !od && !soon && pill('All clear', 'st-done'))),
      !opts.dash && h('div', { class: 'sgo-course-foot' }, h('a', { href: assignmentsHref('course=' + c.id) }, 'Assignments'), h('a', { href: `/course/${c.id}/materials` }, 'Materials')));
    { const cov = card.querySelector('.sgo-course-cover'); paintCover(cov, c, name, coverFor(c, name), true); if (S.cmeta(c.id, c.name).cover === 'orig') S.guardCover(cov, c.id, c.name); }
    if (canDrag) bindCourseDrag(card, c);
    return card;
  }

  /* Customize modal: name, colour, cover. Edits apply live and persist immediately. */
  /* Removes the open modal and its Escape listener. Called on close and on every navigation. */
  S.closeModal = (soft) => {
    const host = S.modalHost, bg = host && host.firstElementChild;
    if (soft && bg && !matchMedia('(prefers-reduced-motion: reduce)').matches) { // fade out, then remove; a modal opened meanwhile is left alone
      bg.classList.add('leaving'); setTimeout(() => { if (bg.parentNode === host && bg.classList.contains('leaving')) bg.remove(); }, 150);
    } else if (host) host.replaceChildren();
    if (S._modalKey) { document.removeEventListener('keydown', S._modalKey, true); S._modalKey = null; }
  };
  S.openCourseEditor = (c) => {
    const host = S.modalHost; if (!host) return;
    S.closeModal();
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    const close = () => { S.closeModal(true); S.render(); };
    S._modalKey = onKey;
    document.addEventListener('keydown', onKey, true);
    const prev = h('div', { class: 'sgo-cgrid sgo-prev' });
    const fresh = () => { const card = courseCard(c, { dash: true }); const l = card.querySelector('.sgo-course-link'); if (l) l.remove(); card.querySelector('.sgo-course-actions').remove(); prev.replaceChildren(card); };
    const nameIn = h('input', { class: 'sgo-input', value: S.cmeta(c.id, c.name).name || '', placeholder: S.autoName(c.name), maxlength: '80', style: { width: '100%' },
      oninput: (e) => { S.setCourseMeta(c.id, { name: e.target.value.trim() }); fresh(); } });
    const sw = h('div', { class: 'sgo-swatches' });
    const pick = (col) => { S.prefs.courseColors[c.id] = col; S.savePrefs(); fresh(); drawSw(); };
    const drawSw = () => { const cur = S.courseColor(c.id, c.name); sw.replaceChildren(groupedSwatches(S.COURSE_GROUPS, cur, pick),
      h('label', { class: 'sw-custom' }, h('span', null, 'Custom colour'), h('input', { type: 'color', value: cur, 'aria-label': 'Custom colour', onchange: (e) => pick(e.target.value) }))); };
    fresh(); drawSw();
    const row = (t, el) => h('div', { class: 'sgo-mrow' }, h('label', null, t), el);
    host.replaceChildren(h('div', { class: 'sgo-modal-bg', onclick: (e) => { if (e.target === e.currentTarget) close(); } },
      h('div', { class: 'sgo-modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Customize course' },
        h('h2', null, 'Customize course'), h('p', { class: 'sgo-muted' }, 'This only changes how the course looks here. Links and Schoology itself stay exactly the same.'),
        prev, row('Display name', nameIn), row('Colour', sw), row('Banner', btn('Choose banner…', () => S.openBannerPicker(c), 'ghost', 'image')),
        h('div', { class: 'sgo-head-a sgo-mfoot' },
          btn('Reset to original', () => { S.resetCourse(c.id); close(); }, 'ghost', 'reload'), btn('Done', close, 'primary', 'check')))));
    setTimeout(() => nameIn.focus(), 30);
  };

  /* Banner picker: stage a choice, preview it, then Apply. The choice is stored per course id and never touches Schoology. */
  /** Colours in small labelled families rather than one long row. items are [name, hex]. */
  function groupedSwatches(groups, cur, onPick, shape) {
    return h('div', { class: 'sw-groups' + (shape ? ' ' + shape : ''), role: 'group' }, groups.map(([label, items]) => h('div', { class: 'sw-group' }, h('span', { class: 'sw-gl' }, label),
      h('div', { class: 'sw-row' }, items.map(([name, hex]) => h('button', { type: 'button', class: 'sw' + (cur === hex ? ' on' : ''), title: name, 'aria-label': name, 'aria-pressed': String(cur === hex), style: { background: hex }, onclick: () => onPick(hex) }, cur === hex ? icon('check', 14) : null))))));
  }
  S.groupedSwatches = groupedSwatches;

  /* The little symbol beside each course's announcements. Pick any of these; it is saved for that course only. */
  S.NOTIF_ICONS = [['mega', 'Megaphone'], ['bell', 'Bell'], ['flag', 'Flag'], ['alert', 'Alert'], ['inbox', 'Inbox'], ['rocket', 'Rocket'], ['notepad', 'Notepad'], ['clock', 'Clock']];
  S.notifIcon = (c) => { const v = S.cmeta(c.id, c.name).icon; return S.NOTIF_ICONS.some((x) => x[0] === v) ? v : 'mega'; };
  S.openIconPicker = (c) => {
    const host = S.modalHost; if (!host) return;
    S.closeModal();
    const close = () => { S.closeModal(true); S.render(true); };
    S._modalKey = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', S._modalKey, true);
    const name = S.cn(c.id, c.name), news = S.state.announcements.filter((a) => a.courseId === c.id).length, grid = h('div', { class: 'ni-grid', role: 'group', 'aria-label': 'Notification icons' }), prev = h('div', { class: 'ni-prev' });
    const draw = () => {
      const cur = S.notifIcon(c);
      prev.replaceChildren(h('span', { class: 'sgo-icon-btn ni-demo' }, icon(cur, 22), h('span', { class: 'dc-count' }, news || 1)), h('span', { class: 'sgo-muted' }, 'How it looks on the card'));
      grid.replaceChildren(...S.NOTIF_ICONS.map(([id, label]) => h('button', { type: 'button', class: 'ni-btn' + (cur === id ? ' on' : ''), 'aria-pressed': String(cur === id), title: label, 'aria-label': label,
        onclick: () => { S.setCourseMeta(c.id, { icon: id === 'mega' ? '' : id }); draw(); } }, icon(id, 22), h('span', null, label))));
    };
    draw();
    host.replaceChildren(h('div', { class: 'sgo-modal-bg', onclick: (e) => { if (e.target === e.currentTarget) close(); } },
      h('div', { class: 'sgo-modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Notification icon' },
        h('h2', null, 'Notification icon'), h('p', { class: 'sgo-muted' }, `${name} · the symbol beside this course's announcements. It only changes how this card looks.`),
        prev, grid, h('div', { class: 'sgo-head-a sgo-mfoot' }, btn('Done', close, 'primary', 'check')))));
  };

  S.openBannerPicker = (c) => {
    const host = S.modalHost; if (!host) return;
    S.closeModal();
    const close = () => { S.closeModal(true); S.render(true); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    S._modalKey = onKey; document.addEventListener('keydown', onKey, true);
    const saved = S.cmeta(c.id, c.name).cover || '', original = S.originalBanner(c.id, c.name), suggested = S.recommendBanner(c.name);
    let staged = saved;
    const preview = h('div', { class: 'bp-preview', role: 'img', 'aria-label': 'Banner preview' }), caption = h('div', { class: 'bp-cap', 'aria-live': 'polite' });
    const grid = h('div', { class: 'bp-grid', role: 'group', 'aria-label': 'Banner choices' });
    const file = h('input', { type: 'file', accept: 'image/*', style: { display: 'none' }, onchange: async (e) => { const f = e.target.files[0]; if (!f) return; try { staged = await S.imageToDataUrl(f); draw(); } catch (x) { alert('That image could not be read.'); } } });
    const cname = S.cn(c.id, c.name);
    const labelOf = (v) => v === '' ? 'Automatic (a photo that fits the subject, otherwise typographic)' : v === 'orig' ? (original ? 'Original Schoology banner' : 'Original (not found, so a colour is shown)') : v === 't' ? 'Typographic, in this course\'s colour'
      : v.startsWith('b:') ? (S.SUBJECT_BANNERS.find((x) => 'b:' + x[0] === v) || [, 'Banner'])[1] : 'Your image';
    const thumbOf = (v) => { const cv = resolveCover(c, cname, v), t = h('span', { class: 'bp-thumb' + (cv.typo ? ' typo' : ''), style: cv.css ? { background: cv.css } : null }); if (cv.typo) t.append(typoBanner(c, cname, S.courseCode(c.name) || 'Course', true)); return t; };
    function draw() {
      const isUp = staged.startsWith('data:');
      paintCover(preview, c, cname, resolveCover(c, cname, staged), true);
      if (staged === 'orig') S.guardImage(preview, original, S.autoGradient(c.id, c.name));
      caption.textContent = labelOf(staged) + (staged === saved ? '' : '  ·  not applied yet');
      const tile = (value, label, extra) => h('button', { type: 'button', class: 'bp-tile' + (staged === value ? ' on' : ''), 'aria-pressed': String(staged === value), title: label,
        disabled: extra && extra.disabled ? true : null, onclick: () => { staged = value; draw(); } },
        thumbOf(value), h('span', { class: 'bp-l' }, label), extra && extra.suggested ? h('span', { class: 'bp-sug' }, 'Suggested') : null);
      grid.replaceChildren(
        tile('', 'Automatic'), tile('t', 'Typographic'), tile('orig', 'Original', { disabled: !original }),
        ...S.SUBJECT_BANNERS.map(([id, n]) => tile('b:' + id, n, { suggested: suggested === id })),
        h('button', { type: 'button', class: 'bp-tile' + (isUp ? ' on' : ''), title: 'Upload an image (stays on this device)', onclick: () => file.click() },
          h('span', { class: 'bp-thumb bp-up', style: isUp ? { background: S.coverCssFor(c.id, c.name, staged) } : null }, isUp ? null : icon('plus', 18)), h('span', { class: 'bp-l' }, 'Upload image')),
        file);
    }
    draw();
    host.replaceChildren(h('div', { class: 'sgo-modal-bg', onclick: (e) => { if (e.target === e.currentTarget) close(); } },
      h('div', { class: 'sgo-modal wide', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Choose a course banner' },
        h('h2', null, 'Course banner'), h('p', { class: 'sgo-muted' }, `${S.cn(c.id, c.name)} · only changes how this class looks here.`),
        preview, caption, grid,
        h('div', { class: 'sgo-head-a sgo-mfoot' },
          btn('Reset to automatic', () => { S.setCourseMeta(c.id, { cover: '' }); close(); }, 'ghost', 'reload'),
          h('div', { class: 'sgo-head-a' }, btn('Cancel', close, 'ghost'), btn('Apply', () => { S.setCourseMeta(c.id, { cover: staged }); close(); }, 'primary', 'check'))))));
  };
  /** Settings actions: 'orig' points every class at its original Schoology banner; '' clears every choice (the default is the original too). */
  function setAllBanners(mode) {
    new Set([...Object.keys(S.prefs.courseMeta), ...S.state.courses.map((x) => x.id)]).forEach((id) => S.setCourseMeta(id, { cover: mode }));
  }

  V.courses = () => {
    const list = S.orderedCourses();
    return h('div', { class: 'sgo-page' }, pageHead('Courses', `${list.length} ${list.length === 1 ? 'course' : 'courses'} · drag cards to rearrange`,
      [S.prefs.courseOrder.length ? btn('Reset order', () => { S.prefs.courseOrder = []; S.savePrefs(); S.render(); }, 'ghost', 'reload') : null]),
      list.length ? h('div', { class: 'sgo-cgrid' }, list.map((c) => courseCard(c))) : empty('No courses found', 'Courses are read from your Schoology account. Open Settings → Diagnostics to see what was detected, or use Classic view.'));
  };

  /* ---------- Search: one overlay for assignments and courses, opened from the sidebar (or / and Ctrl+K) ---------- */
  S.openSearch = () => {
    const host = S.modalHost; if (!host) return;
    S.closeModal();
    const close = () => { S.closeModal(true); };
    S._modalKey = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', S._modalKey, true);
    let sel = 0, rows = [];
    const input = h('input', { class: 'sp-input', type: 'search', placeholder: 'Search assignments and courses', 'aria-label': 'Search assignments and courses', autocomplete: 'off', spellcheck: 'false', role: 'combobox', 'aria-expanded': 'true', 'aria-controls': 'sp-list' });
    const list = h('ul', { class: 'sp-list', id: 'sp-list', role: 'listbox', 'aria-label': 'Results' });
    const go = (r) => { close(); S.go(r.href); };
    const compute = () => {
      const q = input.value.trim().toLowerCase(), now = Date.now(), toks = q.split(/\s+/).filter(Boolean);
      const hit = (s) => toks.every((t) => s.toLowerCase().includes(t));
      const asg = tasksOnly().filter((i) => !S.isStale(i) || S.isComplete(i)).filter((i) => !q ? !S.isComplete(i) && (S.isOverdue(i) || (i.due && i.due >= S.sod(now))) : hit(`${i.title} ${S.cn(i.courseId, i.courseName)}`))
        .sort((a, b) => (S.isOverdue(b) - S.isOverdue(a)) || (a.due ?? 9e15) - (b.due ?? 9e15)).slice(0, q ? 8 : 6);
      const crs = q ? S.orderedCourses().filter((c) => hit(`${S.cn(c.id, c.name)} ${c.name}`)).slice(0, 4) : [];
      rows = [...asg.map((i) => ({ kind: 'a', it: i, href: itemHref(i) })), ...crs.map((c) => ({ kind: 'c', c, href: `/course/${c.id}/materials` }))];
      sel = Math.min(sel, Math.max(0, rows.length - 1));
      const head = (t) => h('li', { class: 'sp-h', role: 'presentation' }, t);
      const row = (r, i) => {
        const on = i === sel;
        if (r.kind === 'c') return h('li', { class: 'sp-r' + (on ? ' on' : ''), role: 'option', 'aria-selected': String(on), onclick: () => go(r), onmousemove: () => { if (sel !== i) { sel = i; paint(); } } },
          h('span', { class: 'sp-ic' }, icon('book', 18)), h('span', { class: 'sp-m' }, h('b', null, S.cn(r.c.id, r.c.name)), h('small', null, 'Course')), icon('right', 16));
        const u = urgency(r.it, now);
        return h('li', { class: 'sp-r' + (on ? ' on' : ''), role: 'option', 'aria-selected': String(on), onclick: () => go(r), onmousemove: () => { if (sel !== i) { sel = i; paint(); } } },
          h('span', { class: 'sp-ic' }, icon(r.it.type === 'assessment' ? 'rocket' : 'notepad', 18)),
          h('span', { class: 'sp-m' }, h('b', null, r.it.title), h('small', null, [S.cn(r.it.courseId, r.it.courseName) || 'Course', dueLabel(r.it, now)].join(' \u00b7 '))),
          h('span', { class: 'badge b-' + u.id }, icon(u.icon, 13), u.label), icon('right', 16));
      };
      const items = []; let n = 0;
      if (asg.length) { items.push(head(q ? 'Assignments' : 'Coming up')); asg.forEach((i) => items.push(row(rows[n], n++))); }
      if (crs.length) { items.push(head('Courses')); crs.forEach(() => items.push(row(rows[n], n++))); }
      if (!rows.length) items.push(h('li', { class: 'sp-none', role: 'presentation' }, q ? `Nothing matches \u201c${input.value.trim()}\u201d.` : 'Nothing coming up.'));
      list.replaceChildren(...items);
      const cur = list.querySelector('.sp-r.on'); if (cur) cur.scrollIntoView({ block: 'nearest' });
    };
    const paint = () => { const all = list.querySelectorAll('.sp-r'); all.forEach((el, i) => { el.classList.toggle('on', i === sel); el.setAttribute('aria-selected', String(i === sel)); }); const cur = all[sel]; if (cur) cur.scrollIntoView({ block: 'nearest' }); };
    input.addEventListener('input', () => { sel = 0; compute(); });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(rows.length - 1, sel + 1); paint(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(0, sel - 1); paint(); }
      else if (e.key === 'Enter') { e.preventDefault(); if (rows[sel]) go(rows[sel]); else if (input.value.trim()) allMatches(); }
    });
    const allMatches = () => { const u = S.ui.assign; u.q = input.value.trim(); u.f = 'all'; u.course = ''; close(); S.go(assignmentsHref()); S.render(); };
    compute();
    host.replaceChildren(h('div', { class: 'sgo-modal-bg sp-bg', onclick: (e) => { if (e.target === e.currentTarget) close(); } },
      h('div', { class: 'sp', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Search' },
        h('div', { class: 'sp-field' }, icon('search', 20), input, h('kbd', null, 'Esc')),
        list,
        h('div', { class: 'sp-foot' }, h('span', null, '\u2191\u2193 to move \u00b7 Enter to open'), h('button', { type: 'button', class: 'rv-all', onclick: () => { const u = S.ui.assign; u.q = input.value.trim(); u.f = 'all'; u.course = ''; close(); S.go(assignmentsHref()); S.render(); } }, 'Open the Assignments page', icon('right', 14))))));
    setTimeout(() => input.focus(), 30);
  };
  document.addEventListener('keydown', (e) => {
    if (!document.documentElement.classList.contains('sgo-app')) return;
    const t = document.activeElement, typing = t && (/^(input|textarea|select)$/i.test(t.tagName) || t.isContentEditable);
    if (((e.key === 'k' || e.key === 'K') && (e.ctrlKey || e.metaKey)) || (e.key === '/' && !typing && !e.ctrlKey && !e.metaKey && !e.altKey)) { e.preventDefault(); if (S.modalHost && !S.modalHost.firstElementChild) S.openSearch(); }
  });

  /* ===================== ASSIGNMENTS ===================== */
  V.assignments = (ctx) => {
    const u = S.ui.assign;
    if (ctx.q.f) u.f = ctx.q.f; if (ctx.q.course !== undefined) u.course = ctx.q.course;
    const now = Date.now();
    const filters = {
      all: () => true, upcoming: (i) => !S.isDone(i) && i.due && i.due >= now, missing: (i) => !S.isDone(i) && i.fromOverdue,
      overdue: S.isOverdue, done: S.isDone,
    };
    const byCourse = (i) => !u.course || i.courseId === u.course;
    const byText = (i) => !u.q || (i.title + ' ' + S.cn(i.courseId, i.courseName)).toLowerCase().includes(u.q.toLowerCase());
    const pool = tasksOnly().filter(filters[u.f] || filters.all).filter(byCourse).filter(byText);
    const cmpDue = (a, b) => (a.due ?? 9e15) - (b.due ?? 9e15);
    let groups;
    if (u.sort === 'class') {
      const m = new Map(); pool.sort(cmpDue).forEach((i) => { const k = S.cn(i.courseId, i.courseName) || 'Other'; (m.get(k) || m.set(k, []).get(k)).push(i); });
      groups = [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    } else if (u.sort === 'status') {
      const order = ['missing', 'upcoming', 'past', 'done'], m = {};
      pool.sort(cmpDue).forEach((i) => { const k = S.statusOf(i); (m[k.id] = m[k.id] || { l: k.label, a: [] }).a.push(i); });
      groups = order.filter((k) => m[k]).map((k) => [m[k].l, m[k].a]);
    } else {
      const c = categorize(pool);
      groups = [['Overdue', c.overdue], ['Due today', c.today], ['Upcoming soon', c.soon], ['Due later', c.later], ['No due date', c.none], ['Completed', c.done]].filter((g) => g[1].length);
    }
    const pristine = u.f === 'all' && !u.course && !u.q;
    const review = S.unreviewedItems(), excluded = S.excludedItems().filter(byCourse).filter(byText);
    const chips = [['all', 'All'], ['upcoming', 'Upcoming'], ['missing', 'Missing'], ['overdue', 'Overdue'], ['done', 'Completed']].map(([k, l]) =>
      h('button', { class: 'sgo-chip' + (u.f === k ? ' on' : ''), onclick: () => { u.f = k; S.render(); } }, l, h('span', null, tasksOnly().filter(filters[k]).filter(byCourse).length)));
    const qChip = u.q ? h('button', { class: 'sgo-chip on q-chip', type: 'button', title: 'Clear this search', 'aria-label': `Clear search ${u.q}`, onclick: () => { u.q = ''; S.render(); } }, `“${u.q}”`, icon('plus', 14)) : null;
    const courseSel = h('select', { class: 'sgo-input', onchange: (e) => { u.course = e.target.value; S.render(); } }, h('option', { value: '' }, 'All classes'),
      S.orderedCourses().map((c) => h('option', { value: c.id, selected: u.course === c.id ? 'selected' : null }, S.cn(c.id, c.name))));
    const sortSel = h('select', { class: 'sgo-input', onchange: (e) => { u.sort = e.target.value; S.render(); } },
      [['due', 'Sort: Due date'], ['class', 'Sort: Class'], ['status', 'Sort: Status']].map(([v, l]) => h('option', { value: v, selected: u.sort === v ? 'selected' : null }, l)));
    return h('div', { class: 'sgo-page' },
      pageHead('Assignments', 'Everything you need to do, and when', [btn('New assignment', () => S.openNewAssignment(null), 'primary', 'plus'), btn('Refresh', () => S.hardRefresh(), 'ghost', 'reload')]),
      pristine && review.length ? reviewCard(review) : null,
      h('div', { class: 'sgo-toolbar' }, h('div', { class: 'sgo-chips' }, chips), h('div', { class: 'sgo-filters' }, qChip, courseSel, sortSel)),
      groups.length ? groups.map(([name, arr]) => h('section', { class: 'sgo-sec' }, h('h3', null, name, h('span', null, arr.length)), list(arr)))
        : empty('Nothing here', S.allItems().length ? 'Try a different filter.' : 'No assignments have been read from Schoology yet. Open Settings → Diagnostics to see what was found.'),
      pristine && excluded.length ? excludedSection(excluded) : null);
  };

  V.assignment = (ctx) => {
    const key = decodeURIComponent(ctx.path.replace(/^\/a\//, ''));
    const it = S.state.items[key] || S.prefs.manual[key];
    if (!it) return h('div', { class: 'sgo-page' }, empty('Assignment not found', 'It may have been removed from your upcoming list.'), btn('Back to assignments', () => S.go(assignmentsHref()), 'primary'));
    const pr = S.priorityOf(it), st = S.statusOf(it), done = S.isDone(it);
    const desc = h('div', { class: 'sgo-desc' }, h('div', { class: 'sgo-skel' }));
    (it.manual ? Promise.resolve(it.notes ? '<p>' + String(it.notes).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]) + '</p>' : '') : S.fetchDescription(it)).then((html) => {
      desc.textContent = '';
      desc.append(html && html.trim() ? S.sanitize(html) : h('p', { class: 'sgo-muted' }, 'No description was found for this item. Open it in Schoology for full details.'));
    });
    const fact = (k, v) => h('div', { class: 'sgo-fact' }, h('span', null, k), h('b', null, v));
    return h('div', { class: 'sgo-page narrow', style: { '--c': S.colorOf(it) } },
      h('a', { class: 'sgo-back', href: assignmentsHref() }, icon('left', 16), 'Assignments'),
      h('div', { class: 'sgo-detail' },
        h('div', { class: 'sgo-detail-top' }, h('span', { class: 'sgo-course-tag' }, dot(S.colorOf(it)), S.cn(it.courseId, it.courseName) || 'Course'), pr !== 'low' && pill(S.PRIORITY[pr], 'pr-' + pr), pill(st.label, 'st-' + st.id)),
        h('h1', null, it.title),
        h('div', { class: 'sgo-facts' },
          fact('Due', it.due ? S.fmtDate(it.due, true) + (it.timed ? ' · ' + S.fmtTime(it.due) : '') : 'No due date'),
          fact('Timing', S.relDue(it.due)), fact('Type', it.type === 'assessment' ? 'Test / assessment' : it.type === 'event' ? 'Event' : 'Assignment'),
          fact('Submission', st.label)),
        h('div', { class: 'sgo-head-a' },
          !it.manual && h('a', { class: 'sgo-btn primary', href: it.url }, icon('external', 16), 'Open in Schoology to submit'),
          btn(done ? 'Marked done' : 'Mark as done', () => toggleDone(it), done ? 'ok' : 'ghost', 'check')),
        h('h3', { class: 'sgo-sub' }, 'Description'), desc,
        h('p', { class: 'sgo-note' }, 'Submitting work happens on Schoology’s own page, so nothing about your submission changes. “Done” is a personal checklist saved only in this browser.')));
  };

  /* ===================== CALENDAR ===================== */
  function itemsOn(ts) { return S.allItems().filter((i) => i.due && S.sameDay(i.due, ts)).sort((a, b) => a.due - b.due); }
  function chipFor(i) {
    return h('a', { class: 'sgo-ev' + (S.isDone(i) ? ' done' : ''), href: detailHref(i), style: { '--c': S.colorOf(i) }, title: `${i.title} — ${S.cn(i.courseId, i.courseName)}` }, i.timed ? h('em', null, S.fmtTime(i.due)) : null, i.type === 'assessment' ? h('i', { class: 'sgo-ev-k' }, 'Test') : i.type === 'event' ? h('i', { class: 'sgo-ev-k' }, 'Event') : null, i.title);
  }
  function monthGrid(y, m, mini) {
    const first = new Date(y, m, 1), today = S.sod(Date.now());
    const cells = [...Array(42)].map((_, i) => {
      const ts = new Date(y, m, 1 - first.getDay() + i, 12); const t = ts.getTime(), its = itemsOn(t), other = ts.getMonth() !== m;
      const cls = 'sgo-cell' + (other ? ' other' : '') + (S.sod(t) === today ? ' today' : '');
      if (mini) return h('a', { class: cls, href: '/calendar#?m=day&d=' + iso(t) }, h('span', null, ts.getDate()), its.length ? h('i', { style: { background: S.colorOf(its[0]) } }) : null);
      return h('div', { class: cls, onclick: (e) => { if (e.target.closest('a')) return; setCal({ m: 'day', d: t }); } },
        h('span', { class: 'sgo-cell-n' }, ts.getDate()), its.slice(0, 3).map(chipFor), its.length > 3 && h('button', { class: 'sgo-more', onclick: () => setCal({ m: 'day', d: t }) }, `+${its.length - 3} more`));
    });
    return h('div', { class: 'sgo-month' + (mini ? ' mini' : '') }, S.WEEKDAYS.map((d) => h('div', { class: 'sgo-wd' }, mini ? d[0] : d)), cells);
  }
  function setCal(p) {
    const c = S.ui.cal; if (p.m) c.m = p.m; if (p.d) c.d = p.d;
    S.prefs.calMode = c.m; S.savePrefs();
    history.replaceState(null, '', location.pathname + location.search + '#?m=' + c.m + '&d=' + iso(c.d)); S.render();
  }
  V.calendar = (ctx) => {
    if (!S.ui.cal) S.ui.cal = { m: S.prefs.calMode || 'month', d: Date.now() };
    const c = S.ui.cal; if (ctx.q.m) c.m = ctx.q.m; if (ctx.q.d && fromIso(ctx.q.d)) c.d = fromIso(ctx.q.d) + 12 * 36e5;
    const d = new Date(c.d), step = (dir) => {
      const n = new Date(c.d);
      if (c.m === 'month') n.setMonth(n.getMonth() + dir); else if (c.m === 'week') n.setDate(n.getDate() + 7 * dir); else n.setDate(n.getDate() + (c.m === 'agenda' ? 14 : 1) * dir);
      setCal({ d: n.getTime() });
    };
    const wkStart = new Date(d.getFullYear(), d.getMonth(), d.getDate() - d.getDay(), 12).getTime(), dayAt = (i) => new Date(d.getFullYear(), d.getMonth(), d.getDate() - d.getDay() + i, 12).getTime();
    let title, body;
    if (c.m === 'month') { title = `${S.MONTHS[d.getMonth()]} ${d.getFullYear()}`; body = monthGrid(d.getFullYear(), d.getMonth()); }
    else if (c.m === 'week') {
      title = `${S.fmtDate(wkStart)} – ${S.fmtDate(dayAt(6))}`;
      body = h('div', { class: 'sgo-weekview' }, [...Array(7)].map((_, i) => { const t = dayAt(i), its = itemsOn(t);
        return h('div', { class: 'sgo-wcol' + (S.sameDay(t, Date.now()) ? ' today' : '') }, h('a', { class: 'sgo-wh', href: '#?m=day&d=' + iso(t) }, S.WEEKDAYS[new Date(t).getDay()], h('b', null, new Date(t).getDate())), its.length ? its.map(chipFor) : h('span', { class: 'sgo-muted' }, '—')); }));
    } else if (c.m === 'day') {
      title = S.fmtDate(c.d, true); const its = itemsOn(c.d);
      body = its.length ? list(its) : empty('Nothing scheduled', 'No deadlines or events on this day.');
    } else {
      const from = S.sod(c.d); title = `Agenda · from ${S.fmtDate(from)}`;
      const its = S.allItems().filter((i) => i.due && i.due >= from && i.due < from + 30 * S.DAY).sort((a, b) => a.due - b.due), m = new Map();
      its.forEach((i) => { const k = S.sod(i.due); (m.get(k) || m.set(k, []).get(k)).push(i); });
      body = m.size ? [...m.entries()].map(([k, a]) => h('section', { class: 'sgo-sec' }, h('h3', null, S.relDue(k + 12 * 36e5).replace(/^Due /, '') + ' · ' + S.fmtDate(k), h('span', null, a.length)), list(a))) : empty('Nothing in the next 30 days');
    }
    const seg = h('div', { class: 'sgo-seg' }, [['month', 'Month'], ['week', 'Week'], ['day', 'Day'], ['agenda', 'Agenda']].map(([k, l]) => h('button', { class: c.m === k ? 'on' : '', onclick: () => setCal({ m: k }) }, l)));
    return h('div', { class: 'sgo-page' }, pageHead('Calendar', 'Deadlines and events Schoology has shown you'),
      h('div', { class: 'sgo-toolbar' }, h('div', { class: 'sgo-calnav' }, h('button', { class: 'sgo-icon-btn', onclick: () => step(-1), 'aria-label': 'Previous' }, icon('left', 18)), h('button', { class: 'sgo-btn ghost', onclick: () => setCal({ d: Date.now() }) }, 'Today'), h('button', { class: 'sgo-icon-btn', onclick: () => step(1), 'aria-label': 'Next' }, icon('right', 18)), h('h2', null, title)), h('div', { class: 'sgo-head-a' }, seg, btn('Add personal task', () => S.openNewAssignment(), 'ghost', 'plus'))),
      body);
  };

  /* ===================== GRADES ===================== */
  const gPct = (p) => (p == null ? '—' : (Math.round(p * 100) / 100) + '%');
  const gItemPct = (it) => (it.earned != null && it.possible ? Math.round((it.earned / it.possible) * 1000) / 10 : null);
  const gNum = (n) => (n == null ? '—' : String(Math.round(n * 100) / 100));
  const gWhen = (txt) => { const p = txt && S.parseDue(txt); return p ? `${mon3(p.ts)} ${new Date(p.ts).getDate()}` + (p.timed ? ' · ' + S.fmtTime(p.ts) : '') : txt || '—'; };
  /** Grading periods that actually hold graded entries (Schoology also lists an empty "(no grading period)" group). */
  const gradePeriods = (c) => { const p = c.periods.filter((x) => x.categories.some((cat) => cat.items.length)); return p.length ? p : c.periods; };
  /* ---------- Hypothetical layer on the Schoology gradebook ----------
   * The real grades are never changed. When editing is unlocked a student can add scores and categories (with weights), try a
   * different score on any item, and set weights for Schoology's own categories. The course shows its real grade and the grade
   * with those changes side by side. Locked, the layer is read-only. Everything is stored in this browser only (prefs.hypo). */
  const hyNum = (v) => { const x = parseFloat(String(v).replace(',', '.')); return Number.isFinite(x) && x >= 0 ? x : null; };
  const hyId = () => 'h' + Math.random().toString(36).slice(2, 9);
  const hyR2 = (n) => Math.round(n * 100) / 100;
  const ovKey = (g) => g.courseId || g.gradebookId || g.courseName;
  const ovGet = (g, create) => { const all = S.prefs.hypo || (S.prefs.hypo = {}), k = ovKey(g); if (!all[k] && create) all[k] = { cats: [], items: [], edits: {}, weights: {} }; const o = all[k] || { cats: [], items: [], edits: {}, weights: {} }; o.edits = o.edits || {}; o.weights = o.weights || {}; o.cats = o.cats || []; o.items = o.items || []; return o; };
  const ovEditing = () => !!S.prefs.gradesEdit;
  const ovSave = () => { S.savePrefs(); S.render(true); };
  const ovPrune = (g) => { const all = S.prefs.hypo || {}, o = all[ovKey(g)]; if (o && !o.cats.length && !o.items.length && !Object.keys(o.edits || {}).length && !Object.keys(o.weights || {}).length) delete all[ovKey(g)]; };
  const numInput = (value, label, fk, onCommit, onLive) => h('input', { class: 'sgo-input ov-num', type: 'number', inputmode: 'decimal', min: '0', step: 'any', value: value == null ? '' : value, 'aria-label': label, dataset: { fk },
    oninput: onLive ? (e) => onLive(hyNum(e.target.value)) : null, onchange: (e) => onCommit(hyNum(e.target.value)) });

  /** Set (or clear) a what-if score for an item Schoology already lists. A value equal to the real one removes the edit. */
  function setEdit(g, cat, it, field, value) {
    const key = S.gradeKey(cat, it), o = ovGet(g, true), e = o.edits[key] || (o.edits[key] = {});
    if (value === (it[field] == null ? null : it[field])) delete e[field]; else e[field] = value;
    if (!Object.keys(e).length) delete o.edits[key];
    ovPrune(g); ovSave();
  }
  const clearEdit = (g, cat, it) => { const o = ovGet(g, true); delete o.edits[S.gradeKey(cat, it)]; ovPrune(g); ovSave(); };

  /** The two grades side by side, and a plain note when the weights or scores need attention. */
  function ovSummary(g, calc) {
    const total = hyR2(calc.totalWeight), notes = [];
    if (calc.percent == null) notes.push('Add a score to a category to see a running total.');
    else {
      if (calc.weighted && Math.abs(total - 100) > 0.01) notes.push(`Weights add up to ${total}%. The total uses the weights you see, scaled to 100%.`);
      if (calc.weighted && calc.usedWeight < calc.totalWeight) notes.push('Categories with no scores yet are left out and the others are scaled up.');
      if (calc.missingWeights) notes.push('Some Schoology categories have no weight, so they are not counted. Set a weight for them below.');
      if (!calc.weighted) notes.push('Schoology did not report category weights, so every point counts equally. Set weights below to weight by category.');
    }
    // the change is measured from the unchanged gradebook worked out the same way, so rounding or weights Schoology does not show never look like the student's doing
    const base = S.overlayGrade(g, {}).percent, from = base != null ? base : g.percent, delta = calc.percent != null && from != null ? hyR2(calc.percent - from) : null;
    if (calc.changed && calc.percent != null && base != null && g.percent != null && Math.abs(base - g.percent) > 0.1) notes.push(`Schoology shows ${gPct(g.percent)}. With the weights above, your unchanged gradebook works out to ${gPct(hyR2(base))}, so the change is measured from that.`);
    return h('div', { class: 'ov-sum', 'aria-live': 'polite' },
      h('div', { class: 'ov-pair' },
        h('div', null, h('span', null, 'Schoology'), h('b', null, g.percent != null ? gPct(g.percent) : '—')),
        h('div', { class: 'ov-hyp' }, h('span', null, 'With your changes'), h('b', null, calc.percent == null ? '—' : gPct(hyR2(calc.percent))),
          delta != null && delta !== 0 ? h('small', { class: delta > 0 ? 'up' : 'down' }, (delta > 0 ? '+' : '') + delta + ' points') : null)),
      notes.map((n) => h('p', { class: 'ov-note' }, icon('help', 14), n)));
  }

  /** Category weights (Schoology's own, editable when unlocked, and the student's) with a running total of the weights. */
  function ovWeights(g, calc, edit) {
    const o = ovGet(g), total = hyR2(calc.cats.reduce((a, k) => a + (Number(k.weight) || 0), 0)), ok = Math.abs(total - 100) < 0.01;
    const setW = (k, v) => { const x = ovGet(g, true); if (k.custom) { const c = x.cats.find((q) => q.id === k.id); if (c) c.weight = v == null ? 0 : v; } else if (v == null || v === (k.official && g.periods ? reported(g, k.name) : null)) delete x.weights[k.name]; else x.weights[k.name] = v; ovPrune(g); ovSave(); };
    const reported = (gb, name) => { for (const p of gb.periods || []) for (const c of p.categories) if (c.name === name && c.weight != null) return Number(c.weight); return null; };
    const row = (k) => h('div', { class: 'ov-w' + (k.custom ? ' custom' : ''), role: 'group', 'aria-label': 'Category ' + k.name },
      h('span', { class: 'ov-wn' }, edit && k.custom ? h('input', { class: 'sgo-input', type: 'text', value: k.name, maxlength: '40', 'aria-label': 'Category name', dataset: { fk: 'oc-n-' + k.id }, onchange: (e) => { const x = ovGet(g, true), c = x.cats.find((q) => q.id === k.id); if (c) c.name = e.target.value.trim() || 'Untitled'; ovSave(); } }) : k.name,
        k.custom ? h('em', null, 'Yours') : k.set ? h('em', null, 'Edited') : null),
      edit ? h('span', { class: 'ov-wi' }, numInput(k.weight, 'Weight of ' + k.name + ' in percent', 'oc-w-' + k.id, (v) => setW(k, v)), h('i', null, '%')) : h('span', { class: 'ov-wv' }, k.weight != null && Number(k.weight) > 0 ? hyR2(Number(k.weight)) + '%' : 'No weight'),
      edit && k.custom ? h('button', { class: 'sgo-icon-btn ov-del', type: 'button', title: 'Delete category', 'aria-label': 'Delete category ' + k.name, onclick: () => {
        const n = o.items.filter((i) => i.cat === k.id).length;
        const go = () => { const x = ovGet(g, true); x.cats = x.cats.filter((q) => q.id !== k.id); x.items = x.items.filter((i) => i.cat !== k.id); ovPrune(g); ovSave(); };
        if (n) S.openConfirm({ title: 'Delete this category?', body: `Its ${n} ${n === 1 ? 'score' : 'scores'} will be deleted too. Nothing changes in Schoology.`, ok: 'Delete', danger: true, onOk: go }); else go();
      } }, icon('trash', 16)) : h('span', { class: 'ov-wx' }));
    const addName = h('input', { class: 'sgo-input', type: 'text', maxlength: '40', placeholder: 'New category, e.g. Participation', 'aria-label': 'New category name' });
    const addW = h('input', { class: 'sgo-input ov-num', type: 'number', min: '0', max: '100', step: 'any', placeholder: '0', 'aria-label': 'New category weight in percent' });
    const addCat = () => { const name = addName.value.trim(); if (!name) { addName.focus(); return; } const x = ovGet(g, true); x.cats.push({ id: hyId(), name, weight: hyNum(addW.value) ?? 0 }); ovSave(); };
    return h('div', { class: 'ov-weights' },
      h('div', { class: 'ov-wh' }, h('b', null, 'Category weights'), h('span', { class: 'ov-total ' + (ok ? 'ok' : 'warn') }, ok ? 'Total 100%' : `Total ${total}%`)),
      h('div', { class: 'ov-wl' }, calc.cats.map(row)),
      edit ? h('form', { class: 'ov-addcat', onsubmit: (e) => { e.preventDefault(); addCat(); } },
        addName, h('span', { class: 'ov-wi' }, addW, h('i', null, '%')),
        h('button', { class: 'sgo-btn ghost', type: 'submit' }, icon('plus', 16), 'Add category')) : null);
  }

  /** Everything the student added to this course: a table of their own scores. */
  function ovCustom(g, calc, edit) {
    const o = ovGet(g);
    if (!o.items.length) return edit ? h('p', { class: 'ov-empty' }, 'Scores you add with the Add grade button appear here.') : null;
    const catName = (id) => (calc.cats.find((k) => k.id === id) || {}).name || 'Uncategorised';
    const rows = o.items.map((it) => {
      const pc = it.earned != null && it.possible ? hyR2((it.earned / it.possible) * 100) : null;
      return h('tr', { class: 'ov-row' },
        h('td', { class: 'gr2-t' }, edit ? h('input', { class: 'sgo-input', type: 'text', value: it.title, maxlength: '80', 'aria-label': 'Assignment name', dataset: { fk: 'oi-t-' + it.id }, onchange: (e) => { it.title = e.target.value.trim() || 'Untitled'; ovSave(); } }) : it.title),
        h('td', { class: 'gr2-c' }, edit ? h('select', { class: 'sgo-input', 'aria-label': 'Category', dataset: { fk: 'oi-c-' + it.id }, onchange: (e) => { it.cat = e.target.value; ovSave(); } }, calc.cats.map((k) => h('option', { value: k.id, selected: it.cat === k.id ? 'selected' : null }, k.name))) : catName(it.cat)),
        h('td', { class: 'gr2-d' }, 'Hypothetical'),
        h('td', { class: 'n' }, edit ? numInput(it.earned, 'Earned', 'oi-e-' + it.id, (v) => { it.earned = v; ovSave(); }) : gNum(it.earned)),
        h('td', { class: 'n' }, edit ? numInput(it.possible, 'Possible', 'oi-p-' + it.id, (v) => { it.possible = v; ovSave(); }) : gNum(it.possible)),
        h('td', { class: 'n' }, pc == null ? '—' : pc + '%'),
        h('td', null, edit ? h('button', { class: 'sgo-icon-btn ov-del', type: 'button', title: 'Delete score', 'aria-label': 'Delete ' + it.title, onclick: () => { const x = ovGet(g, true); x.items = x.items.filter((q) => q.id !== it.id); ovPrune(g); ovSave(); } }, icon('trash', 16)) : h('span', { class: 'gr2-st st-hyp' }, 'Your score')));
    });
    return h('div', { class: 'gr2-period ov-custom' }, h('div', { class: 'gr2-ph' }, h('b', null, 'Your hypothetical grades'), h('span', null, 'Not in Schoology')),
      h('div', { class: 'gr2-scroll' }, h('table', { class: 'gr2-table ov-table' },
        h('thead', null, h('tr', null, ['Assignment', 'Category', 'Source', 'Earned', 'Possible', '%', ''].map((t, i) => h('th', { class: i >= 3 && i <= 5 ? 'n' : '' }, t)))), h('tbody', null, rows))));
  }

  /** Lock / Edit toggle, the Add grade button and a one-line hint. Used at the top of the Grades page and of a course's Grades tab. */
  function gradeControls(preferKey) {
    const editing = ovEditing();
    return [
      h('button', { class: 'sgo-btn primary gr-add', type: 'button', disabled: editing ? null : true, title: editing ? 'Add a hypothetical grade' : 'Unlock to add grades', dataset: { fk: 'gr-add' }, onclick: () => S.openAddGrade(preferKey) }, icon('plus', 16), 'Add grade'),
      h('button', { class: 'sgo-btn ghost gr-lock' + (editing ? ' on' : ''), type: 'button', 'aria-pressed': String(editing), dataset: { fk: 'gr-lock' },
        title: editing ? 'Editing is on. Lock to secure your grades' : 'Locked. Unlock to add or change hypothetical grades', onclick: () => { S.prefs.gradesEdit = !editing; S.savePrefs(); S.render(true); } },
        icon(editing ? 'unlock' : 'lock', 16), editing ? 'Editing' : 'Locked')];
  }
  const gradeHint = () => (ovEditing() ? 'Editing is on. Added grades and changes are hypothetical: saved only in this browser, never sent to Schoology.' : 'Locked. Your hypothetical grades are secured. Unlock to add or change them.');

  /** Add a grade: pick a course, a category (or make a new one with a weight) and a score. */
  S.openAddGrade = (preferKey) => {
    const host = S.modalHost; if (!host || !ovEditing()) return;
    const books = S.state.grades; if (!books.length) return;
    S.closeModal();
    const close = () => { S.closeModal(); S.render(true); };
    S._modalKey = (e) => { if (e.key === 'Escape') close(); }; document.addEventListener('keydown', S._modalKey, true);
    let g = books.find((b) => ovKey(b) === preferKey) || books[0];
    const f = {}, err = h('p', { class: 'sgo-err', role: 'alert' }), newBox = h('div', { class: 'ov-new', hidden: true });
    const courseSel = h('select', { class: 'sgo-input', 'aria-label': 'Course', onchange: (e) => { g = books.find((b) => ovKey(b) === e.target.value) || g; fillCats(); } }, books.map((b) => h('option', { value: ovKey(b), selected: b === g ? 'selected' : null }, S.cn(b.courseId, b.courseName))));
    const catSel = h('select', { class: 'sgo-input', 'aria-label': 'Category', onchange: () => { newBox.hidden = catSel.value !== '__new'; } });
    function fillCats() { const calc = S.overlayGrade(g, ovGet(g)); catSel.replaceChildren(...calc.cats.map((k) => h('option', { value: k.id }, k.name + (k.weight != null && Number(k.weight) > 0 ? ` (${hyR2(Number(k.weight))}%)` : ''))), h('option', { value: '__new' }, '+ New category…')); newBox.hidden = catSel.value !== '__new'; }
    fillCats();
    const name = h('input', { class: 'sgo-input', type: 'text', maxlength: '80', placeholder: 'e.g. Unit 4 test', 'aria-label': 'Assignment name' });
    const earned = h('input', { class: 'sgo-input', type: 'number', inputmode: 'decimal', min: '0', step: 'any', 'aria-label': 'Points earned' }), possible = h('input', { class: 'sgo-input', type: 'number', inputmode: 'decimal', min: '0', step: 'any', 'aria-label': 'Points possible' });
    const newName = h('input', { class: 'sgo-input', type: 'text', maxlength: '40', placeholder: 'Category name', 'aria-label': 'New category name' }), newW = h('input', { class: 'sgo-input', type: 'number', min: '0', max: '100', step: 'any', placeholder: 'Weight %', 'aria-label': 'New category weight in percent' });
    newBox.append(newName, newW);
    const submit = (e) => {
      if (e) e.preventDefault();
      const title = name.value.trim(), e1 = hyNum(earned.value), p1 = hyNum(possible.value);
      if (!title) { err.textContent = 'Name the assignment.'; name.focus(); return; }
      if (e1 == null || p1 == null || p1 <= 0) { err.textContent = 'Enter the points earned and the points possible (more than 0).'; (e1 == null ? earned : possible).focus(); return; }
      const x = ovGet(g, true); let cat = catSel.value;
      if (cat === '__new') { const n = newName.value.trim(); if (!n) { err.textContent = 'Name the new category.'; newName.focus(); return; } cat = hyId(); x.cats.push({ id: cat, name: n, weight: hyNum(newW.value) ?? 0 }); }
      x.items.push({ id: hyId(), title, cat, earned: e1, possible: p1 });
      S.ui.openGrade[g.gradebookId || g.courseName] = true; S.savePrefs(); close();
    };
    host.replaceChildren(h('div', { class: 'sgo-modal-bg', onclick: (ev) => { if (ev.target === ev.currentTarget) close(); } },
      h('form', { class: 'sgo-modal ov-dialog', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Add a hypothetical grade', onsubmit: submit },
        h('h2', null, 'Add grade'), h('p', { class: 'sgo-muted' }, 'This is only for planning. It is added to your Schoology grades here and is never sent to Schoology.'),
        h('label', { class: 'sgo-mrow' }, h('span', null, 'Course'), courseSel), h('label', { class: 'sgo-mrow' }, h('span', null, 'Assignment'), name),
        h('label', { class: 'sgo-mrow' }, h('span', null, 'Category'), catSel), newBox,
        h('div', { class: 'ov-pts' }, h('label', { class: 'sgo-mrow' }, h('span', null, 'Earned'), earned), h('label', { class: 'sgo-mrow' }, h('span', null, 'Possible'), possible)),
        err, h('div', { class: 'sgo-head-a sgo-mfoot' }, btn('Cancel', close, 'ghost'), h('button', { class: 'sgo-btn primary', type: 'submit' }, icon('plus', 16), 'Add grade')))));
    setTimeout(() => name.focus(), 30);
  };

  /** Category chips and the assignment table for one course's gradebook, with the student's hypothetical layer on top.
   * Shared by the Grades page and the course Grades tab. */
  function gradeBody(c, shown) {
    const edit = ovEditing(), ov = ovGet(c), calc = S.overlayGrade(c, ov);
    const blocks = shown.map((p) => {
      const items = p.categories.flatMap((cat) => cat.items.map((it) => ({ it, cat })));
      return h('div', { class: 'gr2-period' },
        shown.length > 1 ? h('div', { class: 'gr2-ph' }, h('b', null, p.name || 'Grading period'), h('span', null, `${p.letter || ''} ${gPct(p.percent)}`.trim())) : null,
        p.categories.length ? h('div', { class: 'gr2-cats' }, p.categories.filter((cat) => cat.items.length && (cat.weight != null || cat.grade)).map((cat) => h('span', { class: 'gr2-cat' },
          h('b', null, cat.name), cat.weight != null ? h('i', null, cat.weight + '% of grade') : null, h('span', null, cat.letter ? `${cat.letter} ${gPct(cat.percent)}` : '\u2014')))) : null,
        items.length ? h('div', { class: 'gr2-scroll' }, h('table', { class: 'gr2-table' },
          h('thead', null, h('tr', null, ['Assignment', 'Category', 'Date', 'Earned', 'Possible', '%', 'Status'].map((t, i) => h('th', { class: i >= 3 && i <= 5 ? 'n' : '' }, t)))),
          h('tbody', null, items.map(({ it, cat }) => {
            const key = S.gradeKey(cat, it), e = ov.edits[key] || {}, earned = 'earned' in e ? e.earned : it.earned, possible = 'possible' in e ? e.possible : it.possible, edited = !!ov.edits[key];
            const pc = earned != null && possible ? Math.round((earned / possible) * 1000) / 10 : null;
            const cell = (field, val, label) => (edit ? numInput(val, label + ' for ' + it.title, 'oe-' + field[0] + '-' + key, (v) => setEdit(c, cat, it, field, v)) : field in e ? h('span', { class: 'ov-eval', title: 'Your what-if score' }, gNum(val)) : gNum(val));
            return h('tr', { class: edited ? 'ov-edited' : '' },
              h('td', { class: 'gr2-t' }, it.title), h('td', { class: 'gr2-c' }, cat.name), h('td', { class: 'gr2-d', title: it.dueText }, gWhen(it.dueText)),
              h('td', { class: 'n' }, cell('earned', earned, 'Earned')), h('td', { class: 'n' }, cell('possible', possible, 'Possible')), h('td', { class: 'n' }, pc == null ? '\u2014' : pc + '%'),
              h('td', null, edited ? h('span', { class: 'gr2-st st-hyp' }, 'What-if', edit ? h('button', { class: 'ov-reset', type: 'button', title: 'Back to the Schoology score', 'aria-label': 'Reset ' + it.title + ' to the Schoology score', onclick: () => clearEdit(c, cat, it) }, icon('reload', 13)) : null)
                : h('span', { class: 'gr2-st st-' + it.status }, it.statusLabel)));
          })))) : h('div', { class: 'gr2-none' }, 'No graded items yet.'));
    });
    const reset = edit && calc.changed ? h('div', { class: 'ov-foot' }, btn('Reset my changes', () => S.openConfirm({ title: 'Reset your changes?', body: 'This removes the grades, categories, weights and what-if scores you added to this course. Your Schoology grades are not affected.', ok: 'Reset', danger: true, onOk: () => { delete (S.prefs.hypo || {})[ovKey(c)]; S.savePrefs(); S.render(true); } }), 'ghost', 'reload')) : null;
    return h('div', { class: 'gr2-body' }, edit || calc.changed ? [ovSummary(c, calc), ovWeights(c, calc, edit)] : null,
      blocks.length ? blocks : h('div', { class: 'gr2-none' }, 'Schoology has not published grades for this course yet.'), ovCustom(c, calc, edit), reset);
  }
  function officialGrades() {
    const g = S.state.grades;
    const courseBlock = (c, idx) => {
      const key = c.gradebookId || c.courseName, color = S.courseColor(c.courseId, c.courseName);
      const open = key in S.ui.openGrade ? S.ui.openGrade[key] : false; // every course starts collapsed
      // Schoology also lists an empty "(no grading period)" group; only show periods that actually contain graded entries.
      const shown = gradePeriods(c);
      const periodNames = shown.map((p) => p.name).filter(Boolean);
      const sub = [periodNames.join(', '), c.teacher].filter(Boolean).join(' · ');
      const head = h('button', { class: 'gr2-h', 'aria-expanded': String(open), onclick: () => { S.ui.openGrade[key] = !open; S.render(true); } },
        h('span', { class: 'gr2-dot', style: { background: color } }),
        h('span', { class: 'gr2-id' }, h('span', { class: 'gr2-name' }, S.cn(c.courseId, c.courseName)), sub ? h('span', { class: 'gr2-sub' }, sub) : null),
        h('span', { class: 'gr2-letter' }, c.letter || '—'), h('span', { class: 'gr2-pct' }, gPct(c.percent), (() => { const k = S.overlayGrade(c, ovGet(c)); return k.changed && k.percent != null ? h('small', { class: 'gr2-hyp', title: 'With your hypothetical changes' }, '\u2192 ' + gPct(hyR2(k.percent))) : null; })()),
        h('span', { class: 'gr2-chev' + (open ? ' open' : '') }, icon('right', 14)));
      const body = open ? gradeBody(c, shown) : null;
      return h('section', { class: 'gr2-course' + (open ? ' open' : '') }, head, body);
    };
    return h('div', { class: 'sgo-page' }, pageHead('Grades', g.length ? gradeHint() : 'Shown as Schoology reports them', g.length ? [...gradeControls(ovKey(g.find((c) => S.ui.openGrade[c.gradebookId || c.courseName]) || g[0])), btn('Refresh', () => S.hardRefresh(), 'ghost', 'reload')] : [btn('Refresh', () => S.hardRefresh(), 'ghost', 'reload')]),
      g.length ? h('div', { class: 'gr2-list' }, g.map(courseBlock))
        : empty('No grades loaded', S.state.loading ? 'Loading…' : 'Grades could not be read from Schoology’s page. Use Classic view to see your gradebook, and check Settings → Diagnostics.'),
      g.length ? h('p', { class: 'sgo-note' }, 'The % column for each assignment is points earned divided by points possible. Nothing else is calculated here.') : null);
  }
  V.grades = officialGrades;

  /* ===================== COURSE ===================== */
  /* One workspace per course, built from Schoology's own course data. Addresses stay Schoology's own, so refresh and links work:
   *   /course/<id>/materials            overview          /course/<id>/materials?tab=assignments[&a=<assignment>]
   *   /course/<id>/materials?tab=materials | ?f=<folder>   /course/<id>/student_grades   /course/<id>/updates */
  S.courseRoute = (loc = location) => {
    const m = /^\/course\/(\d+)(?:\/(materials|updates|student_grades|info))?\/?$/.exec(loc.pathname);
    if (!m) return null;
    const q = new URLSearchParams(loc.search), sub = m[2], folder = q.get('f') || '', tabQ = q.get('tab');
    const tab = sub === 'updates' ? 'announcements' : sub === 'student_grades' ? 'grades' : folder || tabQ === 'materials' ? 'materials' : tabQ === 'assignments' ? 'assignments' : 'overview';
    return { id: m[1], tab, folder, assignment: q.get('a') || '' };
  };
  const cHref = (id, tab) => (tab === 'announcements' ? `/course/${id}/updates` : tab === 'grades' ? `/course/${id}/student_grades` : tab === 'overview' ? `/course/${id}/materials` : `/course/${id}/materials?tab=${tab}`);
  const folderHref = (id, fid) => (fid ? `/course/${id}/materials?f=${fid}` : cHref(id, 'materials'));
  const asgHref = (id, aid) => `/course/${id}/materials?tab=assignments&a=${aid}`;
  /** Schoology's own page for a course, for when the original is wanted. The explicit flag stops the app from drawing over it. */
  const originalHref = (path) => path + (path.includes('?') ? '&' : '?') + 'sgo=classic';
  const absHref = (href) => (/^https?:/i.test(href || '') ? href : href || '#');
  const SKELETON = (n = 4) => h('div', { class: 'sk-list', 'aria-busy': 'true', 'aria-label': 'Loading' }, Array.from({ length: n }, () => h('div', { class: 'sk-row' })));
  const failure = (what, msg, retry, original) => h('div', { class: 'crs-fail', role: 'alert' }, h('b', null, `Couldn't load ${what}`),
    h('p', null, /expired/.test(msg) ? 'Your Schoology session has ended. Sign in again, then retry.' : 'Schoology did not respond with the expected page. ' + msg),
    h('div', { class: 'sgo-head-a' }, retry && btn('Try again', retry, 'ghost', 'reload'), original && h('a', { class: 'sgo-btn ghost', href: original, target: '_blank', rel: 'noopener' }, icon('external', 16), 'Open in Schoology')));
  const dueTs = (txt) => { const p = txt && S.parseDue(txt); return p ? p.ts : null; };
  const dueShort = (txt) => { const p = txt && S.parseDue(txt); return p ? `${mon3(p.ts)} ${new Date(p.ts).getDate()}${p.timed ? ' · ' + S.fmtTime(p.ts) : ''}` : txt || ''; };

  /** Every assignment Schoology tells us about for this course: its upcoming and missing lists plus the gradebook, merged by id or title. */
  function courseAssignments(c) {
    const norm = (t) => String(t || '').toLowerCase().replace(/\s+/g, ' ').trim(), list = [];
    const find = (aid, title) => list.find((r) => (aid && r.aid === aid) || (!(aid && r.aid) && norm(r.title) === norm(title))); // ids decide when both have one, else the title
    S.allItems().filter((i) => i.courseId === c.id && !i.manual && i.type !== 'event').forEach((i) => {
      const aid = aidOf(i), hit = find(aid, i.title);
      if (hit) { hit.item = hit.item || i; hit.aid = hit.aid || aid; hit.missing = hit.missing || !!i.fromOverdue; if (hit.due == null) hit.due = i.due; return; }
      list.push({ aid, title: i.title, due: i.due, dueText: '', timed: i.timed, item: i, missing: !!i.fromOverdue });
    });
    const g = S.gradeFor(c.id);
    if (g) (g.periods || []).forEach((p) => p.categories.forEach((cat) => cat.items.forEach((x) => {
      const aid = (/\/assignment\/(\d+)/.exec(x.href || '') || [])[1] || '', hit = find(aid, x.title);
      if (hit) { hit.grade = hit.grade || x; hit.aid = hit.aid || aid; if (hit.due == null) hit.due = dueTs(x.dueText); hit.dueText = hit.dueText || x.dueText; return; }
      list.push({ aid, title: x.title, due: dueTs(x.dueText), dueText: x.dueText, timed: !!(S.parseDue(x.dueText) || {}).timed, item: null, grade: x, missing: false });
    })));
    const now = Date.now();
    return list.map((r) => {
      const gs = r.grade && r.grade.status;
      let st;
      if (gs === 'graded') st = ['graded', 'Graded'];
      else if (gs === 'pending') st = ['submitted', 'Submitted, not graded'];
      else if (r.missing || gs === 'missing') st = ['missing', 'Missing'];
      else if (r.due && r.due < now) st = ['past', r.grade ? 'Not graded' : 'Past due'];
      else st = ['open', 'Open'];
      return Object.assign(r, { st: st[0], stLabel: st[1] });
    });
  }

  function crumbs(list) {
    return h('nav', { class: 'bc', 'aria-label': 'Breadcrumb' }, h('ol', null, list.map(([label, href], i) => h('li', { 'aria-current': i === list.length - 1 ? 'page' : null }, href && i < list.length - 1 ? h('a', { href }, label) : h('span', null, label)))));
  }
  const FMT_ICON = { pdf: 'file', doc: 'file', slides: 'slides', sheet: 'sheet', image: 'image', video: 'file', audio: 'file', file: 'file' };
  const KIND_LABEL = { assignment: 'Assignment', assessment: 'Test or quiz', link: 'Link', page: 'Page', discussion: 'Discussion', document: 'Document' };

  /** A folder's icon from its name (Unit 1 -> book, Tests -> rocket, Slides -> slides...). Falls back to a plain folder. */
  const FOLDER_ICONS = [[/syllabus|course info|welcome|about|policy|policies/i, 'file'], [/test|quiz|exam|assessment|review|final|midterm/i, 'rocket'], [/homework|\bhw\b|assignment|practice|worksheet|\blab\b|problem/i, 'notepad'],
    [/slides|notes|lecture|presentation|powerpoint/i, 'slides'], [/data|spreadsheet|grades?\b|tables?/i, 'sheet'], [/video|image|photo|gallery|media/i, 'image'], [/link|website|online|web\b/i, 'link'], [/unit|chapter|module|lesson|week|topic|textbook|reading/i, 'book']];
  const folderIcon = (title) => (FOLDER_ICONS.find(([re]) => re.test(title || '')) || [, 'folder'])[1];
  /** What sits inside an opened folder, kept short: the rest is one click away. */
  function folderPeek(c, it) {
    const st = S.folderState(c.id, it.id), items = st.data ? st.data.items : null;
    if (!items) return h('p', { class: 'rs-sub-empty' }, st.error ? 'Could not load this folder.' : 'Loading…');
    if (!items.length) return h('p', { class: 'rs-sub-empty' }, 'This folder is empty.');
    return h('ul', { class: 'rs-sub' }, items.slice(0, 6).map((x) => h('li', null, h('a', { href: x.kind === 'folder' ? folderHref(c.id, x.id) : x.kind === 'assignment' && x.id ? asgHref(c.id, x.id) : absHref(x.href), target: x.kind === 'folder' || (x.kind === 'assignment' && x.id) ? null : '_blank', rel: 'noopener' },
      icon(x.kind === 'folder' ? folderIcon(x.title) : x.kind === 'file' ? FMT_ICON[x.fmt] || 'file' : x.kind === 'assignment' ? 'notepad' : x.kind === 'assessment' ? 'rocket' : x.kind === 'link' ? 'link' : 'file', 15), h('span', null, x.title)))),
      items.length > 6 ? h('li', { class: 'rs-sub-more' }, h('a', { href: folderHref(c.id, it.id) }, `Open folder for ${items.length - 6} more`, icon('right', 14))) : null);
  }
  function resourceRow(c, it, opts = {}) {
    if (it.kind === 'folder') {
      const n = S.folderCount(c.id, it.id), meta = n == null ? '' : `${n} ${n === 1 ? 'item' : 'items'}`, ic = h('span', { class: 'rs-ic' }, icon(folderIcon(it.title), 20));
      if (!opts.expand) return h('li', null, h('a', { class: 'rs rs-folder', href: folderHref(c.id, it.id) }, ic,
        h('span', { class: 'rs-main' }, h('b', null, it.title), it.desc ? h('small', null, it.desc) : null), h('span', { class: 'rs-meta' }, meta), h('span', { class: 'rs-go', 'aria-hidden': 'true' }, icon('right', 16))));
      const open = !!(S.ui.openFolders || {})[it.id];
      return h('li', { class: 'rs-li' + (open ? ' open' : '') },
        h('div', { class: 'rs rs-folder' }, ic, h('span', { class: 'rs-main' }, h('b', null, h('a', { href: folderHref(c.id, it.id) }, it.title)), it.desc ? h('small', null, it.desc) : null), h('span', { class: 'rs-meta' }, meta),
          h('button', { class: 'rs-exp', type: 'button', 'aria-expanded': String(open), 'aria-label': (open ? 'Collapse ' : 'Expand ') + it.title, title: open ? 'Collapse' : 'Peek inside', dataset: { fk: 'exp-' + it.id },
            onclick: () => { S.ui.openFolders = Object.assign({}, S.ui.openFolders, { [it.id]: !open }); S.render(true); } }, icon('down', 16))),
        open ? folderPeek(c, it) : null);
    }
    const isA = it.kind === 'assignment' || it.kind === 'assessment', ge = isA ? S.gradeEntryFor(c.id, it.id, it.title) : null;
    const type = it.kind === 'file' ? it.fmtLabel : KIND_LABEL[it.kind] || it.label || 'Item';
    const ic = it.kind === 'file' ? FMT_ICON[it.fmt] || 'file' : it.kind === 'assignment' ? 'notepad' : it.kind === 'assessment' ? 'rocket' : it.kind === 'link' ? 'link' : 'file';
    const sub = [type, it.size, it.dueText ? 'Due ' + dueShort(it.dueText) : ''].filter(Boolean).join(' · ');
    const title = it.kind === 'assignment' && it.id ? h('a', { href: asgHref(c.id, it.id) }, it.title) : h('a', { href: absHref(it.href), target: '_blank', rel: 'noopener' }, it.title);
    return h('li', null, h('div', { class: 'rs rs-' + it.kind },
      h('span', { class: 'rs-ic' + (isA ? ' asg' : '') }, icon(ic, 20)),
      h('span', { class: 'rs-main' }, h('b', null, title), h('small', null, sub), it.body && it.kind !== 'file' ? h('small', { class: 'rs-body' }, it.body) : null),
      h('span', { class: 'rs-meta' }, ge ? h('span', { class: 'gr2-st st-' + ge.status }, ge.statusLabel) : null),
      h('span', { class: 'rs-acts' },
        it.kind === 'assignment' && it.id ? h('a', { class: 'sgo-act', href: asgHref(c.id, it.id), title: 'View details', 'aria-label': 'View details: ' + it.title }, icon('right', 15)) : null,
        it.dl ? h('a', { class: 'sgo-act', href: absHref(it.dl), target: '_blank', rel: 'noopener', title: 'Download', 'aria-label': 'Download ' + it.title }, icon('download', 15)) : null,
        it.href ? h('a', { class: 'sgo-act', href: absHref(it.href), target: '_blank', rel: 'noopener', title: 'Open in Schoology', 'aria-label': 'Open ' + it.title + ' in Schoology' }, icon('external', 15)) : null)));
  }

  function materialsPane(c, r) {
    const st = S.folderState(c.id, r.folder), data = st.data, fid = r.folder, name = S.cn(c.id, c.name);
    const trail = fid ? S.folderTrail(c.id, fid) : [];
    if (fid && !trail && data) S.discoverFolder(c.id, fid);
    const list = [['My Classes', '/courses'], [name, fid ? cHref(c.id, 'materials') : null]];
    if (fid) { if (trail) trail.forEach((t) => list.push([t.title, folderHref(c.id, t.id)])); else { list.push(['…', null]); list.push([data ? data.title : '…', null]); } }
    if (fid && trail) { const last = list.length - 1; list[last] = [list[last][0], null]; }
    if (!fid) list[1] = [name, null];
    const folders = data ? data.items.filter((i) => i.kind === 'folder').map((i) => i.id) : [];
    if (folders.length) S.prefetchFolders(c.id, folders);
    const original = originalHref(fid ? `/course/${c.id}/materials?f=${fid}` : `/course/${c.id}/materials`);
    let body;
    if (!data && st.error) body = failure('these materials', st.error, () => S.retryFolder(c.id, fid), original);
    else if (!data) body = SKELETON(5);
    else if (!data.items.length) body = h('div', { class: 'sgo-empty' }, h('div', { class: 'sgo-empty-t' }, fid ? 'This folder is empty' : 'No materials yet'), h('div', { class: 'sgo-empty-s' }, 'Your teacher has not added anything here.'));
    else body = h('div', { class: 'crs-card primary' }, materialsView(c, data.items));
    return h('section', { class: 'crs-pane', 'aria-label': 'Materials' }, crumbs(list),
      fid && data && data.title ? h('h2', { class: 'crs-h2' }, data.title) : null,
      data && st.error ? h('p', { class: 'crs-note' }, 'Showing the last saved copy; Schoology could not be reached.') : null, body);
  }

  const asgIcon = (it) => (it.item && it.item.type === 'assessment' ? 'rocket' : 'notepad');
  function asgRow(c, r) {
    const href = r.aid ? asgHref(c.id, r.aid) : r.item ? r.item.url : '#', pts = r.grade && r.grade.possible != null ? `${gNum(r.grade.earned)} / ${gNum(r.grade.possible)}` : '';
    return h('li', { class: 'ar' }, h('span', { class: 'rs-ic asg' }, icon(asgIcon(r), 20)),
      h('div', { class: 'rs-main' }, h('b', null, h('a', { href }, r.title)), h('small', null, r.dueText ? 'Due ' + dueShort(r.dueText) : r.due ? `Due ${mon3(r.due)} ${new Date(r.due).getDate()}${r.timed ? ' · ' + S.fmtTime(r.due) : ''}` : 'No due date')),
      pts ? h('span', { class: 'ar-pts' }, pts) : null,
      r.item && S.isDone(r.item) ? h('span', { class: 'ar-mine', title: 'You ticked this off in your own to-do. Schoology does not know about it.' }, 'Ticked in my to-do') : null,
      h('span', { class: 'gr2-st st-' + (r.st === 'submitted' ? 'pending' : r.st) }, r.stLabel));
  }
  function assignmentsPane(c, r) {
    if (r.assignment) return assignmentDetail(c, r.assignment);
    const all = courseAssignments(c), now = Date.now();
    const attention = all.filter((x) => x.st === 'missing').sort((a, b) => (a.due ?? 9e15) - (b.due ?? 9e15));
    const upcoming = all.filter((x) => x.st === 'open').sort((a, b) => (a.due ?? 9e15) - (b.due ?? 9e15));
    const past = all.filter((x) => !['missing', 'open'].includes(x.st)).sort((a, b) => (b.due ?? 0) - (a.due ?? 0));
    const sec = (label, arr) => (arr.length ? h('section', { class: 'bk' }, h('div', { class: 'bk-h' }, h('span', null, label), h('span', { class: 'bk-n' }, arr.length)), h('ul', { class: 'rs-list' }, arr.map((x) => asgRow(c, x)))) : null);
    return h('section', { class: 'crs-pane', 'aria-label': 'Assignments' },
      all.length ? [sec('Needs attention', attention), sec('Upcoming', upcoming), sec('Earlier', past)]
        : S.state.loaded ? h('div', { class: 'sgo-empty' }, h('div', { class: 'sgo-empty-t' }, 'No assignments found'), h('div', { class: 'sgo-empty-s' }, 'Schoology has not listed any assignments for this course yet.')) : SKELETON(4),
      all.length ? h('p', { class: 'sgo-note' }, 'Status comes from Schoology: your gradebook and its missing list. Ticking something off in your own to-do never changes it.') : null);
  }

  function assignmentDetail(c, aid) {
    const st = S.assignmentState(aid), d = st.data, row = courseAssignments(c).find((x) => x.aid === aid);
    const itemKey = row && row.item ? row.item.key : `/assignment/${aid}`, done = !!S.prefs.done[itemKey];
    const nativeHref = `/assignment/${aid}`;
    const title = (d && d.title) || (row && row.title) || 'Assignment', dueText = (d && d.dueText) || (row && row.dueText) || '';
    const back = h('a', { class: 'sgo-back', href: cHref(c.id, 'assignments') }, icon('left', 16), 'Assignments');
    return h('section', { class: 'crs-pane', 'aria-label': 'Assignment' }, back,
      h('div', { class: 'sgo-detail', style: { '--c': S.courseColor(c.id, c.name) } },
        h('div', { class: 'sgo-detail-top' }, h('span', { class: 'sgo-course-tag' }, dot(S.courseColor(c.id, c.name)), S.cn(c.id, c.name)), row ? h('span', { class: 'gr2-st st-' + (row.st === 'submitted' ? 'pending' : row.st) }, row.stLabel) : null),
        h('h1', null, title),
        h('div', { class: 'sgo-facts' },
          h('div', { class: 'sgo-fact' }, h('span', null, 'Due'), h('b', null, dueText ? dueShort(dueText) || dueText : 'No due date')),
          row && row.grade && row.grade.possible != null ? h('div', { class: 'sgo-fact' }, h('span', null, 'Points'), h('b', null, `${gNum(row.grade.earned)} / ${gNum(row.grade.possible)}`)) : null,
          h('div', { class: 'sgo-fact' }, h('span', null, 'Submission'), h('b', null, row ? row.stLabel : 'See Schoology'))),
        h('div', { class: 'sgo-head-a' }, h('a', { class: 'sgo-btn primary', href: nativeHref, target: '_blank', rel: 'noopener' }, icon('external', 16), 'Open in Schoology to submit')),
        row && row.grade && row.grade.comment ? h('div', { class: 'crs-fb' }, h('b', null, 'Teacher feedback'), h('p', null, row.grade.comment)) : null,
        h('h3', { class: 'sgo-sub' }, 'Instructions'),
        d ? (d.descHtml && d.descHtml.trim() ? h('div', { class: 'sgo-desc' }, S.sanitize(d.descHtml)) : h('p', { class: 'sgo-muted' }, 'This assignment has no written instructions.'))
          : st.error ? failure('this assignment', st.error, () => S.retryAssignment(aid), nativeHref) : h('div', { class: 'sgo-skel' }),
        d && d.attachments.length ? [h('h3', { class: 'sgo-sub' }, 'Attachments'), h('ul', { class: 'rs-list' }, d.attachments.map((a) => h('li', null, h('a', { class: 'rs', href: absHref(a.href), target: '_blank', rel: 'noopener' }, h('span', { class: 'rs-ic' }, icon('file', 20)), h('span', { class: 'rs-main' }, h('b', null, a.name)), h('span', { class: 'rs-go' }, icon('download', 16))))))] : null,
        h('div', { class: 'crs-mine' }, h('button', { class: 'sgo-btn ghost', type: 'button', 'aria-pressed': String(done), onclick: () => { S.prefs.done[itemKey] ? delete S.prefs.done[itemKey] : (S.prefs.done[itemKey] = Date.now()); S.savePrefs(); S.render(true); } }, icon('check', 16), done ? 'Ticked in my to-do' : 'Tick off in my to-do'),
          h('small', null, 'Only your own checklist. This does not submit anything to Schoology.'))));
  }

  function announcementsPane(c) {
    const st = S.feedState(c.id), items = st.items;
    const ui = (S.ui.crsAnn = S.ui.crsAnn || {});
    let body;
    if (!items && st.error) body = failure('announcements', st.error, null, originalHref(`/course/${c.id}/updates`));
    else if (!items) body = SKELETON(3);
    else if (!items.length) body = h('div', { class: 'sgo-empty' }, h('div', { class: 'sgo-empty-t' }, 'No announcements'), h('div', { class: 'sgo-empty-s' }, 'Nothing has been posted in this course yet.'));
    else body = h('ul', { class: 'an-list an-cards', 'aria-label': `${plural(items.length, 'announcement')} in ${S.cn(c.id, c.name)}` }, items.map((a, i) => { const id = a.id + ':' + i, long = a.body.length > 280, open = !!ui[id], ts = S.parseStamp ? S.parseStamp(a.time) : null;
      return h('li', { class: 'an' },
        h('article', { 'aria-label': `Announcement by ${a.author || 'your teacher'}` },
          h('div', { class: 'an-head' }, h('span', { class: 'an-av', 'aria-hidden': 'true' }, (a.author || 'T').split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase()),
            h('div', { class: 'an-who' }, h('b', null, a.author || 'Teacher'), h('span', null, 'Posted in ' + S.cn(c.id, c.name))),
            a.time ? h('time', { class: 'an-time', datetime: ts ? new Date(ts).toISOString() : null }, a.time) : null),
          h('div', { class: 'an-text' }, h('p', { class: open || !long ? '' : 'clamp' }, a.body),
            long ? h('button', { class: 'bk-more', type: 'button', dataset: { fk: 'an-' + id }, 'aria-expanded': String(open), onclick: () => { ui[id] = !open; S.render(true); } }, open ? 'Show less' : 'Show more') : null))); }));
    return h('section', { class: 'crs-pane', 'aria-label': 'Announcements' }, body);
  }

  function gradesPane(c) {
    const g = S.gradeFor(c.id);
    if (!g) return h('section', { class: 'crs-pane' }, S.state.loaded && !S.state.loading ? h('div', { class: 'sgo-empty' }, h('div', { class: 'sgo-empty-t' }, 'No grades yet'), h('div', { class: 'sgo-empty-s' }, 'Schoology has not published a gradebook for this course.')) : SKELETON(3));
    const shown = gradePeriods(g);
    return h('section', { class: 'crs-pane crs-grades', 'aria-label': 'Grades' },
      h('div', { class: 'gr-bar' }, h('div', { class: 'sgo-head-a' }, gradeControls(ovKey(g))), h('p', { class: 'gr-hint' }, gradeHint())),
      h('div', { class: 'crs-card crs-gsum' }, h('span', { class: 'gr2-letter' }, g.letter || '\u2014'), h('b', null, gPct(g.percent)), h('small', null, [shown.map((p) => p.name).filter(Boolean).join(', '), 'as Schoology reports it'].filter(Boolean).join(' \u00b7 '))),
      h('div', { class: 'crs-card crs-gtable' }, gradeBody(g, shown)));
  }

  /* ---- materials: search, quick filters, sort and grouped lists with divider pills ---- */
  const MAT_GROUPS = [['folder', 'Folders'], ['file', 'Files'], ['assignment', 'Assignments'], ['link', 'Links and pages']];
  const matKind = (it) => (it.kind === 'folder' ? 'folder' : it.kind === 'file' ? 'file' : it.kind === 'assignment' || it.kind === 'assessment' ? 'assignment' : 'link');
  function materialsView(c, items) {
    const ui = (S.ui.mat = S.ui.mat || { q: '', f: 'all', sort: 'order' }), q = ui.q.trim().toLowerCase();
    const counts = { all: items.length }; MAT_GROUPS.forEach(([k]) => { counts[k] = items.filter((i) => matKind(i) === k).length; });
    if (ui.f !== 'all' && !counts[ui.f]) ui.f = 'all';
    let list = items.filter((i) => (ui.f === 'all' || matKind(i) === ui.f) && (!q || `${i.title} ${i.desc || ''} ${i.body || ''}`.toLowerCase().includes(q)));
    if (ui.sort === 'az') list = list.slice().sort((a, b) => a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: 'base' }));
    const row = (it) => resourceRow(c, it, { expand: true });
    const chips = [['all', 'All'], ...MAT_GROUPS.filter(([k]) => counts[k])].map(([k, label]) => h('button', { type: 'button', class: 'mat-chip' + (ui.f === k ? ' on' : ''), 'aria-pressed': String(ui.f === k), dataset: { fk: 'mat-f-' + k },
      onclick: () => { ui.f = k; S.render(true); } }, label, h('span', null, counts[k])));
    const tools = h('div', { class: 'mat-tools' },
      h('div', { class: 'mat-search' }, icon('search', 16), h('input', { class: 'sgo-input', type: 'search', value: ui.q, placeholder: 'Search materials', 'aria-label': 'Search materials', dataset: { fk: 'mat-q' }, oninput: (e) => { ui.q = e.target.value; S.render(true); } })),
      h('select', { class: 'sgo-input mat-sort', 'aria-label': 'Sort materials', dataset: { fk: 'mat-sort' }, onchange: (e) => { ui.sort = e.target.value; S.render(true); } },
        [['order', 'Teacher\u2019s order'], ['az', 'A to Z']].map(([v, l]) => h('option', { value: v, selected: ui.sort === v ? 'selected' : null }, l))));
    let body;
    if (!list.length) body = h('p', { class: 'crs-none' }, icon('help', 16), q ? `Nothing matches \u201c${ui.q.trim()}\u201d.` : 'Nothing in this view.');
    else if (ui.sort === 'az' || ui.f !== 'all') body = h('ul', { class: 'rs-list' }, list.map(row));
    else body = h('div', { class: 'mat-groups' }, MAT_GROUPS.map(([k, label]) => { const g = list.filter((i) => matKind(i) === k); return g.length ? h('section', { class: 'mat-g' }, h('div', { class: 'mat-gh' }, h('span', { class: 'mat-pill' }, label, h('b', null, g.length))), h('ul', { class: 'rs-list' }, g.map(row))) : null; }));
    return h('div', { class: 'mat-view' }, h('div', { class: 'mat-chips', role: 'group', 'aria-label': 'Filter materials' }, chips), tools, body);
  }

  /** "Up next" as a timeline: a node per assignment on a thin line, a status chip, and an arrow to open it. */
  function timelineRow(c, r) {
    const href = r.aid ? asgHref(c.id, r.aid) : r.item ? r.item.url : '#', missing = r.st === 'missing';
    const due = r.dueText ? 'Due ' + dueShort(r.dueText) : r.due ? `Due ${mon3(r.due)} ${new Date(r.due).getDate()}${r.timed ? ' · ' + S.fmtTime(r.due) : ''}` : 'No due date';
    return h('li', { class: 'tl-i' + (missing ? ' missing' : '') },
      h('span', { class: 'tl-node', 'aria-hidden': 'true' }),
      h('div', { class: 'tl-main' }, h('b', null, h('a', { href }, r.title)), h('small', null, due)),
      h('span', { class: 'badge ' + (missing ? 'b-overdue' : 'b-open') }, icon(missing ? 'alert' : 'clock', 13), missing ? 'Missing' : 'Open'),
      h('a', { class: 'pr-open', href, title: 'Open', 'aria-label': 'Open assignment: ' + r.title }, icon('right', 18)));
  }
  function overviewPane(c) {
    const teacher = S.courseTeacher(c), g = S.gradeFor(c.id);
    const asg = courseAssignments(c), next = asg.filter((x) => x.st === 'open' || x.st === 'missing').sort((a, b) => (a.due ?? 9e15) - (b.due ?? 9e15)).slice(0, 5);
    const feed = S.feedState(c.id), root = S.folderState(c.id, ''), tops = root.data ? root.data.items.filter((i) => i.kind === 'folder').slice(0, 6) : null;
    const card = (title, link, body, cls) => h('section', { class: 'crs-card' + (cls ? ' ' + cls : '') }, h('div', { class: 'crs-card-h' }, h('h2', null, title), link && h('a', { class: 'link', href: link[1] }, link[0], icon('right', 14))), body);
    const none = (ic, text) => h('p', { class: 'crs-none' }, icon(ic, 16), text);
    const initials = (n) => (n || 'T').split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
    const feedBody = feed.items ? (feed.items.length ? h('ul', { class: 'an-feed' }, feed.items.slice(0, 3).map((a) => h('li', null, h('span', { class: 'an-av', 'aria-hidden': 'true' }, initials(a.author)),
      h('div', { class: 'an-body' }, h('div', { class: 'an-top' }, h('b', null, a.author || 'Teacher'), a.time ? h('span', null, a.time) : null), h('p', { class: 'clamp' }, a.body))))) : null) : null;
    const grade = g && g.percent != null ? `${g.letter || ''} ${gPct(g.percent)}`.trim() : 'Not available';
    const matBody = root.data ? (root.data.items.length ? materialsView(c, root.data.items) : none('folder', 'No materials yet.')) : root.error ? none('alert', 'Materials could not be loaded.') : SKELETON(4);
    return h('div', { class: 'crs-grid' },
      h('div', { class: 'crs-col' }, card('Materials', ['Browse all', cHref(c.id, 'materials')], matBody, 'primary')),
      h('div', { class: 'crs-col' },
        card('Up next', ['All assignments', cHref(c.id, 'assignments')], next.length ? h('ol', { class: 'tl' }, next.map((x) => timelineRow(c, x))) : S.state.loaded ? none('check', 'Nothing due soon.') : SKELETON(2)),
        card('Announcements', ['All announcements', cHref(c.id, 'announcements')], feed.items ? (feedBody || none('mega', 'No announcements yet.')) : feed.error ? none('alert', 'Announcements could not be loaded.') : SKELETON(2), feed.items && !feed.items.length ? 'compact' : ''),
        card('Course', null, h('dl', { class: 'crs-dl' }, [['Teacher', teacher], ['Code', S.courseCode(c.name)], ['Term', S.courseTerm(c)]].filter(([, val]) => val).map(([k, val]) => h('div', null, h('dt', null, k), h('dd', null, val))),
          h('div', { class: 'crs-dl-g' }, h('dt', null, 'Current grade'), h('dd', null, grade)))),
        h('p', { class: 'crs-micro' }, icon('help', 14), h('span', null, 'Schoology doesn\u2019t share when materials were added, so recent additions can\u2019t be listed.'))));
  }

  V.course = () => {
    const r = S.courseRoute(); if (!r) return empty('Course not found');
    const c = S.state.courses.find((x) => x.id === r.id);
    if (!c && S.state.session === 'expired') return h('div', { class: 'sgo-page' }, h('div', { class: 'sgo-empty' }, h('div', { class: 'sgo-empty-t' }, 'Sign in to see this course'), h('div', { class: 'sgo-empty-s' }, 'Your Schoology session has ended, so this course cannot be loaded yet.'), h('div', { class: 'sgo-head-a', style: { justifyContent: 'center', marginTop: '12px' } }, h('a', { class: 'sgo-btn', href: originalHref(location.pathname), target: '_blank', rel: 'noopener' }, 'Sign in again'))));
    if (!c) return h('div', { class: 'sgo-page' }, S.state.loaded && !S.state.loading
      ? h('div', { class: 'sgo-empty' }, h('div', { class: 'sgo-empty-t' }, 'Course not found'), h('div', { class: 'sgo-empty-s' }, 'This course is not in your list of classes.'), h('div', { class: 'sgo-head-a', style: { justifyContent: 'center', marginTop: '12px' } }, btn('My classes', () => S.go('/courses'), 'ghost'), h('a', { class: 'sgo-btn ghost', href: originalHref(location.pathname), target: '_blank', rel: 'noopener' }, 'Open in Schoology')))
      : SKELETON(5));
    const name = S.cn(c.id, c.name); S._title = name;
    const teacher = S.courseTeacher(c), code = S.courseCode(c.name), term = S.courseTerm(c), feed = (state => (state.cd[c.id] || {}).feed)(S.state);
    const cover = h('div', { class: 'crs-banner' });
    paintCover(cover, c, name, coverFor(c, name), true);
    if (S.cmeta(c.id, c.name).cover === 'orig') S.guardCover(cover, c.id, c.name);
    const meta = [code && h('span', { class: 'crs-code' }, code), teacher && h('span', null, teacher), term && h('span', null, term)].filter(Boolean);
    const header = h('div', { class: 'crs-head', style: { '--c': S.courseColor(c.id, c.name) } }, cover,
      h('div', { class: 'crs-actions' }, btn('Change banner', () => S.openBannerPicker(c), 'ghost', 'image'),
        S.menu('Course options', [['Rename and colour', () => S.openCourseEditor(c)], ['Notification icon…', () => S.openIconPicker(c)], [S.courseHidden(c) ? 'Show on dashboard' : 'Hide from dashboard', () => S.setCourseHidden(c, !S.courseHidden(c))], ['View as Schoology page', () => window.open(originalHref(`/course/${c.id}/materials`), '_blank', 'noopener')]])),
      h('div', { class: 'crs-title' },
        h('h1', null, S.ui.renaming === c.id ? renameField(c) : [name, h('button', { class: 'crs-rename', type: 'button', title: 'Rename', 'aria-label': 'Rename ' + name, onclick: () => { S.ui.renaming = c.id; S.render(); } }, icon('edit', 18))]),
        h('div', { class: 'crs-meta' }, meta.length ? meta.map((m, i) => [i ? h('i', { 'aria-hidden': 'true' }) : null, m]) : ' ')));
    const tabs = [['overview', 'Overview'], ['materials', 'Materials'], ['assignments', 'Assignments'], ['grades', 'Grades'], ['announcements', 'Announcements']];
    // A pill under the active tab. It starts where it was on the last course page, then slides to the new tab.
    const pill = h('span', { class: 'crs-tab-pill', 'aria-hidden': 'true' }), prevPos = S._tabPos && S._tabPos.id === c.id ? S._tabPos : null;
    if (prevPos) { pill.style.width = prevPos.W + 'px'; pill.style.transform = `translateX(${prevPos.L}px)`; } else pill.style.opacity = '0';
    const nav = h('nav', { class: 'crs-tabs', 'aria-label': 'Course sections' }, pill, tabs.map(([k, label]) => h('a', { href: cHref(c.id, k), 'aria-current': r.tab === k ? 'page' : null }, label)));
    setTimeout(() => {
      const act = nav.querySelector('[aria-current="page"]'); if (!act || !nav.isConnected) return;
      const L = act.offsetLeft, W = act.offsetWidth;
      if (!prevPos) { pill.style.transition = 'none'; pill.style.width = W + 'px'; pill.style.transform = `translateX(${L}px)`; void pill.offsetWidth; pill.style.transition = ''; pill.style.opacity = '1'; }
      else { pill.style.width = W + 'px'; pill.style.transform = `translateX(${L}px)`; }
      S._tabPos = { id: c.id, L, W };
    }, 0);
    const pane = { overview: overviewPane, materials: materialsPane, assignments: assignmentsPane, grades: gradesPane, announcements: announcementsPane }[r.tab](c, r);
    return h('div', { class: 'sgo-page crs' }, header, nav, pane);
  };

  /* ===================== SETTINGS ===================== */
  function reviewCard(list) {
    const open = !!S.ui.reviewOpen, n = list.length;
    const all = (d) => { list.forEach((it) => { S.prefs.reviewed[it.key] = d; }); S.savePrefs(); S.render(true); };
    return h('section', { class: 'sgo-review compact' + (open ? ' open' : ''), 'aria-label': 'New assignments to review' },
      h('div', { class: 'rv-bar' },
        h('span', { class: 'rv-t' }, h('b', null, `${n} new from Schoology`), h('span', null, ' \u00b7 add to your workload?')),
        h('div', { class: 'rv-a' }, h('button', { class: 'rv-all', type: 'button', onclick: () => all('include') }, 'Include all'),
          h('button', { class: 'rv-toggle', type: 'button', 'aria-expanded': String(open), dataset: { fk: 'rv-toggle' }, onclick: () => { S.ui.reviewOpen = !open; S.render(true); } }, open ? 'Hide' : 'Review', icon(open ? 'up' : 'down', 14)))),
      open ? h('ul', { class: 'rv-list' }, list.slice(0, 8).map((it) => h('li', null,
        h('span', { class: 'rv-n' }, h('b', null, it.title), h('small', null, [S.cn(it.courseId, it.courseName) || 'Course', S.relDue(it.due)].filter(Boolean).join(' \u00b7 '))),
        h('span', { class: 'rv-i' },
          h('button', { class: 'rv-btn', type: 'button', title: 'Include', 'aria-label': 'Include ' + it.title, onclick: () => S.decide(it.key, 'include') }, icon('check', 14)),
          h('button', { class: 'rv-btn', type: 'button', title: 'Exclude from tracking', 'aria-label': 'Exclude ' + it.title, onclick: () => S.decide(it.key, 'exclude') }, icon('eyeoff', 14))))),
        n > 8 ? h('li', { class: 'rv-more' }, `${n - 8} more after these`) : null,
        h('li', { class: 'rv-foot' }, h('button', { class: 'rv-all', type: 'button', onclick: () => all('exclude') }, 'Exclude all'))) : null);
  }
  function excludedSection(list) {
    return h('section', { class: 'sgo-sec' }, h('h3', null, 'Excluded from my tracker', h('span', null, list.length)),
      h('div', { class: 'sgo-list' }, list.map((it) => h('div', { class: 'sgo-item sgo-excl' },
        h('div', { class: 'sgo-item-main' }, h('div', { class: 'sgo-item-title' }, it.title),
          h('div', { class: 'sgo-item-meta' }, dot(S.colorOf(it)), S.cn(it.courseId, it.courseName) || 'Course', it.due ? ' · ' + S.fmtDate(it.due) : '')),
        btn('Restore', () => S.decide(it.key, 'include'), 'ghost', 'reload')))),
      h('p', { class: 'sgo-note' }, 'Excluded assignments stay in Schoology, unchanged. Restoring one adds it back to your workload.'));
  }
  /** Removing from the tracker is instant: nothing in Schoology changes, and Restore on the Assignments page brings it back. */
  function askExclude(it) { S.decide(it.key, 'exclude'); }
  S.decide = (key, decision) => { S.prefs.reviewed[key] = decision; S.savePrefs(); S.render(true); };
  /** Generic confirmation dialog. Reuses the modal host, Escape closes it. */
  S.openConfirm = ({ title, body, ok, cancel = 'Cancel', danger = false, onOk }) => {
    const host = S.modalHost; if (!host) return;
    S.closeModal();
    const close = () => { S.closeModal(); S.render(true); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    S._modalKey = onKey; document.addEventListener('keydown', onKey, true);
    host.replaceChildren(h('div', { class: 'sgo-modal-bg', onclick: (e) => { if (e.target === e.currentTarget) close(); } },
      h('div', { class: 'sgo-modal sgo-confirm', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
        h('h2', null, title), h('p', { class: 'sgo-muted' }, body),
        h('div', { class: 'sgo-head-a sgo-mfoot' }, btn(cancel, close, 'ghost'), btn(ok, () => { onOk(); close(); }, danger ? 'danger' : 'primary')))));
    setTimeout(() => host.querySelector('.sgo-modal .sgo-btn.primary, .sgo-modal .sgo-btn.danger') && host.querySelector('.sgo-modal .sgo-btn.ghost').focus(), 30);
  };
  /** New or edited assignment created by the student. Stored locally; never sent to Schoology. */
  S.openNewAssignment = (edit) => {
    const host = S.modalHost; if (!host) return;
    S.closeModal();
    const v = edit || {}, courses = S.orderedCourses();
    const close = () => { S.closeModal(); S.render(true); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    S._modalKey = onKey; document.addEventListener('keydown', onKey, true);
    const hm = (ts) => String(new Date(ts).getHours()).padStart(2, '0') + ':' + String(new Date(ts).getMinutes()).padStart(2, '0');
    const title = h('input', { class: 'sgo-input', value: v.title || '', placeholder: 'e.g. Read chapter 4', maxlength: '120' });
    const course = h('select', { class: 'sgo-input' }, h('option', { value: '' }, 'No class'),
      courses.map((c) => h('option', { value: c.id, selected: v.courseId === c.id ? 'selected' : null }, S.cn(c.id, c.name))));
    const dueDate = h('input', { class: 'sgo-input', type: 'date', value: iso(v.due || Date.now()) });
    const dueTime = h('input', { class: 'sgo-input', type: 'time', value: v.timed && v.due ? hm(v.due) : '' });
    const prio = h('select', { class: 'sgo-input' }, [['low', 'Later'], ['medium', 'Soon'], ['high', 'Urgent']].map(([val, l]) => h('option', { value: val, selected: (v.priority || 'medium') === val ? 'selected' : null }, l)));
    const notes = h('textarea', { class: 'sgo-input sgo-notes', rows: '3', placeholder: 'Optional notes' });
    notes.value = v.notes || '';
    const err = h('div', { class: 'sgo-err', role: 'alert' });
    const save = () => {
      const t = title.value.trim();
      if (!t) { err.textContent = 'Give it a title.'; return; }
      if (!dueDate.value) { err.textContent = 'Choose a due date.'; return; }
      const [y, m, d] = dueDate.value.split('-').map(Number);
      const timed = !!dueTime.value, [hh, mm] = timed ? dueTime.value.split(':').map(Number) : [23, 59];
      const due = new Date(y, m - 1, d, hh, mm).getTime(), cid = course.value;
      const key = v.key || 'manual:' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      const dup = Object.values(S.prefs.manual).some((x) => x.key !== key && x.title.toLowerCase() === t.toLowerCase() && x.courseId === cid && S.sameDay(x.due, due));
      if (dup) { err.textContent = 'You already have this assignment for that class and day.'; return; }
      const c = courses.find((x) => x.id === cid);
      S.prefs.manual[key] = { key, type: 'assignment', manual: true, title: t, courseId: cid, courseName: c ? c.name : '', url: '', due, timed,
        notes: notes.value.trim().slice(0, 2000), priority: prio.value, createdAt: v.createdAt || Date.now() };
      S.savePrefs(); close();
    };
    const del = v.key ? btn('Delete', () => S.openConfirm({ title: 'Delete this assignment?', body: 'This removes it from your personal tracker only. Nothing changes in Schoology.',
      ok: 'Delete', danger: true, onOk: () => { delete S.prefs.manual[v.key]; S.savePrefs(); } }), 'ghost', 'eyeoff') : h('span');
    const row = (t, el) => h('div', { class: 'sgo-mrow' }, h('label', null, t), el);
    host.replaceChildren(h('div', { class: 'sgo-modal-bg', onclick: (e) => { if (e.target === e.currentTarget) close(); } },
      h('div', { class: 'sgo-modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': v.key ? 'Edit assignment' : 'New assignment' },
        h('h2', null, v.key ? 'Edit assignment' : 'New assignment'),
        h('p', { class: 'sgo-muted' }, 'Added by you. It lives only in your tracker, never in Schoology.'),
        row('Title', title), row('Class', course),
        h('div', { class: 'sgo-grid2' }, row('Due date', dueDate), row('Time (optional)', dueTime)),
        row('Priority', prio), row('Notes', notes), err,
        h('div', { class: 'sgo-head-a sgo-mfoot' }, del, h('div', { class: 'sgo-head-a' }, btn('Cancel', close, 'ghost'), btn('Save', save, 'primary', 'check'))))));
    setTimeout(() => title.focus(), 30);
  };

  /* ---------- Appearance: themes (previewed in miniature), the accent colour (separate), fine-tuning and the background map ---------- */
  const hexRgb = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
  const mixHex = (a, b, p) => { const A = hexRgb(a), B = hexRgb(b); return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * p).toString(16).padStart(2, '0')).join(''); };
  const LOOK_KEYS = ['contour', 'contourGlow', 'background'];
  const sameLook = (t) => LOOK_KEYS.every((k) => (S.prefs[k] || '').toLowerCase() === t[k]);
  S.sameLook = sameLook;
  /** A themed look never touches the accent colour; that is chosen on its own. */
  S.applyLook = (t) => {
    const html = document.documentElement;
    html.classList.add('sgo-themeing'); // colours ease between looks instead of snapping
    S.setAppearance({ contour: t.contour, contourGlow: t.contourGlow, background: t.background });
    clearTimeout(S.applyLook.t); S.applyLook.t = setTimeout(() => html.classList.remove('sgo-themeing'), 450);
  };
  /* The preview draws the real map: the same generator, seed, density and weight as the page, in the colours being edited, with the page's ambient
   * glow and the hero's own glow. It is a little brighter than the page (which shows it very softly) so the lines read at thumbnail size. */
  const mapMarkup = new Map();
  function mapPaths() {
    const P = S.prefs, d = P.topoDensity || 'standard', seed = Number(P.topoSeed) || 20260, key = d + ':' + seed;
    if (!mapMarkup.has(key)) { if (mapMarkup.size > 6) mapMarkup.clear(); const T = window.SGO_TOPO.build(1600, 900, seed, d); mapMarkup.set(key, T.paths.map((x) => `<path d="${x.d}"${x.major ? ' class="mj"' : ` stroke-opacity="${x.o}"`}/>`).join('')); }
    return mapMarkup.get(key);
  }
  /** A miniature dashboard in the given colours, over the actual background map. */
  function themeThumb(t, accent) {
    const P = S.prefs, bg = t.background, dark = window.SGO_COLOR.isDark(bg), uid = 'tg' + (t.id || 'x');
    const L2 = mixHex(bg, t.contour, .1), L3 = mixHex(bg, t.contour, .15), L1 = mixHex(bg, t.contour, .05), line = mixHex(bg, t.contour, .26), ink = dark ? mixHex(bg, '#ffffff', .86) : '#1e293b', soft = dark ? mixHex(bg, '#ffffff', .45) : '#64748b';
    const w = { thin: .55, standard: 1, bold: 1.9 }[P.topoWeight || 'standard'] || 1, mapOn = P.topoOn !== false;
    const tpl = document.createElement('template');
    tpl.innerHTML = `<svg viewBox="0 0 160 100" aria-hidden="true" focusable="false"><defs>
        <radialGradient id="${uid}p" cx="50%" cy="0%" r="75%"><stop offset="0" stop-color="${t.contourGlow}" stop-opacity=".38"/><stop offset="1" stop-color="${t.contourGlow}" stop-opacity="0"/></radialGradient>
        <radialGradient id="${uid}h" cx="82%" cy="8%" r="70%"><stop offset="0" stop-color="${t.contourGlow}" stop-opacity=".5"/><stop offset="1" stop-color="${t.contourGlow}" stop-opacity="0"/></radialGradient></defs>
      <rect width="160" height="100" fill="${bg}"/><rect width="160" height="100" fill="url(#${uid}p)"/>
      ${mapOn ? `<svg x="0" y="0" width="160" height="100" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice"><g class="pv-lines" style="--pw:${w}" fill="none" stroke="${t.contour}" stroke-linecap="round" stroke-linejoin="round" opacity=".45">${mapPaths()}</g></svg>` : ''}
      <rect width="17" height="100" fill="${L1}" fill-opacity=".92"/><rect x="17" width=".6" height="100" fill="${line}"/>
      <circle cx="8.5" cy="9" r="3.4" fill="${accent}"/><rect x="3.5" y="19" width="10" height="9" rx="2.5" fill="${accent}" fill-opacity=".28"/><rect x="5.5" y="21.5" width="6" height="4" rx="1.5" fill="${accent}"/>
      <rect x="4.5" y="33" width="8" height="5" rx="2" fill="${soft}" fill-opacity=".5"/><rect x="4.5" y="43" width="8" height="5" rx="2" fill="${soft}" fill-opacity=".5"/><rect x="4.5" y="53" width="8" height="5" rx="2" fill="${soft}" fill-opacity=".5"/>
      <rect x="23" y="7" width="132" height="27" rx="6" fill="${L3}" stroke="${line}" stroke-width=".6"/><rect x="23" y="7" width="132" height="27" rx="6" fill="url(#${uid}h)"/>
      <rect x="30" y="14" width="46" height="4.5" rx="2" fill="${ink}"/><rect x="30" y="22" width="32" height="3" rx="1.5" fill="${soft}"/><rect x="124" y="14" width="24" height="6" rx="2" fill="${ink}"/><rect x="128" y="23" width="20" height="2.5" rx="1.2" fill="${soft}"/>
      ${[0, 1, 2].map((i) => `<rect x="23" y="${40 + i * 13}" width="88" height="11" rx="3.5" fill="${L2}" stroke="${line}" stroke-width=".5"/><rect x="23" y="${42 + i * 13}" width="1.6" height="7" rx=".8" fill="${i ? accent : '#ef8a80'}"/><rect x="29" y="${43 + i * 13}" width="${34 - i * 4}" height="3" rx="1.5" fill="${ink}"/><rect x="29" y="${48 + i * 13}" width="20" height="2" rx="1" fill="${soft}"/><rect x="92" y="${43.5 + i * 13}" width="14" height="4.5" rx="2" fill="${accent}" fill-opacity=".25"/>`).join('')}
      <rect x="116" y="40" width="39" height="37" rx="5" fill="${L2}" stroke="${line}" stroke-width=".5"/><rect x="121" y="46" width="14" height="4" rx="2" fill="${ink}"/><rect x="121" y="55" width="29" height="3" rx="1.5" fill="${line}"/><rect x="121" y="55" width="13" height="3" rx="1.5" fill="${accent}"/><rect x="121" y="64" width="22" height="2.5" rx="1.2" fill="${soft}"/>
    </svg>`;
    return tpl.content.firstChild;
  }
  const currentLook = () => ({ id: 'cur', name: 'Custom', contour: S.prefs.contour, contourGlow: S.prefs.contourGlow, background: S.prefs.background });

  /** One colour: a picker and a hex box that stay in step; invalid codes are flagged and snap back. */
  function colourControl(label, key, hint, after) {
    const P = S.prefs;
    const text = h('input', { class: 'sgo-input hex', value: P[key], maxlength: '7', spellcheck: 'false', autocomplete: 'off', 'aria-label': label + ' as a hex code', 'aria-invalid': 'false' });
    const pick = h('input', { class: 'sgo-swatch-in', type: 'color', value: P[key], 'aria-label': label });
    const write = (hex) => { text.value = hex; pick.value = hex; text.setAttribute('aria-invalid', 'false'); };
    pick.addEventListener('input', () => { if (S.setAppearance({ [key]: pick.value })) { write(P[key]); if (after) after(); } });
    text.addEventListener('input', () => { const hex = S.normHex(text.value); text.setAttribute('aria-invalid', hex || text.value === '' ? 'false' : 'true'); if (hex && S.setAppearance({ [key]: hex })) { pick.value = P[key]; if (after) after(); } });
    text.addEventListener('change', () => write(P[key])); // an unfinished or invalid code snaps back to the colour in use
    return h('div', { class: 'ap-row' }, h('div', { class: 'ap-l' }, h('b', null, label), h('small', null, hint)), h('div', { class: 'ap-c' }, pick, text));
  }
  function mapControls(redraw) {
    const P = S.prefs, segBtn = (opts, cur, on) => opts.map(([v, l]) => h('button', { type: 'button', class: cur === v ? 'on' : '', 'aria-pressed': String(cur === v), onclick: () => on(v) }, l));
    const seg = (label, hint, opts, cur, on) => h('div', { class: 'ap-row' }, h('div', { class: 'ap-l' }, h('b', null, label), h('small', null, hint)), h('div', { class: 'sgo-seg', role: 'group', 'aria-label': label }, segBtn(opts, cur, on)));
    return [
      seg('Topographic map', 'Contour lines, or just the plain background', [[true, 'On'], [false, 'Off']], P.topoOn !== false, (v) => { S.setMap({ topoOn: v }); redraw(); }),
      seg('Line density', 'How many contour lines are drawn', [['light', 'Light'], ['standard', 'Standard'], ['dense', 'Dense']], P.topoDensity || 'standard', (v) => { S.setMap({ topoDensity: v }); redraw(); }),
      seg('Line weight', 'How thick the lines are', [['thin', 'Thin'], ['standard', 'Standard'], ['bold', 'Bold']], P.topoWeight || 'standard', (v) => { S.setMap({ topoWeight: v }); redraw(); }),
      h('div', { class: 'ap-row' }, h('div', { class: 'ap-l' }, h('b', null, 'Map shape'), h('small', null, 'Draws a different landscape')), btn('New map', () => { S.setMap({ topoSeed: 1000 + Math.floor(Math.random() * 90000) }); redraw(); }, 'ghost', 'reload')),
    ];
  }

  /** The appearance panel, as a split view: the live preview and the accent colour on the left, every control on the right, so each edit is visible as you make it. */
  S.openAppearance = () => {
    const host = S.modalHost; if (!host) return;
    S.closeModal();
    const close = () => { S.closeModal(true); S.render(true); };
    S._modalKey = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', S._modalKey, true);
    const P = S.prefs, prev = h('div', { class: 'ap-live', role: 'img', 'aria-label': 'Live preview of your colours and background map' });
    const paint = () => prev.replaceChildren(themeThumb(currentLook(), P.accent));
    const accentBox = h('div', { class: 'ap-accent' }), controls = h('div', { class: 'ap-controls' }), mapBody = h('div', { class: 'ap-map' });
    const drawAccent = () => {
      const name = (S.ACCENTS.find((x) => x[1] === P.accent) || ['Custom'])[0];
      accentBox.replaceChildren(
        h('h3', { id: 'ap-acc-h' }, 'Accent colour', h('small', null, name)),
        groupedSwatches(S.ACCENT_GROUPS.map(([g, names]) => [g, names.map((n) => S.ACCENTS.find((x) => x[0] === n)).filter(Boolean)]), P.accent, (hex) => { S.setAppearance({ accent: hex }); drawAccent(); paint(); }, 'square'),
        h('label', { class: 'sw-custom' }, h('span', null, 'Custom colour'), h('input', { type: 'color', value: P.accent, 'aria-label': 'Custom accent colour', onchange: (e) => { S.setAppearance({ accent: e.target.value }); drawAccent(); paint(); } })));
    };
    const drawControls = () => controls.replaceChildren(
      h('h3', { id: 'ap-col-h' }, 'Colours'),
      h('div', { class: 'ap-presets', role: 'group', 'aria-label': 'Quick colours' }, S.THEME_PRESETS.map((t) => h('button', { type: 'button', class: 'ap-preset' + (sameLook(t) ? ' on' : ''), 'aria-pressed': String(sameLook(t)),
        onclick: () => { S.applyLook(t); drawControls(); paint(); S.render(true); } },
        h('span', { class: 'ap-sw', style: { background: t.background, boxShadow: `inset 0 0 0 1px ${t.contour}` } }, h('i', { style: { background: t.contour } }), h('i', { style: { background: t.contourGlow } })), t.name))),
      colourControl('Background', 'background', 'The surface behind the map', paint), colourControl('Contour lines', 'contour', 'The topographic map drawn behind every page', paint), colourControl('Contour glow', 'contourGlow', 'The soft light under the main contour lines', paint));
    const fillMap = () => { mapBody.replaceChildren(h('h3', null, 'Background map'), ...mapControls(fillMap)); paint(); };
    paint(); drawAccent(); drawControls(); fillMap();
    host.replaceChildren(h('div', { class: 'sgo-modal-bg', onclick: (e) => { if (e.target === e.currentTarget) close(); } },
      h('div', { class: 'sgo-modal ap-modal', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'ap-h' },
        h('div', { class: 'ap-head' }, h('h2', { id: 'ap-h' }, 'Appearance'), h('button', { class: 'sgo-icon-btn', type: 'button', 'aria-label': 'Close', onclick: close }, icon('plus', 18))),
        h('div', { class: 'ap-layout' }, h('div', { class: 'ap-left' }, prev, mapBody), h('div', { class: 'ap-right' }, controls, accentBox)),
        h('div', { class: 'sgo-head-a sgo-mfoot' }, btn('Reset appearance', () => { S.resetAppearance(); drawControls(); drawAccent(); fillMap(); S.render(true); }, 'ghost', 'reload'), btn('Done', close, 'primary', 'check')))));
  };

  /** Settings card: the current look in miniature and a way into the panel. */
  function appearanceCard() {
    const P = S.prefs, known = S.THEME_PRESETS.find(sameLook), look = known || currentLook();
    return h('section', { class: 'sgo-card' }, h('h2', null, 'Appearance'),
      h('p', { class: 'sgo-muted' }, 'Pick a theme from miniature previews, choose an accent colour, and tune the background map. Changes apply instantly and are saved in this browser.'),
      h('div', { class: 'ap-summary' },
        h('span', { class: 'thm-prev' }, themeThumb(look, P.accent)),
        h('div', { class: 'ap-l' }, h('b', null, known ? known.name : 'Custom colours'), h('small', null, 'Accent colour: ' + ((S.ACCENTS.find((x) => x[1] === P.accent) || ['Custom'])[0]))),
        btn('Customise appearance', () => S.openAppearance(), 'primary', 'palette')));
  }

  /** Quick name change, saved as you type. */
  S.openNameEditor = () => {
    const host = S.modalHost; if (!host) return;
    S.closeModal();
    const close = () => { S.closeModal(true); S.render(true); };
    S._modalKey = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', S._modalKey, true);
    const inp = h('input', { class: 'sgo-input', value: S.prefs.displayName || '', placeholder: (S.state.user || 'First name').trim(), maxlength: '40', style: { width: '100%' }, 'aria-label': 'Your name',
      oninput: (e) => { S.prefs.displayName = e.target.value.trim(); S.savePrefs(); },
      onkeydown: (e) => { if (e.key === 'Enter') close(); } });
    host.replaceChildren(h('div', { class: 'sgo-modal-bg', onclick: (e) => { if (e.target === e.currentTarget) close(); } },
      h('div', { class: 'sgo-modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Your name' },
        h('h2', null, 'Your name'), h('p', { class: 'sgo-muted' }, 'Shown in the dashboard greeting. Saved as you type, only in this browser. Leave it empty to use the name Schoology gives.'),
        h('div', { class: 'sgo-mrow' }, inp), h('div', { class: 'sgo-head-a sgo-mfoot' }, btn('Done', close, 'primary', 'check')))));
    setTimeout(() => { inp.focus(); inp.select(); }, 30);
  };

  V.settings = () => {
    const P = S.prefs, set = (k, v) => { P[k] = v;  S.savePrefs(); S.applyTheme(); S.render(true); };
    const row = (t, s, ctl) => h('div', { class: 'sgo-set' }, h('div', null, h('b', null, t), s && h('small', null, s)), ctl);
    const seg = (key, opts) => h('div', { class: 'sgo-seg' }, opts.map(([v, l]) => h('button', { class: P[key] === v ? 'on' : '', onclick: () => set(key, v) }, l)));
    const courseRows = S.orderedCourses().map((c) => { const cur = S.courseColor(c.id, c.name), open = S.ui.ccOpen === c.id, pick = (col) => { P.courseColors[c.id] = col; S.savePrefs(); S.render(true); };
      return h('div', { class: 'cc-row' + (open ? ' open' : '') },
        h('button', { class: 'cc-head', type: 'button', 'aria-expanded': String(open), 'aria-label': 'Colour for ' + S.cn(c.id, c.name) + ': ' + ((S.COURSE_GROUPS.flatMap((g) => g[1]).find((x) => x[1] === cur) || ['Custom'])[0]), dataset: { fk: 'cc-' + c.id },
          onclick: () => { S.ui.ccOpen = open ? null : c.id; S.render(true); } },
          h('span', { class: 'cc-dot', style: { background: cur } }), h('span', { class: 'cc-n' }, S.cn(c.id, c.name)), icon(open ? 'up' : 'down', 16)),
        open ? h('div', { class: 'cc-pick' }, groupedSwatches(S.COURSE_GROUPS, cur, pick), h('label', { class: 'sw-custom' }, h('span', null, 'Custom colour'), h('input', { type: 'color', value: cur, 'aria-label': 'Custom colour for ' + S.cn(c.id, c.name), onchange: (e) => pick(e.target.value) }))) : null);
    });
    return h('div', { class: 'sgo-page narrow' }, pageHead('Settings', 'Everything is stored only in this browser'),
      h('section', { class: 'sgo-card' }, h('h2', null, 'Profile'), row('Your name', 'Used for the dashboard greeting. Saved as you type, only in this browser. Empty uses the name Schoology gives.',
        h('input', { class: 'sgo-input', value: P.displayName || '', placeholder: (S.state.user || 'First name').trim(), maxlength: '40', 'aria-label': 'Your name',
          oninput: (e) => { P.displayName = e.target.value.trim(); S.savePrefs(); }, onchange: () => S.render(true) }))),
      appearanceCard(),
      courseRows.length ? h('section', { class: 'sgo-card' }, h('h2', null, 'Course colours'), h('p', { class: 'sgo-muted' }, 'Pick from fourteen colours, grouped by family. Used for the typographic banner and the course page.'),
        row('Colour-code assignments by course', 'Off keeps every assignment and material indicator in one clean colour. On tints each with its course colour.', seg('tagColours', [[false, 'Off'], [true, 'On']])), courseRows) : null,
      h('section', { class: 'sgo-card' }, h('h2', null, 'Course banners'),
        h('p', { class: 'sgo-muted' }, 'Original Schoology banners are never changed or removed. These actions only affect how classes look in this extension.'),
        h('div', { class: 'sgo-head-a' },
          btn('Restore original Schoology banners', () => S.openConfirm({ title: 'Restore original banners?', body: 'Every class will use its original Schoology banner again. Names and colours stay.', ok: 'Restore', onOk: () => setAllBanners('orig') }), 'ghost', 'reload'),
          btn('Reset all banners', () => S.openConfirm({ title: 'Reset all banners?', body: 'This clears every banner choice for all classes, including uploaded images. Original Schoology banners show again. Names and colours stay.', ok: 'Reset all banners', danger: true, onOk: () => setAllBanners('') }), 'ghost'))),
      h('section', { class: 'sgo-card' }, h('h2', null, 'Data & privacy'),
        h('p', { class: 'sgo-muted' }, 'This extension only reads pages you can already see in Schoology, using your existing session. It never sees your password and sends nothing to any server. Preferences and a cache of what it read live in this browser.'),
        h('div', { class: 'sgo-head-a' }, btn('Refresh data now', () => S.hardRefresh(), 'ghost', 'reload'),
          btn('Clear cached data', async () => { await S.clearCache(); S.render(); }, 'ghost'),
          btn('Reset all settings', () => { S.resetPrefs(); S.applyTheme(); S.render(); }, 'ghost'))),
      h('section', { class: 'sgo-card' }, h('h2', null, 'Diagnostics'), h('p', { class: 'sgo-muted' }, 'What each data source returned the last time it ran. If a count is 0, that part of Schoology’s markup differs at your school; see README → Tuning selectors.'),
        h('div', { class: 'sgo-diag' }, S.state.diag.length ? S.state.diag.map((d) => h('div', { class: d.ok ? 'ok' : 'bad' }, h('b', null, d.name), h('span', null, `${d.count} found`), h('small', null, d.note))) : h('span', { class: 'sgo-muted' }, 'No runs yet.'))));
  };
})();
