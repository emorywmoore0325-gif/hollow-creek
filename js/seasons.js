// Hollow Creek — the year turns. Seven days to a season: spring mowing and planting, summer storms, fall leaves and firewood,
// winter snow. Snow jobs are plowed with a V-plow on a truck or a snow pusher on a machine, then salted with a tailgate
// spreader filled at the landscape supply.
'use strict';
(() => {
  const TS = HC.TILE, T = HC.T, G = HC.Game, L = HC.Lot, U = HC.Units, C = () => HC.company;
  const SEASONS = ['spring', 'summer', 'fall', 'winter'], NAMES = { spring: 'Spring', summer: 'Summer', fall: 'Fall', winter: 'Winter' };
  HC.SEASON_DAYS = 7;
  HC.season = (day) => SEASONS[Math.floor(((day ?? (C() ? C().day : 1) ?? 1) - 1) / HC.SEASON_DAYS) % 4];
  HC.seasonName = () => NAMES[HC.season()];
  HC.seasonDay = () => (((C() ? C().day : 1) - 1) % HC.SEASON_DAYS) + 1;

  // ---------- weather by season ----------
  HC.WEATHER.push(
    { id: 'snow', name: 'Snow', p: 0, wind: 4, wet: false, snow: 1, dark: 0.18, note: 'Snow on the ground: plowing calls coming in.' },
    { id: 'blizzard', name: 'Heavy snow', p: 0, wind: 12, wet: false, snow: 2, dark: 0.3, note: 'Heavy snow. Every lot in town needs plowing.' },
    { id: 'cold', name: 'Cold & clear', p: 0, wind: 2, wet: false, dark: 0, note: 'Bitter cold, bright sun. Ice on anything not salted.' });
  const TABLE = {
    spring: { sunny: 0.34, overcast: 0.22, windy: 0.12, rain: 0.26, storm: 0.06 },
    summer: { sunny: 0.46, overcast: 0.14, windy: 0.08, rain: 0.14, storm: 0.18 },
    fall: { sunny: 0.36, overcast: 0.24, windy: 0.24, rain: 0.13, storm: 0.03 },
    winter: { cold: 0.28, overcast: 0.2, snow: 0.32, blizzard: 0.14, windy: 0.06 },
  };
  function roll(sea) {
    const tb = TABLE[sea], r = Math.random(); let acc = 0;
    for (const id in tb) { acc += tb[id]; if (r < acc) return Object.assign({}, HC.WEATHER.find((w) => w.id === id)); }
    return Object.assign({}, HC.WEATHER[0]);
  }
  HC.Game.rollWeather = () => roll(HC.season());
  const fits = (w, sea) => w && TABLE[sea][w.id] != null;

  // ---------- firewood is worth more when it's cold ----------
  const FW = { supply: HC.FIREWOOD_SUPPLY, stand: HC.FIREWOOD_STAND && HC.FIREWOOD_STAND.slice() };
  function seasonPrices() {
    const sea = HC.season(), k = sea === 'fall' ? 1.35 : sea === 'winter' ? 1.5 : sea === 'summer' ? 0.85 : 1;
    HC.FIREWOOD_SUPPLY = Math.round(FW.supply * k);
    if (FW.stand) HC.FIREWOOD_STAND = FW.stand.map((v) => Math.round(v * k));
  }

  // ---------- the day turns over: maybe a new season, its weather and prices ----------
  let lastSea = null;
  function turn(S, announce) {
    const sea = HC.season();
    if (!fits(S.weather, sea)) { S.weather = roll(sea); C().weather = S.weather; }
    seasonPrices();
    if (sea !== lastSea) {
      if (lastSea && announce) HC.Game.toast(`${NAMES[sea]} is here. ${{ spring: 'Lawns are growing and folks want sod and planting.', summer: 'Storm season: expect trees down.', fall: 'Leaves are falling and everyone wants firewood (it pays more now).', winter: 'Snow season: get a plow on a truck or machine and a salt spreader. Salt is at the landscape supply.' }[sea]}`, 'call');
      lastSea = sea;
    }
  }
  const baseDayEnd = HC.UI.dayEnd;
  HC.UI.dayEnd = function (S) { S.weather = roll(HC.season()); C().weather = S.weather; turn(S, true); return baseDayEnd.apply(this, arguments); };
  const baseUpd = G.update;
  let tick = 0;
  G.update = function (dt) {
    baseUpd.apply(this, arguments);
    const S = HC.session; if (!S || S.preview) return;
    if ((tick += dt) > 3 || lastSea === null) { tick = 0; turn(S, false); }
  };

  // ---------- the season decides what people call about ----------
  const OFF = { spring: ['snow_plowing', 'leaf_cleanup'], summer: ['snow_plowing', 'leaf_cleanup'], fall: ['snow_plowing', 'sod_planting'], winter: ['lawn_mowing', 'sod_planting', 'leaf_cleanup', 'bush_hog', 'mulch_delivery', 'hardscape', 'fence_line'] };
  const BOOST = { spring: [['lawn_mowing', 0.2], ['sod_planting', 0.15]], summer: [['storm_cleanup', 0.12], ['lawn_mowing', 0.12]], fall: [['leaf_cleanup', 0.25], ['firewood_delivery', 0.15]], winter: [['snow_plowing', 0.5], ['firewood_delivery', 0.15]] };
  const baseMake = G.makeJob;
  G.makeJob = function (type, tier) {
    const sea = HC.season();
    let t = type;
    for (const [bt, p] of BOOST[sea]) if (HC.JOBS[bt] && Math.random() < p) { t = bt; break; }
    if (OFF[sea].includes(t)) { const ok = Object.keys(HC.JOBS).filter((q) => !OFF[sea].includes(q) && !HC.JOBS[q].tract); t = HC.pick(ok); }
    const j = baseMake.call(this, t, tier);
    if (t === 'firewood_delivery' && (sea === 'fall' || sea === 'winter')) j.pay = Math.round((j.pay * (sea === 'winter' ? 1.4 : 1.25)) / 10) * 10;
    return j;
  };

  // ---------- plows and spreaders: attachments like any other (buy one, it waits at your yard, hook it on with Q) ----------
  const FIT = {
    truckplow: ['truck', 'truck2', 'dually', 'dumptruck', 'dumptruck2', 'dumptruck3', 'servicetruck'], // pickups and dump trucks; never the semis or the show truck
    pusher: ['skid', 'tractor'], // every skid steer and track loader on the quick-attach, or the tractor
    spreader: ['truck', 'truck2', 'dually', 'dumptruck', 'dumptruck2', 'dumptruck3', 'servicetruck'],
  };
  const fitsOf = (id) => (k) => FIT[id].includes(HC.baseOf(k)) && !!HC.EQUIP[k];
  HC.ATT_FITS = Object.assign(HC.ATT_FITS || {}, { truckplow: fitsOf('truckplow'), pusher: fitsOf('pusher'), spreader: fitsOf('spreader') });
  HC.winterFits = (id) => Object.keys(HC.EQUIP).filter((k) => !k.includes('_') && fitsOf(id)(k) && HC.EQUIP[k].move).map((k) => HC.EQUIP[k].short);
  HC.ATT_POINT = Object.assign(HC.ATT_POINT || {}, {
    truckplow: (u) => { const d = (u.r || 16) * 1.12 + 10; return { x: u.x + Math.cos(u.a) * d, y: u.y + Math.sin(u.a) * d }; },
    spreader: (u) => { const d = -((u.r || 16) * 1.2 + 6); return { x: u.x + Math.cos(u.a) * d, y: u.y + Math.sin(u.a) * d }; },
  });
  HC.WINTER = { truckplow: { w: 2.7 }, pusher: { w: 2.5 } };
  Object.assign(HC.EQUIP, {
    truckplow: { name: 'Truck V-Plow (8.5 ft, hydraulic)', short: 'V-plow', noUnit: true, price: 5200, attachTo: 'truck',
      help: 'A hydraulic V-plow. Drive the truck\'s nose up square to it and press Q to pin it on (Q again to drop it). Plows snow as you drive forward and rolls it off into a windrow.' },
    pusher: { name: 'Snow Pusher Box (8 ft)', short: 'Snow pusher', noUnit: true, price: 3400, attachTo: 'skid',
      help: 'A rubber-edge snow pusher. Skid steers lock it on the quick-attach like any head (drop the grapple with Q, pick this up with Q); the tractor hooks it on its loader. It carries the snow and leaves a heap where you stop or back up.' },
    spreader: { name: 'Tailgate Salt Spreader', short: 'Salt spreader', noUnit: true, price: 2400, attachTo: 'truck',
      help: 'A receiver-mount salt spreader. Back the truck up to it and press Q. Fill it with rock salt at the landscape supply pickup area (E), then it salts plowed pavement behind you.' },
  });
  HC.BLURB.truckplow = `Front-mount V-plow. Works on: ${HC.winterFits('truckplow').join(', ')}.`;
  HC.BLURB.pusher = `Snow pusher box. Works on: ${HC.winterFits('pusher').join(', ')}.`;
  HC.BLURB.spreader = `Receiver salt spreader. Works on: ${HC.winterFits('spreader').join(', ')}.`;
  HC.ATT_T = Object.assign(HC.ATT_T || {}, { truckplow: 0.45, pusher: 0.35, spreader: 0.2 });
  HC.ATT_DELIVERY = Object.assign(HC.ATT_DELIVERY || {}, {
    truckplow: 'V-plow delivered to your yard. Drive a pickup or dump truck nose-up to it and press Q.',
    pusher: 'Snow pusher delivered to your yard. Skid steer: drop the grapple (Q) and pick the pusher up (Q). Tractor: drive up square to it and press Q.',
    spreader: 'Salt spreader delivered to your yard. Back a pickup or dump truck up to it and press Q. Salt is at the landscape supply.',
  });
  HC.SALT_PRICE = 16; HC.SALT_CAP = 24; // per unit (a few bags); a spreader holds 24
  const onUnit = (k, kind) => HC.session && (HC.session.attachments || []).find((a) => a.on === k && a.kind === kind);
  HC.hasPlow = (k) => !!(onUnit(k, 'truckplow') || onUnit(k, 'pusher'));
  HC.hasSpreader = (k) => !!onUnit(k, 'spreader');
  // Q in a truck: hook up or drop a plow or spreader
  const baseMode = U.mode;
  U.mode = function (u, S) {
    if (u && U.isTruck(u.kind) && (FIT.truckplow.includes(HC.baseOf(u.kind)) || (S.attachments || []).some((a) => a.on === u.kind))) return HC.Game.attachToggle(u, S);
    return baseMode.apply(this, arguments);
  };
  // older saves bought plows per vehicle: turn those into real attachments, already hooked on
  function migrate() {
    const c = C(), S = HC.session; if (!c || !S || !S.attachments || !(c.plow || c.spreader)) return;
    for (const [map, kindOf] of [['plow', (v) => v], ['spreader', () => 'spreader']]) for (const k in c[map] || {}) {
      const kind = kindOf(c[map][k]); if (!HC.EQUIP[kind] || !S.units[k]) continue;
      let a = S.attachments.find((q) => q.kind === kind && !q.on);
      if (!a) { if (c.owned[kind]) HC.Game.buyAttachment(kind); else { c.owned[kind] = true; HC.Game.addAttachment(kind, true); } a = S.attachments.filter((q) => q.kind === kind && !q.on).pop(); }
      if (a) a.on = k;
    }
    delete c.plow; delete c.spreader;
  }
  const baseU = G.update; let migrated = null;
  G.update = function () { const r = baseU.apply(this, arguments); if (HC.session && migrated !== HC.session) { migrated = HC.session; try { migrate(); } catch (e) { console.warn(e); } } return r; };

  // clearing and salting: the blade scrapes snow tiles in front; the spreader salts plowed pavement behind
  const under = (W, i) => (W.snowUnder && W.snowUnder.get(i)) ?? T.ROAD;
  function plowAt(u, S) {
    const W = S.lot, item = onUnit(u.kind, 'truckplow') ? 'truckplow' : 'pusher', wM = HC.WINTER[item].w, PXM = 32 / 3, c = Math.cos(u.a), s = Math.sin(u.a), half = (wM * PXM) / 2, ahead = (u.r || 14) * 1.05;
    const cx = u.x + c * ahead, cy = u.y + s * ahead; let n = 0;
    for (let o = -half; o <= half + 0.01; o += 4) {
      const x = cx - s * o, y = cy + c * o, tx = Math.floor(x / TS), ty = Math.floor(y / TS);
      if (HC.Lot.tile(W, x, y) !== T.SNOW) continue;
      HC.Game.setTile(tx, ty, under(W, ty * W.w + tx)); n++;
    }
    if (n) {
      u.plowed = (u.plowed || 0) + n;
      if (item === 'truckplow') { // the V-plow rolls it off the right-hand wing into a windrow beside your pass
        const ox = cx - s * (half + 14), oy = cy + c * (half + 14);
        addSnow(W, ox, oy, n); HC.Game.dust(ox, oy, '#f4f7fa', 3, 70);
      } else u.blade = (u.blade || 0) + n; // the pusher box carries it along in front
    }
    // a pusher that runs into a snow pile scoops it up and keeps pushing (stack it at the edge of the lot)
    if (item === 'pusher') for (const pl of W.snowPiles || []) if (HC.dist(pl.x, pl.y, cx, cy) < 16 + Math.sqrt(pl.n) * 2) { u.blade = (u.blade || 0) + pl.n; pl.n = 0; }
    if (item === 'truckplow') for (const pl of (W.snowPiles || []).slice()) { // a windrow in the path gets rolled further over, pass by pass, toward the edge
      const dx = pl.x - cx, dy = pl.y - cy, along = dx * c + dy * s, side = -dx * s + dy * c;
      if (pl.n > 0 && Math.abs(along) < 12 && side > -half && side < half + 6) { const m = pl.n; pl.n = 0; addSnow(W, cx - s * (half + 16), cy + c * (half + 16), m); }
    }
    if (W.snowPiles) W.snowPiles = W.snowPiles.filter((p) => p.n > 0);
    return n;
  }
  // snow piles: plowed snow doesn't vanish, it ends up in windrows and heaps that grow as you push more onto them
  function addSnow(W, x, y, n) {
    W.snowPiles = W.snowPiles || [];
    const near = W.snowPiles.find((p) => HC.dist(p.x, p.y, x, y) < 12 + Math.sqrt(p.n) * 1.5);
    if (near) { near.n += n; near.x += (x - near.x) * 0.05; near.y += (y - near.y) * 0.05; } else W.snowPiles.push({ x, y, n });
  }
  function dropBlade(u, S) { // the pusher stops or backs off: the snow it was carrying stays there as a heap
    if (!(u.blade > 0)) return;
    const c = Math.cos(u.a), s = Math.sin(u.a), d = (u.r || 14) * 1.05 + 8;
    addSnow(S.lot, u.x + c * d, u.y + s * d, u.blade); u.blade = 0;
  }
  HC.snowAhead = (u) => u.blade || 0;
  function saltAt(u, S) {
    const W = S.lot, c = Math.cos(u.a), s = Math.sin(u.a), back = (u.r || 14) * 1.15, bx = u.x - c * back, by = u.y - s * back; let n = 0;
    for (let o = -22; o <= 22; o += 6) for (let d = 0; d <= 12; d += 6) {
      const x = bx - s * o - c * d, y = by + c * o - s * d, tx = Math.floor(x / TS), ty = Math.floor(y / TS), i = ty * W.w + tx;
      if (!W.snowUnder || !W.snowUnder.has(i)) continue; // only the pavement on a snow job
      const t = HC.Lot.tile(W, x, y); if (t === T.SNOW || t === T.SALT) continue;
      HC.Game.setTile(tx, ty, T.SALT); n++;
    }
    if (n) { u.saltAcc = (u.saltAcc || 0) + n; while (u.saltAcc >= 8) { u.saltAcc -= 8; u.salt = Math.max(0, (u.salt || 0) - 1); } if (Math.random() < 0.8) HC.Game.dust(bx, by, '#e6e9ec', 2, 60); }
    return n;
  }
  const baseUpdate = U.update;
  U.update = function (u, dt, S, active) {
    baseUpdate.apply(this, arguments);
    if (!u || u.hidden || u.on || u.broken) return;
    if (HC.hasPlow(u.kind) && (u.v || 0) > 3) { const n = plowAt(u, S); if (n) u.v *= 1 - Math.min(0.5, n * 0.04); if (u.blade) u.v *= 1 - Math.min(0.6, u.blade * 0.004); } // a full pusher box gets heavy
    else if (HC.hasPlow(u.kind) && u.blade > 0 && (u.v || 0) <= 0.5) dropBlade(u, S);
    if (HC.hasSpreader(u.kind) && Math.abs(u.v || 0) > 3) {
      if ((u.salt || 0) > 0) saltAt(u, S);
      else if (active && S.job && S.job.type === 'snow_plowing') HC.Game.hintOnce('The spreader is empty. Fill it at the landscape supply pickup area (park there and press E).');
    }
  };
  // E at the landscape supply pickup with a spreader truck: fill it with salt
  const inPickup = (u) => HC.world.supply && HC.world.supply.pickup && HC.inRect(u.x, u.y, { x: HC.world.supply.pickup.x - 30, y: HC.world.supply.pickup.y - 30, w: HC.world.supply.pickup.w + 60, h: HC.world.supply.pickup.h + 60 });
  const baseInteract = U.interact;
  U.interact = function (u, S) {
    if (u && HC.hasSpreader(u.kind) && inPickup(u)) {
      const room = HC.SALT_CAP - Math.floor(u.salt || 0);
      if (room <= 0) return HC.Game.toast('The spreader is full of salt.');
      const n = Math.min(room, Math.floor(C().money / HC.SALT_PRICE)); if (n <= 0) return HC.Game.toast(`Salt is ${HC.money(HC.SALT_PRICE)} a unit. Not enough money.`, 'warn');
      C().money -= n * HC.SALT_PRICE; if (S.job) S.costs.fuel += n * HC.SALT_PRICE; u.salt = (u.salt || 0) + n; S.time += 6;
      HC.Audio.cash(); return HC.Game.toast(`The supply's loader filled the spreader: ${n} units of rock salt for ${HC.money(n * HC.SALT_PRICE)}.`, 'good');
    }
    return baseInteract.apply(this, arguments);
  };
  const baseHint = U.hint;
  U.hint = function (u, S) {
    if (u && HC.hasSpreader(u.kind) && inPickup(u)) return `E: fill the salt spreader (${Math.floor(u.salt || 0)}/${HC.SALT_CAP}, ${HC.money(HC.SALT_PRICE)} a unit)`;
    const h = baseHint.apply(this, arguments);
    if (u && (HC.hasPlow(u.kind) || HC.hasSpreader(u.kind)) && HC.season() === 'winter') return `${h}${HC.hasPlow(u.kind) ? ' · Plow down' : ''}${HC.hasSpreader(u.kind) ? ` · Salt ${Math.floor(u.salt || 0)}/${HC.SALT_CAP}` : ''}`;
    return h;
  };

  // ---------- new jobs: snow plowing (winter), leaf cleanup (fall) ----------
  Object.assign(HC.JOBS, {
    snow_plowing: { name: 'Snow Plowing & Salting', color: '#7fa6c9', needs: ['truck'], disposal: 'place', blurb: 'Plow the parking area and drive (V-plow on a truck or a snow pusher on a machine), then salt the pavement with a spreader.' },
    leaf_cleanup: { name: 'Fall Leaf Cleanup', color: '#c8742a', needs: ['mower'], disposal: 'place', blurb: 'Mulch the fallen leaves off the lawn with a mower.' },
  });
  HC.REQUESTS = HC.REQUESTS || {};
  HC.REQUESTS.snow_plowing = ['We got buried last night. Can you plow the lot and the drive, and salt it?', 'Need the parking area plowed and salted before people slip.', 'The drive is drifted shut. Plow and salt, please.'];
  HC.REQUESTS.leaf_cleanup = ['The yard is ankle deep in leaves.', 'Can you mulch up all these leaves before the snow?', 'Leaves everywhere. Mow them up for us?'];
  Object.assign(G.ESTIMATE, {
    snow_plowing(tier) { return { pay: 260 + tier * 140, par: 30 + tier * 10, summary: 'A snowed-in parking area and drive to plow and salt' }; },
    leaf_cleanup(tier) { return { pay: 210 + tier * 110, par: 35 + tier * 12, summary: 'A lawn buried in fallen leaves to mulch up' }; },
  });
  const tilesIn = (z, f) => { for (let y = Math.floor(z.y / TS); y < Math.floor((z.y + z.h) / TS); y++) for (let x = Math.floor(z.x / TS); x < Math.floor((z.x + z.w) / TS); x++) f(x, y); };
  Object.assign(L.GEN, {
    snow_plowing(lot) {
      L.scatterTrees(lot, 3, ['pine', 'oak']);
      const z = { x: TS * 2, y: Math.max(TS * 2, lot.roadY - TS * 9), w: lot.pw - TS * 4, h: TS * 6 };
      lot.trees = lot.trees.filter((t) => !HC.circleRectHit(t.x, t.y, t.trunkR + 20, z));
      lot.snowUnder = true;
      const snow = (x, y) => { const t = lot.tiles[y * lot.w + x]; if (t !== T.WATER) lot.set(x, y, T.SNOW); };
      tilesIn(z, snow); if (lot.drive) tilesIn(lot.drive, snow);
      lot.zone = z;
    },
    leaf_cleanup(lot) {
      L.scatterTrees(lot, 6, ['oak', 'maple']);
      const z = { x: TS * 2, y: TS * 2, w: lot.pw - TS * 4, h: lot.roadY - TS * 4 };
      tilesIn(z, (x, y) => { const t = lot.tiles[y * lot.w + x]; if ((t === T.GRASS || t === T.TALL) && HC.chance(0.9)) lot.set(x, y, T.LEAVES); });
      lot.zone = null;
    },
  });
  // once the job lot is stamped into the world: remember what's under each snow tile (the paved lot, or the gravel drive)
  const baseStamp = HC.World.stamp;
  HC.World.stamp = function (world, p, lot, isJob) {
    const r = baseStamp.apply(this, arguments);
    if (isJob && lot && lot.snowUnder) {
      world.snowUnder = new Map(); world.snowPiles = [];
      for (let y = p.gy - 2; y < p.gy + p.ph + 2; y++) for (let x = p.gx; x < p.gx + p.pw; x++) {
        const i = y * world.w + x; if (world.tiles[i] !== T.SNOW) continue;
        world.snowUnder.set(i, world.zone && HC.inRect((x + 0.5) * TS, (y + 0.5) * TS, world.zone) ? T.ROAD : T.GRAVEL);
      }
    }
    return r;
  };
  const count = (S, test) => { const p = HC.world.parcels.find((q) => q.id === S.job.parcel), W = S.lot; let n = 0; if (p) for (let y = Math.floor(p.y / TS) - 2; y < Math.ceil((p.y + p.h) / TS) + 2; y++) for (let x = Math.floor(p.x / TS); x < Math.ceil((p.x + p.w) / TS); x++) if (test(W.tiles[y * W.w + x], y * W.w + x)) n++; return n; };
  Object.assign(G.OBJECTIVES, {
    snow_plowing(S) {
      const snow = count(S, (t) => t === T.SNOW), salt = count(S, (t) => t === T.SALT);
      S.init = S.init || { snow: Math.max(1, snow) };
      const okSnow = Math.floor(S.init.snow * 0.05), needSalt = Math.floor(S.init.snow * 0.7);
      const z = HC.world.zone, inner = z && { x: z.x + TS * 1.5, y: z.y + TS * 1.5, w: z.w - TS * 3, h: z.h - TS * 3 };
      const blocking = (S.lot.snowPiles || []).filter((p) => inner && p.n > 3 && HC.inRect(p.x, p.y, inner)).length;
      return [{ label: 'Plow the lot and the drive', n: snow <= okSnow ? 1 : 0, of: 1, left: Math.max(0, snow - okSnow) },
        { label: 'Push the snow piles to the edges', n: blocking ? 0 : 1, of: 1, left: blocking },
        { label: 'Salt the pavement', n: Math.min(salt, needSalt), of: needSalt, left: Math.max(0, needSalt - salt) }];
    },
    leaf_cleanup(S) {
      const leaves = count(S, (t) => t === T.LEAVES);
      S.init = S.init || { leaves: Math.max(1, leaves) };
      const ok = Math.floor(S.init.leaves * 0.05);
      return [{ label: 'Mulch the leaves off the lawn', n: leaves <= ok ? 1 : 0, of: 1, left: Math.max(0, leaves - ok) }];
    },
  });

  HC.Seasons = { roll, turn, TABLE, plowAt, saltAt, dropBlade };
})();
