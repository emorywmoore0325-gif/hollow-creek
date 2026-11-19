// Hollow Creek — 3D cartoon renderer (Three.js). Sim units are pixels (32 per tile); 1 tile = 1 world unit.
'use strict';
(() => {
  const TS = HC.TILE, T = HC.T, G = 16; // ground texture pixels per tile
  const U = (px) => px / TS;
  const gh = (x, y) => HC.World.heightAt(x, y);
  let renderer, scene, camera, hemi, sun, overlay, octx;
  let groundCanvas, gctx, groundTex, groundDirty = false, lastUpload = 0, lastMip = 0, dirtyR = null, mipDirty = false;
  const markDirty = (x0, y0, x1, y1) => { if (!dirtyR) dirtyR = [x0, y0, x1, y1]; else { dirtyR[0] = Math.min(dirtyR[0], x0); dirtyR[1] = Math.min(dirtyR[1], y0); dirtyR[2] = Math.max(dirtyR[2], x1); dirtyR[3] = Math.max(dirtyR[3], y1); } };
  let world = null, worldGroup = null;
  const cam = { tx: 0, tz: 0, dist: 20, pitch: 0.92, yaw: -Math.PI / 2 };
  const meshes = { trees: new Map(), items: new Map(), stumps: new Map(), bushes: new Map(), plants: new Map(), houses: new Map() };
  let fenceMesh = null, poleMesh = null, wireLines = null, unitObjs = {}, trailerObjs = {};
  let aimMesh = null, landMesh = null, zoneLine = null, zoneSig = '', targetGroup = null, targetSig = '', beacon = null, marker = null;
  let points = null, rain = null, saleSign = null, shedModels = [];
  let frameNo = 0;

  // ---------- materials ----------
  let gradient, bodyMat, outlineMat, fadeMat, sky;
  const LIGHT = { sun: 2.4, hemi: 0.7 };
  function makeMaterials() {
    gradient = new THREE.DataTexture(new Uint8Array([120, 190, 255]), 3, 1, THREE.RedFormat);
    gradient.minFilter = gradient.magFilter = THREE.NearestFilter;
    gradient.needsUpdate = true;
    bodyMat = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.78, metalness: 0.05 });
    fadeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.78, metalness: 0.05, transparent: true, opacity: 0.28, depthWrite: false });
    const pbrPatch = (sh) => {
      sh.vertexShader = 'attribute vec2 pbr;\nvarying vec2 vPbr;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvPbr = pbr;');
      sh.fragmentShader = 'varying vec2 vPbr;\n' + sh.fragmentShader.replace('#include <metalnessmap_fragment>',
        '#include <metalnessmap_fragment>\nif (vPbr.x > 0.001) { roughnessFactor = vPbr.x; metalnessFactor = vPbr.y; }')
        .replace('#include <output_fragment>', '#include <output_fragment>\nfloat rimF = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 3.0);\ngl_FragColor.rgb += rimF * 0.09 * vec3(0.86, 0.93, 1.0);');
    };
    bodyMat.onBeforeCompile = pbrPatch; fadeMat.onBeforeCompile = pbrPatch;
    bodyMat.envMapIntensity = fadeMat.envMapIntensity = 0.75;
    outlineMat = new THREE.MeshBasicMaterial({ color: 0x1c2117, side: THREE.BackSide });
    outlineMat.visible = !!(HC.company && HC.company.prefs && HC.company.prefs.outlines);
    outlineMat.onBeforeCompile = (sh) => {
      sh.uniforms.othick = { value: 0.022 };
      sh.vertexShader = 'attribute vec3 onorm;\nuniform float othick;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed += onorm * othick;');
    };
  }

  // ---------- geometry builder: merge coloured parts into one mesh (+ outline normals) ----------
  const GEO = {};
  function baseGeos() {
    GEO.box = new THREE.BoxGeometry(1, 1, 1);
    GEO.cyl = new THREE.CylinderGeometry(0.5, 0.5, 1, 18);
    GEO.cyl6 = new THREE.CylinderGeometry(0.5, 0.5, 1, 6);
    GEO.taper = new THREE.CylinderGeometry(0.32, 0.5, 1, 7);
    GEO.cone = new THREE.ConeGeometry(0.5, 1, 8);
    GEO.ico = new THREE.IcosahedronGeometry(0.5, 1);
    GEO.ico0 = new THREE.IcosahedronGeometry(0.5, 0);
    GEO.dode = new THREE.DodecahedronGeometry(0.5, 0);
    GEO.sph = new THREE.SphereGeometry(0.5, 14, 10);
    GEO.hcylz = new THREE.CylinderGeometry(0.5, 0.5, 1, 20, 1, false, -Math.PI / 2, Math.PI).rotateX(-Math.PI / 2);
    GEO.arch = new THREE.TorusGeometry(0.5, 0.08, 8, 22, Math.PI);
    GEO.hshell = new THREE.CylinderGeometry(0.5, 0.5, 1, 20, 1, true, -Math.PI / 2, Math.PI).rotateX(-Math.PI / 2);
    GEO.fender = new THREE.CylinderGeometry(0.5, 0.5, 1, 20, 1, true, -Math.PI * 0.37, Math.PI * 0.74).rotateX(-Math.PI / 2);
    GEO.fenderLip = new THREE.TorusGeometry(0.5, 0.06, 8, 20, Math.PI * 0.74).rotateZ(Math.PI * 0.13);
    GEO.tyre = new THREE.CylinderGeometry(0.5, 0.5, 1, 28);
  }
  const P = (g, color, pos = [0, 0, 0], scl = [1, 1, 1], rot = [0, 0, 0]) => ({ g, color, pos, scl, rot });
  const wheel = (x, y, z, r, w, col = '#1c1c1c') => [P('cyl', col, [x, y, z], [r * 2, w, r * 2], [Math.PI / 2, 0, 0]), P('cyl', '#9aa0a6', [x, y, z + Math.sign(z || 1) * (w / 2 + 0.005)], [r * 0.9, 0.01, r * 0.9], [Math.PI / 2, 0, 0])];
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _c = new THREE.Color();
  // A box with chamfered edges and corners, built at its real size so every bevel is the same width.
  // The thin bevels catch the light the way rounded sheet metal and trim do.
  const bevelCache = new Map();
  function bevelBox(sx, sy, sz, r) {
    const key = sx.toFixed(4) + ',' + sy.toFixed(4) + ',' + sz.toFixed(4) + ',' + r.toFixed(4);
    if (bevelCache.has(key)) return bevelCache.get(key);
    const h = [sx / 2, sy / 2, sz / 2], v = [], tri = (a, b, c, d) => {
      const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      const n = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
      if (n[0] * d[0] + n[1] * d[1] + n[2] * d[2] < 0) v.push(...a, ...c, ...b); else v.push(...a, ...b, ...c);
    };
    const quad = (a, b, c, e, d) => { tri(a, b, c, d); tri(a, c, e, d); };
    // point on the bevelled box: axis k at full extent with sign sk, the others inset by r
    const pt = (sg, k) => [0, 1, 2].map((i) => sg[i] * (i === k ? h[i] : h[i] - r));
    for (let k = 0; k < 3; k++) for (const s of [-1, 1]) { // faces
      const i = (k + 1) % 3, j = (k + 2) % 3, d = [0, 0, 0]; d[k] = s;
      const c = (si, sj) => { const sg = [0, 0, 0]; sg[k] = s; sg[i] = si; sg[j] = sj; return pt(sg, k); };
      quad(c(-1, -1), c(1, -1), c(1, 1), c(-1, 1), d);
    }
    for (let k = 0; k < 3; k++) { // edges running along axis k
      const i = (k + 1) % 3, j = (k + 2) % 3;
      for (const si of [-1, 1]) for (const sj of [-1, 1]) {
        const d = [0, 0, 0]; d[i] = si; d[j] = sj;
        const g = (sk, full) => { const sg = [0, 0, 0]; sg[i] = si; sg[j] = sj; sg[k] = sk; return pt(sg, full); };
        quad(g(-1, i), g(1, i), g(1, j), g(-1, j), d);
      }
    }
    for (const a of [-1, 1]) for (const b of [-1, 1]) for (const c of [-1, 1]) tri(pt([a, b, c], 0), pt([a, b, c], 1), pt([a, b, c], 2), [a, b, c]); // corners
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    geo.computeVertexNormals();
    bevelCache.set(key, geo);
    return geo;
  }
  // surface finish from the part's colour: chrome and polished wheels, glass, rubber, bare steel; machines get semi-gloss paint
  const FINISH = {};
  for (const c of ['#c9ced3', '#dfe3e6', '#f4f6f7', '#eef1f3', '#d9dde0', '#b9bdc2', '#9aa0a6', '#d0d2d4', '#c9cdd2', '#b9bec5']) FINISH[c] = [0.3, 0.6];
  for (const c of ['#4f6e80', '#1d262c', '#9fb3ba', '#8fa4b0', '#e6eef3', '#bcc6cc', '#fff6d0']) FINISH[c] = [0.06, 0.55];
  for (const c of ['#18191a', '#1c1c1c', '#101112', '#2a2b2c', '#151719', '#0e0f10']) FINISH[c] = [0.92, 0];
  for (const c of ['#6d7176', '#2b2d30', '#3a3b3d', '#55595d', '#5c6168', '#7d8287']) FINISH[c] = [0.42, 0.55];
  function finish(p) {
    if (p.fin) return p.fin;
    const f = FINISH[typeof p.color === 'string' ? p.color.toLowerCase() : ''];
    if (f) return f;
    return p.eq ? [0.5, 0.12] : [0, 0];
  }
  function build(parts, noAO = false) {
    if (parts.some((p) => p.track)) {
      const geo = build(parts.filter((p) => !p.track), noAO);
      geo.userData.tracks = (geo.userData.tracks || []).concat(parts.filter((p) => p.track).map((p) => p.track));
      return geo;
    }
    if (parts.some((p) => p.wh)) {
      const body = [], groups = new Map();
      for (const p of parts) {
        if (!p.wh) { body.push(p); continue; }
        if (!groups.has(p.wh)) groups.set(p.wh, []);
        const c = p.wh.c;
        groups.get(p.wh).push({ ...p, wh: null, pos: [p.pos[0] - c[0], p.pos[1] - c[1], p.pos[2] - c[2]] });
      }
      const geo = build(body);
      geo.userData.wheels = [...groups].map(([wh, ps]) => ({ c: wh.c, r: wh.r, geo: build(ps, true) }));
      return geo;
    }
    const pos = [], nor = [], col = [], on = [], pb = [];
    for (const p of parts) {
      let g;
      const mn = Math.min(Math.abs(p.scl[0]), Math.abs(p.scl[1]), Math.abs(p.scl[2]));
      if (p.g === 'box' && mn > 0.004) {
        // real-size bevelled box; scale is already baked in
        g = bevelBox(Math.abs(p.scl[0]), Math.abs(p.scl[1]), Math.abs(p.scl[2]), Math.min(p.eq ? 0.02 : 0.03, mn * 0.2)).clone();
        _e.set(p.rot[0], p.rot[1], p.rot[2]); _q.setFromEuler(_e);
        _m.compose(new THREE.Vector3(p.pos[0], p.pos[1], p.pos[2]), _q, new THREE.Vector3(1, 1, 1));
      } else {
        const src = typeof p.g === 'string' ? GEO[p.g] : p.g;
        g = src.index ? src.toNonIndexed() : src.clone();
        // round shapes keep their smooth normals; faceted ones (foliage, rocks, hex posts) stay flat
        if (!(p.g === 'cyl' || p.g === 'sph' || p.g === 'cone' || p.g === 'taper' || p.g === 'hcylz' || p.g === 'hshell' || p.g === 'fender' || p.g === 'fenderLip' || p.g === 'arch' || p.g === 'tyre')) g.computeVertexNormals();
        _e.set(p.rot[0], p.rot[1], p.rot[2]); _q.setFromEuler(_e);
        _m.compose(new THREE.Vector3(p.pos[0], p.pos[1], p.pos[2]), _q, new THREE.Vector3(p.scl[0], p.scl[1], p.scl[2]));
      }
      g.applyMatrix4(_m);
      _c.set(p.color);
      const fin = finish(p);
      const A = g.attributes.position, N = g.attributes.normal;
      for (let i = 0; i < A.count; i++) {
        const x = A.getX(i), y = A.getY(i), z = A.getZ(i);
        pos.push(x, y, z); nor.push(N.getX(i), N.getY(i), N.getZ(i)); col.push(_c.r, _c.g, _c.b); pb.push(fin[0], fin[1]);
        _v.set(x - p.pos[0], y - p.pos[1], z - p.pos[2]).normalize(); on.push(_v.x, _v.y, _v.z);
      }
      g.dispose();
    }
    // stylized occlusion: each model darkens toward the ground and brightens slightly toward its top
    let y0 = Infinity, y1 = -Infinity;
    for (let i = 1; i < pos.length; i += 3) { if (pos[i] < y0) y0 = pos[i]; if (pos[i] > y1) y1 = pos[i]; }
    const eqModel = parts.length && parts[0].eq, aoH = eqModel ? 0.22 : 0.35, span = Math.max(0.01, y1 - y0);
    if (!noAO) for (let i = 0, n = pos.length / 3; i < n; i++) {
      const y = pos[i * 3 + 1] - y0, t = Math.min(1, y / aoH), ao = 0.68 + 0.32 * t * t * (3 - 2 * t), f = ao * (0.93 + 0.1 * (y / span));
      col[i * 3] *= f; col[i * 3 + 1] *= f; col[i * 3 + 2] *= f;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setAttribute('onorm', new THREE.Float32BufferAttribute(on, 3));
    geo.setAttribute('pbr', new THREE.Float32BufferAttribute(pb, 2));
    geo.computeBoundingSphere();
    return geo;
  }
  function model(geo, outline = true, shadow = true) {
    const grp = new THREE.Group();
    const body = new THREE.Mesh(geo, bodyMat);
    body.castShadow = shadow; body.receiveShadow = true;
    grp.add(body);
    if (outline) grp.add(new THREE.Mesh(geo, outlineMat));
    grp.userData.body = body;
    for (const w of geo.userData.wheels || []) { // steer pivot > roll pivot > wheel
      const st = new THREE.Group(); st.position.set(w.c[0], w.c[1], w.c[2]);
      const rl = new THREE.Group(); st.add(rl); rl.add(model(w.geo, outline, shadow));
      st.userData.wheel = { r: w.r, front: w.c[0] > 0.15 };
      grp.add(st);
    }
    for (const t of geo.userData.tracks || []) grp.add(trackLinks(t));
    return grp;
  }

  // ---------- model library ----------
  const MODEL = {};
  const cache = (k, f) => MODEL[k] || (MODEL[k] = f());
  const rnd = (seed) => { let s = seed; return () => ((s = (s * 9301 + 49297) % 233280) / 233280); };

  function treeGeo(t) {
    const variant = Math.floor(t.seed) % 3;
    return cache(`tree_${t.type}_${variant}_${t.maple || ''}`, () => {
      const d = HC.TREES[t.type], r = rnd(variant * 77 + 3);
      const len = d.height, cr = d.crown, tr = (d.trunk / TS) * 0.9;
      const bark = t.type === 'pine' ? '#7a5434' : t.type === 'dead' ? '#9a8a76' : '#6e4e33';
      const parts = [P('cyl6', HC.shade(bark, -0.2), [0, 0.06, 0], [tr * 2.6, 0.14, tr * 2.6])]; // root flare
      if (t.type === 'pine') {
        parts.push(P('taper', bark, [0, len * 0.3, 0], [tr * 2, len * 0.6, tr * 2]));
        const tiers = 7;
        for (let i = 0; i < tiers; i++) {
          const f = i / (tiers - 1), y = len * (0.24 + f * 0.62), rad = cr * (1.9 - f * 1.45) * (0.92 + r() * 0.16);
          parts.push(P('cone', ['#21492f', '#28563a', '#2f6343', '#376f4b'][i % 4], [0, y, 0], [rad, len * 0.24, rad], [0, r() * 3, 0]));
        }
      } else if (t.type === 'dead') {
        parts.push(P('taper', bark, [0, len * 0.45, 0], [tr * 2, len * 0.9, tr * 2]));
        for (let i = 0; i < 6; i++) {
          const a = i * 1.05 + r(), h = len * (0.45 + r() * 0.45), l = cr * (0.8 + r() * 0.5);
          parts.push(P('cyl6', bark, [Math.cos(a) * l * 0.45, h + l * 0.25, Math.sin(a) * l * 0.45], [0.09, l, 0.09], [Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9]));
        }
      } else if (t.type === 'sapling') {
        parts.push(P('taper', '#7a5a3a', [0, len * 0.3, 0], [0.12, len * 0.6, 0.12]));
        parts.push(P('ico0', '#7fb54a', [0, len * 0.72, 0], [cr * 1.8, len * 0.5, cr * 1.8]));
      } else {
        // broadleaf: a trunk that forks into limbs, then many leaf clusters, darker underneath
        const base = t.type === 'maple' ? t.maple : d.color;
        const dark = HC.shade(base, -0.22), mid = HC.shade(base, -0.08), lite = HC.shade(base, 0.12);
        const top = len - cr * 0.95;
        parts.push(P('taper', bark, [0, top * 0.45, 0], [tr * 2, top * 0.9, tr * 2]));
        for (let i = 0; i < 4; i++) { const a = i * 1.57 + r(); parts.push(P('cyl6', bark, [Math.cos(a) * cr * 0.28, top * 0.88, Math.sin(a) * cr * 0.28], [tr * 0.9, cr * 1.0, tr * 0.9], [Math.sin(a) * 0.75, 0, -Math.cos(a) * 0.75])); }
        parts.push(P('ico', dark, [0, top - cr * 0.05, 0], [cr * 1.7, cr * 1.1, cr * 1.7]));
        const n = t.type === 'oak' ? 11 : 9;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * 6.283 + r() * 0.5, rr = cr * (0.45 + r() * 0.3), h = top + (r() - 0.35) * cr * 0.7;
          const sz = cr * (0.62 + r() * 0.3);
          parts.push(P('ico', h > top ? mid : dark, [Math.cos(a) * rr, h, Math.sin(a) * rr], [sz, sz * 0.8, sz]));
        }
        for (let i = 0; i < 5; i++) { const a = i * 1.26 + r(); parts.push(P('ico', i % 2 ? lite : base, [Math.cos(a) * cr * 0.3, top + cr * (0.45 + r() * 0.2), Math.sin(a) * cr * 0.3], [cr * 0.7, cr * 0.5, cr * 0.7])); }
      }
      return build(parts);
    });
  }
  const ribbonGeo = () => cache('ribbon', () => build([P('cyl', '#ff4f9a', [0, 0.9, 0], [1, 0.14, 1]), P('box', '#ff4f9a', [0.5, 0.85, 0], [0.18, 0.3, 0.05])]));
  function logGeo(it) {
    return cache(`log_${it.wood}_${Math.round((it.w || 14) / 3)}`, () => {
      const r = Math.max(0.16, ((it.w || 14) / TS) * 0.42), l = 0.75;
      const bark = it.wood === 'pine' ? '#8a5f39' : it.wood === 'dead' ? '#9d8f7c' : '#6f4d32';
      return build([P('cyl', bark, [0, r, 0], [r * 2, l, r * 2], [0, 0, Math.PI / 2]),
        P('cyl', '#e3c08a', [l / 2 + 0.005, r, 0], [r * 1.7, 0.02, r * 1.7], [0, 0, Math.PI / 2]),
        P('cyl', '#e3c08a', [-l / 2 - 0.005, r, 0], [r * 1.7, 0.02, r * 1.7], [0, 0, Math.PI / 2]),
        P('cyl', '#b8935c', [l / 2 + 0.01, r, 0], [r * 0.7, 0.01, r * 0.7], [0, 0, Math.PI / 2])]);
    });
  }
  const brushGeo = (seed) => cache('brush' + (Math.floor(seed) % 3), () => {
    const r = rnd(Math.floor(seed) % 3 + 11), parts = [];
    for (let i = 0; i < 4; i++) parts.push(P('cyl6', '#6b4a2b', [0, 0.12, 0], [0.05, 0.95, 0.05], [0, r() * 3, Math.PI / 2 - 0.2]));
    for (let i = 0; i < 6; i++) { const a = i * 1.1; parts.push(P('ico0', i % 2 ? '#4d7d2e' : '#6a9a3a', [Math.cos(a) * 0.24, 0.18 + r() * 0.12, Math.sin(a) * 0.24], [0.34, 0.28, 0.34])); }
    return build(parts);
  });
  const rockGeo = () => cache('rock', () => build([P('dode', '#8b8e93', [0, 0.14, 0], [0.62, 0.42, 0.52]), P('dode', '#a7abb0', [-0.08, 0.24, -0.05], [0.32, 0.22, 0.3])]));
  const boulderGeo = (s) => cache('boulder' + (Math.floor(s) % 3), () => {
    const r = rnd(Math.floor(s) % 3 + 21);
    return build([P('dode', '#878a8e', [0, 0.3, 0], [1, 0.75, 0.85], [r(), r(), 0]), P('dode', '#9da1a5', [0.15, 0.48, -0.1], [0.55, 0.4, 0.5]), P('ico0', '#6f9a45', [-0.3, 0.62, 0.1], [0.3, 0.08, 0.3])]);
  });
  const stumpGeo = (type) => cache('stump' + type, () => build([P('cyl', type === 'pine' ? '#7a5434' : '#6b4b30', [0, 0.12, 0], [1, 0.24, 1]), P('cyl', '#d6b27c', [0, 0.245, 0], [0.82, 0.01, 0.82]), P('cyl', '#b8935c', [0, 0.25, 0], [0.4, 0.01, 0.4])]));
  const bushGeo = (seed) => cache('bush' + (Math.floor(seed) % 3), () => {
    const r = rnd(Math.floor(seed) % 3 + 5), parts = [];
    for (let i = 0; i < 4; i++) { const a = i * 1.6 + r(); parts.push(P('ico', i % 2 ? '#4a7f2c' : '#5d9535', [Math.cos(a) * 0.22, 0.25, Math.sin(a) * 0.22], [0.6, 0.5, 0.6])); }
    parts.push(P('ico', '#74ad45', [0, 0.42, 0], [0.5, 0.4, 0.5]));
    return build(parts);
  });
  const plantGeo = (color) => cache('plant' + color, () => {
    const parts = [P('ico', '#3f8a3a', [0, 0.25, 0], [0.55, 0.5, 0.55])];
    for (let i = 0; i < 5; i++) { const a = i * 1.3; parts.push(P('ico0', color, [Math.cos(a) * 0.2, 0.42, Math.sin(a) * 0.2], [0.1, 0.1, 0.1])); }
    return build(parts);
  });

  function prism(w, d, h) {
    const g = new THREE.BufferGeometry();
    const x0 = -w / 2, x1 = w / 2, z0 = -d / 2, z1 = d / 2;
    g.setAttribute('position', new THREE.Float32BufferAttribute([
      x0, 0, z1, x1, 0, z1, x1, h, 0, x0, 0, z1, x1, h, 0, x0, h, 0,
      x1, 0, z0, x0, 0, z0, x0, h, 0, x1, 0, z0, x0, h, 0, x1, h, 0,
      x0, 0, z0, x0, 0, z1, x0, h, 0, x1, 0, z1, x1, 0, z0, x1, h, 0,
    ], 3));
    return g;
  }
  // ---- house styles, built in metres. Front (door side) faces +Z. ----
  function hipRoof(w, d, hgt) {
    const g = new THREE.BufferGeometry(), x0 = -w / 2, x1 = w / 2, z0 = -d / 2, z1 = d / 2, r = Math.max(0, w / 2 - d / 2);
    g.setAttribute('position', new THREE.Float32BufferAttribute([
      x0, 0, z1, x1, 0, z1, r, hgt, 0, x0, 0, z1, r, hgt, 0, -r, hgt, 0,
      x1, 0, z0, x0, 0, z0, -r, hgt, 0, x1, 0, z0, -r, hgt, 0, r, hgt, 0,
      x0, 0, z0, x0, 0, z1, -r, hgt, 0, x1, 0, z1, x1, 0, z0, r, hgt, 0], 3));
    return g;
  }
  function windowM(x, y, z, w, hgt, h, face = 'front', shutters = false) {
    const p = [], fz = face === 'front' ? 1 : -1;
    const box = (dx, dy, sw, sh, c, dz = 0.02) => face === 'side' ? Pm('box', c, [x, y + dy, z + dx], [0.06, sh, sw]) : Pm('box', c, [x + dx, y + dy, z + fz * dz], [sw, sh, 0.06]);
    p.push(box(0, 0, w + 0.16, hgt + 0.16, h.trim, 0.03), box(0, 0, w, hgt, '#9fc4d6', 0.05), box(0, 0, 0.05, hgt, h.trim, 0.07), box(0, 0, w, 0.05, h.trim, 0.07));
    if (shutters) p.push(box(-w / 2 - 0.22, 0, 0.3, hgt + 0.1, h.shutter, 0.05), box(w / 2 + 0.22, 0, 0.3, hgt + 0.1, h.shutter, 0.05));
    return p;
  }
  function sidingM(W, D, y0, y1, c) { const p = []; for (let y = y0 + 0.25; y < y1; y += 0.32) p.push(Pm('box', HC.shade(c, -0.07), [0, y, D / 2 + 0.006], [W, 0.025, 0.01]), Pm('box', HC.shade(c, -0.07), [0, y, -D / 2 - 0.006], [W, 0.025, 0.01])); return p; }
  function styledHouseGeo(h) {
    const Wt = (h.w / TS) * 3, D = (h.h / TS) * 3, p = [];
    const gW = h.garage ? 6.2 : 0, W = Wt - gW, cx = h.garage === 'L' ? gW / 2 : h.garage === 'R' ? -gW / 2 : 0;
    const shift = (parts) => parts.map((q) => ({ ...q, pos: [q.pos[0] + cx * MM, q.pos[1], q.pos[2]] }));
    const st = h.style || 'ranch', body = [];
    const front = D / 2;
    const door = (x, y0 = 0.4) => [Pm('box', h.trim, [x, y0 + 1.05, front + 0.03], [1.2, 2.2, 0.06]), Pm('box', h.door, [x, y0 + 1.0, front + 0.06], [0.95, 2.05, 0.05]), Pm('box', '#d6b25a', [x + 0.3, y0 + 1.0, front + 0.1], [0.08, 0.08, 0.06])];
    if (st === 'ranch' || st === 'cape') {
      const wallH = st === 'cape' ? 3.0 : 2.8, rise = st === 'cape' ? D * 0.5 : D * 0.22;
      body.push(Pm('box', HC.shade(h.wall, -0.3), [0, 0.2, 0], [W + 0.1, 0.4, D + 0.1]), Pm('box', h.wall, [0, 0.4 + wallH / 2, 0], [W, wallH, D]), ...sidingM(W, D, 0.4, 0.4 + wallH, h.wall));
      body.push(Pm(prism(W + 0.8, D + 0.8, rise), h.roof, [0, 0.4 + wallH, 0]), Pm('box', HC.shade(h.roof, -0.2), [0, 0.4 + wallH + rise, 0], [W + 0.8, 0.12, 0.14]));
      body.push(...door(st === 'cape' ? 0 : -W * 0.15));
      const nW = Math.max(2, Math.round(W / 4));
      for (let i = 0; i < nW; i++) { const x = -W / 2 + (W / nW) * (i + 0.5); if (Math.abs(x - (st === 'cape' ? 0 : -W * 0.15)) > 1.4) body.push(...windowM(x, 1.9, front, 1.3, 1.4, h, 'front', st === 'cape')); }
      body.push(...windowM(W / 2 + 0.02, 1.9, 0, 1.2, 1.3, h, 'side'));
      if (st === 'cape') for (const x of [-W * 0.25, W * 0.25]) { // dormers
        const dy = 0.4 + wallH + rise * 0.35, dz = D * 0.2;
        body.push(Pm('box', h.wall, [x, dy + 0.6, dz], [1.6, 1.3, 1.4]), Pm(prism(1.9, 1.7, 0.7), h.roof, [x, dy + 1.25, dz], [1, 1, 1], [0, Math.PI / 2, 0]), ...windowM(x, dy + 0.65, dz + 0.71, 0.9, 0.9, h));
      }
      if (st === 'ranch') body.push(Pm('box', '#8a7a68', [-W * 0.15, 0.25, front + 1.0], [3.0, 0.2, 2.0]));
      body.push(Pm('box', '#8e4a3a', [W * 0.3, 0.4 + wallH + rise * 0.6, -D * 0.1], [0.8, rise * 1.4, 0.8]));
    } else if (st === 'colonial') {
      const wallH = 5.6;
      body.push(Pm('box', HC.shade(h.wall, -0.3), [0, 0.2, 0], [W + 0.1, 0.4, D + 0.1]), Pm('box', h.wall, [0, 0.4 + wallH / 2, 0], [W, wallH, D]), ...sidingM(W, D, 0.4, 0.4 + wallH, h.wall));
      body.push(Pm(hipRoof(W + 0.7, D + 0.7, 2.2), h.roof, [0, 0.4 + wallH, 0]));
      for (const row of [1.9, 4.6]) for (const x of [-W * 0.33, -W * 0.13, W * 0.13, W * 0.33]) if (!(row < 3 && Math.abs(x) < 1.5)) body.push(...windowM(x, row, front, 1.0, 1.5, h, 'front', true));
      body.push(...windowM(0, 4.6, front, 1.0, 1.5, h, 'front', true), ...door(0));
      body.push(Pm('box', h.trim, [-0.95, 1.6, front + 1.1], [0.22, 2.8, 0.22]), Pm('box', h.trim, [0.95, 1.6, front + 1.1], [0.22, 2.8, 0.22]),
        Pm(prism(2.8, 1.4, 0.7), h.trim, [0, 3.0, front + 0.7], [1, 1, 1], [0, 0, 0]), Pm('box', '#9a9a92', [0, 0.25, front + 1.1], [3.0, 0.3, 1.8]));
      body.push(Pm('box', '#8e4a3a', [-W / 2 + 0.6, 0.4 + wallH + 1.2, 0], [1.0, 3.2, 1.2]));
    } else if (st === 'farmhouse') {
      const wallH = 5.4, rise = D * 0.45;
      body.push(Pm('box', HC.shade(h.wall, -0.35), [0, 0.3, 0], [W + 0.1, 0.6, D + 0.1]), Pm('box', h.wall, [0, 0.6 + wallH / 2, 0], [W, wallH, D]), ...sidingM(W, D, 0.6, 0.6 + wallH, h.wall));
      body.push(Pm(prism(W + 0.6, D + 0.6, rise), h.roof, [0, 0.6 + wallH, 0]));
      for (let x = -W / 2; x <= W / 2; x += 0.6) body.push(Pm('box', HC.shade(h.roof, 0.12), [x, 0.6 + wallH + rise * 0.5, D * 0.26], [0.04, 0.03, D * 0.55], [Math.atan2(rise, D / 2 + 0.3), 0, 0]));
      for (const row of [2.0, 4.6]) for (const x of [-W * 0.32, 0, W * 0.32]) if (!(row < 3 && x === 0)) body.push(...windowM(x, row, front, 1.0, 1.6, h));
      body.push(...door(0, 0.6));
      // wraparound porch: front and one side
      const pd = 2.4;
      body.push(Pm('box', '#a8a49a', [0, 0.45, front + pd / 2], [W + pd, 0.2, pd]), Pm('box', '#a8a49a', [W / 2 + pd / 2, 0.45, 0], [pd, 0.2, D]));
      for (let x = -W / 2; x <= W / 2 + pd * 0.9; x += 2.2) body.push(Pm('box', h.trim, [x, 1.75, front + pd - 0.15], [0.16, 2.6, 0.16]));
      for (let z = -D / 2 + 0.2; z < front; z += 2.2) body.push(Pm('box', h.trim, [W / 2 + pd - 0.15, 1.75, z], [0.16, 2.6, 0.16]));
      body.push(Pm('box', h.roof, [0, 3.1, front + pd / 2], [W + pd + 0.3, 0.1, pd + 0.3], [0.2, 0, 0]), Pm('box', h.roof, [W / 2 + pd / 2, 3.1, 0], [pd + 0.3, 0.1, D + 0.3], [0, 0, -0.2]));
      for (let x = -W / 2 + 0.1; x < W / 2 + pd; x += 0.25) body.push(Pm('box', h.trim, [x, 0.95, front + pd - 0.12], [0.05, 0.8, 0.05]));
    } else if (st === 'cabin') {
      const wallH = 3.0, rise = D * 0.42;
      body.push(Pm('box', '#7a7a74', [0, 0.25, 0], [W + 0.2, 0.5, D + 0.2]));
      for (let y = 0.65; y < 0.5 + wallH; y += 0.3) for (const z of [front, -front]) body.push(Pm('cyl', HC.shade(h.wall, (y * 7) % 2 > 1 ? 0.05 : -0.05), [0, y, z], [0.32, W + 0.5, 0.32], [0, 0, Math.PI / 2]));
      for (let y = 0.65; y < 0.5 + wallH; y += 0.3) for (const x of [W / 2, -W / 2]) body.push(Pm('cyl', HC.shade(h.wall, -0.03), [x, y, 0], [0.32, D + 0.5, 0.32], [Math.PI / 2, 0, 0]));
      body.push(Pm('box', h.wall, [0, 0.5 + wallH / 2, 0], [W - 0.1, wallH, D - 0.1]), Pm(prism(W + 1.2, D + 1.4, rise), h.roof, [0, 0.5 + wallH, 0]));
      for (let x = -W / 2 - 0.6; x <= W / 2 + 0.6; x += 0.5) body.push(Pm('box', HC.shade(h.roof, 0.1), [x, 0.5 + wallH + rise * 0.5, D * 0.26], [0.04, 0.03, D * 0.6], [Math.atan2(rise, D / 2 + 0.7), 0, 0]));
      body.push(...door(0, 0.5), ...windowM(-W * 0.3, 1.9, front + 0.12, 1.1, 1.1, h), ...windowM(W * 0.3, 1.9, front + 0.12, 1.1, 1.1, h));
      body.push(Pm('box', '#8a8580', [-W / 2 - 0.6, 3.0, 0], [1.1, 6.0, 1.4]), Pm('box', '#6f6a66', [-W / 2 - 0.6, 6.1, 0], [0.8, 0.4, 1.0]));
      body.push(Pm('box', '#7a5a3a', [0, 0.5, front + 1.2], [W * 0.7, 0.15, 2.2]), Pm('box', '#6a4a2a', [-W * 0.32, 1.6, front + 2.2], [0.25, 2.2, 0.25]), Pm('box', '#6a4a2a', [W * 0.32, 1.6, front + 2.2], [0.25, 2.2, 0.25]),
        Pm('box', h.roof, [0, 2.75, front + 1.2], [W * 0.75, 0.1, 2.5], [0.25, 0, 0]));
    } else { // modern: two flat-roofed boxes, dark siding, wood accent, big glass
      const h1 = 3.2, h2 = 6.0, wA = W * 0.58, wB = W - wA;
      body.push(Pm('box', h.wall, [-W / 2 + wA / 2, h1 / 2, 0], [wA, h1, D]), Pm('box', HC.shade(h.wall, 0.1), [W / 2 - wB / 2, h2 / 2, -D * 0.1], [wB, h2, D * 0.8]),
        Pm('box', '#a0703f', [W / 2 - wB / 2, h2 * 0.7, D * 0.3 + 0.02], [wB * 0.9, h2 * 0.5, 0.06]),
        Pm('box', h.roof, [-W / 2 + wA / 2, h1 + 0.1, 0], [wA + 0.4, 0.2, D + 0.4]), Pm('box', h.roof, [W / 2 - wB / 2, h2 + 0.1, -D * 0.1], [wB + 0.4, 0.2, D * 0.8 + 0.4]),
        Pm('box', '#9fc4d6', [-W / 2 + wA * 0.45, 1.5, front + 0.03], [wA * 0.6, 2.4, 0.05]), Pm('box', '#2a2c2f', [-W / 2 + wA * 0.45, 1.5, front + 0.05], [0.06, 2.4, 0.06]),
        Pm('box', '#9fc4d6', [W / 2 - wB / 2, 4.4, D * 0.3 + 0.06], [wB * 0.6, 1.4, 0.05]), Pm('box', '#2a2c2f', [-W * 0.02, 1.15, front + 0.05], [1.0, 2.3, 0.05]),
        Pm('box', '#c9c9c4', [-W / 2 + wA * 0.45, 0.1, front + 1.4], [wA * 0.8, 0.2, 2.6]));
    }
    p.push(...shift(body));
    if (h.garage) { // attached garage with its own roof and door
      const gx = h.garage === 'L' ? -Wt / 2 + gW / 2 : Wt / 2 - gW / 2, gH = st === 'modern' ? 3.0 : 2.9;
      p.push(Pm('box', HC.shade(h.wall, -0.3), [gx, 0.15, 0], [gW, 0.3, D * 0.9]), Pm('box', h.wall, [gx, 0.3 + gH / 2, 0], [gW, gH, D * 0.9]),
        st === 'modern' ? Pm('box', h.roof, [gx, 0.3 + gH + 0.1, 0], [gW + 0.3, 0.2, D * 0.9 + 0.3]) : Pm(prism(gW + 0.5, D * 0.9 + 0.6, D * 0.18), h.roof, [gx, 0.3 + gH, 0]),
        Pm('box', '#f4f2ec', [gx, 1.35, D * 0.45 + 0.03], [4.8, 2.3, 0.06]));
      for (let y = 0.5; y < 2.5; y += 0.5) p.push(Pm('box', '#d6d4ce', [gx, y, D * 0.45 + 0.07], [4.8, 0.03, 0.02]));
    }
    return build(p);
  }
  function houseGeo(h) {
    if (!h.yard && h.style) {
      if (!h.damaged.length) return styledHouseGeo(h);
      const g = styledHouseGeo(h), dm = h.damaged.map((dmg) => { const x = HC.clamp(U(dmg.x) - U(h.w) / 2, -U(h.w) / 2 + 0.4, U(h.w) / 2 - 0.4), z = HC.clamp(U(dmg.y) - U(h.h) / 2, -U(h.h) / 2 + 0.4, U(h.h) / 2 - 0.4) * (h.facing === -1 ? -1 : 1); return [P('ico0', '#241a14', [x, 1.25, z], [1.1, 0.4, 1.1]), P('cyl6', '#6e4e33', [x, 1.5, z], [0.25, 2.4, 0.25], [0.3, 0.6, 1.2]), P('ico0', '#3f7d2c', [x + 0.6, 1.7, z], [1.2, 0.8, 1.2])]; }).flat();
      const g2 = build(dm), merged = new THREE.BufferGeometry();
      for (const name of ['position', 'normal', 'color', 'onorm', 'pbr']) { const a = g.attributes[name].array, b = g2.attributes[name].array, c = new Float32Array(a.length + b.length); c.set(a); c.set(b, a.length); merged.setAttribute(name, new THREE.BufferAttribute(c, name === 'pbr' ? 2 : 3)); }
      merged.computeBoundingSphere();
      return merged;
    }
    const W = U(h.w), D = U(h.h), wallH = h.shed ? 2.2 : 1.7, roofH = h.shed ? 1.0 : 1.5;
    const parts = [
      P('box', HC.shade(h.wall, -0.25), [0, 0.1, 0], [W + 0.1, 0.2, D + 0.1]), // foundation
      P('box', h.wall, [0, wallH / 2 + 0.1, 0], [W, wallH, D]),
      P(prism(W + 0.5, D + 0.5, roofH), h.roof, [0, wallH + 0.1, 0]),
      P('box', HC.shade(h.roof, 0.2), [0, wallH + roofH + 0.06, 0], [W + 0.5, 0.1, 0.1]),
    ];
    for (let x = -W / 2 + 0.6; x < W / 2; x += 1.6) parts.push(P('box', HC.shade(h.wall, -0.08), [x, wallH / 2 + 0.1, D / 2 + 0.005], [0.04, wallH, 0.02]));
    if (h.shed) {
      parts.push(P('box', '#5c6168', [-W * 0.15, 0.95, D / 2 + 0.02], [W * 0.45, 1.7, 0.06]));
      for (let i = 0; i < 6; i++) parts.push(P('box', '#4b5056', [-W * 0.15, 0.25 + i * 0.28, D / 2 + 0.05], [W * 0.45, 0.04, 0.04]));
      parts.push(P('box', '#5a3a26', [W * 0.3, 0.6, D / 2 + 0.02], [0.45, 1.1, 0.06]));
    } else {
      parts.push(P('box', '#5a3a26', [0, 0.65, D / 2 + 0.02], [0.45, 1.1, 0.06]), P('box', '#d6b25a', [0.15, 0.65, D / 2 + 0.05], [0.04, 0.04, 0.04]));
      for (const x of [-W * 0.3, W * 0.3]) {
        parts.push(P('box', '#bfe3f2', [x, 1.05, D / 2 + 0.02], [0.6, 0.5, 0.05]), P('box', '#ffffff', [x, 1.05, D / 2 + 0.035], [0.66, 0.06, 0.03]));
        parts.push(P('box', HC.shade(h.roof, 0.1), [x - 0.38, 1.05, D / 2 + 0.03], [0.1, 0.55, 0.03]), P('box', HC.shade(h.roof, 0.1), [x + 0.38, 1.05, D / 2 + 0.03], [0.1, 0.55, 0.03]));
      }
      for (const z of [-D * 0.2, D * 0.2]) parts.push(P('box', '#bfe3f2', [W / 2 + 0.02, 1.05, z], [0.05, 0.45, 0.5]));
      parts.push(P('box', '#9a4a3a', [W * 0.25, wallH + 1.1, -D * 0.15], [0.4, 1.2, 0.4]));
      parts.push(P('box', '#a07a52', [0, 0.12, D / 2 + 0.5], [1.8, 0.16, 0.85]));
      for (const x of [-0.8, 0.8]) parts.push(P('box', '#e8e0d0', [x, 0.75, D / 2 + 0.85], [0.08, 1.2, 0.08]));
      parts.push(P('box', h.roof, [0, 1.38, D / 2 + 0.55], [1.9, 0.08, 0.95], [0.25, 0, 0]));
    }
    if (h.label === 'Office') parts.push(P('box', '#f07a22', [0, wallH + 0.15, D / 2 + 0.3], [2.6, 0.5, 0.08]));
    const vs = h.shed ? 0.72 : 0.6;
    for (const q of parts) { q.pos = [q.pos[0], q.pos[1] * vs, q.pos[2]]; q.scl = [q.scl[0], q.scl[1] * vs, q.scl[2]]; }
    for (const dmg of h.damaged) {
      const x = HC.clamp(U(dmg.x) - W / 2, -W / 2 + 0.4, W / 2 - 0.4), z = HC.clamp(U(dmg.y) - D / 2, -D / 2 + 0.4, D / 2 - 0.4) * (h.facing === -1 ? -1 : 1);
      parts.push(P('ico0', '#241a14', [x, (wallH + 0.7) * vs, z], [1.1, 0.4, 1.1]));
      parts.push(P('cyl6', '#6e4e33', [x, (wallH + 1.0) * vs, z], [0.25, 2.4, 0.25], [0.3, 0.6, 1.2]));
      parts.push(P('ico0', '#3f7d2c', [x + 0.6, (wallH + 1.2) * vs, z], [1.2, 0.8, 1.2]));
    }
    return build(parts);
  }

  // ---------- equipment models, built to real dimensions in metres (1 tile = 3 m), +X is forward ----------
  const MM = 1 / 3;
  const Pm = (g, color, pos, scl = [1, 1, 1], rot = [0, 0, 0]) => Object.assign(P(g, color, pos.map((v) => v * MM), scl.map((v) => v * MM), rot), { eq: true }); // custom geometry built in metres: leave scl at 1
  const COL = { cat: '#f2b600', catDark: '#c99600', black: '#1b1c1e', frame: '#2b2d30', steel: '#6d7176', glass: '#4f6e80', chrome: '#c9ced3', tire: '#18191a', rim: '#b9bdc2', amber: '#ffb000', red: '#c8232c' };
  // A wheel: tyre with rounded shoulders and tread, rim with a dished face, hub and lug nuts.
  // Every part is tagged with its hub so build() can split the wheel into its own piece that rolls (and steers).
  function wheelM(x, y, z, r, w, rim = COL.rim, o = {}) {
    const s = Math.sign(z) || 1, X = Math.PI / 2, face = z + s * (w / 2), wh = { c: [x * MM, y * MM, z * MM], r: r * MM };
    const big = r >= 0.6, p = [Pm('tyre', COL.tire, [x, y, z], [r * 2, w * 0.82, r * 2], [X, 0, 0]),
      ...[1, -1].map((q) => Pm('sph', '#1b1c1d', [x, y, z + q * w * 0.41], [r * 1.98, Math.min(0.16, w * 0.32), r * 1.98], [X, 0, 0])),
      Pm('cyl', '#232425', [x, y, face + s * 0.004], [r * 1.55, 0.012, r * 1.55], [X, 0, 0]),
      Pm('cyl', rim, [x, y, face + s * 0.008], [r * 1.22, 0.02, r * 1.22], [X, 0, 0]),
      Pm('cyl', HC.shade(rim, -0.18), [x, y, face + s * 0.012], [r * 1.0, 0.02, r * 1.0], [X, 0, 0]),
      Pm('cyl', rim, [x, y, face + s * 0.02], [r * 0.62, 0.03, r * 0.62], [X, 0, 0]),
      Pm('cyl', '#3a3b3d', [x, y, face + s * 0.04], [r * 0.3, 0.05, r * 0.3], [X, 0, 0])];
    const lugs = big ? 12 : 8;
    for (let i = 0; i < lugs; i++) { const a = (i / lugs) * Math.PI * 2; p.push(Pm('cyl', '#c9ced3', [x + Math.cos(a) * r * 0.24, y + Math.sin(a) * r * 0.24, face + s * 0.035], [r * 0.07, 0.03, r * 0.07], [X, 0, 0])); }
    if (!o.slick && r >= 0.25) { // tread: staggered lugs on road tyres, deep angled bars on off-road ones
      const n = Math.max(14, Math.round(r * (big ? 30 : 44)));
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        if (big) for (const q of [1, -1]) p.push(Pm('box', '#141516', [x + Math.cos(a) * (r - 0.012), y + Math.sin(a) * (r - 0.012), z + q * w * 0.2], [0.1, 0.06, w * 0.4], [q * 0.35, 0, a]));
        else p.push(Pm('box', '#1e1f20', [x + Math.cos(a) * (r - 0.004), y + Math.sin(a) * (r - 0.004), z], [r * 0.09, 0.014, w * 0.72], [0, 0, a]));
      }
    }
    for (const q of p) q.wh = wh;
    return p;
  }
  // people: 1.8 m tall, hi-vis vest with reflective stripes, hard hat
  function personM(vest, hat, opts = {}) {
    const legs = opts.chaps ? '#e0661c' : '#2e3f58';
    const p = [
      Pm('box', '#3b2a1e', [0.04, 0.06, -0.11], [0.28, 0.12, 0.13]), Pm('box', '#3b2a1e', [0.04, 0.06, 0.11], [0.28, 0.12, 0.13]),
      Pm('box', legs, [0, 0.5, -0.11], [0.17, 0.78, 0.15]), Pm('box', legs, [0, 0.5, 0.11], [0.17, 0.78, 0.15]),
      Pm('box', '#2e3f58', [0, 0.95, 0], [0.22, 0.16, 0.4]),
      Pm('box', '#4a5a6a', [0, 1.25, 0], [0.24, 0.52, 0.42]), Pm('box', vest, [0.005, 1.27, 0], [0.26, 0.46, 0.44]),
      Pm('box', '#e8eef0', [0.137, 1.18, 0], [0.005, 0.05, 0.44]), Pm('box', '#e8eef0', [0.137, 1.32, -0.12], [0.005, 0.36, 0.05]), Pm('box', '#e8eef0', [0.137, 1.32, 0.12], [0.005, 0.36, 0.05]),
      Pm('box', '#d7a982', [0, 1.55, 0], [0.1, 0.08, 0.1]), Pm('sph', '#d7a982', [0.01, 1.66, 0], [0.21, 0.24, 0.2]),
      Pm('sph', hat, [0, 1.75, 0], [0.27, 0.16, 0.27]), Pm('box', hat, [0.1, 1.72, 0], [0.16, 0.025, 0.26]),
    ];
    const arm = opts.arms || 'down';
    for (const z of [-0.26, 0.26]) {
      if (arm === 'forward') p.push(Pm('box', vest, [0.16, 1.3, z * 0.9], [0.34, 0.11, 0.11]), Pm('sph', '#d7a982', [0.36, 1.28, z * 0.8], [0.09, 0.09, 0.09]));
      else p.push(Pm('box', vest, [0, 1.12, z], [0.11, 0.55, 0.11]), Pm('sph', '#d7a982', [0, 0.82, z], [0.09, 0.09, 0.09]));
    }
    if (opts.visor) p.push(Pm('box', '#9fb3ba', [0.15, 1.66, 0], [0.01, 0.13, 0.24]), Pm('box', '#f4c020', [0, 1.67, -0.15], [0.1, 0.1, 0.04]), Pm('box', '#f4c020', [0, 1.67, 0.15], [0.1, 0.1, 0.04]));
    return p;
  }
  function personRig(vest, hat, opts = {}) {
    const legsCol = opts.chaps ? '#e0661c' : '#2e3f58', skin = '#d7a982', root = new THREE.Group(), body = new THREE.Group();
    body.position.y = 0.92 * MM; root.add(body);
    const part = (parts, key) => model(cache('rig_' + key, () => build(parts)));
    body.add(part([Pm('box', '#2e3f58', [0, 0.03, 0], [0.22, 0.16, 0.4]), Pm('box', '#4a5a6a', [0, 0.33, 0], [0.24, 0.52, 0.42]), Pm('box', vest, [0.005, 0.35, 0], [0.26, 0.46, 0.44]),
      Pm('box', '#e8eef0', [0.137, 0.26, 0], [0.005, 0.05, 0.44]), Pm('box', '#e8eef0', [0.137, 0.4, -0.12], [0.005, 0.36, 0.05]), Pm('box', '#e8eef0', [0.137, 0.4, 0.12], [0.005, 0.36, 0.05]),
      Pm('box', skin, [0, 0.63, 0], [0.1, 0.08, 0.1]), Pm('sph', skin, [0.01, 0.74, 0], [0.21, 0.24, 0.2]),
      Pm('sph', hat, [0, 0.83, 0], [0.27, 0.16, 0.27]), Pm('box', hat, [0.1, 0.8, 0], [0.16, 0.025, 0.26]),
      ...(opts.visor ? [Pm('box', '#9fb3ba', [0.15, 0.74, 0], [0.01, 0.13, 0.24])] : [])], 'body_' + vest + hat + (opts.visor ? 'v' : '')));
    const limb = (parent, at, parts, key) => { const g2 = new THREE.Group(); g2.position.set(at[0] * MM, at[1] * MM, at[2] * MM); g2.add(part(parts, key)); parent.add(g2); return g2; };
    const legs = [-0.11, 0.11].map((z) => limb(root, [0, 0.92, z], [Pm('box', legsCol, [0, -0.42, 0], [0.17, 0.8, 0.15]), Pm('box', '#3b2a1e', [0.05, -0.86, 0], [0.28, 0.12, 0.13])], 'leg_' + legsCol));
    const arms = [-0.26, 0.26].map((z) => limb(body, [0, 0.55, z], [Pm('box', vest, [0, -0.28, 0], [0.11, 0.55, 0.11]), Pm('sph', skin, [0, -0.6, 0], [0.09, 0.09, 0.09])], 'arm_' + vest));
    const handR = new THREE.Object3D(); handR.position.y = -0.6 * MM; arms[1].add(handR);
    const handL = new THREE.Object3D(); handL.position.y = -0.6 * MM; arms[0].add(handL);
    root.userData.rig = { body, legs, arms, handR, handL };
    return root;
  }
  function seatedM(vest = '#f07a22', hat = '#f4c020') {
    return [Pm('box', '#2e3f58', [0.2, 0.05, -0.11], [0.45, 0.15, 0.15]), Pm('box', '#2e3f58', [0.2, 0.05, 0.11], [0.45, 0.15, 0.15]),
      Pm('box', vest, [0, 0.4, 0], [0.24, 0.55, 0.42]), Pm('box', '#e8eef0', [0.125, 0.33, 0], [0.005, 0.05, 0.42]),
      Pm('box', vest, [0.2, 0.42, -0.24], [0.36, 0.1, 0.1]), Pm('box', vest, [0.2, 0.42, 0.24], [0.36, 0.1, 0.1]),
      Pm('sph', '#d7a982', [0.01, 0.82, 0], [0.21, 0.24, 0.2]), Pm('sph', hat, [0, 0.91, 0], [0.27, 0.16, 0.27]), Pm('box', hat, [0.1, 0.88, 0], [0.16, 0.025, 0.26])];
  }
  // chainsaw: a stand-alone item (about 0.9 m with a 20" bar)
  // chainsaw in the style of the references: white/grey powerhead, orange top cover, black wrap handle, rear handle,
  // white sprocket cover with nuts, and a long silver bar with the chain around it. Bar and body scale with the saw.
  function sawGeo(id) {
    const c = (HC.CHAINSAWS && HC.CHAINSAWS[id]) || { bar: 20, cc: 60 }, k = 0.8 + c.cc / 300, bar = c.bar * 0.0254;
    const L = 0.34 * k, H = 0.2 * k, Wd = 0.16 * k, w = '#ececea', gr = '#b7bbbf', o = '#ef7d1a', b = '#1c1d1f', X = Math.PI / 2;
    const top = c.top; // top-handle arborist saw: handle on top, no rear handle
    const p = [Pm('box', w, [0, 0, 0], [L, H, Wd]), Pm('box', gr, [-L * 0.05, -H * 0.42, 0], [L * 0.9, H * 0.18, Wd * 1.02]),
      Pm('box', o, [-L * 0.08, H * 0.48, 0], [L * 0.72, H * 0.32, Wd * 0.92]), Pm('sph', o, [-L * 0.12, H * 0.6, 0], [L * 0.6, H * 0.4, Wd * 0.85]), // top cover
      ...[0.03, -0.03].map((dz) => Pm('box', '#2b2d30', [L * 0.08, H * 0.2, Wd * 0.51 * Math.sign(dz)], [L * 0.32, H * 0.05, 0.004])), // cylinder vents
      Pm('box', w, [L * 0.42, -H * 0.05, Wd * 0.38], [L * 0.28, H * 0.6, 0.03]), ...[-0.03, 0.03].map((dx) => Pm('cyl', '#5d6064', [L * 0.42 + dx, -H * 0.05, Wd * 0.54], [0.018, 0.02, 0.018], [X, 0, 0])), // sprocket cover + nuts
      Pm('box', b, [L * 0.52, H * 0.25, 0], [0.025, H * 0.9, Wd * 1.1], [0, 0, 0.25])]; // chain brake / hand guard
    if (top) p.push(Pm('box', b, [-L * 0.05, H * 1.05, 0], [L * 0.75, 0.035, 0.035]), ...[-0.3, 0.25].map((f) => Pm('box', b, [L * f, H * 0.85, 0], [0.03, H * 0.4, 0.03])));
    else p.push(Pm('box', b, [L * 0.1, H * 0.95, 0], [0.035, 0.035, Wd * 1.35]), Pm('box', b, [L * 0.1, H * 0.35, -Wd * 0.68], [0.035, H * 1.2, 0.035]), // wrap handle
      Pm('box', b, [L * 0.1, -H * 0.3, Wd * 0.62], [0.035, 0.035, Wd * 0.3]),
      Pm('box', w, [-L * 0.62, -H * 0.15, 0], [L * 0.45, 0.04, 0.05]), Pm('box', w, [-L * 0.85, H * 0.15, 0], [0.04, H * 0.65, 0.05]), // rear handle loop
      Pm('box', b, [-L * 0.6, H * 0.42, 0], [L * 0.42, 0.045, 0.05]), Pm('box', '#2b2d30', [-L * 0.48, H * 0.32, 0], [0.04, 0.05, 0.03])); // grip + trigger
    // the bar: silver steel, rounded nose, a darker chain all round
    const bx = L * 0.5 + bar / 2;
    p.push(Pm('box', '#5b5e62', [bx, -H * 0.1, 0], [bar + 0.02, 0.085, 0.009]), Pm('box', '#dfe2e4', [bx, -H * 0.1, 0], [bar, 0.068, 0.014]),
      Pm('cyl', '#5b5e62', [L * 0.5 + bar, -H * 0.1, 0], [0.085, 0.009, 0.085], [X, 0, 0]), Pm('box', o, [bx - bar * 0.15, -H * 0.1, 0], [bar * 0.25, 0.018, 0.016]));
    return build(p);
  }
  const sawItemGeo = (id) => cache('saw_' + (id || 's60'), () => sawGeo(id || 's60'));

  // Crawler track: rounded belt, drive sprocket (rear) and idler (front) that turn, bottom rollers, track frame,
  // and a loop of links that travels around it as the machine moves (see trackLinks / rollWheels).
  function trackM(len, z, h, w, rollers = 4, o = {}) {
    const R = h / 2, S = len - 2 * R, X = Math.PI / 2, steel = o.steel !== false && len > 2.6;
    const belt = steel ? '#232426' : '#18191a';
    const p = [Pm('box', belt, [0, R, z], [S, h - 0.05, w * 0.94]),
      Pm('box', '#2b2d30', [0, R * 1.0, z], [S + R * 0.6, h * 0.42, w * 1.02]), // track frame
      Pm('box', '#34373b', [0, R * 1.25, z + Math.sign(z) * (w * 0.51)], [S * 0.9, h * 0.16, 0.02])];
    for (let i = 0; i < rollers; i++) p.push(Pm('cyl', COL.steel, [-S / 2 + (i * S) / Math.max(1, rollers - 1), 0.1 + h * 0.06, z], [h * 0.26, w * 1.04, h * 0.26], [X, 0, 0]));
    if (len > 2.4) for (const f of [-0.25, 0.25]) p.push(Pm('cyl', COL.steel, [S * f, h - 0.08, z], [h * 0.16, w * 0.5, h * 0.16], [X, 0, 0])); // carrier rollers
    // sprocket and idler turn with the track
    const sp = { c: [-S / 2 * MM, R * MM, z * MM], r: R * MM }, id = { c: [S / 2 * MM, R * MM, z * MM], r: R * MM };
    const spr = [Pm('cyl', '#3a3b3d', [-S / 2, R, z], [R * 1.7, w * 1.06, R * 1.7], [X, 0, 0]), Pm('cyl', '#55595d', [-S / 2, R, z + Math.sign(z) * w * 0.54], [R * 0.7, 0.03, R * 0.7], [X, 0, 0])];
    for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2; spr.push(Pm('box', '#2f3134', [-S / 2 + Math.cos(a) * R * 0.86, R + Math.sin(a) * R * 0.86, z], [R * 0.22, R * 0.22, w * 0.5], [0, 0, a])); }
    const idl = [Pm('cyl', '#4a4c50', [S / 2, R, z], [R * 1.6, w * 0.9, R * 1.6], [X, 0, 0]), Pm('cyl', '#2b2d30', [S / 2, R, z + Math.sign(z) * w * 0.47], [R * 0.6, 0.03, R * 0.6], [X, 0, 0])];
    for (const q of spr) q.wh = sp;
    for (const q of idl) q.wh = id;
    p.push(...spr, ...idl);
    // the moving link loop (no geometry here; model() turns it into instanced links)
    p.push({ g: null, track: { len: len * MM, h: h * MM, w: w * MM, z: z * MM, steel }, pos: [0, 0, 0], scl: [1, 1, 1], rot: [0, 0, 0] });
    return p;
  }
  function cabM(x, y0, h, len, w, color, z = 0) { // operator cab (ROPS/FOPS): slim posts, overhanging rounded roof, framed glass, door, seat, lights
    const X = Math.PI / 2, trim = '#1c1d1f', glass = '#4f6e80', p = [];
    for (const [dx, dz] of [[len / 2, w / 2], [len / 2, -w / 2], [-len / 2, w / 2], [-len / 2, -w / 2]]) p.push(Pm('box', trim, [x + dx, y0 + h / 2, z + dz], [0.08, h, 0.08]));
    // roof: overhanging cap with rounded edges, a light bar and LED work lights
    p.push(Pm('box', color, [x, y0 + h + 0.05, z], [len + 0.18, 0.1, w + 0.18]), Pm('box', HC.shade(color, 0.08), [x, y0 + h + 0.11, z], [len - 0.05, 0.04, w - 0.05]),
      ...[1, -1].map((s) => Pm('cyl', color, [x, y0 + h + 0.05, z + s * (w / 2 + 0.06)], [0.12, len + 0.16, 0.12], [0, 0, X])),
      Pm('box', COL.amber, [x - len * 0.3, y0 + h + 0.16, z + w * 0.3], [0.12, 0.08, 0.12]),
      ...[1, -1].map((s) => Pm('box', '#e6eef3', [x + len / 2 + 0.06, y0 + h - 0.02, z + s * w * 0.32], [0.04, 0.08, 0.14])));
    // glass in black frames: front, both sides (door on the left), rear
    p.push(Pm('box', glass, [x + len / 2, y0 + h * 0.55, z], [0.02, h * 0.82, w - 0.1]), Pm('box', trim, [x + len / 2 + 0.01, y0 + h * 0.13, z], [0.03, 0.05, w - 0.06]),
      Pm('box', glass, [x - len / 2, y0 + h * 0.62, z], [0.02, h * 0.6, w - 0.1]));
    for (const s of [1, -1]) {
      p.push(Pm('box', glass, [x, y0 + h * 0.58, z + s * w / 2], [len - 0.1, h * 0.74, 0.02]),
        Pm('box', trim, [x, y0 + h * 0.2, z + s * (w / 2 + 0.005)], [len - 0.06, 0.05, 0.02]), Pm('box', trim, [x - len * 0.05, y0 + h * 0.58, z + s * (w / 2 + 0.005)], [0.04, h * 0.74, 0.02]));
    }
    p.push(Pm('box', trim, [x + len * 0.15, y0 + h * 0.5, z + w / 2 + 0.02], [0.03, 0.4, 0.03]), // grab handle
      Pm('box', '#1c1d1f', [x - len * 0.18, y0 + 0.35, z], [0.45, 0.5, 0.48]), Pm('box', '#2b2d30', [x - len * 0.38, y0 + 0.75, z], [0.1, 0.6, 0.46]), // seat
      ...[1, -1].map((s) => Pm('box', trim, [x + len / 2 + 0.02, y0 + h * 0.62, z + s * (w / 2 + 0.12)], [0.04, 0.24, 0.12]))); // mirrors
    return p;
  }
  function truckCabM(x0, color, o = {}) { // conventional truck: hood front at x0; clean modern styling
    const hood = o.hood || 1.25, cabL = o.cabL || 2.4, w = o.w || 1.95, hy = o.hy || 1.0, ch = o.ch || 1.05, cy = o.cy || 1.05;
    const hx = x0 - hood / 2, cx = x0 - hood - cabL / 2, X = Math.PI / 2, tint = '#1d262c', trimC = '#1c1d1f', hw = w * 0.9;
    const roofY = cy + ch, front = cx + cabL / 2;
    const p = [
      // hood with rounded shoulders, fenders, and a cowl panel
      Pm('box', color, [hx, hy + 0.3, 0], [hood, 0.56, hw]), Pm('box', color, [hx - 0.02, hy + 0.6, 0], [hood * 0.96, 0.06, hw - 0.24]),
      ...[1, -1].map((s) => Pm('cyl', color, [hx, hy + 0.54, s * (hw / 2 - 0.1)], [0.2, hood, 0.2], [0, 0, X])),
      Pm('box', color, [hx, hy - 0.02, 0], [hood, 0.34, w]), // fenders
      ...[1, -1].map((s) => Pm('box', trimC, [hx + 0.05, hy - 0.2, s * (w / 2 + 0.01)], [hood * 0.8, 0.06, 0.03])), // fender flare trim
      Pm('box', HC.shade(color, -0.25), [front + 0.06, hy + 0.62, 0], [0.12, 0.03, w * 0.85]), // cowl
      // grille: chrome surround, dark mesh, three bars
      Pm('box', COL.chrome, [x0 + 0.02, hy + 0.28, 0], [0.06, 0.52, w * 0.56]), Pm('box', '#151719', [x0 + 0.05, hy + 0.28, 0], [0.01, 0.42, w * 0.5]),
      ...[0.18, 0.28, 0.38].map((y) => Pm('box', '#b9bdc2', [x0 + 0.056, hy + y, 0], [0.01, 0.035, w * 0.5])),
      // headlights with chrome bezels and amber corner lamps
      ...[1, -1].flatMap((s) => [Pm('box', COL.chrome, [x0 + 0.015, hy + 0.36, s * w * 0.37], [0.05, 0.2, w * 0.18]), Pm('box', '#e6eef3', [x0 + 0.04, hy + 0.36, s * w * 0.37], [0.02, 0.15, w * 0.15]),
        Pm('box', COL.amber, [x0 - 0.04, hy + 0.36, s * (w / 2 - 0.02)], [0.12, 0.14, 0.03])]),
      // bumper: chrome face, black valance, tow hooks
      Pm('box', COL.chrome, [x0 + 0.1, hy - 0.16, 0], [0.18, 0.26, w * 1.03]), Pm('box', trimC, [x0 + 0.04, hy - 0.34, 0], [0.12, 0.1, w * 0.9]),
      ...[1, -1].map((s) => Pm('box', '#c22', [x0 + 0.17, hy - 0.22, s * w * 0.3], [0.06, 0.05, 0.05])),
      // cab with rounded roof edges and a roof cap
      Pm('box', color, [cx, cy + ch / 2, 0], [cabL, ch, w]),
      Pm('box', color, [cx, roofY + 0.02, 0], [cabL - 0.06, 0.06, w - 0.3]), ...[1, -1].map((s) => Pm('cyl', color, [cx, roofY - 0.05, s * (w / 2 - 0.13)], [0.26, cabL - 0.02, 0.26], [0, 0, X])),
      // windshield (leaning back) with a black frame
      Pm('box', tint, [front + 0.02, cy + ch * 0.66, 0], [0.04, ch * 0.5, w * 0.86], [0, 0, 0.14]),
      Pm('box', trimC, [front + 0.04, cy + ch * 0.4, 0], [0.04, 0.04, w * 0.9]), Pm('box', trimC, [front - 0.02, cy + ch * 0.92, 0], [0.04, 0.04, w * 0.9]),
      ...[1, -1].map((s) => Pm('box', trimC, [front + 0.01, cy + ch * 0.66, s * w * 0.44], [0.05, ch * 0.52, 0.04], [0, 0, 0.14])),
      ...[-0.25, 0.25].map((z) => Pm('box', trimC, [front + 0.06, cy + ch * 0.43, z], [0.02, 0.02, w * 0.3], [0, 0, 0.14])), // wipers
      Pm('box', COL.amber, [cx + cabL * 0.25, roofY + 0.07, 0], [0.16, 0.07, w * 0.5]), // light bar
    ];
    // doors: tinted windows in black frames, panel seams, handles, steps underneath
    const doors = Math.max(1, Math.round(cabL / 1.2));
    for (let i = 0; i < doors; i++) {
      const dl = cabL / doors, dx = cx + cabL / 2 - dl * (i + 0.5);
      for (const s of [1, -1]) {
        const zz = s * (w / 2 + 0.005);
        p.push(Pm('box', trimC, [dx, cy + ch * 0.68, zz], [dl - 0.14, ch * 0.46, 0.008]), Pm('box', tint, [dx, cy + ch * 0.68, zz + s * 0.004], [dl - 0.2, ch * 0.4, 0.008]),
          Pm('box', HC.shade(color, -0.22), [dx - dl / 2 + 0.03, cy + ch * 0.45, zz], [0.015, ch * 0.88, 0.01]),
          Pm('box', trimC, [dx + dl * 0.28, cy + ch * 0.36, zz + s * 0.006], [0.12, 0.04, 0.02]),
          Pm('box', trimC, [dx, cy - 0.12, s * (w / 2 - 0.08)], [dl - 0.3, 0.05, 0.22]));
      }
    }
    // mirrors on arms
    for (const s of [1, -1]) p.push(Pm('box', trimC, [front - 0.05, cy + ch * 0.62, s * (w / 2 + 0.1)], [0.04, 0.04, 0.22]), Pm('box', trimC, [front - 0.08, cy + ch * 0.62, s * (w / 2 + 0.24)], [0.08, 0.38, 0.14]),
      Pm('box', '#8fa4b0', [front - 0.13, cy + ch * 0.62, s * (w / 2 + 0.24)], [0.01, 0.32, 0.1]));
    if (o.sleeper) p.push(Pm('box', color, [cx - cabL / 2 - o.sleeper / 2, cy + (ch + 0.55) / 2, 0], [o.sleeper, ch + 0.55, w]),
      Pm('box', color, [cx - cabL / 2 - o.sleeper / 2, cy + ch + 0.57, 0], [o.sleeper - 0.06, 0.06, w - 0.3]),
      ...[1, -1].map((s) => Pm('cyl', color, [cx - cabL / 2 - o.sleeper / 2, cy + ch + 0.5, s * (w / 2 - 0.13)], [0.26, o.sleeper - 0.02, 0.26], [0, 0, X])),
      ...[1, -1].map((s) => Pm('box', HC.shade(color, -0.22), [cx - cabL / 2 - 0.02, cy + (ch + 0.55) / 2, s * (w / 2 + 0.004)], [0.015, ch + 0.4, 0.01])));
    if (o.stacks) for (const s of [1, -1]) p.push(Pm('cyl', COL.chrome, [cx - cabL / 2 - 0.15, cy + 1.3, s * (w / 2 + 0.12)], [0.15, 2.6, 0.15]), Pm('box', '#9aa0a6', [cx - cabL / 2 - 0.15, cy + 1.0, s * (w / 2 + 0.12)], [0.24, 0.8, 0.06]));
    return p;
  }
  function couplerM(len, h = 0.62, spread = 0.55) {
    const L = len / 32 * 3; // sim px -> metres
    return [Pm('box', COL.frame, [L - 0.9, h, spread / 2], [1.9, 0.12, 0.1], [0, 0.28, 0]), Pm('box', COL.frame, [L - 0.9, h, -spread / 2], [1.9, 0.12, 0.1], [0, -0.28, 0]),
      Pm('box', COL.steel, [L - 0.05, h + 0.03, 0], [0.3, 0.12, 0.16]), Pm('cyl', '#3a3b3d', [L - 1.1, h + 0.1, 0], [0.18, 0.12, 0.18]),
      Pm('box', '#e8e8e8', [L - 1.6, h + 0.12, 0.22], [0.2, 0.16, 0.12])];
  }
  // pivots (metres) the renderer animates around
  const PIV = { skidArm: [-0.85, 1.75, 0], exArm: [0.95, 1.8, -0.25], boom: [-3.4, 2.75, 0] };
  const RAMP = { equip: { x: -2.6, y: 0.35, len: 1.8 }, lowboy: { x: -1.6, y: 1.0, len: 2.5 }, deckover: { x: -2.8, y: 0.95, len: 2.6 },
    gndump: { x: -1.68, y: 1.05, len: 2.4, slide: true }, gnflat: { x: -3.1, y: 0.78, len: 2.1, slide: true } }; // slide: the ramps slide out from under the deck
  const DECK_H = { equip: 0.6, lowboy: 0.56, deckover: 0.98, gndump: 1.1, gnflat: 0.98 };
  const SEATS = { miniex: [0.3, 0.8, 0.39], dozerS: [-0.5, 1.45, 0], dozerL: [-0.65, 1.95, 0], harvester: [1.35, 1.95, 0], forwarder: [2.5, 1.8, 0], skid: [0.05, 0.95, 0], mower: [-0.25, 0.75, 0], mowerZT: [-0.25, 0.92, 0], mowerSO: [-0.85, 0.25, 0], mowerWA: [-0.28, 0.98, 0], excavator: [0.55, 1.92, 0.7], fmulcher: [0.4, 1.95, 0], grinder: [-1.35, 0, 0], loader: [-0.45, 1.85, 0], trackloader: [-0.65, 2.4, 0], skidder: [0.8, 1.7, 0], tractor: [-0.65, 1.6, 0] };

  function skidBase() {
    const p = [...trackM(2.0, 0.69, 0.5, 0.32), ...trackM(2.0, -0.69, 0.5, 0.32),
      Pm('box', COL.frame, [0, 0.62, 0], [1.9, 0.3, 1.05]),
      Pm('box', COL.cat, [-0.72, 1.08, 0], [1.15, 0.85, 1.25]), Pm('box', COL.catDark, [-0.72, 1.53, 0], [1.1, 0.05, 1.2]),
      Pm('box', COL.black, [-1.3, 1.05, 0], [0.04, 0.5, 0.9]), Pm('box', '#c22', [-1.31, 1.35, 0.5], [0.03, 0.1, 0.12]), Pm('box', '#c22', [-1.31, 1.35, -0.5], [0.03, 0.1, 0.12]),
      Pm('box', COL.cat, [-0.85, 1.3, 0.6], [0.45, 1.1, 0.16]), Pm('box', COL.cat, [-0.85, 1.3, -0.6], [0.45, 1.1, 0.16]),
      Pm('box', COL.frame, [0.1, 0.8, 0], [1.0, 0.12, 0.98]), Pm('box', COL.black, [-0.12, 1.05, 0], [0.45, 0.35, 0.55]), Pm('box', COL.black, [-0.32, 1.35, 0], [0.08, 0.55, 0.55]),
      ...cabM(0.1, 0.86, 1.12, 0.92, 0.95, COL.cat),
      Pm('cyl', COL.chrome, [-1.0, 1.65, -0.35], [0.08, 0.35, 0.08])];
    return build(p);
  }
  // the skid steer's arms end in a quick-attach plate; attachments are separate models whose origin is that plate
  const PLATE = [2.22, -1.32];
  function skidArms(mode, armCol = COL.cat) {
    const mulcher = mode === 'mulcher';
    const p = [];
    for (const z of [0.62, -0.62]) p.push(Pm('box', armCol, [1.05, -0.5, z], [2.55, 0.24, 0.15], [0, 0, -0.42]), Pm('cyl', COL.chrome, [0.55, -0.85, z * 0.9], [0.08, 1.1, 0.08], [0, 0, -1.0]));
    p.push(Pm('box', armCol, [1.6, -0.75, 0], [0.18, 0.18, 1.3]), Pm('box', COL.frame, [2.22, -1.32, 0], [0.12, 0.6, 1.55]));
    if (mode === 'bare') return build(p);
    p.length = 0;
    if (mode === 'brushcut') {
      const nv = '#1e2a44', nvd = '#141c2e', b = '#1c1d1f';
      p.push(Pm('box', b, [2.32, -1.3, 0], [0.1, 0.62, 1.2]), // mounting plate
        Pm('box', nv, [3.3, -1.55, 0], [1.95, 0.08, 1.85]), Pm('box', nvd, [3.3, -1.5, 0], [1.85, 0.02, 1.75]), // deck
        ...[1, -1].flatMap((s) => [Pm('box', nv, [3.3, -1.68, s * 0.93], [1.95, 0.26, 0.05]), Pm('box', nvd, [3.3, -1.47, s * 0.45], [1.8, 0.07, 0.09]), // skirts, ribs
          Pm('box', '#e8e4da', [3.9, -1.66, s * 0.955], [0.32, 0.08, 0.01]), Pm('box', '#c42a24', [3.0, -1.66, s * 0.955], [0.14, 0.06, 0.01])]), // decals
        Pm('box', nv, [2.34, -1.68, 0], [0.05, 0.26, 1.85]), // back skirt
        Pm('box', nvd, [3.0, -1.3, 0], [0.6, 0.38, 0.55]), Pm('box', b, [3.0, -1.1, 0], [0.5, 0.06, 0.45]), // motor housing
        Pm('box', b, [2.62, -1.15, 0.22], [0.6, 0.05, 0.05], [0, 0, -0.35]), Pm('box', b, [2.62, -1.15, -0.22], [0.6, 0.05, 0.05], [0, 0, -0.35])); // hoses
      for (let i = 0; i < 16; i++) p.push(Pm('box', '#b9bdc2', [4.25, -1.72, -0.85 + i * 0.113], [0.03, 0.2, 0.06])); // chain guard
    } else if (mulcher) { // open-rotor head: gray hood, orange toothed drum, side skids, tall push bar
      const hood = '#3b3e43', drum = '#e8a21a';
      p.push(Pm('box', hood, [2.5, -1.12, 0], [0.75, 0.32, 2.05]), Pm('box', hood, [2.82, -1.2, 0], [0.4, 0.18, 2.05], [0, 0, -0.6]), Pm('box', '#2a2c30', [2.35, -1.0, 0], [0.5, 0.04, 2.1]));
      for (const z of [1.04, -1.04]) p.push(Pm('box', '#55595f', [2.65, -1.5, z], [1.0, 0.62, 0.06]), Pm('box', '#2a2c30', [2.65, -1.8, z], [1.05, 0.06, 0.14]));
      // push bar: two yellow uprights from the hood, a top rail out over the head
      for (const z of [0.82, -0.82]) p.push(Pm('box', drum, [2.25, -0.35, z], [0.1, 1.45, 0.1], [0, 0, -0.08]), Pm('box', drum, [2.55, 0.42, z], [0.75, 0.09, 0.09], [0, 0, -0.35]));
      p.push(Pm('box', drum, [2.85, 0.28, 0], [0.09, 0.09, 1.75]), Pm('box', drum, [2.2, 0.38, 0], [0.09, 0.09, 1.7]));
    } else {
      for (let i = 0; i < 7; i++) p.push(Pm('box', COL.frame, [2.6, -1.6, -0.75 + i * 0.25], [0.85, 0.07, 0.08]), Pm('box', COL.frame, [3.0, -1.58, -0.75 + i * 0.25], [0.12, 0.1, 0.07], [0, 0, 0.4]));
      p.push(Pm('box', COL.frame, [2.32, -1.3, 0], [0.1, 0.62, 1.7]));
      for (const z of [-0.4, 0.4]) p.push(Pm('box', COL.frame, [2.55, -0.98, z], [0.75, 0.09, 0.5], [0, 0, -0.55]), Pm('box', COL.frame, [2.85, -1.2, z], [0.08, 0.35, 0.45]));
      p.push(Pm('cyl', COL.chrome, [2.35, -0.9, 0], [0.07, 0.5, 0.07], [0, 0, -0.9]));
    }
    const g = build(p); g.translate(-PLATE[0] * MM, -PLATE[1] * MM, 0); return g;
  }
  function truckGeo(c) { // 1-ton crew-cab dually, flatbed with headache rack, 6.7 m
    const p = [Pm('box', COL.black, [-0.2, 0.68, 0], [6.3, 0.22, 0.9]),
      ...truckCabM(3.35, c, { hood: 1.25, cabL: 2.5, w: 1.98, hy: 0.95, cy: 1.05, ch: 1.0 }),
      Pm('box', COL.frame, [-1.6, 1.0, 0], [2.7, 0.14, 2.3]), Pm('box', '#3a3d42', [-1.6, 1.08, 0], [2.6, 0.02, 2.2]),
      Pm('box', COL.frame, [-0.3, 1.45, 0], [0.08, 0.75, 2.1]),
      ...[-0.45, -0.25].map((x) => Pm('box', COL.frame, [x, 1.75, 0], [0.04, 0.04, 2.1])),
      Pm('box', '#b9bec5', [-0.55, 0.62, 0.85], [0.5, 0.45, 0.35]), Pm('box', '#b9bec5', [-0.55, 0.62, -0.85], [0.5, 0.45, 0.35]),
      Pm('box', HC.shade(c, -0.2), [-1.85, 1.0, 1.08], [1.15, 0.12, 0.35]), Pm('box', HC.shade(c, -0.2), [-1.85, 1.0, -1.08], [1.15, 0.12, 0.35]),
      Pm('box', COL.black, [2.55, 0.92, 0.88], [0.95, 0.1, 0.25]), Pm('box', COL.black, [2.55, 0.92, -0.88], [0.95, 0.1, 0.25]),
      Pm('box', '#f07a22', [0.9, 1.25, 0.995], [2.42, 0.07, 0.01]), Pm('box', '#f07a22', [0.9, 1.25, -0.995], [2.42, 0.07, 0.01]),
      Pm('box', '#c22', [-2.95, 1.05, 0.95], [0.04, 0.16, 0.14]), Pm('box', '#c22', [-2.95, 1.05, -0.95], [0.04, 0.16, 0.14]),
      Pm('box', COL.steel, [-3.2, 0.68, 0], [0.4, 0.1, 0.1]),
      Pm('box', '#2a2c2f', [-1.75, 1.1, 0], [0.3, 0.02, 0.3]), Pm('sph', COL.chrome, [-1.75, 1.13, 0], [0.09, 0.09, 0.09]), // gooseneck ball
      ...wheelM(2.45, 0.4, 0.84, 0.4, 0.28), ...wheelM(2.45, 0.4, -0.84, 0.4, 0.28),
      ...wheelM(-1.85, 0.4, 0.78, 0.4, 0.24), ...wheelM(-1.85, 0.4, -0.78, 0.4, 0.24), ...wheelM(-1.85, 0.4, 1.04, 0.4, 0.24), ...wheelM(-1.85, 0.4, -1.04, 0.4, 0.24)];
    return build(p);
  }
  // lifted 1-ton extended-cab dually: tall chrome grille, two-tone white over tan, cab lights, sun visor,
  // tow mirrors, mud tires on polished aluminium wheels with spiked lug nuts.
  // 2000-era 1-ton SuperCab long bed DRW: 6.76 m long, 4.01 m wheelbase, 2.03 m cab, 2.44 m over the fenders, ~2.2 m tall lifted.
  // One wheel and tyre, hub at the origin, outer face toward +Z (s = 1) or -Z (s = -1).
  // 35x12.5 mud-terrain tyre with staggered lugs on a polished 10-hole aluminium wheel.
  function duallyWheelM(front, s, outer = true) {
    const r = 0.45, w = 0.31, face = s * (w / 2), X = Math.PI / 2;
    const p = [Pm('tyre', COL.tire, [0, 0, 0], [r * 2, w * 0.8, r * 2], [X, 0, 0]),
      // rounded shoulders and sidewalls
      ...[1, -1].flatMap((q) => [Pm('sph', '#1b1c1d', [0, 0, q * w * 0.4], [r * 1.98, 0.12, r * 1.98], [X, 0, 0]),
        Pm('cyl', '#232425', [0, 0, q * (w / 2 + 0.004)], [r * 1.5, 0.012, r * 1.5], [X, 0, 0])])];
    // staggered tread lugs
    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * Math.PI * 2, off = i % 2 ? 0.07 : -0.07;
      p.push(Pm('box', '#141516', [Math.cos(a) * (r - 0.004), Math.sin(a) * (r - 0.004), off], [0.085, 0.03, 0.13], [0, 0, a]));
      p.push(Pm('box', '#161718', [Math.cos(a + 0.14) * (r - 0.03), Math.sin(a + 0.14) * (r - 0.03), -off * 2.0], [0.07, 0.04, 0.04], [0, 0, a + 0.14]));
    }
    if (!outer) { p.push(Pm('cyl', '#9aa0a6', [0, 0, face], [0.56, 0.02, 0.56], [X, 0, 0])); return p; }
    // polished wheel: lip, dished face, ten hand holes, hub
    p.push(Pm('cyl', '#eef1f3', [0, 0, face + s * 0.004], [0.6, 0.02, 0.6], [X, 0, 0]),
      Pm('cyl', '#b9bdc2', [0, 0, face + s * 0.008], [0.54, 0.01, 0.54], [X, 0, 0]),
      Pm('cyl', '#dfe3e6', [0, 0, face + s * 0.012], [0.5, 0.02, 0.5], [X, 0, 0]),
      Pm('cyl', '#f4f6f7', [0, 0, face + s * 0.024], [0.3, 0.03, 0.3], [X, 0, 0]));
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      p.push(Pm('box', '#2a2b2c', [Math.cos(a) * 0.19, Math.sin(a) * 0.19, face + s * 0.022], [0.075, 0.05, 0.012], [0, 0, a + X]));
    }
    if (front) { // spiked lug nuts around a tall chrome cap
      p.push(Pm('cyl', COL.chrome, [0, 0, face + s * 0.06], [0.2, 0.08, 0.2], [X, 0, 0]), Pm('cone', '#eef1f3', [0, 0, face + s * 0.13], [0.12, 0.08, 0.12], [s * X, 0, 0]));
      for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; p.push(Pm('cone', '#eef1f3', [Math.cos(a) * 0.125, Math.sin(a) * 0.125, face + s * 0.085], [0.04, 0.12, 0.04], [s * X, 0, 0])); }
    } else {
      p.push(Pm('cyl', COL.chrome, [0, 0, face + s * 0.04], [0.18, 0.04, 0.18], [X, 0, 0]));
      for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; p.push(Pm('cyl', '#c9ced3', [Math.cos(a) * 0.115, Math.sin(a) * 0.115, face + s * 0.035], [0.035, 0.03, 0.035], [X, 0, 0])); }
    }
    return p;
  }
  const DUALLY_WHEELS = { front: 2.35, rear: -1.65, r: 0.45, fz: 0.95, rIn: 0.7, rOut: 1.03 };
  function duallyGeo(top = '#f3f3ef', low = '#c9b48f') { // body only; the wheels are separate so they can roll and steer
    const W = 2.03, Pb = (g, c, pos, ...r) => Pm(g, c, [pos[0], pos[1] - 0.2, pos[2]], ...r), side = (fn) => [1, -1].flatMap(fn), pin = '#8a5a34', tint = '#1d262c';
    const DW = DUALLY_WHEELS, Z = Math.PI / 2;
    const p = [Pb('box', COL.black, [-0.1, 0.92, 0], [6.3, 0.22, 0.95]),
      Pb('box', COL.frame, [2.35, 0.7, 0], [0.25, 0.25, 1.6]), Pb('box', COL.frame, [-1.65, 0.7, 0], [0.25, 0.25, 1.4]),
      Pm('cyl', '#2b2d30', [DW.front, DW.r, 0], [0.16, 1.7, 0.16], [Z, 0, 0]), Pm('cyl', '#3a3b3d', [DW.rear, DW.r, 0], [0.24, 1.75, 0.24], [Z, 0, 0]),
      Pm('cyl', '#3a3b3d', [DW.rear, DW.r, 0], [0.42, 0.34, 0.42], [Z, 0, 0]), // differential
      ...side((s) => [Pb('box', '#3a3c3f', [2.35, 0.72, s * 0.55], [0.14, 0.14, 0.7], [0.3 * s, 0, 0]),
        Pm('cyl', '#c62a2a', [DW.front - 0.25, 0.68, s * 0.55], [0.09, 0.42, 0.09], [0.3, 0, 0]), // lift-kit shocks
        Pm('cyl', '#c62a2a', [DW.rear + 0.3, 0.72, s * 0.62], [0.09, 0.42, 0.09], [-0.25, 0, 0])]),
      // hood with rounded shoulders, power-dome bulge and cowl
      Pb('box', top, [2.28, 1.42, 0], [1.57, 0.56, 1.92]), Pb('box', top, [2.2, 1.73, 0], [1.35, 0.08, 1.0]),
      Pb('box', HC.shade(top, -0.05), [2.18, 1.775, 0], [1.2, 0.02, 0.86]),
      ...side((s) => [Pb('cyl', top, [2.28, 1.66, s * 0.94], [0.16, 1.57, 0.16], [0, 0, Z])]),
      Pb('box', HC.shade(top, -0.3), [1.52, 1.71, 0], [0.06, 0.02, 1.86]), Pb('box', '#2a2c2f', [1.45, 1.7, 0], [0.1, 0.03, 1.8]),
      // front fenders around open wheel arches
      Pb('box', top, [2.98, 1.08, 0], [0.2, 0.16, 2.05]), Pb('box', top, [1.62, 1.08, 0], [0.24, 0.16, 2.05]),
      ...side((s) => [Pm('arch', top, [DW.front, DW.r, s * 1.0], [1.12, 1.12, 1.4]), Pm('hcylz', '#141516', [DW.front, DW.r, s * 0.8], [1.12, 1.12, 0.36]),
        Pm('box', HC.shade(top, -0.15), [DW.front, 1.22, s * 1.005], [1.3, 0.012, 0.01])]),
      // tall chrome grille with egg-crate bars, headlights, bumper
      Pb('box', COL.chrome, [3.08, 1.4, 0], [0.08, 0.66, 1.08]), Pb('box', '#151719', [3.12, 1.4, 0], [0.02, 0.54, 0.94]),
      ...[1.22, 1.31, 1.4, 1.49, 1.58].map((y) => Pb('box', '#c9ced3', [3.13, y, 0], [0.02, 0.025, 0.94])), ...[-0.31, -0.155, 0, 0.155, 0.31].map((z) => Pb('box', '#c9ced3', [3.13, 1.4, z], [0.02, 0.54, 0.025])),
      Pb('box', COL.chrome, [3.1, 1.75, 0], [0.12, 0.06, 1.12]),
      ...side((s) => [Pb('box', '#e6eef3', [3.02, 1.47, s * 0.76], [0.1, 0.26, 0.38]), Pb('box', '#bcc6cc', [3.07, 1.47, s * 0.76], [0.01, 0.18, 0.3]),
        Pb('sph', '#fff6d0', [3.07, 1.47, s * 0.7], [0.03, 0.14, 0.14]), Pb('box', COL.chrome, [3.06, 1.6, s * 0.76], [0.06, 0.02, 0.38]),
        Pb('box', COL.amber, [2.96, 1.47, s * 0.985], [0.16, 0.2, 0.04])]),
      Pb('box', COL.chrome, [3.18, 1.0, 0], [0.24, 0.32, 2.08]), Pb('box', '#d0d2d4', [3.31, 1.0, 0], [0.02, 0.1, 1.9]),
      Pb('box', '#2a2c2f', [3.12, 0.8, 0], [0.16, 0.14, 1.8]), Pb('box', '#151719', [3.2, 0.82, 0], [0.02, 0.06, 0.9]),
      ...side((s) => [Pb('box', '#c42a24', [3.22, 0.8, s * 0.6], [0.14, 0.08, 0.06])]),
      // extended cab: tan lower, white upper, glass, rounded roof edges
      Pb('box', low, [0.4, 1.12, 0], [2.3, 0.3, W + 0.02]), Pb('box', top, [0.4, 1.47, 0], [2.3, 0.42, W]),
      Pb('box', top, [0.25, 2.02, 0], [1.9, 0.7, W - 0.12]), Pb('box', top, [0.25, 2.39, 0], [1.85, 0.05, W - 0.3]),
      ...side((s) => [Pb('cyl', top, [0.25, 2.33, s * (W / 2 - 0.12)], [0.14, 1.9, 0.14], [0, 0, Z])]),
      Pb('box', tint, [1.36, 2.0, 0], [0.04, 0.78, W - 0.18], [0, 0, 0.6]), Pb('box', '#2a2c2f', [1.2, 2.35, 0], [0.06, 0.03, W - 0.2]),
      ...[-0.45, 0.45].map((z) => Pb('box', '#1b1c1e', [1.5, 1.8, z], [0.02, 0.02, 0.55], [0, 0.2 * Math.sign(z), 0.6])), // wipers
      ...side((s) => [Pb('box', tint, [0.72, 2.0, s * (W / 2 - 0.055)], [1.05, 0.52, 0.01]), Pb('box', tint, [-0.25, 2.0, s * (W / 2 - 0.055)], [0.6, 0.52, 0.01]),
        Pb('box', '#2a2c2f', [0.72, 2.27, s * (W / 2 - 0.05)], [1.07, 0.025, 0.014]), Pb('box', '#2a2c2f', [0.72, 1.73, s * (W / 2 - 0.05)], [1.07, 0.025, 0.014]),
        Pb('box', '#2a2c2f', [1.25, 2.0, s * (W / 2 - 0.05)], [0.025, 0.55, 0.014]),
        Pb('box', top, [0.12, 2.0, s * (W / 2 - 0.05)], [0.1, 0.56, 0.014]),
        Pb('box', HC.shade(top, -0.2), [0.18, 1.45, s * (W / 2 + 0.003)], [0.02, 0.62, 0.01]), Pb('box', HC.shade(top, -0.2), [-0.62, 1.45, s * (W / 2 + 0.003)], [0.02, 0.62, 0.01]),
        Pb('box', HC.shade(top, -0.2), [1.5, 1.45, s * (W / 2 + 0.003)], [0.02, 0.62, 0.01]),
        Pb('box', '#2a2c2f', [1.0, 1.58, s * (W / 2 + 0.01)], [0.12, 0.05, 0.02]), Pb('box', COL.chrome, [0.4, 1.17, s * (W / 2 + 0.014)], [2.2, 0.05, 0.01]),
        Pb('box', COL.chrome, [2.25, 1.17, s * 0.99], [0.9, 0.04, 0.01]),
        // tow mirrors
        Pb('box', COL.black, [1.18, 1.82, s * 1.13], [0.06, 0.06, 0.3]), Pb('box', COL.black, [1.18, 1.98, s * 1.13], [0.05, 0.04, 0.3]),
        Pb('box', COL.black, [1.15, 1.9, s * 1.3], [0.12, 0.46, 0.28]), Pb('box', '#8fa4b0', [1.09, 1.9, s * 1.3], [0.01, 0.4, 0.24]), Pb('box', COL.amber, [1.2, 2.1, s * 1.3], [0.04, 0.03, 0.2])]),
      Pb('box', tint, [-0.66, 2.0, 0], [0.01, 0.5, 1.5]),
      Pb('box', top, [1.3, 2.39, 0], [0.34, 0.04, W - 0.1], [0, 0, -0.2]),
      ...[-0.5, -0.25, 0, 0.25, 0.5].map((z) => Pb('sph', COL.amber, [1.36, 2.43, z], [0.09, 0.06, 0.09])),
      Pb('cyl', '#1b1c1e', [0.9, 2.6, -0.85], [0.015, 0.5, 0.015]), // antenna
      // 8 ft bed: rails, tailgate, taillights, rounded dually fenders
      Pb('box', low, [-2.07, 1.12, 0], [2.45, 0.3, W]), Pb('box', top, [-2.07, 1.47, 0], [2.45, 0.42, W]),
      Pb('box', '#141516', [-2.07, 1.685, 0], [2.33, 0.01, W - 0.16]),
      ...[-0.6, -0.3, 0, 0.3, 0.6].map((z) => Pb('box', '#1e1f20', [-2.07, 1.692, z], [2.3, 0.006, 0.05])),
      ...side((s) => [Pb('box', top, [-2.07, 1.7, s * (W / 2 - 0.04)], [2.45, 0.06, 0.08]),
        Pm('hshell', top, [DW.rear, DW.r + 0.04, s * 1.06], [1.26, 1.26, 0.34]), Pm('arch', top, [DW.rear, DW.r + 0.04, s * 1.22], [1.26, 1.26, 0.7]),
        Pm('arch', low, [DW.rear, DW.r + 0.04, s * 0.9], [1.26, 1.26, 0.7]),
        Pb('box', top, [DW.rear - 0.78, 1.0, s * 1.06], [0.2, 0.16, 0.28]), Pb('box', top, [DW.rear + 0.76, 1.0, s * 1.06], [0.2, 0.16, 0.28]),
        Pb('box', COL.amber, [-1.05, 1.32, s * 1.225], [0.08, 0.06, 0.02]), Pb('box', '#c42a24', [-2.3, 1.32, s * 1.225], [0.08, 0.06, 0.02]),
        Pm('box', '#141516', [DW.rear - 0.75, 0.42, s * 1.0], [0.02, 0.5, 0.36]), // mud flaps
        Pb('box', '#c42a24', [-3.3, 1.5, s * 0.92], [0.04, 0.36, 0.14]), Pb('box', '#f3f3f0', [-3.3, 1.36, s * 0.92], [0.041, 0.07, 0.14]),
        Pb('box', '#e8a33a', [-3.305, 1.62, s * 0.92], [0.04, 0.06, 0.14])]),
      Pb('box', top, [-0.86, 1.7, 0], [0.08, 0.06, W]), Pb('box', top, [-3.28, 1.7, 0], [0.08, 0.06, W]),
      Pm('box', '#2a2c2f', [-1.55, 1.5, 0], [0.3, 0.02, 0.3]), Pm('sph', COL.chrome, [-1.55, 1.53, 0], [0.09, 0.09, 0.09]), // gooseneck ball in the bed
      Pb('box', HC.shade(top, -0.15), [-3.298, 1.45, 0], [0.01, 0.01, 1.7]),
      Pb('box', '#2a2c2f', [-3.305, 1.58, 0], [0.02, 0.06, 0.28]),
      Pb('box', COL.chrome, [-3.4, 1.0, 0], [0.16, 0.2, 1.98]), Pb('box', '#2a2c2f', [-3.49, 1.0, 0], [0.02, 0.08, 0.3]),
      Pb('box', COL.steel, [-3.55, 0.92, 0], [0.3, 0.1, 0.1]), Pb('sph', COL.chrome, [-3.66, 1.0, 0], [0.07, 0.07, 0.07]),
      Pm('cyl', COL.chrome, [-3.0, 0.62, -0.75], [0.1, 0.35, 0.1], [0, 0, Z]), // exhaust tip
      ...side((s) => [Pb('box', pin, [-0.85, 1.265, s * (W / 2 + 0.008)], [4.8, 0.025, 0.005])]),
      Pb('box', '#d8d8d4', [-0.2, 0.95, 0.48], [0.9, 0.06, 0.06])];
    return build(p);
  }
  // body plus six wheels on pivots: steer (front only) > roll > tyre
  function duallyObj() {
    const grp = new THREE.Group(), DW = DUALLY_WHEELS;
    grp.add(model(cache('duallyBody', () => duallyGeo())));
    const wheel = (name, x, z, kids) => {
      const st = new THREE.Group(); st.name = 'steer' + name; st.position.set(x * MM, DW.r * MM, z * MM); st.userData.wheel = { r: DW.r * MM, front: name[0] === 'F' };
      const rl = new THREE.Group(); rl.name = 'roll' + name; st.add(rl);
      for (const [geoKey, dz] of kids) { const m = model(cache(geoKey, () => build(duallyWheelM(geoKey.includes('F'), geoKey.endsWith('L') ? 1 : -1, !geoKey.includes('In'))))); m.position.z = dz * MM; rl.add(m); }
      grp.add(st);
    };
    wheel('FL', DW.front, DW.fz, [['dwFL', 0]]); wheel('FR', DW.front, -DW.fz, [['dwFR', 0]]);
    const hub = (DW.rIn + DW.rOut) / 2, half = (DW.rOut - DW.rIn) / 2;
    wheel('RL', DW.rear, hub, [['dwRL', half], ['dwRInL', -half]]); wheel('RR', DW.rear, -hub, [['dwRR', -half], ['dwRInR', half]]);
    grp.userData.hasWheels = true;
    return grp;
  }
  function fenderM(x, y, z, len) { return Pm('box', COL.frame, [x, y, z], [len, 0.06, 0.32]); }
  const TRAILER_GEO = {
    dump: () => build(TRAILER_GEO.dumpParts()),
    dumpParts: () => { // 14 ft low-profile dump trailer; parts tagged .box tip up on the rear hinge
      const p = [Pm('box', COL.frame, [0, 0.62, 0], [4.4, 0.18, 1.0]),
        ...BX([Pm('box', '#25292c', [0, 0.78, 0], [4.3, 0.1, 1.95]), Pm('box', '#25292c', [0, 1.12, 0.98], [4.3, 0.62, 0.06]), Pm('box', '#25292c', [0, 1.12, -0.98], [4.3, 0.62, 0.06]),
        Pm('box', '#25292c', [2.15, 1.12, 0], [0.06, 0.62, 1.95]), Pm('box', '#1f2326', [-2.18, 1.12, 0], [0.06, 0.62, 1.95]), Pm('box', '#33383c', [-2.2, 1.12, 0], [0.02, 0.58, 0.04]),
        Pm('box', '#15181a', [0, 1.45, 0.98], [4.34, 0.06, 0.1]), Pm('box', '#15181a', [0, 1.45, -0.98], [4.34, 0.06, 0.1]),
        ...[-1.6, -0.6, 0.6, 1.6].flatMap((x) => [Pm('box', '#15181a', [x, 1.12, 1.0], [0.06, 0.62, 0.05]), Pm('box', '#15181a', [x, 1.12, -1.0], [0.06, 0.62, 0.05])])]),
        Pm('cyl', COL.chrome, [1.6, 0.85, 0], [0.12, 1.4, 0.12], [0, 0, 1.1]),
        Pm('box', '#c22', [-2.22, 0.75, 0.85], [0.03, 0.08, 0.16]), Pm('box', '#c22', [-2.22, 0.75, -0.85], [0.03, 0.08, 0.16]),
        fenderM(0, 0.98, 1.08, 1.6), fenderM(0, 0.98, -1.08, 1.6),
        ...wheelM(0.45, 0.38, 1.05, 0.38, 0.22), ...wheelM(0.45, 0.38, -1.05, 0.38, 0.22), ...wheelM(-0.45, 0.38, 1.05, 0.38, 0.22), ...wheelM(-0.45, 0.38, -1.05, 0.38, 0.22),
        ...couplerM(HC.TRAILERS.dump.len)];
      return p;
    },
    equip: () => { // 20 ft tandem-axle equipment trailer with wood deck
      const p = [Pm('box', COL.frame, [1.05, 0.5, 0.98], [6.3, 0.2, 0.1]), Pm('box', COL.frame, [1.05, 0.5, -0.98], [6.3, 0.2, 0.1]),
        Pm('box', '#a07a4c', [1.1, 0.58, 0], [6.2, 0.06, 1.95]), Pm('box', '#a07a4c', [-2.3, 0.47, 0], [0.62, 0.06, 1.95], [0, 0, 0.36]),
        fenderM(0, 0.88, 1.12, 1.8), fenderM(0, 0.88, -1.12, 1.8),
        ...wheelM(0.48, 0.38, 1.1, 0.38, 0.22), ...wheelM(0.48, 0.38, -1.1, 0.38, 0.22), ...wheelM(-0.48, 0.38, 1.1, 0.38, 0.22), ...wheelM(-0.48, 0.38, -1.1, 0.38, 0.22),
        Pm('box', '#c22', [-2.6, 0.5, 0.85], [0.04, 0.08, 0.16]), Pm('box', '#c22', [-2.6, 0.5, -0.85], [0.04, 0.08, 0.16]),
        ...couplerM(HC.TRAILERS.equip.len, 0.55, 0.65)];
      for (let x = -1.9; x < 4.2; x += 0.3) p.push(Pm('box', '#7b5a36', [x, 0.613, 0], [0.02, 0.01, 1.95]));
      for (let x = -1.6; x < 4.1; x += 0.8) for (const z of [1.0, -1.0]) p.push(Pm('box', COL.frame, [x, 0.5, z * 1.02], [0.08, 0.16, 0.06]), Pm('box', '#d0d2d4', [x + 0.2, 0.62, z * 0.95], [0.08, 0.05, 0.05]));
      return build(p);
    },
    lowboy: () => { // 35-ton detachable-gooseneck lowboy: 22" loaded deck
      const p = [Pm('box', COL.frame, [-0.15, 0.87, 0], [2.9, 0.25, 2.6]), Pm('box', '#a07a4c', [4.95, 0.47, 0], [7.3, 0.18, 2.6]),
        Pm('box', COL.frame, [4.95, 0.38, 1.25], [7.3, 0.3, 0.1]), Pm('box', COL.frame, [4.95, 0.38, -1.25], [7.3, 0.3, 0.1]),
        Pm('box', COL.frame, [9.0, 1.0, 0], [0.8, 0.9, 2.0]), Pm('box', COL.frame, [10.7, 1.28, 0], [2.6, 0.26, 2.4]), Pm('box', '#f2c200', [11.95, 1.28, 0], [0.12, 0.28, 2.42]),
        Pm('cyl', '#3a3b3d', [10.97, 1.08, 0], [0.12, 0.2, 0.12]),
        ...[-0.65, 0.65].flatMap((x) => [...wheelM(x, 0.42, 0.85, 0.42, 0.24), ...wheelM(x, 0.42, -0.85, 0.42, 0.24), ...wheelM(x, 0.42, 1.12, 0.42, 0.24), ...wheelM(x, 0.42, -1.12, 0.42, 0.24)]),
        Pm('box', '#c22', [-1.62, 0.9, 1.1], [0.04, 0.1, 0.2]), Pm('box', '#c22', [-1.62, 0.9, -1.1], [0.04, 0.1, 0.2]),
        Pm('box', '#f2c200', [-1.62, 0.65, 0], [0.04, 0.12, 2.4])];
      for (let x = 1.5; x < 8.6; x += 0.3) p.push(Pm('box', '#7b5a36', [x, 0.565, 0], [0.02, 0.01, 2.6]));
      for (let x = 1.6; x < 8.6; x += 1.0) for (const z of [1.26, -1.26]) p.push(Pm('box', '#d0d2d4', [x, 0.55, z], [0.1, 0.06, 0.05]));
      return build(p);
    },
    logtrailer: () => { // spread-axle log trailer: bunks, stakes, front bulkhead
      const p = [Pm('box', COL.frame, [4.6, 1.1, 0], [12.2, 0.3, 0.6]), Pm('box', COL.frame, [4.6, 1.1, 0.4], [12.2, 0.18, 0.1]), Pm('box', COL.frame, [4.6, 1.1, -0.4], [12.2, 0.18, 0.1]),
        Pm('box', COL.frame, [9.9, 2.0, 0], [0.15, 1.9, 2.5]), ...[1.3, 1.7, 2.1, 2.5].map((y) => Pm('box', COL.frame, [9.9, y, 0], [0.16, 0.06, 2.55])),
        Pm('cyl', '#3a3b3d', [10.8, 1.0, 0], [0.12, 0.2, 0.12]),
        ...[-0.65, 0.65].flatMap((x) => [...wheelM(x, 0.5, 0.86, 0.5, 0.27), ...wheelM(x, 0.5, -0.86, 0.5, 0.27), ...wheelM(x, 0.5, 1.14, 0.5, 0.27), ...wheelM(x, 0.5, -1.14, 0.5, 0.27)]),
        Pm('box', '#c22', [-1.55, 1.1, 0.4], [0.04, 0.12, 0.2]), Pm('box', '#c22', [-1.55, 1.1, -0.4], [0.04, 0.12, 0.2])];
      for (const x of [-1.2, 2.2, 5.4, 8.6]) p.push(Pm('box', COL.frame, [x, 1.32, 0], [0.22, 0.2, 2.5]), Pm('box', COL.steel, [x, 2.3, 1.2], [0.12, 1.9, 0.12]), Pm('box', COL.steel, [x, 2.3, -1.2], [0.12, 1.9, 0.12]));
      return build(p);
    },
    deckover: () => { // 25 ft heavy-duty deck-over: I-beam frame, oak deck over tandem dual axles, rub rail, stake pockets
      const L = HC.TRAILERS.deckover.len / 32 * 3, X = Math.PI / 2;
      const p = [...[1, -1].flatMap((s) => [Pm('box', COL.frame, [1.75, 0.68, s * 0.45], [9.1, 0.32, 0.12]), Pm('box', '#25282b', [1.75, 0.92, s * 1.26], [9.1, 0.12, 0.08]),
          ...Array.from({ length: 12 }, (_, i) => Pm('box', '#25282b', [-2.6 + i * 0.78, 0.9, s * 1.29], [0.1, 0.14, 0.05]))]),
        ...[-2.4, -1.4, -0.4, 0.6, 1.6, 2.6, 3.6, 4.6, 5.6].map((x) => Pm('box', COL.frame, [x, 0.8, 0], [0.1, 0.1, 2.5])),
        Pm('box', '#9c7246', [1.75, 0.96, 0], [9.1, 0.07, 2.5]),
        Pm('box', COL.frame, [6.3, 1.2, 0], [0.12, 0.55, 2.5]), Pm('box', '#25282b', [6.3, 1.5, 0], [0.16, 0.06, 2.55]), // front bulkhead
        ...[1, -1].flatMap((s) => [Pm('box', COL.frame, [0, 1.0, s * 1.15], [2.1, 0.04, 0.4]), Pm('box', '#c22', [-2.82, 0.75, s * 1.15], [0.04, 0.12, 0.18]), Pm('box', COL.amber, [6.2, 0.9, s * 1.29], [0.06, 0.06, 0.03])]),
        Pm('box', COL.frame, [-2.8, 0.62, 0], [0.14, 0.12, 2.4]),
        ...[-0.65, 0.65].flatMap((x) => [...wheelM(x, 0.4, 0.72, 0.4, 0.24), ...wheelM(x, 0.4, -0.72, 0.4, 0.24), ...wheelM(x, 0.4, 0.98, 0.4, 0.24), ...wheelM(x, 0.4, -0.98, 0.4, 0.24)]),
        Pm('cyl', '#3a3b3d', [0, 0.4, 0], [0.14, 1.7, 0.14], [X, 0, 0]),
        ...couplerM(HC.TRAILERS.deckover.len, 0.62, 0.7)];
      for (let x = -2.7; x < 6.25; x += 0.28) p.push(Pm('box', '#7b5a36', [x, 1.0, 0], [0.02, 0.01, 2.48]));
      for (const x of [-1.5, 1.5, 4.5]) for (const s of [1, -1]) p.push(Pm('box', '#d0d2d4', [x, 1.01, s * 1.1], [0.1, 0.05, 0.05]));
      return build(p);
    },
    // 16 ft gooseneck dump, after the reference: black high-side box over tandem duals, red/white tape, a tall neck to the ball
    gndumpParts: () => {
      const bk = '#1d1f22', bk2 = '#2a2d31', L = HC.TRAILERS.gndump.len / 32 * 3, p = [];
      const tape = (x, y, z, l) => { for (let i = 0; i < l / 0.3; i++) p.push(Pm('box', i % 2 ? '#e8e8e8' : '#d0261e', [x - l / 2 + 0.15 + i * 0.3, y, z], [0.3, 0.05, 0.01])); };
      // chassis: rails, crossmembers, neck, ball coupler, hoist, axles, fixed jack legs
      p.push(...[1, -1].map((s) => Pm('box', bk, [0.8, 0.82, s * 0.48], [4.9, 0.26, 0.12])),
        ...[-1.4, -0.4, 0.6, 1.6, 2.6].map((x) => Pm('box', bk, [x, 0.9, 0], [0.1, 0.1, 1.1])),
        Pm('box', bk, [3.42, 1.3, 0], [0.28, 1.05, 1.0]), Pm('box', bk, [(3.3 + L + 0.45) / 2, 1.78, 0], [L + 0.45 - 3.3, 0.36, 0.86]), // riser and neck beam
        ...[1, -1].map((s) => Pm('box', bk, [3.75, 1.35, s * 0.4], [0.75, 0.1, 0.08], [0, 0, 0.85])), // gussets
        Pm('box', bk, [L + 0.42, 1.78, 0], [0.06, 0.36, 0.9]), Pm('box', COL.amber, [L + 0.46, 1.86, 0.36], [0.03, 0.07, 0.08]), Pm('box', COL.amber, [L + 0.46, 1.86, -0.36], [0.03, 0.07, 0.08]),
        Pm('cyl', bk, [L, 1.42, 0], [0.2, 0.36, 0.2]), Pm('cyl', COL.steel, [L, 1.22, 0], [0.15, 0.12, 0.15]), Pm('cyl', '#2b2d30', [L, 1.18, 0], [0.22, 0.05, 0.22]), // coupler tube and cup
        Pm('cyl', '#2a2a2a', [L - 0.35, 1.62, 0.3], [0.03, 0.5, 0.03], [0.6, 0, 0.5]), // safety chains and pigtail
        ...[1, -1].map((s) => Pm('box', bk2, [3.6, 0.8, s * 0.55], [0.14, 1.0, 0.14])), ...[1, -1].map((s) => Pm('box', bk2, [3.6, 0.3, s * 0.55], [0.3, 0.05, 0.3])),
        Pm('cyl', COL.chrome, [2.2, 1.0, 0], [0.18, 1.2, 0.18], [0, 0, 1.25]), Pm('box', bk, [2.6, 0.95, 0], [0.9, 0.08, 0.7]), // hoist and scissor arm
        Pm('box', '#2b2b2b', [4.3, 1.78, 0.44], [0.5, 0.26, 0.02]), Pm('box', '#e6e6e6', [4.3, 1.78, 0.45], [0.4, 0.1, 0.01]),
        ...[-0.55, 0.55].flatMap((x) => [...wheelM(x, 0.4, 0.74, 0.4, 0.24), ...wheelM(x, 0.4, -0.74, 0.4, 0.24), ...wheelM(x, 0.4, 1.0, 0.4, 0.24), ...wheelM(x, 0.4, -1.0, 0.4, 0.24)]),
        Pm('cyl', '#3a3b3d', [0.55, 0.4, 0], [0.14, 1.6, 0.14], [Math.PI / 2, 0, 0]), Pm('cyl', '#3a3b3d', [-0.55, 0.4, 0], [0.14, 1.6, 0.14], [Math.PI / 2, 0, 0]));
      tape(4.0, 1.9, 0.44, 0.9); tape(4.0, 1.9, -0.44, 0.9);
      // the box (tips on the rear hinge): floor, high sides with posts and top rail, front wall, ramp slots under the floor
      const box = [Pm('box', bk, [0.8, 1.08, 0], [4.9, 0.08, 2.25]), Pm('box', bk2, [0.8, 0.98, 0], [4.9, 0.12, 2.0]),
        ...[1, -1].flatMap((s) => [Pm('box', bk, [0.8, 1.7, s * 1.13], [4.9, 1.2, 0.05]), Pm('box', bk2, [0.8, 2.32, s * 1.15], [4.95, 0.1, 0.12]), Pm('box', bk2, [0.8, 1.12, s * 1.15], [4.95, 0.14, 0.1]),
          ...[-1.0, -0.2, 0.6, 1.4, 2.2].map((x) => Pm('box', bk2, [x, 1.7, s * 1.17], [0.08, 1.15, 0.05])), Pm('box', '#c22', [-1.66, 1.2, s * 0.95], [0.03, 0.1, 0.18])]),
        Pm('box', bk, [3.24, 1.7, 0], [0.06, 1.2, 2.25]), Pm('box', bk2, [3.3, 2.5, 0], [0.5, 0.06, 2.3]), // front wall with a cab shield lip
        ...[1, -1].map((s) => Pm('box', '#3b3f44', [-0.5, 0.96, s * 0.62], [2.6, 0.08, 0.5]))];
      for (const s of [1, -1]) { const q = []; const tp = (x, y, z, l) => { for (let i = 0; i < l / 0.3; i++) q.push(Pm('box', i % 2 ? '#e8e8e8' : '#d0261e', [x - l / 2 + 0.15 + i * 0.3, y, z], [0.3, 0.05, 0.01])); }; tp(0.8, 2.2, s * 1.16, 4.8); tp(0.8, 1.2, s * 1.21, 4.8); box.push(...q); }
      p.push(...BX(box));
      return p;
    },
    gndump: () => build(TRAILER_GEO.gndumpParts()),
    gnGate: () => build([Pm('box', '#1d1f22', [-0.03, -0.6, 0], [0.06, 1.2, 2.2]), ...[-0.25, -0.65, -1.05].map((y) => Pm('box', '#2a2d31', [-0.07, y, 0], [0.04, 0.08, 2.2])),
      ...[1, -1].map((s) => Pm('box', '#c22', [-0.08, -1.0, s * 0.9], [0.02, 0.1, 0.16]))]),
    // 32 ft gooseneck flat deck after the reference: black I-beam frame, wood deck, dovetail, triple axles, 8 ft upper deck with spare tyre
    gnflat: () => {
      const bk = '#1b1c1e', L = HC.TRAILERS.gnflat.len / 32 * 3, p = [];
      const tape = (x0, x1, y, z) => { for (let x = x0, i = 0; x < x1; x += 0.3, i++) p.push(Pm('box', i % 2 ? '#e8e8e8' : '#d0261e', [x + 0.15, y, z], [0.3, 0.05, 0.01])); };
      p.push(...[1, -1].flatMap((s) => [Pm('box', bk, [1.2, 0.66, s * 0.48], [7.4, 0.32, 0.12]), Pm('box', bk, [1.2, 0.9, s * 1.26], [7.4, 0.14, 0.08]),
          Pm('box', bk, [6.2, 1.5, s * 1.26], [2.6, 0.14, 0.08]), Pm('box', bk, [-2.8, 0.82, s * 1.26], [0.62, 0.12, 0.08], [0, 0, 0.36]),
          Pm('box', '#c22', [-3.1, 0.72, s * 1.1], [0.03, 0.1, 0.18]), Pm('box', COL.amber, [4.8, 0.9, s * 1.3], [0.06, 0.06, 0.03])]),
        ...[-2.2, -1.2, -0.2, 0.8, 1.8, 2.8, 3.8].map((x) => Pm('box', bk, [x, 0.78, 0], [0.1, 0.1, 2.5])),
        Pm('box', '#93704a', [1.2, 0.95, 0], [7.4, 0.07, 2.5]), Pm('box', '#93704a', [-2.8, 0.85, 0], [0.62, 0.06, 2.5], [0, 0, 0.36]), // main deck and dovetail
        Pm('box', bk, [4.95, 1.2, 0], [0.16, 0.66, 2.5]), Pm('box', '#8f6a42', [6.2, 1.57, 0], [2.6, 0.07, 2.5]), Pm('box', bk, [6.2, 1.45, 0], [2.6, 0.18, 0.9]), // step and upper deck over the bed
        Pm('box', bk, [7.5, 1.5, 0], [0.12, 0.3, 2.5]), Pm('box', '#e6e6e6', [7.57, 1.5, 0.5], [0.01, 0.1, 0.5]), // front plate
        ...[1, -1].map((s) => Pm('box', COL.amber, [7.57, 1.55, s * 1.1], [0.02, 0.08, 0.1])),
        Pm('box', bk, [L, 1.3, 0], [0.5, 0.12, 0.7]), Pm('cyl', bk, [L, 1.24, 0], [0.2, 0.18, 0.2]), Pm('cyl', COL.steel, [L, 1.21, 0], [0.15, 0.08, 0.15]), Pm('cyl', '#2b2d30', [L, 1.18, 0], [0.22, 0.05, 0.22]), // coupler
        Pm('box', bk, [6.6, 1.82, 0.95], [0.9, 0.42, 0.5]), Pm('box', '#2a2c2f', [6.6, 2.04, 0.95], [0.92, 0.03, 0.52]), // tool box on the upper deck
        Pm('cyl', '#1a1a1a', [5.55, 1.72, -0.5], [0.75, 0.22, 0.75]), Pm('cyl', '#b9bdc2', [5.55, 1.74, -0.5], [0.42, 0.24, 0.42]), // spare
        ...[1, -1].map((s) => Pm('box', bk, [5.0, 0.8, s * 0.6], [0.14, 0.8, 0.14])), ...[1, -1].map((s) => Pm('box', bk, [5.0, 0.32, s * 0.6], [0.3, 0.05, 0.3])),
        ...[-0.85, 0, 0.85].flatMap((x) => [...wheelM(x, 0.37, 0.98, 0.37, 0.22), ...wheelM(x, 0.37, -0.98, 0.37, 0.22), Pm('cyl', '#3a3b3d', [x, 0.37, 0], [0.12, 1.8, 0.12], [Math.PI / 2, 0, 0])]),
        ...[1, -1].map((s) => Pm('box', '#3b3f44', [-1.8, 0.82, s * 0.62], [2.3, 0.07, 0.5])));
      for (let x = -2.45; x < 4.85; x += 0.28) p.push(Pm('box', '#7b5a36', [x, 0.99, 0], [0.02, 0.01, 2.48]));
      for (let x = 5.0; x < 7.45; x += 0.28) p.push(Pm('box', '#6e5030', [x, 1.61, 0], [0.02, 0.01, 2.48]));
      for (const x of [-1.8, 0, 1.8, 3.6]) for (const s of [1, -1]) p.push(Pm('box', '#d0d2d4', [x, 1.0, s * 1.1], [0.1, 0.05, 0.05]));
      for (const s of [1, -1]) { tape(-2.5, 4.9, 0.9, s * 1.31); tape(4.9, 7.5, 1.5, s * 1.31); }
      return build(p);
    },
    // slide-out ramps: two aluminium planks with cleats, stowed under the deck
    rampsgndump: () => build([...[0.62, -0.62].flatMap((z) => [Pm('box', '#a8adb3', [-1.2, 0, z], [2.4, 0.07, 0.48]), Pm('box', '#7d8287', [-1.2, 0.05, z + 0.23], [2.4, 0.08, 0.03]), Pm('box', '#7d8287', [-1.2, 0.05, z - 0.23], [2.4, 0.08, 0.03]),
      ...[-0.4, -0.9, -1.4, -1.9].map((x) => Pm('box', '#8e9399', [x, 0.05, z], [0.04, 0.03, 0.46]))])]),
    rampsgnflat: () => build([...[0.65, -0.65].flatMap((z) => [Pm('box', '#a8adb3', [-1.05, 0, z], [2.1, 0.07, 0.5]), Pm('box', '#7d8287', [-1.05, 0.05, z + 0.24], [2.1, 0.08, 0.03]), Pm('box', '#7d8287', [-1.05, 0.05, z - 0.24], [2.1, 0.08, 0.03]),
      ...[-0.4, -0.9, -1.4].map((x) => Pm('box', '#8e9399', [x, 0.05, z], [0.04, 0.03, 0.48]))])]),
    rampsdeckover: () => build([...[0.6, -0.6].flatMap((z) => [Pm('box', '#5c6168', [-1.3, 0, z], [2.6, 0.08, 0.5]), Pm('box', COL.frame, [-1.3, 0.05, z + 0.24], [2.6, 0.08, 0.04]), Pm('box', COL.frame, [-1.3, 0.05, z - 0.24], [2.6, 0.08, 0.04]),
      ...[-0.4, -1.0, -1.6, -2.2].map((x) => Pm('box', '#7d8287', [x, 0.05, z], [0.05, 0.03, 0.48]))])]),
    rampsequip: () => build([Pm('box', '#5c6168', [-0.9, 0, 0.55], [1.8, 0.06, 0.45]), Pm('box', '#5c6168', [-0.9, 0, -0.55], [1.8, 0.06, 0.45]),
      ...[-0.3, -0.9, -1.5].flatMap((x) => [Pm('box', '#7d8287', [x, 0.04, 0.55], [0.04, 0.03, 0.45]), Pm('box', '#7d8287', [x, 0.04, -0.55], [0.04, 0.03, 0.45])])]),
    rampslowboy: () => build([Pm('box', '#5c6168', [-1.25, 0, 0.75], [2.5, 0.08, 0.6]), Pm('box', '#5c6168', [-1.25, 0, -0.75], [2.5, 0.08, 0.6])]),
    jack: () => build([Pm('cyl', COL.frame, [0, 0.35, 0], [0.12, 0.62, 0.12]), Pm('box', COL.frame, [0, 0.03, 0], [0.25, 0.05, 0.25]), Pm('box', COL.steel, [0, 0.66, 0.1], [0.05, 0.05, 0.2])]),
  };
  // a mulcher rotor: drum along Z with rows of teeth in a spiral, centred on the origin so it can spin
  function drumGeo(r, len, col, tooth, rows, cols) {
    const p = [Pm('cyl', col, [0, 0, 0], [r * 2, len, r * 2], [Math.PI / 2, 0, 0])];
    for (let a = 0; a < rows; a++) for (let i = 0; i < cols; i++) {
      const ang = a * (Math.PI * 2 / rows) + i * 0.35, z = -len / 2 + 0.1 + i * ((len - 0.2) / Math.max(1, cols - 1));
      p.push(Pm('box', tooth, [Math.cos(ang) * (r + 0.02), Math.sin(ang) * (r + 0.02), z], [0.1, 0.07, 0.08], [0, 0, ang]));
    }
    return build(p);
  }
  function chipperM(o) { // tow-behind disc/drum chipper; tongue toward +X
    const c = o.color, p = [Pm('box', COL.frame, [0.3, 0.55, 0], [o.len - 0.4, 0.2, 0.9]), ...couplerM(o.cpl, 0.55, 0.5),
      ...o.axles.flatMap((x) => [...wheelM(x, 0.4, o.w / 2, 0.4, 0.26), ...wheelM(x, 0.4, -o.w / 2, 0.4, 0.26)]),
      fenderM(o.axles.reduce((a, b) => a + b, 0) / o.axles.length, 0.88, o.w / 2, 0.9 * o.axles.length), fenderM(o.axles.reduce((a, b) => a + b, 0) / o.axles.length, 0.88, -o.w / 2, 0.9 * o.axles.length),
      Pm('box', c, [o.eng[0], 1.22, 0], [o.eng[1], 1.05, o.w * 0.72]), Pm('box', HC.shade(c, -0.12), [o.eng[0], 1.76, 0], [o.eng[1] * 0.96, 0.04, o.w * 0.68]),
      Pm('box', COL.black, [o.eng[0] + o.eng[1] / 2 + 0.01, 1.2, 0], [0.02, 0.7, o.w * 0.55]), Pm('cyl', '#333', [o.eng[0] - 0.2, 1.95, o.w * 0.2], [0.1, 0.45, 0.1]),
      Pm('cyl', c, [o.disc, 1.25, 0], [o.dr * 2, 0.6, o.dr * 2], [0, 0, Math.PI / 2]), Pm('cyl', HC.shade(c, -0.15), [o.disc, 1.25, 0], [o.dr * 1.3, 0.62, o.dr * 1.3], [0, 0, Math.PI / 2]),
      Pm('box', c, [o.inf + 0.45, 1.05, 0], [1.0, 0.95, o.iw]), Pm('box', '#0e0f10', [o.inf - 0.06, 1.05, 0], [0.02, 0.7, o.iw - 0.25]),
      Pm('box', '#c9cdd2', [o.inf - 0.42, 0.78, 0], [0.8, 0.05, o.iw]), Pm('box', '#c9cdd2', [o.inf - 0.42, 0.95, o.iw / 2], [0.8, 0.35, 0.03]), Pm('box', '#c9cdd2', [o.inf - 0.42, 0.95, -o.iw / 2], [0.8, 0.35, 0.03]),
      Pm('box', COL.red, [o.inf - 0.1, 1.55, 0], [0.05, 0.05, o.iw + 0.1]),
      Pm('cyl', c, [o.disc + 0.35, o.ch - 0.65, 0], [0.4, 1.4, 0.4], [0, 0, -0.45]), Pm('box', c, [o.disc + 0.75, o.ch, 0], [0.55, 0.12, 0.42], [0, 0, -0.35])];
    return build(p);
  }
  const UNIT_MODELS = {
    op: () => build(personM('#f07a22', '#f4c020')),
    saw: () => build(personM('#f07a22', '#f4c020', { chaps: true, visor: true })),
    land: () => build([...personM('#3e9c4f', '#ffffff'), Pm('cyl', '#9a7550', [0.25, 1.0, 0.3], [0.05, 1.3, 0.05], [0, 0, -0.5]), Pm('box', '#9aa0a6', [0.55, 0.42, 0.3], [0.22, 0.3, 0.03])]),
    truck: () => truckGeo('#ecebe6'),
    truck2: () => truckGeo('#2f5f94'),
    grinder: () => { // walk-behind tracked stump cutter, 2.4 m x 0.9 m x 1.25 m
      const yel = '#f2c200', p = [...trackM(1.2, 0.33, 0.3, 0.22, 3), ...trackM(1.2, -0.33, 0.3, 0.22, 3),
        Pm('box', COL.frame, [-0.1, 0.38, 0], [1.3, 0.12, 0.6]), Pm('box', yel, [-0.3, 0.68, 0], [0.75, 0.5, 0.62]), Pm('box', COL.black, [-0.3, 0.95, 0], [0.55, 0.06, 0.5]),
        Pm('cyl', '#333', [-0.5, 1.05, 0.18], [0.07, 0.25, 0.07]), Pm('box', yel, [0.42, 0.5, 0], [0.9, 0.16, 0.16], [0, 0, -0.18]),
        Pm('cyl', '#9aa0a6', [0.95, 0.38, 0], [0.56, 0.05, 0.56], [Math.PI / 2, 0, 0]), Pm('box', COL.black, [0.9, 0.62, 0], [0.55, 0.06, 0.2], [0, 0, 0.25]),
        Pm('box', COL.frame, [-0.85, 0.85, 0.24], [0.06, 0.7, 0.06], [0, 0, 0.55]), Pm('box', COL.frame, [-0.85, 0.85, -0.24], [0.06, 0.7, 0.06], [0, 0, 0.55]),
        Pm('box', COL.frame, [-1.02, 1.12, 0], [0.06, 0.06, 0.62]), Pm('box', yel, [-0.98, 1.0, 0], [0.12, 0.18, 0.3])];
      for (let i = 0; i < 12; i++) { const a = (i / 12) * 6.283; p.push(Pm('box', '#e8c84a', [0.95 + Math.cos(a) * 0.29, 0.38 + Math.sin(a) * 0.29, 0], [0.06, 0.06, 0.09], [0, 0, a])); }
      return build(p);
    },
    chipper: () => chipperM({ color: '#f2c200', len: 4.6, cpl: HC.TRAILERS.chipper.len, w: 1.6, axles: [0], eng: [0.95, 1.3], disc: -0.25, dr: 0.62, inf: -1.3, iw: 1.3, ch: 2.4 }),
    mower: () => ztMower({ col: '#2f7d32', dark: '#1f5c24', rim: '#f2c200', deck: 1.22, R: 0.34, Wt: 0.27, track: 0.56, len: 0.85, tan: '#2a2c2f' }),
  };
  const JD = { green: '#367c2b', yellow: '#f2c200' };
  function dozerM(k, ripper) { // crawler dozer; k scales a D6-size machine (blade 3.6 m)
    const q = (v) => v * k, Q = (g, c, pos, scl, rot) => Pm(g, c, pos.map(q), scl.map(q), rot);
    const p = [];
    for (const z of [1.15, -1.15]) {
      p.push(...trackM(3.3 * k, z * k, 0.9 * k, 0.62 * k, 6), Q('box', COL.cat, [0, 0.62, z * 0.86], [2.7, 0.4, 0.16]));
      p.push(Q('box', COL.cat, [1.95, 0.75, z * 0.95], [1.9, 0.22, 0.2], [0, 0, 0.06])); // C-frame push arm
    }
    p.push(Q('box', COL.frame, [0, 0.95, 0], [3.0, 0.3, 1.6]), Q('box', COL.cat, [0.75, 1.55, 0], [2.2, 1.0, 1.55]), Q('box', COL.catDark, [0.75, 2.07, 0], [2.1, 0.05, 1.45]),
      Q('box', COL.black, [1.86, 1.5, 0], [0.04, 0.75, 1.3]), Q('cyl', COL.chrome, [1.2, 2.5, 0.4], [0.14, 0.9, 0.14]),
      Q('box', COL.cat, [-0.7, 1.35, 0], [1.4, 0.6, 1.9]), ...cabM(-0.65 * k, 1.7 * k, 1.3 * k, 1.3 * k, 1.5 * k, COL.cat).map((pp) => pp),
      Q('box', COL.cat, [-1.55, 1.3, 0], [0.3, 0.9, 2.0]),
      Q('box', COL.cat, [2.75, 0.8, 0], [0.35, 1.3, 3.6], [0, 0, -0.08]), Q('box', '#2a2b2d', [2.86, 0.18, 0], [0.12, 0.14, 3.62]),
      Q('box', COL.cat, [2.62, 0.85, 1.82], [0.5, 1.2, 0.08]), Q('box', COL.cat, [2.62, 0.85, -1.82], [0.5, 1.2, 0.08]),
      Q('cyl', COL.chrome, [2.0, 1.4, 0.55], [0.14, 1.1, 0.14], [0, 0, 1.1]), Q('cyl', COL.chrome, [2.0, 1.4, -0.55], [0.14, 1.1, 0.14], [0, 0, 1.1]));
    if (ripper) p.push(Q('box', COL.cat, [-1.95, 0.9, 0], [0.5, 0.3, 1.6]), Q('box', COL.black, [-2.2, 0.45, 0], [0.18, 1.0, 0.16], [0, 0, 0.25]));
    return build(p);
  }
  // chip trucks: white cab-and-chassis with a tall enclosed chip box: rear opening over a swing-down gate, roof, side vents
  function chipTruckM(big) {
    const wht = '#f1f1ec', sh = HC.shade(wht, -0.1), X = Math.PI / 2;
    const cabX = big ? 3.95 : 3.45, x0 = 0.56, xr = big ? -5.05 : -3.8, L = x0 - xr, cx = (x0 + xr) / 2;
    const rear = big ? [-2.95, -4.2] : [-2.35];
    const p = [Pm('box', COL.black, [big ? -0.55 : -0.4, 0.82, 0], [big ? 9.4 : 7.2, 0.28, 0.95]), ...truckCabM(cabX, wht, { hood: 1.2, cabL: 1.55, w: 2.1, hy: 1.05, cy: 1.1, ch: 1.25 }),
      Pm('cyl', '#7d8287', [0.3, 1.1, 0], [0.26, 0.55, 0.26]), // hoist cylinder
      ...[1, -1].map((s2) => Pm('box', '#c9cdd2', [-0.55, 0.95, s2 * 1.05], [1.0, 0.55, 0.32])), // aluminium toolboxes
      ...BX([Pm('box', wht, [cx, 1.26, 0], [L, 0.12, 2.32]),
        ...[1, -1].flatMap((s2) => [Pm('box', wht, [cx, 2.42, s2 * 1.16], [L, 2.24, 0.06]), Pm('box', sh, [cx, 2.55, s2 * 1.19], [L - 0.06, 0.05, 0.02]),
          Pm('box', sh, [cx, 1.8, s2 * 1.19], [L - 0.06, 0.05, 0.02]), ...[-0.2, -0.7].map((x) => Pm('box', '#3a3c3f', [x, 3.25, s2 * 1.195], [0.3, 0.16, 0.01])),
          Pm('box', '#c42a24', [xr - 0.04, 3.3, s2 * 0.95], [0.03, 0.14, 0.14]), Pm('box', '#e8a33a', [xr - 0.04, 3.3, s2 * 0.75], [0.03, 0.12, 0.12])]),
        Pm('box', wht, [x0 - 0.01, 2.42, 0], [0.06, 2.24, 2.32]), Pm('box', wht, [cx, 3.56, 0], [L + 0.06, 0.08, 2.38]),
        Pm('box', '#5d6064', [cx, 3.5, 0], [L - 0.06, 0.02, 2.2]), Pm('box', '#6a6d71', [x0 - 0.06, 2.42, 0], [0.02, 2.2, 2.2]), // darker lining inside, seen through the open back
        Pm('box', wht, [xr, 3.3, 0], [0.1, 0.5, 2.32]), // rear header over the open back where the chipper blows in
        Pm('box', wht, [xr - 0.02, 1.65, 0], [0.08, 0.75, 2.32]), Pm('box', sh, [xr - 0.07, 1.65, 0], [0.02, 0.06, 2.0]), // swing-down gate
        ...[1, -1].map((s2) => Pm('box', '#2b2d30', [xr - 0.06, 1.65, s2 * 0.6], [0.04, 0.6, 0.06]))]), // gate latches
      Pm('box', COL.chrome, [xr - 0.15, 0.8, 0], [0.12, 0.16, 2.1]), ...[1, -1].map((s2) => Pm('box', '#c22', [xr - 0.1, 0.98, s2 * 0.95], [0.03, 0.1, 0.14])),
      ...wheelM(cabX - 0.85, 0.48, 0.92, 0.48, 0.3), ...wheelM(cabX - 0.85, 0.48, -0.92, 0.48, 0.3),
      ...rear.flatMap((x) => [...wheelM(x, 0.48, 0.8, 0.48, 0.26), ...wheelM(x, 0.48, -0.8, 0.48, 0.26), ...wheelM(x, 0.48, 1.08, 0.48, 0.26), ...wheelM(x, 0.48, -1.08, 0.48, 0.26)])];
    if (big) p.push(...[1, -1].map((s2) => Pm('box', COL.black, [-3.58, 0.98, s2 * 1.2], [2.3, 0.08, 0.32]))); // mud flaps rail between the tandems
    return p;
  }
  // ---------- mowers ----------
  // zero-turn: two big drive tyres under fenders, a frame rail to front casters, a fabricated deck with spindle covers and a
  // side chute, fuel tanks on the fenders, a suspended high-back seat, lap-bar levers and a fold-down ROPS hoop
  function ztMower(o) {
    const X = Math.PI / 2, b = '#1c1d1f', g2 = '#3a3d41', L = o.len, R = o.R, tz = o.track, rx = -0.45 * L, dk = o.deck, fx = 0.95 * L;
    const p = [...wheelM(rx, R, tz, R, o.Wt, o.rim), ...wheelM(rx, R, -tz, R, o.Wt, o.rim)];
    for (const s of [1, -1]) {
      p.push(Pm('hshell', o.col, [rx, R + 0.02, s * tz], [R * 2 + 0.12, R * 2 + 0.12, o.Wt + 0.08]), // fender over the drive tyre
        Pm('box', o.col, [rx + 0.05, R * 2 + 0.06, s * (tz - 0.04)], [0.62 * L, 0.2, 0.26]), Pm('box', o.dark, [rx + 0.05, R * 2 + 0.17, s * (tz - 0.04)], [0.56 * L, 0.02, 0.22]), // fuel tank
        Pm('cyl', b, [rx + 0.2, R * 2 + 0.2, s * (tz - 0.04)], [0.08, 0.04, 0.08]),
        ...wheelM(fx, 0.14, s * (dk / 2 - 0.1), 0.14, 0.1, o.rim), Pm('box', o.col, [fx, 0.34, s * (dk / 2 - 0.1)], [0.08, 0.26, 0.12]), Pm('cyl', o.col, [fx, 0.5, s * (dk / 2 - 0.1)], [0.1, 0.12, 0.1]), // casters on forks
        Pm('box', o.col, [0.25 * L, 0.42, s * 0.22], [1.45 * L, 0.1, 0.08]), // frame rails
        Pm('box', o.col, [0.05 * L, 0.98, s * 0.31], [0.07, 0.42, 0.06], [0, 0, -0.18]), Pm('box', b, [0.16 * L, 1.18, s * 0.24], [0.06, 0.06, 0.24]), // lap bars
        Pm('box', b, [rx - 0.25, 1.35, s * (tz - 0.12)], [0.08, 1.0, 0.08]), Pm('box', b, [rx - 0.2, 0.86, s * (tz - 0.12)], [0.16, 0.06, 0.1])); // ROPS legs
    }
    p.push(Pm('box', o.col, [0.55 * L, 0.46, 0], [0.5 * L, 0.06, 0.52]), Pm('box', g2, [0.5 * L, 0.5, 0], [0.42 * L, 0.02, 0.46]), // foot pan
      Pm('box', o.col, [rx - 0.15, 0.7, 0], [0.55, 0.46, 0.7]), Pm('box', b, [rx - 0.2, 0.98, 0], [0.48, 0.18, 0.5]), // engine deck
      Pm('cyl', g2, [rx - 0.05, 1.12, 0.18], [0.2, 0.12, 0.2]), Pm('cyl', '#2a2c2f', [rx - 0.35, 1.05, -0.2], [0.07, 0.18, 0.07]), // air filter, muffler
      Pm('box', b, [-0.12 * L, 0.88, 0], [0.48, 0.1, 0.52]), Pm('box', o.tan, [-0.1 * L, 0.94, 0], [0.38, 0.03, 0.34]), // seat cushion
      Pm('box', b, [-0.36 * L, 1.2, 0], [0.1, 0.6, 0.5], [0, 0, 0.12]), Pm('box', o.tan, [-0.31 * L, 1.22, 0], [0.02, 0.44, 0.26], [0, 0, 0.12]), // high back
      Pm('box', b, [-0.36 * L, 1.53, 0], [0.12, 0.08, 0.3], [0, 0, 0.12]),
      Pm('box', b, [rx - 0.25, 1.85, 0], [0.08, 0.08, (tz - 0.12) * 2 + 0.08])); // ROPS top bar
    // the deck: a fabricated shell, spindle covers, belt shield, deflector chute on the right
    const dx = 0.62 * L + dk * 0.08;
    p.push(Pm('box', o.col, [dx, 0.24, 0], [dk * 0.5, 0.16, dk]), Pm('box', o.dark, [dx, 0.33, 0], [dk * 0.46, 0.03, dk - 0.06]),
      ...[1, -1].map((s) => Pm('cyl', o.col, [dx + dk * 0.1, 0.24, s * dk * 0.26], [dk * 0.5, 0.16, dk * 0.5])),
      ...[-1, 0, 1].map((k) => Pm('cyl', o.dark, [dx + (k ? 0 : 0.05), 0.36, k * dk * 0.32], [0.24, 0.05, 0.24])),
      Pm('box', g2, [dx - dk * 0.1, 0.37, 0], [0.16, 0.04, dk * 0.7]), // belt shield
      Pm('box', b, [dx - 0.05, 0.24, -(dk / 2 + 0.18)], [dk * 0.32, 0.06, 0.38], [0.22, 0, 0])); // chute
    if (o.pro) p.push(Pm('box', b, [rx - 0.48, 0.5, 0], [0.08, 0.3, 0.6]), Pm('box', '#c22', [rx - 0.52, 0.62, 0.22], [0.02, 0.06, 0.08]), Pm('box', '#c22', [rx - 0.52, 0.62, -0.22], [0.02, 0.06, 0.08]));
    return build(p);
  }
  // the 61" commercial zero-turn, after the reference photo: clean orange body and fenders, turf tyres on orange wheels,
  // black high-back seat with a tan insert, black engine and ROPS hoop, orange lap bars, a long low deck and a black chute
  function proZeroTurn() {
    const o = '#ef7a14', od = '#c45f0b', b = '#1b1c1e', tan = '#a8662e', X = Math.PI / 2;
    const p = [...wheelM(-0.55, 0.42, 0.63, 0.42, 0.32, o), ...wheelM(-0.55, 0.42, -0.63, 0.42, 0.32, o)];
    for (const s of [1, -1]) p.push(
      Pm('box', o, [-0.5, 0.9, s * 0.62], [0.78, 0.05, 0.38]), Pm('box', o, [-0.06, 0.8, s * 0.62], [0.2, 0.05, 0.38], [0, 0, -0.75]), // flat fender + front lip
      Pm('box', o, [-0.95, 0.8, s * 0.62], [0.12, 0.05, 0.38], [0, 0, 0.9]),
      ...[-0.62, -0.48, -0.34].map((x) => Pm('box', b, [x, 0.66, s * 0.462], [0.035, 0.22, 0.004], [0, 0, 0.35])), // tiger stripes on the side panel
      Pm('box', b, [-0.38, 1.05, s * 0.27], [0.3, 0.05, 0.07]), // armrests
      Pm('box', o, [-0.04, 0.95, s * 0.3], [0.06, 0.34, 0.06], [0, 0, -0.2]), Pm('box', b, [0.02, 1.13, s * 0.2], [0.05, 0.05, 0.2]), // lap bars
      Pm('box', b, [-0.7, 1.35, s * 0.42], [0.07, 1.1, 0.07]), Pm('sph', b, [-0.7, 1.9, s * 0.42], [0.09, 0.09, 0.09]), // ROPS legs
      Pm('box', o, [0.4, 0.46, s * 0.24], [1.05, 0.09, 0.08]), // frame rails
      ...wheelM(0.98, 0.15, s * 0.6, 0.15, 0.11, o), Pm('box', o, [0.98, 0.33, s * 0.6], [0.06, 0.22, 0.12]), Pm('cyl', o, [0.98, 0.46, s * 0.6], [0.09, 0.08, 0.09]), // casters
      Pm('cyl', o, [0.72, 0.24, s * 0.52], [0.58, 0.14, 0.58]), Pm('cyl', od, [0.72, 0.32, s * 0.52], [0.24, 0.03, 0.24])); // deck front corners + spindle covers
    p.push(Pm('box', o, [-0.42, 0.62, 0], [0.72, 0.36, 0.92]), // body between the tyres
      Pm('box', b, [-0.85, 0.98, 0], [0.42, 0.3, 0.6]), Pm('box', o, [-0.85, 1.15, 0], [0.44, 0.05, 0.62]), Pm('cyl', '#3a3d41', [-0.78, 1.22, 0.16], [0.16, 0.1, 0.16]), // engine
      Pm('box', b, [-0.36, 0.92, 0], [0.46, 0.1, 0.5]), Pm('box', tan, [-0.34, 0.975, 0], [0.36, 0.02, 0.24]), // seat
      Pm('box', b, [-0.6, 1.24, 0], [0.1, 0.56, 0.5], [0, 0, 0.15]), Pm('box', tan, [-0.545, 1.25, 0], [0.02, 0.42, 0.24], [0, 0, 0.15]),
      Pm('box', b, [-0.7, 1.92, 0], [0.07, 0.07, 0.84]), // ROPS top bar
      Pm('box', o, [0.32, 0.51, 0], [0.5, 0.04, 0.5]), Pm('box', '#2b2d30', [0.32, 0.535, 0], [0.44, 0.01, 0.44]), // foot plate
      Pm('box', o, [0.98, 0.46, 0], [0.09, 0.09, 1.2]), // front cross beam
      Pm('box', o, [0.42, 0.24, 0], [0.62, 0.14, 1.6]), Pm('box', od, [0.42, 0.315, 0], [0.56, 0.01, 1.5]), Pm('cyl', od, [0.36, 0.32, 0], [0.24, 0.03, 0.24]), // deck
      ...[[0.2, 1], [0.2, -1], [0.75, 1], [0.75, -1]].map(([x, s2]) => Pm('box', b, [x, 0.38, s2 * 0.24], [0.04, 0.16, 0.04])), // deck hangers to the frame
      Pm('box', o, [1.02, 0.22, 0], [0.04, 0.06, 1.15]), // deck bumper
      Pm('box', b, [0.5, 0.2, -1.0], [0.48, 0.05, 0.34], [0.2, 0, 0])); // discharge chute
    return build(p);
  }
  function standOnMower() { // 52" stand-on: compact chassis, control tower with twin levers, padded thigh rest, platform
    const c = '#c8322a', cd = '#962219', b = '#1c1d1f', g2 = '#3a3d41', X = Math.PI / 2, dk = 1.32;
    const p = [...wheelM(-0.4, 0.33, 0.56, 0.33, 0.28, '#cfd2d6'), ...wheelM(-0.4, 0.33, -0.56, 0.33, 0.28, '#cfd2d6')];
    for (const s of [1, -1]) p.push(Pm('hshell', c, [-0.4, 0.35, s * 0.56], [0.78, 0.78, 0.34]), Pm('box', c, [-0.2, 0.72, s * 0.42], [0.55, 0.22, 0.2]),
      ...wheelM(0.85, 0.13, s * 0.55, 0.13, 0.1, '#cfd2d6'), Pm('box', c, [0.85, 0.3, s * 0.55], [0.07, 0.22, 0.1]),
      Pm('box', b, [-0.7, 1.32, s * 0.2], [0.05, 0.24, 0.05], [0, 0, 0.3]), Pm('sph', '#2b2d30', [-0.74, 1.45, s * 0.2], [0.07, 0.07, 0.07]));
    p.push(Pm('box', c, [0.15, 0.48, 0], [1.2, 0.16, 0.62]), Pm('box', c, [-0.3, 0.68, 0], [0.62, 0.32, 0.66]), Pm('box', b, [-0.38, 0.92, 0], [0.48, 0.2, 0.5]),
      Pm('cyl', g2, [-0.3, 1.05, 0.15], [0.16, 0.1, 0.16]),
      Pm('box', cd, [-0.64, 0.98, 0], [0.12, 0.6, 0.6]), Pm('box', b, [-0.7, 1.18, 0], [0.1, 0.18, 0.52]), // control tower + thigh pad
      Pm('box', '#2b2d30', [-0.62, 1.31, 0], [0.16, 0.04, 0.5]),
      Pm('box', b, [-0.98, 0.22, 0], [0.42, 0.05, 0.6]), Pm('box', g2, [-0.98, 0.25, 0], [0.38, 0.01, 0.54]), // platform
      Pm('box', c, [0.66, 0.24, 0], [0.7, 0.14, dk]), Pm('box', cd, [0.66, 0.32, 0], [0.64, 0.03, dk - 0.06]),
      ...[1, -1].map((s) => Pm('cyl', c, [0.74, 0.24, s * dk * 0.26], [0.66, 0.14, 0.66])),
      ...[-1, 0, 1].map((k) => Pm('cyl', cd, [0.66, 0.35, k * dk * 0.32], [0.2, 0.05, 0.2])),
      Pm('box', b, [0.6, 0.22, -(dk / 2 + 0.16)], [0.42, 0.06, 0.32], [0.22, 0, 0]));
    return build(p);
  }
  function wideMower() { // out-front rotary mower after the reference: big front drive wheels, small rear steer wheels,
    // long green engine hood with a high-back yellow seat, steering column up front, and a wide yellow deck on casters
    const g = '#367c2b', gd = '#2a6322', y = '#f2c200', dk = '#e6cf5c', dkd = '#bfa53e', b = '#1c1d1f', X = Math.PI / 2, W = 2.44;
    const p = [...wheelM(0.15, 0.36, 0.56, 0.36, 0.28, y), ...wheelM(0.15, 0.36, -0.56, 0.36, 0.28, y),
      ...wheelM(-1.3, 0.22, 0.45, 0.22, 0.16, y), ...wheelM(-1.3, 0.22, -0.45, 0.22, 0.16, y)];
    for (const s2 of [1, -1]) p.push(
      Pm('box', y, [-0.9, 0.72, s2 * 0.455], [0.95, 0.06, 0.01]), // yellow stripe on the hood side
      Pm('box', b, [-1.3, 0.48, s2 * 0.45], [0.1, 0.26, 0.1]), // rear steer knuckles
      ...wheelM(1.8, 0.13, s2 * (W / 2 - 0.12), 0.13, 0.1, y), Pm('box', dk, [1.8, 0.3, s2 * (W / 2 - 0.12)], [0.07, 0.2, 0.1]), // deck casters
      Pm('cyl', dk, [1.42, 0.26, s2 * (W / 2 - 0.42)], [0.84, 0.16, 0.84]), // rounded deck shells
      Pm('box', b, [0.66, 0.5, s2 * 0.36], [0.42, 0.08, 0.08], [0, 0, 0.42]), Pm('cyl', '#9aa0a6', [0.7, 0.58, s2 * 0.26], [0.05, 0.3, 0.05], [0, 0, -1.0]), // lift arms + lift cylinders
      Pm('box', b, [0.74, 0.36, s2 * 0.3], [0.32, 0.1, 0.08])); // deck hitch rails
    p.push(Pm('box', b, [-0.55, 0.42, 0], [1.9, 0.16, 0.7]), // frame
      Pm('box', g, [-0.92, 0.75, 0], [1.0, 0.52, 0.9]), Pm('box', gd, [-0.92, 1.02, 0], [0.96, 0.03, 0.84]), Pm('box', b, [-1.43, 0.72, 0], [0.02, 0.36, 0.7]), // engine hood
      Pm('box', b, [0.15, 0.74, 0], [0.82, 0.06, 1.34]), Pm('box', g, [0.1, 0.62, 0], [0.7, 0.22, 0.86]), // operator platform
      Pm('box', b, [-0.28, 0.92, 0], [0.5, 0.12, 0.56]), Pm('box', y, [-0.27, 0.99, 0], [0.42, 0.04, 0.48]), // seat
      Pm('box', b, [-0.52, 1.24, 0], [0.12, 0.56, 0.54], [0, 0, 0.18]), Pm('box', y, [-0.46, 1.25, 0], [0.04, 0.48, 0.46], [0, 0, 0.18]), // high back
      Pm('box', g, [0.5, 0.98, 0], [0.14, 0.52, 0.16], [0, 0, 0.32]), Pm('cyl', b, [0.4, 1.25, 0], [0.38, 0.04, 0.38], [0, 0, 0.5]), // steering column + wheel
      Pm('box', dk, [1.22, 0.26, 0], [0.75, 0.16, W - 0.84]), Pm('box', dk, [0.87, 0.26, 0], [0.4, 0.16, W]), // deck, close behind the front wheels
      Pm('box', b, [0.62, 0.36, 0], [0.22, 0.14, 0.8]), Pm('box', dkd, [0.8, 0.36, 0], [0.16, 0.08, 0.7]), // hitch plate where the deck pins to the frame
      Pm('box', dkd, [1.12, 0.345, 0], [0.9, 0.02, W - 0.3]), ...[-1, 0, 1].map((k) => Pm('cyl', dkd, [1.27, 0.36, k * 0.72], [0.28, 0.05, 0.28])),
      Pm('box', b, [0.87, 0.24, W / 2 + 0.1], [0.4, 0.06, 0.24], [-0.25, 0, 0])); // side chute
    return build(p);
  }
  const BIG_MODELS = {
    excavatorBase: (part) => { // 13-ton class, styled after the reference photos: rounded counterweight, vented engine hood,
      // black cab with big glass, steps and handrails, toolbox and fuel tank ahead of the deck
      const y = COL.cat, yd = COL.catDark, blk = '#1c1d1f', X = Math.PI / 2;
      const lower = [...trackM(3.6, 0.95, 0.78, 0.6, 6), ...trackM(3.6, -0.95, 0.78, 0.6, 6), Pm('box', COL.frame, [0, 0.55, 0], [2.4, 0.4, 1.4]),
        Pm('cyl', '#2a2b2d', [0, 0.9, 0], [1.6, 0.18, 1.6])]; // undercarriage and swing ring; everything above turns on it
      const p = [
        Pm('box', y, [-0.2, 1.12, 0], [2.6, 0.32, 2.4]), // upper frame deck
        Pm('box', y, [-0.75, 1.62, -0.35], [1.4, 0.7, 1.7]), Pm('box', yd, [-0.75, 1.98, -0.35], [1.35, 0.04, 1.6]), // engine hood
        ...Array.from({ length: 6 }, (_, i) => Pm('box', '#2b2d30', [-1.25 + i * 0.2, 2.005, -0.35], [0.1, 0.01, 1.2])),
        Pm('box', y, [-1.42, 1.5, 0], [0.4, 0.86, 2.4]), Pm('cyl', y, [-1.6, 1.5, 0], [0.75, 0.86, 2.3]), Pm('box', yd, [-1.42, 1.94, 0], [0.42, 0.04, 2.3]), // counterweight
        ...[1, -1].map((s2) => Pm('box', '#c22', [-1.97, 1.45, s2 * 0.85], [0.03, 0.1, 0.16])),
        Pm('box', y, [0.55, 1.62, -0.75], [1.0, 0.7, 0.85]), Pm('box', '#2b2d30', [0.55, 1.7, -1.18], [0.8, 0.4, 0.02]), // toolbox/fuel tank
        Pm('cyl', '#2a2c2f', [-1.0, 2.25, -0.8], [0.12, 0.55, 0.12]),
        // handrails along the deck and steps up the side
        ...[[-1.3, -1.12], [0.0, -1.12], [0.9, -1.12]].map(([px, pz]) => Pm('box', blk, [px, 2.22, pz], [0.04, 0.5, 0.04])), Pm('box', blk, [-0.2, 2.46, -1.12], [2.2, 0.04, 0.04]),
        ...[1.25, 1.0].map((yy, i) => Pm('box', '#2b2d30', [0.9 - i * 0.2, yy - 0.35, -1.2], [0.4, 0.04, 0.22])),
        Pm('box', y, [0.55, 1.4, 0.72], [1.5, 0.25, 1.0]), ...cabM(0.55, 1.52, 1.6, 1.45, 0.95, blk, 0.72),
        Pm('box', '#e6eef3', [1.3, 2.2, 0.25], [0.06, 0.1, 0.16])];
      return build(part === 'lower' ? lower : part === 'upper' ? p : lower.concat(p));
    },
    excavatorArm: () => { // curved boom, stick and bucket on H-link, with paired boom cylinders, stick and bucket cylinders, hoses
      const y = COL.cat, X = Math.PI / 2, p = [];
      const seg = (c, a, b, t, w, z = 0) => { const dx = b[0] - a[0], dy = b[1] - a[1]; p.push(Pm('box', c, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, z], [Math.hypot(dx, dy), t, w], [0, 0, Math.atan2(dy, dx)])); };
      const ram = (a, b, r, z = 0) => { // barrel from a, chrome rod to b
        const m = [a[0] + (b[0] - a[0]) * 0.55, a[1] + (b[1] - a[1]) * 0.55];
        const dx = b[0] - a[0], dy = b[1] - a[1], ang = Math.atan2(dy, dx) - X;
        p.push(Pm('cyl', y, [(a[0] + m[0]) / 2, (a[1] + m[1]) / 2, z], [r * 2, Math.hypot(m[0] - a[0], m[1] - a[1]), r * 2], [0, 0, ang]),
          Pm('cyl', COL.chrome, [(m[0] + b[0]) / 2, (m[1] + b[1]) / 2, z], [r * 1.1, Math.hypot(b[0] - m[0], b[1] - m[1]) + 0.1, r * 1.1], [0, 0, ang]));
      };
      const A = [0, 0], B = [2.1, 2.15], C = [3.45, 1.8], D = [3.62, -0.95];
      seg(y, A, B, 0.5, 0.46); seg(y, B, C, 0.46, 0.44); p.push(Pm('cyl', y, [B[0], B[1], 0], [0.5, 0.46, 0.5], [X, 0, 0]));
      seg(y, C, D, 0.36, 0.34); p.push(Pm('cyl', y, [C[0], C[1], 0], [0.44, 0.4, 0.44], [X, 0, 0]));
      for (const z of [0.3, -0.3]) ram([0.35, -0.55], [1.5, 1.2], 0.11, z); // boom lift cylinders
      ram([1.7, 2.6], [3.35, 2.25], 0.1); // stick cylinder on top of the boom
      ram([3.32, 1.55], [3.68, -0.55], 0.09, 0.0); // bucket cylinder down the stick
      for (const z of [0.12, -0.12]) { seg('#1c1d1f', [0.3, 0.32], [2.05, 2.48], 0.04, 0.04, z); seg('#1c1d1f', [2.05, 2.48], [3.35, 2.05], 0.04, 0.04, z); }
      // H-link, a curled digging bucket (rounded back, round side plates, cutting edge, teeth pointing in toward the
      // machine) and a hydraulic thumb on the stick that closes against it
      const Cb = [3.74, -1.42], R = 0.5, BW = 1.0, arc = [];
      for (let i = 0; i <= 7; i++) { const a = (60 - i * 30) * Math.PI / 180; arc.push([Cb[0] + Math.cos(a) * R, Cb[1] + Math.sin(a) * R]); } // from the pin ear round the back to the lip
      for (let i = 0; i < arc.length - 1; i++) seg(y, arc[i], arc[i + 1], 0.07, BW);
      for (const s2 of [1, -1]) { // side plates: a fan that follows the curl, so the mouth stays open toward the machine
        for (let i = 0; i < arc.length - 1; i++) {
          const m = [(arc[i][0] + arc[i + 1][0]) / 2, (arc[i][1] + arc[i + 1][1]) / 2], ch = Math.hypot(arc[i + 1][0] - arc[i][0], arc[i + 1][1] - arc[i][1]);
          p.push(Pm('box', y, [(Cb[0] + m[0]) / 2, (Cb[1] + m[1]) / 2, s2 * BW / 2], [R * 0.98, ch * 1.08, 0.05], [0, 0, Math.atan2(m[1] - Cb[1], m[0] - Cb[0])]));
        }
        p.push(Pm('box', '#2b2d30', [3.66, -0.9, s2 * 0.2], [0.22, 0.14, 0.06])); // pin ears
      }
      const lip = arc[arc.length - 1], prev = arc[arc.length - 2], la = Math.atan2(lip[1] - prev[1], lip[0] - prev[0]);
      p.push(Pm('box', '#c9cdd2', [lip[0], lip[1], 0], [0.14, 0.06, BW + 0.04], [0, 0, la])); // cutting edge
      for (const z of [-0.36, -0.12, 0.12, 0.36]) p.push(Pm('box', '#3a3b3d', [lip[0] + Math.cos(la) * 0.13, lip[1] + Math.sin(la) * 0.13, z], [0.2, 0.08, 0.1], [0, 0, la]));
      seg('#2b2d30', [3.68, -0.55], [3.86, -0.95], 0.08, 0.3); seg('#2b2d30', [3.6, -0.78], [3.86, -0.95], 0.08, 0.26); // H-link
      // thumb: three curved tines hinged low on the stick, closing toward the bucket lip
      const T0 = [3.5, -0.62], T1 = [3.2, -1.1], T2 = [3.12, -1.55];
      for (const z of [-0.32, 0, 0.32]) { seg('#2b2d30', T0, T1, 0.1, 0.08, z); seg('#2b2d30', T1, T2, 0.09, 0.08, z); p.push(Pm('box', '#3a3b3d', [T2[0] + 0.04, T2[1] - 0.05, z], [0.12, 0.08, 0.09], [0, 0, -0.6])); }
      seg('#2b2d30', [3.2, -1.1], [3.2, -1.1], 0.1, 0.72); p.push(Pm('box', '#2b2d30', [3.28, -0.98, 0], [0.12, 0.12, 0.72], [0, 0, -1.0])); // tine cross bar
      ram([3.48, 0.2], [3.32, -0.9], 0.07, 0.0); // thumb cylinder
      return build(p);
    },
    fmulcher: () => build([ // tracked mulcher: 6.7 m x 2.5 m x 2.7 m
      ...trackM(3.6, 1.0, 0.85, 0.55, 6), ...trackM(3.6, -1.0, 0.85, 0.55, 6),
      Pm('box', '#2f5f35', [-0.55, 1.35, 0], [3.4, 1.0, 1.55]), Pm('box', '#f2c94c', [-0.55, 1.4, 0.78], [3.4, 0.1, 0.01]), Pm('box', '#f2c94c', [-0.55, 1.4, -0.78], [3.4, 0.1, 0.01]),
      Pm('box', '#284f2d', [-1.9, 1.5, 0], [0.7, 1.1, 1.6]), Pm('box', COL.black, [-2.26, 1.5, 0], [0.02, 0.7, 1.2]),
      ...cabM(0.45, 1.85, 0.85, 1.4, 1.3, '#2f5f35'), Pm('cyl', COL.chrome, [-1.3, 2.3, 0.5], [0.13, 1.0, 0.13]),
      Pm('box', '#2f5f35', [2.65, 0.85, 0], [0.95, 0.95, 2.5]), Pm('box', '#284f2d', [2.65, 1.34, 0], [1.0, 0.06, 2.55]),
      Pm('box', '#2f5f35', [1.75, 0.95, 1.15], [1.3, 0.2, 0.15], [0, 0, -0.35]), Pm('box', '#2f5f35', [1.75, 0.95, -1.15], [1.3, 0.2, 0.15], [0, 0, -0.35])]),
    chipper2: () => chipperM({ color: COL.red, len: 6.2, cpl: HC.TRAILERS.chipper2.len, w: 2.1, axles: [-0.45, 0.45], eng: [1.5, 1.8], disc: 0.0, dr: 0.85, inf: -1.6, iw: 1.8, ch: 3.0 }),
    dumptruck: () => build(BIG_MODELS.dumptruckParts()),
    dumptruckParts: () => [ // single-axle dump, 7.6 m; the box (.box) tips up on its rear hinge
      Pm('box', COL.black, [-0.3, 0.85, 0], [7.2, 0.3, 0.95]), ...truckCabM(3.75, '#e8731c', { hood: 1.3, cabL: 1.5, w: 2.3, hy: 1.25, cy: 1.3, ch: 1.35 }),
      ...BX([Pm('box', '#4e5358', [-1.6, 1.45, 0], [4.4, 0.15, 2.35]), Pm('box', '#4e5358', [-1.6, 1.98, 1.15], [4.4, 1.0, 0.07]), Pm('box', '#4e5358', [-1.6, 1.98, -1.15], [4.4, 1.0, 0.07]),
      Pm('box', '#4e5358', [0.62, 2.1, 0], [0.08, 1.3, 2.35]), Pm('box', '#3f4448', [0.85, 2.72, 0], [0.55, 0.06, 2.35]), Pm('box', '#3f4448', [-3.82, 1.98, 0], [0.08, 1.0, 2.35]),
      ...[-3.2, -2.2, -1.2, -0.2].map((x) => Pm('box', '#3f4448', [x, 1.98, 1.19], [0.08, 1.0, 0.04]))]),
      Pm('cyl', '#7d8287', [0.2, 1.2, 0], [0.26, 0.6, 0.26]), // hoist cylinder
      Pm('cyl', COL.chrome, [0.75, 2.3, 1.2], [0.14, 1.8, 0.14]),
      ...wheelM(2.95, 0.52, 0.98, 0.52, 0.32), ...wheelM(2.95, 0.52, -0.98, 0.52, 0.32),
      ...wheelM(-2.3, 0.52, 0.86, 0.52, 0.28), ...wheelM(-2.3, 0.52, -0.86, 0.52, 0.28), ...wheelM(-2.3, 0.52, 1.16, 0.52, 0.28), ...wheelM(-2.3, 0.52, -1.16, 0.52, 0.28)],
    logtruck: () => { // self-loading log truck with knuckleboom crane, 10 m
      const p = [Pm('box', COL.black, [-0.2, 0.85, 0], [9.6, 0.3, 0.95]), ...truckCabM(4.95, '#8f1d1d', { hood: 1.5, cabL: 1.6, w: 2.4, hy: 1.25, cy: 1.3, ch: 1.4 }),
        Pm('cyl', COL.chrome, [1.75, 2.4, 1.25], [0.15, 2.2, 0.15]),
        Pm('cyl', '#3a3b3d', [1.25, 1.75, 0], [0.75, 1.6, 0.75]), Pm('box', COL.cat, [1.25, 2.9, 0], [0.5, 0.8, 0.5]),
        Pm('box', COL.cat, [-0.4, 3.2, 0.3], [3.4, 0.3, 0.3], [0, 0, -0.08]), Pm('box', COL.cat, [-1.6, 2.95, -0.3], [3.0, 0.25, 0.25], [0, 0, 0.12]),
        Pm('box', COL.frame, [-3.1, 2.4, -0.3], [0.5, 0.6, 0.35]), Pm('cyl', COL.chrome, [0.5, 2.8, 0.3], [0.1, 1.6, 0.1], [0, 0, 1.2])];
      for (const x of [-0.6, -2.5, -4.4]) p.push(Pm('box', COL.frame, [x, 1.15, 0], [0.22, 0.2, 2.45]), Pm('box', COL.frame, [x, 2.05, 1.18], [0.14, 1.8, 0.14]), Pm('box', COL.frame, [x, 2.05, -1.18], [0.14, 1.8, 0.14]));
      p.push(...wheelM(3.85, 0.52, 1.0, 0.52, 0.32), ...wheelM(3.85, 0.52, -1.0, 0.52, 0.32));
      for (const x of [-3.0, -4.25]) p.push(...wheelM(x, 0.52, 0.88, 0.52, 0.28), ...wheelM(x, 0.52, -0.88, 0.52, 0.28), ...wheelM(x, 0.52, 1.18, 0.52, 0.28), ...wheelM(x, 0.52, -1.18, 0.52, 0.28));
      return build(p);
    },
    bucketBase: () => build([ // 60 ft bucket truck, 8.5 m
      Pm('box', COL.black, [-0.3, 0.85, 0], [8.0, 0.3, 0.95]), ...truckCabM(4.2, '#f1f1ec', { hood: 1.3, cabL: 1.6, w: 2.3, hy: 1.2, cy: 1.25, ch: 1.35 }),
      Pm('box', '#e6e6e0', [-1.6, 1.55, 1.0], [5.2, 1.25, 0.45]), Pm('box', '#e6e6e0', [-1.6, 1.55, -1.0], [5.2, 1.25, 0.45]), Pm('box', COL.steel, [-1.6, 1.0, 0], [5.2, 0.12, 2.4]),
      ...[-3.6, -2.3, -1.0, 0.3].flatMap((x) => [Pm('box', '#c8c8c2', [x, 1.55, 1.225], [1.15, 1.05, 0.01]), Pm('box', COL.steel, [x + 0.4, 1.55, 1.235], [0.05, 0.12, 0.02]),
        Pm('box', '#c8c8c2', [x, 1.55, -1.225], [1.15, 1.05, 0.01])]),
      Pm('box', '#f07a22', [-1.6, 2.15, 1.23], [5.2, 0.08, 0.01]), Pm('box', '#f07a22', [-1.6, 2.15, -1.23], [5.2, 0.08, 0.01]),
      Pm('cyl', COL.steel, [-3.4, 2.4, 0], [0.7, 0.7, 0.7]),
      ...wheelM(3.25, 0.5, 0.98, 0.5, 0.3), ...wheelM(3.25, 0.5, -0.98, 0.5, 0.3), ...wheelM(-2.5, 0.5, 0.86, 0.5, 0.27), ...wheelM(-2.5, 0.5, -0.86, 0.5, 0.27), ...wheelM(-2.5, 0.5, 1.15, 0.5, 0.27), ...wheelM(-2.5, 0.5, -1.15, 0.5, 0.27)]),
    bucketBoom: () => build([
      Pm('box', '#f1f1ec', [2.4, 0.12, 0], [4.8, 0.32, 0.32]), Pm('box', '#e0e0da', [5.1, 0.2, 0], [1.6, 0.24, 0.26]), Pm('cyl', COL.chrome, [1.3, -0.15, 0], [0.12, 1.6, 0.12], [0, 0, 1.4]),
      Pm('box', '#f2c94c', [6.15, 0.25, 0], [0.75, 1.05, 0.75]), Pm('box', '#d9a92c', [6.15, 0.79, 0], [0.78, 0.04, 0.78]),
      ...seatedM('#f07a22', '#f4c020').map((q) => ({ ...q, pos: [q.pos[0] + 6.15 * MM, q.pos[1] + 0.3 * MM, q.pos[2]] }))]),
    semi: () => build([ // long-hood tractor with sleeper
      Pm('box', COL.black, [-0.3, 0.9, 0], [7.6, 0.3, 0.95]), ...truckCabM(3.9, '#1d3557', { hood: 2.0, cabL: 1.4, w: 2.4, hy: 1.35, cy: 1.45, ch: 1.6, sleeper: 1.8, stacks: true }),
      Pm('box', COL.chrome, [3.93, 1.65, 0], [0.06, 1.0, 1.15]),
      Pm('cyl', COL.chrome, [0.6, 0.95, 1.1], [0.6, 1.2, 0.6], [0, 0, Math.PI / 2]), Pm('cyl', COL.chrome, [0.6, 0.95, -1.1], [0.6, 1.2, 0.6], [0, 0, Math.PI / 2]),
      Pm('box', '#2a2b2d', [-3.05, 1.2, 0], [1.2, 0.15, 1.5]), Pm('box', COL.black, [3.1, 1.15, 1.2], [1.3, 0.12, 0.3]), Pm('box', COL.black, [3.1, 1.15, -1.2], [1.3, 0.12, 0.3]),
      ...wheelM(3.0, 0.52, 1.0, 0.52, 0.32), ...wheelM(3.0, 0.52, -1.0, 0.52, 0.32),
      ...[-2.5, -3.75].flatMap((x) => [...wheelM(x, 0.52, 0.86, 0.52, 0.27), ...wheelM(x, 0.52, -0.86, 0.52, 0.27), ...wheelM(x, 0.52, 1.15, 0.52, 0.27), ...wheelM(x, 0.52, -1.15, 0.52, 0.27)])]),
    fueltruck: () => { // medium-duty fuel & service truck: polished elliptical tank, walkway, hose reel cabinet
      const red = '#c8231d', tank = '#c9cdd2', X = Math.PI / 2;
      const p = [Pm('box', COL.black, [-0.3, 0.85, 0], [7.4, 0.3, 0.95]), ...truckCabM(3.7, red, { hood: 1.4, cabL: 1.6, w: 2.3, hy: 1.25, cy: 1.3, ch: 1.35 }),
        Pm('cyl', tank, [-1.1, 2.0, 0], [1.45, 3.9, 2.2], [0, 0, X]),
        Pm('cyl', '#9aa0a6', [0.86, 2.0, 0], [1.48, 0.06, 2.24], [0, 0, X]), Pm('cyl', '#9aa0a6', [-3.06, 2.0, 0], [1.48, 0.06, 2.24], [0, 0, X]),
        ...[-0.2, -1.1, -2.0].map((x) => Pm('cyl', '#b9bdc2', [x, 2.0, 0], [1.47, 0.04, 2.23], [0, 0, X])),
        ...[-0.5, -1.7].map((x) => Pm('cyl', '#9aa0a6', [x, 2.75, 0], [0.45, 0.08, 0.45])),
        Pm('box', '#5c6168', [-1.1, 2.8, 0.55], [3.8, 0.03, 0.4]), // walkway
        ...[-2.9, -1.1, 0.7].map((x) => Pm('box', '#e8b320', [x, 3.05, 0.75], [0.04, 0.5, 0.04])), Pm('box', '#e8b320', [-1.1, 3.3, 0.75], [3.7, 0.04, 0.04]),
        ...[1, -1].flatMap((s) => [Pm('box', '#d42a20', [-1.1, 2.0, s * 1.11], [0.32, 0.32, 0.01], [0, 0, Math.PI / 4]), Pm('box', '#ffffff', [-1.1, 2.0, s * 1.115], [0.2, 0.06, 0.01]),
          Pm('box', '#ffffff', [-2.2, 1.5, s * 1.1], [1.2, 0.08, 0.01]), Pm('box', red, [-2.2, 1.6, s * 1.1], [1.2, 0.05, 0.01])]),
        // hose reel cabinet at the back with a red drum and a black hose coil
        Pm('box', '#e6e6e0', [-3.45, 1.55, 0], [0.75, 1.05, 2.3]), Pm('box', '#2a2c2f', [-3.83, 1.55, 0], [0.02, 0.9, 1.9]),
        Pm('cyl', red, [-3.5, 1.55, 0.1], [0.75, 1.3, 0.75], [X, 0, 0]), Pm('cyl', '#151617', [-3.5, 1.55, 0.1], [0.62, 1.2, 0.62], [X, 0, 0]),
        Pm('cyl', '#b9bdc2', [-3.86, 1.2, -0.75], [0.12, 0.16, 0.12], [0, 0, X]), // nozzle holster
        ...[-1.9, -2.3].map((x) => Pm('box', '#e8b320', [-3.92, 1.0 + (x + 2.3) * 2.5, 0.85], [0.04, 0.04, 0.3])), Pm('box', '#e8b320', [-3.9, 1.6, 0.98], [0.04, 1.6, 0.04]), // ladder
        Pm('box', COL.chrome, [-3.95, 0.82, 0], [0.12, 0.18, 2.3]), Pm('box', '#c22', [-3.97, 1.0, 1.0], [0.03, 0.12, 0.16]), Pm('box', '#c22', [-3.97, 1.0, -1.0], [0.03, 0.12, 0.16]),
        Pm('box', COL.black, [-2.3, 1.15, 1.16], [1.3, 0.08, 0.32]), Pm('box', COL.black, [-2.3, 1.15, -1.16], [1.3, 0.08, 0.32]),
        Pm('cyl', COL.chrome, [0.95, 2.6, 1.2], [0.14, 2.0, 0.14]),
        ...wheelM(2.9, 0.52, 0.98, 0.52, 0.32), ...wheelM(2.9, 0.52, -0.98, 0.52, 0.32),
        ...wheelM(-2.3, 0.52, 0.86, 0.52, 0.28), ...wheelM(-2.3, 0.52, -0.86, 0.52, 0.28), ...wheelM(-2.3, 0.52, 1.16, 0.52, 0.28), ...wheelM(-2.3, 0.52, -1.16, 0.52, 0.28)];
      return build(p);
    },
    dumptruck2: () => build(BIG_MODELS.dumptruck2Parts()),
    dumptruck2Parts: () => { // tandem-axle dump truck: set-forward axle, 16 ft steel box with cab shield and tarp roll
      const cab = '#1f4e8c', box = '#5b6168', X = Math.PI / 2;
      const p = [Pm('box', COL.black, [-0.6, 0.88, 0], [8.4, 0.32, 0.95]), ...truckCabM(3.95, cab, { hood: 1.55, cabL: 1.7, w: 2.4, hy: 1.3, cy: 1.35, ch: 1.4, stacks: false }),
        ...BX([Pm('box', box, [-2.15, 1.55, 0], [5.0, 0.16, 2.4]), ...[1, -1].map((s) => Pm('box', box, [-2.15, 2.15, s * 1.18], [5.0, 1.2, 0.07])),
        ...[1, -1].flatMap((s) => [-4.2, -3.2, -2.2, -1.2, -0.2].map((x) => Pm('box', HC.shade(box, -0.12), [x, 2.15, s * 1.22], [0.08, 1.2, 0.04]))),
        ...[1, -1].map((s) => Pm('box', HC.shade(box, 0.1), [-2.15, 2.78, s * 1.2], [5.05, 0.08, 0.1])),
        Pm('box', box, [0.35, 2.3, 0], [0.08, 1.7, 2.4]), Pm('box', HC.shade(box, -0.1), [0.75, 3.12, 0], [0.9, 0.06, 2.4]), // front + cab shield
        Pm('box', HC.shade(box, -0.1), [-4.66, 2.15, 0], [0.1, 1.25, 2.42]), Pm('cyl', '#2a2c2f', [0.3, 2.95, 0], [0.18, 2.3, 0.18], [X, 0, 0])]),
        Pm('cyl', '#7d8287', [0.15, 1.65, 0], [0.32, 1.2, 0.32], [0, 0, -0.2]), // hoist cylinder
        Pm('cyl', '#b9bdc2', [0.7, 1.15, 1.25], [0.55, 0.9, 0.55], [0, 0, X]), Pm('box', '#2a2c2f', [0.95, 2.7, 1.3], [0.12, 2.2, 0.12]), // fuel tank, exhaust
        ...[1, -1].map((s) => Pm('box', COL.black, [-2.7, 1.25, s * 1.2], [2.2, 0.08, 0.32])), Pm('box', COL.chrome, [-4.8, 0.85, 0], [0.12, 0.16, 2.3]),
        ...[1, -1].map((s) => Pm('box', '#c22', [-4.72, 1.0, s * 1.05], [0.03, 0.12, 0.16])),
        ...wheelM(2.75, 0.55, 1.0, 0.55, 0.32), ...wheelM(2.75, 0.55, -1.0, 0.55, 0.32),
        ...[-2.05, -3.4].flatMap((x) => [...wheelM(x, 0.55, 0.86, 0.55, 0.28), ...wheelM(x, 0.55, -0.86, 0.55, 0.28), ...wheelM(x, 0.55, 1.16, 0.55, 0.28), ...wheelM(x, 0.55, -1.16, 0.55, 0.28)])];
      return p;
    },
    mowerZT: () => proZeroTurn(),
    mowerSO: () => standOnMower(),
    mowerWA: () => wideMower(),
    dumptruck3: () => build(BIG_MODELS.dumptruck3Parts()),
    dumptruck3Parts: () => { // tri-axle dump truck: three rear axles under a 20 ft box, set-forward steer axle
      const cab = '#b8321c', box = '#4f555c', X = Math.PI / 2, x0 = 0.35, xr = -5.85, L = x0 - xr, cx = (x0 + xr) / 2;
      const p = [Pm('box', COL.black, [-1.0, 0.9, 0], [10.4, 0.32, 0.95]), ...truckCabM(4.35, cab, { hood: 1.7, cabL: 1.7, w: 2.45, hy: 1.35, cy: 1.4, ch: 1.45, stacks: true }),
        ...BX([Pm('box', box, [cx, 1.6, 0], [L, 0.16, 2.45]), ...[1, -1].map((s) => Pm('box', box, [cx, 2.3, s * 1.2], [L, 1.4, 0.07])),
        ...[1, -1].flatMap((s) => [-5.2, -4.2, -3.2, -2.2, -1.2, -0.2].map((x) => Pm('box', HC.shade(box, -0.12), [x, 2.3, s * 1.24], [0.08, 1.4, 0.04]))),
        ...[1, -1].map((s) => Pm('box', HC.shade(box, 0.1), [cx, 3.03, s * 1.22], [L + 0.05, 0.08, 0.1])),
        Pm('box', box, [x0, 2.45, 0], [0.08, 1.9, 2.45]), Pm('box', HC.shade(box, -0.1), [0.8, 3.42, 0], [1.0, 0.06, 2.45]), // front + cab shield
        Pm('box', HC.shade(box, -0.1), [xr - 0.06, 2.3, 0], [0.1, 1.45, 2.47]), Pm('cyl', '#2a2c2f', [0.3, 3.2, 0], [0.18, 2.35, 0.18], [X, 0, 0])]),
        Pm('cyl', '#7d8287', [0.15, 1.7, 0], [0.34, 1.3, 0.34], [0, 0, -0.2]), // hoist cylinder
        Pm('cyl', '#b9bdc2', [0.95, 1.18, 1.27], [0.58, 1.0, 0.58], [0, 0, X]),
        ...[1, -1].map((s) => Pm('box', COL.black, [-3.65, 1.3, s * 1.22], [3.6, 0.08, 0.32])), Pm('box', COL.chrome, [xr - 0.2, 0.88, 0], [0.12, 0.16, 2.35]),
        ...[1, -1].map((s) => Pm('box', '#c22', [xr - 0.12, 1.02, s * 1.07], [0.03, 0.12, 0.16])),
        ...wheelM(3.1, 0.55, 1.02, 0.55, 0.32), ...wheelM(3.1, 0.55, -1.02, 0.55, 0.32),
        ...[-2.4, -3.65, -4.9].flatMap((x) => [...wheelM(x, 0.55, 0.86, 0.55, 0.28), ...wheelM(x, 0.55, -0.86, 0.55, 0.28), ...wheelM(x, 0.55, 1.16, 0.55, 0.28), ...wheelM(x, 0.55, -1.16, 0.55, 0.28)])];
      return p;
    },
    semiHD: () => { // long-hood tri-axle heavy-haul tractor: big chrome grille, twin stacks, sleeper, fifth wheel, deck plate
      const c = '#7a1515', X = Math.PI / 2;
      const p = [Pm('box', COL.black, [-0.6, 0.95, 0], [8.6, 0.32, 0.95]), ...truckCabM(4.3, c, { hood: 2.4, cabL: 1.5, w: 2.45, hy: 1.4, cy: 1.5, ch: 1.6, sleeper: 1.3, stacks: true }),
        Pm('box', COL.chrome, [4.33, 1.75, 0], [0.07, 1.15, 1.25]), ...[1.4, 1.6, 1.8, 2.0, 2.2].map((y) => Pm('box', '#9aa0a6', [4.37, y, 0], [0.02, 0.04, 1.15])),
        Pm('box', COL.chrome, [4.45, 1.0, 0], [0.3, 0.38, 2.5]), Pm('box', COL.chrome, [4.3, 2.55, 0], [0.4, 0.04, 0.6]),
        ...[1, -1].flatMap((s) => [Pm('cyl', COL.chrome, [0.8, 1.05, s * 1.12], [0.65, 1.3, 0.65], [0, 0, X]), Pm('box', '#5c6168', [0.8, 1.42, s * 1.12], [1.3, 0.03, 0.5]),
          Pm('box', COL.black, [3.4, 1.25, s * 1.2], [1.5, 0.12, 0.35]), Pm('box', '#e8b320', [-0.2, 3.05, s * 1.0], [0.1, 0.1, 0.1])]),
        Pm('box', '#5c6168', [-2.4, 1.2, 0], [3.4, 0.05, 2.0]), Pm('cyl', '#2a2b2d', [-2.9, 1.3, 0], [1.3, 0.12, 1.3]), Pm('box', '#2a2b2d', [-2.4, 1.36, 0], [0.5, 0.06, 0.25]), // deck plate + fifth wheel
        ...[1, -1].map((s) => Pm('box', COL.black, [-3.9, 1.3, s * 1.2], [2.6, 0.08, 0.3])), Pm('box', COL.black, [-4.95, 1.0, 0], [0.12, 0.6, 2.2]),
        ...wheelM(3.3, 0.55, 1.02, 0.55, 0.32), ...wheelM(3.3, 0.55, -1.02, 0.55, 0.32),
        ...[-2.3, -3.5, -4.55].flatMap((x) => [...wheelM(x, 0.55, 0.86, 0.55, 0.28), ...wheelM(x, 0.55, -0.86, 0.55, 0.28), ...wheelM(x, 0.55, 1.16, 0.55, 0.28), ...wheelM(x, 0.55, -1.16, 0.55, 0.28)])];
      return build(p);
    },
    loaderParts: () => { // articulated wheel loader (~16 t): front frame carries the lift arms, rear frame the cab and engine
      const y = COL.cat, yd = COL.catDark, X = Math.PI / 2;
      return [...[1.65, -1.65].flatMap((x) => [...wheelM(x, 0.8, 1.08, 0.8, 0.62, y), ...wheelM(x, 0.8, -1.08, 0.8, 0.62, y)]),
        // front frame
        Pm('box', y, [1.2, 1.0, 0], [2.0, 0.55, 1.0]), Pm('box', yd, [1.65, 1.45, 0], [1.1, 0.12, 1.2]),
        ...[1, -1].map((s) => Pm('box', y, [1.65, 1.62, s * 1.08], [1.5, 0.12, 0.55])), // fenders
        Pm('box', y, [1.0, 1.9, 0], [0.5, 1.4, 0.9]), // tower
        Pm('cyl', '#3a3b3d', [0.05, 1.0, 0], [0.45, 0.8, 0.45]), // hinge
        // rear frame: cab, engine hood, grille, counterweight
        Pm('box', y, [-1.4, 1.05, 0], [2.6, 0.55, 1.1]),
        Pm('box', y, [-0.45, 1.65, 0], [1.4, 0.55, 1.75]), ...cabM(-0.45, 1.95, 1.4, 1.35, 1.5, y),
        Pm('box', y, [-2.15, 1.85, 0], [1.9, 1.15, 1.55]), Pm('box', yd, [-2.15, 2.44, 0], [1.85, 0.04, 1.45]),
        ...[1, -1].map((s) => Pm('box', '#2a2b2d', [-2.15, 1.95, s * 0.78], [1.4, 0.5, 0.02])),
        Pm('box', y, [-3.25, 1.35, 0], [0.45, 1.3, 2.0]), Pm('box', '#151617', [-3.48, 1.6, 0], [0.02, 0.7, 1.4]),
        ...[1, -1].flatMap((s) => [Pm('box', y, [-1.65, 1.62, s * 1.08], [1.5, 0.12, 0.55]), Pm('box', '#c22', [-3.49, 1.1, s * 0.85], [0.03, 0.12, 0.16]),
          Pm('box', '#d0d2d4', [-0.45, 3.4, s * 0.6], [0.12, 0.1, 0.14]), Pm('box', '#2a2b2d', [-1.1, 1.1, s * 0.98], [0.4, 0.04, 0.25])]),
        Pm('cyl', '#2a2c2f', [-1.7, 2.85, 0.45], [0.14, 0.8, 0.14]), Pm('cyl', '#3a3b3d', [-2.6, 2.6, -0.4], [0.35, 0.35, 0.35])];
    },
    skidderParts: () => { // grapple skidder after the references: green and yellow, articulated at x = 0.2
      const g = '#367c2b', gd = '#2a6322', y = '#f2c200', b = '#1c1d1f', st = '#3a3b3d';
      const p = [...wheelM(1.7, 0.82, 1.25, 0.82, 0.72, y), ...wheelM(1.7, 0.82, -1.25, 0.82, 0.72, y)];
      // front frame: engine hood, cab, fenders, blade
      p.push(Pm('box', b, [1.5, 1.0, 0], [2.6, 0.5, 1.1]),
        Pm('box', g, [2.28, 1.8, 0], [1.3, 0.95, 1.3]), Pm('box', gd, [2.28, 2.29, 0], [1.26, 0.04, 1.22]), Pm('box', b, [2.94, 1.75, 0], [0.04, 0.75, 1.1]),
        ...[1, -1].flatMap((s) => [Pm('box', y, [2.28, 1.62, s * 0.655], [1.26, 0.07, 0.01]), Pm('box', g, [1.75, 1.72, s * 1.25], [1.8, 0.09, 0.82]), Pm('box', st, [2.75, 0.85, s * 0.75], [1.0, 0.18, 0.18], [0, 0, 0.25])]),
        Pm('cyl', b, [1.85, 2.6, 0.4], [0.12, 0.7, 0.12]),
        Pm('box', g, [0.95, 1.4, 0], [1.3, 0.3, 1.5]), // cab floor on the front frame
        ...cabM(0.98, 1.55, 1.45, 1.22, 1.45, g),
        Pm('box', st, [3.35, 0.62, 0], [0.32, 0.95, 2.95], [0, 0, -0.08]), Pm('box', '#2a2b2d', [3.47, 0.15, 0], [0.12, 0.12, 2.97])); // blade
      // rear frame: tank, bogie tyres in tracks, arch and grapple
      for (const s of [1, -1]) {
        const z = s * 1.22, tr = '#2a2c2f', gr = '#1f2022', R0 = 0.78, xa = -1.45, xb = -2.65;
        p.push(...wheelM(xa, 0.72, z, 0.72, 0.62, y), ...wheelM(xb, 0.72, z, 0.72, 0.62, y),
          Pm('box', b, [-2.05, 0.72, s * 0.85], [1.4, 0.22, 0.12]), // bogie beam
          Pm('box', tr, [-2.05, 0.72 + R0, z], [xa - xb, 0.08, 0.72]), Pm('box', tr, [-2.05, 0.72 - R0 + 0.04, z], [xa - xb, 0.08, 0.72])); // straight runs, top and bottom
        for (let k = 0; k <= 8; k++) { // the band curves round the front and back tyres
          const a = Math.PI / 2 - (k * Math.PI) / 8;
          for (const [cx, dir] of [[xa, 1], [xb, -1]]) p.push(Pm('box', tr, [cx + dir * Math.cos(a) * R0, 0.72 + Math.sin(a) * R0, z], [0.32, 0.08, 0.72], [0, 0, dir * a + (dir > 0 ? -Math.PI / 2 : Math.PI / 2)]));
        }
        for (let i = 0; i < 7; i++) for (const yy of [0.72 + R0 + 0.06, 0.72 - R0 - 0.02]) p.push(Pm('box', gr, [xb + 0.08 + i * 0.18, yy, z], [0.07, 0.07, 0.74])); // grousers
      }
      p.push(Pm('box', b, [-1.5, 1.0, 0], [3.2, 0.5, 1.0]), Pm('box', g, [-0.75, 1.55, 0], [1.0, 0.65, 1.25]), Pm('box', gd, [-0.75, 1.89, 0], [0.95, 0.04, 1.18]),
        Pm('box', '#2b2d30', [-1.95, 1.3, 0], [0.5, 0.3, 1.5]), Pm('box', '#2b2d30', [0.12, 1.0, 0], [0.5, 0.42, 0.7]), Pm('cyl', '#3a3b3d', [0.2, 1.0, 0], [0.32, 0.6, 0.32])); // arch base; centre hinge
      // dual-function arch: two tapered legs leaning back, hydraulic cylinders, a cross beam on top
      const seg = (c, a2, b2, t, w, z) => { const dx = b2[0] - a2[0], dy = b2[1] - a2[1]; p.push(Pm('box', c, [(a2[0] + b2[0]) / 2, (a2[1] + b2[1]) / 2, z], [Math.hypot(dx, dy), t, w], [0, 0, Math.atan2(dy, dx)])); };
      const ram = (a2, b2, r, z) => { const m = [(a2[0] + b2[0]) / 2, (a2[1] + b2[1]) / 2], dx = b2[0] - a2[0], dy = b2[1] - a2[1], ang = Math.atan2(dy, dx) - Math.PI / 2;
        p.push(Pm('cyl', st, [(a2[0] + m[0]) / 2, (a2[1] + m[1]) / 2, z], [r * 2, Math.hypot(m[0] - a2[0], m[1] - a2[1]), r * 2], [0, 0, ang]), Pm('cyl', COL.chrome, [(m[0] + b2[0]) / 2, (m[1] + b2[1]) / 2, z], [r * 1.1, Math.hypot(b2[0] - m[0], b2[1] - m[1]), r * 1.1], [0, 0, ang])); };
      for (const s of [1, -1]) {
        seg(st, [-1.85, 1.35], [-2.55, 3.05], 0.3, 0.26, s * 0.62); // arch legs
        ram([-1.15, 1.3], [-2.25, 2.55], 0.1, s * 0.82); // arch cylinders
        seg(st, [-2.55, 3.1], [-3.55, 2.85], 0.24, 0.16, s * 0.3); // twin boom arms
      }
      p.push(Pm('box', st, [-2.55, 3.1, 0], [0.34, 0.3, 1.5]), Pm('cyl', st, [-3.55, 2.85, 0], [0.2, 0.8, 0.2], [Math.PI / 2, 0, 0])); // cross beam, boom-tip pin
      ram([-2.45, 2.75], [-3.3, 2.7], 0.08, 0); // boom cylinder
      // the grapple: a link and rotator hanging from the boom tip, then two curved tongs that close across the butts
      p.push(Pm('box', st, [-3.6, 2.55, 0], [0.16, 0.5, 0.16]), Pm('cyl', y, [-3.6, 2.22, 0], [0.42, 0.26, 0.42]), Pm('box', y, [-3.6, 1.98, 0], [0.5, 0.28, 0.62]));
      for (const s of [1, -1]) { // each tong: three curved pieces sweeping out and back in
        seg(y, [-3.6, 1.95], [-3.6, 1.45], 0.34, 0.14, s * 0.42); p.push(Pm('box', y, [-3.6, 1.45, s * 0.62], [0.34, 0.16, 0.42], [s * 0.6, 0, 0]));
        p.push(Pm('box', y, [-3.6, 1.05, s * 0.72], [0.34, 0.7, 0.14], [s * -0.12, 0, 0]), Pm('box', y, [-3.6, 0.62, s * 0.45], [0.34, 0.14, 0.5], [s * -0.65, 0, 0]));
        p.push(Pm('box', '#2b2d30', [-3.6, 0.5, s * 0.2], [0.3, 0.08, 0.12], [s * -0.65, 0, 0])); // tong tips
      }
      p.push(Pm('box', b, [-3.0, 2.95, 0.12], [1.0, 0.04, 0.04], [0, 0, -0.25]), Pm('box', b, [-3.0, 2.95, -0.12], [1.0, 0.04, 0.04], [0, 0, -0.25])); // hoses along the boom
      return p;
    },
    fwproc: () => {
      const rd = '#c8281e', rdd = '#9c1e16', b = '#1c1d1f', gr = '#2f7d32', p = [];
      const seg = (c, a2, b2, t, w, z = 0) => { const dx = b2[0] - a2[0], dy = b2[1] - a2[1]; p.push(Pm('box', c, [(a2[0] + b2[0]) / 2, (a2[1] + b2[1]) / 2, z], [Math.hypot(dx, dy), t, w], [0, 0, Math.atan2(dy, dx)])); };
      p.push(...wheelM(0, 0.38, 0.95, 0.38, 0.25, '#cfd2d6'), ...wheelM(0, 0.38, -0.95, 0.38, 0.25, '#cfd2d6'));
      for (const s of [1, -1]) { seg(rd, [2.4, 0.55], [4.3, 0.55], 0.12, 0.1, s * 0.35); seg(rd, [2.4, 0.55, 0], [4.2, 0.55], 0.12, 0.1, s * 0.12); } // tongue
      p.push(Pm('box', COL.chrome, [4.35, 0.55, 0], [0.25, 0.12, 0.18]), Pm('box', rd, [0.8, 0.58, 0], [3.4, 0.16, 1.05]), // coupler, main frame
        Pm('box', rd, [1.0, 1.0, 0], [2.9, 0.1, 0.7]), ...[1, -1].map((s) => Pm('box', rd, [1.0, 1.18, s * 0.36], [2.9, 0.34, 0.05])), // log trough
        Pm('box', rd, [0.15, 1.55, 0], [0.62, 1.5, 0.95]), Pm('box', rdd, [0.15, 2.32, 0], [0.66, 0.06, 1.0]), Pm('box', b, [0.47, 1.6, 0], [0.02, 0.6, 0.55]), // saw hood
        Pm('box', rd, [0.15, 1.5, 0.62], [0.4, 0.5, 0.3], [0, 0, 0.6]), // blade guard
        Pm('box', '#9aa0a6', [-0.45, 1.2, 0], [0.14, 0.5, 0.5]), Pm('box', rd, [-0.62, 1.15, 0], [0.32, 0.6, 0.7]), // 6-way wedge and splitter box
        Pm('box', b, [1.95, 0.98, 0], [0.95, 0.68, 0.8]), Pm('box', rd, [1.95, 1.34, 0], [1.0, 0.06, 0.86]), Pm('box', rdd, [1.95, 1.6, 0.25], [0.9, 0.4, 0.3]), // engine, hood, hydraulic tank
        Pm('box', '#f2d14e', [1.4, 1.05, -0.42], [0.25, 0.25, 0.02]), Pm('box', b, [1.0, 1.4, -0.45], [0.1, 0.35, 0.06])); // decal, valve levers
      // log deck: a low rack on the right side, rails, cross bars and legs (logs roll from it into the trough)
      for (const x of [-0.2, 1.0, 2.2]) { seg(rd, [x, 0.3], [x, 0.3], 0.08, 0.08); p.push(Pm('box', rd, [x, 0.35, 1.55], [0.1, 0.1, 1.5]), Pm('box', rd, [x, 0.65, 0.95], [0.08, 0.6, 0.08], [0.5, 0, 0])); }
      for (const z of [0.9, 2.25]) p.push(Pm('box', rd, [1.0, 0.36, z], [2.7, 0.1, 0.1]));
      // the conveyor: a green belt between red side rails, propped up on a strut
      seg(gr, [-0.85, 1.0], [-4.9, 2.75], 0.05, 0.5);
      for (const s of [1, -1]) seg(rd, [-0.85, 1.07], [-4.9, 2.82], 0.12, 0.05, s * 0.28);
      for (let i = 1; i < 9; i++) { const f = i / 9; p.push(Pm('box', '#255f28', [-0.85 - 4.05 * f, 1.03 + 1.75 * f, 0], [0.04, 0.04, 0.5], [0, 0, -0.41])); } // cleats
      seg(rd, [-2.6, 0.2], [-3.2, 2.08], 0.1, 0.1, 0.22); seg(rd, [-2.6, 0.2], [-3.2, 2.08], 0.1, 0.1, -0.22); p.push(Pm('box', rd, [-2.6, 0.12, 0], [0.4, 0.08, 0.7]));
      return build(p);
    },
    woodHeap: () => { // a heap of split firewood
      const p = [], r = rnd(17);
      for (let i = 0; i < 26; i++) { const a = r() * 6.28, d = r() * 0.9, h = 0.1 + (1 - d / 0.9) * r() * 0.7; p.push(Pm('box', ['#b58a5a', '#c9a26a', '#9a7048', '#d4b07a'][i % 4], [Math.cos(a) * d, h, Math.sin(a) * d], [0.42, 0.13, 0.13], [r() * 0.6, r() * 3, r() * 0.6])); }
      return build(p);
    },
    trackLoader: () => { // 20 t crawler loader, after the reference: yellow hull on long tracks, white-framed cab, rear engine bay
      const y = '#f0b80f', yd = '#c99608', wh = '#ece9e0', blk = '#1c1d1f';
      const p = [...trackM(3.4, 1.0, 0.95, 0.56, 6), ...trackM(3.4, -1.0, 0.95, 0.56, 6),
        Pm('box', COL.frame, [0, 0.72, 0], [3.0, 0.4, 1.4]),
        ...[1, -1].flatMap((s2) => [Pm('box', y, [-0.05, 1.03, s2 * 1.0], [3.5, 0.08, 0.62]), // track guards, full length
          Pm('box', blk, [-0.5, 1.5, s2 * 0.735], [1.6, 0.22, 0.012]), Pm('box', '#c22', [-2.07, 1.25, s2 * 0.75], [0.02, 0.12, 0.16])]),
        Pm('box', y, [-0.45, 1.42, 0], [2.7, 0.78, 1.46]), Pm('box', yd, [-0.45, 1.82, 0], [2.6, 0.03, 1.38]), // hull
        Pm('box', y, [-1.55, 2.06, 0], [1.0, 0.5, 1.46]), Pm('box', yd, [-1.55, 2.32, 0], [0.96, 0.03, 1.38]), // engine bay
        ...[2.0, 2.12, 2.24].map((h) => Pm('box', blk, [-2.06, h, 0], [0.02, 0.05, 1.2])), Pm('box', blk, [-2.06, 1.55, 0], [0.02, 0.5, 1.2]), // grilles
        Pm('box', y, [-2.12, 1.15, 0], [0.22, 0.5, 1.9]), // counterweight bumper
        Pm('cyl', blk, [-1.25, 2.6, 0.48], [0.11, 0.6, 0.11]), // exhaust
        ...cabM(-0.5, 1.82, 1.35, 1.4, 1.42, wh),
        Pm('box', y, [0.88, 1.35, 0], [0.55, 0.62, 1.44]), Pm('box', yd, [0.88, 1.67, 0], [0.5, 0.03, 1.36]), // nose
        ...[1, -1].map((s2) => Pm('box', y, [0.72, 1.72, s2 * 0.82], [0.5, 0.72, 0.2]))]; // arm towers
      return build(p);
    },
    trackLoaderArms: () => { // twin lift arms, cross tube, tilt cylinder and a 2.6 m bucket with teeth; origin at the arm pivot
      const y = '#f0b80f', st = '#50545a', stl = '#62666c', p = [], X = Math.PI / 2;
      for (const s2 of [1, -1]) p.push(Pm('box', y, [1.15, -0.62, s2 * 0.9], [2.55, 0.3, 0.18], [0, 0, -0.5]),
        Pm('cyl', COL.chrome, [0.25, -0.85, s2 * 0.72], [0.11, 1.05, 0.11], [0, 0, -0.7]), Pm('cyl', '#2b2d30', [0.08, -1.1, s2 * 0.72], [0.17, 0.5, 0.17], [0, 0, -0.7]));
      p.push(Pm('box', y, [1.45, -0.78, 0], [0.26, 0.26, 1.98]), // cross tube
        Pm('cyl', COL.chrome, [1.5, -0.25, 0], [0.11, 1.2, 0.11], [0, 0, 1.0])); // tilt cylinder
      // bucket: floor, curved back, side plates, wear edge and nine teeth
      p.push(Pm('box', st, [2.62, -1.78, 0], [0.95, 0.08, 2.6]), Pm('box', st, [2.15, -1.32, 0], [0.12, 0.88, 2.6], [0, 0, 0.1]),
        Pm('hshell', stl, [2.5, -1.4, 0], [0.82, 0.82, 2.6], [0, 0, X]),
        ...[1, -1].map((s2) => Pm('box', st, [2.55, -1.4, s2 * 1.31], [0.95, 0.82, 0.06])),
        Pm('box', '#c9cdd2', [3.12, -1.8, 0], [0.12, 0.05, 2.6]), Pm('box', y, [2.12, -0.86, 0], [0.18, 0.12, 2.6]));
      for (let i = 0; i < 9; i++) p.push(Pm('box', '#d7b56a', [3.26, -1.79, -1.16 + i * 0.29], [0.24, 0.07, 0.11]));
      return build(p);
    },
    loaderArms: () => { // lift arms, tilt cylinder and a 3 yd bucket; origin at the arm pivot
      const y = COL.cat, X = Math.PI / 2, p = [];
      for (const s of [1, -1]) p.push(Pm('box', y, [1.25, -0.55, s * 0.62], [2.85, 0.3, 0.16], [0, 0, -0.42]), Pm('cyl', COL.chrome, [0.7, -0.75, s * 0.62], [0.12, 1.3, 0.12], [0, 0, -1.1]));
      p.push(Pm('box', y, [1.3, -0.5, 0], [0.25, 0.25, 1.25]), Pm('cyl', COL.chrome, [1.2, 0.15, 0], [0.13, 1.5, 0.13], [0, 0, -1.3]));
      // bucket
      p.push(Pm('box', '#3f4246', [2.95, -1.45, 0], [0.9, 0.08, 2.9]), Pm('box', '#4a4d52', [2.55, -1.0, 0], [0.12, 1.0, 2.9], [0, 0, 0.15]),
        Pm('hshell', '#4a4d52', [2.85, -1.05, 0], [0.9, 0.9, 2.9], [0, 0, X]),
        ...[1, -1].map((s) => Pm('box', '#4a4d52', [2.85, -1.1, s * 1.45], [0.9, 0.85, 0.06])),
        Pm('box', '#c9cdd2', [3.42, -1.48, 0], [0.12, 0.05, 2.9]));
      for (let i = 0; i < 7; i++) p.push(Pm('box', '#3a3b3d', [3.52, -1.47, -1.3 + i * 0.43], [0.18, 0.06, 0.1]));
      return build(p);
    },
    tractor: () => { // 110 hp cab utility tractor in green and yellow: loader towers, big lugged rear tyres, open fenders, rear three-point hitch
      const gr = '#367c2b', ye = '#f2c200', X = Math.PI / 2;
      const p = [...wheelM(1.35, 0.55, 0.84, 0.55, 0.36, ye), ...wheelM(1.35, 0.55, -0.84, 0.55, 0.36, ye),
        ...wheelM(-1.35, 0.85, 0.88, 0.85, 0.52, ye), ...wheelM(-1.35, 0.85, -0.88, 0.85, 0.52, ye),
        Pm('box', '#2b2d30', [0.3, 0.78, 0], [3.2, 0.45, 0.75]), Pm('cyl', '#2b2d30', [1.35, 0.55, 0], [0.16, 1.4, 0.16], [X, 0, 0]),
        Pm('box', gr, [1.3, 1.32, 0], [2.3, 0.78, 0.92]), Pm('box', HC.shade(gr, -0.1), [1.3, 1.72, 0], [2.2, 0.04, 0.76]),
        ...[1, -1].map((s) => Pm('cyl', gr, [1.3, 1.64, s * 0.38], [0.18, 2.3, 0.18], [0, 0, X])),
        Pm('box', '#1c1d1f', [2.46, 1.32, 0], [0.04, 0.64, 0.78]), ...[1.12, 1.24, 1.36, 1.48].map((y) => Pm('box', '#4a4c50', [2.48, y, 0], [0.02, 0.03, 0.76])),
        ...[1, -1].flatMap((s) => [Pm('box', '#fff6d0', [2.47, 1.58, s * 0.28], [0.03, 0.08, 0.16]), Pm('box', ye, [1.3, 1.2, s * 0.465], [2.1, 0.06, 0.01]),
          Pm('box', '#1c1d1f', [1.3, 1.36, s * 0.465], [1.4, 0.24, 0.012]),
          Pm('box', '#2b2d30', [0.25, 1.35, s * 0.55], [0.35, 1.0, 0.16]), // loader mounting towers
          Pm('box', '#2b2d30', [-0.55, 0.98, s * 0.66], [0.45, 0.04, 0.32])]), // steps
        Pm('box', gr, [-0.6, 1.3, 0], [1.3, 0.55, 1.2]),
        ...[1, -1].flatMap((s) => [Pm('fender', gr, [-1.35, 0.85, s * 0.88], [2.0, 2.0, 0.64]), Pm('fenderLip', gr, [-1.35, 0.85, s * 1.2], [2.0, 2.0, 0.6]),
          Pm('box', gr, [-0.85, 1.62, s * 0.88], [0.7, 0.06, 0.64]), Pm('box', '#2b2d30', [-1.35, 1.0, s * 0.62], [1.2, 0.5, 0.08])]), // fender decks, inner wells
        ...[[0.12, 0.62], [0.12, -0.62], [-1.22, 0.62], [-1.22, -0.62]].map(([dx, dz]) => Pm('box', '#1c1d1f', [-0.55 + dx * 0.5 + (dx > 0 ? 0.33 : -0.05), 2.28, dz], [0.06, 1.38, 0.06])),
        Pm('box', '#4f6e80', [0.12, 2.25, 0], [0.02, 1.15, 1.22], [0, 0, 0.06]), Pm('box', '#4f6e80', [-1.22, 2.25, 0], [0.02, 1.1, 1.22]),
        ...[1, -1].map((s) => Pm('box', '#4f6e80', [-0.55, 2.25, s * 0.63], [1.3, 1.1, 0.02])),
        Pm('box', gr, [-0.55, 3.0, 0], [1.55, 0.1, 1.48]), Pm('box', '#1c1d1f', [-0.55, 2.93, 0], [1.5, 0.04, 1.42]), ...[1, -1].map((s) => Pm('box', '#d0d2d4', [0.2, 2.97, s * 0.6], [0.1, 0.1, 0.14])),
        Pm('cyl', '#2a2c2f', [0.35, 2.25, 0.42], [0.12, 1.4, 0.12]), Pm('cyl', '#2a2c2f', [0.35, 2.97, 0.42], [0.14, 0.08, 0.14]),
        ...[1, -1].map((s) => Pm('box', '#1c1d1f', [0.15, 2.35, s * 0.78], [0.06, 0.32, 0.12])), // mirrors
        ...[1, -1].map((s) => Pm('box', '#2b2d30', [-1.95, 0.62, s * 0.38], [0.9, 0.1, 0.08], [0, s * 0.12, 0.15])),
        Pm('box', '#2b2d30', [-1.9, 1.18, 0], [0.8, 0.08, 0.08], [0, 0, -0.2]), Pm('cyl', ye, [-1.95, 0.78, 0], [0.12, 0.6, 0.12], [0, 0, X]),
        Pm('box', '#c22', [-1.5, 1.42, 0.62], [0.03, 0.08, 0.1]), Pm('box', '#c22', [-1.5, 1.42, -0.62], [0.03, 0.08, 0.1])];
      return build(p);
    },
    tractorFEL: () => { // front-end loader: arms from the towers, lift cylinders, and a 2 m bucket; origin at the arm pivot
      const gr = '#367c2b', X = Math.PI / 2, p = [];
      for (const s of [1, -1]) p.push(Pm('box', gr, [1.1, -0.38, s * 0.62], [2.6, 0.2, 0.12], [0, 0, -0.32]), Pm('box', gr, [2.45, -1.0, s * 0.62], [0.9, 0.2, 0.12], [0, 0, -1.15]),
        Pm('cyl', COL.chrome, [0.75, -0.6, s * 0.62], [0.08, 1.2, 0.08], [0, 0, -1.05]));
      p.push(Pm('box', gr, [1.6, -0.62, 0], [0.16, 0.16, 1.3]));
      // bucket: floor, slanted back, top spill lip, side plates, cutting edge, mounting brackets
      p.push(Pm('box', gr, [3.08, -1.64, 0], [0.7, 0.05, 1.96]), Pm('box', gr, [2.72, -1.34, 0], [0.06, 0.66, 1.96], [0, 0, 0.18]),
        Pm('box', HC.shade(gr, -0.06), [2.76, -0.99, 0], [0.18, 0.06, 1.96], [0, 0, -0.3]),
        ...[1, -1].flatMap((s) => [Pm('box', gr, [2.92, -1.42, s * 0.98], [0.66, 0.42, 0.04]), Pm('box', gr, [2.8, -1.12, s * 0.98], [0.24, 0.24, 0.04])]),
        Pm('box', '#c9cdd2', [3.44, -1.655, 0], [0.08, 0.03, 1.96]),
        ...[1, -1].map((s) => Pm('box', '#2b2d30', [2.62, -1.15, s * 0.62], [0.08, 0.36, 0.1])));
      return build(p);
    },
    bushhog: () => { // 7 ft three-point rotary cutter; origin at the hitch pins, deck trailing behind
      const o = '#c8401a', X = Math.PI / 2;
      const p = [Pm('box', o, [-1.3, 0.42, 0], [2.0, 0.1, 2.15]), Pm('cyl', o, [-0.3, 0.42, 0], [1.2, 0.1, 2.15]),
        ...[1, -1].map((s) => Pm('box', HC.shade(o, -0.12), [-1.25, 0.3, s * 1.08], [2.3, 0.3, 0.05])),
        Pm('box', HC.shade(o, -0.12), [-2.3, 0.3, 0], [0.05, 0.3, 2.15]),
        ...[1, -1].map((s) => Pm('box', '#3a3b3d', [-1.2, 0.14, s * 1.1], [1.4, 0.05, 0.12])), // skid shoes
        Pm('cyl', '#2b2d30', [-1.1, 0.62, 0], [0.42, 0.32, 0.42]), Pm('box', '#2b2d30', [-0.75, 0.68, 0], [0.5, 0.18, 0.2]), // gearbox
        Pm('cyl', '#e8b320', [-0.35, 0.74, 0], [0.14, 0.75, 0.14], [0, 0, X]), // PTO shaft guard
        ...[1, -1].map((s) => Pm('box', '#2b2d30', [-0.2, 0.75, s * 0.32], [0.7, 0.1, 0.08], [0, 0, 0.6])), // A-frame
        Pm('box', '#2b2d30', [0.02, 0.5, 0], [0.08, 0.12, 0.85]),
        // chain guards front and back
        ...Array.from({ length: 12 }, (_, i) => Pm('box', '#4a4c50', [0.28, 0.25, -0.95 + i * 0.17], [0.02, 0.3, 0.02])),
        ...Array.from({ length: 12 }, (_, i) => Pm('box', '#4a4c50', [-2.32, 0.15, -0.95 + i * 0.17], [0.02, 0.28, 0.02])),
        Pm('box', '#2b2d30', [-2.45, 0.42, 0], [0.3, 0.08, 0.12]), ...wheelM(-2.6, 0.2, 0.02, 0.2, 0.14, '#3a3b3d', { slick: true })];
      return build(p);
    },
    grinderHG: () => { // tracked horizontal grinder: infeed hopper at the back, mill, engine, discharge conveyor out the front
      const teal = '#2f8f86', td = '#24706a', X = Math.PI / 2;
      const p = [...trackM(4.6, 1.05, 0.85, 0.55, 6), ...trackM(4.6, -1.05, 0.85, 0.55, 6),
        Pm('box', '#2b2d30', [0, 1.0, 0], [5.6, 0.35, 1.7]),
        // infeed hopper with flared sides and an apron chain floor
        Pm('box', '#1d1e20', [-2.0, 1.45, 0], [3.0, 0.08, 1.4]), ...[1, -1].map((s) => Pm('box', teal, [-2.0, 1.95, s * 1.0], [3.0, 1.0, 0.08], [s * 0.35, 0, 0])),
        Pm('box', teal, [-3.45, 1.85, 0], [0.08, 0.8, 2.0]), ...Array.from({ length: 9 }, (_, i) => Pm('box', '#3a3b3d', [-3.3 + i * 0.33, 1.5, 0], [0.05, 0.03, 1.38])),
        // mill housing and feed roll
        Pm('box', teal, [-0.1, 2.0, 0], [1.2, 1.6, 1.8]), Pm('cyl', '#3a3b3d', [-0.55, 1.95, 0], [0.7, 1.5, 0.7], [X, 0, 0]),
        Pm('box', '#e9e2c9', [-0.1, 2.85, 0], [1.25, 0.1, 1.85]),
        // engine enclosure, radiator, exhaust, catwalk
        Pm('box', teal, [1.5, 2.05, 0], [1.9, 1.7, 2.1]), Pm('box', td, [1.5, 2.93, 0], [1.85, 0.06, 2.0]),
        Pm('box', '#1c1d1f', [2.46, 2.05, 0], [0.02, 1.2, 1.7]), Pm('cyl', '#2a2c2f', [1.2, 3.4, 0.6], [0.2, 1.0, 0.2]),
        ...[1, -1].flatMap((s) => [Pm('box', '#2b2d30', [1.5, 1.25, s * 1.15], [1.9, 0.04, 0.3]), Pm('box', '#e8b320', [1.5, 1.7, s * 1.3], [1.9, 0.04, 0.04]),
          Pm('box', '#d9dde0', [1.5, 2.2, s * 1.06], [1.4, 0.8, 0.02]), Pm('box', '#e8b320', [-2.0, 2.5, s * 1.18], [3.0, 0.08, 0.02])]),
        Pm('box', '#d9dde0', [0.4, 1.4, 1.16], [0.5, 0.6, 0.12]), // control box
        ...latticeConveyor(5.2, 1.3, 4.1, 0.9, '#2b2d30').map((q) => ({ ...q, pos: [q.pos[0] + 2.2 * MM, q.pos[1], q.pos[2]] })),
        Pm('box', '#2b2d30', [7.4, 3.9, 0], [0.4, 0.5, 1.0]), Pm('cyl', '#3a3b3d', [7.3, 4.25, 0], [0.3, 0.95, 0.3], [X, 0, 0])];
      return build(p);
    },
    mulchHeap: () => build([Pm('cone', '#3a2618', [0, 0.45, 0], [2.6, 1.0, 2.6]), Pm('cone', '#4a321f', [0.25, 0.55, -0.2], [1.6, 0.9, 1.6]), Pm('sph', '#2e1f14', [-0.3, 0.2, 0.3], [1.6, 0.45, 1.4])]),
    compactLoader: () => build([ // small articulated yard loader, bright green
      ...[0.75, -0.75].flatMap((x) => [...wheelM(x, 0.42, 0.55, 0.42, 0.3, '#2b2d30'), ...wheelM(x, 0.42, -0.55, 0.42, 0.3, '#2b2d30')]),
      Pm('box', '#56b82e', [-0.5, 0.95, 0], [1.6, 0.7, 0.9]), Pm('box', '#2b2d30', [0.6, 0.75, 0], [1.0, 0.35, 0.8]),
      ...cabM(-0.3, 1.3, 1.0, 0.8, 0.85, '#56b82e'), ...[1, -1].map((s) => Pm('box', '#56b82e', [1.1, 0.95, s * 0.35], [1.3, 0.14, 0.12], [0, 0, -0.35])),
      Pm('box', '#2b2d30', [1.75, 0.35, 0], [0.6, 0.45, 1.4]), Pm('box', '#2b2d30', [1.6, 0.6, 0], [0.08, 0.5, 1.4])]),
    chiptruck: () => build(BIG_MODELS.chiptruckParts()),
    chiptruck2: () => build(BIG_MODELS.chiptruck2Parts()),
    chiptruckParts: () => chipTruckM(false),
    chiptruck2Parts: () => chipTruckM(true),
    chipHeap: () => build([Pm('cone', '#c9a26a', [0, 0.45, 0], [2.6, 1.0, 2.6]), Pm('cone', '#d6b27c', [0.25, 0.55, -0.2], [1.6, 0.9, 1.6]), Pm('sph', '#b8915c', [-0.3, 0.2, 0.3], [1.6, 0.45, 1.4])]),
    miniskidBase: () => { // in full skid-steer coordinates; the model is scaled to ~0.64 (about 2.3 m x 1.0 m x 1.3 m)
      const wht = '#f1f1ec', blk = '#1c1d1f', org = '#e8641c', X = Math.PI / 2;
      return build([...trackM(2.1, 0.62, 0.5, 0.34), ...trackM(2.1, -0.62, 0.5, 0.34),
        Pm('box', blk, [0, 0.62, 0], [2.0, 0.3, 0.95]),
        Pm('box', wht, [-0.15, 1.02, 0], [1.75, 0.55, 1.05]), Pm('box', HC.shade(wht, -0.08), [-0.15, 1.31, 0], [1.7, 0.04, 1.0]),
        ...[1, -1].flatMap((s) => [Pm('box', org, [-0.15, 1.05, s * 0.53], [1.5, 0.08, 0.01]), Pm('box', blk, [-0.4, 0.95, s * 0.53], [0.6, 0.22, 0.012]),
          Pm('box', wht, [-0.95, 1.35, s * 0.55], [0.4, 1.1, 0.14])]), // arm towers at the back
        Pm('box', blk, [0.55, 1.15, 0], [0.5, 0.35, 0.9]), Pm('box', '#2a2c2f', [0.82, 1.15, 0], [0.02, 0.25, 0.7]), // engine grille
        Pm('cyl', '#2a2c2f', [0.3, 1.5, -0.3], [0.08, 0.35, 0.08]),
        // operator station: control tower with levers, guard rail, rear standing platform
        Pm('box', blk, [-1.05, 1.55, 0], [0.22, 0.55, 0.8]), Pm('box', '#2b2d30', [-1.17, 1.85, 0], [0.12, 0.12, 0.85]),
        ...[-0.2, 0, 0.2].map((z) => Pm('cyl', '#1c1d1f', [-1.2, 1.98, z], [0.03, 0.22, 0.03], [0, 0, 0.35])),
        ...[0.3, -0.3].map((z) => Pm('sph', org, [-1.27, 2.08, z], [0.06, 0.06, 0.06])),
        Pm('box', blk, [-1.6, 0.42, 0], [0.55, 0.06, 0.85]), ...[1, -1].map((s) => Pm('box', blk, [-1.6, 1.0, s * 0.42], [0.04, 1.1, 0.04])),
        Pm('box', blk, [-1.6, 1.55, 0], [0.04, 0.04, 0.88]),
        Pm('box', '#c22', [-1.32, 1.0, 0.4], [0.03, 0.08, 0.1]), Pm('box', '#c22', [-1.32, 1.0, -0.4], [0.03, 0.08, 0.1]),
        Pm('box', '#e6eef3', [0.8, 1.35, 0.35], [0.04, 0.08, 0.12]), Pm('box', '#e6eef3', [0.8, 1.35, -0.35], [0.04, 0.08, 0.12])]);
    },
    dozerS: () => dozerM(0.8, false), // D3 class: about 4 m with the blade
    dozerL: () => dozerM(1, true),
    harvesterBase: () => [
      ...[2.35, 1.25, -1.6, -2.7].flatMap((x) => [...wheelM(x, 0.66, 1.2, 0.66, 0.6, '#f2c200'), ...wheelM(x, 0.66, -1.2, 0.66, 0.6, '#f2c200')]),
      Pm('box', '#1d1f22', [1.75, 0.95, 0], [3.3, 0.45, 1.2]), Pm('box', '#1d1f22', [-1.75, 0.95, 0], [3.4, 0.45, 1.2]),
      Pm('cyl', '#3a3b3d', [0.05, 0.95, 0], [0.5, 0.7, 0.5]), Pm('cyl', COL.chrome, [0.05, 0.85, 0.5], [0.08, 0.9, 0.08], [0, 0, Math.PI / 2]), Pm('cyl', COL.chrome, [0.05, 0.85, -0.5], [0.08, 0.9, 0.08], [0, 0, Math.PI / 2]),
      Pm('box', JD.green, [1.75, 1.45, 0], [2.6, 0.7, 2.0]), Pm('box', JD.yellow, [1.75, 1.82, 1.0], [2.6, 0.06, 0.02]), Pm('box', JD.yellow, [1.75, 1.82, -1.0], [2.6, 0.06, 0.02]),
      ...cabM(1.35, 1.85, 1.55, 1.55, 1.75, JD.green), Pm('box', COL.glass, [2.15, 2.6, 0], [0.02, 1.25, 1.65]),
      Pm('box', JD.green, [-2.15, 1.75, 0], [2.6, 1.3, 2.3]), Pm('box', '#1d1f22', [-2.15, 2.42, 0], [2.4, 0.05, 2.1]), Pm('box', JD.yellow, [-2.15, 1.9, 1.16], [2.6, 0.1, 0.02]), Pm('box', JD.yellow, [-2.15, 1.9, -1.16], [2.6, 0.1, 0.02]),
      Pm('box', '#1d1f22', [-3.47, 1.75, 0], [0.04, 0.9, 1.8]), Pm('cyl', COL.chrome, [-1.4, 2.8, 0.8], [0.13, 0.9, 0.13]),
      Pm('box', JD.yellow, [0.3, 1.15, 0], [0.3, 0.5, 1.3]), Pm('cyl', '#1d1f22', [2.75, 1.95, -0.55], [0.6, 0.5, 0.6])],
    harvesterBoom: () => build([ // knuckle boom out to the felling head
      Pm('box', '#2a2c30', [1.1, 0.6, 0], [2.8, 0.38, 0.38], [0, 0, 0.42]), Pm('cyl', COL.chrome, [0.9, 0.2, 0.25], [0.12, 2.0, 0.12], [0, 0, -1.0]),
      Pm('box', '#2a2c30', [3.9, 0.9, 0], [3.4, 0.32, 0.32], [0, 0, -0.18]), Pm('cyl', COL.chrome, [3.4, 1.25, 0.22], [0.1, 1.8, 0.1], [0, 0, 1.3]),
      Pm('box', '#2a2c30', [5.6, 0.1, 0], [0.25, 1.2, 0.25]),
      Pm('box', JD.yellow, [5.75, -0.85, 0], [0.75, 1.0, 0.85]), Pm('box', '#1d1f22', [6.05, -0.75, 0], [0.12, 0.85, 1.0]),
      Pm('cyl', '#2a2c30', [6.05, -0.75, 0.45], [0.35, 0.55, 0.35]), Pm('cyl', '#2a2c30', [6.05, -0.75, -0.45], [0.35, 0.55, 0.35]),
      Pm('box', '#c9cdd2', [6.0, -1.35, 0], [0.9, 0.05, 0.12])]),
    forwarder: () => {
      const p = [...[3.55, 2.5, -1.7, -2.9].flatMap((x) => [...wheelM(x, 0.66, 1.2, 0.66, 0.6, '#f2c200'), ...wheelM(x, 0.66, -1.2, 0.66, 0.6, '#f2c200')]),
        Pm('box', '#1d1f22', [3.1, 0.95, 0], [2.5, 0.45, 1.2]), Pm('box', '#1d1f22', [-1.3, 0.95, 0], [5.9, 0.45, 1.2]),
        Pm('cyl', '#3a3b3d', [1.85, 0.95, 0], [0.5, 0.7, 0.5]), Pm('cyl', COL.chrome, [1.85, 0.85, 0.5], [0.08, 0.9, 0.08], [0, 0, Math.PI / 2]), Pm('cyl', COL.chrome, [1.85, 0.85, -0.5], [0.08, 0.9, 0.08], [0, 0, Math.PI / 2]),
        Pm('box', JD.green, [3.85, 1.65, 0], [1.6, 1.2, 2.2]), Pm('box', '#1d1f22', [3.85, 2.28, 0], [1.5, 0.05, 2.0]), Pm('box', JD.yellow, [3.85, 1.8, 1.11], [1.6, 0.1, 0.02]), Pm('box', JD.yellow, [3.85, 1.8, -1.11], [1.6, 0.1, 0.02]),
        Pm('box', '#c9cdd2', [4.66, 1.6, 0], [0.04, 0.8, 1.6]),
        ...cabM(2.5, 1.7, 1.55, 1.5, 1.7, JD.green), Pm('box', JD.yellow, [2.5, 1.45, 0], [1.6, 0.35, 1.9]),
        Pm('box', JD.green, [-1.6, 1.15, 0], [5.2, 0.35, 2.3]), Pm('box', '#1d1f22', [0.95, 2.1, 0], [0.12, 2.0, 2.5]),
        ...[0.6, 1.0, 1.4, 1.8, 2.2, 2.6].map((y) => Pm('box', '#1d1f22', [0.95, y, 0], [0.13, 0.05, 2.5])),
        Pm('cyl', '#2a2c30', [1.45, 1.9, 0], [0.55, 1.1, 0.55]), Pm('box', JD.yellow, [1.45, 2.6, 0], [0.45, 0.45, 0.45]),
        Pm('box', '#2a2c30', [-0.2, 3.25, 0.25], [3.4, 0.24, 0.24], [0, 0, -0.08]), Pm('box', '#2a2c30', [-1.6, 3.0, -0.2], [2.6, 0.2, 0.2], [0, 0, 0.12]),
        Pm('box', JD.yellow, [-2.85, 2.6, -0.2], [0.4, 0.55, 0.5]), Pm('cyl', COL.chrome, [4.2, 2.6, 0.8], [0.12, 0.8, 0.12])];
      for (const x of [-0.6, -1.9, -3.2]) p.push(Pm('box', '#1d1f22', [x, 1.35, 0], [0.18, 0.18, 2.5]), Pm('box', '#1d1f22', [x, 2.2, 1.2], [0.12, 1.75, 0.12]), Pm('box', '#1d1f22', [x, 2.2, -1.2], [0.12, 1.75, 0.12]));
      return p;
    },
    pileHeap: () => { // a dozer push pile: dirt, broken logs, limbs and stones heaped up
      const p = [Pm('ico0', '#7a5d40', [0, 0.35, 0], [2.4, 0.9, 2.0]), Pm('ico0', '#6b5136', [0.4, 0.6, -0.2], [1.4, 0.8, 1.2])];
      const r = rnd(42);
      for (let i = 0; i < 7; i++) p.push(Pm('cyl', i % 2 ? '#7a5434' : '#6e4e33', [(r() - 0.5) * 1.6, 0.55 + r() * 0.5, (r() - 0.5) * 1.4], [0.3, 1.8, 0.3], [r() * 3, r() * 3, Math.PI / 2]));
      for (let i = 0; i < 6; i++) p.push(Pm('ico0', i % 2 ? '#4d7d2e' : '#6a8a3a', [(r() - 0.5) * 1.8, 0.8 + r() * 0.4, (r() - 0.5) * 1.6], [0.7, 0.5, 0.7]));
      for (let i = 0; i < 4; i++) p.push(Pm('dode', '#8b8e93', [(r() - 0.5) * 1.8, 0.25, (r() - 0.5) * 1.6], [0.45, 0.35, 0.45]));
      return build(p);
    },
    stumpItem: () => build([Pm('cyl', '#6b4b30', [0, 0.45, 0], [1.0, 0.65, 1.0], [0.4, 0, 0.2]), Pm('cyl', '#d6b27c', [0.08, 0.78, 0.13], [0.8, 0.01, 0.8], [0.4, 0, 0.2]),
      ...[0, 1.3, 2.6, 3.9, 5.2].map((a) => Pm('cone', '#5a3e28', [Math.cos(a) * 0.5, 0.2, Math.sin(a) * 0.5], [0.22, 0.9, 0.22], [Math.sin(a) * 1.4, 0, -Math.cos(a) * 1.4])),
      Pm('ico0', '#7a5a3a', [0, 0.12, 0], [1.2, 0.35, 1.2])]),
  };
  // quarry plant: red tracked crusher, red screener with radial stackers, a long blue lattice conveyor,
  // a yellow wheel loader and an articulated dump truck (all in metres)
  function latticeConveyor(len, h0, h1, w, color) {
    const p = [], ang = Math.atan2(h1 - h0, len), L = Math.hypot(len, h1 - h0);
    const at = (f) => [f * len, h0 + (h1 - h0) * f];
    for (const z of [w / 2, -w / 2]) p.push(Pm('box', color, [len / 2, (h0 + h1) / 2, z], [L, 0.12, 0.1], [0, 0, ang]), Pm('box', color, [len / 2, (h0 + h1) / 2 + 0.55, z], [L, 0.1, 0.08], [0, 0, ang]));
    for (let f = 0; f <= 1.001; f += 0.08) { const [x, y] = at(f); for (const z of [w / 2, -w / 2]) p.push(Pm('box', color, [x, y + 0.28, z], [0.06, 0.55, 0.06], [0, 0, 0.5])); }
    p.push(Pm('box', '#2a2b2d', [len / 2, (h0 + h1) / 2 + 0.08, 0], [L, 0.05, w * 0.85], [0, 0, ang]));
    return p;
  }
  const QUARRY_GEO = {
    crusher: () => { const red = '#b0261f', p = [...trackM(5.5, 1.1, 0.9, 0.55, 6), ...trackM(5.5, -1.1, 0.9, 0.55, 6),
      Pm('box', red, [0, 1.6, 0], [6.5, 1.1, 2.4]), Pm('box', red, [-2.2, 3.0, 0], [2.6, 1.6, 3.2]), Pm('box', '#7a1915', [-2.2, 3.85, 0], [2.8, 0.2, 3.4]),
      Pm('box', '#3a3b3d', [0.6, 2.7, 0], [1.6, 2.0, 1.8]), Pm('box', red, [1.9, 2.9, 0], [1.4, 1.2, 1.6]), Pm('box', '#2a2b2d', [2.5, 3.6, 0.9], [0.8, 0.8, 0.8]),
      ...latticeConveyor(6.5, 1.4, 4.2, 1.0, red).map((q) => ({ ...q, pos: [q.pos[0] + 3.2 * MM, q.pos[1], q.pos[2]] }))]; return build(p); },
    screener: () => { const red = '#b0261f', p = [...trackM(5.0, 1.0, 0.8, 0.5, 5), ...trackM(5.0, -1.0, 0.8, 0.5, 5),
      Pm('box', red, [0, 1.5, 0], [5.6, 0.9, 2.2]), Pm('box', '#c9cdd2', [-0.4, 2.6, 0], [3.4, 0.9, 2.3], [0, 0, 0.12]), Pm('box', red, [-2.4, 2.6, 0], [1.4, 1.4, 2.6]),
      ...latticeConveyor(7, 1.2, 4.5, 0.9, red).map((q) => ({ ...q, pos: [q.pos[0] + 2.6 * MM, q.pos[1], q.pos[2]] }))];
      for (const s2 of [1, -1]) p.push(...latticeConveyor(6.5, 1.2, 4.0, 0.8, red).map((q) => { const x = q.pos[0], z = q.pos[2]; const a = s2 * 1.4; return { ...q, pos: [Math.cos(a) * x - Math.sin(a) * z, q.pos[1], Math.sin(a) * x + Math.cos(a) * z], rot: [q.rot[0], q.rot[1] - a, q.rot[2]] }; }));
      return build(p); },
    conveyor: () => { const blue = '#2f5aa8', p = [...latticeConveyor(26, 0.8, 7.5, 1.2, blue)];
      for (const f of [0.3, 0.62, 0.9]) { const x = f * 26, h = 0.8 + 6.7 * f; for (const z of [1.1, -1.1]) p.push(Pm('box', blue, [x, h / 2, z], [0.14, h, 0.14], [0.08 * Math.sign(z), 0, 0])); p.push(Pm('box', blue, [x, h * 0.5, 0], [0.1, 0.1, 2.2])); }
      p.push(Pm('box', '#3a3b3d', [-0.6, 0.9, 0], [1.6, 1.4, 1.8]), Pm('cone', '#9c968a', [26.5, 1.6, 0], [7.5, 3.2, 7.5])); return build(p); },
    loader: () => build([...wheelM(1.4, 0.8, 1.05, 0.8, 0.6), ...wheelM(1.4, 0.8, -1.05, 0.8, 0.6), ...wheelM(-1.4, 0.8, 1.05, 0.8, 0.6), ...wheelM(-1.4, 0.8, -1.05, 0.8, 0.6),
      Pm('box', COL.cat, [1.3, 1.5, 0], [1.6, 0.8, 1.6]), Pm('box', COL.cat, [-1.5, 1.6, 0], [2.4, 1.2, 1.9]), Pm('box', COL.black, [-2.72, 1.7, 0], [0.04, 0.8, 1.4]),
      ...cabM(-0.4, 2.0, 1.4, 1.3, 1.4, COL.cat), Pm('box', COL.cat, [2.4, 1.6, 0.7], [1.8, 0.3, 0.25], [0, 0, -0.35]), Pm('box', COL.cat, [2.4, 1.6, -0.7], [1.8, 0.3, 0.25], [0, 0, -0.35]),
      Pm('box', '#4a4f56', [3.4, 0.7, 0], [0.9, 1.0, 2.8]), Pm('box', '#4a4f56', [3.8, 0.25, 0], [0.5, 0.1, 2.8])]),
    adt: () => build([...[2.6, -0.6, -2.1].flatMap((x) => [...wheelM(x, 0.8, 1.15, 0.8, 0.6), ...wheelM(x, 0.8, -1.15, 0.8, 0.6)]),
      Pm('box', COL.cat, [2.7, 1.8, 0], [1.6, 1.0, 2.3]), ...cabM(2.6, 2.3, 1.3, 1.2, 1.5, COL.cat),
      Pm('box', COL.cat, [-1.4, 2.0, 0], [4.4, 0.25, 2.8]), Pm('box', COL.cat, [-1.4, 2.7, 1.38], [4.4, 1.4, 0.08]), Pm('box', COL.cat, [-1.4, 2.7, -1.38], [4.4, 1.4, 0.08]),
      Pm('box', COL.cat, [0.8, 2.9, 0], [0.12, 1.8, 2.8]), Pm('cone', '#9c968a', [-1.4, 2.6, 0], [3.4, 0.9, 2.4])]),
  };
  function shedGeo(sh) {
    const W = U(sh.w), D = U(sh.h), p = [];
    for (let x = -W / 2; x <= W / 2 + 0.01; x += W / 4) { p.push(P('box', '#7a5a3a', [x, 1.1, D / 2], [0.16, 2.2, 0.16]), P('box', '#7a5a3a', [x, 1.25, -D / 2], [0.16, 2.5, 0.16])); }
    p.push(P('box', '#9a8f82', [0, 1.25, -D / 2 - 0.06], [W, 2.5, 0.08]));
    for (let x = -W / 2 + 0.3; x < W / 2; x += 0.6) p.push(P('box', '#8a7f72', [x, 1.25, -D / 2 - 0.1], [0.03, 2.5, 0.02]));
    p.push(P('box', '#9a8f82', [-W / 2 - 0.05, 1.25, 0], [0.08, 2.5, D]), P('box', '#9a8f82', [W / 2 + 0.05, 1.25, 0], [0.08, 2.5, D]));
    p.push(P('box', '#5a5f66', [0, 2.45, 0], [W + 0.5, 0.1, D + 0.6], [-0.08, 0, 0]));
    for (let x = -W / 2; x < W / 2; x += 0.5) p.push(P('box', '#4b5056', [x, 2.51, 0], [0.03, 0.02, D + 0.6], [-0.08, 0, 0]));
    p.push(P('box', '#f07a22', [0, 2.15, D / 2 + 0.06], [W * 0.5, 0.25, 0.04]));
    return build(p);
  }

  // ---------- ground texture ----------
  const TILE_COL = {
    [T.GRASS]: '#7cc24f', [T.TALL]: '#64a63e', [T.DIRT]: '#a5805a', [T.GRAVEL]: '#aea692', [T.ROAD]: '#9a978a',
    [T.MULCH]: '#83502d', [T.SOD]: '#5fd14c', [T.PAVER]: '#d6c4a4', [T.BED]: '#5c3b25', [T.MOWED]: '#86cc58', [T.WATER]: '#6b6a4a', [T.FIELD]: '#6f8a3a', [T.QUARRY]: '#b0a58f', [T.DIRTROAD]: '#97815f', [T.ROCKFACE]: '#b39470',
  };
  const mix = (a, b, t) => { const A = parseInt(a.slice(1), 16), B = parseInt(b.slice(1), 16); const ch = (sh) => Math.round(((A >> sh) & 255) * (1 - t) + ((B >> sh) & 255) * t); return '#' + ((1 << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).slice(1); };
  const hash = (x, y, s = 0) => {
    let h = (x * 374761393 + y * 668265263 + s * 2246822519) | 0;
    h = (h ^ (h >>> 13)) * 1274126177;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  };
  function paintTile(x, y, noFeatures, pass) {
    const W = world, i = y * W.w + x, t = W.tiles[i], px = x * G, py = y * G, g = gctx;
    let base = TILE_COL[t];
    if ((t === T.GRASS || t === T.TALL) && W.waterDist[i] < 2.4) base = HC.lerp(0, 1, 0) || '#8f8a55'; // muddy bank
    if (t === T.GRASS || t === T.TALL || t === T.MOWED) {
      const n = 0.5 + 0.3 * Math.sin(x * 0.13 + 1.7) * Math.cos(y * 0.11) + 0.2 * Math.sin((x - y) * 0.31);
      const dry = 0.5 + 0.5 * Math.sin(x * 0.045 - y * 0.06);
      const c1 = t === T.TALL ? '#5f8d36' : '#6c9f3f', c2 = t === T.TALL ? '#7f9c45' : '#8ab352';
      base = mix(c1, c2, n * 0.8 + dry * 0.2);
    }
    if (pass !== 'detail') { g.fillStyle = HC.shade(base, (hash(x, y) - 0.5) * 0.06); g.fillRect(px, py, G, G); }
    if (pass === 'base') return; // the first pass lays colour only, so tile edges can be blended before the detail goes on
    const dots = (col, n, sz = 2) => { g.fillStyle = col; for (let k = 0; k < n; k++) g.fillRect(px + Math.floor(hash(x, y, k) * (G - sz)), py + Math.floor(hash(y, x, k + 9) * (G - sz)), sz, sz); };
    switch (t) {
      case T.GRASS: {
        dots('rgba(80,128,46,0.55)', 6, 3); dots('rgba(150,196,96,0.5)', 5, 2); dots('#5d8f37', 3); dots('#a6cc6a', 3, 1);
        g.strokeStyle = 'rgba(70,120,40,0.45)'; g.lineWidth = 1;
        for (let k = 0; k < 3; k++) { const bx = px + 1 + hash(x, y, k + 20) * (G - 2), by = py + 3 + hash(y, x, k + 21) * (G - 3); g.beginPath(); g.moveTo(bx, by); g.lineTo(bx + (hash(x, k) - 0.5) * 2, by - 3); g.stroke(); }
        if (hash(x, y, 77) < 0.05) dots(HC.pick(['#ffffff', '#f2d14e']), 1);
        break;
      }
      case T.MOWED: g.fillStyle = x % 2 ? 'rgba(144,211,98,0.85)' : 'rgba(124,191,80,0.85)'; g.fillRect(px, py, G, G); dots('rgba(90,150,60,0.5)', 4, 2); break;
      case T.TALL:
        g.strokeStyle = '#8ccd5e'; g.lineWidth = 1.5;
        for (let k = 0; k < 4; k++) { const bx = px + 2 + hash(x, y, k) * (G - 4), by = py + 5 + hash(y, x, k) * (G - 5); g.beginPath(); g.moveTo(bx, by); g.lineTo(bx + 1.5, by - 5); g.stroke(); }
        if (hash(x, y, 5) < 0.35) dots(['#ff7eb6', '#f2d14e', '#ffffff', '#b58cff'][Math.floor(hash(x, y, 6) * 4)], 2, 2);
        { const m = W.cut && W.cut.get(i); // patches the deck has already been over: fresh-cut stubble
          if (m) for (let s2 = 0; s2 < 9; s2++) if (m & (1 << s2)) { const q = G / 3; g.fillStyle = (x + Math.floor(s2 / 3)) % 2 ? 'rgba(150,214,100,0.95)' : 'rgba(128,196,82,0.95)'; g.fillRect(px + (s2 % 3) * q, py + Math.floor(s2 / 3) * q, Math.ceil(q), Math.ceil(q)); } }
        break;
      case T.DIRT: dots('rgba(110,82,52,0.6)', 6, 3); dots('#8d6c48', 4); dots('#b08e66', 3, 1); break;
      case T.GRAVEL: dots('#8f887a', 6); dots('#a49d8e', 6); dots('#ddd7ca', 5, 1); dots('#6f6a60', 3, 1); break;
      case T.ROAD: dots('#8a877a', 4); break;
      case T.MULCH: dots('#a96d40', 6); break;
      case T.BED: dots('#7a4f30', 5); break;
      case T.SOD: g.fillStyle = '#4fb340'; g.fillRect(px, py + 7, G, 1); g.fillRect(px + 7, py, 1, 7); break;
      case T.PAVER: g.fillStyle = '#b3a386'; g.fillRect(px, py + 7, G, 1); g.fillRect(px + (y % 2 ? 3 : 11), py, 1, 7); g.fillRect(px + (y % 2 ? 11 : 3), py + 8, 1, 8); break;
      case T.WATER: dots('#555a3c', 4); break;
      case T.QUARRY: dots('#958a76', 6); dots('#cbc0a8', 4); if (hash(x, y, 31) < 0.12) { g.fillStyle = 'rgba(120,95,60,0.25)'; g.fillRect(px, py + 5, G, 3); } break;
      case T.ROCKFACE: { // layered sandstone/limestone with strata lines and cracks
        const band = ['#b39470', '#a58565', '#c4a983', '#9d7d5b', '#b8996f'][(y + Math.floor(hash(x, 3) * 2)) % 5];
        g.fillStyle = band; g.fillRect(px, py, G, G);
        g.fillStyle = 'rgba(80,60,40,0.35)'; g.fillRect(px, py + 4, G, 1); g.fillRect(px, py + 11, G, 1);
        g.fillStyle = 'rgba(255,240,215,0.25)'; g.fillRect(px, py + 5, G, 1);
        if (hash(x, y, 9) < 0.4) { g.fillStyle = 'rgba(60,45,30,0.4)'; g.fillRect(px + Math.floor(hash(x, y, 2) * 14), py, 1, G); }
        if (hash(x, y, 13) < 0.08) dots('#6e8a3a', 2, 2);
        break;
      }
      case T.DIRTROAD:
        dots('#7f6b4d', 5); dots('#b39d78', 3);
        g.fillStyle = 'rgba(70,55,35,0.35)'; g.fillRect(px + 3, py, 2, G); g.fillRect(px + G - 5, py, 2, G);
        break;
      case T.FIELD: {
        const f = (W.fields || []).find((q) => x >= q.gx && x < q.gx + q.pw && y >= q.gy && y < q.gy + q.ph);
        const crop = f ? f.crop : 'hay';
        const c = { corn: ['#4f7a2a', '#6b9a3a'], soy: ['#5e8a34', '#7aa648'], hay: ['#a8a256', '#bdb46a'], plowed: ['#6a4d33', '#80603f'] }[crop];
        g.fillStyle = c[0]; g.fillRect(px, py, G, G);
        g.fillStyle = c[1];
        for (let k = 0; k < G; k += 4) g.fillRect(px, py + k, G, 2);
        break;
      }
    }
    if (!noFeatures && W.roadDist[i] < 2.6) { g.save(); g.beginPath(); g.rect(px, py, G, G); g.clip(); drawRoads(px - G * 3, py - G * 3, px + G * 4, py + G * 4); g.restore(); }
  }
  // smooth roads painted in layers across ALL roads at once, so intersections merge into one surface:
  // gravel shoulder, white edge line, asphalt, then the dashed centre line (left out inside intersections)
  function drawRoads(x0, y0, x1, y1) {
    const g = gctx, runs = [];
    for (const r of world.roads) {
      let run = null, acc = 0, prev = null;
      r.pts.forEach(([sx, sy], k) => {
        const X = sx * G, Y = sy * G;
        if (prev) acc += Math.hypot(X - prev[0], Y - prev[1]);
        prev = [X, Y];
        if (X > x0 && X < x1 && Y > y0 && Y < y1) { if (!run) { run = { pts: [], junction: [], d: acc }; runs.push(run); } run.pts.push([X, Y]); run.junction.push(r.junction ? r.junction[k] : false); } else run = null;
      });
    }
    if (!runs.length) return;
    const path = (rn) => { g.beginPath(); rn.pts.forEach(([X, Y], k) => (k ? g.lineTo(X, Y) : g.moveTo(X, Y))); };
    g.lineCap = 'round'; g.lineJoin = 'round'; g.setLineDash([]);
    // tiles are 3 m: shoulders to 9.2 m, pavement 7.2 m, white edge lines 15 cm wide set 30 cm in
    for (const [col, w] of [['#a39f8e', 3.07], ['#4a4d55', 2.4], ['#e9e6dc', 2.2], ['#4a4d55', 2.1]]) {
      g.strokeStyle = col; g.lineWidth = G * w;
      for (const rn of runs) { path(rn); g.stroke(); }
    }
    // a little texture in the asphalt
    g.strokeStyle = 'rgba(255,255,255,0.035)'; g.lineWidth = G * 0.9;
    for (const rn of runs) { path(rn); g.stroke(); }
    g.strokeStyle = '#efc54a'; g.lineWidth = 1.5; g.lineCap = 'butt';
    g.setLineDash([G * 1, G * 3]);
    for (const rn of runs) {
      // centre line in pieces, skipping intersection samples
      let open = false, acc = rn.d;
      for (let k = 0; k < rn.pts.length; k++) {
        const [X, Y] = rn.pts[k];
        if (k) acc += Math.hypot(X - rn.pts[k - 1][0], Y - rn.pts[k - 1][1]);
        if (rn.junction[k]) { if (open) { g.stroke(); open = false; } continue; }
        if (!open) { g.beginPath(); g.lineDashOffset = -acc; g.moveTo(X, Y); open = true; } else g.lineTo(X, Y);
      }
      if (open) g.stroke();
    }
    g.setLineDash([]); g.lineCap = 'round';
  }
  function paintDecals() {
    const g = gctx;
    for (const b of world.bays) {
      g.save(); g.translate(U(b.x) * G, U(b.y) * G); g.rotate(b.a);
      g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = 1.2;
      const l = b.kind === 'trailer' ? G * 2.8 : G * 1.6, w = b.kind === 'trailer' ? G * 1.4 : G * 1.3;
      g.strokeRect(-l / 2, -w / 2, l, w);
      g.restore();
    }
    if (world.quarry) {
      for (const pd of world.quarry.puddles) { // muddy water standing on the pit floor
        const cx = U(pd.x) * G, cy = U(pd.y) * G;
        g.fillStyle = 'rgba(150,110,55,0.55)'; g.beginPath(); g.ellipse(cx, cy, G * 2.4, G * 1.3, 0.3, 0, 6.283); g.fill();
        g.fillStyle = 'rgba(205,160,85,0.85)'; g.beginPath(); g.ellipse(cx, cy, G * 1.9, G * 0.95, 0.3, 0, 6.283); g.fill();
        g.fillStyle = 'rgba(255,240,200,0.25)'; g.beginPath(); g.ellipse(cx - G * 0.5, cy - G * 0.2, G * 0.8, G * 0.25, 0.3, 0, 6.283); g.fill();
      }
      const p = world.quarry.pad;
      g.strokeStyle = '#f2c94c'; g.lineWidth = 2; g.setLineDash([6, 4]);
      g.strokeRect(U(p.x) * G + 2, U(p.y) * G + 2, U(p.w) * G - 4, U(p.h) * G - 4); g.setLineDash([]);
    }
    if (world.supply) { // mulch sales pad, and dark mulch scattered where the bins get loaded
      const p = world.supply.pad;
      g.strokeStyle = '#f2c94c'; g.lineWidth = 2; g.setLineDash([6, 4]);
      g.strokeRect(U(p.x) * G + 2, U(p.y) * G + 2, U(p.w) * G - 4, U(p.h) * G - 4); g.setLineDash([]);
      for (const pl of world.supply.piles) { g.fillStyle = 'rgba(46,31,20,0.55)'; g.beginPath(); g.ellipse(U(pl.x) * G, U(pl.y + 40) * G, 2.6 * G, 1.4 * G, 0, 0, Math.PI * 2); g.fill(); }
    }
    for (const p of world.pads || [world.pad]) {
      if (!p) continue;
      g.strokeStyle = '#f2c94c'; g.lineWidth = 2; g.setLineDash([6, 4]);
      g.strokeRect(U(p.x) * G + 2, U(p.y) * G + 2, U(p.w) * G - 4, U(p.h) * G - 4); g.setLineDash([]);
    }
  }

  // ---------- graphics quality ----------
  const QUALITY = {
    low: { ratio: 1, shadow: 1024, radius: 2 },
    high: { ratio: 2, shadow: 2048, radius: 3 },
    ultra: { ratio: 2.5, shadow: 4096, radius: 4 },
  };
  let envTex = null;
  function setQuality(q) {
    const Q = QUALITY[q] || QUALITY.high;
    curQ = q;
    if (!renderer) return;
    renderer.setPixelRatio(Math.min(Q.ratio, window.devicePixelRatio || 1) * (q === 'ultra' && (window.devicePixelRatio || 1) < 1.5 ? 1.5 : 1));
    if (sun && sun.shadow.mapSize.x !== Q.shadow) {
      sun.shadow.mapSize.set(Q.shadow, Q.shadow);
      if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
    }
    if (sun) sun.shadow.radius = Q.radius;
    if (scene) scene.environment = q === 'low' ? null : envTex; // reflections are the costliest part on weak GPUs
    hemi && (hemi.intensity = LIGHT.hemi);
    if (typeof resize === 'function') try { resize(); } catch (e) { /* first call before sizing */ }
  }

  // ---------- init ----------
  function init(canvas) {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    THREE.ColorManagement.legacyMode = false;
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.92;
    scene = new THREE.Scene();
    scene.background = new THREE.Color('#cfe2ee');
    scene.fog = new THREE.Fog('#cfe2ee', 45, 110);
    camera = new THREE.PerspectiveCamera(42, 1, 0.5, 260);
    hemi = new THREE.HemisphereLight('#cfe4ff', '#4a5a32', LIGHT.hemi);
    scene.add(hemi);
    sun = new THREE.DirectionalLight('#fff1d8', LIGHT.sun);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -32, right: 32, top: 32, bottom: -32, near: 1, far: 120 });
    sun.shadow.bias = -0.0008;
    sun.shadow.normalBias = 0.02;
    sun.shadow.radius = 3;
    scene.add(sun); scene.add(sun.target);
    // sky dome: deep blue overhead fading to a pale horizon
    const sg = new THREE.SphereGeometry(220, 24, 12), sc = [];
    const top = new THREE.Color('#3f7fc4'), hor = new THREE.Color('#cfe2ee');
    for (let i = 0; i < sg.attributes.position.count; i++) { const y = sg.attributes.position.getY(i) / 220; const c = hor.clone().lerp(top, HC.clamp(y * 1.6, 0, 1)); sc.push(c.r, c.g, c.b); }
    sg.setAttribute('color', new THREE.Float32BufferAttribute(sc, 3));
    sky = new THREE.Mesh(sg, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
    sky.renderOrder = -10;
    scene.add(sky);
    makeMaterials(); baseGeos();
    // reflections: a blurred copy of the sky over a grassy ground, so paint, chrome and glass have something to mirror
    try {
      const envScene = new THREE.Scene(), eg = new THREE.SphereGeometry(10, 24, 12), ec = [];
      const eTop = new THREE.Color('#5d93cf'), eHor = new THREE.Color('#e4eef4'), eGnd = new THREE.Color('#5a6b44');
      for (let i = 0; i < eg.attributes.position.count; i++) { const y = eg.attributes.position.getY(i) / 10; const c = y >= 0 ? eHor.clone().lerp(eTop, Math.min(1, y * 1.5)) : eHor.clone().lerp(eGnd, Math.min(1, -y * 4)); ec.push(c.r, c.g, c.b); }
      eg.setAttribute('color', new THREE.Float32BufferAttribute(ec, 3));
      envScene.add(new THREE.Mesh(eg, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
      const sunBlob = new THREE.Mesh(new THREE.SphereGeometry(1.2, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 5.6, 4.8) }));
      sunBlob.position.set(4, 7, 5); envScene.add(sunBlob);
      const pm = new THREE.PMREMGenerator(renderer);
      envTex = pm.fromScene(envScene, 0.02).texture; scene.environment = envTex;
      pm.dispose();
    } catch (e) { /* reflections are optional */ }
    setQuality((HC.company && HC.company.prefs && HC.company.prefs.gfx) || 'high');
    glbDecode();
    overlay = document.getElementById('overlay');
    octx = overlay.getContext('2d');
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(400 * 3), 3));
    pg.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(400 * 3), 3));
    points = new THREE.Points(pg, new THREE.PointsMaterial({ size: 0.16, vertexColors: true }));
    points.frustumCulled = false;
    scene.add(points);
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(500 * 6), 3));
    rain = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: '#cfe0ff', transparent: true, opacity: 0.55 }));
    rain.frustumCulled = false; rain.visible = false;
    rain.userData.drops = Array.from({ length: 500 }, () => ({ x: HC.rand(-30, 30), y: HC.rand(0, 25), z: HC.rand(-30, 30) }));
    scene.add(rain);
    marker = new THREE.Mesh(new THREE.RingGeometry(0.62, 0.75, 32), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.85, depthWrite: false }));
    marker.rotation.x = -Math.PI / 2;
    scene.add(marker);
    beacon = new THREE.Group();
    const bm = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 40, 12, 1, true), new THREE.MeshBasicMaterial({ color: '#ff8a2a', transparent: true, opacity: 0.25, depthWrite: false }));
    bm.position.y = 20;
    const pin = new THREE.Group(), pinMat = new THREE.MeshBasicMaterial({ color: '#ff8a2a' });
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.9, 12), pinMat); tip.rotation.x = Math.PI;
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.38, 16, 12), pinMat); ball.position.y = 0.55;
    pin.add(tip, ball); pin.position.y = 7;
    beacon.add(bm, pin); beacon.userData.pin = pin; beacon.visible = false;
    scene.add(beacon);
    resize();
    window.addEventListener('resize', resize);
  }
  function resize() {
    const w = window.innerWidth, h = window.innerHeight, dpr = Math.min(2, window.devicePixelRatio || 1);
    renderer.setSize(w, h, false);
    renderer.domElement.style.width = w + 'px'; renderer.domElement.style.height = h + 'px';
    camera.aspect = w / h; camera.updateProjectionMatrix();
    overlay.width = Math.floor(w * dpr); overlay.height = Math.floor(h * dpr);
    overlay.style.width = w + 'px'; overlay.style.height = h + 'px';
    octx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function clearWorld() {
    for (const k in meshes) { for (const m of meshes[k].values()) scene.remove(m); meshes[k].clear(); }
    if (worldGroup) scene.remove(worldGroup);
    for (const o of [fenceMesh, poleMesh, wireLines, zoneLine, targetGroup, aimMesh, landMesh]) if (o) scene.remove(o);
    for (const k in unitObjs) scene.remove(unitObjs[k]);
    for (const k in trailerObjs) scene.remove(trailerObjs[k]);
    if (sawObj) { scene.remove(sawObj); sawObj = null; }
    for (const k in attObjs) { if (attObjs[k].parent) attObjs[k].parent.remove(attObjs[k]); delete attObjs[k]; }
    unitObjs = {}; trailerObjs = {}; zoneSig = ''; targetSig = '';
  }

  // 256x256 tiling noise: R = fine blades and grit, G = mid clumps, B = soft blotches
  let detTex = null;
  function detailTexture() {
    if (detTex) return detTex;
    const N = 256, c = document.createElement('canvas'); c.width = c.height = N;
    const g = c.getContext('2d'), img = g.createImageData(N, N), r = rnd(7);
    const val = new Float32Array(N * N * 3);
    for (let i = 0; i < N * N; i++) { val[i * 3] = 0.5 + (r() - 0.5) * 0.5; val[i * 3 + 1] = 0.5; val[i * 3 + 2] = 0.5; }
    const blob = (ch, n, rad, amp) => { for (let k = 0; k < n; k++) { const cx = r() * N, cy = r() * N, a = (r() - 0.5) * amp; for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++) { const d = Math.hypot(dx, dy) / rad; if (d > 1) continue; const x = (Math.floor(cx + dx) + N) % N, y = (Math.floor(cy + dy) + N) % N; val[(y * N + x) * 3 + ch] += a * (1 - d * d); } } };
    blob(1, 220, 6, 0.5); blob(2, 60, 22, 0.45);
    for (let k = 0; k < 900; k++) { const x = Math.floor(r() * N), y0 = Math.floor(r() * N), len = 2 + Math.floor(r() * 4), dk = r() < 0.5 ? -0.35 : 0.3; for (let j = 0; j < len; j++) { const y = (y0 - j + N) % N; val[(y * N + x) * 3] += dk; } } // blades
    for (let i = 0; i < N * N; i++) for (let ch = 0; ch < 3; ch++) img.data[i * 4 + ch] = Math.max(0, Math.min(255, val[i * 3 + ch] * 255));
    for (let i = 0; i < N * N; i++) img.data[i * 4 + 3] = 255;
    g.putImageData(img, 0, 0);
    detTex = new THREE.CanvasTexture(c);
    detTex.wrapS = detTex.wrapT = THREE.RepeatWrapping;
    detTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    return detTex;
  }
  function terrainMesh(w) {
    const W = w.w, H = w.h, pos = [], uv = [], idx = [];
    const hAt = (x, z) => {
      let s = 0, n = 0;
      for (const [dx, dz] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) { const tx = x + dx, tz = z + dz; if (tx >= 0 && tz >= 0 && tx < W && tz < H) { s += w.hT[tz * W + tx]; n++; } }
      return n ? s / n : 0;
    };
    for (let z = 0; z <= H; z++) for (let x = 0; x <= W; x++) { pos.push(x, hAt(x, z), z); uv.push(x / W, 1 - z / H); }
    for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
      const a = z * (W + 1) + x, b = a + 1, c = a + W + 1, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ map: groundTex, roughness: 0.95, metalness: 0 });
    // a fine tiling grass/soil texture over the painted map (crisp up close), plus a broad colour drift to break up big areas
    const det = detailTexture();
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.detailMap = { value: det }; sh.uniforms.detRep = { value: new THREE.Vector2(W * 1.3, H * 1.3) };
      sh.fragmentShader = 'uniform sampler2D detailMap;\nuniform vec2 detRep;\n' + sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
        vec3 dA = texture2D(detailMap, vUv * detRep).rgb, dB = texture2D(detailMap, vUv * detRep * 0.21 + 0.37).rgb, dC = texture2D(detailMap, vUv * detRep * 0.031 + 0.71).rgb;
        diffuseColor.rgb *= (0.86 + 0.28 * dA.r) * (0.94 + 0.12 * dB.g) * (0.92 + 0.16 * dC.b);`);
    };
    const m = new THREE.Mesh(g, mat);
    m.receiveShadow = true;
    return m;
  }

  function prepare(w) {
    clearWorld();
    world = w;
    worldGroup = new THREE.Group();
    scene.add(worldGroup);
    groundCanvas = document.createElement('canvas');
    groundCanvas.width = w.w * G; groundCanvas.height = w.h * G;
    gctx = groundCanvas.getContext('2d');
    for (let y = 0; y < w.h; y++) for (let x = 0; x < w.w; x++) paintTile(x, y, true, 'base');
    // soften the hard square edges between grass, dirt, gravel and fields before the detail goes on
    try { gctx.filter = `blur(${Math.round(G * 0.22)}px)`; gctx.drawImage(groundCanvas, 0, 0); gctx.filter = 'none'; } catch (e) { /* no canvas filters: keep crisp tiles */ }
    for (let y = 0; y < w.h; y++) for (let x = 0; x < w.w; x++) paintTile(x, y, true, 'detail');
    drawRoads(-99, -99, groundCanvas.width + 99, groundCanvas.height + 99);
    paintDecals();
    groundTex = new THREE.CanvasTexture(groundCanvas);
    groundTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    groundTex.encoding = THREE.sRGBEncoding;
    worldGroup.add(terrainMesh(w));
    worldGroup.add(buildRoadMeshes(w));
    // water: one sheet at creek level; the ground dips below it along the creek and pond
    const water = new THREE.Mesh(new THREE.PlaneGeometry(w.w, w.h), new THREE.MeshStandardMaterial({ color: '#2f6476', roughness: 0.08, metalness: 0.35, transparent: true, opacity: 0.9 }));
    water.rotation.x = -Math.PI / 2; water.position.set(w.w / 2, HC.World.WATER_Y, w.h / 2);
    worldGroup.add(water);
    const skirt = new THREE.Mesh(new THREE.PlaneGeometry(800, 800), new THREE.MeshStandardMaterial({ color: '#4a7330', roughness: 1 }));
    skirt.rotation.x = -Math.PI / 2; skirt.position.set(w.w / 2, 0.05, w.h / 2);
    skirt.renderOrder = -1;
    const hole = new THREE.Mesh(new THREE.PlaneGeometry(w.w - 0.2, w.h - 0.2), new THREE.MeshBasicMaterial({ colorWrite: false }));
    hole.visible = false;
    worldGroup.add(skirt);
    skirt.position.y = -1.2;
    worldGroup.add(distantHills(w));
    buildStatic();
    buildFences(); buildPoles();
  }

  // ---------- roads as clean 3D ribbons over the painted shoulders: smooth asphalt, crisp edge lines, centre dashes ----------
  // Drawn in layers so crossings stay clean: all asphalt, then the white edge lines, then an inner asphalt pass that
  // paints over other roads' edge lines where they cross, then the yellow dashes (skipped through intersections).
  function buildRoadMeshes(w) {
    const grp = new THREE.Group(), LIFT = 0.014;
    const strip = (pts, offA, offB, mask) => { // a band between two offsets from the centre line, following the ground
      const pos = [], idx = [];
      let n = 0;
      for (let k = 0; k < pts.length; k++) {
        const [x, z] = pts[k], a = pts[Math.max(0, k - 1)], b2 = pts[Math.min(pts.length - 1, k + 1)];
        let dx = b2[0] - a[0], dz = b2[1] - a[1]; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
        for (const o of [offA, offB]) { const px = x - dz * o, pz = z + dx * o; pos.push(px, gh(px * TS, pz * TS) + LIFT, pz); }
        if (k && (!mask || mask[k])) { const i = n * 2; idx.push(i - 2, i - 1, i, i - 1, i + 1, i); }
        n++;
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
      return g;
    };
    const mat = (color, order) => { const m = new THREE.MeshStandardMaterial({ color, roughness: 0.92, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2 - order, polygonOffsetUnits: -2 - order }); m.depthWrite = false; return m; };
    const asphalt = mat('#3f4247', 0), white = mat('#ecebe4', 1), cover = mat('#3f4247', 2), yellow = mat('#f0c43c', 3);
    const add = (g, m, order) => { const me = new THREE.Mesh(g, m); me.renderOrder = 2 + order; me.receiveShadow = true; grp.add(me); };
    for (const r of w.roads) {
      const pts = r.pts.filter((_, k) => k % 2 === 0), jn = (r.junction || []).filter((_, k) => k % 2 === 0);
      if (pts.length < 2) continue;
      add(strip(pts, -1.2, 1.2), asphalt, 0);
      const noJ = jn.map((j, k) => !j && !jn[k - 1]);
      add(strip(pts, 1.05, 1.1, noJ), white, 1); add(strip(pts, -1.1, -1.05, noJ), white, 1);
      add(strip(pts, -1.04, 1.04), cover, 2);
      // centre dashes: 3 m paint, 9 m gap (1 tile on, 3 off), none through intersections
      let acc = 0; const dash = [];
      for (let k = 0; k < pts.length; k++) { if (k) acc += Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]); dash.push(!jn[k] && !jn[k - 1] && (acc % 4) < 1); }
      add(strip(pts, -0.03, 0.03, dash), yellow, 3);
    }
    return grp;
  }

  // a ring of soft hills and forest beyond the edge of the map
  function distantHills(w) {
    const parts = [], r = rnd(7);
    for (let i = 0; i < 90; i++) {
      // keep every hill fully outside the map: push it out by its own footprint
      const s = 8 + r() * 14, a = (i / 90) * Math.PI * 2, out = s * 0.85 + 6 + r() * 14;
      const ex = Math.cos(a), ez = Math.sin(a), k = Math.min(Math.abs((w.w / 2) / (ex || 1e-6)), Math.abs((w.h / 2) / (ez || 1e-6)));
      const x = w.w / 2 + ex * (k + out), z = w.h / 2 + ez * (k + out);
      parts.push(P('ico', HC.pick(['#4f8a3a', '#5c9a40', '#3f7a35']), [x, -1, z], [s * 1.6, s * 0.5, s * 1.6]));
      for (let k = 0; k < 4; k++) parts.push(P('cone', '#2f6040', [x + (r() - 0.5) * s, s * 0.22 + 0.6, z + (r() - 0.5) * s], [1.6, 3.4, 1.6]));
    }
    const m = new THREE.Mesh(build(parts), bodyMat);
    return m;
  }

  // sheds, pumps, signs, boulders and bridge rails don't change, so they're built once
  function buildStatic() {
    buildSheds();
    const parts = [];
    for (const pm of world.pumps) {
      const x = U(pm.x), z = U(pm.y), y = gh(pm.x, pm.y);
      parts.push(P('box', '#b9b4a8', [x, y + 0.08, z], [1.4, 0.16, 0.9]), P('box', '#d23a2a', [x, y + 0.65, z], [0.42, 1.1, 0.32]),
        P('box', '#f4f4f4', [x, y + 0.85, z + 0.17], [0.3, 0.32, 0.02]), P('box', '#222', [x + 0.24, y + 0.6, z], [0.06, 0.4, 0.06]),
        P('box', '#ffffff', [x, y + 1.25, z], [0.46, 0.08, 0.36]));
      for (const dx of [-0.6, 0.6]) parts.push(P('cyl', '#f2c94c', [x + dx, y + 0.4, z + 0.5], [0.12, 0.8, 0.12]));
    }
    if (world.pad) { // log deck at the back of the pad
      const p = world.pad, x0 = U(p.x), z0 = U(p.y), y = gh(p.x, p.y);
      for (let i = 0; i < 12; i++) parts.push(P('cyl', i % 2 ? '#7a5434' : '#6e4e33', [x0 + 0.8 + (i % 6) * 0.55, y + 0.3 + Math.floor(i / 6) * 0.48, z0 - 0.6], [0.5, 2.6, 0.5], [Math.PI / 2, 0, 0]));
      parts.push(P('box', '#7d7d7d', [x0 + U(p.w) - 1.2, y + 0.7, z0 + 1.6], [1.8, 1.4, 2.2]), P('box', '#5a5a5a', [x0 + U(p.w) - 1.2, y + 1.45, z0 + 1.6], [1.9, 0.1, 2.3]));
    }
    if (world.quarry) { // gravel stockpiles and a sign
      for (const pl of world.quarry.piles) { const y = gh(pl.x, pl.y); parts.push(P('cone', pl.c, [U(pl.x), y + pl.r * 0.42, U(pl.y)], [pl.r * 2, pl.r * 0.85, pl.r * 2]), P('cone', HC.shade(pl.c, 0.08), [U(pl.x) - pl.r * 0.15, y + pl.r * 0.6, U(pl.y) - pl.r * 0.1], [pl.r * 1.1, pl.r * 0.55, pl.r * 1.1])); }
      const pt = world.quarry.plant;
      const place = (geo, at, rot) => { const m = model(geo); m.position.set(U(at.x), gh(at.x, at.y), U(at.y)); m.rotation.y = rot; worldGroup.add(m); };
      place(cache('qCrusher', QUARRY_GEO.crusher), pt.crusher, 0.35);
      place(cache('qScreener', QUARRY_GEO.screener), pt.screener, -0.5);
      place(cache('qConveyor', QUARRY_GEO.conveyor), pt.conveyor, 2.6);
      place(cache('qLoader', QUARRY_GEO.loader), pt.loader, 0.9);
      place(cache('qAdt', QUARRY_GEO.adt), pt.adt, 2.2);
      const q = world.quarry, sx = U(q.x + q.w / 2) + 4.5, sz = U(q.y + q.h) + 0.6, sy = gh(q.x + q.w / 2, q.y + q.h);
      parts.push(P('box', '#5a3a26', [sx - 0.9, sy + 0.6, sz], [0.12, 1.2, 0.12]), P('box', '#5a3a26', [sx + 0.9, sy + 0.6, sz], [0.12, 1.2, 0.12]), P('box', '#6b6f75', [sx, sy + 1.1, sz], [2.2, 0.6, 0.08]));
    }
    if (world.fwStand) { // roadside firewood stand: posts, a sloped green roof, two shelves, a sign; ricks of split wood in the yard
      const st = world.fwStand, x = U(st.x), z = U(st.y), y = gh(st.x, st.y);
      for (const [dx, dz] of [[-1.3, -0.6], [1.3, -0.6], [-1.3, 0.6], [1.3, 0.6]]) parts.push(P('box', '#6b4a2b', [x + dx, y + 0.75, z + dz], [0.1, 1.5, 0.1]));
      parts.push(P('box', '#3e6b3a', [x, y + 1.62, z], [3.0, 0.08, 1.6], [0.12, 0, 0]), P('box', '#8a6440', [x, y + 0.45, z], [2.7, 0.06, 1.1]), P('box', '#8a6440', [x, y + 0.95, z - 0.2], [2.7, 0.06, 0.7]),
        P('box', '#f2ead8', [x, y + 1.95, z + 0.75], [1.8, 0.45, 0.06]), P('box', '#c42a24', [x, y + 1.95, z + 0.78], [1.6, 0.12, 0.01]),
        P('box', '#6b4a2b', [x - 0.85, y + 1.0, z + 0.85], [0.08, 2.0, 0.08]), P('box', '#6b4a2b', [x + 0.85, y + 1.0, z + 0.85], [0.08, 2.0, 0.08]));
      for (const rk of st.racks) { const rx = U(rk.x), rz = U(rk.y), ry = gh(rk.x, rk.y); for (let i = 0; i < 4; i++) parts.push(P('box', ['#b58a5a', '#9a7048'][i % 2], [rx, ry + 0.2 + i * 0.28, rz], [1.6, 0.26, 0.42])); parts.push(P('box', '#6b4a2b', [rx - 0.85, ry + 0.6, rz], [0.08, 1.2, 0.08]), P('box', '#6b4a2b', [rx + 0.85, ry + 0.6, rz], [0.08, 1.2, 0.08])); }
    }
    if (world.supply) { // landscape supply: concrete-block bins full of dyed mulch, a yard loader, a parked dump truck
      const sp = world.supply;
      for (const bn of sp.bins) {
        const bx = U(bn.x), bz = U(bn.y), by = gh(bn.x, bn.y);
        for (const [dx, dz, w, d] of [[0, -1.7, 4.6, 0.6], [-2.3, 0, 0.6, 3.4], [2.3, 0, 0.6, 3.4]]) for (let k = 0; k < 2; k++) {
          parts.push(P('box', k ? '#bdb9ae' : '#cbc7bc', [bx + dx, by + 0.3 + k * 0.6, bz + dz], [w, 0.58, d]));
        }
      }
      for (const pl of sp.piles) { const y = gh(pl.x, pl.y); parts.push(P('cone', pl.c, [U(pl.x), y + 0.9, U(pl.y)], [4.0, 1.9, 3.6]), P('sph', HC.shade(pl.c, 0.06), [U(pl.x) + 0.6, y + 0.35, U(pl.y) + 0.9], [2.6, 0.7, 1.8])); }
      const place2 = (geo, at, rot) => { const m = model(geo); m.position.set(U(at.x), gh(at.x, at.y), U(at.y)); m.rotation.y = rot; worldGroup.add(m); };
      place2(cache('supLoader', BIG_MODELS.compactLoader), sp.loader, 2.6);
      place2(cache('supDump', BIG_MODELS.dumptruck), sp.dumpTruck, 1.4);
      const sx = U(sp.x + sp.w / 2) + 3.2, sz = U(sp.y + sp.h) + 0.6, sy = gh(sp.x + sp.w / 2, sp.y + sp.h);
      parts.push(P('box', '#5a3a26', [sx - 0.9, sy + 0.6, sz], [0.12, 1.2, 0.12]), P('box', '#5a3a26', [sx + 0.9, sy + 0.6, sz], [0.12, 1.2, 0.12]), P('box', '#2f6b3a', [sx, sy + 1.1, sz], [2.2, 0.6, 0.08]));
    }
    for (const yd of world.yards) { // entrance sign
      const x = U(yd.x + yd.w / 2) + 3.2, z = U(yd.y + yd.h) + 0.6, y = gh(yd.x + yd.w / 2, yd.y + yd.h);
      parts.push(P('box', '#5a3a26', [x - 0.9, y + 0.6, z], [0.12, 1.2, 0.12]), P('box', '#5a3a26', [x + 0.9, y + 0.6, z], [0.12, 1.2, 0.12]),
        P('box', yd.id === 'hq' ? '#f07a22' : '#3e7a4a', [x, y + 1.1, z], [2.2, 0.6, 0.08]));
    }
    for (const b of world.boulders) {
      const m = model(boulderGeo(b.seed));
      m.position.set(U(b.x), gh(b.x, b.y) - 0.1, U(b.y));
      m.scale.setScalar(U(b.r) * 2.2);
      m.rotation.y = b.seed;
      worldGroup.add(m);
    }
    // guard rails where roads cross the creek
    for (const r of world.roads) {
      for (let k = 1; k < r.pts.length; k += 3) {
        const [x, y] = r.pts[k], i = Math.floor(y) * world.w + Math.floor(x);
        if (!(world.waterDist[i] < 2.4)) continue;
        const [px, py] = r.pts[k - 1], a = Math.atan2(y - py, x - px);
        for (const s of [-1, 1]) {
          const rx = x + Math.cos(a + Math.PI / 2) * 1.45 * s, rz = y + Math.sin(a + Math.PI / 2) * 1.45 * s;
          parts.push(P('box', '#e8e8e8', [rx, 0.42, rz], [0.08, 0.6, 0.08]), P('box', '#c9ccd1', [rx, 0.62, rz], [0.85, 0.12, 0.05], [0, -a, 0]));
        }
      }
    }
    if (parts.length) { const m = model(build(parts)); worldGroup.add(m); }
    const ridge = world.yards.find((y) => y.id === 'ridge');
    if (ridge) {
      saleSign = model(build([P('box', '#5a3a26', [-0.7, 0.7, 0], [0.1, 1.4, 0.1]), P('box', '#5a3a26', [0.7, 0.7, 0], [0.1, 1.4, 0.1]), P('box', '#ffffff', [0, 1.2, 0], [1.8, 0.7, 0.06]), P('box', '#d23a2a', [0, 1.42, 0.035], [1.6, 0.18, 0.01])]));
      saleSign.position.set(U(ridge.x + ridge.w / 2) - 3, gh(ridge.x, ridge.y + ridge.h), U(ridge.y + ridge.h) + 0.5);
      worldGroup.add(saleSign);
    }
  }

  function buildSheds() {
    for (const { m } of shedModels) m.parent && m.parent.remove(m);
    shedModels = [];
    for (const sh of world.sheds) {
      const m = model(shedGeo(sh));
      m.scale.y = 0.62;
      shedModels.push({ m, sh });
      m.position.set(U(sh.x + sh.w / 2), gh(sh.x + sh.w / 2, sh.y + sh.h / 2), U(sh.y + sh.h / 2));
      worldGroup.add(m);
    }
  }
  // after a yard upgrade: repaint the ground, redraw bay lines, rebuild fences and sheds
  function yardChanged() {
    const r = world.hqR;
    for (let y = r.gy - 1; y <= r.gy + r.ph; y++) for (let x = r.gx - 1; x <= r.gx + r.pw; x++) if (x >= 0 && y >= 0 && x < world.w && y < world.h) paintTile(x, y);
    paintDecals(); groundDirty = true; dirtyR = null; groundTex.needsUpdate = true; // a whole-yard change: send it all
    buildFences(); buildSheds();
  }
  function setTile(tx, ty) {
    if (!world) return;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const x = tx + dx, y = ty + dy;
      if (x >= 0 && y >= 0 && x < world.w && y < world.h) paintTile(x, y);
    }
    groundDirty = true; grassVer++; markDirty(tx - 1, ty - 1, tx + 1, ty + 1);
  }
  function restamp(p) {
    for (let y = p.gy - 10; y <= p.gy + p.ph + 10; y++) for (let x = p.gx - 1; x <= p.gx + p.pw; x++) if (x >= 0 && y >= 0 && x < world.w && y < world.h) paintTile(x, y);
    groundDirty = true; grassVer++; markDirty(p.gx - 1, p.gy - 10, p.gx + p.pw, p.gy + p.ph + 10);
    for (const h of meshes.houses.values()) scene.remove(h);
    meshes.houses.clear();
    buildFences();
  }

  function buildFences() {
    if (fenceMesh) scene.remove(fenceMesh);
    const parts = [];
    for (const f of world.fences) {
      const cx = U(f.x + f.w / 2), cz = U(f.y + f.h / 2), y = gh(f.x + f.w / 2, f.y + f.h / 2);
      if (f.broken) { parts.push(P('box', '#a98458', [cx, y + 0.05, cz], f.v ? [0.08, 0.06, 0.9] : [0.9, 0.06, 0.08], [0, 0.5, 0])); continue; }
      const sx = f.v ? 0.06 : 1, sz = f.v ? 1 : 0.06;
      if (f.yard) { // chain-link
        parts.push(P('box', '#a9b0b6', [cx, y + 0.3, cz], [f.v ? 0.01 : 1, 0.6, f.v ? 1 : 0.01]), P('box', '#8a9198', [cx, y + 0.6, cz], [sx, 0.025, sz]));
        for (const e of [0, 1]) parts.push(P('cyl6', '#8a9198', [f.v ? cx : U(f.x + f.w * e), y + 0.31, f.v ? U(f.y + f.h * e) : cz], [0.03, 0.63, 0.03]));
        continue;
      }
      parts.push(P('box', '#b58e62', [cx, y + 0.15, cz], [sx, 0.04, f.v ? 1 : 0.02]), P('box', '#b58e62', [cx, y + 0.32, cz], [sx, 0.04, f.v ? 1 : 0.02]));
      for (const e of [0, 1]) parts.push(P('box', '#7c5f40', [f.v ? cx : U(f.x + f.w * e), y + 0.2, f.v ? U(f.y + f.h * e) : cz], [0.05, 0.4, 0.05]));
    }
    if (!parts.length) return;
    fenceMesh = new THREE.Mesh(build(parts), bodyMat);
    fenceMesh.castShadow = true; fenceMesh.receiveShadow = true;
    scene.add(fenceMesh);
  }
  function buildPoles() {
    if (poleMesh) scene.remove(poleMesh);
    const parts = [];
    for (const p of world.poles) {
      const y = gh(p.x, p.y);
      parts.push(P('cyl6', '#5e4430', [U(p.x), y + 1.7, U(p.y)], [0.22, 3.4, 0.22]), P('box', '#4a3626', [U(p.x), y + 3.2, U(p.y)], [0.1, 0.1, 1.1]));
      for (const z of [-0.45, 0, 0.45]) parts.push(P('cyl6', '#7fa7b8', [U(p.x), y + 3.3, U(p.y) + z], [0.06, 0.12, 0.06]));
    }
    poleMesh = new THREE.Mesh(build(parts), bodyMat);
    poleMesh.castShadow = true;
    scene.add(poleMesh);
    buildWires();
  }
  function buildWires() {
    if (wireLines) scene.remove(wireLines);
    const v = [], c = [];
    for (const w of world.wires) {
      const y1 = gh(w.x1, w.y1), y2 = gh(w.x2, w.y2);
      for (const off of [-0.45, 0, 0.45]) {
        const sag = w.down ? 3.0 : 0.35;
        for (let i = 0; i < 10; i++) for (const k of [i, i + 1]) {
          const t = k / 10, x = HC.lerp(U(w.x1), U(w.x2), t), z = HC.lerp(U(w.y1), U(w.y2), t) + off;
          v.push(x, Math.max(0.05, HC.lerp(y1, y2, t) + 3.35 - sag * 4 * t * (1 - t)), z);
          c.push(...(w.down ? [0.85, 0.2, 0.2] : [0.12, 0.13, 0.15]));
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
    wireLines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true }));
    scene.add(wireLines);
  }

  // ---------- per-frame object sync ----------
  function syncList(list, map, make, update) {
    for (const o of list) {
      let m = map.get(o.id);
      if (!m) { m = make(o); map.set(o.id, m); scene.add(m); }
      m.userData.seen = frameNo;
      update(o, m);
    }
    for (const [id, m] of map) if (m.userData.seen !== frameNo) { scene.remove(m); map.delete(id); }
  }
  const inView = (x, z, r = 0) => Math.abs(x - cam.tx) < 46 + r && z - cam.tz < 36 + r && cam.tz - z < 56 + r;

  function syncTrees(S) {
    const qa = new THREE.Quaternion(), axis = new THREE.Vector3();
    const au = S.units[S.active];
    const bx = Math.cos(cam.yaw), bz = Math.sin(cam.yaw);
    syncList(world.trees, meshes.trees, (t) => {
      const g = new THREE.Group();
      const m = model(treeGeo(t));
      g.add(m); g.userData.m = m;
      const rb = model(ribbonGeo(), false, false);
      rb.scale.setScalar(Math.max(0.35, (t.trunkR / TS) * 2.2));
      g.add(rb); g.userData.ribbon = rb;
      m.rotation.y = t.seed;
      g.scale.setScalar(t.s);
      g.userData.base = gh(t.x, t.y);
      return g;
    }, (t, g) => {
      g.visible = t.state !== 'gone' && inView(U(t.x), U(t.y), 8);
      if (!g.visible) return;
      g.position.set(U(t.x), g.userData.base, U(t.y));
      g.userData.ribbon.visible = !!t.marked && t.state === 'standing';
      let fade = false;
      if (au && !au.hidden && t.state === 'standing' && !S.preview) {
        const dx = U(t.x - au.x), dz = U(t.y - au.y);
        const along = -(dx * bx + dz * bz), side = Math.abs(dx * bz - dz * bx);
        fade = along > -1.2 && along < 9 && side < U(t.crownR) * t.s + 0.9;
      }
      if (g.userData.fade !== fade) {
        g.userData.fade = fade;
        g.userData.m.userData.body.material = fade ? fadeMat : bodyMat;
        g.userData.m.children[1].visible = !fade;
      }
      if (t.state === 'standing') {
        const w = (S.weather.wind || 0) * 0.002 + 0.006, now = performance.now();
        g.rotation.set(Math.sin(now / 900 + t.seed) * w, 0, Math.cos(now / 1100 + t.seed) * w);
      } else {
        let e = t.state === 'falling' ? t.fallT * t.fallT : 1;
        if (t.state === 'felled' && t.landT !== undefined && t.landT < 0.6) e = 1 - Math.sin((t.landT / 0.6) * Math.PI) * 0.045 * (1 - t.landT / 0.6);
        axis.set(Math.sin(t.fallA), 0, -Math.cos(t.fallA));
        qa.setFromAxisAngle(axis, e * Math.PI / 2 * 0.97);
        g.quaternion.copy(qa);
        g.position.y += (t.trunkR / TS) * 0.6 * e;
      }
    });
  }
  const grabV = new THREE.Vector3();
  function syncSmall(S) {
    const all = world.items.concat(world.remoteItems || []), carried = new Set();
    for (const k in S.units) for (const c of S.units[k].carrying) { all.push(c); carried.add(c); }
    syncList(all, meshes.items, (it) => model(it.kind === 'log' ? logGeo(it) : it.kind === 'rock' ? rockGeo() : it.kind === 'stump' ? cache('stumpItem', BIG_MODELS.stumpItem) : it.kind === 'pile' ? (it.mulch ? cache('mulchHeap', BIG_MODELS.mulchHeap) : it.chips ? cache('chipHeap', BIG_MODELS.chipHeap) : it.firewood ? cache('woodHeap', BIG_MODELS.woodHeap) : cache('pileHeap', BIG_MODELS.pileHeap)) : brushGeo(it.seed || it.id)), (it, m) => {
      m.visible = inView(U(it.x), U(it.y));
      if (!m.visible) return;
      let ud = null, arms = null;
      const uk = carried.has(it) ? Object.keys(S.units).find((q) => S.units[q].carrying.includes(it)) : null, u = uk && S.units[uk];
      ud = uk && unitObjs[uk] && unitObjs[uk].userData;
      arms = ud && (ud.arms || ud.loaderArm || ud.exArm);
      if (arms) { // held in the grapple's jaws or heaped in the bucket, wherever the arms are (and at the right size for the mini)
        const i = u.carrying.indexOf(it), g = arms.userData.grabAt;
        arms.updateWorldMatrix(true, false);
        if (g) grabV.set((g[0] + (Math.floor(i / 3) % 2) * 0.25) * MM, (g[1] + Math.floor(i / 3) * 0.16) * MM, ((i % 3) - 1) * g[2] * MM);
        else grabV.set((PLATE[0] + 0.5) * MM, (PLATE[1] - 0.1 + i * 0.22) * MM, ((i % 3) - 1) * 0.25 * MM);
        arms.localToWorld(grabV);
        m.position.copy(grabV);
      } else m.position.set(U(it.x), gh(it.x, it.y) + (u ? 0.3 + (u.armT || 0) * 0.55 : it.z || 0), U(it.y));
      m.rotation.y = -(it.a || 0);
      // going through a chipper: shrink away as it is fed in (logs shorten end-first into the infeed)
      const f = it.hp ? Math.max(0.08, 1 - it.hp) : 1;
      if (it.kind === 'log' && it.hp) m.scale.set(it.size * f, it.size * (0.7 + 0.3 * f), it.size * (0.7 + 0.3 * f));
      else m.scale.setScalar(it.kind === 'brush' ? it.size * f : it.size);
      if (arms && arms.userData.grabAt) m.scale.multiplyScalar(arms.userData.grabAt[3] || 0.62); // heaped in a bucket: pieces packed down
    });
    syncList(world.stumps, meshes.stumps, (s) => model(stumpGeo(s.type), true, false), (s, m) => {
      m.visible = inView(U(s.x), U(s.y));
      m.position.set(U(s.x), gh(s.x, s.y) - s.hp * 0.22, U(s.y));
      const r = (s.r / TS) * 2;
      m.scale.set(r, 1, r);
    });
    syncList(world.bushes, meshes.bushes, (b) => model(bushGeo(b.seed)), (b, m) => {
      m.visible = inView(U(b.x), U(b.y));
      m.position.set(U(b.x), gh(b.x, b.y), U(b.y));
      m.scale.setScalar((b.r / 14) * (1 - (b.hp || 0) * 0.6));
    });
    syncList(world.plants, meshes.plants, (p) => model(plantGeo(p.color)), (p, m) => { m.position.set(U(p.x), gh(p.x, p.y), U(p.y)); m.visible = inView(U(p.x), U(p.y)); });
    syncList(world.houses.map((h) => Object.assign(h, { id: h.id || (h.id = 'h' + HC.uid()) })), meshes.houses, (h) => {
      const m = model(houseGeo(h)); m.userData.dmg = h.damaged.length;
      if (h.facing === -1) m.rotation.y = Math.PI;
      return m;
    }, (h, m) => {
      if (m.userData.dmg !== h.damaged.length) { meshes.houses.delete(h.id); scene.remove(m); return; }
      m.position.set(U(h.x + h.w / 2), gh(h.x + h.w / 2, h.y + h.h / 2), U(h.y + h.h / 2));
    });
    if (saleSign) { const r = world.yards.find((y) => y.id === 'ridge'); saleSign.visible = !r.owned; }
    // see through a shed roof when what you're controlling is under it
    const au = S.units[S.active];
    for (const { m, sh } of shedModels) {
      const under = !!au && !au.hidden && !S.preview && HC.inRect(au.x, au.y, { x: sh.x - 40, y: sh.y - 40, w: sh.w + 80, h: sh.h + 120 });
      if (m.userData.fade !== under) { m.userData.fade = under; m.userData.body.material = under ? fadeMat : bodyMat; m.children[1].visible = !under; }
    }
  }

  const o_driver = (o) => o && o.userData.driver;
  // position of a machine relative to a trailer: along its length (px, + toward the coupler) and sideways
  function rampLocal(t, p) {
    const dx = p.x - t.x, dy = p.y - t.y, c = Math.cos(t.a), s = Math.sin(t.a);
    return { along: dx * c + dy * s, side: Math.abs(-dx * s + dy * c) };
  }
  const rampRear = (t) => RAMP[t.kind].x * 32 / 3; // px from the axle to the ramp hinge
  let sawObj = null;
  const attObjs = {};
  const attGeo = (kind) => cache('att_' + kind, () => kind === 'bushhog' ? BIG_MODELS.bushhog() : skidArms(kind));
  function syncAttachments(S) {
    for (const a of S.attachments || []) {
      let o = attObjs[a.id];
      if (!o) {
        o = attObjs[a.id] = model(attGeo(a.kind)); scene.add(o);
        if (a.kind === 'mulcher') { const d = model(cache('skidDrum', () => drumGeo(0.25, 1.98, '#e8a21a', '#2b2b2b', 6, 9))); d.position.set((2.8 - PLATE[0]) * MM, (-1.58 - PLATE[1]) * MM, 0); o.add(d); o.userData.drum = d; }
      }
      if (o.userData.drum) { const hu = a.on && S.units[a.on]; if (hu && hu.working) o.userData.drum.rotation.z -= 0.55; }
      const host = a.on && !a.on.startsWith('trailer:') && unitObjs[a.on];
      if (host && host.userData.arms) {
        if (o.parent !== host.userData.arms) host.userData.arms.add(o);
        o.position.set(PLATE[0] * MM, PLATE[1] * MM, 0); o.rotation.set(0, 0, 0);
        o.visible = !S.units[a.on].hidden;
      } else {
        if (o.parent !== scene) scene.add(o);
        const deck = a.on && a.on.startsWith('trailer:') ? S.trailers.find((t) => t.id === a.on.slice(8)) : null;
        const lift = a.kind === 'bushhog' ? (host ? (S.units[a.on].armT || 0) * 0.5 * MM : 0) : 0.3 * MM;
        o.position.set(U(a.x), gh(a.x, a.y) + (deck ? (DECK_H[deck.kind] || 0.6) * MM : 0) + lift, U(a.y));
        o.rotation.set(0, -a.a, a.kind === 'bushhog' && host ? (S.units[a.on].armT || 0) * 0.12 : 0);
        if (a.kind === 'bushhog' && host && S.units[a.on].working) o.position.y += HC.rand(-0.004, 0.004);
        o.visible = true;
      }
    }
  }
  // the bundles on the firewood stand's shelves: one for every five units in stock
  let standGrp = null;
  function syncStand() {
    const st = world.fwStand; if (!st) return;
    const n = Math.min(12, Math.ceil(((HC.company.stand || {}).stock || 0) / 5));
    if (!standGrp) {
      standGrp = new THREE.Group(); scene.add(standGrp);
      const geo = cache('fwBundle', () => build([...[0, 1, 2].flatMap((r) => [-1, 0, 1].map((c) => Pm('box', ['#b58a5a', '#c9a26a', '#9a7048'][(r + c + 3) % 3], [0, 0.07 + r * 0.12, c * 0.12], [0.36, 0.11, 0.11]))), Pm('box', '#e8e4da', [0, 0.2, 0], [0.38, 0.03, 0.38])]));
      for (let i = 0; i < 12; i++) { const m = model(geo); const row = i < 6 ? 0 : 1; m.position.set(U(st.x) + (-1.1 + (i % 6) * 0.44) * MM * 3 / 3, gh(st.x, st.y) + (row ? 0.98 : 0.48) * MM, U(st.y) + (row ? -0.2 : 0) * MM); standGrp.add(m); }
    }
    standGrp.children.forEach((m, i) => { m.visible = i < n; });
  }
  function syncSaw(S) {
    if (!S.saw) { if (sawObj) sawObj.visible = false; return; }
    const sk = (HC.company && HC.company.sawKind) || 's60';
    if (sawObj && sawObj.userData.kind !== sk) { scene.remove(sawObj); sawObj = null; }
    if (!sawObj) { sawObj = model(sawItemGeo(sk)); sawObj.userData.kind = sk; scene.add(sawObj); }
    const h = S.saw.holder && S.units[S.saw.holder];
    sawObj.visible = !(h && h.hidden);
    const ho = h && unitObjs[S.saw.holder], rig = ho && ho.userData.rig;
    if (h && rig) { // in the right hand: carried by the side walking, both hands and the bar out front cutting
      rig.handR.updateWorldMatrix(true, false);
      const p = new THREE.Vector3(); rig.handR.getWorldPosition(p);
      sawObj.position.copy(p);
      sawObj.rotation.set(0, -h.a, h.working ? -0.28 : -0.75);
      sawObj.translateX((h.working ? 0.12 : 0.18) * MM); sawObj.translateY(-0.06 * MM);
      if (h.working) { sawObj.position.x += HC.rand(-0.004, 0.004); sawObj.position.y += HC.rand(-0.004, 0.004); }
    } else if (h) { // in the right hand, bar forward
      const hx = h.x + Math.cos(h.a) * 11 + Math.cos(h.a + 1.57) * 6, hy = h.y + Math.sin(h.a) * 11 + Math.sin(h.a + 1.57) * 6;
      sawObj.position.set(U(hx), gh(hx, hy) + 1.2 * MM + (h.working ? HC.rand(-0.004, 0.004) : 0), U(hy));
      sawObj.rotation.set(0, -h.a, h.working ? -0.35 : -0.15);
    } else {
      sawObj.position.set(U(S.saw.x), gh(S.saw.x, S.saw.y) + 0.12 * MM, U(S.saw.y));
      sawObj.rotation.set(0, -(S.saw.a || 0), 0);
    }
  }
  const jackAt = (len) => { const j = model(cache('jack', TRAILER_GEO.jack), false); j.position.x = U(len) - 0.5 * MM; return j; };
  // one machine as a 3D object (also used for shop thumbnails)
  // ---------- detailed 3D models (GLB from image-to-3D), embedded as base64 in models/*.js ----------
  // Each is stretched to the machine's real size in metres (length along +X, width, height) and turned so the
  // front faces +X. Until a model finishes decoding, the hand-built one stands in and is swapped out after.
  const GLB_SPEC = {
  };
  const glbReady = {}, glbWait = {};
  function glbDecode() {
    const src = window.HC_MODELS || {};
    if (!THREE.GLTFLoader) return;
    for (const k in src) {
      if (!GLB_SPEC[k] || glbReady[k] !== undefined) continue;
      glbReady[k] = null;
      try {
        const bin = atob(src[k]), buf = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
        new THREE.GLTFLoader().parse(buf.buffer, '', (gltf) => {
          glbReady[k] = buildGlb(k, gltf);
          for (const h of glbWait[k] || []) { h.clear(); h.add(glbReady[k].clone()); }
          glbWait[k] = [];
          thumbs['u:' + k] = undefined;
        }, (e) => { console.warn('model ' + k + ' failed to load', e); });
      } catch (e) { console.warn('model ' + k + ' failed to decode', e); }
    }
  }
  // Bake the model into one geometry at real size: long axis on X, cab (highest part) toward +X, wheels on the
  // ground. Vehicles then have their wheels cut out into separate pieces so they can roll and steer.
  function buildGlb(k, gltf) {
    const spec = GLB_SPEC[k], root = gltf.scene;
    root.updateMatrixWorld(true);
    const parts = [];
    root.traverse((o) => { if (o.isMesh) parts.push(o); });
    const mesh = parts[0];
    let g = mesh.geometry.clone(); g.applyMatrix4(mesh.matrixWorld);
    if (g.index) g = g.toNonIndexed();
    g.computeBoundingBox();
    let bb = g.boundingBox, sz = bb.getSize(new THREE.Vector3());
    if (sz.z > sz.x) g.rotateY(Math.PI / 2);
    g.computeBoundingBox(); bb = g.boundingBox; sz = bb.getSize(new THREE.Vector3());
    const c = bb.getCenter(new THREE.Vector3());
    g.translate(-c.x, -bb.min.y, -c.z);
    g.scale(spec.size[0] / sz.x, spec.size[2] / sz.y, spec.size[1] / sz.z); // metres for now
    const P = g.attributes.position, n = P.count;
    if (spec.frontHigh !== false) { // the cab roof sits ahead of the middle on a pickup
      const ys = []; for (let i = 0; i < n; i++) ys.push(P.getY(i));
      ys.sort((a, b) => a - b); const cut = ys[Math.floor(n * 0.97)];
      let sx = 0, cnt = 0; for (let i = 0; i < n; i++) if (P.getY(i) >= cut) { sx += P.getX(i); cnt++; }
      if (sx / cnt < 0) g.rotateY(Math.PI);
    }
    if (spec.yaw) g.rotateY(spec.yaw);
    g.computeVertexNormals();
    const mat = mesh.material;
    if (mat) { if (mat.map) mat.map.encoding = THREE.sRGBEncoding; mat.roughness = 0.5; mat.metalness = 0.08; mat.envMapIntensity = 0.9; mat.needsUpdate = true; }
    const out = new THREE.Group();
    const meshOf = (geo) => { geo.scale(MM, MM, MM); const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.receiveShadow = true; return m; };
    if (!spec.wheels) { out.add(meshOf(g)); return out; }
    // find the axles from the low vertices outboard of the frame
    const W = spec.wheels, low = { f: [], r: [] };
    for (let i = 0; i < n; i++) { const x = P.getX(i), y = P.getY(i), z = P.getZ(i); if (y < W.probeY && Math.abs(z) > W.zIn) (x > 0 ? low.f : low.r).push(x); }
    const axle = (xs, guess) => { if (xs.length < 20) return { x: guess, r: W.r }; xs.sort((a, b) => a - b); const lo = xs[Math.floor(xs.length * 0.02)], hi = xs[Math.floor(xs.length * 0.98)]; return { x: (lo + hi) / 2, r: HC.clamp((hi - lo) / 2, W.r * 0.8, W.r * 1.2) }; };
    const fa = axle(low.f, W.front), ra = axle(low.r, W.rear);
    // sort triangles into body and four wheel sets
    const pick = { body: [], FL: [], FR: [], RL: [], RR: [] }, uv = g.attributes.uv, N = g.attributes.normal;
    for (let t = 0; t < n; t += 3) {
      let cx = 0, cy = 0, cz = 0;
      for (let v = 0; v < 3; v++) { cx += P.getX(t + v); cy += P.getY(t + v); cz += P.getZ(t + v); }
      cx /= 3; cy /= 3; cz /= 3;
      let key = 'body';
      for (const [ax, F] of [[fa, 'F'], [ra, 'R']]) {
        if (Math.abs(cz) > W.zIn && cy < ax.r * 2 * 0.97 && Math.hypot(cx - ax.x, cy - ax.r) < ax.r * 1.04) key = F + (cz > 0 ? 'L' : 'R');
      }
      pick[key].push(t);
    }
    const subGeo = (tris, ox, oy, oz) => {
      const pos = new Float32Array(tris.length * 9), nor = new Float32Array(tris.length * 9), tc = uv ? new Float32Array(tris.length * 6) : null;
      tris.forEach((t, j) => { for (let v = 0; v < 3; v++) {
        const q = t + v, o = (j * 3 + v);
        pos[o * 3] = P.getX(q) - ox; pos[o * 3 + 1] = P.getY(q) - oy; pos[o * 3 + 2] = P.getZ(q) - oz;
        nor[o * 3] = N.getX(q); nor[o * 3 + 1] = N.getY(q); nor[o * 3 + 2] = N.getZ(q);
        if (tc) { tc[o * 2] = uv.getX(q); tc[o * 2 + 1] = uv.getY(q); }
      } });
      const sg = new THREE.BufferGeometry();
      sg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); sg.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
      if (tc) sg.setAttribute('uv', new THREE.BufferAttribute(tc, 2));
      return sg;
    };
    out.add(meshOf(subGeo(pick.body, 0, 0, 0)));
    for (const name of ['FL', 'FR', 'RL', 'RR']) {
      if (!pick[name].length) continue;
      const ax = name[0] === 'F' ? fa : ra;
      // pivot on the hub: steering group (front only turns) > rolling group > tyre mesh
      let zs = 0; for (const t of pick[name]) zs += P.getZ(t); const hz = zs / pick[name].length;
      const steer = new THREE.Group(); steer.name = 'steer' + name; steer.position.set(ax.x * MM, ax.r * MM, hz * MM);
      const roll = new THREE.Group(); roll.name = 'roll' + name; steer.add(roll);
      roll.add(meshOf(subGeo(pick[name], ax.x, ax.r, hz)));
      out.add(steer);
    }
    out.userData.wheelR = (fa.r + ra.r) / 2;
    return out;
  }
  function glbObj(k, fallback) {
    const h = new THREE.Group();
    if (glbReady[k]) h.add(glbReady[k].clone());
    else { h.add(fallback()); (glbWait[k] = glbWait[k] || []).push(h); }
    return h;
  }

  // dump boxes: parts tagged .box ride a group hinged at the back of the box, so the box can tip up
  const BX = (list) => list.map((q) => Object.assign(q, { box: true }));
  const DUMPBOX = { dumptruck: { hinge: [-3.86, 1.38], parts: () => BIG_MODELS.dumptruckParts() }, dumptruck2: { hinge: [-4.72, 1.48], parts: () => BIG_MODELS.dumptruck2Parts() }, dumptruck3: { hinge: [-5.92, 1.5], parts: () => BIG_MODELS.dumptruck3Parts() },
    dump: { hinge: [-2.22, 0.74], parts: () => TRAILER_GEO.dumpParts() }, gndump: { hinge: [-1.68, 0.95], parts: () => TRAILER_GEO.gndumpParts() }, chiptruck: { hinge: [-3.86, 1.2], parts: () => BIG_MODELS.chiptruckParts() }, chiptruck2: { hinge: [-5.11, 1.2], parts: () => BIG_MODELS.chiptruck2Parts() } };
  function dumpRig(key, grp) {
    const D = DUMPBOX[key];
    let parts = null; const P = () => parts || (parts = D.parts());
    grp.add(model(cache(key + 'Chassis', () => build(P().filter((q) => !q.box)))));
    const pivot = new THREE.Group(); pivot.position.set(D.hinge[0] * MM, D.hinge[1] * MM, 0);
    const bm = model(cache(key + 'Box', () => build(P().filter((q) => q.box)))); bm.position.set(-D.hinge[0] * MM, -D.hinge[1] * MM, 0);
    pivot.add(bm); grp.add(pivot);
    grp.userData.dumpBox = pivot; grp.userData.hinge = D.hinge;
  }
  // cargo models live in the box so they tip with it
  function addCargo(o, cm) {
    if (o.userData.dumpBox) { cm.position.set(-o.userData.hinge[0] * MM, -o.userData.hinge[1] * MM, 0); o.userData.dumpBox.add(cm); } else o.add(cm);
    o.userData.cargo = cm;
  }
  function dropCargo(o) { if (o.userData.cargo && o.userData.cargo.parent) o.userData.cargo.parent.remove(o.userData.cargo); o.userData.cargo = null; }
  // X was pressed: raise the box, let the old load slide out the back, then lower it again
  const ease = (x) => 0.5 - Math.cos(Math.PI * HC.clamp(x, 0, 1)) / 2;
  function animateTip(o, t) {
    if (!o.userData.dumpBox) return;
    if (t && t.tipT) {
      t.tipT = 0; o.userData.tipStart = performance.now();
      if (o.userData.spill && o.userData.spill.parent) o.userData.spill.parent.remove(o.userData.spill);
      o.userData.spill = o.userData.cargo; o.userData.cargo = null;
      if (o.userData.spill) o.userData.spill.userData.x0 = o.userData.spill.position.x;
    }
    const st = o.userData.tipStart;
    if (!st) return;
    const e = (performance.now() - st) / 1000, up = 0.85;
    o.userData.dumpBox.rotation.z = e < 1.1 ? up * ease(e / 1.1) : e < 1.8 ? up : e < 2.9 ? up * (1 - ease((e - 1.8) / 1.1)) : 0;
    const sp = o.userData.spill;
    if (sp) {
      const f = HC.clamp((e - 0.45) / 0.8, 0, 1);
      sp.position.x = sp.userData.x0 - f * f * 3.2 * MM; sp.position.y = -o.userData.hinge[1] * MM - f * f * 0.4 * MM;
      if (f >= 1) { sp.parent && sp.parent.remove(sp); o.userData.spill = null; }
    }
    if (e >= 2.9) { o.userData.tipStart = 0; o.userData.dumpBox.rotation.z = 0; }
  }
  const ARTIC = { skidder: { pivot: 0.2, parts: 'skidderParts' }, harvester: { pivot: 0.05, parts: 'harvesterBase' }, forwarder: { pivot: 1.85, parts: 'forwarder' }, loader: { pivot: 0.05, parts: 'loaderParts' } };
  function makeUnitObj(kk) {
    const k = HC.baseOf(kk);
    const grp = new THREE.Group();
    const pv = (a) => a.map((v) => v * MM);
    if (ARTIC[k]) { // centre-articulated: front and rear frames each swing half the bend about the hinge
      const A = ARTIC[k], px = A.pivot * MM;
      const isRear = (q) => (q.wh ? q.wh.c[0] : q.pos[0]) < px;
      const parts = BIG_MODELS[A.parts]();
      const front = new THREE.Group(), rear = new THREE.Group(); front.position.x = rear.position.x = px;
      const fm = model(cache(k + 'Front', () => build(parts.filter((q) => !isRear(q))))); fm.position.x = -px; front.add(fm);
      const rm = model(cache(k + 'Rear', () => build(parts.filter(isRear)))); rm.position.x = -px; rear.add(rm);
      grp.add(front, rear); grp.userData.artic = { front, rear, px };
      if (k === 'loader') {
        const arms = new THREE.Group(); arms.position.set(1.0 * MM - px, 2.45 * MM, 0);
        arms.add(model(cache('loaderArms', BIG_MODELS.loaderArms))); front.add(arms); grp.userData.loaderArm = arms; arms.userData.grabAt = [2.85, -1.25, 0.85];
      }
      if (k === 'harvester') {
        const boom = new THREE.Group(); boom.position.set(2.75 * MM - px, 2.2 * MM, -0.55 * MM);
        boom.add(model(cache('harvBoom', BIG_MODELS.harvesterBoom))); front.add(boom); grp.userData.hBoom = boom;
      }
    } else if (k === 'miniex') { // a 3.5 t machine: the excavator at ~55% size plus a backfill blade
      const inner = new THREE.Group(); inner.scale.set(0.7, 0.86, 0.68); // a real 3.5 t mini: ~5 m long, 1.85 m wide, 2.5 m to the cab roof
      inner.add(model(cache('excLower', () => BIG_MODELS.excavatorBase('lower'))));
      const house = new THREE.Group(); house.add(model(cache('excUpper', () => BIG_MODELS.excavatorBase('upper')))); inner.add(house); // swings on the ring
      const arm = new THREE.Group(); arm.position.set(...pv(PIV.exArm)); arm.add(model(cache('excArm', BIG_MODELS.excavatorArm))); house.add(arm); arm.userData.grabAt = [3.42, -1.35, 0.28, 0.9];
      grp.add(inner); grp.userData.exArm = arm; grp.userData.house = house;
      grp.add(model(cache('miniBlade2', () => build([Pm('box', COL.cat, [1.45, 0.3, 0], [0.18, 0.45, 1.85]), Pm('box', COL.frame, [1.15, 0.3, 0], [0.55, 0.1, 0.55]), Pm('cyl', COL.chrome, [1.2, 0.48, 0], [0.08, 0.5, 0.08], [0, 0, 1.2])]))));
    } else if (k === 'excavator') {
      grp.add(model(cache('excLower', () => BIG_MODELS.excavatorBase('lower'))));
      const house = new THREE.Group(); house.add(model(cache('excUpper', () => BIG_MODELS.excavatorBase('upper')))); grp.add(house); // the upper works swing on the ring
      const arm = new THREE.Group(); arm.position.set(...pv(PIV.exArm));
      arm.add(model(cache('excArm', BIG_MODELS.excavatorArm))); house.add(arm); grp.userData.exArm = arm; grp.userData.house = house; arm.userData.grabAt = [3.42, -1.35, 0.28, 0.9]; // held between bucket and thumb
    } else if (k === 'bucket') {
      grp.add(model(cache('bucketBase', BIG_MODELS.bucketBase)));
      const boom = new THREE.Group(); boom.position.set(...pv(PIV.boom));
      boom.add(model(cache('bucketBoom', BIG_MODELS.bucketBoom))); grp.add(boom);
      grp.userData.boom = boom; grp.userData.boomA = 0;
    } else if (kk === 'miniskid' || HC.EQUIP[kk].base === 'miniskid') { // stand-on mini track loader: the skid's arms and grapple at about 2/3 size
      const inner = new THREE.Group(); inner.scale.setScalar(0.64);
      inner.add(model(cache('miniskidBase', BIG_MODELS.miniskidBase)));
      const arms = new THREE.Group(); arms.position.set(...pv(PIV.skidArm));
      arms.add(model(cache('armsMini', () => skidArms('bare', '#f1f1ec')))); inner.add(arms);
      grp.add(inner); grp.userData.arms = arms;
      const op = model(cache('standOp', () => build(personM('#d9f23a', '#ffffff', { arms: 'forward' })))); op.position.set(-1.05 * MM, 0.3 * MM, 0);
      grp.add(op); grp.userData.driver = op; grp.userData.noSeat = true;
    } else if (k === 'skid') {
      grp.add(model(cache('skidBase', skidBase)));
      const arms = new THREE.Group(); arms.position.set(...pv(PIV.skidArm));
      arms.add(model(cache('armsBare', () => skidArms('bare')))); grp.add(arms);
      grp.userData.arms = arms;
    } else if (DUMPBOX[k]) {
      dumpRig(k, grp);
    } else if (k === 'fmulcher') {
      grp.add(model(cache('big_fmulcher', BIG_MODELS.fmulcher)));
      const d = model(cache('fmDrum', () => drumGeo(0.35, 2.35, '#2a2b2d', '#d8dadc', 5, 12))); d.position.set(2.85 * MM, 0.45 * MM, 0);
      grp.add(d); grp.userData.drum = d;
    } else if (k === 'trackloader') {
      const inner = new THREE.Group(); inner.scale.setScalar(1.3); grp.add(inner); // a big 27 t machine, all of it scaled up
      inner.add(model(cache('trackLoader', BIG_MODELS.trackLoader)));
      const arms = new THREE.Group(); arms.position.set(0.72 * MM, 1.9 * MM, 0);
      arms.add(model(cache('trackLoaderArms', BIG_MODELS.trackLoaderArms))); inner.add(arms); grp.userData.loaderArm = arms; arms.userData.grabAt = [2.6, -1.45, 0.8];
    } else if (k === 'tractor') {
      grp.add(model(cache('unit_tractor', BIG_MODELS.tractor)));
      const arms = new THREE.Group(); arms.position.set(0.25 * MM, 1.85 * MM, 0);
      arms.add(model(cache('tractorFEL', BIG_MODELS.tractorFEL))); grp.add(arms); grp.userData.loaderArm = arms; arms.userData.grabAt = [3.0, -1.4, 0.6];
    } else if (k === 'op' || k === 'land') { // people on foot: jointed so they walk and work properly
      const vest = kk !== k && k === 'op' ? HC.EQUIP[kk].vest || '#2f7fd6' : k === 'land' ? '#3e9c4f' : '#f07a22';
      const rig = personRig(vest, k === 'land' || kk !== k ? '#ffffff' : '#f4c020');
      grp.add(rig); grp.userData.rig = rig.userData.rig;
      if (k === 'land') rig.userData.rig.arms[1].add(model(cache('landTool', () => build([Pm('cyl', '#9a7550', [0.12, -0.55, 0], [0.05, 1.2, 0.05], [0, 0, -0.35]), Pm('box', '#9aa0a6', [0.36, -1.12, 0], [0.22, 0.3, 0.03])]))));
    } else if (k === 'dually') {
      grp.add(duallyObj()); grp.userData.hasWheels = true;
    } else if (GLB_SPEC[k] && (window.HC_MODELS || {})[k] && THREE.GLTFLoader) {
      grp.add(glbObj(k, () => model(cache('unit_' + k, UNIT_MODELS[k]))));
    } else {
      grp.add(model(BIG_MODELS[k] ? cache('big_' + k, BIG_MODELS[k]) : cache('unit_' + k, UNIT_MODELS[k])));
    }
    if (HC.EQUIP[k] && HC.EQUIP[k].move === 'tow') { const j = jackAt(HC.TRAILERS[k].len); grp.add(j); grp.userData.jack = j; }
    if (kk !== k && HC.EQUIP[kk].color) grp.userData.tint = HC.EQUIP[kk].color;
    if (SEATS[k] && !grp.userData.noSeat) {
      const standing = k === 'grinder' || k === 'mowerSO';
      const d = model(standing ? cache('walkerOp', () => build(personM('#f07a22', '#f4c020', { arms: 'forward' }))) : cache('seatedOp', () => build(seatedM())));
      d.position.set(...pv(SEATS[k]));
      if (grp.userData.artic) { d.position.x -= grp.userData.artic.px; grp.userData.artic.front.add(d); } else if (grp.userData.house && k === 'excavator') grp.userData.house.add(d);
      else if (grp.userData.house && k === 'miniex') { d.position.set(d.position.x / 0.7, d.position.y / 0.86, d.position.z / 0.68); d.scale.set(1 / 0.7, 1 / 0.86, 1 / 0.68); grp.userData.house.add(d); } // inside the scaled mini
      else grp.add(d);
      grp.userData.driver = d;
    }
    return grp;
  }
  function makeTrailerObj(kind) {
    kind = HC.trailerKindOf(kind);
    const o = new THREE.Group();
    const geoKind = kind === 'dump2' ? 'dump' : kind;
    if (DUMPBOX[geoKind]) dumpRig(geoKind, o); else o.add(model(cache('trailer_' + geoKind, TRAILER_GEO[geoKind])));
    const j = HC.TRAILERS[kind].gooseneck ? new THREE.Group() : jackAt(HC.TRAILERS[kind].len); o.add(j); o.userData.jack = j; // goosenecks stand on their own legs
    if (kind === 'gndump') { // the rear gate hangs from the top of the box and swings up out of the way for the ramps
      const g = new THREE.Group(); g.position.set(0, (2.3 - 0.95) * MM, 0); g.add(model(cache('gnGate', TRAILER_GEO.gnGate)));
      o.userData.dumpBox.add(g); o.userData.gate = g;
    }
    if (RAMP[kind]) {
      const R = RAMP[kind], r = new THREE.Group(); r.position.set(R.x * MM, R.y * MM, 0);
      r.add(model(cache('ramps' + kind, TRAILER_GEO['ramps' + kind])));
      o.add(r); o.userData.ramps = r; o.userData.rampA = R.slide ? 0 : -1.45; o.userData.rampDown = Math.asin(Math.min(0.95, R.y / R.len));
      if (R.slide) { r.visible = false; o.userData.rampS = 0; }
    }
    return o;
  }
  // a loop of track links as one instanced mesh; trackPlace() lays them around the belt at an offset
  const linkGeos = {};
  function trackLinks(t) {
    const key = (t.steel ? 's' : 'r') + t.w.toFixed(3);
    if (!linkGeos[key]) linkGeos[key] = t.steel
      ? build([Pm('box', '#2a2b2d', [0, 0.0, 0], [0.19, 0.05, t.w / MM]), Pm('box', '#3a3c3f', [0, -0.045, 0], [0.05, 0.05, t.w / MM * 0.98])], true)
      : build([Pm('box', '#141516', [0, 0, 0], [0.12, 0.04, t.w / MM]), Pm('box', '#1d1e1f', [0, -0.03, (t.w / MM) * 0.22], [0.06, 0.03, t.w / MM * 0.4], [0, 0.5, 0]), Pm('box', '#1d1e1f', [0, -0.03, -(t.w / MM) * 0.22], [0.06, 0.03, t.w / MM * 0.4], [0, -0.5, 0])], true);
    const R = t.h / 2, S = t.len - 2 * R, P = 2 * S + 2 * Math.PI * R, n = Math.max(12, Math.round(P / ((t.steel ? 0.2 : 0.14) * MM)));
    const m = new THREE.InstancedMesh(linkGeos[key], bodyMat, n);
    m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false;
    m.userData.track = { ...t, R, S, P, n, off: 0 };
    trackPlace(m);
    return m;
  }
  const _dummy = new THREE.Object3D();
  function trackPlace(m) {
    const t = m.userData.track, R = t.R - 0.012, { S, P, n } = t;
    for (let i = 0; i < n; i++) {
      let s = (((i * P) / n + t.off) % P + P) % P, x, y, rz;
      if (s < S) { x = S / 2 - s; y = t.R - R; rz = 0; }
      else if ((s -= S) < Math.PI * R) { const f = s / R; x = -S / 2 - R * Math.sin(f); y = t.R - R * Math.cos(f); rz = -f; }
      else if ((s -= Math.PI * R) < S) { x = -S / 2 + s; y = t.R + R; rz = Math.PI; }
      else { const f = (s - S) / R; x = S / 2 + R * Math.sin(f); y = t.R + R * Math.cos(f); rz = Math.PI - f; }
      _dummy.position.set(x, y, t.z); _dummy.rotation.set(0, 0, rz); _dummy.updateMatrix();
      m.setMatrixAt(i, _dummy.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
  }
  // roll every wheel by the distance actually travelled; front wheels of road vehicles follow the steering
  function rollWheels(o, x, y, a, steer) {
    let list = o.userData.wheelList;
    if (!list) { list = []; o.traverse((n) => { if (n.userData.wheel || n.userData.track) list.push(n); }); o.userData.wheelList = list; }
    if (!list.length) return;
    const L = o.userData.lastXY;
    let d = L ? ((x - L[0]) * Math.cos(a) + (y - L[1]) * Math.sin(a)) / TS : 0, dA = L ? HC.angDiff(L[2], a) : 0;
    if (Math.abs(d) > 2 || Math.abs(dA) > 1) { d = 0; dA = 0; } // teleports and resets
    o.userData.lastXY = [x, y, a];
    if (steer !== null) for (const w of list) if (w.userData.wheel && w.userData.wheel.front) w.rotation.y = -steer;
    if (!d && !dA && o.userData.posed) return;
    o.userData.posed = true;
    for (const w of list) {
      if (w.userData.track) { const t = w.userData.track; t.off += d - dA * t.z; trackPlace(w); continue; }
      const W = w.userData.wheel;
      W.spin = (W.spin || 0) + d - dA * w.position.z;
      w.children[0].rotation.z = -W.spin / W.r;
    }
  }
  // the fuel hose: a sagging tube from the truck's reel to the machine being filled
  let hoseMesh = null;
  function syncHose(S) {
    const h = S.hose, from = h && S.units[h.from], to = h && S.units[h.to];
    if (!from || !to) { if (hoseMesh) hoseMesh.visible = false; return; }
    const rx = from.x - Math.cos(from.a) * 3.9 * 32 / 3, ry = from.y - Math.sin(from.a) * 3.9 * 32 / 3;
    const a = new THREE.Vector3(U(rx), gh(rx, ry) + 1.5 * MM, U(ry)), b = new THREE.Vector3(U(to.x), gh(to.x, to.y) + 1.1 * MM, U(to.y));
    const m = a.clone().lerp(b, 0.5); m.y = Math.max(gh(rx, ry) + 0.03, Math.min(a.y, b.y) - 0.25 - a.distanceTo(b) * 0.08);
    const q1 = a.clone().lerp(m, 0.5); q1.y = (a.y + m.y) / 2 - 0.05; const q2 = m.clone().lerp(b, 0.5); q2.y = (m.y + b.y) / 2 - 0.05;
    const geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([a, q1, m, q2, b]), 24, 0.018, 6, false);
    if (!hoseMesh) { hoseMesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: '#151617', roughness: 0.7 })); hoseMesh.castShadow = true; scene.add(hoseMesh); }
    else { hoseMesh.geometry.dispose(); hoseMesh.geometry = geo; }
    hoseMesh.visible = true;
  }
  function syncUnits(S) {
    syncHose(S);
    for (const k in unitObjs) if (!S.units[k]) { scene.remove(unitObjs[k]); delete unitObjs[k]; } // sold
    for (const id in trailerObjs) if (!S.trailers.some((t) => t.id === id)) { scene.remove(trailerObjs[id]); delete trailerObjs[id]; }
    for (const id in attObjs) if (!(S.attachments || []).some((a) => a.id === id)) { if (attObjs[id].parent) attObjs[id].parent.remove(attObjs[id]); delete attObjs[id]; }
    for (const k in S.units) {
      const u = S.units[k];
      if (!unitObjs[k]) { unitObjs[k] = makeUnitObj(k); scene.add(unitObjs[k]); }
      if (o_driver(unitObjs[k])) unitObjs[k].userData.driver.visible = !!u.occupied;
      const o = unitObjs[k];
      o.visible = !u.hidden;
      if (u.hidden) continue;
      let lift = 0;
      const deck = S.trailers.find((t) => (u.on ? t.id === u.on.id : HC.Units.onDeck(t, u)));
      if (deck && HC.RIDES(k)) lift = (DECK_H[deck.kind] || 0.6) * MM;
      else if (HC.RIDES(k)) {
        for (const t of S.trailers) {
          if (!RAMP[t.kind] || !t.rampsDown) continue;
          const L = rampLocal(t, u), hinge = rampRear(t), foot = hinge - RAMP[t.kind].len * 32 / 3;
          if (L.side < 20 && L.along < hinge && L.along > foot) lift = Math.max(lift, ((L.along - foot) / (hinge - foot)) * (RAMP[t.kind].y * MM));
        }
      }
      o.position.set(U(u.x), gh(u.x, u.y) + lift, U(u.y));
      o.rotation.y = -u.a;
      if (o.userData.arms) {
        o.userData.arms.rotation.z = (u.armT || 0) * 0.6 + (u.working ? Math.sin(performance.now() / 40) * 0.01 : 0);
      }
      if (o.userData.jack) o.userData.jack.visible = !u.hitch;
      if (u.on || u.boarded) o.userData.lastXY = [u.x, u.y, u.a]; // strapped to a trailer: the wheels and tracks don't turn
      else rollWheels(o, u.x, u.y, u.a, HC.EQUIP[k].move === 'car' ? (u.steer || 0) : null);
      if (o.userData.loaderArm) o.userData.loaderArm.rotation.z = (u.armT || 0) * 0.85;
      if (o.userData.drum && u.working) o.userData.drum.rotation.z -= 0.55; // the rotor spins while it's cutting
      if (o.userData.artic) { o.userData.artic.front.rotation.y = -(u.art || 0) / 2; o.userData.artic.rear.rotation.y = (u.art || 0) / 2; }
      if (o.userData.hBoom) {
        const want = u.headAt ? HC.clamp(-HC.angDiff(u.a, Math.atan2(u.headAt.y - u.y, u.headAt.x - u.x)), -1.2, 1.2) : 0;
        o.userData.hBoom.rotation.y += (want - o.userData.hBoom.rotation.y) * 0.12;
        o.userData.hBoom.rotation.z = u.working ? Math.sin(performance.now() / 70) * 0.01 : 0;
      }
      if (HC.baseOf(k) === 'fwproc') { // logs waiting on the deck
        const n = Math.min(5, (u.deck || []).length);
        if (!o.userData.deckLogs) { o.userData.deckLogs = []; for (let i = 0; i < 5; i++) { const m = model(cache('deckLog', () => build([Pm('cyl', '#7a5434', [0, 0, 0], [0.42, 2.6, 0.42], [0, 0, Math.PI / 2]), Pm('cyl', '#e3c08a', [1.31, 0, 0], [0.36, 0.02, 0.36], [0, 0, Math.PI / 2])]))); m.position.set(1.0 * MM, 0.62 * MM, (1.1 + i * 0.26) * MM); o.add(m); o.userData.deckLogs.push(m); } }
        o.userData.deckLogs.forEach((m, i) => { m.visible = i < n; });
      }
      if (o.userData.house) o.userData.house.rotation.y = -(u.swing || 0); // the cab and boom slew independently of the tracks
      if (o.userData.exArm) o.userData.exArm.rotation.z = (u.armT || 0) * 0.35 + (u.working ? Math.sin(performance.now() / 60) * 0.03 : 0);
      if (o.userData.boom) {
        const up = Math.abs(u.v) < 5 && S.lot.trees.some((t) => t.state === 'standing' && Math.abs(t.x - u.x) < 130 && Math.abs(t.y - u.y) < 130 && HC.dist(t.x, t.y, u.x, u.y) < 130);
        o.userData.boomA += ((up ? 0.85 : 0) - o.userData.boomA) * 0.05;
        o.userData.boom.rotation.z = o.userData.boomA;
      }
      // load on a truck's own bed
      const bed = S.trailers.find((t) => HC.Units.isBed(t) && t.hitch === k);
      animateTip(o, bed);
      if (bed) {
        const sig = bed.cargo.length + bed.kind;
        if (o.userData.sig !== sig) {
          o.userData.sig = sig;
          dropCargo(o);
          const parts = [];
          bed.cargo.forEach((c, i) => {
            if (bed.kind === 'fwdbed') parts.push(Pm('cyl', i % 2 ? '#7a5434' : '#6e4e33', [-1.9, 1.62 + Math.floor(i / 5) * 0.4, -0.9 + (i % 5) * 0.45], [0.4, 4.3, 0.4], [0, 0, Math.PI / 2]), Pm('cyl', '#e3c08a', [0.26, 1.62 + Math.floor(i / 5) * 0.4, -0.9 + (i % 5) * 0.45], [0.34, 0.02, 0.34], [0, 0, Math.PI / 2]));
            else if (bed.kind === 'logbed') parts.push(Pm('cyl', i % 2 ? '#7a5434' : '#6e4e33', [-2.5, 1.55 + Math.floor(i / 5) * 0.42, -0.9 + (i % 5) * 0.45], [0.42, 5.6, 0.42], [0, 0, Math.PI / 2]), Pm('cyl', '#e3c08a', [0.31, 1.55 + Math.floor(i / 5) * 0.42, -0.9 + (i % 5) * 0.45], [0.36, 0.02, 0.36], [0, 0, Math.PI / 2]));
            else if (HC.EQUIP[HC.baseOf(k)].chipBox) { if (!i) { // the chip box fills like a real one: a heap of chips that rises toward the top
              const f = bed.load / Math.max(1, HC.Game.trailerCap(bed)), h = 0.15 + f * 1.95, col = bed.cargo.every((q) => q.kind === 'chips') ? '#c9a26a' : '#8a6a44';
              const bx = HC.baseOf(k) === 'chiptruck2' ? [-2.25, 5.5] : [-1.62, 4.25];
              parts.push(Pm('box', col, [bx[0], 1.32 + h / 2, 0], [bx[1], h, 2.22]), Pm('sph', HC.shade(col, 0.06), [bx[0] + 0.22, 1.32 + h, 0], [bx[1] - 0.65, 0.35 + f * 0.5, 2.0]));
            } }
            else parts.push(Pm(c.kind === 'log' ? 'cyl' : c.kind === 'rock' ? 'dode' : c.kind === 'mulch' || c.kind === 'chips' ? 'sph' : c.kind === 'firewood' ? 'box' : 'ico0', c.kind === 'log' ? '#7a5434' : c.kind === 'rock' ? '#8b8e93' : c.kind === 'mulch' ? '#3a2618' : c.kind === 'chips' ? '#c9a26a' : c.kind === 'firewood' ? ['#b58a5a', '#c9a26a', '#9a7048'][i % 3] : '#5a8a33', [-3.3 + (i % 5) * 0.8, 1.75 + Math.floor(i / 15) * 0.45, -0.7 + (Math.floor(i / 5) % 3) * 0.7], [0.8, 0.65, 0.8], c.kind === 'log' ? [0, 0, Math.PI / 2] : [0, 0, 0]));
          });
          if (parts.length) addCargo(o, model(build(parts), false, true));
        }
      }
      const walker = HC.EQUIP[k].move === 'walk';
      let bob = walker && u.moving ? Math.abs(Math.sin(u.walkT * 12)) * 0.06 : 0;
      const rig = o.userData.rig;
      if (rig) {
        const spd = HC.EQUIP[k].speed || 50, f = HC.clamp((u.speed || 0) / spd, 0, 1.8), ph = (u.walkT || 0) * 11, sw = Math.sin(ph) * (0.15 + 0.4 * Math.min(1, f));
        const holding = S.saw && S.saw.holder === k, cutting = holding && u.working;
        const ease = (obj, v) => { obj.rotation.z += (v - obj.rotation.z) * 0.35; };
        ease(rig.legs[0], u.moving ? sw : 0); ease(rig.legs[1], u.moving ? -sw : 0);
        ease(rig.body, cutting ? -0.18 : u.moving ? -0.05 * f : 0); // lean into the work, or a little into a jog
        ease(rig.arms[0], cutting ? 1.15 : holding ? 0.55 : u.moving ? -sw * 0.8 : 0.05);
        ease(rig.arms[1], cutting ? 1.05 : holding ? 0.2 : u.moving ? sw * 0.8 : 0.05);
        bob = u.moving ? Math.abs(Math.sin(ph)) * 0.035 * Math.min(1, f + 0.3) : 0;
      }
      o.position.y += bob + (u.working && !walker ? HC.rand(-0.012, 0.012) : 0);
      o.scale.setScalar(1);
    }
    for (const t of S.trailers) {
      if ((HC.EQUIP[t.kind] && HC.EQUIP[t.kind].move === 'tow') || HC.Units.isBed(t)) continue;
      let o = trailerObjs[t.id];
      if (!o) { o = makeTrailerObj(t.kind); trailerObjs[t.id] = o; scene.add(o); }
      o.position.set(U(t.x), gh(t.x, t.y), U(t.y));
      o.rotation.y = -t.a;
      if (HC.TRAILERS[t.kind].gooseneck) {
        const rig = t.hitch && S.units[t.hitch], bh = rig ? (HC.EQUIP[rig.kind].gnBall || HC.EQUIP[HC.baseOf(rig.kind)].gnBall || 1.15) : 1.15;
        const want = Math.atan2(bh - 1.15, HC.TRAILERS[t.kind].len / 32 * 3);
        o.rotation.z += (want - o.rotation.z) * 0.2;
      }
      o.userData.jack.visible = !t.hitch;
      rollWheels(o, t.x, t.y, t.a, null);
      if (o.userData.ramps) {
        const rig = t.hitch && S.units[t.hitch];
        const stopped = !rig || Math.abs(rig.v) < 4;
        const loading = stopped && Object.values(S.units).some((m) => {
          if (!HC.RIDES(m.kind) || m.hidden) return false;
          if (m.on && m.on.id === t.id) return false; // strapped: it's riding, not loading
          const L = rampLocal(t, m);
          return L.side < 26 && L.along > -(RAMP[t.kind].len * 10.67 + 60) / 1 + rampRear(t) && L.along < HC.TRAILERS[t.kind].deck[1];
        });
        t.rampsDown = (!t.hitch || loading) && !(t.kind === 'gndump' && (t.cargo.length || o.userData.tipStart));
        const R = RAMP[t.kind];
        if (R.slide) { // slide them out from under the deck, then tip them down to the ground (and back)
          o.userData.rampS += ((t.rampsDown ? 1 : 0) - o.userData.rampS) * 0.06;
          const s = o.userData.rampS, out = Math.min(1, s * 1.6), tilt = Math.max(0, s * 1.6 - 0.6) / 1.0;
          o.userData.ramps.visible = s > 0.02;
          o.userData.ramps.position.x = (R.x + (1 - out) * R.len * 0.92) * MM;
          o.userData.ramps.position.y = (R.y - 0.12 * (1 - out)) * MM;
          o.userData.ramps.rotation.z = Math.min(1, tilt) * o.userData.rampDown;
          if (o.userData.gate) o.userData.gate.rotation.z = -1.6 * Math.min(1, s * 2);
        } else {
          const want = t.rampsDown ? o.userData.rampDown : -1.45;
          o.userData.rampA += (want - o.userData.rampA) * 0.08;
          o.userData.ramps.rotation.z = o.userData.rampA;
        }
      }
      if (t.kind === 'logtrailer') {
        const sig = t.cargo.length;
        if (sig !== o.userData.sig) {
          o.userData.sig = sig;
          if (o.userData.cargo) o.remove(o.userData.cargo);
          const parts = [];
          t.cargo.forEach((c, i) => {
            const row = Math.floor(i / 6), col = i % 6, half = Math.floor(i / 12) % 2;
            parts.push(Pm('cyl', i % 2 ? '#7a5434' : '#6e4e33', [half ? 6.9 : 0.6, 1.65 + (row % 2) * 0.42, -1.0 + col * 0.4], [0.42, 5.4, 0.42], [0, 0, Math.PI / 2]));
          });
          if (parts.length) { const cm = model(build(parts), false, true); o.add(cm); o.userData.cargo = cm; }
        }
      }
      if (t.kind === 'dump' || t.kind === 'dump2' || t.kind === 'gndump') {
        animateTip(o, t);
        if (o.userData.gate && o.userData.tipStart) o.userData.gate.rotation.z = -0.9 * o.userData.dumpBox.rotation.z; // the gate swings open as it tips
        const sig = t.cargo.map((c) => c.kind[0]).join('');
        if (sig !== o.userData.sig) {
          o.userData.sig = sig;
          dropCargo(o);
          const parts = [];
          t.cargo.forEach((c, i) => {
            const gn = t.kind === 'gndump', x = (gn ? -1.0 : -1.6) + (i % 5) * (gn ? 0.92 : 0.8), z = -0.6 + (Math.floor(i / 5) % 3) * 0.6, y = (gn ? 1.12 : 1.0) + Math.floor(i / 15) * 0.4, lx = gn ? 0.8 : 0;
            if (c.kind === 'log') parts.push(Pm('cyl', '#7a5434', [lx, y + 0.1, z], [0.4, 3.8, 0.4], [0, 0, Math.PI / 2]), Pm('cyl', '#e3c08a', [lx + 1.91, y + 0.1, z], [0.34, 0.02, 0.34], [0, 0, Math.PI / 2]));
            else if (c.kind === 'firewood') parts.push(Pm('box', ['#b58a5a', '#c9a26a', '#9a7048'][i % 3], [x, y + 0.15, z], [0.42, 0.14, 0.14], [0, i, 0]));
            else if (c.kind === 'rock' || c.kind === 'stump') parts.push(Pm('dode', c.kind === 'rock' ? '#8b8e93' : '#6b4b30', [x, y + 0.15, z], [0.7, 0.55, 0.7]));
            else parts.push(Pm(c.kind === 'mulch' || c.kind === 'chips' ? 'sph' : 'ico0', c.kind === 'mulch' ? '#3a2618' : c.kind === 'chips' ? '#c9a26a' : '#5a8a33', [x, y + 0.2, z], [0.9, 0.7, 0.9]));
          });
          if (parts.length) addCargo(o, model(build(parts), false, true));
        }
      }
    }
    const au = S.units[S.active];
    marker.visible = !!au && !au.hidden && !S.preview;
    if (au) {
      marker.position.set(U(au.x), gh(au.x, au.y) + 0.05, U(au.y));
      marker.scale.setScalar(((au.r / TS) + 0.3 + Math.sin(performance.now() / 220) * 0.04) / 0.7);
    }
  }

  // ---------- job overlays ----------
  function syncJob(S) {
    beacon.visible = !!S.job && S.stage === 'travel';
    if (beacon.visible) {
      const p = world.parcels.find((q) => q.id === S.job.parcel);
      beacon.position.set(U(p.spawn.x), gh(p.spawn.x, p.spawn.y), U(p.spawn.y));
      beacon.userData.pin.position.y = 7 + Math.sin(performance.now() / 300) * 0.6;
    }
    const z = world.zone, zs = z ? `${z.x},${z.y},${z.w},${z.h}` : '';
    if (zs !== zoneSig) {
      zoneSig = zs;
      if (zoneLine) scene.remove(zoneLine);
      zoneLine = null;
      if (z) {
        const pts = [[z.x, z.y], [z.x + z.w, z.y], [z.x + z.w, z.y + z.h], [z.x, z.y + z.h]].map(([x, y]) => new THREE.Vector3(U(x), gh(x, y) + 0.08, U(y)));
        zoneLine = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineDashedMaterial({ color: '#ffe14d', dashSize: 0.6, gapSize: 0.35 }));
        zoneLine.computeLineDistances();
        scene.add(zoneLine);
      }
    }
    const ts = world.targets.map((t) => (t.done ? 1 : 0)).join('') + world.targets.length;
    if (ts !== targetSig) {
      targetSig = ts;
      if (targetGroup) scene.remove(targetGroup);
      targetGroup = new THREE.Group();
      const COL = { sod: '#7cff5a', bed: '#c87a3a', paver: '#ffe7b0', shrub: '#ff6fb0' };
      for (const t of world.targets) {
        if (t.done) continue;
        const m = new THREE.Mesh(t.kind === 'shrub' ? new THREE.RingGeometry(0.22, 0.34, 16) : new THREE.PlaneGeometry(0.86, 0.86),
          new THREE.MeshBasicMaterial({ color: COL[t.kind], transparent: true, opacity: t.kind === 'shrub' ? 0.95 : 0.35, depthWrite: false }));
        m.rotation.x = -Math.PI / 2;
        m.position.set(t.tx + 0.5, gh((t.tx + 0.5) * TS, (t.ty + 0.5) * TS) + 0.06, t.ty + 0.5);
        targetGroup.add(m);
      }
      scene.add(targetGroup);
    }
  }

  function syncAim(S) {
    if (aimMesh) { scene.remove(aimMesh); aimMesh.geometry.dispose(); aimMesh = null; }
    if (landMesh) { scene.remove(landMesh); landMesh.geometry.dispose(); landMesh = null; }
    const f = S.focus;
    if (!f || f.type !== 'fell' || !S.saw || S.saw.holder !== S.active) return;
    const t = f.obj, a = f.aim, sp = (HC.Game.spreadDeg(t) * Math.PI) / 180;
    let worst = 0;
    for (let i = -2; i <= 2; i++) {
      const hits = HC.Game.predictHits(t, a + (sp * i) / 2, S).filter((h) => !(h.id === 'tree' && h.obj.marked));
      if (hits.length) worst = Math.max(worst, i === 0 ? 2 : 1);
    }
    const col = worst === 2 ? '#ff4a3c' : worst === 1 ? '#ffbe28' : '#7cff7c';
    const y = gh(t.x, t.y) + 0.1;
    aimMesh = new THREE.Mesh(new THREE.CircleGeometry(U(t.len), 24, -(a + sp), sp * 2), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.3, depthWrite: false }));
    aimMesh.rotation.x = -Math.PI / 2;
    aimMesh.position.set(U(t.x), y, U(t.y));
    scene.add(aimMesh);
    const g = HC.Game.fallGeom(t, a);
    landMesh = new THREE.Mesh(new THREE.RingGeometry(U(g.cr) - 0.12, U(g.cr), 28), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.9, depthWrite: false }));
    landMesh.rotation.x = -Math.PI / 2;
    landMesh.position.set(U(g.cx), gh(g.cx, g.cy) + 0.12, U(g.cy));
    scene.add(landMesh);
  }

  function syncParticles(S) {
    const pos = points.geometry.attributes.position.array, col = points.geometry.attributes.color.array;
    let i = 0;
    for (const p of S.particles) {
      if (i >= 400) break;
      pos[i * 3] = U(p.x); pos[i * 3 + 1] = U(p.z || 2) + gh(p.x, p.y); pos[i * 3 + 2] = U(p.y);
      _c.set(p.color); col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b;
      i++;
    }
    for (let j = i; j < 400; j++) pos[j * 3 + 1] = -50;
    points.geometry.attributes.position.needsUpdate = true;
    points.geometry.attributes.color.needsUpdate = true;
    for (const w of world.wires) if (w.down && Math.random() < 0.15) HC.Game.dust((w.x1 + w.x2) / 2 + HC.rand(-20, 20), w.y1 + 10, '#ffe36b', 1, 60);
  }

  function weather(S, dt) {
    const w = S.weather, t = S.time;
    const eve = HC.clamp((t - 15.5 * 60) / 150, 0, 1);
    const dark = (w.dark || 0) + eve * 0.35;
    const horizon = new THREE.Color('#cfe2ee').lerp(new THREE.Color('#8e9aa6'), HC.clamp((w.dark || 0) * 2.5, 0, 1)).lerp(new THREE.Color('#e8a77a'), eve * 0.55);
    scene.background.copy(horizon);
    scene.fog.color.copy(horizon);
    sky.material.color.set('#ffffff').lerp(new THREE.Color('#9aa3ad'), HC.clamp((w.dark || 0) * 2.5, 0, 1)).lerp(new THREE.Color('#ffb08a'), eve * 0.6);
    sky.position.copy(camera.position);
    scene.fog.near = w.wet ? 25 : 42; scene.fog.far = w.wet ? 70 : 100;
    sun.intensity = LIGHT.sun * (1 - dark * 0.9);
    hemi.intensity = LIGHT.hemi * (1 - dark * 0.5);
    bodyMat.envMapIntensity = fadeMat.envMapIntensity = 0.75 * (1 - dark * 0.7);
    sun.color.set('#fff3d6').lerp(new THREE.Color('#ff9a55'), eve);
    rain.visible = !!w.wet;
    if (w.wet) {
      const arr = rain.geometry.attributes.position.array;
      rain.userData.drops.forEach((d, i) => {
        d.y -= dt * 22; d.x -= dt * 3;
        if (d.y < 0) { d.y = 25; d.x = HC.rand(-30, 30); d.z = HC.rand(-30, 30); }
        const x = cam.tx + d.x, z = cam.tz + d.z;
        arr.set([x, d.y, z, x - 0.12, d.y + 0.6, z], i * 6);
      });
      rain.geometry.attributes.position.needsUpdate = true;
    }
  }

  // ---------- camera + overlay ----------
  function project(x, y, z) {
    _v.set(U(x), z + gh(x, y), U(y)).project(camera);
    if (_v.z > 1) return null;
    return { x: (_v.x * 0.5 + 0.5) * window.innerWidth, y: (-_v.y * 0.5 + 0.5) * window.innerHeight };
  }
  function drawOverlay(S) {
    const w = window.innerWidth, h = window.innerHeight;
    octx.clearRect(0, 0, w, h);
    if (!S || S.preview) return;
    const bar = (x, y, z, f, col) => {
      const p = project(x, y, z);
      if (!p) return;
      octx.fillStyle = 'rgba(0,0,0,0.6)'; octx.fillRect(p.x - 21, p.y - 4, 42, 8);
      octx.fillStyle = col; octx.fillRect(p.x - 20, p.y - 3, 40 * HC.clamp(f, 0, 1), 6);
    };
    const f = S.focus;
    if (f && f.type === 'fell' && f.obj.cut > 0) bar(f.obj.x, f.obj.y, 1.6, f.obj.cut, '#ffb43b');
    for (const t of world.trees) if (t.state === 'felled' && t.buck > 0 && inView(U(t.x), U(t.y))) bar(t.x + Math.cos(t.fallA) * t.len * 0.45, t.y + Math.sin(t.fallA) * t.len * 0.45, 1, t.buck, '#ffd36b');
    for (const s of world.stumps) if (s.hp > 0 && inView(U(s.x), U(s.y))) bar(s.x, s.y, 0.8, s.hp, '#ffd36b');
    octx.font = '700 13px "Work Sans", system-ui, sans-serif';
    octx.textAlign = 'center';
    for (const fl of S.floats) {
      const p = project(fl.x, fl.y, 1.5 + fl.t * 0.8);
      if (!p) continue;
      octx.globalAlpha = HC.clamp(2.4 - fl.t, 0, 1);
      octx.fillStyle = '#000a'; octx.fillText(fl.text, p.x + 1, p.y + 1);
      octx.fillStyle = fl.color; octx.fillText(fl.text, p.x, p.y);
    }
    octx.globalAlpha = 1;
    const labels = [];
    for (const p of world.pads || [world.pad]) if (p) labels.push([p.x + p.w / 2, p.y + p.h / 2, 'Log & dump pad']);
    for (const pm of world.pumps) labels.push([pm.x, pm.y, 'Fuel']);
    if (world.fwStand) labels.push([world.fwStand.x, world.fwStand.y - 30, `Firewood stand · ${(HC.company.stand || {}).stock || 0}/${HC.STAND_CAP}`]);
    for (const c of (HC.company && HC.company.contracts) || []) if (c.status === 'bidding' || c.status === 'won') labels.push([c.x, c.y, c.status === 'won' ? `Your state contract · ${c.road}` : `Storm damage · ${c.road} (bids open)`]);
    for (const hs of world.houses) if (hs.label) labels.push([hs.x + hs.w / 2, hs.y + hs.h / 2, hs.label]);
    for (const yd of world.yards) labels.push([yd.x + yd.w / 2, yd.y + yd.h * 0.35, yd.owned ? `${yd.name} · equipment yard` : `${yd.name} · for sale ${HC.money(yd.price)}`]);
    if (world.supply) { const sp = world.supply; labels.push([sp.x + sp.w / 2, sp.y + sp.h * 0.35, `${sp.name} · buys mulch ${HC.money(HC.MULCH_PRICE)}, chips ${HC.money(HC.CHIP_PRICE)}/unit`]); labels.push([sp.pad.x + sp.pad.w / 2, sp.pad.y + sp.pad.h / 2, 'Mulch sales pad']); }
    if (world.quarry) { const q = world.quarry; labels.push([q.x + q.w / 2, q.y + q.h * 0.4, q.owned ? `${q.name} · sells rocks ${HC.money(HC.ROCK_PRICE)} each` : `${q.name} · for sale ${HC.money(q.price)}`]); labels.push([q.pad.x + q.pad.w / 2, q.pad.y + q.pad.h / 2, 'Rock sales pad']); }
    for (const t of S.trailers) if (!t.hitch && !HC.Units.isBed(t) && !(HC.EQUIP[t.kind] && HC.EQUIP[t.kind].move)) labels.push([t.x, t.y, HC.TRAILERS[t.kind].name + (HC.Units.isDump(t) && t.load ? ` ${t.load}/${HC.Game.trailerCap(t)}` : '')]);
    octx.font = '600 11px "JetBrains Mono", ui-monospace, monospace';
    const stack = new Map();
    if (HC.Net && HC.Net.role) for (const [name, u] of HC.Net.labels()) { // co-op: who's who (stacked when two share a machine)
      if (!inView(U(u.x), U(u.y))) continue;
      const p = project(u.x, u.y, HC.EQUIP[u.kind].move === 'walk' ? 2.3 : 3.6);
      if (!p) continue;
      const n = stack.get(u) || 0; stack.set(u, n + 1); p.y -= n * 20;
      const tw = octx.measureText(name).width + 12;
      octx.fillStyle = 'rgba(240,122,34,0.92)'; octx.fillRect(p.x - tw / 2, p.y - 10, tw, 18);
      octx.fillStyle = '#fff'; octx.fillText(name, p.x, p.y + 3);
    }
    for (const [x, y, txt] of labels) {
      if (!inView(U(x), U(y))) continue;
      const p = project(x, y, 2.6);
      if (!p) continue;
      const tw = octx.measureText(txt).width + 12;
      octx.fillStyle = 'rgba(24,33,20,0.8)'; octx.fillRect(p.x - tw / 2, p.y - 10, tw, 18);
      octx.fillStyle = '#f3ecd9'; octx.fillText(txt, p.x, p.y + 3);
    }
  }

  function updateCamera(S, dt) {
    const au = S.units[S.active];
    let tx = cam.tx, tz = cam.tz;
    if (S.preview) {
      cam.yaw += dt * 0.08;
      const y = world.yard;
      tx = U(y.x + y.w / 2); tz = U(y.y + y.h / 2);
      cam.dist = 34;
    } else if (au) {
      tx = U(au.x); tz = U(au.y);
      const mode = HC.camMode();
      if (mode === 'auto' && HC.Units.isTruck(S.active) && au.v > 60 && !HC.input.dragging) cam.yaw += HC.angDiff(cam.yaw, au.a) * Math.min(1, dt * 1.5);
      if (mode === 'follow' && !HC.input.dragging && au.moving && (au.kind === 'op' ? Math.abs(HC.angDiff(cam.yaw, au.a)) < 1.3 : (au.v || 0) > 2)) { // walking toward the camera or backing up doesn't spin it around
        // swing in behind the way you're heading; slower for machines, a touch quicker on foot
        const rate = au.kind === 'op' ? 2.2 : HC.Units.isTruck(S.active) ? 1.6 : 1.1;
        cam.yaw += HC.angDiff(cam.yaw, au.a) * Math.min(1, dt * rate);
      }
    }
    const topView = !S.preview && HC.camMode() === 'top';
    const k = Math.min(1, dt * 6);
    if (Math.abs(tx - cam.tx) > 25 || Math.abs(tz - cam.tz) > 25) { cam.tx = tx; cam.tz = tz; }
    cam.tx += (tx - cam.tx) * k; cam.tz += (tz - cam.tz) * k;
    if (HC.input.camYaw !== undefined && !S.preview && HC.input.dragging && !topView) cam.yaw = HC.input.camYaw;
    if (topView) cam.yaw += HC.angDiff(cam.yaw, -Math.PI / 2) * Math.min(1, dt * 5);
    HC.input.camYaw = cam.yaw;
    if (!S.preview) {
      cam.dist = HC.clamp(HC.input.zoom ?? cam.dist, 6, 42);
      if (topView) cam.pitch += (1.5 - cam.pitch) * Math.min(1, dt * 5);
      else if (HC.input.camPitch !== undefined) cam.pitch += (HC.input.camPitch - cam.pitch) * Math.min(1, dt * 8);
    }
    const ty = HC.World.heightAt(tx * TS, tz * TS);
    const h = cam.dist * Math.cos(cam.pitch), sh = (S.shake || 0) * 0.015;
    camera.position.set(cam.tx - Math.cos(cam.yaw) * h + HC.rand(-sh, sh), ty + cam.dist * Math.sin(cam.pitch), cam.tz - Math.sin(cam.yaw) * h + HC.rand(-sh, sh));
    camera.lookAt(cam.tx, ty + 0.5, cam.tz);
    sun.position.set(cam.tx + 18, 40, cam.tz + 10);
    sun.target.position.set(cam.tx, 0, cam.tz);
  }

  let lastT = performance.now();
  function frame(S) {
    const now = performance.now(), dt = Math.min(0.05, (now - lastT) / 1000);
    lastT = now;
    frameNo++;
    if (!S || !world) { renderer.render(scene, camera); drawOverlay(null); return; }
    updateCamera(S, dt);
    // co-op: the other companies' machines, trailers and attachments are drawn alongside yours
    const V = S.remote && (Object.keys(S.remote).length || (S.remoteTrailers || []).length) ? Object.assign(Object.create(S), { units: Object.assign({}, S.units, S.remote), trailers: S.trailers.concat(S.remoteTrailers || []), attachments: (S.attachments || []).concat(S.remoteAt || []) }) : S;
    syncTrees(S); syncUnits(V); syncSmall(V); syncStand(); syncSaw(S); syncAttachments(V); syncJob(S); syncAim(S); syncParticles(S); syncGrass(S, dt);
    weather(S, dt);
    if (groundDirty && now - lastUpload > 120) { uploadGround(now); groundDirty = false; lastUpload = now; }
    if (mipDirty && now - lastMip > 500) refreshMips(now);
    renderer.render(scene, camera);
    drawOverlay(S);
  }

  // ---------- 3D tall grass: clumps of blades on every uncut 1 m patch of a tall-grass tile near the camera ----------
  let grassMesh = null, grassAt = { x: 1e9, z: 1e9 }, grassVer = 0, grassBuilt = -1, grassT = 0, curQ = 'high';
  const GRASS_MAX = 14000;
  const grassUni = { uTime: { value: 0 } };
  function grassGeo() {
    const pos = [], col = [], r = rnd(91);
    for (let i = 0; i < 11; i++) {
      const x = (r() - 0.5) * 0.32, z = (r() - 0.5) * 0.32, h = (0.5 + r() * 0.4) * MM, w = 0.06 * MM, a = r() * Math.PI, lean = (r() - 0.5) * 0.25 * MM;
      const ca = Math.cos(a) * w, sa = Math.sin(a) * w;
      pos.push(x - ca, 0, z - sa, x + ca, 0, z + sa, x + lean, h, z + lean * 0.6);
      const base = [0.12, 0.26, 0.07], tip = r() < 0.25 ? [0.62, 0.6, 0.28] : [0.36, 0.58, 0.18];
      col.push(...base, ...base, ...tip);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    return g;
  }
  function makeGrass() {
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.95 });
    m.onBeforeCompile = (sh) => { // a little wind in the tops
      sh.uniforms.uTime = grassUni.uTime;
      sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
        float ph = instanceMatrix[3].x * 2.3 + instanceMatrix[3].z * 1.7;
        transformed.x += sin(uTime * 1.8 + ph) * transformed.y * 0.22;
        transformed.z += cos(uTime * 1.3 + ph) * transformed.y * 0.12;
        #endif`);
    };
    grassMesh = new THREE.InstancedMesh(grassGeo(), m, GRASS_MAX);
    grassMesh.frustumCulled = false; grassMesh.receiveShadow = true; grassMesh.count = 0;
    scene.add(grassMesh);
  }
  const grassMat4 = new THREE.Matrix4(), grassQ = new THREE.Quaternion(), grassP = new THREE.Vector3(), grassS = new THREE.Vector3(), grassUp = new THREE.Vector3(0, 1, 0);
  function syncGrass(S, dt) {
    if (curQ === 'low') { if (grassMesh) grassMesh.visible = false; return; }
    if (!grassMesh) makeGrass();
    grassMesh.visible = true;
    grassUni.uTime.value += dt;
    grassT -= dt;
    const cx = Math.round(cam.tx), cz = Math.round(cam.tz);
    const moved = Math.abs(cx - grassAt.x) > 3 || Math.abs(cz - grassAt.z) > 3;
    if (!moved && (grassVer === grassBuilt || grassT > 0)) return;
    grassAt = { x: cx, z: cz }; grassBuilt = grassVer; grassT = moved ? 0.15 : 0.45;
    const W = world, cut = W.cut, list = [];
    for (let ty = Math.max(0, cz - 44); ty < Math.min(W.h, cz + 34); ty++) for (let tx = Math.max(0, cx - 42); tx < Math.min(W.w, cx + 42); tx++) {
      const idx = ty * W.w + tx;
      if (W.tiles[idx] === HC.T.TALL) list.push([(tx - cx) * (tx - cx) + (ty - cz) * (ty - cz), tx, ty, idx]);
    }
    list.sort((a, b) => a[0] - b[0]); // nearest first, so the cap trims the far edge
    let n = 0;
    for (const [, tx, ty, idx] of list) {
      if (n >= GRASS_MAX) break;
      {
        const m = cut ? cut.get(idx) || 0 : 0;
        for (let s = 0; s < 9 && n < GRASS_MAX; s++) {
          if (m & (1 << s)) continue;
          const h = ((idx * 9 + s) * 2654435761) >>> 0, fx = tx + ((s % 3) + 0.5) / 3 + ((h & 255) / 255 - 0.5) * 0.12, fz = ty + (Math.floor(s / 3) + 0.5) / 3 + (((h >> 8) & 255) / 255 - 0.5) * 0.12;
          grassP.set(fx, gh(fx * TS, fz * TS), fz);
          grassQ.setFromAxisAngle(grassUp, ((h >> 16) & 255) / 40);
          const sc = 0.8 + ((h >> 24) & 255) / 600; grassS.set(sc, sc * (0.85 + (h & 63) / 200), sc);
          grassMesh.setMatrixAt(n++, grassMat4.compose(grassP, grassQ, grassS));
        }
      }
    }
    grassMesh.count = n;
    grassMesh.instanceMatrix.needsUpdate = true;
  }
  const grassDirty = () => { grassVer++; };

  // send only the changed rectangle of the ground picture to the GPU (the whole thing is ~100 MB on the big map)
  let patchCv = null;
  function uploadGround(now) {
    const props = renderer.properties.get(groundTex), tex = props && props.__webglTexture, r = dirtyR;
    dirtyR = null;
    if (!tex || !r || groundTex.needsUpdate) { groundTex.needsUpdate = true; return; }
    const W = world, x0 = Math.max(0, r[0]), y0 = Math.max(0, r[1]), x1 = Math.min(W.w - 1, r[2]), y1 = Math.min(W.h - 1, r[3]);
    const x = x0 * G, y = y0 * G, w = (x1 - x0 + 1) * G, h = (y1 - y0 + 1) * G;
    if (w <= 0 || h <= 0) return;
    try {
      const gl = renderer.getContext();
      if (!patchCv) patchCv = document.createElement('canvas');
      if (patchCv.width !== w || patchCv.height !== h) { patchCv.width = w; patchCv.height = h; }
      const pc = patchCv.getContext('2d'); pc.clearRect(0, 0, w, h); pc.drawImage(groundCanvas, x, y, w, h, 0, 0, w, h); // copy the patch (no pixel readback)
      const img = patchCv;
      renderer.state.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false); gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, x, groundCanvas.height - y - h, gl.RGBA, gl.UNSIGNED_BYTE, img);
      mipDirty = true;
    } catch (e) { groundTex.needsUpdate = true; }
  }
  // the far-away (mipmap) levels catch up a couple of times a second
  function refreshMips(now) {
    lastMip = now; mipDirty = false;
    const props = renderer.properties.get(groundTex), tex = props && props.__webglTexture;
    if (!tex || !groundTex.generateMipmaps) return;
    try { const gl = renderer.getContext(); renderer.state.bindTexture(gl.TEXTURE_2D, tex); gl.generateMipmap(gl.TEXTURE_2D); } catch (e) { /* keep going */ }
  }

  // mouse → ground point (ray against the terrain, refined with a few height samples)
  function screenToWorld(sx, sy) {
    if (!camera) return { x: 0, y: 0 };
    const ndc = new THREE.Vector3((sx / window.innerWidth) * 2 - 1, -(sy / window.innerHeight) * 2 + 1, 0.5);
    ndc.unproject(camera);
    const dir = ndc.sub(camera.position).normalize();
    if (Math.abs(dir.y) < 1e-4) return { x: 0, y: 0 };
    let hy = 0, x = 0, z = 0;
    for (let i = 0; i < 4; i++) {
      const t = (hy - camera.position.y) / dir.y;
      x = camera.position.x + dir.x * t; z = camera.position.z + dir.z * t;
      hy = HC.World.heightAt(x * TS, z * TS);
    }
    return { x: x * TS, y: z * TS };
  }

  // small studio render of a machine or trailer for the shop
  let thumbR = null, thumbScene = null, thumbCam = null;
  const thumbs = {};
  function thumb(kind, isTrailer) {
    const key = (isTrailer ? 't:' : 'u:') + kind;
    if (thumbs[key]) return thumbs[key];
    try {
      if (!thumbR) {
        const c = document.createElement('canvas'); c.width = 360; c.height = 220;
        thumbR = new THREE.WebGLRenderer({ canvas: c, antialias: true, alpha: true, preserveDrawingBuffer: true });
        thumbR.outputEncoding = THREE.sRGBEncoding; thumbR.toneMapping = THREE.ACESFilmicToneMapping; thumbR.toneMappingExposure = 1.1;
        thumbScene = new THREE.Scene();
        thumbScene.add(new THREE.HemisphereLight('#e6f0ff', '#6b6152', 1.2));
        const key2 = new THREE.DirectionalLight('#fff4e0', 2.4); key2.position.set(4, 8, 6); thumbScene.add(key2);
        const rim = new THREE.DirectionalLight('#cfe0ff', 0.8); rim.position.set(-6, 4, -5); thumbScene.add(rim);
        thumbCam = new THREE.PerspectiveCamera(28, 360 / 220, 0.05, 200);
      }
      const obj = kind.startsWith('saw:') ? (() => { const g = new THREE.Group(); g.add(model(sawItemGeo(kind.slice(4)))); return g; })() : HC.EQUIP[kind] && HC.EQUIP[kind].attachTo ? (() => { const g = new THREE.Group(); g.add(model(attGeo(kind))); return g; })() : isTrailer ? makeTrailerObj(kind) : makeUnitObj(kind);
      if (kind === 'skid') { const gr = model(attGeo('grapple')); gr.position.set(PLATE[0] * MM, PLATE[1] * MM, 0); obj.userData.arms.add(gr); }
      if (obj.userData.driver) obj.userData.driver.visible = kind === 'grinder';
      if (obj.userData.ramps) obj.userData.ramps.rotation.z = -1.45;
      thumbScene.add(obj);
      obj.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(obj), size = box.getSize(new THREE.Vector3()), ctr = box.getCenter(new THREE.Vector3());
      const r = Math.max(size.x, size.y * 1.6, size.z) * 0.5 + 0.05;
      const dir = kind.startsWith('saw:') ? new THREE.Vector3(0.15, 0.3, 1).normalize() : new THREE.Vector3(0.75, 0.48, 0.95).normalize();
      thumbCam.position.copy(ctr).addScaledVector(dir, r / Math.sin((thumbCam.fov * Math.PI) / 360) * 0.95);
      thumbCam.lookAt(ctr);
      thumbR.setClearColor(0x000000, 0);
      thumbR.render(thumbScene, thumbCam);
      thumbs[key] = thumbR.domElement.toDataURL('image/png');
      thumbScene.remove(obj);
    } catch (e) { thumbs[key] = ''; }
    return thumbs[key];
  }
  function setOutlines(on) { if (outlineMat) outlineMat.visible = !!on; }

  HC.Render = {
    thumb, setOutlines, yardChanged, setQuality, grassDirty, info: () => renderer.info.render, _dbg: { attach: (k) => model(attGeo(k)), unitObj: (k) => unitObjs[k], unit: (k) => makeUnitObj(k), trailer: (k) => makeTrailerObj(k), scene: () => scene, renderer: () => renderer },
    init, prepare, setTile, restamp, frame, screenToWorld, fencesChanged: () => buildFences(), wiresChanged: () => buildWires(),
    cam, get groundCanvas() { return groundCanvas; },
  };
})();
