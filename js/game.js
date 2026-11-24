/* ============================================================
   巷战 3D · 主程式：对局流程、战斗判定、HUD 与输入
   ============================================================ */
(function (CW) {
  'use strict';
  const T = THREE;

  const DIFFS = {
    recruit: { key: 'recruit', label: '新兵', spread: 1.55, damage: 0.78, speed: 0.92, grenade: 0.35 },
    veteran: { key: 'veteran', label: '老兵', spread: 1.0, damage: 1.0, speed: 1.02, grenade: 0.7 },
    elite: { key: 'elite', label: '精英', spread: 0.7, damage: 1.15, speed: 1.1, grenade: 1.0 }
  };

  const NAMES = {
    red: ['赤鸦', '赤狼', '赤刃', '赤霆'],
    blue: ['蓝鲨', '蓝枭', '蓝锋', '蓝霜']
  };
  const SIDE_LABEL = { red: '红军', blue: '蓝军' };
  const SIDE_HEX = { red: 0xff6a4a, blue: 0x59a7ff };
  const TARGET_KILLS = 20;
  const MATCH_SECONDS = 360;
  const STORAGE_KEY = 'citywarfare3d.settings.v1';

  class Game {
    constructor() {
      this.state = 'boot';
      this.time = 0;
      this.elapsed = 0;
      this.last = 0;
      this.baseFov = 74;
      this.menuAngle = Math.random() * Math.PI * 2;
      this.soldiers = [];
      this.projectiles = [];
      this.matchScore = new CW.Match(TARGET_KILLS);
      this.matchTime = MATCH_SECONDS;
      this.respawnTimer = 0;
      this.flashTimer = 0;
      this.flashTotal = 1;
      this.flashStrength = 0;
      this.minimapTimer = 0;
      this.audioIntensityTimer = 0;
      this.hudVisible = false;
      this.touchActive = false;
      this.pointerSuppressed = false;
      // 指针锁定只是「鼠标视角」的便捷方式，绝不作为暂停依据。
      this.hadPointerLock = false;
      this.nextLockAttempt = 0;
      this.dragLook = false;
      this._dragX = 0;
      this._dragY = 0;
      this._lockHintTimer = 0;
      this.settings = { team: 'red', difficulty: 'veteran', sensitivity: 1.0, muted: false };
      this.diff = DIFFS.veteran;
      this.stats = this.freshStats();
      this.input = {
        keys: new Set(),
        mouse: { left: false, right: false },
        fireQueued: false,
        pointerLocked: false,
        lookDX: 0,
        lookDY: 0,
        touch: { moveX: 0, moveY: 0, fire: false, aim: false }
      };
      this.scene = new T.Scene();
      this.camera = new T.PerspectiveCamera(this.baseFov, window.innerWidth / Math.max(1, window.innerHeight), 0.06, 700);
      this.camera.rotation.order = 'YXZ';
      this.scene.add(this.camera);
      this.el = {};
      this.toastTimer = 0;
      this.hitmarkerTimer = 0;
      this._tmp = new T.Vector3();
      this._tmp2 = new T.Vector3();
      this._dir = new T.Vector3();
      this._endHandled = false;
    }

    freshStats() {
      return { kills: 0, deaths: 0, shots: 0, hits: 0, headshots: 0, damage: 0 };
    }

    /* ================= 初始化 ================= */
    boot() {
      const canvas = document.getElementById('view');
      try {
        this.renderer = new T.WebGLRenderer({
          canvas,
          antialias: true,
          powerPreference: 'high-performance'
        });
      } catch (err) {
        document.getElementById('loading').classList.remove('hidden');
        document.getElementById('loadingText').textContent = '无法启动 WebGL，请使用支援的浏览器。';
        return;
      }
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
      this.renderer.setSize(window.innerWidth, window.innerHeight, false);
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = T.PCFSoftShadowMap;
      if (T.sRGBEncoding) this.renderer.outputEncoding = T.sRGBEncoding;
      this.renderer.toneMapping = T.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.02;

      this.cacheElements();
      this.loadSettings();
      this.syncSettingsUI();

      this.scene.background = new T.Color(0x0b111a);
      this.effects = new CW.Effects(this.scene);
      this.world = CW.World.build(this.scene, 'high');

      // 第一人称武器使用独立场景与灯光，避免被世界光源冲淡或穿墙
      this.viewScene = new T.Scene();
      this.viewCamera = new T.PerspectiveCamera(65, window.innerWidth / Math.max(1, window.innerHeight), 0.01, 8);
      this.viewScene.add(this.viewCamera);
      this.viewScene.add(new T.AmbientLight(0x9aa8b8, 0.4));
      const vKey = new T.DirectionalLight(0xffd9b0, 0.62);
      vKey.position.set(-1.4, 2.4, 1.8);
      this.viewScene.add(vKey);
      const vRim = new T.DirectionalLight(0x7fb4ff, 0.26);
      vRim.position.set(2, 0.6, -1.6);
      this.viewScene.add(vRim);

      this.particles = {
        spark: (pos, color, count) => this.effects.spark(pos, color, count == null ? 5 : count, 0.6)
      };
      this.player = new CW.Player(this);
      this.player.setTeam(this.settings.team);
      this.player.viewRoot.visible = false;

      this.bindUI();
      this.bindInput();
      this.onResize();

      this.state = 'menu';
      this.startMenuCamera();
      this.setHUDVisible(false);
      document.getElementById('screen-menu').classList.remove('hidden');
      document.getElementById('loading').classList.add('hidden');
      CW.Audio.setMuted(this.settings.muted);

      this.last = performance.now();
      this.loop = this.loop.bind(this);
      requestAnimationFrame(this.loop);
    }

    cacheElements() {
      const ids = [
        'hud', 'hudTeam', 'scoreRed', 'scoreBlue', 'matchTimer', 'scoreTarget',
        'healthValue', 'healthFill', 'healthPanel', 'ammoMag', 'ammoReserve',
        'weaponName', 'weaponSlots', 'minimap', 'killfeed', 'crosshair', 'scope',
        'flashOverlay', 'damageVignette', 'damageDirs', 'hitmarker', 'toast',
        'deathScreen', 'deathKiller', 'deathTimer',
        'screen-menu', 'startBtn', 'sensRange', 'sensValue', 'muteBtn',
        'screen-pause', 'resumeBtn', 'pauseRestart', 'pauseMenu',
        'screen-results', 'resultTag', 'resultTitle', 'resultScore', 'resultStats',
        'rematchBtn', 'resultsMenu', 'loading', 'loadingText',
        'touchUI', 'touchStick', 'touchKnob', 'btnFire', 'btnAim', 'btnReload',
        'btnMelee', 'btnSwap', 'btnNade', 'btnPause', 'lockHint'
      ];
      for (const id of ids) this.el[id] = document.getElementById(id);
      this.el.teamCards = Array.from(document.querySelectorAll('[data-team]'));
      this.el.diffCards = Array.from(document.querySelectorAll('[data-diff]'));
      this.el.mapCtx = this.el.minimap ? this.el.minimap.getContext('2d') : null;
      if (this.el.scoreTarget) this.el.scoreTarget.textContent = TARGET_KILLS;
      this.buildWeaponSlots();
    }

    buildWeaponSlots() {
      const host = this.el.weaponSlots;
      if (!host) return;
      host.innerHTML = '';
      CW.Weapons.ORDER.forEach((key, i) => {
        const def = CW.Weapons.DEFS[key];
        const row = document.createElement('div');
        row.className = 'slot';
        row.dataset.weapon = key;
        row.innerHTML = `<span class="slot__key">${i + 1}</span><span class="slot__name">${def.name}</span><span class="slot__count" data-count></span>`;
        host.appendChild(row);
      });
    }

    /* ================= 设定 ================= */
    loadSettings() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const s = JSON.parse(raw);
          if (s && (s.team === 'red' || s.team === 'blue')) this.settings.team = s.team;
          if (s && DIFFS[s.difficulty]) this.settings.difficulty = s.difficulty;
          if (s && typeof s.sensitivity === 'number') {
            this.settings.sensitivity = CW.Core.clamp(s.sensitivity, 0.35, 2.2);
          }
          if (s && typeof s.muted === 'boolean') this.settings.muted = s.muted;
        }
      } catch (e) { /* 忽略毁损设定 */ }
      this.diff = DIFFS[this.settings.difficulty];
    }

    saveSettings() {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings));
      } catch (e) { /* 无痕模式可能失败 */ }
    }

    syncSettingsUI() {
      for (const c of this.el.teamCards) {
        c.classList.toggle('is-active', c.dataset.team === this.settings.team);
        c.setAttribute('aria-pressed', c.dataset.team === this.settings.team ? 'true' : 'false');
      }
      for (const c of this.el.diffCards) {
        c.classList.toggle('is-active', c.dataset.diff === this.settings.difficulty);
        c.setAttribute('aria-pressed', c.dataset.diff === this.settings.difficulty ? 'true' : 'false');
      }
      if (this.el.sensRange) {
        this.el.sensRange.value = String(this.settings.sensitivity);
        this.el.sensValue.textContent = Number(this.settings.sensitivity).toFixed(2);
      }
      if (this.el.muteBtn) {
        this.el.muteBtn.textContent = this.settings.muted ? '音效：关' : '音效：开';
      }
    }

    bindUI() {
      for (const c of this.el.teamCards) {
        c.addEventListener('click', () => {
          this.settings.team = c.dataset.team;
          this.syncSettingsUI();
          this.saveSettings();
          CW.Audio.ui(true);
        });
      }
      for (const c of this.el.diffCards) {
        c.addEventListener('click', () => {
          this.settings.difficulty = c.dataset.diff;
          this.diff = DIFFS[this.settings.difficulty];
          this.syncSettingsUI();
          this.saveSettings();
          CW.Audio.ui(true);
        });
      }
      if (this.el.sensRange) {
        this.el.sensRange.addEventListener('input', () => {
          this.settings.sensitivity = Number(this.el.sensRange.value);
          this.el.sensValue.textContent = this.settings.sensitivity.toFixed(2);
          this.saveSettings();
        });
      }
      if (this.el.muteBtn) {
        this.el.muteBtn.addEventListener('click', () => this.toggleMute());
      }
      this.el.startBtn.addEventListener('click', () => {
        CW.Audio.resume();
        this.startMatch();
      });
      this.el.resumeBtn.addEventListener('click', () => this.resume());
      this.el.pauseRestart.addEventListener('click', () => this.startMatch());
      this.el.pauseMenu.addEventListener('click', () => this.toMenu());
      this.el.rematchBtn.addEventListener('click', () => this.startMatch());
      this.el.resultsMenu.addEventListener('click', () => this.toMenu());
      if (this.el.btnPause) this.el.btnPause.addEventListener('click', () => this.pause());

      document.addEventListener('pointerlockchange', () => this.onPointerLockChange());
      document.addEventListener('pointerlockerror', () => this.onPointerLockError());
      // 点击按钮后移除焦点，避免空格键误触「继续作战/暂停」等按钮
      document.addEventListener('click', (e) => {
        const btn = e.target && e.target.closest ? e.target.closest('button') : null;
        if (btn && btn.blur) btn.blur();
      }, true);
      document.addEventListener('visibilitychange', () => {
        if (document.hidden && this.state === 'playing') this.pause();
      });
      window.addEventListener('resize', () => this.onResize());
      window.addEventListener('blur', () => {
        this.input.keys.clear();
        this.input.mouse.left = false;
        this.input.mouse.right = false;
        this.dragLook = false;
      });
    }

    toggleMute() {
      this.settings.muted = !this.settings.muted;
      CW.Audio.setMuted(this.settings.muted);
      this.saveSettings();
      this.syncSettingsUI();
      this.showToast(this.settings.muted ? '音效已关闭' : '音效已开启');
    }

    /* ================= 输入 ================= */
    bindInput() {
      const canvas = this.renderer.domElement;

      window.addEventListener('keydown', (e) => {
        if (e.repeat) return;
        if (e.code === 'Escape') {
          if (this.state === 'playing') this.pause();
          return;
        }
        if (e.code === 'KeyM') {
          this.toggleMute();
          return;
        }
        if (this.state !== 'playing') return;
        // 空格 = 射击（与鼠标左键等价），避免按下空格触发聚焦按钮或页面滚动
        if (e.code === 'Space') {
          e.preventDefault();
          if (!this.player || !this.player.alive) return;
          this.input.keys.add(e.code);
          this.input.mouse.left = true;
          this.input.fireQueued = true;
          CW.Audio.resume();
          return;
        }
        const handled = [
          'KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'ShiftRight', 'KeyC',
          'KeyR', 'KeyG', 'KeyF', 'KeyV', 'Space', 'Digit1', 'Digit2',
          'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8'
        ];
        if (handled.indexOf(e.code) >= 0) e.preventDefault();
        this.input.keys.add(e.code);
        if (!this.player || !this.player.alive) return;
        if (e.code === 'KeyR') this.player.tryReload();
        if (e.code === 'KeyV') this.player.quickMelee();
        if (e.code === 'KeyG') this.player.quickThrow('frag');
        if (e.code === 'KeyF') this.player.quickThrow('flash');
        if (/^Digit[1-8]$/.test(e.code)) {
          const idx = Number(e.code.slice(5)) - 1;
          const key = CW.Weapons.ORDER[idx];
          if (key) this.player.switchWeapon(key);
        }
      });

      window.addEventListener('keyup', (e) => {
        if (e.code === 'Space') this.input.mouse.left = false;
        this.input.keys.delete(e.code);
      });

      canvas.addEventListener('mousedown', (e) => {
        if (e.button === 0) {
          this.dragLook = true;
          this._dragX = e.clientX;
          this._dragY = e.clientY;
        }
        if (this.state !== 'playing') return;
        // 未锁定指针时，先尝试锁定；即使失败游戏也继续，可用按住左键拖动视角。
        if (!this.input.pointerLocked && !this.touchActive) this.lockPointer();
        if (e.button === 0) {
          this.input.mouse.left = true;
          this.input.fireQueued = true;
          CW.Audio.resume();
        } else if (e.button === 2) {
          this.input.mouse.right = true;
        }
      });
      window.addEventListener('mouseup', (e) => {
        if (e.button === 0) {
          this.input.mouse.left = false;
          this.dragLook = false;
        }
        if (e.button === 2) this.input.mouse.right = false;
      });
      canvas.addEventListener('contextmenu', (e) => e.preventDefault());

      document.addEventListener('mousemove', (e) => {
        if (this.state !== 'playing') return;
        let dx = 0;
        let dy = 0;
        if (this.input.pointerLocked) {
          dx = e.movementX || 0;
          dy = e.movementY || 0;
        } else if (this.dragLook) {
          // 未获得指针锁定时的兜底：按住鼠标左键拖动即可转向
          dx = e.clientX - this._dragX;
          dy = e.clientY - this._dragY;
          this._dragX = e.clientX;
          this._dragY = e.clientY;
        } else {
          return;
        }
        const s = 0.0021 * this.settings.sensitivity;
        this.player.yaw -= dx * s;
        this.player.pitch = CW.Core.clamp(this.player.pitch - dy * s, -1.42, 1.42);
        this.input.lookDX += dx;
        this.input.lookDY += dy;
      });

      window.addEventListener('wheel', (e) => {
        if (this.state !== 'playing') return;
        e.preventDefault();
        if (this.player && this.player.alive) this.player.cycleWeapon(e.deltaY > 0 ? 1 : -1);
      }, { passive: false });

      canvas.addEventListener('click', () => {
        if (this.state === 'playing' && !this.input.pointerLocked && !this.touchActive) this.lockPointer();
      });

      this.bindTouch();
    }

    enableTouchMode() {
      if (this.touchActive) return;
      this.touchActive = true;
      if (this.el.touchUI) this.el.touchUI.classList.remove('hidden');
      this.hideLockHint();
      // 触屏接管后不再需要指针锁定，且不能因此触发暂停
      if (document.pointerLockElement) {
        this.hadPointerLock = false;
        document.exitPointerLock();
      }
    }

    bindTouch() {
      const stick = this.el.touchStick;
      if (!stick) return;

      // 仅粗指针（手机/平板）默认显示触控；带触摸屏的桌面在首次触摸后再启用
      window.addEventListener('touchstart', () => this.enableTouchMode(), { passive: true, once: true });
      if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) {
        this.enableTouchMode();
      }

      const knob = this.el.touchKnob;
      let stickId = null;
      let lookId = null;
      let lastLook = { x: 0, y: 0 };

      const setStick = (e) => {
        const r = stick.getBoundingClientRect();
        let dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
        let dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
        const len = Math.hypot(dx, dy);
        if (len > 1) { dx /= len; dy /= len; }
        this.input.touch.moveX = dx;
        this.input.touch.moveY = -dy;
        knob.style.transform = `translate(${dx * 34}px, ${dy * 34}px)`;
      };
      const resetStick = () => {
        this.input.touch.moveX = 0;
        this.input.touch.moveY = 0;
        knob.style.transform = 'translate(0px, 0px)';
      };

      if (stick) {
        stick.addEventListener('touchstart', (e) => {
          if (this.state !== 'playing') return;
          e.preventDefault();
          const t = e.changedTouches[0];
          stickId = t.identifier;
          setStick(t);
        }, { passive: false });
        stick.addEventListener('touchmove', (e) => {
          if (stickId == null) return;
          e.preventDefault();
          for (const t of e.changedTouches) if (t.identifier === stickId) setStick(t);
        }, { passive: false });
        const endStick = (e) => {
          for (const t of e.changedTouches) if (t.identifier === stickId) { stickId = null; resetStick(); }
        };
        stick.addEventListener('touchend', endStick);
        stick.addEventListener('touchcancel', endStick);
      }

      const canvas = this.renderer.domElement;
      canvas.addEventListener('touchstart', (e) => {
        if (this.state !== 'playing') return;
        for (const t of e.changedTouches) {
          if (lookId == null) {
            lookId = t.identifier;
            lastLook = { x: t.clientX, y: t.clientY };
          }
        }
      }, { passive: true });
      canvas.addEventListener('touchmove', (e) => {
        if (this.state !== 'playing' || lookId == null) return;
        for (const t of e.changedTouches) {
          if (t.identifier !== lookId) continue;
          const dx = t.clientX - lastLook.x;
          const dy = t.clientY - lastLook.y;
          lastLook = { x: t.clientX, y: t.clientY };
          const s = 0.0026 * this.settings.sensitivity;
          this.player.yaw -= dx * s;
          this.player.pitch = CW.Core.clamp(this.player.pitch - dy * s, -1.42, 1.42);
          this.input.lookDX += dx;
          this.input.lookDY += dy;
        }
        e.preventDefault();
      }, { passive: false });
      const endLook = (e) => {
        for (const t of e.changedTouches) if (t.identifier === lookId) lookId = null;
      };
      canvas.addEventListener('touchend', endLook);
      canvas.addEventListener('touchcancel', endLook);

      // 同时兼容 Pointer Events 与 Touch Events；以 active 守卫避免双触发
      const bindHold = (el, down, up) => {
        if (!el) return;
        let active = false;
        const start = (e) => {
          if (active) return;
          active = true;
          if (e && e.cancelable) e.preventDefault();
          down();
        };
        const stop = () => {
          if (!active) return;
          active = false;
          up();
        };
        el.addEventListener('pointerdown', (e) => { if (e.pointerType === 'mouse') start(e); });
        el.addEventListener('pointerup', (e) => { if (e.pointerType === 'mouse') stop(); });
        el.addEventListener('pointercancel', stop);
        el.addEventListener('touchstart', start, { passive: false });
        el.addEventListener('touchend', (e) => { e.preventDefault(); stop(); }, { passive: false });
        el.addEventListener('touchcancel', stop);
      };
      const bindPress = (el, fn) => {
        if (!el) return;
        let last = 0;
        const press = (e) => {
          const now = performance.now();
          if (now - last < 280) return;
          last = now;
          if (e && e.cancelable) e.preventDefault();
          fn();
        };
        el.addEventListener('pointerdown', (e) => { if (e.pointerType === 'mouse') press(e); });
        el.addEventListener('touchstart', press, { passive: false });
      };
      bindHold(this.el.btnFire, () => { this.input.touch.fire = true; this.input.fireQueued = true; CW.Audio.resume(); }, () => { this.input.touch.fire = false; });
      bindHold(this.el.btnAim, () => { this.input.touch.aim = true; }, () => { this.input.touch.aim = false; });
      bindPress(this.el.btnReload, () => this.player.tryReload());
      bindPress(this.el.btnMelee, () => this.player.quickMelee());
      bindPress(this.el.btnSwap, () => this.player.cycleWeapon(1));
      bindPress(this.el.btnNade, () => this.player.quickThrow('frag'));
    }

    lockPointer() {
      if (this.touchActive || !this.renderer) return;
      const now = performance.now();
      // Chrome 在退出指针锁定后约 1 秒内会拒绝再次锁定，直接跳过而不是反复请求
      if (now < this.nextLockAttempt) {
        if (this.state === 'playing') this.showLockTip();
        return;
      }
      this.nextLockAttempt = now + 1200;
      try {
        const p = this.renderer.domElement.requestPointerLock();
        if (p && p.catch) p.catch(() => this.onPointerLockError());
      } catch (e) {
        this.onPointerLockError();
      }
    }

    onPointerLockError() {
      // 锁定失败绝不影响对局，只提示可用的替代操作
      this.nextLockAttempt = performance.now() + 3200;
      if (this.state === 'playing') {
        this.showLockHint('无法锁定鼠标 · 按住左键拖动视角，空格/左键射击');
      }
    }

    showLockHint(text) {
      const el = this.el && this.el.lockHint;
      if (!el) return;
      if (text) el.textContent = text;
      el.classList.remove('hidden');
      if (this._lockHintTimer) window.clearTimeout(this._lockHintTimer);
      this._lockHintTimer = window.setTimeout(() => {
        el.classList.add('hidden');
        this._lockHintTimer = 0;
      }, 8000);
    }

    showLockTip() {
      if (this.input.pointerLocked || this.touchActive) return;
      this.showLockHint('点击画面可锁定鼠标视角 · 按住左键拖动也可转向 · 空格/左键射击');
    }

    hideLockHint() {
      if (this._lockHintTimer) {
        window.clearTimeout(this._lockHintTimer);
        this._lockHintTimer = 0;
      }
      if (this.el && this.el.lockHint) this.el.lockHint.classList.add('hidden');
    }

    onPointerLockChange() {
      const locked = document.pointerLockElement === this.renderer.domElement;
      const wasLocked = this.input.pointerLocked;
      this.input.pointerLocked = locked;
      // 鼠标锁定时 UI 按钮无法接收点击，隐藏暂停按钮，提示玩家用 Esc
      if (this.el && this.el.btnPause) {
        this.el.btnPause.style.visibility = locked ? 'hidden' : '';
      }
      if (locked) {
        this.hadPointerLock = true;
        this.dragLook = false;
        this.hideLockHint();
        return;
      }
      const intentionalRelease = wasLocked && this.hadPointerLock;
      this.hadPointerLock = false;
      if (this.state !== 'playing' || this.touchActive) return;
      if (intentionalRelease) {
        // 玩家按 Esc 主动退出锁定：暂停一次，符合 FPS 习惯
        this.pause();
      } else {
        // 锁定请求失败/被拒绝：游戏照常进行，仅给出操作提示
        this.showLockTip();
      }
    }

    /* ================= 对局流程 ================= */
    startMenuCamera() {
      this.viewRootVisible(false);
      this.camera.fov = this.baseFov;
      this.camera.updateProjectionMatrix();
      this.camera.rotation.set(0, 0, 0);
      const r = 52;
      this.camera.position.set(Math.cos(this.menuAngle) * r, 18, Math.sin(this.menuAngle) * r);
      this.camera.lookAt(0, 4, 0);
    }

    viewRootVisible(v) {
      if (this.player) this.player.viewRoot.visible = !!v;
    }

    startMatch() {
      if (!this.player) return;
      CW.Audio.resume();
      CW.Audio.init();
      CW.Audio.setMuted(this.settings.muted);
      CW.Audio.startAmbience();
      CW.Audio.startMusic();
      CW.Audio.setMusicIntensity(0.25);

      this.settings.team = this.settings.team === 'blue' ? 'blue' : 'red';
      this.diff = DIFFS[this.settings.difficulty] || DIFFS.veteran;
      this.player.team = this.settings.team;
      this.matchScore = new CW.Match(TARGET_KILLS);
      this.matchTime = MATCH_SECONDS;
      this.stats = this.freshStats();
      this.time = 0;
      this.respawnTimer = 0;
      this.flashTimer = 0;
      this.flashStrength = 0;
      this.lastDamageFlash = 0;
      this._endHandled = false;

      this.resetActors();
      this.effects.clear();
      this.clearKillfeed();
      this.hideOverlay('screen-results');
      this.hideOverlay('screen-pause');
      this.hideOverlay('screen-menu');
      this.hideOverlay('deathScreen');
      this.setHUDVisible(true);

      const spawn = this.pickSpawn(this.player.team);
      this.player.spawn(spawn);
      this.player.yaw = this.player.team === 'red' ? 0 : Math.PI;
      this.player.pitch = 0;
      this.player.applyCamera(0);
      this.viewRootVisible(true);

      this.spawnBots();
      this.input.keys.clear();
      this.input.mouse.left = false;
      this.input.mouse.right = false;
      this.input.fireQueued = false;
      this.input.lookDX = 0;
      this.input.lookDY = 0;

      this.state = 'playing';
      this.setScopeVisible(false);
      this.updateHUD(true);
      this.drawMinimap();
      this.showToast(`${SIDE_LABEL[this.player.team]} · 团队死斗 ${TARGET_KILLS} 杀`);
      this.lockPointer();
      if (!this.touchActive) this.showLockTip();
      CW.Audio.ui(true);
    }

    resetActors() {
      for (const s of this.soldiers) {
        try { this.scene.remove(s.mesh); } catch (e) {}
      }
      this.soldiers.length = 0;
      for (const p of this.projectiles) {
        try { this.scene.remove(p.mesh); } catch (e) {}
      }
      this.projectiles.length = 0;
    }

    spawnBots() {
      const allyTeam = this.player.team;
      const enemyTeam = allyTeam === 'red' ? 'blue' : 'red';
      const allyWeapons = ['rifle', 'smg', 'rifle'];
      const enemyWeapons = ['sniper', 'rifle', 'smg', 'rifle'];
      const allyNames = NAMES[allyTeam].slice();
      const enemyNames = NAMES[enemyTeam].slice();
      for (let i = 0; i < 3; i++) {
        this.addBot(allyTeam, allyWeapons[i], allyNames[i]);
      }
      for (let i = 0; i < 4; i++) {
        this.addBot(enemyTeam, enemyWeapons[i], enemyNames[i]);
      }
    }

    addBot(team, weaponKey, botName) {
      const s = new CW.Soldier(this, team, weaponKey);
      s.displayName = `${SIDE_LABEL[team]}·${botName}`;
      s.baseSpeed = s.speed;
      s.speed = s.baseSpeed * this.diff.speed;
      s.grenadeCd = 7 + Math.random() * 12;
      s.meleeCd = 0;
      s.spawn(this.pickSpawn(team));
      this.soldiers.push(s);
      return s;
    }

    pickSpawn(team) {
      const pts = this.world.spawns[team];
      const enemies = this.soldiers.filter((s) => s.alive && s.team !== team);
      for (let i = 0; i < 14; i++) {
        const base = pts[Math.floor(Math.random() * pts.length)];
        const x = base.x + (Math.random() - 0.5) * 6;
        const z = base.z + (Math.random() - 0.5) * 6;
        if (!this.world.nav.isOpenWorld(x, z)) continue;
        let safe = true;
        for (const e of enemies) {
          if (CW.Core.dist2D(x, z, e.pos.x, e.pos.z) < 16) { safe = false; break; }
        }
        if (this.player && this.player.alive && this.player.team !== team) {
          if (CW.Core.dist2D(x, z, this.player.pos.x, this.player.pos.z) < 16) safe = false;
        }
        if (safe) return new T.Vector3(x, 0, z);
      }
      const fallback = pts[Math.floor(Math.random() * pts.length)];
      return new T.Vector3(fallback.x, 0, fallback.z);
    }

    pause() {
      if (this.state !== 'playing') return;
      this.state = 'paused';
      this.input.mouse.left = false;
      this.input.mouse.right = false;
      this.dragLook = false;
      this.input.keys.clear();
      this.hideLockHint();
      this.el['screen-pause'].classList.remove('hidden');
      if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
      if (document.pointerLockElement) document.exitPointerLock();
      CW.Audio.ui(false);
    }

    resume() {
      if (this.state !== 'paused') return;
      this.el['screen-pause'].classList.add('hidden');
      this.state = 'playing';
      this.last = performance.now();
      this.input.mouse.left = false;
      this.input.mouse.right = false;
      // 即使浏览器拒绝指针锁定，对局也照常继续（可按住左键拖动视角）
      this.lockPointer();
      if (!this.touchActive && !this.input.pointerLocked) this.showLockTip();
      CW.Audio.resume();
      CW.Audio.ui(true);
    }

    toMenu() {
      this.state = 'menu';
      this.resetActors();
      this.effects.clear();
      this.setHUDVisible(false);
      this.hideOverlay('screen-pause');
      this.hideOverlay('screen-results');
      this.hideOverlay('deathScreen');
      this.el['screen-menu'].classList.remove('hidden');
      this.startMenuCamera();
      if (document.pointerLockElement) document.exitPointerLock();
      CW.Audio.stopAll();
      this.setScopeVisible(false);
      this.input.keys.clear();
      this.input.mouse.left = false;
      this.input.mouse.right = false;
    }

    endMatch(winner) {
      if (this.state === 'over') return;
      this.state = 'over';
      this.setHUDVisible(false);
      this.setScopeVisible(false);
      this.hideOverlay('deathScreen');
      if (document.pointerLockElement) document.exitPointerLock();
      CW.Audio.stopAll();

      const playerWon = winner === this.player.team;
      const draw = !winner;
      const tag = this.el.resultTag;
      const title = this.el.resultTitle;
      if (draw) {
        tag.textContent = '战局胶着';
        title.textContent = '平 局';
        title.className = 'result-title is-draw';
      } else if (playerWon) {
        tag.textContent = '任务达成';
        title.textContent = '封 锁 区 肃 清';
        title.className = 'result-title is-win';
      } else {
        tag.textContent = '任务失败';
        title.textContent = '防 线 失 守';
        title.className = 'result-title is-lose';
      }
      const score = this.matchScore.scores;
      this.el.resultScore.innerHTML =
        `<span class="score-red">${score.red}</span><span class="score-sep">:</span><span class="score-blue">${score.blue}</span>`;
      const acc = this.stats.shots > 0 ? Math.round((this.stats.hits / this.stats.shots) * 100) : 0;
      this.el.resultStats.innerHTML = `
        <div class="stat"><span>击杀</span><strong>${this.stats.kills}</strong></div>
        <div class="stat"><span>阵亡</span><strong>${this.stats.deaths}</strong></div>
        <div class="stat"><span>命中率</span><strong>${acc}%</strong></div>
        <div class="stat"><span>爆头</span><strong>${this.stats.headshots}</strong></div>
        <div class="stat"><span>造成伤害</span><strong>${Math.round(this.stats.damage)}</strong></div>
        <div class="stat"><span>敌情</span><strong>${this.diff.label}</strong></div>`;
      this.el['screen-results'].classList.remove('hidden');
      this.viewRootVisible(false);
    }

    /* ================= 主回圈 ================= */
    loop(now) {
      requestAnimationFrame(this.loop);
      let dt = (now - this.last) / 1000;
      if (!isFinite(dt) || dt < 0) dt = 0;
      dt = Math.min(dt, 0.05);
      this.last = now;
      this.elapsed += dt;

      if (this.state === 'playing') {
        // 注意：这里不再根据指针锁定状态暂停对局。
        // 浏览器可能因权限、iframe 或冷却时间拒绝锁定，但游戏必须始终可玩。
        this.time += dt;
        this.updateGame(dt);
        this.timeoutToast(dt);
      } else if (this.state === 'paused') {
        this.timeoutToast(dt);
      } else if (this.state === 'menu') {
        this.menuAngle += dt * 0.055;
        const r = 52;
        this.camera.position.set(Math.cos(this.menuAngle) * r, 18 + Math.sin(this.elapsed * 0.25) * 1.6, Math.sin(this.menuAngle) * r);
        this.camera.lookAt(0, 4, 0);
      } else if (this.state === 'over') {
        // 冻结场景，仅保留 UI
      }

      if (this.state !== 'paused' && this.state !== 'over' && this.effects) {
        this.effects.update(dt);
      }
      if (this.world && this.state !== 'paused' && this.state !== 'over') {
        this.world.update(dt, this.elapsed);
      }
      if (this.renderer) {
        this.renderer.autoClear = false;
        this.renderer.clear();
        this.renderer.render(this.scene, this.camera);
        if (this.player && this.player.viewRoot.visible) {
          this.viewCamera.aspect = this.camera.aspect;
          this.viewCamera.fov = 65;
          this.viewCamera.updateProjectionMatrix();
          this.renderer.clearDepth();
          this.renderer.render(this.viewScene, this.viewCamera);
        }
      }
    }

    updateGame(dt) {
      // 计时
      this.matchTime -= dt;
      if (this.matchTime <= 0) {
        this.matchTime = 0;
        this.matchScore.ensureEnd();
        this.endMatch(this.matchScore.winner);
        return;
      }

      this.player.update(dt);
      for (let i = 0; i < this.soldiers.length; i++) {
        this.soldiers[i].update(dt);
      }
      this.updateBotGrenades(dt);
      this.updateBotMelee(dt);
      this.updateProjectiles(dt);
      this.separateActors();
      this.updateFlash(dt);
      this.updateDeath(dt);

      this.minimapTimer -= dt;
      if (this.minimapTimer <= 0) {
        this.minimapTimer = 0.08;
        this.drawMinimap();
      }
      this.audioIntensityTimer -= dt;
      if (this.audioIntensityTimer <= 0) {
        this.audioIntensityTimer = 0.5;
        this.updateMusicIntensity();
      }
      this.updateHUD();
      this.input.fireQueued = false;
      this.input.lookDX = 0;
      this.input.lookDY = 0;
    }

    updateDeath(dt) {
      const p = this.player;
      if (p.alive) return;
      this.respawnTimer -= dt;
      // 倒地镜头
      this.camera.position.y = Math.max(0.62, this.camera.position.y - dt * 1.5);
      this.camera.rotation.z = CW.Core.lerp(this.camera.rotation.z, 0.62, Math.min(1, dt * 3.2));
      this.camera.rotation.x = CW.Core.lerp(this.camera.rotation.x, 0.15, Math.min(1, dt * 3.2));
      if (this.el.deathTimer) {
        this.el.deathTimer.textContent = Math.max(0, this.respawnTimer).toFixed(1);
      }
      if (this.respawnTimer <= 0) this.respawnPlayer();
    }

    respawnPlayer() {
      if (this.state !== 'playing') return;
      const p = this.player;
      const spawn = this.pickSpawn(p.team);
      p.spawn(spawn);
      p.yaw = p.team === 'red' ? 0 : Math.PI;
      p.pitch = 0;
      p.applyCamera(0);
      this.camera.rotation.z = 0;
      this.hideOverlay('deathScreen');
      this.viewRootVisible(true);
      this.showToast('重新部署完成');
      this.updateHUD(true);
    }

    /* ================= 移动与碰撞 ================= */
    moveActor(actor, dx, dz, radius) {
      const hit = CW.Core.resolveCircle(actor.pos, dx, dz, radius || 0.4, this.world.colliders, 0.12, 1.75);
      const b = this.world.bounds;
      actor.pos.x = CW.Core.clamp(actor.pos.x, b.minX + 1.4, b.maxX - 1.4);
      actor.pos.z = CW.Core.clamp(actor.pos.z, b.minZ + 1.4, b.maxZ - 1.4);
      return hit;
    }

    separateActors() {
      const list = [];
      for (const s of this.soldiers) if (s.alive) list.push(s);
      if (this.player.alive) list.push(this.player);
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          const a = list[i], b = list[j];
          const dx = b.pos.x - a.pos.x;
          const dz = b.pos.z - a.pos.z;
          const d = Math.hypot(dx, dz);
          const min = a.radius + b.radius;
          if (d > 0.0001 && d < min) {
            const push = (min - d) / 2;
            const nx = dx / d, nz = dz / d;
            this.moveActor(a, -nx * push, -nz * push, a.radius);
            this.moveActor(b, nx * push, nz * push, b.radius);
          }
        }
      }
    }

    /* ================= 射线与伤害 ================= */
    raycastWorld(origin, dir, maxDist) {
      let best = maxDist;
      const cs = this.world.colliders;
      for (let i = 0; i < cs.length; i++) {
        const c = cs[i];
        const t = CW.Core.rayAABB(
          origin.x, origin.y, origin.z,
          dir.x, dir.y, dir.z,
          c.minX, c.minY, c.minZ, c.maxX, c.maxY, c.maxZ
        );
        if (t >= 0 && t < best) best = t;
      }
      if (dir.y < -0.001) {
        const tg = -origin.y / dir.y;
        if (tg >= 0 && tg < best) best = tg;
      }
      return best;
    }

    getLivingEnemies(team) {
      const out = [];
      for (const s of this.soldiers) {
        if (s.alive && s.team !== team) out.push(s);
      }
      if (this.player && this.player.alive && this.player.team !== team) out.push(this.player);
      return out;
    }

    hitscan(owner, origin, dirIn, range, damage, headMult, opts) {
      opts = opts || {};
      const len = Math.hypot(dirIn.x, dirIn.y, dirIn.z) || 1;
      const dir = { x: dirIn.x / len, y: dirIn.y / len, z: dirIn.z / len };
      const wallT = this.raycastWorld(origin, dir, range + 0.5);
      const targets = this.getLivingEnemies(owner.team);
      let best = null;

      for (let i = 0; i < targets.length; i++) {
        const target = targets[i];
        if (!target.alive) continue;
        const parts = target.isPlayer
          ? [
              { y: 1.62, r: 0.25, name: 'head', mult: headMult },
              { y: 1.16, r: 0.4, name: 'body', mult: 1 },
              { y: 0.55, r: 0.3, name: 'legs', mult: 0.76 }
            ]
          : [
              { y: 1.81, r: 0.26, name: 'head', mult: headMult },
              { y: 1.24, r: 0.42, name: 'body', mult: 1 },
              { y: 0.56, r: 0.33, name: 'legs', mult: 0.78 }
            ];
        for (let k = 0; k < parts.length; k++) {
          const part = parts[k];
          const t = CW.Core.raySphere(
            origin.x, origin.y, origin.z,
            dir.x, dir.y, dir.z,
            target.pos.x, part.y, target.pos.z, part.r
          );
          if (t < 0 || t > range || t > wallT) continue;
          if (!best || t < best.t) {
            best = { target, t, part, mult: part.mult };
          }
        }
      }

      let endPoint;
      if (best) {
        endPoint = new T.Vector3(
          origin.x + dir.x * best.t,
          origin.y + dir.y * best.t,
          origin.z + dir.z * best.t
        );
        const dmg = CW.Core.damageAfterFalloff(damage, best.t, range, 0.62) * best.mult;
        this.effects.spark(endPoint, best.part.name === 'head' ? 0xfff0b6 : 0xff9a58, best.part.name === 'head' ? 8 : 5, 0.8);
        best.target.takeDamage(dmg, owner);
        if (owner.isPlayer) {
          this.stats.hits++;
          this.stats.damage += dmg;
          if (best.part.name === 'head') this.stats.headshots++;
          const killed = !best.target.alive;
          this.showHitmarker(killed, best.part.name === 'head');
          CW.Audio.hit(best.part.name === 'head');
        }
      } else {
        const dist = Math.min(wallT, range);
        endPoint = new T.Vector3(
          origin.x + dir.x * dist,
          origin.y + dir.y * dist,
          origin.z + dir.z * dist
        );
        if (wallT < range + 0.4) this.effects.impact(endPoint);
      }

      const muzzle = opts.muzzle || origin;
      const tracerColor = owner.team === 'red' ? 0xffb06a : 0x8fcaff;
      this.effects.tracer(muzzle, endPoint, tracerColor);
      return best;
    }

    playerMelee(owner, def) {
      this.camera.updateMatrixWorld(true);
      const origin = new T.Vector3();
      this.camera.getWorldPosition(origin);
      const dir = new T.Vector3();
      this.camera.getWorldDirection(dir);
      const targets = this.getLivingEnemies(owner.team);
      let best = null;
      for (const t of targets) {
        if (!t.alive) continue;
        const dx = t.pos.x - origin.x;
        const dz = t.pos.z - origin.z;
        const dist = Math.hypot(dx, dz);
        if (dist > def.range + 0.45) continue;
        const dot = (dx * dir.x + dz * dir.z) / (dist || 1);
        if (dot < 0.42) continue;
        if (!this.world.lineClear(origin.x, origin.z, t.pos.x, t.pos.z)) continue;
        if (!best || dist < best.dist) best = { target: t, dist, dx, dz };
      }
      CW.Audio.melee(0);
      if (best) {
        const hitPos = new T.Vector3(
          best.target.pos.x, 1.2, best.target.pos.z
        );
        this.effects.spark(hitPos, 0xffd0a0, 7, 0.8);
        CW.Audio.impact(0, 0);
        const killed = !best.target.alive;
        best.target.takeDamage(def.dmg, owner);
        if (owner.isPlayer) {
          this.showHitmarker(!best.target.alive, false);
          CW.Audio.hit(false);
          this.stats.damage += def.dmg;
        }
      }
    }

    aiFire(shooter, target, spread, damage, range) {
      if (!target || !target.alive || !shooter.alive) return;
      const origin = shooter.muzzlePos;
      const aimY = target.isPlayer ? 1.28 : 1.3;
      const dir = new T.Vector3(target.pos.x - origin.x, aimY - origin.y, target.pos.z - origin.z);
      if (dir.lengthSq() < 0.001) return;
      dir.normalize();
      let s = spread * this.diff.spread;
      if (target.isPlayer && target.moving) s *= 1.18;
      if (target.isPlayer && target.sprinting) s *= 1.1;
      const shot = CW.Core.randomInCone(dir.x, dir.y, dir.z, s, Math.random);
      this.hitscan(shooter, origin, { x: shot.x, y: shot.y, z: shot.z }, range, damage * this.diff.damage, 1.65, {
        muzzle: origin,
        weapon: shooter.weaponKey
      });
      this.playShot(shooter.weaponKey, origin);
    }

    playShot(kind, pos) {
      const pan = this.panFor(pos);
      const dist = this.camera.position.distanceTo(pos);
      CW.Audio.shot(kind, pan, dist);
    }

    panFor(pos) {
      if (!this.player) return 0;
      const dx = pos.x - this.camera.position.x;
      const dz = pos.z - this.camera.position.z;
      const d = Math.hypot(dx, dz) || 1;
      const rx = Math.cos(this.player.yaw);
      const rz = -Math.sin(this.player.yaw);
      return CW.Core.clamp((dx * rx + dz * rz) / d, -1, 1);
    }

    /* ================= 手榴弹 ================= */
    spawnGrenade(kind, owner, origin, vel, fuse) {
      const mesh = CW.Weapons.grenadeMesh(kind, SIDE_HEX[owner.team] || 0xffffff);
      mesh.position.copy(origin);
      this.scene.add(mesh);
      this.projectiles.push({
        kind,
        owner,
        team: owner.team,
        mesh,
        pos: origin.clone(),
        vel: vel.clone(),
        fuse: fuse,
        spin: new T.Vector3(Math.random() * 6, Math.random() * 6, Math.random() * 6)
      });
    }

    updateBotGrenades(dt) {
      for (const s of this.soldiers) {
        if (!s.alive) continue;
        if (s.grenadeCd == null) s.grenadeCd = 7 + Math.random() * 12;
        s.grenadeCd -= dt;
        if (s.grenadeCd > 0) continue;
        const target = s.target;
        if (!target || !target.alive) { s.grenadeCd = 2.5; continue; }
        const dist = CW.Core.dist2D(s.pos.x, s.pos.z, target.pos.x, target.pos.z);
        if (dist < 5 || dist > 27) { s.grenadeCd = 2.5; continue; }
        if (!this.world.lineClear(s.pos.x, s.pos.z, target.pos.x, target.pos.z)) { s.grenadeCd = 2.5; continue; }
        if (Math.random() > this.diff.grenade) { s.grenadeCd = 3; continue; }
        s.grenadeCd = 17 + Math.random() * 14;
        const origin = s.chestPos;
        origin.y = 1.5;
        const to = new T.Vector3(
          target.pos.x + (Math.random() - 0.5) * 3,
          0.25,
          target.pos.z + (Math.random() - 0.5) * 3
        );
        const v = CW.Core.ballisticVelocity(origin, to, 1.55, 18);
        this.spawnGrenade('frag', s, origin, new T.Vector3(v.x, v.y, v.z), 2.0);
        CW.Audio.throwNade();
        this.showBotCallout(s);
      }
    }

    showBotCallout(soldier) {
      const dist = this.camera.position.distanceTo(soldier.pos);
      if (dist < 26) {
        // 只显示近距离敌方的投掷提示，增加紧张感
        if (soldier.team !== this.player.team) this.showToast('敌军投掷手榴弹！', 900);
      }
    }

    updateProjectiles(dt) {
      for (let i = this.projectiles.length - 1; i >= 0; i--) {
        const p = this.projectiles[i];
        p.fuse -= dt;
        p.vel.y -= 18 * dt;
        const oldX = p.pos.x, oldZ = p.pos.z, oldY = p.pos.y;
        p.pos.x += p.vel.x * dt;
        p.pos.y += p.vel.y * dt;
        p.pos.z += p.vel.z * dt;

        if (p.pos.y < 0.14) {
          p.pos.y = 0.14;
          if (p.vel.y < 0) p.vel.y = -p.vel.y * 0.32;
          p.vel.x *= 0.55;
          p.vel.z *= 0.55;
        }
        // 墙面反弹（以 2D 圆近似）
        if (p.pos.y < 3.4) {
          const cs = this.world.colliders;
          for (let k = 0; k < cs.length; k++) {
            const c = cs[k];
            if (p.pos.y > c.maxY || p.pos.y < c.minY) continue;
            if (p.pos.x > c.minX - 0.09 && p.pos.x < c.maxX + 0.09 &&
                p.pos.z > c.minZ - 0.09 && p.pos.z < c.maxZ + 0.09) {
              p.pos.x = oldX;
              p.pos.z = oldZ;
              p.pos.y = oldY;
              p.vel.x *= -0.35;
              p.vel.z *= -0.35;
              break;
            }
          }
        }
        p.mesh.position.copy(p.pos);
        p.mesh.rotation.x += p.spin.x * dt;
        p.mesh.rotation.y += p.spin.y * dt;

        if (p.fuse <= 0) {
          this.explodeGrenade(p);
          this.scene.remove(p.mesh);
          this.projectiles.splice(i, 1);
        }
      }
    }

    explodeGrenade(p) {
      const def = CW.Weapons.DEFS[p.kind];
      const pan = this.panFor(p.pos);
      const dist = this.camera.position.distanceTo(p.pos);
      const targets = [];
      for (const s of this.soldiers) if (s.alive) targets.push(s);
      if (this.player.alive) targets.push(this.player);

      if (p.kind === 'frag') {
        this.effects.explosion(p.pos);
        CW.Audio.explosion(pan, dist);
        for (const t of targets) {
          if (t.team === p.team) continue;
          const d = CW.Core.dist2D(t.pos.x, t.pos.z, p.pos.x, p.pos.z);
          if (d > def.radius) continue;
          let factor = 1 - d / def.radius;
          if (!this.world.lineClear(p.pos.x, p.pos.z, t.pos.x, t.pos.z)) factor *= 0.35;
          const dmg = def.dmg * factor * 0.85;
          if (dmg > 2) t.takeDamage(dmg, p.owner);
        }
      } else {
        this.effects.flashbang(p.pos);
        CW.Audio.flashbang(pan, dist);
        for (const t of targets) {
          if (t.team === p.team) continue;
          const d = CW.Core.dist2D(t.pos.x, t.pos.z, p.pos.x, p.pos.z);
          if (d > def.radius) continue;
          let factor = 1 - d / def.radius;
          if (!this.world.lineClear(p.pos.x, p.pos.z, t.pos.x, t.pos.z)) factor *= 0.4;
          if (t.isPlayer) this.flashPlayer(def.stun * factor, factor);
          else t.stunTimer = Math.max(t.stunTimer, def.stun * factor);
        }
      }
    }

    flashPlayer(duration, strength) {
      if (strength < 0.05) return;
      this.flashTimer = Math.max(this.flashTimer, duration);
      this.flashTotal = Math.max(0.2, duration);
      this.flashStrength = Math.max(this.flashStrength, strength);
      this.input.mouse.left = false;
      this.input.mouse.right = false;
    }

    updateFlash(dt) {
      if (this.flashTimer > 0) {
        this.flashTimer = Math.max(0, this.flashTimer - dt);
        const k = CW.Core.clamp(this.flashTimer / this.flashTotal, 0, 1);
        const opacity = Math.pow(k, 0.65) * Math.min(0.97, 0.55 + this.flashStrength * 0.42);
        if (this.el.flashOverlay) this.el.flashOverlay.style.opacity = opacity.toFixed(3);
        if (this.flashTimer === 0) {
          this.flashStrength = 0;
          if (this.el.flashOverlay) this.el.flashOverlay.style.opacity = '0';
        }
      }
    }

    /* ================= 敌人近战 ================= */
    updateBotMelee(dt) {
      for (const s of this.soldiers) {
        if (!s.alive) continue;
        s.meleeCd = (s.meleeCd || 0) - dt;
        if (s.meleeCd > 0) continue;
        const t = s.target;
        if (!t || !t.alive) continue;
        const d = CW.Core.dist2D(s.pos.x, s.pos.z, t.pos.x, t.pos.z);
        if (d > 2.25) continue;
        if (!this.world.lineClear(s.pos.x, s.pos.z, t.pos.x, t.pos.z)) continue;
        s.meleeCd = 1.45;
        s.meleeSwing = 0.32;
        if (s.knife) s.knife.visible = true;
        t.takeDamage(13 * this.diff.damage, s);
        CW.Audio.melee(this.panFor(t.pos));
        this.effects.spark(new T.Vector3(t.pos.x, 1.2, t.pos.z), 0xffcf9a, 4, 0.5);
      }
    }

    /* ================= 事件 ================= */
    onSoldierDown(soldier, attacker) {
      CW.Audio.death(this.panFor(soldier.pos));
      const killerName = attacker ? (attacker.isPlayer ? '你' : attacker.displayName || SIDE_LABEL[attacker.team]) : '环境';
      const killerTeam = attacker ? attacker.team : null;
      this.addKillfeed(killerName, soldier.displayName || SIDE_LABEL[soldier.team], killerTeam, !!attacker && attacker.isPlayer);
      if (attacker && attacker.team !== soldier.team) {
        this.matchScore.addKill(attacker.team);
        if (attacker.isPlayer) {
          this.stats.kills++;
          CW.Audio.kill();
        }
        if (this.matchScore.over) {
          this.endMatch(this.matchScore.winner);
          return;
        }
      }
    }

    onSoldierRespawn(soldier) {
      if (soldier.team === this.player.team) return;
      const d = this.camera.position.distanceTo(soldier.pos);
      if (d < 30) CW.Audio.spawn();
    }

    onPlayerDown(attacker) {
      const p = this.player;
      this.stats.deaths++;
      const killerName = attacker ? (attacker.displayName || SIDE_LABEL[attacker.team]) : '流弹';
      const killerTeam = attacker ? attacker.team : (p.team === 'red' ? 'blue' : 'red');
      this.addKillfeed(killerName, '你', killerTeam, true);
      this.matchScore.addKill(killerTeam);
      this.input.mouse.left = false;
      this.input.mouse.right = false;
      this.input.keys.clear();
      this.viewRootVisible(false);

      if (this.matchScore.over) {
        this.endMatch(this.matchScore.winner);
        return;
      }
      this.respawnTimer = 3.4;
      if (this.el.deathScreen) {
        this.el.deathScreen.classList.remove('hidden');
        this.el.deathKiller.textContent = `终结者：${killerName}`;
        this.el.deathTimer.textContent = this.respawnTimer.toFixed(1);
      }
    }

    /* ================= 回馈 ================= */
    showHitmarker(killed, headshot) {
      const hm = this.el.hitmarker;
      if (!hm) return;
      hm.classList.remove('is-hit', 'is-kill', 'is-head');
      void hm.offsetWidth;
      hm.classList.add('is-hit');
      if (headshot) hm.classList.add('is-head');
      if (killed) hm.classList.add('is-kill');
      clearTimeout(this._hmTimer);
      this._hmTimer = setTimeout(() => {
        hm.classList.remove('is-hit', 'is-kill', 'is-head');
      }, 180);
    }

    showDamage(attacker, amount, lethal) {
      const vig = this.el.damageVignette;
      if (vig) {
        vig.classList.remove('is-active');
        void vig.offsetWidth;
        vig.classList.add('is-active');
      }
      if (attacker && this.player && attacker.pos) {
        const dx = attacker.pos.x - this.player.pos.x;
        const dz = attacker.pos.z - this.player.pos.z;
        const fx = -Math.sin(this.player.yaw);
        const fz = -Math.cos(this.player.yaw);
        const rx = Math.cos(this.player.yaw);
        const rz = -Math.sin(this.player.yaw);
        const angle = Math.atan2(dx * rx + dz * rz, dx * fx + dz * fz);
        const node = document.createElement('div');
        node.className = 'dmg-dir';
        node.style.transform = `rotate(${angle}rad)`;
        node.innerHTML = '<span></span>';
        if (this.el.damageDirs) {
          this.el.damageDirs.appendChild(node);
          setTimeout(() => node.remove(), 950);
        }
      }
      if (lethal && this.el.deathScreen) {
        // handled by onPlayerDown
      }
    }

    addKillfeed(killer, victim, team, isPlayer) {
      const host = this.el.killfeed;
      if (!host) return;
      const row = document.createElement('div');
      row.className = 'feed-row' + (isPlayer ? ' is-player' : '');
      const k = document.createElement('span');
      k.className = 'feed-killer ' + (team === 'red' ? 'is-red' : team === 'blue' ? 'is-blue' : '');
      k.textContent = killer;
      const x = document.createElement('span');
      x.className = 'feed-x';
      x.textContent = '✕';
      const v = document.createElement('span');
      v.className = 'feed-victim';
      v.textContent = victim;
      row.appendChild(k); row.appendChild(x); row.appendChild(v);
      host.appendChild(row);
      while (host.children.length > 5) host.removeChild(host.firstChild);
      setTimeout(() => row.remove(), 5200);
    }

    clearKillfeed() {
      if (this.el.killfeed) this.el.killfeed.innerHTML = '';
    }

    showToast(text, ms) {
      const t = this.el.toast;
      if (!t) return;
      t.textContent = text;
      t.classList.add('is-show');
      this.toastTimer = (ms || 2200) / 1000;
    }

    timeoutToast(dt) {
      if (this.toastTimer > 0) {
        this.toastTimer -= dt;
        if (this.toastTimer <= 0 && this.el.toast) this.el.toast.classList.remove('is-show');
      }
    }

    updateMusicIntensity() {
      if (!this.player) return;
      let nearest = 999;
      for (const s of this.soldiers) {
        if (!s.alive) continue;
        const d = CW.Core.dist2D(s.pos.x, s.pos.z, this.player.pos.x, this.player.pos.z);
        if (d < nearest) nearest = d;
      }
      const v = CW.Core.clamp(1 - nearest / 60, 0, 1);
      CW.Audio.setMusicIntensity(v);
    }

    /* ================= HUD ================= */
    setHUDVisible(v) {
      this.hudVisible = v;
      if (this.el.hud) this.el.hud.classList.toggle('hidden', !v);
      if (this.el.touchUI && this.touchActive) this.el.touchUI.classList.toggle('hidden', !v);
    }

    updateHUD(force) {
      if (!this.hudVisible && !force) return;
      const p = this.player;
      const score = this.matchScore.scores;
      if (this.el.scoreRed) this.el.scoreRed.textContent = score.red;
      if (this.el.scoreBlue) this.el.scoreBlue.textContent = score.blue;
      if (this.el.hudTeam) this.el.hudTeam.textContent = SIDE_LABEL[p.team];
      if (this.el.matchTimer) {
        const m = Math.floor(this.matchTime / 60);
        const s = Math.floor(this.matchTime % 60);
        this.el.matchTimer.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
      }
      const hp = Math.max(0, Math.ceil(p.hp));
      if (this.el.healthValue) this.el.healthValue.textContent = hp;
      if (this.el.healthFill) this.el.healthFill.style.width = `${(hp / p.maxHp) * 100}%`;
      if (this.el.healthPanel) {
        this.el.healthPanel.classList.toggle('is-low', hp <= 32);
        this.el.healthPanel.classList.toggle('is-dead', !p.alive);
      }

      const def = p.def;
      if (this.el.weaponName) {
        let name = def.name;
        if (p.reloadTimer > 0) name += ' · 换弹中';
        this.el.weaponName.textContent = name;
      }
      const ammo = p.arsenal[p.weaponKey];
      if (this.el.ammoMag) {
        if (def.type === 'gun' && ammo) {
          this.el.ammoMag.textContent = ammo.mag;
          this.el.ammoReserve.textContent = ammo.reserve;
        } else if (def.type === 'throw') {
          this.el.ammoMag.textContent = p.grenades[p.weaponKey];
          this.el.ammoReserve.textContent = '枚';
        } else {
          this.el.ammoMag.textContent = '∞';
          this.el.ammoReserve.textContent = '近战';
        }
      }
      if (this.el.weaponSlots) {
        for (const row of this.el.weaponSlots.children) {
          const key = row.dataset.weapon;
          row.classList.toggle('is-active', key === p.weaponKey);
          const count = row.querySelector('[data-count]');
          if (count) {
            if (CW.Weapons.DEFS[key].type === 'throw') {
              count.textContent = p.grenades[key] > 0 ? `×${p.grenades[key]}` : '—';
              row.classList.toggle('is-empty', p.grenades[key] <= 0);
            } else {
              count.textContent = '';
              row.classList.remove('is-empty');
            }
          }
        }
      }

      // 准星
      if (this.el.crosshair) {
        const moveFactor = CW.Core.clamp(p.speed / 7, 0, 1);
        const gap = 5 + moveFactor * 9 + p.recoil * 9 - p.adsAmount * 2.5;
        this.el.crosshair.style.setProperty('--gap', gap.toFixed(1) + 'px');
        this.el.crosshair.classList.toggle('is-ads', p.isAds);
      }
      if (this.el.hud) {
        this.el.hud.classList.toggle('is-scoped', this.weaponScoped);
        this.el.hud.classList.toggle('is-lowhp', hp <= 32 && p.alive);
      }
    }

    setScopeVisible(v) {
      const on = !!v;
      if (this.weaponScoped === on) return;
      this.weaponScoped = on;
      if (this.el.scope) this.el.scope.classList.toggle('hidden', !on);
      if (this.el.hud) this.el.hud.classList.toggle('is-scoped', on && this.state === 'playing');
    }

    drawMinimap() {
      const canvas = this.el.minimap;
      const ctx = this.el.mapCtx;
      if (!canvas || !ctx) return;
      const W = canvas.width, H = canvas.height;
      ctx.clearRect(0, 0, W, H);
      ctx.save();
      ctx.translate(W / 2, H / 2);
      const scale = (W - 14) / 98;
      ctx.beginPath();
      ctx.arc(0, 0, W / 2 - 2, 0, Math.PI * 2);
      ctx.clip();
      ctx.fillStyle = 'rgba(9,14,20,0.78)';
      ctx.fillRect(-W / 2, -H / 2, W, H);

      ctx.strokeStyle = 'rgba(120,170,210,0.12)';
      ctx.lineWidth = 1;
      for (let i = -40; i <= 40; i += 20) {
        ctx.beginPath();
        ctx.moveTo(i * scale, -H / 2);
        ctx.lineTo(i * scale, H / 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(-W / 2, i * scale);
        ctx.lineTo(W / 2, i * scale);
        ctx.stroke();
      }

      ctx.fillStyle = 'rgba(130,152,176,0.26)';
      for (const b of this.world.minimapBuildings) {
        ctx.fillRect((b.x - b.w / 2) * scale, (b.z - b.d / 2) * scale, b.w * scale, b.d * scale);
      }

      // 投掷物
      for (const pr of this.projectiles) {
        ctx.fillStyle = 'rgba(255,200,120,0.9)';
        ctx.beginPath();
        ctx.arc(pr.pos.x * scale, pr.pos.z * scale, 2, 0, Math.PI * 2);
        ctx.fill();
      }

      for (const s of this.soldiers) {
        if (!s.alive) continue;
        if (s.team !== this.player.team) {
          const d = CW.Core.dist2D(s.pos.x, s.pos.z, this.player.pos.x, this.player.pos.z);
          if (d > 58) continue;
        }
        ctx.fillStyle = s.team === 'red' ? '#ff6a4a' : '#59a7ff';
        ctx.beginPath();
        ctx.arc(s.pos.x * scale, s.pos.z * scale, 2.6, 0, Math.PI * 2);
        ctx.fill();
      }

      if (this.player.alive) {
        ctx.save();
        ctx.translate(this.player.pos.x * scale, this.player.pos.z * scale);
        ctx.rotate(-this.player.yaw);
        ctx.fillStyle = '#ffe6b0';
        ctx.beginPath();
        ctx.moveTo(0, -6);
        ctx.lineTo(4.2, 4.5);
        ctx.lineTo(0, 2.6);
        ctx.lineTo(-4.2, 4.5);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
      ctx.restore();

      ctx.strokeStyle = 'rgba(255,180,110,0.45)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(W / 2, H / 2, W / 2 - 2, 0, Math.PI * 2);
      ctx.stroke();
    }

    hideOverlay(id) {
      const el = this.el[id] || document.getElementById(id);
      if (el) el.classList.add('hidden');
    }

    onResize() {
      if (!this.renderer || !this.camera) return;
      const w = window.innerWidth;
      const h = window.innerHeight;
      this.camera.aspect = w / Math.max(1, h);
      this.camera.updateProjectionMatrix();
      if (this.viewCamera) {
        this.viewCamera.aspect = this.camera.aspect;
        this.viewCamera.updateProjectionMatrix();
      }
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
      this.renderer.setSize(w, h, false);
    }
  }

  CW.Game = Game;
})(window.CW = window.CW || {});
