// Hollow Creek — the used equipment marketplace: a handful of second-hand machines, trucks and trailers at a discount.
// Listings come and go: a fresh batch every few hours of game time, and a good deal can be gone by the next look.
'use strict';
(() => {
  const SELLERS = ['Retiring contractor, Persimmon Ln', 'Bank repo lot', 'County surplus auction', 'Haddix Farm sale', 'Blue Ridge Tree Service (upgrading)',
    'Dealer trade-in', 'Estate sale, Cedar Knob Way', 'Pike Land Services (closing down)', 'Rental fleet sell-off', 'Old Mill Apartments maintenance'];
  const REFRESH = 4 * 60; // game minutes between batches
  const TRAILER_IDS = ['equip', 'dump', 'dump18', 'gndump', 'gnflat', 'deckover', 'lowboy', 'logtrailer'];

  // what can turn up used: anything sold new in the shop
  function pool() {
    const eq = Object.keys(HC.EQUIP).filter((k) => HC.EQUIP[k].price && (!HC.EQUIP[k].base || HC.EQUIP[k].shop) && HC.EQUIP[k].move);
    const tr = TRAILER_IDS.filter((id) => HC.TRAILERS[id] && HC.TRAILERS[id].price).map((id) => 'tr:' + id);
    return eq.concat(tr);
  }
  const priceOf = (k) => (k.startsWith('tr:') ? HC.TRAILERS[k.slice(3)].price : HC.EQUIP[k].price);
  const nameOf = (k) => (k.startsWith('tr:') ? HC.TRAILERS[k.slice(3)].name : HC.EQUIP[k].name);

  function listing(k) {
    const cond = HC.randi(32, 88), list = priceOf(k);
    // worn ones are cheap; the odd great deal; condition sets most of the price
    const f = HC.clamp(0.28 + cond / 160 + HC.rand(-0.08, 0.08) - (HC.chance(0.12) ? 0.15 : 0), 0.3, 0.85);
    const years = Math.max(1, Math.round((100 - cond) / 9 + HC.rand(-1, 2)));
    return { id: HC.uid(), k, cond: k.startsWith('tr:') ? 100 : cond, years, price: Math.round((list * f) / 50) * 50, list, seller: HC.pick(SELLERS), sold: false };
  }
  function refresh(force) {
    const C = HC.company, S = HC.session;
    if (!C || !S) return;
    const now = (C.day || 1) * 24 * 60 + (S.time || 0);
    C.market = C.market || { list: [], next: 0 };
    if (!force && now < C.market.next) return false;
    const pick = pool().sort(() => Math.random() - 0.5).slice(0, HC.randi(5, 7));
    C.market.list = pick.map(listing);
    C.market.next = now + REFRESH;
    C.market.at = now;
    return true;
  }
  function minutesLeft() {
    const C = HC.company, S = HC.session;
    if (!C.market) return 0;
    return Math.max(0, C.market.next - ((C.day || 1) * 24 * 60 + (S.time || 0)));
  }

  // buying: it arrives at your yard in the condition it was listed
  function buy(id) {
    const C = HC.company, m = C.market, L = m && m.list.find((q) => q.id === +id);
    if (!L || L.sold) return 'That listing is gone.';
    if (C.money < L.price) return `You need ${HC.money(L.price)} for that.`;
    C.money -= L.price; L.sold = true;
    if (L.k.startsWith('tr:')) {
      const tid = HC.Game.buyTrailer(L.k.slice(3));
      HC.Audio.cash(); HC.Save.save();
      return `Bought a used ${nameOf(L.k).toLowerCase()} for ${HC.money(L.price)} (new ${HC.money(L.list)}). It's at your yard${tid !== L.k.slice(3) ? ' as #' + tid.split('_').pop() : ''}.`;
    }
    let key = L.k;
    if (C.owned[key]) key = HC.Game.buyAnother(L.k);
    else { C.owned[key] = true; C.fuel[key] = HC.EQUIP[key].fuelCap || 0; if (HC.EQUIP[key].attachTo) HC.Game.addAttachment(key); else HC.Game.addUnit(key); }
    C.cond[key] = L.cond;
    HC.Audio.cash(); HC.Save.save();
    if (HC.UI.buildHud) HC.UI.buildHud();
    return `Bought a used ${HC.EQUIP[L.k].name} (${L.years} yr old, ${L.cond}% condition) for ${HC.money(L.price)}. New it's ${HC.money(L.list)}. It's parked at your yard; the shop can fix it up.`;
  }

  // refresh as the clock runs
  const base = HC.Game.update;
  let acc = 0;
  HC.Game.update = function (dt) {
    base.apply(this, arguments);
    acc += dt;
    if (acc < 2) return;
    acc = 0;
    if (HC.session && !HC.session.preview && !(HC.Net && HC.Net.role === 'guest') && refresh()) {
      const best = HC.company.market.list.reduce((a, l) => (!a || l.price / l.list < a.price / a.list ? l : a), null);
      if (HC.company.market.at > 24 * 60 + 8 * 60 + 5 && best) HC.Game.toast(`New used listings: ${nameOf(best.k)} for ${HC.money(best.price)} (${Math.round((1 - best.price / best.list) * 100)}% off new). Shop > Used.`, 'call');
    }
  };

  // the firewood stand: drive-by customers buy a bundle or three now and then, more around midday and late afternoon
  let standAcc = 0;
  const baseUpd = HC.Game.update;
  HC.Game.update = function (dt) {
    baseUpd.apply(this, arguments);
    const S = HC.session, C = HC.company;
    if (!S || S.preview || S.paused || (HC.Net && HC.Net.role === 'guest')) return;
    standAcc += dt;
    if (standAcc < 5) return; // every 5 game minutes
    standAcc = 0;
    const st = C.stand, owned = (HC.world.yards.find((y) => y.id === 'firewood') || {}).owned;
    if (!st || !st.stock || !owned) return;
    const hr = S.time / 60, busy = (hr > 11 && hr < 13.5) || (hr > 15.5 && hr < 17.5) ? 2 : 1;
    if (Math.random() > 0.12 * busy * (S.weather && S.weather.wet ? 0.5 : 1)) return;
    const n = Math.min(st.stock, HC.randi(1, 3)), price = HC.randi(HC.FIREWOOD_STAND[0], HC.FIREWOOD_STAND[1]), pay = n * price;
    st.stock -= n; st.sold = (st.sold || 0) + n; st.earned = (st.earned || 0) + pay;
    C.money += pay; HC.Audio.cash();
    HC.Game.toast(`Firewood stand: a customer bought ${n} bundle${n > 1 ? 's' : ''} for ${HC.money(pay)}. ${st.stock ? st.stock + ' left on the stand.' : 'The stand is sold out.'}`, 'good');
  };

  // the sawmill and the county dump take in whatever is left lying on their pads
  let padAcc = 0;
  const baseUpd2 = HC.Game.update;
  HC.Game.update = function (dt) {
    baseUpd2.apply(this, arguments);
    const S = HC.session;
    if (!S || S.preview || S.paused || (HC.Net && HC.Net.role === 'guest')) return;
    padAcc += dt;
    if (padAcc < 3) return;
    padAcc = 0;
    HC.Game.sweepPads();
  };

  HC.Market = { refresh, buy, minutesLeft, nameOf, priceOf };
})();
