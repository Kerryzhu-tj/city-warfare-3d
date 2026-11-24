/* ============================================================
   巷战 3D · 城市场景、碰撞、导航网格
   ============================================================ */
(function (CW) {
  'use strict';

  const World = {};
  const T = THREE;

  /* ---------------- 程序化贴图 ---------------- */
  function makeFacade(base, windowTint, seed) {
    const w = 256, h = 512;
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d');
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    // 混凝土杂讯
    for (let i = 0; i < 2600; i++) {
      const a = Math.random() * 0.06;
      g.fillStyle = `rgba(${Math.random() < 0.5 ? 0 : 255},${Math.random() < 0.5 ? 0 : 255},255,${a})`;
      g.fillRect(Math.random() * w, Math.random() * h, 1.6, 1.6);
    }
    const e = document.createElement('canvas'); e.width = w; e.height = h;
    const eg = e.getContext('2d');
    eg.fillStyle = '#000'; eg.fillRect(0, 0, w, h);

    const cols = 4, rows = 8;
    const mx = 20, my = 18;
    const cw = (w - mx * 2) / cols, rh = (h - my * 2) / rows;
    let rng = seed || 1234567;
    const rand = () => { rng = (rng * 1664525 + 1013904223) >>> 0; return rng / 4294967296; };

    for (let ry = 0; ry < rows; ry++) {
      for (let cx = 0; cx < cols; cx++) {
        const x = mx + cx * cw + cw * 0.16;
        const y = my + ry * rh + rh * 0.14;
        const ww = cw * 0.68, hh = rh * 0.6;
        g.fillStyle = 'rgba(6,10,16,0.95)';
        g.fillRect(x, y, ww, hh);
        g.strokeStyle = 'rgba(150,165,180,0.24)';
        g.lineWidth = 2;
        g.strokeRect(x - 1, y - 1, ww + 2, hh + 2);
        g.fillStyle = 'rgba(255,255,255,0.05)';
        g.fillRect(x, y, ww, hh * 0.32);
        const lit = rand();
        if (lit > 0.62) {
          const warm = rand() > 0.35;
          const col = warm ? windowTint : '#8fc7ff';
          eg.fillStyle = col;
          eg.globalAlpha = 0.55 + rand() * 0.45;
          eg.fillRect(x, y, ww, hh);
          eg.globalAlpha = 1;
          g.fillStyle = col; g.globalAlpha = 0.62;
          g.fillRect(x, y, ww, hh); g.globalAlpha = 1;
        }
      }
    }
    // 楼层横线
    g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 3;
    for (let ry = 1; ry < rows; ry++) {
      const y = my + ry * rh;
      g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke();
    }
    const map = new T.CanvasTexture(c);
    const emap = new T.CanvasTexture(e);
    map.wrapS = map.wrapT = T.RepeatWrapping;
    emap.wrapS = emap.wrapT = T.RepeatWrapping;
    return { map, emap };
  }

  function makeAsphalt() {
    const s = 512;
    const c = document.createElement('canvas'); c.width = s; c.height = s;
    const g = c.getContext('2d');
    g.fillStyle = '#2a2c31'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 9000; i++) {
      const v = 26 + Math.random() * 34;
      g.fillStyle = `rgba(${v},${v + 2},${v + 5},${0.5})`;
      g.fillRect(Math.random() * s, Math.random() * s, 1.5, 1.5);
    }
    g.strokeStyle = 'rgba(12,13,16,0.7)'; g.lineWidth = 2;
    for (let i = 0; i < 16; i++) {
      g.beginPath();
      let x = Math.random() * s, y = Math.random() * s;
      g.moveTo(x, y);
      for (let k = 0; k < 5; k++) { x += (Math.random() - 0.5) * 70; y += (Math.random() - 0.5) * 70; g.lineTo(x, y); }
      g.stroke();
    }
    const tex = new T.CanvasTexture(c);
    tex.wrapS = tex.wrapT = T.RepeatWrapping;
    return tex;
  }

  function makeConcrete(seed) {
    const s = 256;
    const c = document.createElement('canvas'); c.width = s; c.height = s;
    const g = c.getContext('2d');
    g.fillStyle = '#3a3d42'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 3600; i++) {
      const v = 30 + Math.random() * 50;
      g.fillStyle = `rgba(${v},${v},${v + 4},0.35)`;
      g.fillRect(Math.random() * s, Math.random() * s, 2, 2);
    }
    g.strokeStyle = 'rgba(10,11,13,0.5)'; g.lineWidth = 1.5;
    g.strokeRect(4, 4, s - 8, s - 8);
    const tex = new T.CanvasTexture(c);
    tex.wrapS = tex.wrapT = T.RepeatWrapping;
    return tex;
  }

  function makeStripe() {
    const s = 128;
    const c = document.createElement('canvas'); c.width = s; c.height = s;
    const g = c.getContext('2d');
    g.fillStyle = '#c9a12a'; g.fillRect(0, 0, s, s);
    g.fillStyle = '#16181c';
    for (let i = -s; i < s * 2; i += 34) {
      g.save(); g.translate(i, 0); g.rotate(0.5);
      g.fillRect(0, -s, 16, s * 3); g.restore();
    }
    const tex = new T.CanvasTexture(c);
    tex.wrapS = tex.wrapT = T.RepeatWrapping;
    return tex;
  }

  /* ---------------- 几何工具 ---------------- */
  function addBox(world, opts) {
    const geo = new T.BoxGeometry(opts.w, opts.h, opts.d);
    const mat = opts.material;
    const mesh = new T.Mesh(geo, mat);
    mesh.position.set(opts.x, (opts.y || 0) + opts.h / 2, opts.z);
    mesh.castShadow = opts.castShadow !== false;
    mesh.receiveShadow = opts.receiveShadow !== false;
    world.group.add(mesh);
    if (opts.collide !== false) {
      world.colliders.push({
        minX: opts.x - opts.w / 2, maxX: opts.x + opts.w / 2,
        minZ: opts.z - opts.d / 2, maxZ: opts.z + opts.d / 2,
        minY: opts.y || 0, maxY: (opts.y || 0) + opts.h,
        mesh
      });
    }
    if (opts.ray !== false) world.rayMeshes.push(mesh);
    return mesh;
  }

  function addCylinder(world, opts) {
    const geo = new T.CylinderGeometry(opts.r, opts.r2 == null ? opts.r : opts.r2, opts.h, opts.seg || 12);
    const mesh = new T.Mesh(geo, opts.material);
    mesh.position.set(opts.x, (opts.y || 0) + opts.h / 2, opts.z);
    mesh.castShadow = true; mesh.receiveShadow = true;
    world.group.add(mesh);
    if (opts.collide !== false) {
      const r = opts.r;
      world.colliders.push({
        minX: opts.x - r, maxX: opts.x + r,
        minZ: opts.z - r, maxZ: opts.z + r,
        minY: opts.y || 0, maxY: (opts.y || 0) + opts.h, mesh
      });
    }
    if (opts.ray !== false) world.rayMeshes.push(mesh);
    return mesh;
  }

  /* ---------------- 导航网格 ---------------- */
  function buildNav(world, bounds, cell) {
    const minX = bounds.minX, minZ = bounds.minZ;
    const cols = Math.ceil((bounds.maxX - minX) / cell);
    const rows = Math.ceil((bounds.maxZ - minZ) / cell);
    const blocked = new Uint8Array(cols * rows);
    const pad = 0.5;
    for (const c of world.colliders) {
      if (c.maxY < 0.6) continue;
      const x0 = Math.floor((c.minX - pad - minX) / cell);
      const x1 = Math.floor((c.maxX + pad - minX) / cell);
      const z0 = Math.floor((c.minZ - pad - minZ) / cell);
      const z1 = Math.floor((c.maxZ + pad - minZ) / cell);
      for (let z = Math.max(0, z0); z <= Math.min(rows - 1, z1); z++) {
        for (let x = Math.max(0, x0); x <= Math.min(cols - 1, x1); x++) {
          blocked[z * cols + x] = 1;
        }
      }
    }
    const nav = {
      cell, minX, minZ, cols, rows, blocked,
      toCell(x, z) {
        return { cx: Math.floor((x - minX) / cell), cz: Math.floor((z - minZ) / cell) };
      },
      toWorld(cx, cz) {
        return { x: minX + (cx + 0.5) * cell, z: minZ + (cz + 0.5) * cell };
      },
      isBlocked(cx, cz) {
        if (cx < 0 || cz < 0 || cx >= cols || cz >= rows) return true;
        return blocked[cz * cols + cx] === 1;
      },
      isOpenWorld(x, z) {
        const c = this.toCell(x, z);
        return !this.isBlocked(c.cx, c.cz);
      },
      nearestOpen(cx, cz) {
        if (!this.isBlocked(cx, cz)) return { cx, cz };
        for (let r = 1; r <= 12; r++) {
          for (let dz = -r; dz <= r; dz++) {
            for (let dx = -r; dx <= r; dx++) {
              if (Math.abs(dx) !== r && Math.abs(dz) !== r) continue;
              const nx = cx + dx, nz = cz + dz;
              if (!this.isBlocked(nx, nz)) return { cx: nx, cz: nz };
            }
          }
        }
        return null;
      },
      findPath(fx, fz, tx, tz) {
        let s = this.toCell(fx, fz);
        let e = this.toCell(tx, tz);
        s = this.nearestOpen(s.cx, s.cz);
        e = this.nearestOpen(e.cx, e.cz);
        if (!s || !e) return [];
        const W = cols, H = rows;
        const N = W * H;
        const start = s.cz * W + s.cx, goal = e.cz * W + e.cx;
        if (start === goal) return [];
        const open = [start];
        const came = new Int32Array(N).fill(-1);
        const gScore = new Float32Array(N).fill(Infinity);
        const fScore = new Float32Array(N).fill(Infinity);
        const inOpen = new Uint8Array(N);
        gScore[start] = 0;
        fScore[start] = Math.abs(s.cx - e.cx) + Math.abs(s.cz - e.cz);
        inOpen[start] = 1;
        const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
        let iter = 0, found = false;
        while (open.length && iter++ < 5000) {
          let bi = 0;
          for (let i = 1; i < open.length; i++) if (fScore[open[i]] < fScore[open[bi]]) bi = i;
          const cur = open.splice(bi, 1)[0];
          inOpen[cur] = 0;
          if (cur === goal) { found = true; break; }
          const cx = cur % W, cz = (cur / W) | 0;
          for (const [dx, dz] of dirs) {
            const nx = cx + dx, nz = cz + dz;
            if (nx < 0 || nz < 0 || nx >= W || nz >= H) continue;
            if (blocked[nz * W + nx]) continue;
            const ni = nz * W + nx;
            const ng = gScore[cur] + 1;
            if (ng < gScore[ni]) {
              came[ni] = cur;
              gScore[ni] = ng;
              fScore[ni] = ng + Math.abs(nx - e.cx) + Math.abs(nz - e.cz);
              if (!inOpen[ni]) { open.push(ni); inOpen[ni] = 1; }
            }
          }
        }
        if (!found) return [];
        const cells = [];
        let cur = goal;
        let guard = 0;
        while (cur !== start && cur >= 0 && guard++ < 5000) {
          cells.push(cur);
          cur = came[cur];
        }
        cells.reverse();
        const pts = cells.map(i => this.toWorld(i % W, (i / W) | 0));
        return pts;
      }
    };
    return nav;
  }

  /* ---------------- 主建构 ---------------- */
  World.build = function (scene, quality) {
    const world = {
      group: new T.Group(),
      colliders: [],
      rayMeshes: [],
      coverPoints: [],
      bounds: { minX: -49, maxX: 49, minZ: -49, maxZ: 49 },
      spawns: { red: [], blue: [] },
      minimapBuildings: [],
      lamps: [],
      time: 0
    };
    scene.add(world.group);
    const q = quality || 'high';
    const shadows = q !== 'low';

    /* --- 天空与雾 --- */
    scene.fog = new T.FogExp2(0x161e2a, 0.0095);
    const skyGeo = new T.SphereGeometry(520, 24, 16);
    const skyMat = new T.ShaderMaterial({
      side: T.BackSide, depthWrite: false, fog: false,
      uniforms: {
        top: { value: new T.Color(0x0c1424) },
        mid: { value: new T.Color(0x2d3a52) },
        bot: { value: new T.Color(0xd98a4a) }
      },
      vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `varying vec3 vP; uniform vec3 top; uniform vec3 mid; uniform vec3 bot;
        void main(){ float h = normalize(vP).y; float t = clamp(h*1.35+0.18,0.0,1.0);
          vec3 c = mix(bot, mid, smoothstep(0.0,0.32,t)); c = mix(c, top, smoothstep(0.42,1.0,t));
          gl_FragColor = vec4(c,1.0); }`
    });
    const sky = new T.Mesh(skyGeo, skyMat);
    sky.frustumCulled = false;
    scene.add(sky);
    // 太阳
    const sunCanvas = document.createElement('canvas'); sunCanvas.width = sunCanvas.height = 128;
    const sg = sunCanvas.getContext('2d');
    const grad = sg.createRadialGradient(64, 64, 4, 64, 64, 64);
    grad.addColorStop(0, 'rgba(255,236,190,1)');
    grad.addColorStop(0.35, 'rgba(255,190,120,0.85)');
    grad.addColorStop(1, 'rgba(255,150,80,0)');
    sg.fillStyle = grad; sg.fillRect(0, 0, 128, 128);
    const sunTex = new T.CanvasTexture(sunCanvas);
    const sunSprite = new T.Sprite(new T.SpriteMaterial({ map: sunTex, transparent: true, depthWrite: false, fog: false }));
    sunSprite.scale.set(120, 120, 1);
    sunSprite.position.set(-190, 120, -300);
    scene.add(sunSprite);

    /* --- 灯光 --- */
    const hemi = new T.HemisphereLight(0x9db4d6, 0x2a2118, 0.58);
    scene.add(hemi);
    const sun = new T.DirectionalLight(0xffb574, 1.0);
    sun.position.set(-46, 74, -34);
    sun.castShadow = shadows;
    if (shadows) {
      sun.shadow.mapSize.set(q === 'high' ? 2048 : 1024, q === 'high' ? 2048 : 1024);
      sun.shadow.camera.left = -58; sun.shadow.camera.right = 58;
      sun.shadow.camera.top = 58; sun.shadow.camera.bottom = -58;
      sun.shadow.camera.near = 1; sun.shadow.camera.far = 200;
      sun.shadow.bias = -0.0009;
    }
    scene.add(sun);
    scene.add(sun.target);
    world.sun = sun;
    const amb = new T.AmbientLight(0x39445c, 0.4);
    scene.add(amb);

    /* --- 地面 --- */
    const asphalt = makeAsphalt();
    asphalt.repeat.set(18, 18);
    const groundMat = new T.MeshLambertMaterial({ map: asphalt, color: 0x80848b });
    const ground = new T.Mesh(new T.PlaneGeometry(140, 140), groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    world.group.add(ground);
    // 道路中央标线（中央十字）
    const lineMat = new T.MeshBasicMaterial({ color: 0xd8c98a, transparent: true, opacity: 0.5 });
    for (let i = -44; i < 44; i += 8) {
      if (Math.abs(i) < 12) continue;
      const a = new T.Mesh(new T.PlaneGeometry(0.3, 3.4), lineMat);
      a.rotation.x = -Math.PI / 2; a.position.set(0, 0.02, i + 1.7);
      world.group.add(a);
      const b = new T.Mesh(new T.PlaneGeometry(3.4, 0.3), lineMat);
      b.rotation.x = -Math.PI / 2; b.position.set(i + 1.7, 0.02, 0);
      world.group.add(b);
    }

    /* --- 材质 --- */
    const concrete = makeConcrete();
    const concreteMat = new T.MeshLambertMaterial({ map: concrete, color: 0x7d8188 });
    const roofMat = new T.MeshLambertMaterial({ color: 0x23262c });
    const darkMetal = new T.MeshLambertMaterial({ color: 0x3b4048 });
    const crateMat = new T.MeshLambertMaterial({ color: 0x6d5335 });
    const crateMat2 = new T.MeshLambertMaterial({ color: 0x4a5560 });
    const sandMat = new T.MeshLambertMaterial({ color: 0x8c7a4e });
    const barrierMat = new T.MeshLambertMaterial({ map: makeConcrete(), color: 0x9a9ca0 });
    const stripeMat = new T.MeshLambertMaterial({ map: makeStripe(), color: 0xffffff });
    const rustMat = new T.MeshLambertMaterial({ color: 0x7a3b2a });
    const glassMat = new T.MeshLambertMaterial({ color: 0x1a2a3a, emissive: 0x0a1622 });

    const facades = [
      makeFacade('#4a4e57', '#ffcf8a', 11),
      makeFacade('#3f4650', '#ffd7a0', 77),
      makeFacade('#52524c', '#ffe0ad', 991),
      makeFacade('#39414c', '#9fd0ff', 313)
    ];

    /* --- 建筑 --- */
    const BUILDINGS = [
      { x: 24, z: -24, w: 16, d: 16, h: 16 }, { x: 38, z: -38, w: 10, d: 10, h: 10 },
      { x: 39, z: -17, w: 8, d: 16, h: 12 }, { x: 17, z: -39, w: 16, d: 8, h: 11 },
      { x: -24, z: -24, w: 16, d: 16, h: 18 }, { x: -38, z: -38, w: 10, d: 10, h: 9 },
      { x: -39, z: -17, w: 8, d: 16, h: 11 }, { x: -17, z: -39, w: 16, d: 8, h: 13 },
      { x: -24, z: 24, w: 16, d: 16, h: 14 }, { x: -38, z: 38, w: 10, d: 10, h: 9 },
      { x: -39, z: 17, w: 8, d: 16, h: 10 }, { x: -17, z: 39, w: 16, d: 8, h: 12 },
      { x: 24, z: 24, w: 16, d: 16, h: 17 }, { x: 38, z: 38, w: 10, d: 10, h: 11 },
      { x: 39, z: 17, w: 8, d: 16, h: 9 }, { x: 17, z: 39, w: 16, d: 8, h: 13 }
    ];
    BUILDINGS.forEach((b, i) => {
      const f = facades[i % facades.length];
      const map = f.map.clone(); map.needsUpdate = true;
      const emap = f.emap.clone(); emap.needsUpdate = true;
      const rx = Math.max(1, Math.round(b.w / 8));
      const ry = Math.max(1, Math.round(b.h / 8));
      map.repeat.set(rx, ry); emap.repeat.set(rx, ry);
      const mat = new T.MeshLambertMaterial({
        map, emissiveMap: emap, emissive: 0xffffff, emissiveIntensity: 0.85,
        color: 0xa6acb5
      });
      addBox(world, { x: b.x, z: b.z, w: b.w, d: b.d, h: b.h, material: mat });
      // 屋顶
      addBox(world, { x: b.x, z: b.z, w: b.w + 0.5, d: b.d + 0.5, h: 0.5, y: b.h, material: roofMat, collide: false, castShadow: true });
      // 女儿墙
      const pw = 0.4;
      addBox(world, { x: b.x, z: b.z - b.d / 2 + pw / 2, w: b.w, d: pw, h: 0.8, y: b.h + 0.5, material: roofMat, collide: false });
      addBox(world, { x: b.x, z: b.z + b.d / 2 - pw / 2, w: b.w, d: pw, h: 0.8, y: b.h + 0.5, material: roofMat, collide: false });
      addBox(world, { x: b.x - b.w / 2 + pw / 2, z: b.z, w: pw, d: b.d, h: 0.8, y: b.h + 0.5, material: roofMat, collide: false });
      addBox(world, { x: b.x + b.w / 2 - pw / 2, z: b.z, w: pw, d: b.d, h: 0.8, y: b.h + 0.5, material: roofMat, collide: false });
      // 天台设备
      if (i % 2 === 0) {
        addBox(world, { x: b.x + b.w * 0.18, z: b.z - b.d * 0.2, w: 2.2, d: 2.2, h: 1.4, y: b.h + 0.5, material: darkMetal, collide: false });
        addBox(world, { x: b.x - b.w * 0.2, z: b.z + b.d * 0.22, w: 1.2, d: 1.2, h: 2.6, y: b.h + 0.5, material: darkMetal, collide: false });
      }
      world.minimapBuildings.push({ x: b.x, z: b.z, w: b.w, d: b.d });
    });

    // 外围墙
    addBox(world, { x: 0, z: -49, w: 98, d: 1.4, h: 4.2, material: concreteMat });
    addBox(world, { x: 0, z: 49, w: 98, d: 1.4, h: 4.2, material: concreteMat });
    addBox(world, { x: -49, z: 0, w: 1.4, d: 98, h: 4.2, material: concreteMat });
    addBox(world, { x: 49, z: 0, w: 1.4, d: 98, h: 4.2, material: concreteMat });
    // 外墙顶部警示条
    addBox(world, { x: 0, z: -49.6, w: 98, d: 0.5, h: 0.6, y: 3.0, material: stripeMat, collide: false });
    addBox(world, { x: 0, z: 49.6, w: 98, d: 0.5, h: 0.6, y: 3.0, material: stripeMat, collide: false });

    // 远处天际线剪影
    const farMat = new T.MeshBasicMaterial({ color: 0x0d1520, fog: true });
    for (let i = 0; i < 26; i++) {
      const ang = (i / 26) * Math.PI * 2 + 0.2;
      const r = 105 + (i % 4) * 12;
      const w = 8 + (i * 7 % 13);
      const h = 16 + (i * 13 % 34);
      const mesh = new T.Mesh(new T.BoxGeometry(w, h, w), farMat);
      mesh.position.set(Math.cos(ang) * r, h / 2 - 4, Math.sin(ang) * r);
      world.group.add(mesh);
    }

    /* --- 掩体与路障 --- */
    const crateSpots = [
      [7.5, 7.5, 0], [8.7, 6.8, 0.2], [8.0, 8.4, 0.4],
      [-7.5, 7.5, 0], [-8.7, 6.8, 0],
      [7.5, -8.0, 0], [-8.0, -7.5, 0], [-7.0, -8.6, 0],
      [16, 0, 0], [-16, 0, 0], [0, 16], [0, -16],
      [11, 13, 0.3], [-11, -13, 0.1], [13, -11, 0.5], [-13, 11, 0.2],
      [32, 6, 0], [-32, -6, 0], [6, -32, 0], [-6, 32, 0]
    ];
    crateSpots.forEach((s, i) => {
      const rot = s[2];
      const mesh = addBox(world, {
        x: s[0], z: s[1], w: 1.7, d: 1.7, h: 1.7,
        material: i % 3 === 0 ? crateMat2 : crateMat
      });
      mesh.rotation.y = rot;
      world.coverPoints.push({ x: s[0], z: s[1] });
    });

    const barriers = [
      [0, 11, 0], [0, -11, 0], [11, 0, Math.PI / 2], [-11, 0, Math.PI / 2],
      [21, 8, 0], [-21, -8, 0], [8, -21, Math.PI / 2], [-8, 21, Math.PI / 2],
      [30, 30, 0], [-30, -30, 0], [30, -30, 0], [-30, 30, 0]
    ];
    barriers.forEach((b) => {
      const mesh = addBox(world, { x: b[0], z: b[1], w: 3.2, d: 0.9, h: 1.15, material: barrierMat });
      mesh.rotation.y = b[2];
      if (b[2]) {
        // 旋转后以较大 AABB 近似
        const c = world.colliders[world.colliders.length - 1];
        const half = 1.7;
        c.minX = b[0] - half; c.maxX = b[0] + half;
        c.minZ = b[1] - half; c.maxZ = b[1] + half;
      }
      world.coverPoints.push({ x: b[0], z: b[1] });
    });

    // 沙袋墙
    const sandbags = [[-5, 3], [5, -3], [3, 5], [-3, -5], [14, -30], [-14, 30]];
    sandbags.forEach(([x, z]) => {
      const mesh = addBox(world, { x, z, w: 3.6, d: 1.1, h: 0.95, material: sandMat });
      mesh.rotation.y = (x + z) % 2 ? Math.PI / 2 : 0;
      const c = world.colliders[world.colliders.length - 1];
      if (mesh.rotation.y) {
        c.minX = x - 1.9; c.maxX = x + 1.9; c.minZ = z - 0.7; c.maxZ = z + 0.7;
      }
    });

    // 报废车辆
    function addCar(x, z, rotY, color) {
      const bodyMat = new T.MeshLambertMaterial({ color });
      const g = new T.Group();
      const body = new T.Mesh(new T.BoxGeometry(2.1, 0.85, 4.4), bodyMat);
      body.position.y = 0.75; body.castShadow = true; body.receiveShadow = true;
      const cabin = new T.Mesh(new T.BoxGeometry(1.8, 0.72, 2.1), glassMat);
      cabin.position.set(0, 1.42, -0.15); cabin.castShadow = true;
      body.userData.isWall = true; cabin.userData.isWall = true;
      g.add(body); g.add(cabin);
      g.position.set(x, 0, z); g.rotation.y = rotY;
      world.group.add(g);
      world.rayMeshes.push(body, cabin);
      const halfW = Math.abs(Math.cos(rotY)) * 1.05 + Math.abs(Math.sin(rotY)) * 2.2;
      const halfD = Math.abs(Math.sin(rotY)) * 1.05 + Math.abs(Math.cos(rotY)) * 2.2;
      world.colliders.push({ minX: x - halfW, maxX: x + halfW, minZ: z - halfD, maxZ: z + halfD, minY: 0, maxY: 1.8, mesh: body });
      world.coverPoints.push({ x, z });
    }
    addCar(-6, -19, 0.25, 0x4c5a44);
    addCar(6, 19, Math.PI + 0.18, 0x5a4a3a);
    addCar(-19, 6, Math.PI / 2 + 0.1, 0x44505c);
    addCar(19, -6, -Math.PI / 2 + 0.12, 0x5c5044);

    // 货柜
    function addContainer(x, z, rotY, color) {
      const mat = new T.MeshLambertMaterial({ color });
      const mesh = addBox(world, { x, z, w: 6, d: 2.6, h: 2.6, material: mat });
      mesh.rotation.y = rotY;
      const c = world.colliders[world.colliders.length - 1];
      const hw = rotY ? 1.4 : 3.1, hd = rotY ? 3.1 : 1.4;
      c.minX = x - hw; c.maxX = x + hw; c.minZ = z - hd; c.maxZ = z + hd;
      world.coverPoints.push({ x, z });
    }
    addContainer(-24, 0, Math.PI / 2, 0x6a4a34);
    addContainer(24, 0, Math.PI / 2, 0x35505c);
    addContainer(0, -24, 0, 0x5c3f38);

    // 汽油桶
    const barrels = [[4, 4], [-4, -4], [9, -4], [-9, 4], [27, 12], [-27, -12], [12, 27], [-12, -27]];
    barrels.forEach(([x, z]) => {
      addCylinder(world, { x, z, r: 0.48, h: 1.15, material: rustMat });
      world.coverPoints.push({ x, z });
    });

    /* --- 中央地标：翻覆巴士 --- */
    (function bus() {
      const busMat = new T.MeshLambertMaterial({ color: 0x2f6b63 });
      const body = addBox(world, { x: -1.5, z: 0, w: 3.0, d: 9.4, h: 3.0, material: busMat });
      // 车窗
      const winMat = new T.MeshLambertMaterial({ color: 0x0d1a22, emissive: 0x0a2430, emissiveIntensity: 0.7 });
      for (let i = -3; i <= 3; i++) {
        const win = new T.Mesh(new T.BoxGeometry(0.06, 0.9, 1.0), winMat);
        win.position.set(-1.5 + 1.52, 2.0, i * 1.25);
        body.parent && body.parent.add(win);
        world.group.add(win);
      }
      // 车顶设备
      addBox(world, { x: -1.5, z: 1.2, w: 1.6, d: 2.2, h: 0.5, y: 3.0, material: darkMetal, collide: false });
    })();

    // 喷泉 / 花坛
    addCylinder(world, { x: 8, z: -8, r: 2.2, h: 0.9, seg: 16, material: barrierMat });
    addCylinder(world, { x: -8, z: 8, r: 2.2, h: 0.9, seg: 16, material: barrierMat });

    /* --- 路灯 --- */
    const lampPositions = [[-13, -13], [13, -13], [-13, 13], [13, 13], [0, 30], [0, -30]];
    lampPositions.forEach(([x, z], i) => {
      const poleMat = new T.MeshLambertMaterial({ color: 0x2a2d33 });
      addCylinder(world, { x, z, r: 0.16, h: 5.6, seg: 8, material: poleMat, collide: false });
      const headMat = new T.MeshBasicMaterial({ color: 0xffd9a0 });
      const head = new T.Mesh(new T.SphereGeometry(0.28, 10, 8), headMat);
      head.position.set(x, 5.6, z);
      world.group.add(head);
      world.lamps.push({ head, mat: headMat });
      // 仅中央四盏使用实际点光源
      if (i < 2) {
        const pl = new T.PointLight(0xffb066, 0.9, 22, 2);
        pl.position.set(x, 5.2, z);
        scene.add(pl);
      }
    });

    /* --- 出生点 --- */
    world.spawns.red = [
      new T.Vector3(-3, 0, 42), new T.Vector3(3, 0, 42),
      new T.Vector3(0, 0, 43), new T.Vector3(-6, 0, 42.5)
    ];
    world.spawns.blue = [
      new T.Vector3(-3, 0, -42), new T.Vector3(3, 0, -42),
      new T.Vector3(0, 0, -43), new T.Vector3(-6, 0, -42.5)
    ];

    /* --- 导航 --- */
    world.nav = buildNav(world, world.bounds, 2);

    // 清理：出生点若被标记阻挡，就近开放
    ['red', 'blue'].forEach(team => {
      world.spawns[team].forEach(p => {
        const c = world.nav.toCell(p.x, p.z);
        if (world.nav.isBlocked(c.cx, c.cz)) {
          const n = world.nav.nearestOpen(c.cx, c.cz);
          if (n) { const w = world.nav.toWorld(n.cx, n.cz); p.x = w.x; p.z = w.z; }
        }
      });
    });

    /* --- 射线遮蔽查询（2D） --- */
    world.lineClear = function (ax, az, bx, bz) {
      const dx = bx - ax, dz = bz - az;
      const dist = Math.hypot(dx, dz) || 1;
      const ux = dx / dist, uz = dz / dist;
      for (const c of world.colliders) {
        if (c.maxY < 1.2) continue;
        const tmin = segAabb(ax, az, ux, uz, dist, c);
        if (tmin >= 0 && tmin < dist - 0.2) return false;
      }
      return true;
    };

    world.update = function (dt, time) {
      world.time = time;
      // 灯光轻微闪烁
      for (let i = 0; i < world.lamps.length; i++) {
        const l = world.lamps[i];
        const f = 0.85 + Math.sin(time * 6 + i * 1.7) * 0.06 + Math.sin(time * 13 + i) * 0.04;
        l.head.scale.setScalar(f);
      }
    };

    world.dispose = function () {
      scene.remove(sky); scene.remove(sunSprite);
      world.group.traverse(o => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          mats.forEach(m => { for (const k in m) { if (m[k] && m[k].isTexture) m[k].dispose(); } m.dispose(); });
        }
      });
      scene.remove(world.group);
    };

    return world;
  };

  /* 射线与 AABB（2D） */
  function segAabb(ax, az, ux, uz, maxT, box) {
    let tmin = 0, tmax = maxT;
    if (Math.abs(ux) < 1e-6) {
      if (ax < box.minX || ax > box.maxX) return -1;
    } else {
      let t1 = (box.minX - ax) / ux, t2 = (box.maxX - ax) / ux;
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
      tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
      if (tmin > tmax) return -1;
    }
    if (Math.abs(uz) < 1e-6) {
      if (az < box.minZ || az > box.maxZ) return -1;
    } else {
      let t1 = (box.minZ - az) / uz, t2 = (box.maxZ - az) / uz;
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
      tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
      if (tmin > tmax) return -1;
    }
    return tmin;
  }

  CW.World = World;
})(window.CW = window.CW || {});
