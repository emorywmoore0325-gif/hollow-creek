// Hollow Creek — shared namespace, math and geometry helpers
'use strict';
const HC = (window.HC = window.HC || {});

HC.TILE = 32;
HC.rand = (a, b) => a + Math.random() * (b - a);
HC.randi = (a, b) => Math.floor(HC.rand(a, b + 1));
HC.pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
HC.chance = (p) => Math.random() < p;
HC.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
HC.lerp = (a, b, t) => a + (b - a) * t;
HC.dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
HC.angDiff = (a, b) => {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
};
let uidN = 1;
HC.uid = () => uidN++;
HC.uidAtLeast = (m) => { if (typeof m === 'number' && m >= uidN) uidN = m + 1; }; // after loading saved objects

// Distance from point to segment
HC.segPointDist = (x1, y1, x2, y2, px, py) => {
  const dx = x2 - x1, dy = y2 - y1;
  const l2 = dx * dx + dy * dy;
  let t = l2 ? ((px - x1) * dx + (py - y1) * dy) / l2 : 0;
  t = HC.clamp(t, 0, 1);
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
};

function segsCross(ax, ay, bx, by, cx, cy, dx, dy) {
  const d1 = (dx - cx) * (ay - cy) - (dy - cy) * (ax - cx);
  const d2 = (dx - cx) * (by - cy) - (dy - cy) * (bx - cx);
  const d3 = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  const d4 = (bx - ax) * (dy - ay) - (by - ay) * (dx - ax);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

HC.segSegDist = (ax, ay, bx, by, cx, cy, dx, dy) => {
  if (segsCross(ax, ay, bx, by, cx, cy, dx, dy)) return 0;
  return Math.min(
    HC.segPointDist(ax, ay, bx, by, cx, cy),
    HC.segPointDist(ax, ay, bx, by, dx, dy),
    HC.segPointDist(cx, cy, dx, dy, ax, ay),
    HC.segPointDist(cx, cy, dx, dy, bx, by)
  );
};

const inRect = (x, y, r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
HC.inRect = inRect;

// Does a thick segment (radius rad) touch a rect?
HC.segRectHit = (x1, y1, x2, y2, rad, r) => {
  if (inRect(x1, y1, r) || inRect(x2, y2, r)) return true;
  const e = [
    [r.x, r.y, r.x + r.w, r.y], [r.x + r.w, r.y, r.x + r.w, r.y + r.h],
    [r.x + r.w, r.y + r.h, r.x, r.y + r.h], [r.x, r.y + r.h, r.x, r.y],
  ];
  for (const s of e) if (HC.segSegDist(x1, y1, x2, y2, s[0], s[1], s[2], s[3]) <= rad) return true;
  return false;
};

HC.circleRectHit = (cx, cy, cr, r) => {
  const nx = HC.clamp(cx, r.x, r.x + r.w), ny = HC.clamp(cy, r.y, r.y + r.h);
  return Math.hypot(cx - nx, cy - ny) < cr;
};

// Push a circle body {x,y,r} out of a circle obstacle. Returns true if it collided.
HC.pushOutCircle = (u, cx, cy, cr) => {
  const dx = u.x - cx, dy = u.y - cy, d = Math.hypot(dx, dy), min = u.r + cr;
  if (d < min && d > 0.0001) {
    u.x = cx + (dx / d) * min;
    u.y = cy + (dy / d) * min;
    return true;
  }
  return false;
};

HC.pushOutRect = (u, r) => {
  const nx = HC.clamp(u.x, r.x, r.x + r.w), ny = HC.clamp(u.y, r.y, r.y + r.h);
  const dx = u.x - nx, dy = u.y - ny, d = Math.hypot(dx, dy);
  if (d < u.r) {
    if (d < 0.0001) { // centre inside rect: push out along shallowest axis
      const l = u.x - r.x, rr = r.x + r.w - u.x, t = u.y - r.y, b = r.y + r.h - u.y;
      const m = Math.min(l, rr, t, b);
      if (m === l) u.x = r.x - u.r; else if (m === rr) u.x = r.x + r.w + u.r;
      else if (m === t) u.y = r.y - u.r; else u.y = r.y + r.h + u.r;
    } else {
      u.x = nx + (dx / d) * u.r;
      u.y = ny + (dy / d) * u.r;
    }
    return true;
  }
  return false;
};

HC.money = (n) => (n < 0 ? '-$' : '$') + Math.abs(Math.round(n)).toLocaleString('en-US');
HC.clock = (mins) => {
  const h = Math.floor(mins / 60), m = Math.floor(mins % 60);
  const hh = ((h + 11) % 12) + 1;
  return `${hh}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
};
HC.dur = (mins) => {
  mins = Math.round(mins);
  const h = Math.floor(mins / 60), m = mins % 60;
  return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`;
};

// Colour helper: shade a hex colour by amount (-1..1)
HC.shade = (hex, amt) => {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const t = amt < 0 ? 0 : 255, p = Math.abs(amt);
  r = Math.round((t - r) * p + r); g = Math.round((t - g) * p + g); b = Math.round((t - b) * p + b);
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
};

HC.esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Run fn with Math.random replaced by a seeded generator (mulberry32)
HC.withSeed = (seed, fn) => {
  const orig = Math.random;
  let a = (seed * 2654435761) >>> 0;
  Math.random = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  try { return fn(); } finally { Math.random = orig; }
};

// Fence segments along an axis-aligned run between two tile centres (tile coords). skip(col or row) leaves gaps (gates).
HC.fenceRun = (x0, y0, x1, y1, extra = {}, skip = () => false) => {
  const TS = HC.TILE, out = [];
  if (y0 === y1) for (let x = Math.min(x0, x1); x < Math.max(x0, x1); x++) { if (!skip(x)) out.push({ x: (x + 0.5) * TS, y: (y0 + 0.5) * TS - 3, w: TS, h: 6, v: false, broken: false, ...extra }); }
  else for (let y = Math.min(y0, y1); y < Math.max(y0, y1); y++) { if (!skip(y)) out.push({ x: (x0 + 0.5) * TS - 3, y: (y + 0.5) * TS, w: 6, h: TS, v: true, broken: false, ...extra }); }
  return out;
};
