// Local stand-in for Schoology used only for smoke-testing the extension UI.
// Usage: node tests/mock-server.js   then open http://localhost:4173/home
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const hits = {};
let mode = 'ok'; // ok | expired | fail | slow  (set with /__mode/<name>)
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

const upcomingHtml = (only) => '<div class="upcoming-list">' + ups.filter((u) => !only || u[1] === only).map(([id, t, title, c, off]) => {
  const d = at(off | 0, 8 + ((id % 7)), 0);
  return `<h4 class="date-header">${d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</h4><div class="upcoming-event course-event" data-start="${Math.floor(d / 1000)}"><a href="/${t}/${id}/info">${title}</a><div class="realm-title-course"><a href="/course/${c}/materials">${courses.find((x) => x[0] === c)[1]}</a></div><span class="upcoming-time">${fmt(d)}</span></div>`;
}).join('') + '</div>';
const overdueHtml = () => '<div id="overdue-submissions"><ul>' + overdue.map(([id, title, c, off]) => `<li><a href="/assignment/${id}/info">${title}</a><span class="course-name">${courses.find((x) => x[0] === c)[1]}</span><span>Due ${fmt(at(off))}</span></li>`).join('') + '</ul></div>';
const coursesHtml = () => '<ul>' + courses.map(([id, n, s]) => `<li class="course-item"><a href="/course/${id}/materials"><div class="course-title">${n}</div></a><div class="course-subtitle">${s}</div></li>`).join('') + '</ul>';
const feedHtml = () => '<ul id="feed">' + [['Ms. Rivera', 101, 'Reminder: bring your lab notebooks Thursday. We will start the enzyme unit.'], ['Mr. Chen', 102, 'Quadratics quiz moved to Friday. Review sheet is posted under Materials.'], ['Mrs. Patel', 104, 'Midterm study guide is uploaded. Office hours Wednesday after school.']]
  .map(([a, c, b], i) => `<li class="edge-item" id="n${i}"><div class="edge-sentence"><span class="update-sentence-inner"><a href="/user/${i}">${a}</a> posted in <a href="/course/${c}/materials">${courses.find((x) => x[0] === c)[1]}</a></span></div><div class="update-body s-rte">${b}</div><span class="update-time">${i + 1}h ago</span></li>`).join('') + '</ul>';
const gradesHtml = () => '<ul class="s-grades-course-list">' + courses.map(([id, n, sec], i) => {
  const row = (cls, title, extra, grade) => `<tr class="report-row ${cls}"><th class="title-column clickable"><div class="td-content-wrapper"><span class="title"><a>${title}<span class="visually-hidden">${cls.includes('item') ? 'assignment' : ''}</span></a></span>${extra || ''}</div></th><td class="grade-column">${grade}</td><td class="comment-column">${cls.includes('item') && title === 'Unit Test' ? 'Strong work on the free response.' : 'No comment'}</td></tr>`;
  const item = (t, due, g, href) => row('item-row', href ? `<a href="${href}">${t}</a>` : t, `<span class="due-date"><span class="visually-hidden">Due</span> Due ${due}</span>`, g);
  const letter = ['A (94.24%)', 'B+ (88.1%)', 'A- (91.5%)', 'A (96%)'][i];
  return `<li class="s-grades-course-item"><div id="s-js-gradebook-course-${id}" class="gradebook-course hierarchical-grading-report"><div class="gradebook-course-title">(CODE${id}) ${n.toUpperCase()}: (S1) Teacher${i}, A</div><div class="gradebook-course-grades"><table role="presentation"><tbody>` +
    row('course-row has-children', 'Course Grade', '', letter) + row('period-row has-children', 'S1 (2026-2027)', '<span> (100%)</span>', letter) +
    row('category-row has-children', 'Homework', '<span> (10%)</span>', 'A (95.71%)') +
    item('HW 1 See Description', '9/03/26', '5 / 5') + item('Lab Report', '11/03/26 11:59pm', '18 / 20', '/assignment/7001') + item('Unit 5 Test', '11/05/26', '—') + item('HW 2 Chapter review with a very long assignment name that should wrap onto several lines instead of stretching the whole table', '9/04/26', '18 / 20') +
    item('Lab write-up', '10/09/26 11:59pm', '<span class="visually-hidden"></span>Missing') + item('Reading', '10/12/26', '—<span class="visually-hidden">This student has made a submission that has not been graded</span>') +
    row('category-row has-children', 'Test', '<span> (60%)</span>', '—') + item('Unit Test', '10/20/26', '45 / 50') +
    `</tbody></table></div></div></li>`; }).join('') + '</ul>';

