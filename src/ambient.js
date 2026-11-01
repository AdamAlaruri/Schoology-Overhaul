/* Ambient background palettes. Pure functions (no DOM), so they run before first paint and can be tested on their own.
 * palette(accent, dark, preset, intensity) turns the application's accent colour into three very soft light colours plus a base:
 * the accent's own hue leads and two analogous neighbours sit beside it. Opacity is kept low on purpose: the background is
 * atmosphere, not decoration. Saturation, lightness and opacity follow the theme (pale and airy in light mode, a little richer in dark). */
(() => {
  const A = (window.SGO_AMBIENT = window.SGO_AMBIENT || {});
  if (A.palette) return;
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const wrap = (h) => ((h % 360) + 360) % 360;

  /** "#20C5D9", "#2cd" or "rgb(32, 197, 217)" -> { h, s, l } with s and l in percent, or null when it cannot be read. */
  const parse = (value) => {
    let r, g, b; const v = String(value || '').trim();
    let m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(v);
    if (m) { let x = m[1]; if (x.length === 3) x = x.replace(/./g, '$&$&'); r = parseInt(x.slice(0, 2), 16); g = parseInt(x.slice(2, 4), 16); b = parseInt(x.slice(4, 6), 16); }
    else if ((m = /^rgba?\(\s*(\d+(?:\.\d+)?)[ ,]+(\d+(?:\.\d+)?)[ ,]+(\d+(?:\.\d+)?)/i.exec(v))) { r = +m[1]; g = +m[2]; b = +m[3]; }
    else return null;
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
    let h = 0, s = 0;
    if (d) {
      s = d / (1 - Math.abs(2 * l - 1));
      h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    }
    return { h: wrap(h * 60), s: s * 100, l: l * 100 };
  };
  const hsl = (h, s, l, a) => `hsl(${Math.round(wrap(h))} ${Math.round(s)}% ${(Math.round(l * 10) / 10)}%${a == null ? '' : ' / ' + a.toFixed(3)})`;

  /* Each preset is three lights: hue offset from its base hue, saturation share, lightness and opacity per theme.
   * "auto" takes its base hue from the accent; the named ones have a fixed hue of their own. */
  const PRESETS = {
    auto: { name: 'Automatic', offs: [0, 26, -22], sat: [1, .9, .8], lL: [78, 74, 80], dL: [48, 44, 40], aL: [.30, .22, .18], aD: [.30, .24, .20] },
    lagoon: { name: 'Lagoon', hue: 187, offs: [0, 18, -16], sat: [1, .95, .9], lL: [76, 72, 78], dL: [46, 42, 38], aL: [.32, .24, .20], aD: [.32, .26, .22] },
    glacier: { name: 'Glacier', hue: 198, offs: [0, 14, -12], sat: [.6, .55, .5], lL: [84, 80, 86], dL: [54, 50, 46], aL: [.32, .24, .20], aD: [.26, .20, .16] },
    aurora: { name: 'Aurora', hue: 168, offs: [0, 24, -14], sat: [1, .9, .85], lL: [76, 72, 78], dL: [46, 44, 40], aL: [.30, .24, .18], aD: [.30, .26, .20] },
  };
  A.PRESETS = Object.keys(PRESETS).map((id) => ({ id, name: PRESETS[id].name }));
  A.DEFAULT_ACCENT = '#20C5D9';
  A.parse = parse;

  /** { base, colors: [3 css colours], hue } for an accent colour and theme. Unreadable accents fall back to the brand cyan. */
  A.palette = (accent, dark, presetId, intensity) => {
    const p = PRESETS[presetId] || PRESETS.auto, acc = parse(accent) || parse(A.DEFAULT_ACCENT);
    const hue = p.hue != null ? p.hue : acc.h;
    const s0 = p.hue != null ? 82 : clamp(acc.s, 55, 92); // a grey accent still gets a gentle tint
    const I = clamp(typeof intensity === 'number' && isFinite(intensity) ? intensity : 1, 0.2, 1.6);
    const L = dark ? p.dL : p.lL, alpha = dark ? p.aD : p.aL;
    const colors = p.offs.map((o, i) => hsl(hue + o, clamp(s0 * p.sat[i], 18, 95), L[i], clamp(alpha[i] * I, 0, 0.9)));
    const base = dark ? hsl(hue, clamp(s0 * .45, 20, 45), 6.5) : hsl(hue, clamp(s0 * .7, 30, 60), 96.5);
    return { base, colors, hue: wrap(hue) };
  };
  /** A small CSS background that previews a palette (for the settings tiles). */
  A.swatch = (accent, dark, presetId) => {
    const q = A.palette(accent, dark, presetId, 2.4), c = q.colors;
    return `radial-gradient(circle at 20% 25%, ${c[0]}, transparent 60%), radial-gradient(circle at 85% 20%, ${c[1]}, transparent 55%), radial-gradient(circle at 60% 95%, ${c[2]}, transparent 60%), ${q.base}`;
  };
})();
