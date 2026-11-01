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
eq(S.noteGrades(), false, 'the first read announces nothing'); eq(S.prefs.gradeNotifs.length, 0, 'no notifications yet'); eq(S.prefs.gradeBase, true, 'baseline recorded');
eq(Object.keys(S.prefs.gradeSeen).length, 2, 'graded items are remembered, ungraded ones are not');
// the same gradebook again: still nothing
eq(S.noteGrades(), false, 'nothing changed, nothing announced');

// a teacher grades Lab 2: exactly one notification, with the details
S.state.grades = book([graded('Unit 1 Test', 45, 50), graded('Lab 1', 18, 20), graded('Lab 2', 17, 20, 'Due Nov 5')]);
eq(S.noteGrades(), true, 'a new grade is announced'); eq(S.prefs.gradeNotifs.length, 1, 'one notification');
const n = S.prefs.gradeNotifs[0];
eq(n.title, 'Lab 2', 'assignment name'); eq(n.course, 'AP Biology', 'course'); eq(n.earned, 17, 'score'); eq(n.possible, 20, 'out of'); eq(n.due, 'Due Nov 5', 'due date'); eq(n.read, false, 'starts unread'); eq(typeof n.at, 'number', 'when it was seen');
eq(S.unreadGrades(), 1, 'unread count');
// reading the same gradebook again must not duplicate it
eq(S.noteGrades(), false, 'no duplicate for the same grading event'); eq(S.prefs.gradeNotifs.length, 1, 'still one');
// even if the seen-list were lost, the event id stops a second copy
S.prefs.gradeSeen = {}; S.noteGrades(); eq(S.prefs.gradeNotifs.length, 1, 'the id prevents duplicates even after the memory is cleared');
// mark as read
S.markGradeRead(n.id); eq(S.unreadGrades(), 0, 'marked read'); eq(S.prefs.gradeNotifs[0].read, true, 'the flag is stored');
// a changed score is a new event; a second new grade adds one more
S.state.grades = book([graded('Unit 1 Test', 48, 50), graded('Lab 1', 18, 20), graded('Lab 2', 17, 20, 'Due Nov 5'), graded('Quiz 3', 9, 10, 'Due Nov 6')]);
eq(S.noteGrades(), true, 'a changed score and a new grade are announced'); eq(S.prefs.gradeNotifs.length, 3, 'two more notifications (the regrade and the quiz)');
eq(S.unreadGrades(), 2, 'two unread'); S.markAllGradesRead(); eq(S.unreadGrades(), 0, 'mark all as read');
// an empty or missing gradebook never wipes or announces anything
S.state.grades = []; eq(S.noteGrades(), false, 'empty gradebook is ignored'); eq(Object.keys(S.prefs.gradeSeen).length >= 4, true, 'memory kept');
// the list is capped
for (let i = 0; i < 80; i++) { S.state.grades = book([graded('Item ' + i, i, 100, 'Due ' + i)]); S.noteGrades(); }
eq(S.prefs.gradeNotifs.length <= 60, true, 'the list is capped at 60');

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
