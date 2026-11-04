// Missing work from the gradebook reaches the task list. Run: node tests/missing-cases.js
const path = require('path');
global.window = {}; global.location = { origin: 'https://x.schoology.com', href: 'https://x.schoology.com/home' }; global.DOMParser = class {};
const src = (f) => path.join(__dirname, '..', 'src', f);
require(src('color.js')); require(src('core.js')); require(src('social.js')); require(src('data.js'));
const S = window.SGO;
let fail = 0;
const eq = (a, b, m) => { if (a !== b) { fail++; console.log(`FAIL  ${m}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`); } };
S.prefs = S.DEFAULTS(); S.savePrefs = () => {};
const past = 'Due Oct 1, 2020';
S.state.courses = [{ id: '101', name: 'AP Biology' }];
S.state.items = { '/assignment/7': { key: '/assignment/7', title: 'Lab 7', courseId: '101', due: Date.now() - 3 * S.DAY, type: 'assignment' } };
S.state.grades = [{ courseId: '101', courseName: 'AP Biology', periods: [{ categories: [{ items: [
  { title: 'Lab 7', status: 'missing', dueText: past, href: '/assignment/7' },
  { title: 'Essay', status: 'missing', dueText: past, href: '/assignment/9' },
  { title: 'Quiz', status: 'graded', dueText: past, href: '/assignment/11' }] }] }] }];
S.data.relink && S.data.relink();
const a = S.state.items['/assignment/7'], b = S.state.items['/assignment/9'];
eq(!!a.gbMissing, true, 'an item Schoology did not list as overdue is flagged from the gradebook');
eq(S.isOverdue(a), true, 'it counts as overdue'); eq(S.isStale(a), false, 'it is not hidden as stale');
eq(!!b, true, 'a gradebook-only missing assignment is added'); eq(b && S.isOverdue(b), true, 'and counts as overdue'); eq(b && S.statusOf(b).id, 'missing', 'and is labelled Not submitted');
eq(!!S.state.items['/assignment/11'], false, 'graded work is not added');
S.state.grades[0].periods[0].categories[0].items[1].status = 'graded'; S.data.relink();
eq(S.isOverdue(S.state.items['/assignment/9']), false, 'once graded it is no longer overdue');
console.log(fail ? fail + ' failure(s)' : 'all missing-work checks passed'); process.exit(fail ? 1 : 0);
