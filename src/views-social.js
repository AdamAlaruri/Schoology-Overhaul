/* Inbox, Groups and History screens. Real data only: what Schoology lists, plus pages opened in this extension. */
(() => {
  const S = window.SGO;
  const V = S.views;
  if (!V || V.inbox) return;
  const { h, icon } = S;

  const empty = (title, sub) => h('div', { class: 'sgo-empty' }, h('div', { class: 'sgo-empty-t' }, title), sub && h('div', { class: 'sgo-empty-s' }, sub));
  const SKELETON = (n = 4) => h('div', { class: 'sk-list', 'aria-busy': 'true', 'aria-label': 'Loading' }, Array.from({ length: n }, () => h('div', { class: 'sk-row' })));
  const head = (title, sub, actions) => h('div', { class: 'sgo-head' }, h('div', null, h('h1', null, title), sub && h('p', null, sub)), actions && h('div', { class: 'sgo-head-a' }, actions));
  const classic = (path) => path + (path.includes('?') ? '&' : '?') + 'sgo=classic'; // Schoology's own page, on purpose
  const initials = (s) => String(s || '?').split(/[\s,]+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase() || '?';
  const stamp = (ts, fallback) => {
    if (ts == null) return fallback || '';
    const d = new Date(ts), now = Date.now();
    if (S.sameDay(ts, now)) return S.fmtTime(ts);
    return S.sod(now) - S.sod(ts) < 6 * S.DAY ? S.WEEKDAYS[d.getDay()] : `${S.MONTHS[d.getMonth()].slice(0, 3)} ${d.getDate()}`;
  };
  /** Shown while a request is running, when it failed, or when the Schoology session has ended. null when there is data to show. */
  function stateBlock(res, what, key) {
    if (res.data) return null;
    if (res.loading) return SKELETON(5);
    if (S.state.session === 'expired' || /expired/.test(res.error)) return empty('Sign in to see ' + what, 'Your Schoology session has ended. Sign in again, then come back.');
    return h('div', { class: 'sgo-empty', role: 'alert' }, h('div', { class: 'sgo-empty-t' }, `Couldn’t load ${what}`), h('div', { class: 'sgo-empty-s' }, 'Schoology did not respond with the expected page. ' + res.error),
      h('div', { class: 'sgo-head-a', style: { justifyContent: 'center', marginTop: '12px' } }, h('button', { class: 'sgo-btn', type: 'button', onclick: () => S.retryResource(key) }, 'Try again')));
  }
  const searchBox = (value, label, onInput, fk) => h('input', { class: 'sgo-input', type: 'search', value, placeholder: label, 'aria-label': label, dataset: { fk }, oninput: (e) => onInput(e.target.value) });

  /* ===================== INBOX ===================== */
  S.ui.mail = { q: '', f: 'all' };
  const matches = (m, q) => !q || (m.subject + ' ' + m.snippet + ' ' + m.people + ' ' + m.tag).toLowerCase().includes(q.toLowerCase());

  function readPane(id) {
    if (!id) return h('section', { class: 'ib-read ib-none' }, empty('Select a message', 'Pick a conversation on the left to read it here.'));
    const key = 'thread:' + id, t = S.mailThread(id), blk = stateBlock(t, 'this message', key);
    if (blk) return h('section', { class: 'ib-read' }, h('a', { class: 'ib-back', href: '/messages' }, icon('left', 16), 'Inbox'), blk);
    S.mailMarkRead(id);
    const d = t.data;
    return h('section', { class: 'ib-read' },
      h('a', { class: 'ib-back', href: '/messages' }, icon('left', 16), 'Inbox'),
      h('div', { class: 'ib-rh' }, d.tag ? h('span', { class: 'ib-tag' }, S.cleanName(d.tag) || d.tag) : null, h('h2', null, d.subject), d.people ? h('p', null, d.people) : null),
      h('div', { class: 'ib-thread' }, d.rows.map((r) => h('article', { class: 'ib-msg' },
        h('div', { class: 'ib-mh' }, h('span', { class: 'ib-av' }, initials(r.name)), h('b', null, r.name || 'Unknown sender'), h('span', null, r.ts != null ? S.fmtDate(r.ts, true) + ' · ' + S.fmtTime(r.ts) : r.when)),
        h('div', { class: 'sgo-desc ib-body' }, S.sanitize(r.html)),
        r.files.length ? h('ul', { class: 'ib-files' }, r.files.map((f) => h('li', null, h('a', { href: f.href, target: '_blank', rel: 'noopener' }, icon('file', 15), f.name)))) : null))),
      h('div', { class: 'sgo-head-a' }, h('a', { class: 'sgo-btn primary', href: classic('/messages/view/' + id), target: '_blank', rel: 'noopener' }, icon('external', 16), 'Reply in Schoology')),
      h('p', { class: 'sgo-note' }, 'Replies are written on Schoology’s own page so nothing about your messages changes. Opening a message marks it read, as it does in Schoology.'));
  }

  V.inbox = () => {
    const p = location.pathname.replace(/\/+$/, ''), box = p === '/messages/sent' ? 'sent' : 'inbox', vm = /^\/messages\/view\/(\d+)$/.exec(p), id = vm ? vm[1] : '';
    const pane = readPane(id); // first: opening a message marks it read in the cached list drawn below
    const ui = S.ui.mail, key = 'mail:' + box, res = S.mailList(box);
    const items = res.data || [], unread = items.filter((m) => m.unread).length;
    const shown = items.filter((m) => matches(m, ui.q) && (ui.f !== 'unread' || m.unread));
    const tab = (k, label, href) => h('a', { href, 'aria-current': box === k && !id ? 'page' : null }, label);
    const listBody = stateBlock(res, 'your messages', key) || (shown.length
      ? h('ul', { class: 'ib-items' }, shown.map((m) => h('li', null, h('a', { class: 'ib-row' + (m.unread ? ' unread' : '') + (m.id === id ? ' on' : ''), href: '/messages/view/' + m.id, 'aria-current': m.id === id ? 'true' : null },
        h('span', { class: 'ib-av' }, initials(m.people)),
        h('span', { class: 'ib-rt' }, h('span', { class: 'ib-top' }, h('b', null, m.people || (box === 'sent' ? 'Sent' : 'Unknown')), h('time', null, stamp(m.ts, m.when))),
          h('span', { class: 'ib-sub' }, m.unread ? h('i', { class: 'ib-dot', 'aria-label': 'Unread' }) : null, m.subject),
          h('span', { class: 'ib-snip' }, (m.tag ? (S.cleanName(m.tag) || m.tag) + ' — ' : '') + m.snippet))))))
      : empty(items.length ? 'No messages match' : box === 'sent' ? 'No sent messages' : 'Your inbox is empty', items.length ? 'Try a different search or filter.' : 'Messages from teachers and classmates show up here.'));
    const redo = () => S.render(true);
    return h('div', { class: 'sgo-page ib-page' }, head('Inbox', 'Your Schoology messages', [h('a', { class: 'sgo-btn primary', href: '/messages/new' }, icon('plus', 16), 'New message')]),
      h('div', { class: 'ib' + (id ? ' has-sel' : '') },
        h('section', { class: 'ib-list', 'aria-label': 'Messages' },
          h('nav', { class: 'ib-tabs', 'aria-label': 'Mailbox' }, tab('inbox', 'Inbox', '/messages'), tab('sent', 'Sent', '/messages/sent')),
          searchBox(ui.q, 'Search messages', (v) => { ui.q = v; redo(); }, 'ib-q'),
          h('div', { class: 'sgo-chips' }, [['all', 'All', items.length], ['unread', 'Unread', unread]].map(([k, l, n]) => h('button', { class: 'sgo-chip' + (ui.f === k ? ' on' : ''), type: 'button', 'aria-pressed': String(ui.f === k), onclick: () => { ui.f = k; redo(); } }, l, h('span', null, n)))),
          listBody, items.length ? h('p', { class: 'sgo-note' }, `Showing the ${items.length} messages Schoology lists.`) : null),
        pane));
  };

  /* ===================== GROUPS ===================== */
  S.ui.groups = { q: '', open: {} };
  const updateList = (id) => {
    const key = 'gfeed:' + id, f = S.groupFeed(id), blk = stateBlock(f, 'updates', key);
    if (blk) return h('div', { class: 'gp-ups' }, f.loading ? SKELETON(2) : blk);
    return f.data.length ? h('ul', { class: 'an-list gp-ups' }, f.data.slice(0, 4).map((a) => h('li', { class: 'an' }, h('div', { class: 'an-h' }, h('b', null, a.author || 'Update'), h('span', null, a.time)), h('p', { class: 'gp-body' }, a.body))))
      : h('p', { class: 'sgo-muted gp-ups' }, 'No recent updates in this group.');
  };
  V.groups = () => {
    const ui = S.ui.groups, res = S.groupList(), all = res.data || [];
    const shown = all.filter((g) => !ui.q || (g.name + ' ' + g.info).toLowerCase().includes(ui.q.toLowerCase()));
    const card = (g, i) => {
      const open = ui.open[g.id] != null ? ui.open[g.id] : i < 3; // the first few show their latest updates right away
      return h('article', { class: 'gp-card' },
        h('div', { class: 'gp-h' }, g.img ? h('img', { class: 'gp-av', src: g.img, alt: '' }) : h('span', { class: 'gp-av' }, initials(g.name)),
          h('div', null, h('a', { class: 'gp-name', href: '/group/' + g.id }, g.name), g.info ? h('p', null, g.info) : null)),
        h('button', { class: 'sgo-btn ghost gp-tog', type: 'button', 'aria-expanded': String(open), onclick: () => { ui.open[g.id] = !open; S.render(true); } }, open ? 'Hide updates' : 'Show updates'),
        open ? updateList(g.id) : null,
        h('div', { class: 'sgo-head-a' }, h('a', { class: 'sgo-btn ghost', href: '/group/' + g.id }, icon('external', 15), 'Open group and resources')));
    };
    const body = stateBlock(res, 'your groups', 'groups') || (shown.length ? h('div', { class: 'gp-grid' }, shown.map(card)) : empty(all.length ? 'No groups match' : 'You are not in any groups', all.length ? 'Try a different search.' : 'Groups you join in Schoology appear here.'));
    return h('div', { class: 'sgo-page' }, head('Groups', 'Groups you belong to in Schoology', [h('a', { class: 'sgo-btn ghost', href: classic('/groups') }, 'Join or manage groups')]),
      all.length > 3 ? h('div', { class: 'sgo-toolbar' }, searchBox(ui.q, 'Search groups', (v) => { ui.q = v; S.render(true); }, 'gp-q')) : null, body);
  };

  /* ===================== HISTORY ===================== */
  S.ui.hist = { q: '', f: 'all' };
  const KIND = { course: ['book', 'Course'], assignment: ['notepad', 'Assignment'], post: ['mega', 'Post'] };
  V.history = () => {
    const ui = S.ui.hist, mine = (S.prefs.history || []).map((e) => ({ kind: e.kind, title: e.title, href: e.href, ts: e.ts, local: true }));
    const posts = (S.state.announcements || []).map((a) => ({ kind: 'post', title: a.body, who: a.author, where: S.cn(a.courseId, a.courseName) || a.courseName, href: a.url, ts: S.parseStamp(a.time), when: a.time }));
    const q = ui.q.toLowerCase(), pool = (ui.f === 'opened' ? mine : ui.f === 'posts' ? posts : [...mine, ...posts]).filter((x) => !q || (x.title + ' ' + (x.who || '') + ' ' + (x.where || '')).toLowerCase().includes(q));
    pool.sort((a, b) => (b.ts ?? -1) - (a.ts ?? -1));
    const groups = new Map();
    pool.forEach((x) => { const k = x.ts == null ? 'Earlier' : S.sameDay(x.ts, Date.now()) ? 'Today' : S.sameDay(x.ts, Date.now() - S.DAY) ? 'Yesterday' : S.fmtDate(x.ts, true); (groups.get(k) || groups.set(k, []).get(k)).push(x); });
    const row = (x) => {
      const [ic, label] = KIND[x.kind] || KIND.post, inner = [h('span', { class: 'hs-ic' }, icon(ic, 17)),
        h('span', { class: 'hs-t' }, h('b', null, x.kind === 'post' ? (x.who || 'Update') : x.title), h('span', null, x.kind === 'post' ? [x.where, x.title].filter(Boolean).join(' — ') : label)),
        h('time', null, x.ts != null ? S.fmtTime(x.ts) : x.when || '')];
      return h('li', null, x.href ? h('a', { class: 'hs-row', href: x.href }, inner) : h('div', { class: 'hs-row' }, inner));
    };
    const loadingFeed = S.state.loading && !S.state.announcements.length;
    const counts = { all: mine.length + posts.length, opened: mine.length, posts: posts.length };
    return h('div', { class: 'sgo-page narrow' }, head('History', 'Recent activity from Schoology and pages you opened here', mine.length ? [h('button', { class: 'sgo-btn ghost', type: 'button', onclick: () => S.openConfirm({ title: 'Clear opened pages?', body: 'This removes the list of pages you opened in this extension. Posts from Schoology are not affected.', ok: 'Clear', danger: true, onOk: () => S.clearHistory() }) }, icon('trash', 15), 'Clear opened pages')] : null),
      h('div', { class: 'sgo-toolbar' }, searchBox(ui.q, 'Search history', (v) => { ui.q = v; S.render(true); }, 'hs-q'),
        h('div', { class: 'sgo-chips' }, [['all', 'All'], ['opened', 'Opened here'], ['posts', 'Posts']].map(([k, l]) => h('button', { class: 'sgo-chip' + (ui.f === k ? ' on' : ''), type: 'button', 'aria-pressed': String(ui.f === k), onclick: () => { ui.f = k; S.render(true); } }, l, h('span', null, counts[k]))))),
      loadingFeed ? SKELETON(5) : groups.size ? [...groups.entries()].map(([day, xs]) => h('section', { class: 'sgo-sec' }, h('h3', null, day, h('span', null, xs.length)), h('ul', { class: 'rs-list' }, xs.map(row))))
        : empty(q ? 'Nothing matches your search' : 'No activity yet', 'Posts from your classes appear here, and pages you open in this extension are listed as you go.'),
      h('p', { class: 'sgo-note' }, 'Schoology does not share a browsing history, so this lists the posts in your Recent Activity feed and the course pages you opened in this extension. The opened list is stored only in this browser.'));
  };
})();
