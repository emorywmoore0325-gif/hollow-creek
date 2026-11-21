// Hollow Creek — boot, input and main loop
'use strict';
(() => {
  HC.input = { keys: new Set(), mouse: { x: 0, y: 0, wx: 0, wy: 0, down: false }, zoom: 20, dragging: false };
  const canvas = document.getElementById('game');
  const screenEl = document.getElementById('screen');
  const ARROWS = { arrowup: 'w', arrowdown: 's', arrowleft: 'a', arrowright: 'd' };

  function onKey(e) {
    const k = e.key.toLowerCase();
    HC.Audio.init();
    if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
    const S = HC.session;
    if (!S || S.preview) return;
    if (k === 'm') { HC.Audio.setMuted(!HC.Audio.isMuted()); HC.Game.toast(HC.Audio.isMuted() ? 'Sound off' : 'Sound on'); return; }
    const menuOpen = !screenEl.hidden;
    const guest = HC.Net && HC.Net.role === 'guest';
    if (k === 'j' || k === 'tab') {
      e.preventDefault();
      if (HC.UI.phoneOpen) HC.UI.closePhone(); else if (!menuOpen) HC.UI.phone();
      return;
    }
    if (k === 'escape') {
      if (HC.UI.mapOpen) HC.UI.mapToggle(false);
      else if (HC.UI.phoneOpen) HC.UI.closePhone();
      else if (menuOpen && S.paused && screenEl.querySelector('#p-resume')) HC.UI.resume();
      else if (!menuOpen) HC.UI.pause();
      return;
    }
    if (menuOpen || S.paused) return;
    if (k === 'c' && !e.repeat) { const m = HC.UI.cycleCam(); HC.Game.toast(`Camera: ${m.name}. ${m.text}`); return; }
    if (['w', 'a', 's', 'd', ' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) e.preventDefault();
    HC.input.keys.add(ARROWS[k] || k);
    if (e.repeat) return;
    if (guest) { HC.Net.guestKey(k); return; } // a co-op guest's actions run on the host
    if (/^[0-9]$/.test(k)) {
      const kind = HC.UI.fleet()[(+k + 9) % 10];
      if (kind) HC.Game.select(kind);
    }
    if (k === '[' || k === ']') {
      const f = HC.UI.fleet().filter((x) => !S.units[x].boarded || true);
      const i = f.indexOf(S.active);
      HC.Game.select(f[(i + (k === ']' ? 1 : f.length - 1)) % f.length]);
    }
    const u = S.units[S.active];
    if (!u) return;
    if (k === 'r') { if (HC.Units.isTruck(u.kind) || (HC.EQUIP[u.kind] && HC.EQUIP[u.kind].move !== 'walk')) HC.Units.hitchToggle(u, S); else HC.Game.toast('Get in a truck to hitch or drop a trailer.'); } // machines use R to pull a stuck one out
    if (k === 'x') HC.Game.dumpLoad(u);
    if (k === 'l') { if (!HC.EQUIP[u.kind] || HC.EQUIP[u.kind].move === 'walk') HC.Game.toast('Get in a vehicle or machine to switch its lights.'); else { u.lights = !HC.lightsOn(u, S); HC.Game.toast(`Lights ${u.lights ? 'on' : 'off'}.`); } }
    if (k === 'f') HC.Game.climb();
    if (k === 'g') { if (HC.EQUIP[u.kind].move === 'walk') HC.Units.sawGrab(u, S); else HC.Game.toast('Climb out (F) to handle the chainsaw.'); }
    if (k === 'e') HC.Units.interact(u, S);
    if (k === 'q') HC.Units.mode(u, S);
    if (k === 'enter' && S.stage === 'onsite' && HC.Game.objectives(S).complete) HC.Game.finish();
  }

  window.addEventListener('keydown', onKey);
  window.addEventListener('keyup', (e) => { const k = e.key.toLowerCase(); HC.input.keys.delete(ARROWS[k] || k); });
  window.addEventListener('blur', () => { HC.input.keys.clear(); HC.input.mouse.down = false; HC.input.dragging = false; });

  let dragX = 0, dragY = 0;
  canvas.addEventListener('mousemove', (e) => {
    HC.input.mouse.x = e.clientX; HC.input.mouse.y = e.clientY;
    if (HC.input.dragging) {
      HC.input.camYaw += (e.clientX - dragX) * 0.008;
      HC.input.camPitch = HC.clamp((HC.input.camPitch ?? 0.92) + (e.clientY - dragY) * 0.006, 0.28, 1.45);
      dragX = e.clientX; dragY = e.clientY;
    }
  });
  canvas.addEventListener('mousedown', (e) => {
    HC.Audio.init();
    if (e.button === 0) HC.input.mouse.down = true;
    if (e.button === 2) { HC.input.dragging = true; dragX = e.clientX; dragY = e.clientY; canvas.style.cursor = 'grabbing'; }
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) HC.input.mouse.down = false;
    if (e.button === 2) { HC.input.dragging = false; canvas.style.cursor = ''; }
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); HC.input.zoom = HC.clamp(HC.input.zoom + Math.sign(e.deltaY) * 2, 6, 42); }, { passive: false });

  let last = performance.now();
  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const S = HC.session;
    if (S && !S.preview) {
      const w = HC.Render.screenToWorld(HC.input.mouse.x, HC.input.mouse.y);
      HC.input.mouse.wx = w.x; HC.input.mouse.wy = w.y;
      if (HC.Net && HC.Net.role === 'guest') HC.Net.guestFrame(dt); // the host simulates; a guest only shows it
      else { HC.Game.update(dt); if (HC.Net && HC.Net.role === 'host') HC.Net.hostTick(dt); if (HC.Net && HC.Net.role === 'peer') HC.Net.peerTick(dt); }
    }
    HC.Render.frame(HC.session);
    HC.UI.updateHud();
    requestAnimationFrame(loop);
  }

  if (!window.THREE) {
    document.getElementById('screen').innerHTML = '<div class="modal"><h2>3D engine missing</h2><p>lib/three.min.js did not load. Keep the lib folder next to index.html.</p></div>';
    return;
  }
  HC.Render.init(canvas);
  HC.UI.init();
  HC.UI.title();
  requestAnimationFrame(loop);
})();
