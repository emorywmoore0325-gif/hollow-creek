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
      if (it.vx || it.vy) { it.x += (it.vx || 0) * dt; it.y += (it.vy || 0) * dt; } // it carries on sideways through the air
      if (it.wx || it.wz) { it.rx = (it.rx || 0) + (it.wx || 0) * dt; it.rz = (it.rz || 0) + (it.wz || 0) * dt; } // tumbling end over end
      if (it.spin) it.a = (it.a || 0) + it.spin * dt;
      it.restT = 0;
      if (it.z <= 0) {
        it.z = 0;
        const b = BOUNCE[it.kind];
        if (b && it.vz < -1.6) {
          it.vz = -it.vz * b; it.vx = (it.vx || 0) * 0.6 + HC.rand(-14, 14); it.vy = (it.vy || 0) * 0.6 + HC.rand(-14, 14); it.spin = HC.rand(-3, 3);
          if (it.kind === 'firewood') { it.wx = HC.rand(-9, 9); it.wz = HC.rand(-6, 6); HC.Audio.knock && Math.random() < 0.3 && HC.Audio.knock(); }
        } else {
          it.vz = 0;
          if (it.kind === 'firewood') { it.rx = Math.round((it.rx || 0) / (Math.PI / 2)) * (Math.PI / 2); it.rz = 0; it.wx = it.wz = 0; } // a split comes to rest on a flat face
        }
      }
    },
    // throw a piece: off a splitter wedge, a processor belt or out of a dump box
    launch(it, dirA, speed, up) {
      it.z = Math.max(it.z || 0, 0.25); it.vz = up; it.vx = Math.cos(dirA) * speed; it.vy = Math.sin(dirA) * speed;
      it.spin = HC.rand(-4, 4); it.wx = HC.rand(-10, 10); it.wz = HC.rand(-7, 7); it.restT = 0;
      return it;
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
      if (!it.vx && !it.vy) it.restT = (it.restT || 0) + dt; else it.restT = 0;
      if (it.vx || it.vy) {
        const nx = it.x + it.vx * dt, ny = it.y + it.vy * dt, t = HC.Lot.tile(S.lot, nx, ny);
        if (t === HC.T.WATER || t === HC.T.ROCKFACE || t === -1) { it.vx = 0; it.vy = 0; }
        else { it.x = nx; it.y = ny; }
        if (it.spin) { it.a = (it.a || 0) + it.spin * dt; it.spin *= Math.exp(-4 * dt); }
        const fr = Math.exp(-(it.kind === 'log' ? 2.5 : it.kind === 'brush' ? 7 : it.kind === 'firewood' ? 3.2 : 5) * dt);
        if (it.kind === 'firewood' && (Math.abs(it.vx) + Math.abs(it.vy)) > 6) it.rx = (it.rx || 0) + (Math.abs(it.vx) + Math.abs(it.vy)) * dt * 0.12; // splits skid and flip a little as they slide
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
    // 3) shoved: trucks, trailers and machine bodies push loose debris out from under them, moving or parked
    //    (not the business end of a grapple, bucket or blade). Long bodies are a chain of circles so nothing hides under the ends.
    const bodies = [], add = (x, y, r, a, v, front, rig) => bodies.push({ x, y, r, a, v, front, rig });
    for (const k in S.units) {
      const u = S.units[k], sp = HC.EQUIP[k];
      if (u.hidden || u.on || u.boarded || !sp || sp.move === 'walk' || sp.move === 'tow' || Math.abs(u.x - me.x) > 760 || Math.abs(u.y - me.y) > 760) continue;
      const v = u.v || 0, front = FRONT_WORK.has(HC.baseOf(k));
      if (HC.Units.isTruck(k)) { const c = Math.cos(u.a), s2 = Math.sin(u.a); for (const o of [-0.9, 0, 0.9]) add(u.x + c * u.r * o, u.y + s2 * u.r * o, u.r * 0.72, u.a, v, false, true); }
      else add(u.x, u.y, u.r, u.a, v, front);
    }
    for (const t of S.trailers) {
      const T2 = HC.TRAILERS[t.kind]; if (!T2 || HC.Units.isBed(t) || Math.abs(t.x - me.x) > 760 || Math.abs(t.y - me.y) > 760) continue;
      const rig = t.hitch && S.units[t.hitch], v = rig ? rig.v || 0 : 0, c = Math.cos(t.a), s2 = Math.sin(t.a), half = (T2.len || 40) * 0.42, r = Math.min(T2.r || 18, 16);
      for (const o of [-1, 0, 1]) add(t.x + c * half * o, t.y + s2 * half * o, r, t.a, v, false, t.kind !== 'splitter');
    }
    const piles = items.filter((it) => it.kind === 'pile' && Math.abs(it.x - me.x) < 700 && Math.abs(it.y - me.y) < 700);
    for (const u of bodies) {
      const moving = Math.abs(u.v) > 3, c = Math.cos(u.a), s2 = Math.sin(u.a);
      for (const it of near) {
        if (it.z > 0.4) continue;
        const dx = it.x - u.x, dy = it.y - u.y, d = Math.hypot(dx, dy), min = u.r + rOf(it) * 0.7;
        if (d >= min) continue;
        if (u.front && (dx * c + dy * s2) * (u.v < 0 ? -1 : 1) > u.r * 0.5) continue; // in the bucket's or grapple's reach, not under the machine
        const nx = d > 0.01 ? dx / d : -s2, ny = d > 0.01 ? dy / d : c; // dead centre: out to the side
        if (moving) {
          const k = 1 / Math.sqrt(mOf(it)), out = (min - d) * Math.min(1, 0.6 * k + 0.2);
          it.x += nx * out; it.y += ny * out;
          it.vx = (it.vx || 0) + c * u.v * 0.25 * k; it.vy = (it.vy || 0) + s2 * u.v * 0.25 * k;
          if (it.kind === 'log' || it.kind === 'brush') it.spin = (it.spin || 0) + HC.rand(-1.2, 1.2) * k;
        } else { const out = Math.min(min - d, 40 * dt); it.x += nx * out; it.y += ny * out; } // parked on top of it: ease it out
      }
      if (u.rig) for (const pl of piles) { // heaps of mulch, chips or firewood slide out from under a truck or trailer too
        const dx = pl.x - u.x, dy = pl.y - u.y, d = Math.hypot(dx, dy) || 0.01, min = u.r + 6 + 6 * (pl.size || 1);
        if (d >= min || (u.front && dx * c + dy * s2 > u.r * 0.5)) continue;
        const out = Math.min(min - d, (moving ? 60 : 30) * dt); pl.x += dx / d * out; pl.y += dy / d * out;
      }
    }
  }

  // loose scoops of mulch, chips or firewood that end up together merge into one heap (and join a heap of the same stuff nearby)
  const PRODUCT = { mulch: 'mulch', chips: 'chips', firewood: 'firewood' };
  let groupT = 0;
  function group(S) {
    const items = S.lot.items, loose = items.filter((i) => PRODUCT[i.kind] && !(i.z > 0.05) && !i.vx && !i.vy && (i.restT || 0) > (i.kind === 'firewood' ? 1.2 : 0.3)); // only once it has come to rest
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
