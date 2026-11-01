// Local stand-in for Schoology used only for smoke-testing the extension UI.
// Usage: node tests/mock-server.js   then open http://localhost:4173/home
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const hits = {};
let mode = 'ok'; // ok | expired | fail  (set with /__mode/<name>)
const D = 864e5, now = Date.now();
const at = (days, h = 23, m = 59) => { const d = new Date(now + days * D); d.setHours(h, m, 0, 0); return d; };
const fmt = (d) => d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) + ' at ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).toLowerCase();

const courses = [[101, 'AP Biology', 'Period 2'], [102, 'Algebra II', 'Period 4'], [103, 'World History', 'Period 6'], [104, 'English 10', 'Period 1']];
const ups = [
  [201, 'assignment', 'Cell Respiration Lab Report', 101, 0.4], [202, 'assignment', 'Problem Set 7.3', 102, 1.2], [203, 'assignment', 'Unit 5 Test', 101, 2.1],
  [204, 'assignment', 'Primary Source Analysis', 103, 3.3], [205, 'assignment', 'Reading Response: Ch. 9', 104, 4.2], [206, 'assignment', 'Quiz: Quadratics', 102, 6.1],
  [207, 'event', 'Picture Day', 104, 8.2], [208, 'assignment', 'Research Outline', 103, 11.1], [209, 'assignment', 'Midterm Exam', 104, 15.2],
];
const overdue = [[301, 'Vocabulary Quiz 4', 102, -2], [302, 'Lab Safety Form', 101, -5]];

const upcomingHtml = () => '<div class="upcoming-list">' + ups.map(([id, t, title, c, off]) => {
  const d = at(off | 0, 8 + ((id % 7)), 0);
  return `<h4 class="date-header">${d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</h4><div class="upcoming-event course-event" data-start="${Math.floor(d / 1000)}"><a href="/${t}/${id}/info">${title}</a><div class="realm-title-course"><a href="/course/${c}/materials">${courses.find((x) => x[0] === c)[1]}</a></div><span class="upcoming-time">${fmt(d)}</span></div>`;
}).join('') + '</div>';
const overdueHtml = () => '<div id="overdue-submissions"><ul>' + overdue.map(([id, title, c, off]) => `<li><a href="/assignment/${id}/info">${title}</a><span class="course-name">${courses.find((x) => x[0] === c)[1]}</span><span>Due ${fmt(at(off))}</span></li>`).join('') + '</ul></div>';
const coursesHtml = () => '<ul>' + courses.map(([id, n, s]) => `<li class="course-item"><a href="/course/${id}/materials"><div class="course-title">${n}</div></a><div class="course-subtitle">${s}</div></li>`).join('') + '</ul>';
const feedHtml = () => '<ul id="feed">' + [['Ms. Rivera', 101, 'Reminder: bring your lab notebooks Thursday. We will start the enzyme unit.'], ['Mr. Chen', 102, 'Quadratics quiz moved to Friday. Review sheet is posted under Materials.'], ['Mrs. Patel', 104, 'Midterm study guide is uploaded. Office hours Wednesday after school.']]
  .map(([a, c, b], i) => `<li class="edge-item" id="n${i}"><div class="edge-sentence"><span class="update-sentence-inner"><a href="/user/${i}">${a}</a> posted in <a href="/course/${c}/materials">${courses.find((x) => x[0] === c)[1]}</a></span></div><div class="update-body s-rte">${b}</div><span class="update-time">${i + 1}h ago</span></li>`).join('') + '</ul>';
const gradesHtml = () => '<ul class="s-grades-course-list">' + courses.map(([id, n, sec], i) => {
  const row = (cls, title, extra, grade) => `<tr class="report-row ${cls}"><th class="title-column clickable"><div class="td-content-wrapper"><span class="title"><a>${title}<span class="visually-hidden">${cls.includes('item') ? 'assignment' : ''}</span></a></span>${extra || ''}</div></th><td class="grade-column">${grade}</td><td class="comment-column">No comment</td></tr>`;
  const item = (t, due, g) => row('item-row', t, `<span class="due-date"><span class="visually-hidden">Due</span> Due ${due}</span>`, g);
  const letter = ['A (94.24%)', 'B+ (88.1%)', 'A- (91.5%)', 'A (96%)'][i];
  return `<li class="s-grades-course-item"><div id="s-js-gradebook-course-${id}" class="gradebook-course hierarchical-grading-report"><div class="gradebook-course-title">(CODE${id}) ${n.toUpperCase()}: (S1) Teacher${i}, A</div><div class="gradebook-course-grades"><table role="presentation"><tbody>` +
    row('course-row has-children', 'Course Grade', '', letter) + row('period-row has-children', 'S1 (2026-2027)', '<span> (100%)</span>', letter) +
    row('category-row has-children', 'Homework', '<span> (10%)</span>', 'A (95.71%)') +
    item('HW 1 See Description', '9/03/26', '5 / 5') + item('HW 2 Chapter review with a very long assignment name that should wrap onto several lines instead of stretching the whole table', '9/04/26', '18 / 20') +
    item('Lab write-up', '10/09/26 11:59pm', '<span class="visually-hidden"></span>Missing') + item('Reading', '10/12/26', '—<span class="visually-hidden">This student has made a submission that has not been graded</span>') +
    row('category-row has-children', 'Test', '<span> (60%)</span>', '—') + item('Unit Test', '10/20/26', '45 / 50') +
    `</tbody></table></div></div></li>`; }).join('') + '</ul>';

