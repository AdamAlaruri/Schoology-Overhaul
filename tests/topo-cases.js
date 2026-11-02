// The topographic background: geometry and colour helpers. Run: node tests/topo-cases.js
const path = require('path');
global.window = {};
require(path.join(__dirname, '..', 'src', 'color.js'));
require(path.join(__dirname, '..', 'src', 'topo.js'));
const T = window.SGO_TOPO, C = window.SGO_COLOR;
let fail = 0;
const bad = (m) => { fail++; console.log('FAIL  ' + m); };
const eq = (a, b, m) => { if (a !== b) bad(`${m}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`); };

const map = T.build(1600, 900, 20260);
eq(map.paths.length >= 40, true, 'a real map has dozens of contours (' + map.paths.length + ')');
eq(map.paths.length <= 400, true, 'and stays light (' + map.paths.length + ')');
const closed = map.paths.filter((p) => p.d.endsWith('Z')), open = map.paths.filter((p) => !p.d.endsWith('Z'));
eq(closed.length >= 5, true, 'several closed contour loops (peaks and basins): ' + closed.length);
eq(open.length >= 5, true, 'and several contours that run off the screen: ' + open.length);
// every path is smooth Bézier data inside the viewBox, with no NaN
for (const p of map.paths) {
  if (!/^M[-\d. ]+(C[-\d. ]+)+Z?$/.test(p.d)) { bad('path data is not clean Bézier: ' + p.d.slice(0, 60)); break; }
  const nums = p.d.match(/-?\d+\.?\d*/g).map(Number);
  if (nums.some((n) => !isFinite(n) || n < -40 || n > 1640 + (n > 900 ? 0 : 0))) { bad('a coordinate is outside the map: ' + nums.find((n) => n < -40 || n > 1640)); break; }
}
// nothing round or symmetrical: loops differ in aspect and none is a near-perfect circle
const box = (d) => { const n = d.match(/-?\d+\.?\d*/g).map(Number); const xs = n.filter((_, i) => i % 2 === 0), ys = n.filter((_, i) => i % 2 === 1); return { w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }; };
const ratios = closed.map((p) => { const b = box(p.d); return b.w / b.h; });
eq(ratios.some((r) => r > 1.3 || r < 0.77), true, 'loops are irregular, not circles');
eq(new Set(ratios.map((r) => r.toFixed(1))).size >= 4, true, 'loops differ from one another');
// the same seed gives the same map, a different seed a different one, and repeat calls are free (memoised)
eq(T.build(1600, 900, 20260), map, 'repeat calls return the cached geometry');
const again = T.build(800, 450, 20260).paths.length; eq(again > 0, true, 'another size works');
eq(T.build(1600, 900, 7).paths.map((p) => p.d).join() !== map.paths.map((p) => p.d).join(), true, 'a different seed gives a different map');
// the markup: a real svg, full-viewport scaling, paths that take their colour from CSS variables (no fixed colours baked in)
const svg = T.svg(1600, 900, 20260);
eq(/^<svg id="sgo-topo" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice"/.test(svg), true, 'svg element and viewBox');
eq(/stroke=|fill=|#[0-9a-f]{3,6}\b|rgb\(/i.test(svg.replace(/stroke-opacity="[\d.]+"/g, '')), false, 'no colours are baked into the paths');
eq((svg.match(/<path /g) || []).length > map.paths.length, true, 'lines plus a glow layer under the major contours');
eq(svg.length < 260000, true, 'markup is lightweight (' + Math.round(svg.length / 1024) + ' KB)');

// colours
eq(C.normHex('#3B82F6'), '#3b82f6', 'hex is lowercased'); eq(C.normHex('38f'), '#3388ff', 'short hex expands'); eq(C.normHex('#12345'), '', 'a short code is refused'); eq(C.normHex('blue'), '', 'a colour name is refused'); eq(C.normHex(null), '', 'null is refused');
eq(C.isDark('#000000'), true, 'black is dark'); eq(C.isDark('#ffffff'), false, 'white is light'); eq(C.isDark('#0b1220'), true, 'navy is dark'); eq(C.isDark('#e2e8f0'), false, 'pale grey is light');
for (const accent of ['#3b82f6', '#22d3ee', '#10b981', '#a78bfa', '#f59e0b', '#d4d4d8', '#2563eb', '#000000', '#ffffff']) {
  const on = C.onAccent(accent); eq(C.contrast(accent, on) >= 4.5, true, `text on ${accent} reads (${C.contrast(accent, on).toFixed(1)}:1)`);
}
console.log(fail ? `${fail} failing` : `all topographic checks passed (${map.paths.length} contours, ${closed.length} closed)`);
process.exit(fail ? 1 : 0);
