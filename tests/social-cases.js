// Checks for message helpers. Run: node tests/social-cases.js
const path = require('path');
global.window = {};
require(path.join(__dirname, '..', 'src', 'color.js'));
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

// drafts: a message is only sent when it has what Schoology needs
eq(S.checkDraft({ to: '', subject: 's', body: 'hi' }, false), 'Add who the message is for.', 'new message needs a recipient');
eq(S.checkDraft({ to: 'Ms. Rivera', subject: ' ', body: 'hi' }, false), 'Add a subject.', 'new message needs a subject');
eq(S.checkDraft({ to: 'Ms. Rivera', subject: 'Q', body: '   ' }, false), 'Write a message first.', 'an empty body is never sent');
eq(S.checkDraft({ to: 'Ms. Rivera', subject: 'Q', body: 'Hello' }, false), '', 'a complete new message is fine');
eq(S.checkDraft({ body: 'Thanks!' }, true), '', 'a reply needs only text');
eq(S.checkDraft({ body: '' }, true), 'Write a message first.', 'an empty reply is never sent');

console.log(fail ? `${fail} failing` : 'all social checks passed');
process.exit(fail ? 1 : 0);
