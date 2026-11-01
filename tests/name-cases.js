// Regression tests for course-name cleanup. Run: node tests/name-cases.js
// Add a line whenever a real Schoology title comes out wrong, so the fix can't regress.
const path = require('path');
global.window = {};
require(path.join(__dirname, '..', 'src', 'core.js'));
const S = window.SGO;

const cases = [
  ['(MATH&151) CALCULUS I /AP CALC AB: (S1) Crane, A (MATH&151) CALCULUS I /AP CALC AB(5)', 'AP Calculus AB'],
  ['(MATH&151) CALCULUS I /AP CALC AB(5)', 'AP Calculus AB'],
  ['SPORTS MED TRNG', 'Sports Medicine Training'],
  ['Period 3: SPORTS MED TRNG: Lee, K', 'Sports Medicine Training'],
  ['NCHS TSA', 'NCHS TSA'],
  ['(CTE&210) NCHS TSA: (S1) Diaz, M', 'NCHS TSA'],
  ['Period 2: HONORS CHEM: Rivera, M', 'Honors Chemistry'],
  ['(HIST&146) US HISTORY /AP US HIST: (S2) Patel, R', 'AP US History'],
  ['ENG 10 LIT & COMP', 'English 10 Literature & Composition'],
  ['AP Biology', 'AP Biology'],
  ['Algebra II', 'Algebra II'],
  ['(ART101) ART HISTORY: (S1) Kim, J', 'Art History'],
];

let fail = 0;
for (const [raw, want] of cases) {
  const got = S.cleanName(raw);
  if (got !== want) { fail++; console.log(`FAIL  ${raw}\n      got  "${got}"\n      want "${want}"`); }
}

// A user rule must apply to every course immediately, without a code change.
S.prefs.nameRules = { expand: { WOOD: 'Woodworking' }, keep: ['ZZQ'] };
if (S.cleanName('WOOD SHOP ZZQ') !== 'Woodworking SHOP ZZQ') { fail++; console.log('FAIL  user expand rule not applied'); }
S.prefs.nameRules = {};

console.log(fail ? `${fail} failing` : `all ${cases.length + 1} name checks passed`);
process.exit(fail ? 1 : 0);
