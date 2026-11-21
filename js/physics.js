// Hollow Creek — debris physics: loose logs, brush, stumps, rocks and firewood bounce when they land, settle without
// sitting inside one another, get shoved aside by trucks, trailers and machine bodies, and roll or slide down steep ground.
'use strict';
(() => {
  const TS = HC.TILE;
  // footprint radius (px) and how hard a piece is to move
  const RAD = { log: 9, rock: 8, stump: 11, brush: 12, firewood: 4, mulch: 5, chips: 5 };
  const MASS = { log: 3, rock: 4, stump: 4, brush: 0.6, firewood: 0.4, mulch: 0.5, chips: 0.4 };
  const BOUNCE = { log: 0.22, rock: 0.3, stump: 0.18, firewood: 0.35 };
  const rOf = (it) => (RAD[it.kind] || 6) * (it.size || 1) * (it.kind === 'brush' ? 0.6 : 1); // brush is springy: it can squash into its neighbours a bit
  const mOf = (it) => MASS[it.kind] || 1;
  const loose = (it) => it.kind !== 'pile' && !it.feedTo && !it.hp;
  // machines that work with their front end (grapples, buckets, forks, blades) don't shove what's in front of them
  const FRONT_WORK = new Set(['skid', 'loader', 'tractor', 'trackloader', 'excavator', 'miniex', 'dozerS', 'dozerL', 'skidder', 'forwarder', 'harvester', 'grinder', 'fmulcher']);

  // landing: a hard drop bounces a little before it settles (replaces the plain fall in the game loop)
  HC.Physics = {
    fall(it, dt) {
      if (!(it.z > 0) && !it.vz) return;
      it.vz = (it.vz || 0) - 9.8 * dt;
      it.z = (it.z || 0) + it.vz * dt * 0.33;
      if (it.z <= 0) {
        it.z = 0;
        const b = BOUNCE[it.kind];
        if (b && it.vz < -1.6) { it.vz = -it.vz * b; it.vx = (it.vx || 0) + HC.rand(-14, 14); it.vy = (it.vy || 0) + HC.rand(-14, 14); it.spin = HC.rand(-2, 2); }
        else it.vz = 0;
      }
    },
  };

  function slope(x, y) { // rise over run, in tiles, along x and y
    const h = HC.World.heightAt, e = 6;
    return [(h(x + e, y) - h(x - e, y)) / (2 * e) * TS, (h(x, y + e) - h(x, y - e)) / (2 * e) * TS];
  }

  function step(S, dt) {
    const items = S.lot.items, me = S.units[S.active];
    if (!items.length || !me) return;
    const near = [];
    for (const it of items) if (loose(it) && Math.abs(it.x - me.x) < 700 && Math.abs(it.y - me.y) < 700) near.push(it);
    if (!near.length) return;
    // 1) roll and slide: logs roll down anything steeper than ~10 degrees, rocks slide on ~16 degrees; then friction
    for (const it of near) {
      if (it.z > 0.02) continue;
      if (it.kind === 'log' || it.kind === 'rock') {
        const [gx, gy] = slope(it.x, it.y), g = Math.hypot(gx, gy), lim = it.kind === 'log' ? 0.18 : 0.28;
        if (g > lim) {
          let ax = -gx / g * (g - lim) * 160, ay = -gy / g * (g - lim) * 160;
          if (it.kind === 'log') { const c = Math.cos(it.a || 0), s = Math.sin(it.a || 0), across = -ax * s + ay * c; ax = -s * across; ay = c * across; } // a log rolls sideways, not end over end
          it.vx = (it.vx || 0) + ax * dt; it.vy = (it.vy || 0) + ay * dt;
        }
      }
      if (it.vx || it.vy) {
        const nx = it.x + it.vx * dt, ny = it.y + it.vy * dt, t = HC.Lot.tile(S.lot, nx, ny);
        if (t === HC.T.WATER || t === HC.T.ROCKFACE || t === -1) { it.vx = 0; it.vy = 0; }
        else { it.x = nx; it.y = ny; }
        if (it.spin) { it.a = (it.a || 0) + it.spin * dt; it.spin *= Math.exp(-4 * dt); }
        const fr = Math.exp(-(it.kind === 'log' ? 2.5 : it.kind === 'brush' ? 7 : 5) * dt);
        it.vx *= fr; it.vy *= fr;
        if (Math.abs(it.vx) < 0.5 && Math.abs(it.vy) < 0.5) { it.vx = 0; it.vy = 0; }
      }
    }
    // 2) settle: pieces lying on top of each other ease apart (heavy ones move less), using a coarse grid
    const cell = 40, grid = new Map(), key = (cx, cy) => cx * 100003 + cy;
    for (const it of near) { if (it.z > 0.3) continue; const k = key(Math.floor(it.x / cell), Math.floor(it.y / cell)); let a = grid.get(k); if (!a) grid.set(k, (a = [])); a.push(it); }
    const maxMove = 36 * dt;
    for (const [k, a] of grid) {
      const cx = Math.floor(a[0].x / cell), cy = Math.floor(a[0].y / cell);
      for (let ox = 0; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) {
        if (ox === 0 && oy < 0) continue;
        const b = ox === 0 && oy === 0 ? a : grid.get(key(cx + ox, cy + oy));
        if (!b) continue;
        for (let i = 0; i < a.length; i++) for (let j = b === a ? i + 1 : 0; j < b.length; j++) {
          const p = a[i], q = b[j], dx = q.x - p.x, dy = q.y - p.y, d = Math.hypot(dx, dy) || 0.01, min = (rOf(p) + rOf(q)) * 0.8;
          if (d >= min) continue;
          const push = Math.min(maxMove, (min - d) * 0.5), mp = mOf(p), mq = mOf(q), wp = mq / (mp + mq), wq = mp / (mp + mq);
          p.x -= dx / d * push * wp; p.y -= dy / d * push * wp; q.x += dx / d * push * wq; q.y += dy / d * push * wq;
        }
      }
    }
    // 3) shoved: trucks, trailers and machine bodies push loose debris out of their way (not the business end of a grapple, bucket or blade)
    const bodies = [];
    for (const k in S.units) { const u = S.units[k]; if (!u.hidden && !u.on && HC.EQUIP[k] && HC.EQUIP[k].move !== 'walk' && (Math.abs(u.v || 0) > 3 || u.moving)) bodies.push({ x: u.x, y: u.y, r: u.r, a: u.a, v: u.v || 0, front: FRONT_WORK.has(HC.baseOf(k)) }); }
    for (const t of S.trailers) { const rig = t.hitch && S.units[t.hitch]; if (rig && !HC.Units.isBed(t) && HC.TRAILERS[t.kind] && Math.abs(rig.v || 0) > 3) bodies.push({ x: t.x, y: t.y, r: HC.TRAILERS[t.kind].r || 18, a: t.a, v: rig.v, front: false }); }
    for (const u of bodies) for (const it of near) {
      if (it.z > 0.4) continue;
      const dx = it.x - u.x, dy = it.y - u.y, d = Math.hypot(dx, dy), min = u.r + rOf(it) * 0.7;
      if (d >= min || d < 0.01) continue;
      if (u.front && Math.abs(HC.angDiff(u.a + (u.v < 0 ? Math.PI : 0), Math.atan2(dy, dx))) < 0.9) continue;
      const k = 1 / Math.sqrt(mOf(it)), out = (min - d) * Math.min(1, 0.6 * k + 0.2);
      it.x += dx / d * out; it.y += dy / d * out;
      it.vx = (it.vx || 0) + Math.cos(u.a) * u.v * 0.25 * k; it.vy = (it.vy || 0) + Math.sin(u.a) * u.v * 0.25 * k;
      if (it.kind === 'log' || it.kind === 'brush') it.spin = (it.spin || 0) + HC.rand(-1.2, 1.2) * k;
    }
  }

  // loose scoops of mulch, chips or firewood that end up together merge into one heap (and join a heap of the same stuff nearby)
  const PRODUCT = { mulch: 'mulch', chips: 'chips', firewood: 'firewood' };
  let groupT = 0;
  function group(S) {
    const items = S.lot.items, loose = items.filter((i) => PRODUCT[i.kind] && !(i.z > 0.05));
    if (!loose.length) return;
    for (const it of loose) {
      if (!items.includes(it)) continue;
      const flag = PRODUCT[it.kind];
      let pile = items.find((q) => q.kind === 'pile' && q[flag] && HC.dist(q.x, q.y, it.x, it.y) < 22 + 8 * (q.size || 1));
      if (!pile) {
        const mates = loose.filter((q) => q !== it && q.kind === it.kind && items.includes(q) && HC.dist(q.x, q.y, it.x, it.y) < 24);
        if (!mates.length) continue;
        pile = { id: HC.uid(), kind: 'pile', [flag]: true, x: it.x, y: it.y, a: 0, size: 0.6, content: [] };
        items.push(pile);
        for (const m of mates) { items.splice(items.indexOf(m), 1); pile.content.push(m); }
      }
      items.splice(items.indexOf(it), 1); pile.content.push(it);
      pile.size = 0.6 + Math.sqrt(pile.content.length) * 0.28;
    }
  }

  const baseUpd = HC.Game.update;
  HC.Game.update = function (dt) {
    baseUpd.apply(this, arguments);
    const S = HC.session;
    if (!S || S.preview || S.paused || (HC.Net && HC.Net.role === 'guest')) return;
    step(S, Math.min(dt, 0.05));
    groupT += dt; if (groupT > 0.5) { groupT = 0; group(S); }
  };
})();
