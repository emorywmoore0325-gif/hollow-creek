// Hollow Creek — the open world: curving roads, a creek, rolling hills, forest, customer lots and equipment yards
'use strict';
(() => {
  const TS = HC.TILE, T = HC.T;
  const W = 380, H = 275, PH = 16; // world tiles; customer lot depth (tiles, excluding road frontage)
  const LISTS = ['trees', 'items', 'stumps', 'bushes', 'houses', 'fences', 'poles', 'wires', 'plants'];
  const WATER_Y = -0.22;

  // Road and creek centre lines in tile coordinates (smoothed with Catmull-Rom)
  const ROADS = [
    { name: 'Hollow Creek Rd', pts: [[-3, 84], [25, 79], [55, 86], [90, 77], [125, 82], [160, 74], [195, 80], [230, 76], [262, 83], [300, 79], [340, 73], [383, 78]], poles: true, lots: true },
    { name: 'Ridge Rd', pts: [[98, 79], [94, 62], [104, 45], [99, 28], [108, 10], [112, -3]], poles: false, lots: false },
    { name: 'Mill Branch Rd', pts: [[47, 84], [41, 100], [56, 119], [90, 127], [130, 123], [157, 107], [163, 76]], poles: true, lots: true },
    { name: 'Fox Run', pts: [[103, 42], [128, 36], [155, 40], [185, 32], [230, 35], [265, 29], [300, 34], [340, 41], [383, 37]], poles: true, lots: true },
    { name: 'County Line Rd', pts: [[22, -3], [26, 30], [20, 58], [25, 100], [18, 140], [24, 175], [20, 218], [25, 248], [20, 278]], poles: true, lots: false },
    { name: 'Orchard Ln', pts: [[20, 140], [50, 136], [80, 144], [110, 141], [140, 147], [175, 139], [230, 143], [266, 150], [300, 146], [352, 149]], poles: true, lots: true },
    { name: 'Sawmill Rd', pts: [[262, 83], [268, 104], [259, 126], [266, 150], [272, 180], [266, 218], [271, 236]], poles: true, lots: true },
    { name: 'Bottom Rd', pts: [[22, 188], [60, 183], [100, 193], [145, 186], [195, 195], [235, 186], [270, 182]], poles: true, lots: true },
    // the timber country: woodland tracts for forestry work, no houses
    { name: 'Timber Ridge Rd', pts: [[340, 73], [352, 98], [345, 124], [352, 149], [347, 178], [355, 208], [349, 238], [352, 278]], poles: false, lots: false },
    { name: 'Pine Knob Rd', pts: [[259, 126], [290, 121], [322, 131], [345, 124]], poles: false, lots: false, tracts: true },
    { name: 'Cedar Bluff Rd', pts: [[272, 180], [298, 194], [325, 187], [351, 193]], poles: false, lots: false, tracts: true },
    { name: 'Hemlock Hollow Rd', pts: [[25, 248], [70, 240], [118, 251], [168, 241], [218, 252], [271, 236], [310, 245], [349, 238]], poles: false, lots: false, tracts: true },
  ];
  // gravel logging and quarry roads (no paint, slower)
  const DIRT_ROADS = [
    [[26, 24], [44, 18], [62, 25], [74, 12], [86, 8]],
    [[150, 39], [146, 52], [132, 58]],
    [[206, 34], [207, 26]],
    [[352, 98], [368, 92], [376, 80]], [[218, 252], [222, 266], [236, 270]],
  ];
  const CREEK = [[160, -3], [152, 16], [168, 38], [155, 60], [138, 74], [130, 94], [146, 113], [133, 132], [143, 150], [137, 172], [148, 196], [140, 218], [150, 245], [142, 278]];
  const PONDS = [{ x: 58, y: 42, rx: 7, ry: 4.5 }, { x: 200, y: 118, rx: 9, ry: 5.5 }, { x: 236, y: 205, rx: 8, ry: 4.5 }, { x: 318, y: 100, rx: 8, ry: 5 }, { x: 95, y: 262, rx: 7, ry: 4 }];
  const POND = PONDS[0];
  const pondD = (x, y) => Math.min(...PONDS.map((p) => Math.hypot((x - p.x) / p.rx, (y - p.y) / p.ry)));
  const QUARRY = { gx: 188, gy: 3, pw: 38, ph: 24 };

  function spline(pts, step = 0.25) {
    const out = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
      const n = Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / step);
      for (let k = 0; k < n; k++) {
        const t = k / n, t2 = t * t, t3 = t2 * t;
        const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
        out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
      }
    }
    out.push(pts[pts.length - 1]);
    return out;
  }

  // distance field (in tiles) from sample points, out to radius R
  function distField(samples, R) {
    const d = new Float32Array(W * H).fill(99);
    for (const [sx, sy] of samples) {
      const x0 = Math.max(0, Math.floor(sx - R)), x1 = Math.min(W - 1, Math.ceil(sx + R));
      const y0 = Math.max(0, Math.floor(sy - R)), y1 = Math.min(H - 1, Math.ceil(sy + R));
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const v = Math.hypot(x + 0.5 - sx, y + 0.5 - sy);
        if (v < d[y * W + x]) d[y * W + x] = v;
      }
    }
    return d;
  }

  function emptyWorld() {
    const w = { w: W, h: H, pw: W * TS, ph: H * TS, tiles: new Uint8Array(W * H), parcels: [], targets: [], zone: null,
      yards: [], pumps: [], pads: [], storage: [], sheds: [], boulders: [], bays: [], rails: [], roads: [], creek: null, pond: POND, ponds: PONDS };
    for (const k of LISTS) w[k] = [];
    w.set = (x, y, t) => { if (x >= 0 && y >= 0 && x < W && y < H) w.tiles[y * W + x] = t; };
    w.tile = (x, y) => (x >= 0 && y >= 0 && x < W && y < H ? w.tiles[y * W + x] : -1);
    return w;
  }

  // ---------- lots ----------
  // Mirror a generated lot top-to-bottom so it faces a road to its north
  function flipLot(lot) {
    const Hp = lot.ph, h = lot.h;
    const t2 = new Uint8Array(lot.tiles.length);
    for (let y = 0; y < h; y++) t2.set(lot.tiles.subarray((h - 1 - y) * lot.w, (h - y) * lot.w), y * lot.w);
    lot.tiles = t2;
    for (const k of ['trees', 'items', 'stumps', 'bushes', 'plants']) for (const o of lot[k] || []) o.y = Hp - o.y;
    for (const k of ['houses', 'fences']) for (const o of lot[k]) o.y = Hp - o.y - o.h;
    for (const hs of lot.houses) hs.facing = -1;
    if (lot.zone) lot.zone.y = Hp - lot.zone.y - lot.zone.h;
    if (lot.landing) lot.landing.y = Hp - lot.landing.y - lot.landing.h;
    for (const t of lot.targets) t.ty = h - 1 - t.ty;
    lot.spawn.y = Hp - lot.spawn.y;
    lot.drive.flip = true;
  }

  // Copy a generated lot into the world at a parcel, replacing what was there
  function stamp(world, p, lot, isJob) {
    if (p.flip) flipLot(lot);
    for (const k of LISTS) world[k] = world[k].filter((o) => o.parcel !== p.id || k === 'poles' || k === 'wires');
    const oy = p.y - (p.flip ? 2 * TS : 0), ox = p.x;
    const move = (o) => Object.assign(o, { parcel: p.id, x: o.x + ox, y: o.y + oy });
    for (const k of ['trees', 'items', 'stumps', 'bushes', 'houses', 'fences', 'plants']) for (const o of lot[k] || []) world[k].push(move(o));
    const r0 = p.flip ? 2 : 0;
    for (let y = r0; y < r0 + PH; y++) for (let x = 0; x < lot.w; x++) {
      const t = lot.tiles[y * lot.w + x], wx = p.gx + x, wy = p.gy + y - r0, cur = world.tile(wx, wy);
      if (t === T.ROAD || cur === T.ROAD || cur === T.WATER) continue;
      world.set(wx, wy, t);
    }
    // run the gravel drive out to the road
    const dx = Math.floor(lot.drive.x / TS) + p.gx;
    for (const c of [dx, dx + 1]) {
      let y = p.flip ? p.gy - 1 : p.gy + PH;
      for (let n = 0; n < 9 && world.tile(c, y) !== T.ROAD && world.tile(c, y) !== -1; n++, y += p.flip ? -1 : 1) world.set(c, y, T.GRAVEL);
    }
    p.spawn = { x: lot.spawn.x + ox, y: lot.spawn.y + oy };
    p.house = lot.house;
    if (lot.landing) p.landing = { x: lot.landing.x + ox, y: lot.landing.y + oy, w: lot.landing.w, h: lot.landing.h };
    if (isJob) {
      world.zone = lot.zone ? { x: lot.zone.x + ox, y: lot.zone.y + oy, w: lot.zone.w, h: lot.zone.h } : null;
      world.targets = lot.targets.map((t) => Object.assign(t, { tx: t.tx + p.gx, ty: t.ty + p.gy - r0 }));
    }
  }

  // Find lot positions along a road: lots sit just north of it, or just south (flipped)
  function placeLots(world, road, samples, rd, taken, pw, ph, wantX, widths = [21, 26]) {
    const centre = (c) => {
      let s = 0, n = 0;
      for (const [x, y] of samples) if (Math.abs(x - c - 0.5) < 0.6) { s += y; n++; }
      return n ? s / n : null;
    };
    const fits = (gx, gy, w, h) => {
      if (gx < 2 || gy < 2 || gx + w > W - 2 || gy + h > H - 2) return false;
      for (const r of taken) if (gx < r.gx + r.pw + 2 && gx + w + 2 > r.gx && gy < r.gy + r.ph + 2 && gy + h + 2 > r.gy) return false;
      for (let y = gy - 1; y <= gy + h; y++) for (let x = gx - 1; x <= gx + w; x++) {
        const t = world.tile(x, y);
        if (t === T.WATER || t === T.ROAD || rd[y * W + x] < 1.6) return false;
      }
      return true;
    };
    const lot = (gx, w, side) => {
      let ext = side < 0 ? 999 : -999;
      for (let c = gx; c < gx + w; c++) {
        const y = centre(c);
        if (y === null) return null;
        ext = side < 0 ? Math.min(ext, y) : Math.max(ext, y);
      }
      const gy = side < 0 ? Math.floor(ext - 2.3) - ph : Math.ceil(ext + 2.3);
      return fits(gx, gy, w, ph) ? { gx, gy, pw: w, ph, flip: side > 0 } : null;
    };
    if (wantX !== undefined) {
      for (let x = wantX; x < wantX + 60; x += 2) { const r = lot(x, pw, -1); if (r) return r; }
      return null;
    }
    const out = [];
    for (const side of [-1, 1]) {
      let x = 3 + HC.randi(0, 5);
      while (x < W - widths[0] - 1) {
        const w = HC.randi(widths[0], widths[1]), r = lot(x, w, side);
        if (r) { out.push(r); taken.push(r); x += w + HC.randi(3, 8); } else x += 2;
      }
    }
    return out;
  }

  // ---------- yards ----------
  // a closed fence on tile centres: corners line up, the gate is a gap in the bottom run
  function fenceRect(world, x0, y0, x1, y1, gate, tag) {
    const ex = { parcel: tag, yard: true };
    world.fences.push(...HC.fenceRun(x0, y0, x1, y0, ex), ...HC.fenceRun(x0, y1, x1, y1, ex, (x) => x >= gate[0] && x < gate[1]),
      ...HC.fenceRun(x0, y0, x0, y1, ex), ...HC.fenceRun(x1, y0, x1, y1, ex));
  }

  // The home yard sits on a 50-tile-wide plot: 34 tiles built, 16 held for expansion
  const HQ_BASE = 34;
  function layoutHQ(world, level) {
    const r = world.hqR, yard = world.yard, { gx, gy, ph } = r, P = (x, y) => ({ x: (gx + x) * TS, y: (gy + y) * TS });
    const pw = level >= 2 ? r.pw : HQ_BASE;
    for (let y = 0; y < ph; y++) for (let x = 0; x < r.pw; x++) {
      const cur = world.tile(gx + x, gy + y);
      if (x >= pw) { if (cur === T.GRAVEL) world.set(gx + x, gy + y, T.GRASS); continue; }
      if (cur === T.DIRT && x < 11) continue; // the log pad
      world.set(gx + x, gy + y, x === 0 || x === pw - 1 || y === 0 ? T.GRASS : T.GRAVEL);
    }
    Object.assign(yard, { w: pw * TS, pw, level });
    world.fences = world.fences.filter((f) => f.parcel !== 'hq');
    world.sheds = world.sheds.filter((s2) => s2.yard !== 'hq');
    world.bays = world.bays.filter((b) => b.yard !== 'hq');
    // equipment compound: one fence around it, gate at the bottom; it grows east with each upgrade
    const right = level >= 2 ? r.pw - 2 : HQ_BASE - 2;
    fenceRect(world, gx + 21, gy + 1, gx + right, gy + ph - 4, [gx + 23, gx + Math.min(right - 1, 33)], 'hq'); // a wide gate: room to swing a trailer in
    world.sheds.push({ ...P(22, 2), w: (HQ_BASE - 25) * TS, h: 4 * TS, yard: 'hq' });
    for (let i = 0; i < 5; i++) world.bays.push({ ...P(23.2 + i * 2.1, 4.3), a: -Math.PI / 2, yard: 'hq', kind: 'machine' });
    for (let i = 0; i < 3; i++) world.bays.push({ ...P(23.6 + i * 3.1, 12), a: Math.PI / 2, yard: 'hq', kind: 'trailer' });
    for (let i = 0; i < 3; i++) world.bays.push({ ...P(23.6 + i * 3.1, 8.2), a: Math.PI / 2, yard: 'hq', kind: 'trailer' });
    if (level >= 2) for (let i = 0; i < 4; i++) world.bays.push({ ...P(35.6 + i * 3.1, 12), a: Math.PI / 2, yard: 'hq', kind: 'trailer' });
    // the expansion comes with a second building: an enclosed storage barn along the back fence
    world.houses = world.houses.filter((h) => h.id !== 'hqBarn');
    if (level >= 2) world.houses.push({ ...P(35, 2), w: 12 * TS, h: 4.2 * TS, wall: '#9a4a36', roof: '#4a5058', damaged: [], label: 'Storage barn', yard: true, shed: true, facing: 1, parcel: 'hq', id: 'hqBarn' });
    if (level >= 3) { // and then a lean-to equipment shed out front of the barn
      world.sheds.push({ ...P(34.5, 6.4), w: 12.5 * TS, h: 3.4 * TS, yard: 'hq' });
      for (let i = 0; i < 5; i++) world.bays.push({ ...P(36 + i * 2.4, 8.1), a: -Math.PI / 2, yard: 'hq', kind: 'machine' });
    }
  }
  function upgradeHQ(world, level) { layoutHQ(world, level); }

  function buildHQ(world, r) {
    const { gx, gy, ph } = r, pw = HQ_BASE, P = (x, y) => ({ x: (gx + x) * TS, y: (gy + y) * TS });
    for (let y = 0; y < ph; y++) for (let x = 0; x < pw; x++) world.set(gx + x, gy + y, x === 0 || x === pw - 1 || y === 0 ? T.GRASS : T.GRAVEL);
    const yard = { id: 'hq', name: 'Home Yard', x: gx * TS, y: gy * TS, w: pw * TS, h: ph * TS, gx, gy, pw, ph, owned: true };
    world.yards.push(yard);
    world.hqR = r; world.yard = yard;
    world.houses.push({ ...P(2, 3), w: 7 * TS, h: 5 * TS, wall: '#c9532c', roof: '#33404d', damaged: [], label: 'Office', yard: true, facing: 1, parcel: 'hq' });
    world.houses.push({ ...P(11, 2), w: 8 * TS, h: 6 * TS, wall: '#8a9a6a', roof: '#5a5f66', damaged: [], label: 'Repair shop', yard: true, shed: true, facing: 1, parcel: 'hq' });
    // debris storage, pump
    for (let y = 11; y < 17; y++) for (let x = 2; x < 10; x++) world.set(gx + x, gy + y, T.DIRT);
    world.storage.push({ ...P(2, 11), w: 8 * TS, h: 6 * TS, yard: 'hq' });
    world.pumps.push({ ...P(13.5, 12.5), yard: 'hq' });
    yard.spawn = P(15, 15.5);
    yard.office = P(5.5, 9.3);
    layoutHQ(world, (HC.company && HC.company.yardLevel) || 1);
    return yard;
  }

  function buildRidge(world, r) {
    const { gx, gy, pw, ph } = r, P = (x, y) => ({ x: (gx + x) * TS, y: (gy + y) * TS });
    for (let y = 1; y < ph; y++) for (let x = 1; x < pw - 1; x++) world.set(gx + x, gy + y, T.GRAVEL);
    const yard = { id: 'ridge', name: 'Ridge Yard', x: gx * TS, y: gy * TS, w: pw * TS, h: ph * TS, gx, gy, pw, ph, owned: false, price: HC.YARDS.ridge.price };
    world.yards.push(yard);
    fenceRect(world, gx + 1, gy + 1, gx + pw - 2, gy + ph - 2, [gx + 8, gx + 16], 'ridge');
    world.sheds.push({ ...P(3, 2), w: 12 * TS, h: 4 * TS, yard: 'ridge' });
    for (let i = 0; i < 4; i++) world.bays.push({ ...P(4.5 + i * 2.6, 4.4), a: -Math.PI / 2, yard: 'ridge', kind: 'machine' });
    for (let i = 0; i < 2; i++) world.bays.push({ ...P(17 + i * 3.2, 7), a: Math.PI / 2, yard: 'ridge', kind: 'trailer' });
    world.pumps.push({ ...P(18, 3), yard: 'ridge' });
    for (let y = 9; y < 14; y++) for (let x = 2; x < 9; x++) world.set(gx + x, gy + y, T.DIRT);
    world.storage.push({ ...P(2, 9), w: 7 * TS, h: 5 * TS, yard: 'ridge' });
    yard.spawn = P(12, ph - 2);
    return yard;
  }

  // a home yard for a co-op friend's own company: office, pole shed, bays, pump (nobody can buy these)
  function buildCoopYard(world, r, i) {
    const { gx, gy, pw, ph } = r, P = (x, y) => ({ x: (gx + x) * TS, y: (gy + y) * TS }), id = 'co' + (i + 2), letter = 'BCD'[i];
    for (let y = 1; y < ph; y++) for (let x = 1; x < pw - 1; x++) world.set(gx + x, gy + y, T.GRAVEL);
    const yard = { id, name: `Yard ${letter}`, x: gx * TS, y: gy * TS, w: pw * TS, h: ph * TS, gx, gy, pw, ph, owned: false, coop: true };
    world.yards.push(yard);
    fenceRect(world, gx + 1, gy + 1, gx + pw - 2, gy + ph - 2, [gx + 8, gx + 16], id);
    world.houses.push({ ...P(2, 2.5), w: 5 * TS, h: 4 * TS, wall: ['#5d7f9e', '#8e5a3c', '#6c7c4a'][i], roof: '#3a3f45', damaged: [], label: `Yard ${letter} office`, yard: true, facing: 1, parcel: id });
    world.sheds.push({ ...P(9, 2), w: 12 * TS, h: 4 * TS, yard: id });
    for (let k = 0; k < 4; k++) world.bays.push({ ...P(10.5 + k * 2.6, 4.4), a: -Math.PI / 2, yard: id, kind: 'machine' });
    for (let k = 0; k < 3; k++) world.bays.push({ ...P(4 + k * 3.2, 10.5), a: Math.PI / 2, yard: id, kind: 'trailer' });
    world.pumps.push({ ...P(13, 9), yard: id });
    for (let y = 8; y < 12; y++) for (let x = 17; x < 23; x++) world.set(gx + x, gy + y, T.DIRT);
    world.storage.push({ ...P(17, 8), w: 6 * TS, h: 4 * TS, yard: id });
    yard.spawn = P(14, ph - 3);
    yard.office = P(4.5, 7.6);
    yard.carSpots = [[17, 13.2], [20, 13.2], [23, 13.2], [24.3, 6.5], [10.5, 13.2], [5, 13.2]];
    return yard;
  }

  // the Firewood Yard: a fenced yard with a work area for the processor, a dump pad, a pump, and a roadside firewood stand
  function buildFirewoodYard(world, r) {
    const { gx, gy, pw, ph } = r, P = (x, y) => ({ x: (gx + x) * TS, y: (gy + y) * TS });
    for (let y = 1; y < ph; y++) for (let x = 1; x < pw - 1; x++) world.set(gx + x, gy + y, T.GRAVEL);
    const yard = { id: 'firewood', name: 'Firewood Yard', x: gx * TS, y: gy * TS, w: pw * TS, h: ph * TS, gx, gy, pw, ph, owned: false, price: HC.YARDS.firewood.price };
    world.yards.push(yard);
    fenceRect(world, gx + 1, gy + 1, gx + pw - 2, gy + ph - 2, [gx + 8, gx + 16], 'firewood');
    world.houses.push({ ...P(2, 2.5), w: 5 * TS, h: 4 * TS, wall: '#7a4e2e', roof: '#3e5a3a', damaged: [], label: 'Firewood Yard office', yard: true, facing: 1, parcel: 'firewood' });
    for (let y = 8; y < 12; y++) for (let x = 2; x < 8; x++) world.set(gx + x, gy + y, T.DIRT);
    world.storage.push({ ...P(2, 8), w: 6 * TS, h: 4 * TS, yard: 'firewood' });
    for (let k = 0; k < 3; k++) world.bays.push({ ...P(10.5 + k * 3.2, 6), a: Math.PI / 2, yard: 'firewood', kind: 'trailer' });
    for (let k = 0; k < 2; k++) world.bays.push({ ...P(10.5 + k * 2.6, 3), a: -Math.PI / 2, yard: 'firewood', kind: 'machine' });
    world.pumps.push({ ...P(20.5, 3), yard: 'firewood' });
    // the stand sits by the gate, facing the road: trucks back up to its pad to stock it
    world.fwProcSpot = { ...P(12.5, 10.4), a: 0 }; // the processor's permanent station: conveyor out the west end, log deck on the south side
    world.fwStand = { x: (gx + 18) * TS, y: (gy + 11.2) * TS, pad: { ...P(17, 8.5), w: 7 * TS, h: 5 * TS }, racks: [P(21.5, 6.5), P(23, 6.5), P(21.5, 9), P(23, 9)] };
    yard.spawn = P(14, ph - 3);
    yard.carSpots = [[10.5, 13.2], [13.5, 13.2], [6, 13.2]];
    return yard;
  }

  // ---------- build ----------
  function build() {
    const world = emptyWorld();
    HC.world = world;
    for (let i = 0; i < W * H; i++) world.tiles[i] = T.GRASS;
    return HC.withSeed(20240611, () => {
      // roads and water. A branch is trimmed so it ends exactly on the centre line of the road it joins.
      const roadSamples = ROADS.map((r) => spline(r.pts));
      const nearestOn = (pt, samples) => { let best = null, bd = 1e9; for (const q of samples) { const d = Math.hypot(q[0] - pt[0], q[1] - pt[1]); if (d < bd) { bd = d; best = q; } } return { p: best, d: bd }; };
      roadSamples.forEach((s, i) => {
        for (const end of [0, 1]) {
          const others = roadSamples.filter((_, j) => j !== i).flat();
          const tip = end ? s[s.length - 1] : s[0];
          if (nearestOn(tip, others).d > 5) continue;
          // walk inward from the tip to the closest approach to the other road, cut there, then end on its centre line
          const idx = end ? [...s.keys()].reverse() : [...s.keys()];
          let bestK = idx[0], bestD = 1e9;
          for (const k of idx.slice(0, 60)) { const d = nearestOn(s[k], others).d; if (d < bestD) { bestD = d; bestK = k; } }
          const snap = nearestOn(s[bestK], others).p;
          if (end) { s.length = bestK + 1; s.push([snap[0], snap[1]]); } else { s.splice(0, bestK, [snap[0], snap[1]]); }
        }
      });
      const rd = distField([].concat(...roadSamples), 9);
      const creekS = spline(CREEK);
      const cd = distField(creekS, 6);
      for (let i = 0; i < W * H; i++) {
        const x = i % W, y = Math.floor(i / W);
        const pond = pondD(x + 0.5, y + 0.5);
        if (rd[i] <= 1.22) world.tiles[i] = T.ROAD;
        else if (cd[i] <= 1.05 || pond <= 1) world.tiles[i] = T.WATER;
        if (rd[i] <= 1.22 && cd[i] <= 1.6) world.rails.push({ x, y }); // bridge
      }
      world.roads = ROADS.map((r, i) => ({ name: r.name, pts: roadSamples[i] }));
      // mark centre-line samples that sit inside an intersection (no dashes there)
      const per = roadSamples.map((s) => distField(s, 4));
      world.roads.forEach((r, i) => {
        r.junction = r.pts.map(([x, y]) => {
          const t = Math.floor(y) * W + Math.floor(x);
          return per.some((f, j) => j !== i && f[t] < 2.2);
        });
      });
      world.creek = creekS;
      // gravel roads: two tiles wide, only over open ground
      world.dirtRoads = DIRT_ROADS.map((pts) => spline(pts));
      const dd = distField([].concat(...world.dirtRoads), 3);
      for (let i = 0; i < W * H; i++) if (dd[i] <= 0.68 && world.tiles[i] !== T.ROAD && world.tiles[i] !== T.WATER) world.tiles[i] = T.DIRTROAD;
      world.dirtDist = dd;
      world.roadDist = rd; world.waterDist = cd;

      // yards first, then customer lots
      const taken = [{ ...QUARRY }];
      const main = roadSamples[0];
      const hqR = placeLots(world, ROADS[0], main, rd, taken, 50, 20, 5) || placeLots(world, ROADS[0], main, rd, taken, 50, 20, 60);
      taken.push(hqR);
      // the Ridge Yard tries Fox Run first, then the other roads, so it always exists
      let ridgeR = null;
      for (const [ri, x] of [[3, 150], [3, 105], [2, 60], [2, 100], [5, 60], [5, 120], [0, 130]]) {
        ridgeR = placeLots(world, ROADS[ri], roadSamples[ri], rd, taken, 26, 16, x);
        if (ridgeR) break;
      }
      if (ridgeR) taken.push(ridgeR);
      // the landscape supply that buys mulch, out on the east end
      let supR = null;
      for (const [ri, x] of [[0, 268], [0, 240], [6, 262], [5, 240], [3, 240]]) {
        supR = placeLots(world, ROADS[ri], roadSamples[ri], rd, taken, 26, 16, x);
        if (supR) break;
      }
      if (supR) taken.push(supR);
      // the Firewood Yard, out in timber country on Hemlock Hollow Rd
      let fwR = null;
      for (const x of [40, 110, 180, 250]) { fwR = placeLots(world, ROADS[11], roadSamples[11], rd, taken, 26, 16, x); if (fwR) break; }
      if (fwR) taken.push(fwR);
      // the sawmill, out in timber country on Hemlock Hollow Rd, and the county brush & stump dump on Bottom Rd
      let millR = null, dumpR = null;
      for (const x of [150, 200, 100, 250]) { millR = placeLots(world, ROADS[11], roadSamples[11], rd, taken, 34, 18, x); if (millR) break; }
      if (millR) taken.push(millR);
      for (const [ri, x] of [[7, 120], [7, 170], [7, 60], [5, 200]]) { dumpR = placeLots(world, ROADS[ri], roadSamples[ri], rd, taken, 26, 16, x); if (dumpR) break; }
      if (dumpR) taken.push(dumpR);
      // yards for co-op friends who bring their own company (B, C, D)
      const coopR = [];
      for (const cands of [[[5, 60], [5, 90], [5, 30]], [[7, 60], [7, 30], [7, 120]], [[2, 100], [2, 60], [2, 130]]]) {
        let r = null;
        for (const [ri, x] of cands) { r = placeLots(world, ROADS[ri], roadSamples[ri], rd, taken, 26, 16, x); if (r) break; }
        if (r) { taken.push(r); coopR.push(r); }
      }
      let id = 1;
      for (let i = 0; i < ROADS.length; i++) {
        if (!ROADS[i].lots && !ROADS[i].tracts) continue;
        const tract = !!ROADS[i].tracts;
        for (const r of placeLots(world, ROADS[i], roadSamples[i], rd, taken, 0, PH, undefined, tract ? [28, 36] : [21, 26])) {
          const p = Object.assign(r, { id: id++, x: r.gx * TS, y: r.gy * TS, w: r.pw * TS, h: r.ph * TS, seed: 1000 + r.gx * 37 + r.gy * 101, road: ROADS[i].name, tract });
          p.owner = HC.pick(tract ? HC.LANDOWNERS : HC.CLIENTS);
          p.address = `${HC.randi(100, 9800)} ${ROADS[i].name}`;
          world.parcels.push(p);
        }
      }
      // Hollow Creek Salvage takes over one roadside lot on Bottom Rd (so every other lot keeps its number in old saves)
      let scrapR = null;
      for (let i = world.parcels.length - 1; i >= 0; i--) { const p = world.parcels[i]; if (p.road === 'Bottom Rd' && !p.tract && p.pw >= 23) { scrapR = p; world.parcels.splice(i, 1); break; } }
      const used = new Set();
      for (const p of world.parcels) { let n = 0; while (used.has(p.owner) && n++ < 30) p.owner = HC.pick(p.tract ? HC.LANDOWNERS : HC.CLIENTS); used.add(p.owner); }
      for (const p of world.parcels) {
        const lot = HC.Lot.generate({ type: 'scenery', w: p.pw, h: PH + 2, seed: p.seed, tier: 0, tract: p.tract });
        stamp(world, p, lot, false);
      }
      world.yard = buildHQ(world, hqR);
      buildQuarry(world);
      if (ridgeR) buildRidge(world, ridgeR);
      if (supR) buildSupply(world, supR);
      coopR.forEach((r, i) => buildCoopYard(world, r, i));
      if (fwR) buildFirewoodYard(world, fwR);
      if (millR) buildSawmill(world, millR);
      if (dumpR) buildBrushDump(world, dumpR);
      if (scrapR) buildScrapyard(world, scrapR);
      const driveOut = (r, cols, max = 9) => { for (const c of cols) for (let y = r.gy + r.ph, n = 0; n < max && world.tile(r.gx + c, y) !== T.ROAD; y++, n++) world.set(r.gx + c, y, T.GRAVEL); };
      driveOut(hqR, [13, 14, 15, 16, 17, 18]);
      driveOut(hqR, [22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33]); // a broad apron straight from the road to the equipment gate
      if (ridgeR) driveOut(ridgeR, [8, 9, 10, 11, 12, 13, 14, 15]);
      if (supR) driveOut(supR, [12, 13, 14, 15]);
      for (const r of coopR) driveOut(r, [8, 9, 10, 11, 12, 13, 14, 15]);
      if (fwR) driveOut(fwR, [8, 9, 10, 11, 12, 13, 14, 15]);
      if (millR) driveOut(millR, [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16], 16);
      if (dumpR) driveOut(dumpR, [6, 7, 8, 9, 10, 11, 12, 13, 14, 15], 16);
      // level, open ground from the home yard's equipment gate straight down to the road (no pavement: the gravel apron leads in)
      {
        const gxm = hqR.gx + 28, y0 = hqR.gy + hqR.ph - 1;
        let y1 = y0; while (y1 < H - 1 && world.tile(gxm, y1) !== T.ROAD) y1++;
        if (y1 > y0 && y1 - y0 < 45) {
          const pts = [];
          for (let y = y0 - 0.5; y <= y1 + 0.6; y += 0.25) pts.push([gxm + 0.5, y]);
          for (const [sx, sy] of pts) for (let yy = Math.floor(sy - 3); yy <= sy + 3; yy++) for (let xx = Math.floor(sx - 3); xx <= sx + 3; xx++) {
            if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
            const i = yy * W + xx, d = Math.hypot(xx + 0.5 - sx, yy + 0.5 - sy);
            if (d < rd[i]) rd[i] = d; // counts as near a road for levelling and keeps trees off it, but stays ground
          }
        }
      }
      const inLot = (x, y, m) => taken.some((r) => x >= r.gx - m && x < r.gx + r.pw + m && y >= r.gy - m && y < r.gy + r.ph + m);

      // power lines along the busier roads
      ROADS.forEach((r, i) => {
        if (!r.poles) return;
        const s = roadSamples[i];
        let acc = 0, prev = null;
        for (let k = 1; k < s.length; k++) {
          acc += Math.hypot(s[k][0] - s[k - 1][0], s[k][1] - s[k - 1][1]);
          if (acc < 8) continue;
          acc = 0;
          const dx = s[k][0] - s[k - 1][0], dy = s[k][1] - s[k - 1][1], l = Math.hypot(dx, dy) || 1;
          let nx = -dy / l, ny = dx / l;
          if (ny > 0) { nx = -nx; ny = -ny; } // north side
          const px = s[k][0] + nx * 2.0, py = s[k][1] + ny * 2.0, t = world.tile(Math.floor(px), Math.floor(py));
          if (t !== T.GRASS && t !== T.TALL) { prev = null; continue; }
          if (world.houses.some((h) => HC.inRect(px * TS, py * TS, { x: h.x - 20, y: h.y - 20, w: h.w + 40, h: h.h + 40 }))) { prev = null; continue; }
          const pole = { x: px * TS, y: py * TS, r: 6, parcel: 'grid' };
          world.poles.push(pole);
          if (prev && HC.dist(prev.x, prev.y, pole.x, pole.y) < 12 * TS) world.wires.push({ x1: prev.x, y1: prev.y, x2: pole.x, y2: pole.y, down: false, parcel: 'grid' });
          prev = pole;
        }
      });

      // farm fields: fenced crop fields dropped into open land that's left over
      world.fields = [];
      const fieldOk = (gx, gy, w, h) => {
        if (gx < 3 || gy < 3 || gx + w > W - 3 || gy + h > H - 3) return false;
        if (taken.some((r) => gx < r.gx + r.pw + 3 && gx + w + 3 > r.gx && gy < r.gy + r.ph + 3 && gy + h + 3 > r.gy)) return false;
        for (let y = gy - 1; y <= gy + h; y++) for (let x = gx - 1; x <= gx + w; x++) {
          const i = y * W + x, t = world.tiles[i];
          if ((t !== T.GRASS && t !== T.TALL) || rd[i] < 3 || cd[i] < 3 || world.dirtDist[i] < 2 || pondD(x, y) < 1.6) return false;
        }
        return true;
      };
      for (let tries = 0; tries < 900 && world.fields.length < 6; tries++) {
        const w = HC.randi(18, 30), h = HC.randi(12, 18), gx = HC.randi(4, W - w - 4), gy = HC.randi(4, H - h - 4);
        if (!fieldOk(gx, gy, w, h)) continue;
        const f = { gx, gy, pw: w, ph: h, crop: HC.pick(['corn', 'hay', 'plowed', 'soy']) };
        world.fields.push(f); taken.push(f);
        for (let y = gy; y < gy + h; y++) for (let x = gx; x < gx + w; x++) world.set(x, y, T.FIELD);
        fenceRect(world, gx, gy - 1, gx + w - 1, gy + h, [gx + 2, gx + 6], 'field');
        world.fences.forEach((fc) => { if (fc.parcel === 'field') { fc.parcel = 'field' + world.fields.length; fc.yard = false; } });
      }

      // forest, meadows and boulders, from smooth noise
      const noise = (x, y) => 0.5 + 0.32 * Math.sin(x * 0.11 + 1) * Math.cos(y * 0.09 - 0.5) + 0.22 * Math.sin((x + y) * 0.05 + 2) + 0.12 * Math.sin(x * 0.31) * Math.sin(y * 0.27);
      for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
        const i = y * W + x;
        if (world.tiles[i] !== T.GRASS || inLot(x, y, 1) || rd[i] < 2.4) continue;
        const d = noise(x, y), wet = cd[i] < 3.2;
        if (d < 0.36) { if (Math.random() < 0.6) world.tiles[i] = T.TALL; continue; } // meadow
        if (Math.random() > (d - 0.2) * (wet ? 0.5 : 0.42)) continue;
        if (cd[i] < 1.8) continue;
        const pinePct = 0.5 + 0.45 * Math.sin(y * 0.045 + x * 0.015 - 0.6);
        const type = Math.random() < 0.06 ? 'dead' : wet ? HC.pick(['maple', 'maple', 'oak']) : Math.random() < pinePct ? 'pine' : HC.pick(['oak', 'maple', 'oak']);
        const t = HC.Lot.makeTree(type, (x + HC.rand(0.15, 0.85)) * TS, (y + HC.rand(0.15, 0.85)) * TS, HC.rand(0.8, 1.35));
        t.parcel = -1;
        world.trees.push(t);
      }
      for (let n = 0, tries = 0; n < 60 && tries < 4000; tries++) {
        const x = HC.randi(2, W - 3), y = HC.randi(2, H - 3), i = y * W + x;
        if (world.tiles[i] !== T.GRASS && world.tiles[i] !== T.TALL) continue;
        if (inLot(x, y, 2) || rd[i] < 3 || cd[i] < 2) continue;
        const b = { x: (x + 0.5) * TS, y: (y + 0.5) * TS, r: HC.rand(10, 22), seed: Math.random() * 9 };
        if (world.trees.some((t) => HC.dist(t.x, t.y, b.x, b.y) < t.trunkR + b.r + 4)) continue;
        world.boulders.push(b); n++;
      }
      for (let n = 0; n < 160; n++) { // brush along the creek and woods edges
        const x = HC.randi(2, W - 3), y = HC.randi(2, H - 3), i = y * W + x;
        if (world.tiles[i] === T.WATER || world.tiles[i] === T.ROAD || inLot(x, y, 1) || rd[i] < 2.2) continue;
        if (cd[i] > 4 && Math.random() < 0.7) continue;
        world.bushes.push({ id: HC.uid(), x: (x + 0.5) * TS, y: (y + 0.5) * TS, r: HC.rand(10, 16), hp: 0, seed: Math.random() * 99, parcel: -1 });
      }
      world.trees = world.trees.filter((t) => !world.boulders.some((b) => HC.dist(t.x, t.y, b.x, b.y) < b.r + t.trunkR));

      buildHeights(world, taken, noise);
      return world;
    });
  }

  // Rolling hills, flattened at roads, lots and yards; carved down for the creek and pond
  function buildHeights(world, taken, noise) {
    const hT = new Float32Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      let lotD = 99;
      for (const r of taken) {
        const dx = Math.max(r.gx - x, 0, x - (r.gx + r.pw - 1)), dy = Math.max(r.gy - y, 0, y - (r.gy + r.ph - 1));
        lotD = Math.min(lotD, Math.hypot(dx, dy));
      }
      const flatD = Math.min(world.roadDist[i] - 1.3, lotD);
      const f = HC.clamp((flatD - 1) / 7, 0, 1);
      const hill = 1.6 * (noise(x * 0.7 + 40, y * 0.7 - 10) - 0.35) + 0.5 * Math.sin(x * 0.06) * Math.cos(y * 0.05);
      let h = 0.12 + f * Math.max(-0.1, hill) * 1.4;
      const pond = pondD(x + 0.5, y + 0.5);
      const wd = Math.min(world.waterDist[i] - 0.6, (pond - 1) * 4.5);
      // quarry: flat floor inside a ring of rock berms, open at the entrance
      const q = QUARRY, qx = x - q.gx, qy = y - q.gy;
      if (qx >= 0 && qy >= 0 && qx < q.pw && qy < q.ph) {
        // three benches of rock, each ~2.4 m, stepping down to the pit floor; open ramp at the south
        const edge = Math.min(qx, qy, q.pw - 1 - qx, q.ph - 1 - qy);
        const gate = qy > q.ph - 6 && qx >= 15 && qx <= 23;
        const bench = edge < 1.5 ? 3 : edge < 3 ? 2 : edge < 4.5 ? 1 : 0;
        h = gate ? 0.12 : 0.12 + bench * 0.8;
      }
      if (wd < 2.4 && world.roadDist[i] > 1.7) h = HC.lerp(h, HC.lerp(-0.6, h, HC.clamp(wd / 2.4, 0, 1)), HC.clamp((world.roadDist[i] - 1.7) / 0.35, 0, 1)); // the road stays level all the way across a bridge
      hT[i] = h;
    }
    world.hT = hT;
    world.WATER_Y = WATER_Y;
  }

  // ground height (world units) under a sim point (pixels), bilinear between tile centres
  function heightAt(px, py) {
    const w = HC.world;
    if (!w || !w.hT) return 0;
    const fx = HC.clamp(px / TS - 0.5, 0, W - 1.001), fy = HC.clamp(py / TS - 0.5, 0, H - 1.001);
    const x = Math.floor(fx), y = Math.floor(fy), tx = fx - x, ty = fy - y;
    const a = w.hT[y * W + x], b = w.hT[y * W + x + 1], c = w.hT[(y + 1) * W + x], d = w.hT[(y + 1) * W + x + 1];
    return HC.lerp(HC.lerp(a, b, tx), HC.lerp(c, d, tx), ty);
  }

  function buildQuarry(world) {
    const q = QUARRY, P = (x, y) => ({ x: (q.gx + x) * TS, y: (q.gy + y) * TS });
    for (let y = 0; y < q.ph; y++) for (let x = 0; x < q.pw; x++) {
      const edge = Math.min(x, y, q.pw - 1 - x, q.ph - 1 - y), gate = y > q.ph - 6 && x >= 15 && x <= 23;
      world.set(q.gx + x, q.gy + y, edge < 4.5 && !gate ? T.ROCKFACE : T.QUARRY);
    }
    for (let x = 16; x < 23; x++) for (let y = q.ph; y < q.ph + 8 && world.tile(q.gx + x, q.gy + y) !== T.ROAD; y++) if (world.tile(q.gx + x, q.gy + y) !== T.WATER) world.set(q.gx + x, q.gy + y, T.DIRTROAD);
    world.quarry = { id: 'quarry', name: HC.YARDS.quarry.name, price: HC.YARDS.quarry.price, owned: false, x: q.gx * TS, y: q.gy * TS, w: q.pw * TS, h: q.ph * TS,
      pad: { ...P(14, 13), w: 10 * TS, h: 5 * TS },
      piles: [{ ...P(7, 7), r: 3.2, c: '#9c968a' }, { ...P(11, 9.5), r: 2.4, c: '#b3a58a' }, { ...P(7.5, 13), r: 2.8, c: '#8e8478' },
        { ...P(25, 6.5), r: 2.6, c: '#a89a86' }, { ...P(29.5, 9), r: 3.4, c: '#9b8f80' }, { ...P(21, 7), r: 2.0, c: '#7f7a73' }, { ...P(17, 9), r: 1.6, c: '#b9a98e' }],
      puddles: [P(13, 11.5), P(27, 12.5), P(9.5, 16), P(22.5, 11)],
      plant: { crusher: P(14.5, 7), screener: P(20, 10.5), conveyor: P(26, 15), loader: P(10, 17), adt: P(31, 17) } };
    world.houses.push({ ...P(27, 15.5), w: 4 * TS, h: 3 * TS, wall: '#d9d2c3', roof: '#4b5560', damaged: [], label: 'Scale house', yard: true, facing: 1, parcel: 'quarry' });
    for (let i = 0; i < 14; i++) {
      const x = HC.rand(5.5, q.pw - 6), y = HC.rand(5, 8);
      world.boulders.push({ x: (q.gx + x) * TS, y: (q.gy + y) * TS, r: HC.rand(10, 20), seed: Math.random() * 9 });
    }
  }

  // Hemlock Hollow Sawmill: the mill shed, a scale house, lumber stacks, and a big log yard by the road where trucks unload
  function buildSawmill(world, r) {
    const { gx, gy, pw, ph } = r, P = (x, y) => ({ x: (gx + x) * TS, y: (gy + y) * TS });
    for (let y = 1; y < ph; y++) for (let x = 1; x < pw - 1; x++) world.set(gx + x, gy + y, T.GRAVEL);
    for (let y = 10; y < 17; y++) for (let x = 3; x < 20; x++) world.set(gx + x, gy + y, T.DIRT);
    const pad = { ...P(3, 10), w: 17 * TS, h: 7 * TS, type: 'mill', name: 'Sawmill log yard' };
    world.pads.push(pad); world.pad = pad; // the log decks render at the back of it
    world.houses.push({ ...P(3, 2), w: 15 * TS, h: 6 * TS, wall: '#8b5a3c', roof: '#6b6f75', damaged: [], label: 'Hemlock Hollow Sawmill', yard: true, shed: true, facing: 1, parcel: 'sawmill' });
    world.houses.push({ ...P(26, 12), w: 4 * TS, h: 3 * TS, wall: '#d9d2c3', roof: '#4b5560', damaged: [], label: 'Scale house', yard: true, facing: 1, parcel: 'sawmill' });
    world.sawmill = { id: 'sawmill', name: 'Hemlock Hollow Sawmill', x: gx * TS, y: gy * TS, w: pw * TS, h: ph * TS, pad, lumber: [P(22, 3.5), P(26, 3.5), P(30, 3.5), P(22, 7.5), P(26, 7.5)],
      sawdust: P(19.2, 2.6), deck: P(5, 9), loader: P(15.5, 9.3), kiln: P(29.5, 8) };
  }
  // County Brush & Stump Dump: a scale house, a tipping area, and the mounds they push it all into
  function buildBrushDump(world, r) {
    const { gx, gy, pw, ph } = r, P = (x, y) => ({ x: (gx + x) * TS, y: (gy + y) * TS });
    for (let y = 1; y < ph; y++) for (let x = 1; x < pw - 1; x++) world.set(gx + x, gy + y, T.DIRT);
    const pad = { ...P(3, 8), w: 15 * TS, h: 6 * TS, type: 'dump', name: 'County brush & stump dump' };
    world.pads.push(pad);
    world.houses.push({ ...P(20, 9), w: 4 * TS, h: 3 * TS, wall: '#c9c2a8', roof: '#4b5560', damaged: [], label: 'County dump scale', yard: true, facing: 1, parcel: 'dump' });
    world.dumpSite = { id: 'dump', name: 'County Brush & Stump Dump', x: gx * TS, y: gy * TS, w: pw * TS, h: ph * TS, pad,
      mounds: [{ ...P(5, 3.5), r: 2.6, c: '#56622f' }, { ...P(10.5, 3.2), r: 3.0, c: '#4d5a2b' }, { ...P(16, 3.6), r: 2.4, c: '#6b4b30' }, { ...P(21, 3.4), r: 2.2, c: '#5f6a36' }] };
  }

  // Hollow Creek Salvage: crushed cars stacked three high, a wrecked-machine row, a scale and a crane with a magnet
  function buildScrapyard(world, r) {
    const { gx, gy, pw, ph, flip } = r, Y = (y, h = 0) => (flip ? ph - y - h : y), P = (x, y, h) => ({ x: (gx + x) * TS, y: (gy + Y(y, h)) * TS });
    for (let y = 0; y < ph; y++) for (let x = 1; x < pw - 1; x++) world.set(gx + x, gy + y, T.GRAVEL);
    for (let y = 8; y < 13; y++) for (let x = 3; x < 14; x++) world.set(gx + x, gy + Y(y, 1), T.DIRT);
    world.houses.push({ ...P(pw - 7, 2, 3.5), w: 5 * TS, h: 3.5 * TS, wall: '#7a7d80', roof: '#3d4248', damaged: [], label: 'Hollow Creek Salvage', yard: true, facing: flip ? -1 : 1, parcel: 'scrap' });
    const stacks = []; for (let i = 0; i < 5; i++) stacks.push({ ...P(3 + i * 2.6, 3), n: 2 + (i % 3), seed: i });
    for (let c = Math.floor(pw / 2) - 2; c < Math.floor(pw / 2) + 3; c++) { let y = flip ? gy - 1 : gy + ph; for (let n = 0; n < 9 && world.tile(c + gx, y) !== T.ROAD && world.tile(c + gx, y) !== -1; n++, y += flip ? -1 : 1) world.set(c + gx, y, T.GRAVEL); }
    world.scrapyard = { id: 'scrap', name: 'Hollow Creek Salvage', x: gx * TS, y: gy * TS, w: pw * TS, h: ph * TS, pad: { ...P(3, 8, 5), w: 11 * TS, h: 5 * TS }, stacks, crane: P(pw - 6, 9), wrecks: [P(pw - 8, 12.5), P(pw - 4.5, 12.5)] };
  }

  // Hollow Creek Landscape Supply: concrete-block bins of dyed mulch, a red barn, a sales pad
  function buildSupply(world, r) {
    const { gx, gy, pw, ph } = r, P = (x, y) => ({ x: (gx + x) * TS, y: (gy + y) * TS });
    for (let y = 1; y < ph; y++) for (let x = 1; x < pw - 1; x++) world.set(gx + x, gy + y, T.GRAVEL);
    world.supply = { id: 'supply', name: 'Hollow Creek Landscape Supply', x: gx * TS, y: gy * TS, w: pw * TS, h: ph * TS,
      pad: { ...P(9, 9), w: 9 * TS, h: 5 * TS },
      bins: [P(4, 3.2), P(9, 3.2), P(14, 3.2)], piles: [{ ...P(4, 4), c: '#2e2119' }, { ...P(9, 4), c: '#3d2a1c' }, { ...P(14, 4), c: '#1f1a17' }, { ...P(3.5, 10), c: '#3a2a1f' }],
      loader: P(19, 10), dumpTruck: P(21.5, 5), pickup: { ...P(19.8, 11.6), w: 4.6 * TS, h: 3.2 * TS } };
    world.houses.push({ ...P(19.5, 2.5), w: 6 * TS, h: 4 * TS, wall: '#a8321f', roof: '#5a5f66', trim: '#f4f1e8', damaged: [], label: 'Landscape Supply', yard: true, facing: 1, parcel: 'supply' });
  }
  function parcelAt(world, x, y) { return world.parcels.find((p) => x >= p.x && x < p.x + p.w && y >= p.y && y < p.y + p.h); }
  function yardAt(x, y, ownedOnly = true) {
    return HC.world.yards.find((yd) => (!ownedOnly || yd.owned) && HC.inRect(x, y, yd));
  }

  HC.World = { build, stamp, upgradeHQ, parcelAt, yardAt, heightAt, W, H, PH, LISTS, WATER_Y };
})();
