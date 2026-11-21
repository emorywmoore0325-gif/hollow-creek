// Hollow Creek — co-op multiplayer.
// The host runs the whole simulation. Guests send their controls; the host drives the machine each guest is in
// and sends everyone a compact picture of the world about 15 times a second. Guests build the same world from the
// same seed, then replay the job sites the host has stamped in and apply what has changed since.
// Transport: PeerJS (WebRTC, free public signalling server) or, for local testing, a BroadcastChannel (?net=local).
'use strict';
(() => {
  const TICK = 1 / 15, INPUT_RATE = 1 / 20, MAX_GUESTS = 3, PREFIX = 'hollowcreek-';
  const Net = (HC.Net = {
    role: null, code: null, players: {}, myId: null, unit: null, hint: '', ob: null, actor: null, stampLog: [], status: '',
  });
  const S = () => HC.session;

  // ---------- transports ----------
  const useLocal = /[?&]net=local/.test(location.search);
  function loadPeerJS() {
    if (window.Peer) return Promise.resolve();
    // PeerJS ships inside the game (lib/peerjs.min.js); nothing is downloaded at run time
    return Promise.reject(new Error('The multiplayer library is missing from this copy of the game.'));
  }
  // a tiny connection wrapper so PeerJS and the local channel look the same
  function wrapPeerConn(c) {
    const h = { data: [], close: [] };
    c.on('data', (d) => h.data.forEach((f) => f(typeof d === 'string' ? JSON.parse(d) : d)));
    c.on('close', () => h.close.forEach((f) => f()));
    c.on('error', () => h.close.forEach((f) => f()));
    return { id: c.peer, send: (o) => { try { c.send(JSON.stringify(o)); } catch (e) { /* closed */ } }, on: (ev, f) => h[ev].push(f), close: () => c.close() };
  }
  function localHost(code, onConn) {
    const ch = new BroadcastChannel('hc-' + code), conns = {};
    ch.onmessage = (ev) => {
      const m = ev.data;
      if (m.to !== 'host') return;
      if (m.hello && !conns[m.from]) {
        const h = { data: [], close: [] };
        conns[m.from] = { id: m.from, send: (o) => ch.postMessage({ to: m.from, d: JSON.stringify(o) }), on: (e, f) => h[e].push(f), close: () => { delete conns[m.from]; }, _h: h };
        onConn(conns[m.from]);
      }
      if (m.d && conns[m.from]) conns[m.from]._h.data.forEach((f) => f(JSON.parse(m.d)));
      if (m.bye && conns[m.from]) { conns[m.from]._h.close.forEach((f) => f()); delete conns[m.from]; }
    };
    return Promise.resolve({ close: () => ch.close() });
  }
  function localJoin(code) {
    const ch = new BroadcastChannel('hc-' + code), me = 'g' + Math.random().toString(36).slice(2, 8), h = { data: [], close: [] };
    ch.onmessage = (ev) => { if (ev.data.to === me) h.data.forEach((f) => f(JSON.parse(ev.data.d))); };
    ch.postMessage({ to: 'host', from: me, hello: true });
    window.addEventListener('beforeunload', () => ch.postMessage({ to: 'host', from: me, bye: true }));
    return Promise.resolve({ id: me, send: (o) => ch.postMessage({ to: 'host', from: me, d: JSON.stringify(o) }), on: (e, f) => h[e].push(f), close: () => { ch.postMessage({ to: 'host', from: me, bye: true }); ch.close(); } });
  }
  async function peerHost(code, onConn) {
    await loadPeerJS();
    return new Promise((res, rej) => {
      const peer = new window.Peer(PREFIX + code);
      peer.on('open', () => res(peer));
      peer.on('error', (e) => rej(new Error(e.type === 'unavailable-id' ? 'That room code is taken. Try again.' : 'Could not reach the multiplayer server (' + e.type + ').')));
      peer.on('connection', (c) => c.on('open', () => onConn(wrapPeerConn(c))));
    });
  }
  async function peerJoin(code) {
    await loadPeerJS();
    return new Promise((res, rej) => {
      const peer = new window.Peer();
      peer.on('error', (e) => rej(new Error(e.type === 'peer-unavailable' ? 'No game with that code. Check it with the host.' : 'Could not reach the multiplayer server (' + e.type + ').')));
      peer.on('open', () => {
        const c = peer.connect(PREFIX + code, { reliable: true });
        c.on('open', () => res(wrapPeerConn(c)));
      });
    });
  }

  // ---------- helpers ----------
  const prim = (o, skip = {}) => { const r = {}; for (const k in o) { const v = o[k]; if (skip[k]) continue; if (v === null || typeof v !== 'object') { if (typeof v !== 'function') r[k] = v; } } return r; };
  const b64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 8192) s += String.fromCharCode.apply(null, u8.subarray(i, i + 8192)); return btoa(s); };
  const unb64 = (s) => { const b = atob(s), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; };
  const treeSig = (t) => `${t.state}|${t.fallA}|${(t.fallT || 0).toFixed(2)}|${(t.cut || 0).toFixed(2)}|${(t.buck || 0).toFixed(2)}|${t.marked ? 1 : 0}|${t.damaged ? 1 : 0}|${(t.landT || 0).toFixed(2)}`;
  const bushKey = (b) => Math.round(b.x) + ',' + Math.round(b.y);
  const itemOut = (it) => { const o = prim(it); if (it.content) o.cn = it.content.length; return o; };
  const itemIn = (o) => { const it = Object.assign({}, o); if (o.cn !== undefined) { it.content = Array.from({ length: o.cn }, () => ({ kind: 'brush' })); delete it.cn; } return it; };
  const serialLot = (lot) => { const o = JSON.parse(JSON.stringify(lot, (k, v) => (k === 'tiles' || typeof v === 'function' ? undefined : v))); o.tiles = Array.from(lot.tiles); return o; }; // a deep copy, taken before the stamp moves anything
  const unserialLot = (o) => { const lot = Object.assign({}, o); lot.tiles = Uint8Array.from(o.tiles); lot.set = (x, y, t) => { if (x >= 0 && y >= 0 && x < lot.w && y < lot.h) lot.tiles[y * lot.w + x] = t; }; return lot; };

  // record every job site stamped into the world since this session's world was built, so a guest can replay them
  const origStamp = HC.World.stamp;
  HC.World.stamp = function (world, p, lot, keep) { Net.stampLog.push({ pid: p.id, keep, lot: serialLot(lot) }); return origStamp.call(this, world, p, lot, keep); };
  const origBoot = HC.Game.boot;
  HC.Game.boot = function () { Net.stampLog = []; return origBoot.apply(this, arguments); };

  // ================= HOST =================
  let shadowTiles = null, prevTree = [], prevBush = new Map(), prevSig = {}, tickAcc = 0, events = [];
  function snapshotState() {
    const s = S(), W = HC.world;
    shadowTiles = W.tiles.slice();
    prevTree = W.trees.map(treeSig);
    prevBush = new Map(W.bushes.map((b) => [bushKey(b), b.hp || 0]));
  }
  // the full picture a newly joined guest needs
  function welcome(p) {
    const s = S(), W = HC.world, C = HC.company;
    const company = JSON.parse(JSON.stringify(Object.assign({}, C, { pos: HC.Game.snapshot(), active: null, board: [] })));
    const dirty = [];
    W.trees.forEach((t, i) => { if (t.state !== 'standing' || t.cut || t.buck || t.marked || t.damaged) dirty.push([i, prim(t)]); });
    return {
      type: 'welcome', you: p.id, unit: p.unit, code: Net.code, company, stamps: Net.stampLog, tiles: b64(W.tiles), trees: dirty,
      bushes: W.bushes.map((b) => [bushKey(b), b.hp || 0]), stumps: W.stumps.map(prim), items: W.items.map(itemOut),
      fences: W.fences.map((f, i) => (f.broken ? i : -1)).filter((i) => i >= 0), wires: W.wires.map((w, i) => (w.down ? i : -1)).filter((i) => i >= 0),
      houses: W.houses.map((h) => h.damaged || []), job: s.job, zone: W.zone, targets: W.targets,
      session: { time: s.time, stage: s.stage, workMins: s.workMins, weather: s.weather },
    };
  }
  function freeUnit(prefer) {
    const s = S(), taken = new Set([s.active, ...Object.values(Net.players).map((q) => q.unit)]);
    const order = [prefer, 'miniskid', 'skid', 'saw', 'truck2', 'dually', 'tractor', 'land', ...Object.keys(s.units)];
    return order.find((k) => k && s.units[k] && !s.units[k].hidden && !s.units[k].boarded && !taken.has(k) && k !== 'op' && HC.EQUIP[k].move !== 'tow') || null;
  }
  Net.heldBy = (k) => Object.values(Net.players).find((q) => (q.unit === k && !q.passenger) || q.walker === k) || null; // the driver (passengers don't count)
  // each guest has their own person on foot (op_1, op_2, op_3): a hi-vis vest in their colour
  const VESTS = ['#2f7fd6', '#3fae4a', '#9b4fd1', '#d64f8a'];
  function ensureWalker(k) {
    if (!HC.EQUIP[k]) HC.Game.registerClone(k, 'op');
    Object.assign(HC.EQUIP[k], { name: 'On foot', short: 'On foot', hidden: true, vest: VESTS[(+k.split('_')[1] - 1) % VESTS.length] });
  }
  Net.ensureWalker = ensureWalker;
  function makeWalker(p) {
    const s = S();
    let n = 1; while (s.units['op_' + n]) n++;
    const k = 'op_' + n; ensureWalker(k);
    const near = s.units[s.active] || s.units.op, ang = Math.random() * 6.28;
    const u = HC.Units.create(k, near.x + Math.cos(ang) * (near.r + 24), near.y + Math.sin(ang) * (near.r + 24), ang);
    Object.assign(u, { occupied: true, hidden: false });
    s.units[k] = u; p.walker = k;
    return k;
  }
  // F for a guest: climb into the machine beside you, or climb out of the one you're in
  function guestClimb(p) {
    const s = S(), w = s.units[p.walker], u = s.units[p.unit];
    if (!w) return;
    if (p.unit === p.walker) {
      let best = null, bd = 1e9;
      for (const k in s.units) {
        const m = s.units[k];
        if (!HC.DRIVEN(k) || m.hidden || m.boarded || k.includes(':')) continue;
        const d = HC.dist(w.x, w.y, m.x, m.y) - m.r;
        if (d < 40 && d < bd) { bd = d; best = k; }
      }
      if (!best) return guestToast(p, 'No machine close enough. Walk up to one and press F.');
      w.hidden = true; w.vx = w.vy = 0;
      const driver = best === s.active ? 'the host' : Net.heldBy(best) ? Net.heldBy(best).name : null;
      assign(p, best);
      if (driver) { p.passenger = true; return guestToast(p, `You climbed in with ${driver} and are riding along. F climbs out.`); }
      return guestToast(p, `You climbed into the ${HC.EQUIP[best].short.toLowerCase()}.`);
    }
    if (u && Math.abs(u.v || 0) > 40) return guestToast(p, 'Slow down to climb out.');
    const side = (u ? u.a : 0) + Math.PI / 2, off = (u ? u.r : 8) + 14;
    w.x = (u ? u.x : w.x) + Math.cos(side) * off; w.y = (u ? u.y : w.y) + Math.sin(side) * off;
    if (HC.Lot.tile(s.lot, w.x, w.y) === HC.T.WATER) { w.x -= Math.cos(side) * off * 2; w.y -= Math.sin(side) * off * 2; }
    w.hidden = false; w.a = u ? u.a : w.a;
    if (u && HC.DRIVEN(u.kind)) { u.v = 0; u.moving = false; u.working = false; }
    assign(p, p.walker);
    guestToast(p, 'You climbed out. Walk to any machine and press F to get in.');
  }
  function assign(p, k) {
    const s = S();
    if (p.unit && s.units[p.unit] && p.unit !== s.active && p.unit !== p.walker && !p.passenger && !Object.values(Net.players).some((q) => q !== p && q.unit === p.unit)) s.units[p.unit].occupied = false;
    p.passenger = false;
    if (p.walker && k !== p.walker && s.units[p.walker]) s.units[p.walker].hidden = true;
    p.unit = k;
    if (k && s.units[k]) { s.units[k].occupied = true; s.units[k].hidden = false; }
    p.conn.send({ type: 'you', unit: k });
  }
  async function host() {
    Net.code = Array.from({ length: 5 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join('');
    const onConn = (conn) => {
      if (Object.keys(Net.players).length >= MAX_GUESTS) { conn.send({ type: 'full' }); return; }
      const p = { id: conn.id, conn, name: 'Player', input: { keys: new Set(), mouse: { down: false, wx: 0, wy: 0, x: 0, y: 0 }, camYaw: 0, camPitch: 0.9, zoom: 20 }, unit: null, toasts: [] };
      conn.on('data', (m) => onGuestMsg(p, m));
      conn.on('close', () => {
        if (!Net.players[p.id]) return;
        const s = S();
        if (p.mode === 'own') {
          delete Net.remote[p.tag]; rebuildRemote();
          for (const q of ownPlayers()) q.conn.send({ type: 'gone', tag: p.tag });
          delete Net.players[p.id]; HC.UI.toast(`${p.name} left the game.`); Net.refreshChip(); return;
        }
        if (p.unit && s.units[p.unit] && p.unit !== s.active) s.units[p.unit].occupied = false;
        if (p.walker) { for (const sw of s.saws || []) if (sw.holder === p.walker) sw.holder = null; delete s.units[p.walker]; }
        delete Net.players[p.id]; HC.UI.toast(`${p.name} left the game.`); Net.refreshChip();
      });
    };
    Net.transport = await (useLocal ? localHost(Net.code, onConn) : peerHost(Net.code, onConn));
    Net.role = 'host'; Net.myName = 'Host';
    snapshotState();
    Net.refreshChip();
    return Net.code;
  }
  function onGuestMsg(p, m) {
    const s = S();
    if (m.type === 'hello') {
      if (m.v !== HC.VERSION) { p.conn.send({ type: 'version', host: HC.VERSION }); return; }
      p.name = String(m.name || 'Player').slice(0, 16);
      if (m.mode === 'own') { // they bring their own company: their game runs on their computer, at their own yard
        const used = new Set(Object.values(Net.players).map((q) => q.yard)), yard = ['co2', 'co3', 'co4'].find((y) => !used.has(y));
        if (!yard) { p.conn.send({ type: 'full' }); return; }
        flushOwn(); pendStamps = []; // anything not yet sent to the others goes out before the snapshot
        p.mode = 'own'; p.yard = yard; p.tag = 'g' + yard.slice(2); p.co = String(m.co || p.name).slice(0, 40);
        Net.players[p.id] = p;
        ldSnap();
        p.conn.send(ownWelcome(p));
        HC.UI.toast(`${p.name} joined with their own company (${p.co}). Their yard is ${HC.world.yards.find((y) => y.id === yard).name}.`, 'good');
        Net.refreshChip();
        return;
      }
      p.mode = 'partner';
      Net.players[p.id] = p;
      p.unit = makeWalker(p); // friends arrive on foot beside the host
      p.conn.send(welcome(p));
      HC.UI.toast(`${p.name} joined the game.`, 'good');
      Net.refreshChip();
      return;
    }
    if (!Net.players[p.id]) return;
    if (p.mode === 'own') {
      if (m.type === 'opres') { m.tag = p.tag; onPres(m); for (const q of ownPlayers()) if (q !== p) q.conn.send(m); return; } // relay to the other companies
      if (m.type === 'took') { HC.company.board = (HC.company.board || []).filter((j) => j.id !== m.id); return; } // a friend took a job off the shared board
      if (m.type === 'payTo') { // money from their company: to the host, or passed on to another friend
        const amt = Math.round(+m.amt || 0); if (amt <= 0) return;
        if (m.to === 'h') { HC.company.money += amt; HC.Audio.cash(); HC.Save.save(); HC.UI.toast(`${p.name} (${p.co}) paid you ${HC.money(amt)}.`, 'good'); }
        else { const q = ownPlayers().find((x) => x.tag === m.to); if (q) q.conn.send({ type: 'pay', amt, from: p.name }); }
        return;
      }
      if (m.type === 'partnerReq') return askYesNo(`${p.name} wants to work for your company: your machines, jobs and bank. Let them?`, 'Let them', () => p.conn.send({ type: 'partnerOk' }));
      return;
    }
    if (m.type === 'act') { // a partner pressed a shop or job button: run it on this company
      const fn = HC.UI.ACT[m.sel];
      if (fn) Net.as(p, () => { const msg = fn(m.d || {}); if (msg) guestToast(p, msg, 'good'); });
      return;
    }
    if (m.type === 'input') {
      p.input.keys = new Set(m.keys || []); Object.assign(p.input.mouse, { down: !!m.down, wx: m.wx, wy: m.wy });
      p.input.camYaw = m.yaw || 0;
      return;
    }
    if (m.type === 'sel') {
      const k = m.kind, u = s.units[k];
      if (!u) return guestToast(p, `The company doesn't own the ${HC.EQUIP[k] ? HC.EQUIP[k].name : k}.`);
      if (k === s.active) return guestToast(p, 'The host is driving that one. Walk up to it and press F to ride along.');
      const other = Net.heldBy(k);
      if (other && other !== p) return guestToast(p, `${other.name} is driving that one. Walk up to it and press F to ride along.`);
      if (u.boarded) return guestToast(p, 'That crew is riding in a truck. The driver lets them out.');
      if (u.hidden || HC.EQUIP[k].move === 'tow' || k === 'op' || HC.baseOf(k) === 'op') return;
      assign(p, k);
      return;
    }
    if (m.type === 'key') {
      const u = s.units[p.unit];
      if (!u || s.paused) return;
      if (p.passenger) { if (m.k === 'f') guestClimb(p); else guestToast(p, 'You are riding along. F climbs out.'); return; }
      Net.as(p, () => {
        const k = m.k;
        if (k === 'e') HC.Units.interact(u, s);
        else if (k === 'q') HC.Units.mode(u, s);
        else if (k === 'r') { if (HC.Units.isTruck(u.kind) || (HC.EQUIP[u.kind] && HC.EQUIP[u.kind].move !== 'walk')) HC.Units.hitchToggle(u, s); else HC.Game.toast('Get in a truck to hitch or drop a trailer.'); }
        else if (k === 'x') HC.Game.dumpLoad(u);
        else if (k === 'l' && HC.EQUIP[u.kind] && HC.EQUIP[u.kind].move !== 'walk') u.lights = !HC.lightsOn(u, s);
        else if (k === 'g' && HC.EQUIP[u.kind].move === 'walk') HC.Units.sawGrab(u, s);
        else if (k === 'f') guestClimb(p);
        else if (k === 'enter' && s.stage === 'onsite' && HC.Game.objectives(s).complete) HC.Game.finish();
      });
    }
  }
  function guestToast(p, text, kind = '') { p.toasts.push([text, kind]); }
  // run fn as if guest p were the player at the keyboard: their keys and mouse, their toasts
  Net.as = (p, fn) => {
    const saved = HC.input; HC.input = Object.assign({}, saved, p.input, { mouse: p.input.mouse, keys: p.input.keys });
    Net.actor = p;
    try { fn(); } finally { HC.input = saved; Net.actor = null; }
  };
  // called from the game's update loop for every unit: true when a guest is driving it
  Net.drive = (k, u, dt, s) => {
    if (Net.role !== 'host') return false;
    const p = Net.heldBy(k);
    if (!p) return false;
    u.occupied = true;
    Net.as(p, () => HC.Units.update(u, dt, s, true));
    return true;
  };
  let itemAcc = 0;
  function hostTick(dt) {
    frameRemote(dt);
    ownAcc += dt;
    if (ownAcc >= OWN_RATE && ownPlayers().length) { ownAcc = 0; flushOwn(); }
    tickAcc += dt;
    const partners = Object.values(Net.players).filter((q) => q.mode !== 'own');
    if (tickAcc < TICK || !partners.length) { if (!partners.length) events = []; return; }
    tickAcc = 0;
    const s = S(), W = HC.world, C = HC.company;
    const units = {};
    for (const k in s.units) {
      const u = s.units[k], o = prim(u, { input: 1 });
      o.on = u.on; o.headAt = u.headAt; o.craneTo = u.craneTo;
      o.carry = u.carrying.map(itemOut);
      if (HC.EQUIP[k].base) o.b = HC.EQUIP[k].base;
      units[k] = o;
    }
    const trailers = s.trailers.filter((t) => !HC.EQUIP[t.kind] || HC.EQUIP[t.kind].move !== 'tow').map((t) => Object.assign(prim(t), { cg: t.cargo ? t.cargo.map((c) => c.kind) : [] }));
    // world changes since the last tick
    const tc = [];
    W.trees.forEach((t, i) => { const sg = treeSig(t); if (sg !== prevTree[i]) { prevTree[i] = sg; tc.push([i, prim(t)]); } });
    const cur = new Map(W.bushes.map((b) => [bushKey(b), b.hp || 0])), brm = [], bhp = [];
    for (const [k] of prevBush) if (!cur.has(k)) brm.push(k);
    for (const [k, hp] of cur) if (prevBush.get(k) !== hp) bhp.push([k, hp]);
    prevBush = cur;
    const ti = [];
    for (let i = 0; i < W.tiles.length; i++) if (W.tiles[i] !== shadowTiles[i]) { ti.push(i, W.tiles[i]); shadowTiles[i] = W.tiles[i]; }
    const sig = (key, val) => { const j = JSON.stringify(val); if (prevSig[key] === j) return undefined; prevSig[key] = j; return val; };
    const msg = {
      type: 'tick', t: s.time, st: s.stage, wm: s.workMins, paused: !!s.paused, m: C.money, day: C.day,
      units, trailers, at: s.attachments, saws: s.saws || [], hose: s.hose || null, items: (itemAcc += TICK) >= 0.25 ? ((itemAcc = 0), sig('items', W.items.map((it) => { const o = itemOut(it); o.x = Math.round(o.x); o.y = Math.round(o.y); if (o.z) o.z = Math.round(o.z * 20) / 20; return o; }))) : undefined, // debris at most 4x a second, and only when it moved
      tc, brm, bhp, ti,
      stumps: sig('stumps', W.stumps.map(prim)), fences: sig('fences', W.fences.map((f, i) => (f.broken ? i : -1)).filter((i) => i >= 0)),
      wires: sig('wires', W.wires.map((w, i) => (w.down ? i : -1)).filter((i) => i >= 0)), houses: sig('houses', W.houses.map((h) => (h.damaged || []).length)),
      job: sig('job', s.job ? { id: s.job.id, type: s.job.type, parcel: s.job.parcel, client: s.job.client, address: s.job.address, pay: s.job.pay, par: s.job.par } : null),
      zone: sig('zone', W.zone || null), targets: sig('targets', W.targets || []), weather: sig('weather', s.weather),
      owned: sig('owned', C.owned), pen: { n: s.penalties.length, dmg: s.costs.damage },
      ob: s.job ? HC.Game.objectives(s) : null, ev: events, host: HC.company.name,
      co: sig('co', coLite(C)),
      rem: Object.entries(Net.remote).map(([tag, R]) => ({ tag, name: R.name, co: R.co, me: R.me, job: R.job, units: R.rawUnits, trailers: R.rawTrailers, at: R.rawAt, items: sig('ri' + tag, R.rawItems) })),
      players: Object.values(Net.players).map((q) => [q.name + (q.passenger ? ' (riding)' : ''), q.unit]).concat([['Host', s.active]]),
    };
    events = [];
    for (const p of partners) {
      const u = s.units[p.unit];
      let hint = '';
      if (u && p.passenger) { const d = p.unit === s.active ? 'the host' : (Net.heldBy(p.unit) || {}).name || 'nobody'; hint = `Riding in the ${HC.EQUIP[p.unit].short.toLowerCase()} with ${d}. F climbs out.`; }
      else if (u) Net.as(p, () => { try { hint = HC.Units.hint(u, s); } catch (e) { hint = ''; } });
      p.conn.send(Object.assign({}, msg, { hint, toasts: p.toasts.splice(0), unit: p.unit }));
    }
  }
  // job sites stamped while guests are connected
  HC.World.stamp = (function (inner) {
    return function (world, p, lot, keep) {
      const r = inner.apply(this, arguments);
      if (Net.role === 'host') for (const q of Object.values(Net.players)) if (q.mode !== 'own') q.conn.send({ type: 'stamp', pid: p.id, keep, lot: Net.stampLog[Net.stampLog.length - 1].lot });
      if ((Net.role === 'host' || Net.role === 'peer') && !applyingRemote) { pendStamps.push({ pid: p.id, lot: Net.stampLog[Net.stampLog.length - 1].lot }); if (LD) ldSnap(); }
      return r;
    };
  })(HC.World.stamp);

  // events guests should see (dust, chip spray, floating numbers)
  for (const fn of ['dust', 'spray', 'float']) {
    const orig = HC.Game[fn];
    HC.Game[fn] = function () { if (Net.role === 'host' && Object.keys(Net.players).length && events.length < 300) events.push([fn, ...arguments]); return orig.apply(this, arguments); };
  }
  // a toast raised while running a guest's action goes to that guest
  const origToast = HC.UI.toast;
  HC.UI.toast = function (text, kind) { if (Net.actor) return guestToast(Net.actor, text, kind); return origToast.apply(this, arguments); };

  // ================= GUEST =================
  let conn = null, inAcc = 0, lastKeys = '';
  async function join(code, name, opts = {}) {
    Net.myName = name;
    code = String(code || '').trim().toUpperCase();
    if (!/^[A-Z0-9]{4,8}$/.test(code)) throw new Error('Type the room code the host gave you.');
    conn = await (useLocal ? localJoin(code) : peerJoin(code));
    Net.code = code;
    return new Promise((res, rej) => {
      const to = setTimeout(() => rej(new Error('The host did not answer.')), 15000);
      conn.on('data', (m) => {
        if (m.type === 'full') { clearTimeout(to); rej(new Error('That game is full (4 players).')); return; }
        if (m.type === 'version') { clearTimeout(to); rej(new Error(`The host is on a different version of the game (host ${m.host}, you ${HC.VERSION}). Both of you reload the latest copy.`)); return; }
        if (m.type === 'welcome') { clearTimeout(to); onWelcome(m); res(); return; }
        if (m.type === 'owelcome') { clearTimeout(to); onOwnWelcome(m); res(); return; }
        if (Net.role === 'peer') return onPeerMsg(m);
        onHostMsg(m);
      });
      conn.on('close', () => {
        if (Net.role === 'guest') { HC.UI.toast('The host closed the game.', 'bad'); setTimeout(() => location.reload(), 2500); }
        if (Net.role === 'peer') { HC.Save.save(); HC.UI.toast('The host closed the game. Your company is saved; you can keep playing on your own from the title screen.', 'bad'); Net.remote = {}; rebuildRemote(); }
      });
      conn.send({ type: 'hello', name: name || 'Player', v: HC.VERSION, mode: opts.mode || 'own', co: HC.company.name });
    });
  }
  function onWelcome(m) {
    Net.role = 'guest'; Net.mode = 'partner'; Net.myId = m.you; Net.unit = m.unit;
    HC.company = m.company;
    for (const c of HC.company.clones || []) HC.Game.registerClone(c.key, c.base);
    HC.Game.boot();
    const s = S(), W = HC.world;
    // replay the host's job sites, then bring everything else to the host's state
    for (const st of m.stamps) { const p = W.parcels.find((q) => q.id === st.pid); if (p) origStamp(W, p, unserialLot(st.lot), st.keep); }
    W.tiles.set(unb64(m.tiles));
    for (const [i, t] of m.trees) if (W.trees[i]) Object.assign(W.trees[i], t);
    const keep = new Map(m.bushes);
    W.bushes = W.bushes.filter((b) => keep.has(bushKey(b))); for (const b of W.bushes) b.hp = keep.get(bushKey(b));
    W.stumps = m.stumps; W.items = m.items.map(itemIn);
    m.fences.forEach((i) => { if (W.fences[i]) W.fences[i].broken = true; });
    m.wires.forEach((i) => { if (W.wires[i]) W.wires[i].down = true; });
    m.houses.forEach((d, i) => { if (W.houses[i]) W.houses[i].damaged = d; });
    W.zone = m.zone; W.targets = m.targets || [];
    s.job = m.job; Object.assign(s, m.session);
    s.active = m.unit || s.active;
    for (const k in s.units) s.units[k].occupied = false;
    HC.Render.prepare(W);
    Net.status = 'Connected';
  }
  const lerpA = (a, b, f) => a + HC.angDiff(a, b) * f;
  // a friend running their own company: the others' machines and world changes, and the host's questions
  function onPeerMsg(m) {
    if (m.type === 'opres') return onPres(m);
    if (m.type === 'pay') { HC.company.money += m.amt; HC.Audio.cash(); HC.Save.save(); HC.UI.toast(`${m.from} paid you ${HC.money(m.amt)}.`, 'good'); return; }
    if (m.type === 'gone') { const R = Net.remote[m.tag]; delete Net.remote[m.tag]; rebuildRemote(); if (R) HC.UI.toast(`${R.name} left the game.`); Net.refreshChip(); return; }
    if (m.type === 'partnerOk') { HC.UI.toast('The host said yes. Switching to their company...', 'good'); setTimeout(() => rejoinAs('partner'), 900); return; }
    if (m.type === 'invite') return askYesNo(`${m.from} invites you to work for their company: their machines, jobs and bank. Your own company is saved and waits for you.`, 'Work for them', () => rejoinAs('partner'));
  }
  function onHostMsg(m) {
    const s = S(), W = HC.world;
    if (!s) return;
    if (m.type === 'you') { Net.unit = m.unit; if (m.unit) s.active = m.unit; return; }
    if (m.type === 'stamp') { const p = W.parcels.find((q) => q.id === m.pid); if (p) { origStamp(W, p, unserialLot(m.lot), m.keep); HC.Render.restamp(p); } return; }
    if (m.type === 'results') { HC.UI.results(m.r); return; }
    if (m.type === 'pay') { const co = HC.Save.credit(m.amt); HC.Audio.cash(); HC.UI.toast(co ? `${m.from} paid you ${HC.money(m.amt)}. It went into your own company${co === true ? '' : ' (' + co + ')'}, waiting for you.` : `${m.from} paid you ${HC.money(m.amt)}, but your own company's save couldn't be found.`, co ? 'good' : 'bad'); return; }
    if (m.type !== 'tick') return;
    s.time = m.t; s.stage = m.st; s.workMins = m.wm; s.paused = false; Net.hostPaused = m.paused;
    if (m.co) { const before = JSON.stringify(HC.company.owned) + JSON.stringify(HC.company.clones || []); Object.assign(HC.company, m.co); if (JSON.stringify(HC.company.owned) + JSON.stringify(HC.company.clones || []) !== before) setTimeout(() => HC.UI.buildHud(), 0); }
    if (m.rem) { const tags = new Set(m.rem.map((r) => r.tag)); for (const r of m.rem) { if (!r.items) delete r.items; onPres(r); } for (const t in Net.remote) if (!tags.has(t)) delete Net.remote[t]; rebuildRemote(); }
    HC.company.money = m.m; HC.company.day = m.day;
    if (m.owned) HC.company.owned = m.owned;
    if (m.weather) s.weather = m.weather;
    // machines: create new ones (bought by the host), drop sold ones, steer the rest toward the host's positions
    for (const k in m.units) {
      const o = m.units[k];
      if (!HC.EQUIP[k] && o.b) HC.Game.registerClone(k, o.b);
      if (o.b === 'op') ensureWalker(k);
      let u = s.units[k];
      if (!u) { u = s.units[k] = HC.Units.create(k, o.x, o.y, o.a); }
      const { x, y, a } = o; delete o.x; delete o.y; delete o.a;
      Object.assign(u, o);
      u.carrying = (o.carry || []).map(itemIn); delete u.carry;
      u._t = { x, y, a };
      if (u.x === undefined || HC.dist(u.x, u.y, x, y) > 220) { u.x = x; u.y = y; u.a = a; }
    }
    for (const k in s.units) if (!m.units[k]) delete s.units[k];
    // trailers (towed chippers ride in units)
    const tw = s.trailers.filter((t) => HC.EQUIP[t.kind] && HC.EQUIP[t.kind].move === 'tow');
    const keepT = [];
    for (const o of m.trailers) {
      let t = s.trailers.find((q) => q.id === o.id);
      if (!t) { t = { id: o.id, kind: o.kind, cargo: [] }; }
      const { x, y, a } = o; delete o.x; delete o.y; delete o.a;
      const tipN = t.tipN || 0;
      Object.assign(t, o); t.cargo = o.cg.map((kind) => ({ kind })); delete t.cg;
      if ((o.tipN || 0) > tipN) t.tipT = 1;
      t._t = { x, y, a };
      if (t.x === undefined || HC.dist(t.x, t.y, x, y) > 220) { t.x = x; t.y = y; t.a = a; }
      keepT.push(t);
    }
    s.trailers = keepT.concat(tw.map((t) => s.units[t.id]).filter(Boolean));
    s.attachments = m.at; if (HC.Game.sawProps) HC.Game.sawProps(s); s.saws = m.saws || (m.saw ? [m.saw] : []); s.hose = m.hose;
    // the world
    const byId = new Map(W.items.map((it) => [it.id, it]));
    if (m.items) W.items = m.items.map((o) => { const it = byId.get(o.id); if (it) { const n = itemIn(o); Object.assign(it, n); if (!n.content) delete it.content; return it; } return itemIn(o); });
    for (const [i, t] of m.tc) if (W.trees[i]) Object.assign(W.trees[i], t);
    if (m.brm.length) { const rm = new Set(m.brm); W.bushes = W.bushes.filter((b) => !rm.has(bushKey(b))); }
    if (m.bhp.length) { const hp = new Map(m.bhp); for (const b of W.bushes) if (hp.has(bushKey(b))) b.hp = hp.get(bushKey(b)); }
    for (let i = 0; i < m.ti.length; i += 2) { const idx = m.ti[i]; W.tiles[idx] = m.ti[i + 1]; HC.Render.setTile(idx % W.w, Math.floor(idx / W.w)); }
    if (m.stumps) W.stumps = m.stumps;
    if (m.fences) { W.fences.forEach((f) => { f.broken = false; }); m.fences.forEach((i) => { if (W.fences[i]) W.fences[i].broken = true; }); }
    if (m.wires) { W.wires.forEach((w) => { w.down = false; }); m.wires.forEach((i) => { if (W.wires[i]) W.wires[i].down = true; }); }
    if (m.zone !== undefined) W.zone = m.zone;
    if (m.targets !== undefined) W.targets = m.targets;
    if (m.job !== undefined) s.job = m.job;
    s.penalties = Array.from({ length: m.pen.n }, () => ({})); s.costs = Object.assign(s.costs || {}, { damage: m.pen.dmg });
    Net.ob = m.ob; Net.hint = m.hint || ''; Net.players = m.players; Net.hostName = m.host;
    Net.unit = m.unit; if (m.unit) s.active = m.unit;
    for (const [fn, ...args] of m.ev || []) if (origFx[fn]) origFx[fn].apply(null, args);
    for (const [text, kind] of m.toasts || []) origToast(text, kind);
    Net.refreshChip();
  }
  const origFx = { dust: HC.Game.dust, spray: HC.Game.spray, float: HC.Game.float };
  // the guest's frame: no simulation, just glide toward the host's positions, run particles, send controls
  function guestFrame(dt) {
    const s = S();
    if (!s) return;
    const f = Math.min(1, dt * 12);
    for (const o of Object.values(s.units).concat(s.trailers)) {
      if (!o._t) continue;
      o.x += (o._t.x - o.x) * f; o.y += (o._t.y - o.y) * f; o.a = lerpA(o.a, o._t.a, f);
    }
    HC.Units.snapRiders(s); // a strapped machine glides with its trailer, not on its own
    for (const p of s.particles) { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z = Math.max(0, p.z + p.vz * dt); p.vz -= 220 * dt; if (!p.ballistic) { p.vx *= 0.94; p.vy *= 0.94; } }
    s.particles = s.particles.filter((p) => p.t < p.life);
    for (const fl of s.floats) fl.t += dt;
    s.floats = s.floats.filter((fl) => fl.t < 1.6);
    inAcc += dt;
    const keys = [...HC.input.keys].join(',');
    if (inAcc >= INPUT_RATE || keys !== lastKeys) {
      inAcc = 0; lastKeys = keys;
      conn.send({ type: 'input', keys: [...HC.input.keys], down: HC.input.mouse.down, wx: HC.input.mouse.wx, wy: HC.input.mouse.wy, yaw: HC.input.camYaw || 0 });
    }
  }
  // a key pressed on the guest's keyboard
  function guestKey(k) {
    if (/^[0-9]$/.test(k)) { const kind = HC.UI.fleet()[(+k + 9) % 10]; if (kind) conn.send({ type: 'sel', kind }); return true; }
    if (k === '[' || k === ']') {
      const fl = HC.UI.fleet(), i = fl.indexOf(Net.unit);
      conn.send({ type: 'sel', kind: fl[(i + (k === ']' ? 1 : fl.length - 1)) % fl.length] }); return true;
    }
    if (['e', 'q', 'r', 'x', 'g', 'f', 'l', 'enter'].includes(k)) { conn.send({ type: 'key', k }); return true; }
    return false;
  }

  // ================= OWN COMPANIES =================
  // Each player runs their own game on their own computer: their company, yard, machines, jobs and bank. The world is
  // shared: everyone sends the others where their machines are and what they changed in the world (trees, brush,
  // ground, stumps, fences, job sites), about ten times a second. The host relays between the friends.
  const OWN_RATE = 1 / 10;
  let ownAcc = 0, pendStamps = [], lastItemsSig = '', lastBoardSig = '', myTag = 'h', applyingRemote = false;
  Net.remote = {}; // tag -> another company: { name, co, me, job, units, trailers, at, items, raw... }
  const ownPlayers = () => Object.values(Net.players).filter((q) => q.mode === 'own');
  const tkey = (t) => t.k0 || (t.k0 = Math.round(t.x) + ',' + Math.round(t.y)); // where it first stood: a dragged tree keeps its name
  const fenceKey = (f) => Math.round(f.x) + ',' + Math.round(f.y) + ',' + Math.round(f.w);
  const wireKey = (w) => Math.round(w.x1) + ',' + Math.round(w.y1);
  const houseKey = (h) => Math.round(h.x) + ',' + Math.round(h.y);
  const treeDefault = (t) => t.state === 'standing' && !t.cut && !t.buck && !t.marked && !t.damaged && !t.pushHp;
  let LD = null, tmapArr = null, tmapLen = 0, tmap = null;
  function treeMap() { const W = HC.world; if (tmapArr !== W.trees || tmapLen !== W.trees.length) { tmap = new Map(W.trees.map((t) => [tkey(t), t])); tmapArr = W.trees; tmapLen = W.trees.length; } return tmap; }
  // what this game has changed in the world since the last look (changes that came from the others are folded in quietly)
  function ldSnap() {
    const W = HC.world;
    LD = { trees: new Map(), bush: new Map(W.bushes.map((b) => [bushKey(b), b.hp || 0])), tiles: W.tiles.slice(),
      stumps: new Map(W.stumps.map((s) => [tkey(s), +(s.hp || 0).toFixed(2)])), fences: new Set(W.fences.filter((f) => f.broken).map(fenceKey)),
      wires: new Set(W.wires.filter((w) => w.down).map(wireKey)), houses: new Map(W.houses.map((h) => [houseKey(h), (h.damaged || []).length])) };
    for (const t of W.trees) if (!treeDefault(t)) LD.trees.set(tkey(t), treeSig(t));
  }
  function ldDiff() {
    const W = HC.world, d = {};
    if (!LD) ldSnap();
    const tc = [];
    for (const t of W.trees) {
      const k = tkey(t), was = LD.trees.get(k);
      if (was === undefined && treeDefault(t)) continue;
      const sg = treeSig(t);
      if (sg !== was) { LD.trees.set(k, sg); tc.push([k, prim(t)]); }
    }
    if (tc.length) d.tc = tc;
    const cur = new Map(W.bushes.map((b) => [bushKey(b), b.hp || 0])), brm = [], bhp = [];
    for (const [k] of LD.bush) if (!cur.has(k)) brm.push(k);
    for (const [k, hp] of cur) if (LD.bush.has(k) && LD.bush.get(k) !== hp) bhp.push([k, hp]);
    LD.bush = cur;
    if (brm.length) d.brm = brm;
    if (bhp.length) d.bhp = bhp;
    const ti = [];
    for (let i = 0; i < W.tiles.length; i++) if (W.tiles[i] !== LD.tiles[i]) { ti.push(i, W.tiles[i]); LD.tiles[i] = W.tiles[i]; }
    if (ti.length) d.ti = ti;
    const sc = new Map(W.stumps.map((s) => [tkey(s), s])), srm = [], sup = [];
    for (const [k] of LD.stumps) if (!sc.has(k)) srm.push(k);
    for (const [k, s] of sc) { const hp = +(s.hp || 0).toFixed(2); if (LD.stumps.get(k) !== hp) { sup.push(prim(s)); LD.stumps.set(k, hp); } }
    for (const k of srm) LD.stumps.delete(k);
    if (srm.length) d.srm = srm;
    if (sup.length) d.sup = sup;
    const fb = W.fences.filter((f) => f.broken).map(fenceKey).filter((k) => !LD.fences.has(k));
    if (fb.length) { d.fb = fb; fb.forEach((k) => LD.fences.add(k)); }
    const wd = W.wires.filter((w) => w.down).map(wireKey).filter((k) => !LD.wires.has(k));
    if (wd.length) { d.wd = wd; wd.forEach((k) => LD.wires.add(k)); }
    const hd = [];
    for (const h of W.houses) { const k = houseKey(h), n = (h.damaged || []).length; if (LD.houses.get(k) !== n) { LD.houses.set(k, n); hd.push([k, h.damaged || []]); } }
    if (hd.length) d.hd = hd;
    return d;
  }
  function ldApply(d) {
    const W = HC.world;
    if (!LD) ldSnap();
    if (d.tc) { const m = treeMap(); for (const [k, o] of d.tc) { const t = m.get(k); if (t) { Object.assign(t, o); LD.trees.set(k, treeSig(t)); } } }
    if (d.brm) { const rm = new Set(d.brm); W.bushes = W.bushes.filter((b) => !rm.has(bushKey(b))); d.brm.forEach((k) => LD.bush.delete(k)); }
    if (d.bhp) { const hp = new Map(d.bhp); for (const b of W.bushes) { const k = bushKey(b); if (hp.has(k)) { b.hp = hp.get(k); LD.bush.set(k, b.hp); } } }
    if (d.ti) for (let i = 0; i < d.ti.length; i += 2) { const idx = d.ti[i]; W.tiles[idx] = d.ti[i + 1]; LD.tiles[idx] = d.ti[i + 1]; HC.Render.setTile(idx % W.w, Math.floor(idx / W.w)); }
    if (d.srm) { const rm = new Set(d.srm); W.stumps = W.stumps.filter((s) => !rm.has(tkey(s))); d.srm.forEach((k) => LD.stumps.delete(k)); }
    if (d.sup) { const byK = new Map(W.stumps.map((s) => [tkey(s), s])); for (const o of d.sup) { const k = tkey(o), s = byK.get(k); if (s) Object.assign(s, o); else W.stumps.push(Object.assign({}, o)); LD.stumps.set(k, +(o.hp || 0).toFixed(2)); } }
    if (d.fb) { const set = new Set(d.fb); let ch = false; for (const f of W.fences) if (!f.broken && set.has(fenceKey(f))) { f.broken = true; ch = true; } d.fb.forEach((k) => LD.fences.add(k)); if (ch && HC.Render.fencesChanged) HC.Render.fencesChanged(); }
    if (d.wd) { const set = new Set(d.wd); let ch = false; for (const w of W.wires) if (!w.down && set.has(wireKey(w))) { w.down = true; ch = true; } d.wd.forEach((k) => LD.wires.add(k)); if (ch && HC.Render.wiresChanged) HC.Render.wiresChanged(); }
    if (d.hd) { const m = new Map(d.hd); for (const h of W.houses) { const k = houseKey(h); if (m.has(k)) { h.damaged = m.get(k); LD.houses.set(k, h.damaged.length); } } }
  }
  function applyStamp(st) {
    const W = HC.world, p = W.parcels.find((q) => q.id === st.pid);
    if (!p) return;
    applyingRemote = true;
    try { HC.World.stamp(W, p, unserialLot(st.lot), false); } finally { applyingRemote = false; }
    HC.Render.restamp(p);
    ldSnap();
  }
  // this game's machines and loose things, for the others
  function presence(withDiff = true) {
    const s = S(), W = HC.world, C = HC.company, units = {};
    for (const k in s.units) { const u = s.units[k], o = prim(u, { input: 1 }); o.on = u.on; o.carry = u.carrying.map(itemOut); o.b = HC.baseOf(k); units[k] = o; }
    const trailers = s.trailers.filter((t) => !HC.EQUIP[t.kind] || HC.EQUIP[t.kind].move !== 'tow').map((t) => Object.assign(prim(t), { cg: t.cargo ? t.cargo.map((c) => c.kind) : [] }));
    const items = W.items.map(itemOut), isig = items.map((i) => i.id + ':' + Math.round(i.x / 4) + ':' + Math.round(i.y / 4) + ':' + (i.cn || 0)).join('|'); // coarse: small settling nudges don't resend everything
    const jinfo = (j) => j && { id: j.id, client: j.client, type: j.type, address: j.address, pay: j.pay, parcel: j.parcel, due: j.due };
    const msg = { type: 'opres', tag: myTag, name: Net.myName || C.name, co: C.name, me: s.active, units, trailers, at: s.attachments || [], job: s.job ? s.job.parcel : null, jobs: [jinfo(C.active), jinfo(C.queued)].filter(Boolean) };
    if (withDiff) { msg.d = ldDiff(); msg.st = pendStamps.splice(0); }
    if (!withDiff || isig !== lastItemsSig) { if (withDiff) lastItemsSig = isig; msg.items = items; }
    if (Net.role === 'host') {
      Object.assign(msg, { t: s.time, w: s.weather });
      const bsig = (C.board || []).map((j) => j.id + ':' + (j.lost ? 1 : 0)).join(',');
      if (!withDiff || bsig !== lastBoardSig) { if (withDiff) lastBoardSig = bsig; msg.board = JSON.parse(JSON.stringify(C.board || [])); }
    }
    return msg;
  }
  function flushOwn() {
    if (!ownPlayers().length || !S()) return;
    const m = presence(true);
    for (const q of ownPlayers()) q.conn.send(m);
  }
  const pre = (tag, id) => (id === null || id === undefined ? id : tag + ':' + id);
  // another company's machines, trailers, attachments and loose things: shown here, driven over there
  function onPres(m) {
    if (!m || m.tag === myTag || !S()) return;
    if (m.board && Net.role === 'peer' && m.tag === 'h') { // the shared job board (everyone sees the same calls)
      const C = HC.company, had = new Set((C.board || []).map((j) => j.id));
      C.board = m.board.filter((j) => !(S().job && S().job.id === j.id));
      const fresh = C.board.filter((j) => !had.has(j.id));
      if (HC.UI.refreshPhone && (fresh.length || had.size !== C.board.length)) HC.UI.refreshPhone('jobs');
      if (fresh.length && had.size) { HC.Audio.pop(); HC.UI.toast(`Phone: ${fresh[0].client} wants ${HC.JOBS[fresh[0].type].name.toLowerCase()} for ${HC.money(fresh[0].pay)}. Press J to see the job board.`, 'call'); }
    }
    const s = S(), R = Net.remote[m.tag] || (Net.remote[m.tag] = { units: {}, trailers: [], at: [], items: [] });
    const jsig = JSON.stringify(m.jobs || []), changedJobs = jsig !== R.jsig;
    Object.assign(R, { name: m.name, co: m.co, me: m.me && m.tag + ':' + m.me, job: m.job, jobs: m.jobs || [], jsig });
    if (changedJobs && R.jsig !== undefined && HC.UI.refreshPhone) HC.UI.refreshPhone('jobs');
    for (const st of m.st || []) applyStamp(st);
    if (m.d) ldApply(m.d);
    R.rawUnits = m.units; R.rawTrailers = m.trailers; R.rawAt = m.at;
    const seen = new Set();
    for (const k in m.units || {}) {
      const o = m.units[k], key = m.tag + ':' + k, base = o.b && HC.EQUIP[o.b] ? o.b : HC.baseOf(k);
      seen.add(key);
      if (!HC.EQUIP[key]) { HC.Game.registerClone(key, base); Object.assign(HC.EQUIP[key], { name: HC.EQUIP[base].name, short: HC.EQUIP[base].short, hidden: true, remote: true }); if (base === 'op') HC.EQUIP[key].vest = VESTS[(+m.tag.slice(1) || 0) % VESTS.length]; }
      let u = R.units[key];
      if (!u) u = R.units[key] = HC.Units.create(key, o.x, o.y, o.a);
      const { x, y, a } = o;
      const keep = { x: u.x, y: u.y, a: u.a };
      Object.assign(u, o, keep);
      u.kind = key; u.remote = m.tag;
      u.on = o.on ? Object.assign({}, o.on, { id: pre(m.tag, o.on.id) }) : null;
      u.boarded = o.boarded ? pre(m.tag, o.boarded) : null;
      u.carrying = (o.carry || []).map((c) => Object.assign(itemIn(c), { id: m.tag + ':' + c.id }));
      u._t = { x, y, a };
      if (u.x === undefined || HC.dist(u.x, u.y, x, y) > 220) { u.x = x; u.y = y; u.a = a; }
    }
    for (const key in R.units) if (!seen.has(key)) delete R.units[key];
    const oldT = new Map(R.trailers.map((t) => [t.id, t]));
    R.trailers = (m.trailers || []).map((o) => {
      const id = pre(m.tag, o.id), t = oldT.get(id) || { id, kind: o.kind, cargo: [] }, { x, y, a } = o, tipN = t.tipN || 0;
      Object.assign(t, o, { id, x: t.x, y: t.y, a: t.a, hitch: o.hitch ? pre(m.tag, o.hitch) : null, remote: m.tag });
      t.cargo = (o.cg || []).map((kind) => ({ kind })); delete t.cg;
      if ((o.tipN || 0) > tipN) t.tipT = 1;
      t._t = { x, y, a };
      if (t.x === undefined || HC.dist(t.x, t.y, x, y) > 220) { t.x = x; t.y = y; t.a = a; }
      return t;
    });
    R.at = (m.at || []).map((a) => Object.assign({}, a, { id: pre(m.tag, a.id), on: a.on ? (a.on.startsWith('trailer:') ? 'trailer:' + pre(m.tag, a.on.slice(8)) : pre(m.tag, a.on)) : null, remote: m.tag }));
    if (m.items) { R.rawItems = m.items; R.items = m.items.map((o) => Object.assign(itemIn(o), { id: m.tag + ':' + o.id, remote: m.tag })); }
    if (Net.role === 'peer' && m.t !== undefined) { // the host keeps the clock and the weather
      if (Math.abs(s.time - m.t) > 2) s.time = m.t;
      if (m.w && (!s.weather || s.weather.id !== m.w.id)) { s.weather = m.w; HC.company.weather = m.w; }
    }
    rebuildRemote();
  }
  function rebuildRemote() {
    const s = S(), W = HC.world;
    if (!s) return;
    s.remote = {}; s.remoteTrailers = []; s.remoteAt = []; W.remoteItems = [];
    for (const tag in Net.remote) { const R = Net.remote[tag]; Object.assign(s.remote, R.units); s.remoteTrailers.push(...R.trailers); s.remoteAt.push(...R.at); W.remoteItems.push(...R.items); }
  }
  function frameRemote(dt) {
    const s = S();
    if (!s || !s.remote) return;
    const f = Math.min(1, dt * 12);
    for (const o of Object.values(s.remote).concat(s.remoteTrailers || [])) {
      if (!o._t) continue;
      o.x += (o._t.x - o.x) * f; o.y += (o._t.y - o.y) * f; o.a = lerpA(o.a, o._t.a, f);
    }
    // another company's strapped machines ride their trailers too
    for (const u of Object.values(s.remote)) {
      if (!u.on) continue;
      const t = (s.remoteTrailers || []).find((q) => q.id === u.on.id);
      if (!t || !HC.TRAILERS[t.kind]) continue;
      const off = u.on.off ?? (HC.TRAILERS[t.kind].slots || [0])[u.on.slot] ?? 0;
      u.x = t.x + Math.cos(t.a) * off; u.y = t.y + Math.sin(t.a) * off; u.a = t.a;
    }
  }
  Net.busyParcel = (pid) => Object.values(Net.remote).some((R) => R.job === pid);
  // the picture a friend bringing their own company needs: the shared world, and everybody else's machines
  function ownWelcome(p) {
    const s = S(), W = HC.world, others = {};
    for (const tag in Net.remote) { const R = Net.remote[tag]; others[tag] = { type: 'opres', tag, name: R.name, co: R.co, me: R.me && R.me.slice(tag.length + 1), job: R.job, units: R.rawUnits, trailers: R.rawTrailers, at: R.rawAt, items: R.rawItems || [] }; }
    return {
      type: 'owelcome', you: p.id, tag: p.tag, yard: p.yard, code: Net.code, stamps: Net.stampLog, tiles: b64(W.tiles),
      trees: W.trees.filter((t) => !treeDefault(t)).map((t) => [tkey(t), prim(t)]), bushes: W.bushes.map((b) => [bushKey(b), b.hp || 0]),
      stumps: W.stumps.map(prim), fences: W.fences.filter((f) => f.broken).map(fenceKey), wires: W.wires.filter((w) => w.down).map(wireKey),
      houses: W.houses.map((h) => [houseKey(h), h.damaged || []]), host: presence(false), others,
    };
  }
  function onOwnWelcome(m) {
    Net.role = 'peer'; Net.mode = 'own'; Net.myId = m.you; myTag = m.tag; Net.code = m.code; Net.homeYard = m.yard;
    const C = HC.company, job = C.active;
    C.homeItems = (C.pos && C.pos.items) || C.homeItems || []; // what's stored at your home yard waits for your next solo game
    C.active = null; C.pos = null; // park everything at your co-op yard; your job site comes back below
    HC.Game.boot();
    if (C.coopItems && C.coopItems.yard === m.yard) for (const it of C.coopItems.items || []) { it.id = HC.uid(); for (const c of it.content || []) c.id = HC.uid(); S().lot.items.push(it); } // what you left in this co-op yard last time
    const s = S(), W = HC.world;
    for (const st of m.stamps) { const p = W.parcels.find((q) => q.id === st.pid); if (p) { applyingRemote = true; try { HC.World.stamp(W, p, unserialLot(st.lot), false); } finally { applyingRemote = false; } } }
    W.tiles.set(unb64(m.tiles));
    const tm = treeMap();
    for (const [k, t] of m.trees) { const tr = tm.get(k); if (tr) Object.assign(tr, t); }
    const keepB = new Map(m.bushes);
    W.bushes = W.bushes.filter((b) => keepB.has(bushKey(b))); for (const b of W.bushes) b.hp = keepB.get(bushKey(b));
    W.stumps = m.stumps;
    const fb = new Set(m.fences), wd = new Set(m.wires), hd = new Map(m.houses);
    for (const f of W.fences) f.broken = fb.has(fenceKey(f));
    for (const w of W.wires) w.down = wd.has(wireKey(w));
    for (const h of W.houses) if (hd.has(houseKey(h))) h.damaged = hd.get(houseKey(h));
    s.time = m.host.t; s.weather = m.host.w; C.weather = m.host.w;
    HC.Render.prepare(W);
    ldSnap(); pendStamps = [];
    onPres(m.host);
    for (const tag in m.others) onPres(m.others[tag]);
    if (job) {
      if (Net.busyParcel(job.parcel)) HC.Game.toast(`Another company is already working at ${job.address}, so that job was called off.`, 'warn');
      else HC.Game.accept(job, true); // your job site, stamped again and sent to everyone
    }
    Net.status = 'Connected';
    Net.refreshChip();
  }
  function peerTick(dt) {
    frameRemote(dt);
    ownAcc += dt;
    if (ownAcc < OWN_RATE || !conn) return;
    ownAcc = 0;
    conn.send(presence(true));
  }
  // a partner's shop and job buttons go to the host
  Net.sendAct = (sel, d) => { if (conn) conn.send({ type: 'act', sel, d }); };
  Net.sendTook = (id) => { if (conn) conn.send({ type: 'took', id }); };
  // the whole company a partner sees in their phone (positions and the board's lots aren't needed)
  const coLite = (C) => { const o = Object.assign({}, C); delete o.pos; return o; };
  // asking yes or no on screen (the host deciding on a friend's request, or a friend on an invite)
  function askYesNo(text, yes, fn) {
    const el = document.createElement('div');
    el.className = 'coop-ask';
    el.innerHTML = `<p>${HC.UI.esc(text)}</p><div class="btn-row"><button class="btn primary">${HC.UI.esc(yes)}</button><button class="btn">No thanks</button></div>`;
    document.body.appendChild(el);
    const [ok, no] = el.querySelectorAll('button');
    ok.onclick = () => { el.remove(); fn(); };
    no.onclick = () => el.remove();
    setTimeout(() => el.remove(), 30000);
  }
  // switching between "my own company" and "working for the host": save, then reconnect the other way
  function rejoinAs(mode) {
    try { sessionStorage.setItem('hcRejoin', JSON.stringify({ code: Net.code, name: Net.myName, mode, slot: HC.Save.slot })); } catch (e) { /* private window */ }
    if (Net.role === 'peer') HC.Save.save();
    location.reload();
  }
  // pay another player: from the host to a friend (into their own company), or between companies
  Net.pay = (to, amount) => {
    const amt = Math.round(+amount || 0), C = HC.company;
    if (!(amt > 0)) return HC.UI.toast('Type an amount to pay.');
    if (Net.role === 'guest') return HC.UI.toast('You\'re working for the host: their bank pays. Go back to your own company to pay from yours.');
    if (amt > C.money) return HC.UI.toast(`You only have ${HC.money(C.money)}.`, 'warn');
    if (Net.role === 'host') {
      const p = Net.players[to]; if (!p) return;
      C.money -= amt; p.conn.send({ type: 'pay', amt, from: C.name });
      HC.Audio.cash(); HC.Save.save(); return HC.UI.toast(`Paid ${p.name} ${HC.money(amt)}.`, 'good');
    }
    if (Net.role === 'peer' && conn) {
      const R = Net.remote[to]; if (!R) return;
      C.money -= amt; conn.send({ type: 'payTo', to, amt, from: Net.myName || C.name });
      HC.Audio.cash(); HC.Save.save(); return HC.UI.toast(`Paid ${R.name} ${HC.money(amt)}.`, 'good');
    }
  };
  function askAmount(name, fn) {
    const el = document.createElement('div');
    el.className = 'coop-ask';
    el.innerHTML = `<p>Pay ${HC.UI.esc(name)} from your bank (${HC.money(HC.company.money)}):</p><div class="btn-row"><input class="pay-in" type="number" min="1" step="50" value="500" aria-label="Amount"><button class="btn primary">Pay</button><button class="btn">Cancel</button></div>`;
    document.body.appendChild(el);
    const inp = el.querySelector('input'), [ok, no] = el.querySelectorAll('button');
    inp.focus(); inp.select();
    ok.onclick = () => { el.remove(); fn(inp.value); };
    no.onclick = () => el.remove();
    inp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') ok.click(); if (e.key === 'Escape') no.click(); });
  }
  Net.requestPartner = () => { if (conn) { conn.send({ type: 'partnerReq' }); HC.UI.toast('Asked the host. Waiting for an answer...'); } };
  Net.leavePartner = () => askYesNo('Go back to your own company and yard?', 'Back to my company', () => rejoinAs('own'));
  Net.invite = (id) => { const p = Net.players[id]; if (p) { p.conn.send({ type: 'invite', from: HC.company.name }); HC.UI.toast(`Invited ${p.name} to work for your company.`); } };

  // names over the other players (the renderer draws these)
  Net.labels = () => {
    if (!Net.role) return [];
    const s = S(), list = Net.role === 'host' ? Object.values(Net.players).filter((q) => q.mode !== 'own').map((q) => [q.name, q.unit]) : Net.role === 'guest' ? (Array.isArray(Net.players) ? Net.players : []).filter(([, u]) => u !== Net.unit) : [];
    const out = list.map(([name, k]) => [name, s && s.units[k]]);
    for (const tag in Net.remote) { const R = Net.remote[tag]; out.push([R.name + (R.co && R.co !== R.name ? ' · ' + R.co : ''), s && s.remote && s.remote[R.me]]); }
    return out.filter(([, u]) => u && !u.hidden);
  };
  // ---------- HUD chip ----------
  Net.refreshChip = () => {
    let el = document.getElementById('h-coop');
    if (!Net.role) { if (el) el.remove(); return; }
    if (!el) {
      el = document.createElement('div'); el.id = 'h-coop'; el.className = 'h-chip coop'; (document.getElementById('h-top') || document.body).appendChild(el);
      el.addEventListener('click', (e) => { // buttons inside the chip
        const b = e.target.closest('button'); if (!b) return;
        if (b.dataset.pay) askAmount(b.dataset.who, (v) => Net.pay(b.dataset.pay, v)); else if (b.dataset.inv) Net.invite(b.dataset.inv); else if (b.dataset.do === 'join') Net.requestPartner(); else if (b.dataset.do === 'leave') Net.leavePartner();
      });
    }
    const E = HC.UI.esc, s = S(), sh = (k) => (k && HC.EQUIP[k] ? ' · ' + E(HC.EQUIP[k].short) : '');
    const rows = [];
    if (Net.role === 'host') {
      rows.push(`You (host)${sh(s && s.active)}`);
      for (const q of Object.values(Net.players)) {
        const pay = `<button class="btn xs" data-pay="${E(q.id)}" data-who="${E(q.name)}" title="Send them money">Pay</button>`;
        if (q.mode === 'own') rows.push(`${E(q.name)} · own company <button class="btn xs" data-inv="${E(q.id)}" title="Ask them to work for your company">Invite</button> ${pay}`);
        else rows.push(`${E(q.name)}${q.passenger ? ' (riding)' : ''}${sh(q.unit)} · your crew ${pay}`);
      }
    } else if (Net.role === 'peer') {
      rows.push(`You · ${E(HC.company.name)}`);
      for (const tag in Net.remote) rows.push(`${E(Net.remote[tag].name)}${tag === 'h' ? ' (host)' : ''} · ${E(Net.remote[tag].co || '')} <button class="btn xs" data-pay="${E(tag)}" data-who="${E(Net.remote[tag].name)}" title="Send them money">Pay</button>`);
      rows.push('<button class="btn xs" data-do="join">Work for the host</button>');
    } else {
      for (const [n, u] of Net.players || []) rows.push(`${E(n)}${sh(u)}`);
      rows.push('<button class="btn xs" data-do="leave">Back to my company</button>');
    }
    const html = `<span class="lbl">Co-op · code${Net.role === 'guest' && Net.hostPaused ? ' · host paused' : ''}</span><span class="num">${Net.code}</span><span class="who">${rows.join('<br>')}</span>`;
    if (el.dataset.html !== html) { el.dataset.html = html; el.innerHTML = html; }
  };
  // a partner sees the invoice too
  const origResults = HC.UI.results;
  HC.UI.results = function (r) {
    if (Net.role === 'host') { let data = null; try { data = JSON.parse(JSON.stringify(r)); } catch (e) { /* skip */ } if (data) for (const q of Object.values(Net.players)) if (q.mode !== 'own') q.conn.send({ type: 'results', r: data }); }
    return origResults.apply(this, arguments);
  };

  Object.assign(Net, { host, join, hostTick, guestFrame, guestKey, snapshotState, peerTick, frameRemote });
})();

// friends in their own company don't get their own calls: the host's board is shared, and taking a job tells the host
(() => {
  const G = HC.Game, baseAccept = G.accept;
  G.accept = function (job) {
    const r = baseAccept.apply(this, arguments);
    if (HC.Net && HC.Net.role === 'peer' && HC.Net.sendTook && HC.session && HC.session.job && HC.session.job.id === job.id) HC.Net.sendTook(job.id);
    return r;
  };
})();

// every job booked in town right now: yours and each friend's (for the "Booked in town" list on everyone's phone)
HC.Net.booked = function () {
  const out = [], C = HC.company;
  for (const j of [C.active, C.queued]) if (j) out.push(Object.assign({ who: 'You' }, j));
  for (const tag in HC.Net.remote || {}) { const R = HC.Net.remote[tag]; for (const j of R.jobs || []) out.push(Object.assign({ who: R.name || R.co }, j)); }
  return out;
};
