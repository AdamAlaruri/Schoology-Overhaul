/* Inbox and Groups screens. Real data only: what Schoology lists. */
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
  S.ui.mail = { q: '', f: 'all', drafts: {}, send: {} };
  const matches = (m, q) => !q || (m.subject + ' ' + m.snippet + ' ' + m.people + ' ' + m.tag).toLowerCase().includes(q.toLowerCase());

  /** Write a message here; Schoology delivers it. Text is kept per conversation while the page is open, so nothing is lost on a redraw. */
  function composer(key, id) {
    const ui = S.ui.mail, d = ui.drafts[key] || (ui.drafts[key] = { to: '', subject: '', body: '' }), st = ui.send[key] || {}, reply = !!id, busy = st.state === 'sending';
    const field = (label, name, ph, big) => h('label', { class: 'cm-f' }, h('span', null, label), h(big ? 'textarea' : 'input', Object.assign({ class: 'sgo-input' + (big ? ' cm-body' : ''), name, placeholder: ph, disabled: busy, rows: 7, dataset: { fk: 'cm-' + name }, oninput: (e) => { d[name] = e.target.value; if (st.state === 'error') { st.state = ''; } } }, big ? {} : { type: 'text', value: d[name] })));
    const ta = field(reply ? 'Reply' : 'Message', 'body', reply ? 'Write your reply…' : 'Write your message…', true); ta.querySelector('textarea').value = d.body;
    const send = async () => {
      const bad = S.checkDraft(d, reply); if (bad) { ui.send[key] = { state: 'error', msg: bad }; S.render(true); return; }
      ui.send[key] = { state: 'sending' }; S.render(true);
      try {
        await S.sendMessage({ id, to: d.to, subject: d.subject, body: d.body });
        ui.drafts[key] = { to: '', subject: '', body: '' }; ui.send[key] = { state: 'sent', msg: reply ? 'Reply sent through Schoology.' : 'Message sent through Schoology.' };
        if (reply) S.render(true); else { S.go('/messages/sent'); }
      } catch (e) { ui.send[key] = { state: 'error', msg: String(e.message || e) }; S.render(true); }
    };
    return h('form', { class: 'cm', onsubmit: (e) => { e.preventDefault(); if (!busy) send(); } },
      reply ? null : [field('To', 'to', 'Name of the person, as it appears in Schoology'), field('Subject', 'subject', 'Subject')],
      ta,
      h('div', { class: 'cm-a' },
        h('button', { class: 'sgo-btn primary', type: 'submit', disabled: busy }, icon('send', 16), busy ? 'Sending…' : 'Send'),
        reply ? null : h('a', { class: 'sgo-btn ghost', href: '/messages' }, 'Cancel'),
        h('a', { class: 'sgo-btn ghost', href: classic(reply ? '/messages/view/' + id : '/messages/new'), target: '_blank', rel: 'noopener noreferrer' }, icon('external', 15), 'Open in Schoology')),
      st.msg ? h('p', { class: 'cm-msg ' + (st.state === 'error' ? 'bad' : 'ok'), role: st.state === 'error' ? 'alert' : 'status' }, st.msg) : null,
      h('p', { class: 'sgo-note' }, 'Sent through your Schoology account, so it is delivered and saved there exactly like a message sent on Schoology.'));
  }

  function composePane() {
    return h('section', { class: 'ib-read' }, h('a', { class: 'ib-back', href: '/messages' }, icon('left', 16), 'Inbox'), h('div', { class: 'ib-rh' }, h('h2', null, 'New message')), composer('new', ''));
  }

  function readPane(id) {
    if (!id) return h('section', { class: 'ib-read ib-none' }, empty('Select a message', 'Pick a conversation on the left to read it here.'));
    const key = 'thread:' + id, t = S.mailThread(id), blk = stateBlock(t, 'this message', key);
    if (blk) return h('section', { class: 'ib-read' }, h('a', { class: 'ib-back', href: '/messages' }, icon('left', 16), 'Inbox'), blk);
    S.mailMarkRead(id);
    const d = t.data;
    return h('section', { class: 'ib-read' },
      h('a', { class: 'ib-back', href: '/messages' }, icon('left', 16), 'Inbox'),
      h('div', { class: 'ib-rh' }, d.tag ? h('span', { class: 'ib-tag' }, d.tag) : null, h('h2', null, d.subject), d.people ? h('p', null, d.people) : null),
      h('div', { class: 'ib-thread' }, d.rows.map((r) => h('article', { class: 'ib-msg' },
        h('div', { class: 'ib-mh' }, h('span', { class: 'ib-av' }, initials(r.name)), h('b', null, r.name || 'Unknown sender'), h('span', null, r.ts != null ? S.fmtDate(r.ts, true) + ' · ' + S.fmtTime(r.ts) : r.when)),
        h('div', { class: 'sgo-desc ib-body' }, S.sanitize(r.html)),
        r.files.length ? h('ul', { class: 'ib-files' }, r.files.map((f) => h('li', null, h('a', { href: S.safeUrl(f.href), target: '_blank', rel: 'noopener noreferrer' }, icon('file', 15), f.name)))) : null))),
      composer(id, id),
      h('p', { class: 'sgo-note' }, 'Opening a message marks it read, as it does in Schoology.'));
  }

  V.inbox = () => {
    const p = location.pathname.replace(/\/+$/, ''), box = p === '/messages/sent' ? 'sent' : 'inbox', vm = /^\/messages\/view\/(\d+)$/.exec(p), id = vm ? vm[1] : '';
    const composing = p === '/messages/new', pane = composing ? composePane() : readPane(id); // first: opening a message marks it read in the cached list drawn below
    const ui = S.ui.mail, key = 'mail:' + box, res = S.mailList(box);
    const items = res.data || [], unread = items.filter((m) => m.unread).length;
    const shown = items.filter((m) => matches(m, ui.q) && (ui.f !== 'unread' || m.unread));
    const tab = (k, label, href) => h('a', { href, 'aria-current': box === k && !id && !composing ? 'page' : null }, label);
    const listBody = stateBlock(res, 'your messages', key) || (shown.length
      ? h('ul', { class: 'ib-items' }, shown.map((m) => h('li', null, h('a', { class: 'ib-row' + (m.unread ? ' unread' : '') + (m.id === id ? ' on' : ''), href: '/messages/view/' + m.id, 'aria-current': m.id === id ? 'true' : null },
        h('span', { class: 'ib-av' }, initials(m.people)),
        h('span', { class: 'ib-rt' }, h('span', { class: 'ib-top' }, h('b', null, m.people || (box === 'sent' ? 'Sent' : 'Unknown')), h('time', null, stamp(m.ts, m.when))),
          h('span', { class: 'ib-sub' }, m.unread ? h('i', { class: 'ib-dot', 'aria-label': 'Unread' }) : null, m.subject),
          h('span', { class: 'ib-snip' }, (m.tag ? m.tag + ' — ' : '') + m.snippet))))))
      : empty(items.length ? 'No messages match' : box === 'sent' ? 'No sent messages' : 'Your inbox is empty', items.length ? 'Try a different search or filter.' : 'Messages from teachers and classmates show up here.'));
    const redo = () => S.render(true);
    return h('div', { class: 'sgo-page ib-page' }, head('Messages', null, [h('a', { class: 'sgo-btn primary', href: '/messages/new' }, icon('plus', 16), 'New message')]),
      h('div', { class: 'ib' + (id || composing ? ' has-sel' : '') },
        h('section', { class: 'ib-list', 'aria-label': 'Messages' },
          h('nav', { class: 'ib-tabs', 'aria-label': 'Mailbox' }, tab('inbox', 'Inbox', '/messages'), tab('sent', 'Sent', '/messages/sent')),
          searchBox(ui.q, 'Search messages', (v) => { ui.q = v; redo(); }, 'ib-q'),
          h('div', { class: 'sgo-chips' }, [['all', 'All', items.length], ['unread', 'Unread', unread]].map(([k, l, n]) => h('button', { class: 'sgo-chip' + (ui.f === k ? ' on' : ''), type: 'button', 'aria-pressed': String(ui.f === k), onclick: () => { ui.f = k; redo(); } }, l, h('span', null, n)))),
          listBody),
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
})();
