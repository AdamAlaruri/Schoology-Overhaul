// Grade update notifications and accent contrast. Run: node tests/grade-cases.js
const path = require('path');
global.window = {};
const src = (f) => path.join(__dirname, '..', 'src', f);
require(src('color.js')); require(src('core.js')); require(src('social.js'));
const S = window.SGO, C = window.SGO_COLOR;
let fail = 0;
const bad = (m) => { fail++; console.log('FAIL  ' + m); };
const eq = (a, b, m) => { if (a !== b) bad(`${m}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`); };

const book = (items) => [{ courseId: '101', courseName: 'AP Biology', periods: [{ categories: [{ items }] }] }];
const graded = (title, e, p, due = 'Due Oct 30') => ({ title, earned: e, possible: p, dueText: due });
const open = (title) => ({ title, earned: null, possible: 20, dueText: 'Due Nov 5' });

// the first read only records what is already graded
S.prefs = S.DEFAULTS(); S.savePrefs = () => {}; S.state = { grades: book([graded('Unit 1 Test', 45, 50), graded('Lab 1', 18, 20), open('Lab 2')]) };
eq(S.noteGrades(), false, 'the first read announces nothing'); eq(S.prefs.notifs.length, 0, 'no notifications yet'); eq(S.prefs.gradeBase, true, 'baseline recorded');
eq(Object.keys(S.prefs.gradeSeen).length, 2, 'graded items are remembered, ungraded ones are not');
// the same gradebook again: still nothing
eq(S.noteGrades(), false, 'nothing changed, nothing announced');

// a teacher grades Lab 2: exactly one notification, with the details
S.state.grades = book([graded('Unit 1 Test', 45, 50), graded('Lab 1', 18, 20), graded('Lab 2', 17, 20, 'Due Nov 5')]);
eq(S.noteGrades(), true, 'a new grade is announced'); eq(S.prefs.notifs.length, 1, 'one notification');
const n = S.prefs.notifs[0];
eq(n.kind, 'grade', 'kind'); eq(n.change, 'new', 'a first score is a new grade'); eq(n.title, 'Lab 2', 'assignment name'); eq(n.course, 'AP Biology', 'course'); eq(n.earned, 17, 'score'); eq(n.possible, 20, 'out of'); eq(n.due, 'Due Nov 5', 'due date'); eq(n.read, false, 'starts unread'); eq(typeof n.at, 'number', 'when it was seen');
eq(S.unreadNotifs('grade'), 1, 'unread count');
// reading the same gradebook again must not duplicate it
eq(S.noteGrades(), false, 'no duplicate for the same grading event'); eq(S.prefs.notifs.length, 1, 'still one');
// even if the seen-list were lost, the event id stops a second copy
S.prefs.gradeSeen = {}; S.noteGrades(); eq(S.prefs.notifs.length, 1, 'the id prevents duplicates even after the memory is cleared');
// mark as read
S.markNotifRead(n.id); eq(S.unreadNotifs('grade'), 0, 'marked read'); eq(S.prefs.notifs[0].read, true, 'the flag is stored');
// a changed score is a new event; a second new grade adds one more
S.state.grades = book([graded('Unit 1 Test', 48, 50), graded('Lab 1', 18, 20), graded('Lab 2', 17, 20, 'Due Nov 5'), graded('Quiz 3', 9, 10, 'Due Nov 6')]);
eq(S.noteGrades(), true, 'a changed score and a new grade are announced'); eq(S.prefs.notifs.length, 3, 'two more notifications (the regrade and the quiz)');
eq(S.prefs.notifs.find((x) => x.title === 'Unit 1 Test').change, 'changed', 'a different score is a changed grade'); eq(S.prefs.notifs.find((x) => x.title === 'Unit 1 Test').prevEarned, 45, 'the earlier score is kept'); eq(S.unreadNotifs('grade'), 2, 'two unread'); S.markAllNotifsRead(); eq(S.unreadNotifs('grade'), 0, 'mark all as read');
// an empty or missing gradebook never wipes or announces anything
S.state.grades = []; eq(S.noteGrades(), false, 'empty gradebook is ignored'); eq(Object.keys(S.prefs.gradeSeen).length >= 4, true, 'memory kept');
// the list is capped
for (let i = 0; i < 80; i++) { S.state.grades = book([graded('Item ' + i, i, 100, 'Due ' + i)]); S.noteGrades(); }
eq(S.prefs.notifs.length <= 80, true, 'the history is capped at 80');