// ---- course content, same markup as Schoology's /course/<id>/materials ----
const FOLDERS = { // id -> [title, description]
  9001: ['Unit 1 Foundations', 'Unit start 9/1. Textbook ch 1-3'], 9002: ['Course Resources', ''], 9003: ['Empty Folder', ''], 9101: ['Cellular Respiration', 'Labs and notes'],
};
const frow = (cid, id) => `<tr id="f-${id}" class="material-row-folder dr odd"><td class="folder-contents-cell"><span class="folder-expander"><span class="visually-hidden">Expand folder.</span></span><div class="s-material-folder-row-wrapper"><span class="inline-icon folder-icon"><span class="visually-hidden">Folder.</span></span><div class="materials-folder item-info"><div class="folder-title"><a class="active" href="/course/${cid}/materials?f=${id}">${FOLDERS[id][0]}</a></div><div class="folder-description"><p>${FOLDERS[id][1]}</p></div></div></div></td></tr>`;
const drow = (cid, nid, name, size, icon) => `<tr id="n-${nid}" class="dr type-document odd"><td class="folder-contents-cell"><div class="s-material-folder-row-wrapper"><span class="inline-icon ${icon}"><span class="visually-hidden">File</span></span><div class="item-info"><div class="item-title"><a href="/course/${cid}/materials/gp/${nid}"></a></div><div class="item-body"><span class="attachments-file"><a class="attachments-file-name" href="/attachment/${nid}/download">${name}</a><span class="attachments-file-size small gray">${size}</span></span></div><div class="item-subtitle">0 lesson plans</div></div></div></td></tr>`;
const lrow = (cid, nid, title) => `<tr id="n-${nid}" class="dr type-document even"><td class="folder-contents-cell"><div class="s-material-folder-row-wrapper"><span class="inline-icon link-icon"><span class="visually-hidden">Web Link</span></span><div class="item-info"><div class="item-title"><a href="https://example.org/${nid}">${title}</a></div><div class="item-body">Khan Academy video series</div></div></div></td></tr>`;
const arow = (cid, nid, aid, title, due) => `<tr id="n-${nid}" class="dr type-assignment even"><td class="folder-contents-cell"><div class="s-material-folder-row-wrapper"><span class="item-icon assignment-icon"><span class="visually-hidden">Assignment.</span></span><div class="item-info"><div class="item-title"><a href="/assignment/${aid}">${title}</a></div><div class="item-body">Read the handout first</div><div class="item-subtitle"><span class="small gray">Due ${due}</span> · 0 lesson plans</div></div></div></td></tr>`;
const qrow = (cid, nid, aid, title) => `<tr id="n-${nid}" class="dr type-common-assessment odd"><td class="folder-contents-cell"><div class="s-material-folder-row-wrapper"><div class="item-info"><div class="item-title"><a href="/assessment/${aid}">${title}</a></div></div></div></td></tr>`;
const page = (title, rows) => `<h1 class="page-title">${title}</h1><table id="folder-contents-table"><tbody>${rows}</tbody></table>`;
const materials = (cid, f) => {
  const name = (courses.find((c) => String(c[0]) === String(cid)) || [0, 'Course'])[1];
  if (!f) return page(name, frow(cid, 9001) + frow(cid, 9002) + frow(cid, 9003) + drow(cid, 5001, 'Syllabus.pdf', '186 KB', 'pdf-icon') + lrow(cid, 5002, 'Web Link Khan Academy'));
  if (f === '9001') return page(FOLDERS[9001][0], frow(cid, 9101) + drow(cid, 5011, 'Unit 1 Notes.docx', '47 KB', 'doc-icon') + arow(cid, 5012, 7001, 'Lab Report', 'Tuesday, November 3, 2026 at 11:59 pm') + drow(cid, 5013, 'Slides.pptx', '1.2 MB', 'ppt-icon'));
  if (f === '9101') return page(FOLDERS[9101][0], qrow(cid, 5021, 7002, 'Respiration Quiz') + arow(cid, 5022, 7003, 'Reflection', 'Friday, November 6, 2026') + drow(cid, 5023, 'Diagram.png', '88 KB', 'image-icon'));
  if (f === '9002') return page(FOLDERS[9002][0], lrow(cid, 5031, 'Web Link Textbook portal') + drow(cid, 5032, 'Lab Safety.pdf', '120 KB', 'pdf-icon'));
  if (f === '9003') return page(FOLDERS[9003][0], '');
  return page('Folder', '');
};
const courseFeed = (cid) => `<ul>${[['Reminder: bring your lab notebooks Thursday. We will start the enzyme unit. Please read chapter 4 before class and note any questions you have so we can use class time well and finish the lab.', 'Ms. Rivera'], ['Quiz moved to Friday.', 'Ms. Rivera']].map(([b, a], i) => `<li id="edge-assoc-${cid}${i}" class="first"><div class="edge-item"><span class="edge-sentence"><span class="update-sentence-inner"><a href="/user/9">${a}</a> posted in <a href="/course/${cid}/materials">Course</a></span></span><span class="update-body s-rte"><p>${b}</p></span><span class="created">Fri Oct 30, 2026 at 11:5${i} am</span></div></li>`).join('')}</ul>`;
const assignmentPage = () => `<h1 class="page-title">Lab Report <span class="visually-hidden">0 lesson plans</span></h1><div class="info-container"><span class="due-date"></span><span class="due-date">Due: Tuesday, November 3, 2026 at 11:59 pm</span><div class="info-body s-rte"><p>Write up your <b>findings</b>. Include a graph.</p><script>alert(1)</script></div></div>`;

