// Hollow Creek — landscape materials: pallets of sod, bagged mulch, shrubs and pavers bought at the landscape supply,
// moved with pallet forks (skid steer, mini skid, tractor), hauled on a flat deck trailer or a flatbed truck,
// and laid by hand (on foot) on the job's marked tiles. The landscaping crew is retired.
'use strict';
(() => {
  const TS = HC.TILE, T = HC.T;
  HC.PALLETS = {
    sod: { name: 'Sod', unit: 'rolls', per: 12, price: 140, tool: 'sod', tile: T.SOD, blurb: 'Fresh-cut sod: 12 rolls, one per marked lawn tile.' },
    shrub: { name: 'Shrubs', unit: 'shrubs', per: 6, price: 160, tool: 'shrub', blurb: 'Six 3-gallon shrubs, ready to plant.' },
    paver: { name: 'Pavers', unit: 'courses', per: 10, price: 190, tool: 'paver', tile: T.PAVER, blurb: 'Concrete pavers, enough for 10 patio tiles.' },
  };
  const MAT_OF = { sod: 'sod', bed: 'mulch', shrub: 'shrub', paver: 'paver' };
  // mulch is bulk: bought by the load unit, it waits in a heap at the supply; load it with a grapple or loader like any mulch
  HC.MULCH_BUY = 48; // per load unit (the supply buys yours back at HC.MULCH_PRICE)
  const MAT_NAME = (m) => (m === 'mulch' ? 'Mulch' : HC.PALLETS[m].name);
  HC.matForTarget = (kind) => MAT_OF[kind];
  // where pallets can ride: flat decks (not the dump trailers) and the flatbed pickups
  HC.PALLET_DECKS = { equip: 4, deckover: 6, gnflat: 10, lowboy: 6 };
  HC.FLATBEDS = ['truck', 'truck2'];

  // ---------- pallet forks ----------
  HC.EQUIP.forks = { name: 'Pallet Forks (48")', short: 'Forks', noUnit: true, price: 1100, attachTo: 'skid',
    help: 'Pallet forks for the skid steer and mini skid (quick-attach), or clamp-on forks for the tractor\'s loader bucket. Line up square with a forks attachment and press Q. With forks on, E picks up the pallet in front of you; E again sets it down: on the ground, on a flat deck trailer or on the bed of a flatbed pickup.' };
  HC.BLURB.forks = 'Pallet forks: pick up and load pallets of sod, mulch, shrubs and pavers.';
  // the landscaping crew is retired: you lay the materials yourself
  Object.assign(HC.EQUIP.land, { hidden: true, noUnit: true, price: 0 });
  HC.JOBS.sod_planting.needs = ['mower', 'forks'];
  HC.JOBS.hardscape.needs = ['skid', 'forks'];
  HC.JOBS.sod_planting.blurb = 'Mow the lawn, then lay sod, mulch the beds and plant shrubs. Pick up the pallets at the landscape supply.';
  HC.JOBS.hardscape.blurb = 'Pull the rocks out of the patio area, then lay the pavers. Pick up the pavers at the landscape supply.';

  // what a job needs from the supply (pallets, rounded up)
  HC.jobMaterials = (j) => {
    const need = {};
    if (j.type === 'sod_planting') Object.assign(need, { sod: (j.sodW || 0) * (j.sodH || 0), mulch: j.beds || 0, shrub: j.shrubs || 0 });
    if (j.type === 'hardscape') need.paver = (j.pw || 0) * (j.ph || 0);
    return Object.entries(need).filter(([, n]) => n > 0).map(([mat, n]) => mat === 'mulch'
      ? { mat, n, units: n, cost: n * HC.MULCH_BUY, text: `${n} unit${n > 1 ? 's' : ''} of bulk mulch (grapple or loader)` }
      : { mat, n, pallets: Math.ceil(n / HC.PALLETS[mat].per), cost: Math.ceil(n / HC.PALLETS[mat].per) * HC.PALLETS[mat].price,
        text: `${Math.ceil(n / HC.PALLETS[mat].per)} pallet${Math.ceil(n / HC.PALLETS[mat].per) > 1 ? 's' : ''} of ${HC.PALLETS[mat].name.toLowerCase()} (${n} ${mat === 'shrub' ? 'shrubs' : 'tiles'})` });
  };

  const list = () => (HC.company.pallets = HC.company.pallets || []);
  const forksOn = (u, S) => (S.attachments || []).find((a) => a.on === u.kind && a.kind === 'forks');
  HC.forksOn = forksOn;
  const forkReach = (u) => (HC.baseOf(u.kind) === 'tractor' ? 42 : 30);
  const front = (u) => ({ x: u.x + Math.cos(u.a) * forkReach(u), y: u.y + Math.sin(u.a) * forkReach(u) });
  const bedOf = (t) => ({ x: t.x - Math.cos(t.a) * 17, y: t.y - Math.sin(t.a) * 17 });
  const nameOf = (p) => `${HC.PALLETS[p.mat].name.toLowerCase()} pallet (${p.qty}/${HC.PALLETS[p.mat].per} ${HC.PALLETS[p.mat].unit})`;

  // ---------- buying: the pallet waits in the supply's pickup area ----------
  function buy(mat) {
    const C = HC.company, P = HC.PALLETS[mat], sp = HC.world.supply;
    if (!P || !sp) return null;
    if (C.money < P.price) return `You need ${HC.money(P.price)} for that.`;
    C.money -= P.price;
    const pk = sp.pickup, waiting = list().filter((p) => !p.ride && HC.inRect(p.x, p.y, pk)).length;
    const col = waiting % 3, row = Math.floor(waiting / 3) % 2;
    list().push({ id: HC.uid(), mat, qty: P.per, x: pk.x + 24 + col * 46, y: pk.y + pk.h - 20 - row * 46, a: 0, ride: null });
    HC.Audio.cash(); HC.Save.save();
    return `Bought a pallet of ${P.name.toLowerCase()} (${P.per} ${P.unit}) for ${HC.money(P.price)}. It's waiting in the pickup area at ${sp.name}. Bring forks and a flat deck trailer or a flatbed truck.`;
  }

  function buyMulch(n) {
    const C = HC.company, S = HC.session, sp = HC.world.supply;
    n = Math.max(1, Math.min(30, n | 0));
    if (!sp || !S) return null;
    const cost = n * HC.MULCH_BUY;
    if (C.money < cost) return `You need ${HC.money(cost)} for ${n} units.`;
    C.money -= cost;
    const pk = sp.pickup, x = pk.x - 34, y = pk.y + pk.h / 2;
    let pile = S.lot.items.find((it) => it.kind === 'pile' && it.mulch && HC.dist(it.x, it.y, x, y) < 40);
    if (!pile) { pile = { id: HC.uid(), kind: 'pile', mulch: true, bought: true, x, y, a: 0, size: 0.6, content: [] }; S.lot.items.push(pile); }
    for (let i = 0; i < n; i++) pile.content.push({ id: HC.uid(), kind: 'mulch', x, y, a: 0, size: 1, value: 0 });
    pile.size = 0.6 + Math.sqrt(pile.content.length) * 0.28;
    HC.Audio.cash(); HC.Save.save();
    return `Bought ${n} units of mulch for ${HC.money(cost)}. It's heaped in the pickup area at ${sp.name}: load it with a grapple or loader into a dump trailer or truck.`;
  }

  // ---------- where a pallet sits each tick: held on the forks, riding a deck or a truck bed, or on the ground ----------
  function follow(S) {
    for (const p of list()) {
      const r = p.ride;
      if (!r) continue;
      if (r.held) { const u = S.units[r.held]; if (!u || !forksOn(u, S)) { p.ride = null; continue; } const f = front(u); p.x = f.x; p.y = f.y; p.a = u.a; continue; }
      const host = r.t ? S.trailers.find((t) => t.id === r.t) : S.units[r.u];
      if (!host) { p.ride = null; continue; }
      const c = Math.cos(host.a), s = Math.sin(host.a);
      p.x = host.x + c * r.along - s * r.side; p.y = host.y + s * r.along + c * r.side; p.a = host.a;
    }
  }
  // a free spot on a deck or truck bed near the forks (null when it's full)
  function slotOn(host, isTruck, near) {
    const spots = [];
    if (isTruck) for (const along of [-10, -24]) spots.push({ along, side: 0 });
    else { const [rear, fwd] = HC.TRAILERS[host.kind].deck, n = HC.PALLET_DECKS[host.kind]; for (let i = 0; i < Math.ceil(n / 2); i++) for (const side of [-7, 7]) { const along = fwd - 9 - i * 15; if (along > rear + 6) spots.push({ along, side }); } }
    const taken = list().filter((p) => p.ride && (isTruck ? p.ride.u === host.kind : p.ride.t === host.id));
    const free = spots.filter((sp) => !taken.some((p) => Math.abs(p.ride.along - sp.along) < 6 && Math.abs(p.ride.side - sp.side) < 4));
    if (!free.length) return null;
    const c = Math.cos(host.a), s = Math.sin(host.a), w = (sp) => ({ x: host.x + c * sp.along - s * sp.side, y: host.y + s * sp.along + c * sp.side });
    return free.sort((a, b) => HC.dist(w(a).x, w(a).y, near.x, near.y) - HC.dist(w(b).x, w(b).y, near.x, near.y))[0];
  }

  // ---------- E with forks on ----------
  function forksInteract(u, S) {
    const f = front(u), held = list().find((p) => p.ride && p.ride.held === u.kind);
    if (Math.abs(u.v || 0) > 6) return HC.Game.toast('Stop first.');
    if (held) {
      // onto a flat deck?
      const deck = S.trailers.find((t) => HC.PALLET_DECKS[t.kind] && HC.Units.onDeck(t, f));
      if (deck) {
        const sp = slotOn(deck, false, f);
        if (!sp) return HC.Game.toast(`The ${HC.TRAILERS[deck.kind].name.toLowerCase()} is full of pallets.`, 'warn');
        { const w = (HC.PALLET_T[held.mat] || 1) * held.qty / HC.PALLETS[held.mat].per, have = HC.deckLoad(S, deck), cap = HC.payloadOf(deck);
          if (have + w > cap + 0.05) return HC.Game.toast(`Over the ${HC.TRAILERS[deck.kind].name.toLowerCase()}'s rated load (${have} t aboard, rated ${cap} t).`, 'warn'); }
        if ((u.armT || 0) < 0.3) return HC.Game.toast('Raise the forks (hold T) to clear the deck, then press E.', 'warn');
        held.ride = { t: deck.id, along: sp.along, side: sp.side }; HC.Audio.drop();
        return HC.Game.toast(`Set the ${nameOf(held)} on the ${HC.TRAILERS[deck.kind].name.toLowerCase()}.`, 'good');
      }
      const truck = Object.values(S.units).find((t) => HC.FLATBEDS.includes(HC.baseOf(t.kind)) && t !== u && HC.dist(bedOf(t).x, bedOf(t).y, f.x, f.y) < 26);
      if (truck) {
        const sp = slotOn(truck, true, f);
        if (HC.bedBlocked(S, truck)) return HC.Game.toast('The gooseneck is hitched in that bed. Unhook it to use the bed.', 'warn');
        if (!sp) return HC.Game.toast('The truck bed is full: two pallets max.', 'warn');
        { const w = (HC.PALLET_T[held.mat] || 1) * held.qty / HC.PALLETS[held.mat].per, have = HC.deckLoad(S, truck, true);
          if (have + w > HC.BED_PAYLOAD + 0.05) return HC.Game.toast(`Too heavy for the truck bed (${have} t aboard, ${HC.BED_PAYLOAD} t max).`, 'warn'); }
        if ((u.armT || 0) < 0.3) return HC.Game.toast('Raise the forks (hold T) to clear the bed, then press E.', 'warn');
        held.ride = { u: truck.kind, along: sp.along, side: sp.side }; HC.Audio.drop();
        return HC.Game.toast(`Set the ${nameOf(held)} on the ${HC.EQUIP[HC.baseOf(truck.kind)].short.toLowerCase()} bed.`, 'good');
      }
      if (S.trailers.some((t) => !HC.PALLET_DECKS[t.kind] && HC.Units.onDeck(t, f)) || S.trailers.some((t) => HC.Units.isDump(t) && HC.dist(t.x, t.y, f.x, f.y) < 30)) return HC.Game.toast('Pallets only ride on flat deck trailers or a flatbed truck.', 'warn');
      held.ride = null; held.x = f.x; held.y = f.y; held.a = u.a; HC.Audio.drop();
      return HC.Game.toast(`Set the ${nameOf(held)} down.`);
    }
    const p = list().filter((q) => !(q.ride && q.ride.held) && HC.dist(q.x, q.y, f.x, f.y) < 26).sort((a, b) => HC.dist(a.x, a.y, f.x, f.y) - HC.dist(b.x, b.y, f.x, f.y))[0];
    if (!p) return HC.Game.toast('No pallet on the forks. Drive the forks up to a pallet and press E.');
    if (p.ride && (u.armT || 0) < 0.3) return HC.Game.toast('Raise the forks (hold T) to reach the deck, then press E.', 'warn');
    if (!p.ride && (u.armT || 0) > 0.4) return HC.Game.toast('Lower the forks (hold G) to slide them under the pallet.', 'warn');
    p.ride = { held: u.kind }; HC.Audio.pick();
    HC.Game.toast(`Picked up the ${nameOf(p)}.`);
  }
  function forksHint(u, S) {
    const f = front(u), held = list().find((p) => p.ride && p.ride.held === u.kind);
    if (held) {
      const deck = S.trailers.find((t) => HC.PALLET_DECKS[t.kind] && HC.Units.onDeck(t, f));
      const truck = Object.values(S.units).find((t) => HC.FLATBEDS.includes(HC.baseOf(t.kind)) && t !== u && HC.dist(bedOf(t).x, bedOf(t).y, f.x, f.y) < 26);
      if (deck || truck) return (u.armT || 0) < 0.3 ? 'Hold T to raise the forks over the deck, then E sets the pallet on it.' : `E: set the pallet on the ${deck ? HC.TRAILERS[deck.kind].name.toLowerCase() : 'truck bed'}`;
      return `Carrying a ${nameOf(held)}. Drive up to a flat deck trailer or a flatbed truck and press E, or E to set it down here.`;
    }
    const p = list().find((q) => !(q.ride && q.ride.held) && HC.dist(q.x, q.y, f.x, f.y) < 26);
    if (p) return `E: pick up the ${nameOf(p)}`;
    const any = list().find((q) => !(q.ride && q.ride.held) && HC.dist(q.x, q.y, u.x, u.y) < 160);
    return any ? 'Drive the forks square into the pallet, then press E. Q drops the forks.' : 'Pallet forks on. E picks up a pallet in front of you. Q drops the forks. Buy pallets in the shop (Landscape supply).';
  }
  const baseInteract = HC.Units.interact, baseHint = HC.Units.hint;
  HC.Units.interact = function (u, S) {
    if (u && forksOn(u, S) && !u.on && !(S.trailers.some((t) => HC.Units.onDeck(t, u)) && !list().some((p) => p.ride && p.ride.held === u.kind) && Math.abs(u.v || 0) < 4 && !list().some((p) => HC.dist(p.x, p.y, front(u).x, front(u).y) < 26))) return forksInteract(u, S);
    return baseInteract.apply(this, arguments);
  };
  HC.Units.hint = function (u, S) {
    if (u && forksOn(u, S) && !u.on) return forksHint(u, S);
    return baseHint.apply(this, arguments);
  };

  // ---------- laying it by hand: on foot, saw down, click a marked tile with a pallet of the right stuff nearby ----------
  const K = HC.Units.KINDS;
  function nearPallet(u, mat, d = 170) {
    return list().filter((p) => p.mat === mat && p.qty > 0 && !(p.ride && p.ride.held) && HC.dist(p.x, p.y, u.x, u.y) < d).sort((a, b) => HC.dist(a.x, a.y, u.x, u.y) - HC.dist(b.x, b.y, u.x, u.y))[0];
  }
  // mulch within reach: a heap on the ground, or the box of a dump trailer or truck parked close
  function mulchNear(u, S) {
    const pile = S.lot.items.filter((i) => i.kind === 'pile' && i.mulch && i.content.length && HC.dist(i.x, i.y, u.x, u.y) < 170).sort((a, b) => HC.dist(a.x, a.y, u.x, u.y) - HC.dist(b.x, b.y, u.x, u.y))[0];
    if (pile) return { n: pile.content.length, take() { pile.content.pop(); if (!pile.content.length) S.lot.items.splice(S.lot.items.indexOf(pile), 1); else pile.size = 0.6 + Math.sqrt(pile.content.length) * 0.28; } };
    const loose = S.lot.items.find((i) => i.kind === 'mulch' && HC.dist(i.x, i.y, u.x, u.y) < 170);
    if (loose) return { n: 1, take() { S.lot.items.splice(S.lot.items.indexOf(loose), 1); } };
    const box = S.trailers.find((t) => HC.Units.isDump(t) && t.cargo.some((c) => c.kind === 'mulch') && HC.dist(t.x, t.y, u.x, u.y) < 170);
    if (box) return { n: box.cargo.filter((c) => c.kind === 'mulch').length, take() { const c = box.cargo.find((q) => q.kind === 'mulch'); box.cargo.splice(box.cargo.indexOf(c), 1); box.load -= 1; } };
    return null;
  }
  function target(S) {
    const m = HC.input.mouse, tx = Math.floor(m.wx / TS), ty = Math.floor(m.wy / TS);
    return { tx, ty, g: (S.lot.targets || []).find((t) => t.tx === tx && t.ty === ty && !t.done), cx: tx * TS + 16, cy: ty * TS + 16 };
  }
  function lay(u, dt, S) {
    if (!HC.input.mouse.down || (S.saw && S.saw.holder === u.kind)) return;
    u.layCool = Math.max(0, (u.layCool || 0) - dt);
    if (u.layCool > 0) return;
    const tg = target(S);
    if (!tg.g) return;
    u.layCool = 0.3;
    if (HC.dist(u.x, u.y, tg.cx, tg.cy) > 90) return HC.Game.hintOnce('Too far. Walk closer to that tile.');
    const mat = MAT_OF[tg.g.kind], P = HC.PALLETS[mat] || { tile: T.BED, name: 'Mulch' };
    const pal = mat === 'mulch' ? null : nearPallet(u, mat), heap = mat === 'mulch' ? mulchNear(u, S) : null;
    if (mat === 'mulch' && !heap) return HC.Game.hintOnce('Bring mulch within reach: tip a load out nearby (X in the truck) or park the dump trailer or truck close.');
    if (mat !== 'mulch' && !pal) return HC.Game.hintOnce(`Bring a pallet of ${P.name.toLowerCase()} within reach (forks onto a flat deck or a flatbed truck, then park near the work).`);
    const c = { x: tg.cx, y: tg.cy };
    const blocker = S.lot.items.find((i) => HC.dist(i.x, i.y, c.x, c.y) < 20) || S.lot.stumps.find((s) => HC.dist(s.x, s.y, c.x, c.y) < 20) || S.lot.bushes.find((b) => HC.dist(b.x, b.y, c.x, c.y) < 18);
    if (blocker) return HC.Game.hintOnce(`Clear the ${blocker.kind || (blocker.grind ? 'stump' : 'brush')} off that spot first.`);
    u.working = true;
    tg.g.done = true;
    if (P.tile !== undefined) HC.Game.setTile(tg.tx, tg.ty, P.tile);
    else S.lot.plants.push({ id: HC.uid(), x: tg.cx, y: tg.cy, seed: Math.random() * 9, color: HC.pick(['#e85d8f', '#f2c14e', '#ffffff', '#b07be0']), parcel: S.job && S.job.parcel });
    HC.Audio.place();
    for (let i = 0; i < 6; i++) HC.Game.dust(tg.cx, tg.cy, '#7a4f30', 1, 40);
    if (heap) { heap.take(); return; }
    pal.qty--;
    if (pal.qty <= 0) { list().splice(list().indexOf(pal), 1); HC.Game.toast(`That ${P.name.toLowerCase()} pallet is used up.`); }
  }
  const opUpdate = K.op.update, opHint = K.op.hint;
  K.op.update = function (u, dt, S, active) { opUpdate.apply(this, arguments); if (active && !(HC.Net && HC.Net.role === 'guest' && false)) lay(u, dt, S); };
  K.op.hint = function (u, S) {
    const left = (S.lot.targets || []).filter((t) => !t.done);
    if (left.length && !(S.saw && S.saw.holder === u.kind) && left.some((t) => HC.dist(u.x, u.y, t.tx * TS + 16, t.ty * TS + 16) < 300)) {
      const tg = target(S), mats = [...new Set(left.map((t) => MAT_OF[t.kind]))];
      const have = mats.map((m) => { const n = m === 'mulch' ? ((mulchNear(u, S) || {}).n || 0) : list().filter((p) => p.mat === m && HC.dist(p.x, p.y, u.x, u.y) < 170).reduce((a, p) => a + p.qty, 0); return `${MAT_NAME(m)} ${n ? n + ' on hand' : 'none nearby'}`; }).join(' · ');
      if (tg.g) return `Hold click to ${tg.g.kind === 'shrub' ? 'plant the shrub' : tg.g.kind === 'bed' ? 'mulch the bed' : 'lay ' + MAT_NAME(MAT_OF[tg.g.kind]).toLowerCase()} here. ${have}`;
      return `Landscaping: ${left.length} marked tile(s) left. Point at one and hold click (saw down: G). ${have}`;
    }
    return opHint.apply(this, arguments);
  };

  // ---------- keep pallets with whatever they ride on ----------
  const baseUpd = HC.Game.update;
  HC.Game.update = function (dt) {
    baseUpd.apply(this, arguments);
    const S = HC.session;
    if (!S || S.preview || !HC.company) return;
    if (HC.company.landRefund) { delete HC.company.landRefund; HC.Game.toast('The landscaping crew has retired: you\'ve been refunded $1,500. Buy sod, shrubs and pavers on pallets (and bulk mulch) at the landscape supply, and lay them yourself on foot.', 'call'); }
    follow(S);
  };

  HC.Landscape = { buy, buyMulch, list, forksOn, front, MAT_OF, MAT_NAME };
})();
