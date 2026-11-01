/* Small colour helpers shared by the first-paint script and the app. Pure functions, no DOM. */
(() => {
  const C = (window.SGO_COLOR = window.SGO_COLOR || {});
  if (C.normHex) return;
  /** "#3b82f6", "3B82F6" or "#38f" -> "#3b82f6"; anything else -> "". */
  C.normHex = (v) => {
    let s = String(v == null ? '' : v).trim().replace(/^#/, '');
    if (/^[0-9a-f]{3}$/i.test(s)) s = s.replace(/./g, '$&$&');
    return /^[0-9a-f]{6}$/i.test(s) ? '#' + s.toLowerCase() : '';
  };
  /** WCAG relative luminance, 0 (black) to 1 (white). */
  C.luminance = (hex) => {
    const h = C.normHex(hex); if (!h) return 0;
    const [r, g, b] = [1, 3, 5].map((i) => { const v = parseInt(h.slice(i, i + 2), 16) / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  /** True when text on this background should be light. */
  C.isDark = (hex) => C.luminance(hex) < 0.4;
  C.contrast = (a, b) => { const x = C.luminance(a), y = C.luminance(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  /** Text colour for a filled accent button: whichever of near-black and white contrasts more. */
  C.onAccent = (hex) => (C.contrast(hex, '#05070a') >= C.contrast(hex, '#ffffff') ? '#05070a' : '#ffffff');
})();
