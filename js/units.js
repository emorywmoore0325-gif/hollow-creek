// Hollow Creek — equipment: movement models, collisions, towing, loading, crews riding along
'use strict';
(() => {
  const TS = HC.TILE, T = HC.T;
  const key = (k) => HC.input.keys.has(k);
  const isTruck = (k) => HC.EQUIP[k] && HC.EQUIP[k].move === 'car';
  const isBed = (t) => t.kind === 'bed' || t.kind === 'logbed' || t.kind === 'fwdbed';
  const isDump = (t) => ['dump', 'dump2', 'gndump', 'bed', 'logbed', 'fwdbed', 'logtrailer'].includes(t.kind);

  function create(kind, x, y, a = -Math.PI / 2) {
    const spec = HC.EQUIP[kind];
    return {
      kind, x, y, a, v: 0, r: spec.r, walkT: 0, moving: false, working: false,
      fuel: HC.company.fuel[kind] ?? spec.fuelCap, carrying: [], mode: 0, workT: 0, on: null, boarded: null, armT: 0,
    };
  }

  const fuelCap = (kind) => (HC.EQUIP[kind].fuelCap || 0) * HC.Co.mult('tank');
  const cond = (kind) => HC.company.cond[kind] ?? 100;
  const condFactor = (kind) => (cond(kind) < 25 ? 0.6 : cond(kind) < 50 ? 0.85 : 1);
  const wetFactor = () => (HC.session.weather.wet ? 0.82 : 1);
  function wear(u, amt) { HC.company.cond[u.kind] = Math.max(0, cond(u.kind) - amt); }
  function burn(u, amt) { u.fuel = Math.max(0, u.fuel - amt * HC.Co.mult('fuelUse') * (HC.FUEL_BURN || 1)); }
  const dirv = (a) => ({ x: Math.cos(a), y: Math.sin(a) });

  // ---------- movement physics ----------
  // ground the unit is on: slows tracks and tyres in tall grass, mud and fresh mulch
  function groundFactor(u, wheeled) {
    const t = HC.Lot.tile(HC.session.lot, u.x, u.y);
    const wet = HC.session.weather.wet;
    if (t === T.ROAD) return 1;
    if (t === T.GRAVEL || t === T.PAVER || t === T.DIRTROAD) return wheeled ? 0.9 : 1;
    if (t === T.TALL) return wheeled ? (wet ? 0.6 : 0.72) : 0.9;
    if (t === T.MULCH || t === T.DIRT || t === T.BED || t === T.FIELD) return wet ? (wheeled ? 0.55 : 0.8) : (wheeled ? 0.78 : 0.95);
    if (t === T.QUARRY) return wheeled ? 0.85 : 0.95;
    return wheeled ? (wet ? 0.7 : 0.82) : (wet ? 0.88 : 0.97);
  }
  // slope along a heading: rise over run (world units per world unit)
  function slopeAlong(u, a, d = 12) {
    const h0 = HC.World.heightAt(u.x, u.y), h1 = HC.World.heightAt(u.x + Math.cos(a) * d, u.y + Math.sin(a) * d);
    return (h1 - h0) / (d / TS);
  }
  // uphill costs speed, downhill adds a little
  const slopeFactor = (sl) => HC.clamp(1 - sl * 1.6, 0.35, 1.18);

  function walk(u, dt, spec) {
    const ix = (key('d') ? 1 : 0) - (key('a') ? 1 : 0);
    const iy = (key('w') ? 1 : 0) - (key('s') ? 1 : 0);
    const yaw = HC.input.camYaw ?? -Math.PI / 2;
    const fx = Math.cos(yaw), fy = Math.sin(yaw), rx = Math.cos(yaw + Math.PI / 2), ry = Math.sin(yaw + Math.PI / 2);
    let mx = fx * iy + rx * ix, my = fy * iy + ry * ix;
    const l = Math.hypot(mx, my);
    if (l) { mx /= l; my /= l; }
    const sprint = key('shift') && !u.working ? 1.8 : 1;
    const heading = l ? Math.atan2(my, mx) : u.a;
    const top = spec.speed * sprint * wetFactor() * (u.working ? 0.3 : 1) * slopeFactor(slopeAlong(u, heading, 8)) * (HC.Lot.tile(HC.session.lot, u.x, u.y) === T.TALL ? 0.85 : 1);
    // velocity eases toward the target: people take a few steps to get going and to stop
    u.vx = u.vx || 0; u.vy = u.vy || 0;
    const k = Math.min(1, dt * (l ? 7 : 10));
    u.vx += (mx * top - u.vx) * k; u.vy += (my * top - u.vy) * k;
    u.x += u.vx * dt; u.y += u.vy * dt;
    const sp = Math.hypot(u.vx, u.vy);
    u.speed = sp;
    u.moving = sp > 3;
    if (u.moving) u.walkT += dt * (sp / spec.speed);
    // face where you're walking; with the saw in hand you square up to the mouse
    const m = HC.input.mouse;
    const aimSaw = HC.session.saw && HC.session.saw.holder === u.kind && (u.working || HC.session.focus);
    const want = aimSaw || !u.moving ? (aimSaw ? Math.atan2(m.wy - u.y, m.wx - u.x) : u.a) : Math.atan2(u.vy, u.vx);
    u.a += HC.angDiff(u.a, want) * Math.min(1, dt * 10);
  }

  // tracked machines: mass-limited acceleration, slower pivot turns at speed, slope + ground drag
  function tank(u, dt, spec, extra = 1) {
    const thr = (key('w') ? 1 : 0) - (key('s') ? 1 : 0);
    const turn = (key('d') ? 1 : 0) - (key('a') ? 1 : 0);
    const can = u.fuel > 0 && cond(u.kind) > 0;
    const top = spec.speed * HC.Co.mult('drive') * condFactor(u.kind) * extra * groundFactor(u, false) * slopeFactor(slopeAlong(u, u.v >= 0 ? u.a : u.a + Math.PI));
    const target = can ? thr * top * (thr < 0 ? 0.6 : 1) : 0;
    const mass = spec.mass || 4;
    const accel = (thr && Math.sign(thr) !== Math.sign(u.v) && Math.abs(u.v) > 2 ? 3.2 : 1.6) / Math.sqrt(mass); // braking bites harder than throttle
    u.v += (target - u.v) * Math.min(1, dt * accel * 3);
    if (!thr && Math.abs(u.v) < 1.5) u.v = 0;
    if (spec.artic) {
      // centre-articulated frame: steering bends the machine at its hinge (up to ~42 degrees); it can't spin in place
      u.art = HC.lerp(u.art || 0, can ? turn * 0.74 : u.art || 0, Math.min(1, dt * 1.6));
      const half = ((spec.wheelbase || 4.8) / 3) * TS / 2;
      u.turnV = (u.v * Math.tan(u.art / 2)) / half;
    } else {
      const turnRate = spec.turn * (1 - 0.35 * Math.min(1, Math.abs(u.v) / spec.speed));
      u.turnV = HC.lerp(u.turnV || 0, can ? turn * turnRate : 0, Math.min(1, dt * 5 / Math.sqrt(mass / 4)));
    }
    u.a += u.turnV * dt;
    u.x += Math.cos(u.a) * u.v * dt;
    u.y += Math.sin(u.a) * u.v * dt;
    u.moving = Math.abs(u.v) > 2 || Math.abs(u.turnV) > 0.05;
    u.trackT = (u.trackT || 0) + (Math.abs(u.v) + Math.abs(u.turnV) * 20) * dt * 0.25;
    if (can) { burn(u, (0.03 + spec.fuelUse * (u.moving ? 1 : 0) * (1 + Math.max(0, slopeAlong(u, u.a)) * 2)) * dt); if (u.moving) wear(u, spec.wear * dt); }
  }

  // trucks: bicycle steering (turn radius from wheelbase), power vs. total mass incl. trailer and load,
  // braking, rolling resistance, road vs. off-road grip, slopes
  function car(u, dt, spec) {
    const S = HC.session;
    const thr = (key('w') ? 1 : 0) - (key('s') ? 1 : 0);
    const steerIn = (key('d') ? 1 : 0) - (key('a') ? 1 : 0);
    const towed = S.trailers.filter((t) => t.hitch === u.kind && !isBed(t));
    const load = S.trailers.filter((t) => t.hitch === u.kind).reduce((a, t) => a + (t.load || 0) * 0.25, 0)
      + towed.reduce((a, t) => a + (HC.TRAILERS[t.kind].heavy ? 6 : 1.5) + Object.values(S.units).filter((o) => o.on && o.on.id === t.id).reduce((m, o) => m + (HC.EQUIP[o.kind].mass || 3), 0), 0);
    const mass = (spec.mass || 4) + load;
    const ground = groundFactor(u, true);
    const onRoad = HC.Lot.tile(S.lot, u.x, u.y) === T.ROAD;
    const top = spec.speed * HC.Co.mult('drive') * (S.weather.wet ? 0.85 : 1) * (onRoad ? 1.25 : ground * 0.85) * HC.clamp(1.15 - load / (40 * (spec.power || 1)), 0.6, 1);
    const can = u.fuel > 0;
    const slope = slopeAlong(u, u.v >= 0 ? u.a : u.a + Math.PI);
    let a = 0;
    if (can && thr > 0) a = u.v < -2 ? 260 : (top - u.v) * 2.4 * (12 * (spec.power || 1) / (mass + 8)); // throttle (or braking out of reverse)
    else if (can && thr < 0) a = u.v > 2 ? -260 : (-top * 0.35 - u.v) * 2.0 * (12 / (mass + 8));
    else a = -Math.sign(u.v) * Math.min(Math.abs(u.v) / dt, 40 + Math.abs(u.v) * 0.25); // coast down
    a -= slope * 140 * Math.sign(u.v || 1) * (u.v >= 0 ? 1 : -1);
    u.v += a * dt;
    if (!thr && Math.abs(u.v) < 2) u.v = 0;
    // steering wheel takes a moment; less lock available at speed
    const maxLock = 0.6 * (1 - 0.55 * Math.min(1, Math.abs(u.v) / 180));
    u.steer = HC.lerp(u.steer || 0, steerIn * maxLock, Math.min(1, dt * 4));
    const wb = ((spec.wheelbase || 4.2) / 3) * TS; // metres -> px
    const grip = onRoad ? 1 : ground;
    u.a += (u.v / wb) * Math.tan(u.steer) * dt * (0.75 + 0.25 * grip);
    u.x += Math.cos(u.a) * u.v * dt;
    u.y += Math.sin(u.a) * u.v * dt;
    u.moving = Math.abs(u.v) > 3;
    u.wheelT = (u.wheelT || 0) + u.v * dt * 0.08;
    if (can) { burn(u, (0.02 + spec.fuelUse * Math.abs(u.v) / Math.max(40, top) * (mass / (spec.mass || 4)) ** 0.5) * dt); if (u.moving) wear(u, spec.wear * dt); }
  }

  // manual boom/arms: hold T to raise, G to lower (0 = on the ground, 1 = full height)
  function boom(u, dt, active, rate = 0.55) {
    if (!active || u.on) return;
    const up = key('t'), down = key('g');
    if (up && !down) u.armT = Math.min(1, (u.armT || 0) + dt * rate);
    if (down && !up) u.armT = Math.max(0, (u.armT || 0) - dt * rate);
    u.boomMoving = (up || down) && !(up && down);
  }
  const attachedTo = (S, k) => (S.attachments || []).find((a) => a.on === k);

  // a hard hit stops you: crashing into a tree, boulder or building at speed costs condition
  function impact(u, px, py, dt) {
    const moved = HC.dist(px, py, u.x, u.y), expected = Math.abs(u.v || 0) * dt;
    if (HC.EQUIP[u.kind].move === 'walk' || expected < 1) return;
    if (moved < expected * 0.35) {
      const hard = Math.abs(u.v);
      if (hard > 40) {
        wear(u, Math.min(12, hard / 15));
        HC.Audio.crash();
        HC.session.shake = Math.max(HC.session.shake, Math.min(8, hard / 20));
        HC.Game.hintOnce(`Bang. You hit something at ${Math.round(hard / 10.7 * 3.6)} km/h. That cost some condition.`);
      }
      u.v *= -0.15;
    }
  }

  // ---------- trailers ----------
  const coupler = (t) => ({ x: t.x + Math.cos(t.a) * t.len, y: t.y + Math.sin(t.a) * t.len });
  const hitchPt = (u, t) => {
    const e = HC.EQUIP[u.kind], gn = t && HC.TRAILERS[t.kind].gooseneck;
    const d = gn ? (e.gnOff || HC.EQUIP[HC.baseOf(u.kind)].gnOff || 19) : (e.hitchOff || 26);
    return { x: u.x - Math.cos(u.a) * d, y: u.y - Math.sin(u.a) * d };
  };
  // a gooseneck dump carries a machine only when the box is empty, and takes no load while one rides in it
  const machineIn = (t, S) => Object.values(S.units).some((o) => o.on && o.on.id === t.id);
  function deckLocal(t, p) {
    const dx = p.x - t.x, dy = p.y - t.y, c = Math.cos(t.a), s = Math.sin(t.a);
    return { along: dx * c + dy * s, side: -dx * s + dy * c };
  }
  const onDeck = (t, p) => { const d = HC.TRAILERS[t.kind].deck; if (!d) return false; const l = deckLocal(t, p); return l.along > d[0] && l.along < d[1] && Math.abs(l.side) < d[2]; };
  function slotPos(t, i, at) {
    const off = at ?? HC.TRAILERS[t.kind].slots[i];
    return { x: t.x + Math.cos(t.a) * off, y: t.y + Math.sin(t.a) * off };
  }

  // Does a body at (x,y,r) hit something solid? Used for trailer snags.
  function blockedAt(S, x, y, r) {
    const lot = S.lot;
    const tt = HC.Lot.tile(lot, x, y);
    if (tt === T.WATER || tt === T.ROCKFACE || tt === -1) return true;
    for (const t of lot.trees) if ((t.state === 'standing') && Math.abs(t.x - x) < 40 && Math.abs(t.y - y) < 40 && HC.dist(t.x, t.y, x, y) < t.trunkR + r * 0.7) return true;
    for (const h of lot.houses) if (HC.circleRectHit(x, y, r * 0.8, h)) return true;
    for (const b of lot.boulders) if (HC.dist(b.x, b.y, x, y) < b.r + r * 0.7) return true;
    return false;
  }

  function tow(u, S) {
    for (const t of S.trailers) {
      if (t.hitch !== u.kind) continue;
      if (isBed(t)) { t.x = u.x - Math.cos(u.a) * 10; t.y = u.y - Math.sin(u.a) * 10; t.a = u.a; continue; }
      const hp = hitchPt(u, t);
      let a = Math.atan2(hp.y - t.y, hp.x - t.x);
      const d = HC.angDiff(u.a, a); // jackknife limit
      if (Math.abs(d) > 1.3) a = u.a + Math.sign(d) * 1.3;
      t.a = a;
      t.x = hp.x - Math.cos(a) * t.len; t.y = hp.y - Math.sin(a) * t.len;
      t.moving = u.moving;
    }
  }

  function hitchToggle(u, S) {
    if (!HC.EQUIP[u.kind].tows) return HC.Game.toast(`The ${HC.EQUIP[u.kind].short.toLowerCase()} doesn't have a hitch.`);
    const mine = S.trailers.find((t) => t.hitch === u.kind && !isBed(t));
    if (Math.abs(u.v) > 15) return HC.Game.toast('Stop the truck first.');
    if (mine) {
      mine.hitch = null;
      HC.Audio.drop();
      return HC.Game.toast(`${HC.TRAILERS[mine.kind].name} dropped.${mine.kind === 'equip' ? ' Ramps are down.' : ''}`);
    }
    const hp = hitchPt(u);
    let best = null, bd = 34;
    for (const t of S.trailers) {
      if (t.hitch || isBed(t) || (HC.EQUIP[t.kind] && HC.EQUIP[HC.baseOf(t.kind)].fixed)) continue;
      const h = hitchPt(u, t), c = coupler(t), d = HC.dist(c.x, c.y, h.x, h.y);
      if (d < bd) { bd = d; best = t; }
    }
    if (!best) {
      const near = S.trailers.filter((t) => !t.hitch && !isBed(t) && !(HC.EQUIP[t.kind] && HC.EQUIP[HC.baseOf(t.kind)].fixed)).map((t) => { const h = hitchPt(u, t); return { t, d: HC.dist(coupler(t).x, coupler(t).y, h.x, h.y) }; }).sort((a, b) => a.d - b.d)[0];
      return HC.Game.toast(near && near.d < 160 ? `Back the hitch up to the ${HC.TRAILERS[near.t.kind].name.toLowerCase()}'s coupler (${Math.round(near.d / TS * 3)} m off).` : 'No trailer behind you. Back up to a trailer coupler and press R.');
    }
    if (HC.TRAILERS[best.kind].gooseneck && HC.deckLoad(S, u, true) > 0) return HC.Game.toast('Clear the truck bed first: the gooseneck ball is in there.', 'warn');
    if (HC.TRAILERS[best.kind].gooseneck && !HC.EQUIP[HC.baseOf(u.kind)].gooseneck) return HC.Game.toast(`The ${HC.TRAILERS[best.kind].name.toLowerCase()} needs a gooseneck ball in the bed: the flatbed pickups and the dually pull it.`, 'warn');
    if (HC.TRAILERS[best.kind].heavy && !HC.EQUIP[HC.baseOf(u.kind)].heavyHaul) return HC.Game.toast('The lowboy is too heavy for this truck. The semi or the heavy-haul tractor pulls it.', 'warn');
    best.hitch = u.kind;
    HC.Audio.pick();
    HC.Game.toast(`${HC.TRAILERS[best.kind].name} hitched.`, 'good');
  }

  // ---------- machine on the equipment trailer ----------
  // how far a machine reaches ahead of and behind its centre (px), bucket, blade and hitched attachments included
  const PXM = 32 / 3;
  function extentOf(u, S) {
    const e = HC.EQUIP[u.kind].ext || HC.EQUIP[HC.baseOf(u.kind)].ext, r = HC.EQUIP[u.kind].r || 12;
    let front = e ? e[0] * PXM : r, back = e ? e[1] * PXM : r;
    if ((S.attachments || []).some((a) => a.on === u.kind && a.kind === 'bushhog')) back += 2.4 * PXM;
    return { front, back };
  }
  function strapToggle(u, S) {
    if (u.on) {
      u.on = null; u.v = 0;
      HC.Audio.pick();
      HC.Game.toast('Straps off. Back it down the ramps.');
      return true;
    }
    const t = S.trailers.find((tr) => HC.TRAILERS[tr.kind].deck && onDeck(tr, u));
    if (!t) return false;
    const mass = HC.EQUIP[u.kind].mass || 3, hd = HC.TRAILERS[t.kind].hd;
    if (HC.EQUIP[u.kind].heavy && !HC.TRAILERS[t.kind].heavy && !(hd && mass <= 9)) { HC.Game.toast(hd ? 'Too heavy for the deck-over (9 t max). Big machines ride the lowboy.' : 'Too heavy for the equipment trailer. Big machines ride the lowboy or the deck-over.', 'warn'); return true; }
    if (u.carrying && u.carrying.length) { HC.Game.toast('Drop what the grapple is holding first.'); return true; }
    if (t.cargo && t.cargo.length) { HC.Game.toast(`Empty the ${HC.TRAILERS[t.kind].name.toLowerCase()} first: machines only ride in an empty box.`, 'warn'); return true; }
    { const have = HC.deckLoad(S, t), add = HC.massOf(u.kind), cap = HC.payloadOf(t);
      if (have + add > cap + 0.05) { HC.Game.toast(`Over the ${HC.TRAILERS[t.kind].name.toLowerCase()}'s rated load: ${have} t aboard + ${add} t would be ${Math.round((have + add) * 10) / 10} t (rated ${cap} t).`, 'warn'); return true; } }
    if (Math.abs(u.v) > 12) { HC.Game.toast('Stop on the deck first.'); return true; }
    const used = new Set(Object.values(S.units).filter((o) => o.on && o.on.id === t.id).map((o) => o.on.slot));
    const free = HC.TRAILERS[t.kind].slots.map((_, i) => i).filter((i) => !used.has(i)).sort((a, b) => {
      const pa = slotPos(t, a), pb = slotPos(t, b);
      return HC.dist(pa.x, pa.y, u.x, u.y) - HC.dist(pb.x, pb.y, u.x, u.y);
    });
    if (!free.length) { HC.Game.toast(`The trailer is full: ${['one machine', 'two machines', 'three machines'][HC.TRAILERS[t.kind].slots.length - 1] || 'no room'} max.`); return true; }
    // sit it where nothing pokes past the front of the deck into the truck (buckets, blades, grapples), as far forward as it fits
    const [rear, front] = HC.TRAILERS[t.kind].deck, ex = extentOf(u, S);
    let off = Math.min(HC.TRAILERS[t.kind].slots[free[0]], front - ex.front);
    if (off - ex.back < rear - 14) off = Math.min(front - ex.front, rear - 14 + ex.back);
    for (const o of Object.values(S.units)) {
      if (o === u || !o.on || o.on.id !== t.id) continue;
      const oo = o.on.off ?? HC.TRAILERS[t.kind].slots[o.on.slot], oe = extentOf(o, S);
      // the one already aboard stays put; try the space behind it, else there's no room
      if (oo > off) off = Math.min(off, oo - oe.back - ex.front - 2);
      else off = Math.max(off, oo + oe.front + ex.back + 2);
      if (off + ex.front > front + 2 || off - ex.back < rear - 18) { HC.Game.toast(`No room on the deck beside the ${HC.EQUIP[o.kind].short.toLowerCase()}. Its ${HC.EQUIP[u.kind].short.toLowerCase()} would hang off.`, 'warn'); return true; }
    }
    u.on = { id: t.id, slot: free[0], off }; u.v = 0;
    HC.Audio.drop();
    HC.Game.toast(`${HC.EQUIP[u.kind].name} strapped down.`, 'good');
    return true;
  }

  // ---------- crews ride in a truck ----------
  function nearTruck(u, S, d = 48) {
    for (const k in S.units) {
      const t = S.units[k];
      if (isTruck(k) && HC.dist(u.x, u.y, t.x, t.y) < d + t.r - 16) return t;
    }
    return null;
  }
  function board(u, S) {
    const t = nearTruck(u, S);
    if (!t) return false;
    u.boarded = t.kind; u.hidden = true; u.working = false;
    if (u.fuel < fuelCap(u.kind)) refuel(u, true);
    HC.Game.take(t.kind);
    HC.Audio.pick();
    HC.Game.toast(`${HC.EQUIP[u.kind].name} climbed into the ${HC.EQUIP[t.kind].short.toLowerCase()}.`);
    return true;
  }
  function exitTruck(u, S) {
    const t = S.units[u.boarded];
    u.boarded = null; u.hidden = false;
    const side = t.a + Math.PI / 2;
    u.x = t.x + Math.cos(side) * 28; u.y = t.y + Math.sin(side) * 28;
    if (HC.Lot.tile(S.lot, u.x, u.y) === T.WATER) { u.x = t.x - Math.cos(side) * 28; u.y = t.y - Math.sin(side) * 28; }
  }

  // ---------- collisions ----------
  function collide(u, S) {
    const lot = S.lot;
    u.x = HC.clamp(u.x, u.r, lot.pw - u.r);
    u.y = HC.clamp(u.y, u.r, lot.ph - u.r);
    const near = (o, d = 60) => Math.abs(o.x - u.x) < d && Math.abs(o.y - u.y) < d;
    for (const t of lot.trees) if ((t.state === 'standing' || t.state === 'falling') && near(t)) HC.pushOutCircle(u, t.x, t.y, t.trunkR);
    if (!HC.EQUIP[u.kind].blade) for (const it of lot.items) if (it.kind === 'rock' && near(it)) HC.pushOutCircle(u, it.x, it.y, 10 * it.size); // dozers shove rocks instead
    for (const b of lot.boulders) if (near(b, 80)) HC.pushOutCircle(u, b.x, b.y, b.r);
    for (const hs of lot.houses) HC.pushOutRect(u, hs);
    for (const f of lot.fences) if (!f.broken && near(f, 70)) HC.pushOutRect(u, f);
    for (const p of lot.poles) if (near(p)) HC.pushOutCircle(u, p.x, p.y, p.r);
    for (const sh of lot.sheds) for (const p of shedPosts(sh)) if (near(p)) HC.pushOutCircle(u, p.x, p.y, 4);
    for (const k in S.units) {
      const o = S.units[k];
      if (o !== u && !o.hidden && !o.on && HC.EQUIP[k].move !== 'tow') HC.pushOutCircle(u, o.x, o.y, o.r);
    }
    for (const t of S.trailers) {
      if (t.hitch === u.kind || isBed(t)) continue;
      if (HC.TRAILERS[t.kind].solid && !(HC.TRAILERS[t.kind].deck && !t.cargo.length && HC.RIDES(u.kind))) HC.pushOutCircle(u, t.x, t.y, HC.TRAILERS[t.kind].r);
      else if ((isTruck(u.kind) && !HC.RIDES(u.kind)) || HC.EQUIP[u.kind].move === 'walk') { // trucks and crews go around the equipment trailer
        if (onDeck(t, u)) HC.pushOutCircle(u, t.x, t.y, 30);
      }
    }
  }
  function shedPosts(sh) {
    if (!sh.posts) {
      sh.posts = [];
      for (let x = sh.x; x <= sh.x + sh.w + 1; x += sh.w / 4) { sh.posts.push({ x, y: sh.y }); sh.posts.push({ x, y: sh.y + sh.h }); }
    }
    return sh.posts;
  }

  // is this machine lined up behind a trailer whose ramps are down?
  function behindRamps(u, S) {
    return S.trailers.some((t) => {
      if (!t.rampsDown || !HC.TRAILERS[t.kind].deck) return false;
      const dx = u.x - t.x, dy = u.y - t.y, c = Math.cos(t.a), s = Math.sin(t.a);
      const along = dx * c + dy * s, side = Math.abs(-dx * s + dy * c);
      return side < 24 && along < HC.TRAILERS[t.kind].deck[0] && along > HC.TRAILERS[t.kind].deck[0] - 90;
    });
  }
  const frontPt = (u, d) => ({ x: u.x + Math.cos(u.a) * d, y: u.y + Math.sin(u.a) * d });
  function nearDump(p, S, d = 50) {
    return S.trailers.find((t) => {
      if (!isDump(t)) return false;
      if (t.kind === 'gndump' && machineIn(t, S)) return false;
      if (isBed(t) && S.units[t.hitch]) { // a truck's own box sits behind the cab: measure to the middle of the box
        const u = S.units[t.hitch], back = { dumptruck2: 23, dumptruck3: 30, logtruck: 27, forwarder: 20, chiptruck: 20, chiptruck2: 26 }[HC.baseOf(u.kind)] || 18;
        return HC.dist(p.x, p.y, u.x - Math.cos(u.a) * back, u.y - Math.sin(u.a) * back) < d + 22;
      }
      return HC.dist(p.x, p.y, t.x, t.y) < d;
    });
  }
  // fuel: from a truck's fuel tank, or a pump in a yard you own
  function nearFuel(p, S) {
    if (nearTruck(p, S, 56)) return true;
    return S.lot.pumps.some((pm) => HC.dist(p.x, p.y, pm.x, pm.y) < 64 && HC.World.yardAt(pm.x, pm.y));
  }
  function refuel(u, quiet) {
    const cap = fuelCap(u.kind), need = cap - u.fuel;
    if (need < 0.5) return false;
    const cost = need * HC.FUEL_PRICE;
    HC.company.money -= cost;
    if (HC.session.job) HC.session.costs.fuel += cost;
    u.fuel = cap;
    if (!quiet) { HC.Audio.fuel(); HC.Game.toast(`Refueled the ${HC.EQUIP[u.kind].short.toLowerCase()} (${HC.money(cost)})`); }
    return true;
  }

  // ---------- chainsaw crew ----------
  function sawTarget(u, S) {
    let best = null, bd = 28;
    for (const t of S.lot.trees) {
      if (Math.abs(t.x - u.x) > 260 || Math.abs(t.y - u.y) > 260) continue;
      if (t.state === 'standing') {
        const d = HC.dist(u.x, u.y, t.x, t.y) - t.trunkR;
        if (d < bd) { bd = d; best = { type: 'fell', obj: t }; }
      } else if (t.state === 'felled') {
        const ex = t.x + Math.cos(t.fallA) * t.len * 0.85, ey = t.y + Math.sin(t.fallA) * t.len * 0.85;
        const d = HC.segPointDist(t.x, t.y, ex, ey, u.x, u.y) - t.trunkR;
        if (d < bd) { bd = d; best = { type: 'buck', obj: t }; }
      }
    }
    for (const b of S.lot.bushes) {
      if (Math.abs(b.x - u.x) > 60 || Math.abs(b.y - u.y) > 60) continue;
      const d = HC.dist(u.x, u.y, b.x, b.y) - b.r;
      if (d < bd) { bd = d; best = { type: 'bush', obj: b }; }
    }
    return best;
  }

  const sawNeedsFuel = (u, S) => holding(u, S) && S.saw.fuel < SAW_CAP - 0.5 && nearFuel(u, S);
  function crewInteract(u, S, other) {
    if (sawNeedsFuel(u, S)) { refuelSaw(S); return; }
    if (board(u, S)) return;
    HC.Game.toast(other);
  }

  // ---------- the chainsaw: a stand-alone item someone has to carry ----------
  const SAW_CAP = 80;
  const holding = (u, S) => S.saw && S.saw.holder === u.kind;
  function sawPos(S) {
    const h = S.saw.holder && S.units[S.saw.holder];
    return h ? { x: h.x, y: h.y } : { x: S.saw.x, y: S.saw.y };
  }
  function sawGrab(u, S) {
    if (!S.saw) return HC.Game.toast('You don\'t have a chainsaw yet. Buy one in the shop (J).');
    if (HC.baseOf(u.kind) !== 'op') return HC.Game.toast('Climb out (F) to run the chainsaw.');
    if (holding(u, S)) { // set it down
      S.saw.holder = null; S.saw.x = u.x + Math.cos(u.a) * 14; S.saw.y = u.y + Math.sin(u.a) * 14; S.saw.a = u.a;
      HC.Audio.drop();
      return HC.Game.toast('Chainsaw set down.');
    }
    const p = sawPos(S), holder = S.saw.holder && S.units[S.saw.holder];
    if (HC.dist(u.x, u.y, p.x, p.y) > 44) return HC.Game.toast(`The chainsaw is ${holder ? (holder.boarded ? `in the ${HC.EQUIP[holder.boarded].short.toLowerCase()}` : `with the ${HC.EQUIP[holder.kind].short.toLowerCase()}`) : 'on the ground'}, ${Math.round(HC.dist(u.x, u.y, p.x, p.y) / TS * 3)} m away.`);
    if (holder && holder.boarded) return HC.Game.toast('It\'s in a truck with the crew. Let them out first.');
    S.saw.holder = u.kind;
    HC.Audio.pick();
    HC.Game.toast(holder ? `You took the chainsaw from the ${HC.EQUIP[holder.kind].short.toLowerCase()}.` : 'Picked up the chainsaw.');
  }
  function refuelSaw(S, quiet) {
    const need = SAW_CAP - S.saw.fuel;
    if (need < 0.5) return false;
    const cost = need * HC.FUEL_PRICE;
    HC.company.money -= cost; if (S.job) S.costs.fuel += cost;
    S.saw.fuel = SAW_CAP;
    if (!quiet) { HC.Audio.fuel(); HC.Game.toast(`Filled the chainsaw (${HC.money(cost)}).`); }
    return true;
  }
  function sawWork(u, dt, S, active) {
    const tg = active && holding(u, S) ? sawTarget(u, S) : null;
    if (active) S.focus = tg;
    u.working = false;
    if (tg && tg.type === 'fell') { const m = HC.input.mouse; tg.aim = Math.atan2(m.wy - tg.obj.y, m.wx - tg.obj.x); }
    if (!active || !HC.input.mouse.down) return;
    if (!S.saw) return HC.Game.hintOnce('You need a chainsaw. Buy one in the shop (J).');
    if (!holding(u, S)) return HC.Game.hintOnce('No chainsaw in hand. Walk to it and press G to pick it up.');
    if (!tg) return;
    if (S.saw.fuel <= 0) { HC.Game.hintOnce('The chainsaw is out of fuel. Walk it to a truck or a yard pump and press E.'); return; }
    if (cond('saw') <= 0) { HC.Game.hintOnce('The chainsaw is worn out. Repair it at a yard.'); return; }
    u.working = true;
    const rate = HC.sawSpec().cut * condFactor('saw') * HC.Co.crew('climber', 1.15, 1);
    S.saw.fuel = Math.max(0, S.saw.fuel - HC.EQUIP.saw.fuelUse * dt * HC.Co.mult('fuelUse') * (HC.FUEL_BURN || 1));
    if (S.saw.fuel < SAW_CAP * 0.15 && S.saw.fuel > 0) HC.Game.hintOnce('Chainsaw is low on fuel. Walk it to a truck or a yard pump and press E.');
    HC.company.cond.saw = Math.max(0, cond('saw') - HC.EQUIP.saw.wear * dt);
    {
        const o = tg.obj;
        if (tg.type === 'fell') {
          const d = HC.TREES[o.type];
          if (!o.marked && o.cut === 0 && !o.warned) { o.warned = true; HC.Game.toast(S.job ? 'That tree is not part of the job. The owner wants it kept.' : "That's not your tree. Cutting it will cost you.", 'warn'); }
          o.cut += (dt / (d.cut * o.s)) * rate;
          HC.Game.dust(o.x + Math.cos(u.a + Math.PI) * 4, o.y, '#e8c98a', 1);
          if (d.hazard && o.cut > 0.4 && !o.creaked) { o.creaked = true; HC.Audio.creak(); HC.Game.toast('The dead ash is creaking. Watch it!', 'warn'); }
          if (d.hazard && o.cut > 0.55 && !HC.Game.bucketTree(o) && Math.random() < dt * 0.35) { HC.Game.toast('The hazard tree let go early!', 'bad'); HC.Game.fell(o, tg.aim + HC.rand(-1.1, 1.1), true); }
          else if (o.cut >= 1) HC.Game.fell(o, tg.aim);
        } else if (tg.type === 'buck') {
          const d = HC.TREES[o.type];
          o.buck += (dt / (d.buck * o.s)) * rate * HC.Co.crew('ground', 1.6, 1);
          const p = HC.rand(0.2, 0.8);
          HC.Game.dust(o.x + Math.cos(o.fallA) * o.len * p, o.y + Math.sin(o.fallA) * o.len * p, '#e8c98a', 1);
          if (o.buck >= 1) HC.Game.buck(o);
        } else if (tg.type === 'bush') {
          o.hp += (dt / 1.6) * rate;
          HC.Game.dust(o.x, o.y, '#5f8f3a', 1);
          if (o.hp >= 1) HC.Game.cutBush(o);
        }
    }
  }
  function sawHint(u, S, idle) {
    const f = S.focus;
    if (holding(u, S)) {
      if (f && f.type === 'fell') return `${HC.TREES[f.obj.type].name}${f.obj.marked ? ' (flagged)' : ''}: aim where it should fall, hold click to cut. ${Math.min(100, Math.round(f.obj.cut * 100))}%`;
      if (f && f.type === 'buck') return `Downed tree: hold click to buck into logs. ${Math.min(100, Math.round(f.obj.buck * 100))}%`;
      if (f && f.type === 'bush') return 'Brush: hold click to cut it down.';
    }
    if (sawNeedsFuel(u, S)) return `E: fill the chainsaw (${Math.round((S.saw.fuel / SAW_CAP) * 100)}% left)`;
    if (nearTruck(u, S) && u.kind !== 'op') return 'E: climb into the truck';
    if (!holding(u, S) && S.saw) {
      const p = sawPos(S), d = HC.dist(u.x, u.y, p.x, p.y);
      if (d < 44 && !(S.saw.holder && S.units[S.saw.holder].boarded)) return 'G: pick up the chainsaw';
    }
    return holding(u, S) ? idle + ' G sets the saw down.' : idle;
  }

  // a chipper whose infeed you're standing at
  function chipperBy(u, S) {
    for (const k in S.units) {
      const c = S.units[k];
      if (!['chipper', 'chipper2'].includes(HC.baseOf(k)) || c.hidden || c.on) continue;
      const ix = c.x - Math.cos(c.a) * 30, iy = c.y - Math.sin(c.a) * 30;
      if (HC.dist(u.x, u.y, ix, iy) < 50) return c;
    }
    return null;
  }
  const KINDS = {
    op: {
      update(u, dt, S, active) {
        if (active) walk(u, dt, HC.EQUIP.op); else u.moving = false;
        const ch = active && chipperBy(u, S); // at the infeed, the click feeds the chipper (saw in hand or not)
        if (ch && HC.input.mouse.down) return KINDS[ch.kind].update(ch, dt, S, true); // feeding the chipper by hand
        sawWork(u, dt, S, active);
      },
      interact(u, S) { if (sawNeedsFuel(u, S)) { refuelSaw(S); return; } HC.Game.climb(); },
      hint(u, S) {
        const m = HC.Game.nearestMachine(u, S);
        if (chipperBy(u, S)) return 'At the chipper: hold left click to feed it the brush beside the infeed.';
        if (holding(u, S) && (S.focus || sawNeedsFuel(u, S))) return sawHint(u, S, '');
        return m ? `F: climb into the ${HC.EQUIP[m.kind].short.toLowerCase()}` : sawHint(u, S, S.saw ? 'On foot. F beside a machine climbs in; G picks up the chainsaw.' : 'On foot. F beside a machine climbs in. Buy a chainsaw in the shop (J) to cut trees.');
      },
    },
    saw: {
      update(u, dt, S, active) {
        if (active) walk(u, dt, HC.EQUIP.saw);
        sawWork(u, dt, S, active);
      },
      interact(u, S) { crewInteract(u, S, 'Nothing to do here. Walk to a truck to ride along or refuel the chainsaw.'); },
      hint(u, S) { return sawHint(u, S, 'Walk up to a tree. The cone shows where it can land.'); },
    },

    skid: {
      update(u, dt, S, active) {
        const att = attachedTo(S, u.kind);
        u.mode = att ? (att.kind === 'mulcher' ? 1 : att.kind === 'brushcut' ? 2 : att.kind === 'forks' ? 3 : 0) : -1;
        boom(u, dt, active);
        // arms up = less stable: crawl
        if (active) tank(u, dt, HC.EQUIP[u.kind], (1 - u.carrying.length * 0.06) * (u.armT > 0.6 ? 0.55 : 1));
        else { u.v *= 0.8; u.moving = false; }
        if (active) KINDS.skid.work(u, dt, S);
      },
      work() {},
      reach: (u) => HC.EQUIP[u.kind].reach || 24,
      cap: (u) => ((u && HC.EQUIP[u.kind].grab) || 5) + HC.Co.level('grapple'), // mini 3, skid steer 5, plus grapple upgrades
      pickable(u, S) {
        const fp = frontPt(u, KINDS.skid.reach(u));
        let best = null, bd = 30;
        for (const it of S.lot.items) {
          const pr = it.kind === 'pile' ? 34 * (it.size || 1) : 0; // reach a push pile from its edge
          if (Math.abs(it.x - fp.x) > 40 + pr || Math.abs(it.y - fp.y) > 40 + pr) continue;
          const d = HC.dist(fp.x, fp.y, it.x, it.y) - pr;
          if (d < bd) { bd = d; best = it; }
        }
        return best;
      },
      interact(u, S) {
        if (!u.carrying.length && strapToggle(u, S)) return;
        const fp = frontPt(u, KINDS.skid.reach(u));
        const cap = KINDS.skid.cap(u);
        if (u.carrying.length && KINDS.skid.deposit && KINDS.skid.deposit(u, S, fp)) return; // chipper first: any arm height
        const dump = nearDump(fp, S);
        if (u.carrying.length && dump) {
          if (u.armT < 0.65) return HC.Game.toast('Raise the arms (hold T) so the load clears the side, then press E.', 'warn');
          return HC.Game.loadTrailer(u, dump);
        }
        const it = u.mode === 0 && u.carrying.length < cap ? KINDS.skid.pickable(u, S) : null;
        if (it) {
          if (u.armT > 0.3) return HC.Game.toast('Lower the grapple to the ground (hold G) to grab it.', 'warn');
          u.carrying.push(HC.Game.takeItem(it)); HC.Audio.pick(); return;
        }
        if (u.mode === -1 && KINDS.skid.pickable(u, S)) return HC.Game.toast('No attachment on the quick-attach. Drive up to the grapple and press Q.');
        if (u.carrying.length) {
          HC.Game.dropItems(u, fp);
          return;
        }
        if (nearFuel(u, S)) { if (refuel(u)) return; return HC.Game.toast('Your tank is already full.'); }
        const felled = S.lot.trees.find((t) => t.state === 'felled' && HC.segPointDist(t.x, t.y, t.x + Math.cos(t.fallA) * t.len, t.y + Math.sin(t.fallA) * t.len, fp.x, fp.y) < 20);
        if (felled) return HC.Game.toast('Buck that tree into logs with the chainsaw first (climb out with F, G for the saw).');
        HC.Game.toast(u.mode === 1 ? 'The mulcher runs on left click. Q swaps back to the grapple.' : u.mode === 2 ? 'The brush cutter runs on left click (lower it first with G). Q swaps heads.' : 'Nothing in reach of the grapple.');
      },
      hint(u, S) {
        if (u.on) return 'Strapped to the equipment trailer. E: take the straps off.';
        if (u.fuel <= 0) return 'Out of fuel. E: have a fuel can brought out ($25 + 15 min).';
        const deck = S.trailers.find((t) => onDeck(t, u));
        if (deck && !u.carrying.length) return 'On the trailer deck. Stop and press E to strap it down.';
        if (behindRamps(u, S)) return 'Ramps are down. Drive straight up onto the deck, stop, and press E to strap it down.';
        const near = HC.Game.attachmentNear && HC.Game.attachmentNear(u, S);
        if (u.mode === -1) return near ? `Q: lock the ${near.kind === 'mulcher' ? 'mulcher head' : near.kind === 'brushcut' ? 'brush cutter' : 'grapple'} onto the quick-attach` : 'No attachment. Drive the quick-attach up to an attachment and press Q.';
        if (u.mode === 1) return u.armT > 0.35 ? 'Mulcher head is up. Hold G to lower it to the ground, then hold left click.' : 'Mulcher: hold left click to grind brush and saplings. Keep the head off the big trees. Q drops the head.';
        if (u.mode === 2) return u.armT > 0.35 ? 'Brush cutter is up. Hold G to lower it, then hold left click and drive.' : 'Brush cutter: hold left click and drive over tall grass, briars and saplings. Q swaps heads at the yard.';
        const fp = frontPt(u, KINDS.skid.reach(u));
        const feed = KINDS.skid.feedHint && KINDS.skid.feedHint(u, S, fp);
        if (feed) return feed;
        if (u.carrying.length && nearDump(fp, S)) return u.armT < 0.65 ? 'Hold T to raise the arms over the side, then E to dump.' : `E: dump ${u.carrying.length} item(s) into the load`;
        const ch = Object.values(S.units).find((c) => ['chipper', 'chipper2'].includes(HC.baseOf(c.kind)) && HC.dist(fp.x, fp.y, c.x, c.y) < 50);
        if (u.carrying.some((c) => c.kind === 'brush') && ch) return 'E: drop the brush into the chipper';
        const it = KINDS.skid.pickable(u, S);
        const what = it && (it.kind === 'pile' ? `a piece off the push pile (${it.content.length} left)` : `the ${it.kind}`);
        if (it && u.carrying.length < KINDS.skid.cap(u)) return u.armT > 0.3 ? `Hold G to lower the grapple, then E to grab ${what}.` : `E: grab ${what}`;
        if (u.carrying.length) return `Carrying ${u.carrying.map((c) => c.kind).join(', ')}. Drive to a dump trailer, raise the arms (T) and press E.`;
        if (nearFuel(u, S) && u.fuel < fuelCap(u.kind) - 1) return 'E: refuel';
        return 'Drive the grapple up to logs, brush or rocks and press E.';
      },
    },
  };

  HC.Units = {
    KINDS, create, collide, groundFactor, slopeAlong, refuel, fuelCap, cond, frontPt, nearDump, nearFuel, nearTruck, walk, tank, car, burn, wear, condFactor,
    // after everything has moved this frame: machines strapped to a trailer sit exactly where their trailer ended up
    snapRiders(S) {
      for (const k in S.units) {
        const u = S.units[k];
        if (!u.on) continue;
        const t = S.trailers.find((tr) => tr.id === u.on.id);
        if (!t) { u.on = null; continue; }
        const p = slotPos(t, u.on.slot, u.on.off);
        u.x = p.x; u.y = p.y; u.a = t.a;
      }
    },
    tow, hitchToggle, machineIn, strapToggle, behindRamps, boom, attachedTo, sawGrab, sawPos, refuelSaw, SAW_CAP, onDeck, slotPos, coupler, hitchPt, board, exitTruck, blockedAt, isTruck, isBed, isDump, shedPosts,
    update(u, dt, S, active) {
      if (u.boarded) { const t = S.units[u.boarded]; u.x = t.x; u.y = t.y; u.a = t.a; return; }
      if (u.on) {
        const t = S.trailers.find((tr) => tr.id === u.on.id);
        const p = slotPos(t, u.on.slot, u.on.off);
        u.x = p.x; u.y = p.y; u.a = t.a; u.v = 0; u.moving = false; u.working = false;
        return;
      }
      if (HC.EQUIP[u.kind].move === 'tow') { KINDS[u.kind].update(u, dt, S, active); return; }
      if (HC.DRIVEN(u.kind) && !u.occupied) active = false; // nobody in the seat: it just sits there
      const px = u.x, py = u.y;
      const towed = S.trailers.filter((t) => t.hitch === u.kind && !isBed(t)).map((t) => ({ t, x: t.x, y: t.y, a: t.a }));
      KINDS[u.kind].update(u, dt, S, active);
      collide(u, S);
      const under = HC.Lot.tile(S.lot, u.x, u.y);
      if (under === T.WATER || under === T.ROCKFACE) { u.x = px; u.y = py; u.v = 0; u.vx = 0; u.vy = 0; }
      if (active) impact(u, px, py, dt);
      if (isTruck(u.kind)) {
        tow(u, S);
        // a trailer that would run into a tree, house or the creek stops the rig
        for (const o of towed) {
          if (blockedAt(S, o.t.x, o.t.y, HC.TRAILERS[o.t.kind].r) && !blockedAt(S, o.x, o.y, HC.TRAILERS[o.t.kind].r)) {
            u.x = px; u.y = py; u.v = 0; // stop dead (no bounce: bouncing re-snags every frame)
            Object.assign(o.t, { x: o.x, y: o.y, a: o.a });
            HC.Game.hintOnce('The trailer is snagged. Back up and take a wider line.');
          }
        }
      }
      if (u.carrying.length) {
        const fp = frontPt(u, KINDS.skid.reach(u) - 2);
        u.carrying.forEach((c, i) => { c.x = fp.x; c.y = fp.y - i * 3; c.a = u.a + Math.PI / 2; });
      }
    },
    interact(u, S) {
      if (u.fuel <= 0 && !nearFuel(u, S) && HC.EQUIP[u.kind].fuelCap && HC.EQUIP[u.kind].move !== 'walk' && HC.EQUIP[u.kind].move !== 'tow') {
        HC.company.money -= 25; if (S.job) S.costs.fuel += 25; S.time += 15; if (S.stage === 'onsite') S.workMins += 15;
        refuel(u);
        return HC.Game.toast('A fuel can was brought out from the shop: $25 and 15 minutes. (A fuel truck parked alongside does it for the price of the fuel.)');
      }
      KINDS[u.kind].interact(u, S);
    },
    mode(u, S) { if (KINDS[u.kind].mode) KINDS[u.kind].mode(u, S); },
    hint(u, S) { return KINDS[u.kind].hint(u, S); },
  };
})();
