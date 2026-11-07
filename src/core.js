/* Core: namespace, local preference store, DOM helper, icons, date utilities.
 * Everything is stored in chrome.storage.local. Nothing is ever sent anywhere. */
(() => {
  const S = (window.SGO = window.SGO || {});
  if (S.core) return;
  S.core = true;

  /* ---------- storage ---------- */
  const hasChrome = typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local;
  const mem = {};
  S.store = {
    get: (k) => new Promise((res) => {
      try { hasChrome ? chrome.storage.local.get(k, (r) => res(r && r[k])) : res(mem[k]); } catch (e) { res(undefined); }
    }),
    set: (k, v) => new Promise((res) => {
      try { hasChrome ? chrome.storage.local.set({ [k]: v }, res) : (mem[k] = v, res()); } catch (e) { res(); }
    }),
    remove: (k) => new Promise((res) => {
      try { hasChrome ? chrome.storage.local.remove(k, res) : (delete mem[k], res()); } catch (e) { res(); }
    }),
  };

  /* ---------- preferences ---------- */
  S.WIDGETS = {
    welcome:       { title: 'Welcome',            size: 'l' },
    analytics:     { title: 'Academic analytics',  size: 'l' },
    overdue:       { title: 'Overdue',            size: 'm' },
    deadlines:     { title: 'Upcoming by priority', size: 'm' },
    tests:         { title: 'Tests & assessments', size: 's' },
    week:          { title: 'Weekly workload', size: 'm' },
    calendar:      { title: 'Calendar',           size: 's' },
    announcements: { title: 'Announcements',      size: 'm' },
    courses:       { title: 'Your courses',       size: 'l' },
  };
  const defaultWidgets = () => Object.keys(S.WIDGETS).map((id) => ({ id, size: S.WIDGETS[id].size, hidden: false }));
  const DEFAULTS = () => ({
    accent: '#f0b46c', contour: '#d9b98a', contourGlow: '#c8843f', background: '#12100e', topoOn: true, topoDensity: 'standard', topoWeight: 'standard', topoSeed: 20260, gradeNotifs: [], gradeSeen: {}, gradeBase: false, classic: false, hypo: {}, gradesEdit: false,
    widgets: defaultWidgets(), courseColors: {}, courseMeta: {}, courseOrder: [], courseSort: 'custom', courseHidden: {}, tagColours: false, cleanNames: true, manual: {}, reviewed: {}, topLinks: {}, done: {},
  });
  S.DEFAULTS = DEFAULTS;
  S.prefs = DEFAULTS();
  S.loadPrefs = async () => {
    const saved = await S.store.get('sgo_prefs');
    const p = Object.assign(DEFAULTS(), saved || {});
    // reconcile widget list with the current set (add new, drop removed)
    const known = new Set((p.widgets || []).map((w) => w.id));
    p.widgets = (p.widgets || []).filter((w) => S.WIDGETS[w.id]);
    Object.keys(S.WIDGETS).forEach((id) => { if (!known.has(id)) p.widgets.push({ id, size: S.WIDGETS[id].size, hidden: false }); });
    if (p.courseSort === 'alpha') { p.courseSort = 'custom'; S.savePrefs(); } // the A-Z mode was removed: classes keep the student's own order
    S.prefs = p;
    if (p.designV === 8) { // the short-lived light redesign is withdrawn: bring back the dark topographic look unless the student chose their own colours
      const light = { accent: '#2457d6', contour: '#64748b', contourGlow: '#cbd5e1', background: '#f7f8fa' }, now = DEFAULTS();
      if (String(p.background).toLowerCase() === light.background) { Object.keys(light).forEach((k) => { if (String(p[k]).toLowerCase() === light[k]) p[k] = now[k]; }); p.topoOn = true; }
      p.designV = 7; S.savePrefs();
    }
    if (!p.blueV) { // one-time: the old charcoal default becomes the blue-and-white default; colours the student chose stay
      if (String(p.background).toLowerCase() === '#151311') { const now = DEFAULTS(); ['accent', 'contour', 'contourGlow', 'background'].forEach((k) => { p[k] = now[k]; }); p.topoOn = false; }
      delete p.blurBg; p.blueV = 1; S.savePrefs();
    }
    if ((p.blueV || 0) < 2) { // contour lines come back on the light theme, drawn a little darker so they show on white
      if (String(p.contour).toLowerCase() === '#cbd5e1') p.contour = '#9fb3cc';
      if (String(p.background).toLowerCase() === '#f8fafc') p.topoOn = true;
      p.blueV = 2; S.savePrefs();
    }
    if ((p.blueV || 0) < 3) { // the default is now a warm brown with clearly visible contour lines; a look the student chose themselves stays
      const bg = String(p.background).toLowerCase();
      if (bg === '#f8fafc' || bg === '#151311') { const now = DEFAULTS(); ['accent', 'contour', 'contourGlow', 'background'].forEach((k) => { p[k] = now[k]; }); p.topoOn = true; }
      p.blueV = 3; S.savePrefs();
    }
    if ((p.blueV || 0) < 4) { // the dark base is now #12100e; the previous brown default moves over, chosen colours stay
      if (String(p.background).toLowerCase() === '#33261d') p.background = '#12100e';
      p.blueV = 4; S.savePrefs();
    }
    if ((p.designV || 0) < 7) { // one-time: colours that were earlier defaults move to the current defaults; a colour the student picked stays
      const old = { accent: ['#5b6cff', '#2f8f83', '#20c5d9', '#7c9cff'], contour: ['#40526d'], contourGlow: ['#1d4f91'], background: [] }, now = DEFAULTS();
      Object.keys(old).forEach((k) => { if (old[k].includes(String(p[k]).toLowerCase())) p[k] = now[k]; });
      delete p.theme; p.designV = 7; S.savePrefs();
    }
    if ('bgBlur' in p) { delete p.bgBlur; S.savePrefs(); } // the blur used to be adjustable; it is part of the design now
    return p;
  };
  let saveT;
  S.savePrefs = () => { clearTimeout(saveT); saveT = setTimeout(() => S.store.set('sgo_prefs', S.prefs), 150); };
  S.resetPrefs = () => { S.prefs = DEFAULTS(); S.prefs.designV = 7; S.savePrefs(); };
  const C = window.SGO_COLOR;
  S.normHex = C.normHex; S.onAccent = C.onAccent;
  S.ACCENTS = [['Blue', '#3b82f6'], ['Sky', '#38bdf8'], ['Cyan', '#22d3ee'], ['Teal', '#14b8a6'], ['Emerald', '#10b981'], ['Green', '#22c55e'], ['Lime', '#84cc16'], ['Yellow', '#eab308'], ['Amber', '#f59e0b'], ['Orange', '#f97316'], ['Red', '#ef4444'], ['Rose', '#f43f5e'], ['Pink', '#f472b6'], ['Fuchsia', '#d946ef'], ['Purple', '#a855f7'], ['Violet', '#8b5cf6'], ['Indigo', '#6366f1'], ['Slate', '#94a3b8']];
  /* Curated looks: [accent, contour line, contour glow, background]. */
  S.THEME_PRESETS = [
    /* Single-colour families: the accent is the primary shade, and the contour lines and glow use its lighter and darker partner. Five light, five dark. */
    { id: 'cloud', name: 'Cloud', note: 'Cloud, light', accent: '#64748b', contour: '#94a3b8', contourGlow: '#64748b', background: '#f7f8fa' },
    { id: 'sage', name: 'Sage', note: 'Sage, light', accent: '#71816d', contour: '#9baa96', contourGlow: '#71816d', background: '#f3f5f1' },
    { id: 'lavender', name: 'Lavender', note: 'Lavender, light', accent: '#827493', contour: '#a99bb8', contourGlow: '#827493', background: '#f5f3f8' },
    { id: 'ocean', name: 'Ocean', note: 'Ocean, light', accent: '#607f99', contour: '#91afc5', contourGlow: '#607f99', background: '#f1f5f8' },
    { id: 'sand', name: 'Sand', note: 'Sand, light', accent: '#93816f', contour: '#b4a18d', contourGlow: '#93816f', background: '#f6f3ee' },
    { id: 'coal', name: 'Coal', note: 'Coal, dark', accent: '#a3a3a3', contour: '#a3a3a3', contourGlow: '#737373', background: '#171717' },
    { id: 'midnight', name: 'Midnight', note: 'Midnight, dark', accent: '#849ab5', contour: '#849ab5', contourGlow: '#607a98', background: '#141a24' },
    { id: 'forest', name: 'Forest', note: 'Forest, dark', accent: '#8ba18d', contour: '#8ba18d', contourGlow: '#657d69', background: '#171e19' },
    { id: 'aubergine', name: 'Aubergine', note: 'Aubergine, dark', accent: '#a394b5', contour: '#a394b5', contourGlow: '#78698b', background: '#201b26' },
    { id: 'graphite', name: 'Graphite', note: 'Graphite, dark', accent: '#a5a6aa', contour: '#a5a6aa', contourGlow: '#77797e', background: '#202124' },
  ];
  /** Push the four appearance colours (accent, contour, glow, background) to the page. Called after every change; nothing reloads. */
  S.applyTheme = () => { if (window.__sgoTheme) window.__sgoTheme(S.prefs); document.documentElement.classList.toggle('sgo-collapsed', !!S.prefs.collapsed); };
  /** 'light', 'dark' or 'system'. Colours the student picked are kept; only the brightness of the page follows the mode. */
  S.setThemeMode = (m) => { if (!['light', 'dark', 'system'].includes(m)) return; S.prefs.themeMode = m; S.savePrefs(); S.applyTheme(); };
  /** Accessibility choices: text size ('' | 'lg' | 'xl'), high contrast and reduced motion. Applied as classes on <html> by applyTheme. */
  S.setA11y = (patch) => {
    const P = S.prefs;
    if ('textSize' in patch && ['', 'lg', 'xl'].includes(patch.textSize)) P.textSize = patch.textSize;
    if ('highContrast' in patch) P.highContrast = !!patch.highContrast;
    if ('reduceMotion' in patch) P.reduceMotion = !!patch.reduceMotion;
    S.savePrefs(); S.applyTheme();
  };
  S.themeMode = () => S.prefs.themeMode || (C.isDark(S.prefs.background) ? 'dark' : 'light');
  S.setAppearance = (patch) => {
    const out = {};
    for (const k of Object.keys(patch)) { const hex = C.normHex(patch[k]); if (!hex) return false; out[k] = hex; }
    Object.assign(S.prefs, out);
    // a new background of the other brightness wins over an earlier Light/Dark choice, so a colour theme is never silently overridden
    if (out.background && S.prefs.themeMode) S.prefs.themeMode = C.isDark(out.background) ? 'dark' : 'light';
    S.savePrefs(); S.applyTheme(); return true;
  };
  /** The map's own settings: on or off, line density and which map (seed). Its blur is fixed in the design (theme.css). */
  S.setMap = (patch) => {
    const P = S.prefs;
    if ('topoOn' in patch) P.topoOn = !!patch.topoOn;
    if ('topoDensity' in patch && ['light', 'standard', 'dense'].includes(patch.topoDensity)) P.topoDensity = patch.topoDensity;
    if ('topoWeight' in patch && ['thin', 'standard', 'bold'].includes(patch.topoWeight)) P.topoWeight = patch.topoWeight;
    if ('topoStrength' in patch && ['faint', 'standard', 'strong'].includes(patch.topoStrength)) P.topoStrength = patch.topoStrength;
    if ('topoStyle' in patch && ['solid', 'dashed'].includes(patch.topoStyle)) P.topoStyle = patch.topoStyle;
    if ('density' in patch && ['comfortable', 'compact'].includes(patch.density)) P.density = patch.density;
    if ('topoSeed' in patch) P.topoSeed = Math.max(1, Math.round(Number(patch.topoSeed) || 20260));
    S.savePrefs(); S.applyTheme();
  };
  S.resetAppearance = () => { const d = DEFAULTS(); S.setAppearance({ accent: d.accent, contour: d.contour, contourGlow: d.contourGlow, background: d.background }); S.setMap({ topoOn: d.topoOn, topoDensity: d.topoDensity, topoWeight: d.topoWeight, topoStrength: 'standard', topoStyle: 'solid', topoSeed: d.topoSeed }); };

  /* ---------- DOM helper (text is always a text node => no injection) ---------- */
  S.h = function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    if (props) for (const k in props) {
      const v = props[k];
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') for (const p in v) { if (p.startsWith('--')) el.style.setProperty(p, v[p]); else el.style[p] = v[p]; } // custom properties (--c) need setProperty
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (/^on/i.test(k)) continue; // an inline handler written as a string is never allowed
      else if (/^(href|src|action|formaction|xlink:href)$/i.test(k) && /^\s*(javascript|vbscript|data:text\/html)/i.test(String(v))) continue; // script URLs never become links
      else el.setAttribute(k, v === true ? '' : v);
    }
    const add = (c) => {
      if (c == null || c === false) return;
      if (Array.isArray(c)) c.forEach(add);
      else el.append(c.nodeType ? c : document.createTextNode(String(c)));
    };
    kids.forEach(add);
    return el;
  };
  const h = S.h;

  /* ---------- icons (static, trusted markup) ---------- */
  const P = {
    home: '<path d="M4 11l8-7 8 7"/><path d="M6 10v10h12V10"/><path d="M10 20v-6h4v6"/>',
    book: '<path d="M5 4h13v16H5z"/><path d="M9 4v16"/>',
    tasks: '<path d="M4 4h16v16H4z"/><path d="M8 12l3 3 5-6"/>',
    calendar: '<path d="M4 6h16v14H4z"/><path d="M4 10h16M8 3v4M16 3v4"/>',
    grades: '<path d="M3 20h18"/><path d="M6 20v-8M12 20V5M18 20v-5"/>',
    folder: '<path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    alert: '<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18v.01"/>',
    external: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5"/>',
    edit: '<path d="M4 20h4L19 9a2.8 2.8 0 00-4-4L4 16z"/>',
    eyeoff: '<path d="M3 3l18 18M10.6 6.2A9.8 9.8 0 0112 6c5 0 8.5 4 9.5 6a14 14 0 01-3 3.7M6.6 7.6C4.5 9 3 11 2.5 12c1 2 4.5 6 9.5 6a9 9 0 004-1"/>',
    drag: '<circle cx="9" cy="6" r="1.2"/><circle cx="15" cy="6" r="1.2"/><circle cx="9" cy="12" r="1.2"/><circle cx="15" cy="12" r="1.2"/><circle cx="9" cy="18" r="1.2"/><circle cx="15" cy="18" r="1.2"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    unlock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 7.4-2"/>',
    send: '<path d="M22 2 11 13M22 2l-7 20-4-9-9-4z"/>',
    up: '<path d="M6 15l6-6 6 6"/>',
    down: '<path d="M6 9l6 6 6-6"/>',
    left: '<path d="M15 5l-7 7 7 7"/>',
    right: '<path d="M9 5l7 7-7 7"/>',
    arrowRight: '<path d="M5 12h14"/><path d="M13 6l6 6-6 6"/>',
    resetOrder: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>',
    mega: '<path d="M3 11v3a1 1 0 001 1h2l7 4V6L6 10H4a1 1 0 00-1 1zM17 9a4 4 0 010 6"/>',
    logout: '<path d="M10 4H6a2 2 0 00-2 2v12a2 2 0 002 2h4M15 8l4 4-4 4M19 12H9"/>',
    flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
    resize: '<path d="M4 20l16-16M14 4h6v6M10 20H4v-6"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19"/>',
    moon: '<path d="M20 14.5A8 8 0 019.5 4 8 8 0 1020 14.5z"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    panel: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M9 4v16"/>',
    palette: '<circle cx="12" cy="12" r="9"/><circle cx="8.5" cy="10.5" r="1"/><circle cx="12" cy="7.5" r="1"/><circle cx="15.5" cy="10.5" r="1"/><path d="M12 21a2.5 2.5 0 010-5h1.5a2 2 0 000-4"/>',
    bell: '<path d="M6 17v-6a6 6 0 0112 0v6"/><path d="M4 17h16M10 20.5h4"/>',
    trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
    image: '<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="1.6"/><path d="M4 18l5-5 4 4 3-3 4 4"/>',
    dots: '<circle cx="5" cy="12" r="1.4" fill="currentColor"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/><circle cx="19" cy="12" r="1.4" fill="currentColor"/>',
    groups: '<circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0112 0v2"/><path d="M16 5.2a3 3 0 010 5.6M18.5 14.4A6 6 0 0121 18v2"/>',
    inbox: '<path d="M4 5h16v14H4z"/><path d="M4 13h5l1 2h4l1-2h5"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 113.5 2.3c-.6.3-1 .8-1 1.5v.7"/><path d="M12 17.5v.01"/>',
    access: '<circle cx="12" cy="4.5" r="1.5"/><path d="M5 8.5h14M12 8.5V14M9 21l3-7 3 7"/>',
    rocket: '<path d="M5 15c-1.5 1-2 4-2 4s3-.5 4-2"/><path d="M14 4c3 0 5 2 5 5-1.5 4-5 7-7 7-1 0-2-.5-2.5-1.5l-1-1C8 12.500 7 10.500 7 10c0-2 3-6 7-6z"/><circle cx="14" cy="10" r="1.4"/>',
    notepad: '<path d="M6 3h12v18H6z"/><path d="M9 8h6M9 12h6M9 16h4"/>',
    file: '<path d="M7 3h8l4 4v14H7z"/><path d="M15 3v4h4"/>',
    link: '<path d="M10 14a4 4 0 005.700 0l3-3a4 4 0 00-5.700-5.700l-1 1"/><path d="M14 10a4 4 0 00-5.700 0l-3 3a4 4 0 005.700 5.700l1-1"/>',
    slides: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M12 16v4M8 20h8"/>',
    sheet: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 10h16M4 15h16M10 4v16"/>',
    download: '<path d="M12 4v11M7 11l5 5 5-5M5 20h14"/>',
    reload: '<path d="M20 11a8 8 0 10-2.3 5.7M20 5v6h-6"/>',
    trendUp: '<path fill="currentColor" stroke="none" d="M12 3.2l7.6 8.3h-4.6V21H9V11.5H4.4z"/>',
    trendDown: '<path fill="currentColor" stroke="none" d="M12 20.8l-7.6-8.3H9V3h6v9.5h4.6z"/>',
    arrowUp: '<path d="M12 19V5M6 11l6-6 6 6"/>',
    arrowDown: '<path d="M12 5v14M6 13l6 6 6-6"/>',
    search: '<circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5 5"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  };
  S.icon = (name, size = 18) => {
    const t = document.createElement('template');
    t.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || ''}</svg>`;
    return t.content.firstChild;
  };

  /* ---------- dates ---------- */
  const DAY = 864e5;
  S.DAY = DAY;
  S.sod = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x.getTime(); };
  S.sameDay = (a, b) => S.sod(a) === S.sod(b);
  const MON = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  const WD = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  S.MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  S.WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  /** Parse human text such as "Due Tuesday, March 4 at 11:59 pm" -> {ts, timed} or null. */
  S.parseDue = (text, now = Date.now()) => {
    if (!text) return null;
    const t = String(text).replace(/\s+/g, ' ');
    let d = null;
    let m = t.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?/i);
    if (m) {
      const mo = MON.indexOf(m[1].toLowerCase());
      const base = new Date(now);
      let y = m[3] ? +m[3] : base.getFullYear();
      d = new Date(y, mo, +m[2]);
      if (!m[3] && d.getTime() < now - 200 * DAY) d = new Date(y + 1, mo, +m[2]);
    } else if ((m = t.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/))) {
      d = new Date(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[1] - 1, +m[2]);
    } else if (/\btoday\b/i.test(t)) d = new Date(S.sod(now));
    else if (/\btomorrow\b/i.test(t)) d = new Date(S.sod(now) + DAY);
    else if (/\byesterday\b/i.test(t)) d = new Date(S.sod(now) - DAY);
    else if ((m = t.match(/\b(sun|mon|tue|wed|thu|fri|sat)[a-z]*\b/i))) {
      const want = WD.indexOf(m[1].toLowerCase());
      const cur = new Date(now).getDay();
      d = new Date(S.sod(now) + ((want - cur + 7) % 7) * DAY);
    }
    if (!d || isNaN(d)) return null;
    const tm = t.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i);
    if (tm) {
      let hr = +tm[1] % 12; if (/pm/i.test(tm[3])) hr += 12;
      d.setHours(hr, +(tm[2] || 0), 0, 0);
      return { ts: d.getTime(), timed: true };
    }
    d.setHours(23, 59, 0, 0);
    return { ts: d.getTime(), timed: false };
  };

  const pad = (n) => String(n).padStart(2, '0');
  S.fmtTime = (ts) => { const d = new Date(ts), h = d.getHours() % 12 || 12, m = d.getMinutes(); return `${h}${m ? ':' + pad(m) : ''} ${d.getHours() < 12 ? 'AM' : 'PM'}`; }; // 12-hour, local timezone
  S.fmtDate = (ts, withYear) => { const d = new Date(ts); return `${S.WEEKDAYS[d.getDay()]}, ${S.MONTHS[d.getMonth()].slice(0, 3)} ${d.getDate()}${withYear ? ', ' + d.getFullYear() : ''}`; };

  /** Short relative description of a due time. */
  S.relDue = (ts, now = Date.now()) => {
    if (ts == null) return 'No due date';
    const diff = ts - now;
    const days = Math.round((S.sod(ts) - S.sod(now)) / DAY);
    if (diff < 0) {
      if (days === 0) return 'Was due today';
      return `${-days} day${days === -1 ? '' : 's'} overdue`;
    }
    if (days === 0) return 'Due today';
    if (days === 1) return 'Due tomorrow';
    if (days < 7) return `Due ${S.WEEKDAYS[new Date(ts).getDay()]} · in ${days} days`;
    return `Due ${S.fmtDate(ts)}`;
  };

  /* Bands from the spec: 5:00-11:59 morning, 12:00-16:59 afternoon, 17:00-4:59 evening. */
  S.greeting = (now = new Date()) => { const hr = now.getHours(); return hr >= 5 && hr < 12 ? 'Good morning' : hr >= 12 && hr < 17 ? 'Good afternoon' : 'Good evening'; };

  /* ---------- colour ---------- */
  /* Fourteen distinct, evenly weighted colours for tagging courses. They read on every theme; new courses are given one by a stable hash of their id. */
  const PALETTE = ['#ef8a80', '#f2a65a', '#f2c14e', '#c4d65a', '#6fd3a0', '#3fc1b0', '#5ec2e8', '#6ea0ff', '#8f8cf5', '#b58af0', '#e58ad6', '#f07aa3', '#c9a27a', '#9aa5b4'];
  /* The same fourteen, organised by family so the picker reads as five small groups instead of one wall of colour. */
  S.COURSE_GROUPS = [['Warm', [['Coral', '#ef8a80'], ['Orange', '#f2a65a'], ['Amber', '#f2c14e'], ['Sand', '#c9a27a']]], ['Green', [['Lime', '#c4d65a'], ['Mint', '#6fd3a0'], ['Teal', '#3fc1b0']]],
    ['Blue', [['Sky', '#5ec2e8'], ['Blue', '#6ea0ff'], ['Indigo', '#8f8cf5']]], ['Purple & pink', [['Violet', '#b58af0'], ['Orchid', '#e58ad6'], ['Rose', '#f07aa3']]], ['Neutral', [['Slate', '#9aa5b4']]]];
  S.courseColor = (courseId, name) => {
    const k = courseId || name || '';
    if (S.prefs.courseColors[k]) return S.prefs.courseColors[k];
    let hash = 0; for (const ch of String(k)) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
    return PALETTE[hash % PALETTE.length];
  };

  /* ---------- course personalisation (names/covers/order are local overrides; ids and links never change) ---------- */
  S.ckey = (id, name) => id || name || '';
  S.cmeta = (id, name) => S.prefs.courseMeta[S.ckey(id, name)] || {};
  /* Automatic clean-up of raw Schoology titles, e.g.
   *   "(MATH&151) CALCULUS I /AP CALC AB: (S1) Crane, A"  ->  "AP Calculus AB"
   * Rules: drop (...) tags, drop ": section / teacher" tails and a trailing "Last, F",
   * prefer the "/" alternative that names AP/IB/Honors, expand common abbreviations, tidy casing. */
  /* Built-in dictionary. Users extend or override it in Settings → Name fixes (stored in prefs.nameRules).
   *   expand: word -> display form (matched regardless of capitals)
   *   keep:   acronyms that stay uppercase                                                             */
  const DEFAULT_KEEP = ['AP', 'IB', 'AB', 'BC', 'I', 'II', 'III', 'IV', 'V', 'VI', 'US', 'CP', 'ELA', 'PE', 'SAT', 'ACT', 'CS', 'HS', 'ESL', 'ASL', 'STEM', 'JROTC', 'GT', 'DE', 'NCHS', 'TSA', 'FBLA', 'DECA', 'JV', 'VR', 'AR', 'ROTC', 'NHS'];
  const DEFAULT_EXPAND = { CALC: 'Calculus', PRECALC: 'Precalculus', ALG: 'Algebra', GEOM: 'Geometry', TRIG: 'Trigonometry', BIO: 'Biology', CHEM: 'Chemistry', PHYS: 'Physics',
    ENG: 'English', LANG: 'Language', LIT: 'Literature', COMP: 'Composition', HIST: 'History', GOV: 'Government', ECON: 'Economics', STAT: 'Statistics', STATS: 'Statistics', SCI: 'Science',
    ENV: 'Environmental', PSYCH: 'Psychology', HON: 'Honors', HONS: 'Honors', INTRO: 'Introduction', ADV: 'Advanced', SPAN: 'Spanish', AMER: 'American', EURO: 'European',
    MED: 'Medicine', TRNG: 'Training', TRAIN: 'Training', TRN: 'Training', ORCH: 'Orchestra', BAND: 'Band', THEA: 'Theatre', ART: 'Art', MUS: 'Music', PHYSED: 'Physical Education',
    FIN: 'Finance', ACCT: 'Accounting', BUS: 'Business', AG: 'Agriculture', PRE: 'Pre' };
  S.nameRules = () => {
    const u = S.prefs.nameRules || {};
    return { expand: Object.assign({}, DEFAULT_EXPAND, u.expand || {}), keep: new Set(DEFAULT_KEEP.concat(u.keep || []).map((x) => x.toUpperCase())) };
  };
  const cleanCache = new Map();
  S.cleanName = (raw) => {
    if (!raw) return '';
    if (cleanCache.has(raw)) return cleanCache.get(raw);
    const rules = S.nameRules();
    let t = String(raw).replace(/\s+/g, ' ').trim().replace(/\([^)]*\)/g, ' ');
    const segs = t.split(':').map((x) => x.trim());
    t = segs.find((x) => x && !/^(period|per\.?|section|sec\.?|block|pd\.?|s\d)\b/i.test(x)) || segs[0] || '';
    t = t.replace(/\s+/g, ' ').trim().replace(/\s+[A-Z][A-Za-z'’-]+,\s*[A-Z]\.?$/, '');
    const parts = t.split(/\s*\/\s*/).filter(Boolean);
    if (parts.length > 1) t = parts.find((p) => /\b(AP|IB|HONORS?|HON|CP|DE)\b/i.test(p)) || parts[0];
    t = t.split(/(\s+|[-&/])/).map((w) => {
      if (!/[A-Za-z]/.test(w)) return w;
      const u = w.toUpperCase();
      if (rules.expand[u]) return rules.expand[u];
      if (rules.keep.has(u)) return u;
      if (w === u && w.length <= 4) return u; // unknown short ALL-CAPS word: almost always an acronym
      return w === u ? w.charAt(0) + w.slice(1).toLowerCase() : w;
    }).join('').replace(/\s+/g, ' ').trim();
    const out = t.length >= 2 ? t : String(raw).trim();
    cleanCache.set(raw, out);
    return out;
  };
  /** The name exactly as Schoology gives it (spaces tidied, nothing parsed). Courses are renamed by hand, inline. S.cleanName stays only to match the same course across pages. */
  S.autoName = (name) => String(name || '').replace(/\s+/g, ' ').trim();
  /** Course code from the raw title, e.g. "MATH&151". */
  S.courseCode = (name) => { const m = /\(([A-Z]{2,6}\s?&?\s?\d{2,4}[A-Z]?)\)/.exec(name || ''); return m ? m[1] : ''; };
  S.cn = (id, name) => S.cmeta(id, name).name || S.autoName(name);
  S.setCourseMeta = (id, patch) => {
    const m = Object.assign({}, S.prefs.courseMeta[id], patch);
    Object.keys(m).forEach((k) => { if (m[k] === '' || m[k] == null) delete m[k]; });
    Object.keys(m).length ? (S.prefs.courseMeta[id] = m) : delete S.prefs.courseMeta[id];
    S.savePrefs();
  };
  /* ---------- hypothetical grades ----------
   * The student's own categories (each with a weight in %) and scores, for planning. Nothing here is read from or sent to Schoology.
   * Inside a category the grade is points earned over points possible. The course grade is the weighted average of the categories
   * that have scores; categories with none are left out and the rest are scaled up, so an empty category never drags the grade down. */
  const hyNum = (v) => typeof v === 'number' && Number.isFinite(v);
  S.hypoGrade = (cats, items) => {
    const rows = (cats || []).map((c) => {
      const mine = (items || []).filter((i) => i.cat === c.id && hyNum(i.earned) && hyNum(i.possible) && i.earned >= 0 && i.possible >= 0);
      const earned = mine.reduce((a, i) => a + i.earned, 0), possible = mine.reduce((a, i) => a + i.possible, 0);
      return { id: c.id, name: c.name, weight: Math.max(0, Number(c.weight) || 0), count: mine.length, earned, possible, percent: possible > 0 ? (earned / possible) * 100 : null };
    });
    const scored = rows.filter((r) => r.percent != null), totalWeight = rows.reduce((a, r) => a + r.weight, 0), usedWeight = scored.reduce((a, r) => a + r.weight, 0);
    let percent = null;
    if (usedWeight > 0) percent = scored.reduce((a, r) => a + r.weight * r.percent, 0) / usedWeight;
    else if (scored.length) { const e = scored.reduce((a, r) => a + r.earned, 0), p = scored.reduce((a, r) => a + r.possible, 0); percent = p > 0 ? (e / p) * 100 : null; } // every weight is 0: all points count equally
    return { percent, rows, totalWeight, usedWeight, weighted: usedWeight > 0 };
  };
  /* The hypothetical layer sits on top of the real gradebook (prefs.hypo[course]):
   *   cats     categories the student added, each with a weight
   *   items    scores the student added (cat is one of their categories, or "o:<name>" for a Schoology category)
   *   edits    "what if" scores for items Schoology already lists (by gradebook key), earned and/or possible
   *   weights  weights the student set for Schoology's own categories
   * Nothing is written to Schoology; with no layer the real grade is untouched. */
  S.gradeKey = (cat, it) => `${cat.name}|${it.title}|${it.dueText || ''}`;
  S.overlayGrade = (g, ov) => {
    ov = ov || {};
    const periods = (g.periods || []).filter((p) => p.categories.some((k) => k.items.length)), use = periods.length ? periods : (g.periods || []);
    const byId = new Map(), items = [], edits = ov.edits || {}, weights = ov.weights || {};
    use.forEach((p) => p.categories.forEach((cat) => {
      const id = 'o:' + cat.name; let k = byId.get(id);
      if (!k) { k = { id, name: cat.name, weight: weights[cat.name] != null ? weights[cat.name] : cat.weight == null ? null : Number(cat.weight), official: true, set: weights[cat.name] != null }; byId.set(id, k); }
      cat.items.forEach((it) => { const key = S.gradeKey(cat, it), e = edits[key] || {}; items.push({ id: key, key, cat: id, title: it.title, official: true, edited: !!edits[key], earned: 'earned' in e ? e.earned : it.earned, possible: 'possible' in e ? e.possible : it.possible }); });
    }));
    const cats = [...byId.values(), ...(ov.cats || []).map((k) => ({ id: k.id, name: k.name, weight: k.weight, custom: true }))];
    const all = [...items, ...(ov.items || []).map((i) => ({ id: i.id, cat: i.cat, title: i.title, earned: i.earned, possible: i.possible, custom: true }))];
    const r = S.hypoGrade(cats, all);
    const changed = !!((ov.cats || []).length || (ov.items || []).length || Object.keys(edits).length || Object.keys(weights).length);
    const officialCats = cats.filter((k) => k.official), someWeights = cats.some((k) => Number(k.weight) > 0);
    return Object.assign(r, { changed, cats, items: all, missingWeights: someWeights && officialCats.some((k) => !(Number(k.weight) > 0)) });
  };
  S.resetCourse = (id) => { delete S.prefs.courseMeta[id]; delete S.prefs.courseColors[id]; S.savePrefs(); };
  /** Courses detected from Schoology, ordered by the user's choice (custom drag order or A-Z). */
  S.orderedCourses = () => {
    const all = S.state.courses.slice(); // always the student's own order (set by dragging); there is no separate A-Z mode
    const pos = new Map(S.prefs.courseOrder.map((id, i) => [id, i]));
    return all.map((c, i) => [c, pos.has(c.id) ? pos.get(c.id) : 1e6 + i]).sort((a, b) => a[1] - b[1]).map((x) => x[0]);
  };

  /* ---------- HTML sanitiser for assignment descriptions ---------- */
  /** Only web links and same-site paths pass; javascript:, data:, file: and anything unparseable become '#'. */
  S.safeUrl = (href) => {
    if (typeof href !== 'string' || !href.trim()) return '#';
    try { const u = new URL(href.trim(), location.href); return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : '#'; } catch (e) { return '#'; }
  };
  /** True when a file address stays on this Schoology site (the reader only fetches those, with the student's own session). */
  S.isSiteUrl = (href) => { try { const u = new URL(href, location.href); return u.origin === location.origin || /(^|\.)schoology\.com$/i.test(u.hostname); } catch (e) { return false; } };
  S.sanitize = (html) => {
    const doc = new DOMParser().parseFromString(html || '', 'text/html');
    doc.querySelectorAll('script,style,iframe,frame,frameset,object,embed,applet,link,meta,form,base,noscript,template,svg,math,audio,video,source,track,input,button,textarea,select').forEach((n) => n.remove());
    doc.body.querySelectorAll('*').forEach((el) => {
      for (const a of [...el.attributes]) {
        const n = a.name.toLowerCase();
        const keep = (n === 'href' && /^(https?:|\/|#|mailto:)/i.test(a.value)) || (n === 'src' && /^(https?:|\/)/i.test(a.value)) || n === 'alt' || n === 'colspan' || n === 'rowspan';
        if (!keep) el.removeAttribute(a.name);
      }
      if (el.tagName === 'A') { el.setAttribute('target', '_blank'); el.setAttribute('rel', 'noopener noreferrer'); }
      if (el.tagName === 'IMG') { el.setAttribute('referrerpolicy', 'no-referrer'); el.setAttribute('loading', 'lazy'); }
    });
    const frag = document.createDocumentFragment();
    [...doc.body.childNodes].forEach((n) => frag.append(document.importNode(n, true)));
    return frag;
  };

  S.debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
})();
