/* ============================================================
   巷战 3D · 玩家控制器（第一人称）
   ============================================================ */
(function (CW) {
  'use strict';
  const T = THREE;

  const BASE_POS = {
    pistol: new T.Vector3(0.24, -0.19, -0.45),
    rifle: new T.Vector3(0.24, -0.19, -0.52),
    smg: new T.Vector3(0.24, -0.19, -0.48),
    sniper: new T.Vector3(0.24, -0.19, -0.54),
    frag: new T.Vector3(0.26, -0.2, -0.42),
    flash: new T.Vector3(0.26, -0.2, -0.42),
    knife: new T.Vector3(0.26, -0.16, -0.44),
    fists: new T.Vector3(0.26, -0.18, -0.44)
  };

  const MODEL_SCALE = {
    pistol: 0.38, rifle: 0.26, smg: 0.3, sniper: 0.26,
    frag: 0.45, flash: 0.45, knife: 0.6, fists: 0.75
  };

  const RESERVE = {
    pistol: 84,
    rifle: 210,
    smg: 245,
    sniper: 30
  };

  class Player {
    constructor(game) {
      this.game = game;
      this.team = 'red';
      this.name = '你';
      this.isPlayer = true;
      this.maxHp = 100;
      this.hp = 100;
      this.alive = true;
      this.radius = 0.4;
      this.pos = new T.Vector3(0, 0, 42);
      this.yaw = Math.PI;
      this.pitch = 0;
      this.crouching = false;
      this.crouchT = 0;
      this.sprinting = false;
      this.moving = false;
      this.speed = 0;
      this.bobT = 0;
      this.stepDist = 0;
      this.recoilPitch = 0;
      this.recoil = 0;
      this.kick = new T.Vector3();
      this.kickVel = new T.Vector3();
      this.sway = new T.Vector2();
      this.ads = false;
      this.adsAmount = 0;
      this.fireTimer = 0;
      this.reloadTimer = 0;
      this.reloadTotal = 0;
      this.switchTimer = 0;
      this.meleeTimer = 0;
      this.throwAnim = 0;
      this.lastDamageTime = -99;
      this.spawnProtect = 0;
      this.deadTime = 0;
      this.weaponKey = 'rifle';
      this.arsenal = {
        pistol: new CW.Ammo(CW.Weapons.DEFS.pistol.mag, RESERVE.pistol),
        rifle: new CW.Ammo(CW.Weapons.DEFS.rifle.mag, RESERVE.rifle),
        smg: new CW.Ammo(CW.Weapons.DEFS.smg.mag, RESERVE.smg),
        sniper: new CW.Ammo(CW.Weapons.DEFS.sniper.mag, RESERVE.sniper)
      };
      this.grenades = { frag: CW.Weapons.DEFS.frag.count, flash: CW.Weapons.DEFS.flash.count };

      this.camera = game.camera;
      this.camera.rotation.order = 'YXZ';

      // 第一人称武器放在独立场景，避免穿墙与被世界光源过曝
      this.viewCamera = game.viewCamera || game.camera;
      this.viewRoot = new T.Group();
      this.viewRoot.visible = false;
      this.viewCamera.add(this.viewRoot);

      this.viewRoot.position.copy(BASE_POS.rifle);
      this.models = CW.Weapons.buildViewModels();
      for (const k in this.models) {
        const m = this.models[k];
        m.visible = false;
        m.scale.setScalar(MODEL_SCALE[k] || 0.4);
        if (k === 'knife') m.rotation.set(0.12, -0.42, 0.34);
        else if (k === 'fists') m.rotation.set(0.05, -0.22, 0.08);
        else if (k === 'frag' || k === 'flash') m.rotation.set(0.18, 0.32, 0);
        this.viewRoot.add(m);
      }
      this.model = null;

      this.fillLight = new T.PointLight(0xffd9b4, 0.7, 2.6, 2);
      this.fillLight.position.set(0.35, 0.25, 0.25);
      this.viewCamera.add(this.fillLight);

      this.muzzleLight = new T.PointLight(0xffb060, 0, 8, 2);
      this.muzzleLight.position.set(0.1, -0.05, -0.4);
      this.viewRoot.add(this.muzzleLight);
      this.muzzleLightBase = 0;

      this.showModel();
      this._tmpV = new T.Vector3();
      this._tmpDir = new T.Vector3();
      this._muzzleWorld = new T.Vector3();
    }

    get def() {
      return CW.Weapons.DEFS[this.weaponKey];
    }

    get isAds() {
      return this.ads && this.adsAmount > 0.5;
    }

    setTeam(team) {
      this.team = team;
    }

    showModel() {
      for (const k in this.models) this.models[k].visible = false;
      const m = this.models[this.weaponKey];
      if (m) {
        m.visible = true;
        this.model = m;
      }
      const base = BASE_POS[this.weaponKey] || BASE_POS.rifle;
      this.viewRoot.position.copy(base);
      this.recoil = 0;
    }

    resetLoadout() {
      for (const key in this.arsenal) {
        const def = CW.Weapons.DEFS[key];
        const ammo = this.arsenal[key];
        ammo.mag = def.mag;
        ammo.reserve = Math.max(ammo.reserve, Math.floor(RESERVE[key] * 0.6));
        ammo.reloading = false;
      }
      this.grenades.frag = CW.Weapons.DEFS.frag.count;
      this.grenades.flash = CW.Weapons.DEFS.flash.count;
      this.weaponKey = 'rifle';
      this.reloadTimer = 0;
      this.switchTimer = 0;
      this.meleeTimer = 0;
      this.throwAnim = 0;
      this.fireTimer = 0;
      this.ads = false;
      this.adsAmount = 0;
      this.recoilPitch = 0;
      this.kick.set(0, 0, 0);
      this.kickVel.set(0, 0, 0);
      this.showModel();
    }

    spawn(position) {
      this.pos.copy(position);
      this.pos.y = 0;
      this.hp = this.maxHp;
      this.alive = true;
      this.deadTime = 0;
      this.spawnProtect = 1.6;
      this.lastDamageTime = -99;
      this.crouching = false;
      this.crouchT = 0;
      this.speed = 0;
      this.stepDist = 0;
      this.resetLoadout();
      this.game.camera.fov = this.game.baseFov;
      this.game.camera.updateProjectionMatrix();
      this.game.setScopeVisible(false);
      this.applyCamera(0);
    }

    update(dt) {
      if (!this.alive) {
        this.deadTime += dt;
        return;
      }
      const input = this.game.input;
      const keys = input.keys;

      this.fireTimer = Math.max(0, this.fireTimer - dt);
      this.switchTimer = Math.max(0, this.switchTimer - dt);
      this.meleeTimer = Math.max(0, this.meleeTimer - dt);
      this.throwAnim = Math.max(0, this.throwAnim - dt);
      this.spawnProtect = Math.max(0, this.spawnProtect - dt);

      // 换弹
      if (this.reloadTimer > 0) {
        this.reloadTimer -= dt;
        if (this.reloadTimer <= 0) {
          const ammo = this.arsenal[this.weaponKey];
          if (ammo && ammo.finishReload) {
            ammo.finishReload();
            CW.Audio.reload(0);
          }
          this.reloadTimer = 0;
          this.game.updateHUD();
        }
      }

      // 生命回复
      if (this.game.time - this.lastDamageTime > 6 && this.hp < this.maxHp) {
        this.hp = Math.min(this.maxHp, this.hp + 11 * dt);
      }

      // 广告（瞄准）
      const def = this.def;
      const canAds = def.type === 'gun' && this.switchTimer <= 0;
      this.ads = canAds && (input.mouse.right || input.touch.aim) && this.reloadTimer <= 0;
      this.adsAmount += ((this.ads ? 1 : 0) - this.adsAmount) * Math.min(1, dt * 12);
      if (this.adsAmount < 0.002) this.adsAmount = 0;

      // 瞄准视野：狙击枪开镜缩放
      let targetFov = this.game.baseFov;
      if (this.weaponKey === 'sniper') {
        const zoom = def.zoom || 1;
        targetFov = this.game.baseFov / (1 + (zoom - 1) * this.adsAmount);
      }
      if (Math.abs(this.game.camera.fov - targetFov) > 0.04) {
        this.game.camera.fov += (targetFov - this.game.camera.fov) * Math.min(1, dt * 12);
        this.game.camera.updateProjectionMatrix();
      }

      this._move(dt);

      // 射击输入
      const wantFire = def.auto ? (input.mouse.left || input.touch.fire || input.fireQueued) : input.fireQueued;
      if (wantFire && this.switchTimer <= 0) {
        if (def.type === 'melee' || def.type === 'throw') {
          if (input.fireQueued || !this._lastFireHeld) this._tryUse();
        } else {
          this._tryShoot();
        }
      }
      this._lastFireHeld = !!(input.mouse.left || input.touch.fire);

      // 后座力恢复
      this.recoil = Math.max(0, this.recoil - dt * 7.5);
      this.recoilPitch *= Math.max(0, 1 - dt * 9);
      this.kickVel.multiplyScalar(Math.max(0, 1 - dt * 12));
      this.kick.addScaledVector(this.kickVel, dt);
      this.kick.multiplyScalar(Math.max(0, 1 - dt * 9));

      this._updateViewModel(dt);
      this.applyCamera(dt);

      // 狙击镜
      const scopeOn = this.weaponKey === 'sniper' && this.adsAmount > 0.72;
      this.game.setScopeVisible(scopeOn);
      if (this.model && this.weaponKey === 'sniper') {
        this.model.visible = this.adsAmount < 0.82;
      }
    }

    _move(dt) {
      const input = this.game.input;
      const keys = input.keys;
      if (!input.pointerLocked && !this.game.touchActive) {
        // 未锁定时仍可移动，但速度降为走路（避免选单误操作）
      }

      let f = 0, s = 0;
      if (keys.has('KeyW') || keys.has('ArrowUp')) f += 1;
      if (keys.has('KeyS') || keys.has('ArrowDown')) f -= 1;
      if (keys.has('KeyD') || keys.has('ArrowRight')) s += 1;
      if (keys.has('KeyA') || keys.has('ArrowLeft')) s -= 1;

      const touch = input.touch;
      if (this.game.touchActive) {
        f += touch.moveY;
        s += touch.moveX;
      }
      f = CW.Core.clamp(f, -1, 1);
      s = CW.Core.clamp(s, -1, 1);

      this.crouching = keys.has('KeyC') || keys.has('ControlLeft');
      const wantSprint = (keys.has('ShiftLeft') || keys.has('ShiftRight')) && f > 0.3 && !this.crouching && !this.ads;
      this.sprinting = wantSprint && this.speed > 2;

      const wishLen = Math.hypot(f, s);
      let dx = 0, dz = 0;
      if (wishLen > 0.01) {
        const yaw = this.yaw;
        const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
        const rx = Math.cos(yaw), rz = -Math.sin(yaw);
        let wx = fx * f + rx * s;
        let wz = fz * f + rz * s;
        const wl = Math.hypot(wx, wz) || 1;
        wx /= wl; wz /= wl;
        const target = this.crouching ? 2.25 : this.sprinting ? 7.1 : 4.55;
        this.speed += (target - this.speed) * Math.min(1, dt * 10);
        dx = wx * this.speed * dt;
        dz = wz * this.speed * dt;
        this.moving = this.speed > 0.4;
        if (this.moving) {
          this.bobT += dt * (this.sprinting ? 13 : this.crouching ? 5 : 9);
          this.stepDist += this.speed * dt;
          if (this.stepDist > 2.35) {
            this.stepDist = 0;
            CW.Audio.step(this.sprinting ? 0.04 : 0);
          }
        }
        if (this.game.moveActor(this, dx, dz, this.radius)) {
          // 撞墙：些微降速
          this.speed *= 0.94;
        }
      } else {
        this.speed += (0 - this.speed) * Math.min(1, dt * 12);
        this.moving = this.speed > 0.4;
        if (this.moving) {
          this.bobT += dt * 6;
          const yaw = this.yaw;
          this.game.moveActor(this, -Math.sin(yaw) * this.speed * dt, -Math.cos(yaw) * this.speed * dt, this.radius);
        }
      }

      this.crouchT += ((this.crouching ? 1 : 0) - this.crouchT) * Math.min(1, dt * 12);
      // 边界
      const b = this.game.world.bounds;
      this.pos.x = CW.Core.clamp(this.pos.x, b.minX + 1.6, b.maxX - 1.6);
      this.pos.z = CW.Core.clamp(this.pos.z, b.minZ + 1.6, b.maxZ - 1.6);
    }

    applyCamera(dt) {
      const bobAmp = this.moving ? (this.sprinting ? 0.055 : 0.03) : 0;
      const bob = Math.sin(this.bobT) * bobAmp * (1 - this.adsAmount * 0.7);
      const swayRoll = Math.sin(this.bobT * 0.5) * (this.moving ? 0.012 : 0);
      this.camera.position.set(
        this.pos.x,
        1.68 - this.crouchT * 0.54 + bob,
        this.pos.z
      );
      this.camera.rotation.set(
        this.pitch + this.recoilPitch,
        this.yaw,
        swayRoll,
        'YXZ'
      );
    }

    _updateViewModel(dt) {
      const input = this.game.input;
      const base = BASE_POS[this.weaponKey] || BASE_POS.rifle;
      const adsBase = { x: 0, y: -0.045, z: -0.38 };
      const tgt = new T.Vector3(
        CW.Core.lerp(base.x, adsBase.x, this.adsAmount * 0.85),
        CW.Core.lerp(base.y, adsBase.y, this.adsAmount * 0.85),
        CW.Core.lerp(base.z, adsBase.z, this.adsAmount * 0.85)
      );

      // 鼠标摆动
      const swayX = CW.Core.clamp(-input.lookDX * 0.0016, -0.05, 0.05);
      const swayY = CW.Core.clamp(input.lookDY * 0.0012, -0.04, 0.04);
      this.sway.x += (swayX - this.sway.x) * Math.min(1, dt * 10);
      this.sway.y += (swayY - this.sway.y) * Math.min(1, dt * 10);

      const speedFactor = CW.Core.clamp(this.speed / 7, 0, 1);
      const bob = Math.sin(this.bobT) * 0.012 * speedFactor * (1 - this.adsAmount);
      const bobSide = Math.cos(this.bobT * 0.5) * 0.01 * speedFactor * (1 - this.adsAmount);

      this.viewRoot.position.set(
        tgt.x + this.sway.x + bobSide + this.kick.x,
        tgt.y + this.sway.y + bob + this.kick.y - this.reloadDip(),
        tgt.z + this.kick.z
      );
      this.viewRoot.rotation.set(
        this.kick.y * 0.8 + this.sway.y * 0.6,
        this.sway.x * 1.6,
        this.sway.x * 0.8 + (this.throwAnim > 0 ? 0.5 : 0)
      );

      if (this.muzzleLight.intensity > 0.02) {
        this.muzzleLight.intensity = Math.max(0, this.muzzleLight.intensity - dt * 26);
      }
    }

    reloadDip() {
      if (this.reloadTimer <= 0 || !this.reloadTotal) return 0;
      const t = 1 - this.reloadTimer / this.reloadTotal;
      return Math.sin(Math.min(1, t) * Math.PI) * 0.12;
    }

    _tryUse() {
      const def = this.def;
      if (def.type === 'throw') this._throwGrenade();
      else this._melee();
    }

    _throwGrenade() {
      const kind = this.weaponKey;
      if (this.grenades[kind] <= 0) {
        this.game.showToast('已无' + this.def.name);
        this.switchWeapon('rifle');
        return;
      }
      if (this.fireTimer > 0) return;
      this.grenades[kind]--;
      this.fireTimer = 0.75;
      this.throwAnim = 0.4;
      this.game.input.fireQueued = false;

      this.camera.updateMatrixWorld(true);
      const origin = new T.Vector3();
      this.camera.getWorldPosition(origin);
      const dir = new T.Vector3();
      this.camera.getWorldDirection(dir);
      origin.addScaledVector(dir, 0.7);
      const def = this.def;
      const vel = new T.Vector3(
        dir.x * def.throwSpeed,
        dir.y * def.throwSpeed + 2.6,
        dir.z * def.throwSpeed
      );
      this.game.spawnGrenade(kind, this, origin, vel, def.fuse);
      CW.Audio.throwNade();
      if (this.grenades[kind] <= 0) {
        this.game.showToast('已无' + def.name);
        this.switchWeapon('rifle');
      }
      this.game.updateHUD();
    }

    _melee() {
      if (this.meleeTimer > 0) return;
      const def = this.def;
      this.meleeTimer = def.rate;
      this.fireTimer = def.rate * 0.8;
      this.game.input.fireQueued = false;
      this.kickVel.z += 0.5;
      this.kickVel.x += (Math.random() < 0.5 ? -1 : 1) * 0.18;
      this.game.playerMelee(this, def);
      this.game.updateHUD();
    }

    _tryShoot() {
      const def = this.def;
      if (this.reloadTimer > 0 || this.switchTimer > 0 || this.fireTimer > 0) return;
      const ammo = this.arsenal[this.weaponKey];
      if (!ammo) return;
      if (ammo.mag <= 0) {
        this.tryReload();
        return;
      }
      if (!ammo.fire()) return;
      this.fireTimer = 60 / def.rpm;
      this.game.input.fireQueued = false;
      this.game.stats.shots++;

      this.recoil = Math.min(1.8, this.recoil + def.recoil * 0.22);
      this.recoilPitch += def.recoil * 0.0075;
      this.kickVel.z += def.recoil * 0.16;
      this.kickVel.y += def.recoil * 0.02;
      this.muzzleLight.intensity = 3.2;

      this.camera.updateMatrixWorld(true);
      const origin = new T.Vector3();
      this.camera.getWorldPosition(origin);
      const dir = new T.Vector3();
      this.camera.getWorldDirection(dir);

      let spread = def.spread * (1 - this.adsAmount * 0.55);
      if (this.moving) spread += def.moveSpread * (this.sprinting ? 1.3 : 1);
      if (this.crouching) spread *= 0.72;
      if (!this.ads) spread += this.recoil * 0.002;
      const shot = CW.Core.randomInCone(dir.x, dir.y, dir.z, spread, Math.random);
      dir.set(shot.x, shot.y, shot.z);

      let muzzle = null;
      if (this.model && this.model.userData.muzzle) {
        this.model.userData.muzzle.getWorldPosition(this._muzzleWorld);
        // 检视模型位在独立场景，转回主世界座标以产生曳光与枪口火光
        this._muzzleWorld.applyMatrix4(this.game.camera.matrixWorld);
        muzzle = this._muzzleWorld.clone();
        this.game.effects.muzzleFlash(muzzle, def.key === 'sniper' ? 1.35 : 1);
      }

      CW.Audio.shot(def.sound, 0, 26);
      this.game.hitscan(this, origin, dir, def.range, def.dmg, def.head, {
        muzzle,
        weapon: this.weaponKey,
        isPlayer: true
      });
      this.game.updateHUD();
    }

    quickMelee() {
      if (!this.alive || this.meleeTimer > 0 || this.switchTimer > 0) return;
      const def = CW.Weapons.DEFS.knife;
      this.meleeTimer = 0.5;
      this.fireTimer = 0.36;
      this.throwAnim = 0.2;
      this.kickVel.z += 0.5;
      this.kickVel.x += (Math.random() < 0.5 ? -1 : 1) * 0.16;
      this.game.playerMelee(this, def);
      this.game.updateHUD();
    }

    quickThrow(kind) {
      if (!this.alive) return;
      const def = CW.Weapons.DEFS[kind];
      if (!def) return;
      if (this.grenades[kind] <= 0) {
        this.game.showToast('已无' + def.name);
        return;
      }
      if (this.fireTimer > 0 || this.switchTimer > 0) return;
      this.grenades[kind]--;
      this.fireTimer = 0.9;
      this.throwAnim = 0.4;
      this.game.input.fireQueued = false;
      this.camera.updateMatrixWorld(true);
      const origin = new T.Vector3();
      this.camera.getWorldPosition(origin);
      const dir = new T.Vector3();
      this.camera.getWorldDirection(dir);
      origin.addScaledVector(dir, 0.7);
      const vel = new T.Vector3(
        dir.x * def.throwSpeed,
        dir.y * def.throwSpeed + 2.6,
        dir.z * def.throwSpeed
      );
      this.game.spawnGrenade(kind, this, origin, vel, def.fuse);
      CW.Audio.throwNade();
      if (this.grenades[kind] <= 0) this.game.showToast('已无' + def.name);
      this.game.updateHUD();
    }

    tryReload() {
      const def = this.def;
      if (!def || def.type !== 'gun') return;
      if (this.reloadTimer > 0 || this.switchTimer > 0) return;
      const ammo = this.arsenal[this.weaponKey];
      if (!ammo || !ammo.startReload()) return;
      this.reloadTotal = def.reload;
      this.reloadTimer = def.reload;
      CW.Audio.reload(0);
      this.game.updateHUD();
    }

    switchWeapon(key) {
      if (!this.alive) return;
      if (!CW.Weapons.DEFS[key]) return;
      if (this.weaponKey === key) return;
      const previous = this.weaponKey;
      const prevAmmo = this.arsenal[previous];
      if (prevAmmo && prevAmmo.reloading) prevAmmo.reloading = false;
      this.weaponKey = key;
      this.reloadTimer = 0;
      this.reloadTotal = 0;
      this.switchTimer = 0.28;
      this.meleeTimer = 0;
      this.fireTimer = Math.min(this.fireTimer, 0.2);
      this.ads = false;
      this.adsAmount = 0;
      this.game.setScopeVisible(false);
      this.showModel();
      CW.Audio.switchWeapon();
      this.game.updateHUD();
    }

    cycleWeapon(dir) {
      const order = CW.Weapons.ORDER;
      let i = order.indexOf(this.weaponKey);
      if (i < 0) i = 1;
      for (let n = 0; n < order.length; n++) {
        i = (i + dir + order.length) % order.length;
        const key = order[i];
        const def = CW.Weapons.DEFS[key];
        if (def.type === 'throw' && this.grenades[key] <= 0) continue;
        this.switchWeapon(key);
        return;
      }
    }

    takeDamage(amount, attacker) {
      if (!this.alive || this.spawnProtect > 0) return;
      this.hp -= amount;
      this.lastDamageTime = this.game.time;
      CW.Audio.hurt();
      this.game.showDamage(attacker, amount);
      if (this.hp <= 0) {
        this.hp = 0;
        this.die(attacker);
      }
    }

    die(attacker) {
      if (!this.alive) return;
      this.alive = false;
      this.hp = 0;
      this.deadTime = 0;
      this.ads = false;
      this.adsAmount = 0;
      this.game.setScopeVisible(false);
      this.game.onPlayerDown(attacker);
    }

    dispose() {
      this.viewCamera.remove(this.viewRoot);
      this.viewCamera.remove(this.fillLight);
    }
  }

  CW.Player = Player;
})(window.CW = window.CW || {});
