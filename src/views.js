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
      !opts.compact && h('div', { class: 'sgo-item-side' }, mine && pill('Yours', 'mine'), pr !== 'low' && pill(S.PRIORITY[pr], 'pr-' + pr), pill(st.label, 'st-' + st.id)),
      act);
  }
  const list = (items, opts) => items.length ? h('div', { class: 'sgo-list' }, items.map((i) => itemCard(i, opts))) : null;

  /* ---------- popover menu (three-dot menus, account menu) ---------- */
  let openMenu = null;
  const closeMenu = (refocus) => { if (!openMenu) return; const m = openMenu; openMenu = null; m.panel.hidden = true; m.btn.setAttribute('aria-expanded', 'false'); if (refocus) m.btn.focus(); };
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
      panel.hidden = false;
      const r = btn.getBoundingClientRect(), w = panel.offsetWidth, hgt = panel.offsetHeight;
      panel.style.left = Math.max(8, Math.min(r.left, innerWidth - w - 8)) + 'px';
      panel.style.top = (r.bottom + hgt + 8 > innerHeight ? Math.max(8, r.top - hgt - 4) : r.bottom + 4) + 'px';
      btn.setAttribute('aria-expanded', 'true');
      openMenu = { btn, panel };
      panel.querySelector('[role="menuitem"]').focus();
    });
    return h('div', { class: 'sgo-menu ' + (cls || '') }, btn, panel);
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

  function dashCard(c, tasks, now) {
    const color = S.courseColor(c.id, c.name), name = S.cn(c.id, c.name), g = S.gradeFor(c.id);
    const due = tasks.filter((i) => i.courseId === c.id && i.due && i.due >= now && !S.isComplete(i)).sort((a, b) => a.due - b.due);
    const news = S.state.announcements.filter((a) => a.courseId === c.id).length;
    const term = (/\((S\d|Q\d|T\d|Y\d?)\)/.exec(c.name + ' ' + (c.section || '')) || [])[1] || (g && g.periods[0] && g.periods[0].name) || '';
    const cover = h('div', { class: 'dc-banner', style: { background: S.coverCss(c.id, c.name) } },
      h('span', { class: 'dc-grade', 'aria-label': g && g.percent != null ? `Current grade ${pctText(g.percent)}` : 'No grade yet' }, pctText(g ? g.percent : null)),
      S.menu('Options for ' + name, [['Change banner', () => S.openBannerPicker(c)], ['Rename and colour', () => S.openCourseEditor(c)], ['View assignments', () => S.go(assignmentsHref('course=' + c.id))]], h('button', { class: 'sgo-icon-btn dc-dots', type: 'button' }, icon('dots', 18)), 'dc-menu'));
    S.guardCover(cover, c.id, c.name);
    return h('article', { class: 'dc', style: { '--c': color }, 'aria-label': name }, cover,
      h('div', { class: 'dc-body' },
        h('h2', null, h('a', { href: `/course/${c.id}/materials` }, name)),
        h('div', { class: 'dc-meta' }, S.courseCode(c.name) || c.section || ' '),
        h('div', { class: 'dc-meta' }, term || ' '),
        h('a', { class: 'sgo-icon-btn dc-news', href: `/course/${c.id}/updates`, title: 'Announcements', 'aria-label': news ? `${news} announcements for ${name}` : `Announcements for ${name}` },
          icon('mega', 18), news ? h('span', { class: 'dc-count' }, news) : null)),
      h('div', { class: 'dc-due' }, h('h3', null, 'Due'),
        due.length ? h('ul', null, due.map((i) => h('li', null, h('a', { href: itemHref(i) }, i.title), h('span', { title: S.fmtDate(i.due) }, relative(i.due, now))))) : h('p', null, 'Nothing due')));
  }

  function taskCard(it, now) {
    const done = S.isDone(it), viaSchoology = S.isSubmitted(it), complete = done || viaSchoology, e = S.gradeEntry(it);
    const soon = dueSoon(it, now), when = it.due ? `Due ${shortDate(it.due)}` : 'No due date'; // no time of day here; the clock mark flags what is coming up
    const name = S.cn(it.courseId, it.courseName) || (it.manual ? 'Personal task' : 'Course');
    return h('li', { class: 'tc' + (complete ? ' is-done' : '') },
      h('span', { class: 'tc-kind' + (it.type === 'assessment' ? ' quiz' : '') }, icon(it.type === 'assessment' ? 'rocket' : 'notepad', 18)),
      h('div', { class: 'tc-main' },
        h('div', { class: 'tc-course' }, h('i', { style: { background: S.colorOf(it) } }), name),
        h('a', { class: 'tc-title', href: itemHref(it) }, it.title),
        h('div', { class: 'tc-when' }, soon ? h('span', { class: 'tc-clock', title: 'Due within 48 hours', role: 'img', 'aria-label': 'Due within 48 hours' }, icon('clock', 14)) : null, when + (e && e.possible != null ? ` | ${e.possible} points` : '')),
        h('div', { class: 'tc-acts' },
          h('a', { class: 'sgo-act', href: detailHref(it), title: 'View details', 'aria-label': 'View details: ' + it.title }, icon('right', 15)),
          it.manual && h('button', { class: 'sgo-act', type: 'button', title: 'Edit', 'aria-label': 'Edit ' + it.title, onclick: () => S.openNewAssignment(it) }, icon('edit', 15)),
          it.manual
            ? h('button', { class: 'sgo-act', type: 'button', title: 'Delete', 'aria-label': 'Delete ' + it.title, onclick: () => S.openConfirm({ title: 'Delete this task?', body: 'This removes it from your personal tracker only. Nothing changes in Schoology.', ok: 'Delete', danger: true, onOk: () => { delete S.prefs.manual[it.key]; S.savePrefs(); } }) }, icon('trash', 15))
            : h('button', { class: 'sgo-act', type: 'button', title: 'Remove from my tracker (Schoology keeps it)', 'aria-label': 'Remove ' + it.title + ' from my tracker', onclick: () => askExclude(it) }, icon('eyeoff', 15)))),
      h('button', { class: 'tc-check' + (complete ? ' on' : ''), type: 'button', dataset: { fk: 'check-' + it.key }, 'aria-pressed': String(complete), 'aria-disabled': viaSchoology ? 'true' : null,
        title: viaSchoology ? 'Submitted in Schoology' : done ? 'Mark as not complete' : 'Mark complete',
        'aria-label': (viaSchoology ? 'Submitted in Schoology: ' : done ? 'Mark not complete: ' : 'Mark complete: ') + it.title, onclick: () => { if (!viaSchoology) toggleDone(it); } }, icon('check', 14)));
  }

  function tasksPanel(t, now) {
    const ui = dui(), day = (n) => { const d = new Date(now); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + n); return d.getTime(); }; // calendar days, so clock changes can't shift the week
    const start = day(ui.week * 7), end = day((ui.week + 1) * 7);
    const shift = (d) => { ui.week += d; ui.expanded = false; S.render(); };
    const byCourse = (i) => ui.course === 'all' || i.courseId === ui.course;
    // The week shown, plus (on the current week) anything Schoology lists as missing, ticked or not, and tasks with no date.
    const inView = t.filter(byCourse).filter((i) => (S.isComplete(i) || !S.isStale(i)) && ((i.due && i.due >= start && i.due < end) || (ui.week === 0 && (i.fromOverdue || S.isOverdue(i) || !i.due))))
      .sort((a, b) => (a.due ?? 9e15) - (b.due ?? 9e15));
    const open = inView.filter((i) => !S.isComplete(i)), complete = inView.filter(S.isComplete);
    const pct = inView.length ? Math.round((complete.length / inView.length) * 100) : 0, C = 2 * Math.PI * 62;
    const ring = document.createElement('template');
    ring.innerHTML = `<svg viewBox="0 0 150 150" aria-hidden="true"><circle class="tp-track" cx="75" cy="75" r="62"/><circle class="tp-bar" cx="75" cy="75" r="62" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - pct / 100)}"/></svg>`;

    const tabs = [['announcements', 'Announcements', 'mega'], ['assignments', 'Assignments', 'notepad'], ['submitted', 'Submitted', 'check']];
    const pick = (k) => { ui.tab = k; ui.expanded = false; S.render(); };
    const tabBar = h('div', { class: 'tp-tabs', role: 'tablist', 'aria-label': 'Task lists',
      onkeydown: (e) => {
        const i = tabs.findIndex((x) => x[0] === ui.tab), n = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[e.key];
        if (n === undefined) return;
        e.preventDefault();
        const next = tabs[(n + tabs.length) % tabs.length][0];
        pick(next); document.getElementById('sgo-tab-' + next).focus();
      } },
      tabs.map(([k, label, ic]) => h('button', { type: 'button', role: 'tab', id: 'sgo-tab-' + k, dataset: { fk: 'tab-' + k }, 'aria-selected': String(ui.tab === k), 'aria-controls': 'sgo-tabpanel', tabindex: ui.tab === k ? '0' : '-1', title: label, 'aria-label': label, onclick: () => pick(k) }, icon(ic, 20))));

    let body;
    if (ui.tab === 'announcements') {
      const anns = S.state.announcements.filter((a) => ui.course === 'all' || a.courseId === ui.course);
      body = anns.length ? anns.map((a, idx) => {
        const id = a.id + ':' + idx, isOpen = !!ui.ann[id];
        return h('div', { class: 'tp-ann' }, h('button', { type: 'button', dataset: { fk: 'ann-' + id }, 'aria-expanded': String(isOpen), onclick: () => { ui.ann[id] = !isOpen; S.render(); } },
          h('b', null, a.body.split(/(?<=[.!?])\s/)[0].slice(0, 80)), h('span', null, [a.author, S.cn(a.courseId, a.courseName), a.time].filter(Boolean).join(' · '))), isOpen ? h('p', null, a.body) : null);
      }) : h('p', { class: 'tp-empty' }, 'No announcements right now.');
    } else {
      const list = ui.tab === 'submitted' ? complete : open, limit = 4, shown = ui.expanded ? list : list.slice(0, limit);
      const groups = new Map();
      shown.forEach((i) => {
        const n = i.due ? 0 : null; // only whether there is a date matters; the 48-hour window is exact (dueSoon)
        const key = ui.tab === 'submitted' ? 'submitted' : S.isOverdue(i) ? 'overdue' : n == null ? 'no due date' : dueSoon(i, now) ? 'upcoming' : 'later';
        (groups.get(key) || groups.set(key, []).get(key)).push(i);
      });
      const ORDER = ['overdue', 'upcoming', 'later', 'no due date', 'submitted']; // late work first, then what is coming up, then everything further out
      body = list.length ? [...groups.entries()].sort((x, y) => ORDER.indexOf(x[0]) - ORDER.indexOf(y[0])).map(([label, arr]) => h('section', { class: 'tp-group' + (label === 'overdue' ? ' od' : label === 'upcoming' ? ' up' : '') }, h('h3', null, label === 'upcoming' ? [icon('clock', 14), 'Upcoming'] : label[0].toUpperCase() + label.slice(1)), h('ul', null, arr.map((i) => taskCard(i, now)))))
        : [h('p', { class: 'tp-empty' }, ui.tab === 'submitted' ? 'Nothing submitted this week.' : 'Nothing due this week.')];
      if (list.length > limit) body.push(h('button', { class: 'tp-more', type: 'button', dataset: { fk: 'more' }, onclick: () => { ui.expanded = !ui.expanded; S.render(); } }, ui.expanded ? 'Show less' : `View ${list.length - limit} more`));
    }

    const fbOpen = S.prefs.feedbackOpen !== false; // open until you collapse it; remembered
    const feedback = S.state.grades.flatMap((g) => (g.periods || []).flatMap((p) => p.categories.flatMap((c) => c.items.filter((x) => x.comment).map((x) => ({ x, g })))))
      .map((f) => Object.assign(f, { ts: (S.parseDue(f.x.dueText) || {}).ts || 0 })).sort((a, b) => b.ts - a.ts).slice(0, 3);
    return h('aside', { class: 'tp-col', 'aria-label': 'Tasks' },
      h('div', { class: 'dp-sh' }, h('h2', { class: 'dp-h' }, 'Tasks'), h('div', { class: 'dp-sh-a' },
        h('a', { class: 'sgo-icon-btn', href: '/home#/settings', title: 'Settings', 'aria-label': 'Task settings' }, icon('settings', 18)),)),
      h('div', { class: 'tp' },
      h('div', { class: 'tp-week' },
        h('button', { class: 'sgo-icon-btn', type: 'button', dataset: { fk: 'week-prev' }, 'aria-label': 'Previous week', onclick: () => shift(-1) }, icon('left', 18)),
        h('span', { 'aria-live': 'polite' }, `${shortDate(start)} to ${shortDate(day((ui.week + 1) * 7 - 1))}`),
        h('button', { class: 'sgo-icon-btn', type: 'button', dataset: { fk: 'week-next' }, 'aria-label': 'Next week', onclick: () => shift(1) }, icon('right', 18))),
      h('select', { class: 'sgo-input tp-filter', 'aria-label': 'Filter tasks by course', dataset: { fk: 'course' }, onchange: (e) => { ui.course = e.target.value; ui.expanded = false; S.render(); } },
        h('option', { value: 'all' }, 'All Courses'), S.orderedCourses().map((c) => h('option', { value: c.id, selected: ui.course === c.id ? 'selected' : null }, S.cn(c.id, c.name)))),
      h('div', { class: 'tp-ring', role: 'img', 'aria-label': `${pct}% complete, ${complete.length} of ${inView.length}` }, ring.content.firstChild,
        h('div', null, h('b', null, pct + '%'), h('span', null, `${complete.length}/${inView.length}`), h('small', null, 'Complete'))),
      tabBar,
      h('button', { class: 'sgo-btn ghost tp-add', type: 'button', onclick: () => S.openNewAssignment(null) }, icon('plus', 16), 'Add to tasks'),
      h('div', { id: 'sgo-tabpanel', role: 'tabpanel', 'aria-labelledby': 'sgo-tab-' + ui.tab, tabindex: '-1', 'data-fk-fallback': '' }, body),
      h('section', { class: 'tp-feedback' },
        h('button', { class: 'tp-fbh', type: 'button', 'aria-expanded': String(fbOpen), dataset: { fk: 'feedback-toggle' }, onclick: () => { S.prefs.feedbackOpen = !fbOpen; S.savePrefs(); S.render(true); } },
          h('h3', null, 'Recent Feedback'), feedback.length ? h('span', null, feedback.length) : null, icon(fbOpen ? 'up' : 'down', 16)),
        fbOpen ? (feedback.length ? feedback.map(({ x, g }) => { const pct = gItemPct(x);
          return h('div', { class: 'tp-fb' }, h('div', { class: 'tp-fbt' }, h('b', null, x.title), x.earned != null ? h('span', { class: 'tp-fbg' }, `${gNum(x.earned)}${x.possible != null ? ' / ' + gNum(x.possible) : ''}${pct != null ? ' · ' + pct + '%' : ''}`) : null),
            h('span', null, S.cn(g.courseId, g.courseName)), h('p', null, x.comment.slice(0, 140))); }) : h('p', { class: 'tp-empty' }, 'Nothing for now')) : null),
      h('a', { class: 'sgo-btn primary tp-grades', href: '/grades/grades' }, 'View Grades')));
  }

  /* Live clock: the browser's own local time and timezone. One timer, aligned to the minute, that stops when the dashboard is not on screen. */
  const timeFmt = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
  const dateFmt = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  let clockTimer = 0;
  const toNextMinute = () => { const d = new Date(); return 60000 - d.getSeconds() * 1000 - d.getMilliseconds() + 30; };
  function paintClock() {
    const els = document.querySelectorAll('[data-sgo-clock]'), d = new Date();
    els.forEach((e) => { const time = e.dataset.sgoClock === 'time'; e.textContent = (time ? timeFmt : dateFmt).format(d); if (time) e.setAttribute('datetime', d.toISOString()); });
    return els.length;
  }
  function tickClock() {
    clockTimer = 0;
    if (!paintClock()) return; // left the dashboard: the timer ends, and starts again the next time the dashboard is drawn
    clockTimer = setTimeout(tickClock, toNextMinute());
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) paintClock(); }); // a sleeping tab catches up the moment it is shown
  function clock() {
    const d = new Date();
    if (!clockTimer) clockTimer = setTimeout(tickClock, toNextMinute());
    return h('div', { class: 'dp-clock' }, h('time', { class: 'dp-time', datetime: d.toISOString(), dataset: { sgoClock: 'time' } }, timeFmt.format(d)), h('span', { class: 'dp-date', dataset: { sgoClock: 'date' } }, dateFmt.format(d)));
  }
  V.dashboard = () => {
    const now = Date.now(), t = tasksOnly(), courses = S.orderedCourses(), review = S.unreviewedItems().length;
    S._dashStamp = S.dashStamp();
    const first = (S.prefs.displayName || S.state.user || '').trim().split(/\s+/)[0]; // no name known yet: just the greeting
    const head = h('div', { class: 'dp-head' }, h('div', null, h('h1', null, `${S.greeting()}${first ? ', ' + first : ''}`), h('p', { class: 'dp-quip' }, S.quip())),
      h('div', { class: 'dp-side' }, clock(),
        S.menu('Dashboard options', [['New task', () => S.openNewAssignment(null)], review ? [`Review ${review} new ${review === 1 ? 'item' : 'items'}`, () => S.go(assignmentsHref())] : null,
          ['All assignments', () => S.go(assignmentsHref())], ['Refresh data', () => S.hardRefresh()], ['Settings', () => S.go('/home#/settings')]])));
    const cards = courses.length ? h('div', { class: 'dc-grid' }, courses.map((c) => dashCard(c, t, now)))
      : !S.state.loaded ? h('div', { class: 'dc-grid', 'aria-busy': 'true', 'aria-label': 'Loading courses' }, [0, 1, 2].map(() => h('div', { class: 'sk-row dc-sk' })))
        : empty('No courses found', 'Open Settings → Diagnostics to see what was read from Schoology.');
    return h('div', { class: 'sgo-page dash6' }, head, h('div', { class: 'dp-main' }, h('section', { class: 'dp-courses', 'aria-labelledby': 'dp-courses-h' }, h('div', { class: 'dp-sh' }, h('h2', { class: 'dp-h', id: 'dp-courses-h' }, 'Your classes')), cards)), tasksPanel(t, now));
  };

  function pageHead(title, sub, actions) {
    return h('div', { class: 'sgo-head' }, h('div', null, h('h1', null, title), sub && h('p', null, sub)), actions && h('div', { class: 'sgo-head-a' }, actions));
  }

  /* ===================== COURSES ===================== */
  function courseCard(c, opts = {}) {
    const color = S.courseColor(c.id, c.name), name = S.cn(c.id, c.name), custom = !!S.cmeta(c.id, c.name).name;
    const items = tasksOnly().filter((i) => i.courseId === c.id);
    const od = items.filter(S.isOverdue).length, soon = items.filter((i) => !S.isDone(i) && i.due && i.due >= Date.now() && i.due < Date.now() + 7 * S.DAY).length;
    const editing = S.ui.renaming === c.id, canDrag = !opts.dash && S.prefs.courseSort === 'custom' && !editing;
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
      h('div', { class: 'sgo-course-cover', style: { background: S.coverCss(c.id, c.name) } }),
      h('div', { class: 'sgo-course-actions' },
        h('button', { class: 'sgo-chip-btn', title: 'Rename', 'aria-label': 'Rename ' + name, onclick: (e) => { stop(e); S.ui.renaming = c.id; S.render(); } }, icon('edit', 15)),
        h('button', { class: 'sgo-chip-btn', title: 'Customize name & colour', 'aria-label': 'Customize ' + name, onclick: (e) => { stop(e); S.openCourseEditor(c); } }, icon('palette', 15)),
        h('button', { class: 'sgo-chip-btn', title: 'Change banner', 'aria-label': 'Change banner for ' + name, onclick: (e) => { stop(e); S.openBannerPicker(c); } }, icon('image', 15))),
      h('div', { class: 'sgo-course-body' }, title,
        h('div', { class: 'sgo-course-raw' }, c.name),
        h('div', { class: 'sgo-course-pills' }, od > 0 && pill(od + ' overdue', 'pr-critical'), soon > 0 && pill(soon + ' this week', 'pr-medium'), !od && !soon && pill('All clear', 'st-done'))),
      !opts.dash && h('div', { class: 'sgo-course-foot' }, h('a', { href: assignmentsHref('course=' + c.id) }, 'Assignments'), h('a', { href: `/course/${c.id}/materials` }, 'Materials')));
    S.guardCover(card.querySelector('.sgo-course-cover'), c.id, c.name);
    if (canDrag) {
      card.addEventListener('dragstart', (e) => { S.ui.dragCourse = c.id; card.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', c.id); } catch (x) { /* ignore */ } });
      card.addEventListener('dragend', () => { card.classList.remove('dragging'); document.querySelectorAll('.sgo-course.over').forEach((n) => n.classList.remove('over')); });
      card.addEventListener('dragover', (e) => { if (S.ui.dragCourse) { e.preventDefault(); card.classList.add('over'); } });
      card.addEventListener('dragleave', () => card.classList.remove('over'));
      card.addEventListener('drop', (e) => {
        e.preventDefault(); const from = S.ui.dragCourse; S.ui.dragCourse = null;
        if (!from || from === c.id) return;
        const ids = S.orderedCourses().map((x) => x.id); ids.splice(ids.indexOf(c.id), 0, ids.splice(ids.indexOf(from), 1)[0]);
        S.prefs.courseOrder = ids; S.savePrefs(); S.render();
      });
    }
    return card;
  }

  /* Customize modal: name, colour, cover. Edits apply live and persist immediately. */
  /* Removes the open modal and its Escape listener. Called on close and on every navigation. */
  S.closeModal = () => {
    if (S.modalHost) S.modalHost.replaceChildren();
    if (S._modalKey) { document.removeEventListener('keydown', S._modalKey, true); S._modalKey = null; }
  };
  S.openCourseEditor = (c) => {
    const host = S.modalHost; if (!host) return;
    S.closeModal();
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    const close = () => { S.closeModal(); S.render(); };
    S._modalKey = onKey;
    document.addEventListener('keydown', onKey, true);
    const prev = h('div', { class: 'sgo-cgrid sgo-prev' });
    const fresh = () => { const card = courseCard(c, { dash: true }); const l = card.querySelector('.sgo-course-link'); if (l) l.remove(); card.querySelector('.sgo-course-actions').remove(); prev.replaceChildren(card); };
    const nameIn = h('input', { class: 'sgo-input', value: S.cmeta(c.id, c.name).name || '', placeholder: S.autoName(c.name), maxlength: '80', style: { width: '100%' },
      oninput: (e) => { S.setCourseMeta(c.id, { name: e.target.value.trim() }); fresh(); } });
    const sw = h('div', { class: 'sgo-swatches' });
    const pick = (col) => { S.prefs.courseColors[c.id] = col; S.savePrefs(); fresh(); drawSw(); };
    const drawSw = () => sw.replaceChildren(...S.PALETTE.map((col) => h('button', { class: 'sgo-sw' + (S.courseColor(c.id, c.name) === col ? ' on' : ''), style: { background: col }, 'aria-label': col, onclick: () => pick(col) })),
      h('label', { class: 'sgo-color' }, h('input', { type: 'color', value: S.courseColor(c.id, c.name), onchange: (e) => pick(e.target.value) })));
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
  S.openBannerPicker = (c) => {
    const host = S.modalHost; if (!host) return;
    S.closeModal();
    const close = () => { S.closeModal(); S.render(true); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    S._modalKey = onKey; document.addEventListener('keydown', onKey, true);
    const saved = S.cmeta(c.id, c.name).cover || '', original = S.originalBanner(c.id, c.name), suggested = S.recommendBanner(c.name);
    let staged = saved;
    const preview = h('div', { class: 'bp-preview', role: 'img', 'aria-label': 'Banner preview' }), caption = h('div', { class: 'bp-cap', 'aria-live': 'polite' });
    const grid = h('div', { class: 'bp-grid', role: 'group', 'aria-label': 'Banner choices' });
    const file = h('input', { type: 'file', accept: 'image/*', style: { display: 'none' }, onchange: async (e) => { const f = e.target.files[0]; if (!f) return; try { staged = await S.imageToDataUrl(f); draw(); } catch (x) { alert('That image could not be read.'); } } });
    const norm = (v) => (!v || v === 'orig' ? 'orig' : v);
    const labelOf = (v) => { v = norm(v); if (v === 'orig') return original ? 'Original Schoology banner' : 'Colour (the original banner was not found)';
      if (v.startsWith('b:')) return (S.SUBJECT_BANNERS.find((x) => 'b:' + x[0] === v) || [, 'Banner'])[1]; return v.startsWith('data:') ? 'Your image' : 'Colour'; };
    function draw() {
      const cur = norm(staged), grad = S.autoGradient(c.id, c.name);
      preview.style.background = S.coverCssFor(c.id, c.name, staged);
      if (cur === 'orig') S.guardImage(preview, original, grad);
      caption.textContent = labelOf(staged) + (staged === saved ? '' : '  ·  not applied yet');
      const tile = (value, label, css, extra) => h('button', { class: 'bp-tile' + (cur === value ? ' on' : ''), 'aria-pressed': String(cur === value), title: label,
        disabled: extra && extra.disabled ? true : null, onclick: () => { staged = value; draw(); } },
        h('span', { class: 'bp-thumb', style: { background: css } }), h('span', { class: 'bp-l' }, label), extra && extra.suggested ? h('span', { class: 'bp-sug' }, 'Suggested') : null);
      const thumb = h('span');
      grid.replaceChildren(
        tile('orig', 'Original', S.coverCssFor(c.id, c.name, 'orig'), { disabled: !original }),
        ...S.SUBJECT_BANNERS.map(([id, n]) => tile('b:' + id, n, S.coverCssFor(c.id, c.name, 'b:' + id), { suggested: suggested === id })),
        h('button', { class: 'bp-tile' + (norm(staged).startsWith('data:') ? ' on' : ''), title: 'Upload an image (stays on this device)', onclick: () => file.click() },
          h('span', { class: 'bp-thumb bp-up', style: norm(staged).startsWith('data:') ? { background: S.coverCssFor(c.id, c.name, staged) } : null }, norm(staged).startsWith('data:') ? null : icon('plus', 18)), h('span', { class: 'bp-l' }, 'Upload image')),
        file);
    }
    draw();
    host.replaceChildren(h('div', { class: 'sgo-modal-bg', onclick: (e) => { if (e.target === e.currentTarget) close(); } },
      h('div', { class: 'sgo-modal wide', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Choose a course banner' },
        h('h2', null, 'Course banner'), h('p', { class: 'sgo-muted' }, `${S.cn(c.id, c.name)} · only changes how this class looks here.`),
        preview, caption, grid,
        h('div', { class: 'sgo-head-a sgo-mfoot' },
          btn('Reset to default', () => { S.setCourseMeta(c.id, { cover: '' }); close(); }, 'ghost', 'reload'),
          h('div', { class: 'sgo-head-a' }, btn('Cancel', close, 'ghost'), btn('Apply', () => { S.setCourseMeta(c.id, { cover: staged }); close(); }, 'primary', 'check'))))));
  };
  /** Settings actions: 'orig' points every class at its original Schoology banner; '' clears every choice (the default is the original too). */
  function setAllBanners(mode) {
    new Set([...Object.keys(S.prefs.courseMeta), ...S.state.courses.map((x) => x.id)]).forEach((id) => S.setCourseMeta(id, { cover: mode }));
  }

  V.courses = () => {
    const alpha = S.prefs.courseSort === 'alpha', setSort = (v) => { S.prefs.courseSort = v; S.savePrefs(); S.render(); };
    const seg = h('div', { class: 'sgo-seg' }, [['custom', 'My order'], ['alpha', 'A – Z']].map(([k, l]) => h('button', { class: S.prefs.courseSort === k ? 'on' : '', onclick: () => setSort(k) }, l)));
    const list = S.orderedCourses();
    return h('div', { class: 'sgo-page' }, pageHead('Courses', `${list.length} ${list.length === 1 ? 'course' : 'courses'}${alpha ? '' : ' · drag cards to rearrange'}`,
      [seg, !alpha && S.prefs.courseOrder.length ? btn('Reset order', () => { S.prefs.courseOrder = []; S.savePrefs(); S.render(); }, 'ghost', 'reload') : null]),
      list.length ? h('div', { class: 'sgo-cgrid' }, list.map((c) => courseCard(c))) : empty('No courses found', 'Courses are read from your Schoology account. Open Settings → Diagnostics to see what was detected, or use Classic view.'));
  };

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
    const search = h('input', { class: 'sgo-input', type: 'search', placeholder: 'Search assignments', value: u.q, oninput: S.debounce((e) => { u.q = e.target.value; S.render(true); }, 150) });
    const courseSel = h('select', { class: 'sgo-input', onchange: (e) => { u.course = e.target.value; S.render(); } }, h('option', { value: '' }, 'All classes'),
      S.orderedCourses().map((c) => h('option', { value: c.id, selected: u.course === c.id ? 'selected' : null }, S.cn(c.id, c.name))));
    const sortSel = h('select', { class: 'sgo-input', onchange: (e) => { u.sort = e.target.value; S.render(); } },
      [['due', 'Sort: Due date'], ['class', 'Sort: Class'], ['status', 'Sort: Status']].map(([v, l]) => h('option', { value: v, selected: u.sort === v ? 'selected' : null }, l)));
    return h('div', { class: 'sgo-page' },
      pageHead('Assignments', 'Everything you need to do, and when', [btn('New assignment', () => S.openNewAssignment(null), 'primary', 'plus'), btn('Refresh', () => S.hardRefresh(), 'ghost', 'reload')]),
      pristine && review.length ? reviewCard(review) : null,
      h('div', { class: 'sgo-toolbar' }, h('div', { class: 'sgo-chips' }, chips), h('div', { class: 'sgo-filters' }, search, courseSel, sortSel)),
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
  /** Category chips and the assignment table for one course's gradebook. Shared by the Grades page and the course Grades tab. */
  function gradeBody(c, shown) {
    const blocks = shown.map((p) => {
      const items = p.categories.flatMap((cat) => cat.items.map((it) => ({ it, cat })));
      return h('div', { class: 'gr2-period' },
        shown.length > 1 ? h('div', { class: 'gr2-ph' }, h('b', null, p.name || 'Grading period'), h('span', null, `${p.letter || ''} ${gPct(p.percent)}`.trim())) : null,
        p.categories.length ? h('div', { class: 'gr2-cats' }, p.categories.filter((cat) => cat.items.length && (cat.weight != null || cat.grade)).map((cat) => h('span', { class: 'gr2-cat' },
          h('b', null, cat.name), cat.weight != null ? h('i', null, cat.weight + '% of grade') : null, h('span', null, cat.letter ? `${cat.letter} ${gPct(cat.percent)}` : '—')))) : null,
        items.length ? h('div', { class: 'gr2-scroll' }, h('table', { class: 'gr2-table' },
          h('thead', null, h('tr', null, ['Assignment', 'Category', 'Date', 'Earned', 'Possible', '%', 'Status'].map((t, i) => h('th', { class: i >= 3 && i <= 5 ? 'n' : '' }, t)))),
          h('tbody', null, items.map(({ it, cat }) => h('tr', null,
            h('td', { class: 'gr2-t' }, it.title), h('td', { class: 'gr2-c' }, cat.name), h('td', { class: 'gr2-d', title: it.dueText }, gWhen(it.dueText)),
            h('td', { class: 'n' }, gNum(it.earned)), h('td', { class: 'n' }, gNum(it.possible)), h('td', { class: 'n' }, gItemPct(it) == null ? '—' : gItemPct(it) + '%'),
            h('td', null, h('span', { class: 'gr2-st st-' + it.status }, it.statusLabel))))))) : h('div', { class: 'gr2-none' }, 'No graded items yet.'));
    });
    return h('div', { class: 'gr2-body' }, blocks.length ? blocks : h('div', { class: 'gr2-none' }, 'Schoology has not published grades for this course yet.'));
  }
  V.grades = () => {
    const g = S.state.grades;
    const courseBlock = (c, idx) => {
      const key = c.gradebookId || c.courseName, color = S.courseColor(c.courseId, c.courseName);
      const open = key in S.ui.openGrade ? S.ui.openGrade[key] : idx === 0;
      // Schoology also lists an empty "(no grading period)" group; only show periods that actually contain graded entries.
      const shown = gradePeriods(c);
      const periodNames = shown.map((p) => p.name).filter(Boolean);
      const sub = [periodNames.join(', '), c.teacher].filter(Boolean).join(' · ');
      const head = h('button', { class: 'gr2-h', 'aria-expanded': String(open), onclick: () => { S.ui.openGrade[key] = !open; S.render(true); } },
        h('span', { class: 'gr2-dot', style: { background: color } }),
        h('span', { class: 'gr2-id' }, h('span', { class: 'gr2-name' }, S.cn(c.courseId, c.courseName)), sub ? h('span', { class: 'gr2-sub' }, sub) : null),
        h('span', { class: 'gr2-letter' }, c.letter || '—'), h('span', { class: 'gr2-pct' }, gPct(c.percent)),
        h('span', { class: 'gr2-chev' + (open ? ' open' : '') }, icon('right', 14)));
      const body = open ? gradeBody(c, shown) : null;
      return h('section', { class: 'gr2-course' + (open ? ' open' : '') }, head, body);
    };
    return h('div', { class: 'sgo-page' }, pageHead('Grades', g.length ? `${g.length} ${g.length === 1 ? 'course' : 'courses'} · course, period and category grades are shown as Schoology reports them` : 'Shown as Schoology reports them', [btn('Refresh', () => S.hardRefresh(), 'ghost', 'reload')]),
      g.length ? h('div', { class: 'gr2-list' }, g.map(courseBlock))
        : empty('No grades loaded', S.state.loading ? 'Loading…' : 'Grades could not be read from Schoology’s page. Use Classic view to see your gradebook, and check Settings → Diagnostics.'),
      g.length ? h('p', { class: 'sgo-note' }, 'The % column for each assignment is points earned divided by points possible. Nothing else is calculated here.') : null);
  };

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

  function resourceRow(c, it) {
    if (it.kind === 'folder') {
      const n = S.folderCount(c.id, it.id);
      return h('li', null, h('a', { class: 'rs rs-folder', href: folderHref(c.id, it.id) }, h('span', { class: 'rs-ic' }, icon('folder', 20)),
        h('span', { class: 'rs-main' }, h('b', null, it.title), it.desc ? h('small', null, it.desc) : null),
        h('span', { class: 'rs-meta' }, n == null ? '' : `${n} ${n === 1 ? 'item' : 'items'}`), h('span', { class: 'rs-go', 'aria-hidden': 'true' }, icon('right', 16))));
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
    else body = h('ul', { class: 'rs-list' }, data.items.map((it) => resourceRow(c, it)));
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
    else body = h('ul', { class: 'an-list' }, items.map((a, i) => { const id = a.id + ':' + i, long = a.body.length > 280, open = !!ui[id];
      return h('li', { class: 'an' }, h('div', { class: 'an-h' }, h('b', null, a.author || 'Teacher'), a.time ? h('span', null, a.time) : null),
        h('p', { class: open || !long ? '' : 'clamp' }, a.body), long ? h('button', { class: 'bk-more', type: 'button', dataset: { fk: 'an-' + id }, 'aria-expanded': String(open), onclick: () => { ui[id] = !open; S.render(true); } }, open ? 'Show less' : 'Show more') : null); }));
    return h('section', { class: 'crs-pane', 'aria-label': 'Announcements' }, body);
  }

  function gradesPane(c) {
    const g = S.gradeFor(c.id);
    if (!g) return h('section', { class: 'crs-pane' }, S.state.loaded && !S.state.loading ? h('div', { class: 'sgo-empty' }, h('div', { class: 'sgo-empty-t' }, 'No grades yet'), h('div', { class: 'sgo-empty-s' }, 'Schoology has not published a gradebook for this course.')) : SKELETON(3));
    const shown = gradePeriods(g);
    return h('section', { class: 'crs-pane', 'aria-label': 'Grades' },
      h('div', { class: 'crs-gsum' }, h('span', { class: 'gr2-letter' }, g.letter || '—'), h('b', null, gPct(g.percent)), h('small', null, [shown.map((p) => p.name).filter(Boolean).join(', '), 'as Schoology reports it'].filter(Boolean).join(' · '))),
      gradeBody(g, shown));
  }

  function overviewPane(c) {
    const name = S.cn(c.id, c.name), teacher = S.courseTeacher(c), g = S.gradeFor(c.id), now = Date.now();
    const asg = courseAssignments(c), next = asg.filter((x) => x.st === 'open' || x.st === 'missing').sort((a, b) => (a.due ?? 9e15) - (b.due ?? 9e15)).slice(0, 5);
    const feed = S.feedState(c.id), root = S.folderState(c.id, ''), tops = root.data ? root.data.items.filter((i) => i.kind === 'folder').slice(0, 6) : null;
    const card = (title, link, body) => h('section', { class: 'crs-card' }, h('div', { class: 'crs-card-h' }, h('h2', null, title), link && h('a', { href: link[1] }, link[0])), body);
    return h('div', { class: 'crs-grid' },
      h('div', { class: 'crs-col' },
        card('Up next', ['All assignments', cHref(c.id, 'assignments')], next.length ? h('ul', { class: 'rs-list' }, next.map((x) => asgRow(c, x))) : S.state.loaded ? h('p', { class: 'tp-empty' }, 'Nothing due soon.') : SKELETON(2)),
        card('Announcements', ['All announcements', cHref(c.id, 'announcements')], feed.items ? (feed.items.length ? h('ul', { class: 'an-list' }, feed.items.slice(0, 3).map((a) => h('li', { class: 'an' }, h('div', { class: 'an-h' }, h('b', null, a.author || 'Teacher'), a.time ? h('span', null, a.time) : null), h('p', { class: 'clamp' }, a.body)))) : h('p', { class: 'tp-empty' }, 'No announcements yet.')) : feed.error ? h('p', { class: 'tp-empty' }, 'Announcements could not be loaded.') : SKELETON(2))),
      h('div', { class: 'crs-col' },
        card('Course', null, h('dl', { class: 'crs-dl' },
          h('dt', null, 'Teacher'), h('dd', null, teacher || 'Not listed'),
          h('dt', null, 'Code'), h('dd', null, S.courseCode(c.name) || '—'),
          h('dt', null, 'Term'), h('dd', null, S.courseTerm(c) || '—'),
          h('dt', null, 'Current grade'), h('dd', null, g && g.percent != null ? `${g.letter || ''} ${gPct(g.percent)}`.trim() : 'Not available'))),
        card('Materials', ['Browse all', cHref(c.id, 'materials')], tops ? (tops.length ? h('ul', { class: 'rs-list' }, tops.map((it) => resourceRow(c, it))) : h('p', { class: 'tp-empty' }, 'No folders yet.')) : root.error ? h('p', { class: 'tp-empty' }, 'Materials could not be loaded.') : SKELETON(2)),
        h('p', { class: 'sgo-note' }, 'Schoology does not share when materials were added, so recent additions cannot be listed.')));
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
    const cover = h('div', { class: 'crs-banner', style: { background: S.coverCss(c.id, c.name) } });
    S.guardCover(cover, c.id, c.name);
    const header = h('div', { class: 'crs-head', style: { '--c': S.courseColor(c.id, c.name) } }, cover,
      h('div', { class: 'crs-title' }, h('div', null, h('h1', null, name), h('p', null, [teacher && `Teacher: ${teacher}`, code, term].filter(Boolean).join(' · ') || ' ')),
        h('div', { class: 'crs-actions' }, btn('Change banner', () => S.openBannerPicker(c), 'ghost', 'image'),
          S.menu('Course options', [['Rename and colour', () => S.openCourseEditor(c)], ['View as Schoology page', () => window.open(originalHref(`/course/${c.id}/materials`), '_blank', 'noopener')]]))));
    const tabs = [['overview', 'Overview'], ['materials', 'Materials'], ['assignments', 'Assignments'], ['grades', 'Grades'], ['announcements', 'Announcements']];
    const nav = h('nav', { class: 'crs-tabs', 'aria-label': 'Course sections' }, tabs.map(([k, label]) => h('a', { href: cHref(c.id, k), 'aria-current': r.tab === k ? 'page' : null }, label)));
    const pane = { overview: overviewPane, materials: materialsPane, assignments: assignmentsPane, grades: gradesPane, announcements: announcementsPane }[r.tab](c, r);
    const tabLabel = (tabs.find(([k]) => k === r.tab) || [])[1];
    S._logTitle = name + (r.tab !== 'overview' && tabLabel ? ' · ' + tabLabel : '');
    return h('div', { class: 'sgo-page crs' }, header, nav, pane);
  };

  /* ===================== SETTINGS ===================== */
  /* Teach the app a word once; it is fixed on every course. Stored in prefs.nameRules. */
  function nameFixesCard() {
    const r = S.prefs.nameRules || { expand: {}, keep: [] };
    const from = h('input', { class: 'sgo-input', placeholder: 'Word as Schoology writes it, e.g. TRNG', 'aria-label': 'Word as Schoology writes it' });
    const to = h('input', { class: 'sgo-input', placeholder: 'Show it as, e.g. Training (blank = keep as capitals)', 'aria-label': 'Show it as' });
    const copy = () => ({ expand: Object.assign({}, r.expand || {}), keep: (r.keep || []).slice() });
    const add = () => {
      const k = from.value.trim().toUpperCase().replace(/[^A-Z0-9&]/g, ''), val = to.value.trim();
      if (!k) return;
      const nr = copy();
      if (!val || val.toUpperCase() === k) { if (!nr.keep.includes(k)) nr.keep.push(k); delete nr.expand[k]; }
      else nr.expand[k] = val;
      S.setNameRules(nr);
    };
    const onEnter = (e) => { if (e.key === 'Enter') add(); };
    from.addEventListener('keydown', onEnter); to.addEventListener('keydown', onEnter);
    const rules = [...Object.entries(r.expand || {}).map(([k, v]) => [k, v, 'expand']), ...(r.keep || []).map((k) => [k, k, 'keep'])];
    const removeRule = (k, kind) => { const nr = copy(); if (kind === 'expand') delete nr.expand[k]; else nr.keep = nr.keep.filter((x) => x !== k); S.setNameRules(nr); };
    const preview = S.state.courses.map((c) => h('div', { class: 'sgo-prev-row' }, h('span', { class: 'sgo-muted' }, c.name), h('b', null, S.cleanName(c.name))));
    return h('section', { class: 'sgo-card' }, h('h2', null, 'Name fixes'),
      h('p', { class: 'sgo-muted' }, 'If a word shows up wrong, teach it once and it is fixed on every course. Matching ignores capitals. Your fixes are saved in this browser.'),
      h('div', { class: 'sgo-teach' }, from, h('span', { class: 'sgo-muted' }, '→'), to, btn('Add', add, 'primary', 'plus')),
      rules.length ? h('div', { class: 'sgo-rules' }, rules.map(([k, val, kind]) => h('span', { class: 'sgo-rule' }, h('b', null, k), ' → ', val,
        h('button', { class: 'sgo-x', title: 'Remove this fix', 'aria-label': 'Remove ' + k, onclick: () => removeRule(k, kind) }, '×')))) : null,
      h('h3', { class: 'sgo-sub' }, 'Preview'),
      h('div', { class: 'sgo-preview' }, preview.length ? preview : h('span', { class: 'sgo-muted' }, 'No courses found yet.')));
  }

  /* ---------- student-controlled tracking ---------- */
  function reviewCard(list) {
    return h('section', { class: 'sgo-review' },
      h('div', { class: 'sgo-review-h' }, h('b', null, 'Should these be included in your personal workload?'),
        h('small', { class: 'sgo-muted' }, `${list.length} new from Schoology. Your choice is remembered.`)),
      list.slice(0, 6).map((it) => h('div', { class: 'sgo-review-i' },
        h('div', { class: 'sgo-item-main' }, h('div', { class: 'sgo-item-title' }, it.title),
          h('div', { class: 'sgo-item-meta' }, dot(S.colorOf(it)), S.cn(it.courseId, it.courseName) || 'Course', ' · ', S.relDue(it.due))),
        h('div', { class: 'sgo-head-a' }, btn('Include', () => S.decide(it.key, 'include'), 'ghost', 'check'), btn('Exclude from tracking', () => S.decide(it.key, 'exclude'), 'ghost')))),
      list.length > 6 ? h('p', { class: 'sgo-muted sgo-small' }, `${list.length - 6} more after these.`) : null);
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

  /* Appearance: four independent colours drive the whole look. Every change is applied at once through CSS variables and saved. */
  function appearanceCard() {
    const P = S.prefs, ui = (S.ui.appearance = S.ui.appearance || {});
    const control = (label, key, hint) => {
      const text = h('input', { class: 'sgo-input hex', value: P[key], maxlength: '7', spellcheck: 'false', autocomplete: 'off', 'aria-label': label + ' as a hex code', 'aria-invalid': 'false' });
      const pick = h('input', { class: 'sgo-swatch-in', type: 'color', value: P[key], 'aria-label': label });
      const write = (hex) => { text.value = hex; pick.value = hex; text.setAttribute('aria-invalid', 'false'); };
      pick.addEventListener('input', () => { if (S.setAppearance({ [key]: pick.value })) write(P[key]); });
      text.addEventListener('input', () => { const hex = S.normHex(text.value); text.setAttribute('aria-invalid', hex || text.value === '' ? 'false' : 'true'); if (hex && S.setAppearance({ [key]: hex })) pick.value = P[key]; });
      text.addEventListener('change', () => write(P[key])); // an unfinished or invalid code snaps back to the colour in use
      return h('div', { class: 'ap-row' }, h('div', { class: 'ap-l' }, h('b', null, label), h('small', null, hint)), h('div', { class: 'ap-c' }, pick, text));
    };
    const current = (S.ACCENTS.find((x) => x[1] === P.accent) || ['Custom'])[0], open = !!S.ui.accentOpen;
    const choose = (hex) => { S.setAppearance({ accent: hex }); S.ui.accentOpen = false; S.render(true); };
    const accents = h('div', { class: 'acc-wrap' },
      h('button', { class: 'acc-btn', type: 'button', 'aria-haspopup': 'true', 'aria-expanded': String(open), 'aria-label': 'Accent colour: ' + current + '. Choose another.', onclick: (e) => { e.stopPropagation(); S.ui.accentOpen = !open; S.render(true); } },
        h('span', { class: 'acc-chip', style: { background: P.accent } }), h('span', null, current)),
      open ? h('div', { class: 'acc-pop', role: 'group', 'aria-label': 'Accent colours' },
        S.ACCENTS.map(([name, hex]) => h('button', { class: 'acc-sq' + (P.accent === hex ? ' on' : ''), type: 'button', style: { background: hex }, title: name, 'aria-label': name, 'aria-pressed': String(P.accent === hex), onclick: () => choose(hex) },
          P.accent === hex ? icon('check', 16) : null)),
        h('label', { class: 'acc-sq acc-custom', title: 'Any other colour' }, icon('palette', 16), h('input', { type: 'color', value: P.accent, 'aria-label': 'Custom accent colour', onchange: (e) => choose(e.target.value) }))) : null);
    const presets = S.THEME_PRESETS.map((t) => h('button', { type: 'button', class: 'ap-preset' + (['accent', 'contour', 'contourGlow', 'background'].every((k) => P[k] === t[k]) ? ' on' : ''), onclick: () => { S.setAppearance({ accent: t.accent, contour: t.contour, contourGlow: t.contourGlow, background: t.background }); S.render(true); } },
      h('span', { class: 'ap-sw', style: { background: t.background, boxShadow: `inset 0 0 0 1px ${t.contour}` } }, h('i', { style: { background: t.accent } }), h('i', { style: { background: t.contourGlow } })), t.name));
    return h('section', { class: 'sgo-card' }, h('h2', null, 'Appearance'),
      h('p', { class: 'sgo-muted' }, 'Four colours define the look. Changes apply instantly and are saved in this browser. The interface switches between light and dark text to match the background colour.'),
      h('div', { class: 'ap-row' }, h('div', { class: 'ap-l' }, h('b', null, 'Accent colour'), h('small', null, 'Click the square, then pick a colour. Used for buttons, links, active items and selection.')), accents),
      h('div', { class: 'ap-presets' }, presets),
      control('Contour lines', 'contour', 'The topographic map drawn behind every page'),
      control('Contour glow', 'contourGlow', 'The soft light under the main contour lines'),
      control('Background', 'background', 'The surface behind the map'),
      h('div', { class: 'ap-row' }, h('div', { class: 'ap-l' }, h('b', null, 'Topographic map'), h('small', null, 'Show the contour lines, or just the plain background colour')),
        h('div', { class: 'sgo-seg', role: 'group', 'aria-label': 'Topographic map' }, [[true, 'On'], [false, 'Off']].map(([v, l]) => h('button', { type: 'button', class: (P.topoOn !== false) === v ? 'on' : '', 'aria-pressed': String((P.topoOn !== false) === v), onclick: () => { S.setMap({ topoOn: v }); S.render(true); } }, l)))),
      h('div', { class: 'ap-row' }, h('div', { class: 'ap-l' }, h('b', null, 'Line density'), h('small', null, 'How many contour lines the map draws')),
        h('div', { class: 'sgo-seg', role: 'group', 'aria-label': 'Line density' }, [['light', 'Light'], ['standard', 'Standard'], ['dense', 'Dense']].map(([v, l]) => h('button', { type: 'button', class: (P.topoDensity || 'standard') === v ? 'on' : '', 'aria-pressed': String((P.topoDensity || 'standard') === v), onclick: () => { S.setMap({ topoDensity: v }); S.render(true); } }, l)))),
      h('div', { class: 'ap-row' }, h('div', { class: 'ap-l' }, h('b', null, 'Map shape'), h('small', null, 'Draws a different landscape')),
        btn('New map', () => { S.setMap({ topoSeed: 1000 + Math.floor(Math.random() * 90000) }); S.render(true); }, 'ghost', 'reload')),
      h('div', { class: 'sgo-head-a' }, btn('Reset appearance', () => { S.resetAppearance(); S.render(true); }, 'ghost', 'reload')));
  }

  V.settings = () => {
    const P = S.prefs, set = (k, v) => { P[k] = v;  S.savePrefs(); S.applyTheme(); S.render(true); };
    const row = (t, s, ctl) => h('div', { class: 'sgo-set' }, h('div', null, h('b', null, t), s && h('small', null, s)), ctl);
    const seg = (key, opts) => h('div', { class: 'sgo-seg' }, opts.map(([v, l]) => h('button', { class: P[key] === v ? 'on' : '', onclick: () => set(key, v) }, l)));
    const courseRows = S.orderedCourses().map((c) => h('div', { class: 'sgo-set slim' }, h('span', null, dot(S.courseColor(c.id, c.name)), S.cn(c.id, c.name)),
      h('label', { class: 'sgo-color' }, h('input', { type: 'color', value: S.courseColor(c.id, c.name), onchange: (e) => { P.courseColors[c.id] = e.target.value; S.savePrefs(); S.render(true); } }))));
    return h('div', { class: 'sgo-page narrow' }, pageHead('Settings', 'Everything is stored only in this browser'),
      h('section', { class: 'sgo-card' }, h('h2', null, 'Profile'), row('Your name', 'Used for the dashboard greeting. Stored only in this browser.',
        h('input', { class: 'sgo-input', value: P.displayName || '', placeholder: 'First name', onchange: (e) => set('displayName', e.target.value.trim()) }))),
      appearanceCard(),
      h('section', { class: 'sgo-card' }, h('h2', null, 'Course names'), row('Tidy names automatically', 'Turns “(MATH&151) CALCULUS I /AP CALC AB: (S1) Crane, A” into “AP Calculus AB”. Your own renames always win.', seg('cleanNames', [[true, 'On'], [false, 'Off']]))),
      nameFixesCard(),
      courseRows.length ? h('section', { class: 'sgo-card' }, h('h2', null, 'Course colours'), courseRows) : null,
      h('section', { class: 'sgo-card' }, h('h2', null, 'School links'),
        h('p', { class: 'sgo-muted' }, 'Schoology has no pages for these. Add your school\'s addresses and the top bar and rail will use them.'),
        S.TOP_LINKS.map(([k, label]) => row(label, null, h('input', { class: 'sgo-input', type: 'url', placeholder: 'https://', value: (P.topLinks || {})[k] || '', 'aria-label': label + ' address',
          onchange: (e) => { const u = e.target.value.trim(); P.topLinks = Object.assign({}, P.topLinks); if (/^https?:\/\//i.test(u)) P.topLinks[k] = u; else delete P.topLinks[k]; S.savePrefs(); S.render(true); } })))),
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
