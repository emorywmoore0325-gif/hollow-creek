// Hollow Creek — junk removal: clean-outs of garages, yards and old farm sheds. Every piece is something real: couches, mattresses,
// fridges, washers, tires, scrap metal, trash bags, TVs, old lumber, carpet rolls, a rusty grill, a dead hot tub. Light stuff you
// toss in a dump trailer or truck by hand (on foot, E); heavy stuff takes two of you or a grapple. Metal pays at Hollow Creek
// Salvage; everything else goes to the county dump, each with its own fee (tires, TVs and appliances cost extra).
'use strict';
(() => {
  const TS = HC.TILE, T = HC.T, G = HC.Game, L = HC.Lot, U = HC.Units, C = () => HC.company;
  HC.JUNK = {
    couch: { name: 'old couch', load: 2, fee: 35, heavy: true, w: 'lumpy and heavy' },
    mattress: { name: 'mattress', load: 1, fee: 25 },
    fridge: { name: 'refrigerator', load: 2, fee: 40, metal: true, scrap: 28, heavy: true, note: 'freon fee at the dump; the salvage yard pays for it' },
    washer: { name: 'washing machine', load: 2, fee: 30, metal: true, scrap: 22, heavy: true },
    tires: { name: 'stack of tires', load: 1, fee: 18 },
    scrap: { name: 'scrap metal', load: 1, fee: 15, metal: true, scrap: 34 },
    bags: { name: 'trash bags', load: 1, fee: 6 },
    tv: { name: 'old TV', load: 1, fee: 22 },
    lumber: { name: 'old lumber', load: 1, fee: 10 },
    carpet: { name: 'carpet roll', load: 1, fee: 12 },
    grill: { name: 'rusty grill', load: 1, fee: 12, metal: true, scrap: 12 },
    hottub: { name: 'dead hot tub', load: 4, fee: 90, heavy: true, huge: true },
  };
  HC.LOAD.junk = 1;
  const junkOf = (c) => HC.JUNK[c.jt] || HC.JUNK.bags;
  // load units and dump fees per piece
  const baseLoadOf = HC.loadOf;
  HC.loadOf = (c, t) => (c && c.kind === 'junk' ? junkOf(c).load : baseLoadOf(c, t));
  const baseFee = HC.dumpFee;
  HC.dumpFee = (c) => (c && c.kind === 'junk' ? junkOf(c).fee : baseFee(c));
  HC.junkName = (c) => junkOf(c).name;

  // ---------- the job ----------
  Object.assign(HC.JOBS, {
    junk_removal: { name: 'Junk Removal', color: '#8a6a5a', needs: ['truck'], disposal: 'haul',
      blurb: 'Clean out everything piled up in the marked area. Toss light junk into a dump trailer or truck by hand (E on foot), use a grapple for the heavy stuff. Metal sells at Hollow Creek Salvage; the rest goes to the county dump.' },
  });
  HC.REQUESTS = HC.REQUESTS || {};
  HC.REQUESTS.junk_removal = ['Dad\'s garage finally has to go. Couches, appliances, tires, you name it.', 'We bought the place and the old owners left half their stuff out back.', 'Estate clean-out: everything in the side yard goes.', 'Tenants left a mess. Fridge, mattresses, bags of trash. Haul it all away.', 'Old farm shed clean-out: scrap metal, tires and a dead hot tub.'];
  const THEMES = [
    { name: 'garage clean-out', mix: { couch: 1, mattress: 1, fridge: 1, tv: 2, bags: 4, carpet: 1, lumber: 2, tires: 1 } },
    { name: 'estate clean-out', mix: { couch: 2, mattress: 2, washer: 1, fridge: 1, tv: 1, bags: 5, carpet: 2 } },
    { name: 'farm shed', mix: { scrap: 4, tires: 3, grill: 1, lumber: 3, washer: 1, hottub: 1 } },
    { name: 'eviction mess', mix: { mattress: 3, bags: 7, couch: 1, tv: 1, fridge: 1 } },
  ];
  Object.assign(G.ESTIMATE, {
    junk_removal(tier) {
      const th = HC.pick(THEMES), list = [];
      for (const jt in th.mix) for (let i = 0; i < th.mix[jt] + (tier && HC.chance(0.5) ? tier : 0); i++) list.push(jt);
      const fees = list.reduce((a, jt) => a + HC.JUNK[jt].fee, 0), heavy = list.filter((jt) => HC.JUNK[jt].heavy).length;
      return { junk: list, theme: th.name, count: list.length, pay: Math.round((180 + list.length * 38 + heavy * 45 + fees * 1.25 + tier * 120) / 10) * 10, par: 45 + list.length * 5 + heavy * 6, summary: `${/^[aeiou]/.test(th.name) ? "An" : "A"} ${th.name}: ${list.length} pieces (${heavy} heavy) to haul away` };
    },
  });
  L.GEN.junk_removal = function (lot, job) {
    L.scatterTrees(lot, 4, ['oak', 'maple', 'pine']);
    const z = (lot.zone = { x: lot.drive.x + lot.drive.w + TS * 1.2, y: Math.max(TS * 2, lot.roadY - TS * 9), w: TS * 7, h: TS * 5 });
    if (z.x + z.w > lot.pw - TS) z.x = Math.max(TS, lot.drive.x - TS * 8.2);
    lot.trees = lot.trees.filter((t) => !HC.circleRectHit(t.x, t.y, t.trunkR + 20, z));
    const list = job.junk || ['bags', 'couch', 'tires', 'mattress', 'scrap'];
    for (let i = 0; i < list.length; i++) { // heaped up in a messy pile, heavy pieces at the back
      const jt = list[i], spot = { x: HC.rand(z.x + 14, z.x + z.w - 14), y: HC.rand(z.y + 14, z.y + z.h - 14) };
      lot.items.push({ id: HC.uid(), kind: 'junk', jt, x: spot.x, y: spot.y, a: HC.rand(0, 6.28), size: 1, value: 0, seed: Math.floor(HC.rand(0, 99)) });
    }
  };
  G.OBJECTIVES.junk_removal = function (S) {
    const Z = HC.world.zone, here = (i) => Z && HC.inRect(i.x, i.y, { x: Z.x - TS, y: Z.y - TS, w: Z.w + TS * 2, h: Z.h + TS * 2 });
    const left = S.lot.items.filter((i) => i.kind === 'junk' && here(i)).length;
    S.init = S.init || { n: Math.max(left, 1) };
    const metalAboard = S.trailers.reduce((a, t) => a + (t.cargo || []).filter((c) => c.kind === 'junk' && junkOf(c).metal).length, 0);
    return [{ label: 'Load out every piece of junk', n: S.init.n - left, of: S.init.n, left },
      { label: `Tip: metal pays at the salvage yard${metalAboard ? ` (${metalAboard} aboard)` : ''}`, n: 1, of: 1 }];
  };

  // ---------- by hand: E on foot beside a junk piece tosses it into a dump box parked close by ----------
  const nearJunk = (u, S) => S.lot.items.filter((i) => i.kind === 'junk' && HC.dist(i.x, i.y, u.x, u.y) < 34).sort((a, b) => HC.dist(a.x, a.y, u.x, u.y) - HC.dist(b.x, b.y, u.x, u.y))[0];
  const boxNear = (p, S) => S.trailers.find((t) => ['dump', 'dump2', 'dump18', 'gndump', 'bed'].includes(t.kind) && HC.dist(t.x, t.y, p.x, p.y) < 90 && t.load < HC.Game.trailerCap(t));
  const walking = (u) => u && HC.EQUIP[u.kind] && HC.EQUIP[u.kind].move === 'walk';
  const baseInteract = U.interact;
  U.interact = function (u, S) {
    if (walking(u) && !(S.saw && S.saw.holder === u.kind)) {
      const j = nearJunk(u, S);
      if (j) {
        const J = junkOf(j), box = boxNear(j, S);
        if (!box) return HC.Game.toast(`Back a dump trailer or dump truck up close to the pile, then toss the ${J.name} in.`, 'warn');
        if (J.huge) return HC.Game.toast(`The ${J.name} is too big to lift by hand. Grab it with a skid steer grapple or an excavator.`, 'warn');
        if (box.load + J.load > HC.Game.trailerCap(box)) return HC.Game.toast('That box is full. Go unload it.', 'warn');
        if (J.heavy) { j.lift = (j.lift || 0) + 1; if (j.lift < 2) { S.time += 2; return HC.Game.toast(`The ${J.name} is heavy: you walked it halfway to the box. Press E again (or bring a grapple).`); } }
        S.lot.items.splice(S.lot.items.indexOf(j), 1); box.cargo.push(j); box.load += J.load; S.time += J.heavy ? 4 : 1.5;
        HC.Audio.pick(); HC.Game.dust(box.x, box.y, '#8a7a6a', 2, 50);
        return HC.Game.toast(`Tossed the ${J.name} in (${box.load}/${HC.Game.trailerCap(box)}).`);
      }
    }
    return baseInteract.apply(this, arguments);
  };
  const baseHint = U.hint;
  U.hint = function (u, S) {
    if (walking(u) && !(S.saw && S.saw.holder === u.kind)) {
      const j = nearJunk(u, S);
      if (j) { const J = junkOf(j); return J.huge ? `${J.name[0].toUpperCase() + J.name.slice(1)}: too big to lift. Use a grapple.` : boxNear(j, S) ? `E: ${J.heavy && !j.lift ? 'drag' : 'toss'} the ${J.name} into the box${J.heavy ? ' (heavy: two trips)' : ''}` : `${J.name[0].toUpperCase() + J.name.slice(1)}: back a dump box up close to load it by hand`; }
    }
    return baseHint.apply(this, arguments);
  };
})();
