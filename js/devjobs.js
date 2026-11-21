// Hollow Creek — the big multi-day work: land development (clear a wooded lot, pull the stumps, grade a house pad with the
// dozer and gravel a driveway) and logging contracts (bid on a timber sale, then fell, skid, load out and truck it all to
// the sawmill over several days). Gravel is bought by the load at the quarry's sales pad.
'use strict';
(() => {
  const TS = HC.TILE, T = HC.T, G = HC.Game, L = HC.Lot, C = () => HC.company;
  HC.GRAVEL_PRICE = 30; HC.LOAD.gravel = 1;

  Object.assign(HC.JOBS, {
    land_dev: { name: 'Land Development (multi-day)', color: '#9a6a2a', needs: ['saw', 'dozerS'], disposal: 'haul',
      blurb: 'Lot prep for a new house: clear every tree in the tape, haul out the wood and brush, pull the stumps, grade the house pad to dirt with the dozer, then haul in gravel from the quarry for the driveway.' },
    timber_sale: { name: 'Logging Contract (bid)', color: '#4f3a22', needs: ['saw', 'skid'], tract: true, disposal: 'haul',
      blurb: 'A timber sale on a whole tract. Bid for the cutting rights, then fell the marked timber, skid it out, load it and truck every log to the sawmill. The logs are yours to sell.' },
  });
  Object.assign(HC.JOBS, {
    mech_harvest: { name: 'Mechanized Timber Sale (bid)', color: '#3f5a2a', needs: ['harvester', 'forwarder'], tract: true, disposal: 'haul',
      blurb: 'A big timber sale only a mechanized crew can finish in time: harvester to fell and cut to length (cut-to-length logs fetch 30% more at the mill), forwarder to haul it to the road. Bid for the rights.' },
    skid_contract: { name: 'Whole-Tree Skidding', color: '#6a4a2a', needs: ['skidder'], tract: true, disposal: 'place',
      blurb: 'A felling crew already dropped the timber. Grab the whole trees with a grapple skidder and drag every one to the landing.' },
  });
  HC.REQUESTS = HC.REQUESTS || {};
  HC.REQUESTS.mech_harvest = ['Large timber sale on the ridge tract: mechanized crews only. Sealed bids.', 'Forty-some marked trees and a tight deadline. Bring a harvester and forwarder.'];
  HC.REQUESTS.skid_contract = ['Our fallers are done. We need a skidder to drag it all to the landing.', 'Trees are on the ground. Skid them out to the landing for us.'];
  HC.REQUESTS.land_dev = ['We closed on a wooded lot and want to build. Clear it, pad it, and give us a gravel drive.', 'Builder here: I need this lot cleared, stumped, graded and a driveway in.', 'Got a house going up in the spring. Lot needs to be ready: trees, stumps, pad and drive.'];
  HC.REQUESTS.timber_sale = ['The forester marked a timber sale on our land. Highest bid gets the cutting rights.', 'We\'re selling the timber off the back tract. Send your bid.', 'Sealed bids on a timber sale: marked pine and oak, haul it all out.'];

  Object.assign(G.ESTIMATE, {
    mech_harvest(tier) {
      const count = HC.randi(30, 40) + tier * 8, cruise = Math.round(count * 3.3 * 52 * (HC.MILL_PRICE || 1.15) * 1.3 / 50) * 50;
      return { count, cruise, pay: 900 + tier * 300, par: 1100 + tier * 150, summary: `${count} marked trees on a big tract. Cruise about ${HC.money(cruise)} at the mill if it's cut to length` };
    },
    skid_contract(tier) { const count = HC.randi(10, 14) + tier * 4; return { count, pay: count * 150 + 250, par: 120 + count * 12, summary: `${count} felled trees to drag to the landing` }; },
    land_dev(tier) {
      const count = HC.randi(8, 12) + tier * 3, stumps = HC.randi(3, 5) + tier;
      return { count, stumps, pay: Math.round((count * 210 + stumps * 90 + 1900 + tier * 500) / 10) * 10, par: 620 + tier * 120, summary: `${count} trees and ${stumps} old stumps to clear, a house pad to grade and a gravel driveway (multi-day)` };
    },
    timber_sale(tier) {
      const count = HC.randi(14, 20) + tier * 6, cruise = Math.round(count * 3.2 * 52 * (HC.MILL_PRICE || 1.15) / 50) * 50;
      return { count, cruise, pay: 300 + tier * 150, par: 900 + tier * 150, summary: `${count} marked trees on the tract. The forester's cruise puts the logs at about ${HC.money(cruise)} at the mill` };
    },
  });

  // ---------- the lots ----------
  Object.assign(L.GEN, {
    land_dev(lot, job) {
      lot.houses = []; // a vacant wooded lot
      const z = (lot.zone = { x: TS * 2, y: TS * 2, w: lot.pw - TS * 4, h: lot.roadY - TS * 4 });
      L.scatterTrees(lot, job.count, ['oak', 'pine', 'maple', 'pine', 'oak'], 26, z);
      for (const t of lot.trees) t.marked = HC.inRect(t.x, t.y, z);
      L.scatterBushes(lot, 8 + job.tier * 2, z);
      for (let n = 0, tries = 0; n < job.stumps && tries < 800; tries++) { // old stumps from a long-ago cut
        const x = HC.rand(z.x + 20, z.x + z.w - 20), y = HC.rand(z.y + 20, z.y + z.h - 20);
        if (lot.trees.some((t) => HC.dist(t.x, t.y, x, y) < 40) || lot.stumps.some((s) => HC.dist(s.x, s.y, x, y) < 40)) continue;
        const type = HC.pick(['oak', 'pine']); lot.stumps.push({ id: HC.uid(), x, y, r: HC.TREES[type].trunk + 4, hp: 0, grind: HC.TREES[type].grind, type, target: true }); n++;
      }
      // the house pad (up the lot, centred on the drive) and the driveway down to the road: grass for now
      const dx = lot.drive.x + lot.drive.w / 2, pad = { x: HC.clamp(dx - TS * 4, z.x, z.x + z.w - TS * 8), y: z.y + TS * 2, w: TS * 8, h: TS * 5 };
      const drive = { x: lot.drive.x, y: pad.y + pad.h, w: Math.max(TS * 2, lot.drive.w), h: lot.roadY - (pad.y + pad.h) };
      for (let y = Math.floor(drive.y / TS); y < Math.ceil((drive.y + drive.h) / TS); y++) for (let x = Math.floor(drive.x / TS); x < Math.ceil((drive.x + drive.w) / TS); x++) if (lot.tiles[y * lot.w + x] === T.GRAVEL) lot.set(x, y, T.GRASS);
      job.dev = { pad, drive, Hp: lot.ph };
    },
    timber_sale(lot, job) { L.GEN.timber_harvest(lot, job); },
    mech_harvest(lot, job) { L.GEN.timber_harvest(lot, job); },
    skid_contract(lot, job) { // the trees are already on the ground, felled every which way
      L.GEN.timber_harvest(lot, job);
      for (const t of lot.trees) if (t.marked) { t.state = 'felled'; t.fallA = HC.rand(0, Math.PI * 2); t.landT = 1; t.cut = 1; }
    },
  });

  // world rectangles for the pad and the drive (lots on the far side of a road are built upside down)
  function devRects(S) {
    const p = HC.world.parcels.find((q) => q.id === S.job.parcel), d = S.job.dev; if (!p || !d) return null;
    const map = (r) => ({ x: p.x + r.x, y: p.flip ? p.y - 2 * TS + (d.Hp - r.y - r.h) : p.y + r.y, w: r.w, h: r.h });
    return { pad: map(d.pad), drive: map(d.drive) };
  }
  HC.devRects = devRects;
  const share = (S, r, test) => { let n = 0, ok = 0; for (let y = Math.floor(r.y / TS); y < Math.ceil((r.y + r.h) / TS); y++) for (let x = Math.floor(r.x / TS); x < Math.ceil((r.x + r.w) / TS); x++) { const t = S.lot.tiles[y * S.lot.w + x]; if (t === T.ROAD || t === T.WATER) continue; n++; if (test(t)) ok++; } return n ? ok / n : 1; };
  const inZ = (S, o) => HC.world.zone && HC.inRect(o.x, o.y, HC.world.zone);
  const pieces = (S, test, kinds) => S.lot.items.reduce((a, i) => a + (!test(i) ? 0 : i.kind === 'pile' ? i.content.filter((c) => kinds.includes(c.kind)).length : kinds.includes(i.kind) ? 1 : 0), 0);

  Object.assign(G.OBJECTIVES, {
    mech_harvest: (S) => G.OBJECTIVES.timber_sale(S),
    skid_contract(S) {
      const pid = S.job.parcel, trees = S.lot.trees.filter((t) => t.marked && t.parcel === pid), Z = HC.world.zone;
      const at = trees.filter((t) => t.state !== 'felled' || (Z && HC.inRect(t.x, t.y, { x: Z.x - TS * 2, y: Z.y - TS * 2, w: Z.w + TS * 4, h: Z.h + TS * 4 }))).length;
      return [{ label: 'Skid every felled tree to the landing', n: at, of: trees.length, left: trees.length - at }];
    },
    land_dev(S) {
      const pid = S.job.parcel, marked = S.lot.trees.filter((t) => t.marked && t.parcel === pid);
      const down = marked.filter((t) => t.state !== 'standing' && t.state !== 'falling').length;
      const wood = pieces(S, (i) => inZ(S, i), ['log', 'brush']) + marked.filter((t) => t.state === 'felled').length + S.lot.bushes.filter((b) => inZ(S, b)).length;
      const stumps = S.lot.stumps.filter((s) => inZ(S, s)).length;
      const R = devRects(S), pad = R ? share(S, R.pad, (t) => t === T.DIRT) : 0, drv = R ? share(S, R.drive, (t) => t === T.GRAVEL) : 0;
      S.init = S.init || { stumps: Math.max(stumps, 1) };
      return [
        { label: 'Clear every tree in the tape', n: down, of: marked.length },
        { label: 'Haul out the logs and brush', n: wood ? 0 : 1, of: 1, left: wood },
        { label: 'Pull or grind the stumps', n: Math.max(0, S.init.stumps - stumps), of: S.init.stumps, left: stumps },
        { label: 'Grade the house pad (dozer, blade down)', n: pad >= 0.9 ? 1 : 0, of: 1, left: Math.round((0.9 - Math.min(0.9, pad)) * 100) },
        { label: 'Gravel the driveway (quarry gravel)', n: drv >= 0.85 ? 1 : 0, of: 1, left: Math.round((0.85 - Math.min(0.85, drv)) * 100) },
      ];
    },
    timber_sale(S) {
      const pid = S.job.parcel, marked = S.lot.trees.filter((t) => t.marked && t.parcel === pid);
      const down = marked.filter((t) => t.state !== 'standing' && t.state !== 'falling').length, bucked = marked.filter((t) => t.state === 'gone').length;
      const p = HC.world.parcels.find((q) => q.id === pid), onTract = (i) => p && HC.inRect(i.x, i.y, { x: p.x - TS * 2, y: p.y - TS * 3, w: p.w + TS * 4, h: p.h + TS * 6 });
      const left = pieces(S, onTract, ['log']) + marked.filter((t) => t.state === 'felled').length;
      const sold = S.job.logsSold || 0;
      return [
        { label: 'Fell the marked timber', n: down, of: marked.length },
        { label: 'Buck it into logs', n: bucked, of: marked.length },
        { label: 'Truck every log to the sawmill', n: left || bucked < marked.length ? 0 : 1, of: 1, left },
        { label: `Logs sold so far: ${HC.money(sold)} (bid ${HC.money(S.job.bid || 0)})`, n: 1, of: 1 },
      ];
    },
  });

  // ---------- bidding on a timber sale: three bids, the higher the surer ----------
  HC.TIMBER_BIDS = [{ f: 0.38, odds: 0.3, label: 'Low' }, { f: 0.5, odds: 0.62, label: 'Fair' }, { f: 0.64, odds: 0.92, label: 'Strong' }];
  HC.bidTimber = function (id, which) {
    const c = C(), j = (c.board || []).find((x) => x.id === +id), b = HC.TIMBER_BIDS[+which];
    if (!j || !b || j.lost) return 'That sale is closed.';
    const amount = Math.round((j.cruise * b.f) / 50) * 50;
    if (c.money < amount) return `A ${b.label.toLowerCase()} bid is ${HC.money(amount)}. Not enough money.`;
    if (Math.random() > b.odds) { j.lost = true; return `Bids opened: ${HC.pick(['Pike Land Services', 'Blue Ridge Timber', 'Haddix & Sons Logging', 'Cedar Knob Forestry'])} outbid your ${HC.money(amount)}. The sale went to them.`; }
    c.money -= amount; j.bid = amount; HC.Audio.cash();
    G.accept(j);
    return `You won the timber sale at ${HC.money(amount)}. Paid the landowner. Every log you truck to the sawmill is yours to sell (the cruise says about ${HC.money(j.cruise)}).`;
  };

  // ---------- gravel: buy it by the load at the quarry's sales pad, dump it on the drive and it spreads ----------
  const atQuarry = (t) => HC.world.quarry && HC.world.quarry.pad && HC.inRect(t.x, t.y, { x: HC.world.quarry.pad.x - 40, y: HC.world.quarry.pad.y - 40, w: HC.world.quarry.pad.w + 80, h: HC.world.quarry.pad.h + 80 });
  const boxesOf = (u, S) => S.trailers.filter((t) => t.hitch === u.kind && ['dump', 'dump2', 'dump18', 'gndump', 'bed'].includes(t.kind));
  const U = HC.Units, baseInteract = U.interact;
  U.interact = function (u, S) {
    if (u && U.isTruck(u.kind) && atQuarry(u)) {
      const boxes = boxesOf(u, S).filter((t) => !t.cargo.some((c) => c.kind !== 'gravel'));
      const room = boxes.reduce((a, t) => a + Math.max(0, HC.Game.trailerCap(t) - t.load), 0);
      if (boxes.length && room > 0) {
        const n = Math.min(room, Math.floor(C().money / HC.GRAVEL_PRICE)); if (n <= 0) return HC.Game.toast(`Gravel is ${HC.money(HC.GRAVEL_PRICE)} a unit. Not enough money.`, 'warn');
        let left = n; for (const t of boxes) { const k = Math.min(left, HC.Game.trailerCap(t) - t.load); for (let i = 0; i < k; i++) t.cargo.push({ id: HC.uid(), kind: 'gravel', x: t.x, y: t.y, a: 0, size: 1 }); t.load += k; left -= k; }
        C().money -= n * HC.GRAVEL_PRICE; if (S.job) S.costs.dump += n * HC.GRAVEL_PRICE; S.time += 8; HC.Audio.cash();
        return HC.Game.toast(`The quarry loader put ${n} units of #57 gravel in the box: ${HC.money(n * HC.GRAVEL_PRICE)}. Dump it (X) on the driveway and it spreads.`, 'good');
      }
    }
    return baseInteract.apply(this, arguments);
  };
  const baseHint = U.hint;
  U.hint = function (u, S) {
    if (u && U.isTruck(u.kind) && atQuarry(u) && boxesOf(u, S).some((t) => t.load < HC.Game.trailerCap(t) && !t.cargo.some((c) => c.kind !== 'gravel'))) return `E: buy gravel (${HC.money(HC.GRAVEL_PRICE)} a unit) to fill the dump box`;
    return baseHint.apply(this, arguments);
  };
  const baseDump = G.dumpLoad;
  G.dumpLoad = function (u) {
    const S = HC.session, boxes = S && U.isTruck(u.kind) ? boxesOf(u, S).filter((t) => t.cargo.length && t.cargo.every((c) => c.kind === 'gravel')) : [];
    if (!boxes.length || Math.abs(u.v) > 4) { // anything else dumps as usual; a timber sale keeps a tally of what its logs fetch at the mill
      const before = C().money, r = baseDump.apply(this, arguments), pad = G.padAt && G.padAt(u.x, u.y);
      if (S && S.job && (S.job.type === 'timber_sale' || S.job.type === 'mech_harvest') && C().money > before) S.job.logsSold = (S.job.logsSold || 0) + (C().money - before);
      return r;
    }
    let n = 0;
    for (const t of boxes) {
      const back = t.kind === 'bed' ? (u.r || 18) * 2.6 : (HC.TRAILERS[t.kind].len || 40) * 0.5 + 14, a = t.kind === 'bed' ? u.a : t.a;
      const px = (t.kind === 'bed' ? u.x : t.x) - Math.cos(a) * back, py = (t.kind === 'bed' ? u.y : t.y) - Math.sin(a) * back;
      // spread it as a strip behind the box: each unit covers about a tile and a half
      const k = t.cargo.length, len = Math.max(1, Math.round(k * 1.5 / 2));
      for (let i = 0; i < len; i++) for (const side of [-0.5, 0.5]) {
        const x = px - Math.cos(a) * i * TS + Math.sin(a) * side * TS, y = py - Math.sin(a) * i * TS - Math.cos(a) * side * TS, cur = HC.Lot.tile(S.lot, x, y);
        if (cur === T.ROAD || cur === T.WATER || cur === -1) continue;
        HC.Game.setTile(Math.floor(x / TS), Math.floor(y / TS), T.GRAVEL);
      }
      for (let i = 0; i < 8; i++) HC.Game.dust(px + HC.rand(-14, 14), py + HC.rand(-14, 14), '#b0a896', 3, 80);
      n += k; t.cargo = []; t.load = 0; t.tipT = 1; t.tipN = (t.tipN || 0) + 1;
    }
    HC.Audio.drop(); S.time += 3;
    HC.Game.toast(`Spread ${n} units of gravel behind the truck. Drive forward as you dump to lay a longer strip.`);
  };
})();
