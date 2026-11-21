// Hollow Creek — machines wear out. Every engine has an hour meter; past its working life a machine breaks down more and more,
// and in the end it fails for good: a blown engine or a cracked frame. Then it's a major overhaul or the scrapyard.
'use strict';
(() => {
  const U = HC.Units, C = () => HC.company;
  const engine = (k) => HC.EQUIP[k] && HC.EQUIP[k].fuelCap > 0 && HC.EQUIP[k].move !== 'walk';
  const spec = (k) => HC.EQUIP[k] || {}, base = (k) => HC.EQUIP[HC.baseOf(k)] || spec(k);
  const name = (k) => (base(k).short || spec(k).name || k).toLowerCase();
  const listPrice = (k) => spec(k).price || base(k).price || 0;
  const mass = (k) => (HC.massOf ? HC.massOf(k) : 3);

  // working life in engine hours: small machines and pickups wear out sooner than big iron
  HC.lifeHours = (k) => Math.round((900 + mass(k) * 70) / 50) * 50;
  HC.hours = (k) => ((C().hours = C().hours || {})[k] || 0);
  const age = (k) => HC.hours(k) - ((C().rebuilt || {})[k] || 0); // hours since new (or since the last overhaul)
  HC.wornOut = (k) => engine(k) && age(k) > HC.lifeHours(k);
  HC.isDead = (k) => !!(C().dead || {})[k];
  HC.overhaulCost = (k) => Math.round(listPrice(k) * 0.32 / 50) * 50;
  HC.scrapValue = (k) => Math.round((listPrice(k) * 0.05 + mass(k) * 110) / 10) * 10;
  HC.HAUL_FEE = (k) => 300 + Math.round(mass(k) * 25);
  const fmtH = (h) => `${Math.floor(h).toLocaleString()} h`;
  HC.hoursText = (k) => `${fmtH(HC.hours(k))} · life ${fmtH(HC.lifeHours(k))}`;

  // owned machines from an older save get a believable meter reading from their condition
  function seed() {
    const c = C(); if (!c || c.hoursSeeded) return; c.hours = c.hours || {};
    for (const k in c.owned) if (c.owned[k] && engine(k) && c.hours[k] == null) c.hours[k] = Math.round(HC.lifeHours(k) * (1 - (c.cond[k] ?? 100) / 100) * 0.5);
    c.hoursSeeded = true;
  }

  // ---------- each frame: the meter runs while the engine works; past its life it can fail for good ----------
  const baseUpdate = U.update;
  U.update = function (u, dt, S, active) {
    const k = u.kind;
    if (HC.isDead(k)) { u.broken = true; u.dead = true; }
    baseUpdate.apply(this, arguments);
    if (!engine(k) || u.hidden || u.on || u.boarded || u.broken || !(u.moving || u.working)) return;
    seed();
    C().hours[k] = HC.hours(k) + dt / 60; // one game minute per second: dt/60 engine hours
    const life = HC.lifeHours(k), a = age(k);
    if (a > life * 0.9 && active) HC.Game.hintOnce(`The ${name(k)} is near the end of its life (${fmtH(a)} of ${fmtH(life)}). It'll start failing: overhaul it (phone > My equipment) or replace it.`);
    if (a <= life) return;
    const over = a / life - 1, cond = C().cond[k] ?? 100;
    if (Math.random() < dt * (0.0012 + over * 0.004) * (cond < 40 ? 2 : 1)) {
      (C().dead = C().dead || {})[k] = true; u.broken = true; u.dead = true; u.v = 0; C().cond[k] = 0;
      HC.Audio.crash && HC.Audio.crash();
      HC.Game.toast(`The ${name(k)} is finished: ${HC.EQUIP[k].move === 'car' ? 'the engine blew' : HC.pick(['the engine blew', 'the main hydraulic pump failed', 'the frame cracked'])} at ${fmtH(HC.hours(k))}. It won't run again without a major overhaul (${HC.money(HC.overhaulCost(k))}), or scrap it at Hollow Creek Salvage (${HC.money(HC.scrapValue(k))}). Phone > My equipment.`, 'bad');
    }
  };

  // a dead machine can't be patched up on site
  const baseInteract = U.interact;
  U.interact = function (u, S) {
    if (u && HC.isDead(u.kind)) return HC.Game.toast(`The ${name(u.kind)} is worn out for good. Phone > My equipment: overhaul it (${HC.money(HC.overhaulCost(u.kind))}), have it hauled, or scrap it.`, 'warn');
    if (u && base(u.kind).service) { // the service truck can't fix one that's finished
      const o = Object.values(S.units).find((q) => q !== u && !q.hidden && HC.isDead(q.kind) && HC.dist(q.x, q.y, u.x, u.y) - (q.r || 12) < 46);
      if (o) return HC.Game.toast(`The ${name(o.kind)} needs a full overhaul in a shop, not a roadside fix. Haul it home or to the scrapyard.`, 'warn');
    }
    return baseInteract.apply(this, arguments);
  };
  const baseHint = U.hint;
  U.hint = function (u, S) {
    if (u && HC.isDead(u.kind)) return `Worn out: won't run. Phone > My equipment: overhaul ${HC.money(HC.overhaulCost(u.kind))}, haul it, or scrap it for ${HC.money(HC.scrapValue(u.kind))}.`;
    return baseHint.apply(this, arguments);
  };

  // ---------- the choices: overhaul, a rollback to haul it, or scrap ----------
  const atScrapyard = (u) => HC.world.scrapyard && u && HC.inRect(u.x, u.y, HC.world.scrapyard);
  HC.Wear = {
    atScrapyard,
    overhaul(k) {
      const c = C(), u = HC.session.units[k], cost = HC.overhaulCost(k);
      if (c.money < cost) return `An overhaul is ${HC.money(cost)}. Not enough money.`;
      c.money -= cost;
      (c.rebuilt = c.rebuilt || {})[k] = HC.hours(k) - HC.lifeHours(k) * 0.15; // like a machine with 15% of its life used
      if (c.dead) delete c.dead[k];
      c.cond[k] = 100; HC.doService && HC.doService(k);
      if (u) { u.broken = false; u.dead = false; u.stuck = false; }
      HC.Audio.cash(); HC.Save.save();
      return `Overhauled the ${name(k)}: new engine, pumps and pins for ${HC.money(cost)}. Good for about ${fmtH(HC.lifeHours(k) * 0.85)} more.`;
    },
    haul(k) { // a rollback brings it to your yard
      const S = HC.session, c = C(), u = S.units[k], fee = HC.HAUL_FEE(k);
      if (!u) return null;
      if (c.money < fee) return `The rollback is ${HC.money(fee)}. Not enough money.`;
      c.money -= fee; if (S.job) S.costs.damage += fee;
      const bay = HC.Game.freeBay('machine'); Object.assign(u, { x: bay.x, y: bay.y, a: bay.a, v: 0, stuck: false, on: null });
      HC.Audio.cash(); HC.Save.save();
      return `A rollback hauled the ${name(k)} to your yard for ${HC.money(fee)}.`;
    },
    scrap(k) {
      const S = HC.session, u = S.units[k];
      if (!u) return null;
      const here = atScrapyard(u) || (u.on && atScrapyard(S.trailers.find((t) => t.id === u.on.trailer) || u));
      const value = HC.scrapValue(k) - (here ? 0 : HC.HAUL_FEE(k));
      if (u.on) u.on = null;
      const c0 = C().money, toast = HC.Game.toast; let ok = false;
      HC.Game.toast = (m, t) => (t === 'warn' ? toast(m, t) : null); // sellUnit does the clean-up; its sale message is replaced by ours
      try { ok = HC.Game.sellUnit(k); } finally { HC.Game.toast = toast; }
      if (!ok) return null;
      C().money = c0 + value; HC.Save.save();
      const c = C(); for (const m of [c.hours, c.rebuilt, c.dead, c.svc]) if (m) delete m[k];
      return `Scrapped the ${name(k)} at Hollow Creek Salvage: ${HC.money(value)}${here ? '' : ` (after ${HC.money(HC.HAUL_FEE(k))} for the rollback)`}.`;
    },
  };

  // new and used machines get their meter set when they arrive
  const baseAdd = HC.Game.addUnit;
  HC.Game.addUnit = function (k) {
    const r = baseAdd.apply(this, arguments);
    const c = C(); if (c && engine(k) && (c.hours = c.hours || {})[k] == null) c.hours[k] = 0;
    return r;
  };
  if (HC.Market && HC.Market.buy) {
    const baseBuy = HC.Market.buy;
    HC.Market.buy = function (id) {
      const L = (C().market && C().market.list.find((q) => q.id === +id)) || null, before = new Set(Object.keys(C().owned).filter((k) => C().owned[k]));
      const r = baseBuy.apply(this, arguments);
      if (L && !L.k.startsWith('tr:')) for (const k in C().owned) if (C().owned[k] && !before.has(k) && engine(k)) C().hours[k] = L.hours || Math.round(HC.lifeHours(k) * (1 - L.cond / 100) * 0.8);
      return r;
    };
  }
})();
