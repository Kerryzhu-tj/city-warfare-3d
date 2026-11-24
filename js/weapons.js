/* ============================================================
   巷战 3D · 武器定义、第一人称模型、投掷物
   ============================================================ */
(function (CW) {
  'use strict';
  const T = THREE;
  const Weapons = {};

  Weapons.ORDER = ['pistol', 'rifle', 'smg', 'sniper', 'frag', 'flash', 'knife', 'fists'];

  Weapons.DEFS = {
    pistol: {
      key: 'pistol', name: '手枪', en: 'PISTOL', slot: 1, type: 'gun', sound: 'pistol',
      dmg: 32, head: 2.0, rpm: 380, mag: 12, reload: 1.05,
      spread: 0.004, moveSpread: 0.022, range: 70, recoil: 0.9, auto: false, pellets: 1
    },
    rifle: {
      key: 'rifle', name: '自动步枪', en: 'ASSAULT RIFLE', slot: 2, type: 'gun', sound: 'rifle',
      dmg: 21, head: 1.8, rpm: 620, mag: 30, reload: 1.9,
      spread: 0.008, moveSpread: 0.03, range: 120, recoil: 0.62, auto: true, pellets: 1
    },
    smg: {
      key: 'smg', name: '冲锋枪', en: 'SMG', slot: 3, type: 'gun', sound: 'smg',
      dmg: 14, head: 1.7, rpm: 950, mag: 35, reload: 1.6,
      spread: 0.013, moveSpread: 0.04, range: 60, recoil: 0.42, auto: true, pellets: 1
    },
    sniper: {
      key: 'sniper', name: '狙击枪', en: 'SNIPER', slot: 4, type: 'gun', sound: 'sniper',
      dmg: 105, head: 2.2, rpm: 45, mag: 5, reload: 2.7,
      spread: 0.0012, moveSpread: 0.06, range: 240, recoil: 2.8, auto: false, pellets: 1, zoom: 3.4
    },
    frag: {
      key: 'frag', name: '手榴弹', en: 'FRAG', slot: 5, type: 'throw', sound: 'throw',
      count: 3, fuse: 2.4, radius: 7.5, dmg: 95, throwSpeed: 17
    },
    flash: {
      key: 'flash', name: '闪光手雷', en: 'FLASHBANG', slot: 6, type: 'throw', sound: 'throw',
      count: 2, fuse: 1.6, radius: 9.5, stun: 3.4, throwSpeed: 18
    },
    knife: {
      key: 'knife', name: '匕首', en: 'KNIFE', slot: 7, type: 'melee', sound: 'knife',
      dmg: 55, range: 2.5, rate: 0.42, head: 1.5
    },
    fists: {
      key: 'fists', name: '武术', en: 'MARTIAL ARTS', slot: 8, type: 'melee', sound: 'fist',
      dmg: 20, range: 2.3, rate: 0.3, head: 1.2, combo: true
    }
  };

  /* ---------------- 第一人称模型 ---------------- */
  const matCache = {};
  function mat(color, emissive) {
    const key = color + '|' + (emissive || 0);
    if (!matCache[key]) {
      matCache[key] = new T.MeshLambertMaterial({ color, emissive: emissive || 0x000000 });
    }
    return matCache[key];
  }

  function box(w, h, d, m, x, y, z) {
    const mesh = new T.Mesh(new T.BoxGeometry(w, h, d), m);
    mesh.position.set(x, y, z);
    return mesh;
  }

  const skinMat = new T.MeshLambertMaterial({ color: 0x9a7458 });
  const gloveMat = new T.MeshLambertMaterial({ color: 0x2b3037 });
  const sleeveMat = new T.MeshLambertMaterial({ color: 0x232930 });

  /* 右手握持：掌心包住握把，袖子朝镜头方向延伸 */
  function addRightHand(g, x, y, z, tilt) {
    const hand = box(0.1, 0.13, 0.15, skinMat, x, y, z);
    const cuff = box(0.12, 0.13, 0.09, gloveMat, x + 0.005, y - 0.01, z + 0.09);
    const sleeve = box(0.115, 0.12, 0.26, sleeveMat, x + 0.01, y - 0.02, z + 0.24);
    if (tilt) {
      hand.rotation.x = tilt;
      cuff.rotation.x = tilt;
      sleeve.rotation.x = tilt;
    }
    g.add(hand, cuff, sleeve);
  }

  /* 左手托住前护木 */
  function addLeftHand(g, x, y, z) {
    const glove = box(0.1, 0.09, 0.12, gloveMat, x, y, z);
    const hand = box(0.09, 0.075, 0.11, skinMat, x + 0.01, y + 0.015, z);
    const sleeve = box(0.1, 0.1, 0.22, sleeveMat, x + 0.04, y + 0.02, z + 0.13);
    sleeve.rotation.z = 0.22;
    g.add(glove, hand, sleeve);
  }

  Weapons.buildViewModels = function () {
    const models = {};
    const dark = mat(0x191d22);
    const steel = mat(0x3a434e);
    const tan = mat(0x443a2b);
    const accent = mat(0x0a0d11);

    // 手枪
    {
      const g = new T.Group();
      const body = box(0.1, 0.14, 0.34, dark, 0, 0, 0);
      const slide = box(0.09, 0.05, 0.36, steel, 0, 0.08, -0.02);
      const grip = box(0.09, 0.2, 0.12, accent, 0, -0.14, 0.12);
      grip.rotation.x = -0.22;
      const barrel = box(0.045, 0.045, 0.12, accent, 0, 0.04, -0.22);
      g.add(body, slide, grip, barrel);
      addRightHand(g, 0.005, -0.16, 0.14, -0.18);
      const muzzle = new T.Object3D(); muzzle.position.set(0, 0.04, -0.3); g.add(muzzle);
      g.userData.muzzle = muzzle;
      models.pistol = g;
    }
    // 自动步枪
    {
      const g = new T.Group();
      g.add(box(0.11, 0.16, 0.62, dark, 0, 0, -0.05));
      g.add(box(0.1, 0.06, 0.66, steel, 0, 0.1, -0.07));
      g.add(box(0.07, 0.07, 0.5, accent, 0, 0.03, -0.46));
      g.add(box(0.08, 0.26, 0.12, accent, 0, -0.18, -0.14)); // 弹匣
      g.add(box(0.09, 0.16, 0.2, tan, 0, -0.02, 0.24)); // 枪托
      g.add(box(0.06, 0.1, 0.14, accent, 0, -0.1, 0.08));
      const scope = box(0.05, 0.05, 0.16, mat(0x1f242a), 0, 0.16, -0.12);
      g.add(scope);
      addRightHand(g, 0.005, -0.15, 0.1, -0.14);
      addLeftHand(g, 0.0, -0.1, -0.32);
      const muzzle = new T.Object3D(); muzzle.position.set(0, 0.03, -0.72); g.add(muzzle);
      g.userData.muzzle = muzzle;
      models.rifle = g;
    }
    // 冲锋枪
    {
      const g = new T.Group();
      g.add(box(0.1, 0.15, 0.44, dark, 0, 0, -0.02));
      g.add(box(0.09, 0.05, 0.46, steel, 0, 0.09, -0.03));
      g.add(box(0.07, 0.07, 0.28, accent, 0, 0.02, -0.32));
      g.add(box(0.075, 0.24, 0.1, accent, 0, -0.17, -0.1));
      g.add(box(0.08, 0.12, 0.16, tan, 0, -0.02, 0.2));
      addRightHand(g, 0.005, -0.16, -0.05, -0.14);
      addLeftHand(g, 0.0, -0.09, -0.28);
      const muzzle = new T.Object3D(); muzzle.position.set(0, 0.02, -0.5); g.add(muzzle);
      g.userData.muzzle = muzzle;
      models.smg = g;
    }
    // 狙击枪
    {
      const g = new T.Group();
      g.add(box(0.11, 0.16, 0.8, dark, 0, 0, -0.08));
      g.add(box(0.08, 0.07, 0.9, steel, 0, 0.03, -0.34));
      g.add(box(0.06, 0.06, 0.62, accent, 0, 0.04, -0.9));
      g.add(box(0.09, 0.16, 0.26, tan, 0, -0.02, 0.32));
      g.add(box(0.07, 0.2, 0.12, accent, 0, -0.16, 0.02));
      // 瞄准镜
      const scope = new T.Mesh(new T.CylinderGeometry(0.055, 0.055, 0.34, 10), mat(0x1b1f25));
      scope.rotation.x = Math.PI / 2;
      scope.position.set(0, 0.17, -0.12);
      g.add(scope);
      const ring = new T.Mesh(new T.TorusGeometry(0.052, 0.012, 6, 12), mat(0x2d333b));
      ring.position.set(0, 0.17, -0.3);
      g.add(ring);
      addRightHand(g, 0.005, -0.17, 0.06, -0.12);
      addLeftHand(g, 0.0, -0.09, -0.3);
      const muzzle = new T.Object3D(); muzzle.position.set(0, 0.03, -1.2); g.add(muzzle);
      g.userData.muzzle = muzzle;
      models.sniper = g;
    }
    // 手榴弹 / 闪光
    ['frag', 'flash'].forEach(key => {
      const g = new T.Group();
      const body = new T.Mesh(new T.SphereGeometry(0.11, 12, 10),
        new T.MeshLambertMaterial({ color: key === 'frag' ? 0x3c4a30 : 0xb8bcc4, emissive: 0x0a0a0a }));
      g.add(body);
      const cap = box(0.07, 0.05, 0.07, mat(0x2a2d33), 0, 0.11, 0);
      g.add(cap);
      const band = new T.Mesh(new T.TorusGeometry(0.112, 0.012, 6, 14),
        new T.MeshBasicMaterial({ color: key === 'frag' ? 0xff6a3a : 0x9fe0ff }));
      band.rotation.x = Math.PI / 2;
      g.add(band);
      // 握持的手
      const glove = box(0.12, 0.12, 0.18, mat(0x2c3138), 0, -0.12, 0.05);
      const wrist = box(0.1, 0.1, 0.16, mat(0x8a6a50), 0, -0.14, 0.17);
      g.add(glove, wrist);
      g.userData.muzzle = new T.Object3D();
      models[key] = g;
    });
    // 匕首
    {
      const g = new T.Group();
      const blade = box(0.045, 0.022, 0.4, mat(0xc8d0da), 0, 0.0, -0.22);
      const guard = box(0.15, 0.03, 0.045, mat(0x3a3f47), 0, 0, 0.0);
      const handle = box(0.05, 0.05, 0.17, mat(0x20242a), 0, 0, 0.1);
      const glove = box(0.11, 0.11, 0.18, mat(0x2c3138), 0, 0.005, 0.15);
      const knuckle = box(0.1, 0.075, 0.1, mat(0x8a6a50), 0, 0.03, 0.07);
      g.add(blade, guard, handle, glove, knuckle);
      models.knife = g;
    }
    // 拳（武术）
    {
      const g = new T.Group();
      const fistMat = new T.MeshLambertMaterial({ color: 0xb08a6a });
      const glove = box(0.17, 0.16, 0.2, mat(0x2c3138), 0, 0, 0);
      const hand = box(0.155, 0.15, 0.14, fistMat, 0, 0, -0.13);
      const forearm = box(0.14, 0.14, 0.3, mat(0x23282e), 0, -0.01, 0.2);
      const cuff = box(0.16, 0.16, 0.06, mat(0x3a4149), 0, 0, 0.12);
      g.add(glove, hand, forearm, cuff);
      models.fists = g;
    }
    return models;
  };

  Weapons.grenadeMesh = function (kind, teamColor) {
    const g = new T.Group();
    const color = kind === 'frag' ? 0x3c4a30 : 0xbfc4cc;
    const body = new T.Mesh(new T.SphereGeometry(0.13, 12, 10),
      new T.MeshLambertMaterial({ color, emissive: kind === 'flash' ? 0x334455 : 0x110c08 }));
    const band = new T.Mesh(new T.TorusGeometry(0.132, 0.018, 6, 14),
      new T.MeshBasicMaterial({ color: teamColor }));
    band.rotation.x = Math.PI / 2;
    const cap = new T.Mesh(new T.CylinderGeometry(0.05, 0.05, 0.06, 8), new T.MeshLambertMaterial({ color: 0x2a2d33 }));
    cap.position.y = 0.13;
    g.add(body, band, cap);
    return g;
  };

  CW.Weapons = Weapons;
})(window.CW = window.CW || {});
