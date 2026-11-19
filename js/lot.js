// Hollow Creek — property generator
'use strict';
(() => {
  const T = HC.T, TS = HC.TILE;

  function makeTree(type, x, y, s) {
    const d = HC.TREES[type];
    return {
      id: HC.uid(), kind: 'tree', type, x, y, s,
      state: 'standing', marked: false, cut: 0, buck: 0,
      crownR: d.crown * TS * s, trunkR: d.trunk * Math.min(1.3, 0.7 + s * 0.4),
      len: d.height * TS * s, fallA: 0, fallT: 0, seed: Math.random() * 1000, damaged: false,
      maple: type === 'maple' ? HC.pick(['#5c9b2f', '#d9822b', '#c4452d', '#7aa83a']) : null,
    };
  }

  function base(job) {
    const w = job.w, h = job.h;
    const lot = {
      w, h, pw: w * TS, ph: h * TS, tiles: new Uint8Array(w * h),
      trees: [], items: [], stumps: [], bushes: [], houses: [], fences: [], poles: [], wires: [], plants: [],
      targets: [], zone: null, roadY: (h - 2) * TS,
    };
    const set = (x, y, t) => { if (x >= 0 && y >= 0 && x < w && y < h) lot.tiles[y * w + x] = t; };
    lot.set = set;
    for (let y = h - 2; y < h; y++) for (let x = 0; x < w; x++) set(x, y, T.ROAD);
    if (job.tract) return tractBase(lot, job, set);

    // House + driveway
    const STYLES = {
      ranch:     { w: [6, 7], h: [4, 4], walls: ['#e8dcc4', '#c9d8e0', '#e6c9a8', '#d8e2c8', '#f0e6d8', '#c7cdb8'], roofs: ['#4a4f57', '#5b4636', '#3e4a5c', '#6b5b4b'] },
      colonial:  { w: [5, 5], h: [4, 4], walls: ['#f2efe6', '#e6dcc8', '#b84a3a', '#c9d3d9'], roofs: ['#2f3338', '#3e4a5c', '#4a4f57'] },
      cape:      { w: [5, 5], h: [4, 4], walls: ['#f0ece2', '#d9e2e8', '#e9dcc0', '#8fa3b0'], roofs: ['#3b3f45', '#5a4a3c', '#2f3338'] },
      farmhouse: { w: [6, 6], h: [4, 5], walls: ['#f4f2ec', '#efe8d6'], roofs: ['#6b747a', '#5e676d', '#8a2e25', '#3e5a3a'] },
      cabin:     { w: [4, 5], h: [3, 4], walls: ['#8a5a36', '#7a4e2e', '#9a6a42'], roofs: ['#3e5a3a', '#6b2e24', '#3a3f45'] },
      modern:    { w: [6, 7], h: [4, 4], walls: ['#3b3e42', '#e9e9e6', '#5a5f63'], roofs: ['#2a2c2f', '#4a4d52'] },
    };
    const style = HC.pick(Object.keys(STYLES)), st = STYLES[style];
    const garage = style !== 'cabin' && HC.chance(0.5) ? HC.pick(['L', 'R']) : null;
    const hw = HC.randi(st.w[0], st.w[1]) + (garage ? 2 : 0), hh = HC.randi(st.h[0], st.h[1]);
    const hx = HC.randi(Math.floor(w * 0.25), Math.max(Math.floor(w * 0.25), Math.floor(w * 0.65) - hw + 4));
    const hy = HC.randi(4, Math.max(5, h - hh - 9));
    lot.houses.push({
      x: hx * TS, y: hy * TS, w: hw * TS, h: hh * TS, style, garage,
      wall: HC.pick(st.walls), roof: HC.pick(st.roofs), trim: HC.pick(['#ffffff', '#f4f1e8', '#2f3338']),
      shutter: HC.pick(['#2f4a3a', '#1f2f45', '#5a2a24', '#2f3338']), door: HC.pick(['#7a2a22', '#1f3a5a', '#2f4a3a', '#5a3a26', '#2f3338']),
      damaged: [],
    });
    const dx = hx + Math.floor(hw / 2) - 1;
    for (let y = hy + hh; y < h - 2; y++) { set(dx, y, T.GRAVEL); set(dx + 1, y, T.GRAVEL); }
    lot.drive = { x: dx * TS, w: 2 * TS, y0: (hy + hh) * TS };
    lot.house = lot.houses[0];

    // Power line along the road
    const py = (h - 2) * TS - 10;
    for (let x = 2; x < w; x += 7) lot.poles.push({ x: x * TS + 6, y: py, r: 6 });
    for (let i = 0; i < lot.poles.length - 1; i++) {
      const a = lot.poles[i], b = lot.poles[i + 1];
      lot.wires.push({ x1: a.x, y1: a.y - 4, x2: b.x, y2: b.y - 4, down: false });
    }

    // Fence along one side and the back
    const side = HC.pick(['left', 'right']);
    const fx = side === 'left' ? 1 : w - 2;
    lot.fences.push(...HC.fenceRun(fx, 1, fx, h - 5));
    const gap = HC.randi(4, w - 6);
    lot.fences.push(...HC.fenceRun(1, 1, w - 2, 1, {}, (x) => x >= gap && x < gap + 3));

    // Patches of tall grass and dirt for texture
    for (let i = 0; i < 6; i++) {
      const cx = HC.randi(0, w - 1), cy = HC.randi(0, h - 4), r = HC.randi(1, 3);
      for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++)
        if (Math.hypot(x - cx, y - cy) <= r + 0.3 && lot.tiles[y * w + x] === T.GRASS && y < h - 3) set(x, y, T.TALL);
    }

    lot.spawn = { x: lot.drive.x + TS, y: (h - 3.2) * TS };
    lot.trailer = { x: lot.drive.x + TS * 3.2, y: (h - 1) * TS, a: Math.PI };
    return lot;
  }

  // A woodland tract: no house, fence or power line. A dirt skid trail runs in from the road to a log landing.
  function tractBase(lot, job, set) {
    const w = lot.w, h = lot.h;
    const lx = HC.randi(3, Math.max(3, w - 13)), lw = 9, ly = h - 9, lh = 5; // the landing, near the road
    for (let y = ly; y < ly + lh; y++) for (let x = lx; x < lx + lw; x++) set(x, y, T.DIRT);
    const dx = lx + 3;
    for (let y = ly + lh; y < h - 2; y++) { set(dx, y, T.DIRT); set(dx + 1, y, T.DIRT); }
    // skid trail winding back into the woods
    let tx = dx;
    for (let y = ly - 1; y > 2; y--) { tx = HC.clamp(tx + HC.randi(-1, 1), 2, w - 4); set(tx, y, T.DIRT); set(tx + 1, y, T.DIRT); }
    lot.drive = { x: dx * TS, w: 2 * TS, y0: ly * TS };
    lot.landing = { x: lx * TS, y: ly * TS, w: lw * TS, h: lh * TS };
    lot.house = null;
    for (let i = 0; i < 10; i++) { // undergrowth
      const cx = HC.randi(0, w - 1), cy = HC.randi(0, h - 4), r = HC.randi(1, 3);
      for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++)
        if (Math.hypot(x - cx, y - cy) <= r + 0.3 && lot.tiles[y * w + x] === T.GRASS && y < h - 3) set(x, y, T.TALL);
    }
    lot.spawn = { x: (lx + lw / 2) * TS, y: (ly + lh / 2) * TS };
    lot.trailer = { x: dx * TS + TS * 3.2, y: (h - 1) * TS, a: Math.PI };
    lot.tract = true;
    return lot;
  }
  const onTrail = (lot, x, y) => { const t = lot.tiles[Math.floor(y / TS) * lot.w + Math.floor(x / TS)]; return t === T.DIRT; };

  // Is a spot free for a new tree/object?
  function blocked(lot, x, y, pad) {
    if (x < TS * 1.5 || y < TS * 2 || x > lot.pw - TS * 1.5 || y > lot.ph - TS * 3.6) return true;
    for (const hs of lot.houses) if (HC.circleRectHit(x, y, pad, hs)) return true;
    if (x > lot.drive.x - pad && x < lot.drive.x + lot.drive.w + pad && y > lot.drive.y0 - pad) return true;
    for (const t of lot.trees) if (HC.dist(x, y, t.x, t.y) < pad + t.trunkR + 30) return true;
    if (HC.dist(x, y, lot.spawn.x, lot.spawn.y) < 70) return true;
    if (lot.tract && (onTrail(lot, x, y) || (lot.landing && HC.circleRectHit(x, y, pad, lot.landing)))) return true;
    return false;
  }

  function scatterTrees(lot, n, types, pad = 26, area = null) {
    let tries = 0;
    while (n > 0 && tries++ < 3000) {
      const x = area ? HC.rand(area.x, area.x + area.w) : HC.rand(0, lot.pw);
      const y = area ? HC.rand(area.y, area.y + area.h) : HC.rand(0, lot.ph);
      if (blocked(lot, x, y, pad)) continue;
      lot.trees.push(makeTree(HC.pick(types), x, y, HC.rand(0.75, 1.2)));
      n--;
    }
  }

  function scatterRocks(lot, n, area) {
    for (let i = 0, tries = 0; i < n && tries < 500; tries++) {
      const x = area ? HC.rand(area.x, area.x + area.w) : HC.rand(0, lot.pw);
      const y = area ? HC.rand(area.y, area.y + area.h) : HC.rand(0, lot.ph);
      if (blocked(lot, x, y, 16)) continue;
      lot.items.push({ id: HC.uid(), kind: 'rock', x, y, a: HC.rand(0, 6.28), size: HC.rand(0.8, 1.2), value: 0 });
      i++;
    }
  }

  function scatterBushes(lot, n, area) {
    for (let i = 0, tries = 0; i < n && tries < 800; tries++) {
      const x = area ? HC.rand(area.x, area.x + area.w) : HC.rand(0, lot.pw);
      const y = area ? HC.rand(area.y, area.y + area.h) : HC.rand(0, lot.ph);
      if (blocked(lot, x, y, 12)) continue;
      lot.bushes.push({ id: HC.uid(), x, y, r: HC.rand(10, 16), hp: 0, seed: Math.random() * 99 });
      i++;
    }
  }

  const GEN = {
    scenery(lot) {
      if (lot.tract) { // thick timber
        scatterTrees(lot, Math.round(lot.w * lot.h / 9), ['pine', 'pine', 'oak', 'maple', 'oak', 'pine'], 8);
        scatterBushes(lot, HC.randi(10, 18));
        return;
      }
      scatterTrees(lot, Math.round(lot.w * lot.h / 30), ['oak', 'pine', 'maple', 'maple', 'pine']);
      scatterBushes(lot, HC.randi(3, 6));
    },
    tree_removal(lot, job) {
      scatterTrees(lot, Math.round(lot.w * lot.h / 22), ['oak', 'oak', 'pine', 'maple', 'maple', 'pine']);
      // A few dead hazard trees
      for (const t of lot.trees) if (HC.chance(0.12)) Object.assign(t, makeTree('dead', t.x, t.y, t.s), { id: t.id });
      // Flag trees nearest the house / lines first (that's why the customer called)
      const hc = { x: lot.house.x + lot.house.w / 2, y: lot.house.y + lot.house.h / 2 };
      const ranked = lot.trees.slice().sort((a, b) =>
        (HC.dist(a.x, a.y, hc.x, hc.y) - (a.type === 'dead' ? 200 : 0)) -
        (HC.dist(b.x, b.y, hc.x, hc.y) - (b.type === 'dead' ? 200 : 0)));
      const n = Math.min(ranked.length, job.count);
      const pool = ranked.slice(0, Math.ceil(n * 1.6)).sort(() => Math.random() - 0.5);
      for (let i = 0; i < n; i++) pool[i].marked = true;
      scatterBushes(lot, HC.randi(4, 8));
      scatterRocks(lot, HC.randi(1, 3));
    },
  };

  HC.Lot = {
    // The house, drive and fence come from the parcel's seed so a property always looks the same.
    // The job's content (which trees, stumps, sod...) is rolled fresh.
    generate(job) {
      const lot = HC.withSeed(job.seed, () => base(job));
      if (job.type === 'scenery') HC.withSeed(job.seed + 7, () => GEN.scenery(lot, job));
      else (GEN[job.type] || GEN.tree_removal)(lot, job);
      return lot;
    },
    makeTree, scatterTrees, scatterRocks, scatterBushes, GEN,
    tile(lot, x, y) {
      const tx = Math.floor(x / TS), ty = Math.floor(y / TS);
      if (tx < 0 || ty < 0 || tx >= lot.w || ty >= lot.h) return -1;
      return lot.tiles[ty * lot.w + tx];
    },
  };
})();
