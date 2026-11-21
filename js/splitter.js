// Hollow Creek — a towable 30-ton log splitter: hitch it to any pickup, park it, load logs (grapple, loader, excavator, or by hand),
// and it splits them into firewood on a pile beside it (or into a dump box parked there). Cheaper and slower than the processor.
'use strict';
(() => {
  HC.EQUIP.splitter = { name: 'Log Splitter (30 ton, towable)', short: 'Splitter', move: 'tow', speed: 0, r: 12, mass: 0.4,
    fuelCap: 12, fuelUse: 0.08, work: 0.15, wear: 0.02, price: 2900, repair: 3, start: false,
    help: 'A towable 30-ton log splitter. Hitch it to any pickup (R), park it, then load up to 3 logs: drop them on with a grapple, loader or excavator, or stand beside it on foot and press E to lift a log on by hand. It splits each log into firewood on a pile beside it, or into a dump trailer or truck parked alongside. Slower than the processor, but cheap and it goes anywhere.' };
  HC.TRAILERS.splitter = { name: 'Log splitter', len: 28, r: 12, solid: true };
  HC.BLURB.splitter = 'Towable 30-ton log splitter: firewood anywhere, three logs at a time.';
  const DECK = 3, PER_LOG = 4.2;
  const U = HC.Units, K = U.KINDS;
  const outPt = (g) => ({ x: g.x + Math.cos(g.a + Math.PI / 2) * 18, y: g.y + Math.sin(g.a + Math.PI / 2) * 18 }); // the splits fall off the side
  K.splitter = {
    update(u, dt, S) {
      u.deck = u.deck || [];
      u.working = false;
      const towing = u.hitch && S.units[u.hitch] && Math.abs(S.units[u.hitch].v || 0) > 2;
      if (!u.deck.length || towing || u.fuel <= 0 || U.cond(u.kind) <= 0) return;
      u.working = true;
      U.burn(u, (HC.EQUIP.splitter.work || 0.15) * dt); U.wear(u, HC.EQUIP.splitter.wear * dt);
      u.ram = (u.ram || 0) + dt;
      u.cutT = (u.cutT || 0) + dt * U.condFactor(u.kind);
      if (u.cutT < PER_LOG) return;
      u.cutT = 0; u.ram = 0;
      const log = u.deck.shift(), units = Math.max(2, Math.round((log.size || 1) * 3)), op = outPt(u), dump = U.nearDump(op, S, 30);
      HC.Game.spray(u.x, u.y, 10, op.x, op.y, 2, ['#b58a5a', '#c9a26a', '#9a7048'], units + 1, 0.4);
      for (let i = 0; i < units; i++) {
        const f = { id: HC.uid(), kind: 'firewood', x: op.x, y: op.y, a: 0, size: 1, value: 0 };
        if (dump && dump.load + 1 <= HC.Game.trailerCap(dump)) { dump.cargo.push(f); dump.load += 1; continue; }
        // the halves pop off the wedge and tumble down beside the beam; once they settle they heap up together
        f.x = u.x + Math.cos(u.a + Math.PI / 2) * 8; f.y = u.y + Math.sin(u.a + Math.PI / 2) * 8;
        S.lot.items.push(HC.Physics.launch(f, u.a + Math.PI / 2 + HC.rand(-0.5, 0.5), HC.rand(20, 42), HC.rand(1.2, 2.4)));
      }
      HC.Audio.chip();
    },
    interact(u, S) { if (U.strapToggle && U.strapToggle(u, S)) return; if (U.nearFuel(u, S)) { if (!U.refuel(u)) HC.Game.toast('Tank is full.'); return; } HC.Game.toast(HC.EQUIP.splitter.help); },
    hint(u, S) {
      const n = (u.deck || []).length;
      return `Log splitter: ${n ? `splitting (${n} log(s) on the beam)` : 'beam empty: drop logs on with a grapple, or stand beside it and press E to lift one on'}. ${u.hitch ? 'Unhitch it (R) to run it.' : ''}`;
    },
    canTake: (u) => DECK - (u.deck || []).length,
  };
  HC.splitterNear = (S, p, d) => Object.values(S.units).find((g) => HC.baseOf(g.kind) === 'splitter' && !g.hidden && HC.dist(g.x, g.y, p.x, p.y) < d);

  // on foot: E beside the splitter lifts the nearest log onto the beam
  const baseInteract = U.interact;
  U.interact = function (u, S) {
    if (u && HC.EQUIP[u.kind] && HC.EQUIP[u.kind].move === 'walk' && !(S.saw && S.saw.holder === u.kind)) {
      const sp = HC.splitterNear(S, u, 44);
      if (sp) {
        if ((sp.deck || []).length >= DECK) return HC.Game.toast('The beam is full (3 logs). Let it split those first.');
        const log = S.lot.items.filter((i) => i.kind === 'log' && !i.feedTo && HC.dist(i.x, i.y, u.x, u.y) < 60).sort((a, b) => HC.dist(a.x, a.y, u.x, u.y) - HC.dist(b.x, b.y, u.x, u.y))[0];
        if (!log) return HC.Game.toast('No log within reach. Roll one over (grapple or loader) or bring the splitter to the wood.');
        S.lot.items.splice(S.lot.items.indexOf(log), 1); sp.deck = (sp.deck || []).concat(log);
        HC.Audio.pick(); S.time += 1;
        return HC.Game.toast(`Lifted a log onto the splitter (${sp.deck.length}/${DECK}).`);
      }
    }
    return baseInteract.apply(this, arguments);
  };
  const baseHint = U.hint;
  U.hint = function (u, S) {
    if (u && HC.EQUIP[u.kind] && HC.EQUIP[u.kind].move === 'walk' && !(S.saw && S.saw.holder === u.kind) && HC.splitterNear(S, u, 44)) {
      const sp = HC.splitterNear(S, u, 44), n = (sp.deck || []).length;
      return n >= DECK ? `Splitter beam full (${n}/${DECK}). It's splitting.` : `E: lift the nearest log onto the splitter (${n}/${DECK})`;
    }
    return baseHint.apply(this, arguments);
  };
})();
