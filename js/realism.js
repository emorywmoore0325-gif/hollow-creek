// Hollow Creek — the hard parts of the trade: oil and grease services, worn machines breaking down, heavy machines bogging
// down in mud after rain, and a service truck that repairs, services and winches machines out right on the job.
'use strict';
(() => {
  const U = HC.Units, TS = HC.TILE, T = HC.T;
  HC.SERVICE_EVERY = 900; // seconds of running between oil changes and grease (a few working days)

  const C = () => HC.company;
  const svc = (k) => ((C().svc = C().svc || {})[k] || 0);
  const engine = (k) => HC.EQUIP[k] && HC.EQUIP[k].fuelCap > 0 && HC.EQUIP[k].move !== 'walk';
  HC.serviceDue = (k) => engine(k) && svc(k) > HC.SERVICE_EVERY;
  HC.serviceCost = (k) => Math.round(60 + (HC.massOf ? HC.massOf(k) : 3) * 14);
  const repairCost = (k) => Math.round((100 - (C().cond[k] ?? 100)) * (HC.EQUIP[k].repair || HC.EQUIP[HC.baseOf(k)].repair || 5));
  function doService(k) { (C().svc = C().svc || {})[k] = 0; }
  HC.doService = doService;
  const mudTile = (S, x, y) => [T.GRASS, T.TALL, T.MOWED, T.DIRT, T.MULCH, T.BED, T.SOD].includes(HC.Lot.tile(S.lot, x, y));
  const name = (k) => HC.EQUIP[HC.baseOf(k)].short.toLowerCase();

  // ---------- each frame: hours on the meter, wear, breakdowns and bogging down ----------
  const baseUpdate = U.update;
  U.update = function (u, dt, S, active) {
    if (u.broken || u.stuck) { // it sits where it is until it's fixed or pulled out
      u.v = 0; u.vx = 0; u.vy = 0; u.moving = false; u.working = false;
      if (u.stuck && active && (HC.input.keys.has('w') || HC.input.keys.has('s')) && Math.random() < dt * 10) HC.Game.dust(u.x + HC.rand(-u.r, u.r), u.y + HC.rand(-u.r, u.r), '#5a4630', 3, 60); // wheels and tracks spinning in the mud
      return;
    }
    baseUpdate.apply(this, arguments);
    const k = u.kind;
    if (!engine(k) || u.hidden || u.on || u.boarded || !(u.moving || u.working)) return;
    C().svc = C().svc || {}; C().svc[k] = svc(k) + dt;
    const due = svc(k) > HC.SERVICE_EVERY, cond = C().cond[k] ?? 100;
    if (due) U.wear(u, (HC.EQUIP[k].wear || 0.02) * dt); // dirty oil and dry pins: wear doubles
    if (active && due) HC.Game.hintOnce(`The ${name(k)} is due for an oil change and grease. Service it at your yard (phone > My equipment) or with the service truck.`);
    // breakdowns: worn-out or long overdue machines can quit mid-job
    const p = (cond < 35 ? (35 - cond) / 35 * 0.004 : 0) + (due ? 0.0008 * Math.min(3, svc(k) / HC.SERVICE_EVERY) : 0);
    if (p && Math.random() < p * dt) {
      u.broken = true; u.v = 0; HC.Audio.crash && HC.Audio.crash();
      HC.Game.toast(`The ${name(k)} broke down${cond < 35 ? ' (badly worn)' : ' (overdue for service)'}. Bring the service truck, or climb in and press E to call a mechanic.`, 'bad');
      return;
    }
    // mud: heavy machines and trucks off the road after rain can bog down
    const spec = HC.EQUIP[k], mass = HC.massOf ? HC.massOf(k) : 3, wheeled = spec.move === 'car';
    if (S.weather && S.weather.wet && Math.abs(u.v || 0) > 4 && mass >= 5 && mudTile(S, u.x, u.y) && HC.Lot.tile(S.lot, u.x, u.y) !== T.ROAD) {
      u.v *= 1 - dt * 0.6; // it drags in the soft ground
      if (Math.random() < dt * 0.008 * (mass / 8) * (wheeled ? 1.8 : 1)) {
        u.stuck = true; u.v = 0;
        HC.Game.toast(`The ${name(k)} is stuck in the mud. Pull it out with another truck or machine (back up close and press R), winch it with the service truck (E), or press E in it to call a wrecker.`, 'warn');
      }
    }
  };

  // ---------- E: mechanic or wrecker from inside a broken or stuck machine; the service truck's work on whatever it's parked beside ----------
  function nearest(u, S, d, test) {
    let best = null, bd = d;
    for (const k in S.units) { const o = S.units[k]; if (o === u || o.hidden || o.boarded || !test(o)) continue; const dd = HC.dist(o.x, o.y, u.x, u.y) - (o.r || 12); if (dd < bd) { bd = dd; best = o; } }
    return best;
  }
  const baseInteract = U.interact;
  U.interact = function (u, S) {
    if (u && u.broken) {
      const cost = 260 + Math.round(repairCost(u.kind) * 0.3);
      HC.company.money -= cost; if (S.job) S.costs.damage += cost; S.time += 60; if (S.stage === 'onsite') S.workMins += 60;
      u.broken = false; C().cond[u.kind] = Math.max(C().cond[u.kind] ?? 0, 40); doService(u.kind);
      return HC.Game.toast(`A mobile mechanic came out: ${HC.money(cost)} and an hour. The ${name(u.kind)} runs again (serviced, patched up to 40%). The service truck does this for a lot less.`, 'warn');
    }
    if (u && u.stuck) {
      const cost = 280; HC.company.money -= cost; if (S.job) S.costs.damage += cost; S.time += 45; if (S.stage === 'onsite') S.workMins += 45;
      u.stuck = false; u.x += Math.cos(u.a + Math.PI) * 14; u.y += Math.sin(u.a + Math.PI) * 14;
      return HC.Game.toast(`A wrecker winched the ${name(u.kind)} out: ${HC.money(cost)} and 45 minutes.`, 'warn');
    }
    if (u && HC.EQUIP[HC.baseOf(u.kind)] && HC.EQUIP[HC.baseOf(u.kind)].service && Math.abs(u.v || 0) < 4) {
      const o = nearest(u, S, 46, (q) => engine(q.kind) || q.stuck);
      if (o) {
        if (o.stuck) { o.stuck = false; o.x += (u.x - o.x) * 0.15; o.y += (u.y - o.y) * 0.15; S.time += 15; HC.Audio.pick(); return HC.Game.toast(`Winched the ${name(o.kind)} out of the mud.`, 'good'); }
        const parts = o.broken ? 90 : 0, svcCost = HC.serviceDue(o.kind) || svc(o.kind) > HC.SERVICE_EVERY * 0.5 ? HC.serviceCost(o.kind) : 0, rep = repairCost(o.kind);
        if (!parts && !svcCost && !rep) return HC.Game.toast(`The ${name(o.kind)} is in good shape: serviced and no wear to fix.`);
        const cost = parts + svcCost + rep;
        if (HC.company.money < cost) return HC.Game.toast(`That's ${HC.money(cost)} of work. Not enough money.`, 'warn');
        HC.company.money -= cost; if (S.job) S.costs.damage += cost;
        o.broken = false; if (svcCost) doService(o.kind); C().cond[o.kind] = 100;
        const mins = (parts ? 20 : 0) + (svcCost ? 15 : 0) + Math.ceil(rep / 60) * 5; S.time += mins; if (S.stage === 'onsite') S.workMins += mins;
        HC.Audio.cash();
        return HC.Game.toast(`Service truck: ${[parts ? 'fixed the breakdown' : '', svcCost ? 'oil and grease' : '', rep ? 'repaired the wear' : ''].filter(Boolean).join(', ')} on the ${name(o.kind)} for ${HC.money(cost)} (${mins} min).`, 'good');
      }
    }
    return baseInteract.apply(this, arguments);
  };
  const baseHint = U.hint;
  U.hint = function (u, S) {
    if (u && u.broken) return `Broken down. E: call a mobile mechanic (about ${HC.money(260 + Math.round(repairCost(u.kind) * 0.3))}, 1 hour), or bring the service truck alongside.`;
    if (u && u.stuck) return 'Stuck in the mud. E: call a wrecker ($280, 45 min), or have another truck or machine back up close and press R to pull it out.';
    if (u && HC.EQUIP[HC.baseOf(u.kind)] && HC.EQUIP[HC.baseOf(u.kind)].service) {
      const o = nearest(u, S, 46, (q) => engine(q.kind) || q.stuck);
      if (o) return o.stuck ? `E: winch the ${name(o.kind)} out of the mud` : o.broken ? `E: fix the ${name(o.kind)}'s breakdown on the spot` : (HC.serviceDue(o.kind) || repairCost(o.kind)) ? `E: service and repair the ${name(o.kind)} (${HC.money(HC.serviceCost(o.kind) * (HC.serviceDue(o.kind) ? 1 : 0) + repairCost(o.kind))})` : `The ${name(o.kind)} is in good shape.`;
    }
    return baseHint.apply(this, arguments);
  };
  // R in any truck or machine backed up close to a stuck one: chain up and pull it out
  const baseHitch = U.hitchToggle;
  U.hitchToggle = function (u, S) {
    if (u && !u.stuck) {
      const o = nearest(u, S, 40, (q) => q.stuck);
      if (o) { o.stuck = false; o.x += (u.x - o.x) * 0.2; o.y += (u.y - o.y) * 0.2; S.time += 10; HC.Audio.pick(); return HC.Game.toast(`Chained up and pulled the ${name(o.kind)} out of the mud.`, 'good'); }
    }
    return baseHitch.apply(this, arguments);
  };
  // the service truck pulls bumper-pull trailers only
  const hitch2 = U.hitchToggle;
  U.hitchToggle = function (u, S) {
    if (u && HC.EQUIP[HC.baseOf(u.kind)] && HC.EQUIP[HC.baseOf(u.kind)].service && !S.trailers.some((t) => t.hitch === u.kind)) {
      const t = S.trailers.find((q) => !q.hitch && !U.isBed(q) && HC.dist(U.coupler(q).x, U.coupler(q).y, u.x - Math.cos(u.a) * 40, u.y - Math.sin(u.a) * 40) < 34);
      if (t && HC.TRAILERS[t.kind] && (HC.TRAILERS[t.kind].gooseneck || HC.TRAILERS[t.kind].heavy)) return HC.Game.toast('The service truck pulls bumper-pull trailers only (no goosenecks or the lowboy).', 'warn');
    }
    return hitch2.apply(this, arguments);
  };
})();