const shell = (body, extra = '') => `<!doctype html><html><head><meta charset="utf-8"><title>Schoology (mock)</title>
<link rel="stylesheet" href="/src/styles.css"><script src="/src/early.js"></script><style>body{margin:0;font-family:Arial;background:#fff}header{position:fixed;top:0;left:0;right:0;height:56px;background:#1c4a92;color:#fff;display:flex;align-items:center;padding:0 20px;z-index:50}#wrapper{padding-top:70px}#main-content-wrapper{padding:20px;background:#fff}.upcoming-event{padding:6px}</style></head>
<body><div id="wrapper"><header><b>schoology</b>&nbsp;mock native header</header><div id="main-content-wrapper">${body}</div></div>
${['core', 'banners', 'data', 'views', 'app'].map((f) => `<script src="/src/${f}.js"></script>`).join('')}${extra}</body></html>`;

const bannerCards = () => '<div class="course-dashboard__inner">' + [courses[0], courses[1]].map(([id, n]) => `<section class="sgy-card"><div class="sgy-card-lens"><img class="course-dashboard__card-lens-img" src="/icons/icon128.png"></div><div class="course-dashboard__card-context-title">${n}</div></section>`).join('') + '</div>';
const homeBody = () => `<h2>Native home (hidden by overhaul)</h2>${bannerCards()}<div id="feed-wrap">${feedHtml()}</div><aside><div class="upcoming-list-wrap">${upcomingHtml()}</div>${overdueHtml()}</aside><a href="/user/9" class="profile-name">Jordan Lee</a>`;

http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x'), p = u.pathname.replace(/\/$/, '') || '/';
  if (p === '/__hits') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify(hits)); }
  if (p === '/__reset') { for (const k in hits) delete hits[k]; res.writeHead(200); return res.end('ok'); }
  if (!p.startsWith('/src/') && !p.startsWith('/icons/')) hits[p] = (hits[p] || 0) + 1;
  if (p.startsWith('/__mode/')) { mode = p.split('/')[2]; res.writeHead(200); return res.end(mode); }
  if (p === '/login') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end('<html><body><form id="s-user-login"></form>Sign in</body></html>'); }
  const guarded = ['/home/upcoming_ajax', '/home/overdue_submissions_ajax', '/courses', '/grades/grades'];
  if (guarded.includes(p) && mode === 'expired') { res.writeHead(302, { location: '/login' }); return res.end(); }
  if (guarded.includes(p) && mode === 'fail') { res.writeHead(500); return res.end('boom'); }
  const send = (t, body) => { res.writeHead(200, { 'content-type': t }); res.end(body); };
  if (p.startsWith('/src/') || p.startsWith('/icons/')) { const f = path.join(root, p); return fs.existsSync(f) ? send(p.endsWith('.css') ? 'text/css' : p.endsWith('.js') ? 'text/javascript' : 'image/png', fs.readFileSync(f)) : (res.writeHead(404), res.end()); }
  if (p === '/home') return send('text/html', shell(homeBody()));
  if (p === '/home/upcoming_ajax') return send('application/json', JSON.stringify({ html: upcomingHtml() }));
  if (p === '/home/overdue_submissions_ajax') return send('application/json', JSON.stringify({ html: overdueHtml() }));
  if (p === '/courses') return send('text/html', shell('<h2>Native courses</h2>' + coursesHtml()));
  if (p === '/grades/grades') return send('text/html', shell(gradesHtml()));
  if (p === '/calendar') return send('text/html', shell('<h2>Native calendar</h2>'));
  if (/^\/(assignment|event)\/\d+/.test(p)) return send('text/html', shell('<a href="/course/101/materials">AP Biology</a><div class="assignment-description"><p>Write up your <b>findings</b> from the lab. Include a graph and a short conclusion.</p><script>alert(1)</script><img src=x onerror=alert(2)></div>'));
  if (/^\/course\//.test(p)) return send('text/html', shell('<h2>Native course page</h2><p>Folders and materials would be here.</p><button>Native button still works</button>'));
  send('text/html', shell('<h2>Other native page: ' + p + '</h2>'));
}).listen(4173, () => console.log('mock on http://localhost:4173/home'));