// ---- inbox / groups, same markup as Schoology ----
const MSGS = [[9001, '[(BIO&101) AP BIOLOGY: (S1) Rivera, M (BIO&101) AP BIOLOGY(2)] Lab notebook reminder', 'Please bring your lab notebooks on Thursday.', 'Ms. Rivera', 'Fri Oct 30 2026 at 11:58 am', true],
  [9002, 'Quadratics quiz moved', 'The quiz is now on Friday. Review sheet is in Materials.', 'Mr. Chen', 'Thu Oct 29 2026 at 3:05 pm', false],
  [9003, 'Club meeting <b>tomorrow</b>', 'Bring snacks!', 'Jordan Kim', 'Mon Oct 26 2026 at 8:00 am', false]];
const inbox = (sent) => `<h1 class="page-title">Messages</h1><div id="tabs-wrapper"><a href="/messages">Inbox</a><a href="/messages/sent">Sent Messages</a></div><form id="edit-privatemsg-list"><table id="privatemsg-list" class="privatemsg-list sticky-enabled"><thead><tr><th class="select-all"></th><th class="privatemsg-header-subject"><a href="/messages?order=subject" class="active">Subject</a></th></tr></thead><tbody>${(sent ? MSGS.slice(0, 1) : MSGS).map(([id, subj, body, who, when, unread], i) => `<tr class="${i % 2 ? 'even' : 'odd'}${unread ? ' new' : ''}"><td><input type="checkbox" class="form-checkbox" value="${id}"></td><td class="privatemsg-list-subject" subject="${subj}"><div class="picture"></div><div class="wrapper"><a class="subject-link" href="/messages/view/${id}?x=1">${subj}</a><p class="privatemsg-list-body">${body}</p><p class="names-date"><a href="/user/9">${who}</a> <span class="small gray">${when}</span></p></div></td></tr>`).join('')}</tbody></table></form>`;
const thread = (id) => { const m = MSGS.find((x) => String(x[0]) === id) || MSGS[0]; return `<div class="message-title">${m[1]}</div><div class="message-participants">Between You and ${m[3]}</div><div class="message-view-row clearfix"><div class="message-body"><div class="name"><a href="/user/9">${m[3]}</a><span class="small gray">${m[4]}</span></div><p>${m[2]} <b>Thanks!</b></p><script>alert(1)</script><div class="s-message-attachments-container"><div class="s-message-attachments"><a href="/attachment/77/download">worksheet.pdf</a></div></div><div class="s_message_actions">Reply</div></div></div>${sentReplies.filter((r) => r[0] === id).map((r) => `<div class="message-view-row"><div class="message-body"><div class="name"><a href="/user/1">Jordan Lee</a><span class="small gray">Sun Nov 1 2026 at 9:00 am</span></div><p>${r[1]}</p></div></div>`).join('')}${form(`/messages/view/${id}`, false)}`; };
const sentReplies = [], sentNew = [];
const form = (action, isNew) => `<form id="privatemsg-new" method="post" action="${action}">${isNew ? '<input type="text" id="edit-recipient" name="edit-recipient" class="ac_input"><input type="text" name="subject">' : ''}<textarea name="body" id="edit-body"></textarea><input type="hidden" name="sid" value="123"><input type="hidden" name="form_build_id" value="form-abc"><input type="hidden" name="form_token" value="tok-xyz"><input type="hidden" name="form_id" value="privatemsg_new"><input type="submit" name="op" value="Send"></form>`;
const GROUPS = [[5001, 'Robotics Club', 'Skyview High School  42 members'], [5002, 'Class of 2027', 'Skyview High School  210 members'], [5003, 'NHS', 'Skyview High School  88 members'], [5004, 'Debate Team', 'Skyview High School  19 members']];
const groupsHtml = () => `<h1 class="page-title">Groups</h1>${GROUPS.map(([id, n, i]) => `<div class="mygroups-list-item"><a href="/group/${id}"><div class="picture"><img src="/icons/icon48.png" alt=""></div></a><div class="middle"><a class="group-title" href="/group/${id}">${n}</a><p class="info"><a href="/school/1">Skyview High School</a> ${i.split('  ')[1]}</p></div></div>`).join('')}`;
const groupFeed = (gid) => `<ul>${[['Coach Lee', 'Practice moved to the lab on Tuesday at 3:30.'], ['Sam Ortiz', 'Who can bring the spare batteries?']].map(([a, b], i) => `<li id="edge-assoc-${gid}${i}" class="first"><div class="edge-item"><span class="edge-sentence"><span class="update-sentence-inner"><a href="/user/9">${a}</a> posted in <a href="/group/${gid}">Group</a></span></span><span class="update-body s-rte"><p>${b}</p></span><span class="created">Thu Oct 29, 2026 at 4:1${i} pm</span></div></li>`).join('')}</ul>`;

