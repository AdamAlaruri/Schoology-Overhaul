/* Data layer. Reads data Schoology already shows the signed-in user, either from the live
 * page DOM or via same-origin fetches that reuse the user's existing session cookie.
 * Nothing is sent to any third party; results are cached in chrome.storage.local only.
 *
 * Schoology markup differs between districts/versions, so every parser is tolerant, has
 * a generic fallback, and reports what it found in S.state.diag (Settings > Diagnostics). */
(() => {
  const S = window.SGO;
  if (S.data) return;

  /* ---- all page-structure assumptions live here, in one place ---- */
  const SEL = {
    courseTitle: '.course-title, .course-name, .course-item-title, [class*="course-title"]',
    courseSection: '.course-subtitle, .section-title, .course-section, [class*="section-title"]',
    upcomingBox: '.upcoming-event, .upcoming-list > *, [id*="upcoming"] li, [class*="upcoming-event"]',
    overdueRoot: '#overdue-submissions, .overdue-submissions, [id*="overdue"], [class*="overdue-submission"]',
    itemHref: /\/(assignment|event|assessment|discussion)\/\d+|\/course\/\d+\/(assignment|assessment|event)/i,
    feedItem: '.edge-item, li[id^="n"][class*="edge"], .feed-item',
    feedBody: '.update-body, .s-rte, .edge-body',
    feedTime: '.update-time, .small.gray, time',
    gradeCourse: '.gradebook-course', // one per course; holds a table of tr.report-row (course / period / category / item rows)
    desc: '.assignment-description, .info-body, .s-rte, [class*="assignment-description"], #main-content .content-body',
  };

  const state = (S.state = {
    courses: [], items: {}, announcements: [], grades: [], user: '', loading: false,
    loaded: false, diag: [], lastRefresh: 0,
    session: 'ok', fetchedAt: {}, banners: {}, // 'ok' | 'expired'; when each remote resource was last fetched (persisted)
  });
  const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();
  const abs = (href) => { try { return new URL(href, location.origin); } catch (e) { return null; } };

  /* ---------- fetching ---------- */
  const inflight = new Map(); // path -> promise: the same URL is never requested twice at once
  const gens = {};            // resource -> id of its latest request: older responses are ignored
  const TTL = { 'Fetch: courses': 10 * 6e4, 'Fetch: upcoming': 2 * 6e4, 'Fetch: overdue': 2 * 6e4, 'Fetch: home page': 5 * 6e4, 'Fetch: grades': 5 * 6e4 };
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
      const html = j && (j.html || (j.data && j.data.html) || j.content);
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

  /* ---------- parsers ---------- */
  function parseCourses(root) {
    const map = new Map();
    root.querySelectorAll('a[href*="/course/"]').forEach((a) => {
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
    let boxes = [...root.querySelectorAll(SEL.upcomingBox)];
    if (!boxes.length) boxes = [...root.querySelectorAll('a')].filter((a) => SEL.itemHref.test(a.getAttribute('href') || '')).map((a) => a.closest('li, tr, div') || a);
    boxes.forEach((box) => {
      box.querySelectorAll('a[href]').forEach((a) => {
        const it = itemFromAnchor(a, box);
        if (it && !out.has(it.key)) out.set(it.key, it);
      });
    });
    return [...out.values()];
  }

  function parseOverdue(root) {
    const rootEl = root.querySelector(SEL.overdueRoot);
    if (!rootEl) return { found: false, items: [] };
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
      const body = clean((li.querySelector(SEL.feedBody) || {}).textContent);
      if (!body) return;
      const links = [...li.querySelectorAll('.edge-sentence a, .update-sentence-inner a, a')];
      const courseA = links.find((a) => /\/(course|group)\/\d+/.test(a.getAttribute('href') || ''));
      const authorA = links.find((a) => /\/user\/\d+/.test(a.getAttribute('href') || '')) || links[0];
      const cm = courseA && courseA.getAttribute('href').match(/\/course\/(\d+)/);
      out.push({
        id: li.id || String(out.length), author: clean(authorA && authorA.textContent),
        courseName: clean(courseA && courseA.textContent), courseId: cm ? cm[1] : '',
        body: body.slice(0, 600), time: clean((li.querySelector(SEL.feedTime) || {}).textContent),
        url: courseA ? abs(courseA.getAttribute('href')).pathname : '',
      });
    });
    return out;
  }

  /* ---- original Schoology course banners ----
   * Each course card on the home Course Dashboard is a section.sgy-card holding the banner <img> and the course title.
   * Only the image URL is kept (the browser already has the file cached from Schoology's own page), and only for
   * Schoology's own hosts or this page's origin. Nothing is downloaded or modified. */
  function parseBanners(root) {
    const out = {};
    root.querySelectorAll('section.sgy-card').forEach((card) => {
      const img = card.querySelector('img.course-dashboard__card-lens-img'), title = card.querySelector('.course-dashboard__card-context-title');
      const src = img && (img.currentSrc || img.getAttribute('src'));
      if (!src || !title) return;
      let url; try { url = new URL(src, location.href); } catch (e) { return; }
      if (url.protocol !== 'https:' && url.origin !== location.origin) return;
      if (!/(^|\.)schoology\.com$/i.test(url.hostname) && url.origin !== location.origin) return;
      out[clean(title.textContent)] = url.href;
    });
    return out;
  }
  /** The original banner for a course, matched by its title: exact first, then by cleaned name when that is unambiguous. */
  S.originalBanner = (id, name) => {
    const c = state.courses.find((x) => x.id === id), raw = clean(c ? c.name : name);
    if (state.banners[raw]) return state.banners[raw];
    const key = S.cleanName(raw).toLowerCase();
    const hits = Object.entries(state.banners).filter(([t]) => S.cleanName(t).toLowerCase() === key);
    return hits.length === 1 ? hits[0][1] : '';
  };

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
          cat.items.push({ title, dueText, earned, possible, status, statusLabel });
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
    if (next.courseName && !next.courseId) { const c = state.courses.find((x) => x.name === next.courseName || next.courseName.includes(x.name)); if (c) next.courseId = c.id; }
    state.items[it.key] = next;
  }

  let changed = false;
  /** Signature of everything the UI renders. Comparing it avoids re-rendering when a scan finds identical data. */
  const sig = () => JSON.stringify([state.courses, Object.values(state.items).map(({ lastSeen, ...rest }) => rest), state.announcements, state.grades, state.user, state.banners]);
  S.stateSig = sig;
  /** Adopt cache written by another tab. Returns true only if the data actually differs. */
  S.adoptCache = (c) => {
    const before = sig();
    Object.assign(state, { courses: c.courses || [], items: c.items || {}, announcements: c.announcements || [], grades: c.grades || [], user: c.user || '', banners: c.banners || state.banners });
    return sig() !== before;
  };
  function applyUpcoming(list) { list.forEach(upsert); changed = changed || list.length > 0; }
  function applyOverdue(res) {
    if (!res.found) return;
    const seen = new Set(res.items.map((i) => i.key));
    Object.values(state.items).forEach((i) => { if (i.fromOverdue && !seen.has(i.key)) { i.fromOverdue = false; changed = true; } });
    res.items.forEach(upsert); changed = changed || res.items.length > 0;
  }
  function applyCourses(list) {
    if (!list.length) return;
    const merged = new Map(state.courses.map((c) => [c.id, c]));
    list.forEach((c) => merged.set(c.id, Object.assign(merged.get(c.id) || {}, c)));
    state.courses = [...merged.values()]; changed = true;
  }
  function diag(name, ok, count, note) {
    const i = state.diag.findIndex((d) => d.name === name);
    const row = { name, ok, count, note: note || '', at: Date.now() };
    i >= 0 ? (state.diag[i] = row) : state.diag.push(row);
  }

  function prune() {
    const cut = Date.now() - 90 * S.DAY;
    for (const k in state.items) { const i = state.items[k]; if ((i.due && i.due < cut) || i.lastSeen < Date.now() - 120 * S.DAY) delete state.items[k]; }
  }
  const saveCache = S.debounce(() => {
    prune();
    S.store.set('sgo_cache', { courses: state.courses, items: state.items, announcements: state.announcements, grades: state.grades, user: state.user, fetchedAt: state.fetchedAt, banners: state.banners });
  }, 500);
  S.clearCache = async () => { await S.store.remove('sgo_cache'); Object.assign(state, { courses: [], items: {}, announcements: [], grades: [], fetchedAt: {}, banners: {} }); };

  S.loadCache = async () => {
    const c = await S.store.get('sgo_cache');
    if (c) Object.assign(state, { courses: c.courses || [], items: c.items || {}, announcements: c.announcements || [], grades: c.grades || [], user: c.user || '', fetchedAt: c.fetchedAt || {}, banners: c.banners || {} });
  };

  /* ---------- live DOM scrape (the page Schoology itself rendered) ---------- */
  function findUser(root) {
    const cands = root.querySelectorAll('[class*="profile-name"], [class*="user-name"], [data-testid*="user-name"]');
    for (const el of cands) {
      const t = clean(el.getAttribute('aria-label') || el.textContent);
      if (t && t.length < 40 && !/^(profile|account|settings|my|view|edit|sign|log)/i.test(t) && /[a-z]/i.test(t)) return t;
    }
    return '';
  }

  S.scrapeLive = (root = document, scope = ['courses', 'upcoming', 'overdue', 'feed', 'grades', 'banners']) => {
    const before = sig();
    changed = false;
    const on = (k) => scope.includes(k);
    try {
      if (on('courses')) { const courses = parseCourses(root); applyCourses(courses); diag('Live page: courses', courses.length > 0, courses.length); }
      if (on('upcoming')) { const up = parseUpcoming(root); applyUpcoming(up); diag('Live page: upcoming', up.length > 0, up.length); }
      if (on('overdue')) { const od = parseOverdue(root); applyOverdue(od); diag('Live page: overdue', od.found, od.items.length, od.found ? '' : 'container not found'); }
      if (on('feed')) {
        const an = parseAnnouncements(root);
        if (an.length) { state.announcements = an; changed = true; }
        diag('Live page: announcements', an.length > 0, an.length);
      }
      if (on('grades')) {
        const gr = parseGrades(root);
        if (gr.length) { state.grades = gr; changed = true; }
        diag('Live page: grades', gr.length > 0, gr.length);
      }
      if (on('banners')) {
        const b = parseBanners(root);
        if (Object.keys(b).length) state.banners = Object.assign({}, state.banners, b);
        diag('Live page: banners', Object.keys(b).length > 0, Object.keys(b).length);
      }
      const u = findUser(root); if (u && u !== state.user) { state.user = u; changed = true; }
    } catch (e) { diag('Live page scrape', false, 0, String(e.message || e)); }
    changed = sig() !== before;
    if (changed) saveCache();
    return changed;
  };

  /* ---------- same-origin fetches (reuses the user's existing login) ---------- */
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
    } catch (e) { if (gens[name] === g) diag(name, false, 0, path + ' — ' + (e.message || e)); }
  }

  let pending = 0;
  /** Refresh remote data. Respects the cache lifetimes above unless forced, so switching tabs never refetches fresh data. */
  S.refresh = async (route, opts = {}) => {
    const force = !!opts.force, hostHome = location.pathname.replace(/\/+$/, '') === '/home';
    pending++; state.loading = true; const before = sig(); changed = false;
    // On /home, Schoology's own page already requests the upcoming and overdue lists and the live scrape reads them,
    // so asking again only duplicates those requests. Fetch them elsewhere, when forced, or as a fallback.
    const wantItems = !hostHome || force || !!opts.items;
    const jobs = [attempt('Fetch: courses', '/courses', parseCourses, applyCourses, force)];
    if (wantItems) jobs.push(attempt('Fetch: upcoming', '/home/upcoming_ajax', parseUpcoming, applyUpcoming, force),
                             attempt('Fetch: overdue', '/home/overdue_submissions_ajax', parseOverdue, applyOverdue, force));
    await Promise.all(jobs);
    if (wantItems && !Object.keys(state.items).length)
      await attempt('Fetch: home page', '/home', (doc) => Object.assign(parseUpcoming(doc), { _o: parseOverdue(doc) }), (r) => { applyUpcoming(r); applyOverdue(r._o); }, force);
    if (route === 'grades') await attempt('Fetch: grades', '/grades/grades', parseGrades, (g) => { if (g.length) { state.grades = g; changed = true; } }, force);
    pending--; state.loading = pending > 0; state.loaded = true; state.lastRefresh = Date.now();
    changed = sig() !== before;
    saveCache(); // also persists fetchedAt so the cache lifetimes survive a page reload
    return changed;
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
  S.isOverdue = (it) => !S.isDone(it) && !!it.fromOverdue;
  /** Past its due date and not marked done. Schoology does not reliably expose submissions, so this is the student's own view. */
  S.isPastDue = (it) => !S.isDone(it) && !!it.due && it.due < Date.now();
  /** Past its date but not on Schoology's missing list: it may well be submitted, so its status is unknown. Kept out of To-do and counts. */
  S.isStale = (it) => S.isPastDue(it) && !it.fromOverdue;
  S.statusOf = (it) => {
    if (S.isDone(it)) return { id: 'done', label: 'Done (marked by you)' };
    if (it.fromOverdue) return { id: 'missing', label: 'Not submitted' };
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
  S.courseOf = (it) => state.courses.find((c) => c.id === it.courseId) || null;
  S.colorOf = (it) => S.courseColor(it.courseId, it.courseName);
  S.data = { SEL, parseCourses, parseUpcoming, parseOverdue, parseAnnouncements, parseGrades, parseBanners };
})();
