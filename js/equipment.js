// Hollow Creek — grinder, chipper, trucks, mower, landscaping crew, skid steer mulcher
'use strict';
(() => {
  const U = HC.Units, K = U.KINDS, T = HC.T, TS = HC.TILE;
  const mouseDown = () => HC.input.mouse.down;
  const near = (a, b, d) => Math.abs(a.x - b.x) < d && Math.abs(a.y - b.y) < d && HC.dist(a.x, a.y, b.x, b.y) < d;
  const tileAt = (x, y) => ({ tx: Math.floor(x / TS), ty: Math.floor(y / TS) });
  let lastBump = 0;

  // a push pile counts as in reach from its edge, not its middle (a big one is several metres across)
  const pileR = (i) => (i.kind === 'pile' ? 34 * (i.size || 1) : 0);
  function idle(u) { u.v *= 0.8; u.moving = false; u.working = false; }
  function canRun(u) { return u.fuel > 0 && U.cond(u.kind) > 0; }
  function runWork(u, dt) { const spec = HC.EQUIP[u.kind]; U.burn(u, (spec.work || 0.4) * dt); U.wear(u, spec.wear * dt); }
  function setGround(S, x, y, r, from, to) {
    for (let dy = -r; dy <= r; dy += 12) for (let dx = -r; dx <= r; dx += 12) {
      const cur = HC.Lot.tile(S.lot, x + dx, y + dy);
      if (from.includes(cur)) { const { tx, ty } = tileAt(x + dx, y + dy); HC.Game.setTile(tx, ty, to); }
    }
  }
  // machines that ride the equipment trailer: E straps/unstraps, else refuel
  function machineInteract(u, S, fallback) {
    if (U.strapToggle(u, S)) return;
    if (U.nearFuel(u, S)) { if (!U.refuel(u)) HC.Game.toast('Tank is full.'); return; }
    HC.Game.toast(fallback);
  }
  function machineHint(u, S, normal) {
    if (u.on) return 'Strapped to the equipment trailer. E: take the straps off.';
    if (S.trailers.some((t) => U.onDeck(t, u))) return 'On the trailer deck. Stop and press E to strap it down.';
    if (U.behindRamps(u, S)) return 'Ramps are down. Drive straight up onto the deck, stop, and press E to strap it down.';
    if (U.nearFuel(u, S) && u.fuel < U.fuelCap(u.kind) - 1) return 'E: refuel';
    return normal;
  }

  // ---------- skid steer: mulcher head + chipper drop-off ----------
  K.skid.modeName = (u) => (u.mode === 1 ? 'Mulcher head' : u.mode === 2 ? 'Brush cutter' : u.mode === 3 ? 'Pallet forks' : u.mode === 0 ? 'Grapple' : 'No attachment');
  K.skid.mode = (u, S) => HC.Game.attachToggle(u, S);
  K.skid.work = (u, dt, S) => {
    u.working = false;
    if (u.mode === 2 && mouseDown() && canRun(u)) return brushCut(u, dt, S);
    if (u.mode !== 1 || !mouseDown() || !canRun(u)) return;
    if (u.armT > 0.35) return HC.Game.hintOnce('Lower the mulcher head to the ground first (hold G).');
    u.working = true;
    runWork(u, dt);
    U.burn(u, 0.4 * dt);
    mulch(u, dt, S, 26 * ((HC.EQUIP[u.kind].power || 1) > 1 ? 1.1 : 1), 22 * ((HC.EQUIP[u.kind].power || 1) > 1 ? 1.1 : 1), HC.EQUIP[u.kind].power || HC.EQUIP[HC.baseOf(u.kind)].power || 1);
  };
  // the skid's rotary brush cutter: like a bush hog out front, leaves mowed ground
  function brushCut(u, dt, S) {
    if (u.armT > 0.35) return HC.Game.hintOnce('Lower the brush cutter to the ground first (hold G).');
    u.working = true;
    runWork(u, dt);
    U.burn(u, 0.3 * dt);
    const p = U.frontPt(u, 30), R = 15, rate = U.condFactor(u.kind) * dt * 1.3 * (HC.EQUIP[u.kind].power || 1);
    for (const b of S.lot.bushes.slice()) if (near(b, p, R + b.r)) { b.hp += rate / 1.6; if (b.hp >= 1) { S.lot.bushes.splice(S.lot.bushes.indexOf(b), 1); HC.Audio.chip(); } }
    for (const it of S.lot.items.slice()) if (it.kind === 'brush' && near(it, p, R + 6)) { it.hp = (it.hp || 0) + rate / 1.2; if (it.hp >= 1) { S.lot.items.splice(S.lot.items.indexOf(it), 1); HC.Audio.chip(); } }
    for (const t of S.lot.trees) {
      if (t.state === 'gone' || !near(t, p, R + 6)) continue;
      if (t.type === 'sapling') { t.cut += rate / 0.8; if (t.cut >= 1) { t.state = 'gone'; HC.Audio.chip(); if (!t.marked) HC.Game.penalty('wrong', t.x, t.y); } }
      else if (t.state === 'standing' && near(t, p, t.trunkR + 10) && !t.damaged) { t.damaged = true; if (!t.marked) HC.Game.penalty('tree', t.x, t.y); }
    }
    if (bog) { u.v *= 0.5; U.wear(u, 0.6 * dt); HC.Game.hintOnce('That brush is too heavy for a bush hog: it bogs down and wears the cutter. Thick brush and bigger saplings need a forestry mulcher.'); }
    setGround(S, p.x, p.y, R, [T.TALL], T.MOWED);
    if (Math.random() < dt * 8) HC.Game.dust(p.x + HC.rand(-R, R), p.y + HC.rand(-R, R), HC.pick(['#7fa443', '#93b552', '#6a8f36']), 2, 50);
  }
  function mulch(u, dt, S, reach, R, power) {
    const fp = U.frontPt(u, reach), rate = HC.Co.mult('mulch') * U.condFactor(u.kind) * dt * power;
    let hit = false;
    for (const b of S.lot.bushes.slice()) if (near(b, fp, R + b.r)) {
      b.hp += rate / 1.1; hit = true;
      if (b.hp >= 1) { S.lot.bushes.splice(S.lot.bushes.indexOf(b), 1); HC.Audio.chip(); }
    }
    for (const it of S.lot.items.slice()) if (it.kind === 'brush' && near(it, fp, R + 6)) {
      it.hp = (it.hp || 0) + rate / 0.8; hit = true;
      if (it.hp >= 1) { S.lot.items.splice(S.lot.items.indexOf(it), 1); HC.Audio.chip(); }
    }
    for (const t of S.lot.trees) {
      if (t.state === 'gone' || !near(t, fp, R + 8)) continue;
      if (t.type === 'sapling') {
        t.cut += rate / 0.9; hit = true;
        if (t.cut >= 1) { t.state = 'gone'; HC.Audio.chip(); if (!t.marked) HC.Game.penalty('wrong', t.x, t.y); }
      } else if (t.state === 'standing' && t.marked && (t.s || 1) < 0.85 && near(t, fp, t.trunkR + 12)) { // a young marked tree: the drum takes it down to the ground
        t.cut += rate / 2.4; hit = true;
        if (t.cut >= 1) { t.state = 'gone'; HC.Audio.chip(); }
      } else if (t.state === 'standing' && near(t, fp, t.trunkR + 12) && !t.damaged) {
        t.damaged = true;
        if (!t.marked) HC.Game.penalty('tree', t.x, t.y);
      }
    }
    for (const st of S.lot.stumps.slice()) if (near(st, fp, R + st.r)) { // and stumps get ground down to grade, slower than a stump grinder
      st.hp += (rate / (1.4 + (st.grind || 4) * 0.35)); hit = true;
      if (st.hp >= 1) { S.lot.stumps.splice(S.lot.stumps.indexOf(st), 1); if (st.fromMarked) S.ground = (S.ground || 0) + 1; HC.Audio.pop(); }
    }
    setGround(S, fp.x, fp.y, R - 6, [T.GRASS, T.TALL, T.MOWED, T.DIRT], T.MULCH);
    HC.Game.dust(fp.x + HC.rand(-R, R) * 0.6, fp.y + HC.rand(-R, R) * 0.6, hit ? HC.pick(['#7b4b2b', '#a3683b', '#5f8f3a']) : '#a3683b', hit ? 3 : 1, 70);
  }
  const chipperNear = (S, p, d) => Object.values(S.units).find((c) => ['chipper', 'chipper2'].includes(HC.baseOf(c.kind)) && near(c, p, d));
  // firewood processor: the log deck on its right side, the conveyor out the back
  const deckPt = (g) => ({ x: g.x + Math.cos(g.a + Math.PI / 2) * 22, y: g.y + Math.sin(g.a + Math.PI / 2) * 22 });
  const outPt = (g) => ({ x: g.x - Math.cos(g.a) * 52, y: g.y - Math.sin(g.a) * 52 });
  const procNear = (S, p, d) => Object.values(S.units).find((g) => HC.baseOf(g.kind) === 'fwproc' && !g.hidden && near(deckPt(g), p, d));
  // horizontal grinder: hopper at the back, discharge conveyor out the front
  const hopperPt = (g) => ({ x: g.x - Math.cos(g.a) * 40, y: g.y - Math.sin(g.a) * 40 });
  const dischargePt = (g) => ({ x: g.x + Math.cos(g.a) * 78, y: g.y + Math.sin(g.a) * 78 });
  const grinderNear = (S, p, d) => Object.values(S.units).find((g) => HC.baseOf(g.kind) === 'grinderHG' && !g.hidden && !g.on && near(hopperPt(g), p, d));
  K.skid.feedHint = (u, S, fp) => {
    if (!u.carrying.length) return null;
    if (grinderNear(S, fp, 56)) return `E: feed ${u.carrying.length} piece(s) into the grinder hopper`;
    if (HC.splitterNear && HC.splitterNear(S, fp, 42) && u.carrying.some((c) => c.kind === 'log')) return 'E: drop logs on the log splitter';
    if (procNear(S, fp, 56) && u.carrying.some((c) => c.kind === 'log')) return `E: put ${u.carrying.filter((c) => c.kind === 'log').length} log(s) on the firewood processor deck`;
    if (chipperNear(S, fp, 56)) return 'E: feed the chipper';
    return null;
  };
  K.grinderHG = {
    update(u, dt, S, active) {
      if (active) U.tank(u, dt, HC.EQUIP[HC.baseOf(u.kind)]); else idle(u);
      u.hopper = u.hopper || [];
      u.working = false;
      if (!u.hopper.length || u.on || Math.abs(u.v) > 2 || !canRun(u)) return;
      u.working = true; runWork(u, dt);
      u.grindT = (u.grindT || 0) + dt * U.condFactor(u.kind);
      if (u.grindT < 1.2) return;
      u.grindT = 0;
      const piece = u.hopper.shift(), each = (c) => (c.kind === 'log' || c.kind === 'stump' ? 2 : 1), units = piece.kind === 'pile' ? (piece.content || []).reduce((a, c) => a + each(c), 0) || 1 : each(piece);
      const dp = dischargePt(u), dump = U.nearDump(dp, S, 30);
      for (let i = 0; i < units; i++) {
        const m = { id: HC.uid(), kind: 'mulch', x: dp.x, y: dp.y, a: 0, size: 1, value: 0 };
        if (dump && dump.load + 1 <= HC.Game.trailerCap(dump)) { dump.cargo.push(m); dump.load += 1; continue; }
        let pile = S.lot.items.find((it) => it.kind === 'pile' && it.mulch && near(it, dp, 26));
        if (!pile) { pile = { id: HC.uid(), kind: 'pile', mulch: true, x: dp.x, y: dp.y, a: 0, size: 0.6, content: [] }; S.lot.items.push(pile); }
        pile.content.push(m); pile.size = 0.6 + Math.sqrt(pile.content.length) * 0.28;
      }
      HC.Audio.chip();
      HC.Game.dust(dp.x, dp.y, HC.pick(['#3a2618', '#5a3a22', '#2e2119']), 3, 60);
    },
    interact(u, S) { if (U.strapToggle(u, S)) return; if (U.nearFuel(u, S)) { if (!U.refuel(u)) HC.Game.toast('Tank is full.'); return; } HC.Game.toast(HC.EQUIP.grinderHG.help); },
    hint(u, S) {
      const h = (u.hopper || []).length;
      if (u.on) return 'Strapped down. E takes the straps off.';
      const under = U.nearDump(dischargePt(u), S, 30);
      return `Mulch grinder: ${h ? `grinding (${h} piece(s) in the hopper)` : 'hopper empty: feed brush and logs in at the back'}. ${under ? `Discharging into the ${HC.TRAILERS[under.kind] ? HC.TRAILERS[under.kind].name.toLowerCase() : 'truck'} (${under.load}/${HC.Game.trailerCap(under)}).` : 'Park a dump trailer or dump truck under the conveyor, or it piles on the ground.'}`;
    },
  };
  // ---------- firewood processor: saws each log into rounds, splits them, and the conveyor carries firewood out the back ----------
  K.fwproc = {
    update(u, dt, S, active) {
      u.deck = u.deck || [];
      u.working = false;
      const towing = u.hitch && S.units[u.hitch] && Math.abs(S.units[u.hitch].v || 0) > 2;
      if (!u.deck.length || towing || !canRun(u)) return;
      u.working = true; runWork(u, dt);
      u.cutT = (u.cutT || 0) + dt * U.condFactor(u.kind);
      const op = outPt(u);
      if (Math.random() < dt * 5) HC.Game.spray(u.x - Math.cos(u.a) * 18, u.y - Math.sin(u.a) * 18, 14, op.x, op.y, 6, ['#b58a5a', '#c9a26a', '#8a6440'], 1, 0.7); // splits riding up the belt
      if (u.cutT < 2.6) return;
      u.cutT = 0;
      const log = u.deck.shift(), units = Math.max(2, Math.round((log.size || 1) * 3));
      const dump = U.nearDump(op, S, 30);
      // the splits tumble off the top of the conveyor into the box, or onto the heap below it
      HC.Game.spray(op.x, op.y, 30, dump ? dump.x : op.x, dump ? dump.y : op.y, dump ? 13 : 3, ['#b58a5a', '#c9a26a', '#9a7048', '#d4b07a'], units + 2, 0.5);
      for (let i = 0; i < units; i++) {
        const f = { id: HC.uid(), kind: 'firewood', x: op.x, y: op.y, a: 0, size: 1, value: 0 };
        if (dump && dump.load + 1 <= HC.Game.trailerCap(dump)) { dump.cargo.push(f); dump.load += 1; continue; }
        let pile = S.lot.items.find((it) => it.kind === 'pile' && it.firewood && near(it, op, 26));
        if (!pile) { pile = { id: HC.uid(), kind: 'pile', firewood: true, x: op.x, y: op.y, a: 0, size: 0.6, content: [] }; S.lot.items.push(pile); }
        pile.content.push(f); pile.size = 0.6 + Math.sqrt(pile.content.length) * 0.28;
      }
      HC.Audio.chip();
      HC.Game.dust(op.x, op.y, '#c9a26a', 2, 50);
    },
    interact(u, S) { if (U.nearFuel(u, S)) { if (!U.refuel(u)) HC.Game.toast('Tank is full.'); return; } HC.Game.toast(HC.EQUIP.fwproc.help); },
    hint(u, S) {
      const n = (u.deck || []).length, under = U.nearDump(outPt(u), S, 30);
      return `Firewood processor: ${n ? `splitting (${n} log(s) on the deck)` : 'deck empty: load logs onto the right side with a grapple, loader or excavator'}. ${under ? `Conveyor dropping into the ${HC.TRAILERS[under.kind] ? HC.TRAILERS[under.kind].name.toLowerCase() : 'truck'} (${under.load}/${HC.Game.trailerCap(under)}).` : 'Park a dump trailer or dump truck under the conveyor, or it piles on the ground.'}`;
    },
  };
  const chips = (ch, c) => c.kind === 'brush' || (HC.baseOf(ch.kind) === 'chipper2' && c.kind === 'log'); // the 18" chipper eats logs too
  K.skid.deposit = (u, S, fp) => {
    const reach = ['excavator', 'miniex'].includes(HC.baseOf(u.kind)) ? 64 : 50;
    const sp = HC.splitterNear && HC.splitterNear(S, fp, reach - 14);
    if (sp) { // logs onto the log splitter's beam
      const room = HC.Units.KINDS.splitter.canTake(sp), logs = u.carrying.filter((c) => c.kind === 'log').slice(0, Math.max(0, room));
      if (!u.carrying.some((c) => c.kind === 'log')) { HC.Game.toast('The splitter takes logs.'); return true; }
      if (!logs.length) { HC.Game.toast('The splitter beam is full (3 logs). Let it work.'); return true; }
      sp.deck = (sp.deck || []).concat(logs); u.carrying = u.carrying.filter((c) => !logs.includes(c));
      HC.Audio.drop(); HC.Game.toast(`${logs.length} log(s) on the splitter (${sp.deck.length}/3).`);
      return true;
    }
    const fw = procNear(S, fp, reach);
    if (fw) { // logs onto the processor's deck
      const logs = u.carrying.filter((c) => c.kind === 'log');
      if (!logs.length) { HC.Game.toast('The firewood processor takes logs. Brush goes to a chipper or the grinder.'); return true; }
      fw.deck = (fw.deck || []).concat(logs);
      u.carrying = u.carrying.filter((c) => !logs.includes(c));
      HC.Audio.drop();
      HC.Game.toast(`${logs.length} log(s) on the processor deck (${fw.deck.length} waiting).`);
      return true;
    }
    const g = grinderNear(S, fp, reach);
    if (g) {
      const feed = u.carrying.filter((c) => c.kind === 'brush' || c.kind === 'log');
      if (!feed.length) { HC.Game.toast('The grinder takes brush and logs. Rock and stumps go to the dump.'); return true; }
      g.hopper = (g.hopper || []).concat(feed);
      u.carrying = u.carrying.filter((c) => !feed.includes(c));
      HC.Audio.drop();
      HC.Game.toast(`${feed.length} piece(s) into the grinder hopper (${g.hopper.length} waiting).`);
      return true;
    }
    const ch = chipperNear(S, fp, reach);
    if (!ch) return false;
    // the infeed is at ground level: the arms can be at any height
    const brush = u.carrying.filter((c) => chips(ch, c));
    if (!brush.length) { HC.Game.toast('The chipper only takes brush. Logs go in a dump trailer or the log truck.'); return true; }
    u.carrying = u.carrying.filter((c) => !chips(ch, c));
    // set it on the infeed table: the feed rollers pull it in and it shrinks away into chips
    const tab = { x: ch.x - Math.cos(ch.a) * 40, y: ch.y - Math.sin(ch.a) * 40 };
    brush.forEach((c, i) => { Object.assign(c, { x: tab.x - Math.cos(ch.a) * i * 10, y: tab.y - Math.sin(ch.a) * i * 10, z: 0, vz: 0, hp: 0, feedTo: ch.kind, a: ch.a }); S.lot.items.push(c); });
    HC.Audio.drop();
    HC.Game.float(ch.x, ch.y - 20, `Feeding ${brush.length}`, '#ffe29a');
    return true;
  };

  // ---------- stump grinder (tracked, rides the equipment trailer) ----------
  K.grinder = {
    update(u, dt, S, active) {
      if (!active) return idle(u);
      const spec = HC.EQUIP[u.kind];
      U.tank(u, dt, spec);
      u.working = false;
      if (!mouseDown()) return;
      if (!canRun(u)) return HC.Game.hintOnce('The grinder is out of fuel or worn out.');
      const fp = U.frontPt(u, spec.reachG || 16);
      const s = S.lot.stumps.find((st) => near(st, fp, st.r + 12));
      u.working = true;
      runWork(u, dt);
      if (!s) return HC.Game.dust(fp.x, fp.y, '#9a7550', 1, 30);
      s.hp += (dt / s.grind) * HC.Co.mult('grind') * U.condFactor(u.kind) * HC.Co.crew('operator', 1.15, 1) * (spec.power || 1);
      HC.Game.dust(fp.x, fp.y, HC.pick(['#d6b27c', '#8a5f39', '#9a7550']), 3, 80);
      const rock = S.lot.items.find((i) => i.kind === 'rock' && near(i, fp, 16));
      if (rock && performance.now() - lastBump > 1500) {
        lastBump = performance.now();
        U.wear(u, 6); HC.Audio.crash();
        HC.Game.toast('The wheel hit a rock: -6% condition. Pull rocks with the skid steer first.', 'warn');
      }
      if (s.hp >= 1) {
        S.lot.stumps.splice(S.lot.stumps.indexOf(s), 1);
        if (s.fromMarked) S.ground = (S.ground || 0) + 1;
        const { tx, ty } = tileAt(s.x, s.y);
        HC.Game.setTile(tx, ty, T.DIRT);
        HC.Audio.pop();
        HC.Game.float(s.x, s.y - 14, 'Stump gone', '#ffe29a');
      }
    },
    interact(u, S) { machineInteract(u, S, 'Hold left click with the wheel over a stump.'); },
    hint(u, S) {
      const fp = U.frontPt(u, HC.EQUIP[u.kind].reachG || 16), s = S.lot.stumps.find((st) => near(st, fp, st.r + 12));
      return s && !u.on ? `Hold click to grind. ${Math.min(100, Math.round(s.hp * 100))}%` : machineHint(u, S, 'Drive the cutting wheel over a stump.');
    },
  };

  // ---------- wood chips out of the chute: into the chip truck it's hitched to, a dump body under the chute, or a pile ----------
  function chipOut(ch, n, S) {
    const truck = ch.hitch && S.units[ch.hitch];
    const chute = { x: ch.x + Math.cos(ch.a) * 34, y: ch.y + Math.sin(ch.a) * 34 };
    let box = truck && HC.EQUIP[HC.baseOf(truck.kind)].chipBox ? S.trailers.find((t) => t.hitch === truck.kind && t.kind === 'bed') : null;
    if (!box) box = U.nearDump(chute, S, 40);
    for (let i = 0; i < n; i++) {
      const c = { id: HC.uid(), kind: 'chips', x: chute.x, y: chute.y, a: 0, size: 1, value: 0 };
      if (box && box.load + 1 <= HC.Game.trailerCap(box)) { box.cargo.push(c); box.load += 1; continue; }
      if (box && !ch.fullWarned) { ch.fullWarned = true; HC.Game.toast('The chip box is full. Chips are piling on the ground: dump it (X in the truck) or sell it at the landscape supply.', 'warn'); }
      const at = { x: ch.x + Math.cos(ch.a) * 60, y: ch.y + Math.sin(ch.a) * 60 };
      let pile = S.lot.items.find((it) => it.kind === 'pile' && it.chips && near(it, at, 30));
      if (!pile) { pile = { id: HC.uid(), kind: 'pile', chips: true, x: at.x, y: at.y, a: 0, size: 0.6, content: [] }; S.lot.items.push(pile); }
      pile.content.push(c); pile.size = 0.6 + Math.sqrt(pile.content.length) * 0.28;
    }
    if (box && box.load < HC.Game.trailerCap(box)) ch.fullWarned = false;
  }
  // the visible stream: chips arc out of the discharge chute into the chip box (or onto the pile)
  const CHIP_COLS = ['#c9a26a', '#d6b27c', '#b8915c', '#e0c08a'];
  function chipSpray(ch, S, n) {
    const truck = ch.hitch && S.units[ch.hitch];
    const big = HC.baseOf(ch.kind) === 'chipper2', top = (big ? 3.0 : 2.4) * 10.67;
    const sx = ch.x + Math.cos(ch.a) * 10, sy = ch.y + Math.sin(ch.a) * 10;
    let tx, ty, tz;
    if (truck && HC.EQUIP[HC.baseOf(truck.kind)].chipBox) { const bk = HC.baseOf(truck.kind) === 'chiptruck2' ? 42 : 30; tx = truck.x - Math.cos(truck.a) * bk; ty = truck.y - Math.sin(truck.a) * bk; tz = 24; } // in through the open back
    else { tx = ch.x + Math.cos(ch.a) * 60; ty = ch.y + Math.sin(ch.a) * 60; tz = 2; }
    HC.Game.spray(sx, sy, top, tx, ty, tz, CHIP_COLS, n);
  }
  // ---------- tow-behind chippers: a crew member feeds them ----------
  function chipperKind(power, takesLogs) {
    const K2 = {
      crewNear(u, S) { return Object.keys(S.units).some((k) => ['op', 'land', 'saw'].includes(HC.baseOf(k)) && !S.units[k].hidden && near(S.units[k], u, 120)); },
      infeed(u) { return { x: u.x - Math.cos(u.a) * 30, y: u.y - Math.sin(u.a) * 30 }; },
      feedable(i) { return i.kind === 'brush' || (takesLogs && i.kind === 'log'); },
      update(u, dt, S, active) {
        u.working = false; u.feed = null;
        // pieces a machine dropped on the infeed get pulled through on their own
        const queued = S.lot.items.filter((i) => i.feedTo === u.kind);
        if (queued.length && canRun(u)) {
          const inf = K2.infeed(u), it = queued.sort((a2, b2) => HC.dist(a2.x, a2.y, inf.x, inf.y) - HC.dist(b2.x, b2.y, inf.x, inf.y))[0];
          u.working = true; runWork(u, dt);
          it.hp = (it.hp || 0) + (dt / (it.kind === 'log' ? 2.2 : 1.4)) * power;
          it.x += (inf.x - it.x) * Math.min(1, dt * 2.5); it.y += (inf.y - it.y) * Math.min(1, dt * 2.5); it.a = u.a;
          chipSpray(u, S, 2);
          if (it.hp >= 1) { S.lot.items.splice(S.lot.items.indexOf(it), 1); S.chipped = (S.chipped || 0) + 1; HC.Audio.chip(); chipOut(u, it.kind === 'log' ? 2 : 1, S); }
          if (!active || !mouseDown()) return;
        }
        if (!active || !mouseDown()) return;
        if (!canRun(u)) return HC.Game.hintOnce('The chipper is out of fuel or worn out.');
        if (!K2.crewNear(u, S)) return HC.Game.hintOnce('Somebody has to feed it. Climb out (F) and stand by it, or bring the landscaping crew.');
        const inf = K2.infeed(u);
        const it = S.lot.items.find((i) => K2.feedable(i) && near(i, inf, 80));
        if (!it) return HC.Game.hintOnce('Nothing within reach of the infeed. Park closer or bring material with a machine.');
        u.working = true; u.feed = it;
        runWork(u, dt);
        it.hp = (it.hp || 0) + (dt / (it.kind === 'log' ? 2.2 : 1.4)) * power * HC.Co.crew('ground', 2, 1);
        it.x += (inf.x - it.x) * dt * 1.5; it.y += (inf.y - it.y) * dt * 1.5; it.a = u.a;
        chipSpray(u, S, 2);
        if (it.hp >= 1) { S.lot.items.splice(S.lot.items.indexOf(it), 1); S.chipped = (S.chipped || 0) + 1; HC.Audio.chip(); chipOut(u, it.kind === 'log' ? 2 : 1, S); }
      },
      interact(u, S) {
        if (U.nearFuel(u, S)) { if (!U.refuel(u)) HC.Game.toast('Tank is full.'); return; }
        HC.Game.toast('Hold left click to feed. Hitch it to a truck with R to move it.');
      },
      hint(u, S) {
        const tk = u.hitch && S.units[u.hitch], box = tk && S.trailers.find((t) => t.hitch === tk.kind && t.kind === 'bed');
        const out = tk && HC.EQUIP[HC.baseOf(tk.kind)].chipBox && box ? ` Chips blow into the chip truck (${box.load}/${HC.Game.trailerCap(box)}).` : ' Chips land on a pile (or in a dump body under the chute).';
        if (u.hitch && !K2.crewNear(u, S)) return 'Hitched to a truck. Climb out and stand by it to feed it, or drive the truck to move it.' + out;
        if (!K2.crewNear(u, S)) return 'Climb out (F) and stand by it to feed it.';
        const inf = K2.infeed(u), n = S.lot.items.filter((i) => K2.feedable(i) && near(i, inf, 80)).length;
        return (n ? `Hold click to feed (${n} in reach).` : 'Nothing near the infeed. Machines can drop brush straight in.') + out;
      },
    };
    return K2;
  }
  K.chipper = chipperKind(1, false);
  K.chipper2 = chipperKind(2, true);

  // ---------- trucks ----------
  // the sawmill log yard or the county dump
  const atPad = (u, S) => !!HC.Game.padAt(u.x, u.y);
  const atQuarry = (u, S) => S.lot.quarry && HC.inRect(u.x, u.y, S.lot.quarry.pad);
  const atSupply = (u, S) => HC.world.supply && HC.inRect(u.x, u.y, HC.world.supply.pad);
  const atStand = (u, S) => HC.world.fwStand && HC.inRect(u.x, u.y, HC.world.fwStand.pad);
  const standOwned = () => !!(HC.world.yards.find((y) => y.id === 'firewood') || {}).owned;
  const attached = (S, kind) => S.trailers.filter((t) => t.hitch === kind);
  // ---------- fuel truck: hose from its own supply into another unit ----------
  const supplyOf = (kind) => { const C = HC.company; C.supply = C.supply || {}; if (C.supply[kind] === undefined) C.supply[kind] = HC.EQUIP[HC.baseOf(kind)].supply; return C.supply[kind]; };
  const hoseTarget = (u, S) => Object.values(S.units).filter((o) => o !== u && !o.hidden && !o.boarded && !o.on && HC.EQUIP[o.kind].fuelCap && HC.EQUIP[o.kind].move !== 'walk' && near(o, u, 95) && o.fuel < U.fuelCap(o.kind) - 1)
    .sort((a, b) => HC.dist(a.x, a.y, u.x, u.y) - HC.dist(b.x, b.y, u.x, u.y))[0];
  function hoseUpdate(u, dt, S, kind) {
    const h = S.hose;
    if (!h || h.from !== kind) return;
    const o = S.units[h.to];
    if (!o || HC.dist(o.x, o.y, u.x, u.y) > 130 || Math.abs(u.v) > 8) { S.hose = null; return HC.Game.toast('The hose pulled loose. Park and press E again.', 'warn'); }
    const need = U.fuelCap(o.kind) - o.fuel, have = supplyOf(kind), give = Math.min(need, have, 90 * dt);
    o.fuel += give; HC.company.supply[kind] = have - give;
    h.t = (h.t || 0) + dt;
    if (need - give < 0.5) { S.hose = null; HC.Audio.fuel(); HC.Game.toast(`Filled the ${HC.EQUIP[HC.baseOf(o.kind)].short.toLowerCase()}. Truck supply: ${Math.round(HC.company.supply[kind])}.`); }
    else if (HC.company.supply[kind] < 0.5) { S.hose = null; HC.Game.toast('The fuel truck is empty. Refill it at a pump at one of your yards.', 'warn'); }
  }
  // ---------- tractor + bush hog: a 7 ft swath behind the tractor ----------
  function bushHog(u, dt, S, active) {
    u.working = false;
    const bh = (S.attachments || []).find((a) => a.on === u.kind && a.kind === 'bushhog');
    if (!bh || !active || !mouseDown() || !canRun(u)) return;
    if (u.armT > 0.35) return HC.Game.hintOnce('Lower the bush hog (hold G) before you engage the PTO.');
    u.working = true;
    runWork(u, dt);
    U.burn(u, 0.25 * dt);
    const p = { x: u.x - Math.cos(u.a) * 38, y: u.y - Math.sin(u.a) * 38 }, R = 13, rate = U.condFactor(u.kind) * dt * 1.4;
    let bog = false;
    for (const b of S.lot.bushes.slice()) if (near(b, p, R + b.r)) {
      if (b.r > 13) { bog = true; continue; } // a heavy thicket: the rotary cutter just rides up on it
      b.hp += rate / 1.6;
      if (b.hp >= 1) { S.lot.bushes.splice(S.lot.bushes.indexOf(b), 1); HC.Audio.chip(); }
    }
    for (const t of S.lot.trees) {
      if (t.state === 'gone' || !near(t, p, R + 6)) continue;
      if (t.type === 'sapling' && (t.s || 1) > 1.0) { bog = true; continue; } // too thick for the blades
      if (t.type === 'sapling') { t.cut += rate / 0.7; if (t.cut >= 1) { t.state = 'gone'; HC.Audio.chip(); if (!t.marked) HC.Game.penalty('wrong', t.x, t.y); } }
      else if (t.state === 'standing' && near(t, p, t.trunkR + 10) && !t.damaged) { t.damaged = true; if (!t.marked) HC.Game.penalty('tree', t.x, t.y); }
    }
    setGround(S, p.x, p.y, R, [T.TALL], T.MOWED);
    if (Math.random() < dt * 8) HC.Game.dust(p.x + HC.rand(-R, R), p.y + HC.rand(-R, R), HC.pick(['#7fa443', '#93b552', '#6a8f36']), 2, 50);
  }
  function truckKind(kind) {
    const spec = HC.EQUIP[kind];
    return {
      update(u, dt, S, active) {
        if (active) U.car(u, dt, spec); else idle(u);
        u.craneT = Math.max(0, (u.craneT || 0) - dt);
        if (HC.EQUIP[HC.baseOf(kind)].pto) {
          U.boom(u, dt, active, 0.8); bushHog(u, dt, S, active);
          if (u.carrying.length) { const f = U.frontPt(u, 36); u.carrying.forEach((c, i) => { c.x = f.x + ((i % 2) - 0.5) * 6; c.y = f.y; c.a = u.a + Math.PI / 2; }); }
        }
        if (spec.supply || HC.EQUIP[HC.baseOf(kind)].supply) hoseUpdate(u, dt, S, kind);
      },
      interact(u, S) {
        if (HC.EQUIP[HC.baseOf(kind)].rides && !(u.carrying && u.carrying.length) && U.strapToggle(u, S)) return; // tractor on a trailer deck
        if (HC.EQUIP[HC.baseOf(kind)].cap && K.loader.act(u, S)) return; // tractor front-end loader
        if (HC.EQUIP[HC.baseOf(kind)].supply) {
          if (S.hose && S.hose.from === kind) { S.hose = null; return HC.Game.toast('Hose reeled in.'); }
          const pumpNear = S.lot.pumps.find((p) => near(p, u, 76) && HC.World.yardAt(p.x, p.y));
          if (pumpNear) {
            const cap = HC.EQUIP[HC.baseOf(kind)].supply, need = cap - supplyOf(kind);
            const own = U.refuel(u, true);
            if (need < 1 && !own) return HC.Game.toast('Truck and supply tank are full.');
            HC.company.money -= need * HC.FUEL_PRICE; if (S.job) S.costs.fuel += need * HC.FUEL_PRICE;
            HC.company.supply[kind] = cap; HC.Audio.fuel();
            return HC.Game.toast(`Filled the supply tank (${HC.money(need * HC.FUEL_PRICE)}). ${Math.round(cap)} units aboard.`);
          }
          const o = hoseTarget(u, S);
          if (o) {
            if (Math.abs(u.v) > 5) return HC.Game.toast('Stop the truck before running the hose.');
            if (supplyOf(kind) < 1) return HC.Game.toast('The fuel truck is empty. Refill it at a pump at one of your yards.', 'warn');
            S.hose = { from: kind, to: o.kind, t: 0 }; HC.Audio.pick();
            return HC.Game.toast(`Running the hose to the ${HC.EQUIP[HC.baseOf(o.kind)].short.toLowerCase()}...`);
          }
        }
        const loads = attached(S, kind).filter((t) => U.isDump(t) && t.load);
        if (loads.length && atQuarry(u, S)) return HC.Game.sellRocks(loads);
        if (loads.length && atStand(u, S) || (loads.length && loads.some((t) => atStand(t, S)))) { if (!standOwned()) return HC.Game.toast('This is the Firewood Yard. Buy it in the shop (Yards) to run the firewood stand.'); return HC.Game.stockStand(loads); }
        if (loads.length && atSupply(u, S)) return HC.Game.sellMulch(loads);
        if (loads.length && (atPad(u, S) || loads.some((t) => atPad(t, S)))) { const pad = HC.Game.padAt(u.x, u.y) || loads.map((t) => HC.Game.padAt(t.x, t.y)).find(Boolean); return loads.forEach((t) => HC.Game.haul(t, pad)); }
        if (spec.logsOnly) { // knuckleboom crane swings a log aboard
          const bed = attached(S, kind).find((t) => t.kind === 'logbed');
          const log = S.lot.items.filter((i) => i.kind === 'log' && near(i, u, 110)).sort((a, b) => HC.dist(a.x, a.y, u.x, u.y) - HC.dist(b.x, b.y, u.x, u.y))[0];
          if (log) {
            if (Math.abs(u.v) > 5) return HC.Game.toast('Park the truck before swinging the crane.');
            if (bed.load + 1 > spec.bed) return HC.Game.toast(`Log bunks are full (${bed.load}/${spec.bed}). Take them to the sawmill.`, 'warn');
            S.lot.items.splice(S.lot.items.indexOf(log), 1);
            bed.cargo.push(log); bed.load += 1; u.craneT = 0.8; u.craneTo = { x: log.x, y: log.y };
            S.time += 1.5; if (S.stage === 'onsite') S.workMins += 1.5;
            HC.Audio.pick();
            return;
          }
        }
        const pump = S.lot.pumps.find((p) => near(p, u, 76));
        if (pump) {
          if (!HC.World.yardAt(pump.x, pump.y)) return HC.Game.toast(`You don't own ${HC.World.yardAt(pump.x, pump.y, false).name}. Buy it from the shop (J).`);
          if (!U.refuel(u)) HC.Game.toast('Tank is full.');
          return;
        }
        const riders = Object.values(S.units).filter((o) => o.boarded === kind);
        if (riders.length) return HC.Game.toast(`Riding: ${riders.map((r) => HC.EQUIP[r.kind].name).join(', ')}. Press their number key to let them out.`);
        HC.Game.toast(spec.logsOnly ? 'Park within reach of logs and press E to crane them aboard.' : spec.tows ? 'R hitches a trailer. E unloads at the sawmill (logs) or the county dump.' : spec.help);
      },
      mode(u, S) { if (HC.EQUIP[HC.baseOf(kind)].pto) HC.Game.attachToggle(u, S); },
      hint(u, S) {
        if (HC.EQUIP[HC.baseOf(kind)].rides) {
          if (u.on) return 'Strapped to the trailer. E: take the straps off.';
          if (S.trailers.some((t) => U.onDeck(t, u))) return 'On the trailer deck. Stop and press E to strap it down.';
          if (U.behindRamps(u, S)) return 'Ramps are down. Drive straight up onto the deck, stop, and press E to strap it down.';
        }
        if (HC.EQUIP[HC.baseOf(kind)].pto) {
          const fel = K.loader.hintCore(u, S);
          if (fel) return fel;
          const bh = (S.attachments || []).find((a) => a.on === kind);
          if (bh) { if (!u.working) return u.armT > 0.35 ? 'Bush hog is up. Hold G to lower it, then hold left click to cut. Q unhooks it.' : 'Bush hog down: hold left click to cut while you drive. T lifts it for the road. ' + (HC.Game.jobHint ? HC.Game.jobHint(u, S) : ''); }
          else if (HC.Game.attachmentNear(u, S)) return 'Q: hook up the bush hog';
          else if ((S.attachments || []).some((a) => a.kind === 'bushhog' && !a.on && HC.dist(a.x, a.y, u.x, u.y) < 140)) return 'Back up square to the bush hog (S reverses), then press Q.';
        }
        if (HC.EQUIP[HC.baseOf(kind)].supply) {
          const sup = Math.round(supplyOf(kind));
          if (S.hose && S.hose.from === kind) { const o = S.units[S.hose.to]; return `Fueling the ${HC.EQUIP[HC.baseOf(o.kind)].short.toLowerCase()}: ${Math.round((o.fuel / U.fuelCap(o.kind)) * 100)}%. Supply ${sup}. E reels the hose in.`; }
          const pumpNear = S.lot.pumps.find((p) => near(p, u, 76) && HC.World.yardAt(p.x, p.y));
          if (pumpNear && sup < HC.EQUIP[HC.baseOf(kind)].supply - 1) return `E: fill the supply tank (${sup}/${HC.EQUIP[HC.baseOf(kind)].supply})`;
          const o = hoseTarget(u, S);
          if (o) return `E: run the hose to the ${HC.EQUIP[HC.baseOf(o.kind)].short.toLowerCase()} (${Math.round((o.fuel / U.fuelCap(o.kind)) * 100)}% fuel). Supply ${sup}.`;
        }
        const att = attached(S, kind);
        const loads = att.filter((t) => U.isDump(t) && t.load);
        if (loads.length && (atStand(u, S) || loads.some((t) => atStand(t, S)))) {
          const f = loads.reduce((a2, t) => a2 + t.cargo.filter((c) => c.kind === 'firewood').length, 0), st = HC.company.stand || { stock: 0 };
          return !standOwned() ? 'The Firewood Yard is for sale: buy it to run the stand.' : f ? `E: stock the firewood stand with ${Math.min(f, HC.STAND_CAP - st.stock)} unit(s) (stand ${st.stock}/${HC.STAND_CAP})` : 'The stand takes firewood.';
        }
        if (loads.length && atSupply(u, S)) {
          const m = loads.reduce((a2, t) => a2 + t.cargo.filter((c) => c.kind === 'mulch').length, 0), ch = loads.reduce((a2, t) => a2 + t.cargo.filter((c) => c.kind === 'chips').length, 0), fw = loads.reduce((a2, t) => a2 + t.cargo.filter((c) => c.kind === 'firewood').length, 0);
          return m + ch + fw ? `E: sell ${[m ? m + ' mulch' : '', ch ? ch + ' wood chips' : '', fw ? fw + ' firewood' : ''].filter(Boolean).join(', ')} (${HC.money(m * HC.MULCH_PRICE + ch * HC.CHIP_PRICE + fw * HC.FIREWOOD_SUPPLY)})` : 'The landscape supply buys mulch, wood chips and firewood.';
        }
        if (loads.length && atQuarry(u, S)) return HC.world.quarry.owned ? 'E: sell the rocks at your quarry' : `This is ${HC.world.quarry.name}. Buy it in the shop to sell rocks here.`;
        if (loads.length && (atPad(u, S) || loads.some((t) => atPad(t, S)))) { const pad = HC.Game.padAt(u.x, u.y) || loads.map((t) => HC.Game.padAt(t.x, t.y)).find(Boolean); return pad.type === 'mill' ? 'E: sell the logs to the sawmill (anything else stays aboard)' : `E: unload ${loads.reduce((a, t) => a + t.load, 0)} units at the county dump (fees; logs pay only at the sawmill)`; }
        if (spec.logsOnly) {
          const bed = att.find((t) => t.kind === 'logbed');
          const n = S.lot.items.filter((i) => i.kind === 'log' && near(i, u, 110)).length;
          if (n) return `E: crane a log aboard (${n} in reach). Bunks ${bed.load}/${spec.bed}.`;
        }
        if (kind === 'bucket') {
          const t = HC.Game.bucketTree && S.lot.trees.find((tr) => tr.state === 'standing' && near(tr, u, 130));
          if (t && Math.abs(u.v) < 5) return 'Bucket is up beside the tree: felling spread is cut by 75%. Switch to the saw crew.';
        }
        const pump = S.lot.pumps.find((p) => near(p, u, 76));
        if (pump && HC.World.yardAt(pump.x, pump.y) && u.fuel < U.fuelCap(kind) - 1) return 'E: fill up at the pump';
        const t = att.find((tr) => !U.isBed(tr));
        if (!t && spec.tows) {
          const hp = U.hitchPt(u);
          const c = S.trailers.filter((tr) => !tr.hitch && !U.isBed(tr) && !(HC.EQUIP[tr.kind] && HC.EQUIP[HC.baseOf(tr.kind)].fixed)).map((tr) => { const h = U.hitchPt(u, tr); return { tr, d: HC.dist(U.coupler(tr).x, U.coupler(tr).y, h.x, h.y) }; }).sort((a, b) => a.d - b.d)[0];
          if (c && c.d < 34) return `R: hitch the ${HC.TRAILERS[c.tr.kind].name.toLowerCase()}`;
          if (c && c.d < 140) return `Back up to the ${HC.TRAILERS[c.tr.kind].name.toLowerCase()}: S reverses. R hitches when the ball is under the coupler.`;
        }
        const bits = [];
        const bed = att.find((tr) => U.isBed(tr));
        if (bed) bits.push(`${HC.EQUIP[HC.baseOf(kind)].chipBox ? 'Chip box' : HC.TRAILERS[bed.kind].name} ${bed.load}/${HC.Game.trailerCap(bed)}.`);
        if (att.some((tr) => ['dump', 'dump2', 'dump18', 'gndump', 'bed'].includes(tr.kind) && tr.cargo.length)) bits.push('X dumps the load here.');
        if (t) {
          const on = Object.values(S.units).filter((o) => o.on && o.on.id === t.id).map((o) => HC.EQUIP[o.kind].short).join(', ');
          bits.push(`Towing the ${HC.TRAILERS[t.kind].name.toLowerCase()}${U.isDump(t) ? ` (${t.load}/${HC.Game.trailerCap(t)})` : HC.TRAILERS[t.kind].deck ? ` (${on || 'empty'}${HC.TRAILERS[t.kind].payload ? ` · ${HC.deckLoad(S, t)}/${HC.TRAILERS[t.kind].payload} t` : ''})` : ''}. R drops it.`);
        } else if (spec.tows) bits.push('No trailer.');
        const riders = Object.values(S.units).filter((o) => o.boarded === kind).map((o) => HC.EQUIP[o.kind].short);
        if (riders.length) bits.push(`Riding: ${riders.join(', ')}.`);
        bits.push(HC.Game.jobHint ? HC.Game.jobHint(u, S) : '');
        return bits.join(' ');
      },
    };
  }
  for (const k in HC.EQUIP) if (HC.EQUIP[k].move === 'car') K[k] = truckKind(k);
  HC.Units.factories = { truck: truckKind };
  K.miniskid = K.skid; // the mini track loader runs the skid steer's grapple logic with its own size and capacity
  K.skidXL = K.skid; // so does the big track loader
  K.grinderXL = K.grinder;
  for (const k in HC.EQUIP) if (!K[k] && HC.EQUIP[k].base && K[HC.EQUIP[k].base] && !HC.EQUIP[k].noUnit) K[k] = K[HC.EQUIP[k].base]; // any other shop variant runs its base machine's logic

  // ---------- wheel loader: big bucket, scoops many pieces of a pile at once ----------
  const loaderSpec = (u) => HC.EQUIP[HC.baseOf(u.kind)];
  // a pile counts as in reach when the bucket gets to its edge, not its middle (a big push pile is several metres across)
  const scoopable = (u, S, fp) => S.lot.items.filter((i) => !(i.z > 0.2) && HC.dist(i.x, i.y, fp.x, fp.y) < 50 + pileR(i))
    .sort((a, b) => HC.dist(a.x, a.y, fp.x, fp.y) - pileR(a) - (HC.dist(b.x, b.y, fp.x, fp.y) - pileR(b)));
  K.loader = {
    update(u, dt, S, active) {
      U.boom(u, dt, active, 0.4);
      if (active) U.tank(u, dt, loaderSpec(u), (1 - u.carrying.length * 0.015) * (u.armT > 0.6 ? 0.6 : 1)); else idle(u);
      if (u.carrying.length) { const f = U.frontPt(u, 30); u.carrying.forEach((c, i) => { c.x = f.x + ((i % 3) - 1) * 6; c.y = f.y; c.a = u.a + Math.PI / 2; }); }
    },
    interact(u, S) {
      if (!u.carrying.length && U.strapToggle(u, S)) return;
      if (K.loader.act(u, S)) return;
      HC.Game.toast(loaderSpec(u).help);
    },
    act(u, S) {
      const fp = U.frontPt(u, 34), cap = loaderSpec(u).cap;
      if (u.carrying.length && K.skid.deposit(u, S, fp)) return true;
      const dump = U.nearDump(fp, S, 34);
      if (u.carrying.length && dump) {
        if (u.armT < 0.6) { HC.Game.toast('Raise the bucket (hold T) so it clears the side, then press E.', 'warn'); return true; }
        HC.Game.loadTrailer(u, dump); return true;
      }
      const list = scoopable(u, S, fp);
      if (list.length && u.carrying.length < cap) {
        if (u.armT > 0.3) { HC.Game.toast('Lower the bucket to the ground (hold G), then press E.', 'warn'); return true; }
        let n = 0;
        for (const it of list) { while (u.carrying.length < cap && S.lot.items.includes(it)) { u.carrying.push(HC.Game.takeItem(it)); n++; } if (u.carrying.length >= cap) break; }
        HC.Audio.pick(); S.time += 0.5;
        HC.Game.toast(`Scooped ${n} piece(s): bucket ${u.carrying.length}/${cap}.`); return true;
      }
      if (u.carrying.length) { HC.Game.dropItems(u, fp); u.carrying = []; HC.Game.toast('Dumped the bucket on the ground.'); return true; }
      return false;
    },
    hint(u, S) { return K.loader.hintCore(u, S) || 'Wheel loader: G lowers the bucket, T raises it. E scoops debris and push piles. ' + (HC.Game.jobHint ? HC.Game.jobHint(u, S) : ''); },
    hintCore(u, S) {
      const fp = U.frontPt(u, 34), cap = loaderSpec(u).cap;
      if (u.carrying.length && U.nearDump(fp, S, 34)) return u.armT < 0.6 ? 'Hold T to raise the bucket over the side, then E to dump.' : `E: dump ${u.carrying.length} piece(s) into the load`;
      const n = scoopable(u, S, fp).reduce((a, i) => a + (i.kind === 'pile' ? i.content.length : 1), 0);
      if (n && u.carrying.length < cap) return u.armT > 0.3 ? 'Hold G to lower the bucket, then E to scoop.' : `E: scoop (${n} piece(s) in front, bucket ${u.carrying.length}/${cap})`;
      if (u.carrying.length) return `Bucket ${u.carrying.length}/${cap}. Raise it (T) beside a dump truck or trailer and press E.`;
      return null;
    },
  };

  // ---------- excavator: long reach, thumb, rips stumps ----------
  // a point out along the boom, which swings with the house rather than the tracks
  const armPt = (u, d) => { const a = u.a + (u.swing || 0); return { x: u.x + Math.cos(a) * d, y: u.y + Math.sin(a) * d }; };
  function diggerKind(kind) {
    const spec = () => HC.EQUIP[kind];
    const fp = (u) => armPt(u, spec().reach);
    return {
      cap: () => spec().cap,
      update(u, dt, S, active) {
        if (!active) return idle(u);
        // the upper works slew toward the mouse, independent of the tracks (the bucket works where it points)
        const m = HC.input.mouse;
        if (m && HC.dist(m.wx, m.wy, u.x, u.y) > u.r) {
          const want = HC.angDiff(u.a, Math.atan2(m.wy - u.y, m.wx - u.x)), rate = (spec().mass < 6 ? 2.4 : 1.9) * dt;
          const d = HC.angDiff(u.swing || 0, want);
          u.swing = (u.swing || 0) + HC.clamp(d, -rate, rate);
          if (Math.abs(d) > 0.02) u.slewing = true; else u.slewing = false;
        }
        U.boom(u, dt, true, 0.95);
        U.tank(u, dt, spec(), u.armT > 0.7 ? 0.85 : 1);
        u.working = false;
        if (!mouseDown() || u.on) return;
        if (!canRun(u)) return HC.Game.hintOnce(`The ${spec().short.toLowerCase()} is out of fuel or worn out.`);
        const p = fp(u);
        const s = S.lot.stumps.find((st) => near(st, p, st.r + spec().reach * 0.45));
        if (!s) return HC.Game.hintOnce('Swing the bucket over a stump to rip it out. E picks up logs, brush and rocks.');
        if (u.armT > 0.35) return HC.Game.hintOnce('Lower the boom to dig in (hold G).');
        u.working = true; runWork(u, dt);
        s.hp += (dt / ((0.65 + s.grind * 0.14) * (spec().mass < 6 ? 1.7 : 1))) * U.condFactor(kind);
        HC.Game.dust(s.x, s.y, HC.pick(['#8a6a48', '#6b4b30', '#9a7550']), 2, 60);
        if (s.hp >= 1) {
          S.lot.stumps.splice(S.lot.stumps.indexOf(s), 1);
          if (s.fromMarked) S.ground = (S.ground || 0) + 1;
          S.lot.items.push({ id: HC.uid(), kind: 'stump', x: s.x + HC.rand(-10, 10), y: s.y + HC.rand(-10, 10), a: HC.rand(0, 6), size: HC.clamp(s.r / 14, 0.7, 1.4), value: 0, parcel: s.parcel, type: s.type, z: 0.5, vz: 0 });
          const { tx, ty } = tileAt(s.x, s.y);
          HC.Game.setTile(tx, ty, T.DIRT);
          HC.Audio.thud(0.6);
          HC.Game.float(s.x, s.y - 14, 'Stump pulled', '#ffe29a');
        }
      },
      interact(u, S) {
        if (U.strapToggle(u, S)) return;
        const p = fp(u);
        if (u.carrying.length && K.skid.deposit(u, S, p)) return; // chipper: any boom height
        const dump = U.nearDump(p, S, spec().reach + 16);
        if (u.carrying.length && dump) {
          if (u.armT < 0.6) return HC.Game.toast('Raise the boom (hold T) to swing the load over the side, then press E.', 'warn');
          return HC.Game.loadTrailer(u, dump);
        }
        if (u.carrying.length < spec().cap && u.armT > 0.35 && S.lot.items.some((i) => HC.dist(i.x, i.y, p.x, p.y) < spec().reach * 0.9 + pileR(i))) return HC.Game.toast('Lower the boom to the ground (hold G) to grab it.', 'warn');
        const it = u.carrying.length < spec().cap ? S.lot.items.filter((i) => HC.dist(i.x, i.y, p.x, p.y) < spec().reach * 0.9 + pileR(i)).sort((a2, b2) => HC.dist(a2.x, a2.y, p.x, p.y) - HC.dist(b2.x, b2.y, p.x, p.y))[0] : null;
        if (it) { u.carrying.push(HC.Game.takeItem(it)); HC.Audio.pick(); return; }
        if (u.carrying.length) { HC.Game.dropItems(u, p); return; }
        if (U.nearFuel(u, S)) { if (!U.refuel(u)) HC.Game.toast('Tank is full.'); return; }
        HC.Game.toast('Nothing within reach of the bucket.');
      },
      hint(u, S) {
        if (u.on) return 'Chained down on the trailer. E: release it.';
        if (S.trailers.some((t) => U.onDeck(t, u))) return 'On the deck. Stop and press E to chain it down.';
        if (U.behindRamps(u, S)) return 'Ramps are down. Drive straight up onto the deck, stop, and press E.';
        const p = fp(u);
        if (u.carrying.length && U.nearDump(p, S, spec().reach + 16)) return u.armT < 0.6 ? 'Hold T to raise the boom over the side, then E to drop the load.' : `E: drop ${u.carrying.length} item(s) in the load`;
        if (u.carrying.length) return `Thumb holding ${u.carrying.map((c) => c.kind).join(', ')}. Swing over a dump trailer, truck bed, log trailer or chipper and press E.`;
        const st = S.lot.stumps.find((x) => near(x, p, x.r + spec().reach * 0.45));
        if (st) return `Hold click to rip the stump out. ${Math.min(100, Math.round(st.hp * 100))}%`;
        return machineHint(u, S, `Point with the mouse to swing the boom. E grabs up to ${spec().cap} pieces within reach. Hold click over a stump to pull it.`);
      },
    };
  }
  HC.Units.factories.digger = diggerKind;
  K.excavator = diggerKind('excavator');
  K.miniex = diggerKind('miniex');
  // carried pieces hang from the bucket out front
  const baseUpdate = HC.Units.update;
  HC.Units.update = function (u, dt, S, active) {
    baseUpdate(u, dt, S, active);
    if (['excavator', 'miniex'].includes(HC.baseOf(u.kind)) && u.carrying.length) {
      const a = u.a + (u.swing || 0), p = { x: u.x + Math.cos(a) * (HC.EQUIP[u.kind].reach - 4), y: u.y + Math.sin(a) * (HC.EQUIP[u.kind].reach - 4) };
      u.carrying.forEach((c, i) => { c.x = p.x; c.y = p.y - i * 4; c.a = a + Math.PI / 2; });
    }
    if (['forwarder', 'logtruck'].includes(HC.baseOf(u.kind))) u.craneT = Math.max(0, (u.craneT || 0) - dt);
  };

  // ---------- bulldozers: everything in the blade's path goes into one push pile ----------
  function dozerKind(kind) {
    const spec = () => HC.EQUIP[kind];
    return {
      update(u, dt, S, active) {
        const pile = u.pileId && S.lot.items.find((i) => i.id === u.pileId);
        const n = pile ? pile.content.length : 0;
        if (!active) return idle(u);
        U.tank(u, dt, spec(), 1 - Math.min(0.55, n * 0.012 * (8 / spec().mass) * 2));
        u.working = mouseDown() && canRun(u) && !u.on;
        u.pushLoad = n;
        if (u.on) return;
        if (u.v < -2 && pile) { u.pileId = null; HC.Game.toast(`Backed off a push pile of ${n} pieces. Load it with a grapple.`); }
        if (u.v <= 0.5) return;
        const half = spec().blade / 2, reach = u.r + 4;
        const bx = u.x + Math.cos(u.a) * reach, by = u.y + Math.sin(u.a) * reach;
        const c = Math.cos(u.a), sn = Math.sin(u.a);
        const local = (o) => { const dx = o.x - bx, dy = o.y - by; return { along: dx * c + dy * sn, side: -dx * sn + dy * c }; };
        const inBlade = (o, extra = 0) => { const l = local(o); return l.along > -10 && l.along < 12 + extra && Math.abs(l.side) < half + extra; };
        const absorb = [];
        // loose debris and other piles
        for (const it of S.lot.items) if (it !== pile && inBlade(it, 6)) absorb.push(it);
        // brush grubbed out by the roots
        for (const bu of S.lot.bushes.slice()) if (inBlade(bu, bu.r)) {
          S.lot.bushes.splice(S.lot.bushes.indexOf(bu), 1);
          absorb.push({ id: HC.uid(), kind: 'brush', x: bu.x, y: bu.y, a: 0, size: bu.r / 14, value: 0, seed: bu.seed, parcel: bu.parcel });
        }
        // stumps ripped out
        for (const st of S.lot.stumps.slice()) if (inBlade(st, st.r)) {
          S.lot.stumps.splice(S.lot.stumps.indexOf(st), 1);
          if (st.fromMarked) S.ground = (S.ground || 0) + 1;
          absorb.push({ id: HC.uid(), kind: 'stump', x: st.x, y: st.y, a: 0, size: HC.clamp(st.r / 14, 0.7, 1.4), value: 0, parcel: st.parcel, type: st.type });
          const { tx, ty } = tileAt(st.x, st.y); HC.Game.setTile(tx, ty, T.DIRT);
        }
        // downed trees get rolled up: logs and limbs into the pile
        for (const t of S.lot.trees) {
          if (t.state !== 'felled' || Math.abs(t.x - bx) > t.len + 40 || Math.abs(t.y - by) > t.len + 40) continue;
          const ex = t.x + Math.cos(t.fallA) * t.len * 0.8, ey = t.y + Math.sin(t.fallA) * t.len * 0.8;
          if (HC.segPointDist(t.x, t.y, ex, ey, bx, by) > half) continue;
          const before = S.lot.items.length;
          HC.Game.buck(t, true);
          absorb.push(...S.lot.items.slice(before));
        }
        // standing trees: the blade leans on the trunk until it goes over (big trees take longer, more so for the D3)
        for (const t of S.lot.trees) {
          if (t.state !== 'standing' || Math.abs(t.x - bx) > 50 || Math.abs(t.y - by) > 50 || !inBlade(t, t.trunkR + 4)) continue;
          const d = HC.TREES[t.type], toughness = (d.cut * t.s) / (spec().mass / 8);
          t.pushHp = (t.pushHp || 0) + dt / ((0.4 + toughness * 0.35) * (spec().pushSlow || 1)); // a track loader leans on a tree far longer than a dozer
          u.v *= 0.6;
          if (Math.random() < 0.3) HC.Game.dust(t.x, t.y, '#8d6c48', 2, 40);
          if (t.pushHp >= 1 && t.state === 'standing') {
            t.pushed = true; HC.Audio.creak();
            HC.Game.fell(t, u.a + HC.rand(-0.12, 0.12));
          }
        }
        if (absorb.length) {
          let pl = pile;
          if (!pl) {
            pl = { id: 'pile' + HC.uid(), kind: 'pile', x: bx, y: by, a: u.a, size: 1, value: 0, content: [], parcel: absorb[0].parcel };
            S.lot.items.push(pl); u.pileId = pl.id;
          }
          for (const it of absorb) {
            const i = S.lot.items.indexOf(it);
            if (i >= 0) S.lot.items.splice(i, 1);
            if (it.kind === 'pile') pl.content.push(...it.content); else pl.content.push(it);
          }
          if (Math.random() < 0.5) HC.Audio.drop();
        }
        // the pile rides just ahead of the blade
        const pl2 = u.pileId && S.lot.items.find((i) => i.id === u.pileId);
        if (pl2) {
          const r = 6 + Math.sqrt(pl2.content.length) * 4;
          pl2.x = bx + c * r; pl2.y = by + sn * r; pl2.a = u.a;
          pl2.size = 0.6 + Math.sqrt(pl2.content.length) * 0.28;
          if (Math.random() < 0.15) HC.Game.dust(pl2.x, pl2.y, '#8d6c48', 2, 50);
        }
        if (!u.working) return;
        // blade cut in: strip the ground to dirt as you go
        runWork(u, dt);
        for (let s2 = -half; s2 <= half; s2 += 12) {
          const gx = bx - sn * s2, gy = by + c * s2, cur = HC.Lot.tile(S.lot, gx, gy);
          if ([T.TALL, T.GRASS, T.MOWED, T.MULCH].includes(cur)) { const { tx, ty } = tileAt(gx, gy); HC.Game.setTile(tx, ty, T.DIRT); }
        }
      },
      interact(u, S) { machineInteract(u, S, 'Drive forward into anything to push it over and into a pile. Back up to leave the pile. Hold click to cut the blade in.'); },
      hint(u, S) {
        if (u.on || S.trailers.some((t) => U.onDeck(t, u)) || U.behindRamps(u, S)) return machineHint(u, S, '');
        if (u.pushLoad) return `Pushing a pile of ${u.pushLoad} pieces. Back up (S) to leave it, then load it with a grapple.`;
        return machineHint(u, S, 'Drive into trees, brush, stumps, logs and rocks: it all goes over and into one push pile. Hold click to cut the blade in.');
      },
    };
  }
  HC.Units.factories.dozer = dozerKind;
  K.dozerS = dozerKind('dozerS');
  // ---------- grapple skidder: grabs whole felled trees by the butts and drags them behind ----------
  const skidGrab = (u) => ({ x: u.x - Math.cos(u.a) * (u.r + 16), y: u.y - Math.sin(u.a) * (u.r + 16) });
  K.skidder = {
    update(u, dt, S, active) {
      U.boom(u, dt, active, 0.5);
      const ids = u.drag || [];
      if (active) U.tank(u, dt, HC.EQUIP[u.kind], 1 - Math.min(0.45, ids.length * 0.09)); else idle(u);
      u.working = false;
      if (!ids.length) return;
      const trees = S.lot.trees.filter((t) => ids.includes(t.id) && t.state === 'felled');
      if (trees.length !== ids.length) u.drag = trees.map((t) => t.id);
      const g = skidGrab(u), n = trees.length, sx = Math.cos(u.a + Math.PI / 2), sy = Math.sin(u.a + Math.PI / 2);
      trees.forEach((t, i) => { // butts in the grapple; each top trails like a towed load, swinging wide through turns
        const off = (i - (n - 1) / 2) * 5, L = t.len * 0.9;
        const bx = g.x + sx * off, by = g.y + sy * off;
        if (!t._top) t._top = { x: t.x + Math.cos(t.fallA) * L, y: t.y + Math.sin(t.fallA) * L };
        let dx = t._top.x - bx, dy = t._top.y - by; const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
        t._top.x = bx + dx * L; t._top.y = by + dy * L; // the top is pulled along the line to the butt, never pushed sideways
        t.x = bx; t.y = by; t.fallA = Math.atan2(dy, dx); t.landT = 1; t.skidded = true;
        // a top dragging off to one side tugs the back end round a little
        if (active && u.moving) u.a += HC.angDiff(u.a + Math.PI, t.fallA) * dt * 0.04;
        if (u.moving && Math.random() < dt * 4) HC.Game.dust(t._top.x + HC.rand(-6, 6), t._top.y + HC.rand(-6, 6), HC.pick(['#8d6c48', '#9a7a55']), 2, 40);
      });
    },
    interact(u, S) {
      const ids = u.drag || [];
      if (!ids.length && U.strapToggle(u, S)) return;
      if (ids.length) { // let go: they lie where you dropped them, ready to buck
        for (const t of S.lot.trees) if (ids.includes(t.id)) delete t._top;
        u.drag = [];
        HC.Audio.drop();
        return HC.Game.toast(`Dropped ${ids.length} tree${ids.length > 1 ? 's' : ''}. Buck them up with the saw, then load the logs.`);
      }
      const g = skidGrab(u), cap = HC.EQUIP[HC.baseOf(u.kind)].cap || 4;
      const near2 = S.lot.trees.filter((t) => t.state === 'felled' && !t.harvested && HC.segPointDist(t.x, t.y, t.x + Math.cos(t.fallA) * t.len * 0.9, t.y + Math.sin(t.fallA) * t.len * 0.9, g.x, g.y) < 26)
        .sort((a, b) => HC.dist(a.x, a.y, g.x, g.y) - HC.dist(b.x, b.y, g.x, g.y)).slice(0, cap);
      if (!near2.length) return HC.Game.toast('Back the grapple up to felled trees (whole, not bucked), then press E.');
      if ((u.armT || 0) > 0.5) return HC.Game.toast('Lower the grapple (hold G) to grab them.', 'warn');
      u.drag = near2.map((t) => t.id);
      HC.Audio.pick();
      HC.Game.toast(`Grabbed ${near2.length} tree${near2.length > 1 ? 's' : ''}. Drag them to the landing and press E to drop them.`);
    },
    hint(u, S) {
      if (u.on) return 'Chained down on the trailer. E: release it.';
      const ids = u.drag || [];
      if (ids.length) return `Dragging ${ids.length} whole tree${ids.length > 1 ? 's' : ''}. Drive to the landing and press E to drop them.`;
      const g = skidGrab(u), n = S.lot.trees.filter((t) => t.state === 'felled' && HC.segPointDist(t.x, t.y, t.x + Math.cos(t.fallA) * t.len * 0.9, t.y + Math.sin(t.fallA) * t.len * 0.9, g.x, g.y) < 26).length;
      return n ? `E: grab ${Math.min(n, 4)} felled tree${n > 1 ? 's' : ''} with the grapple` : machineHint(u, S, 'Back the grapple up to felled trees and press E to grab up to four.');
    },
  };
  // ---------- crawler track loader: bucket on the ground pushes like a dozer; E scoops a dozen at a time ----------
  const tlDoze = dozerKind('trackloader');
  K.trackloader = {
    update(u, dt, S, active) {
      U.boom(u, dt, active, 0.4);
      if (!u.carrying.length && (u.armT || 0) < 0.2) return tlDoze.update(u, dt, S, active); // bucket down: it's a dozer
      if (u.pileId) u.pileId = null; // lifting the bucket leaves the push pile where it is
      u.working = false;
      if (active) U.tank(u, dt, HC.EQUIP[u.kind], (1 - u.carrying.length * 0.012) * (u.armT > 0.6 ? 0.6 : 1)); else idle(u);
      if (u.carrying.length) { const f = U.frontPt(u, 28); u.carrying.forEach((c, i) => { c.x = f.x + ((i % 3) - 1) * 6; c.y = f.y; c.a = u.a + Math.PI / 2; }); }
    },
    interact(u, S) {
      if (!u.carrying.length && U.strapToggle(u, S)) return;
      if (K.loader.act(u, S)) { if (u.pileId && !S.lot.items.some((i) => i.id === u.pileId)) u.pileId = null; return; }
      HC.Game.toast('Nothing in front of the bucket. Push debris into a pile with the bucket down, then press E to scoop it.');
    },
    hint(u, S) {
      const core = K.loader.hintCore(u, S);
      if (core) return core;
      const pile = u.pileId && S.lot.items.find((i) => i.id === u.pileId);
      if (pile) return `Pushing a pile of ${pile.content.length}. Stop and press E to scoop up to 12, or keep shoving.`;
      return 'Track loader: bucket down (G) and drive to push like a dozer; hold click to strip ground. E scoops 12. T raises the bucket to load a truck.';
    },
  };
  K.dozerL = dozerKind('dozerL');

  // ---------- wheeled harvester: fell, delimb and buck in one cycle ----------
  K.harvester = {
    target(u, S) {
      const R = HC.EQUIP.harvester.reach;
      let best = null, bd = R;
      for (const t of S.lot.trees) {
        if (t.state !== 'standing' || Math.abs(t.x - u.x) > R + 10 || Math.abs(t.y - u.y) > R + 10) continue;
        const d = HC.dist(u.x, u.y, t.x, t.y);
        const ang = Math.abs(HC.angDiff(u.a, Math.atan2(t.y - u.y, t.x - u.x)));
        if (d < bd && ang < 1.4) { bd = d; best = t; }
      }
      return best;
    },
    update(u, dt, S, active) {
      if (!active) return idle(u);
      U.tank(u, dt, HC.EQUIP.harvester);
      u.working = false;
      const t = u.on ? null : K.harvester.target(u, S);
      u.headAt = t ? { x: t.x, y: t.y } : null;
      S.focus = t ? { type: 'fell', obj: t, aim: Math.atan2(HC.input.mouse.wy - t.y, HC.input.mouse.wx - t.x), harvester: true } : null;
      if (!t || !mouseDown()) return;
      if (!canRun(u)) return HC.Game.hintOnce('The harvester is out of fuel or worn out.');
      u.working = true; runWork(u, dt);
      const d = HC.TREES[t.type];
      if (!t.marked && t.cut === 0 && !t.warned) { t.warned = true; HC.Game.toast('That tree is not part of the job.', 'warn'); }
      t.cut += (dt / (0.6 + d.cut * t.s * 0.18)) * U.condFactor('harvester');
      HC.Game.dust(t.x, t.y, '#e8c98a', 2, 50);
      if (t.cut >= 1) { t.harvested = true; HC.Game.fell(t, S.focus.aim, false, 1.5); }
    },
    interact(u, S) { machineInteract(u, S, 'Point the boom at a tree within reach, aim the fall with the mouse and hold left click.'); },
    hint(u, S) {
      const t = K.harvester.target(u, S);
      if (t && !u.on) return `${HC.TREES[t.type].name}${t.marked ? ' (flagged)' : ''}: aim the fall and hold click. The head fells, strips and cuts it to length. ${Math.min(100, Math.round(t.cut * 100))}%`;
      return machineHint(u, S, 'Turn toward a tree within about 9 m to reach it with the head.');
    },
  };

  // ---------- forwarder: crane logs onto the bunks, unload into a truck, trailer or the pad ----------
  K.forwarder = {
    bed: (S, u) => S.trailers.find((t) => t.kind === 'fwdbed' && (!u || t.hitch === u.kind)),
    update(u, dt, S, active) { if (!active) return idle(u); U.tank(u, dt, HC.EQUIP.forwarder, 1 - Math.min(0.25, K.forwarder.bed(S, u).load * 0.008)); u.working = false; },
    interact(u, S) {
      if (U.strapToggle(u, S)) return;
      const bed = K.forwarder.bed(S, u), R = HC.EQUIP.forwarder.reach;
      if (Math.abs(u.v) > 5) return HC.Game.toast('Stop before swinging the crane.');
      // unload into a log truck, log trailer or onto the pad
      if (bed.load) {
        if (atPad(u, S)) return HC.Game.haul(bed, HC.Game.padAt(u.x, u.y));
        const pref = (t) => (t.kind === 'logbed' || t.kind === 'logtrailer' ? 0 : 1);
        const into = S.trailers.filter((t) => ['logbed', 'logtrailer', 'dump', 'dump2', 'dump18', 'gndump', 'bed'].includes(t.kind) && !HC.Units.machineIn(t, S) && HC.dist(t.x, t.y, u.x, u.y) < R + 30 && t.load < HC.Game.trailerCap(t))
          .sort((a2, b2) => pref(a2) - pref(b2) || HC.dist(a2.x, a2.y, u.x, u.y) - HC.dist(b2.x, b2.y, u.x, u.y))[0];
        if (into) {
          const cap = HC.Game.trailerCap(into);
          let n = 0;
          while (bed.cargo.length && into.load + HC.loadOf(bed.cargo[bed.cargo.length - 1], into) <= cap) { const l = bed.cargo.pop(); into.cargo.push(l); into.load += HC.loadOf(l, into); bed.load -= 1; n++; }
          u.craneT = 0.8; HC.Audio.drop();
          return HC.Game.toast(n ? `Swung ${n} log(s) across into the ${HC.TRAILERS[into.kind].name.toLowerCase()}.` : `The ${HC.TRAILERS[into.kind].name.toLowerCase()} is full.`);
        }
      }
      const log = S.lot.items.filter((i) => i.kind === 'log' && near(i, u, R)).sort((a2, b2) => HC.dist(a2.x, a2.y, u.x, u.y) - HC.dist(b2.x, b2.y, u.x, u.y))[0];
      if (log) {
        if (bed.load + 1 > HC.EQUIP.forwarder.bed) return HC.Game.toast('Bunks are full. Unload at a log truck, the log trailer or the sawmill.', 'warn');
        S.lot.items.splice(S.lot.items.indexOf(log), 1); bed.cargo.push(log); bed.load += 1; u.craneT = 0.8;
        S.time += 1; if (S.stage === 'onsite') S.workMins += 1;
        HC.Audio.pick(); return;
      }
      if (U.nearFuel(u, S)) { if (!U.refuel(u)) HC.Game.toast('Tank is full.'); return; }
      HC.Game.toast(bed.load ? 'Drive to a log truck, the log trailer or the sawmill and press E to unload.' : 'No logs within crane reach.');
    },
    hint(u, S) {
      if (u.on || S.trailers.some((t) => U.onDeck(t, u)) || U.behindRamps(u, S)) return machineHint(u, S, '');
      const bed = K.forwarder.bed(S, u), R = HC.EQUIP.forwarder.reach;
      const n = S.lot.items.filter((i) => i.kind === 'log' && near(i, u, R)).length;
      if (bed.load && atPad(u, S)) return `E: unload ${bed.load} units at the pad.`;
      if (bed.load && S.trailers.some((t) => (t.kind === 'logbed' || t.kind === 'logtrailer') && HC.dist(t.x, t.y, u.x, u.y) < R + 30)) return 'E: swing the logs across.';
      return n ? `E: crane a log aboard (${n} in reach). Bunks ${bed.load}/${HC.EQUIP.forwarder.bed}.` : `Bunks ${bed.load}/${HC.EQUIP.forwarder.bed}. Drive up to logs and press E.`;
    },
  };

  // ---------- tracked forestry mulcher ----------
  K.fmulcher = {
    update(u, dt, S, active) {
      if (!active) return idle(u);
      U.tank(u, dt, HC.EQUIP.fmulcher);
      u.working = false;
      if (!mouseDown() || u.on) return;
      if (!canRun(u)) return HC.Game.hintOnce('The mulcher is out of fuel or worn out.');
      u.working = true; runWork(u, dt);
      mulch(u, dt, S, 34, 32, 2.2);
    },
    interact(u, S) { machineInteract(u, S, 'Hold left click to run the drum.'); },
    hint(u, S) { return u.on || S.trailers.some((t) => U.onDeck(t, u)) ? machineHint(u, S, '') : machineHint(u, S, 'Hold left click to run the drum: brush and saplings go fast. Keep it off the keeper trees.'); },
  };

  // ---------- mowers ----------
  // A tile of tall grass is a 3 x 3 grid of 1 m patches; the deck cuts the patches it passes over, so a narrow
  // deck takes three passes down a strip and a wide one just one. A tile counts as mowed once 8 of 9 are cut.
  const PXM = 32 / 3;
  function mowDeck(u, S, deckM) {
    const W = S.lot, c = Math.cos(u.a), sn = Math.sin(u.a), half = (deckM * PXM) / 2, ahead = u.r * 0.55;
    const cx = u.x + c * ahead, cy = u.y + sn * ahead;
    W.cut = W.cut || new Map();
    let cutNow = 0, tall = false;
    for (let s2 = -half; s2 <= half + 0.01; s2 += 3) {
      const x = cx - sn * s2, y = cy + c * s2, { tx, ty } = tileAt(x, y);
      const t = HC.Lot.tile(W, x, y);
      if (t === T.GRASS) { HC.Game.setTile(tx, ty, T.MOWED); continue; }
      if (t !== T.TALL) continue;
      tall = true;
      const idx = ty * W.w + tx, bit = 1 << (Math.min(2, Math.floor((y - ty * TS) / (TS / 3))) * 3 + Math.min(2, Math.floor((x - tx * TS) / (TS / 3))));
      const m = W.cut.get(idx) || 0;
      if (m & bit) continue;
      const nm = m | bit; cutNow++;
      let n = 0; for (let b = nm; b; b &= b - 1) n++;
      if (n >= 8) { W.cut.delete(idx); HC.Game.setTile(tx, ty, T.MOWED); } else { W.cut.set(idx, nm); HC.Render.setTile(tx, ty); }
    }
    return { cutNow, tall };
  }
  const mowerKind = (k) => ({
    update(u, dt, S, active) {
      if (!active) return idle(u);
      const spec = HC.EQUIP[k];
      U.tank(u, dt, spec, u.inTall ? 0.78 : 1); // thick grass loads the blades and slows you down
      u.working = u.moving && canRun(u) && !S.trailers.some((t) => U.onDeck(t, u));
      if (!u.working) { u.inTall = false; return; }
      const r = mowDeck(u, S, spec.deck || 1.2);
      u.inTall = r.tall;
      if (r.tall && Math.random() < 0.6) { // clippings blow out the side chute
        const side = u.a + Math.PI / 2, d = (spec.deck || 1.2) * PXM * 0.55;
        HC.Game.dust(u.x + Math.cos(side) * d, u.y + Math.sin(side) * d, HC.pick(['#7fc455', '#6fb046', '#9bd36a']), 2, 70);
      }
      const rock = S.lot.items.find((i) => i.kind === 'rock' && near(i, u, u.r + 4 + 10 * i.size));
      if (rock && performance.now() - lastBump > 1200) {
        lastBump = performance.now();
        U.wear(u, 10); u.v = -u.v * 0.4; HC.Audio.crash();
        HC.Game.toast('Hit a rock with the deck: -10% condition.', 'warn');
      }
    },
    interact(u, S) { machineInteract(u, S, 'Just drive over the tall grass.'); },
    hint(u, S) { return machineHint(u, S, `Drive over tall grass to mow it: the ${Math.round((HC.EQUIP[k].deck || 1.2) / 0.0254)}" deck cuts a strip as wide as it is. Overlap your passes. Watch for rocks.`); },
  });
  for (const k of ['mower', 'mowerZT', 'mowerSO', 'mowerWA']) K[k] = mowerKind(k);

  // ---------- landscaping crew ----------
  const TOOLS = [
    { id: 'sod', name: 'Sod', tile: T.SOD },
    { id: 'shrub', name: 'Shrubs' },
    { id: 'paver', name: 'Pavers', tile: T.PAVER },
    { id: 'bed', name: 'Bed mulch', tile: T.BED },
  ];
  K.land = {
    tools: TOOLS,
    modeName: (u) => TOOLS[u.mode].name,
    mode(u) { u.mode = (u.mode + 1) % TOOLS.length; HC.Audio.select(); },
    target(u, S) {
      const m = HC.input.mouse, { tx, ty } = tileAt(m.wx, m.wy);
      const g = S.lot.targets.find((t) => t.tx === tx && t.ty === ty && !t.done);
      return { tx, ty, g, cx: tx * TS + 16, cy: ty * TS + 16 };
    },
    update(u, dt, S, active) {
      if (!active) { u.moving = false; return; }
      U.walk(u, dt, HC.EQUIP.land);
      u.cool = Math.max(0, (u.cool || 0) - dt);
      u.working = false;
      if (!mouseDown() || u.cool > 0) return;
      u.cool = 0.25;
      const tool = TOOLS[u.mode], tg = K.land.target(u, S);
      if (HC.dist(u.x, u.y, tg.cx, tg.cy) > 90) return HC.Game.hintOnce('Too far. Walk closer to that tile.');
      if (!tg.g) return HC.Game.hintOnce(`Nothing is marked for ${tool.name.toLowerCase()} there.`);
      if (tg.g.kind !== tool.id) {
        const want = TOOLS.findIndex((t) => t.id === tg.g.kind);
        return HC.Game.hintOnce(`That spot is marked for ${TOOLS[want].name.toLowerCase()}. Press Q to switch tools.`);
      }
      const c = { x: tg.cx, y: tg.cy };
      const blocker = S.lot.items.find((i) => near(i, c, 20)) || S.lot.stumps.find((s) => near(s, c, 20)) || S.lot.bushes.find((b) => near(b, c, 18));
      if (blocker) return HC.Game.hintOnce(`Clear the ${blocker.kind || (blocker.grind ? 'stump' : 'brush')} off that spot first.`);
      u.working = true;
      tg.g.done = true;
      if (tool.tile !== undefined) HC.Game.setTile(tg.tx, tg.ty, tool.tile);
      else S.lot.plants.push({ id: HC.uid(), x: tg.cx, y: tg.cy, seed: Math.random() * 9, color: HC.pick(['#e85d8f', '#f2c14e', '#ffffff', '#b07be0']), parcel: S.job && S.job.parcel });
      HC.Audio.place();
      for (let i = 0; i < 6; i++) HC.Game.dust(tg.cx, tg.cy, '#7a4f30', 1, 40);
    },
    interact(u, S) {
      if (U.board(u, S)) return;
      HC.Game.toast('Point at a marked tile and click to install. Q switches tools. E beside a truck to ride along.');
    },
    hint(u, S) {
      if (U.nearTruck(u, S)) return 'E: climb into the truck';
      const tool = TOOLS[u.mode];
      const left = S.lot.targets.filter((t) => t.kind === tool.id && !t.done).length;
      if (!S.lot.targets.some((t) => !t.done)) return 'No landscaping on this job.';
      return `${tool.name}: ${left} spots left. Click a marked tile to install. Q switches tools.`;
    },
  };
})();

// behavior for an extra copy of a machine
HC.Units.kindFor = function (key, base) {
  const K = HC.Units.KINDS, spec = HC.EQUIP[base];
  if (spec.move === 'car') return HC.Units.factories.truck(key);
  if (base === 'dozerS' || base === 'dozerL') return HC.Units.factories.dozer(key);
  if (base === 'trackloader') return K.trackloader;
  if (base === 'skidder') return K.skidder;
  if (['mower', 'mowerZT', 'mowerSO', 'mowerWA'].includes(base)) return K[base];
  if (base === 'excavator' || base === 'miniex') return HC.Units.factories.digger(key);
  return K[base];
};
