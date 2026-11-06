/* Views: every screen is a pure function of (S.state, S.prefs, S.ui, route) -> DOM element. */
(() => {
  const S = window.SGO;
  if (S.views) return;
  const { h, icon } = S;
  const V = (S.views = {});
  S.ui = { edit: false, assign: { f: 'all', sort: 'due', q: '', course: '' }, cal: null, onlyDesc: {} };

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
  /** True when the system asks for reduced motion, or the student turned it on in Settings → Accessibility. */
  function reducedMotion() { return matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.classList.contains('sgo-reduce-motion'); }
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
      else if (i.due < S.sod(now) + 7 * S.DAY) c.soon.push(i);
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
      h('button', { class: 'sgo-check' + (done ? ' on' : ''), title: done ? 'Mark as not done' : 'Mark as done (saved only in this browser)', 'aria-pressed': String(done), onclick: () => toggleDone(it) }, checkRing()),
      h('a', { class: 'sgo-item-main', href: detailHref(it) },
        h('div', { class: 'sgo-item-title' }, it.title),
        h('div', { class: 'sgo-item-meta' }, S.cn(it.courseId, it.courseName) || 'Course', ' · ', S.relDue(it.due), it.due && it.timed ? ' · ' + S.fmtTime(it.due) : '')),
      !opts.compact && h('div', { class: 'sgo-item-side' }, mine && pill('Yours', 'mine'), done || st.id === 'done' ? pill(st.label, 'st-' + st.id) : pr !== 'low' ? pill(S.PRIORITY[pr], 'pr-' + pr) : st.id !== 'upcoming' ? pill(st.label, 'st-' + st.id) : null),
      act);
  }
  const list = (items, opts) => items.length ? h('div', { class: 'sgo-list' }, items.map((i) => itemCard(i, opts))) : null;

  /* ---------- popover menu (three-dot menus, account menu) ---------- */
  let openMenu = null;
  const closeMenu = (refocus) => { if (!openMenu) return; const m = openMenu; openMenu = null; m.panel.hidden = true; m.panel.remove(); m.btn.setAttribute('aria-expanded', 'false'); if (refocus) m.btn.focus(); };
  /** Open menus live on <html>, not inside the card: a card's hover lift (transform) or clipping can never move or cut them off. */
  S.closeMenus = () => closeMenu();
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
      if (S.closePopovers) S.closePopovers('menu');
      const wasOpen = openMenu && openMenu.btn === btn;
      closeMenu();
      if (wasOpen) return;
      panel.hidden = false; menuHost().append(panel);
      const r = btn.getBoundingClientRect(), w = panel.offsetWidth, hgt = panel.offsetHeight;
      panel.style.left = Math.max(8, Math.min(r.left, innerWidth - w - 8)) + 'px';
      const below = innerHeight - r.bottom - 12, above = r.top - 12; // open on the side with more room, and never taller than that room
      const up = hgt > below && above > below, room = Math.max(120, up ? above : below);
      panel.style.maxHeight = Math.min(room, innerHeight - 16) + 'px';
      const hh = Math.min(hgt, room);
      panel.style.top = (up ? Math.max(8, r.top - hh - 4) : Math.max(8, Math.min(r.bottom + 4, innerHeight - hh - 8))) + 'px';
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
  const clockText = (ts) => { const d = new Date(ts), h = d.getHours() % 12 || 12; return `${h}:${String(d.getMinutes()).padStart(2, '0')} ${d.getHours() < 12 ? 'AM' : 'PM'}`; };
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
  function countTo(el, from, to, suffix, D = 700) {
    el.textContent = from + suffix;
    if (from === to) return;
    setTimeout(() => {
      if (reducedMotion()) { el.textContent = to + suffix; return; }
      const t0 = Date.now();
      const step = () => { const k = Math.min(1, (Date.now() - t0) / D), e = 1 - Math.pow(1 - k, 5); el.textContent = Math.round(from + (to - from) * e) + suffix; if (k < 1) setTimeout(step, 16); };
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
    const inView = t.filter((i) => (S.isComplete(i) || !S.isStale(i)) && ((i.due && i.due >= start && i.due < end) || i.fromOverdue || i.gbMissing || S.isOverdue(i) || !i.due))
      .sort((a, b) => (a.due ?? 9e15) - (b.due ?? 9e15));
    const open = inView.filter((i) => !S.isComplete(i)), complete = inView.filter(S.isComplete);
    const overdue = open.filter(S.isOverdue).length, today = open.filter((i) => !S.isOverdue(i) && i.due && daysUntil(i.due, now) <= 0).length;
    return { inView, open, complete, overdue, today, pct: inView.length ? Math.round((complete.length / inView.length) * 100) : 0 };
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
  /** The exit shared by priorities and announcements: the item slides away to the right while it blurs and fades, then its space closes up. */
  function leaveEl(el, then) {
    if (!el || !el.animate) { then(); return; }
    const reduced = reducedMotion(), ease = 'cubic-bezier(.22, 1, .36, 1)';
    el.style.overflow = 'hidden'; el.style.pointerEvents = 'none';
    const h0 = el.offsetHeight, gap = parseFloat(getComputedStyle(el.parentElement || el).rowGap) || 0;
    const frames = reduced
      ? [{ opacity: 1, height: h0 + 'px', marginBottom: '0px' }, { opacity: 0, height: '0px', marginBottom: -gap + 'px' }]
      : [{ offset: 0, opacity: 1, transform: 'translateX(0)', filter: 'blur(0px)', height: h0 + 'px', marginBottom: '0px', easing: ease },
        { offset: .5, opacity: 0, transform: 'translateX(44px)', filter: 'blur(4px)', height: h0 + 'px', marginBottom: '0px', easing: ease },
        { offset: 1, opacity: 0, transform: 'translateX(44px)', filter: 'blur(4px)', height: '0px', marginBottom: -gap + 'px' }];
    const anim = el.animate(frames, { duration: reduced ? 200 : 460, easing: 'linear', fill: 'forwards' });
    let done = false; const fin = () => { if (!done) { done = true; then(); } };
    anim.onfinish = fin; setTimeout(fin, 900); // never leave the item stuck if the animation is interrupted
  }
  /** The completion circle: a ring, a fill, a ripple and a tick, all drawn as vectors so no frame is ever resampled. CSS drives every state. */
  const checkRing = () => {
    const t = document.createElement('template');
    t.innerHTML = '<svg class="pc" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle class="pc-ripple" cx="12" cy="12" r="10"/><circle class="pc-fill" cx="12" cy="12" r="10"/><circle class="pc-ring" cx="12" cy="12" r="10"/><path class="pc-tick" d="M7.4 12.6l3 3 6.2-6.6"/></svg>';
    return t.content.firstChild;
  };
  function priorityRow(it, now, idx = 0) {
    const u = urgency(it, now), viaSchoology = S.isSubmitted(it), complete = S.isComplete(it), e = S.gradeEntry(it);
    const name = S.cn(it.courseId, it.courseName) || (it.manual ? 'Personal task' : 'Course');
    const reduced = reducedMotion();
    // Commit the change, then say so with an Undo that reverses it.
    const commit = () => {
      dui().last = { id: it.key, at: Date.now() };
      toggleDone(it);
      S.toast(complete ? 'Marked incomplete' : 'Marked complete',
        { label: 'Undo', run: () => { dui().last = null; toggleDone(S.allItems().find((i) => i.key === it.key) || it); } });
    };
    // Ticking an item leaves it in place, done, for a moment: tick it again in that time and it simply goes back. Otherwise the row eases shut and the list is redrawn.
    const HOLD = 1200;
    const putBack = (btn, row) => { btn.classList.remove('on', 'just'); btn.setAttribute('aria-pressed', 'false'); btn.title = 'Mark complete'; row.classList.remove('u-done'); };
    const toggle = (e) => {
      if (viaSchoology) return;
      const btn = e.currentTarget, row = btn.closest('.pr');
      if (btn._hold) { clearTimeout(btn._hold); btn._hold = null; putBack(btn, row); return; }
      if (complete || reduced || !row || row.classList.contains('folding')) { if (!row || !row.classList.contains('folding')) commit(); return; }
      btn.classList.add('on', 'just'); btn.setAttribute('aria-pressed', 'true'); btn.title = 'Mark as not complete'; row.classList.add('u-done');
      btn._hold = setTimeout(() => {
        btn._hold = null; if (!row.isConnected) { commit(); return; }
        leaveEl(row, commit);
      }, HOLD);
    };
    const tt = dui().last, just = !!tt && tt.id === it.key && Date.now() - tt.at < 1500; // only the item just ticked draws its check
    return h('li', { class: `pr u-${u.id}`, style: { '--c': S.courseColor(it.courseId, it.courseName), '--i': idx } },
      h('button', { class: 'pr-check' + (complete ? ' on' : '') + (just ? ' just' : ''), type: 'button', dataset: { fk: 'check-' + it.key }, 'aria-pressed': String(complete), 'aria-disabled': viaSchoology ? 'true' : null,
        title: viaSchoology ? 'Submitted in Schoology' : complete ? 'Mark as not complete' : 'Mark complete',
        'aria-label': (viaSchoology ? 'Submitted in Schoology: ' : complete ? 'Mark not complete: ' : 'Mark complete: ') + it.title, onclick: toggle }, checkRing()),
      h('div', { class: 'pr-main' },
        h('a', { class: 'pr-title', href: itemHref(it) }, it.title),
        h('div', { class: 'pr-course' }, name, e && e.possible != null ? h('span', { class: 'pr-pts' }, `${e.possible} pts`) : null)),
      h('span', { class: 'pr-due' }, dueLabel(it, now)),
      h('span', { class: 'badge b-' + u.id }, icon(u.icon, 14), u.label),
      !it.manual && it.url ? h('a', { class: 'pr-open', href: it.url, target: '_blank', rel: 'noopener', title: 'Open in Schoology', 'aria-label': 'Open in Schoology: ' + it.title }, icon('external', 17))
        : h('a', { class: 'pr-open', href: itemHref(it), title: 'Open', 'aria-label': 'Open: ' + it.title }, icon('right', 15)));
  }


  /** Courses that are not part of the school year picture (summer work, advisory) stay off the dashboard. */
  const HIDDEN_COURSE = /summer|advisory/i;
  /** Hidden from the dashboard only; the Courses tab always lists everything. An explicit choice wins; otherwise summer work and advisory start hidden. */
  const hiddenCourse = (c) => { const v = (S.prefs.courseHidden || {})[c.id]; return v === undefined ? HIDDEN_COURSE.test(S.cn(c.id, c.name) || '') || HIDDEN_COURSE.test(c.name || '') : !!v; };
  S.courseHidden = hiddenCourse;
  S.setCourseHidden = (c, hide, quiet) => {
    S.prefs.courseHidden = Object.assign({}, S.prefs.courseHidden, { [c.id]: !!hide }); S.savePrefs(); S.render(true);
    if (!quiet) S.toast(hide ? 'Course hidden' : 'Course shown', { label: 'Undo', run: () => S.setCourseHidden(c, !hide, true) });
  };

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


  /* Which announcements the student has already opened. The first time the list loads, everything present counts as seen, so only later arrivals show as new. */
  const annKey = (a) => (a.courseId || '') + ':' + a.id;
  /** When an announcement was posted, from Schoology's own wording ("12 minutes ago", "Today at 8:37 am", "Tue Nov 3, 2026 at 2:23 pm"). null when it cannot be read. */
  function annTime(a, now = Date.now()) {
    const t = String(a.time || '').trim().toLowerCase(); if (!t) return null;
    if (/^(just now|now)$/.test(t)) return now;
    let m = t.match(/(\d+)\s*(seconds?|secs?|minutes?|mins?|hours?|hrs?|days?|weeks?|[smhdw])\s+ago/);
    if (m) return now - Number(m[1]) * ({ s: 1e3, m: 6e4, h: 36e5, d: 864e5, w: 6048e5 }[m[2][0]]);
    m = t.match(/(today|yesterday)(?:\s+at)?\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
    if (m) { const h12 = Number(m[2]), hr = m[4] ? (h12 % 12) + (m[4] === 'pm' ? 12 : 0) : h12, d = new Date(now); if (m[1] === 'yesterday') d.setDate(d.getDate() - 1); d.setHours(hr, Number(m[3] || 0), 0, 0); return d.getTime(); }
    const parsed = Date.parse(String(a.time).replace(/^\s*(mon|tue|wed|thu|fri|sat|sun)[a-z]*,?\s+/i, '').replace(/\s+at\s+/i, ' ')); return Number.isFinite(parsed) ? parsed : null;
  }
  const isFreshAnn = (a, now = Date.now()) => { const ts = annTime(a, now); return ts != null && now - ts >= 0 && now - ts < 864e5; };
  function annSeen() {
    const all = S.state.announcements;
    if (!Array.isArray(S.prefs.annSeen) && S.state.loaded && all.length) { S.prefs.annSeen = all.map(annKey); S.savePrefs(); }
    return new Set(S.prefs.annSeen || []);
  }
  function markAnnSeen(a) {
    const set = annSeen(), read = new Set(S.prefs.annRead || []);
    if (set.has(annKey(a)) && read.has(annKey(a))) return;
    set.add(annKey(a)); read.add(annKey(a)); S.prefs.annSeen = [...set].slice(-300); S.prefs.annRead = [...read].slice(-300); S.savePrefs();
  }
  /** New = not yet opened or marked read, and either posted in the last 24 hours or arrived since the student last looked. */
  const annIsNew = (a, seen, read) => !read.has(annKey(a)) && (isFreshAnn(a) || !seen.has(annKey(a)));
  /* Announcements the student has dismissed from the dashboard (kept locally; nothing is changed in Schoology). */
  const annHiddenSet = () => new Set(S.prefs.annHidden || []);
  const saveAnnHidden = (set) => { S.prefs.annHidden = [...set].slice(-300); S.savePrefs(); };
  function announcementsCard() {
    const ui = dui(), hid = annHiddenSet(), everything = S.state.announcements, all = everything.filter((a) => !hid.has(annKey(a))), dismissed = everything.length - all.length;
    const shown = ui.annAll ? all : all.slice(0, 3), seen = annSeen(), read = new Set(S.prefs.annRead || []), fresh = all.filter((a) => annIsNew(a, seen, read)).length;
    const reduced = reducedMotion();
    /** Opening or closing a card: redraw, then ease the card from its old height to its new one so the page never jumps. */
    const toggleOpen = (e, id, a, isOpen) => {
      const li = e.currentTarget.closest('li'), h0 = li ? li.offsetHeight : 0;
      ui.ann[id] = !isOpen; if (!isOpen) markAnnSeen(a); S.render();
      if (reduced || !h0) return;
      const nl = [...document.querySelectorAll('.an-list li')].find((x) => x.dataset.key === id); if (!nl) return;
      const h1 = nl.offsetHeight; if (Math.abs(h1 - h0) < 2) return;
      nl.style.overflow = 'hidden'; nl.style.height = h0 + 'px'; void nl.offsetHeight;
      nl.style.transition = 'height .3s cubic-bezier(.22, 1, .36, 1)'; nl.style.height = h1 + 'px';
      setTimeout(() => { nl.style.height = ''; nl.style.transition = ''; nl.style.overflow = ''; }, 330);
    };
    /** The card leaves: it slides right and fades while its height closes, then the list is redrawn. With reduced motion it is a quick fade only. */
    const settle = (e, cls, then) => {
      const li = e && e.currentTarget && e.currentTarget.closest('li'); if (!li) { then(); return; }
      if (cls === 'leaving') { leaveEl(li, then); return; }
      if (!li.animate) { then(); return; }
      li.classList.add(cls); li.style.pointerEvents = 'none';
      const anim = li.animate([{ opacity: 1 }, { opacity: .55 }], { duration: 200, easing: 'cubic-bezier(.22, 1, .36, 1)', fill: 'forwards' });
      let done = false; const fin = () => { if (!done) { done = true; then(); } };
      anim.onfinish = fin; setTimeout(fin, 500);
    };
    const markRead = (a, e) => settle(e, 'settling', () => { markAnnSeen(a); S.render(); });
    const markAllRead = () => { all.forEach(markAnnSeen); S.render(); };
    const dismiss = (a, e) => settle(e, 'leaving', () => {
      const set = annHiddenSet(); set.add(annKey(a)); saveAnnHidden(set); S.render();
      S.toast('Announcement dismissed', { label: 'Undo', run: () => { const s2 = annHiddenSet(); s2.delete(annKey(a)); saveAnnHidden(s2); S.render(); } });
    });
    const annSwap = !!ui.annSwap; ui.annSwap = false;
    return h('section', { class: 'side-card' + (annSwap ? ' swap' : ''), 'aria-labelledby': 'an-h' },
      h('div', { class: 'side-h' }, h('h3', { id: 'an-h' }, 'Announcements', fresh ? h('span', { class: 'an-count' }, `${fresh} new`) : null),
        h('div', { class: 'side-acts' },
          fresh ? h('button', { class: 'link', type: 'button', dataset: { fk: 'ann-read-all' }, onclick: markAllRead }, 'Mark all read') : null,
          all.length > 3 ? h('button', { class: 'link', type: 'button', dataset: { fk: 'ann-all' }, onclick: () => { ui.annAll = !ui.annAll; ui.annSwap = true; S.render(); } }, ui.annAll ? 'Show fewer' : 'View all') : null)),
      shown.length ? h('ul', { class: 'an-list' }, shown.map((a, idx) => {
        const id = annKey(a), isOpen = !!ui.ann[id], isNew = annIsNew(a, seen, read);
        return h('li', { class: (isNew ? 'new' : '') + (isOpen ? ' open' : '') + (idx === 0 ? ' lead' : ''), dataset: { key: id }, style: { '--c': S.courseColor(a.courseId, a.courseName), '--i': idx } },
          h('button', { class: 'an-main', type: 'button', dataset: { fk: 'ann-' + id }, 'aria-expanded': String(isOpen), onclick: (e) => toggleOpen(e, id, a, isOpen) },
            h('span', { class: 'an-top' }, h('span', { class: 'an-top-l' }, h('span', { class: 'an-c' }, h('i'), S.cn(a.courseId, a.courseName) || 'Announcement'), isNew ? h('span', { class: 'an-pill', 'aria-hidden': 'true' }, 'New') : null)),
            // Schoology posts have no separate subject line, so the text is shown once, whole; a subject gets its own line only when the post has one
            a.subject ? h('b', { class: 'an-sub' }, isNew ? h('span', { class: 'an-new', title: 'New' }, h('i'), h('span', { class: 'sr-only' }, 'New: ')) : null, a.subject) : null,
            h('span', { class: 'an-body' }, !a.subject && isNew ? h('span', { class: 'an-new', title: 'New' }, h('i'), h('span', { class: 'sr-only' }, 'New: ')) : null, a.body.replace(/\.+$/, '')),
            a.author || a.time ? h('span', { class: 'an-t' }, a.author ? h('span', null, a.author) : null, a.author && a.time ? h('i', { class: 'an-sep', 'aria-hidden': 'true' }) : null, a.time ? h('time', { class: 'an-d' }, a.time) : null) : null),
          h('div', { class: 'an-acts' },
            isNew ? h('button', { class: 'an-act', type: 'button', title: 'Mark as read', 'aria-label': 'Mark as read', dataset: { fk: 'ann-read-' + id }, onclick: (e) => markRead(a, e) }, icon('check', 16)) : null,
            h('button', { class: 'an-act', type: 'button', title: 'Dismiss', 'aria-label': 'Dismiss announcement', dataset: { fk: 'ann-hide-' + id }, onclick: (e) => dismiss(a, e) }, icon('eyeoff', 16))));
      })) : h('div', { class: 'ag-clear an-clear' }, h('span', { class: 'ag-clear-i', 'aria-hidden': 'true' }, icon('check', 20)),
        h('div', null, h('p', { class: 'ag-clear-t' }, dismissed ? 'You are all caught up' : 'No announcements yet'),
          h('p', { class: 'ag-clear-s' }, dismissed ? 'Nothing new from your teachers' : 'Posts from your teachers show up here'))),
      dismissed ? h('p', { class: 'an-restore' }, h('span', null, `${dismissed} dismissed`), h('button', { class: 'link', type: 'button', dataset: { fk: 'ann-restore' }, onclick: () => { saveAnnHidden(new Set()); S.render(); } }, 'Restore')) : null);
  }
  /* ---- dashboard v2: what needs doing, in order ---- */
  const AGENDA = [['overdue', 'Overdue', 3], ['today', 'Due today', 4], ['soon', 'Next 7 days', 99], ['later', 'Later', 4], ['none', 'No due date', 2]];
  /** The course filter: a button that opens the app's own menu, so it matches the theme (a native select cannot). */
  function courseFilter(ui) {
    const opts = [['all', 'All courses']].concat(S.orderedCourses().filter((c) => !hiddenCourse(c)).map((c) => [c.id, S.cn(c.id, c.name)]));
    const cur = opts.find((o) => o[0] === ui.course) || opts[0];
    const trigger = h('button', { class: 'pri-filter', type: 'button', dataset: { fk: 'course' } }, h('span', null, cur[1]), icon('down', 16));
    return S.menu('Filter by course', opts.map(([id, label]) => [h('span', { class: 'mi' + (id === cur[0] ? ' on' : '') }, h('span', null, label), id === cur[0] ? icon('check', 14) : null), () => { ui.course = id; ui.swap = true; S.render(); }]), trigger, 'pri-filter-menu');
  }
  function agenda(t, wk, now) {
    const ui = dui(), byCourse = (i) => ui.course === 'all' || i.courseId === ui.course;
    // the week's open work, plus anything due a week or more from now (it is listed under Later but does not count toward the week's progress)
    const horizon = S.sod(now) + 7 * S.DAY, seenKeys = new Set(wk.open.map((i) => i.key));
    const beyond = t.filter((i) => !seenKeys.has(i.key) && !S.isComplete(i) && !S.isStale(i) && i.due && i.due >= horizon);
    const groups = categorize(wk.open.concat(beyond).filter(byCourse));
    ui.open = ui.open || {};
    const done = wk.complete.filter(byCourse), total = AGENDA.reduce((n, [k]) => n + groups[k].length, 0);
    // the filter and Add task live on the first group's heading line, so they read as that list's controls
    const controls = h('div', { class: 'ag-ctl' },
      courseFilter(ui),
      h('button', { class: 'sgo-btn primary', type: 'button', onclick: () => S.openNewAssignment(null) }, icon('plus', 16), 'Add task'));
    let budget = 4; // rows shown across all groups before "Show more", so the page below the list stays within reach
    const sections = AGENDA.filter(([k]) => groups[k].length).map(([k, label, cap], idx) => {
      // the next 7 days and Later keep their own sizes; the urgent groups and "No due date" share a small row budget
      const own = k === 'soon' || k === 'later', take = k === 'soon' ? groups[k].length : own ? cap : Math.max(1, Math.min(cap, budget)); if (!own) budget = Math.max(0, budget - take);
      const list = groups[k], open = !!ui.open[k], shown = open ? list : list.slice(0, take);
      const head = h('h3', { class: 'ag-gh' }, h('span', null, label), h('b', null, list.length));
      return h('section', { class: 'ag-g g-' + k, 'aria-label': label },
        head,
        h('ul', { class: 'pr-list' }, shown.map((i, n) => priorityRow(i, now, n))),
        list.length > take ? h('button', { class: 'tp-more', type: 'button', dataset: { fk: 'more-' + k }, onclick: () => { ui.open[k] = !open; ui.swap = true; S.render(true); } }, open ? 'Show fewer' : `Show ${list.length - take} more`) : null);
    });
    const swap = !!ui.swap; ui.swap = false;
    return h('section', { class: 'ag' + (swap ? ' swap' : ''), 'aria-labelledby': 'ag-h' },
      h('div', { class: 'sec-h' }, h('h2', { id: 'ag-h', class: 'sec-t' }, 'Priorities'), controls),
      total ? sections : h('div', { class: 'ag-clear' }, h('span', { class: 'ag-clear-i', 'aria-hidden': 'true' }, icon('check', 20)),
        h('div', null, h('p', { class: 'ag-clear-t' }, done.length ? 'You are all caught up' : 'Nothing to do'),
          h('p', { class: 'ag-clear-s' }, 'New work shows up here when your teachers post it'))),
      done.length ? h('details', { class: 'pr-done', open: ui.showDone ? 'open' : null, ontoggle: (e) => { ui.showDone = e.target.open; } },
        h('summary', null, h('span', null, 'Completed this week'), h('b', null, done.length), icon('down', 16)), h('ul', { class: 'pr-list' }, done.map((i) => priorityRow(i, now)))) : null);
  }

  /** Direction of a course grade, from the gradebook only: the last three graded assignments taken together, against the course percentage.
   *  Returns null until there are two graded assignments to compare. */
  function gradeTrend(c) {
    const g = S.gradeFor(c.id); if (!g || g.percent == null) return null;
    const graded = [];
    for (const p of g.periods || []) for (const cat of p.categories || []) for (const it of cat.items || []) {
      const e = Number(it.earned), m = Number(it.possible);
      if (it.earned == null || !Number.isFinite(e) || !Number.isFinite(m) || m <= 0) continue;
      const d = it.dueText && S.parseDue(it.dueText); graded.push({ e, m, ts: d ? d.ts : 0 });
    }
    if (graded.length < 2) return { percent: g.percent, dir: 'none' };
    const last = graded.sort((x, y) => y.ts - x.ts).slice(0, 3), recent = (last.reduce((n, x) => n + x.e, 0) / last.reduce((n, x) => n + x.m, 0)) * 100, diff = Math.round((recent - g.percent) * 10) / 10;
    return { percent: g.percent, recent: Math.round(recent * 10) / 10, diff, count: last.length, dir: Math.abs(diff) < 1 ? 'flat' : diff > 0 ? 'up' : 'down' };
  }
  const TREND_WORD = { up: 'Rising', down: 'Slipping', flat: 'Steady', none: 'No trend yet' };
  /** One course: its grade, which way it is heading, and a thin bar for the percentage. */
  /** Counts a percentage up from zero with the same curve the bar uses (two decimals, like the number it ends on). */
  function countGrade(el, to, delay = 250, D = 600) {
    const reduced = reducedMotion(); el.textContent = pctText(0);
    if (reduced) { el.textContent = pctText(to); return; }
    setTimeout(() => {
      const t0 = Date.now(), step = () => { const k = Math.min(1, (Date.now() - t0) / D), e = 1 - Math.pow(1 - k, 5); el.textContent = pctText(Math.round(to * e * 100) / 100); if (k < 1) setTimeout(step, 16); else el.textContent = pctText(to); };
      step();
    }, delay);
  }
  function courseRow(c, tr) {
    const name = S.cn(c.id, c.name), pct = Math.max(0, Math.min(100, tr.percent)), dir = tr.dir;
    const gradeEl = (v) => { const el = h('span', { class: 'cl-g' }, pctText(v)); if (dui().countGrades) countGrade(el, v); return el; };
    const detail = dir === 'up' || dir === 'down' ? `${Math.abs(tr.diff)} pts ${dir === 'up' ? 'above' : 'below'} your average lately` : dir === 'flat' ? 'In line with your average lately' : 'Needs two graded assignments';
    return h('li', { class: 'cl-r d-' + dir, dataset: { id: c.id }, style: { '--c': S.courseColor(c.id, c.name), '--p': pct + '%' } },
      h('a', { class: 'cl-a', href: `/course/${c.id}/materials`, title: tr.recent != null ? `Last ${tr.count} graded assignments: ${tr.recent}%` : '', 'aria-label': `${name}, ${pctText(tr.percent)}, ${TREND_WORD[dir].toLowerCase()}. ${detail}` },
        h('span', { class: 'cl-m' }, h('span', { class: 'cl-c' }, name),
          h('span', { class: 'cl-t' }, dir === 'up' ? icon('trendUp', 12) : dir === 'down' ? icon('trendDown', 12) : null, h('span', null, dir === 'up' || dir === 'down' ? `${TREND_WORD[dir]} · ${Math.abs(tr.diff)} pts` : TREND_WORD[dir]))),
        gradeEl(tr.percent),
        h('span', { class: 'cl-bar', 'aria-hidden': 'true' }, h('i'))));
  }
  /** Grades and where each is heading. Courses without a grade yet are said once, as links. */
  function courseList(courses, tasks, now, hidden) {
    const rows = courses.map((c) => [c, gradeTrend(c)]), graded = rows.filter(([, t]) => t), plain = rows.filter(([, t]) => !t);
    return h('section', { class: 'side-card cl', 'aria-labelledby': 'cl-h' },
      h('div', { class: 'side-h' }, h('h3', { id: 'cl-h' }, 'Grades'), h('a', { class: 'link', href: '/grades/grades' }, 'All grades')),
      !courses.length ? (!S.state.loaded ? h('div', { class: 'sk-row' }) : h('p', { class: 'side-empty' }, 'No courses found. Settings → Diagnostics shows what was read from Schoology.'))
        : [graded.length ? h('ul', { class: 'cl-list' }, graded.map(([c, t]) => courseRow(c, t))) : h('p', { class: 'side-empty' }, 'No grades have been posted yet.'),
          plain.length ? h('div', { class: 'cl-idle' }, h('p', null, graded.length ? 'No grade yet' : 'Your courses'),
            h('ul', null, plain.map(([c]) => h('li', { style: { '--c': S.courseColor(c.id, c.name) } }, h('a', { href: `/course/${c.id}/materials` }, h('i'), S.cn(c.id, c.name)))))) : null],
      hidden ? h('p', { class: 'dc-hidden-note' }, h('span', { class: 'dc-hn-t' }, `${plural(hidden, 'course')} hidden`), h('a', { class: 'link', href: '/courses' }, 'Show')) : null);
  }

  /** Says when the data was last read from Schoology, and says so plainly when a refresh failed. */
  function syncLine() {
    const st = S.syncStatus();
    if (st.kind === 'none') return null;
    const mins = st.at ? Math.max(0, Math.round((Date.now() - st.at) / 60000)) : null;
    const ago = mins == null ? '' : mins < 1 ? 'just now' : mins < 60 ? `${plural(mins, 'minute')} ago` : mins < 1440 ? `${plural(Math.round(mins / 60), 'hour')} ago` : `${plural(Math.round(mins / 1440), 'day')} ago`;
    const failed = st.kind === 'failed';
    return h('p', { class: 'dh-sync' + (failed ? ' bad' : ''), role: 'status' }, failed ? icon('alert', 14) : null,
      failed ? `Unable to refresh. Showing information loaded${ago ? ' ' + ago : ' earlier'}` : `Updated ${ago}`);
  }

  /** Page header: the greeting, one sentence about the day, and the week's progress as a single line. */
  /** The week's progress: the bar eases from where it was, the percentage counts up (or down), and the counter pops when it changes. */
  function weekBlock(wk, total, pct) {
    const ui = dui(), from = ui.weekPct == null ? pct : ui.weekPct, changed = from !== pct; ui.weekPct = pct;
    const fill = h('i', { style: { width: from + '%' } }), pctEl = h('span', { class: 'wk-pct' }, from + '%');
    if (changed) { setTimeout(() => { fill.getBoundingClientRect(); fill.style.width = pct + '%'; }, 30); countTo(pctEl, from, pct, '%', 500); }
    return h('div', { class: 'dh-wk', role: 'img', 'aria-label': `${wk.complete.length} of ${total} completed this week` },
      h('div', { class: 'wk-bar' + (changed ? ' moving' : ''), 'aria-hidden': 'true' }, fill),
      h('p', { class: 'wk-n' }, h('b', { class: changed ? 'bump' : null }, `${wk.complete.length}/${total}`), ' completed this week', pctEl));
  }
  function dashHead(wk, now, review) {
    const first = (S.prefs.displayName || S.state.user || '').trim().split(/\s+/)[0];
    const msg = wk.overdue ? `${plural(wk.overdue, 'assignment')} overdue${wk.today ? `, ${wk.today} due today` : ''}.`
      : wk.today ? `${plural(wk.today, 'assignment')} due today.` : 'Nothing is due today.';
    const total = wk.inView.length, pct = total ? Math.round((wk.complete.length / total) * 100) : 0;
    // the clock keeps itself current while the dashboard is open
    if (!S._clockT) S._clockT = setInterval(() => { const e = document.querySelector('.dh-clock'), tx = clockText(Date.now()); if (e && e.textContent !== tx) { e.textContent = tx; e.classList.remove('tick'); void e.offsetWidth; e.classList.add('tick'); } }, 15000);
    return h('header', { class: 'dh' },
      h('div', { class: 'dh-l' },
        h('p', { class: 'dh-hi' }, h('time', { class: 'dh-date' }, longDate(now)), h('span', { class: 'dh-dot', 'aria-hidden': 'true' }, '·'), h('time', { class: 'dh-clock' }, clockText(now))),
        h('h1', { class: 'dh-t' }, `${S.greeting()}${first ? ', ' + first : ''}`),
        h('div', { class: 'dh-sub' }, h('p', { class: 'dh-msg', role: 'status' }, msg.replace(/\.$/, '')), syncLine()),
        total ? weekBlock(wk, total, pct) : null));
  }

  /** The page shown when no work is left: a calm full-screen state, the week's count, and where to go next. */
  function caughtUp(wk, now, t) {
    const first = (S.prefs.displayName || S.state.user || '').trim().split(/\s+/)[0], n = wk.complete.length;
    const link = (href, label, ic) => h('a', { class: 'sgo-btn ghost cu-link', href }, icon(ic, 16), label);
    return h('div', { class: 'sgo-page cu' },
      h('div', { class: 'cu-card', role: 'status' },
        h('span', { class: 'cu-i', 'aria-hidden': 'true' }, icon('check', 36)),
        h('p', { class: 'cu-eyebrow' }, longDate(now)),
        h('h1', { class: 'cu-t' }, first ? `You're all caught up, ${first}` : `You're all caught up`),
        h('p', { class: 'cu-s' }, n ? `${plural(n, 'task')} finished this week and nothing left to do.` : 'Nothing is waiting for you right now.'),
        h('div', { class: 'cu-acts' }, link('/grades/grades', 'Check grades', 'grades'), link('/courses', 'Your courses', 'book'), link('/calendar', 'Calendar', 'calendar')),
        h('div', { class: 'cu-more' },
          h('button', { class: 'link', type: 'button', dataset: { fk: 'cu-full' }, onclick: () => { dui().showFull = true; S.render(true); } }, 'Show full dashboard'),
          h('button', { class: 'link', type: 'button', onclick: () => S.openNewAssignment(null) }, 'Add a task'))));
  }

  V.dashboard = () => {
    const now = Date.now(), skip = new Set(S.state.courses.filter(hiddenCourse).map((c) => c.id)), t = tasksOnly().filter((i) => !skip.has(i.courseId)), courses = S.orderedCourses().filter((c) => !skip.has(c.id)), review = S.unreviewedItems().length, wk = weekOf(t, now);
    S._dashStamp = S.dashStamp();
    // the sections ease in once, the first time the dashboard is drawn with data; later redraws (ticking a task, opening a menu) never replay it
    const intro = S.state.loaded && !S._dashIntro; if (intro) S._dashIntro = true;
    dui().countGrades = intro;
    // everything is finished: a page of its own instead of the usual dashboard with an empty list (the student can still open the full dashboard)
    const horizon = S.sod(now) + 7 * S.DAY, seenKeys = new Set(wk.open.map((i) => i.key));
    const openLeft = wk.open.length + t.filter((i) => !seenKeys.has(i.key) && !S.isComplete(i) && !S.isStale(i) && i.due && i.due >= horizon).length;
    if (S.state.loaded && t.length && !openLeft && !dui().showFull) return caughtUp(wk, now, t);
    return h('div', { class: 'sgo-page dash6' + (intro ? ' intro' : '') }, dashHead(wk, now, review),
      h('div', { class: 'dp-main' }, h('div', { class: 'dp-fused' }, agenda(t, wk, now), announcementsCard())),
      h('aside', { class: 'dp-side-col', 'aria-label': 'Courses' }, courseList(courses, t, now, skip.size)));
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
  /** The course's own topographic map, seeded from its id, as an <svg>. Shared by the Courses tiles and the course page banner so a course looks the same in both. */
  function topoSvg(id) {
    const T = window.SGO_TOPO; if (!T || !T.build) return '';
    let seed = 0; for (const ch of String(id)) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
    const m = T.build(560, 240, seed % 90000 + 1000, 'small-dense');
    return `<svg viewBox="0 0 ${m.width} ${m.height}" preserveAspectRatio="xMidYMid slice" focusable="false">${m.paths.map((x) => `<path d="${x.d}"${x.major ? ' class="mj"' : ` stroke-opacity="${x.o}"`}/>`).join('')}</svg>`;
  }
  const inkOn = (hex) => (window.SGO_COLOR && window.SGO_COLOR.onAccent ? window.SGO_COLOR.onAccent(hex) : '#fff');
  /** A course tile: its colour, its own map, its name, code and term. preview: the static copy shown in the customize window (no link, not draggable). */
  function courseCard(c, opts = {}) {
    const color = S.tint(c.id, c.name), name = S.cn(c.id, c.name), code = S.courseCode(c.name), term = S.courseTerm(c);
    const editing = !opts.preview && S.ui.renaming === c.id, canDrag = !opts.preview && !editing;
    let title;
    if (editing) {
      let done = false;
      const stop = (e) => e.stopPropagation();
      const finish = (save, v) => { if (done) return; done = true; if (save) S.setCourseMeta(c.id, { name: v.trim() && v.trim() !== S.autoName(c.name) ? v.trim() : '' }); S.ui.renaming = null; S.render(); };
      title = h('input', { class: 'sgo-input sgo-rename', value: name, placeholder: S.autoName(c.name), maxlength: '80', 'aria-label': 'Course name', onclick: stop, ondblclick: stop,
        onkeydown: (e) => { e.stopPropagation(); if (e.key === 'Enter') finish(true, e.target.value); else if (e.key === 'Escape') finish(false); },
        onblur: (e) => finish(true, e.target.value) });
      setTimeout(() => { title.focus(); title.select(); }, 30);
    } else title = h('div', { class: 'sgo-course-t', title: name }, name);
    const href = `/course/${c.id}/materials`, linked = !opts.preview && !editing;
    const tile = h('article', { class: 'sgo-course cc2', style: { '--c': color, '--ink': inkOn(color) }, draggable: canDrag ? 'true' : null, dataset: { id: c.id } },
      linked && h('a', { class: 'sgo-course-link', href, draggable: 'false', 'aria-label': 'Open ' + name }),
      h('span', { class: 'cc2-art', 'aria-hidden': 'true' }),
      h('div', { class: 'cc2-head' }, h('span', { class: 'cc2-label' }, 'Course')),
      h('div', { class: 'cc2-body' }, title),
      h('div', { class: 'cc2-foot' },
        h('div', { class: 'cc2-chips' }, code ? h('span', { class: 'cc2-code' }, code) : null, term ? h('span', { class: 'cc2-term' }, term) : null),
        linked ? h('a', { class: 'cc2-go', href, draggable: 'false', 'aria-label': 'Open ' + name, title: 'Open ' + name }, icon('arrowRight', 22)) : null));
    tile.querySelector('.cc2-art').innerHTML = topoSvg(c.id);
    if (canDrag) bindCourseDrag(tile, c);
    return tile;
  }

  /* Customize modal: name and colour. Edits apply live and persist immediately. */
  /* Removes the open modal and its Escape listener. Called on close and on every navigation. */
  S.closeModal = (soft) => {
    const host = S.modalHost, bg = host && host.firstElementChild;
    if (soft && bg && !reducedMotion()) { // fade out, then remove; a modal opened meanwhile is left alone
      bg.classList.add('leaving'); setTimeout(() => { if (bg.parentNode === host && bg.classList.contains('leaving')) bg.remove(); }, 150);
    } else if (host) host.replaceChildren();
    if (S._modalKey) { document.removeEventListener('keydown', S._modalKey, true); S._modalKey = null; }
    S._apRepaint = null;
  };
  S.openCourseEditor = (c) => {
    const host = S.modalHost; if (!host) return;
    S.closeModal();
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    const close = () => { S.closeModal(true); S.render(); };
    S._modalKey = onKey;
    document.addEventListener('keydown', onKey, true);
    const prev = h('div', { class: 'sgo-cgrid sgo-prev' });
    const fresh = () => prev.replaceChildren(courseCard(c, { preview: true }));
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
        prev, row('Display name', nameIn), row('Colour', sw),
        h('div', { class: 'sgo-head-a sgo-mfoot' },
          btn('Reset to original', () => { S.resetCourse(c.id); close(); }, 'ghost', 'reload'), btn('Done', close, 'primary', 'check')))));
    setTimeout(() => nameIn.focus(), 30);
  };

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


  V.courses = () => {
    const list = S.orderedCourses();
    return h('div', { class: 'sgo-page cl-page' }, h('div', { class: 'cl-top' }, h('div', null, h('span', { class: 'cl-eyebrow' }, 'Courses'), h('h1', null, 'Courses'), h('p', null, `${list.length} ${list.length === 1 ? 'course' : 'courses'} \u00b7 drag tiles to rearrange`)),
      S.prefs.courseOrder.length ? h('button', { class: 'sgo-btn primary cl-reset', type: 'button', onclick: () => { S.prefs.courseOrder = []; S.savePrefs(); S.render(); } }, icon('resetOrder', 18), 'Reset order') : null),
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
      all: (i) => !S.isStale(i) || S.isDone(i) || S.isOverdue(i), upcoming: (i) => !S.isDone(i) && i.due && i.due >= now, missing: (i) => !S.isDone(i) && (i.fromOverdue || i.gbMissing),
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
    const ui = dui(); ui.open = ui.open || {};
    const swapTo = (fn) => () => { fn(); u.swap = true; S.render(); };
    const chips = [['all', 'All'], ['upcoming', 'Upcoming'], ['missing', 'Missing'], ['overdue', 'Overdue'], ['done', 'Completed']].map(([k, l]) =>
      h('button', { class: 'sgo-chip' + (u.f === k ? ' on' : ''), type: 'button', onclick: swapTo(() => { u.f = k; }) }, l, h('span', null, tasksOnly().filter(filters[k]).filter(byCourse).length)));
    const qChip = u.q ? h('button', { class: 'sgo-chip on q-chip', type: 'button', title: 'Clear this search', 'aria-label': `Clear search ${u.q}`, onclick: swapTo(() => { u.q = ''; }) }, `“${u.q}”`, icon('plus', 14)) : null;
    // the filters are the dashboard's own menu buttons, not native selects
    const pick = (label, opts, cur, on) => {
      const c = opts.find((o) => o[0] === cur) || opts[0];
      return S.menu(label, opts.map(([id, l]) => [h('span', { class: 'mi' + (id === c[0] ? ' on' : '') }, h('span', null, l), id === c[0] ? icon('check', 14) : null), swapTo(() => on(id))]),
        h('button', { class: 'pri-filter', type: 'button', dataset: { fk: 'asg-' + label } }, h('span', null, c[1]), icon('down', 16)), 'pri-filter-menu');
    };
    const courseSel = pick('Filter by course', [['', 'All classes']].concat(S.orderedCourses().map((c) => [c.id, S.cn(c.id, c.name)])), u.course || '', (id) => { u.course = id; });
    const sortSel = pick('Sort assignments', [['due', 'Sort: Due date'], ['class', 'Sort: Class'], ['status', 'Sort: Status']], u.sort || 'due', (id) => { u.sort = id; });
    const intro = S.state.loaded && !S._asgIntro; if (intro) S._asgIntro = true;
    const swap = !!u.swap; u.swap = false;
    const CAP = { 'Completed': 6, 'Due later': 8, 'No due date': 8 };
    let n = 0;
    const sections = groups.map(([name, arr]) => {
      const cap = CAP[name] || 9999, open = !!ui.open['asg-' + name], shown = open ? arr : arr.slice(0, cap);
      return h('section', { class: 'ag-g' + (name === 'Overdue' ? ' g-overdue' : ''), 'aria-label': name },
        h('h3', { class: 'ag-gh' }, h('span', null, name), h('b', null, arr.length)),
        h('ul', { class: 'pr-list' }, shown.map((i) => priorityRow(i, now, n++))),
        arr.length > cap ? h('button', { class: 'tp-more', type: 'button', dataset: { fk: 'more-asg-' + name }, onclick: () => { ui.open['asg-' + name] = !open; u.swap = true; S.render(true); } }, open ? 'Show fewer' : `Show ${arr.length - cap} more`) : null);
    });
    return h('div', { class: 'sgo-page dash6 asg6' + (intro ? ' intro' : '') },
      h('header', { class: 'dh asg-h' },
        h('div', { class: 'dh-l' }, h('h1', { class: 'asg-title' }, 'Assignments'), h('p', { class: 'asg-sub' }, 'Everything you need to do, and when')),
        h('div', { class: 'asg-act' }, btn('Refresh', () => S.hardRefresh(), 'ghost', 'resetOrder'), btn('New assignment', () => S.openNewAssignment(null), 'primary', 'plus'))),
      h('div', { class: 'dp-main' },
        pristine && review.length ? reviewCard(review) : null,
        h('div', { class: 'asg-bar' }, h('div', { class: 'sgo-chips' }, chips), h('div', { class: 'asg-filters' }, qChip, courseSel, sortSel)),
        h('section', { class: 'ag' + (swap ? ' swap' : ''), 'aria-label': 'Assignments' },
          sections.length ? sections : h('div', { class: 'ag-clear' }, h('span', { class: 'ag-clear-i', 'aria-hidden': 'true' }, icon('check', 20)),
            h('div', null, h('p', { class: 'ag-clear-t' }, 'Nothing here'), h('p', { class: 'ag-clear-s' }, S.allItems().length ? 'Try a different filter.' : 'No assignments have been read from Schoology yet. Open Settings → Diagnostics to see what was found.')))),
        pristine && excluded.length ? excludedSection(excluded) : null));
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
    const weeks = mini ? 6 : Math.ceil((first.getDay() + new Date(y, m + 1, 0).getDate()) / 7); // only the weeks the month needs
    const cells = [...Array(weeks * 7)].map((_, i) => {
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
  const ovSave = () => { S.savePrefs(); setTimeout(() => S.render(true), 0); }; // after the focus change has settled, so Tab lands on the next field
  const ovPrune = (g) => { const all = S.prefs.hypo || {}, o = all[ovKey(g)]; if (o && !o.cats.length && !o.items.length && !Object.keys(o.edits || {}).length && !Object.keys(o.weights || {}).length) delete all[ovKey(g)]; };
  const numInput = (value, label, fk, onCommit, onLive) => h('input', { class: 'sgo-input ov-num', type: 'number', inputmode: 'decimal', min: '0', step: 'any', value: value == null ? '' : value, 'aria-label': label, dataset: { fk },
    oninput: onLive ? (e) => onLive(hyNum(e.target.value)) : null, onchange: (e) => onCommit(hyNum(e.target.value)) });

  /** Set (or clear) a hypothetical score for an item Schoology already lists. A value equal to the real one removes the edit. */
  function setEdit(g, cat, it, field, value, after) {
    const key = S.gradeKey(cat, it), o = ovGet(g, true), e = o.edits[key] || (o.edits[key] = {});
    if (value === (it[field] == null ? null : it[field])) delete e[field]; else e[field] = value;
    if (!Object.keys(e).length) delete o.edits[key];
    ovPrune(g); (after || ovSave)();
  }
  const clearEdit = (g, cat, it) => { const o = ovGet(g, true); delete o.edits[S.gradeKey(cat, it)]; ovPrune(g); ovSave(); };

  /* ---------- Grades: a course list on the left, one course at a time on the right ----------
   * "Actual" shows the gradebook exactly as Schoology reports it. "Hypothetical" turns the same page into a sandbox: scores become
   * editable, weights can be changed, your own scores and categories can be added, and a goal tool says what a score needs to be. */
  const signed = (n) => (n > 0 ? '+' : '') + n;
  const gradeNotes = (g, calc) => {
    const total = hyR2(calc.totalWeight), notes = [];
    if (calc.percent == null) return ['Add a score to a category to see a running total.'];
    if (calc.weighted && Math.abs(total - 100) > 0.01) notes.push(`Weights add up to ${total}%, so the total scales them to 100%.`);
    if (calc.weighted && calc.usedWeight < calc.totalWeight) notes.push('Categories with no scores yet are left out and the others scaled up.');
    if (calc.missingWeights) notes.push('Some Schoology categories have no weight, so they are not counted. Give them one below.');
    if (!calc.weighted) notes.push('Schoology did not report weights, so every point counts equally. Set weights to count by category.');
    const base = S.overlayGrade(g, {}).percent;
    if (calc.changed && base != null && g.percent != null && Math.abs(base - g.percent) > 0.1) notes.push(`Schoology shows ${gPct(g.percent)}. With these weights the unchanged gradebook works out to ${gPct(hyR2(base))}, so changes are measured from that.`);
    return notes;
  };
  const addScoreFor = (key) => { const g = S.state.grades.find((b) => ovKey(b) === key) || S.state.grades[0]; if (g) addScore(g, S.ui.gxCat || null); };
  /** Actual / Hypothetical switch. Shared by the Grades page and a course's Grades tab. */
  function gradeControls(preferKey) {
    const wi = ovEditing(), set = (v) => () => { if (v !== wi) { S.prefs.gradesEdit = v; S.savePrefs(); S.render(true); } };
    const seg = h('div', { class: 'sgo-seg gx-mode', role: 'group', 'aria-label': 'Grade view' },
      h('button', { type: 'button', class: wi ? '' : 'on', 'aria-pressed': String(!wi), dataset: { fk: 'gx-actual' }, onclick: set(false) }, 'Actual'),
      h('button', { type: 'button', class: wi ? 'on' : '', 'aria-pressed': String(wi), dataset: { fk: 'gx-whatif' }, onclick: set(true) }, 'Hypothetical'));
    return wi ? [seg, h('button', { class: 'sgo-btn primary gr-add', type: 'button', dataset: { fk: 'gr-add' }, onclick: () => addScoreFor(preferKey) }, icon('plus', 16), 'Add grade')] : [seg];
  }
  const gradeHint = () => (ovEditing() ? 'Hypothetical mode is on. Everything you change here is a plan, saved only in this browser and never sent to Schoology.' : 'Your grades exactly as Schoology reports them. Switch to Hypothetical to plan.');

  /** Adds a hypothetical score straight into the list, ready to type into. No dialog. */
  function addScore(c, catId) {
    const x = ovGet(c, true), calc = S.overlayGrade(c, x);
    let cat = catId || (calc.cats[0] || {}).id;
    if (!cat) { cat = hyId(); x.cats.push({ id: cat, name: 'Scores', weight: 0 }); }
    const id = hyId();
    x.items.unshift({ id, title: 'New score', cat, earned: null, possible: 100 });
    S.ui.gxQ = ''; S.ui.gxMore = false;
    ovSave();
    setTimeout(() => { const el = document.querySelector(`[data-fk="oi-e-${id}"]`); if (el) { el.focus(); el.select(); } }, 60);
  }

  /** One course: a sticky banner (grade, hypothetical grade, filters, search) over a newest-first list. */
  function gradeDetail(c, shown) {
    const wi = ovEditing(), ov = ovGet(c), key = ovKey(c), ui = S.ui, O = () => ovGet(c);
    let calc, changed, delta, rowOf;
    const derive = () => { calc = S.overlayGrade(c, O()); changed = calc.changed && calc.percent != null; const base = S.overlayGrade(c, {}).percent, from = base != null ? base : c.percent; delta = changed && from != null ? hyR2(calc.percent - from) : null; rowOf = new Map(calc.rows.map((r) => [r.id, r])); };
    derive();
    const reported = new Map(); shown.forEach((p) => p.categories.forEach((k) => { if (k.percent != null && !reported.has(k.name)) reported.set(k.name, k.percent); }));
    const reportedW = (name) => { for (const p of c.periods || []) for (const k of p.categories) if (k.name === name && k.weight != null) return Number(k.weight); return null; };
    const setW = (k, v) => { const x = ovGet(c, true); if (k.custom) { const q = x.cats.find((z) => z.id === k.id); if (q) q.weight = v == null ? 0 : v; } else if (v == null || v === reportedW(k.name)) delete x.weights[k.name]; else x.weights[k.name] = v; ovPrune(c); ovSave(); };
    const total = hyR2(calc.cats.reduce((a, k) => a + (Number(k.weight) || 0), 0)), okTotal = Math.abs(total - 100) < 0.01;
    // when the weights do not add to 100 (several grading periods, or weights left unset) each category counts for its share of the total
    const share = (k) => (total > 0 ? hyR2((Number(k.weight) / total) * 100) : 0);
    if (ui.gxCat && !calc.cats.some((k) => k.id === ui.gxCat)) ui.gxCat = '';
    const filter = ui.gxCat || '', q = (ui.gxQ || '').trim().toLowerCase(), narrowed = !!(filter || q);

    // one banner: the grade, where it would go, and by how much
    const gradeBlock = (label, pct, letter, cls) => h('div', { class: 'gx-g' + (cls ? ' ' + cls : '') }, h('span', { class: 'gx-lbl' }, label), h('b', null, pct), letter ? h('em', null, letter) : null);
    const mkBanner = () => h('div', { class: 'gx-sum' },
      h('div', { class: 'gx-sum-n' }, h('h2', null, S.cn(c.courseId, c.courseName)), h('p', null, [gradePeriods(c).map((p) => p.name).filter(Boolean).join(', '), c.teacher].filter(Boolean).join(' · '))),
      h('div', { class: 'gx-sum-g' }, gradeBlock(wi ? 'Schoology' : 'Grade', gPct(c.percent), c.letter),
        wi ? [h('i', { class: 'gx-arrow', 'aria-hidden': 'true' }, icon('arrowRight', 18)), gradeBlock('Hypothetical', changed ? gPct(hyR2(calc.percent)) : '—', '', 'gx-wi'), delta ? h('small', { class: 'gx-delta ' + (delta > 0 ? 'up' : 'down') }, signed(delta)) : null] : null));

    // filters (categories) and search stay with the banner while the list scrolls
    const chip = (id, label, pct, w) => h('button', { class: 'gx-chip' + (filter === id ? ' on' : ''), type: 'button', 'aria-pressed': String(filter === id), onclick: () => { ui.gxCat = filter === id ? '' : id; S.render(true); } },
      h('span', null, label), pct != null ? h('b', null, gPct(pct)) : null, w ? h('i', null, w) : null);
    const mkChips = () => h('div', { class: 'gx-chips', role: 'group', 'aria-label': 'Filter by category' }, chip('', 'All', null, null),
      calc.cats.map((k) => { const r = rowOf.get(k.id), pct = wi || !reported.has(k.name) ? (r && r.percent != null ? hyR2(r.percent) : null) : hyR2(reported.get(k.name)); return chip(k.id, k.name, pct, ''); }));
    let banner = mkBanner(), chips = mkChips();
    const tools = h('div', { class: 'gx-tools' }, chips,
      h('input', { class: 'sgo-input gx-q', type: 'search', placeholder: 'Search', value: ui.gxQ || '', 'aria-label': 'Search assignments', dataset: { fk: 'gx-q' }, oninput: (e) => { ui.gxQ = e.target.value; S.render(true); } }),
      wi ? h('button', { class: 'gx-add', type: 'button', onclick: () => addScore(c, filter || null) }, icon('plus', 14), 'Add a score') : null);

    // weights and the goal tool stay tucked away
    const weightRow = (k) => h('li', { class: 'gx-w' },
      wi && k.custom ? h('input', { class: 'sgo-input gx-cname', type: 'text', value: k.name, maxlength: '40', 'aria-label': 'Category name', dataset: { fk: 'oc-n-' + k.id }, onchange: (e) => { const q2 = ovGet(c, true).cats.find((z) => z.id === k.id); if (q2) q2.name = e.target.value.trim() || 'Untitled'; ovSave(); } }) : h('span', { class: 'gx-w-n' }, k.name, k.custom ? h('em', null, 'Yours') : k.set ? h('em', null, 'Edited') : null),
      !okTotal && Number(k.weight) > 0 ? h('span', { class: 'gx-share', title: 'Its share of the total, since the weights do not add to 100' }, '= ' + share(k) + '%') : null,
      h('span', { class: 'gx-in' }, numInput(k.weight, 'Weight of ' + k.name + ' in percent', 'oc-w-' + k.id, (v) => setW(k, v)), h('i', null, '%')),
      k.custom ? h('button', { class: 'gx-x', type: 'button', title: 'Delete category', 'aria-label': 'Delete category ' + k.name, onclick: () => {
        const n = ov.items.filter((i) => i.cat === k.id).length;
        const go = () => { const x = ovGet(c, true); x.cats = x.cats.filter((z) => z.id !== k.id); x.items = x.items.filter((i) => i.cat !== k.id); ovPrune(c); ovSave(); };
        if (n) S.openConfirm({ title: 'Delete this category?', body: `Its ${n} ${n === 1 ? 'score' : 'scores'} will be deleted too. Nothing changes in Schoology.`, ok: 'Delete', danger: true, onOk: go }); else go();
      } }, icon('trash', 16)) : h('span', { class: 'gx-xs' }));
    const notes = changed || calc.percent != null ? gradeNotes(c, calc) : [];
    const weights = wi ? h('details', { class: 'gx-weights', open: ui.gxW ? 'open' : null, ontoggle: (e) => { ui.gxW = e.target.open; } },
      h('summary', null, h('span', null, 'Category weights'), h('b', { class: 'gx-total ' + (okTotal ? 'ok' : 'warn') }, okTotal ? 'Total 100%' : `Total ${total}% · scaled to 100%`), icon('down', 16)),
      h('ul', { class: 'gx-wl' }, calc.cats.map(weightRow)),
      notes.map((n) => h('p', { class: 'gx-note' }, icon('help', 14), n))) : null;

    // rows: yours first, then Schoology's grouped by month (the newest month open, the rest folded)
    const catName = (id) => (calc.cats.find((k) => k.id === id) || {}).name || '';
    const hit = (t) => !q || String(t).toLowerCase().includes(q);
    const own = ov.items.filter((it) => (!filter || it.cat === filter) && hit(it.title));
    const all = [];
    shown.forEach((p) => p.categories.forEach((cat) => cat.items.forEach((it) => {
      if ((filter && filter !== 'o:' + cat.name) || !hit(it.title)) return;
      const d = it.dueText && S.parseDue(it.dueText);
      all.push({ it, cat, ts: d ? d.ts : 0 });
    })));
    all.sort((x, y) => y.ts - x.ts); // the most recent assignment first, undated ones last

    const refs = [], after = () => { S.savePrefs(); live(); };
    const statusNode = (it, cat, edited) => (edited ? h('span', { class: 'gr2-st st-hyp' }, 'Hypothetical', wi ? h('button', { class: 'ov-reset', type: 'button', title: 'Back to the Schoology score', 'aria-label': 'Reset ' + it.title + ' to the Schoology score', onclick: () => clearEdit(c, cat, it) }, icon('resetOrder', 13)) : null)
      : h('span', { class: 'gr2-st st-' + it.status }, it.statusLabel));
    const officialRow = ({ it, cat }) => {
      const kk = S.gradeKey(cat, it);
      const read = () => { const e = O().edits[kk] || {}, earned = 'earned' in e ? e.earned : it.earned, possible = 'possible' in e ? e.possible : it.possible; return { e, earned, possible, edited: !!O().edits[kk], pc: earned != null && possible ? Math.round((earned / possible) * 1000) / 10 : null }; };
      const v = read(), cell = (field, val, label) => (wi ? numInput(val, label + ' for ' + it.title, 'oe-' + field[0] + '-' + kk, (nv) => setEdit(c, cat, it, field, nv, after)) : h('span', { class: field in v.e ? 'ov-eval' : '' }, gNum(val)));
      const pcEl = h('span', { class: 'gx-r-p' }, v.pc == null ? '\u2014' : v.pc + '%'); let stEl = statusNode(it, cat, v.edited);
      const li = h('li', { class: 'gx-r' + (v.edited ? ' ed' : '') },
        h('div', { class: 'gx-r-m' }, h('b', null, it.title), h('span', { title: it.dueText }, [cat.name, gWhen(it.dueText)].filter(Boolean).join(' \u00b7 '))),
        h('div', { class: 'gx-r-s' }, cell('earned', v.earned, 'Earned'), h('i', null, '/'), cell('possible', v.possible, 'Possible')), pcEl, stEl);
      refs.push(() => { const n = read(); li.classList.toggle('ed', n.edited); pcEl.textContent = n.pc == null ? '\u2014' : n.pc + '%'; const ns = statusNode(it, cat, n.edited); stEl.replaceWith(ns); stEl = ns; });
      return li;
    };
    const ownRow = (it) => {
      const pcOf = () => (it.earned != null && it.possible ? hyR2((it.earned / it.possible) * 100) + '%' : '\u2014'), pcEl = h('span', { class: 'gx-r-p' }, pcOf());
      const catSel = wi ? h('select', { class: 'sgo-input gx-catsel', 'aria-label': 'Category', dataset: { fk: 'oi-c-' + it.id }, onchange: (e) => { it.cat = e.target.value; ovSave(); } }, calc.cats.map((k) => h('option', { value: k.id, selected: it.cat === k.id ? 'selected' : null }, k.name))) : null;
      refs.push(() => { pcEl.textContent = pcOf(); });
      return h('li', { class: 'gx-r mine' },
        h('div', { class: 'gx-r-m' }, wi ? h('input', { class: 'sgo-input gx-tname', type: 'text', value: it.title, maxlength: '80', 'aria-label': 'Assignment name', dataset: { fk: 'oi-t-' + it.id }, onchange: (e) => { it.title = e.target.value.trim() || 'Untitled'; S.savePrefs(); } }) : h('b', null, it.title), wi ? catSel : h('span', null, 'Yours \u00b7 ' + catName(it.cat))),
        h('div', { class: 'gx-r-s' }, wi ? numInput(it.earned, 'Earned', 'oi-e-' + it.id, (v) => { it.earned = v; after(); }) : h('span', null, gNum(it.earned)), h('i', null, '/'), wi ? numInput(it.possible, 'Possible', 'oi-p-' + it.id, (v) => { it.possible = v; after(); }) : h('span', null, gNum(it.possible))),
        pcEl,
        wi ? h('button', { class: 'gx-x', type: 'button', title: 'Delete score', 'aria-label': 'Delete ' + it.title, onclick: () => { const x = ovGet(c, true); x.items = x.items.filter((z) => z.id !== it.id); ovPrune(c); ovSave(); } }, icon('trash', 16)) : h('span', { class: 'gr2-st st-hyp' }, 'Your score'));
    };
    const CAP = 15, open = !!ui.gxMore, flat = [...own.map((it) => ({ own: true, it })), ...all], vis = narrowed || open ? flat : flat.slice(0, CAP);
    const list = flat.length ? h('div', { class: 'gx-groups' },
      h('ul', { class: 'gx-rows gx-flat' }, vis.map((r) => (r.own ? ownRow(r.it) : officialRow(r)))),
      flat.length > CAP && !narrowed ? h('button', { class: 'tp-more', type: 'button', onclick: () => { ui.gxMore = !open; S.render(true); } }, open ? 'Show fewer' : `Show ${flat.length - CAP} more`) : null)
      : h('p', { class: 'gx-none' }, narrowed ? 'No assignments match.' : 'Schoology has not published graded items for this course yet.');
    const mkReset = () => (wi && calc.changed ? btn('Reset my changes', () => S.openConfirm({ title: 'Reset your changes?', body: 'This removes the scores and weights you changed in this course. Your Schoology grades are not affected.', ok: 'Reset', danger: true, onOk: () => { delete (S.prefs.hypo || {})[key]; S.savePrefs(); S.render(true); } }), 'ghost', 'resetOrder') : null);
    const foot = h('div', { class: 'gx-foot' }, mkReset());
    // a score was edited: refresh only what depends on it, so typing, Tab and clicking never lose the field you are in
    function live() {
      derive();
      const nb = mkBanner(); banner.replaceWith(nb); banner = nb;
      const nc = mkChips(); chips.replaceWith(nc); chips = nc;
      refs.forEach((f) => f());
      foot.replaceChildren(...[mkReset()].filter(Boolean));
      const lc = document.querySelector('.gx-c.on .gx-c-g');
      if (lc) { const old = lc.querySelector('small'); if (old) old.remove(); if (wi && changed) lc.prepend(h('small', null, '\u2192 ' + gPct(hyR2(calc.percent)))); }
    }
    return h('div', { class: 'gx-body' }, h('div', { class: 'gx-sticky' }, banner, tools), weights,
      list, foot);
  }

  function officialGrades() {
    const g = S.state.grades, graded = g.filter((c) => c.percent != null), blank = g.filter((c) => c.percent == null);
    const sel = g.find((c) => ovKey(c) === S.ui.gradeSel) || graded[0] || g[0], swap = !!S.ui.gradeSwap; S.ui.gradeSwap = false;
    const row = (c) => {
      const k = S.overlayGrade(c, ovGet(c)), pct = c.percent, on = c === sel, none = pct == null;
      return h('button', { class: 'gx-c' + (on ? ' on' : '') + (none ? ' empty' : ''), type: 'button', 'aria-pressed': String(on), dataset: { fk: 'gx-c-' + ovKey(c) }, style: { '--c': S.tint(c.courseId, c.courseName), '--p': Math.max(0, Math.min(100, pct || 0)) + '%' },
        onclick: () => { if (!on) { S.ui.gradeSel = ovKey(c); S.ui.gxCat = ''; S.ui.gxQ = ''; S.ui.gradeSwap = true; S.render(true); } } },
        h('span', { class: 'gx-c-n' }, S.cn(c.courseId, c.courseName)),
        none ? null : h('span', { class: 'gx-c-g' }, k.changed && k.percent != null && ovEditing() ? h('small', null, '→ ' + gPct(hyR2(k.percent))) : null, h('b', null, gPct(pct)), c.letter ? h('em', null, c.letter) : null),
        none ? null : h('span', { class: 'gx-bar', 'aria-hidden': 'true' }, h('i')));
    };
    const acts = [...(g.length ? gradeControls(sel && ovKey(sel)) : []), btn('Refresh', () => S.hardRefresh(), 'ghost', 'resetOrder')];
    const blankOpen = blank.includes(sel) || !!S.ui.gxBlank;
    return h('div', { class: 'sgo-page gx' },
      pageHead('Grades', g.length ? gradeHint() : 'Shown as Schoology reports them', acts),
      g.length ? h('div', { class: 'gx-layout' },
        h('nav', { class: 'gx-list', 'aria-label': 'Courses' }, graded.map(row),
          blank.length ? h('details', { class: 'gx-blank', open: blankOpen ? 'open' : null, ontoggle: (e) => { S.ui.gxBlank = e.target.open; } }, h('summary', null, h('span', null, 'No grade yet'), h('b', null, blank.length), icon('down', 14)), blank.map(row)) : null),
        h('section', { class: 'gx-detail' + (swap ? ' swap' : ''), 'aria-label': S.cn(sel.courseId, sel.courseName) }, gradeDetail(sel, gradePeriods(sel)),
          h('p', { class: 'gx-fine' }, 'The % beside each assignment is points earned divided by points possible.')))
        : empty('No grades loaded', S.state.loading ? 'Loading…' : 'Grades could not be read from Schoology’s page. Use Classic view to see your gradebook, and check Settings → Diagnostics.'),
      null);
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
      if (hit) { hit.item = hit.item || i; hit.aid = hit.aid || aid; hit.missing = hit.missing || !!(i.fromOverdue || i.gbMissing); if (hit.due == null) hit.due = i.due; return; }
      list.push({ aid, title: i.title, due: i.due, dueText: '', timed: i.timed, item: i, missing: !!(i.fromOverdue || i.gbMissing) });
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
    const rd = it.kind === 'file' && (it.dl || it.href) ? { href: it.dl || it.href, name: it.title } : null; // files open in the built-in reader, not Schoology's viewer
    const title = it.kind === 'assignment' && it.id ? h('a', { href: asgHref(c.id, it.id) }, it.title) : rd ? h('a', { href: absHref(rd.href), onclick: S.docClick(rd) }, it.title) : h('a', { href: absHref(it.href), target: '_blank', rel: 'noopener' }, it.title);
    return h('li', null, h('div', { class: 'rs rs-' + it.kind },
      h('span', { class: 'rs-ic' + (isA ? ' asg' : '') }, icon(ic, 20)),
      h('span', { class: 'rs-main' }, h('b', null, title), h('small', null, sub), it.body && it.kind !== 'file' ? h('small', { class: 'rs-body' }, it.body) : null),
      h('span', { class: 'rs-meta' }, ge ? h('span', { class: 'gr2-st st-' + ge.status }, ge.statusLabel) : null),
      h('span', { class: 'rs-acts' },
        it.kind === 'assignment' && it.id ? h('a', { class: 'sgo-act', href: asgHref(c.id, it.id), title: 'View details', 'aria-label': 'View details: ' + it.title }, icon('right', 15)) : null,
        it.dl ? h('a', { class: 'sgo-act', href: absHref(it.dl), target: '_blank', rel: 'noopener', title: 'Download', 'aria-label': 'Download ' + it.title }, icon('download', 15)) : null,
        rd ? h('a', { class: 'sgo-act', href: absHref(rd.href), onclick: S.docClick(rd), title: 'Read here', 'aria-label': 'Read ' + it.title }, icon('file', 15)) : null,
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
      h('div', { class: 'sgo-detail', style: { '--c': S.tint(c.id, c.name) } },
        h('div', { class: 'sgo-detail-top' }, h('span', { class: 'sgo-course-tag' }, dot(S.tint(c.id, c.name)), S.cn(c.id, c.name)), row ? h('span', { class: 'gr2-st st-' + (row.st === 'submitted' ? 'pending' : row.st) }, row.stLabel) : null),
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
        d && d.attachments.length ? [h('h3', { class: 'sgo-sub' }, 'Attachments'), h('ul', { class: 'rs-list' }, d.attachments.map((a) => h('li', null, h('a', Object.assign({ class: 'rs', href: absHref(a.href) }, S.isDocLink(a.href) ? { onclick: S.docClick({ href: a.href, name: a.name }) } : { target: '_blank', rel: 'noopener' }), h('span', { class: 'rs-ic' }, icon('file', 20)), h('span', { class: 'rs-main' }, h('b', null, a.name)), h('span', { class: 'rs-go' }, icon('download', 16))))))] : null,
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
    return h('section', { class: 'crs-pane crs-grades gx', 'aria-label': 'Grades' },
      h('div', { class: 'gx-bar-top' }, h('p', { class: 'gx-hint' }, gradeHint()), h('div', { class: 'sgo-head-a' }, gradeControls(ovKey(g)))),
      h('div', { class: 'gx-detail' }, gradeDetail(g, gradePeriods(g))));
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
    const card = (title, link, body, cls) => h('section', { class: 'crs-card' + (cls ? ' ' + cls : '') }, h('div', { class: 'crs-card-h' }, h('h2', null, title), link && h('a', { class: 'link', href: link[1] }, link[0], icon('right', 14))), h('div', { class: 'crs-panel' }, body));
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
    const asgAll = courseAssignments(c), openN = asgAll.filter((x) => x.st === 'open').length, missN = asgAll.filter((x) => x.st === 'missing').length, gr = S.gradeFor(c.id);
    const meta = [code && h('span', { class: 'crs-code' }, code), teacher && h('span', null, teacher), term && h('span', null, term)].filter(Boolean);
    const stat = (v, l, cls) => h('div', { class: 'crs-stat' + (cls ? ' ' + cls : '') }, h('b', null, v), h('span', null, l));
    const heroColor = S.tint(c.id, c.name);
    const header = h('div', { class: 'crs-head', style: { '--c': heroColor, '--ink': inkOn(heroColor) } },
      h('span', { class: 'cc2-art crs-art', 'aria-hidden': 'true' }),
      h('div', { class: 'crs-actions' },
        S.menu('Course options', [['Rename and colour', () => S.openCourseEditor(c)], ['Notification icon…', () => S.openIconPicker(c)], [S.courseHidden(c) ? 'Show on dashboard' : 'Hide from dashboard', () => S.setCourseHidden(c, !S.courseHidden(c))], ['View as Schoology page', () => window.open(originalHref(`/course/${c.id}/materials`), '_blank', 'noopener')]])),
      h('div', { class: 'crs-title' },
        h('p', { class: 'crs-kicker' }, h('i', { 'aria-hidden': 'true' }), 'Course'),
        h('h1', null, S.ui.renaming === c.id ? renameField(c) : [name, h('button', { class: 'crs-rename', type: 'button', title: 'Rename', 'aria-label': 'Rename ' + name, onclick: () => { S.ui.renaming = c.id; S.render(); } }, icon('edit', 18))]),
        h('div', { class: 'crs-meta' }, meta.length ? meta.map((m, i) => [i ? h('i', { 'aria-hidden': 'true' }) : null, m]) : ' ')),
      h('div', { class: 'crs-stats' },
        stat(gr && gr.percent != null ? gPct(gr.percent) : '—', gr && gr.letter ? `Grade · ${gr.letter}` : 'Grade'),
        stat(String(openN), 'Open'),
        stat(String(missN), 'Missing', missN ? 'bad' : '')));
    header.querySelector('.crs-art').innerHTML = topoSvg(c.id);
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
    const quick = h('div', { class: 'sgo-quick', role: 'group', 'aria-label': 'Quick dates' }, [['Today', 0], ['Tomorrow', 1], ['Next week', 7]].map(([l, n]) => h('button', { type: 'button', class: 'sgo-qchip', onclick: () => { dueDate.value = iso(S.sod(Date.now()) + n * S.DAY); } }, l)));
    host.replaceChildren(h('div', { class: 'sgo-modal-bg', onclick: (e) => { if (e.target === e.currentTarget) close(); } },
      h('div', { class: 'sgo-modal sgo-task', role: 'dialog', 'aria-modal': 'true', 'aria-label': v.key ? 'Edit task' : 'New task' },
        h('h2', null, v.key ? 'Edit task' : 'New task'),
        row('Title', title),
        h('div', { class: 'sgo-grid2' }, row('Class', course), row('Due date', dueDate)),
        quick, err,
        h('div', { class: 'sgo-head-a sgo-mfoot' }, del, h('div', { class: 'sgo-head-a' }, btn('Cancel', close, 'ghost'), btn(v.key ? 'Save' : 'Add task', save, 'primary'))),
        h('p', { class: 'sgo-fine' }, 'Saved only in this browser, never in Schoology'))));
    setTimeout(() => title.focus(), 30);
  };

  /* ---------- Appearance: themes (previewed in miniature), the accent colour (separate), fine-tuning and the background map ---------- */
  const hexRgb = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
  const mixHex = (a, b, p) => { const A = hexRgb(a), B = hexRgb(b); return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * p).toString(16).padStart(2, '0')).join(''); };
  const LOOK_KEYS = ['contour', 'contourGlow', 'background'];
  const sameLook = (t) => LOOK_KEYS.every((k) => (S.prefs[k] || '').toLowerCase() === t[k]);
  S.sameLook = sameLook;
  /** A theme sets all of its colours: the background, the contour lines and glow, and the accent. */
  S.applyLook = (t) => {
    const html = document.documentElement;
    html.classList.add('sgo-themeing'); // colours ease between looks instead of snapping
    S.setAppearance(Object.assign({ contour: t.contour, contourGlow: t.contourGlow, background: t.background }, t.accent ? { accent: t.accent } : {}));
    clearTimeout(S.applyLook.t); S.applyLook.t = setTimeout(() => html.classList.remove('sgo-themeing'), 450);
  };
  /* The preview draws the real map: the same generator, seed, density and weight as the page, in the colours being edited, with the page's ambient
   * glow and the hero's own glow. It is a little brighter than the page (which shows it very softly) so the lines read at thumbnail size. */
  /** The preferences as they are right now. The app replaces S.prefs when storage changes (another tab, or an earlier save arriving late),
   *  so anything that holds a copy goes stale; the Appearance panel reads through this instead. */
  const livePrefs = new Proxy({}, { get: (_, k) => S.prefs[k], set: (_, k, v) => { S.prefs[k] = v; return true; } });
  let thumbN = 0;
  /** The banner's own contours (the same landscape and settings as the dashboard banner), for the miniature. */
  const heroMarkup = new Map();
  function heroPaths() {
    const P = S.prefs, d = ['light', 'standard', 'dense'].includes(P.topoDensity) ? P.topoDensity : 'standard', shift = (Number(P.topoSeed) || 20260) - 20260, key = d + ':' + shift;
    if (!heroMarkup.has(key)) { if (heroMarkup.size > 6) heroMarkup.clear(); const m = window.SGO_TOPO.build(960, 360, 7311 + shift, 'small-' + d); heroMarkup.set(key, m.paths.map((x) => `<path d="${x.d}"${x.major ? '' : ` stroke-opacity="${x.o}"`}/>`).join('')); }
    return heroMarkup.get(key);
  }
  /** A miniature of the dashboard: profile and icon tiles on the left, a banner with its contours, priority panels, and the grades panel. */
  function themeThumb(t, accent) {
    const P = S.prefs, bg = t.background, dark = window.SGO_COLOR.isDark(bg), uid = 'tg' + (++thumbN);
    const L2 = mixHex(bg, t.contour, .1), L3 = mixHex(bg, t.contour, .16), line = mixHex(bg, t.contour, .3), ink = dark ? mixHex(bg, '#ffffff', .88) : '#1e293b', soft = dark ? mixHex(bg, '#ffffff', .45) : '#64748b';
    const w = { thin: .55, standard: 1, bold: 1.9 }[P.topoWeight || 'standard'] || 1, mapOn = P.topoOn !== false, bad = dark ? '#ef8a80' : '#c4352b';
    const row = (x, y, wd, i, hot) => `<circle cx="${x + 4}" cy="${y + 3.2}" r="2.3" fill="none" stroke="${hot ? bad : accent}" stroke-width="1"/><rect x="${x + 9}" y="${y + 1.2}" width="${wd}" height="2.8" rx="1.4" fill="${ink}"/><rect x="${x + 9}" y="${y + 5.6}" width="${wd * .6}" height="1.8" rx=".9" fill="${soft}" fill-opacity=".7"/><rect x="${x + 66}" y="${y + 1.6}" width="${18 - i * 2}" height="4" rx="2" fill="${hot ? bad : soft}" fill-opacity=".3"/>`;
    const tpl = document.createElement('template');
    // every setting shows here: the background, the contour colour and glow, the map's on/off, density, weight and shape, and the accent
    tpl.innerHTML = `<svg viewBox="0 0 160 100" aria-hidden="true" focusable="false"><defs>
        <radialGradient id="${uid}a" cx="50%" cy="0%" r="90%"><stop offset="0" stop-color="${t.contourGlow}" stop-opacity=".3"/><stop offset="1" stop-color="${t.contourGlow}" stop-opacity="0"/></radialGradient>
        <linearGradient id="${uid}f" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="${L3}" stop-opacity="1"/><stop offset=".35" stop-color="${L3}" stop-opacity="1"/><stop offset="1" stop-color="${L3}" stop-opacity="0"/></linearGradient>
        <radialGradient id="${uid}g" cx="80%" cy="45%" r="60%"><stop offset="0" stop-color="${t.contourGlow}" stop-opacity=".7"/><stop offset="1" stop-color="${t.contourGlow}" stop-opacity="0"/></radialGradient>
        <clipPath id="${uid}c"><rect x="22" y="6" width="134" height="32" rx="6"/></clipPath></defs>
      <rect width="160" height="100" fill="${bg}"/>${mapOn ? `<rect width="160" height="100" fill="url(#${uid}a)"/>` : ''}
      <rect x="4" y="5" width="11" height="11" rx="3" fill="${accent}"/><rect x="4" y="19.5" width="11" height=".7" fill="${line}"/>
      <rect x="4" y="25" width="11" height="9" rx="2.8" fill="${accent}" fill-opacity=".25"/><rect x="7.5" y="28" width="4" height="3" rx="1" fill="${accent}"/>
      ${[0, 1, 2, 3].map((i) => `<rect x="4" y="${37 + i * 11}" width="11" height="9" rx="2.8" fill="${soft}" fill-opacity=".14"/><rect x="7.5" y="${40 + i * 11}" width="4" height="3" rx="1" fill="${soft}" fill-opacity=".7"/>`).join('')}
      <rect x="22" y="6" width="134" height="32" rx="6" fill="${L3}"/>
      ${mapOn ? `<g clip-path="url(#${uid}c)"><rect x="22" y="6" width="134" height="32" fill="url(#${uid}g)"/><svg x="56" y="6" width="104" height="32" viewBox="0 0 960 360" preserveAspectRatio="xMaxYMid slice"><g class="pv-lines" fill="none" stroke="${t.contour}" stroke-width="${5 * w}" stroke-linecap="round" opacity=".95">${heroPaths()}</g></svg><rect x="22" y="6" width="134" height="32" fill="url(#${uid}f)"/></g>` : ''}
      <rect x="29" y="12" width="52" height="5" rx="2.2" fill="${ink}"/><rect x="29" y="20" width="34" height="3" rx="1.5" fill="${soft}"/>
      <rect x="29" y="29" width="42" height="2.2" rx="1.1" fill="${line}"/><rect x="29" y="29" width="12" height="2.2" rx="1.1" fill="${accent}"/>
      <rect x="22" y="42" width="88" height="28" rx="5" fill="${L2}"/>${row(25, 44.5, 36, 0, true)}${row(25, 53, 30, 1, true)}${row(25, 61.5, 40, 2, false)}
      <rect x="22" y="73" width="88" height="24" rx="5" fill="${L2}"/>${row(25, 75, 32, 3, false)}${row(25, 83.5, 38, 4, false)}
      <rect x="115" y="42" width="41" height="55" rx="5" fill="${L2}"/>
      ${[0, 1, 2].map((i) => `<rect x="120" y="${47 + i * 16}" width="${16 - i * 2}" height="3" rx="1.5" fill="${ink}"/><rect x="141" y="${46 + i * 16}" width="10" height="4.5" rx="1.6" fill="${ink}"/><rect x="120" y="${54 + i * 16}" width="31" height="1.8" rx=".9" fill="${line}"/><rect x="120" y="${54 + i * 16}" width="${25 - i * 5}" height="1.8" rx=".9" fill="${accent}"/>`).join('')}
    </svg>`;
    return tpl.content.firstChild;
  }
  const currentLook = () => ({ id: 'cur', name: 'Custom', contour: S.prefs.contour, contourGlow: S.prefs.contourGlow, background: S.prefs.background });

  function mapControls(redraw) {
    const P = livePrefs, segBtn = (opts, cur, on) => opts.map(([v, l]) => h('button', { type: 'button', class: cur === v ? 'on' : '', 'aria-pressed': String(cur === v), onclick: () => on(v) }, l));
    const seg = (label, hint, opts, cur, on) => h('div', { class: 'ap-row', title: hint }, h('div', { class: 'ap-l' }, h('b', null, label)), h('div', { class: 'sgo-seg', role: 'group', 'aria-label': label }, segBtn(opts, cur, on)));
    return [
      seg('Show map', 'Contour lines, or just the plain background', [[true, 'On'], [false, 'Off']], P.topoOn !== false, (v) => { S.setMap({ topoOn: v }); redraw(); }),
      seg('Density', 'How many contour lines are drawn', [['light', 'Light'], ['standard', 'Standard'], ['dense', 'Dense']], P.topoDensity || 'standard', (v) => { S.setMap({ topoDensity: v }); redraw(); }),
      seg('Weight', 'How thick the lines are', [['thin', 'Thin'], ['standard', 'Standard'], ['bold', 'Bold']], P.topoWeight || 'standard', (v) => { S.setMap({ topoWeight: v }); redraw(); }),
      h('div', { class: 'ap-row', title: 'Draws a different landscape' }, h('div', { class: 'ap-l' }, h('b', null, 'Shape')), btn('New map', () => { S.setMap({ topoSeed: 1000 + Math.floor(Math.random() * 90000) }); redraw(); }, 'ghost', 'reload')),
    ];
  }

  /** The appearance panel, as a split view: the live preview and the accent colour on the left, every control on the right, so each edit is visible as you make it. */
  S.openAppearance = () => {
    const host = S.modalHost; if (!host) return;
    S.closeModal();
    const close = () => { S.closeModal(true); S.render(true); };
    S._modalKey = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', S._modalKey, true);
    const P = livePrefs, prev = h('div', { class: 'ap-live', role: 'img', 'aria-label': 'Live preview of your colours and background map' });
    const paint = () => prev.replaceChildren(themeThumb(currentLook(), P.accent));
    const themes = h('div', { class: 'ap-themes' }), mapBody = h('div', { class: 'ap-map' });
    const drawThemes = () => themes.replaceChildren(
      h('h3', { id: 'ap-col-h' }, 'Theme'),
      h('div', { class: 'ap-presets', role: 'group', 'aria-label': 'Themes' }, S.THEME_PRESETS.map((t) => h('button', { type: 'button', class: 'ap-preset' + (sameLook(t) ? ' on' : ''), 'aria-pressed': String(sameLook(t)), title: t.note,
        onclick: () => { S.applyLook(t); drawThemes(); paint(); S.render(true); } },
        h('span', { class: 'ap-sw', style: { background: t.background, boxShadow: `inset 0 0 0 1px ${t.contour}` } }, h('i', { style: { background: t.contour } }), h('i', { style: { background: t.accent || t.contourGlow } })), h('span', { class: 'ap-pn' }, t.name)))));
    const fillMap = () => { mapBody.replaceChildren(h('h3', null, 'Contour map'), ...mapControls(fillMap)); paint(); };
    paint(); drawThemes(); fillMap();
    S._apRepaint = () => { drawThemes(); fillMap(); };
    host.replaceChildren(h('div', { class: 'sgo-modal-bg', onclick: (e) => { if (e.target === e.currentTarget) close(); } },
      h('div', { class: 'sgo-modal ap-modal', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'ap-h' },
        h('div', { class: 'ap-head' }, h('h2', { id: 'ap-h' }, 'Appearance'), h('button', { class: 'sgo-icon-btn', type: 'button', 'aria-label': 'Close', onclick: close }, icon('plus', 18))),
        h('div', { class: 'ap-layout' }, h('div', { class: 'ap-left' }, prev), h('div', { class: 'ap-right' }, themes)),
        h('div', { class: 'ap-mapbar' }, mapBody),
        h('div', { class: 'sgo-head-a sgo-mfoot' }, btn('Reset appearance', () => { S.resetAppearance(); drawThemes(); fillMap(); S.render(true); }, 'ghost', 'reload'), btn('Done', close, 'primary', 'check')))));
  };

  /** Settings card: the current look in miniature and a way into the panel. */
  function appearanceCard() {
    const P = S.prefs, known = S.THEME_PRESETS.find(sameLook), look = known || currentLook();
    return h('section', { class: 'sgo-card' }, h('h2', null, 'Appearance'),
      h('p', { class: 'sgo-muted' }, 'Pick a theme and tune the contour map. Changes apply instantly and are saved in this browser.'),
      h('div', { class: 'ap-summary' },
        h('span', { class: 'thm-prev' }, themeThumb(look, P.accent)),
        h('div', { class: 'ap-l' }, h('b', null, known ? known.name : 'Custom colours'), h('small', null, (known ? known.note : 'Your own colours') + (P.topoOn === false ? ' · Contour map off' : ''))),
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
      h('section', { class: 'sgo-card' }, h('h2', null, 'Display'),
        row('Theme', 'Light, dark, or follow your device', h('div', { class: 'sgo-seg', role: 'group', 'aria-label': 'Theme' },
          [['light', 'Light'], ['dark', 'Dark'], ['system', 'System']].map(([v, l]) => h('button', { type: 'button', class: S.themeMode() === v ? 'on' : '', 'aria-pressed': String(S.themeMode() === v), onclick: () => { S.setThemeMode(v); S.render(true); } }, l)))),
        row('Density', 'Compact tightens row and card spacing so more fits on screen', h('div', { class: 'sgo-seg', role: 'group', 'aria-label': 'Density' },
          [['comfortable', 'Comfortable'], ['compact', 'Compact']].map(([v, l]) => h('button', { type: 'button', class: (P.density || 'comfortable') === v ? 'on' : '', 'aria-pressed': String((P.density || 'comfortable') === v), onclick: () => { S.setMap({ density: v }); S.render(true); } }, l))))),
      h('section', { class: 'sgo-card' }, h('h2', null, 'Accessibility'),
        row('Text size', 'Makes everything in the app larger', h('div', { class: 'sgo-seg', role: 'group', 'aria-label': 'Text size' },
          [['', 'Default'], ['lg', 'Large'], ['xl', 'Larger']].map(([v, l]) => h('button', { type: 'button', class: (P.textSize || '') === v ? 'on' : '', 'aria-pressed': String((P.textSize || '') === v), onclick: () => { S.setA11y({ textSize: v }); S.render(true); } }, l)))),
        row('High contrast', 'Brighter text, stronger outlines and a thicker focus ring', h('div', { class: 'sgo-seg', role: 'group', 'aria-label': 'High contrast' },
          [[false, 'Off'], [true, 'On']].map(([v, l]) => h('button', { type: 'button', class: !!P.highContrast === v ? 'on' : '', 'aria-pressed': String(!!P.highContrast === v), onclick: () => { S.setA11y({ highContrast: v }); S.render(true); } }, l)))),
        row('Reduce motion', 'Turns off animations and transitions (also follows your device setting)', h('div', { class: 'sgo-seg', role: 'group', 'aria-label': 'Reduce motion' },
          [[false, 'Off'], [true, 'On']].map(([v, l]) => h('button', { type: 'button', class: !!P.reduceMotion === v ? 'on' : '', 'aria-pressed': String(!!P.reduceMotion === v), onclick: () => { S.setA11y({ reduceMotion: v }); S.render(true); } }, l))))),
      h('section', { class: 'sgo-card' }, h('h2', null, 'Profile'), row('Your name', 'Used for the dashboard greeting. Saved as you type, only in this browser. Empty uses the name Schoology gives.',
        h('input', { class: 'sgo-input', value: P.displayName || '', placeholder: (S.state.user || 'First name').trim(), maxlength: '40', 'aria-label': 'Your name',
          oninput: (e) => { P.displayName = e.target.value.trim(); S.savePrefs(); }, onchange: () => S.render(true) }))),
      appearanceCard(),
      courseRows.length ? h('section', { class: 'sgo-card' }, h('h2', null, 'Course colours'), h('p', { class: 'sgo-muted' }, 'Pick from fourteen colours, grouped by family. Used for the typographic banner and the course page.'),
        row('Colour-code assignments by course', 'Off keeps every assignment and material indicator in one clean colour. On tints each with its course colour.', seg('tagColours', [[false, 'Off'], [true, 'On']])), courseRows) : null,
      h('section', { class: 'sgo-card' }, h('h2', null, 'Data & privacy'),
        h('p', { class: 'sgo-muted' }, 'This extension only reads pages you can already see in Schoology, using your existing session. It never sees your password and sends nothing to any server. Preferences and a cache of what it read live in this browser.'),
        h('div', { class: 'sgo-head-a' }, btn('Refresh data now', () => S.hardRefresh(), 'ghost', 'reload'),
          btn('Clear cached data', async () => { await S.clearCache(); S.render(); }, 'ghost'),
          btn('Reset all settings', () => { S.resetPrefs(); S.applyTheme(); S.render(); }, 'ghost'))),
      h('section', { class: 'sgo-card' }, h('h2', null, 'Diagnostics'), h('p', { class: 'sgo-muted' }, 'What each data source returned the last time it ran. If a count is 0, that part of Schoology’s markup differs at your school; see README → Tuning selectors.'),
        h('div', { class: 'sgo-diag' }, S.state.diag.length ? S.state.diag.map((d) => h('div', { class: d.ok ? 'ok' : 'bad' }, h('b', null, d.name), h('span', null, `${d.count} found`), h('small', null, d.note))) : h('span', { class: 'sgo-muted' }, 'No runs yet.'))));
  };
})();
