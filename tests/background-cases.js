// Checks for the background system. Run: node tests/background-cases.js
const path = require('path');
global.window = {};
require(path.join(__dirname, '..', 'src', 'core.js'));
require(path.join(__dirname, '..', 'src', 'ambient.js'));
const S = window.SGO;
let fail = 0;
const eq = (a, b, m) => { if (a !== b) { fail++; console.log(`FAIL  ${m}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`); } };

// what comes back from storage is validated
S.setBackground({ kind: 'image', css: 'url("data:image/png;base64,iVBORw0KGgo=")', blur: 99, bright: 0, overlay: 5 });
eq(S.bg.kind, 'image', 'a valid inline image is accepted'); eq(S.bg.blur, 24, 'blur clamped'); eq(S.bg.bright, 0.4, 'brightness clamped'); eq(S.bg.overlay, 0.85, 'overlay clamped');
S.setBackground({ kind: 'image', css: 'url("https://example.com/x.png")' });
eq(S.bg.kind, 'auto', 'a remote url is refused');
S.setBackground({ kind: 'image', css: 'url("data:image/jpeg;base64,/9j/4AAQ")' });
eq(S.bg.kind, 'image', 'an inline image is accepted');
S.setBackground({ kind: 'color', color: 'red' });
eq(S.bg.kind, 'auto', 'a colour name is refused');
S.setBackground({ kind: 'color', color: '#1a2b3c' });
eq(S.bg.kind, 'color', 'a hex colour is accepted'); eq(S.bg.color, '#1a2b3c', 'colour kept');
S.setBackground({ kind: 'image', css: 'expression(alert(1))' });
eq(S.bg.kind, 'auto', 'arbitrary css is refused');
S.setBackground({ kind: 'preset', id: 'dusk', css: 'linear-gradient(red, blue)' });
eq(S.bg.kind, 'auto', 'the old illustrated presets fall back to automatic');
S.setBackground({ kind: 'ambient', id: 'lagoon' });
eq(S.bg.kind, 'ambient', 'a known ambient preset is accepted');
S.setBackground({ kind: 'ambient', id: 'nope' });
eq(S.bg.kind, 'auto', 'an unknown ambient preset is refused');
eq(S.bg.intensity, 0.6, 'default intensity is restrained');

console.log(fail ? `${fail} failing` : 'all background checks passed');
process.exit(fail ? 1 : 0);
