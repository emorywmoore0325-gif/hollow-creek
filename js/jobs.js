// Hollow Creek — job types beyond tree removal: lots, estimates, objectives, customer calls
'use strict';
(() => {
  const TS = HC.TILE, T = HC.T, L = HC.Lot, G = HC.Game;

  // ---------- estimates (what the customer offers) ----------
  Object.assign(G.ESTIMATE, {
    timber_harvest(tier) {
      const count = HC.randi(8, 12) + tier * 5;
      return { count, pay: count * 150 + 150, par: count * 40 + 70, summary: `${count} marked trees, logs to the landing` };
    },
    woodland_clear(tier) {
      const saplings = HC.randi(14, 20) + tier * 8, bushes = HC.randi(10, 16) + tier * 5, stumps = HC.randi(4, 7) + tier * 2;
      return { saplings, bushes, stumps, pay: 600 + saplings * 22 + bushes * 18 + stumps * 45, par: 60 + (saplings + bushes) * 2.5 + stumps * 6,
        summary: `${saplings} saplings, ${bushes} brush thickets and ${stumps} stumps` };
    },
    storm_cleanup(tier) {
      const count = HC.randi(3, 5) + tier * 2;
      return { count, pay: count * 170 + 80, par: count * 35 + 40, summary: `${count} trees down in the yard` };
    },
    brush_chipping(tier) {
      const count = HC.randi(14, 22) + tier * 8;
      return { count, pay: count * 24 + 120, par: count * 3 + 40, summary: `${count} loads of brush to chip` };
    },
    lot_clearing(tier) {
      const count = HC.randi(6, 9) + tier * 4, bushes = HC.randi(5, 9) + tier * 2, rocks = HC.randi(2, 4) + tier;
      return { count, bushes, rocks, pay: count * 175 + bushes * 15 + rocks * 40, par: count * 40 + rocks * 8 + 60, summary: `About ${count} trees, brush and ${rocks} rocks inside the tape` };
    },
    stump_grinding(tier) {
      const count = HC.randi(5, 9) + tier * 4;
      return { count, pay: count * 85, par: count * 9 + 25, summary: `${count} stumps` };
    },
    mulching(tier) {
      const bushes = HC.randi(14, 20) + tier * 8, saplings = HC.randi(6, 10) + tier * 4;
      return { bushes, saplings, pay: bushes * 28 + saplings * 30, par: (bushes + saplings) * 3.5 + 30, summary: `${bushes} brush thickets and ${saplings} scrub saplings` };
    },
    sod_planting(tier) {
      const sodW = HC.randi(4, 6) + tier * 2, sodH = HC.randi(3, 4) + tier, beds = HC.randi(5, 8) + tier * 2, shrubs = HC.randi(3, 5) + tier;
      const mat = Math.ceil(sodW * sodH / 12) * 140 + beds * (HC.MULCH_BUY || 62) + Math.ceil(shrubs / 6) * 160;
      return { sodW, sodH, beds, shrubs, pay: Math.round(sodW * sodH * 14 + beds * 10 + shrubs * 40 + 220 + mat * 1.2), par: sodW * sodH * 1.5 + beds + shrubs * 3 + 70,
        summary: `${sodW * sodH} sq of sod, ${shrubs} shrubs, ${beds} bed tiles and a mow` };
    },
    bush_hog(tier) {
      const bushes = HC.randi(8, 14) + tier * 5, saplings = HC.randi(8, 14) + tier * 5;
      return { bushes, saplings, pay: 420 + tier * 260 + bushes * 14 + saplings * 16, par: 45 + (bushes + saplings) * 1.6 + tier * 30, summary: `Overgrown field: tall grass, ${bushes} briar patches and ${saplings} saplings` };
    },
    hardscape(tier) {
      const pw = HC.randi(4, 6) + tier * 2, ph = HC.randi(3, 5) + tier, rocks = HC.randi(3, 5) + tier;
      return { pw, ph, rocks, pay: Math.round(pw * ph * 30 + rocks * 35 + Math.ceil(pw * ph / 10) * 190 * 1.2), par: pw * ph * 1.6 + rocks * 8 + 30, summary: `${pw}×${ph} paver patio, ${rocks} rocks to pull` };
    },
  });

  // ---------- lot helpers ----------
  // grass the mower can't get to doesn't count: knock it back to plain grass next to houses and porches, under trunks and on fence lines
  function clearUnmowable(lot) {
    const keep = (x, y) => {
      const cx = x * TS + 16, cy = y * TS + 16;
      for (const h of lot.houses || []) if (HC.inRect(cx, cy, { x: h.x - TS * 1.4, y: h.y - TS * 1.2, w: h.w + TS * 2.8, h: h.h + TS * 3.2 })) return false;
      for (const t of lot.trees || []) if (t.state !== 'gone' && HC.dist(cx, cy, t.x, t.y) < (t.trunkR || 8) + 22) return false;
      for (const f of lot.fences || []) if (HC.segRectHit(f.x, f.y, f.x + (f.w || 0), f.y + (f.h || 0), 2, { x: cx - 18, y: cy - 18, w: 36, h: 36 })) return false;
      return true;
    };
    for (let y = 0; y < lot.h; y++) for (let x = 0; x < lot.w; x++) if (lot.tiles[y * lot.w + x] === T.TALL && !keep(x, y)) lot.set(x, y, T.GRASS);
  }

  function sideZone(lot) {
    const h = lot.house, hc = h.x + h.w / 2;
    const y0 = TS * 2.5, y1 = lot.roadY - TS * 3;
    if (hc < lot.pw / 2) {
      const x0 = h.x + h.w + TS * 2;
      return { x: x0, y: y0, w: lot.pw - TS * 2 - x0, h: y1 - y0 };
    }
    const x1 = h.x - TS * 2;
    return { x: TS * 2, y: y0, w: x1 - TS * 2, h: y1 - y0 };
  }
  const tilesOf = (z) => ({ x0: Math.floor(z.x / TS), y0: Math.floor(z.y / TS), x1: Math.floor((z.x + z.w) / TS), y1: Math.floor((z.y + z.h) / TS) });
  function clearArea(lot, z) { // no fences across a work zone
    lot.fences = lot.fences.filter((f) => !HC.circleRectHit(f.x + f.w / 2, f.y + f.h / 2, 4, z) || !f.v);
  }

  Object.assign(L.GEN, {
    timber_harvest(lot, job) {
      L.scatterTrees(lot, Math.round(lot.w * lot.h / 11), ['pine', 'pine', 'oak', 'maple', 'oak'], 10);
      for (const t of lot.trees) t.s = Math.max(t.s, 0.95);
      // the forester paints the biggest, best trees away from the road
      const pool = lot.trees.filter((t) => t.y < lot.landing.y - TS).sort(() => Math.random() - 0.5);
      for (const t of pool.slice(0, job.count)) { t.marked = true; t.s = HC.rand(1.05, 1.3); t.len = HC.TREES[t.type].height * TS * t.s; t.crownR = HC.TREES[t.type].crown * TS * t.s; }
      L.scatterBushes(lot, HC.randi(8, 14));
      lot.zone = Object.assign({}, lot.landing); // logs get decked on the landing
    },
    woodland_clear(lot, job) {
      const z = (lot.zone = { x: TS * 2, y: TS * 2.5, w: lot.pw - TS * 4, h: lot.landing.y - TS * 3.5 });
      const tz = tilesOf(z);
      for (let y = tz.y0; y < tz.y1; y++) for (let x = tz.x0; x < tz.x1; x++) if (HC.chance(0.6)) lot.set(x, y, T.TALL);
      L.scatterTrees(lot, Math.max(2, Math.round(z.w * z.h / (TS * TS * 90))), ['oak', 'oak'], 30, z); // a few big keepers
      for (let i = 0, tries = 0; i < job.saplings && tries < 3000; tries++) {
        const x = HC.rand(z.x + 8, z.x + z.w - 8), y = HC.rand(z.y + 8, z.y + z.h - 8);
        if (lot.trees.some((t) => HC.dist(x, y, t.x, t.y) < t.trunkR + 22)) continue;
        const t = L.makeTree(HC.chance(0.2) ? 'dead' : 'sapling', x, y, HC.rand(0.5, 0.9));
        t.marked = true; lot.trees.push(t); i++;
      }
      L.scatterBushes(lot, job.bushes, z);
      for (let i = 0, tries = 0; i < job.stumps && tries < 2000; tries++) {
        const x = HC.rand(z.x + 10, z.x + z.w - 10), y = HC.rand(z.y + 10, z.y + z.h - 10);
        if (lot.trees.some((t) => HC.dist(x, y, t.x, t.y) < 40) || lot.stumps.some((s2) => HC.dist(x, y, s2.x, s2.y) < 40)) continue;
        const type = HC.pick(['oak', 'pine']), sc = HC.rand(0.7, 1.1);
        lot.stumps.push({ id: HC.uid(), x, y, r: HC.TREES[type].trunk * sc + 4, hp: 0, grind: HC.TREES[type].grind * sc, type, target: true }); i++;
      }
    },
    storm_cleanup(lot, job) {
      L.GEN.tree_removal(lot, job); // same kind of yard; the flagged trees are already on the ground
      const down = lot.trees.filter((t) => t.marked);
      for (const t of down) {
        const hc = { x: lot.house.x + lot.house.w / 2, y: lot.house.y + lot.house.h / 2 };
        let a = Math.atan2(t.y - hc.y, t.x - hc.x) + HC.rand(-0.9, 0.9); // mostly blown away from the house
        Object.assign(t, { state: 'felled', fallA: a, fallT: 1, landT: 1, cut: 1, storm: true });
      }
      const extra = lot.items.length;
      for (let i = 0; i < Math.round(job.count * 1.5); i++) { // limbs and twigs everywhere
        const t = HC.pick(down); if (!t) break;
        const d = HC.rand(20, t.len), a = t.fallA + HC.rand(-0.5, 0.5);
        const x = t.x + Math.cos(a) * d, y = t.y + Math.sin(a) * d;
        if (x < TS || y < TS * 2 || x > lot.pw - TS || y > lot.roadY - TS) continue;
        lot.items.push({ id: HC.uid(), kind: 'brush', x, y, a: HC.rand(0, 6), size: HC.rand(0.6, 0.9), value: 0, seed: Math.random() * 99 });
      }
      job.limbs = lot.items.length - extra;
    },
    brush_chipping(lot, job) {
      L.scatterTrees(lot, Math.round(lot.w * lot.h / 40), ['oak', 'maple', 'pine']);
      const z = (lot.zone = sideZone(lot));
      clearArea(lot, z);
      lot.trees = lot.trees.filter((t) => !HC.circleRectHit(t.x, t.y, t.trunkR + 20, z));
      // a few heaps along the side yard
      const heaps = Math.max(2, Math.round(job.count / 6));
      for (let h = 0; h < heaps; h++) {
        const cx = HC.rand(z.x + 30, z.x + z.w - 30), cy = HC.rand(z.y + 30, z.y + z.h - 30);
        const n = Math.round(job.count / heaps);
        for (let i = 0; i < n; i++) lot.items.push({ id: HC.uid(), kind: 'brush', x: cx + HC.rand(-22, 22), y: cy + HC.rand(-14, 14), a: HC.rand(0, 6), size: HC.rand(0.7, 1.1), value: 0, seed: Math.random() * 99 });
      }
    },
    lot_clearing(lot, job) {
      const z = (lot.zone = sideZone(lot));
      L.scatterTrees(lot, job.count, ['oak', 'pine', 'maple', 'pine', 'dead'], 22, z);
      for (const t of lot.trees) t.marked = true;
      L.scatterTrees(lot, 6, ['oak', 'maple', 'pine']); // keepers outside
      for (const t of lot.trees) if (!HC.inRect(t.x, t.y, z)) t.marked = false;
      L.scatterBushes(lot, job.bushes, z);
      L.scatterRocks(lot, job.rocks, z);
    },
    stump_grinding(lot, job) {
      L.scatterTrees(lot, Math.round(lot.w * lot.h / 40), ['oak', 'maple', 'pine']);
      let n = 0, tries = 0;
      while (n < job.count && tries++ < 2000) {
        const x = HC.rand(TS * 2, lot.pw - TS * 2), y = HC.rand(TS * 2.5, lot.roadY - TS * 2);
        if (lot.houses.some((h) => HC.circleRectHit(x, y, 30, h))) continue;
        if (lot.trees.some((t) => HC.dist(x, y, t.x, t.y) < 40) || lot.stumps.some((s) => HC.dist(x, y, s.x, s.y) < 50)) continue;
        if (HC.dist(x, y, lot.spawn.x, lot.spawn.y) < 80) continue;
        if (x > lot.drive.x - 20 && x < lot.drive.x + lot.drive.w + 20 && y > lot.drive.y0) continue;
        const type = HC.pick(['oak', 'maple', 'pine']), s = HC.rand(0.7, 1.2);
        lot.stumps.push({ id: HC.uid(), x, y, r: HC.TREES[type].trunk * s + 4, hp: 0, grind: HC.TREES[type].grind * s, type, target: true });
        n++;
      }
      L.scatterBushes(lot, 4);
    },
    mulching(lot, job) {
      const z = (lot.zone = sideZone(lot));
      clearArea(lot, z);
      L.scatterTrees(lot, Math.max(2, Math.round(z.w * z.h / (TS * TS * 40))), ['oak', 'oak', 'pine'], 30, z); // keepers
      for (let i = 0, tries = 0; i < job.saplings && tries < 2000; tries++) {
        const x = HC.rand(z.x, z.x + z.w), y = HC.rand(z.y, z.y + z.h);
        if (lot.trees.some((t) => HC.dist(x, y, t.x, t.y) < t.trunkR + 26)) continue;
        const t = L.makeTree('sapling', x, y, HC.rand(0.8, 1.15));
        t.marked = true; lot.trees.push(t); i++;
      }
      L.scatterBushes(lot, job.bushes, z);
      const tz = tilesOf(z);
      for (let y = tz.y0; y < tz.y1; y++) for (let x = tz.x0; x < tz.x1; x++) if (HC.chance(0.7)) lot.set(x, y, T.TALL);
      L.scatterTrees(lot, 4, ['oak', 'maple']);
      clearUnmowable(lot);
    },
    bush_hog(lot, job) {
      const z = (lot.zone = sideZone(lot));
      clearArea(lot, z);
      const tz = tilesOf(z);
      for (let y = tz.y0; y < tz.y1; y++) for (let x = tz.x0; x < tz.x1; x++) lot.set(x, y, T.TALL);
      L.scatterTrees(lot, Math.max(1, Math.round(z.w * z.h / (TS * TS * 70))), ['oak', 'maple'], 34, z); // a few big trees to cut around
      for (let i = 0, tries = 0; i < job.saplings && tries < 2000; tries++) {
        const x = HC.rand(z.x + 10, z.x + z.w - 10), y = HC.rand(z.y + 10, z.y + z.h - 10);
        if (lot.trees.some((t) => HC.dist(x, y, t.x, t.y) < t.trunkR + 24)) continue;
        const t = L.makeTree('sapling', x, y, HC.rand(0.6, 0.95));
        t.marked = true; lot.trees.push(t); i++;
      }
      L.scatterBushes(lot, job.bushes, z);
      L.scatterTrees(lot, 3, ['oak', 'maple']);
      clearUnmowable(lot);
    },
    sod_planting(lot, job) {
      const h = lot.house, dtx = Math.floor(lot.drive.x / TS);
      const hy1 = Math.floor((h.y + h.h) / TS) + 1; // first row under the house/porch
      // the front lawn (house to road) has grown up
      for (let y = hy1; y < lot.h - 3; y++) for (let x = 2; x < lot.w - 2; x++) {
        const t = lot.tiles[y * lot.w + x];
        if (t === T.GRASS && HC.chance(0.75)) lot.set(x, y, T.TALL);
      }
      // sod patch on the side of the drive with more room
      const left = dtx > lot.w / 2;
      const sx = left ? Math.max(2, dtx - 1 - job.sodW) : dtx + 3;
      const sy = Math.min(lot.h - 4 - job.sodH, hy1 + 2);
      for (let y = sy; y < sy + job.sodH; y++) for (let x = sx; x < Math.min(lot.w - 2, sx + job.sodW); x++) {
        lot.set(x, y, T.DIRT); lot.targets.push({ tx: x, ty: y, kind: 'sod', done: false });
      }
      // planting beds along the house front
      const bx0 = Math.floor(h.x / TS), bx1 = Math.floor((h.x + h.w) / TS);
      const bedTiles = [];
      for (let x = bx0; x < bx1; x++) if (x !== dtx && x !== dtx + 1) bedTiles.push(x);
      bedTiles.slice(0, job.beds).forEach((x) => { lot.set(x, hy1 - 1, T.DIRT); lot.targets.push({ tx: x, ty: hy1 - 1, kind: 'bed', done: false }); });
      for (let i = 0; i < job.shrubs; i++) {
        const x = HC.randi(2, lot.w - 3), y = HC.randi(hy1, lot.h - 5);
        if (lot.targets.some((t) => t.tx === x && t.ty === y) || (x >= dtx && x <= dtx + 1)) { i--; continue; }
        lot.targets.push({ tx: x, ty: y, kind: 'shrub', done: false });
        if (lot.targets.length > 400) break;
      }
      lot.zone = null;
      L.scatterTrees(lot, 5, ['oak', 'maple']);
      lot.trees = lot.trees.filter((t) => !lot.targets.some((g) => HC.dist(t.x, t.y, g.tx * TS + 16, g.ty * TS + 16) < t.trunkR + 30));
      L.scatterRocks(lot, 2);
      clearUnmowable(lot);
    },
    hardscape(lot, job) {
      const h = lot.house;
      const right = h.x + h.w / 2 < lot.pw / 2;
      const px = right ? Math.floor((h.x + h.w) / TS) + 1 : Math.floor(h.x / TS) - job.pw - 1;
      const py = Math.floor(h.y / TS);
      const z = { x: px * TS, y: py * TS, w: job.pw * TS, h: job.ph * TS };
      lot.zone = z;
      for (let y = py; y < py + job.ph; y++) for (let x = px; x < px + job.pw; x++) {
        if (x < 1 || x >= lot.w - 1 || y >= lot.h - 3) continue;
        lot.set(x, y, T.DIRT); lot.targets.push({ tx: x, ty: y, kind: 'paver', done: false });
      }
      lot.fences = lot.fences.filter((f) => !HC.segRectHit(f.x, f.y, f.x + f.w, f.y + f.h, 2, z));
      L.scatterTrees(lot, Math.round(lot.w * lot.h / 45), ['oak', 'maple', 'pine']);
      lot.trees = lot.trees.filter((t) => !HC.circleRectHit(t.x, t.y, t.trunkR + 34, z));
      for (let i = 0; i < job.rocks; i++) {
        const g = HC.pick(lot.targets);
        lot.items.push({ id: HC.uid(), kind: 'rock', x: g.tx * TS + 16 + HC.rand(-6, 6), y: g.ty * TS + 16 + HC.rand(-6, 6), a: HC.rand(0, 6), size: HC.rand(0.9, 1.25), value: 0 });
      }
    },
  });

  // ---------- objectives ----------
  const inZ = (S, o) => S.lot.zone && HC.inRect(o.x, o.y, S.lot.zone);
  const stumpBonus = (S, list) => {
    if (!HC.company.owned.grinder) return list;
    const st = S.lot.stumps.filter((s) => s.fromMarked && s.parcel === S.job.parcel);
    const done = S.ground || 0;
    if (st.length + done) list.push({ label: 'Grind the stumps', n: done, of: st.length + done, optional: true, bonus: 45 });
    return list;
  };
  const tileCount = (S, kind) => {
    const p = HC.world.parcels.find((q) => q.id === S.job.parcel), W = S.lot;
    let n = 0;
    for (let y = p.gy + 1; y < p.gy + p.ph - 3; y++) for (let x = p.gx + 1; x < p.gx + p.pw - 1; x++) if (W.tiles[y * W.w + x] === kind) n++;
    return n;
  };
  const targets = (S, kind) => { const a = S.lot.targets.filter((t) => t.kind === kind); return { of: a.length, n: a.filter((t) => t.done).length }; };

  const baseTR = G.OBJECTIVES.tree_removal;
  const pieces = (S, test, kinds) => S.lot.items.reduce((a, i) => a + (!test(i) ? 0 : i.kind === 'pile' ? i.content.filter((c) => kinds.includes(c.kind)).length : kinds.includes(i.kind) ? 1 : 0), 0);
  Object.assign(G.OBJECTIVES, {
    timber_harvest(S) {
      const pid = S.job.parcel, marked = S.lot.trees.filter((t) => t.marked && t.parcel === pid);
      const down = marked.filter((t) => t.state !== 'standing' && t.state !== 'falling').length, bucked = marked.filter((t) => t.state === 'gone').length;
      const logsOut = pieces(S, (i) => i.parcel === pid && !inZ(S, i), ['log']) + marked.filter((t) => t.state === 'felled').length;
      return [
        { label: 'Fell the marked timber', n: down, of: marked.length },
        { label: 'Buck it into logs', n: bucked, of: marked.length },
        { label: 'Skid logs to the landing', n: logsOut || bucked < marked.length ? 0 : 1, of: 1, left: logsOut },
      ];
    },
    woodland_clear(S) {
      const pid = S.job.parcel;
      const sap = S.lot.trees.filter((t) => t.marked && t.parcel === pid && t.state === 'standing').length;
      const br = S.lot.bushes.filter((b) => inZ(S, b)).length;
      const st = S.lot.stumps.filter((s) => s.target && s.parcel === pid).length;
      const loose = S.lot.items.filter((i) => inZ(S, i) && i.kind !== 'pile' && i.kind !== 'rock').length + S.lot.trees.filter((t) => t.marked && t.parcel === pid && t.state === 'felled').length;
      S.init = S.init || { sap, br, st };
      return [
        { label: 'Push over the saplings', n: S.init.sap - sap, of: S.init.sap },
        { label: 'Grub out the brush', n: Math.max(0, S.init.br - br), of: S.init.br, left: br },
        { label: 'Pull the stumps', n: S.init.st - st, of: S.init.st },
        { label: 'Pile the debris', n: loose ? 0 : 1, of: 1, left: loose },
      ];
    },
    storm_cleanup(S) {
      const list = baseTR(S);
      list.shift(); // nothing to fell: the storm did that
      return list;
    },
    brush_chipping(S) {
      const left = pieces(S, (i) => i.parcel === S.job.parcel, ['brush']);
      S.init = S.init || { left };
      return [{ label: 'Chip the brush', n: Math.max(0, S.init.left - left), of: S.init.left, left }];
    },
    tree_removal: (S) => stumpBonus(S, baseTR(S)),
    lot_clearing(S) {
      const list = baseTR(S);
      list[0].label = 'Fell every tree in the zone';
      const rocks = S.lot.items.reduce((a, i) => a + (!inZ(S, i) ? 0 : i.kind === 'rock' ? 1 : i.kind === 'pile' ? i.content.filter((c) => c.kind === 'rock').length : 0), 0);
      list.push({ label: 'Haul out rocks', n: rocks ? 0 : 1, of: 1, left: rocks });
      const bushes = S.lot.bushes.filter((b) => inZ(S, b)).length;
      list.splice(2, 0, { label: 'Cut the brush', n: bushes ? 0 : 1, of: 1, left: bushes });
      return stumpBonus(S, list);
    },
    stump_grinding(S) {
      const left = S.lot.stumps.filter((s) => s.target && s.parcel === S.job.parcel).length;
      S.init = S.init || { stumps: left };
      return [{ label: 'Grind stumps', n: S.init.stumps - left, of: S.init.stumps }];
    },
    mulching(S) {
      const sap = S.lot.trees.filter((t) => t.marked && t.parcel === S.job.parcel && t.state !== 'gone').length;
      const br = S.lot.bushes.filter((b) => inZ(S, b)).length + S.lot.items.reduce((a, i) => a + (!inZ(S, i) ? 0 : i.kind === 'brush' ? 1 : i.kind === 'pile' ? i.content.filter((c) => c.kind === 'brush').length : 0), 0);
      S.init = S.init || { sap, br };
      return [
        { label: 'Mulch brush thickets', n: Math.max(0, S.init.br - br), of: S.init.br, left: br },
        { label: 'Mulch scrub saplings', n: S.init.sap - sap, of: S.init.sap },
      ];
    },
    sod_planting(S) {
      const tall = tileCount(S, T.TALL);
      S.init = S.init || { tall };
      return [
        { label: 'Mow the lawn', n: tall <= S.init.tall * 0.04 ? 1 : 0, of: 1, left: Math.max(0, tall - Math.floor(S.init.tall * 0.04)) },
        Object.assign({ label: 'Lay sod' }, targets(S, 'sod')),
        Object.assign({ label: 'Mulch the beds' }, targets(S, 'bed')),
        Object.assign({ label: 'Plant shrubs' }, targets(S, 'shrub')),
      ];
    },
    bush_hog(S) {
      const z = S.lot.zone, W = S.lot;
      let tall = 0;
      if (z) for (let y = Math.floor(z.y / TS); y < Math.floor((z.y + z.h) / TS); y++) for (let x = Math.floor(z.x / TS); x < Math.floor((z.x + z.w) / TS); x++) if (W.tiles[y * W.w + x] === T.TALL) tall++;
      const sap = S.lot.trees.filter((t) => t.marked && t.parcel === S.job.parcel && t.state !== 'gone').length;
      const br = S.lot.bushes.filter((b) => inZ(S, b)).length;
      S.init = S.init || { tall, sap, br };
      const left = Math.max(0, tall - Math.floor(S.init.tall * 0.05));
      return [
        { label: 'Cut the tall grass', n: left ? 0 : 1, of: 1, left },
        { label: 'Cut the briars', n: Math.max(0, S.init.br - br), of: S.init.br, left: br },
        { label: 'Cut the saplings', n: S.init.sap - sap, of: S.init.sap },
      ];
    },
    hardscape(S) {
      const rocks = S.lot.items.reduce((a, i) => a + (!inZ(S, i) ? 0 : i.kind === 'rock' ? 1 : i.kind === 'pile' ? i.content.filter((c) => c.kind === 'rock').length : 0), 0);
      return [
        { label: 'Pull rocks from the patio', n: rocks ? 0 : 1, of: 1, left: rocks },
        Object.assign({ label: 'Lay pavers' }, targets(S, 'paver')),
      ];
    },
  });

  // ---------- customer calls ----------
  const baseMake = G.makeJob;
  G.makeJob = function (type, tier) {
    const j = baseMake(type, tier);
    const lines = HC.REQUESTS[type] || ['Need some work done.'];
    j.request = HC.pick(lines).replace('{n}', j.count || j.bushes || '');
    j.marks = true;
    return j;
  };

  G.makeBoard = function () {
    const C = HC.company, tier = HC.Co.tier();
    const types = Object.keys(HC.JOBS);
    const doable = types.filter((t) => HC.JOBS[t].needs.every((k) => HC.ownsKind(k)));
    const jobs = [];
    for (let i = 0; i < 11; i++) {
      const t = i < 6 && doable.length ? HC.pick(doable) : HC.pick(types);
      jobs.push(G.makeJob(t, Math.max(0, tier - (HC.chance(0.3) ? 1 : 0))));
    }
    if (tier + 1 < HC.TIERS.length) {
      const j = G.makeJob(HC.pick(doable.length ? doable : types), tier + 1);
      j.locked = true;
      jobs.push(j);
    }
    return jobs;
  };

  // Counter-offer: ask for more money. Better ratings get more yeses.
  G.counter = function (job) {
    if (job.countered) return null;
    job.countered = true;
    const r = HC.Co.rating();
    const p = HC.clamp(0.3 + (r - 3) * 0.28, 0.12, 0.85);
    if (Math.random() < p) {
      job.pay = Math.round((job.pay * 1.2) / 10) * 10;
      job.raised = true;
      return true;
    }
    job.lost = true;
    return false;
  };
  G.counterOdds = () => Math.round(HC.clamp(0.3 + (HC.Co.rating() - 3) * 0.28, 0.12, 0.85) * 100);

  // ================= more kinds of work =================
  const lawnZone = (lot) => ({ x: TS * 2, y: TS * 2, w: lot.pw - TS * 4, h: lot.roadY - TS * 4 });
  const edgeZone = (lot) => ({ x: TS * 1.5, y: TS * 1.5, w: lot.pw - TS * 3, h: TS * 3.2 }); // the strip along the back line
  const dropZone = (lot) => ({ x: lot.drive.x + lot.drive.w + TS * 0.5, y: lot.roadY - TS * 7, w: TS * 4, h: TS * 3.5 }); // beside the drive
  Object.assign(G.ESTIMATE, {
    lawn_mowing(tier) { return { pay: 190 + tier * 110, par: 35 + tier * 15, summary: 'An overgrown lawn to mow, front and back' }; },
    hazard_tree(tier) {
      const count = 1 + (tier > 1 ? 1 : 0) + (HC.chance(0.35) ? 1 : 0);
      return { count, pay: 520 * count + 180 + tier * 120, par: 40 * count + 40, summary: `${count} dead hazard tree${count > 1 ? 's' : ''} leaning toward the house` };
    },
    firewood_delivery(tier) { const count = HC.randi(8, 14) + tier * 4; return { count, pay: count * 85 + 80, par: 45 + count * 2, summary: `${count} units of split firewood, dropped beside the drive` }; },
    mulch_delivery(tier) { const count = HC.randi(6, 12) + tier * 4; return { count, pay: count * 82 + 100, par: 40 + count * 2, summary: `${count} units of mulch, dumped beside the drive` }; },
    rock_picking(tier) { const count = HC.randi(10, 16) + tier * 5; return { count, pay: count * 26 + 140, par: 30 + count * 4, summary: `${count} rocks to pick off a field and haul away` }; },
    fence_line(tier) {
      const bushes = HC.randi(10, 16) + tier * 5, saplings = HC.randi(6, 10) + tier * 3;
      return { bushes, saplings, pay: 260 + bushes * 26 + saplings * 24, par: 30 + (bushes + saplings) * 2.6, summary: `A grown-up fence line: ${bushes} brush thickets and ${saplings} saplings` };
    },
  });
  Object.assign(L.GEN, {
    lawn_mowing(lot) {
      L.scatterTrees(lot, 4, ['oak', 'maple']);
      const z = tilesOf(lawnZone(lot));
      for (let y = z.y0; y < z.y1; y++) for (let x = z.x0; x < z.x1; x++) if (lot.tiles[y * lot.w + x] === T.GRASS && HC.chance(0.85)) lot.set(x, y, T.TALL);
      lot.zone = null;
      clearUnmowable(lot);
    },
    hazard_tree(lot, job) {
      L.scatterTrees(lot, Math.round(lot.w * lot.h / 50), ['oak', 'maple', 'pine']);
      const h = lot.house;
      for (let i = 0, tries = 0; i < job.count && tries < 400; tries++) {
        const side = HC.chance(0.5) ? -1 : 1, x = side < 0 ? h.x - HC.rand(TS * 1.6, TS * 3.2) : h.x + h.w + HC.rand(TS * 1.6, TS * 3.2), y = HC.rand(h.y - TS, h.y + h.h + TS);
        if (x < TS * 1.5 || x > lot.pw - TS * 1.5 || y < TS * 1.5) continue;
        lot.trees = lot.trees.filter((t) => HC.dist(t.x, t.y, x, y) > 50);
        const t = L.makeTree('dead', x, y, HC.rand(1.05, 1.3)); t.marked = true; lot.trees.push(t); i++;
      }
    },
    firewood_delivery(lot) { L.scatterTrees(lot, Math.round(lot.w * lot.h / 45), ['oak', 'maple', 'pine']); lot.zone = dropZone(lot); lot.trees = lot.trees.filter((t) => !HC.circleRectHit(t.x, t.y, t.trunkR + 24, lot.zone)); },
    mulch_delivery(lot) { L.scatterTrees(lot, Math.round(lot.w * lot.h / 45), ['oak', 'maple', 'pine']); lot.zone = dropZone(lot); lot.trees = lot.trees.filter((t) => !HC.circleRectHit(t.x, t.y, t.trunkR + 24, lot.zone)); },
    rock_picking(lot, job) {
      const z = (lot.zone = sideZone(lot));
      clearArea(lot, z);
      L.scatterTrees(lot, 3, ['oak', 'maple']);
      lot.trees = lot.trees.filter((t) => !HC.circleRectHit(t.x, t.y, t.trunkR + 20, z));
      for (let i = 0; i < job.count; i++) lot.items.push({ id: HC.uid(), kind: 'rock', x: HC.rand(z.x + 14, z.x + z.w - 14), y: HC.rand(z.y + 14, z.y + z.h - 14), a: HC.rand(0, 6), size: HC.rand(0.85, 1.25), value: 0 });
    },
    fence_line(lot, job) {
      const z = (lot.zone = edgeZone(lot));
      lot.trees = lot.trees.filter((t) => !HC.circleRectHit(t.x, t.y, t.trunkR + 10, z));
      L.scatterTrees(lot, Math.round(lot.w * lot.h / 60), ['oak', 'maple', 'pine']);
      lot.trees = lot.trees.filter((t) => !HC.circleRectHit(t.x, t.y, t.trunkR + 10, z));
      for (let i = 0, tries = 0; i < job.saplings && tries < 2000; tries++) {
        const x = HC.rand(z.x, z.x + z.w), y = HC.rand(z.y, z.y + z.h);
        if (lot.trees.some((t) => HC.dist(x, y, t.x, t.y) < t.trunkR + 22)) continue;
        const t = L.makeTree('sapling', x, y, HC.rand(0.8, 1.1)); t.marked = true; lot.trees.push(t); i++;
      }
      L.scatterBushes(lot, job.bushes, z);
      const tz = tilesOf(z);
      for (let y = tz.y0; y < tz.y1; y++) for (let x = tz.x0; x < tz.x1; x++) if (HC.chance(0.6)) lot.set(x, y, T.TALL);
    },
  });
  const inZone = (S, o) => S.lot.zone && HC.inRect(o.x, o.y, S.lot.zone);
  Object.assign(G.OBJECTIVES, {
    lawn_mowing(S) {
      const p = HC.world.parcels.find((q) => q.id === S.job.parcel), W = S.lot;
      let tall = 0;
      if (p) for (let y = Math.floor(p.y / TS); y < Math.ceil((p.y + p.h) / TS); y++) for (let x = Math.floor(p.x / TS); x < Math.ceil((p.x + p.w) / TS); x++) if (W.tiles[y * W.w + x] === T.TALL) tall++;
      S.init = S.init || { tall };
      const ok = Math.floor(S.init.tall * 0.04);
      return [{ label: 'Mow the lawn', n: tall <= ok ? 1 : 0, of: 1, left: Math.max(0, tall - ok) }];
    },
    hazard_tree: (S) => G.OBJECTIVES.tree_removal(S),
    firewood_delivery(S) {
      const n = pieces(S, (i) => inZone(S, i), ['firewood']);
      return [{ label: `Drop ${S.job.count} units of firewood in the marked spot`, n: Math.min(n, S.job.count), of: S.job.count, left: Math.max(0, S.job.count - n) }];
    },
    mulch_delivery(S) {
      const n = pieces(S, (i) => inZone(S, i), ['mulch']);
      return [{ label: `Dump ${S.job.count} units of mulch in the marked spot`, n: Math.min(n, S.job.count), of: S.job.count, left: Math.max(0, S.job.count - n) }];
    },
    rock_picking(S) {
      const left = pieces(S, (i) => inZone(S, i), ['rock']);
      S.init = S.init || { left: Math.max(left, S.job.count) };
      return [{ label: 'Pick the rocks off the field', n: Math.max(0, S.init.left - left), of: S.init.left, left }];
    },
    fence_line: (S) => G.OBJECTIVES.mulching(S),
  });
})();
