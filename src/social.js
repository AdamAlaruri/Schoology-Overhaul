/* Inbox and Groups data. Everything comes from Schoology's own pages (/messages, /groups, /group/<id>/feed,
 * /home/feed) read with the signed-in session. Message text is private, so it is kept in memory only, never in storage. */
(() => {
  const S = window.SGO;
  if (S.social) return;
  S.social = true;
  const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();
  const MON = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

  /** "Fri Oct 30 2026 at 11:58 am" / "Fri Oct 30, 2026 at 11:58 am" -> timestamp, or null when the text is not in that form. */
  S.parseStamp = (text) => {
    const m = /([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})(?:\s+at\s+(\d{1,2}):(\d{2})\s*([ap]m))?/i.exec(text || '');
    const mo = m ? MON.indexOf(m[1].toLowerCase()) : -1;
    if (mo < 0) return null;
    let hr = m[4] ? +m[4] % 12 : 0; if (m[6] && /pm/i.test(m[6])) hr += 12;
    return new Date(+m[3], mo, +m[2], hr, m[5] ? +m[5] : 0).getTime();
  };

  /* ---------- small in-memory resource cache: { data, loading, error }, one request per key ---------- */
  const store = new Map(), busy = new Set(), TTL = 2 * 6e4;
  const redraw = () => { if (S.render) S.render(true); };
  function resource(key, load, ttl = TTL) {
    const cur = store.get(key), now = Date.now();
    const fresh = cur && !cur.err && now - cur.at < ttl, recentErr = cur && cur.err && now - cur.at < 30e3;
    if (!fresh && !recentErr && !busy.has(key)) {
      busy.add(key);
      load().then((data) => store.set(key, { at: Date.now(), data }), (e) => store.set(key, { at: Date.now(), err: String(e.message || e), data: cur && cur.data }))
        .finally(() => { busy.delete(key); redraw(); });
    }
    return { data: cur ? cur.data : null, loading: !fresh && !recentErr, error: recentErr ? cur.err : '' };
  }
  S.retryResource = (key) => { store.delete(key); redraw(); };
  S.resetSocial = () => store.clear(); // the refresh button forgets everything here too

  /* ---------- inbox ---------- */
  const stripTag = (subject) => { const m = /^\[(.+?)\]\s*(.*)$/.exec(subject); return m ? { tag: m[1], title: m[2] || subject } : { tag: '', title: subject }; };
  function parseMessages(doc) {
    const out = [];
    doc.querySelectorAll('#privatemsg-list tbody tr').forEach((tr) => {
      const td = tr.querySelector('.privatemsg-list-subject'), a = td && td.querySelector('a.subject-link');
      const id = a && (/\/messages\/view\/(\d+)/.exec(a.getAttribute('href') || '') || [])[1];
      if (!id) return;
      const nd = td.querySelector('.names-date'), people = nd ? [...nd.querySelectorAll('a')].map((x) => clean(x.textContent)).filter(Boolean) : [];
      const s = stripTag(clean(a.textContent)), when = clean((nd && nd.querySelector('.small, .gray') || {}).textContent);
      out.push({
        id, tag: s.tag, subject: s.title, snippet: clean((td.querySelector('.privatemsg-list-body') || {}).textContent), people: people.join(', '),
        when, ts: S.parseStamp(when),
        unread: /\b(new|unread)\b/i.test(tr.className + ' ' + td.className) || !!td.querySelector('.new, .unread, .new-message'),
      });
    });
    return out;
  }
  S.mailList = (box) => resource('mail:' + box, async () => parseMessages(await S.getDoc(box === 'sent' ? '/messages/sent' : '/messages')));

  function parseThread(doc) {
    const title = doc.querySelector('.message-title');
    if (!title) throw new Error('Schoology did not return this message');
    const s = stripTag(clean(title.textContent));
    const rows = [...doc.querySelectorAll('.message-view-row')].map((row) => {
      const body = row.querySelector('.message-body') || row, c = body.cloneNode(true);
      const nm = c.querySelector('.name'), who = nm && nm.querySelector('a'), name = clean((who || nm || {}).textContent), when = clean((c.querySelector('.name .small, .name .gray') || {}).textContent);
      const files = [...c.querySelectorAll('.s-message-attachments a[href]')].map((a) => ({ name: clean(a.textContent), href: a.getAttribute('href') })).filter((f) => f.name && !/^javascript:/i.test(f.href));
      c.querySelectorAll('.name, .s-message-attachments-container, .s_message_actions, .immersive-reader-button-container, script, style').forEach((n) => n.remove());
      return { name, when, ts: S.parseStamp(when), html: c.innerHTML, files };
    });
    return { tag: s.tag, subject: s.title, people: clean((doc.querySelector('.message-participants') || {}).textContent), rows };
  }
  /** Opening a message in Schoology marks it read; the same happens here. Only runs when the person opens one. */
  S.mailThread = (id) => resource('thread:' + id, async () => parseThread(await S.getDoc('/messages/view/' + id)), 5 * 6e4);

  /** Once a message has been opened it is read: update the cached list (and the sidebar badge) without another request. */
  S.mailMarkRead = (id) => {
    const cur = store.get('mail:inbox'), m = cur && cur.data && cur.data.find((x) => x.id === id);
    if (m && m.unread) { m.unread = false; if (S.state.unread.messages > 0) S.state.unread.messages--; }
  };

  /** Mark cached mail data stale (it is kept on screen while it reloads). */
  S.staleMail = (...keys) => keys.forEach((k) => { const cur = store.get(k); if (cur) cur.at = 0; });

  /* ---------- sending ----------
   * A message written here is delivered by Schoology itself: this reads Schoology's own form (so its security tokens are fresh),
   * fills in the person's text and submits it with their signed-in session. Nothing goes anywhere else. */
  /** What is wrong with a draft, or '' when it can be sent. */
  S.checkDraft = (d, reply) => {
    if (!reply && !clean(d.to)) return 'Add who the message is for.';
    if (!reply && !clean(d.subject)) return 'Add a subject.';
    if (!clean(d.body)) return 'Write a message first.';
    return '';
  };
  /** The form's fields, filled in, ready to post. Throws when Schoology's page has no message form. */
  S.messageFields = (doc, d, reply) => {
    const form = doc.querySelector('#privatemsg-new, form#privatemsg-new');
    if (!form) throw new Error('Schoology did not return its message form.');
    const out = [];
    form.querySelectorAll('input, textarea, select').forEach((el) => {
      const n = el.getAttribute('name'); if (!n || el.disabled) return;
      const t = (el.getAttribute('type') || '').toLowerCase();
      if (t === 'submit' || t === 'button' || t === 'file' || t === 'image') return;
      if ((t === 'checkbox' || t === 'radio') && !el.checked) return;
      out.push([n, n === 'body' ? d.body : n === 'subject' ? d.subject || '' : n === 'edit-recipient' || n === 'recipient' ? d.to || '' : el.value || '']);
    });
    const op = form.querySelector('input[type=submit][name=op], button[name=op]');
    out.push(['op', (op && (op.value || op.textContent)) || (reply ? 'Send' : 'Send')]);
    if (!reply && !out.some(([n]) => n === 'edit-recipient' || n === 'recipient')) out.push(['edit-recipient', d.to || '']);
    if (!out.some(([n]) => n === 'body')) out.push(['body', d.body]);
    const action = form.getAttribute('action') || '';
    return { action, fields: out };
  };
  /** Text of a problem Schoology reported on the page it answered with, or ''. */
  S.messageError = (doc) => {
    const e = doc.querySelector('.messages.error, .message-error, .error-message, div.error, .form-item .error, #privatemsg-new .error');
    return e ? clean(e.textContent).slice(0, 240) : '';
  };
  /** Send a new message (`id` empty) or a reply. Resolves when Schoology accepted it; rejects with a sentence for the person. */
  S.sendMessage = async ({ id, to, subject, body }) => {
    const reply = !!id, page = reply ? '/messages/view/' + id : '/messages/new', d = { to, subject, body };
    const bad = S.checkDraft(d, reply); if (bad) throw new Error(bad);
    const doc = await S.getDoc(page), f = S.messageFields(doc, d, reply);
    let target = f.action ? new URL(f.action, location.origin) : null;
    if (!target || target.origin !== location.origin) target = new URL(page, location.origin); // only ever posts to Schoology's own site
    const after = await S.postForm(target.pathname + target.search, f.fields), err = S.messageError(after);
    if (err) throw new Error(err);
    // after a delivered new message Schoology moves on to a mailbox; the compose form coming back means it was not accepted
    if (!reply && after.querySelector('#privatemsg-new #edit-recipient, #privatemsg-new [name=edit-recipient]')) {
      throw new Error('Schoology did not accept the message. Check the recipient’s name, or finish it on Schoology.');
    }
    S.staleMail('mail:sent', 'mail:inbox', 'thread:' + id);
    return true;
  };

  /* ---------- groups ---------- */
  const safeImg = (src) => { try { const u = new URL(src, location.origin); return /schoology\.com$/i.test(u.hostname) || u.origin === location.origin ? u.href : ''; } catch (e) { return ''; } };
  function parseGroups(doc) {
    const out = [];
    doc.querySelectorAll('.mygroups-list-item').forEach((li) => {
      const a = li.querySelector('a.group-title'), id = a && (/\/group\/(\d+)/.exec(a.getAttribute('href') || '') || [])[1];
      if (!id) return;
      out.push({ id, name: clean(a.textContent), info: clean((li.querySelector('.info') || {}).textContent), img: safeImg((li.querySelector('.picture img') || {}).src) });
    });
    return out;
  }
  S.groupList = () => resource('groups', async () => parseGroups(await S.getDoc('/groups')), 5 * 6e4);
  S.groupFeed = (id) => resource('gfeed:' + id, async () => S.data.parseAnnouncements(await S.getDoc(`/group/${id}/feed`)), 5 * 6e4);

  /* ---------- notifications ----------
   * One list (prefs.notifs, newest first, kept as history) for four kinds of event, each created only when the data shows it:
   *   grade       a score appears that was not there before ("New grade"), or a score changes ("Grade changed")
   *   assignment  a teacher-assigned item appears that was not in an earlier read
   *   deadline    an unfinished item is due within 24 hours
   * The first read of each source only records what already exists, so nothing old is ever announced as new. An event has an id made
   * from what happened, so a background refresh that sees the same data again can never create the same notification twice.
   * Connection and sync problems are not stored: they are derived from the current state (S.syncIssues) so they cannot pile up. */
  const CAP = 80;
  S.gradeEvents = (grades, seen, baseline) => {
    const next = {}, events = [];
    for (const g of grades || []) for (const p of g.periods || []) for (const cat of p.categories || []) for (const it of cat.items || []) {
      if (it.earned == null || !it.title) continue;
      const key = `${g.courseId || g.courseName}|${it.title}|${it.dueText || ''}`, sig = `${it.earned}/${it.possible == null ? '' : it.possible}`;
      next[key] = sig;
      const prev = (seen || {})[key];
      if (baseline && prev !== sig) events.push({ kind: 'grade', id: key + '|' + sig, key, change: prev === undefined ? 'new' : 'changed', prevEarned: prev === undefined ? null : Number(String(prev).split('/')[0]), title: it.title, course: g.courseName || '', courseId: g.courseId || '', earned: it.earned, possible: it.possible == null ? null : it.possible, due: it.dueText || '' });
    }
    return { events, seen: Object.assign({}, seen, next) };
  };
  /** Add events that are not already in the list. Returns how many were added. */
  S.addNotifs = (events) => {
    const P = S.prefs, have = new Set((P.notifs || []).map((n) => n.id)), fresh = events.filter((e) => !have.has(e.id)).map((e) => Object.assign(e, { at: Date.now(), read: false }));
    if (fresh.length) P.notifs = [...fresh, ...(P.notifs || [])].slice(0, CAP);
    return fresh.length;
  };
  /** Compare the latest gradebook with what was seen. Returns true when new notifications were added. */
  S.noteGrades = () => {
    const P = S.prefs; if (!S.state.grades || !S.state.grades.length) return false;
    const known = P.gradeSeen || {};
    // a lost memory is treated like a first read, never as a flood of new grades
    const r = S.gradeEvents(S.state.grades, known, !!P.gradeBase && Object.keys(known).length > 0), added = S.addNotifs(r.events);
    P.gradeBase = true; P.gradeSeen = r.seen;
    S.savePrefs();
    return added > 0;
  };
  /** New teacher-assigned work and deadlines within 24 hours. `items` are the student's real assignments. */
  S.noteWork = (items, now = Date.now()) => {
    const P = S.prefs, seen = P.assignSeen || (P.assignSeen = {}), list = (items || []).filter((i) => i && i.key && i.title && !i.manual);
    if (!list.length) return false;
    const events = [], href = (i) => (S.itemHref ? S.itemHref(i) : i.url || '/home#/assignments');
    const open = (i) => !S.isComplete(i) && !S.isStale(i), name = (i) => S.cn(i.courseId, i.courseName) || i.courseName || '';
    if (P.assignBase) list.filter((i) => !(i.key in seen) && open(i)).forEach((i) => events.push({ kind: 'assignment', id: 'asg|' + i.key, key: i.key, title: i.title, course: name(i), courseId: i.courseId || '', due: i.due || null, href: href(i) }));
    list.forEach((i) => { if (!(i.key in seen)) seen[i.key] = now; });
    const keys = Object.keys(seen); if (keys.length > 800) keys.sort((a, b) => seen[a] - seen[b]).slice(0, keys.length - 800).forEach((k) => delete seen[k]);
    P.assignBase = true;
    const announced = new Set(events.map((e) => e.key)); // an item that is both new and due soon is announced once
    (items || []).filter((i) => i && i.key && i.title && i.due && open(i) && i.due > now && i.due - now <= S.DAY && !announced.has(i.key)).forEach((i) => events.push({ kind: 'deadline', id: 'due|' + i.key + '|' + i.due, key: i.key, title: i.title, course: name(i), courseId: i.courseId || '', due: i.due, href: href(i) }));
    const added = S.addNotifs(events); S.savePrefs();
    return added > 0;
  };
  S.notifs = () => S.prefs.notifs || [];
  S.unreadNotifs = (kind) => S.notifs().filter((n) => !n.read && (!kind || n.kind === kind)).length;
  S.markNotifRead = (id) => { const n = S.notifs().find((x) => x.id === id); if (n && !n.read) { n.read = true; S.savePrefs(); } };
  S.markAllNotifsRead = () => { S.notifs().forEach((n) => { n.read = true; }); S.savePrefs(); };
  S.clearReadNotifs = () => { S.prefs.notifs = S.notifs().filter((n) => !n.read); S.savePrefs(); };
  /** Problems reaching Schoology right now, taken from the current state. Never stored, so a refresh that succeeds clears them. */
  S.syncIssues = () => {
    const out = [];
    if (S.state.session === 'expired') out.push({ id: 'sync-session', title: 'Your Schoology session has ended', detail: 'Data cannot refresh until you sign in again. What you see is the last saved copy.', href: '/login', cta: 'Sign in' });
    (S.state.diag || []).filter((d) => !d.ok && /^Fetch/.test(d.name) && / — /.test(d.note || '') && S.state.session !== 'expired').forEach((d) => out.push({ id: 'sync-' + d.name, title: `Couldn’t refresh ${d.name.replace(/^Fetch: /, '')}`, detail: 'Showing the last saved copy. Use Refresh to try again.', at: d.at }));
    return out;
  };
})();