// the same script list and order the extension itself loads
const EARLY_JS = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'manifest.json'), 'utf8')).content_scripts.find((c) => c.run_at === 'document_start').js;
const MAIN_CSS = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'manifest.json'), 'utf8')).content_scripts.find((c) => c.css).css;
const MAIN_SCRIPTS = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'manifest.json'), 'utf8')).content_scripts.find((c) => c.run_at !== 'document_start').js;
const shell = (body, extra = '') => `<!doctype html><html><head><meta charset="utf-8"><title>Schoology (mock)</title>
${MAIN_CSS.map((f) => `<link rel="stylesheet" href="/${f}">`).join('')}<script>/* stand-in for chrome.storage.local, kept in localStorage so settings survive a reload like they do in the extension */
window.chrome = window.chrome || {}; chrome.runtime = { id: 'mock' };
(function () { var rd = function (k) { try { return JSON.parse(localStorage.getItem('mock_' + k)); } catch (e) { return null; } };
chrome.storage = { onChanged: { addListener: function () {} }, local: {
  get: function (k, cb) { var ks = Array.isArray(k) ? k : [k], o = {}; ks.forEach(function (x) { var v = rd(x); if (v !== null) o[x] = v; }); cb(o); },
  set: function (o, cb) { for (var k in o) localStorage.setItem('mock_' + k, JSON.stringify(o[k])); if (cb) cb(); },
  remove: function (k, cb) { localStorage.removeItem('mock_' + k); if (cb) cb(); } } }; })();</script>${EARLY_JS.map((f) => `<script src="/${f}"></script>`).join('')}<style>body{margin:0;font-family:Arial;background:#fff}header{position:fixed;top:0;left:0;right:0;height:56px;background:#1c4a92;color:#fff;display:flex;align-items:center;padding:0 20px;z-index:50}#wrapper{padding-top:70px}#main-content-wrapper{padding:20px;background:#fff}.upcoming-event{padding:6px}</style></head>
<body><div id="wrapper"><header id="header"><b>schoology</b>&nbsp;mock native header<button aria-label="2 unread messages">msgs</button><button aria-label="1 unread notifications">bell</button><button><img src="/icons/icon48.png" alt="">Jordan Lee</button></header><div id="main-content-wrapper">${body}</div></div>
${MAIN_SCRIPTS.map((f) => `<script src="/${f}"></script>`).join('')}${extra}</body></html>`;

