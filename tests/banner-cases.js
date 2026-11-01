// Regression tests for banner recommendations. Run: node tests/banner-cases.js
const path = require('path');
global.window = {};
require(path.join(__dirname, '..', 'src', 'core.js'));
require(path.join(__dirname, '..', 'src', 'banners.js'));
const S = window.SGO;

const cases = [
  // examples from the feature request
  ['AP Calculus BC', 'math'], ['AP Biology', 'biology'], ['AP Chemistry', 'science'], ['APUSH', 'history'],
  ['AP English Language', 'english'], ['Computer Science', 'cs'],
  // real titles from the student's account (raw Schoology names)
  ['(MATH&151) CALCULUS I /AP CALC AB: (S1) Crane, A (MATH&151) CALCULUS I /AP CALC AB(5)', 'math'],
  ['AP BIOLOGY: (S1) Ribarich, H AP BIOLOGY(1)', 'biology'], ['AP Biology Summer Work', 'biology'], ['Calculus AB Summer Work', 'math'],
  ['SPAN & 123 SPANISH III', 'languages'], ['AP US HISTORY: (S1) Armstrong, D AP US HISTORY(3)', 'history'], ['AP Macroeconomics', 'history'],
  ['SPORTS MED TRNG: (S1) Lewis, B SPORT S MED TRNG(4)', 'biology'], ['NCHS TSA', 'electives'], ['Advisory', 'electives'], ['AP English Language', 'english'],
  ['AP Computer Science A', 'cs'], ['AP Physics 1', 'science'], ['French II', 'languages'],
];
let fail = 0;
for (const [raw, want] of cases) {
  const got = S.recommendBanner(raw);
  if (got !== want) { fail++; console.log(`FAIL  ${raw}\n      got "${got}" want "${want}"`); }
}
// every banner id has a real image and an entry in the picker
for (const [id] of S.SUBJECT_BANNERS) if (!S.bannerUrl(id).startsWith('data:image/svg+xml')) { fail++; console.log('FAIL  missing banner ' + id); }
console.log(S.SUBJECT_BANNERS.length + ' banners; ' + (fail ? fail + ' failing' : `all ${cases.length} recommendation checks passed`));
process.exit(fail ? 1 : 0);
