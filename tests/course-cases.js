// Course order: custom order, pinning and moving. Run: node tests/course-cases.js
const path = require('path');
global.window = {};
require(path.join(__dirname, '..', 'src', 'color.js')); require(path.join(__dirname, '..', 'src', 'core.js'));
const S = window.SGO;
let fail = 0;
const eq = (a, b, m) => { if (String(a) !== String(b)) { fail++; console.log(`FAIL  ${m}: got ${a}, want ${b}`); } };
S.savePrefs = () => {}; S.prefs = S.DEFAULTS();
S.state = { courses: ['a', 'b', 'c', 'd'].map((id) => ({ id, name: id.toUpperCase() })) };
const ids = () => S.orderedCourses().map((c) => c.id).join('');
eq(ids(), 'abcd', 'default order is Schoology\'s');
S.togglePin('c'); eq(ids(), 'cabd', 'a pinned class leads'); eq(S.isPinned('c'), true, 'pinned flag');
S.togglePin('d'); eq(ids(), 'cdab', 'pinned classes keep their own order');
eq(S.moveCourse('d', -1), true, 'a pinned class moves among pinned ones'); eq(ids(), 'dcab', 'moved earlier');
eq(S.moveCourse('d', -1), false, 'cannot move past the first place'); eq(S.moveCourse('c', 1), false, 'a pinned class never moves into the unpinned group');
eq(S.moveCourse('a', 1), true, 'an unpinned class moves'); eq(ids(), 'dcba', 'unpinned order changed'); eq(S.prefs.courseSort, 'custom', 'moving switches to the custom order');
S.togglePin('c'); S.togglePin('d'); eq(ids(), 'dcba', 'unpinning keeps the saved order');
console.log(fail ? `${fail} failing` : 'all course-order checks passed');
process.exit(fail ? 1 : 0);
