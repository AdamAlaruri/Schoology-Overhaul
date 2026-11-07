// Security checks. Run: node tests/security-cases.js
// Static scans of the source plus unit tests of the URL guards. Add a line whenever a new risk is found.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
global.window = {};
global.location = { href: 'https://school.schoology.com/home', origin: 'https://school.schoology.com' };
require(path.join(root, 'src', 'color.js'));
require(path.join(root, 'src', 'core.js'));
const S = window.SGO;
let fail = 0;
const bad = (m) => { fail++; console.log('FAIL  ' + m); };

// 1. URL guards
const urls = [['javascript:alert(1)', '#'], ['  JaVaScRiPt:alert(1)', '#'], ['data:text/html,<script>1</script>', '#'], ['file:///etc/passwd', '#'], ['', '#'], [null, '#'],
  ['/course/1/materials', 'https://school.schoology.com/course/1/materials'], ['https://example.com/a', 'https://example.com/a']];
for (const [i, want] of urls) if (S.safeUrl(i) !== want) bad(`safeUrl(${JSON.stringify(i)}) gave ${S.safeUrl(i)}, wanted ${want}`);
const site = [['/files/a.pdf', true], ['https://app.schoology.com/f', true], ['https://evil.com/schoology.com', false], ['https://schoology.com.evil.com/x', false], ['javascript:1', false]];
for (const [i, want] of site) if (S.isSiteUrl(i) !== want) bad(`isSiteUrl(${i}) gave ${S.isSiteUrl(i)}`);

// 2. Source scans
const files = fs.readdirSync(path.join(root, 'src')).filter((f) => f.endsWith('.js'));
const allowInner = { 'core.js': 2, 'data.js': 2, 'early.js': 2, 'social.js': 1, 'views.js': 4 }; // fixed templates and the sanitiser's own input; reviewed
for (const f of files) {
  const src = fs.readFileSync(path.join(root, 'src', f), 'utf8');
  for (const [re, why] of [[/\beval\s*\(/, 'eval'], [/new Function\s*\(/, 'new Function'], [/document\.write\s*\(/, 'document.write'], [/insertAdjacentHTML/, 'insertAdjacentHTML'], [/setTimeout\s*\(\s*['"`]/, 'setTimeout with a string']])
    if (re.test(src)) bad(`${f}: uses ${why}`);
  const inner = (src.match(/\.innerHTML\s*=/g) || []).length;
  if (inner > (allowInner[f] || 0)) bad(`${f}: ${inner} innerHTML writes (reviewed limit ${allowInner[f] || 0})`);
  src.split('\n').forEach((line, n) => {
    if (/target:\s*'_blank'/.test(line) && !/noopener/.test(line) && !/target: x\.kind|target: '_blank'\s*[,}]\s*\)?\s*$/.test(line + '')) { if (!/rel:/.test(line)) bad(`${f}:${n + 1}: target _blank without rel`); }
    const ext = line.match(/https?:\/\/(?!www\.w3\.org)[a-z0-9.-]+\.[a-z]{2,}/gi);
    if (ext && !/^\s*(\/\/|\*|\/\*)/.test(line) && !/schoology\.com/i.test(line)) bad(`${f}:${n + 1}: hard-coded external address ${ext[0]}`);
  });
}

// 3. Manifest: least privilege
const man = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
if ((man.permissions || []).some((p) => p !== 'storage')) bad('manifest asks for more than storage');
if (man.host_permissions && man.host_permissions.length) bad('manifest has host_permissions');
for (const cs of man.content_scripts) for (const m of cs.matches) if (!/schoology\.com\/\*$/.test(m)) bad('content script matches ' + m);
for (const w of man.web_accessible_resources || []) for (const m of w.matches) if (!/schoology\.com\/\*$/.test(m)) bad('web accessible to ' + m);

console.log(fail ? `${fail} failing` : 'all security checks passed');
process.exit(fail ? 1 : 0);
