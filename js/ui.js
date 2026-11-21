// Hollow Creek — DOM screens: title, phone (job board / shop / company), HUD, minimap, modals
'use strict';
(() => {
  const $ = (id) => document.getElementById(id);
  const esc = HC.esc;
  let screen, hud, tab = 'jobs', hudT = 0, mapT = 0, phoneOpen = false;

  const stars = (n) => {
    let s = '';
    for (let i = 1; i <= 5; i++) s += `<span class="star ${n >= i - 0.25 ? 'on' : n >= i - 0.75 ? 'half' : ''}">★</span>`;
    return `<span class="stars" aria-label="${n.toFixed(1)} of 5 stars">${s}</span>`;
  };
  function show(html, cls = '') { screen.className = 'screen ' + cls; screen.innerHTML = html; screen.hidden = false; }
  function hide() { screen.hidden = true; screen.innerHTML = ''; phoneOpen = false; }
  function bind(sel, fn) {
    screen.querySelectorAll(sel).forEach((el) => el.addEventListener('click', (e) => { HC.Audio.init(); HC.Audio.click(); fn(el, e); }));
  }
  function pauseWorld(p) { if (HC.Net && HC.Net.role && p) { HC.Audio.stopLoops(); return; } if (HC.session) HC.session.paused = p; if (p) HC.Audio.stopLoops(); } // in co-op the world keeps running for everyone while you look at your phone

  // ---------- title (the town idles behind it) ----------
  function title() {
    if (HC.Net && HC.Net.role) { location.reload(); return; } // leaving a co-op game: start clean
    hud.hidden = true;
    const has = HC.Save.has();
    if (!HC.session || !HC.session.preview) { HC.Game.boot(); HC.session.preview = true; HC.session.paused = true; }
    show(`
      <div class="title-card">
        <div class="logo">
          <div class="logo-mark" aria-hidden="true"><span></span><span></span><span></span></div>
          <h1>Hollow Creek</h1>
          <p class="logo-sub">Land &amp; Timber</p>
        </div>
        <p class="version-tag">Version ${esc(HC.VERSION)}</p>
        <p class="tagline">Run a tree and land outfit in a little 3D town. Customers call, you quote the job, drive out, drop the trees clean and haul it all home.</p>
        <div class="btn-row">
          ${has ? `<button class="btn primary" id="b-continue">Continue ${esc((HC.Save.info(HC.Save.slot) || {}).label || 'slot ' + HC.Save.slot)}</button>` : ''}
          <button class="btn ${has ? '' : 'primary'}" id="b-new">Start a new company${has ? '' : ` in slot ${HC.Save.slot}`}</button>
        </div>
        <div id="confirm-new" class="confirm" hidden>
          <p id="confirm-msg">Starting over erases your saved company.</p>
          <button class="btn danger" id="b-new-yes">Erase and start over</button>
          <button class="btn" id="b-new-no">Keep my save</button>
        </div>
        <section class="slots coop-box" aria-label="Co-op">
          <h3>Co-op with friends</h3>
          <p class="small">Host your company (the slot above), and friends join with the room code. Everyone brings their own company: their own yard, machines, jobs and bank, in the same town. In the game, a friend can switch to working for the host's company (shared machines, jobs and bank) and back.</p>
          <div class="coop-row">
            <button class="btn" id="b-host">Host co-op (slot ${HC.Save.slot})</button>
          </div>
          <div class="coop-row">
            <input id="coop-name" type="text" maxlength="16" placeholder="Your name" autocomplete="off">
            <input id="coop-code" type="text" maxlength="8" placeholder="Room code" autocomplete="off">
            <label class="small coop-lbl" for="coop-slot">Bring</label>
            <select id="coop-slot">${Array.from({ length: HC.Save.SLOTS }, (_, i) => { const n = i + 1, inf = HC.Save.info(n); return `<option value="${n}"${n === HC.Save.slot ? ' selected' : ''}>${inf && inf.label ? esc(inf.label) : 'Slot ' + n}: ${inf ? esc(inf.name) + ', day ' + inf.day : 'a new company'}</option>`; }).join('')}</select>
            <button class="btn" id="b-join">Join</button>
          </div>
          <p class="small" id="coop-msg" role="status"></p>
        </section>
        <section class="slots" aria-label="Save slots">
          <h3>Save slots</h3>
          <div class="slot-grid">${Array.from({ length: HC.Save.SLOTS }, (_, i) => slotCard(i + 1)).join('')}</div>
        </section>
        <div class="controls-card">
          <h3>Controls</h3>
          <dl>
            <dt>WASD</dt><dd>Walk or drive</dd>
            <dt>Mouse</dt><dd>Aim the felling direction and tools</dd>
            <dt>Hold click</dt><dd>Cut, buck, grind, mulch, feed, plant</dd>
            <dt>1–9, 0 · [ ]</dt><dd>Switch equipment · cycle through the fleet</dd>
            <dt>E · Q</dt><dd>Interact (grapple, strap down, ride along, refuel, unload) · change tool</dd>
            <dt>R</dt><dd>Hitch or drop a trailer</dd>
            <dt>X</dt><dd>Dump the load from a dump truck or dump trailer, right where you are</dd>
            <dt>T · G</dt><dd>Raise · lower the arms or boom (G on foot: chainsaw)</dd>
            <dt>Shift</dt><dd>Sprint on foot</dd>
            <dt>F</dt><dd>Climb out of a machine, or into the one beside you</dd>
            <dt>G</dt><dd>Pick up or set down the chainsaw</dd>
            <dt>J</dt><dd>Phone: job board, shop, company</dd>
            <dt>Right-drag · wheel</dt><dd>Turn and tilt the camera · zoom</dd>
            <dt>Esc · M</dt><dd>Pause · mute</dd>
          </dl>
        </div>
      </div>`, 'title');
    const go = () => { hide(); HC.Game.boot(); hud.hidden = false; buildHud(); HC.session.paused = false; if (!HC.company.jobsDone && !HC.company.active) intro(); };
    // the confirm box serves "start over" and "delete" for any slot
    let pending = null;
    const ask = (msg, yes, fn) => { pending = fn; $('confirm-msg').textContent = msg; $('b-new-yes').textContent = yes; $('confirm-new').hidden = false; $('confirm-new').scrollIntoView({ block: 'nearest' }); };
    const fresh = (n) => { HC.Save.setSlot(n); HC.Save.reset(); go(); };
    bind('#b-continue', () => { HC.Save.load(); go(); });
    bind('#b-new', () => { if (has) return ask(`Starting over erases the company in slot ${HC.Save.slot}.`, 'Erase and start over', () => fresh(HC.Save.slot)); fresh(HC.Save.slot); });
    bind('#b-new-yes', () => { $('confirm-new').hidden = true; if (pending) pending(); });
    bind('#b-new-no', () => { $('confirm-new').hidden = true; pending = null; });
    const msg = (t) => { const el = $('coop-msg'); if (el) el.textContent = t; else if (t && !/^Connecting/.test(t)) HC.Game.toast(t, 'bad'); };
    bind('#b-host', async () => {
      msg('Opening a room...');
      if (HC.Save.has()) HC.Save.load(); else HC.Save.reset();
      go();
      try { const code = await HC.Net.host(); HC.Game.toast(`Co-op room open. Room code: ${code}. Friends press Join on the title screen and type it in.`, 'good'); }
      catch (e) { HC.Game.toast(e.message || 'Could not open a co-op room.', 'bad'); }
    });
    const joinAs = async (mode) => {
      msg('Connecting...');
      try {
        const n = +$('coop-slot').value || HC.Save.slot;
        HC.Save.setSlot(n); if (HC.Save.has(n)) HC.Save.load(); else HC.Save.reset();
        await HC.Net.join($('coop-code').value, $('coop-name').value.trim() || 'Player', { mode });
        hide(); hud.hidden = false; buildHud(); HC.session.paused = false;
        if (HC.Net.role === 'peer') HC.Game.toast(`Joined ${HC.Net.code} with your own company. Your yard is ${HC.world.yard.name}; your machines are parked there. Press J for your calls.`, 'good');
        else HC.Game.toast(`Working for the host's company. Walk up to a machine and press F; the host's jobs, shop and bank are yours to use.`, 'good');
      } catch (e) { msg(e.message || 'Could not join.'); }
    };
    bind('#b-join', () => joinAs('own'));
    // switching companies in a co-op game reconnects: pick up where we were
    let rj = null;
    try { rj = JSON.parse(sessionStorage.getItem('hcRejoin') || 'null'); sessionStorage.removeItem('hcRejoin'); } catch (e) { rj = null; }
    if (rj) { $('coop-code').value = rj.code || ''; $('coop-name').value = rj.name || ''; if (rj.slot) $('coop-slot').value = String(rj.slot); setTimeout(() => joinAs(rj.mode || 'own'), 300); }
    bind('.slot-play', (el) => { HC.Save.setSlot(+el.dataset.n); HC.Save.load(); go(); });
    bind('.slot-new', (el) => { const n = +el.dataset.n; if (HC.Save.has(n)) return ask(`Start a new company in slot ${n}? Its saved company will be erased.`, 'Erase and start over', () => fresh(n)); fresh(n); });
    bind('.slot-ren', (el) => { const n = +el.dataset.n, cur = (HC.Save.info(n) || {}).label || ''; const v = window.prompt(`Name for slot ${n} (leave blank for "Slot ${n}")`, cur); if (v === null) return; HC.Save.rename(n, v); title(); });
    bind('.slot-del', (el) => { const n = +el.dataset.n; ask(`Delete the company in slot ${n}? This can't be undone.`, 'Delete it', () => { HC.Save.del(n); title(); }); });
  }
  function slotCard(n) {
    const i = HC.Save.info(n), cur = n === HC.Save.slot;
    if (!i) return `<article class="slot-card empty${cur ? ' cur' : ''}"><h4>Slot ${n}</h4><p class="small">Empty</p><button class="btn sm slot-new" data-n="${n}">New company</button></article>`;
    const when = i.savedAt ? new Date(i.savedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
    return `<article class="slot-card${cur ? ' cur' : ''}"><h4>${i.label ? esc(i.label) : `Slot ${n}`}${cur ? ' <span class="chip ok">Last played</span>' : ''}</h4>
      <p class="small slot-sub">${i.label ? `Slot ${n} · ` : ''}${esc(i.name || '')} <button class="link slot-ren" data-n="${n}">Rename</button></p>
      <dl><dt>Bank</dt><dd class="num">${HC.money(i.money)}</dd><dt>Day</dt><dd>${i.day}</dd><dt>Jobs</dt><dd>${i.jobs}${i.rating ? ` · ${i.rating.toFixed(1)}★` : ''}</dd><dt>Fleet</dt><dd>${i.machines} machines</dd></dl>
      ${when ? `<p class="small">Saved ${esc(when)}</p>` : ''}
      <div class="slot-btns"><button class="btn sm primary slot-play" data-n="${n}">Play</button><button class="btn sm slot-new" data-n="${n}">New</button><button class="btn sm danger slot-del" data-n="${n}">Delete</button></div></article>`;
  }

  function intro() {
    pauseWorld(true);
    show(`
      <div class="modal">
        <span class="eyebrow">Day ${HC.company.day} · ${HC.money(HC.company.money)} in the bank</span>
        <h2>${HC.company.jobsDone || Object.keys(HC.company.owned).some((k) => HC.company.owned[k] && k !== 'op' && !HC.EQUIP[k].hidden) ? 'Everything you own is parked in your equipment yard.' : `You have ${HC.money(HC.company.money)} and an empty yard.`}</h2>
        <p>${Object.keys(HC.company.owned).some((k) => HC.company.owned[k] && k !== 'op' && !HC.EQUIP[k].hidden) ? '' : 'Set yourself up first: open the phone (<b>J</b>), go to <b>Shop &amp; yard</b> and buy what you want to start with. A good first kit: a <b>crew truck</b>, an <b>equipment trailer</b>, the <b>mini track loader</b>, a <b>chainsaw</b> and a <b>dump trailer</b>. '}Customers phone in work all day. Press <b>J</b> to read their calls and take a job. Nothing gets to the job unless you take it there:</p>
        <ol class="steps">
          <li>In the truck, back up to the <b>equipment trailer</b> and press <b>R</b> to hitch it.</li>
          <li>Drive the <b>mini track loader</b> up onto the deck, stop, and press <b>E</b> to strap it down.</li>
          <li>Buy a <b>chainsaw</b> in the shop (J). It rides with you; climb out on site (<b>F</b>) and press <b>G</b> to pick it up.</li>
          <li>Drive to the orange pin. Press <b>R</b> to drop the trailer (the ramps come down), then walk to the mini loader, <b>F</b> to climb in, and <b>E</b> to unstrap it.</li>
        </ol>
        <p>Logs and brush go in the <b>dump trailer</b>; logs sell at the <b>sawmill</b>, brush and stumps go to the <b>county brush dump</b> (press <b>E</b> there). Your yard has a debris storage area if you just want it off the job. Bigger machines and trucks are in the shop.</p>
        <button class="btn primary" id="i-go">${ownsNothing() ? 'Go shopping' : 'Open the phone'}</button>
      </div>`, 'dim');
    bind('#i-go', () => { hide(); phone(ownsNothing() ? 'shop' : 'jobs'); });
  }

  // ---------- phone: jobs / shop / company ----------
  function header() {
    const C = HC.company, r = HC.Co.rating(), tier = HC.TIERS[HC.Co.tier()];
    return `
      <header class="hub-head">
        <div class="hub-brand"><h2>Hollow Creek <span>Land &amp; Timber</span></h2>
          <p>Day ${C.day} · ${HC.clock(HC.session ? HC.session.time : C.minute)} · ${esc(tier.name)} work</p></div>
        <div class="hub-stats">
          <div class="stat"><span class="lbl">Bank</span><span class="num ${C.money < 0 ? 'neg' : ''}">${HC.money(C.money)}</span></div>
          <div class="stat"><span class="lbl">Rating</span><span>${stars(r)} <span class="num sm">${r.toFixed(1)}</span></span></div>
          <div class="stat"><span class="lbl">Jobs done</span><span class="num">${C.jobsDone}</span></div>
        </div>
      </header>
      <nav class="tabs">
        <button class="tab ${tab === 'jobs' ? 'on' : ''}" data-tab="jobs">Calls &amp; jobs</button>
        <button class="tab ${tab === 'shop' ? 'on' : ''}" data-tab="shop">Shop &amp; yard</button>
        <button class="tab ${tab === 'co' ? 'on' : ''}" data-tab="co">Company</button>
        <span class="tab-spacer"></span>
        <button class="btn sm" id="b-save">Save</button>
        <button class="btn sm primary" id="b-close">Back to work (J)</button>
      </nav>`;
  }

  // camera mode: Auto, Follow behind, Free, Overhead
  function cycleCam() {
    const C = HC.company; C.prefs = C.prefs || {};
    C.prefs.cam = HC.CAM_ORDER[(HC.CAM_ORDER.indexOf(HC.camMode()) + 1) % HC.CAM_ORDER.length];
    if (HC.camMode() !== 'top' && HC.input.camPitch > 1.45) HC.input.camPitch = 0.92;
    HC.Save.save();
    return HC.CAM_MODES[C.prefs.cam];
  }
  function jobCard(j) {
    const C = HC.company, jt = HC.JOBS[j.type], tr = HC.TIERS[j.tier];
    const missing = j.needs.filter((k) => !HC.ownsKind(k));
    const locked = j.tier > HC.Co.tier(); // re-checked every time: it unlocks as soon as you qualify
    if (!locked) j.locked = false;
    const busy = !HC.canTakeAnother();
    let action;
    if (j.lost) action = '<p class="lock">They went with another outfit.</p>';
    else if (locked) action = `<p class="lock">Needs a ${tr.minRating.toFixed(1)}★ rating and ${tr.minJobs} jobs done</p>`;
    else if (missing.length) action = `<p class="lock">You need: ${missing.map((k) => esc(HC.needLabel(k))).join(' and ')}</p>`;
    else if (busy) action = `<p class="lock">${C.active && C.queued ? 'You have two jobs going. Finish one first.' : 'Finish your current job first (hired help lets you take a second).'}</p>`;
    else action = `<div class="job-actions"><button class="btn primary take" data-job="${j.id}">Accept ${HC.money(j.pay)}</button>
      ${j.countered ? '' : `<button class="btn counter" data-job="${j.id}" title="${HC.Game.counterOdds()}% chance they agree at your rating">Counter at ${HC.money(Math.round(j.pay * 1.2 / 10) * 10)}</button>`}</div>`;
    return `
      <article class="job ${j.lost || locked || missing.length ? 'disabled' : ''}" style="--jc:${jt.color}">
        <div class="job-top"><span class="job-type">${esc(jt.name)}</span><span class="job-no">WO-${1000 + (j.id % 9000)}</span></div>
        <h3>${esc(j.client)}</h3>
        <p class="addr">${esc(j.address)}</p>
        <blockquote class="request">“${esc(j.request || jt.blurb)}”</blockquote>
        <p class="blurb">${esc(j.summary)}.</p>
        <dl class="job-facts">
          <dt>Offer</dt><dd class="num">${HC.money(j.pay)}${j.raised ? ' <span class="chip ok">agreed</span>' : ''}</dd>
          <dt>Par time</dt><dd class="num">${HC.dur(j.par)}</dd>
          <dt>Lot</dt><dd>${esc(tr.name)}</dd>
        </dl>
        ${HC.jobMaterials && HC.jobMaterials(j).length ? `<p class="disposal"><b>Buy &amp; bring from the landscape supply:</b> ${HC.jobMaterials(j).map((m) => esc(m.text)).join(', ')} (about ${HC.money(HC.jobMaterials(j).reduce((a, m) => a + m.cost, 0))}, built into the price).</p>` : ''}
        ${jt.disposal ? `<p class="disposal"><b>Debris:</b> ${esc(HC.DISPOSAL[jt.disposal].text)}</p>` : ''}
        <p class="needs">Needs: ${j.needs.map((k) => `<span class="chip ${HC.ownsKind(k) ? 'ok' : 'no'}">${esc(HC.ownsKind(k) && !C.owned[k] && k === 'skid' ? 'Skid/Mini' : HC.EQUIP[k].short)}</span>`).join(' ')}</p>
        ${action}
      </article>`;
  }

  function jobsTab() {
    const C = HC.company, S = HC.session, w = S.weather;
    let active = '';
    if (C.active) {
      const ob = HC.Game.objectives(S);
      active = `<section class="active-job panel"><div><span class="eyebrow">Current job · ${S.stage === 'travel' ? 'driving out' : 'on site'}</span>
        <h3>${esc(HC.JOBS[C.active.type].name)} for ${esc(C.active.client)}</h3><p>${esc(C.active.address)} · ${HC.money(C.active.pay)} · par ${HC.dur(C.active.par)}${C.active.due ? ` · <b>due ${esc(HC.dueText(C.active))}</b>` : ''}</p></div>
        <div class="btn-row"><button class="btn ${ob.complete ? 'primary' : 'danger'}" id="b-invoice">${ob.complete ? 'Send the invoice' : 'Invoice now (unfinished work pays less)'}</button></div></section>`;
      if (C.queued) active += `<section class="active-job panel"><div><span class="eyebrow">On hold · second job</span>
        <h3>${esc(HC.JOBS[C.queued.type].name)} for ${esc(C.queued.client)}</h3><p>${esc(C.queued.address)} · ${HC.money(C.queued.pay)} · <b>due ${esc(HC.dueText(C.queued))}</b>. Drive onto the property and it becomes your current job.</p></div>
        <div class="btn-row"><button class="btn" id="b-switch">Work this one now</button></div></section>`;
    }
    const board = (C.board || []);
    const cons = (C.contracts || []).filter((c) => c.status !== 'closed');
    const conCard = (c) => {
      const pr = HC.Storms.progress(c);
      const body = c.status === 'bidding' ? `<p>${c.n} trees down across the road, plus limbs. State estimate ${HC.money(c.fair)}. Bids close at ${HC.clock(c.bidBy)}. Lowest bid wins.</p>
          <div class="bid-row"><input class="bid-in" type="number" min="0" step="50" value="${c.fair}" aria-label="Your bid" data-id="${c.id}"><button class="btn primary bid" data-id="${c.id}">Submit bid</button></div>`
        : c.status === 'won' ? `<p>Yours at ${HC.money(c.pay)}. Trees cleared ${pr.gone}/${pr.n}${pr.debris ? `, ${pr.debris} piece(s) of wood still on the road` : ''}. Due by ${HC.clock(c.due)}.</p>`
        : c.status === 'paid' ? `<p>Done and paid: ${HC.money(c.pay)}.</p>` : `<p>${esc(c.rivalName)} got it at ${HC.money(c.rival)}${c.bid ? ` (you bid ${HC.money(c.bid)})` : ''}.</p>`;
      return `<article class="job contract" style="--jc:#3c5a7a"><div class="job-top"><span class="job-type">State DOT · storm cleanup</span><span class="job-no">${esc(c.road)}</span></div>${body}</article>`;
    };
    const booked = HC.Net && HC.Net.role && HC.Net.booked ? HC.Net.booked() : [];
    const bookedSec = booked.length && HC.Net.role ? `<section class="contracts"><h3 class="sec">Booked in town</h3><div class="jobs">${booked.map((j) => `<article class="job disabled" style="--jc:${(HC.JOBS[j.type] || {}).color || '#888'}"><div class="job-top"><span class="job-type">${esc((HC.JOBS[j.type] || {}).name || j.type)}</span><span class="job-no">${esc(j.who)}</span></div><h3>${esc(j.client)}</h3><p class="addr">${esc(j.address || '')} · ${HC.money(j.pay || 0)}${j.due ? ' · due ' + esc(HC.dueText(j)) : ''}</p><p class="lock">Booked by ${esc(j.who)}</p></article>`).join('')}</div></section>` : '';
    const conSec = cons.length ? `<section class="contracts"><h3 class="sec">State storm contracts</h3><div class="jobs">${cons.map(conCard).join('')}</div></section>` : '';
    return `${active}${bookedSec}${conSec}
      <div class="board-note"><strong>Forecast:</strong> ${esc(w.name)}. ${esc(w.note || '')} New customers call in through the day.</div>
      <div class="jobs">${board.length ? board.map(jobCard).join('') : '<p class="empty">No calls right now. Give it an hour.</p>'}</div>`;
  }

  let shopCat = 'machines';
  // the landscape supply: sod, shrubs and pavers come on pallets (forks), mulch is bulk (grapple or loader); all picked up at the store
  function supplySec() {
    const C = HC.company, sp = HC.world.supply;
    const pal = Object.entries(HC.PALLETS || {}).map(([m, P]) => `<article class="shop-item"><h4>${esc(P.name)} pallet</h4><p>${esc(P.blurb)}</p>
      <div class="buy-row"><button class="btn buy-pal" data-m="${m}" ${C.money < P.price ? 'disabled' : ''}>Buy a pallet ${HC.money(P.price)}</button></div></article>`).join('');
    const mul = `<article class="shop-item"><h4>Bulk mulch</h4><p>Dark hardwood mulch by the load unit (one unit mulches one bed tile). It's heaped in the pickup area: load it with a grapple or loader into a dump trailer or truck.</p>
      <div class="buy-row">${[1, 5, 10].map((n) => `<button class="btn buy-mulch" data-n="${n}" ${C.money < n * HC.MULCH_BUY ? 'disabled' : ''}>${n} unit${n > 1 ? 's' : ''} ${HC.money(n * HC.MULCH_BUY)}</button>`).join('')}</div></article>`;
    const waiting = (HC.Landscape ? HC.Landscape.list() : []).filter((p) => !p.ride && sp && HC.inRect(p.x, p.y, sp.pickup));
    return `<p class="small cat-note">Everything you buy here waits in the pickup area at ${esc(sp ? sp.name : 'the landscape supply')}. Pallets need <b>pallet forks</b> (skid steer, mini skid or tractor) and ride on a <b>flat deck trailer</b> or a <b>flatbed pickup</b>. Bulk mulch loads with a <b>grapple</b> or loader into a dump trailer or truck. On the job, park it near the marked tiles, climb out and hold click on each tile.${waiting.length ? ` Waiting for pickup: ${waiting.map((p) => HC.PALLETS[p.mat].name.toLowerCase()).join(', ')}.` : ''}</p><div class="shop-grid">${pal}${mul}</div>`;
  }
  function shopTab() {
    const C = HC.company, S = HC.session;
    const card = (k) => {
      const e = HC.EQUIP[k], own = C.owned[k];
      const count = Object.keys(HC.EQUIP).filter((q) => (q === k || HC.EQUIP[q].base === k) && C.owned[q]).length;
      const again = own && (!e.noUnit || e.attachTo);
      const attN = e.attachTo && own ? (HC.session.attachments || []).filter((a) => a.kind === k).length : 0;
      const img = e.noUnit && !e.attachTo ? '' : HC.Render.thumb(k, false);
      return `<article class="shop-item">${img ? `<img class="thumb" src="${img}" alt="${esc(e.name)}">` : ''}<h4>${esc(e.name)}${e.heavy ? ' <span class="role">Heavy</span>' : ''}</h4>
        <p>${esc(HC.BLURB[k] || e.help)}</p>${HC.BLURB[k] ? `<details class="how"><summary>How to use</summary>${esc(e.help)}</details>` : ''}
        <div class="buy-row">${own ? `<span class="chip ok">Owned${count > 1 ? ' ×' + count : ''}</span>` : ''}${!own ? `<button class="btn buy-eq" data-k="${k}" ${C.money < e.price ? 'disabled' : ''}>Buy ${HC.money(e.price)}</button>` : again ? `<button class="btn ${e.attachTo ? 'buy-att' : 'buy-more'}" data-k="${k}" ${C.money < e.price ? 'disabled' : ''}>Buy another ${HC.money(e.price)}</button>${attN > 1 ? `<span class="small">You have ${attN}</span>` : ''}` : ''}</div></article>`;
    };
    const keys = Object.keys(HC.EQUIP).filter((k) => HC.EQUIP[k].price && (!HC.EQUIP[k].base || HC.EQUIP[k].shop));
    const eq = keys.filter((k) => HC.EQUIP[k].move !== 'car').map(card).join('');
    const trucks = keys.filter((k) => HC.EQUIP[k].move === 'car').map(card).join('');
    C.trailers = C.trailers || { equip: true, dump: true };
    HC.TRAILERS.equip.price = HC.TRAILERS.equip.price || 4500; HC.TRAILERS.dump.price = HC.TRAILERS.dump.price || 2400;
    const trl = ['equip', 'dump', 'dump18', 'gndump', 'gnflat', 'deckover', 'lowboy', 'logtrailer'].filter((id) => HC.TRAILERS[id] && HC.TRAILERS[id].price).map((id) => {
      const t = HC.TRAILERS[id], own = C.trailers[id], tcount = Object.keys(C.trailers).filter((q) => C.trailers[q] && HC.trailerKindOf(q) === id).length;
      const desc = id === 'equip' ? '20 ft tandem-axle trailer with ramps. Carries two small machines (mini loader, skid steer, grinder, mower, mini excavator, tractor).' : id === 'dump' ? '14 ft dump trailer for logs, brush, rock and stumps (12 units).' : id === 'logtrailer' ? 'A spread-axle log trailer with four bunks for the semi (40 units, logs only). Load it with the excavators, forwarder or grapple; unload it at the log pad.' : id === 'dump18' ? '16 ft tandem-axle dump trailer: 18 units of logs, brush, rock or stumps. Any pickup pulls it.' : id === 'gndump' ? '20 ft gooseneck dump with 4 ft high sides on tandem duals (26 units, 8 t). When it\'s empty, the ramps slide out from under the box and up to two small machines (skid steer, mini, mower, tractor) drive right in. Pulled by the flatbed pickups and the dually.' : id === 'gnflat' ? '40 ft gooseneck flat deck on three axles with a dovetail and slide-out ramps. Three small machines (skid steers, minis, mowers), or one up to 9 t plus a small one. Pulled by the flatbed pickups and the dually.' : id === 'deckover' ? '25 ft heavy-duty deck-over on tandem dual axles with fold-up ramps. Two small machines, or one mid-size machine up to 9 t (the compact dozer). Any truck can tow it.' : id === 'lowboy' ? 'Low deck for heavy machines: the excavator, big dozer, harvester, forwarder, loader or tracked mulcher, plus a small machine if there\'s no heavy one. The semi or heavy-haul tractor pulls it.' : 'A second dump trailer, so one can be loading on site while the other runs to the pad.';
      const img = HC.Render.thumb(id, true);
      return `<article class="shop-item">${img ? `<img class="thumb" src="${img}" alt="${esc(t.name)}">` : ''}<h4>${esc(t.name)}</h4><p>${desc}</p>
        <div class="buy-row">${own ? `<span class="chip ok">Owned${tcount > 1 ? ' ×' + tcount : ''}</span>` : ''}<button class="btn buy-tr" data-id="${id}" ${C.money < t.price ? 'disabled' : ''}>${own ? 'Buy another' : 'Buy'} ${HC.money(t.price)}</button></div></article>`;
    }).join('');
    const q = HC.world.quarry;
    const quarryCard = q && !q.owned ? `<article class="shop-item"><h4>${esc(q.name)}</h4><p>A working gravel quarry up past Fox Run. Own it and every rock you haul to its sales pad sells for ${HC.money(HC.ROCK_PRICE)} instead of costing a dump fee.</p>
      <button class="btn buy-quarry" ${C.money < q.price ? 'disabled' : ''}>Buy ${HC.money(q.price)}</button></article>` : '';
    const lvl = C.yardLevel || 1;
    const EXP = { 2: { price: 12000, text: 'Push the equipment compound east onto the lot next door: more gravel, a longer fence, an enclosed storage barn and four more trailer bays (room for the lowboy and log trailer).' },
      3: { price: 22000, text: 'Add a lean-to equipment shed off the storage barn with five more covered machine bays.' } };
    const expCard = lvl < 3 && HC.world.yard.id === 'hq' ? `<article class="shop-item"><h4>Home Yard expansion <span class="lvl">${'■'.repeat(lvl)}${'□'.repeat(3 - lvl)}</span></h4><p>${EXP[lvl + 1].text}</p>
      <button class="btn buy-exp" ${C.money < EXP[lvl + 1].price ? 'disabled' : ''}>Level ${lvl + 1}: ${HC.money(EXP[lvl + 1].price)}</button></article>` : '';
    const homeCards = HC.Homes ? HC.Homes.listed().map((L) => { const mineH = C.home === L.parcel, old = HC.Homes.mine(), net = L.price - (old ? Math.round(old.price * 0.85) : 0);
      return `<article class="shop-item"><h4>${esc(L.name)} <span class="role">${esc(L.address)}</span></h4><p>${esc(L.blurb)} Walk up to the front door and press E to go inside and sleep.</p>${mineH ? '<span class="chip ok">Your home</span>' : `<button class="btn buy-home" data-id="${L.parcel}" ${C.money < net ? 'disabled' : ''}>Buy ${HC.money(L.price)}${old ? ` (${HC.money(net)} after selling yours)` : ''}</button>`}</article>`; }).join('') : '';
    const yards = homeCards + expCard + quarryCard + HC.world.yards.filter((y) => !y.owned && !y.coop).map((y) => `<article class="shop-item"><h4>${esc(y.name)}</h4><p>${y.id === 'firewood' ? 'Out on Hemlock Hollow Rd: a fenced yard with a permanent firewood processor, a roadside firewood stand, debris storage, parking bays and a fuel pump. Bring logs, run them through the processor, and stock the stand.' : 'A fenced equipment yard with a pole shed, parking bays and a fuel pump on Fox Run, across town. Park, fuel and repair equipment there.'}</p>
      <button class="btn buy-yard" data-id="${y.id}" ${C.money < y.price ? 'disabled' : ''}>Buy ${HC.money(y.price)}</button></article>`).join('');
    const trade = HC.Game.sawTrade();
    const saws = Object.keys(HC.CHAINSAWS).map((id) => {
      const c = HC.CHAINSAWS[id], mine = C.owned.saw && C.sawKind === id, cost = c.price - trade;
      const img = HC.Render.thumb('saw:' + id, false);
      return `<article class="shop-item">${img ? `<img class="thumb" src="${img}" alt="${esc(c.name)}">` : ''}<h4>${esc(c.name)} <span class="role">${esc(c.spec)}</span></h4><p>${esc(c.desc)}</p>
        <div class="buy-row">${mine ? `<span class="chip ok">Your saw${(C.sawCount || 1) > 1 ? ' ×' + C.sawCount : ''}</span><button class="btn buy-saw2" ${C.money < c.price ? 'disabled' : ''}>Buy another ${HC.money(c.price)}</button>` : `<button class="btn buy-saw" data-id="${id}" ${C.money < cost ? 'disabled' : ''}>Buy ${HC.money(c.price)}${trade ? ` (${HC.money(cost)} with trade-in)` : ''}</button>`}</div></article>`;
    }).join('');
    const up = Object.keys(HC.UPGRADES).map((id) => {
      const u = HC.UPGRADES[id], lv = HC.Co.level(id), max = u.prices.length, price = u.prices[lv];
      const need = u.needs && !C.owned[u.needs];
      return `<article class="shop-item"><h4>${esc(u.name)} <span class="lvl">${'■'.repeat(lv)}${'□'.repeat(max - lv)}</span></h4><p>${esc(u.desc)}</p>
        ${lv >= max ? '<span class="chip ok">Maxed</span>' : need ? `<span class="chip no">Needs ${esc(HC.EQUIP[u.needs].short)}</span>` : `<button class="btn buy-up" data-id="${id}" ${C.money < price ? 'disabled' : ''}>Level ${lv + 1}: ${HC.money(price)}</button>`}</article>`;
    }).join('');
    const crew = Object.keys(HC.CREW).map((id) => {
      const c = HC.CREW[id], hired = C.crew[id];
      return `<article class="shop-item"><h4>${esc(c.name)} <span class="role">${esc(c.role)}</span></h4><p>${esc(c.desc)} Wage ${HC.money(c.wage)}/day.</p>
        ${hired ? `<button class="btn ghost-dark fire" data-id="${id}">Let go</button>` : `<button class="btn hire" data-id="${id}" ${C.money < c.hire ? 'disabled' : ''}>Hire (${HC.money(c.hire)} signing)</button>`}</article>`;
    }).join('');
    let repairAll = 0, fuelAll = 0;
    const rows = Object.keys(HC.EQUIP).filter((k) => C.owned[k] && !HC.EQUIP[k].noUnit && !HC.EQUIP[k].hidden).map((k) => {
      const cost = Math.round((100 - C.cond[k]) * (HC.EQUIP[k].repair || 3));
      const u = S && S.units[k];
      const fuel = u && HC.EQUIP[k].fuelCap && inYard(k) ? Math.max(0, HC.Units.fuelCap(k) - u.fuel) * HC.FUEL_PRICE : 0;
      const here = inYard(k);
      if (here) repairAll += cost;
      fuelAll += fuel;
      const where = here ? '' : `<span class="chip no">${u && u.boarded ? 'In a truck' : 'Not in a yard'}</span>`;
      const sellable = HC.EQUIP[k].move !== 'walk' && k !== 'saw' && !HC.EQUIP[HC.baseOf(k)].fixed; // the firewood processor is part of its yard
      const dead = HC.isDead && HC.isDead(k), meter = HC.hoursText && HC.EQUIP[k].fuelCap && HC.EQUIP[k].move !== 'walk' ? `<br><span class="small${HC.wornOut(k) ? ' warn-t' : ''}">${HC.hoursText(k)}${HC.wornOut(k) && !dead ? ' · worn out' : ''}</span>` : '';
      const wearBtns = dead ? `<span class="chip no">Worn out: won't run</span> ${here ? `<button class="btn sm wear-oh" data-k="${k}" ${C.money < HC.overhaulCost(k) ? 'disabled' : ''}>Overhaul ${HC.money(HC.overhaulCost(k))}</button>` : `<button class="btn sm wear-haul" data-k="${k}">Rollback home ${HC.money(HC.HAUL_FEE(k))}</button>`} <button class="btn sm ghost-dark wear-scrap" data-k="${k}">Scrap ${HC.money(HC.scrapValue(k) - (HC.Wear.atScrapyard(u) ? 0 : HC.HAUL_FEE(k)))}</button>`
        : u && u.broken && !here ? ` <button class="btn sm wear-haul" data-k="${k}">Rollback home ${HC.money(HC.HAUL_FEE(k))}</button>` : '';
      if (dead) return `<tr><td>${esc(HC.EQUIP[k].name)}${meter}</td><td><div class="bar"><i style="width:0%"></i></div></td><td class="num">0%</td><td colspan="2">${wearBtns}</td></tr>`;
      return `<tr><td>${k === 'saw' ? 'Chainsaw' : esc(HC.EQUIP[k].name)}${meter}</td><td><div class="bar"><i style="width:${C.cond[k]}%;background:${C.cond[k] < 30 ? '#d9483b' : '#4f9a3c'}"></i></div></td>
        <td class="num">${Math.round(C.cond[k])}%</td><td>${HC.serviceDue && HC.serviceDue(k) ? (here ? `<button class="btn sm svc" data-k="${k}" ${C.money < HC.serviceCost(k) ? 'disabled' : ''}>Oil &amp; grease ${HC.money(HC.serviceCost(k))}</button> ` : '<span class="chip warn">Service due</span> ') : ''}${HC.EQUIP[k] && HC.session && HC.session.units[k] && HC.session.units[k].broken ? '<span class="chip no">Broken down</span> ' + wearBtns + ' ' : ''}${!cost ? '<span class="chip ok">Good</span>' : here ? `<button class="btn sm repair" data-k="${k}" ${C.money < cost ? 'disabled' : ''}>Fix ${HC.money(cost)}</button>` : where}</td>
        <td>${!sellable ? '' : S && S.active === k ? '<span class="chip no">You\'re in it</span>' : u && u.on ? '<span class="chip no">On a trailer</span>' : here ? `<button class="btn sm ghost-dark sell-u" data-k="${k}">Sell ${HC.money(HC.Game.resaleValue(k))}</button>` : '<span class="chip no">Park it at your yard to sell</span>'}</td></tr>`;
    }).join('') + (C.owned.saw && S && S.saw ? (() => {
      const k = 'saw', cost = Math.round((100 - C.cond[k]) * (HC.EQUIP[k].repair || 3)), here = inYard(k);
      if (here) { repairAll += cost; fuelAll += Math.max(0, HC.Units.SAW_CAP - S.saw.fuel) * HC.FUEL_PRICE; }
      return `<tr><td>Chainsaw (${esc(HC.sawSpec().name.toLowerCase())})</td><td><div class="bar"><i style="width:${C.cond[k]}%;background:${C.cond[k] < 30 ? '#d9483b' : '#4f9a3c'}"></i></div></td>
        <td class="num">${Math.round(C.cond[k])}%</td><td>${!cost ? '<span class="chip ok">Good</span>' : here ? `<button class="btn sm repair" data-k="${k}" ${C.money < cost ? 'disabled' : ''}>Fix ${HC.money(cost)}</button>` : '<span class="chip no">Not in a yard</span>'}</td><td></td></tr>`;
    })() : '');
    const tools = keys.filter((k) => !HC.EQUIP[k].move);
    HC.Market.refresh();
    const ml = (C.market && C.market.list) || [], left = HC.Market.minutesLeft();
    const usedCard = (L) => {
      const tr = L.k.startsWith('tr:'), img = HC.Render.thumb(tr ? L.k.slice(3) : L.k, tr), off = Math.round((1 - L.price / L.list) * 100);
      return `<article class="shop-item used${L.sold ? ' sold' : ''}">${img ? `<img class="thumb" src="${img}" alt="">` : ''}<h4>${esc(HC.Market.nameOf(L.k))} <span class="role">${off}% off</span></h4>
        <p>${tr ? 'Used, sound deck and tyres.' : `${L.years} yr old · ${L.hours ? Math.round(L.hours).toLocaleString() + ' h · ' : ''}condition ${L.cond}%`}<br><span class="small">${esc(L.seller)}</span></p>
        ${tr ? '' : `<div class="bar"><i style="width:${L.cond}%;background:${L.cond < 45 ? '#d9483b' : L.cond < 70 ? '#e0a82e' : '#4f9a3c'}"></i></div>`}
        <div class="buy-row">${L.sold ? '<span class="chip ok">Sold</span>' : `<button class="btn buy-used" data-id="${L.id}" ${C.money < L.price ? 'disabled' : ''}>Buy ${HC.money(L.price)}</button><span class="small was">new ${HC.money(L.list)}</span>`}</div></article>`;
    };
    const usedSec = `<p class="small cat-note">Second-hand machines, trucks and trailers. They're cheaper, but come worn: the shop can repair them. New listings in ${Math.floor(left / 60)}h ${Math.round(left % 60)}m.</p><div class="shop-grid">${ml.map(usedCard).join('') || '<p class="empty">Nothing listed right now.</p>'}</div>`;
    const CATS = [
      ['used', `Used (${ml.filter((l) => !l.sold).length})`, usedSec],
      ['machines', 'Machines', `<div class="shop-grid">${keys.filter((k) => HC.EQUIP[k].move && HC.EQUIP[k].move !== 'car' && HC.EQUIP[k].move !== 'walk').map(card).join('')}</div>`],
      ['trucks', 'Trucks', `<div class="shop-grid">${trucks}</div>`],
      ['trailers', 'Trailers', `<div class="shop-grid">${trl}</div>`],
      ['tools', 'Chainsaws & attachments', `<p class="small cat-note">${C.owned.saw ? 'Buy another of your saw so more than one of you can cut (co-op). Switching to a different model trades in your saws (40% of what one cost).' : 'You need a chainsaw to fell and buck trees. Climb out of the truck (F), then G picks it up.'}</p><div class="shop-grid">${saws}${tools.map(card).join('')}</div>`],
      ['supply', 'Landscape supply', supplySec()],
      ['upgrades', 'Upgrades', `<div class="shop-grid">${up}</div>`],
      ['property', 'Homes & yards', yards ? `<div class="shop-grid">${yards}</div>` : '<p class="empty">You own every yard.</p>'],
      ['crew', 'Hire help', `<div class="shop-grid">${keys.filter((k) => HC.EQUIP[k].move === 'walk').map(card).join('')}${crew}</div>`],
      ['fleet', 'My equipment', null],
    ];
    if (!CATS.some((c) => c[0] === shopCat)) shopCat = 'machines';
    const bar = `<nav class="shop-cats" aria-label="Shop sections">${CATS.map(([id, label]) => `<button class="shop-cat ${id === shopCat ? 'on' : ''}" data-cat="${id}">${label}</button>`).join('')}</nav>`;
    if (shopCat !== 'fleet') return bar + CATS.find((c) => c[0] === shopCat)[2];
    return bar + `

      <section class="panel services"><h3>Yard services</h3>
        <p class="small">The shop can only fix and fuel equipment parked at a yard you own. The chainsaw counts as in the yard when it's there with you.</p>
        <table class="eq">${rows}</table>
        <div class="btn-row left">
          <button class="btn" id="b-repair-all" ${!repairAll || C.money < repairAll ? 'disabled' : ''}>Repair everything ${HC.money(repairAll)}</button>
          <button class="btn" id="b-fuel-all" ${fuelAll < 1 || C.money < fuelAll ? 'disabled' : ''}>Top off all fuel ${HC.money(fuelAll)}</button>
        </div></section>
      ${sellExtras()}
      <section class="panel codes"><h3>Codes</h3>
        <form id="code-form" class="code-row" autocomplete="off">
          <label for="code-in" class="small">Have a code? Enter it to unlock stuff instantly.</label>
          <div class="code-inputs"><input id="code-in" name="code" type="text" spellcheck="false" placeholder="Enter code"><button class="btn" type="submit">Redeem</button></div>
        </form></section>`;
  }

  // trailers and attachments you can sell (parked at a yard you own)
  function sellExtras() {
    const C = HC.company, S = HC.session;
    if (!S) return '';
    const rows = [];
    for (const t of S.trailers) {
      if (HC.Units.isBed(t) || (HC.EQUIP[t.kind] && HC.EQUIP[t.kind].move === 'tow') || !C.trailers[t.id]) continue;
      const here = !!HC.World.yardAt(t.x, t.y);
      rows.push(`<tr><td>${esc(HC.TRAILERS[t.kind].name)}${t.id.includes('_') ? ' #' + t.id.split('_').pop() : ''}</td><td>${here ? `<button class="btn sm ghost-dark sell-t" data-id="${t.id}">Sell ${HC.money(HC.Game.trailerResale(t.id))}</button>` : '<span class="chip no">Not in a yard</span>'}</td></tr>`);
    }
    for (const a of S.attachments || []) {
      if (!HC.EQUIP[a.kind] || !HC.EQUIP[a.kind].attachTo || !C.owned[a.kind]) continue;
      rows.push(`<tr><td>${esc(HC.EQUIP[a.kind].name)}${a.id.includes('_') ? ' #' + a.id.split('_').pop() : ''}</td><td><button class="btn sm ghost-dark sell-a" data-k="${a.id}">Sell ${HC.money(HC.Game.resaleValue(a.kind))}</button></td></tr>`);
    }
    return rows.length ? `<section class="panel services"><h3>Sell trailers &amp; attachments</h3><p class="small">Resale is about half the new price. Press Sell, then Confirm.</p><table class="eq">${rows.join('')}</table></section>` : '';
  }
  // two-step sell buttons: the first press arms it, the second sells
  function armSell(el, go) {
    if (el.dataset.armed) { if (go()) { buildHud(); } phone(); return; }
    el.dataset.armed = '1'; el.textContent = 'Confirm sell?'; el.classList.add('warn');
  }
  function inYard(k) {
    const S = HC.session, u = S && S.units[k];
    if (k === 'saw' && S && S.saw) { const p = HC.Units.sawPos(S), h = S.saw.holder && S.units[S.saw.holder]; return !(h && h.boarded) && !!HC.World.yardAt(p.x, p.y); }
    if (!u || u.boarded) return false;
    if (u.on) { const t = S.trailers.find((q) => q.id === u.on.id); return !!HC.World.yardAt(t.x, t.y); }
    return !!HC.World.yardAt(u.x, u.y);
  }

  // cheat / test codes typed into the shop
  const CODES = {
    STORM: () => { const n = HC.Storms.storm(true).length; return n ? `A storm just went through: ${n} road(s) blocked. The state is taking bids (J).` : 'The wind blew, but nothing came down.'; },
    BIGBUCKS: () => { HC.company.money += 1000000; HC.Save.save(); return `+${HC.money(1000000)} added to the bank.`; },
    HOLLOWADMIN: () => {
      const C = HC.company;
      for (const k in HC.EQUIP) if (!HC.EQUIP[k].hidden && !HC.EQUIP[k].base && !C.owned[k]) { C.owned[k] = true; C.cond[k] = 100; C.fuel[k] = HC.EQUIP[k].fuelCap || 0; if (!HC.EQUIP[k].noUnit) HC.Game.addUnit(k, true); else if (HC.EQUIP[k].attachTo) HC.Game.addAttachment(k, true); }
      C.trailers = C.trailers || {};
      for (const id of ['equip', 'dump', 'deckover', 'lowboy', 'dump2', 'logtrailer', 'gndump', 'gnflat']) if (!C.trailers[id]) { C.trailers[id] = true; HC.Game.addTrailer(id, true); }
      for (const y of HC.world.yards) { y.owned = true; C.yards[y.id] = true; }
      HC.world.quarry.owned = true; C.yards.quarry = true;
      if ((C.yardLevel || 1) < 3) { C.yardLevel = 3; HC.World.upgradeHQ(HC.world, 3); HC.Render.yardChanged(); }
      for (const id in HC.UPGRADES) C.upgrades[id] = HC.UPGRADES[id].prices.length;
      for (const id in HC.CREW) C.crew[id] = true;
      if (C.sawKind !== 's120') { C.money += 2900; HC.Game.buySaw('s120'); }
      C.ratings = Array(10).fill(5); C.jobsDone = Math.max(C.jobsDone, 10);
      C.money += 250000;
      C.board = HC.Game.makeBoard();
      HC.Save.save();
      return 'Unlocked everything: every machine, truck, trailer, yard, upgrade and crew hire, top-tier work, plus $250,000.';
    },
  };
  function redeem(raw) {
    const code = String(raw || '').trim().toUpperCase().replace(/\s+/g, '');
    if (!code) return 'Type a code first.';
    if (!CODES[code]) return `"${raw.trim()}" isn't a valid code.`;
    const r = CODES[code]();
    return r.startsWith('+') ? r : r.startsWith('Unlocked') ? r : 'Unlocked: ' + r;
  }

  function companyTab() {
    const C = HC.company;
    const hist = C.ratings.slice(-10).map((s) => `<span class="hist">${'★'.repeat(s)}${'☆'.repeat(5 - s)}</span>`).join('') || '<em>No jobs yet</em>';
    return `
      <div class="co-grid">
        <section class="panel"><h3>Ledger</h3><dl class="ledger">
          <dt>Bank balance</dt><dd class="num">${HC.money(C.money)}</dd>
          <dt>Earned from customers</dt><dd class="num">${HC.money(C.stats.earned)}</dd>
          <dt>Damages paid</dt><dd class="num">${HC.money(C.stats.damages)}</dd>
          <dt>Trees felled</dt><dd class="num">${C.stats.trees}</dd>
          <dt>Logs sold</dt><dd class="num">${C.stats.logsSold}</dd>
          <dt>Daily wages</dt><dd class="num">${HC.money(HC.Co.wages())}</dd></dl></section>
        <section class="panel"><h3>Customer ratings</h3><div class="hists">${hist}</div>
          <p class="small">Your rating is the average of your last 10 jobs. A good rating brings bigger customers and makes counter-offers stick.</p>
          <ul class="tiers">${HC.TIERS.map((t, i) => `<li class="${HC.Co.tier() >= i ? 'on' : ''}">${esc(t.name)}: ${t.minRating ? t.minRating.toFixed(1) + '★, ' + t.minJobs + ' jobs' : 'open'}</li>`).join('')}</ul>
        </section>
        <section class="panel"><h3>Game</h3><div class="btn-col">
          <button class="btn" id="b-mute">${HC.Audio.isMuted() ? 'Turn sound on' : 'Mute sound'}</button>
          <button class="btn" id="b-gfx">Graphics: ${({ low: 'Low', high: 'High', ultra: 'Ultra' })[(C.prefs || {}).gfx || 'high']} (tap to change)</button>
          <button class="btn" id="b-cam">Camera: ${esc(HC.CAM_MODES[HC.camMode()].name)} (tap to change, or press C)</button>
          <p class="small">${esc(HC.CAM_MODES[HC.camMode()].text)}</p>
          <button class="btn" id="b-outline">${(C.prefs || {}).outlines ? 'Turn off cartoon outlines' : 'Turn on cartoon outlines'}</button>
          <button class="btn" id="b-ren">Name this save${C.slotName ? `: ${esc(C.slotName)}` : ` (slot ${HC.Save.slot})`}</button>
          <button class="btn" id="b-title">Save and quit to title</button></div><p class="small">Version ${esc(HC.VERSION)}</p></section>
      </div>`;
  }

  // ---------- shop and job actions (run here, or on the host for a co-op friend working for the host's company) ----------
  const repairCost = (k) => Math.round((100 - HC.company.cond[k]) * (HC.EQUIP[k].repair || 3));
  function repairOne(k) {
    const C = HC.company, cost = repairCost(k);
    if (C.money < cost) return false;
    C.money -= cost; C.cond[k] = 100;
    if (HC.session && HC.session.job) HC.session.costs.repairs += cost;
    return true;
  }
  const ACT = {
    '.take'(d) { const C = HC.company, j = (C.board || []).find((x) => x.id === +d.job); if (!j) return null; HC.Game.accept(j); return null; },
    '.counter'(d) {
      const C = HC.company, j = (C.board || []).find((x) => x.id === +d.job);
      if (!j) return null;
      const ok = HC.Game.counter(j);
      if (ok) HC.Audio.cash(); else HC.Audio.deny();
      return ok ? `${j.client} agreed to ${HC.money(j.pay)}.` : `${j.client} said that's too rich and hired someone else.`;
    },
    '#b-invoice'() { HC.Game.finish(); return null; },
    '#b-switch'() { HC.Game.switchJob(); return null; },
    '.bid'(d) { const m = HC.Storms.bid(+d.id, d.amt); HC.Save.save(); return m; },
    '.buy-eq'(d) {
      const C = HC.company, k = d.k, e = HC.EQUIP[k];
      if (!e || C.money < e.price || C.owned[k]) return null;
      C.money -= e.price; C.owned[k] = true; C.cond[k] = 100; C.fuel[k] = e.fuelCap || 0;
      if (!e.noUnit) HC.Game.addUnit(k); else if (e.attachTo) HC.Game.addAttachment(k);
      HC.Audio.cash(); HC.Save.save(); buildHud();
      return `${e.name} bought and parked at your home yard.`;
    },
    '.buy-tr'(d) {
      const C = HC.company, kind = d.id, t = HC.TRAILERS[kind];
      if (!t || C.money < t.price) return null;
      C.money -= t.price;
      const id = HC.Game.buyTrailer(kind);
      HC.Audio.cash(); HC.Save.save();
      return `${t.name}${id !== kind ? ' #' + id.split('_').pop() : ''} bought and parked at your home yard.`;
    },
    '.buy-att'(d) {
      const C = HC.company, e = HC.EQUIP[d.k];
      if (!e || !e.attachTo || C.money < e.price) return null;
      C.money -= e.price; HC.Game.buyAttachment(d.k); HC.Audio.cash(); HC.Save.save();
      return `Another ${e.name.toLowerCase()} delivered to your yard.`;
    },
    '.buy-pal'(d) { return HC.Landscape.buy(d.m); },
    '.buy-mulch'(d) { return HC.Landscape.buyMulch(+d.n); },
    '.buy-more'(d) {
      const C = HC.company, e = HC.EQUIP[d.k];
      if (!e || C.money < e.price) return null;
      C.money -= e.price;
      const key = HC.Game.buyAnother(d.k);
      HC.Audio.cash(); HC.Save.save(); buildHud();
      return `${HC.EQUIP[key].name} bought and parked at your home yard.`;
    },
    '.buy-home'(d) { return HC.Homes.buy(d.id); },
    '.buy-exp'() {
      const C = HC.company, lvl = C.yardLevel || 1, price = { 2: 12000, 3: 22000 }[lvl + 1];
      if (!price || C.money < price) return null;
      C.money -= price; C.yardLevel = lvl + 1;
      HC.World.upgradeHQ(HC.world, C.yardLevel); HC.Render.yardChanged();
      HC.Audio.cash(); HC.Save.save();
      return C.yardLevel === 2 ? 'Yard expanded: bigger compound and four more trailer bays.' : 'Second pole barn is up: five more covered machine bays.';
    },
    '.buy-quarry'() {
      const C = HC.company, q = HC.world.quarry;
      if (C.money < q.price || q.owned) return null;
      C.money -= q.price; q.owned = true; C.yards.quarry = true;
      HC.Audio.cash(); HC.Save.save();
      return `${q.name} is yours. Haul rocks to its sales pad and press E in the truck.`;
    },
    '.buy-yard'(d) {
      const C = HC.company, y = HC.world.yards.find((q) => q.id === d.id);
      if (!y || C.money < y.price) return null;
      C.money -= y.price; y.owned = true; C.yards[y.id] = true;
      if (y.id === 'firewood' && !C.owned.fwproc) { C.owned.fwproc = true; C.cond.fwproc = 100; C.fuel.fwproc = HC.EQUIP.fwproc.fuelCap; HC.Game.addUnit('fwproc', true); } // the processor comes with the yard
      HC.Audio.cash(); HC.Save.save();
      return y.id === 'firewood' ? `${y.name} is yours, firewood processor and roadside stand included. Bring logs to the processor's deck.` : `${y.name} is yours. Park, fuel and repair equipment there.`;
    },
    '.buy-saw'(d) { HC.Game.buySaw(d.id); return null; },
    '.buy-saw2'() { return HC.Game.buyExtraSaw(); },
    '.buy-used'(d) { return HC.Market.buy(d.id); },
    '.buy-up'(d) {
      const C = HC.company, u = HC.UPGRADES[d.id], lv = HC.Co.level(d.id), price = u && u.prices[lv];
      if (price === undefined || C.money < price) return null;
      C.money -= price; C.upgrades[d.id] = lv + 1;
      HC.Audio.cash(); HC.Save.save(); return null;
    },
    '.hire'(d) {
      const C = HC.company, c = HC.CREW[d.id];
      if (!c || C.money < c.hire) return null;
      C.money -= c.hire; C.crew[d.id] = true;
      HC.Audio.cash(); HC.Save.save(); return null;
    },
    '.fire'(d) { HC.company.crew[d.id] = false; HC.Save.save(); return null; },
    '.repair'(d) { repairOne(d.k); HC.Audio.cash(); return null; },
    '.wear-oh'(d) { return HC.Wear.overhaul(d.k); },
    '.wear-haul'(d) { return HC.Wear.haul(d.k); },
    '.wear-scrap'(d) { const r = HC.Wear.scrap(d.k); if (r) buildHud(); return r; },
    '.svc'(d) { const c = HC.serviceCost(d.k); if (HC.company.money < c) return null; HC.company.money -= c; HC.doService(d.k); const u = HC.session.units[d.k]; if (u) u.broken = false; HC.Audio.cash(); HC.Save.save(); return `Oil changed and greased: ${HC.money(c)}.`; },
    '#b-repair-all'() { const C = HC.company; for (const k in C.owned) if (C.owned[k] && (!HC.EQUIP[k].noUnit || k === 'saw') && !HC.EQUIP[k].hidden && inYard(k)) repairOne(k); if (C.owned.saw && inYard('saw')) repairOne('saw'); HC.Audio.cash(); return null; },
    '#b-fuel-all'() { const S = HC.session; for (const k in S.units) if (inYard(k)) HC.Units.refuel(S.units[k], true); if (S.saw && inYard('saw')) HC.Units.refuelSaw(S, true); HC.Audio.fuel(); return null; },
    '.sell-u'(d) { if (HC.Game.sellUnit(d.k)) buildHud(); return null; },
    '.sell-t'(d) { HC.Game.sellTrailer(d.id); return null; },
    '.sell-a'(d) { HC.Game.sellAttachment(d.k); return null; },
  };
  function doAct(sel, d, close) {
    if (HC.Net && HC.Net.role === 'guest' && HC.Net.mode === 'partner') { // the host runs it on the shared company
      HC.Net.sendAct(sel, d);
      if (close) closePhone(); else { toastHub('Sent to the boss\'s office...'); setTimeout(() => { if (phoneOpen) phone(); }, 700); }
      return;
    }
    if (close) closePhone();
    const msg = ACT[sel] && ACT[sel](d);
    if (close) return;
    if (msg) toastHub(msg);
    phone();
  }

  // a brand-new company: nothing bought yet
  const ownsNothing = () => !Object.keys(HC.company.owned).some((k) => HC.company.owned[k] && k !== 'op' && !HC.EQUIP[k].hidden);
  // redraw the open phone (co-op: the shared board or someone's booking changed)
  function refreshPhone(onlyTab) {
    if (!phoneOpen || (onlyTab && tab !== onlyTab)) return;
    if (document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return; // don't wipe a bid you're typing
    const body = document.querySelector('.hub-body'), y = body ? body.scrollTop : 0;
    phone(); const b2 = document.querySelector('.hub-body'); if (b2) b2.scrollTop = y;
  }
  function phone(t) {
    if (t) tab = t;
    if (!HC.session || HC.session.preview) return;
    phoneOpen = true;
    pauseWorld(true);
    const C = HC.company;
    const body = tab === 'jobs' ? jobsTab() : tab === 'shop' ? shopTab() : companyTab();
    show(`<div class="hub">${header()}<main class="hub-body">${body}</main></div>`, 'hub-screen');
    bind('.tab', (el) => phone(el.dataset.tab));
    bind('.shop-cat', (el) => { shopCat = el.dataset.cat; phone(); const b = document.querySelector('.hub-body'); if (b) b.scrollTop = 0; });
    bind('#b-save', () => toastHub(HC.Save.save() ? 'Saved.' : 'Could not save: browser storage is blocked.'));
    bind('#b-close', closePhone);
    bind('#b-mute', () => { HC.Audio.setMuted(!HC.Audio.isMuted()); phone(); });
    bind('#b-gfx', () => { C.prefs = C.prefs || {}; const order = ['low', 'high', 'ultra']; C.prefs.gfx = order[(order.indexOf(C.prefs.gfx || 'high') + 1) % 3]; HC.Render.setQuality(C.prefs.gfx); HC.Save.save(); phone(); });
    bind('#b-ren', () => { const v = window.prompt(`Name for this save (slot ${HC.Save.slot})`, C.slotName || ''); if (v === null) return; HC.Save.rename(HC.Save.slot, v); phone(); });
    bind('#b-cam', () => { cycleCam(); phone(); });
    bind('#b-outline', () => { C.prefs = C.prefs || {}; C.prefs.outlines = !C.prefs.outlines; HC.Render.setOutlines(C.prefs.outlines); HC.Save.save(); phone(); });
    const form = screen.querySelector('#code-form');
    if (form) form.addEventListener('submit', (e) => {
      e.preventDefault();
      const msg = redeem(screen.querySelector('#code-in').value);
      toastHub(msg);
      if (msg.startsWith('Unlocked') || msg.startsWith('+')) { HC.Audio.cash(); buildHud(); setTimeout(() => phone(), 50); } else HC.Audio.deny();
    });
    bind('#b-title', () => { HC.Save.save(); hide(); HC.session = null; title(); });
    // shop and job buttons are named actions, so a co-op friend working for this company sends them to the host to run
    const act = (sel, close) => bind(sel, (el) => doAct(sel, { ...el.dataset }, close));
    act('.take', true); act('.counter'); act('#b-invoice', true); act('#b-switch', true);
    bind('.bid', (el) => { const inp = screen.querySelector(`.bid-in[data-id="${el.dataset.id}"]`); doAct('.bid', { id: el.dataset.id, amt: inp ? inp.value : 0 }); });
    for (const sel of ['.buy-used', '.buy-eq', '.buy-tr', '.buy-more', '.buy-att', '.buy-pal', '.buy-mulch', '.buy-exp', '.buy-home', '.buy-quarry', '.buy-yard', '.buy-saw', '.buy-saw2', '.svc', '.wear-oh', '.wear-haul', '.wear-scrap', '.buy-up', '.hire', '.fire', '.repair', '#b-repair-all', '#b-fuel-all']) act(sel);
    for (const sel of ['.sell-u', '.sell-t', '.sell-a']) bind(sel, (el) => armSell(el, () => { doAct(sel, { ...el.dataset }); return false; }));
  }
  function closePhone() { hide(); pauseWorld(false); }

  function toastHub(t) {
    const n = document.createElement('div');
    n.className = 'hub-toast'; n.textContent = t;
    screen.appendChild(n);
    setTimeout(() => n.remove(), 2200);
  }

  // ---------- HUD ----------
  function buildHud() {
    const S = HC.session;
    const slots = fleet().map((k, i) => `
      <button class="slot" data-k="${k}" title="${esc(HC.EQUIP[k].name)}"><b>${i < 10 ? (i + 1) % 10 : '·'}</b><span>${esc(HC.EQUIP[k].short)}</span></button>`).join('');
    hud.innerHTML = `
      <div id="h-top">
        <div class="h-chip h-money"><span class="lbl">Bank</span><span class="num" id="h-money"></span></div>
        <div class="h-chip"><span class="lbl" id="h-day"></span><span class="num" id="h-clock"></span></div>
        <div class="h-chip"><span class="lbl">Weather</span><span id="h-weather"></span></div>
        <button class="h-chip h-btn" id="h-phone">Phone (J)<span id="h-calls"></span></button>
        <button class="h-chip h-btn" id="h-pause" aria-label="Pause">II</button>
      </div>
      <aside id="h-obj">
        <h4 id="h-jobname"></h4>
        <ul id="h-objlist"></ul>
        <div id="h-pen"></div>
        <button class="btn primary" id="h-finish" hidden>Finish job &amp; invoice</button>
      </aside>
      <div id="h-map" title="Click to open the big map"><canvas id="h-mapc" width="240" height="174" aria-label="Map of Hollow Creek. Click to open the big map."></canvas><span class="map-close">Click the map or press Esc to close</span></div>
      <div id="h-bottom">
        <div id="h-unit">
          <div id="h-uname"></div>
          <div class="gauge"><span>Fuel</span><div class="bar"><i id="h-fuel"></i></div></div>
          <div class="gauge"><span>Cond.</span><div class="bar"><i id="h-cond"></i></div></div>
          <div id="h-hours" class="small"></div>
          <div id="h-extra"></div>
        </div>
        <div id="h-slots">${slots}</div>
      </div>
      <div id="h-hint"></div>
      <div id="h-toasts"></div>`;
    hud.querySelectorAll('.slot').forEach((b) => b.addEventListener('click', () => HC.Game.select(b.dataset.k)));
    { const m = $('h-map'); if (m) m.addEventListener('click', () => mapToggle()); }
    hud.classList.toggle('bigfleet', fleet().length > 9);
    $('h-finish').addEventListener('click', () => HC.Game.finish());
    $('h-pause').addEventListener('click', () => pause());
    $('h-phone').addEventListener('click', () => phone('jobs'));
    updateHud(true);
  }

  function updateHud(force) {
    const S = HC.session;
    if (!S || hud.hidden || S.preview) return;
    const now = performance.now();
    if (now - mapT > 150) { mapT = now; drawMap(S); }
    if (!force && now - hudT < 100) return;
    hudT = now;
    const C = HC.company, u = S.units[S.active];
    $('h-money').textContent = HC.money(C.money);
    $('h-money').classList.toggle('neg', C.money < 0);
    $('h-day').textContent = `Day ${C.day}`;
    $('h-clock').textContent = HC.clock(S.time);
    $('h-weather').textContent = S.weather.name;
    const calls = (C.board || []).filter((j) => !j.lost && !(j.tier > HC.Co.tier())).length;
    $('h-calls').textContent = calls ? ` · ${calls}` : '';
    const guest = HC.Net && HC.Net.role === 'guest';
    const ob = guest ? (HC.Net.ob || { list: [], complete: false }) : HC.Game.objectives(S); // a co-op guest shows the host's checklist
    if (S.job) {
      $('h-jobname').textContent = `${HC.JOBS[S.job.type].name} · ${S.job.client}`;
      $('h-objlist').innerHTML = (S.stage === 'travel' ? `<li class="meta"><span>Drive to ${esc(S.job.address)}</span><b>${Math.round(distTo(S))} m</b></li>` : '') +
        ob.list.map((o) => {
          const done = o.n >= o.of;
          const cnt = o.left !== undefined ? (done ? 'done' : `${o.left} left`) : `${o.n}/${o.of}`;
          return `<li class="${done ? 'done' : ''} ${o.optional ? 'opt' : ''}"><i></i><span>${esc(o.label)}${o.optional ? ` (+${HC.money(o.bonus)} each)` : ''}</span><b>${cnt}</b></li>`;
        }).join('') +
        (HC.JOBS[S.job.type].disposal ? `<li class="meta"><span>Debris: ${esc(HC.DISPOSAL[HC.JOBS[S.job.type].disposal].short)}</span><b>${HC.JOBS[S.job.type].disposal === 'haul' ? 'fined if left' : ''}</b></li>` : '') +
        (S.job && S.job.due ? `<li class="meta"><span>Due</span><b>${esc(HC.dueText(S.job))}</b></li>` : '') +
        `<li class="meta"><span>Time on site</span><b class="${S.workMins > S.job.par ? 'late' : ''}">${HC.dur(S.workMins)} / par ${HC.dur(S.job.par)}</b></li>`;
    } else {
      $('h-jobname').textContent = 'No job booked';
      $('h-objlist').innerHTML = `<li class="meta"><span>${calls} customer call${calls === 1 ? '' : 's'} waiting. Press J.</span></li>`;
    }
    for (const c of (C.contracts || []).filter((q) => q.status === 'won')) {
      const pr = HC.Storms.progress(c);
      $('h-objlist').innerHTML += `<li class="meta"><span>State: ${esc(c.road)} storm trees</span><b class="${S.time > c.due ? 'late' : ''}">${pr.gone}/${pr.n}${pr.debris ? ` · ${pr.debris} on road` : ''}</b></li>`;
    }
    const bidding = (C.contracts || []).filter((q) => q.status === 'bidding').length;
    if (bidding) $('h-objlist').innerHTML += `<li class="meta"><span>${bidding} storm contract${bidding > 1 ? 's' : ''} open for bids. Press J.</span></li>`;
    const dumps = S.trailers.filter((t) => HC.Units.isDump(t));
    $('h-objlist').innerHTML += dumps.map((t) => `<li class="meta"><span>${esc(t.hitch && HC.Units.isBed(t) ? HC.EQUIP[t.hitch].short : HC.TRAILERS[t.kind].name)}</span><b>${t.load}/${HC.Game.trailerCap(t)}</b></li>`).join('');
    $('h-pen').innerHTML = S.penalties.length ? `<p>Damages: <b>${HC.money(S.costs.damage)}</b> · ${S.penalties.length} incident(s)</p>` : '';
    $('h-finish').hidden = !(ob.complete && S.stage === 'onsite');
    if (u) {
      const spec = HC.EQUIP[u.kind], cap = HC.Units.fuelCap(u.kind), cond = C.cond[u.kind];
      const K = HC.Units.KINDS[u.kind];
      const seat = HC.DRIVEN(u.kind) ? '<span class="seat">You\'re driving · F to climb out</span>' : u.kind === 'op' ? '<span class="seat">On foot · F by a machine to climb in</span>' : '';
      $('h-uname').innerHTML = `<b>${esc(spec.name)}</b>${K.modeName ? ` <span class="mode">${esc(K.modeName(u))}</span>` : ''}${seat}`;
      const hasSaw = S.saw && S.saw.holder === u.kind;
      hud.querySelectorAll('.gauge').forEach((g) => (g.hidden = spec.move === 'walk' && !hasSaw));
      const fp = hasSaw ? (S.saw.fuel / HC.Units.SAW_CAP) * 100 : cap ? (u.fuel / cap) * 100 : 100;
      $('h-fuel').style.width = fp + '%';
      $('h-fuel').style.background = fp < 20 ? '#d9483b' : '#e8b21f';
      const condV = hasSaw ? C.cond.saw : cond;
      $('h-cond').style.width = condV + '%';
      $('h-cond').style.background = condV < 30 ? '#d9483b' : '#4f9a3c';
      { const hh = $('h-hours'); if (hh) { const show = HC.hours && spec.fuelCap && spec.move !== 'walk'; hh.hidden = !show; if (show) hh.innerHTML = `<span class="hrm">${String(Math.floor(HC.hours(u.kind))).padStart(5, '0')}</span> hrs${HC.isDead(u.kind) ? ' · <b class="warn-t">worn out</b>' : HC.wornOut(u.kind) ? ' · <b class="warn-t">past its life</b>' : ''}`; } }
      const capOf = HC.Units.KINDS[u.kind] && HC.Units.KINDS[u.kind].cap ? HC.Units.KINDS[u.kind].cap(u) : HC.EQUIP[HC.baseOf(u.kind)].cap || 1;
      $('h-extra').textContent = u.carrying.length ? `Holding ${u.carrying.length}/${capOf}` : HC.EQUIP[u.kind].move === 'car' ? `${Math.round(Math.abs(u.v) / 4)} mph` : u.on ? 'Strapped down' : '';
      $('h-hint').textContent = (guest ? HC.Net.hint : HC.Units.hint(u, S)) + (ob.complete && S.stage === 'onsite' ? '   ·   All work done: click Finish job' : '');
    }
    hud.querySelectorAll('.slot').forEach((b) => {
      const un = S.units[b.dataset.k];
      b.classList.toggle('on', b.dataset.k === S.active);
      b.classList.toggle('locked', !un);
      b.classList.toggle('stowed', !!un && (un.hidden || !!un.on));
    });
  }
  function fleet() { return Object.keys(HC.EQUIP).filter((k) => HC.company.owned[k] && !HC.EQUIP[k].noUnit && !HC.EQUIP[k].hidden && HC.session && HC.session.units[k]); }
  function distTo(S) {
    const p = HC.world.parcels.find((q) => q.id === S.job.parcel), t = S.units[S.active];
    if (!p || !t || !p.spawn) return 0;
    return HC.dist(t.x, t.y, p.spawn.x, p.spawn.y) / HC.TILE * 3; // a tile is about 3 m
  }

  function drawMap(S) {
    const C0 = HC.company;
    const c = $('h-mapc');
    if (!c || !HC.Render.groundCanvas) return;
    const big = $('h-map').classList.contains('big'), dpr = Math.min(2, window.devicePixelRatio || 1);
    const want = big ? [Math.round(c.clientWidth * dpr), Math.round(c.clientHeight * dpr)] : [240, 174];
    if (want[0] > 0 && (c.width !== want[0] || c.height !== want[1])) { c.width = want[0]; c.height = want[1]; }
    const g = c.getContext('2d'), W = HC.world, sx = c.width / W.pw, sy = c.height / W.ph, k = big ? 2 * dpr : 1;
    g.imageSmoothingEnabled = true;
    g.drawImage(HC.Render.groundCanvas, 0, 0, c.width, c.height);
    g.fillStyle = 'rgba(30,60,25,0.35)'; g.fillRect(0, 0, c.width, c.height);
    for (const h of W.houses) { g.fillStyle = h.yard ? '#f07a22' : '#f3ecd9'; g.fillRect(h.x * sx, h.y * sy, Math.max(3, h.w * sx), Math.max(3, h.h * sy)); }
    if (S.job) {
      const p = W.parcels.find((q) => q.id === S.job.parcel);
      g.strokeStyle = '#ff8a2a'; g.lineWidth = 2; g.strokeRect(p.x * sx, p.y * sy, p.w * sx, p.h * sy);
      const pulse = 3 + Math.sin(performance.now() / 200) * 1.5;
      g.fillStyle = '#ff8a2a'; g.beginPath(); g.arc(p.spawn.x * sx, p.spawn.y * sy, pulse, 0, 6.283); g.fill();
    }
    for (const c of C0.contracts || []) if (c.status === 'bidding' || c.status === 'won') { // storm damage on the roads
      g.strokeStyle = c.status === 'won' ? '#ffd23a' : '#ff5a4a'; g.lineWidth = 2; const x = c.x * sx, y = c.y * sy;
      g.beginPath(); g.moveTo(x - 4, y - 4); g.lineTo(x + 4, y + 4); g.moveTo(x + 4, y - 4); g.lineTo(x - 4, y + 4); g.stroke();
    }
    if (C0.queued) { const p = W.parcels.find((q) => q.id === C0.queued.parcel); if (p) { g.setLineDash([4, 3]); g.strokeStyle = '#ffd23a'; g.lineWidth = 2; g.strokeRect(p.x * sx, p.y * sy, p.w * sx, p.h * sy); g.setLineDash([]); } } // the job on hold
    // the places you drive to: a coloured badge with a letter on both maps
    const PLACES = [];
    if (W.sawmill) PLACES.push([W.sawmill, 'S', '#8b5a3c', 'Sawmill · buys logs']);
    if (W.dumpSite) PLACES.push([W.dumpSite, 'D', '#56622f', 'County brush & stump dump']);
    if (HC.Homes) for (const L of HC.Homes.listed()) { const mine = HC.company.home === L.parcel; if (mine || !HC.company.home || true) PLACES.push([{ x: L.house.x, y: L.house.y, w: L.house.w, h: L.house.h }, mine ? '⌂' : '$', mine ? '#2f5a8a' : '#a8925a', mine ? 'Your home' : `${L.name} for sale · ${HC.money(L.price)}`]); }
    if (W.scrapyard) PLACES.push([W.scrapyard, 'X', '#6a6f75', 'Hollow Creek Salvage · scrap worn-out machines']);
    if (W.supply) PLACES.push([W.supply, 'L', '#4f9a3c', 'Landscape supply · mulch, chips, firewood, pallets']);
    if (W.quarry) PLACES.push([W.quarry, 'Q', '#7d8085', W.quarry.owned ? 'Your quarry · sells rock' : 'Quarry (for sale)']);
    for (const y of W.yards) if (y.owned || !y.coop) PLACES.push([y, y.id === 'firewood' ? 'F' : y.id === (HC.Net && HC.Net.homeYard) || y.id === 'hq' ? 'H' : 'Y', y.owned ? '#f07a22' : '#9a8f78', y.owned ? y.name + ' (yours)' : y.name + ' (for sale)']);
    const badge = (o, ch, col) => { const x = (o.x + o.w / 2) * sx, y = (o.y + o.h / 2) * sy, r = (big ? 9 : 5.5) * (big ? dpr : 1);
      g.fillStyle = col; g.strokeStyle = '#fff'; g.lineWidth = big ? 2 * dpr : 1.2; g.beginPath(); g.arc(x, y, r, 0, 6.283); g.fill(); g.stroke();
      g.fillStyle = '#fff'; g.font = `800 ${Math.round(r * 1.25)}px "Work Sans", system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(ch, x, y + 0.5); };
    for (const [o, ch, col] of PLACES) badge(o, ch, col);
    for (const pm of W.pumps || []) { const yd = HC.World.yardAt(pm.x, pm.y); if (!yd) continue; g.fillStyle = '#d9483b'; g.beginPath(); g.arc(pm.x * sx, pm.y * sy, (big ? 3.2 * dpr : 1.8), 0, 6.283); g.fill(); } // fuel at your yards
    const dot = (u, col, r) => { g.fillStyle = col; g.beginPath(); g.arc(u.x * sx, u.y * sy, r * k, 0, 6.283); g.fill(); };
    for (const q in S.units) if (!S.units[q].hidden && q !== S.active) dot(S.units[q], '#ffd36b', 2);
    for (const q in S.remote || {}) if (!S.remote[q].hidden) dot(S.remote[q], '#7fc8ff', 2); // co-op friends' machines
    if (big) { // names on the big map: roads, yards, the job, the places that buy things
      g.font = `600 ${Math.round(11 * dpr)}px "Work Sans", system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
      const label = (x, y, t, col = '#fff') => { g.lineWidth = 3 * dpr; g.strokeStyle = 'rgba(0,0,0,0.65)'; g.strokeText(t, x * sx, y * sy); g.fillStyle = col; g.fillText(t, x * sx, y * sy); };
      for (const r of W.roads) { const pt = r.pts[Math.floor(r.pts.length * 0.42)]; if (pt) label(pt[0] * HC.TILE, pt[1] * HC.TILE - 12, r.name, '#f2eedf'); }
      for (const [o, , col, name] of PLACES) label(o.x + o.w / 2, o.y + o.h / 2 + 26 / sy * dpr, name, '#fff');
      if (C0.queued) { const p = W.parcels.find((q) => q.id === C0.queued.parcel); if (p) label(p.x + p.w / 2, p.y - 14, 'On hold: ' + C0.queued.client, '#ffd23a'); }
      // legend
      const lg = [['H', '#f07a22', 'Your yard'], ['S', '#8b5a3c', 'Sawmill'], ['D', '#56622f', 'County dump'], ['L', '#4f9a3c', 'Landscape supply'], ['Q', '#7d8085', 'Quarry'], ['F', '#f07a22', 'Firewood Yard']];
      g.textAlign = 'left'; const lx = c.width - 150 * dpr; let ly = c.height - (lg.length * 18 + 10) * dpr;
      g.fillStyle = 'rgba(20,28,18,0.72)'; g.fillRect(lx - 6 * dpr, ly - 12 * dpr, 150 * dpr, (lg.length * 18 + 6) * dpr);
      for (const [ch, col, t] of lg) { g.fillStyle = col; g.beginPath(); g.arc(lx + 6 * dpr, ly, 6 * dpr, 0, 6.283); g.fill(); g.fillStyle = '#fff'; g.font = `800 ${Math.round(8 * dpr)}px "Work Sans", system-ui, sans-serif`; g.textAlign = 'center'; g.fillText(ch, lx + 6 * dpr, ly + 0.5);
        g.textAlign = 'left'; g.font = `600 ${Math.round(11 * dpr)}px "Work Sans", system-ui, sans-serif`; g.fillText(t, lx + 18 * dpr, ly); ly += 18 * dpr; }
      g.textAlign = 'center';
      if (S.job) { const p = W.parcels.find((q) => q.id === S.job.parcel); if (p) label(p.x + p.w / 2, p.y - 14, 'Job: ' + S.job.client, '#ffb46b'); }
      for (const tag in (HC.Net && HC.Net.remote) || {}) { const R = HC.Net.remote[tag], u = S.remote && S.remote[R.me]; if (u) label(u.x, u.y - 14, R.name, '#9fd6ff'); }
    }
    const a = S.units[S.active];
    if (a) {
      g.save(); g.translate(a.x * sx, a.y * sy); g.rotate(a.a); g.scale(k, k);
      g.fillStyle = '#fff'; g.strokeStyle = '#000'; g.lineWidth = 1;
      g.beginPath(); g.moveTo(6, 0); g.lineTo(-4, -4); g.lineTo(-2, 0); g.lineTo(-4, 4); g.closePath(); g.fill(); g.stroke();
      g.restore();
    }
  }

  // the minimap opens into a big map when clicked
  function mapToggle(force) {
    const m = $('h-map'); if (!m) return;
    const on = force === undefined ? !m.classList.contains('big') : force;
    m.classList.toggle('big', on); mapT = 0; drawMap(HC.session);
  }
  function toast(text, kind) {
    if (phoneOpen) toastHub(text); // the phone covers the HUD: say it on the phone too (e.g. why something can't be sold)
    const box = $('h-toasts');
    if (!box) return;
    const n = document.createElement('div');
    n.className = 'toast ' + (kind || '');
    n.textContent = text;
    box.appendChild(n);
    while (box.children.length > 4) box.firstChild.remove();
    setTimeout(() => { n.classList.add('out'); setTimeout(() => n.remove(), 400); }, kind === 'call' ? 6000 : 3800);
  }

  // ---------- modals ----------
  function pause() {
    const S = HC.session;
    if (!S || S.preview) return;
    pauseWorld(true);
    show(`
      <div class="modal">
        <h2>Paused</h2>
        <p>Day ${HC.company.day}, ${HC.clock(S.time)}. ${S.job ? `Working for ${esc(S.job.client)}.` : 'No job booked.'}</p>
        <div class="btn-col">
          <button class="btn primary" id="p-resume">Back to work</button>
          <button class="btn" id="p-mute">${HC.Audio.isMuted() ? 'Turn sound on' : 'Mute sound'}</button>
          <button class="btn" id="p-title">Save and quit to title</button>
        </div>
      </div>`, 'dim');
    bind('#p-resume', resume);
    bind('#p-mute', () => { HC.Audio.setMuted(!HC.Audio.isMuted()); pause(); });
    bind('#p-title', () => { HC.Save.save(); hide(); HC.session = null; title(); });
  }
  function resume() { hide(); pauseWorld(false); }

  function dayEnd(S, wages) {
    show(`
      <div class="modal">
        <h2>${HC.clock ? HC.clock(HC.Game.DAY_END) : "9:30 PM"}. The crew heads home.</h2>
        <p>${S.job ? "The job isn't done, so you'll pick it back up in the morning." : 'Another day in the books.'}</p>
        <dl class="ledger">
          <dt>Wages paid</dt><dd class="num">${HC.money(wages)}</dd>
          <dt>Bank</dt><dd class="num">${HC.money(HC.company.money)}</dd>
          <dt>Tomorrow</dt><dd>Day ${HC.company.day}: ${esc(S.weather.name)}</dd>
        </dl>
        <button class="btn primary" id="d-go">Start day ${HC.company.day}</button>
      </div>`, 'dim');
    bind('#d-go', resume);
  }

  function results(r) {
    const S = r.S;
    const lines = [
      ['Agreed price', HC.money(S.job.pay)],
      [r.ob.complete ? 'Work completed' : `Work completed (${Math.round(r.frac * 100)}%)`, r.ob.complete ? 'All of it' : HC.money(r.base)],
      [`Quality ${Math.round(r.quality)}/100`, `×${r.qualMul.toFixed(2)}`],
      [`Speed (${HC.dur(S.workMins)} vs par ${HC.dur(S.job.par)})`, `×${r.speed.toFixed(2)}`],
    ];
    if (r.bonus) lines.push(['Bonus work', HC.money(r.bonus)]);
    const pens = S.penalties.map((p) => `<li><span>${esc(p.label)}</span><b class="num neg">-${HC.money(p.cost)}</b></li>`).join('');
    const quote = r.stars >= 5 ? 'Best crew in the county. I\'m telling everybody at church.' : r.stars >= 4 ? 'Good work. I\'d call you again.' : r.stars >= 3 ? 'It got done.' : r.stars >= 2 ? 'Not happy, honestly.' : 'I\'ll be calling my lawyer.';
    show(`
      <div class="modal wide invoice">
        <div class="inv-head"><div><span class="eyebrow">Invoice · WO-${1000 + (S.job.id % 9000)}</span><h2>${esc(S.job.client)}</h2><p>${esc(S.job.address)}</p></div>
          <div class="inv-stars">${stars(r.stars)}<p>“${esc(quote)}”</p></div></div>
        <ul class="inv-lines">${lines.map((l) => `<li><span>${esc(l[0])}</span><b class="num">${esc(l[1])}</b></li>`).join('')}
          <li class="total"><span>Customer paid</span><b class="num">${HC.money(r.pay)}</b></li>
          ${r.tip ? `<li class="tip"><span>Tip: “Thanks, guys. Grab lunch on me.”</span><b class="num">+${HC.money(r.tip)}</b></li>` : ''}</ul>
        ${pens ? `<h4>Damages you covered</h4><ul class="inv-lines">${pens}</ul>` : '<p class="clean">No damage on the property. The customer noticed.</p>'}
        <h4>Job costs and extras</h4>
        <ul class="inv-lines">
          <li><span>Logs sold at your yard</span><b class="num">${HC.money(S.logSales)}</b></li>
          <li><span>Dump fees</span><b class="num neg">-${HC.money(S.costs.dump)}</b></li>
          <li><span>Fuel</span><b class="num neg">-${HC.money(S.costs.fuel)}</b></li>
          ${S.costs.wages ? `<li><span>Crew wages</span><b class="num neg">-${HC.money(S.costs.wages)}</b></li>` : ''}
          <li class="total"><span>Net for this job</span><b class="num ${r.net < 0 ? 'neg' : ''}">${HC.money(r.net)}</b></li>
        </ul>
        <p class="small">Anything still on the trailer sells when you unload at the yard.</p>
        ${r.unlocked ? `<p class="unlock">Word is getting around. New work unlocked: <b>${esc(r.unlocked)}</b></p>` : ''}
        <div class="btn-row"><button class="btn primary" id="r-board">See who else called</button><button class="btn" id="r-ok">Back to the truck</button></div>
      </div>`, 'dim');
    bind('#r-ok', resume);
    bind('#r-board', () => { hide(); phone('jobs'); });
  }

  function init() { screen = $('screen'); hud = $('hud'); }

  HC.UI = { cycleCam, refreshPhone,
    init, title, phone, closePhone, pause, resume, dayEnd, results, toast, updateHud, buildHud, show, hide, bind, stars,
    get phoneOpen() { return phoneOpen; }, get mapOpen() { const m = $('h-map'); return !!(m && m.classList.contains('big')); }, mapToggle, fleet, esc, ACT,
  };
})();
