// Hollow Creek — a place to live. Three houses around town are for sale; until you buy one you bunk on the cot in the yard office.
// Walk up to the front door and press E to go inside: sleep until morning (a better home gets you up earlier and rested), save, or check the phone.
'use strict';
(() => {
  const TS = HC.TILE, T = HC.T, C = () => HC.company;
  const TIERS = [
    { id: 'small', name: 'Starter house', price: 24000, early: 30, rested: 0.05, blurb: 'A cozy ranch with a carport for one truck. Up 30 minutes earlier.' },
    { id: 'mid', name: 'Farmhouse', price: 58000, early: 60, rested: 0.08, bays: 2, shop: 'Two-bay garage', blurb: 'A roomy old farmhouse with a wood stove and a red two-bay carriage barn to park in. Up an hour earlier and well rested.' },
    { id: 'big', name: 'Country home', price: 110000, early: 90, rested: 0.12, bays: 4, shop: 'Four-bay equipment shop', blurb: 'A big place on its own acreage with a four-bay equipment shop: park, fuel-free storage out of the weather, and repairs. Up 90 minutes earlier, fully rested.' },
  ];
  const COT = { id: 'cot', name: 'Cot in the yard office', price: 0, early: 0, rested: 0, blurb: 'A folding cot behind the desk.' };

  // the three listed houses: the roadside houses nearest the home yard, smallest to biggest
  let cacheW = null, cache = [];
  function listed() {
    const W = HC.world; if (!W) return [];
    if (cacheW === W) return cache;
    const Y = W.yard, cx = Y.x + Y.w / 2, cy = Y.y + Y.h / 2;
    const cands = W.parcels.filter((p) => !p.tract).map((p) => ({ p, h: W.houses.find((h) => h.parcel === p.id && !h.yard) })).filter((o) => o.h)
      .sort((a, b) => HC.dist(a.p.x, a.p.y, cx, cy) - HC.dist(b.p.x, b.p.y, cx, cy)).slice(0, 8)
      .sort((a, b) => a.h.w * a.h.h - b.h.w * b.h.h);
    const pick = cands.length >= 3 ? [cands[0], cands[Math.floor(cands.length / 2)], cands[cands.length - 1]] : cands;
    cache = pick.map((o, i) => Object.assign({}, TIERS[i], { parcel: o.p.id, house: o.h, address: o.p.address }));
    cacheW = W;
    return cache;
  }
  const mine = () => listed().find((l) => l.parcel === C().home) || null;
  const tier = () => mine() || COT;
  const door = (h) => ({ x: h.x + h.w / 2, y: h.facing === -1 ? h.y - 10 : h.y + h.h + 10 });
  function officeDoor() { const o = HC.world.houses.find((h) => h.label === 'Office' && h.parcel === 'hq'); return o ? door(o) : null; }

  // your home's lot is off the job board; the bigger homes come with a garage or shop that counts as one of your yards
  function markHome() { for (const p of HC.world.parcels) if (p.id === C().home) p.isYard = true; homeShop(); }
  // every listed house comes with its own garage, there before you buy it: a carport, a red carriage barn, or a steel shop.
  // It only counts as one of your yards (parking, repairs, out of the weather) once the house is yours.
  const STYLE = { small: { style: 'carport', bays: 1, name: 'Carport' }, mid: { style: 'barn', bays: 2, name: 'Carriage barn' }, big: { style: 'shop', bays: 4, name: 'Equipment shop' } };
  let builtFor = null;
  function homeShop() {
    const W = HC.world; if (!W) return;
    if (builtFor !== W) {
      builtFor = W;
      W.sheds = W.sheds.filter((s) => s.yard !== 'home'); W.bays = W.bays.filter((b) => b.yard !== 'home'); W.yards = W.yards.filter((y) => y.id !== 'home');
      for (const m of listed()) {
        const st = STYLE[m.id]; if (!st) continue;
        const p = W.parcels.find((q) => q.id === m.parcel), h = m.house, bh = 4 * TS;
        const right = p.x + p.w - TS * 0.5 - (h.x + h.w + TS * 1.2), left = h.x - TS * 1.2 - (p.x + TS * 0.5), room = Math.max(right, left);
        const nb = Math.max(1, Math.min(st.bays, Math.floor((room - TS) / (2.4 * TS)))), bw = nb * 2.4 * TS + TS;
        const x = right >= left ? h.x + h.w + TS * 1.2 : h.x - TS * 1.2 - bw, flip = h.facing === -1;
        const y = flip ? h.y + h.h - bh : h.y, yard = { id: 'home', home: m.parcel, name: `${['', 'Single', 'Two', 'Three', 'Four'][nb]}-bay ${st.name.toLowerCase()}`, x: x - TS * 0.5, y: flip ? y - TS * 3.5 : y - TS * 0.5, w: bw + TS, h: bh + TS * 4, owned: false };
        W.trees = W.trees.filter((t) => !(t.parcel === p.id && HC.circleRectHit(t.x, t.y, t.trunkR + 10, yard)));
        W.bushes = W.bushes.filter((b) => !HC.circleRectHit(b.x, b.y, (b.r || 10) + 4, yard));
        W.fences = W.fences.filter((f) => !(f.parcel === p.id && HC.segRectHit(f.x, f.y, f.x + (f.w || 0), f.y + (f.h || 0), 2, yard)));
        for (let ty = Math.floor(yard.y / TS); ty < Math.ceil((yard.y + yard.h) / TS); ty++) for (let tx = Math.floor(yard.x / TS); tx < Math.ceil((yard.x + yard.w) / TS); tx++) {
          const t = W.tile(tx, ty); if (t === T.ROAD || t === T.WATER) continue; if (t !== T.GRAVEL) { W.set(tx, ty, T.GRAVEL); HC.Render.setTile && HC.Render.setTile(tx, ty); }
        }
        W.sheds.push({ x, y, w: bw, h: bh, yard: 'home', style: st.style, flip });
        for (let i = 0; i < nb; i++) W.bays.push({ x: x + TS * (1.7 + i * 2.4), y: y + bh * 0.55, a: flip ? Math.PI / 2 : -Math.PI / 2, yard: 'home', home: m.parcel, kind: 'machine' });
        W.yards.push(yard);
      }
      HC.Render.fencesChanged && HC.Render.fencesChanged();
    }
    for (const y of W.yards) if (y.id === 'home') y.owned = y.home === C().home; // yours only once you live there
    HC.Render.yardChanged && HC.Render.yardChanged();
  }


  function buy(parcel) {
    const L = listed().find((l) => l.parcel === +parcel); if (!L) return 'That house is gone.';
    if (C().home === L.parcel) return 'You already live there.';
    if (C().money < L.price) return `You need ${HC.money(L.price)} for the ${L.name.toLowerCase()}.`;
    const old = mine(), back = old ? Math.round(old.price * 0.85) : 0;
    C().money -= L.price - back;
    if (old) { const p = HC.world.parcels.find((q) => q.id === old.parcel); if (p) p.isYard = false; }
    C().home = L.parcel; markHome(); HC.Audio.cash(); HC.Save.save();
    return `Bought the ${L.name.toLowerCase()} at ${L.address} for ${HC.money(L.price)}${old ? ` (sold your old place for ${HC.money(back)})` : ''}. Walk up to the front door and press E to go inside.`;
  }

  // ---------- inside ----------
  let inside = null;
  function css() {
    if (document.getElementById('home-css')) return;
    const st = document.createElement('style'); st.id = 'home-css';
    st.textContent = `#home-in{position:fixed;inset:0;z-index:60;display:flex;align-items:center;justify-content:center;background:rgba(10,12,16,.72)}
#home-in .room{position:relative;width:min(760px,94vw);aspect-ratio:16/9;border-radius:14px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.5);background:linear-gradient(#e9dcc3 0 62%,#9b7650 62% 100%)}
#home-in.cot .room{background:linear-gradient(#b9b4a6 0 62%,#6f6a60 62% 100%)}
#home-in .win{position:absolute;left:8%;top:12%;width:22%;height:30%;border:6px solid #f5efe2;background:linear-gradient(var(--sky1),var(--sky2));box-shadow:inset 0 0 0 3px #d9cfbd}
#home-in .win:after{content:'';position:absolute;left:50%;top:0;bottom:0;border-left:4px solid #f5efe2}
#home-in .bed{position:absolute;right:7%;bottom:12%;width:38%;height:24%;border-radius:10px 10px 4px 4px;background:#3e5a7a;box-shadow:0 -14px 0 -4px #f2efe8 inset}
#home-in .bed:before{content:'';position:absolute;right:-3%;bottom:0;width:8%;height:170%;background:#6b4a30;border-radius:6px 6px 0 0}
#home-in .bed:after{content:'';position:absolute;right:8%;top:8%;width:22%;height:28%;background:#fbf8f2;border-radius:8px}
#home-in.cot .bed{height:12%;background:#56614a;border-radius:3px}#home-in.cot .bed:before,#home-in.cot .bed:after{display:none}
#home-in .desk{position:absolute;left:36%;bottom:18%;width:20%;height:16%;background:#7a5536;border-radius:4px}
#home-in .clock{position:absolute;left:42%;top:14%;font:700 22px var(--f-mono,monospace);color:#e9ffe0;background:#1e2622;padding:6px 12px;border-radius:8px}
#home-in .lamp{position:absolute;left:58%;bottom:34%;width:4%;height:10%;background:#f6d77a;border-radius:40% 40% 4px 4px;box-shadow:0 0 50px 20px rgba(255,214,120,var(--glow))}
#home-in .panel{position:absolute;left:0;right:0;bottom:0;padding:14px 18px;background:linear-gradient(transparent,rgba(0,0,0,.75));color:#fff;display:flex;flex-wrap:wrap;gap:8px;align-items:center}
#home-in .panel h3{width:100%;margin:0 0 2px;font-size:18px}#home-in .panel p{width:100%;margin:0 0 6px;font-size:13px;opacity:.85}`;
    document.head.appendChild(st);
  }
  function goIn(where) {
    const S = HC.session; css();
    inside = where; S.paused = true;
    // walk around inside: a real 3D interior for each home (the old picture-panel is the fallback)
    if (HC.Interior && HC.Interior.enter(where, { exit: () => goOut(), sleep: () => sleep(where) })) return;
    const t = S.time, night = t >= 19 * 60, eve = t >= 16.5 * 60;
    const el = document.createElement('div'); el.id = 'home-in'; if (where.id === 'cot') el.className = 'cot';
    el.style.setProperty('--sky1', night ? '#0d1530' : eve ? '#f2a86a' : '#8fc8f0'); el.style.setProperty('--sky2', night ? '#26365e' : eve ? '#f6d29a' : '#d8eefc'); el.style.setProperty('--glow', night ? 0.55 : eve ? 0.3 : 0.08);
    const canSleep = t >= 16 * 60, coop = HC.Net && HC.Net.role && HC.Net.role !== 'host';
    el.innerHTML = `<div class="room"><div class="win"></div><div class="desk"></div><div class="lamp"></div><div class="bed"></div><div class="clock">${HC.clock(t)}</div>
      <div class="panel"><h3>${where.name}</h3><p>${where.blurb}${where.early ? ` Tomorrow you're up at ${HC.clock(HC.Game.DAY_START - where.early)}.` : ''}</p>
      <button class="btn primary" id="hi-sleep" ${!canSleep || coop ? 'disabled' : ''}>${coop ? 'The host calls it a night' : canSleep ? 'Sleep until morning' : 'Too early to sleep (after 4 PM)'}</button>
      <button class="btn" id="hi-save">Save game</button><button class="btn" id="hi-phone">Phone</button><button class="btn ghost" id="hi-out">Go back outside</button></div></div>`;
    document.body.appendChild(el);
    el.querySelector('#hi-out').onclick = goOut;
    el.querySelector('#hi-save').onclick = () => { HC.Save.save(); HC.Game.toast('Game saved.', 'good'); };
    el.querySelector('#hi-phone').onclick = () => { goOut(); window.dispatchEvent(new KeyboardEvent('keydown', { key: 'j' })); };
    el.querySelector('#hi-sleep').onclick = () => sleep(where);
  }
  function goOut() { const el = document.getElementById('home-in'); if (el) el.remove(); if (inside) { inside = null; HC.session.paused = false; } }
  function sleep(where) {
    const S = HC.session;
    goOut();
    S.slept = { early: where.early, rested: where.rested, name: where.name };
    S.time = HC.Game.DAY_END; // the day wraps up right away (wages, weather, save)
  }
  // morning after a night at home: up earlier, and rested
  const baseDayEnd = HC.UI.dayEnd;
  HC.UI.dayEnd = function (S) {
    if (S.slept) {
      const z = S.slept; S.slept = null;
      S.time = HC.Game.DAY_START - z.early; S.nextCall = S.time + 30; HC.company.minute = S.time;
      HC.company.rested = z.rested; HC.company.restedDay = HC.company.day;
    } else { HC.company.rested = 0; }
    return baseDayEnd.apply(this, arguments);
  };
  // rested: work goes a little faster all day (machines and the saw)
  if (HC.Co && HC.Co.mult) {
    const baseMult = HC.Co.mult;
    HC.Co.mult = function () { const m = baseMult.apply(this, arguments); const c = C(); return c && c.rested && c.restedDay === c.day ? m * (1 + c.rested) : m; };
  }

  // ---------- E at the door ----------
  const U = HC.Units;
  function nearDoor(u) {
    if (!u || !HC.EQUIP[u.kind] || HC.EQUIP[u.kind].move !== 'walk') return null;
    const m = mine(); if (m) { const d = door(m.house); if (HC.dist(d.x, d.y, u.x, u.y) < 34) return m; }
    const od = officeDoor(); if (od && HC.dist(od.x, od.y, u.x, u.y) < 34) return COT;
    for (const L of listed()) if (L.parcel !== C().home) { const d = door(L.house); if (HC.dist(d.x, d.y, u.x, u.y) < 34) return Object.assign({ forSale: true }, L); }
    return null;
  }
  const baseInteract = U.interact;
  U.interact = function (u, S) {
    const h = nearDoor(u);
    if (h && !(S.saw && S.saw.holder === u.kind)) {
      if (h.forSale) return HC.Game.toast(`For sale: ${h.name}, ${h.address}, ${HC.money(h.price)}. ${h.blurb} Buy it on the phone (Shop > Homes).`);
      if (h.id === 'cot' && mine()) return HC.Game.toast(`You've got a home now: ${mine().name} at ${mine().address}.`);
      return goIn(h);
    }
    return baseInteract.apply(this, arguments);
  };
  const baseHint = U.hint;
  U.hint = function (u, S) {
    const h = nearDoor(u);
    if (h && !(S.saw && S.saw.holder === u.kind)) return h.forSale ? `For sale: ${h.name} (${HC.money(h.price)}). E for details` : h.id === 'cot' && mine() ? 'Yard office' : `E: go inside (${h.name.toLowerCase()})`;
    return baseHint.apply(this, arguments);
  };
  addEventListener('keydown', (e) => { if (inside && document.getElementById('home-in') && (e.key === 'Escape' || e.key.toLowerCase() === 'e')) { e.stopPropagation(); goOut(); } }, true);

  HC.Homes = { listed, mine, tier, buy, door, TIERS, markHome, isInside: () => !!inside };
  const baseBoot = HC.Game.boot;
  if (baseBoot) HC.Game.boot = function () { const r = baseBoot.apply(this, arguments); try { cacheW = null; if (C() && C().home) markHome(); } catch (e) { /* no world yet */ } return r; };
})();
// a loaded game: put the home's garage or shop back once the world is up and drawn
(() => {
  let doneFor = null;
  const base = HC.Game.update;
  HC.Game.update = function () {
    const r = base.apply(this, arguments);
    if (HC.world && HC.session && !HC.session.preview && doneFor !== HC.world) { doneFor = HC.world; try { HC.Homes.markHome(); } catch (e) { console.warn(e); } }
    return r;
  };
})();
