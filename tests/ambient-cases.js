// Palette generation for the ambient background. Run: node tests/ambient-cases.js
const path = require('path');
global.window = {};
require(path.join(__dirname, '..', 'src', 'ambient.js'));
const A = window.SGO_AMBIENT;
let fail = 0;
const bad = (m) => { fail++; console.log('FAIL  ' + m); };
const eq = (a, b, m) => { if (a !== b) bad(`${m}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`); };

// colour parsing
eq(Math.round(A.parse('#20C5D9').h), 186, 'brand cyan hue'); eq(A.parse('#20C5D9').s > 60, true, 'brand cyan is saturated');
eq(Math.round(A.parse('rgb(229, 72, 77)').h), 358, 'rgb() is read'); eq(Math.round(A.parse('#fff').l), 100, 'short hex');
eq(A.parse('not a colour'), null, 'garbage is rejected'); eq(A.parse(''), null, 'empty is rejected'); eq(A.parse('color-mix(in srgb, red, blue)'), null, 'unresolved colour functions are rejected');

const HSL = /^hsl\((\d{1,3}) (\d{1,3})% ([\d.]+)%(?: \/ ([\d.]+))?\)$/;
const read = (c) => { const m = HSL.exec(c); return m ? { h: +m[1], s: +m[2], l: +m[3], a: m[4] == null ? 1 : +m[4] } : null; };
const hueGap = (a, b) => { const d = Math.abs(a - b) % 360; return Math.min(d, 360 - d); };

const accents = ['#20C5D9', '#079FB8', '#e5484d', '#5b6cff', '#e0a458', '#888888', '#ffffff', '#000000', 'garbage', ''];
for (const accent of accents) for (const dark of [false, true]) {
  const tag = `${accent || '(empty)'} ${dark ? 'dark' : 'light'}`, p = A.palette(accent, dark, 'auto', 1);
  if (p.colors.length !== 3) bad(tag + ' needs three lights');
  const cs = p.colors.map(read);
  if (cs.some((c) => !c)) { bad(tag + ' produced an unreadable colour: ' + p.colors.join(' ')); continue; }
  if (!read(p.base)) bad(tag + ' base');
  const acc = A.parse(accent) || A.parse(A.DEFAULT_ACCENT);
  eq(hueGap(cs[0].h, acc.h) <= 1, true, tag + ' the first light keeps the accent hue');
  cs.forEach((c, i) => {
    if (c.s < 18 || c.s > 95) bad(`${tag} light ${i + 1} saturation ${c.s}`);
    if (c.a <= 0 || c.a > 0.9) bad(`${tag} light ${i + 1} opacity ${c.a}`);
    if (!dark && c.l < 66) bad(`${tag} light ${i + 1} is too dark for light mode (${c.l})`);
    if (dark && c.l > 58) bad(`${tag} light ${i + 1} is too pale for dark mode (${c.l})`);
  });
  eq(cs[0].a >= cs[2].a, true, tag + ' the main light is the strongest');
  if (cs[0].a > 0.4) bad(tag + ' is too strong for an ambient light (' + cs[0].a + ')');
  eq(hueGap(cs[1].h, cs[0].h) <= 40 && hueGap(cs[2].h, cs[0].h) <= 40, true, tag + ' neighbours stay analogous');
  const b = read(p.base); eq(dark ? b.l < 10 : b.l > 94, true, tag + ' foundation is near black / near white');
}
// cyan stays dominant: every light sits within 40 degrees of the accent
const cy = A.palette('#20C5D9', false, 'auto', 1).colors.map(read);
eq(cy.every((c) => hueGap(c.h, 186) <= 40), true, 'cyan dominates');
// themes differ, intensity scales opacity and is clamped, presets differ from automatic
const lt = A.palette('#20C5D9', false, 'auto', 1), dk = A.palette('#20C5D9', true, 'auto', 1);
eq(lt.colors.join() !== dk.colors.join(), true, 'light and dark palettes differ');
const lo = read(A.palette('#20C5D9', true, 'auto', 0.5).colors[0]).a, hi = read(A.palette('#20C5D9', true, 'auto', 1.4).colors[0]).a;
eq(lo < hi, true, 'intensity scales opacity'); eq(read(A.palette('#20C5D9', true, 'auto', 99).colors[0]).a <= 0.9, true, 'opacity is capped');
eq(A.palette('#20C5D9', true, 'auto', NaN).colors[0], A.palette('#20C5D9', true, 'auto', 1).colors[0], 'a bad intensity falls back to 1');
for (const { id } of A.PRESETS) if (id !== 'auto') eq(A.palette('#20C5D9', false, id, 1).colors.join() !== lt.colors.join(), true, id + ' differs from automatic');
eq(A.palette('#e5484d', false, 'lagoon', 1).colors.join(), A.palette('#20C5D9', false, 'lagoon', 1).colors.join(), 'a named preset ignores the accent');
eq(A.palette('#e5484d', false, 'auto', 1).colors.join() !== lt.colors.join(), true, 'automatic follows the accent');
eq(A.palette('#20C5D9', false, 'nope', 1).colors.join(), lt.colors.join(), 'an unknown preset is treated as automatic');
eq(/radial-gradient/.test(A.swatch('#20C5D9', true, 'aurora')), true, 'swatch is a css background');

console.log(fail ? `${fail} failing` : `all ambient checks passed (${accents.length * 2} accent and theme combinations)`);
process.exit(fail ? 1 : 0);
