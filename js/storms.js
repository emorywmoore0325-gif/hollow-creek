// Hollow Creek — storms: big trees blown down across the county roads, and the state's cleanup contracts you bid on
'use strict';
(() => {
  const TS = HC.TILE;
  const RIVALS = ['Blue Ridge Tree Service', 'County Line Clearing', 'Tolliver & Sons', 'Big Timber Inc.', 'Haddix Brothers Tree', 'Pike Land Services'];
  const BID_WINDOW = 120; // minutes the state takes bids after a storm
  const key = (t) => Math.round(t.x) + ',' + Math.round(t.y);
  const segDist = (seg, x, y) => { let d = 1e9; for (const [sx, sy] of seg) d = Math.min(d, Math.hypot(sx * TS - x, sy * TS - y)); return d; };
  const ofTrees = (c) => { const want = new Set(c.trees); return HC.world.trees.filter((t) => want.has(key(t))); };

  // a storm comes through: on two or three stretches of road, the biggest roadside trees go down across the pavement
  function storm(quiet) {
    const W = HC.world, C = HC.company, S = HC.session;
    if (!W || !S) return [];
    C.contracts = (C.contracts || []).filter((c) => c.status === 'won' || c.status === 'bidding');
    const roads = W.roads.filter((r) => r.pts.length > 200), made = [];
    for (let n = HC.randi(2, 3), tries = 0; made.length < n && tries < 30; tries++) {
      const r = HC.pick(roads), k = HC.randi(20, r.pts.length - 140), seg = r.pts.slice(k, k + 120);
      const xs = seg.map((p) => p[0]), ys = seg.map((p) => p[1]);
      const box = { x: (Math.min(...xs) - 5) * TS, y: (Math.min(...ys) - 5) * TS, w: (Math.max(...xs) - Math.min(...xs) + 10) * TS, h: (Math.max(...ys) - Math.min(...ys) + 10) * TS };
      if (W.yards.some((y) => box.x < y.x + y.w && box.x + box.w > y.x && box.y < y.y + y.h && box.y + box.h > y.y)) continue; // not at anyone's yard
      const cands = W.trees.filter((t) => t.state === 'standing' && !t.marked && t.type !== 'sapling' && HC.inRect(t.x, t.y, box)
        && !W.parcels.some((p) => p.id === t.parcel && (C.active && C.active.parcel === p.id)))
        .map((t) => ({ t, d: segDist(seg, t.x, t.y) })).filter((o) => o.d > 1.6 * TS && o.d < 4.5 * TS && o.t.len > o.d + TS * 0.8);
      if (cands.length < 3) continue;
      cands.sort((a, b) => b.t.len - a.t.len);
      const down = cands.slice(0, HC.randi(4, 7)).map((o) => o.t);
      const id = HC.uid();
      for (const t of down) { // it lands across the road
        let best = seg[0], bd = 1e9;
        for (const p of seg) { const d = Math.hypot(p[0] * TS - t.x, p[1] * TS - t.y); if (d < bd) { bd = d; best = p; } }
        Object.assign(t, { state: 'felled', fallA: Math.atan2(best[1] * TS - t.y, best[0] * TS - t.x) + HC.rand(-0.35, 0.35), fallT: 1, landT: 1, cut: 1, storm: id });
        for (let i = 0; i < 2; i++) { // limbs on the road
          const d = HC.rand(t.len * 0.4, t.len * 0.95), a = t.fallA + HC.rand(-0.4, 0.4);
          W.items.push({ id: HC.uid(), kind: 'brush', x: t.x + Math.cos(a) * d, y: t.y + Math.sin(a) * d, a: HC.rand(0, 6), size: HC.rand(0.6, 0.9), value: 0, seed: Math.random() * 99, storm: id });
        }
      }
      const mid = seg[60], fair = Math.round((down.length * HC.rand(750, 950) + 1200) / 50) * 50; // the state pays well for emergency work
      made.push({ id, road: r.name, x: mid[0] * TS, y: mid[1] * TS, seg: seg.filter((_, i) => i % 6 === 0), trees: down.map(key), n: down.length,
        fair, rival: Math.round(fair * HC.rand(0.82, 1.2) / 10) * 10, rivalName: HC.pick(RIVALS), bidBy: S.time + BID_WINDOW, due: null, status: 'bidding' });
    }
    if (!made.length) return made;
    C.contracts.push(...made);
    if (HC.Render.wiresChanged) HC.Render.wiresChanged();
    if (!quiet) {
      HC.Audio.pop();
      HC.Game.toast(`Storm damage: trees are down across ${made.map((c) => c.road).join(', ')}. The state is taking bids on the cleanup for the next ${BID_WINDOW / 60} hours. Press J.`, 'call');
    }
    return made;
  }

  // you bid; the lowest qualified bid wins. The state's estimate is shown, rival bids aren't.
  function bid(id, amount) {
    const C = HC.company, S = HC.session, c = (C.contracts || []).find((q) => q.id === id);
    amount = Math.round(+amount || 0);
    if (!c || c.status !== 'bidding') return 'That contract is closed.';
    if (amount < c.fair * 0.5) return 'The state won\'t take a bid that low: it reads as a mistake.';
    if (amount > c.fair * 2) return 'That\'s more than double the state\'s estimate. Bid lower.';
    c.bid = amount;
    if (amount <= c.rival) {
      c.status = 'won'; c.due = S.time + 8 * 60; c.pay = amount;
      HC.Audio.cash();
      return `You won the ${c.road} contract at ${HC.money(amount)} (${c.rivalName} bid ${HC.money(c.rival)}). Clear the ${c.n} trees off the road within 8 hours.`;
    }
    c.status = 'lost';
    HC.Audio.deny();
    return `${c.rivalName} got the ${c.road} contract at ${HC.money(c.rival)}. Bid sharper next storm.`;
  }

  // progress: trees bucked up, and no logs or brush left lying on the pavement
  function progress(c) {
    const W = HC.world, trees = ofTrees(c);
    const gone = trees.filter((t) => t.state === 'gone').length + Math.max(0, c.n - trees.length);
    let debris = 0;
    for (const it of W.items) {
      if (it.kind === 'pile' ? !it.content.length : !['log', 'brush', 'stump'].includes(it.kind)) continue;
      if (Math.abs(it.x - c.x) > 60 * TS || Math.abs(it.y - c.y) > 60 * TS) continue;
      if (W.roadDist && W.roadDist[Math.floor(it.y / TS) * W.w + Math.floor(it.x / TS)] < 2.2 && segDist(c.seg, it.x, it.y) < 4 * TS) debris++;
    }
    return { gone, n: c.n, debris, done: gone >= c.n && !debris };
  }

  let lastDay = null, acc = 0;
  function tick(S, dt) {
    const C = HC.company;
    if (!S || S.paused || S.preview || (HC.Net && (HC.Net.role === 'guest' || HC.Net.role === 'peer'))) return; // the host's world has the weather
    if (lastDay === null) lastDay = C.day;
    if (C.day !== lastDay) { // a new day: a stormy night may have left damage
      lastDay = C.day;
      const p = S.weather.id === 'storm' ? 0.55 : S.weather.id === 'windy' ? 0.18 : S.weather.wet ? 0.04 : 0.01; // road blowdowns are rare
      if (Math.random() < p) setTimeout(() => storm(), 1500);
    }
    acc += dt;
    if (acc < 1) return;
    acc = 0;
    for (const c of C.contracts || []) {
      if (c.status === 'bidding' && S.time > c.bidBy) { c.status = 'lost'; HC.Game.toast(`Bids closed on ${c.road}: ${c.rivalName} has the cleanup.`); c.clearAt = S.time + 180; }
      if (c.status === 'lost' && c.clearAt && S.time > c.clearAt) { // the other outfit cleans it up
        for (const t of ofTrees(c)) t.state = 'gone';
        HC.world.items = HC.world.items.filter((i) => i.storm !== c.id);
        c.status = 'closed';
      }
      if (c.status === 'won') {
        const pr = progress(c);
        if (pr.done) {
          const late = S.time > c.due, pay = late ? Math.round(c.pay * 0.6) : c.pay;
          C.money += pay; C.stats.earned += pay; c.status = 'paid';
          if (!late) C.ratings.push(5);
          HC.Audio.cash(); HC.Save.save();
          HC.Game.toast(`The state signed off on ${c.road}: ${HC.money(pay)} paid${late ? ' (late, docked 40%)' : ''}.`, 'good');
        }
      }
    }
    C.contracts = (C.contracts || []).filter((c) => c.status !== 'closed' && !(c.status === 'paid' && S.time > (c.due || 0) + 60) && !(c.status === 'lost' && !c.clearAt));
  }
  const base = HC.Game.update;
  HC.Game.update = function (dt) { base.apply(this, arguments); tick(HC.session, dt); };

  HC.Storms = { storm, bid, progress, ofTrees };
})();
