// Hollow Creek — world session: jobs, travel, felling, penalties, objectives, scoring
'use strict';
(() => {
  const TS = HC.TILE;
  const DAY_START = 8 * 60, DAY_END = 18 * 60;

  // ---------- jobs (customers hiring you) ----------
  function freeParcel(exclude, tract = false) {
    const W = HC.world, C = HC.company;
    const busy = new Set(exclude || []);
    if (C.active) busy.add(C.active.parcel);
    for (const j of C.board || []) busy.add(j.parcel);
    const kind = W.parcels.filter((p) => !p.isYard && !!p.tract === !!tract);
    const free = kind.filter((p) => !busy.has(p.id) && !(HC.Net && HC.Net.busyParcel && HC.Net.busyParcel(p.id)));
    return HC.pick(free.length ? free : kind.length ? kind : W.parcels.filter((p) => !p.isYard));
  }

  function makeJob(type, tier) {
    const tr = HC.TIERS[tier];
    const p = freeParcel(null, !!(HC.JOBS[type] && HC.JOBS[type].tract));
    const job = {
      id: HC.uid() + Math.floor(Math.random() * 900), type, tier, parcel: p.id, client: p.owner, address: p.tract ? `Woodlot on ${p.road}` : p.address,
      seed: p.seed, w: p.pw, h: p.ph, marks: true, calledAt: HC.company.minute, tract: !!p.tract,
    };
    Object.assign(job, (ESTIMATE[type] || ESTIMATE.tree_removal)(tier, tr));
    job.pay = Math.round((job.pay * tr.payMul * 1.15) / 10) * 10; // customers pay 15% more
    job.par = Math.round(job.par * 1.5); // and allow half again as long
    job.needs = HC.JOBS[type].needs;
    return job;
  }

  const ESTIMATE = {
    tree_removal(tier) {
      const count = HC.randi(3, 5) + tier * 2;
      return { count, pay: count * HC.rand(190, 240), par: count * 45 + 40, summary: `${count} flagged trees` };
    },
  };

  function makeBoard() { return [HC.Game.makeJob('tree_removal', 0)]; }

  function rollWeather() {
    const list = HC.WEATHER;
    const r = Math.random();
    let acc = 0;
    for (const w of list) { acc += w.p; if (r < acc) return Object.assign({}, w); }
    return Object.assign({}, list[0]);
  }

  // ---------- session ----------
  const newCosts = () => ({ fuel: 0, damage: 0, dump: 0, wages: 0, repairs: 0 });

  function makeTrailer(id, x, y, a) { const kind = HC.trailerKindOf(id); return { id, kind, x, y, a, len: HC.TRAILERS[kind].len, hitch: null, load: 0, cargo: [] }; }

  // ---------- owning more than one of something ----------
  function registerClone(key, base) {
    if (!HC.EQUIP[key]) {
      const b = HC.EQUIP[base], n = key.split('_').pop();
      HC.EQUIP[key] = { ...b, base, name: `${b.name} #${n}`, short: `${b.short} ${n}`, start: false, key: undefined };
    }
    if (HC.EQUIP[base].move === 'tow' && !HC.TRAILERS[key]) HC.TRAILERS[key] = HC.TRAILERS[base];
    HC.Units.KINDS[key] = HC.Units.KINDS[key] || HC.Units.kindFor(key, base);
  }
  // buy another of a machine: a new numbered key with its own fuel, condition and parking spot
  function buyAnother(base) {
    const C = HC.company;
    C.clones = C.clones || [];
    let n = 2;
    while (C.clones.some((c) => c.key === `${base}_${n}`)) n++;
    const key = `${base}_${n}`;
    C.clones.push({ key, base });
    registerClone(key, base);
    C.owned[key] = true; C.cond[key] = 100; C.fuel[key] = HC.EQUIP[base].fuelCap || 0;
    addUnit(key);
    return key;
  }
  // chainsaws: buying one trades in the saw you have for 40% of what it cost
  function buySaw(id) {
    const S = HC.session, C = HC.company, spec = HC.CHAINSAWS[id];
    if (!spec || C.sawKind === id) return false;
    const trade = C.owned.saw && C.sawKind ? Math.round(HC.CHAINSAWS[C.sawKind].price * 0.4 / 10) * 10 : 0;
    if (C.money < spec.price - trade) return false;
    C.money -= spec.price - trade;
    C.sawKind = id; C.owned.saw = true; C.cond.saw = 100;
    if (!S.saw && S.units.op) S.saw = { x: S.units.op.x + 12, y: S.units.op.y, a: 0, holder: 'op', fuel: HC.Units.SAW_CAP };
    HC.Audio.cash(); HC.Save.save();
    toast(`Bought the ${spec.name.toLowerCase()} (${spec.spec})${trade ? `, ${HC.money(trade)} off for your old saw` : ''}. It's with you: climb out (F) and press G to hold it.`, 'good');
    return true;
  }
  const sawTrade = () => (HC.company.owned.saw && HC.company.sawKind ? Math.round(HC.CHAINSAWS[HC.company.sawKind].price * 0.4 / 10) * 10 : 0);
  function buyTrailer(kind) {
    const C = HC.company;
    let id = kind;
    if (C.trailers[id]) { let n = 2; while (C.trailers[`${kind}_${n}`]) n++; id = `${kind}_${n}`; }
    C.trailers[id] = true;
    addTrailer(id);
    return id;
  }

  // ---------- selling equipment back: about half the list price, less for worn machines ----------
  const listPrice = (k) => HC.EQUIP[k].price || HC.EQUIP[HC.baseOf(k)].price || 0;
  function resaleValue(k) { const c = HC.company.cond[k] ?? 100; return Math.round((listPrice(k) * 0.55 * (0.45 + 0.55 * c / 100)) / 10) * 10; }
  function trailerResale(id) { const t = HC.TRAILERS[HC.trailerKindOf(id)]; return Math.round(((t && t.price) || 2000) * 0.55 / 10) * 10; }
  function sellUnit(k) {
    const S = HC.session, C = HC.company, u = S.units[k];
    if (!u || !C.owned[k]) return false;
    if (S.active === k) { toast('Switch to another machine before you sell this one.', 'warn'); return false; }
    if (Object.values(S.units).some((o) => o.boarded === k)) { toast('Let the crew out of it first.', 'warn'); return false; }
    if (u.on) { toast('Take it off the trailer first.', 'warn'); return false; }
    const value = resaleValue(k);
    for (const a of S.attachments || []) if (a.on === k) a.on = null;
    S.attachments = (S.attachments || []).filter((a) => !(a.kind === 'grapple' && (a.id === 'grapple-' + k || (k === 'skid' && a.id === 'grapple'))));
    S.trailers = S.trailers.filter((t) => !(HC.Units.isBed(t) && t.hitch === k));
    for (const t of S.trailers) if (t.hitch === k) t.hitch = null;
    if (S.hose && (S.hose.from === k || S.hose.to === k)) S.hose = null;
    if (S.saw && S.saw.holder === k) S.saw.holder = null;
    delete S.units[k];
    C.owned[k] = false; C.clones = (C.clones || []).filter((c) => c.key !== k);
    C.money += value; HC.Audio.cash(); HC.Save.save();
    toast(`Sold the ${HC.EQUIP[k].name} for ${HC.money(value)}.`, 'good');
    return true;
  }
  function sellTrailer(id) {
    const S = HC.session, C = HC.company, t = S.trailers.find((q) => q.id === id);
    if (!t) return false;
    if (Object.values(S.units).some((o) => o.on && o.on.id === id)) { toast('Unload the machines first.', 'warn'); return false; }
    if (t.load) { toast('Empty it at the pad first.', 'warn'); return false; }
    const value = trailerResale(id);
    for (const a of S.attachments || []) if (a.on === 'trailer:' + id) a.on = null;
    S.trailers = S.trailers.filter((q) => q !== t); delete C.trailers[id];
    C.money += value; HC.Audio.cash(); HC.Save.save();
    toast(`Sold the ${HC.TRAILERS[HC.trailerKindOf(id)].name.toLowerCase()} for ${HC.money(value)}.`, 'good');
    return true;
  }
  function sellAttachment(kind) {
    const S = HC.session, C = HC.company, a = (S.attachments || []).find((q) => q.id === kind);
    if (!a || !C.owned[kind]) return false;
    if (a.on && !a.on.startsWith('trailer:')) { toast('Unhook it first (Q).', 'warn'); return false; }
    const value = resaleValue(kind);
    S.attachments = S.attachments.filter((q) => q !== a); C.owned[kind] = false;
    C.money += value; HC.Audio.cash(); HC.Save.save();
    toast(`Sold the ${HC.EQUIP[kind].name.toLowerCase()} for ${HC.money(value)}.`, 'good');
    return true;
  }

  // Free parking bay in a yard you own
  function freeBay(type) {
    const S = HC.session;
    const taken = (b) => Object.values(S.units).some((u) => !u.hidden && HC.dist(u.x, u.y, b.x, b.y) < 30) || S.trailers.some((t) => HC.dist(t.x, t.y, b.x, b.y) < 40);
    const home = HC.world.yard.id;
    return HC.world.bays.find((b) => b.kind === type && b.yard === home && !taken(b)) || HC.world.bays.find((b) => b.kind === type && HC.World.yardAt(b.x, b.y, true) && !taken(b)) || HC.world.bays.find((b) => b.kind === type && b.yard === home) || HC.world.bays.find((b) => b.kind === type);
  }

  function boot() {
    const C = HC.company;
    const world = HC.World.build();
    const yard = world.yard;
    for (const yd of world.yards) yd.owned = !!(C.yards || {})[yd.id];
    const home = HC.Net && HC.Net.homeYard && world.yards.find((y) => y.id === HC.Net.homeYard);
    if (home) { // playing your own company in a friend's world: you live at a co-op yard, not their home yard
      world.yards.find((y) => y.id === 'hq').owned = false;
      home.owned = true; world.yard = home;
    }
    if (world.quarry) world.quarry.owned = !!(C.yards || {}).quarry;
    const S = (HC.session = {
      lot: world, job: null, stage: 'idle', units: {}, trailers: [], active: 'truck',
      time: C.minute || DAY_START, workMins: 0, weather: C.weather || rollWeather(),
      penalties: [], penQ: 0, costs: newCosts(), logSales: 0, particles: [], floats: [], shake: 0,
      focus: null, paused: false, hinted: {}, rain: [], nextCall: (C.minute || DAY_START) + 50,
    });
    C.weather = S.weather;
    // trailers and machines start parked in the home yard's bays
    C.trailers = C.trailers || { equip: true, dump: true };
    for (const c of C.clones || []) registerClone(c.key, c.base);
    for (const id of Object.keys(C.trailers)) if (C.trailers[id] && HC.TRAILERS[HC.trailerKindOf(id)]) addTrailer(id, true);
    for (const k in HC.EQUIP) if (C.owned[k] && !HC.EQUIP[k].noUnit) addUnit(k, true);
    // the chainsaw (if you've bought one) rides with you
    S.saw = C.owned.saw && S.units.op ? { x: S.units.op.x + 12, y: S.units.op.y, a: 0, holder: 'op', fuel: C.sawFuel ?? HC.Units.SAW_CAP } : null;
    // skid steer attachments are separate objects: the grapple starts on the machine, the mulcher head in the yard
    S.attachments = [];
    for (const k in S.units) if (HC.baseOf(k) === 'skid') S.attachments.push({ id: k === 'skid' ? 'grapple' : 'grapple-' + k, kind: 'grapple', on: k, x: S.units[k].x, y: S.units[k].y, a: S.units[k].a });
    if (C.owned.mulcher) addAttachment('mulcher', true);
    if (C.owned.bushhog) addAttachment('bushhog', true);
    if (C.owned.brushcut) addAttachment('brushcut', true);
    restore(C.pos);
    if (S.saw && C.pos && C.pos.saw) { Object.assign(S.saw, C.pos.saw); if (S.saw.holder && !S.units[S.saw.holder]) S.saw.holder = 'op'; }
    if (C.pos && C.pos.attachments) for (const a of C.pos.attachments) { const m = S.attachments.find((q) => q.id === a.id); if (m) Object.assign(m, a); }
    // you start in the crew truck (or the machine you saved in)
    // you start in the crew truck (or the machine you saved in); with nothing bought yet, you're on foot at the office
    const startIn = C.pos && S.units[C.pos.active] && !S.units[C.pos.active].hidden ? C.pos.active : S.units.truck ? 'truck' : (Object.keys(S.units).find((k) => HC.Units.isTruck(k)) || 'op');
    if (S.units.op) S.units.op.hidden = startIn !== 'op' && !(C.pos && C.pos.driver === null && C.pos.active === 'op');
    take(startIn);
    HC.Render.prepare(world);
    HC.Render.setOutlines(C.prefs && C.prefs.outlines);
    if (!C.board || !C.board.length) C.board = HC.Game.makeBoard();
    if (C.active) accept(C.active, true);
    if (C.mapMoved) {
      const msg = C.mapMoved === 'job' ? 'The county map grew (new timber country to the east and south). Your equipment is parked back at the yard, and the job you had open was called off. Press J for new calls.'
        : 'The county map grew: new timber country to the east and south. Your equipment is parked back at the yard.';
      setTimeout(() => toast(msg, 'good'), 1200);
      delete C.mapMoved;
    }
  }

  function addTrailer(id, initial) {
    const S = HC.session;
    if (S.trailers.some((t) => t.id === id)) return;
    const bay = freeBay('trailer');
    const t = makeTrailer(id, bay.x, bay.y, bay.a);
    S.trailers.push(t);
    if (!initial) toast(`${HC.TRAILERS[t.kind].name}${id !== t.kind ? ' #' + id.split('_').pop() : ''} delivered to your yard.`, 'good');
  }

  // Put a new or owned unit in the yard: trucks in a row by the office, machines in the shed, crews by the office
  function addUnit(k, initial) {
    const S = HC.session, Y = HC.world.yard;
    if (S.units[k]) return;
    const spec = HC.EQUIP[k];
    let x = Y.spawn.x, y = Y.spawn.y, a = -Math.PI / 2;
    if (spec.move === 'car') {
      const spots = Y.carSpots || [[12, 15.5], [15, 15.5], [18, 15.5], [11, 18.3], [20, 18.3], [8, 9.5], [12, 9.5]];
      const spot = spots.find(([sx, sy]) => !Object.values(S.units).some((o) => HC.dist(o.x, o.y, Y.x + sx * TS, Y.y + sy * TS) < 40)) || spots[0];
      x = Y.x + spot[0] * TS; y = Y.y + spot[1] * TS; a = -Math.PI / 2;
    } else if (spec.move === 'walk') { x = Y.office.x + (k === 'op' ? 0 : 18); y = Y.office.y + (k === 'op' ? 20 : 0); a = Math.PI / 2; }
    else {
      const bay = freeBay(spec.move === 'tow' ? 'trailer' : 'machine');
      x = bay.x; y = bay.y; a = bay.a;
    }
    const u = HC.Units.create(k, x, y, a);
    S.units[k] = u;
    if (spec.move === 'tow') Object.assign(u, { id: k, len: HC.TRAILERS[k].len, hitch: null }), S.trailers.push(u);
    if (spec.bed) S.trailers.push({ id: k + '_bed', kind: HC.baseOf(k) === 'forwarder' ? 'fwdbed' : spec.logsOnly ? 'logbed' : 'bed', x, y, a, len: 0, hitch: k, load: 0, cargo: [] });
    if (HC.baseOf(k) === 'skid' && S.attachments) { // every skid-type machine arrives with its grapple on
      const gid = k === 'skid' ? 'grapple' : 'grapple-' + k;
      if (!S.attachments.some((q) => q.id === gid)) S.attachments.push({ id: gid, kind: 'grapple', on: k, x, y, a });
    }
    if (!initial) toast(`${spec.name} delivered to your yard.`, 'good');
  }

  // ---------- skid steer attachments ----------
  function addAttachment(kind, initial) {
    const S = HC.session, Y = HC.world.yard;
    if (S.attachments.some((a) => a.id === kind)) return;
    const shed = HC.world.sheds.find((sh) => sh.yard === 'hq');
    const x = shed ? shed.x + shed.w - 40 : Y.spawn.x + 60, y = shed ? shed.y + shed.h + 34 : Y.spawn.y;
    const bh = kind === 'bushhog';
    S.attachments.push({ id: kind, kind, on: null, x: bh ? x - 70 : x, y: bh ? y + 30 : y, a: bh ? Math.PI / 2 : -Math.PI / 2 });
    if (!initial) toast(bh ? 'Bush hog delivered to your equipment yard. Back the tractor up square to it and press Q.' : `${kind === 'brushcut' ? 'Brush cutter' : 'Forestry mulcher head'} delivered to your equipment yard. Take the skid steer over, drop the grapple (Q) and pick up the new head (Q).`, 'good');
  }
  const ATT_NAME = { mulcher: 'Mulcher head', grapple: 'Grapple', bushhog: 'Bush hog', brushcut: 'Brush cutter' };
  const attFits = (a, u) => (a.kind === 'bushhog' ? 'tractor' : 'skid') === HC.baseOf(u.kind);
  // skid steer attachments lock on the front plate; the tractor's three-point hitch is behind it
  const attachPoint = (u) => HC.baseOf(u.kind) === 'tractor' ? { x: u.x - Math.cos(u.a) * 24, y: u.y - Math.sin(u.a) * 24 } : { x: u.x + Math.cos(u.a) * 28, y: u.y + Math.sin(u.a) * 28 };
  function attachmentNear(u, S) {
    const p = attachPoint(u);
    return (S.attachments || []).filter((a) => (!a.on || a.on.startsWith('trailer:')) && attFits(a, u)).find((a) => HC.dist(a.x, a.y, p.x, p.y) < 24 && Math.abs(HC.angDiff(u.a, a.a)) < 0.9);
  }
  // Q in the skid steer: drop what's on the quick-attach, or lock on the attachment in front of you
  function attachToggle(u, S) {
    if (Math.abs(u.v) > 4) return toast('Stop first.');
    if (u.carrying && u.carrying.length) return toast('Drop what the grapple is holding first.');
    const cur = (S.attachments || []).find((a) => a.on === u.kind);
    if (cur) {
      if (u.armT > 0.3) return toast(HC.baseOf(u.kind) === 'tractor' ? 'Lower the hitch (hold G) to set the bush hog down.' : 'Lower the arms (hold G) to set the attachment down.');
      const p = attachPoint(u);
      Object.assign(cur, { on: null, x: p.x, y: p.y, a: u.a });
      const deck = S.trailers.find((t) => HC.Units.onDeck(t, p));
      if (deck) { const dx = p.x - deck.x, dy = p.y - deck.y, c = Math.cos(deck.a), s2 = Math.sin(deck.a); Object.assign(cur, { on: 'trailer:' + deck.id, along: dx * c + dy * s2, side: -dx * s2 + dy * c, ra: u.a - deck.a }); }
      HC.Audio.drop();
      return toast(`${ATT_NAME[cur.kind]} unhooked${deck ? ' on the trailer deck' : ''}.`);
    }
    const a = attachmentNear(u, S);
    if (!a) return toast(HC.baseOf(u.kind) === 'tractor' ? 'Nothing to hook up. Back up square to the bush hog and press Q.' : 'Nothing to hook up. Line the quick-attach up square with an attachment and press Q.');
    if (u.armT > 0.3) return toast(HC.baseOf(u.kind) === 'tractor' ? 'Lower the hitch (hold G) to line up the lift arms.' : 'Lower the arms (hold G) to scoop the attachment up.');
    a.on = u.kind;
    HC.Audio.pick();
    toast(`${ATT_NAME[a.kind]} ${a.kind === 'bushhog' ? 'hooked to the three-point hitch' : 'locked on'}.`, 'good');
  }
  function followAttachments(S) {
    for (const a of S.attachments || []) {
      if (!a.on) continue;
      if (a.on.startsWith('trailer:')) {
        const t = S.trailers.find((q) => q.id === a.on.slice(8));
        if (!t) { a.on = null; continue; }
        const c = Math.cos(t.a), s2 = Math.sin(t.a);
        a.x = t.x + c * a.along - s2 * a.side; a.y = t.y + s2 * a.along + c * a.side; a.a = t.a + (a.ra || 0);
      } else { const u = S.units[a.on]; if (u) { const p = attachPoint(u); a.x = p.x; a.y = p.y; a.a = u.a; } }
    }
  }

  // Where everything is parked, for the save file
  function snapshot() {
    const S = HC.session;
    if (!S || S.preview) return null;
    const units = {}, trailers = {};
    for (const k in S.units) {
      const u = S.units[k];
      units[k] = { x: u.x, y: u.y, a: u.a, on: u.on, boarded: u.boarded, mode: u.mode, fuel: u.fuel, hitch: u.hitch || null, hidden: !!u.hidden, armT: u.armT || 0, art: u.art || 0, hopper: u.hopper && u.hopper.length ? u.hopper : undefined };
    }
    for (const t of S.trailers) if (HC.EQUIP[t.kind] === undefined || !HC.EQUIP[t.kind].move) trailers[t.id] = { x: t.x, y: t.y, a: t.a, hitch: t.hitch, load: t.load, cargo: t.cargo };
    if (S.saw) HC.company.sawFuel = S.saw.fuel;
    // loose things left out in the world (dumped loads, mulch piles, dropped logs) that aren't part of a job lot
    const items = S.lot.items.filter((i) => !i.parcel && !i.z);
    return { units, trailers, items, active: S.active, driver: S.driver || null, saw: S.saw ? { ...S.saw } : null, attachments: (S.attachments || []).map((a) => ({ ...a })) };
  }
  function restore(pos) {
    const S = HC.session;
    if (!pos) return;
    for (const id in pos.trailers || {}) { const t = S.trailers.find((q) => q.id === id); if (t) Object.assign(t, pos.trailers[id]); }
    for (const k in pos.units || {}) {
      const u = S.units[k], p = pos.units[k];
      if (!u) continue;
      Object.assign(u, { x: p.x, y: p.y, a: p.a, on: p.on, boarded: p.boarded, mode: p.mode || 0, fuel: p.fuel ?? u.fuel, hidden: !!p.boarded || (k === 'op' && p.hidden !== false) });
      Object.assign(u, { armT: p.armT || 0, art: p.art || 0 }); if (p.hopper) u.hopper = p.hopper;
      if (HC.EQUIP[u.kind].move === 'tow') u.hitch = p.hitch || null;
    }
    // loose items come back with fresh ids so they can't clash with the ones the world just handed out
    for (const it of pos.items || []) { it.id = HC.uid(); for (const c of it.content || []) c.id = HC.uid(); S.lot.items.push(it); }
    for (const t of S.trailers) for (const c of t.cargo || []) c.id = HC.uid();
    if (pos.active && S.units[pos.active] && !S.units[pos.active].hidden) S.active = pos.active;
  }

  function accept(job, restoring) {
    const S = HC.session, C = HC.company, W = HC.world;
    const p = W.parcels.find((q) => q.id === job.parcel);
    if (!restoring && HC.Net && HC.Net.busyParcel && HC.Net.busyParcel(job.parcel)) { // a friend's company took that property first
      C.board = (C.board || []).filter((j) => j.id !== job.id);
      return toast(`${job.client} already hired another company in town. The call is off the board.`, 'warn');
    }
    C.active = job;
    C.board = (C.board || []).filter((j) => j.id !== job.id);
    job.h = HC.World.PH + 2;
    const lot = HC.Lot.generate(job);
    HC.World.stamp(W, p, lot, true);
    HC.Render.restamp(p);
    Object.assign(S, { job, stage: 'travel', workMins: 0, penalties: [], penQ: 0, costs: newCosts(), logSales: 0, init: null, ground: 0, chipped: 0 });
    objectives(S); // record the starting counts (stumps, brush, tall grass) right away
    if (!restoring) {
      HC.Audio.horn();
      const needs = HC.JOBS[job.type].needs.map((k) => (HC.KIND_ALIAS && HC.KIND_ALIAS[k] ? 'a dozer or track loader' : HC.EQUIP[k].short)).join(', ');
      toast(`Job accepted: ${job.address}. Load up (${needs}) and head out. The clock starts when you arrive.`, 'good');
      HC.Save.save();
    }
  }

  function arriveCheck(S) {
    if (S.stage !== 'travel' || !S.job) return;
    const p = HC.world.parcels.find((q) => q.id === S.job.parcel);
    const r = { x: p.x - TS * 2, y: p.y - TS * 4, w: p.w + TS * 4, h: p.h + TS * 8 };
    if (Object.values(S.units).some((u) => !u.hidden && HC.inRect(u.x, u.y, r))) {
      S.stage = 'onsite';
      HC.Audio.horn();
      toast(`On site for ${S.job.client}. The clock is running.`, 'good');
    }
  }

  function select(kind) {
    const S = HC.session;
    if (!S) return;
    const u = S.units[kind];
    const held = HC.Net && HC.Net.role === 'host' && HC.Net.heldBy(kind);
    if (held) { HC.Audio.deny(); return toast(`${held.name} is in the ${HC.EQUIP[kind].short.toLowerCase()}.`); }
    if (!u) {
      if (HC.EQUIP[kind]) { HC.Audio.deny(); toast(`You don't own the ${HC.EQUIP[kind].name} yet. Buy it from the shop (J).`); }
      return;
    }
    if (u.boarded) {
      const t = S.units[u.boarded];
      if (Math.abs(t.v) > 15) { HC.Audio.deny(); return toast('Stop the truck to let the crew out.'); }
      HC.Units.exitTruck(u, S);
      toast(`${HC.EQUIP[kind].name} hopped out.`);
    }
    if (S.active === kind) return;
    take(kind);
    HC.Audio.select();
  }

  // Switching to a machine puts you in its seat; the machine you left shuts off and sits empty.
  function take(kind) {
    const S = HC.session, prev = S.units[S.active];
    if (prev && HC.DRIVEN(prev.kind) && prev.kind !== kind) { prev.occupied = false; prev.v = 0; prev.moving = false; prev.working = false; }
    const u = S.units[kind];
    if (HC.DRIVEN(kind)) {
      u.occupied = true;
      if (S.units.op) S.units.op.hidden = true;
      S.driver = kind;
    } else {
      S.driver = null;
    }
    S.active = kind;
  }

  // F: climb out of the machine you're in, or climb into the machine you're standing beside
  function climb() {
    const S = HC.session, u = S.units[S.active], op = S.units.op;
    if (!op) return;
    if (u && HC.DRIVEN(u.kind)) {
      if (Math.abs(u.v) > 40) { HC.Audio.deny(); return toast('Slow down to climb out.'); }
      const side = u.a + Math.PI / 2, off = u.r + 14;
      op.x = u.x + Math.cos(side) * off; op.y = u.y + Math.sin(side) * off;
      if (HC.Lot.tile(S.lot, op.x, op.y) === HC.T.WATER) { op.x = u.x - Math.cos(side) * off; op.y = u.y - Math.sin(side) * off; }
      op.hidden = false; op.a = u.a;
      u.occupied = false; u.v = 0; u.moving = false; u.working = false;
      take('op');
      HC.Audio.drop();
      return toast(`You climbed out of the ${HC.EQUIP[u.kind].short.toLowerCase()}. Walk to any machine and press F to get in.`);
    }
    if (S.active === 'op') {
      const m = nearestMachine(op, S);
      if (!m) { HC.Audio.deny(); return toast('No machine close enough. Walk up to one and press F.'); }
      take(m.kind);
      HC.Audio.pick();
      return toast(`You climbed into the ${HC.EQUIP[m.kind].short.toLowerCase()}.`);
    }
    HC.Audio.deny();
    toast('The crews walk. Press a machine\'s number key to drive it.');
  }
  function nearestMachine(p, S) {
    let best = null, bd = 1e9;
    for (const k in S.units) {
      const m = S.units[k];
      if (!HC.DRIVEN(k) || m.hidden) continue; // the host can climb in with a co-op friend and ride along
      const d = HC.dist(p.x, p.y, m.x, m.y) - m.r;
      if (d < 40 && d < bd) { bd = d; best = m; }
    }
    return best;
  }

  // ---------- events ----------
  function toast(text, kind = '') { if (HC.UI) HC.UI.toast(text, kind); }
  function hintOnce(text) {
    const S = HC.session;
    if (S.hinted[text] && performance.now() - S.hinted[text] < 4000) return;
    S.hinted[text] = performance.now();
    toast(text, 'warn');
  }
  function float(x, y, text, color = '#fff') { HC.session.floats.push({ x, y, text, color, t: 0 }); }
  function dust(x, y, color, n = 1, spd = 40) {
    const P = HC.session.particles;
    if (P.length > 400) return;
    for (let i = 0; i < n; i++)
      P.push({ x, y, z: HC.rand(2, 10), vx: HC.rand(-spd, spd), vy: HC.rand(-spd, spd), vz: HC.rand(20, 80), life: HC.rand(0.4, 0.9), t: 0, color, size: HC.rand(1.5, 3) });
  }
  // a directed stream (wood chips out of a chute): launched to land at (tx, ty) in about T seconds
  function spray(x, y, z, tx, ty, tz, color, n = 2, T = 0.55) {
    const P = HC.session.particles;
    if (P.length > 380) return;
    for (let i = 0; i < n; i++) {
      const t = T * HC.rand(0.85, 1.15), ex = tx + HC.rand(-6, 6), ey = ty + HC.rand(-6, 6);
      P.push({ x, y, z, vx: (ex - x) / t, vy: (ey - y) / t, vz: (tz - z + 0.5 * 220 * t * t) / t, life: t, t: 0, color: Array.isArray(color) ? HC.pick(color) : color, size: 2, ballistic: true });
    }
  }
  function setTile(tx, ty, t) {
    const W = HC.world;
    if (tx < 0 || ty < 0 || tx >= W.w || ty >= W.h || W.tiles[ty * W.w + tx] === t) return;
    W.tiles[ty * W.w + tx] = t;
    HC.Render.setTile(tx, ty);
  }

  function penalty(id, x, y, extra = 1) {
    const S = HC.session, p = HC.PENALTY[id];
    const cost = Math.round(p.cost * extra);
    S.penalties.push({ label: p.label, cost, q: p.q });
    S.penQ += p.q;
    S.costs.damage += cost;
    S.shake = Math.max(S.shake, 10);
    float(x, y, `${p.label}  -${HC.money(cost)}`, '#ff6b5a');
    toast(`${p.label}: ${HC.money(cost)} in damages.`, 'bad');
    if (id === 'wire') HC.Audio.zap(); else HC.Audio.crash();
  }

  // ---------- felling ----------
  // a bucket truck parked beside the tree lets the climber rig it down
  function bucketTree(t) {
    return Object.values(HC.session.units).some((b) => HC.baseOf(b.kind) === 'bucket' && !b.hidden && Math.abs(b.v) < 5 && HC.dist(b.x, b.y, t.x, t.y) < 130);
  }
  function spreadDeg(t) {
    return (HC.TREES[t.type].spread + (HC.session.weather.wind || 0)) * HC.Co.crew('climber', 0.5, 1) * (bucketTree(t) ? 0.25 : 1);
  }
  function fell(t, aim, early = false, fixedSpread) {
    const sp = ((fixedSpread ?? spreadDeg(t)) * Math.PI) / 180;
    t.fallA = aim + HC.rand(-sp, sp);
    t.state = 'falling'; t.fallT = 0; t.early = early;
    HC.Audio.crack();
  }
  function fallGeom(t, a) {
    const dx = Math.cos(a), dy = Math.sin(a);
    return {
      bx: t.x + dx * 18, by: t.y + dy * 18, tx: t.x + dx * t.len, ty: t.y + dy * t.len,
      cx: t.x + dx * (t.len - t.crownR * 0.7), cy: t.y + dy * (t.len - t.crownR * 0.7), cr: t.crownR * 0.75,
    };
  }
  function predictHits(t, a, S) {
    const g = fallGeom(t, a), lot = S.lot, hits = [], R = t.len + 80;
    const close = (o) => Math.abs((o.x + (o.w || 0) / 2) - t.x) < R + (o.w || 0) && Math.abs((o.y + (o.h || 0) / 2) - t.y) < R + (o.h || 0);
    for (const h of lot.houses) if (close(h) && (HC.segRectHit(g.bx, g.by, g.tx, g.ty, 5, h) || HC.circleRectHit(g.cx, g.cy, g.cr, h))) hits.push({ id: 'house', obj: h });
    for (const f of lot.fences) if (!f.broken && close(f) && (HC.segRectHit(g.bx, g.by, g.tx, g.ty, 4, f) || HC.circleRectHit(g.cx, g.cy, g.cr, f))) hits.push({ id: 'fence', obj: f });
    for (const w of lot.wires) {
      if (w.down || Math.abs((w.x1 + w.x2) / 2 - t.x) > R + 120 || Math.abs(w.y1 - t.y) > R) continue;
      const d = Math.min(HC.segSegDist(g.bx, g.by, g.tx, g.ty, w.x1, w.y1, w.x2, w.y2), HC.segPointDist(w.x1, w.y1, w.x2, w.y2, g.cx, g.cy) - g.cr);
      if (d < 6) hits.push({ id: 'wire', obj: w });
    }
    for (const o of lot.trees) {
      if (o === t || o.state !== 'standing' || !close(o)) continue;
      const d = Math.min(HC.segPointDist(g.bx, g.by, g.tx, g.ty, o.x, o.y), HC.dist(g.cx, g.cy, o.x, o.y) - g.cr);
      if (d < o.crownR * 0.45) hits.push({ id: 'tree', obj: o });
    }
    for (const k in S.units) {
      const u = S.units[k];
      if (u.hidden || HC.EQUIP[k].move !== 'walk') continue;
      if (HC.segPointDist(g.bx, g.by, g.tx, g.ty, u.x, u.y) < 12 || HC.dist(g.cx, g.cy, u.x, u.y) < g.cr) hits.push({ id: 'injury', obj: u });
    }
    return hits;
  }
  function land(t, S) {
    t.state = 'felled';
    t.landT = 0;
    if (t.harvested) t.autoBuck = 0.5; // the harvester head strips and cuts it to length right away
    const g = fallGeom(t, t.fallA), big = HC.clamp(t.len / 180, 0.4, 1.3);
    HC.Audio.thud(big);
    S.shake = Math.max(S.shake, 6 * big);
    for (let i = 0; i < 26; i++) dust(g.cx + HC.rand(-g.cr, g.cr), g.cy + HC.rand(-g.cr, g.cr), HC.pick(['#4f8a35', '#6fae45', '#3b6d2a', '#c9a66b']), 1, 70);
    HC.company.stats.trees++;
    const hits = predictHits(t, t.fallA, S), seen = new Set();
    let fences = 0;
    for (const h of hits) {
      if (h.id === 'fence') { h.obj.broken = true; fences++; continue; }
      if (seen.has(h.id) && h.id !== 'tree') continue;
      seen.add(h.id);
      if (h.id === 'house') h.obj.damaged.push({ x: g.cx - h.obj.x, y: g.cy - h.obj.y, r: g.cr });
      if (h.id === 'wire') h.obj.down = true;
      if (h.id === 'tree') { if (h.obj.damaged) continue; h.obj.damaged = true; if (h.obj.marked) continue; }
      penalty(h.id, (h.obj.x + (h.obj.w || 0) / 2) || g.cx, (h.obj.y + (h.obj.h || 0) / 2) || g.cy);
    }
    if (fences) { penalty('fence', g.cx, g.cy, fences); HC.Render.fencesChanged(); }
    if (seen.has('wire')) HC.Render.wiresChanged();
    if (!t.marked) penalty('wrong', t.x, t.y);
    if (!hits.length && t.marked) float(g.cx, g.cy, 'Clean drop!', '#bff57a');
  }
  function buck(t, quiet) {
    const S = HC.session, d = HC.TREES[t.type];
    const n = d.logs ? Math.max(1, Math.round(d.logs * t.s)) : 0;
    const dx = Math.cos(t.fallA), dy = Math.sin(t.fallA);
    for (let i = 0; i < n; i++) {
      const f = 0.16 + (i / Math.max(1, n)) * 0.62;
      S.lot.items.push({ id: HC.uid(), kind: 'log', x: t.x + dx * t.len * f + HC.rand(-3, 3), y: t.y + dy * t.len * f + HC.rand(-3, 3),
        a: t.fallA + HC.rand(-0.2, 0.2), size: HC.clamp(t.s, 0.75, 1.2), value: Math.round(d.logValue * t.s), wood: t.type, w: t.trunkR * 2, parcel: t.parcel });
    }
    const nb = Math.max(1, Math.round(t.crownR / 22));
    for (let i = 0; i < nb; i++) {
      const r = HC.rand(0, t.crownR * 0.6), a = HC.rand(0, 6.28);
      S.lot.items.push({ id: HC.uid(), kind: 'brush', x: t.x + dx * (t.len - t.crownR * 0.6) + Math.cos(a) * r, y: t.y + dy * (t.len - t.crownR * 0.6) + Math.sin(a) * r,
        a: HC.rand(0, 6.28), size: HC.rand(0.9, 1.2), value: 0, seed: Math.random() * 99, parcel: t.parcel });
    }
    if (t.type !== 'sapling') S.lot.stumps.push({ id: HC.uid(), x: t.x, y: t.y, r: t.trunkR + 3, hp: 0, grind: d.grind * t.s, type: t.type, fromMarked: t.marked, parcel: t.parcel });
    t.state = 'gone';
    if (quiet) return;
    HC.Audio.drop();
    float(t.x + dx * t.len * 0.5, t.y + dy * t.len * 0.5, n ? `${n} logs` : 'brush', '#ffe29a');
  }
  function cutBush(b) {
    const S = HC.session;
    S.lot.bushes.splice(S.lot.bushes.indexOf(b), 1);
    S.lot.items.push({ id: HC.uid(), kind: 'brush', x: b.x, y: b.y, a: HC.rand(0, 6.28), size: b.r / 14, value: 0, seed: b.seed, parcel: b.parcel });
    HC.Audio.drop();
  }

  // ---------- dump trailer ----------
  function trailerCap(t) {
    if (t && t.kind === 'bed') return (t.hitch && HC.EQUIP[HC.baseOf(t.hitch)] && HC.EQUIP[HC.baseOf(t.hitch)].bed) || HC.EQUIP.dumptruck.bed;
    if (t && t.kind === 'logbed') return HC.EQUIP.logtruck.bed;
    if (t && t.kind === 'fwdbed') return HC.EQUIP.forwarder.bed;
    if (t && t.kind === 'logtrailer') return HC.TRAILERS.logtrailer.cap;
    if (t && HC.TRAILERS[t.kind] && HC.TRAILERS[t.kind].cap) return HC.TRAILERS[t.kind].cap + HC.Co.level('trailer') * 6;
    return HC.TRAILER_CAP + HC.Co.level('trailer') * 6;
  }
  function loadTrailer(u, tr) {
    const cap = trailerCap(tr);
    if (HC.Units.machineIn(tr, HC.session)) { toast(`There's a machine riding in the ${HC.TRAILERS[tr.kind].name.toLowerCase()}. Unload it first.`, 'warn'); return; }
    if ((tr.kind === 'logbed' || tr.kind === 'logtrailer' || tr.kind === 'fwdbed') && u.carrying.some((c) => c.kind !== 'log')) { toast('The log truck only takes logs. Brush, rock and stumps go in a dump trailer or the dump truck.', 'warn'); return; }
    let n = 0;
    while (u.carrying.length) {
      const it = u.carrying[0], l = HC.LOAD[it.kind] || 1;
      if (tr.load + l > cap) break;
      tr.load += l; tr.cargo.push(it); u.carrying.shift(); n++;
    }
    if (n) HC.Audio.drop();
    if (u.carrying.length) toast(`Dump trailer is full (${tr.load}/${cap}). Hitch it to a truck and run it to the log pad.`, 'warn');
    else if (tr.load >= cap - 1) toast(`Dump trailer is nearly full (${tr.load}/${cap}).`);
  }
  // Unload at the yard pad: sell logs, pay dump fees for brush/rock
  function haul(tr) {
    const S = HC.session;
    if (!tr || !tr.cargo.length) return;
    let logs = 0, fees = 0, nl = 0;
    const keep = tr.cargo.filter((c) => c.kind === 'firewood' || c.kind === 'mulch' || c.kind === 'chips'); // products stay aboard to sell
    for (const c of tr.cargo) {
      if (keep.includes(c)) continue;
      if (c.kind === 'log') { logs += c.value; nl++; } else fees += HC.DUMP_FEE * (HC.LOAD[c.kind] || 1);
    }
    tr.cargo = keep; tr.load = keep.reduce((a, c) => a + (HC.LOAD[c.kind] || 1), 0);
    if (!logs && !fees && keep.length) return toast('The pad doesn\'t buy those. Firewood, mulch and chips sell at the landscape supply (firewood also at your stand).');
    if (S.job) { S.logSales += logs; S.costs.dump += fees; }
    HC.company.money += logs - fees;
    HC.company.stats.logsSold += nl;
    S.time += 10; if (S.stage === 'onsite') S.workMins += 10;
    HC.Audio.cash();
    toast(`Dumped the trailer. Logs sold for ${HC.money(logs)}, dump fees ${HC.money(fees)}.`, 'good');
  }

  // Sell rocks at a quarry you own (the rest of the load stays aboard)
  // X in a dump truck (or a truck towing a dump trailer): tip the whole load into a pile right where you are
  const DUMP_BOX = ['dump', 'dump2', 'gndump', 'bed'];
  // an owned log & dump pad under this point (the public pads in town, or the ones in yards you own)
  function padAt(x, y) {
    const S = HC.session;
    return (S.lot.pads || [S.lot.pad]).find((p) => p && HC.inRect(x, y, p) && (!p.yard || (S.lot.yards.find((q) => q.id === p.yard) || {}).owned));
  }
  // debris lying on a pad (dumped, dropped by a loader or grapple) is taken in: logs sold, the rest charged the dump fee
  function sweepPads() {
    const S = HC.session;
    if (!S || !S.lot || S.preview) return;
    let logs = 0, fees = 0, nl = 0, n = 0;
    const take = (c) => { if (c.kind === 'log') { logs += c.value || 0; nl++; } else fees += HC.DUMP_FEE * (HC.LOAD[c.kind] || 1); n++; };
    S.lot.items = S.lot.items.filter((i) => {
      if (!padAt(i.x, i.y)) return true;
      if (i.kind === 'pile') {
        if (i.mulch || i.chips || i.firewood) return true;
        const keep = i.content.filter((c) => !DEBRIS.includes(c.kind) && c.kind !== 'rock');
        i.content.filter((c) => !keep.includes(c)).forEach(take);
        i.content = keep;
        return keep.length > 0;
      }
      if (DEBRIS.includes(i.kind) || i.kind === 'rock') { take(i); return false; }
      return true;
    });
    if (!n) return;
    if (S.job) { S.logSales += logs; S.costs.dump += fees; }
    HC.company.money += logs - fees; HC.company.stats.logsSold += nl;
    HC.Audio.cash();
    toast(`The pad took ${n} piece(s): logs sold for ${HC.money(logs)}, dump fees ${HC.money(fees)}.`, 'good');
  }
  function dumpLoad(u) {
    const S = HC.session;
    if (!HC.Units.isTruck(u.kind)) return toast('Get in a dump truck, or a truck towing a dump trailer, to dump a load.');
    const boxes = S.trailers.filter((t) => t.hitch === u.kind && DUMP_BOX.includes(t.kind));
    if (!boxes.length) return toast('Nothing to dump: this truck has no dump box and no dump trailer hitched.');
    const loads = boxes.filter((t) => t.cargo.length);
    if (!loads.length) return toast('The box is empty.');
    if (Math.abs(u.v) > 4) return toast('Stop before you raise the box.');
    let n = 0, piled = false;
    for (const t of loads) {
      const back = { dumptruck2: 58, dumptruck3: 72, dumptruck: 48, chiptruck: 50, chiptruck2: 62 }[HC.baseOf(u.kind)] || 48;
      const p = t.kind === 'bed' ? { x: u.x - Math.cos(u.a) * back, y: u.y - Math.sin(u.a) * back } : { x: t.x - Math.cos(t.a) * 32, y: t.y - Math.sin(t.a) * 32 };
      const junk = t.cargo.filter((c) => DEBRIS.includes(c.kind) || c.kind === 'rock').length;
      if (junk && (padAt(p.x, p.y) || padAt(u.x, u.y) || padAt(t.x, t.y))) {
        const before = t.cargo.length;
        haul(t); n += before - t.cargo.length; t.tipT = 1; t.tipN = (t.tipN || 0) + 1;
        for (let i = 0; i < 6; i++) dust(p.x + HC.rand(-14, 14), p.y + HC.rand(-14, 14), '#8a6a44', 3, 80);
        if (!t.cargo.length) continue;
      }
      if (junk && !HC.World.yardAt(p.x, p.y, true) && !padAt(p.x, p.y)) { // not at your own yard
        const onJob = S.job && HC.world.parcels.some((q) => q.id === S.job.parcel && HC.inRect(p.x, p.y, { x: q.x - 8, y: q.y - 8, w: q.w + 16, h: q.h + 16 }));
        if (!onJob) { const fine = junk * HC.DUMPING_FINE; HC.company.money -= fine; if (S.job) S.costs.damage += fine; toast(`Illegal dumping: ${junk} piece(s) of debris tipped out off the job and away from your yard. Fined ${HC.money(fine)}.`, 'bad'); }
        else if ((HC.JOBS[S.job.type] || {}).disposal === 'haul') toast('This job is haul-away: anything left on the property is fined at the invoice. Take it to a log & dump pad.', 'warn');
      }
      if (!t.cargo.length) continue;
      const mulch = t.cargo.every((c) => c.kind === 'mulch'), chips = !mulch && t.cargo.every((c) => c.kind === 'chips'), firewood = !mulch && !chips && t.cargo.every((c) => c.kind === 'firewood');
      piled = true;
      let pile = S.lot.items.find((it) => it.kind === 'pile' && !!it.mulch === mulch && !!it.chips === chips && !!it.firewood === firewood && HC.dist(it.x, it.y, p.x, p.y) < 30);
      if (!pile) { pile = { id: HC.uid(), kind: 'pile', mulch, chips, firewood, x: p.x, y: p.y, a: HC.rand(0, 6.28), size: 0.6, content: [] }; S.lot.items.push(pile); }
      for (const c of t.cargo) { Object.assign(c, { x: pile.x, y: pile.y, z: 0 }); pile.content.push(c); }
      pile.size = 0.6 + Math.sqrt(pile.content.length) * 0.28;
      n += t.cargo.length; t.cargo = []; t.load = 0; t.tipT = 1; t.tipN = (t.tipN || 0) + 1;
      for (let i = 0; i < 6; i++) dust(p.x + HC.rand(-14, 14), p.y + HC.rand(-14, 14), mulch ? '#3a2618' : '#8a6a44', 3, 80);
    }
    HC.Audio.drop(); S.time += 2; if (S.stage === 'onsite') S.workMins += 2;
    if (piled) toast(`Box up: dumped ${n} piece(s) in a pile. A grapple or loader can pick it back up.`);
  }
  function sellMulch(loads) {
    const S = HC.session;
    let n = 0;
    let chips = 0, wood = 0;
    for (const t of loads) {
      const m = t.cargo.filter((c) => c.kind === 'mulch'), ch = t.cargo.filter((c) => c.kind === 'chips'), fw = t.cargo.filter((c) => c.kind === 'firewood');
      t.cargo = t.cargo.filter((c) => c.kind !== 'mulch' && c.kind !== 'chips' && c.kind !== 'firewood'); t.load -= m.length + ch.length + fw.length; n += m.length; chips += ch.length; wood += fw.length;
    }
    if (!n && !chips && !wood) return toast('Nothing they buy in the load. The landscape supply buys mulch, wood chips and firewood.');
    const pay = n * HC.MULCH_PRICE + chips * HC.CHIP_PRICE + wood * HC.FIREWOOD_SUPPLY;
    HC.company.money += pay; if (S.job) S.logSales += pay;
    HC.company.stats.mulchSold = (HC.company.stats.mulchSold || 0) + n;
    S.time += 6; if (S.stage === 'onsite') S.workMins += 6;
    HC.Audio.cash();
    toast(`Sold ${[n ? n + ' units of mulch' : '', chips ? chips + ' units of wood chips' : '', wood ? wood + ' units of firewood' : ''].filter(Boolean).join(', ')} for ${HC.money(pay)}.`, 'good');
  }
  // stock your firewood stand: customers buy from it through the day
  function stockStand(loads) {
    const C = HC.company, S = HC.session;
    C.stand = C.stand || { stock: 0, sold: 0, earned: 0 };
    let moved = 0;
    for (const t of loads) {
      const fw = t.cargo.filter((c) => c.kind === 'firewood');
      for (const f of fw) { if (C.stand.stock >= HC.STAND_CAP) break; t.cargo.splice(t.cargo.indexOf(f), 1); t.load -= 1; C.stand.stock++; moved++; }
    }
    if (!moved) return toast(C.stand.stock >= HC.STAND_CAP ? `The stand is full (${HC.STAND_CAP}). Sell the rest at the landscape supply.` : 'No firewood in the load. Run logs through the processor first.');
    S.time += 4;
    HC.Audio.drop(); HC.Save.save();
    toast(`Stocked the stand with ${moved} unit(s) of firewood (${C.stand.stock}/${HC.STAND_CAP}). Customers stop by through the day.`, 'good');
  }
  function sellRocks(loads) {
    const S = HC.session, q = HC.world.quarry;
    if (!q.owned) return toast(`You don't own ${q.name}. Buy it in the shop (J) to sell rocks here.`, 'warn');
    let n = 0;
    for (const t of loads) {
      const rocks = t.cargo.filter((c) => c.kind === 'rock');
      t.cargo = t.cargo.filter((c) => c.kind !== 'rock');
      t.load -= rocks.length * (HC.LOAD.rock || 3);
      n += rocks.length;
    }
    if (!n) return toast('No rocks in the load. Logs go to the log pad at your home yard.');
    const pay = n * HC.ROCK_PRICE;
    HC.company.money += pay;
    if (S.job) S.logSales += pay;
    S.time += 6; if (S.stage === 'onsite') S.workMins += 6;
    HC.Audio.cash();
    toast(`Sold ${n} rock${n === 1 ? '' : 's'} at the quarry for ${HC.money(pay)}.`, 'good');
  }
  // pick something up off the ground: a push pile gives one piece at a time and shrinks
  function takeItem(it) {
    const S = HC.session;
    if (it.kind !== 'pile') { S.lot.items.splice(S.lot.items.indexOf(it), 1); delete it.feedTo; return it; }
    const piece = it.content.pop();
    if (!it.content.length) S.lot.items.splice(S.lot.items.indexOf(it), 1);
    else it.size = 0.6 + Math.sqrt(it.content.length) * 0.28;
    Object.values(S.units).forEach((u) => { if (u.pileId === it.id && !it.content.length) u.pileId = null; });
    return Object.assign(piece, { x: it.x, y: it.y, z: 0 });
  }
  // drop what a machine is holding: pieces fall from the grapple to the ground
  function dropItems(u, p) {
    const S = HC.session;
    u.carrying.forEach((c, i) => { c.x = p.x + HC.rand(-10, 10); c.y = p.y + HC.rand(-10, 10) + i * 4; c.z = 0.55 + i * 0.12; c.vz = 0; S.lot.items.push(c); });
    u.carrying = [];
    HC.Audio.drop();
  }

  // ---------- objectives ----------
  function inZone(S, o) { return S.lot.zone && HC.inRect(o.x, o.y, S.lot.zone); }
  // debris lying on a property, wherever it came from: logs, limbs and ripped stumps (and rocks when they count)
  const DEBRIS = ['log', 'brush', 'stump'];
  function debrisOn(S, pid, withRocks) {
    const p = HC.world.parcels.find((q) => q.id === pid);
    if (!p) return 0;
    const kinds = withRocks ? DEBRIS.concat('rock') : DEBRIS, r = { x: p.x - 8, y: p.y - 8, w: p.w + 16, h: p.h + 16 };
    return S.lot.items.reduce((a, i) => a + (!HC.inRect(i.x, i.y, r) ? 0 : i.kind === 'pile' ? (i.mulch || i.chips || i.firewood ? 0 : i.content.filter((c) => kinds.includes(c.kind)).length) : kinds.includes(i.kind) ? 1 : 0), 0);
  }
  const OBJECTIVES = {
    tree_removal(S) {
      const pid = S.job.parcel;
      const marked = S.lot.trees.filter((t) => t.marked && t.parcel === pid);
      const down = marked.filter((t) => t.state !== 'standing' && t.state !== 'falling').length;
      const bucked = marked.filter((t) => t.state === 'gone').length;
      const debris = debrisOn(S, pid, false) + marked.filter((t) => t.state === 'felled').length; // anywhere on the property, even dumped back out
      return [
        { label: 'Fell flagged trees', n: down, of: marked.length },
        { label: 'Buck downed trees', n: bucked, of: marked.length },
        { label: 'Clear logs and brush', n: debris || bucked < marked.length ? 0 : 1, of: 1, left: debris },
      ];
    },
  };
  function objectives(S = HC.session) {
    if (!S || !S.job) return { list: [], complete: false };
    const list = (OBJECTIVES[S.job.type] || OBJECTIVES.tree_removal)(S);
    return { list, complete: list.every((o) => o.optional || o.n >= o.of) };
  }

  // ---------- customers calling in ----------
  function calls(S) {
    const C = HC.company;
    if (S.time < S.nextCall) return;
    S.nextCall = S.time + HC.rand(70, 130);
    C.board = (C.board || []).filter((j) => !j.lost);
    if (C.board.filter((j) => !(j.tier > HC.Co.tier())).length >= 12) C.board.shift();
    const types = Object.keys(HC.JOBS);
    const doable = types.filter((t) => HC.JOBS[t].needs.every((k) => HC.ownsKind(k)));
    const job = HC.Game.makeJob(HC.chance(0.7) && doable.length ? HC.pick(doable) : HC.pick(types), HC.Co.tier());
    C.board.unshift(job);
    HC.Audio.pop();
    toast(`Phone: ${job.client} wants ${HC.JOBS[job.type].name.toLowerCase()} for ${HC.money(job.pay)}. Press J to see the job board.`, 'call');
  }

  // ---------- day timer ----------
  function endOfDay(S) {
    S.paused = true;
    const outside = [];
    for (const k in S.units) {
      const u = S.units[k];
      if (HC.EQUIP[k].move === 'walk') continue;
      if (!HC.World.yardAt(u.x, u.y)) {
        outside.push(HC.EQUIP[k].short);
        if (S.weather.wet) HC.company.cond[k] = Math.max(0, (HC.company.cond[k] ?? 100) - 3);
      }
    }
    S.leftOut = outside;
    const wages = HC.Co.wages();
    HC.company.money -= wages;
    S.costs.wages += wages;
    HC.company.day++;
    S.time = DAY_START;
    S.nextCall = DAY_START + 30;
    S.weather = rollWeather();
    HC.company.weather = S.weather;
    HC.company.minute = DAY_START;
    HC.Audio.stopLoops();
    HC.Save.save();
    HC.UI.dayEnd(S, wages);
  }

  // ---------- finishing ----------
  function finish() {
    const S = HC.session, C = HC.company;
    if (!S || !S.job) return;
    HC.Audio.stopLoops();
    const jt = HC.JOBS[S.job.type] || {};
    if (jt.disposal === 'haul') {
      const left = debrisOn(S, S.job.parcel, S.job.type === 'lot_clearing' || S.job.type === 'hardscape');
      if (left) {
        const fine = left * HC.DUMPING_FINE;
        S.penalties.push({ id: 'dumping', label: `Debris left on the property (${left} piece${left > 1 ? 's' : ''})`, cost: fine });
        S.costs.damage += fine; S.penQ += Math.min(35, left * 3);
      }
    }
    const ob = objectives(S);
    const required = ob.list.filter((o) => !o.optional);
    const frac = required.reduce((a, o) => a + Math.min(1, o.of ? o.n / o.of : 1), 0) / Math.max(1, required.length);
    let quality = HC.clamp(100 - S.penQ, 0, 100);
    if (!ob.complete) quality = Math.min(quality, 55) * frac;
    const bonus = ob.list.filter((o) => o.optional).reduce((a, o) => a + (o.bonus || 0) * o.n, 0);
    const par = S.job.par, wm = Math.max(1, S.workMins);
    const speed = wm <= par ? 1 + 0.25 * (1 - wm / par) : Math.max(0.6, 1 - (0.4 * (wm - par)) / par);
    const base = S.job.pay * (ob.complete ? 1 : frac * 0.6);
    const qualMul = 0.5 + 0.5 * (quality / 100);
    const pay = Math.round(base * qualMul * speed + bonus);
    const stars = quality >= 90 ? 5 : quality >= 75 ? 4 : quality >= 58 ? 3 : quality >= 40 ? 2 : 1;
    // happy customers sometimes tip: 4 stars about a third of the time, 5 stars more often than not
    const tip = (stars === 5 && Math.random() < 0.6) || (stars === 4 && Math.random() < 0.35) ? Math.max(20, Math.round((pay * HC.rand(stars === 5 ? 0.08 : 0.05, stars === 5 ? 0.18 : 0.1)) / 5) * 5) : 0;
    const tierBefore = HC.Co.tier();
    C.money += pay + tip - S.costs.damage;
    C.stats.tips = (C.stats.tips || 0) + tip;
    C.stats.earned += pay;
    C.stats.damages += S.costs.damage;
    C.ratings.push(stars);
    C.jobsDone++;
    const r = {
      S: { job: S.job, workMins: S.workMins, penalties: S.penalties.slice(), costs: Object.assign({}, S.costs), logSales: S.logSales },
      ob, quality, stars, speed, pay, base, qualMul, bonus, frac, tip,
      net: pay + tip - S.costs.damage + S.logSales - S.costs.dump - S.costs.fuel - S.costs.wages,
    };
    // the customer's lot keeps your work; ribbons come off
    for (const t of S.lot.trees) if (t.parcel === S.job.parcel) t.marked = false;
    S.lot.zone = null; S.lot.targets = [];
    C.active = null;
    Object.assign(S, { job: null, stage: 'idle', workMins: 0, penalties: [], penQ: 0, costs: newCosts(), logSales: 0 });
    r.unlocked = HC.Co.tier() > tierBefore ? HC.TIERS[HC.Co.tier()].name : null;
    C.minute = S.time;
    HC.Save.save();
    HC.Audio.cash();
    S.paused = true;
    HC.UI.results(r);
  }

  // ---------- main update ----------
  function update(dt) {
    const S = HC.session;
    if (!S || S.paused) return;
    S.time += dt;
    if (S.stage === 'onsite') S.workMins += dt;
    HC.company.minute = S.time;
    if (S.time >= DAY_END) return endOfDay(S);
    for (const k in S.units) if (!S.units[k].hidden && !(HC.Net && HC.Net.drive(k, S.units[k], dt, S))) HC.Units.update(S.units[k], dt, S, k === S.active); // co-op guests drive their own machines
    arriveCheck(S);
    calls(S);
    for (const t of S.lot.trees) {
      if (t.state !== 'falling') continue;
      t.fallT += dt / 1.3;
      if (t.fallT >= 1) { t.fallT = 1; land(t, S); }
    }
    followAttachments(S);
    for (const t of S.lot.trees) {
      if (t.state !== 'felled') continue;
      if (t.landT !== undefined && t.landT < 1) t.landT += dt;
      if (t.autoBuck !== undefined) { t.autoBuck -= dt; if (t.autoBuck <= 0) { t.autoBuck = undefined; buck(t); } }
    }
    for (const it of S.lot.items) if (it.z > 0) { it.vz = (it.vz || 0) - 9.8 * dt; it.z = Math.max(0, it.z + it.vz * dt * 0.33); if (it.z === 0) it.vz = 0; }
    for (const p of S.particles) { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z = Math.max(0, p.z + p.vz * dt); p.vz -= 220 * dt; if (!p.ballistic) { p.vx *= 0.94; p.vy *= 0.94; } }
    S.particles = S.particles.filter((p) => p.t < p.life);
    for (const f of S.floats) f.t += dt;
    S.floats = S.floats.filter((f) => f.t < 2.4);
    S.shake *= Math.pow(0.02, dt);
    updateSound(S);
  }

  function updateSound(S) {
    const A = HC.Audio, u = S.units[S.active];
    const saw = S.units[S.active], hold = saw && S.saw && S.saw.holder === S.active;
    if (hold && saw.working) A.setLoop('saw', 0.22, 210 + Math.random() * 20, 1400, 0.4);
    else if (hold) A.setLoop('saw', 0.04, 95, 700, 0.6);
    else A.setLoop('saw', 0);
    const motor = u && HC.EQUIP[u.kind].move !== 'walk' && u.fuel > 0;
    if (motor) {
      const sp = Math.abs(u.v || 0) / (HC.EQUIP[u.kind].speed || 100);
      const bk = HC.baseOf(u.kind), base = bk === 'truck' ? 40 : bk.startsWith('mower') ? 70 : 50;
      A.setLoop('engine', 0.11 + sp * 0.08, base + sp * 45 + (u.working ? 18 : 0), 380 + sp * 320, 0.3);
    } else A.setLoop('engine', 0);
    const grinding = u && u.working && (['grinder', 'chipper', 'chipper2', 'fmulcher', 'excavator', 'miniex', 'dozerS', 'dozerL', 'harvester'].includes(HC.baseOf(u.kind)) || (HC.baseOf(u.kind) === 'skid' && u.mode >= 1));
    A.setLoop('grind', grinding ? 0.16 : 0, 120 + Math.random() * 30, 900, 0.5);
    A.setLoop('mower', u && HC.baseOf(u.kind).startsWith('mower') && u.working ? 0.08 : 0, 180, 1200, 0.2);
  }

  function jobHint(u, S) {
    if (!S.job) return 'No job booked. Press J for calls.';
    if (S.stage === 'travel') return `Job: ${S.job.address} (orange pin on the map).`;
    return '';
  }

  HC.Game = {
    buySaw, sawTrade, stockStand, makeJob, makeBoard, rollWeather, boot, accept, addUnit, buyAnother, sellUnit, sellTrailer, sellAttachment, resaleValue, trailerResale, buyTrailer, registerClone, addAttachment, attachToggle, attachmentNear, select, take, climb, nearestMachine, update, finish, snapshot, toast, hintOnce, float, dust, penalty, setTile,
    spray, fell, fallGeom, predictHits, spreadDeg, buck, cutBush, loadTrailer, haul, trailerCap, sellRocks, sellMulch, dumpLoad, dropItems, takeItem,
    objectives, inZone, jobHint, debrisOn, padAt, sweepPads, bucketTree, addTrailer, ESTIMATE, OBJECTIVES, DAY_START, DAY_END,
  };
})();
