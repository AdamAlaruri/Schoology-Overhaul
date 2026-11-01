/* Topographic contour map generator. Pure geometry, no DOM, so it runs before first paint and is testable in Node.
 *
 * A smooth elevation field is built from a handful of hills, warped by value noise so nothing is round or symmetrical.
 * Marching squares then extracts iso-lines at evenly spaced elevations, exactly how a real contour map is drawn, so spacing
 * tightens on steep slopes and widens on plateaus, and several unrelated "regions" appear on their own. Each contour is
 * chained into a polyline and written out as smooth cubic Bézier SVG path data (Catmull-Rom converted to Bézier). */
(() => {
  const T = (window.SGO_TOPO = window.SGO_TOPO || {});
  if (T.build) return;

  const rng = (seed) => () => { // mulberry32: the same seed always gives the same map
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const valueNoise = (seed) => {
    const r = rng(seed), N = 64, g = new Float32Array(N * N);
    for (let i = 0; i < g.length; i++) g[i] = r();
    const at = (i, j) => g[(((j % N) + N) % N) * N + (((i % N) + N) % N)], smooth = (t) => t * t * (3 - 2 * t);
    return (x, y) => {
      const xi = Math.floor(x), yi = Math.floor(y), u = smooth(x - xi), v = smooth(y - yi);
      return (at(xi, yi) * (1 - u) + at(xi + 1, yi) * u) * (1 - v) + (at(xi, yi + 1) * (1 - u) + at(xi + 1, yi + 1) * u) * v;
    };
  };
  /** Elevation at (x, y), with x in [0, aspect] and y in [0, 1]. */
  const makeField = (seed, aspect) => {
    const r = rng(seed ^ 0x9e3779b1), warp = valueNoise(seed + 1), fine = valueNoise(seed + 2);
    const hills = Array.from({ length: 8 }, () => ({ x: r() * aspect, y: r(), s: 0.09 + r() * 0.15, a: 0.55 + r() * 0.75 }));
    return (x, y) => {
      const wx = x + (warp(x * 2.1, y * 2.1) - 0.5) * 0.42, wy = y + (warp(x * 2.1 + 9.1, y * 2.1 + 4.3) - 0.5) * 0.42;
      let z = 0;
      for (const h of hills) { const dx = wx - h.x, dy = wy - h.y; z += h.a * Math.exp(-(dx * dx + dy * dy) / (2 * h.s * h.s)); }
      return z + 0.26 * fine(x * 3.4, y * 3.4) + 0.1 * fine(x * 8.5, y * 8.5);
    };
  };

  /** Iso-line segments of one level. Edges are named, so neighbouring cells share exact endpoints and lines chain without gaps. */
  const segmentsAt = (val, cols, rows, L) => {
    const segs = [], v = (i, j) => val[j * (cols + 1) + i];
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const a = v(i, j), b = v(i + 1, j), c = v(i + 1, j + 1), d = v(i, j + 1);
      const idx = (a > L ? 8 : 0) | (b > L ? 4 : 0) | (c > L ? 2 : 0) | (d > L ? 1 : 0);
      if (idx === 0 || idx === 15) continue;
      const E = {
        t: { k: `h${i},${j}`, x: i + (L - a) / (b - a), y: j }, r: { k: `v${i + 1},${j}`, x: i + 1, y: j + (L - b) / (c - b) },
        b: { k: `h${i},${j + 1}`, x: i + (L - d) / (c - d), y: j + 1 }, l: { k: `v${i},${j}`, x: i, y: j + (L - a) / (d - a) },
      };
      const centre = (a + b + c + d) / 4 > L;
      const pairs = {
        1: [['l', 'b']], 2: [['b', 'r']], 3: [['l', 'r']], 4: [['t', 'r']], 6: [['t', 'b']], 7: [['l', 't']], 8: [['t', 'l']], 9: [['t', 'b']], 11: [['t', 'r']], 12: [['l', 'r']], 13: [['b', 'r']], 14: [['l', 'b']],
        5: centre ? [['t', 'l'], ['b', 'r']] : [['t', 'r'], ['l', 'b']], 10: centre ? [['t', 'r'], ['l', 'b']] : [['t', 'l'], ['b', 'r']],
      }[idx];
      for (const [p, q] of pairs) segs.push([E[p], E[q]]);
    }
    return segs;
  };
  /** Join segments end to end into polylines; closed loops come back flagged. */
  const chain = (segs) => {
    const byEdge = new Map();
    segs.forEach((s, n) => s.forEach((e) => { const l = byEdge.get(e.k); l ? l.push(n) : byEdge.set(e.k, [n]); }));
    const used = new Uint8Array(segs.length), lines = [];
    const next = (key, from) => { const l = byEdge.get(key) || []; for (const n of l) if (n !== from && !used[n]) return n; return -1; };
    for (let s = 0; s < segs.length; s++) {
      if (used[s]) continue;
      used[s] = 1;
      const pts = [segs[s][0], segs[s][1]];
      let cur = s, tail = segs[s][1].k, closed = false;
      for (;;) { // grow forwards
        const n = next(tail, cur); if (n < 0) break;
        used[n] = 1; const [p, q] = segs[n][0].k === tail ? [segs[n][0], segs[n][1]] : [segs[n][1], segs[n][0]];
        pts.push(q); cur = n; tail = q.k;
        if (q.k === pts[0].k) { closed = true; break; }
      }
      if (!closed) { // then backwards from the start
        cur = s; let head = segs[s][0].k;
        for (;;) {
          const n = next(head, cur); if (n < 0) break;
          used[n] = 1; const q = segs[n][0].k === head ? segs[n][1] : segs[n][0];
          pts.unshift(q); cur = n; head = q.k;
        }
      }
      lines.push({ pts, closed });
    }
    return lines;
  };
  /** Polyline -> smooth cubic Bézier path data. Every other point is kept; Catmull-Rom tangents give the curve its flow. */
  const toPath = (pts, closed, sx, sy) => {
    let p = pts.filter((_, i) => i % 2 === 0);
    if (closed) p = p.slice(0, -1);
    if (p.length < 5) return '';
    const P = p.map((q) => [q.x * sx, q.y * sy]), n = P.length, f = (v) => (Math.round(v * 10) / 10).toString();
    const at = (i) => (closed ? P[((i % n) + n) % n] : P[Math.max(0, Math.min(n - 1, i))]);
    let d = `M${f(P[0][0])} ${f(P[0][1])}`;
    const last = closed ? n : n - 1;
    for (let i = 0; i < last; i++) {
      const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
      d += `C${f(p1[0] + (p2[0] - p0[0]) / 6)} ${f(p1[1] + (p2[1] - p0[1]) / 6)} ${f(p2[0] - (p3[0] - p1[0]) / 6)} ${f(p2[1] - (p3[1] - p1[1]) / 6)} ${f(p2[0])} ${f(p2[1])}`;
    }
    return closed ? d + 'Z' : d;
  };

  const memo = new Map();
  /** { width, height, paths: [{ d, o, major }] }. Cached per size and seed, so navigating never regenerates it. */
  T.DENSITY = { light: 14, standard: 26, dense: 42 };
  T.build = (width = 1600, height = 900, seed = 20260, density = 'standard') => {
    const LEVELS = T.DENSITY[density] || T.DENSITY.standard, key = `${width}x${height}:${seed}:${LEVELS}`;
    if (memo.has(key)) return memo.get(key);
    const cols = 128, rows = Math.round((cols * height) / width), aspect = width / height, field = makeField(seed, aspect);
    const val = new Float32Array((cols + 1) * (rows + 1));
    let lo = Infinity, hi = -Infinity;
    for (let j = 0; j <= rows; j++) for (let i = 0; i <= cols; i++) { const z = field((i / cols) * aspect, j / rows); val[j * (cols + 1) + i] = z; if (z < lo) lo = z; if (z > hi) hi = z; }
    const sx = width / cols, sy = height / rows, paths = [];
    for (let k = 0; k < LEVELS; k++) {
      const t = 0.035 + 0.93 * Math.pow(k / (LEVELS - 1), 1.12), L = lo + (hi - lo) * t;
      const major = k % (LEVELS > 30 ? 6 : 5) === 0, o = major ? 0.9 : Math.round((0.38 + 0.34 * Math.abs(Math.sin(k * 1.9))) * 100) / 100;
      for (const line of chain(segmentsAt(val, cols, rows, L))) {
        const d = toPath(line.pts, line.closed, sx, sy);
        if (d) paths.push({ d, o, major });
      }
    }
    const out = { width, height, paths };
    memo.set(key, out);
    return out;
  };
  /** The map as SVG markup. Stroke colours come from CSS variables, so changing them recolours the paths themselves. */
  T.svg = (width, height, seed, density) => {
    // the glow is only drawn under the index (major) contours: enough to light the map, half the markup
    const m = T.build(width, height, seed, density), p = (c) => m.paths.filter((x) => c || x.major).map((x) => `<path d="${x.d}"${c ? ` class="${x.major ? 'mj' : ''}" stroke-opacity="${x.o}"` : ''}/>`).join('');
    return `<svg id="sgo-topo" viewBox="0 0 ${m.width} ${m.height}" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false"><g class="topo-glow">${p(false)}</g><g class="topo-lines">${p(true)}</g></svg>`;
  };
})();
