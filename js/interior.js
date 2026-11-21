// Hollow Creek — walk around inside your home. Each place is its own little 3D scene with real rooms and furniture: the yard
// office cot, a starter ranch, an old farmhouse, a big country home. WASD to walk, E to use things (the bed to sleep, the
// fridge, the TV, the desk to save), Esc or the front door to go back out.
'use strict';
(() => {
  const M = (c, o = {}) => new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: 0.85, metalness: 0 }, o));
  let scene = null, cam = null, me = null, active = null, solids = [], spots = [], fadeWalls = [], keys = new Set(), last = 0, hud = null, tvLight = null, tvOn = false, lamp = null;
  const H = 2.6; // ceiling height, metres
  const HIDE = ['h-hint', 'h-bottom', 'h-map', 'h-obj', 'overlay']; // the town's HUD and labels step aside while you're indoors

  // ---------- building blocks ----------
  function box(g, w, h, d, x, y, z, mat, solid = true, ry = 0) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y + h / 2, z); m.rotation.y = ry; m.castShadow = true; m.receiveShadow = true; g.add(m);
    if (solid) solids.push({ x0: x - (ry ? d : w) / 2, x1: x + (ry ? d : w) / 2, z0: z - (ry ? w : d) / 2, z1: z + (ry ? w : d) / 2 });
    return m;
  }
  function cyl(g, r, h, x, y, z, mat, solid = true) { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 16), mat); m.position.set(x, y + h / 2, z); m.castShadow = true; g.add(m); if (solid) solids.push({ x0: x - r, x1: x + r, z0: z - r, z1: z + r }); return m; }
  const spot = (x, z, r, label, act) => spots.push({ x, z, r, label, act });
  // a wall from (x0,z0) to (x1,z1) along one axis, with optional door gaps [{at, w}]
  function wall(g, x0, z0, x1, z1, mat, gaps = [], t = 0.14) {
    const horiz = z0 === z1, L = horiz ? x1 - x0 : z1 - z0;
    let s = 0; const cuts = gaps.slice().sort((a, b) => a.at - b.at).concat([{ at: L + 1, w: 0 }]);
    const fw = (m) => { if (horiz) { m.material = mat.clone(); m.material.transparent = true; m.userData.wz = z0; fadeWalls.push(m); } return m; }; // walls on the camera side fade out (a cutaway view)
    for (const c of cuts) { const e = Math.min(L, c.at - c.w / 2); if (e > s + 0.02) { const mid = (s + e) / 2; if (horiz) fw(box(g, e - s, H, t, x0 + mid, 0, z0, mat)); else box(g, t, H, e - s, x0, 0, z0 + mid, mat); }
      if (c.at <= L) { const m2 = c.at; if (horiz) fw(box(g, c.w, 0.5, t, x0 + m2, H - 0.5, z0, mat, false)); else box(g, t, 0.5, c.w, x0, H - 0.5, z0 + m2, mat, false); } // header over the opening
      s = c.at + c.w / 2; }
  }
  function windowPane(g, x, z, w, horiz, sky) { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, 1.0), new THREE.MeshBasicMaterial({ color: sky })); m.position.set(x, 1.5, z); if (!horiz) m.rotation.y = Math.PI / 2; g.add(m); const fr = M('#f2f0ea'); box(g, horiz ? w + 0.1 : 0.06, 0.06, horiz ? 0.06 : w + 0.1, x, 0.97, z, fr, false); box(g, horiz ? w + 0.1 : 0.06, 0.06, horiz ? 0.06 : w + 0.1, x, 1.97, z, fr, false); }
  function rug(g, w, d, x, z, c) { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), M(c)); m.rotation.x = -Math.PI / 2; m.position.set(x, 0.012, z); m.receiveShadow = true; g.add(m); }

  // furniture
  const FURN = {
    bed(g, x, z, ry, quilt, size = 1.6) { const fr = M('#5a3e28'); box(g, size, 0.35, 2.1, x, 0, z, fr, true, ry); box(g, size - 0.1, 0.22, 2.0, x, 0.35, z, M('#f2efe8'), false, ry); box(g, size - 0.05, 0.08, 1.4, x + (ry ? -0.3 : 0), 0.57, z + (ry ? 0 : 0.3), M(quilt), false, ry); box(g, size, 0.9, 0.1, x + (ry ? 1.05 : 0), 0, z + (ry ? 0 : -1.05), fr, false, ry); for (const o of [-0.35, 0.35]) box(g, 0.5, 0.14, 0.32, x + (ry ? 0.8 : o * (size / 1.6)), 0.57, z + (ry ? o * (size / 1.6) : -0.8), M('#ffffff'), false, ry); },
    couch(g, x, z, ry, c) { box(g, 2.1, 0.45, 0.9, x, 0, z, M(c), true, ry); box(g, 2.1, 0.5, 0.25, x + (ry ? 0.33 : 0), 0.45, z + (ry ? 0 : -0.33), M(c), false, ry); for (const s of [-1, 1]) box(g, 0.2, 0.25, 0.9, x + (ry ? 0 : s * 0.95), 0.45, z + (ry ? s * 0.95 : 0), M(c), false, ry); },
    tv(g, x, z, ry) { box(g, 1.6, 0.5, 0.45, x, 0, z, M('#3a2a20'), true, ry); const s = box(g, 1.3, 0.75, 0.06, x, 0.6, z, M('#111216', { roughness: 0.3 }), false, ry); return s; },
    table(g, x, z, w, d, c, chairs = 4) { box(g, w, 0.06, d, x, 0.72, z, M(c), true); for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(g, 0.06, 0.72, 0.06, x + sx * (w / 2 - 0.08), 0, z + sz * (d / 2 - 0.08), M(c), false); for (let i = 0; i < chairs; i++) { const sz = i % 2 ? 1 : -1, sx = (Math.floor(i / 2) - (chairs / 4 - 0.5)) * 0.6; box(g, 0.42, 0.45, 0.42, x + sx, 0, z + sz * (d / 2 + 0.3), M(HC.shade(c, -0.1)), false); box(g, 0.42, 0.5, 0.06, x + sx, 0.45, z + sz * (d / 2 + 0.48), M(HC.shade(c, -0.1)), false); } },
    kitchen(g, x0, z, len, cab, top) { box(g, len, 0.9, 0.62, x0 + len / 2, 0, z, M(cab)); box(g, len + 0.04, 0.05, 0.66, x0 + len / 2, 0.9, z, M(top, { roughness: 0.4 }), false); box(g, len, 0.7, 0.35, x0 + len / 2, 1.5, z - 0.14, M(cab), false); box(g, 0.6, 0.04, 0.45, x0 + 0.9, 0.95, z, M('#1c1d1f'), false); box(g, 0.5, 0.02, 0.4, x0 + len - 0.8, 0.93, z, M('#c9cdd2', { metalness: 0.6, roughness: 0.3 }), false); },
    fridge(g, x, z) { box(g, 0.8, 1.85, 0.72, x, 0, z, M('#d9dbde', { metalness: 0.4, roughness: 0.35 })); box(g, 0.04, 0.6, 0.04, x + 0.3, 1.0, z + 0.37, M('#8a8e93'), false); },
    stove(g, x, z) { box(g, 0.75, 0.9, 0.65, x, 0, z, M('#2a2b2d', { metalness: 0.3 })); for (const o of [-0.17, 0.17]) for (const q of [-0.15, 0.15]) cyl(g, 0.09, 0.01, x + o, 0.9, z + q, M('#5a5d60'), false); },
    woodstove(g, x, z) { box(g, 0.7, 0.7, 0.6, x, 0, z, M('#1c1d1f', { metalness: 0.4 })); cyl(g, 0.1, 1.9, x, 0.7, z - 0.1, M('#1c1d1f'), false); const glow = box(g, 0.4, 0.25, 0.02, x, 0.2, z + 0.31, new THREE.MeshBasicMaterial({ color: '#ff8a2a' }), false); return glow; },
    fireplace(g, x, z, ry) { box(g, 1.9, H, 0.7, x, 0, z, M('#8a8278', { roughness: 1 }), true, ry); box(g, 0.9, 0.7, 0.05, x + (ry ? 0.36 : 0), 0.3, z + (ry ? 0 : 0.36), new THREE.MeshBasicMaterial({ color: '#ff7a24' }), false, ry); box(g, 2.1, 0.1, 0.85, x, 1.35, z, M('#6a4a30'), false, ry); },
    desk(g, x, z, ry) { box(g, 1.3, 0.75, 0.65, x, 0, z, M('#6a4a30'), true, ry); box(g, 0.45, 0.3, 0.03, x, 0.75, z - 0.1, M('#1c1d1f'), false, ry); box(g, 0.42, 0.25, 0.01, x, 0.78, z - 0.08, new THREE.MeshBasicMaterial({ color: '#7ab0e0' }), false, ry); box(g, 0.45, 0.45, 0.45, x, 0, z + 0.6, M('#2a2b2d'), false); },
    shelf(g, x, z, ry, w = 1.2) { box(g, w, 1.9, 0.35, x, 0, z, M('#5a3e28'), true, ry); for (let i = 0; i < 4; i++) for (let k = 0; k < 5; k++) box(g, 0.12, 0.28, 0.24, x - w / 2 + 0.15 + k * (w / 5) * (ry ? 0 : 1), 0.1 + i * 0.45, z + (ry ? -w / 2 + 0.15 + k * (w / 5) : 0), M(['#8a3a2a', '#2f5a8a', '#3a6a3a', '#c9a24a'][(i + k) % 4]), false); },
    plant(g, x, z) { cyl(g, 0.18, 0.35, x, 0, z, M('#8a5a3a')); const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.38, 0), M('#3e7a34')); m.position.set(x, 0.75, z); g.add(m); },
    cot(g, x, z) { box(g, 0.75, 0.38, 1.9, x, 0, z, M('#56614a')); box(g, 0.5, 0.1, 0.3, x, 0.38, z - 0.7, M('#e8e4da'), false); },
    cabinet(g, x, z) { box(g, 0.5, 1.3, 0.6, x, 0, z, M('#7a7d80', { metalness: 0.3 })); for (let i = 0; i < 4; i++) box(g, 0.2, 0.03, 0.02, x, 0.2 + i * 0.3, z + 0.31, M('#c9cdd2'), false); },
    tub(g, x, z) { box(g, 0.75, 0.55, 1.6, x, 0, z, M('#f4f4f2', { roughness: 0.3 })); box(g, 0.6, 0.05, 1.45, x, 0.5, z, M('#a8c8d8', { roughness: 0.1 }), false); },
    toilet(g, x, z) { box(g, 0.4, 0.42, 0.55, x, 0, z, M('#f4f4f2', { roughness: 0.3 })); box(g, 0.42, 0.4, 0.18, x, 0.42, z - 0.22, M('#f4f4f2', { roughness: 0.3 }), false); },
    pool(g, x, z) { box(g, 2.4, 0.8, 1.35, x, 0, z, M('#5a3a22')); box(g, 2.2, 0.03, 1.15, x, 0.8, z, M('#2a6a3a'), false); },
    mount(g, x, z, horiz) { box(g, horiz ? 0.5 : 0.08, 0.6, horiz ? 0.08 : 0.5, x, 1.6, z, M('#6a4a30'), false); box(g, horiz ? 0.3 : 0.25, 0.3, horiz ? 0.25 : 0.3, x, 1.75, z + (horiz ? 0.15 : 0), M('#8a6a4a'), false); },
  };

  // ---------- the four places, each laid out its own way ----------
  function layout(id, g, sky, night) {
    const glass = sky;
    if (id === 'cot') { // the yard office: one room, desk, cot, filing cabinets, a coffee maker, maps on the wall
      const W = 6, D = 5, wl = M('#c9c2b0'); floor(g, W, D, '#8a8478'); walls(g, W, D, wl, { door: { side: 'S', at: 1.2 } });
      windowPane(g, 3.5, -D / 2 + 0.08, 1.4, true, glass); FURN.desk(g, 3.8, -1.5, 0); spot(3.8, -0.9, 0.9, 'Desk: save the game', 'save');
      FURN.cot(g, -2.2, -1.2); spot(-2.2, -0.6, 1.0, 'Cot: sleep until morning', 'sleep');
      FURN.cabinet(g, 0.2, -2.1); FURN.cabinet(g, 0.8, -2.1); box(g, 0.9, 0.9, 0.5, -2.4, 0, 1.8, M('#6a4a30')); box(g, 0.2, 0.3, 0.2, -2.4, 0.9, 1.8, M('#1c1d1f'), false); spot(-2.4, 1.3, 0.8, 'Coffee: a fresh cup', 'coffee');
      box(g, 1.6, 1.0, 0.02, -0.5, 1.2, -D / 2 + 0.09, M('#d8cfa8'), false); // a map of the county on the wall
      return { start: [1.2, 1.7], door: [1.2, D / 2 - 0.3], name: 'Yard office' };
    }
    if (id === 'small') { // starter ranch: living room and kitchenette, a bedroom through a doorway, a little bathroom
      const W = 10, D = 7, wl = M('#e8dfc8'); floor(g, W, D, '#b08a5a'); walls(g, W, D, wl, { door: { side: 'S', at: -1.5 } });
      wall(g, 1.0, -D / 2, 1.0, D / 2, wl, [{ at: 4.6, w: 1.0 }]); wall(g, 1.0, 0.4, W / 2, 0.4, wl, [{ at: 1.0, w: 0.9 }]);
      windowPane(g, -2.5, -D / 2 + 0.08, 1.4, true, glass); windowPane(g, 3.2, -D / 2 + 0.08, 1.2, true, glass);
      rug(g, 2.6, 1.8, -2.6, 0.4, '#8a5a4a'); FURN.couch(g, -2.6, 1.6, 0, '#5a6a7a'); const tv = FURN.tv(g, -2.6, -0.9, 0); spot(-2.6, -0.3, 1.0, 'TV: switch it on or off', 'tv');
      FURN.kitchen(g, -W / 2 + 0.2, -D / 2 + 0.4, 2.6, '#f2f0ea', '#5a5d60'); FURN.fridge(g, -1.7, -D / 2 + 0.45); spot(-1.7, -D / 2 + 1.2, 0.8, 'Fridge: grab a snack', 'snack');
      FURN.table(g, -3.6, 2.4, 1.1, 0.8, '#9a7048', 2);
      FURN.bed(g, 3.2, -1.9, 0, '#7a3a4a', 1.5); spot(3.2, -0.6, 1.1, 'Bed: sleep until morning', 'sleep'); box(g, 0.9, 0.8, 0.45, 4.4, 0, -3.0, M('#7a5a3a'));
      FURN.tub(g, 4.4, 1.9); FURN.toilet(g, 2.0, 3.1); spot(3.0, 2.0, 1.0, 'Bathroom: a hot shower (feel fresh)', 'shower');
      FURN.plant(g, 0.5, 3.0);
      return { start: [-1.5, 2.8], door: [-1.5, D / 2 - 0.3], name: 'Starter house', tv };
    }
    if (id === 'mid') { // old farmhouse: wood floors, a big kitchen with an island and a long table, a wood stove, a mudroom, the bedroom at the back
      const W = 13, D = 9, wl = M('#efe6cf'); floor(g, W, D, '#8a5a32'); walls(g, W, D, wl, { door: { side: 'S', at: 0 } });
      wall(g, -2.0, -D / 2, -2.0, D / 2, wl, [{ at: 6.5, w: 1.2 }]); wall(g, 3.0, -D / 2, 3.0, D / 2, wl, [{ at: 2.2, w: 1.2 }, { at: 6.8, w: 1.0 }]);
      for (const x of [-4.5, 0.5, 5.2]) windowPane(g, x, -D / 2 + 0.08, 1.2, true, glass);
      FURN.kitchen(g, -W / 2 + 0.2, -D / 2 + 0.4, 3.6, '#5a7a6a', '#d8d2c4'); FURN.fridge(g, -2.6, -D / 2 + 0.45); spot(-2.6, -D / 2 + 1.2, 0.8, 'Fridge: leftovers', 'snack');
      FURN.stove(g, -4.0, -D / 2 + 0.42); box(g, 1.6, 0.9, 0.8, -4.2, 0, -1.4, M('#5a7a6a')); box(g, 1.7, 0.05, 0.9, -4.2, 0.9, -1.4, M('#d8d2c4'), false); // island
      FURN.table(g, -4.2, 1.6, 2.0, 0.9, '#7a5030', 6); rug(g, 1.6, 1.0, -4.2, 3.6, '#7a4a3a'); box(g, 0.5, 1.6, 0.35, -6.2, 0, 3.7, M('#4a3a2a')); // coat rack in the mudroom
      for (const x of [-6.0, -5.6]) box(g, 0.18, 0.25, 0.3, x, 0, 4.0, M('#3a2a1e'), false); // boots by the door
      const glow = FURN.woodstove(g, 0.5, -3.6); spot(0.5, -2.8, 1.0, 'Wood stove: throw a split on', 'stove');
      FURN.couch(g, 0.5, 1.4, 0, '#6a4a3a'); box(g, 0.8, 0.8, 0.8, -1.2, 0, -0.6, M('#5a3a2a')); rug(g, 2.8, 2.0, 0.5, -0.6, '#9a6a4a'); const tv = FURN.tv(g, 2.4, -0.6, Math.PI / 2); spot(1.8, -0.6, 1.0, 'TV: the weather channel', 'tv');
      FURN.shelf(g, 0.5, 4.2, 0, 1.6);
      FURN.bed(g, 5.2, -2.6, 0, '#4a6a8a', 1.6); spot(5.2, -1.3, 1.1, 'Bed: the old quilt. Sleep until morning', 'sleep'); box(g, 1.0, 1.0, 0.5, 6.0, 0, 0.3, M('#6a4a30')); FURN.plant(g, 3.6, 3.8);
      FURN.tub(g, 5.6, 3.3); spot(5.0, 3.2, 1.0, 'Clawfoot tub: soak (feel fresh)', 'shower');
      return { start: [0, 3.6], door: [0, D / 2 - 0.3], name: 'Farmhouse', tv, glow };
    }
    // big country home: open plan with a stone fireplace and a sectional, a long kitchen island, a game room with a pool table, an office, the master suite
    const W = 16, D = 11, wl = M('#ece8e0'); floor(g, W, D, '#9a7a5a'); walls(g, W, D, wl, { door: { side: 'S', at: -1.0 } });
    wall(g, 3.5, -D / 2, 3.5, D / 2, wl, [{ at: 3.5, w: 1.4 }, { at: 8.0, w: 1.2 }]); wall(g, 3.5, 0.5, W / 2, 0.5, wl, [{ at: 2.0, w: 1.0 }]); wall(g, -W / 2, 1.5, -3.0, 1.5, wl, [{ at: 3.2, w: 1.6 }]);
    for (const x of [-6, -2, 1.5]) windowPane(g, x, -D / 2 + 0.08, 1.8, true, glass); windowPane(g, 6.0, -D / 2 + 0.08, 1.6, true, glass);
    FURN.fireplace(g, -2.0, -D / 2 + 0.38, 0); FURN.mount(g, -2.0, -D / 2 + 0.75, true);
    FURN.couch(g, -2.4, -1.4, 0, '#7a7068'); FURN.couch(g, -4.0, -2.6, Math.PI / 2, '#7a7068'); rug(g, 3.4, 2.4, -2.4, -2.6, '#5a4a40'); box(g, 1.1, 0.4, 0.6, -2.4, 0, -2.6, M('#4a3020'));
    const tv = FURN.tv(g, 0.8, -2.6, Math.PI / 2); spot(0.2, -2.6, 1.0, 'Big TV: the game is on', 'tv');
    FURN.kitchen(g, -W / 2 + 0.2, -D / 2 + 0.4, 3.2, '#2f3a44', '#e8e4dc'); FURN.fridge(g, -4.35, -D / 2 + 0.45); spot(-4.35, -D / 2 + 1.2, 0.8, 'Fridge: a cold drink', 'snack');
    box(g, 2.6, 0.9, 0.9, -6.2, 0, -1.8, M('#2f3a44')); box(g, 2.7, 0.05, 1.0, -6.2, 0.9, -1.8, M('#e8e4dc', { roughness: 0.3 }), false); for (const x of [-7.0, -6.2, -5.4]) cyl(g, 0.18, 0.7, x, 0, -1.0, M('#2a2b2d'), false);
    FURN.pool(g, -5.0, 3.6); spot(-5.0, 2.4, 1.2, 'Pool table: rack \'em', 'pool'); FURN.shelf(g, -1.0, D / 2 - 0.3, 0, 1.8); FURN.mount(g, -7.85, 3.0, false);
    FURN.desk(g, 1.5, 3.8, 0); spot(1.5, 3.0, 0.9, 'Office desk: save the game', 'save'); FURN.shelf(g, 0.0, 4.9, 0, 1.2); FURN.plant(g, 3.0, 4.8);
    FURN.bed(g, 6.0, -3.4, 0, '#2a3a4a', 1.9); spot(6.0, -2.0, 1.2, 'King bed: sleep until morning', 'sleep'); for (const x of [4.6, 7.4]) box(g, 0.5, 0.55, 0.45, x, 0, -4.3, M('#5a3e28'));
    FURN.tub(g, 7.2, 2.6); FURN.toilet(g, 5.0, 4.9); spot(6.4, 2.6, 1.1, 'Walk-in shower (feel fresh)', 'shower');
    return { start: [-1.0, 4.6], door: [-1.0, D / 2 - 0.3], name: 'Country home', tv };
  }
  function floor(g, W, D, c) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(W, D), M(c)); m.rotation.x = -Math.PI / 2; m.receiveShadow = true; g.add(m);
    for (let x = -W / 2 + 0.25; x < W / 2; x += 0.5) { const l = new THREE.Mesh(new THREE.PlaneGeometry(0.01, D), M(HC.shade(c, -0.15))); l.rotation.x = -Math.PI / 2; l.position.set(x, 0.004, 0); g.add(l); } // floorboards
  }
  function walls(g, W, D, mat, o) {
    const dz = o.door.side === 'S' ? o.door.at + W / 2 : null;
    wall(g, -W / 2, -D / 2, W / 2, -D / 2, mat); wall(g, -W / 2, D / 2, W / 2, D / 2, mat, dz != null ? [{ at: dz, w: 1.1 }] : []);
    wall(g, -W / 2, -D / 2, -W / 2, D / 2, mat); wall(g, W / 2, -D / 2, W / 2, D / 2, mat);
    box(g, 0.05, 2.1, 1.0, o.door.at - 0.6, 0, D / 2 - 0.55, M('#5a3a26'), false); box(g, 0.06, 0.06, 0.06, o.door.at - 0.56, 1.0, D / 2 - 0.95, M('#d6b25a'), false); // the front door, swung open against the wall
  }

  // a person: boots, jeans, hi-vis shirt, a cap
  function person() {
    const g = new THREE.Group(), add = (w, h, d, y, c, x = 0, z = 0) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), M(c)); m.position.set(x, y, z); m.castShadow = true; g.add(m); return m; };
    g.userData.legs = [add(0.15, 0.8, 0.15, 0.4, '#2e3f58', 0, -0.1), add(0.15, 0.8, 0.15, 0.4, '#2e3f58', 0, 0.1)];
    add(0.3, 0.55, 0.42, 1.08, '#f07a22'); add(0.31, 0.06, 0.43, 1.0, '#e8eef0'); add(0.2, 0.22, 0.2, 1.5, '#d7a982'); add(0.24, 0.08, 0.24, 1.64, '#2f5a8a'); add(0.14, 0.03, 0.22, 1.62, '#2f5a8a', 0.12);
    return g;
  }

  // ---------- enter, walk, use, leave ----------
  function enter(where, cb) {
    const R = HC.Render._dbg.renderer(); if (!R) return false;
    solids = []; spots = []; fadeWalls = []; keys.clear(); tvOn = false;
    scene = new THREE.Scene();
    const t = HC.session.time, night = t >= 19.2 * 60, eve = t >= 16.5 * 60;
    const sky = night ? '#18233e' : eve ? '#f2b27a' : '#9fd0f0';
    scene.background = new THREE.Color('#0c0d0f');
    scene.add(new THREE.HemisphereLight('#fff4e0', '#3a3028', night ? 0.55 : 0.9));
    const sun = new THREE.DirectionalLight(night ? '#8fa6e0' : '#fff2d8', night ? 0.15 : 0.7); sun.position.set(4, 8, -6); scene.add(sun);
    const g = new THREE.Group(); scene.add(g);
    const L = layout(where.id || 'cot', g, sky, night);
    // warm room lamps on the ceiling
    lamp = new THREE.PointLight('#ffe2b0', night || eve ? 1.4 : 0.6, 14, 1.6); lamp.position.set(0, H - 0.2, 0); scene.add(lamp);
    for (const x of [-5, 5]) { const l2 = new THREE.PointLight('#ffe2b0', night ? 0.9 : 0.3, 10, 1.8); l2.position.set(x, H - 0.2, 0); scene.add(l2); }
    tvLight = new THREE.PointLight('#8ab8ff', 0, 4); scene.add(tvLight); if (L.tv) { L.tv.getWorldPosition(tvLight.position); tvLight.position.y += 0.2; }
    spot(L.door[0], L.door[1], 0.8, 'Front door: go back outside', 'exit');
    me = person(); me.position.set(L.start[0], 0, L.start[1]); me.rotation.y = Math.PI; scene.add(me);
    cam = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 60);
    active = { where, cb, L, step: 0 }; last = performance.now();
    if (!hud) { hud = document.createElement('div'); hud.id = 'in-hud'; hud.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:40;background:rgba(20,28,17,.9);color:#f3ecd9;padding:10px 16px;border-radius:10px;font:13.5px var(--f-body,system-ui);text-align:center;max-width:min(640px,90vw);box-shadow:0 6px 18px rgba(0,0,0,.35);pointer-events:none'; document.body.appendChild(hud); }
    hud.hidden = false; say(`${L.name}. WASD to walk, E to use things, Esc or the front door to go outside.`);
    for (const id of HIDE) { const el = document.getElementById(id); if (el) el.style.visibility = 'hidden'; }
    return true;
  }
  let sayT = 0, sayMsg = '';
  function say(m, dur = 3) { sayMsg = m; sayT = dur; }
  function exit() {
    if (!active) return; const cb = active.cb; active = null; scene = null; if (hud) hud.hidden = true;
    for (const id of HIDE) { const el = document.getElementById(id); if (el) el.style.visibility = ''; }
    cb && cb.exit && cb.exit();
  }
  function use() {
    if (!active) return; const p = me.position;
    const s = spots.filter((q) => Math.hypot(q.x - p.x, q.z - p.z) < q.r).sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0];
    if (!s) return say('Nothing to use here. Walk up to the bed, fridge, TV, desk or the door.');
    const cb = active.cb || {}, S = HC.session;
    switch (s.act) {
      case 'exit': return exit();
      case 'sleep': if (S.time < 16 * 60) return say('Too early to turn in (after 4 PM).'); if (HC.Net && HC.Net.role && HC.Net.role !== 'host') return say('In co-op the host calls it a night.'); { const c2 = active.cb; active = null; scene = null; if (hud) hud.hidden = true; for (const id of HIDE) { const el = document.getElementById(id); if (el) el.style.visibility = ''; } c2 && c2.sleep && c2.sleep(); } return;
      case 'save': HC.Save.save(); return say('Game saved.');
      case 'tv': tvOn = !tvOn; tvLight.intensity = tvOn ? 1.2 : 0; if (active.L.tv) active.L.tv.material = tvOn ? new THREE.MeshBasicMaterial({ color: '#6a9ad8' }) : M('#111216', { roughness: 0.3 }); return say(tvOn ? `TV on: ${HC.pick(['the weather: ' + S.weather.name.toLowerCase() + ' tomorrow, maybe', 'a tractor pull', 'the local news', 'a ball game'])}.` : 'TV off.');
      case 'snack': S.time += 5; return say(HC.pick(['A sandwich and a cold drink. Ready to go.', 'Leftover chili. Good stuff.', 'An apple and some cheese.']));
      case 'coffee': S.time += 3; return say('Hot black coffee. That helps.');
      case 'shower': S.time += 15; HC.company.rested = Math.max(HC.company.rested || 0, 0.03); HC.company.restedDay = HC.company.day; return say('A hot shower. You feel fresh (works a little faster today).');
      case 'stove': if (active.L.glow) active.L.glow.material.color.set('#ffb03a'); S.time += 2; return say('You throw a split in the stove. Toasty.');
      case 'pool': S.time += 10; return say(HC.pick(['You sink the eight ball. Nice.', 'Scratched on the break. Again.']));
    }
  }
  function solidAt(x, z, r) { for (const b of solids) if (x + r > b.x0 && x - r < b.x1 && z + r > b.z0 && z - r < b.z1) return true; return false; }
  function frame() {
    const R = HC.Render._dbg.renderer(), now = performance.now(), dt = Math.min(0.05, (now - last) / 1000); last = now;
    let mx = 0, mz = 0; if (keys.has('w') || keys.has('arrowup')) mz -= 1; if (keys.has('s') || keys.has('arrowdown')) mz += 1; if (keys.has('a') || keys.has('arrowleft')) mx -= 1; if (keys.has('d') || keys.has('arrowright')) mx += 1;
    const p = me.position, len = Math.hypot(mx, mz);
    if (len) {
      const v = 2.6 * dt / len, nx = p.x + mx * v, nz = p.z + mz * v;
      if (!solidAt(nx, p.z, 0.22)) p.x = nx; if (!solidAt(p.x, nz, 0.22)) p.z = nz;
      me.rotation.y = Math.atan2(mx, mz) + Math.PI; active.step += dt * 9;
      me.userData.legs[0].rotation.z = Math.sin(active.step) * 0.5; me.userData.legs[1].rotation.z = -Math.sin(active.step) * 0.5;
    } else me.userData.legs.forEach((l) => (l.rotation.z *= 0.8));
    cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix();
    cam.position.lerp(new THREE.Vector3(p.x, 7.4, p.z + 4.4), 0.12); cam.lookAt(p.x, 0.6, p.z - 0.4);
    for (const w of fadeWalls) { const tgt = w.userData.wz > p.z + 0.15 ? 0.14 : 1; w.material.opacity += (tgt - w.material.opacity) * 0.2; w.material.depthWrite = w.material.opacity > 0.9; }
    if (tvOn && tvLight) tvLight.intensity = 0.9 + Math.sin(now / 90) * 0.3;
    // what's in reach
    const s = spots.filter((q) => Math.hypot(q.x - p.x, q.z - p.z) < q.r).sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0];
    if (sayT > 0) { sayT -= dt; hud.textContent = sayMsg; } else hud.innerHTML = s ? `<b style="display:inline-block;background:#f1e6cc;color:#2a2619;border-radius:4px;padding:0 6px;margin-right:6px">E</b>${s.label}` : `${active.L.name} · ${HC.clock(HC.session.time)}`;
    R.render(scene, cam);
  }
  addEventListener('keydown', (e) => {
    if (!active) return; const k = e.key.toLowerCase();
    if (k === 'escape') { e.stopPropagation(); e.preventDefault(); return exit(); }
    if (k === 'e') { e.stopPropagation(); e.preventDefault(); if (!e.repeat) use(); return; }
    if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) { keys.add(k); e.preventDefault(); e.stopPropagation(); }
  }, true);
  addEventListener('keyup', (e) => { keys.delete(e.key.toLowerCase()); }, true);
  // draw the inside instead of the town while you're in
  const baseFrame = HC.Render.frame;
  HC.Render.frame = function (S) { if (active && scene) return frame(); return baseFrame.apply(this, arguments); };
  HC.Interior = { enter, exit, isActive: () => !!active, _use: use, _keys: keys, _me: () => me };
})();
