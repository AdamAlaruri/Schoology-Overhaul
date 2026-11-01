// Regression tests for banner recommendations. Run: node tests/banner-cases.js
const path = require('path');
global.window = {};
require(path.join(__dirname, '..', 'src', 'color.js'));
require(path.join(__dirname, '..', 'src', 'core.js'));
require(path.join(__dirname, '..', 'src', 'banners.js'));
const S = window.SGO;

const cases = [
  // examples from the feature request
  ['AP Calculus BC', 'science'], ['AP Biology', 'biology'], ['AP Chemistry', 'science'], ['APUSH', 'history'],
  ['AP English Language', 'english'], ['Computer Science', 'cs'],
  // real titles from the student's account (raw Schoology names)
  ['(MATH&151) CALCULUS I /AP CALC AB: (S1) Crane, A (MATH&151) CALCULUS I /AP CALC AB(5)', 'science'],
  ['AP BIOLOGY: (S1) Ribarich, H AP BIOLOGY(1)', 'biology'], ['AP Biology Summer Work', 'biology'], ['Calculus AB Summer Work', 'science'],
  ['SPAN & 123 SPANISH III', 'languages'], ['AP US HISTORY: (S1) Armstrong, D AP US HISTORY(3)', 'history'], ['AP Macroeconomics', 'history'],
  ['SPORTS MED TRNG: (S1) Lewis, B SPORT S MED TRNG(4)', 'biology'], ['NCHS TSA', 'electives'], ['Advisory', 'electives'], ['AP English Language', 'english'],
  ['AP Computer Science A', 'cs'], ['AP Physics 1', 'science'], ['French II', 'languages'],
];
let fail = 0;
for (const [raw, want] of cases) {
  const got = S.recommendBanner(raw);
  if (got !== want) { fail++; console.log(`FAIL  ${raw}\n      got "${got}" want "${want}"`); }
}
// every banner is a real photograph file inside the extension, a sensible size, and credited
const fs = require('fs'), dir = path.join(__dirname, '..', 'banners'), credits = fs.readFileSync(path.join(dir, 'CREDITS.md'), 'utf8');
for (const [id] of S.SUBJECT_BANNERS) {
  const file = path.join(dir, id + '.jpg');
  if (!fs.existsSync(file)) { fail++; console.log('FAIL  missing photo ' + id); continue; }
  const buf = fs.readFileSync(file);
  if (buf[0] !== 0xff || buf[1] !== 0xd8) { fail++; console.log('FAIL  ' + id + ' is not a JPEG'); }
  if (buf.length > 300 * 1024) { fail++; console.log(`FAIL  ${id} is ${Math.round(buf.length / 1024)} KB`); }
  if (!S.bannerUrl(id).endsWith(`banners/${id}.jpg`)) { fail++; console.log('FAIL  address for ' + id); }
  if (!credits.includes('| ' + id + ' |')) { fail++; console.log('FAIL  no credit line for ' + id); }
}
if (S.bannerUrl('math') !== '') { fail++; console.log('FAIL  the retired Mathematics banner should resolve to nothing'); }
console.log(S.SUBJECT_BANNERS.length + ' banners; ' + (fail ? fail + ' failing' : `all ${cases.length} recommendation checks passed`));
process.exit(fail ? 1 : 0);
