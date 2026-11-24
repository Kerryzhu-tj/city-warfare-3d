/* ============================================================
   巷战 3D · 士兵模型与 AI
   ============================================================ */
(function (CW) {
  'use strict';
  const T = THREE;

  const TEAM = {
    red: {
      body: 0x6d2f2b, bodyDark: 0x54231f, camoLight: 0x8d4a3f,
      vest: 0x2f2a24, vestDark: 0x201d19, helmet: 0x4c2b26,
      accent: 0xff5a46, name: '红军'
    },
    blue: {
      body: 0x2c4566, bodyDark: 0x20344e, camoLight: 0x416385,
      vest: 0x1f2833, vestDark: 0x151c24, helmet: 0x27394e,
      accent: 0x54a8ff, name: '蓝军'
    }
  };

  const BOT_WEAPONS = {
    rifle: { key: 'rifle', dmg: 13, rpm: 520, burst: [3, 5], spread: 0.032, range: 105, mag: 30 },
    smg: { key: 'smg', dmg: 10, rpm: 820, burst: [4, 7], spread: 0.045, range: 60, mag: 35 },
    pistol: { key: 'pistol', dmg: 15, rpm: 300, burst: [2, 3], spread: 0.03, range: 55, mag: 12 },
    sniper: { key: 'sniper', dmg: 36, rpm: 42, burst: [1, 1], spread: 0.011, range: 150, mag: 5 }
  };

  // 程序化布料/迷彩纹理：不依赖外部图片，放大后也不会露出纯色塑料感
  const TEX_CACHE = {};
  function hexCss(n) {
    return '#' + ('000000' + n.toString(16)).slice(-6);
  }
  function noiseFill(ctx, w, h, alpha) {
    for (let i = 0; i < 340; i++) {
      const g = Math.random() < 0.5 ? 0 : 255;
      ctx.fillStyle = `rgba(${g},${g},${g},${alpha * (0.25 + Math.random() * 0.75)})`;
      ctx.fillRect(Math.random() * w, Math.random() * h, 1, 1);
    }
  }
  function getCamo(team) {
    const key = 'camo:' + team;
    if (TEX_CACHE[key]) return TEX_CACHE[key];
    const conf = TEAM[team];
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const ctx = c.getContext('2d');
    ctx.fillStyle = hexCss(conf.body);
    ctx.fillRect(0, 0, 64, 64);
    const cols = ['#' + ('000000' + conf.bodyDark.toString(16)).slice(-6),
      '#' + ('000000' + conf.camoLight.toString(16)).slice(-6),
      '#' + ('000000' + conf.body.toString(16)).slice(-6)];
    for (let i = 0; i < 30; i++) {
      const cx = Math.random() * 64;
      const cy = Math.random() * 64;
      const r = 3 + Math.random() * 8;
      ctx.fillStyle = cols[i % cols.length];
      ctx.beginPath();
      for (let a = 0; a < 7; a++) {
        const ang = (a / 7) * Math.PI * 2;
        const rr = r * (0.65 + Math.random() * 0.6);
        const x = cx + Math.cos(ang) * rr;
        const y = cy + Math.sin(ang) * rr;
        if (a === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
    }
    noiseFill(ctx, 64, 64, 0.12);
    const tex = new T.CanvasTexture(c);
    tex.wrapS = tex.wrapT = T.RepeatWrapping;
    if (T.sRGBEncoding) tex.encoding = T.sRGBEncoding;
    tex.anisotropy = 2;
    TEX_CACHE[key] = tex;
    return tex;
  }
  function getVestTex(team) {
    const key = 'vest:' + team;
    if (TEX_CACHE[key]) return TEX_CACHE[key];
    const conf = TEAM[team];
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const ctx = c.getContext('2d');
    ctx.fillStyle = hexCss(conf.vest);
    ctx.fillRect(0, 0, 64, 64);
    // 织带与缝线
    ctx.strokeStyle = 'rgba(0,0,0,0.30)';
    ctx.lineWidth = 1;
    for (let y = 8; y < 64; y += 12) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(64, y); ctx.stroke();
    }
    for (let x = 6; x < 64; x += 14) {
      ctx.strokeStyle = 'rgba(255,255,255,0.07)';
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 64); ctx.stroke();
    }
    noiseFill(ctx, 64, 64, 0.18);
    const tex = new T.CanvasTexture(c);
    tex.wrapS = tex.wrapT = T.RepeatWrapping;
    if (T.sRGBEncoding) tex.encoding = T.sRGBEncoding;
    TEX_CACHE[key] = tex;
    return tex;
  }

  function lerpAngle(a, b, t) {
    let d = (b - a) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    return a + d * t;
  }

  class Soldier {
    constructor(game, team, weaponKey) {
      this.game = game;
      this.team = team;
      this.enemyTeam = team === 'red' ? 'blue' : 'red';
      this.weaponKey = weaponKey || 'rifle';
      this.stats = BOT_WEAPONS[this.weaponKey] || BOT_WEAPONS.rifle;
      this.isPlayer = false;
      this.maxHp = 100;
      this.hp = 100;
      this.alive = false;
      this.radius = 0.42;
      this.pos = new T.Vector3();
      this.vel = new T.Vector3();
      this.yaw = 0;
      this.walkPhase = Math.random() * 10;
      this.speed = 3.1 + Math.random() * 0.5;
      this.fireTimer = 0;
      this.reaction = 0;
      this.burstLeft = 0;
      this.burstPause = 0;
      this.perceptionTimer = Math.random() * 0.3;
      this.target = null;
      this.lastSeen = null;
      this.path = [];
      this.pathIndex = 0;
      this.pathTimer = 0;
      this.goal = new T.Vector3();
      this.stunTimer = 0;
      this.respawnTimer = 0;
      this.deadTime = 0;
      this.strafeDir = Math.random() < 0.5 ? -1 : 1;
      this.strafeTimer = 0;
      this.engaged = false;
      this.rubbleTime = 0;
      this._buildMesh();
      this.mesh.visible = false;
    }

    _buildMesh() {
      const conf = TEAM[this.team];
      const g = new T.Group();

      // 程序化迷彩/织带纹理 + 分层护甲，避免「塑料玩具」质感
      const camo = getCamo(this.team);
      const vestTex = getVestTex(this.team);
      const matFabric = new T.MeshLambertMaterial({ map: camo });
      const matFabricDark = new T.MeshLambertMaterial({ map: camo, color: 0x8c8c8c });
      const matVest = new T.MeshLambertMaterial({ map: vestTex });
      const matVestDark = new T.MeshLambertMaterial({ map: vestTex, color: 0x7c7c7c });
      const matSkin = new T.MeshLambertMaterial({ color: 0xb08a68 });
      const matSkinDark = new T.MeshLambertMaterial({ color: 0x8d6a4f });
      const matBoot = new T.MeshLambertMaterial({ color: 0x2a2c2e });
      const matRubber = new T.MeshLambertMaterial({ color: 0x16181a });
      const matGun = new T.MeshLambertMaterial({ color: 0x2c3137 });
      const matSteel = new T.MeshLambertMaterial({ color: 0x59616a });
      const matStrap = new T.MeshLambertMaterial({ color: 0x3a332a });
      const matHelmet = new T.MeshLambertMaterial({ map: camo, color: 0x9a9a9a });
      const matLens = new T.MeshLambertMaterial({ color: 0x121a22, emissive: 0x23415a });
      const matAccent = new T.MeshBasicMaterial({ color: conf.accent });
      this.mats = [matFabric, matFabricDark, matVest, matVestDark, matSkin, matSkinDark,
        matBoot, matRubber, matGun, matSteel, matStrap, matHelmet, matLens, matAccent];

      const mesh = (geo, mat, x, y, z, parent) => {
        const m = new T.Mesh(geo, mat);
        m.position.set(x, y, z);
        (parent || g).add(m);
        return m;
      };

      // ---------- 腿：大腿 / 膝关节 / 小腿 / 战术靴 ----------
      const buildLeg = (side) => {
        const hip = new T.Group();
        hip.position.set(0.13 * side, 0.94, 0);
        g.add(hip);
        mesh(new T.CylinderGeometry(0.105, 0.085, 0.45, 8), matFabricDark, 0, -0.225, 0, hip);
        const knee = new T.Group();
        knee.position.y = -0.45;
        hip.add(knee);
        mesh(new T.CylinderGeometry(0.082, 0.068, 0.42, 8), matFabric, 0, -0.21, 0, knee);
        mesh(new T.BoxGeometry(0.14, 0.13, 0.07), matVest, 0, -0.005, -0.075, knee);
        mesh(new T.BoxGeometry(0.155, 0.14, 0.31), matBoot, 0, -0.435, -0.055, knee);
        mesh(new T.BoxGeometry(0.165, 0.05, 0.33), matRubber, 0, -0.505, -0.055, knee);
        mesh(new T.BoxGeometry(0.09, 0.11, 0.055), matVestDark, 0.085, -0.16, -0.055, knee);
        return { hip, knee };
      };
      const legL = buildLeg(-1);
      const legR = buildLeg(1);
      this.legL = legL.hip;
      this.legR = legR.hip;
      this.kneeL = legL.knee;
      this.kneeR = legR.knee;

      // ---------- 髋部 / 躯干 ----------
      const pelvis = mesh(new T.CylinderGeometry(0.225, 0.2, 0.18, 10), matFabricDark, 0, 0.99, 0);
      pelvis.scale.z = 0.78;
      mesh(new T.BoxGeometry(0.44, 0.08, 0.28), matStrap, 0, 1.06, 0);
      const torso = mesh(new T.CylinderGeometry(0.285, 0.225, 0.52, 12), matFabric, 0, 1.31, 0);
      torso.scale.z = 0.74;

      // 防弹背心：插板 + 肩带 + 弹匣袋 + 电台 + 腰包
      mesh(new T.BoxGeometry(0.43, 0.4, 0.25), matVest, 0, 1.34, -0.01);
      mesh(new T.BoxGeometry(0.36, 0.34, 0.08), matVestDark, 0, 1.35, 0.17);
      mesh(new T.BoxGeometry(0.075, 0.4, 0.08), matStrap, -0.16, 1.35, -0.12);
      mesh(new T.BoxGeometry(0.075, 0.4, 0.08), matStrap, 0.16, 1.35, -0.12);
      for (let i = -1; i <= 1; i++) {
        mesh(new T.BoxGeometry(0.1, 0.12, 0.06), matVestDark, i * 0.125, 1.21, -0.155);
      }
      mesh(new T.BoxGeometry(0.09, 0.14, 0.07), matVestDark, 0.145, 1.4, -0.145);
      mesh(new T.CylinderGeometry(0.008, 0.008, 0.16, 5), matSteel, 0.145, 1.53, -0.15);
      mesh(new T.BoxGeometry(0.12, 0.16, 0.1), matVestDark, -0.12, 1.22, 0.15);

      // 肩部护具
      const shoulderL = mesh(new T.SphereGeometry(0.105, 8, 6), matFabricDark, -0.288, 1.525, 0);
      shoulderL.scale.set(1, 0.82, 0.95);
      const shoulderR = mesh(new T.SphereGeometry(0.105, 8, 6), matFabricDark, 0.288, 1.525, 0);
      shoulderR.scale.set(1, 0.82, 0.95);

      // ---------- 手臂：肩 / 肘 / 手 ----------
      const buildArm = (side) => {
        const shoulder = new T.Group();
        shoulder.position.set(0.305 * side, 1.51, 0);
        g.add(shoulder);
        mesh(new T.CylinderGeometry(0.082, 0.072, 0.3, 8), matFabric, 0, -0.15, 0, shoulder);
        const elbow = new T.Group();
        elbow.position.y = -0.3;
        shoulder.add(elbow);
        mesh(new T.CylinderGeometry(0.07, 0.058, 0.27, 8), matFabric, 0, -0.135, 0, elbow);
        mesh(new T.BoxGeometry(0.09, 0.09, 0.06), matVestDark, 0, -0.245, -0.045, elbow);
        mesh(new T.SphereGeometry(0.062, 8, 6), matSkinDark, 0, -0.29, -0.01, elbow);
        return { shoulder, elbow };
      };
      const armL = buildArm(-1);
      const armR = buildArm(1);
      this.armL = armL.shoulder;
      this.armR = armR.shoulder;
      this.elbowL = armL.elbow;
      this.elbowR = armR.elbow;

      // ---------- 颈部 / 头部 / 头盔 / 护目镜 ----------
      mesh(new T.CylinderGeometry(0.058, 0.07, 0.1, 7), matSkinDark, 0, 1.6, 0);
      const head = mesh(new T.SphereGeometry(0.135, 14, 12), matSkin, 0, 1.735, 0);
      head.scale.set(0.92, 1.08, 0.95);
      mesh(new T.BoxGeometry(0.12, 0.08, 0.06), matSkinDark, 0, 1.665, -0.09);
      mesh(new T.BoxGeometry(0.035, 0.06, 0.04), matSkin, 0, 1.735, -0.13);
      mesh(new T.BoxGeometry(0.03, 0.018, 0.01), matRubber, -0.048, 1.775, -0.125);
      mesh(new T.BoxGeometry(0.03, 0.018, 0.01), matRubber, 0.048, 1.775, -0.125);

      // 头盔：覆盖到眉骨的球盔 + 盔沿 + 侧轨 + 夜视支架 + 护目镜
      const helmet = mesh(
        new T.SphereGeometry(0.178, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.46),
        matHelmet, 0, 1.752, 0
      );
      helmet.scale.set(1, 0.98, 1.02);
      mesh(new T.CylinderGeometry(0.178, 0.182, 0.022, 14), matHelmet, 0, 1.776, 0);
      mesh(new T.CylinderGeometry(0.181, 0.181, 0.026, 14), matStrap, 0, 1.792, 0);
      mesh(new T.BoxGeometry(0.05, 0.032, 0.1), matVestDark, -0.158, 1.795, 0);
      mesh(new T.BoxGeometry(0.05, 0.032, 0.1), matVestDark, 0.158, 1.795, 0);
      mesh(new T.BoxGeometry(0.07, 0.05, 0.055), matVestDark, 0, 1.845, -0.15);
      // 护目镜（位于眉骨以下、眼睛之前，避免被头盔遮住）
      mesh(new T.BoxGeometry(0.235, 0.05, 0.035), matRubber, 0, 1.764, -0.138);
      mesh(new T.BoxGeometry(0.205, 0.044, 0.022), matLens, 0, 1.764, -0.158);
      mesh(new T.BoxGeometry(0.02, 0.05, 0.03), matVestDark, -0.118, 1.764, -0.145);
      mesh(new T.BoxGeometry(0.02, 0.05, 0.03), matVestDark, 0.118, 1.764, -0.145);
      // 下颌带
      const strapL = mesh(new T.BoxGeometry(0.018, 0.13, 0.018), matStrap, -0.105, 1.69, -0.075);
      strapL.rotation.z = 0.22;
      const strapR = mesh(new T.BoxGeometry(0.018, 0.13, 0.018), matStrap, 0.105, 1.69, -0.075);
      strapR.rotation.z = -0.22;
      mesh(new T.BoxGeometry(0.15, 0.018, 0.018), matStrap, 0, 1.632, -0.08);
      // 肩章（阵营识别）
      mesh(new T.BoxGeometry(0.07, 0.08, 0.014), matVestDark, -0.34, 1.55, -0.06);
      mesh(new T.BoxGeometry(0.07, 0.015, 0.016), matAccent, -0.34, 1.565, -0.066);

      // ---------- 武器：完整步枪轮廓 ----------
      const gun = new T.Group();
      mesh(new T.BoxGeometry(0.075, 0.105, 0.34), matGun, 0, 0, -0.02, gun);
      mesh(new T.BoxGeometry(0.068, 0.078, 0.28), matVestDark, 0, 0.004, -0.32, gun);
      const barrel = mesh(new T.CylinderGeometry(0.017, 0.017, 0.3, 8), matGun, 0, 0.012, -0.57, gun);
      barrel.rotation.x = Math.PI / 2;
      const muzzle = mesh(new T.CylinderGeometry(0.026, 0.02, 0.07, 8), matGun, 0, 0.012, -0.73, gun);
      muzzle.rotation.x = Math.PI / 2;
      mesh(new T.BoxGeometry(0.058, 0.095, 0.22), matVestDark, 0, -0.012, 0.25, gun);
      const grip = mesh(new T.BoxGeometry(0.05, 0.14, 0.06), matGun, 0, -0.105, 0.06, gun);
      grip.rotation.x = -0.2;
      const mag = mesh(new T.BoxGeometry(0.055, 0.18, 0.085), matGun, 0, -0.125, -0.13, gun);
      mag.rotation.x = 0.14;
      const optic = mesh(new T.CylinderGeometry(0.032, 0.032, 0.14, 10), matGun, 0, 0.1, -0.1, gun);
      optic.rotation.x = Math.PI / 2;
      mesh(new T.CircleGeometry(0.028, 10), matLens, 0, 0.1, -0.171, gun).rotation.y = Math.PI;
      mesh(new T.BoxGeometry(0.02, 0.03, 0.1), matSteel, 0, 0.075, 0.02, gun);

      this.gunTip = new T.Object3D();
      this.gunTip.position.set(0, 0.012, -0.78);
      gun.add(this.gunTip);

      this.flash = new T.Mesh(new T.SphereGeometry(0.14, 8, 6),
        new T.MeshBasicMaterial({ color: 0xffd08a, transparent: true, opacity: 0.95 }));
      this.flash.visible = false;
      this.flash.position.set(0, 0.012, -0.78);
      gun.add(this.flash);

      gun.position.set(0.02, -0.57, -0.06);
      gun.rotation.set(0.05, 0.12, 0);
      this.armR.add(gun);
      this.gun = gun;

      // ---------- 近战匕首（绝对坐标，便于突刺动画） ----------
      const knife = new T.Group();
      const kBlade = new T.Mesh(new T.BoxGeometry(0.032, 0.014, 0.4),
        new T.MeshLambertMaterial({ color: 0xc8d0da, emissive: 0x1a1d22 }));
      kBlade.position.set(0, 0, -0.24);
      const kHandle = new T.Mesh(new T.BoxGeometry(0.05, 0.05, 0.15),
        new T.MeshLambertMaterial({ color: 0x20242a }));
      kHandle.position.set(0, 0, 0.02);
      knife.add(kBlade, kHandle);
      knife.position.set(0.33, 1.34, -0.48);
      knife.rotation.set(0.1, 0, -0.35);
      knife.visible = false;
      this.knife = knife;
      this.meleeSwing = 0;

      // ---------- 脚下投影与阵营环 ----------
      const shadow = new T.Mesh(new T.CircleGeometry(0.5, 18),
        new T.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.26, depthWrite: false }));
      shadow.rotation.x = -Math.PI / 2;
      shadow.position.y = 0.02;
      const ring = new T.Mesh(new T.RingGeometry(0.44, 0.55, 22),
        new T.MeshBasicMaterial({ color: conf.accent, transparent: true, opacity: 0.38, side: T.DoubleSide, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.032;

      g.add(pelvis, torso, head, helmet, shadow, ring);
      this.mesh = g;
      this.mesh.userData.soldier = this;

      // 命中判定（hitscan 使用球形近似，这里保留部件映射供扩展）
      this.hitParts = [];
      const parts = [
        [head, 'head', 2.0],
        [helmet, 'head', 2.0],
        [torso, 'body', 1.0],
        [shoulderL, 'body', 0.95],
        [shoulderR, 'body', 0.95]
      ];
      for (const [m, part, mult] of parts) {
        m.userData.soldier = this;
        m.userData.part = part;
        m.userData.mult = mult;
        this.hitParts.push(m);
      }
      this.game.scene.add(g);
    }

    spawn(position) {
      this.pos.copy(position);
      this.pos.y = 0;
      this.hp = this.maxHp;
      this.alive = true;
      this.stunTimer = 0;
      this.deadTime = 0;
      this.mesh.visible = true;
      this.mesh.position.copy(this.pos);
      this.mesh.rotation.set(0, this.yaw, 0);
      this.mesh.scale.setScalar(1);
      for (const m of this.mats) { m.transparent = false; m.opacity = 1; }
      this.target = null;
      this.path = [];
      this.pathIndex = 0;
      this.pathTimer = 0;
      this.fireTimer = 0.3;
      this.reaction = 0.3 + Math.random() * 0.4;
      this.burstLeft = 0;
      this.burstPause = 0;
      this.goal.copy(position);
      this.meleeSwing = 0;
      if (this.knife) this.knife.visible = false;
    }

    get eyePos() {
      return new T.Vector3(this.pos.x, 1.68, this.pos.z);
    }
    get chestPos() {
      return new T.Vector3(this.pos.x, 1.25, this.pos.z);
    }
    get muzzlePos() {
      const v = new T.Vector3();
      this.gunTip.getWorldPosition(v);
      return v;
    }

    takeDamage(amount, attacker, part) {
      if (!this.alive) return;
      let dmg = amount;
      if (part === 'head') dmg *= 1.55;
      else if (part === 'limb') dmg *= 0.82;
      this.hp -= dmg;
      if (this.game && this.game.particles) {
        this.game.particles.spark(this.chestPos, part === 'head' ? 0xffe7a0 : 0xffb070, 5);
      }
      if (this.hp <= 0) this.die(attacker, part);
    }

    die(attacker) {
      if (!this.alive) return;
      this.alive = false;
      this.hp = 0;
      this.deadTime = 0;
      this.respawnTimer = 3.6;
      this.mesh.visible = true;
      this.flash.visible = false;
      if (this.knife) this.knife.visible = false;
      this.meleeSwing = 0;
      if (this.game) {
        this.game.onSoldierDown(this, attacker);
      }
    }

    update(dt) {
      if (!this.alive) {
        this._updateDead(dt);
        return;
      }
      this.mesh.position.copy(this.pos);
      this.yaw = this.mesh.rotation.y;

      if (this.stunTimer > 0) {
        this.stunTimer -= dt;
        this.engaged = false;
        this._animate(dt, 0, false);
        return;
      }

      // 感知
      this.perceptionTimer -= dt;
      if (this.perceptionTimer <= 0) {
        this.perceptionTimer = 0.22 + Math.random() * 0.12;
        this._perceive();
      }

      const target = this.target;
      let moving = false;
      let speed = this.speed;

      if (target) {
        const tx = target.pos.x, tz = target.pos.z;
        const dx = tx - this.pos.x, dz = tz - this.pos.z;
        const dist = Math.hypot(dx, dz) || 0.001;
        const visible = this._canSee(target);
        if (visible) {
          this.lastSeen = new T.Vector3(tx, 0, tz);
          const wantDist = this.weaponKey === 'smg' ? 17 : this.weaponKey === 'pistol' ? 14 : 28;
          this.engaged = true;
          if (dist > wantDist + 6) {
            this._moveTowards(tx, tz, dt, speed);
            moving = true;
          } else if (dist < wantDist - 8 || this.hp < 32) {
            this._moveTowards(this.pos.x - dx / dist * 3, this.pos.z - dz / dist * 3, dt, speed * 0.95);
            moving = true;
          } else {
            // 侧移
            this.strafeTimer -= dt;
            if (this.strafeTimer <= 0) {
              this.strafeTimer = 0.8 + Math.random() * 1.1;
              this.strafeDir *= -1;
            }
            const sx = -dz / dist * this.strafeDir, sz = dx / dist * this.strafeDir;
            this._moveTowards(this.pos.x + sx * 2, this.pos.z + sz * 2, dt, speed * 0.55);
            moving = true;
          }
          // 面向目标
          const wantYaw = Math.atan2(-dx, -dz);
          this.mesh.rotation.y = lerpAngle(this.mesh.rotation.y, wantYaw, Math.min(1, dt * 9));
          this._tryShoot(dt, visible);
        } else {
          this.engaged = false;
          this._advance(dt, target.pos, speed * 1.12);
          moving = true;
          // 转向移动方向
          const mvYaw = Math.atan2(-(this.goal.x - this.pos.x), -(this.goal.z - this.pos.z));
          this.mesh.rotation.y = lerpAngle(this.mesh.rotation.y, mvYaw, Math.min(1, dt * 4));
        }
      } else {
        this.engaged = false;
        // 开局加速抢占中路，避免前 15 秒空转
        const rush = this.game.time < 18 ? 1.38 : 1;
        this._advance(dt, null, speed * rush);
        if (this.path.length) {
          const p = this.path[this.pathIndex] || this.path[0];
          const mvYaw = Math.atan2(-(p.x - this.pos.x), -(p.z - this.pos.z));
          this.mesh.rotation.y = lerpAngle(this.mesh.rotation.y, mvYaw, Math.min(1, dt * 4));
        }
        moving = true;
      }

      this.yaw = this.mesh.rotation.y;
      this._animate(dt, moving ? speed : 0, this.engaged);
    }

    _updateDead(dt) {
      const m = this.mesh;
      this.deadTime += dt;
      if (this.deadTime > 0.05) {
        m.rotation.z = Math.min(Math.PI / 2, m.rotation.z + dt * 5.2);
        m.position.y = Math.max(-0.1, m.position.y - dt * 0.25);
      }
      this.respawnTimer -= dt;
      if (this.respawnTimer <= 0) {
        const spawn = this.game.pickSpawn(this.team);
        this.mesh.rotation.set(0, this.yaw, 0);
        this.mesh.position.y = 0;
        this.spawn(spawn);
        this.game.onSoldierRespawn(this);
      }
    }

    _perceive() {
      const enemies = this.game.getLivingEnemies(this.team);
      let best = null, bestScore = Infinity;
      const myEye = this.eyePos;
      for (const e of enemies) {
        const dx = e.pos.x - this.pos.x, dz = e.pos.z - this.pos.z;
        const dist = Math.hypot(dx, dz);
        if (dist > 78) continue;
        let visible = false;
        if (dist < 46) visible = this.game.world.lineClear(this.pos.x, this.pos.z, e.pos.x, e.pos.z);
        // 近距离即使无视线也「察觉」
        if (!visible && dist < 9) visible = true;
        if (!visible) continue;
        let score = dist;
        if (this.target === e) score -= 12;
        if (score < bestScore) { bestScore = score; best = e; }
      }
      if (best) {
        if (best !== this.target) {
          this.target = best;
          this.reaction = 0.22 + Math.random() * 0.42;
          this.path = [];
        }
      } else {
        // 保留最后目标一小段时间
        if (this.lastSeen) {
          const d = Math.hypot(this.lastSeen.x - this.pos.x, this.lastSeen.z - this.pos.z);
          if (d < 3) this.target = null;
        }
        if (!this.target) {
          // 没有可见敌人：朝最近的敌人前进，保持交火
          let near = null, nd = Infinity;
          for (const e of enemies) {
            const d = Math.hypot(e.pos.x - this.pos.x, e.pos.z - this.pos.z);
            if (d < nd) { nd = d; near = e; }
          }
          if (near && nd < 70) this.lastSeen = new T.Vector3(near.pos.x, 0, near.pos.z);
        }
      }
    }

    _canSee(target) {
      if (!target || !target.alive) return false;
      const d = Math.hypot(target.pos.x - this.pos.x, target.pos.z - this.pos.z);
      if (d > 72) return false;
      if (d < 6) return true;
      return this.game.world.lineClear(this.pos.x, this.pos.z, target.pos.x, target.pos.z);
    }

    _advance(dt, explicitTarget, speed) {
      this.pathTimer -= dt;
      const goalPos = explicitTarget || this.lastSeen;
      if (!goalPos) {
        // 无目标：占据中路
        this.goal.set(0, 0, this.team === 'red' ? 8 : -8);
      } else {
        this.goal.set(goalPos.x, 0, goalPos.z);
      }
      const distGoal = Math.hypot(this.goal.x - this.pos.x, this.goal.z - this.pos.z);

      if (this.pathTimer <= 0) {
        this.pathTimer = 1.1 + Math.random() * 0.7;
        const needsPath = this.path.length === 0 ||
          Math.hypot(this.goal.x - this.goalCacheX, this.goal.z - this.goalCacheZ) > 5;
        if (needsPath && distGoal > 4) {
          this.path = this.game.world.nav.findPath(this.pos.x, this.pos.z, this.goal.x, this.goal.z);
          this.pathIndex = 0;
          this.goalCacheX = this.goal.x;
          this.goalCacheZ = this.goal.z;
        }
      }

      let tx, tz;
      if (this.path.length && this.pathIndex < this.path.length) {
        const wp = this.path[this.pathIndex];
        const d = Math.hypot(wp.x - this.pos.x, wp.z - this.pos.z);
        if (d < 1.5) { this.pathIndex++; }
        const cur = this.path[Math.min(this.pathIndex, this.path.length - 1)];
        tx = cur.x; tz = cur.z;
      } else {
        tx = this.goal.x; tz = this.goal.z;
      }

      if (distGoal > 1.6) {
        const moved = this._moveTowards(tx, tz, dt, speed);
        if (!moved) {
          // 卡住：重算路径
          this.pathTimer = 0;
        }
      }
    }

    _moveTowards(tx, tz, dt, speed) {
      let dx = tx - this.pos.x, dz = tz - this.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.001) return false;
      dx /= d; dz /= d;
      const px = this.pos.x, pz = this.pos.z;
      this.game.moveActor(this, dx * speed * dt, dz * speed * dt, this.radius);
      return Math.hypot(this.pos.x - px, this.pos.z - pz) > 0.0004;
    }

    _tryShoot(dt, visible) {
      if (!visible || !this.target) return;
      this.fireTimer -= dt;
      this.reaction -= dt;
      if (this.reaction > 0) return;

      if (this.burstPause > 0) {
        this.burstPause -= dt;
        return;
      }
      if (this.fireTimer > 0) return;

      const stats = this.stats;
      if (this.burstLeft <= 0) {
        this.burstLeft = stats.burst[0] + Math.floor(Math.random() * (stats.burst[1] - stats.burst[0] + 1));
      }

      const dist = Math.hypot(this.target.pos.x - this.pos.x, this.target.pos.z - this.pos.z);
      const spread = stats.spread * (1 + dist / 60) * (this.target.isPlayer ? 1.0 : 1.12);
      this.game.aiFire(this, this.target, spread, stats.dmg, stats.range);

      this.flash.visible = true;
      this.flashTimer = 0.055;
      this.burstLeft--;
      this.fireTimer = 60 / stats.rpm;
      if (this.burstLeft <= 0) {
        this.burstPause = 0.55 + Math.random() * 0.75;
      }
    }

    _animate(dt, moveSpeed, aiming) {
      if (this.flashTimer > 0) {
        this.flashTimer -= dt;
        if (this.flashTimer <= 0) this.flash.visible = false;
      }

      // 腿摆 + 膝关节屈伸，避免「两根木棍」的玩具感
      if (moveSpeed > 0.1) {
        this.walkPhase += dt * 8.4;
        const s = Math.sin(this.walkPhase) * 0.58;
        this.legL.rotation.x = s;
        this.legR.rotation.x = -s;
        this.kneeL.rotation.x = Math.max(0, -s) * 0.85;
        this.kneeR.rotation.x = Math.max(0, s) * 0.85;
        if (!aiming) {
          this.armL.rotation.x = -s * 0.45;
          this.armR.rotation.x = s * 0.45;
          this.elbowL.rotation.x = -0.1;
          this.elbowR.rotation.x = -0.08;
        }
      } else {
        this.legL.rotation.x *= 0.85;
        this.legR.rotation.x *= 0.85;
        this.kneeL.rotation.x *= 0.82;
        this.kneeR.rotation.x *= 0.82;
        if (!aiming) {
          this.armL.rotation.x *= 0.85;
          this.armR.rotation.x *= 0.85;
          this.elbowL.rotation.x *= 0.85;
          this.elbowR.rotation.x *= 0.85;
        }
      }

      // 举枪：正角度让手臂朝角色面向（-Z）抬起，左臂内收托住护木
      if (aiming) {
        const aim = 0.95 + Math.sin(this.game.time * 2 + this.walkPhase) * 0.025;
        const k = Math.min(1, dt * 10);
        this.armR.rotation.x += (aim - this.armR.rotation.x) * k;
        this.armL.rotation.x += (aim + 0.12 - this.armL.rotation.x) * k;
        this.armR.rotation.z += (-0.1 - this.armR.rotation.z) * k;
        this.armL.rotation.z += (0.5 - this.armL.rotation.z) * k;
        this.elbowR.rotation.x += (-0.1 - this.elbowR.rotation.x) * k;
        this.elbowL.rotation.x += (-0.55 - this.elbowL.rotation.x) * k;
        this.elbowL.rotation.z += (0.15 - this.elbowL.rotation.z) * k;
      } else {
        this.armR.rotation.z *= 0.9;
        this.armL.rotation.z *= 0.9;
        this.elbowL.rotation.z *= 0.9;
      }

      // 微幅上下摆动
      const bob = moveSpeed > 0.1 ? Math.abs(Math.sin(this.walkPhase)) * 0.04 : 0;
      this.mesh.position.y = this.pos.y + bob;

      // 匕首突刺（朝前）
      if (this.meleeSwing > 0) {
        this.meleeSwing = Math.max(0, this.meleeSwing - dt);
        const k = 1 - this.meleeSwing / 0.32;
        const punch = Math.sin(CW.Core.clamp(k, 0, 1) * Math.PI);
        this.knife.visible = true;
        this.knife.position.set(0.33 - punch * 0.2, 1.34 - punch * 0.06, -0.48 - punch * 0.36);
        this.knife.rotation.set(0.1, punch * 0.4, -0.35 - punch * 0.55);
        this.armR.rotation.x = 1.05 + punch * 0.55;
        if (this.meleeSwing === 0) this.knife.visible = false;
      }

      // 枪身抵消手臂俯仰/侧倾，保持大致水平（看起来像被双手端住）
      if (this.gun) {
        this.gun.rotation.x = 0.05 - this.armR.rotation.x;
        this.gun.rotation.z = -this.armR.rotation.z;
      }
    }

    dispose() {
      this.game.scene.remove(this.mesh);
    }
  }

  CW.Soldier = Soldier;
  CW.TEAM_CONF = TEAM;
})(window.CW = window.CW || {});
