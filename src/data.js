/* Data layer. Reads data Schoology already shows the signed-in user through same-origin requests
 * that reuse the existing session cookie. Each resource has exactly one source (see S.refresh), so
 * data never depends on which page happens to be loaded. The live page is only read for what no
 * endpoint provides: the name, picture and unread counts in the header.
 * Nothing is sent to any third party; results are cached in chrome.storage.local only.
 * S.state.diag (Settings > Diagnostics) reports what each source returned. */
(() => {
  const S = window.SGO;
  if (S.data) return;

  /* ---- all page-structure assumptions live here, in one place ---- */
  const SEL = {
    courseTitle: '.course-title, .course-name, .course-item-title, [class*="course-title"]',
    courseSection: '.course-subtitle, .section-title, .course-section, [class*="section-title"]',
    upcomingBox: '.upcoming-event',
    overdueRoot: '#overdue-submissions, .overdue-submissions, [id*="overdue"], [class*="overdue-submission"]',
    itemHref: /\/(assignment|event|assessment|discussion)\/\d+|\/course\/\d+\/(assignment|assessment|event)/i,
    feedItem: 'li[id^="edge-assoc"], li.edge-item',
    feedBody: '.update-body, .s-rte, .edge-body',
    feedTime: '.created, .update-time, .small.gray, time',
    gradeCourse: '.gradebook-course', // one per course; holds a table of tr.report-row (course / period / category / item rows)
    desc: '.assignment-description, .info-body, .s-rte, [class*="assignment-description"], #main-content .content-body',
  };

  const state = (S.state = {
    courses: [], items: {}, announcements: [], grades: [], user: '', loading: false,
    loaded: false, diag: [], lastRefresh: 0,
    session: 'ok', fetchedAt: {}, avatar: '', unread: { messages: 0, notifications: 0 }, cd: {}, // 'ok' | 'expired'; when each remote resource was last fetched (persisted)
  });
  const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();
  const abs = (href) => { try { return new URL(href, location.origin); } catch (e) { return null; } };

  /* ---------- fetching ---------- */
  const inflight = new Map(); // path -> promise: the same URL is never requested twice at once
  const gens = {};            // resource -> id of its latest request: older responses are ignored
  const TTL = { 'Fetch: courses': 10 * 6e4, 'Fetch: assignments': 2 * 6e4, 'Fetch: events': 2 * 6e4, 'Fetch: overdue': 2 * 6e4, 'Fetch: announcements': 5 * 6e4, 'Fetch: grades': 5 * 6e4 };
  const CACHE_VERSION = 2; // bump when cached data can no longer be trusted; older caches are discarded
  const LOGIN_RE = /id="s-user-login"|id="login-form"/i;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const expired = () => Object.assign(new Error('session expired'), { fatal: true });

  /** One GET with a single retry for network errors and 5xx. Detects a signed-out session instead of parsing a login page as data. */
  async function fetchText(path) {
    let last;
    for (let attemptNo = 0; attemptNo < 2; attemptNo++) {
      try {
        const r = await fetch(path, { credentials: 'same-origin', headers: { 'X-Requested-With': 'XMLHttpRequest' } });
        if (r.status === 401 || (r.redirected && /\/login/.test(r.url))) { state.session = 'expired'; throw expired(); }
        state.session = 'ok'; // a real response that is not a login redirect: the session itself is fine
        if (r.status >= 500) throw new Error('HTTP ' + r.status);
        if (!r.ok) throw Object.assign(new Error('HTTP ' + r.status), { fatal: true });
        const t = await r.text();
        if (LOGIN_RE.test(t)) { state.session = 'expired'; throw expired(); }
        state.session = 'ok';
        return t;
      } catch (e) { last = e; if (e.fatal) break; await sleep(700); }
    }
    throw last;
  }
  const unwrap = (t) => {
    try {
      const j = JSON.parse(t);
      const html = j && (j.html || j.output || (j.data && j.data.html) || j.content);
      if (typeof html === 'string') return html;
    } catch (e) { /* not JSON: it's HTML */ }
    return t;
  };
  function getHtml(path) {
    if (inflight.has(path)) return inflight.get(path);
    const p = fetchText(path).then(unwrap).finally(() => inflight.delete(path));
    inflight.set(path, p);
    return p;
  }
  const parseDoc = (html) => new DOMParser().parseFromString(html, 'text/html');
  S.getDoc = async (path) => parseDoc(await getHtml(path));
  /** A form submitted with the signed-in session, exactly like the browser would. Never retried: sending twice would deliver twice. */
  S.postForm = async (path, fields) => {
    const body = new URLSearchParams(); fields.forEach(([k, v]) => body.append(k, v));
    const ended = () => { state.session = 'expired'; return new Error('Your Schoology session has ended. Sign in again, then send the message.'); };
    let r;
    try { r = await fetch(path, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body }); }
    catch (e) { throw new Error('Could not reach Schoology. Check your connection.'); }
    if (r.status === 401 || (r.redirected && /\/login/.test(r.url))) throw ended();
    const t = await r.text();
    if (LOGIN_RE.test(t)) throw ended();
    if (!r.ok) throw new Error('Schoology answered with HTTP ' + r.status + '. The message was not sent.');
    return parseDoc(unwrap(t));
  };

  /* ---------- parsers ---------- */
  function parseCourses(root) {
    const map = new Map();
    const rows = root.querySelector('.course-item') ? '.course-item a[href*="/course/"]' : 'a[href*="/course/"]';
    root.querySelectorAll(rows).forEach((a) => {
      const m = (a.getAttribute('href') || '').match(/\/course\/(\d+)/);
      if (!m) return;
      const id = m[1];
      const card = a.closest('.course-item, li, [class*="course-card"], [class*="course-item"]') || a.parentElement;
      let name = clean((card && card.querySelector(SEL.courseTitle) || {}).textContent) || clean(a.getAttribute('title')) || clean(a.textContent);
      if (!name || name.length < 2 || /^(materials|updates|grades|gradebook|members|attendance|home|assignments?|mastery|more|open)$/i.test(name)) return;
      const section = clean((card && card.querySelector(SEL.courseSection) || {}).textContent);
      const prev = map.get(id);
      if (!prev || (!prev.section && section)) map.set(id, { id, name, section: section && section !== name ? section : '' });
    });
    return [...map.values()];
  }

  function groupHeader(el) {
    for (let n = el, up = 0; n && up < 4; n = n.parentElement, up++) {
      let s = n.previousElementSibling;
      for (let i = 0; s && i < 8; s = s.previousElementSibling, i++) {
        if (/^H[1-6]$/.test(s.tagName) || /date|header|day/i.test(s.className || '')) return clean(s.textContent);
      }
    }
    return '';
  }

  function dueFor(box, title) {
    for (let n = box, i = 0; n && i < 4; n = n.parentElement, i++) {
      const ds = n.getAttribute && (n.getAttribute('data-start') || n.getAttribute('data-date'));
      if (ds && /^\d+$/.test(ds)) { const v = +ds; return { ts: v < 1e12 ? v * 1000 : v, timed: true }; }
      const t = n.querySelector && n.querySelector('time[datetime]');
      if (t) { const v = Date.parse(t.getAttribute('datetime')); if (!isNaN(v)) return { ts: v, timed: true }; }
    }
    const own = clean(box.textContent).replace(title, '');
    const hdr = groupHeader(box);
    return S.parseDue(own + ' ' + hdr) || S.parseDue(own) || S.parseDue(hdr);
  }

  function itemFromAnchor(a, box) {
    const u = abs(a.getAttribute('href'));
    if (!u || !SEL.itemHref.test(u.pathname)) return null;
    // Schoology puts hidden screen-reader words ("assignment", "Due") inside the link; leave them out of the title.
    const shown = a.cloneNode(true); shown.querySelectorAll('.visually-hidden, .infotip, [aria-hidden="true"]').forEach((n) => n.remove());
    const title = clean(a.getAttribute('title') || shown.textContent);
    if (!title || /^(view|open|submit|details?)$/i.test(title)) return null;
    const cm = (box.querySelector('a[href*="/course/"]') || {}).getAttribute && box.querySelector('a[href*="/course/"]').getAttribute('href').match(/\/course\/(\d+)/);
    const courseNameEl = box.querySelector('.realm-title-course, .event-course, .course-name, [class*="realm-title"], [class*="course-name"]');
    const due = dueFor(box, title);
    const type = /\/event\//.test(u.pathname) ? 'event' : /\/assessment\//.test(u.pathname) || /\b(test|quiz|exam|assessment|midterm|final)\b/i.test(title) ? 'assessment' : 'assignment';
    return {
      key: u.pathname, url: u.pathname + u.search, title, type,
      courseId: cm ? cm[1] : '', courseName: clean(courseNameEl && courseNameEl.textContent),
      due: due ? due.ts : null, timed: due ? due.timed : false,
    };
  }

  function parseUpcoming(root) {
    const out = new Map();
    root.querySelectorAll(SEL.upcomingBox).forEach((box) => {
      box.querySelectorAll('a[href]').forEach((a) => {
        const it = itemFromAnchor(a, box);
        if (it && !out.has(it.key)) out.set(it.key, it);
      });
    });
    return [...out.values()];
  }

  function parseOverdue(root) {
    const rootEl = root.querySelector(SEL.overdueRoot) || root; // the fetched fragment has no wrapper element
    const out = new Map();
    rootEl.querySelectorAll('a[href]').forEach((a) => {
      // The course name lives on the enclosing upcoming-event row, not on the generic div around the link.
      const box = a.closest('.upcoming-event, li, tr, .overdue-submission') || a.parentElement || a;
      const it = itemFromAnchor(a, box);
      if (it && !out.has(it.key)) { it.fromOverdue = true; out.set(it.key, it); }
    });
    return { found: true, items: [...out.values()] };
  }

  function parseAnnouncements(root) {
    const out = [];
    root.querySelectorAll(SEL.feedItem).forEach((li) => {
      const bodyEl = li.querySelector(SEL.feedBody);
      let body = clean((bodyEl || {}).textContent);
      if (!body) return;
      // A subject exists only when the post starts with its own heading or bold line and has text after it; plain posts have none.
      let subject = '';
      const lead = bodyEl && [...bodyEl.childNodes].find((n) => (n.textContent || '').trim());
      if (lead && lead.nodeType === 1 && /^(H[1-6]|STRONG|B)$/.test(lead.tagName)) {
        const t = clean(lead.textContent);
        if (t && t.length <= 120 && body.length > t.length + 3 && body.startsWith(t)) { subject = t; body = clean(body.slice(t.length)); }
      }
      const links = [...li.querySelectorAll('.edge-sentence a, .update-sentence-inner a, a')];
      const courseA = links.find((a) => /\/(course|group)\/\d+/.test(a.getAttribute('href') || ''));
      const authorA = links.find((a) => /\/user\/\d+/.test(a.getAttribute('href') || '')) || links[0];
      const cm = courseA && courseA.getAttribute('href').match(/\/course\/(\d+)/);
      out.push({
        id: li.id || String(out.length), subject, author: clean(authorA && authorA.textContent),
        courseName: clean(courseA && courseA.textContent), courseId: cm ? cm[1] : '',
        body: body.slice(0, 1500), time: clean((li.querySelector(SEL.feedTime) || {}).textContent),
        url: courseA ? abs(courseA.getAttribute('href')).pathname : '',
      });
    });
    return out;
  }

  /* ---- course content ----
   * /course/<id>/materials[?f=<folder>] is server-rendered: #folder-contents-table > tbody > tr, one row per item in Schoology's order.
   * Folder rows are tr.material-row-folder (id f-<folderId>); the rest are tr.type-document / type-assignment / type-common-assessment.
   * Folder pages do not say where they sit, so the folder tree (id -> title, parent) is built as folders are opened and cached. */
  const FOLDER_TTL = 5 * 6e4, FEED_TTL = 5 * 6e4, ASG_TTL = 10 * 6e4;
  const courseData = (id) => (state.cd[id] = state.cd[id] || { folders: {}, tree: {}, errors: {}, feed: null, feedErr: null });
  const FMT = { pdf: ['pdf', 'PDF'], doc: ['doc', 'Document'], docx: ['doc', 'Document'], rtf: ['doc', 'Document'], odt: ['doc', 'Document'], txt: ['doc', 'Text file'], ppt: ['slides', 'Slides'], pptx: ['slides', 'Slides'], key: ['slides', 'Slides'],
    xls: ['sheet', 'Spreadsheet'], xlsx: ['sheet', 'Spreadsheet'], csv: ['sheet', 'Spreadsheet'], png: ['image', 'Image'], jpg: ['image', 'Image'], jpeg: ['image', 'Image'], gif: ['image', 'Image'], mp4: ['video', 'Video'], mov: ['video', 'Video'], mp3: ['audio', 'Audio'], zip: ['file', 'Archive'] };
  const idFrom = (href, kind) => (new RegExp('/' + kind + '/(\\d+)').exec(href || '') || [])[1] || '';
  const textOf = (el) => (el ? visibleText(el) : '');
  function parseMaterialRow(tr) {
    const cl = tr.classList;
    if (cl.contains('material-row-folder')) {
      const t = tr.querySelector('.folder-title a') || tr.querySelector('.folder-title');
      return { kind: 'folder', id: tr.id.replace(/^f-/, ''), title: textOf(t), desc: textOf(tr.querySelector('.folder-description')).slice(0, 220) };
    }
    const typeCls = [...cl].find((c) => c.startsWith('type-')) || '';
    const a = tr.querySelector('.item-title a') || tr.querySelector('a[href]');
    const href = a ? a.getAttribute('href') || '' : '', nid = tr.id.replace(/^n-/, '');
    const titleEl = tr.querySelector('.item-title'), sub = textOf(tr.querySelector('.item-subtitle'));
    const dueM = /Due\s+(.+?)(?:\s*·|$)/.exec(sub), file = tr.querySelector('.attachments-file-name'), size = textOf(tr.querySelector('.attachments-file-size'));
    const body = textOf(tr.querySelector('.item-body')).replace(textOf(file), '').replace(size, '').trim().slice(0, 160);
    let title = textOf(titleEl).replace(/\s*\d+ lesson plans?$/i, '') || textOf(tr.querySelector('.document-body-title')) || textOf(file);
    if (typeCls === 'type-assignment') return { kind: 'assignment', id: idFrom(href, 'assignment') || nid, title, dueText: dueM ? dueM[1] : '', href, body };
    if (/assessment|quiz|test/.test(typeCls)) return { kind: 'assessment', id: idFrom(href, 'assessment') || nid, title, dueText: dueM ? dueM[1] : '', href, body };
    if (typeCls === 'type-discussion') return { kind: 'discussion', id: nid, title, href, body };
    if (typeCls === 'type-document' || typeCls === 'type-page' || typeCls === 'type-link') {
      const fa = tr.querySelector('.attachments-file a[href]') || (file && file.matches('a[href]') ? file : null);
      if (file) { const ext = (/\.([a-z0-9]+)$/i.exec(textOf(file)) || [])[1] || '', f = FMT[ext.toLowerCase()] || ['file', ext ? ext.toUpperCase() + ' file' : 'File']; return { kind: 'file', fmt: f[0], fmtLabel: f[1], id: nid, title, href, size, dl: fa ? fa.getAttribute('href') : '' }; }
      if (tr.querySelector('[class*="link-icon"]') || typeCls === 'type-link') return { kind: 'link', id: nid, title, href, body };
      return { kind: typeCls === 'type-page' ? 'page' : 'document', id: nid, title, href, body };
    }
    return { kind: 'other', id: nid, title, href, body, label: typeCls.replace(/^type-/, '').replace(/-/g, ' ') };
  }
  function parseFolder(doc, fid) {
    const tbl = doc.querySelector('#folder-contents-table');
    if (!tbl) throw new Error('This page did not contain a materials list');
    const seen = new Set(), items = [];
    tbl.querySelectorAll(':scope > tbody > tr, :scope > tr').forEach((tr) => {
      if (!/type-|material-row-folder/.test(tr.className)) return;
      const it = parseMaterialRow(tr);
      if (!it.title) it.title = it.kind === 'folder' ? 'Untitled folder' : 'Untitled';
      const k = it.kind + ':' + (it.id || it.title);
      if (!seen.has(k)) { seen.add(k); items.push(it); }
    });
    return { id: fid || 'root', title: fid ? textOf(doc.querySelector('h1.page-title')) : '', items };
  }
  function loadFolder(courseId, fid) {
    const cd = courseData(courseId), key = fid || 'root', ik = `folder:${courseId}:${key}`;
    if (inflight.has(ik)) return inflight.get(ik);
    const p = S.getDoc(`/course/${courseId}/materials` + (fid ? `?f=${encodeURIComponent(fid)}` : '')).then((doc) => {
      const f = parseFolder(doc, fid); f.at = Date.now(); cd.folders[key] = f; delete cd.errors[key];
      if (fid) cd.tree[fid] = Object.assign({ parent: '' }, cd.tree[fid], { title: f.title });
      f.items.forEach((ch) => { if (ch.kind === 'folder') cd.tree[ch.id] = { title: ch.title, parent: key }; });
      saveCache(); return f;
    }).catch((e) => { cd.errors[key] = { msg: String(e.message || e), at: Date.now() }; throw e; }).finally(() => inflight.delete(ik));
    inflight.set(ik, p); return p;
  }
  const redraw = () => { if (S.render) S.render(true); };
  /** What the UI needs for one folder: the cached copy (even if old), and whether a refresh is running or failed. Starts at most one request. */
  S.folderState = (courseId, fid) => {
    const cd = courseData(courseId), key = fid || 'root', cur = cd.folders[key], err = cd.errors[key];
    const fresh = cur && Date.now() - cur.at < FOLDER_TTL, recentErr = err && Date.now() - err.at < 30e3;
    if (!fresh && !recentErr && !inflight.has(`folder:${courseId}:${key}`)) loadFolder(courseId, fid).then(redraw, redraw);
    return { data: cur || null, loading: !fresh && !recentErr, error: recentErr ? err.msg : '' };
  };
  S.retryFolder = (courseId, fid) => { delete courseData(courseId).errors[fid || 'root']; redraw(); };
  S.folderCount = (courseId, fid) => { const f = (state.cd[courseId] || { folders: {} }).folders[fid]; return f ? f.items.length : null; };
  /** [{id, title}] from the first folder down to this one, or null while its parents are not known yet. */
  S.folderTrail = (courseId, fid) => {
    const cd = state.cd[courseId], out = []; let cur = fid, guard = 0;
    if (!cd) return null;
    while (cur && cur !== 'root' && guard++ < 25) { const n = cd.tree[cur]; if (!n || !n.parent) return null; out.unshift({ id: cur, title: n.title }); cur = n.parent; }
    return out;
  };
  const crawling = new Map();
  /** A nested folder opened by its address has no known parents. Walk the tree from the top, level by level, until it is found (cached afterwards). */
  S.discoverFolder = (courseId, fid) => {
    const k = courseId + ':' + fid;
    if (crawling.has(k)) return crawling.get(k);
    const cd = courseData(courseId);
    const p = (async () => {
      let level = ['root'], visited = 0; const seen = new Set();
      while (level.length && visited < 40 && !(cd.tree[fid] && cd.tree[fid].parent)) {
        const next = [];
        for (const key of level) {
          if (seen.has(key)) continue; seen.add(key); visited++;
          const f = cd.folders[key] && Date.now() - cd.folders[key].at < FOLDER_TTL ? cd.folders[key] : await loadFolder(courseId, key === 'root' ? '' : key);
          f.items.forEach((ch) => { if (ch.kind === 'folder') next.push(ch.id); });
          if (cd.tree[fid] && cd.tree[fid].parent) break;
        }
        level = next;
      }
    })().catch(() => {}).finally(() => { crawling.delete(k); redraw(); });
    crawling.set(k, p); return p;
  };
  /** Load the folders directly below the one on screen so their item counts can be shown. A few at a time, each at most once. */
  S.prefetchFolders = (courseId, ids) => {
    const cd = courseData(courseId), todo = ids.filter((id) => !cd.folders[id] && !cd.errors[id] && !inflight.has(`folder:${courseId}:${id}`)).slice(0, 8);
    if (!todo.length) return;
    Promise.allSettled(todo.map((id) => loadFolder(courseId, id))).then(redraw);
  };
  S.feedState = (courseId) => {
    const cd = courseData(courseId), cur = cd.feed, err = cd.feedErr, ik = 'feed:' + courseId;
    const fresh = cur && Date.now() - cur.at < FEED_TTL, recentErr = err && Date.now() - err.at < 30e3;
    if (!fresh && !recentErr && !inflight.has(ik)) {
      const p = S.getDoc(`/course/${courseId}/feed`).then((doc) => { cd.feed = { items: parseAnnouncements(doc), at: Date.now() }; cd.feedErr = null; saveCache(); })
        .catch((e) => { cd.feedErr = { msg: String(e.message || e), at: Date.now() }; }).finally(() => { inflight.delete(ik); redraw(); });
      inflight.set(ik, p);
    }
    return { items: cur ? cur.items : null, loading: !fresh && !recentErr, error: recentErr ? err.msg : '' };
  };
  /* Assignment pages: instructions, due date and attachments. Cached in memory only. */
  const asgCache = new Map();
  function parseAssignmentPage(doc) {
    const t = doc.querySelector('h1.page-title'), clone = t ? t.cloneNode(true) : null;
    if (clone) clone.querySelectorAll('.visually-hidden, .lesson-plan-wrapper').forEach((n) => n.remove());
    const due = [...doc.querySelectorAll('.due-date')].map((e) => clean(e.textContent)).find(Boolean) || '';
    const body = doc.querySelector('.info-body') || doc.querySelector(SEL.desc);
    const atts = [...doc.querySelectorAll('.attachments-file a[href], .attachments a[href]')].map((a) => ({ name: clean(a.textContent), href: a.getAttribute('href') })).filter((x) => x.name);
    return { title: clone ? clean(clone.textContent).replace(/\s*\d+ lesson plans?$/i, '') : '', dueText: due.replace(/^Due:?\s*/i, ''), descHtml: body ? body.innerHTML : '', attachments: atts };
  }
  S.assignmentState = (aid) => {
    const cur = asgCache.get(aid), ik = 'asg:' + aid;
    const fresh = cur && cur.data && !cur.err && Date.now() - cur.at < ASG_TTL, recentErr = cur && cur.err && Date.now() - cur.at < 30e3;
    if (!fresh && !recentErr && !inflight.has(ik)) {
      const p = S.getDoc(`/assignment/${aid}`).then((doc) => { asgCache.set(aid, { at: Date.now(), data: parseAssignmentPage(doc) }); })
        .catch((e) => { asgCache.set(aid, { at: Date.now(), err: String(e.message || e), data: cur && cur.data }); }).finally(() => { inflight.delete(ik); redraw(); });
      inflight.set(ik, p);
    }
    return { data: cur ? cur.data : null, loading: !fresh && !recentErr, error: recentErr ? cur.err : '' };
  };
  S.retryAssignment = (aid) => { asgCache.delete(aid); redraw(); };
  /** "Ribarich, H" in the course title becomes "H. Ribarich". Empty when the title carries no teacher. */
  S.courseTeacher = (course) => { const m = /:\s*\([^)]*\)\s*([A-Z][\w'’-]+),\s*([A-Z])\.?/.exec(course && course.name || ''); return m ? `${m[2]}. ${m[1]}` : ''; };
  S.courseTerm = (course) => (/\((S\d|Q\d|T\d|Y\d?)\)/.exec(course && course.name || '') || [])[1] || '';

  /* ---- grades ----
   * Schoology renders each course as .gradebook-course > table > tr.report-row, where the row class says what it is:
   * course-row, period-row, category-row or item-row. th.title-column holds the label; td.grade-column holds the grade.
   * Every value goes into its own field, so nothing is ever shown as one big block of text.
   * Course, period and category grades are copied exactly as Schoology shows them; nothing is recalculated here. */
  const visibleText = (el) => { const c = el.cloneNode(true); c.querySelectorAll('.visually-hidden, [aria-hidden="true"]').forEach((n) => n.remove()); return clean(c.textContent); };
  const WEIGHT_RE = /\(\s*(\d+(?:\.\d+)?)\s*%\s*\)\s*$/;
  const gradeFields = (text) => {
    const l = /^\s*([A-F][+-]?)(?=\s|\(|$)/.exec(text), p = /\(\s*(\d+(?:\.\d+)?)\s*%\s*\)/.exec(text);
    return { letter: l ? l[1] : '', percent: p ? parseFloat(p[1]) : null };
  };
  const splitWeight = (label) => { const m = WEIGHT_RE.exec(label); return { name: clean(label.replace(WEIGHT_RE, '')), weight: m ? parseFloat(m[1]) : null }; };
  function itemStatus(fullText, earned) {
    if (/missing/i.test(fullText)) return ['missing', 'Missing'];
    if (/has not been graded/i.test(fullText)) return ['pending', 'Submitted, not graded'];
    if (earned != null) return ['graded', 'Graded'];
    return ['none', 'Not graded'];
  }
  function courseIdFor(rawName) {
    const key = S.cleanName(rawName).toLowerCase();
    const hits = state.courses.filter((x) => S.cleanName(x.name).toLowerCase() === key);
    return hits.length === 1 ? hits[0].id : ''; // ambiguous or unknown: leave unlinked rather than guess
  }
  function parseGrades(root) {
    const out = [], seen = new Set();
    root.querySelectorAll(SEL.gradeCourse).forEach((c) => {
      const titleEl = c.querySelector('.gradebook-course-title');
      if (!titleEl || seen.has(c.id || titleEl.textContent)) return;
      seen.add(c.id || titleEl.textContent);
      const rawName = visibleText(titleEl);
      const tm = /:\s*\([^)]*\)\s*([A-Z][\w'’-]+,\s*[A-Z]\.?)/.exec(rawName);
      const course = { gradebookId: (/gradebook-course-(\d+)/.exec(c.id || '') || [])[1] || '', courseId: courseIdFor(rawName), courseName: rawName,
        teacher: tm ? tm[1] : '', grade: '', letter: '', percent: null, periods: [] };
      let period = null, cat = null;
      const need = () => {
        if (!period) { period = { name: '', weight: null, grade: '', letter: '', percent: null, categories: [] }; course.periods.push(period); }
        if (!cat) { cat = { name: 'Assignments', weight: null, grade: '', letter: '', percent: null, items: [] }; period.categories.push(cat); }
      };
      c.querySelectorAll('tr.report-row').forEach((tr) => {
        const th = tr.querySelector('th.title-column'), gc = tr.querySelector('td.grade-column');
        if (!th) return;
        const gradeText = gc ? visibleText(gc) : '';
        if (tr.classList.contains('course-row')) { Object.assign(course, gradeFields(gradeText), { grade: gradeText }); }
        else if (tr.classList.contains('period-row')) {
          const { name, weight } = splitWeight(visibleText(th));
          period = Object.assign({ name, weight, grade: gradeText, categories: [] }, gradeFields(gradeText)); course.periods.push(period); cat = null;
        } else if (tr.classList.contains('category-row')) {
          if (!period) need();
          const { name, weight } = splitWeight(visibleText(th));
          cat = Object.assign({ name, weight, grade: gradeText, items: [] }, gradeFields(gradeText)); period.categories.push(cat);
        } else if (tr.classList.contains('item-row')) {
          need();
          const titleNode = th.querySelector('.title') || th, dueNode = th.querySelector('.due-date');
          const title = visibleText(titleNode);
          if (!title) return;
          const dueText = dueNode ? visibleText(dueNode).replace(/^Due\s*/i, '') : '';
          const nums = /(-?\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/.exec(gradeText);
          const earned = nums ? parseFloat(nums[1]) : null, possible = nums ? parseFloat(nums[2]) : null;
          const [status, statusLabel] = itemStatus(clean(gc ? gc.textContent : ''), earned);
          if (cat.items.some((x) => x.title === title && x.dueText === dueText)) return; // never list the same entry twice
          const cc = tr.querySelector('td.comment-column'), note = cc ? visibleText(cc) : '';
          const ta = th.querySelector('a[href]');
          cat.items.push({ title, dueText, earned, possible, status, statusLabel, comment: /^no comment$/i.test(note) ? '' : note, href: ta ? ta.getAttribute('href') || '' : '' });
        }
      });
      out.push(course);
    });
    return out;
  }

  /* ---------- merge & cache ---------- */
  function upsert(it) {
    const prev = state.items[it.key] || {};
    const next = Object.assign({}, prev);
    for (const k in it) if (it[k] !== '' && it[k] != null) next[k] = it[k];
    next.lastSeen = Date.now();
    if (!next.courseName && next.courseId) { const c = state.courses.find((x) => x.id === next.courseId); if (c) next.courseName = c.name; }
    state.items[it.key] = next;
  }
  /** Connect items and grades to courses by cleaned title. Runs after every refresh, because the sources load in parallel. */
  function relink() {
    Object.values(state.items).forEach((i) => { if (!i.courseId && i.courseName) i.courseId = courseIdFor(i.courseName); });
    state.grades.forEach((g) => { if (!g.courseId) g.courseId = courseIdFor(g.courseName); });
    syncMissing();
  }
  /** Schoology's overdue list can omit work its gradebook marks Missing. Those entries are added to the task list too (flag gbMissing,
   *  recomputed on every refresh), so unsubmitted work always shows in Today's Priorities and the counts. */
  function syncMissing() {
    const all = Object.values(state.items);
    all.forEach((i) => { if (i.gbMissing) i.gbMissing = false; });
    state.grades.forEach((g) => {
      if (!g.courseId) return;
      (g.periods || []).forEach((p) => p.categories.forEach((cat) => cat.items.forEach((x) => {
        if (x.status !== 'missing') return;
        const aid = idFrom(x.href, 'assignment'), low = x.title.toLowerCase();
        const hit = all.find((i) => (aid && i.key === '/assignment/' + aid) || (i.courseId === g.courseId && (i.title || '').toLowerCase() === low));
        if (hit) { hit.gbMissing = true; if (!hit.due && x.dueText) { const d = S.parseDue(x.dueText); if (d) { hit.due = d.ts; hit.timed = d.timed; } } return; }
        const d = x.dueText ? S.parseDue(x.dueText) : null, key = aid ? '/assignment/' + aid : `gb:${g.courseId}:${low}`;
        const it = { key, url: aid ? '/assignment/' + aid : `/course/${g.courseId}/materials`, title: x.title, type: 'assignment', courseId: g.courseId, courseName: g.courseName,
          due: d ? d.ts : null, timed: d ? d.timed : false, gbMissing: true, lastSeen: Date.now() };
        state.items[key] = it; all.push(it);
      })));
    });
  }

  /** Signature of everything the UI renders. Comparing it avoids re-rendering when a scan finds identical data. */
  const sig = () => JSON.stringify([state.courses, Object.values(state.items).map(({ lastSeen, ...rest }) => rest), state.announcements, state.grades, state.user, state.avatar, state.unread, (S.prefs.gradeNotifs || []).length]);
  /** Adopt cache written by another tab. Returns true only if the data actually differs. */
  S.adoptCache = (c) => {
    if (c.v !== CACHE_VERSION) return false;
    const before = sig();
    Object.assign(state, { courses: c.courses || [], items: c.items || {}, announcements: c.announcements || [], grades: c.grades || [], user: c.user || '' });
    return sig() !== before;
  };
  function applyUpcoming(list) { list.forEach(upsert); }
  function applyOverdue(res) {
    const seen = new Set(res.items.map((i) => i.key));
    Object.values(state.items).forEach((i) => { if (i.fromOverdue && !seen.has(i.key)) i.fromOverdue = false; });
    res.items.forEach(upsert);
  }
  function applyCourses(list) {
    if (list.length) state.courses = list; // the /courses page is authoritative: it replaces the list, it never merges into it
  }
  function diag(name, ok, count, note) {
    const i = state.diag.findIndex((d) => d.name === name);
    const row = { name, ok, count, note: note || '', at: Date.now() };
    i >= 0 ? (state.diag[i] = row) : state.diag.push(row);
  }

  function prune() {
    const cut = Date.now() - 90 * S.DAY;
    for (const k in state.items) { const i = state.items[k]; if (i.fromOverdue || i.gbMissing) continue; // work still missing is never dropped for being old
      if ((i.due && i.due < cut) || i.lastSeen < Date.now() - 120 * S.DAY) delete state.items[k]; }
  }
  const saveCache = S.debounce(() => {
    prune();
    S.store.set('sgo_cache', { v: CACHE_VERSION, _by: S.TAB, courses: state.courses, items: state.items, announcements: state.announcements, grades: state.grades, user: state.user, fetchedAt: state.fetchedAt, avatar: state.avatar, cd: state.cd });
  }, 500);
  S.clearCache = async () => { await S.store.remove('sgo_cache'); Object.assign(state, { courses: [], items: {}, announcements: [], grades: [], fetchedAt: {}, cd: {} }); };

  S.loadCache = async () => {
    const c = await S.store.get('sgo_cache');
    if (!c) return;
    Object.assign(state, { user: c.user || '', avatar: c.avatar || '' });
    if (c.cd) state.cd = c.cd;
    if (c.v === CACHE_VERSION) Object.assign(state, { courses: c.courses || [], items: c.items || {}, announcements: c.announcements || [], grades: c.grades || [], fetchedAt: c.fetchedAt || {} });
  };

  /* ---------- live page: only what no endpoint provides ---------- */
  function readHeader(root) {
    const hd = root.querySelector('#header');
    const named = root.querySelector('[class*="profile-name"], [class*="user-name"]');
    const out = { user: clean(named && named.textContent), avatar: '', unread: { messages: 0, notifications: 0 } };
    if (!hd) return out;
    const img = hd.querySelector('button img');
    if (img) {
      try { const u = new URL(img.getAttribute('src'), location.href); if (/(^|\.)schoology\.com$/i.test(u.hostname) || u.origin === location.origin) out.avatar = u.href; } catch (e) { /* no picture */ }
      out.user = clean((img.closest('button') || {}).textContent) || out.user;
    }
    hd.querySelectorAll('button[aria-label]').forEach((b) => {
      const m = /(\d+)\s+unread\s+(messages|notifications)/i.exec(b.getAttribute('aria-label'));
      if (m) out.unread[m[2].toLowerCase()] = +m[1];
    });
    return out;
  }

  /** Reads what the live page already shows (the header: name, picture, unread counts). */
  S.scrapeLive = (root = document) => {
    const before = sig();
    try {
      const hd = readHeader(root);
      if (hd.user) state.user = hd.user;
      if (hd.avatar) state.avatar = hd.avatar;
      state.unread = hd.unread;
    } catch (e) { diag('Live page scrape', false, 0, String(e.message || e)); }
    const now = sig() !== before;
    if (now) saveCache();
    return now;
  };

  /* ---------- same-origin fetches (reuses the user's existing login) ---------- */
  const syncErr = {};
  /** Honest freshness for the UI: 'failed' (a fetch errored or the session ended), 'ok', or 'none' (nothing loaded yet). */
  S.syncStatus = () => {
    const t = Math.max(0, ...Object.values(state.fetchedAt || {}));
    if (state.session === 'expired' || Object.keys(syncErr).length) return { kind: 'failed', at: t || null };
    return { kind: t ? 'ok' : 'none', at: t || null };
  };

  async function attempt(name, path, parse, apply, force) {
    if (!force && Date.now() - (state.fetchedAt[name] || 0) < (TTL[name] || 0)) return; // fresh enough: reuse what is already loaded
    const g = (gens[name] = (gens[name] || 0) + 1);
    try {
      const doc = await S.getDoc(path);
      if (gens[name] !== g) return; // a newer request for this resource started; drop this response
      const res = parse(doc);
      apply(res);
      const n = Array.isArray(res) ? res.length : res.items.length;
      state.fetchedAt[name] = Date.now();
      diag(name, n > 0 || (res && res.found), n, path);
      delete syncErr[name];
    } catch (e) { if (gens[name] === g) { syncErr[name] = true; diag(name, false, 0, path + ' — ' + (e.message || e)); } }
  }

  let pending = 0;
  /** Refresh remote data. Respects the cache lifetimes above unless forced, so switching tabs never refetches fresh data. */
  S.refresh = async (route, opts = {}) => {
    const force = !!opts.force, all = !!opts.all; // all: every source, whatever page is open (the Refresh buttons)
    pending++; state.loading = true; const before = sig();
    const quiet = route === 'native' || route === 'inbox' || route === 'groups'; // pages that use none of the course data
    const jobs = [attempt('Fetch: courses', '/courses', parseCourses, applyCourses, force)];
    if (all || !quiet) jobs.push(
      attempt('Fetch: assignments', '/home/upcoming_submissions_ajax', parseUpcoming, applyUpcoming, force),
      attempt('Fetch: events', '/home/upcoming_ajax', parseUpcoming, applyUpcoming, force),
      attempt('Fetch: overdue', '/home/overdue_submissions_ajax', parseOverdue, applyOverdue, force));
    if (all || route === 'dashboard') jobs.push(attempt('Fetch: announcements', '/home/feed', parseAnnouncements, (a) => { state.announcements = a; }, force));
    // grades feed the submitted/graded/missing status on every assignment and the grade notifications, so every page that shows work loads them
    if (all || !quiet) jobs.push(attempt('Fetch: grades', '/grades/grades', parseGrades, (g) => { if (g.length) { state.grades = g; if (S.noteGrades) S.noteGrades(); } }, force));
    try {
      await Promise.all(jobs);
      relink();
    } finally { // a failure must never leave the page stuck on "loading"
      pending--; state.loading = pending > 0; state.loaded = true; state.lastRefresh = Date.now();
    }
    saveCache(); // also persists fetchedAt so the cache lifetimes survive a page reload
    return sig() !== before;
  };

  /** Lazily fetch an assignment's description (shown in the detail view). */
  S.fetchDescription = (item) => {
    if (item.descHtml !== undefined) return Promise.resolve(item.descHtml);
    if (item._descP) return item._descP; // already loading: share the request
    item._descP = (async () => {
      try {
        const doc = await S.getDoc(item.url);
        const el = doc.querySelector(SEL.desc);
        item.descHtml = el ? el.innerHTML : '';
        if (!item.courseName) { const c = doc.querySelector('a[href*="/course/"]'); if (c) item.courseName = clean(c.textContent); }
        return item.descHtml;
      } catch (e) { return ''; } // a failure is not cached, so the next open retries
      finally { item._descP = null; }
    })();
    return item._descP;
  };

  /* ---------- derived, non-fabricated helpers ---------- */
  S.isDone = (it) => !!S.prefs.done[it.key];
  /** Ticked off more than a week ago: tucked into the Archive filter on Assignments so the lists stay short, but never lost. */
  S.isArchived = (it) => { const t = S.prefs.done[it.key]; return typeof t === 'number' && Date.now() - t > 7 * 24 * 60 * 60 * 1000; };
  /** Overdue means Schoology lists it as missing. The student's own tasks have no such list, so their date decides. */
  S.isOverdue = (it) => !S.isDone(it) && (!!it.fromOverdue || !!it.gbMissing || (!!it.manual && !!it.due && it.due < Date.now()));
  /** Past its due date and not marked done. Schoology does not reliably expose submissions, so this is the student's own view. */
  S.isPastDue = (it) => !S.isDone(it) && !!it.due && it.due < Date.now();
  /** Past its date but not on Schoology's missing list: it may well be submitted, so its status is unknown. Kept out of To-do and counts. */
  S.isStale = (it) => S.isPastDue(it) && !it.fromOverdue && !it.gbMissing && !it.manual;
  /* Gradebook lookups: which assignment has been submitted or graded, how many points it is worth. */
  let gradeIndex = null, gradeIndexOf = null;
  S.gradeFor = (courseId) => state.grades.find((g) => g.courseId === courseId) || null;
  /** The gradebook entry for an assignment, matched by its id when the gradebook links to it, else by title. */
  S.gradeEntryFor = (courseId, aid, title) => {
    const g = S.gradeFor(courseId); if (!g) return null;
    let hit = null;
    (g.periods || []).forEach((p) => p.categories.forEach((cat) => cat.items.forEach((x) => { if (!hit && ((aid && idFrom(x.href, 'assignment') === aid) || (title && x.title.toLowerCase() === title.toLowerCase()))) hit = x; })));
    return hit;
  };
  S.gradeEntry = (it) => {
    if (gradeIndexOf !== state.grades) {
      gradeIndexOf = state.grades; gradeIndex = new Map();
      state.grades.forEach((g) => (g.periods || []).forEach((p) => p.categories.forEach((cat) => cat.items.forEach((x) => { const k = g.courseId + '|' + x.title.toLowerCase(); if (!gradeIndex.has(k)) gradeIndex.set(k, x); }))));
    }
    return it.courseId ? gradeIndex.get(it.courseId + '|' + it.title.toLowerCase()) || null : null;
  };
  /** Schoology's gradebook shows it as submitted or graded. */
  S.isSubmitted = (it) => { if (it.fromOverdue || it.gbMissing) return false; /* Schoology's own overdue list outranks a zero entered in the gradebook */ const e = S.gradeEntry(it); return !!e && (e.status === 'graded' || e.status === 'pending'); };
  S.isComplete = (it) => S.isDone(it) || S.isSubmitted(it);
  S.statusOf = (it) => {
    if (S.isDone(it)) return { id: 'done', label: 'Done (marked by you)' };
    if (it.fromOverdue || it.gbMissing) return { id: 'missing', label: 'Not submitted' };
    if (it.due && it.due > Date.now()) return { id: 'upcoming', label: 'Not yet due' };
    return { id: 'past', label: 'Past due date' };
  };
  /** Priority is derived only from due date + title keywords, and is labelled as such in the UI. */
  S.priorityOf = (it) => {
    if (S.isDone(it)) return 'done';
    if (it.manual && it.priority && !S.isPastDue(it)) return it.priority; // student-chosen priority for their own items
    if (S.isOverdue(it) || S.isPastDue(it)) return 'critical';
    if (!it.due) return 'low';
    const hrs = (it.due - Date.now()) / 36e5;
    if (hrs < 0) return 'low';
    if (hrs <= 24 || (it.type === 'assessment' && hrs <= 72)) return 'high';
    if (hrs <= 72) return 'medium';
    return 'low';
  };
  S.PRIORITY = { critical: 'Overdue', high: 'Urgent', medium: 'Soon', low: 'Later', done: 'Done' };
  /* Student decisions live in prefs.reviewed: key -> 'include' | 'exclude'. Schoology's records are never touched. */
  S.isExcluded = (it) => S.prefs.reviewed[it.key] === 'exclude';
  /** Everything the student tracks: Schoology items not excluded, plus items they created. */
  S.allItems = () => [...Object.values(state.items).filter((i) => !S.isExcluded(i)), ...Object.values(S.prefs.manual || {})];
  S.excludedItems = () => Object.values(state.items).filter(S.isExcluded);
  /** Schoology items the student has not decided on yet (recent or upcoming only). */
  S.unreviewedItems = () => {
    const cut = Date.now() - 14 * S.DAY;
    return Object.values(state.items).filter((i) => i.type !== 'event' && !S.prefs.reviewed[i.key] && (!i.due || i.due >= cut))
      .sort((a, b) => (a.due ?? 9e15) - (b.due ?? 9e15));
  };
  /** The indicator colour for an assignment: one unified colour (the accent) unless the student turns on colour-coding by course. */
  /** The colour a course shows on cards, banners, rows and bars: one calm accent for every course unless the student turns on colour-coding. */
  S.tint = (courseId, name) => (S.prefs.tagColours ? S.courseColor(courseId, name) : (/^#[0-9a-f]{6}$/i.test(S.prefs.accent || '') ? S.prefs.accent : '#8aa8ff'));
  S.colorOf = (it) => (S.prefs.tagColours ? S.courseColor(it.courseId, it.courseName) : 'var(--accent)');
  S.data = { SEL, parseCourses, parseUpcoming, parseOverdue, parseAnnouncements, parseGrades, relink };
})();
