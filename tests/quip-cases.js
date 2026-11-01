// Checks for the quirky messages. Run: node tests/quip-cases.js
const path = require('path');
global.window = {};
require(path.join(__dirname, '..', 'src', 'core.js'));
require(path.join(__dirname, '..', 'src', 'quips.js'));
const S = window.SGO;
let fail = 0;
const bad = (m) => { fail++; console.log('FAIL  ' + m); };

// 20 per band, no duplicates, no empty or oversized lines
for (const [band, list] of Object.entries(S.quips)) {
  if (list.length !== 20) bad(`${band} has ${list.length} messages, want 20`);
  if (new Set(list).size !== list.length) bad(`${band} has duplicate messages`);
  list.forEach((m) => { if (!m.trim() || m.length > 90) bad(`${band}: bad length (${m.length}): ${m}`); });
}
if (Object.keys(S.quips).join() !== 'late,morning,afternoon,evening,night') bad('band set changed');

// every hour of the day maps to exactly the intended band
const want = (h) => (h < 5 ? 'late' : h < 12 ? 'morning' : h < 17 ? 'afternoon' : h < 22 ? 'evening' : 'night');
for (let h = 0; h < 24; h++) for (const m of [0, 59]) {
  const got = S.quipBand(new Date(2026, 10, 1, h, m));
  if (got !== want(h)) bad(`${h}:${m} -> ${got}, want ${want(h)}`);
}

// the message always comes from the right band, is stable within one open, and is not repeated back to back
const t = new Date(2026, 10, 1, 2, 30);
const first = S.quip(t);
if (!S.quips.late.includes(first)) bad('late-night message not from the late pool');
for (let i = 0; i < 20; i++) if (S.quip(t) !== first) { bad('message changed within one open'); break; }
const seen = new Set();
for (let i = 0; i < 400; i++) { const c = S.quip(new Date(2026, 10, 1, 9, 0)); seen.add(c); if (!S.quips.morning.includes(c)) bad('morning message not from the morning pool'); }
if (seen.size !== 1) bad('message should be stable inside a band');

console.log(fail ? `${fail} failing` : `all quip checks passed (${Object.values(S.quips).reduce((n, l) => n + l.length, 0)} messages)`);
process.exit(fail ? 1 : 0);