// new assignments and deadlines
S.prefs = S.DEFAULTS(); S.savePrefs = () => {}; S.state = { grades: [], diag: [] }; S.isComplete = () => false; S.isStale = () => false; S.cn = (id, n) => n; S.itemHref = (i) => '/a/' + i.key;
const NOW = new Date(2026, 10, 1, 9, 0).getTime(), HOUR = 36e5;
const A = (key, extra) => Object.assign({ key, title: 'T ' + key, courseId: '1', courseName: 'Bio', due: NOW + 5 * 24 * HOUR }, extra);
eq(S.noteWork([A('a1'), A('a2')], NOW), false, 'the first read announces no assignments'); eq(S.prefs.assignBase, true, 'baseline recorded');
eq(S.noteWork([A('a1'), A('a2')], NOW), false, 'unchanged assignments announce nothing'); eq(S.notifs().length, 0, 'still empty');
eq(S.noteWork([A('a1'), A('a2'), A('a3')], NOW + HOUR), true, 'a new assignment is announced'); eq(S.notifs().length, 1, 'one notification'); eq(S.notifs()[0].kind, 'assignment', 'assignment kind'); eq(S.notifs()[0].href, '/a/a3', 'it leads to the assignment');
eq(S.noteWork([A('a1'), A('a2'), A('a3')], NOW + 2 * HOUR), false, 'refreshing again does not repeat it'); eq(S.notifs().length, 1, 'still one');
eq(S.noteWork([A('a1')], NOW + 3 * HOUR), false, 'items that vanish and come back are not new'); eq(S.noteWork([A('a1'), A('a3')], NOW + 4 * HOUR), false, 'a3 returns without a repeat');
eq(S.noteWork([A('p1', { manual: true })], NOW), false, 'personal tasks are never announced as assigned');
// a deadline inside 24 hours is announced once
S.noteWork([A('a1'), A('d1'), A('d2')], NOW);
const soon = A('d1', { due: NOW + 5 * HOUR });
eq(S.noteWork([A('a1'), soon, A('d2')], NOW), true, 'a deadline within a day is announced'); eq(S.notifs()[0].kind, 'deadline', 'deadline kind');
eq(S.noteWork([A('a1'), soon, A('d2')], NOW + HOUR), false, 'and only once'); eq(S.notifs().filter((n) => n.kind === 'deadline').length, 1, 'one deadline notification');
eq(S.noteWork([A('a1'), soon, A('d2', { due: NOW + 3 * 24 * HOUR })], NOW), false, 'a deadline three days away is not announced yet');
// a brand new assignment that is also due within a day is announced once, as an assignment
const n0 = S.notifs().length; S.noteWork([A('a1'), soon, A('d2'), A('hot', { due: NOW + 2 * HOUR })], NOW); eq(S.notifs().length, n0 + 1, 'new and due soon is one notification');
// sync problems come from the live state and clear by themselves
S.state = { session: 'ok', diag: [{ name: 'Fetch: grades', ok: false, count: 0, note: '/grades/grades — HTTP 500' }, { name: 'Fetch: events', ok: false, count: 0, note: '/home/upcoming_ajax' }] };
eq(S.syncIssues().length, 1, 'a failed request is reported, an empty one is not'); eq(S.syncIssues()[0].title, 'Couldn’t refresh grades', 'issue names the source');
S.state = { session: 'expired', diag: [] }; eq(S.syncIssues()[0].id, 'sync-session', 'an ended session is reported'); S.state = { session: 'ok', diag: [] }; eq(S.syncIssues().length, 0, 'nothing is stored once it recovers');

// accents: every choice keeps button text readable, and accent-coloured text readable on both interfaces
const mix = (hex, other, pc) => { const a = C.normHex(hex), b = C.normHex(other); const ch = (i) => Math.round(parseInt(a.slice(i, i + 2), 16) * pc + parseInt(b.slice(i, i + 2), 16) * (1 - pc)).toString(16).padStart(2, '0'); return '#' + ch(1) + ch(3) + ch(5); };
eq(S.ACCENTS.length >= 6, true, 'several accent choices (' + S.ACCENTS.length + ')');
for (const [name, hex] of S.ACCENTS) {
  eq(C.normHex(hex), hex, name + ' is a valid hex');
  const on = C.onAccent(hex); eq(C.contrast(hex, on) >= 4.5, true, `${name}: text on the accent ${C.contrast(hex, on).toFixed(1)}:1`);
  eq(C.contrast(mix(hex, '#ffffff', 0.7), '#0c0e12') >= 4.5, true, `${name}: accent text on the dark interface ${C.contrast(mix(hex, '#ffffff', 0.7), '#0c0e12').toFixed(1)}:1`);
  eq(C.contrast(mix(hex, '#000000', 0.55), '#ffffff') >= 4.5, true, `${name}: accent text on the light interface ${C.contrast(mix(hex, '#000000', 0.55), '#ffffff').toFixed(1)}:1`);
}
console.log(fail ? `${fail} failing` : 'all grade-update and accent checks passed');
process.exit(fail ? 1 : 0);