const bannerCards = () => '<div class="course-dashboard__inner">' + [courses[0], courses[1]].map(([id, n]) => `<section class="sgy-card"><div class="sgy-card-lens"><img class="course-dashboard__card-lens-img" src="/icons/icon128.png"></div><div class="course-dashboard__card-context-title">${n}</div></section>`).join('') + '</div>';
const homeBody = () => `<h2>Native home (hidden by overhaul)</h2>${bannerCards()}<div id="feed-wrap">${feedHtml()}</div><aside><div class="upcoming-list-wrap">${upcomingHtml()}</div>${overdueHtml()}</aside><a href="/user/9" class="profile-name">Jordan Lee</a>`;

http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x'), p = u.pathname.replace(/\/$/, '') || '/';
  if (p === '/__hits') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify(hits)); }
  if (p === '/__reset') { for (const k in hits) delete hits[k]; res.writeHead(200); return res.end('ok'); }
  if (!p.startsWith('/src/') && !p.startsWith('/icons/')) hits[p] = (hits[p] || 0) + 1;
  if (p.startsWith('/__mode/')) { mode = p.split('/')[2]; res.writeHead(200); return res.end(mode); }
  if (p === '/login') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end('<html><body><form id="s-user-login"></form>Sign in</body></html>'); }
  const guarded = ['/home/upcoming_ajax', '/home/upcoming_submissions_ajax', '/home/overdue_submissions_ajax', '/home/feed', '/courses', '/grades/grades'];
  if (guarded.includes(p) && mode === 'expired') { res.writeHead(302, { location: '/login' }); return res.end(); }
  if (guarded.includes(p) && mode === 'fail') { res.writeHead(500); return res.end('boom'); }
  if (/^\/(messages|groups|group\/)/.test(p) && mode === 'expired') { res.writeHead(302, { location: '/login' }); return res.end(); }
  if (/^\/(messages|groups|group\/)/.test(p) && mode === 'fail') { res.writeHead(500); return res.end('boom'); }
  const send = (t, body) => { res.writeHead(200, { 'content-type': t }); res.end(body); };
  if (p.startsWith('/src/') || p.startsWith('/icons/') || p.startsWith('/fonts/') || p.startsWith('/banners/')) {
    const f = path.join(root, p);
    if (!fs.existsSync(f)) { res.writeHead(404); return res.end(); }
    // the extension addresses its bundled files as chrome-extension://<id>/...; in this mock they live at the site root
    if (p.endsWith('.css')) return send('text/css', fs.readFileSync(f, 'utf8').split('chrome-extension://__MSG_@@extension_id__/').join('/'));
    return send(p.endsWith('.js') ? 'text/javascript' : p.endsWith('.woff2') ? 'font/woff2' : p.endsWith('.jpg') ? 'image/jpeg' : 'image/png', fs.readFileSync(f));
  }
  if (p === '/home') return send('text/html', shell(homeBody()));
  if (p === '/home/upcoming_ajax') return send('application/json', JSON.stringify({ html: upcomingHtml('event') }));
  if (p === '/home/upcoming_submissions_ajax') return send('application/json', JSON.stringify({ html: upcomingHtml('assignment') }));
  if (p === '/home/feed') return send('application/json', JSON.stringify({ output: feedHtml() }));
  if (p === '/home/overdue_submissions_ajax') return send('application/json', JSON.stringify({ html: overdueHtml() }));
  if (p === '/courses') return send('text/html', shell('<h2>Native courses</h2>' + coursesHtml()));
  if (p === '/grades/grades') return send('text/html', shell(gradesHtml()));
  if (p === '/messages' || p === '/messages/sent') return send('text/html', shell(inbox(p === '/messages/sent')));
  if (/^\/messages\/view\/\d+$/.test(p) && req.method === 'POST') {
    let b = ''; req.on('data', (c) => { b += c; }); req.on('end', () => {
      const f = new URLSearchParams(b);
      if (f.get('form_token') !== 'tok-xyz' || !f.get('body')) return send('text/html', shell('<div class="messages error">Could not send.</div>' + thread(p.split('/')[3])));
      sentReplies.push([p.split('/')[3], f.get('body').replace(/</g, '&lt;')]); send('text/html', shell(thread(p.split('/')[3])));
    }); return; }
  if (/^\/messages\/view\/\d+$/.test(p)) return send('text/html', shell(thread(p.split('/')[3])));
  if (p === '/messages/new' && req.method === 'POST') {
    let b = ''; req.on('data', (c) => { b += c; }); req.on('end', () => {
      const f = new URLSearchParams(b);
      if (f.get('form_token') !== 'tok-xyz') return send('text/html', shell('<div class="messages error">Invalid security token.</div>' + form('/messages/new', true)));
      if (/nobody/i.test(f.get('edit-recipient'))) return send('text/html', shell('<div class="messages error">The recipient “nobody” could not be found.</div>' + form('/messages/new', true)));
      sentNew.push([f.get('edit-recipient'), f.get('subject'), f.get('body')]); send('text/html', shell(inbox(true)));
    }); return; }
  if (p === '/messages/new') return send('text/html', shell('<h1>Compose</h1>' + form('/messages/new', true)));
  if (p === '/__sent') return send('application/json', JSON.stringify({ sentReplies, sentNew }));
  if (p === '/groups') return send('text/html', shell(groupsHtml()));
  if (/^\/group\/\d+\/feed$/.test(p)) return send('application/json', JSON.stringify({ output: groupFeed(p.split('/')[2]) }));
  if (/^\/group\/\d+$/.test(p)) return send('text/html', shell('<h2>Native group page</h2>'));
  if (p === '/calendar') return send('text/html', shell('<h2>Native calendar</h2>'));
  if (/^\/event\/\d+/.test(p)) return send('text/html', shell('<a href="/course/101/materials">AP Biology</a><div class="assignment-description"><p>Write up your <b>findings</b> from the lab. Include a graph and a short conclusion.</p><script>alert(1)</script><img src=x onerror=alert(2)></div>'));
  const cm = /^\/course\/(\d+)(?:\/([a-z_]+))?(?:\/.*)?$/.exec(p);
  const courseHtml = () => send('text/html', shell(materials(cm[1], u.searchParams.get('f') || '')));
  if (cm && mode === 'fail' && /materials|feed/.test(p)) { res.writeHead(500); return res.end('boom'); }
  if (cm && cm[2] === 'feed') return send('application/json', JSON.stringify({ output: courseFeed(cm[1]) }));
  if (cm && (cm[2] === 'materials' || !cm[2]) && !p.includes('/gp/')) return mode === 'slow' ? void setTimeout(courseHtml, 1500) : courseHtml();
  if (cm) return send('text/html', shell('<h2>Native course page</h2><p>Original Schoology page.</p><button>Native button still works</button>'));
  if (/^\/assignment\/\d+$/.test(p)) return send('text/html', shell(assignmentPage()));
  send('text/html', shell('<h2>Other native page: ' + p + '</h2>'));
}).listen(4173, () => console.log('mock on http://localhost:4173/home'));
