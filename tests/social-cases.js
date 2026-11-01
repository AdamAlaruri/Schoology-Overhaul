// Checks for message/history helpers. Run: node tests/social-cases.js
const path = require('path');
global.window = {};
require(path.join(__dirname, '..', 'src', 'core.js'));
require(path.join(__dirname, '..', 'src', 'social.js'));
const S = window.SGO;
let fail = 0;
const eq = (a, b, m) => { if (a !== b) { fail++; console.log(`FAIL  ${m}: got ${a}, want ${b}`); } };

const at = (y, mo, d, h, mi) => new Date(y, mo, d, h, mi).getTime();
eq(S.parseStamp('Fri Oct 30 2026 at 11:58 am'), at(2026, 9, 30, 11, 58), 'message list stamp');
eq(S.parseStamp('Fri Oct 30, 2026 at 11:50 pm'), at(2026, 9, 30, 23, 50), 'feed stamp with comma, pm');
eq(S.parseStamp('Thu Oct 29 2026 at 12:05 am'), at(2026, 9, 29, 0, 5), '12 am is midnight');
eq(S.parseStamp('Thu Oct 29 2026 at 12:05 pm'), at(2026, 9, 29, 12, 5), '12 pm is noon');
eq(S.parseStamp('2 hours ago'), null, 'relative text is not guessed');
eq(S.parseStamp(''), null, 'empty');

// visits: newest first, same page not repeated, capped
S.prefs = S.DEFAULTS(); S.savePrefs = () => {};
S.logVisit('course', 'AP Biology', '/course/1/materials');
S.logVisit('course', 'AP Biology', '/course/1/materials');
eq(S.prefs.history.length, 1, 'same page twice is one entry');
S.logVisit('course', 'Algebra', '/course/2/materials');
eq(S.prefs.history[0].title, 'Algebra', 'newest first');
for (let i = 0; i < 300; i++) S.logVisit('course', 'C' + i, '/course/' + (10 + i) + '/materials');
eq(S.prefs.history.length, 200, 'history is capped');
S.logVisit('course', '', '/x'); eq(S.prefs.history.length, 200, 'untitled visits are ignored');

console.log(fail ? `${fail} failing` : 'all social checks passed');
process.exit(fail ? 1 : 0);
