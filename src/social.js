/* Inbox, Groups and History data. Everything comes from Schoology's own pages (/messages, /groups, /group/<id>/feed,
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

  /* ---------- history ---------- */
  /** Pages opened inside this extension, newest first. Stored locally; nothing is sent anywhere. */
  S.logVisit = (kind, title, href) => {
    if (!title || !href) return;
    const list = S.prefs.history = S.prefs.history || [], now = Date.now(), top = list[0];
    if (top && top.href === href) { if (now - top.ts > 6e4) { top.ts = now; S.savePrefs(); } return; }
    list.unshift({ kind, title, href, ts: now });
    if (list.length > 200) list.length = 200;
    S.savePrefs();
  };
  S.clearHistory = () => { S.prefs.history = []; S.savePrefs(); redraw(); };
})();
