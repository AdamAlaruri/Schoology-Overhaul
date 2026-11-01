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

  const tasksOnly = () => S.allItems().filter((i) => i.type !== 'event');
  const upcoming = () => tasksOnly().filter((i) => !S.isDone(i) && i.due && i.due >= Date.now()).sort((a, b) => a.due - b.due);
  const overdue = () => tasksOnly().filter(S.isPastDue).sort((a, b) => a.due - b.due);

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
  /** Simple column chart: heights are proportional to the largest value. */
  function bars(vals, labels, hi) {
    const max = Math.max(1, ...vals);
    return h('div', { class: 'sgo-cols' }, vals.map((x, i) => h('div', { class: 'sgo-col' + (i === hi ? ' hi' : ''), title: `${labels[i]}: ${x}` },
      h('div', { class: 'sgo-col-t' }, h('i', { style: { height: (x / max) * 100 + '%' } })), h('span', null, labels[i]))));
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

  /* ===================== DASHBOARD ===================== */
  /* Two lists only (Overdue, Upcoming), 24-hour times in the student's local timezone, and a compact side column. */
  const dui = () => (S.ui.dash = S.ui.dash || { filter: 'all', more: {}, history: false, ann: {} });
  const mondayOf = (now) => S.sod(now) - ((new Date(now).getDay() + 6) % 7) * S.DAY;
  const mon3 = (ts) => S.MONTHS[new Date(ts).getMonth()].slice(0, 3);
  /** "Today · 14:30", "Tomorrow · 09:00", "Nov 4 · 16:00". Items without a real time show the date only (no invented time). */
  const dateLabel = (it, now, absolute) => {
    const day = !absolute && S.sameDay(it.due, now) ? 'Today' : !absolute && S.sameDay(it.due, now + S.DAY) ? 'Tomorrow' : `${mon3(it.due)} ${new Date(it.due).getDate()}`;
    return it.timed ? `${day} · ${S.fmtTime(it.due)}` : day;
  };
  const overdueBy = (ms) => {
    const m = Math.floor(ms / 6e4), hr = Math.floor(m / 60), d = Math.floor(hr / 24);
    return d ? `${d}d ${hr % 24}h overdue` : hr ? `${hr}h ${m % 60}m overdue` : `${Math.max(1, m)}m overdue`;
  };
  /** Changes whenever an item crosses a boundary (becomes overdue, today, tomorrow). The app polls it to refresh the list as time passes. */
  S.dashStamp = () => {
    const now = Date.now();
    return tasksOnly().filter((i) => !S.isDone(i)).map((i) => i.key + (S.isPastDue(i) ? 'o' : '') + (i.due ? (S.sameDay(i.due, now) ? 't' : S.sameDay(i.due, now + S.DAY) ? 'm' : '') : '')).join('|');
  };

  /** One compact assignment row. Schoology items open their original page; the student's own items open the detail view. */
  function taskRow(it, mode, now) {
    const done = S.isDone(it);
    const href = it.manual ? detailHref(it) : it.url || detailHref(it);
    const when = mode === 'overdue'
      ? h('div', { class: 'tk-when od' }, h('span', { class: 'tk-clock' }, icon('clock', 13), dateLabel(it, now, true)), h('small', null, overdueBy(now - it.due)))
      : h('div', { class: 'tk-when' }, it.due ? h('span', { class: 'tk-clock' }, icon('clock', 13), dateLabel(it, now, false)) : h('span', { class: 'tk-clock none' }, 'No deadline'));
    const acts = h('div', { class: 'tk-acts' },
      h('a', { class: 'sgo-act', href: detailHref(it), title: 'View details', 'aria-label': 'View details: ' + it.title }, icon('right', 15)),
      it.manual && h('button', { class: 'sgo-act', title: 'Edit', 'aria-label': 'Edit ' + it.title, onclick: () => S.openNewAssignment(it) }, icon('edit', 15)),
      it.manual
        ? h('button', { class: 'sgo-act', title: 'Delete', 'aria-label': 'Delete ' + it.title, onclick: () => S.openConfirm({ title: 'Delete this task?',
            body: 'This removes it from your personal tracker only. Nothing changes in Schoology.', ok: 'Delete', danger: true,
            onOk: () => { delete S.prefs.manual[it.key]; S.savePrefs(); } }) }, icon('trash', 15))
        : h('button', { class: 'sgo-act', title: 'Remove from my tracker (Schoology keeps it)', 'aria-label': 'Remove ' + it.title + ' from my tracker', onclick: () => askExclude(it) }, icon('eyeoff', 15)));
    return h('div', { class: `tk ${mode}${done ? ' is-done' : ''}`, style: { '--c': S.colorOf(it) } },
      h('button', { class: 'sgo-check' + (done ? ' on' : ''), title: done ? 'Mark as not done' : 'Mark complete', 'aria-label': (done ? 'Mark not done: ' : 'Mark complete: ') + it.title, 'aria-pressed': String(done), onclick: () => toggleDone(it) }, icon('check', 14)),
      h('div', { class: 'tk-main' }, h('a', { class: 'tk-title', href }, it.title),
        h('div', { class: 'tk-course' }, h('span', { class: 'trow-dot' }), S.cn(it.courseId, it.courseName) || 'Course')),
      when, acts);
  }

  V.dashboard = () => {
    const now = Date.now(), ui = dui(), t = tasksOnly(), active = t.filter((i) => !S.isDone(i) && !S.isStale(i));
    S._dashStamp = S.dashStamp();
    const name = (S.prefs.displayName || S.state.user || '').split(' ')[0];
    const mon = mondayOf(now), nextMon = mon + 7 * S.DAY;
    const loadingFirst = !S.state.loaded && !t.length; // first ever load with nothing cached yet: show placeholders, not empty states

    /* lists */
    const overdue = active.filter(S.isOverdue).sort((a, b) => a.due - b.due); // only what Schoology lists as missing
    const upcomingAll = active.filter((i) => !S.isPastDue(i)).sort((a, b) => (a.due ?? 9e15) - (b.due ?? 9e15));
    const dueToday = upcomingAll.filter((i) => i.due && S.sameDay(i.due, now));
    const upcoming = ui.filter === 'today' ? dueToday : upcomingAll;

    /* header */
    const review = S.unreviewedItems().length;
    const head = h('header', { class: 'dh' },
      h('div', null,
        h('h1', null, `${S.greeting()}${name ? ', ' + name : ''}`),
        h('p', null, new Date(now).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }))),
      h('div', { class: 'dh-tools' },
        h('button', { class: 'sgo-icon-btn bell', title: review ? `${review} to review` : 'Nothing to review', 'aria-label': review ? `${review} items to review` : 'Nothing to review', onclick: () => S.go(assignmentsHref()) },
          icon('bell', 18), review ? h('span', { class: 'bell-n' }, review > 9 ? '9+' : review) : null),
        btn('New task', () => S.openNewAssignment(null), 'primary', 'plus')));

    /* four overview cards; the first three filter the list */
    const ov = (key, label, n, ic, hint) => h('button', { class: 'ov' + (ui.filter === key ? ' on' : ''), 'aria-pressed': String(ui.filter === key),
      onclick: () => { ui.filter = ui.filter === key && key !== 'all' ? 'all' : key; S.render(true); } },
      h('span', { class: 'ov-top' }, icon(ic, 16), h('span', null, label)), h('b', { class: key === 'overdue' && n ? 'bad' : '' }, n), h('small', null, hint));
    const cards = h('div', { class: 'ovs' },
      ov('all', 'Outstanding', active.length, 'tasks', 'All unfinished'),
      ov('overdue', 'Overdue', overdue.length, 'alert', overdue.length ? 'Needs attention' : 'None'),
      ov('today', 'Due today', dueToday.length, 'calendar', dueToday.length ? 'Still to do today' : 'Nothing today'));

    /* centerpiece: Overdue, then Upcoming. Nothing else. */
    const list = (key, label, arr, empty, mode) => {
      const exp = !!ui.more[key], shown = exp ? arr : arr.slice(0, 8);
      return h('section', { class: 'bk bk-' + key },
        h('div', { class: 'bk-h' }, h('span', null, label), h('span', { class: 'bk-n' }, arr.length)),
        arr.length ? h('div', { class: 'bk-list' }, shown.map((it) => taskRow(it, mode, now))) : h('div', { class: 'bk-empty' }, empty),
        arr.length > 8 ? h('button', { class: 'bk-more', onclick: () => { ui.more[key] = !exp; S.render(true); } }, exp ? 'Show fewer' : `Show ${arr.length - 8} more`) : null);
    };
    const completed = t.filter(S.isDone).sort((a, b) => (+S.prefs.done[b.key] || 0) - (+S.prefs.done[a.key] || 0));
    const history = completed.length ? h('section', { class: 'bk bk-done' },
      h('button', { class: 'bk-toggle', 'aria-expanded': String(!!ui.history), onclick: () => { ui.history = !ui.history; S.render(true); } },
        h('span', null, 'Completed history'), h('span', { class: 'bk-n' }, completed.length)),
      ui.history ? h('div', { class: 'bk-list' }, completed.slice(0, 30).map((it) => taskRow(it, 'done', now))) : null) : null;
    const main = h('section', { class: 'main-sec' },
      h('div', { class: 'main-h' },
        h('div', { class: 'main-t' }, h('h2', null, 'To-do'),
          ui.filter !== 'all' ? h('button', { class: 'chip', onclick: () => { ui.filter = 'all'; S.render(true); } }, (ui.filter === 'overdue' ? 'Overdue only' : 'Due today') + '  ×') : null)),
      loadingFirst ? h('div', { class: 'sk-list', 'aria-busy': 'true', 'aria-label': 'Loading assignments' }, [0, 1, 2, 3].map(() => h('div', { class: 'sk-row' }))) : ui.filter !== 'today' ? list('overdue', 'Overdue', overdue, 'Nothing overdue.', 'overdue') : null,
      !loadingFirst && ui.filter !== 'overdue' ? list('upcoming', 'Upcoming', upcoming, ui.filter === 'today' ? 'Nothing due today.' : 'Nothing coming up.', 'upcoming') : null,
      history);

    /* right column: schedule, announcements, events. Only what Schoology provides; empty states otherwise. */
    const schedule = h('section', { class: 'side-card' }, h('h3', null, 'Daily schedule'),
      h('div', { class: 'side-empty' }, 'Schoology does not share class times with this extension, so the current and next class cannot be shown.'));
    const anns = (S.state.announcements || []).slice(0, 5);
    const annCard = h('section', { class: 'side-card' }, h('h3', null, 'Announcements'),
      anns.length ? anns.map((a, idx) => {
        const id = (a.id || '') + ':' + idx, open = !!ui.ann[id];
        return h('div', { class: 'ann' },
          h('button', { class: 'ann-btn', 'aria-expanded': String(open), onclick: () => { ui.ann[id] = !open; S.render(true); } },
            h('div', { class: 'ann-t' }, a.body.split(/(?<=[.!?])\s/)[0].slice(0, 80)),
            h('div', { class: 'ann-m' }, [a.author, a.courseName, a.time].filter(Boolean).join(' · '))),
          h('p', { class: open ? 'ann-full' : 'ann-p' }, open ? a.body : a.body.slice(0, 110)));
      }) : h('div', { class: 'side-empty' }, 'Announcements appear here after your Schoology home feed loads.'));
    const kind = (i) => i.type === 'event' ? 'Event' : /quiz/i.test(i.title) ? 'Quiz' : 'Exam';
    const events = active.filter((i) => (i.type === 'event' || i.type === 'assessment') && i.due && i.due >= now && i.due < now + 14 * S.DAY).sort((a, b) => a.due - b.due).slice(0, 5);
    const eventCard = h('section', { class: 'side-card' }, h('h3', null, 'Upcoming events'),
      events.length ? events.map((i) => h('a', { class: 'ev', href: i.url || detailHref(i) },
        h('span', { class: 'ev-k' }, kind(i)), h('span', { class: 'ev-t' }, i.title), h('span', { class: 'ev-d' }, dateLabel(i, now, false)))) : h('div', { class: 'side-empty' }, 'No exams, quizzes or events in the next 14 days.'));

    /* insights */
    const doneWeek = Object.values(S.prefs.done || {}).filter((ts) => typeof ts === 'number' && ts >= mon && ts < nextMon).length;
    const outWeek = active.filter((i) => i.due && i.due >= mon && i.due < nextMon).length;
    const pct = doneWeek + outWeek ? Math.round((doneWeek / (doneWeek + outWeek)) * 100) : null;
    const names = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const perDay = names.map((_, i) => active.filter((x) => x.due && S.sameDay(x.due, mon + i * S.DAY)).length), maxDay = Math.max(1, ...perDay);
    const grades = (S.state.grades || []).slice(0, 6);
    const insights = h('section', { class: 'ins-sec' }, h('div', { class: 'main-h' }, h('h2', null, 'Insights')),
      h('div', { class: 'ins-grid' },
        h('div', { class: 'ins-card' }, h('span', null, 'Completion rate this week'), h('b', null, pct == null ? '—' : pct + '%'),
          h('small', null, `${doneWeek} completed · ${outWeek} still due`), h('div', { class: 'sgo-track' }, h('i', { style: { width: (pct || 0) + '%' } }))),
        h('div', { class: 'ins-card' }, h('span', null, 'Workload this week'),
          h('div', { class: 'wk-days' }, names.map((n, i) => h('div', { class: 'wk-d' + (S.sameDay(mon + i * S.DAY, now) ? ' today' : ''), title: `${n}: ${perDay[i]} due` },
            h('span', null, n[0]), h('div', { class: 'wk-col' }, h('i', { style: { height: (perDay[i] / maxDay) * 100 + '%' } }))))))));

    return h('div', { class: 'sgo-page dash5' }, head, cards, h('div', { class: 'dash-cols' }, main, h('aside', { class: 'dash-aside' }, schedule, annCard, eventCard)), insights);
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
    return h('a', { class: 'sgo-ev' + (S.isDone(i) ? ' done' : ''), href: detailHref(i), style: { '--c': S.colorOf(i) }, title: `${i.title} — ${S.cn(i.courseId, i.courseName)}` }, i.timed ? h('em', null, S.fmtTime(i.due)) : null, i.title);
  }
  function monthGrid(y, m, mini) {
    const first = new Date(y, m, 1), start = first.getTime() - first.getDay() * S.DAY, today = S.sod(Date.now());
    const cells = [...Array(42)].map((_, i) => {
      const ts = new Date(start + i * S.DAY); ts.setHours(12); const t = ts.getTime(), its = itemsOn(t), other = ts.getMonth() !== m;
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
    const wkStart = S.sod(c.d) - d.getDay() * S.DAY;
    let title, body;
    if (c.m === 'month') { title = `${S.MONTHS[d.getMonth()]} ${d.getFullYear()}`; body = monthGrid(d.getFullYear(), d.getMonth()); }
    else if (c.m === 'week') {
      title = `${S.fmtDate(wkStart)} – ${S.fmtDate(wkStart + 6 * S.DAY)}`;
      body = h('div', { class: 'sgo-weekview' }, [...Array(7)].map((_, i) => { const t = wkStart + i * S.DAY + 12 * 36e5, its = itemsOn(t);
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
      h('div', { class: 'sgo-toolbar' }, h('div', { class: 'sgo-calnav' }, h('button', { class: 'sgo-icon-btn', onclick: () => step(-1), 'aria-label': 'Previous' }, icon('left', 18)), h('button', { class: 'sgo-btn ghost', onclick: () => setCal({ d: Date.now() }) }, 'Today'), h('button', { class: 'sgo-icon-btn', onclick: () => step(1), 'aria-label': 'Next' }, icon('right', 18)), h('h2', null, title)), seg),
      body);
  };

  /* ===================== GRADES ===================== */
  V.grades = () => {
    const g = S.state.grades, pctText = (p) => (p == null ? '—' : (Math.round(p * 100) / 100) + '%');
    const itemPct = (it) => (it.earned != null && it.possible ? Math.round((it.earned / it.possible) * 1000) / 10 : null);
    const num = (n) => (n == null ? '—' : String(Math.round(n * 100) / 100));
    const when = (txt) => { const p = txt && S.parseDue(txt); return p ? `${mon3(p.ts)} ${new Date(p.ts).getDate()}` + (p.timed ? ' · ' + S.fmtTime(p.ts) : '') : txt || '—'; };
    const courseBlock = (c, idx) => {
      const key = c.gradebookId || c.courseName, color = S.courseColor(c.courseId, c.courseName);
      const open = key in S.ui.openGrade ? S.ui.openGrade[key] : idx === 0;
      // Schoology also lists an empty "(no grading period)" group; only show periods that actually contain graded entries.
      const periods = c.periods.filter((p) => p.categories.some((cat) => cat.items.length)), shown = periods.length ? periods : c.periods;
      const periodNames = shown.map((p) => p.name).filter(Boolean);
      const sub = [periodNames.join(', '), c.teacher].filter(Boolean).join(' · ');
      const head = h('button', { class: 'gr2-h', 'aria-expanded': String(open), onclick: () => { S.ui.openGrade[key] = !open; S.render(true); } },
        h('span', { class: 'gr2-dot', style: { background: color } }),
        h('span', { class: 'gr2-id' }, h('span', { class: 'gr2-name' }, S.cn(c.courseId, c.courseName)), sub ? h('span', { class: 'gr2-sub' }, sub) : null),
        h('span', { class: 'gr2-letter' }, c.letter || '—'), h('span', { class: 'gr2-pct' }, pctText(c.percent)),
        h('span', { class: 'gr2-chev' + (open ? ' open' : '') }, icon('right', 14)));
      let body = null;
      if (open) {
        const blocks = shown.map((p) => {
          const items = p.categories.flatMap((cat) => cat.items.map((it) => ({ it, cat })));
          return h('div', { class: 'gr2-period' },
            shown.length > 1 ? h('div', { class: 'gr2-ph' }, h('b', null, p.name || 'Grading period'), h('span', null, `${p.letter || ''} ${pctText(p.percent)}`.trim())) : null,
            p.categories.length ? h('div', { class: 'gr2-cats' }, p.categories.filter((cat) => cat.items.length && (cat.weight != null || cat.grade)).map((cat) => h('span', { class: 'gr2-cat' },
              h('b', null, cat.name), cat.weight != null ? h('i', null, cat.weight + '% of grade') : null, h('span', null, cat.letter ? `${cat.letter} ${pctText(cat.percent)}` : '—')))) : null,
            items.length ? h('div', { class: 'gr2-scroll' }, h('table', { class: 'gr2-table' },
              h('thead', null, h('tr', null, ['Assignment', 'Category', 'Date', 'Earned', 'Possible', '%', 'Status'].map((t, i) => h('th', { class: i >= 3 && i <= 5 ? 'n' : '' }, t)))),
              h('tbody', null, items.map(({ it, cat }) => h('tr', null,
                h('td', { class: 'gr2-t' }, it.title), h('td', { class: 'gr2-c' }, cat.name), h('td', { class: 'gr2-d', title: it.dueText }, when(it.dueText)),
                h('td', { class: 'n' }, num(it.earned)), h('td', { class: 'n' }, num(it.possible)), h('td', { class: 'n' }, itemPct(it) == null ? '—' : itemPct(it) + '%'),
                h('td', null, h('span', { class: 'gr2-st st-' + it.status }, it.statusLabel))))))) : h('div', { class: 'gr2-none' }, 'No graded items yet.'));
        });
        body = h('div', { class: 'gr2-body' }, blocks.length ? blocks : h('div', { class: 'gr2-none' }, 'Schoology has not published grades for this course yet.'));
      }
      return h('section', { class: 'gr2-course' + (open ? ' open' : '') }, head, body);
    };
    return h('div', { class: 'sgo-page' }, pageHead('Grades', g.length ? `${g.length} ${g.length === 1 ? 'course' : 'courses'} · course, period and category grades are shown as Schoology reports them` : 'Shown as Schoology reports them', [btn('Refresh', () => S.hardRefresh(), 'ghost', 'reload')]),
      g.length ? h('div', { class: 'gr2-list' }, g.map(courseBlock))
        : empty('No grades loaded', S.state.loading ? 'Loading…' : 'Grades could not be read from Schoology’s page. Use Classic view to see your gradebook, and check Settings → Diagnostics.'),
      g.length ? h('p', { class: 'sgo-note' }, 'The % column for each assignment is points earned divided by points possible. Nothing else is calculated here.') : null);
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
  function askExclude(it) {
    S.openConfirm({ title: 'Remove from your dashboard?',
      body: 'Do you want to remove this assignment from your personal dashboard? It will no longer count toward your workload or analytics, but it will remain in Schoology.',
      ok: 'Confirm removal', danger: true, onOk: () => S.decide(it.key, 'exclude') });
  }
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

  V.settings = () => {
    const P = S.prefs, set = (k, v) => { P[k] = v;  S.savePrefs(); S.applyTheme(); S.render(true); };
    const row = (t, s, ctl) => h('div', { class: 'sgo-set' }, h('div', null, h('b', null, t), s && h('small', null, s)), ctl);
    const seg = (key, opts) => h('div', { class: 'sgo-seg' }, opts.map(([v, l]) => h('button', { class: P[key] === v ? 'on' : '', onclick: () => set(key, v) }, l)));
    const swatches = h('div', { class: 'sgo-swatches' }, S.PALETTE.map((c) => h('button', { class: 'sgo-sw' + (P.accent === c ? ' on' : ''), style: { background: c }, 'aria-label': c, onclick: () => set('accent', c) })),
      h('label', { class: 'sgo-color' }, h('input', { type: 'color', value: P.accent, onchange: (e) => set('accent', e.target.value) })));
    const courseRows = S.orderedCourses().map((c) => h('div', { class: 'sgo-set slim' }, h('span', null, dot(S.courseColor(c.id, c.name)), S.cn(c.id, c.name)),
      h('label', { class: 'sgo-color' }, h('input', { type: 'color', value: S.courseColor(c.id, c.name), onchange: (e) => { P.courseColors[c.id] = e.target.value; S.savePrefs(); S.render(true); } }))));
    return h('div', { class: 'sgo-page narrow' }, pageHead('Settings', 'Everything is stored only in this browser'),
      h('section', { class: 'sgo-card' }, h('h2', null, 'Profile'), row('Your name', 'Used for the dashboard greeting. Stored only in this browser.',
        h('input', { class: 'sgo-input', value: P.displayName || '', placeholder: 'First name', onchange: (e) => set('displayName', e.target.value.trim()) }))),
      h('section', { class: 'sgo-card' }, h('h2', null, 'Appearance'), row('Theme', null, seg('theme', [['system', 'System'], ['light', 'Light'], ['dark', 'Dark']])), row('Accent colour', null, swatches)),
      h('section', { class: 'sgo-card' }, h('h2', null, 'Course names'), row('Tidy names automatically', 'Turns “(MATH&151) CALCULUS I /AP CALC AB: (S1) Crane, A” into “AP Calculus AB”. Your own renames always win.', seg('cleanNames', [[true, 'On'], [false, 'Off']]))),
      nameFixesCard(),
      h('section', { class: 'sgo-card' }, h('h2', null, 'Layout'), null,
        null),
      courseRows.length ? h('section', { class: 'sgo-card' }, h('h2', null, 'Course colours'), courseRows) : null,
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
