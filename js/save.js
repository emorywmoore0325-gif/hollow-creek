// Hollow Creek — company state, upgrade lookups, localStorage save/load
'use strict';
(() => {
  const KEY = 'hollowCreekSave.v2'; // v2: open-world logistics (v1 saves don't carry over)

  function fresh() {
    const owned = {}, fuel = {}, cond = {};
    for (const k in HC.EQUIP) {
      owned[k] = !!HC.EQUIP[k].start;
      fuel[k] = HC.EQUIP[k].fuelCap;
      cond[k] = 100;
    }
    return {
      name: 'Hollow Creek Land & Timber', money: HC.START_MONEY || 30000, day: 1, minute: 8 * 60,
      owned, fuel, cond, upgrades: {}, crew: {}, ratings: [], jobsDone: 0,
      stats: { earned: 0, trees: 0, logsSold: 0, damages: 0 },
      board: null, weather: null, active: null, pos: null, yards: { hq: true, ridge: false }, trailers: {}, prefs: {}, yardLevel: 1, mapVer: HC.MAP_VER,
    };
  }

  HC.company = fresh();

  HC.Co = {
    level: (id) => HC.company.upgrades[id] || 0,
    // multiplier for a stat, from upgrades
    mult(stat) {
      let m = 1;
      for (const id in HC.company.upgrades) {
        const u = HC.UPGRADES && HC.UPGRADES[id];
        if (u && u.stat === stat) m *= Math.pow(u.per, HC.company.upgrades[id]);
      }
      if (stat === 'drive') m *= HC.Co.crew('operator', 1.15, 1);
      if (stat === 'fuelUse') m *= HC.Co.crew('operator', 0.85, 1);
      return m;
    },
    crew: (id, yes, no) => (HC.company.crew[id] ? yes : no),
    rating() {
      const r = HC.company.ratings.slice(-10);
      if (!r.length) return 3.0;
      return r.reduce((a, b) => a + b, 0) / r.length;
    },
    tier() {
      const r = HC.Co.rating(), n = HC.company.jobsDone;
      let t = 0;
      const shown = Math.round(r * 10) / 10; // compare the rating as it's shown (3.58 reads as 3.6 and counts as 3.6)
      HC.TIERS.forEach((tt, i) => { if (shown >= tt.minRating && n >= tt.minJobs) t = i; });
      return t;
    },
    wages() {
      let w = 0;
      for (const id in HC.company.crew) if (HC.company.crew[id] && HC.CREW) w += HC.CREW[id].wage;
      return w;
    },
  };

  // Save slots: slot 1 keeps the original key, so a save from before slots existed shows up as slot 1
  const SLOTS = 3, SLOT_KEY = 'hollowCreekSlot';
  const keyOf = (n) => (n === 1 ? KEY : `${KEY}.slot${n}`);
  let slot = 1;
  try { slot = HC.clamp(parseInt(localStorage.getItem(SLOT_KEY), 10) || 1, 1, SLOTS); } catch (e) { /* storage blocked */ }
  HC.Save = {
    SLOTS,
    get slot() { return slot; },
    setSlot(n) { slot = HC.clamp(n | 0, 1, SLOTS); try { localStorage.setItem(SLOT_KEY, String(slot)); } catch (e) { /* ignore */ } },
    has(n = slot) { try { return !!localStorage.getItem(keyOf(n)); } catch (e) { return false; } },
    // a short summary of a slot for the title screen (null when empty)
    info(n) {
      try {
        const raw = localStorage.getItem(keyOf(n));
        if (!raw) return null;
        const d = JSON.parse(raw), r = (d.ratings || []).slice(-10);
        return { name: d.name, label: d.slotName || '', money: d.money, day: d.day || 1, jobs: d.jobsDone || 0, rating: r.length ? r.reduce((a, b) => a + b, 0) / r.length : null,
          machines: Object.keys(d.owned || {}).filter((k) => d.owned[k] && HC.EQUIP[k] && !HC.EQUIP[k].hidden && !HC.EQUIP[k].noUnit).length, savedAt: d.savedAt || null };
      } catch (e) { return null; }
    },
    // give a slot its own name (shown on the title screen); works on the slot in play too
    rename(n, name) {
      name = String(name || '').trim().slice(0, 40);
      if (n === slot && HC.company && HC.session && !HC.session.preview) { HC.company.slotName = name; HC.Save.save(); return true; }
      try { const raw = localStorage.getItem(keyOf(n)); if (!raw) return false; const d = JSON.parse(raw); d.slotName = name; localStorage.setItem(keyOf(n), JSON.stringify(d)); return true; } catch (e) { return false; }
    },
    del(n) { try { localStorage.removeItem(keyOf(n)); } catch (e) { /* ignore */ } },
    save() {
      if (HC.Net && HC.Net.role === 'guest') return false; // a co-op guest is playing the host's company: never overwrite their own save
      if (HC.session && !HC.session.preview && HC.Game.snapshot) {
        const C = HC.company;
        if (HC.Net && HC.Net.role === 'peer') { // a co-op yard isn't yours at home: machines park back at your own yard, but stored debris is kept on both sides
          const snap = HC.Game.snapshot(), y = HC.Net.homeYard;
          C.coopItems = { yard: y, items: snap ? snap.items.filter((i) => { const yd = HC.World.yardAt(i.x, i.y, false); return yd && yd.id === y; }) : [] };
          C.pos = { items: C.homeItems || [] };
        } else { C.pos = HC.Game.snapshot(); delete C.homeItems; }
      }
      HC.company.savedAt = Date.now();
      try { localStorage.setItem(keyOf(slot), JSON.stringify(HC.company)); return true; }
      catch (e) { return false; }
    },
    load() {
      try {
        const raw = localStorage.getItem(keyOf(slot));
        if (!raw) return false;
        const data = JSON.parse(raw);
        const base = fresh();
        HC.company = Object.assign(base, data);
        // fill in equipment added in later versions
        for (const k in HC.EQUIP) {
          if (HC.company.owned[k] === undefined) HC.company.owned[k] = !!HC.EQUIP[k].start;
          if (HC.company.fuel[k] === undefined) HC.company.fuel[k] = HC.EQUIP[k].fuelCap;
          if (HC.company.cond[k] === undefined) HC.company.cond[k] = 100;
        }
        const Cm = HC.company, up = Cm.upgrades || {};
        if (Cm.owned.land) { Cm.owned.land = false; Cm.money += 1500; Cm.landRefund = true; } // the landscaping crew retired: you lay the materials yourself now
        if (Cm.owned.saw && !Cm.sawKind) Cm.sawKind = (up.chain || 0) >= 2 ? 's90' : up.chain === 1 ? 's70' : 's60'; // the old chain upgrade became a better saw
        delete up.chain;
        // the county map changed since this save: keep the company, park everything back at the yard
        if (data.mapVer !== HC.MAP_VER) { // (read the save's own value: the fresh defaults already carry the current one)
          if (Cm.pos || Cm.active) Cm.mapMoved = !!Cm.active ? 'job' : 'pos';
          Cm.pos = null; Cm.active = null; Cm.board = null; Cm.mapVer = HC.MAP_VER;
        }
        return true;
      } catch (e) { return false; }
    },
    credit(amount, n = slot) { // add money to a saved company without loading it
      try { const raw = localStorage.getItem(keyOf(n)); if (!raw) return false; const d = JSON.parse(raw); d.money = (d.money || 0) + amount; localStorage.setItem(keyOf(n), JSON.stringify(d)); return d.name || true; } catch (e) { return false; }
    },
    reset() { HC.company = fresh(); try { localStorage.removeItem(keyOf(slot)); } catch (e) { /* ignore */ } },
    fresh,
  };
})();
