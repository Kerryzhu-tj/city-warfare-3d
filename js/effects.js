/* ============================================================
   巷战 3D · 视觉特效：火花、烟尘、曳光、爆闪、弹孔
   （不血腥：以火花、尘土与光效取代血液）
   ============================================================ */
(function (CW) {
  'use strict';
  const T = THREE;

  const VERT = `
    attribute float aSize;
    attribute float aAlpha;
    attribute vec3 aColor;
    varying vec3 vColor;
    varying float vAlpha;
    void main() {
      vColor = aColor;
      vAlpha = aAlpha;
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      gl_PointSize = clamp(aSize * (330.0 / max(-mv.z, 0.15)), 1.0, 96.0);
      gl_Position = projectionMatrix * mv;
    }`;

  const FRAG = `
    varying vec3 vColor;
    varying float vAlpha;
    void main() {
      vec2 d = gl_PointCoord - vec2(0.5);
      float r = length(d);
      if (r > 0.5) discard;
      float a = smoothstep(0.5, 0.04, r) * vAlpha;
      if (a <= 0.002) discard;
      gl_FragColor = vec4(vColor, a);
    }`;

  const colorCache = new Map();
  function rgb(hex) {
    let c = colorCache.get(hex);
    if (!c) {
      const col = new T.Color(hex);
      c = { r: col.r, g: col.g, b: col.b };
      colorCache.set(hex, c);
    }
    return c;
  }

  class Pool {
    constructor(scene, max, additive) {
      this.max = max;
      this.parts = [];
      this.posA = new Float32Array(max * 3);
      this.colA = new Float32Array(max * 3);
      this.sizeA = new Float32Array(max);
      this.alphaA = new Float32Array(max);
      const geo = new T.BufferGeometry();
      this.posAttr = new T.BufferAttribute(this.posA, 3).setUsage(T.DynamicDrawUsage);
      this.colAttr = new T.BufferAttribute(this.colA, 3).setUsage(T.DynamicDrawUsage);
      this.sizeAttr = new T.BufferAttribute(this.sizeA, 1).setUsage(T.DynamicDrawUsage);
      this.alphaAttr = new T.BufferAttribute(this.alphaA, 1).setUsage(T.DynamicDrawUsage);
      geo.setAttribute('position', this.posAttr);
      geo.setAttribute('aColor', this.colAttr);
      geo.setAttribute('aSize', this.sizeAttr);
      geo.setAttribute('aAlpha', this.alphaAttr);
      geo.setDrawRange(0, 0);
      const mat = new T.ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        transparent: true,
        depthWrite: false,
        blending: additive ? T.AdditiveBlending : T.NormalBlending
      });
      this.geo = geo;
      this.mesh = new T.Points(geo, mat);
      this.mesh.frustumCulled = false;
      this.mesh.renderOrder = 6;
      scene.add(this.mesh);
    }

    spawn(x, y, z, vx, vy, vz, life, size, endSize, color, gravity, drag) {
      if (this.parts.length >= this.max) this.parts.shift();
      this.parts.push({
        x, y, z, vx, vy, vz,
        life, maxLife: life,
        size, endSize: endSize == null ? size : endSize,
        color: rgb(color),
        gravity: gravity == null ? 9 : gravity,
        drag: drag == null ? 1.4 : drag
      });
    }

    update(dt) {
      const parts = this.parts;
      let w = 0;
      for (let i = 0; i < parts.length; i++) {
        const p = parts[i];
        p.life -= dt;
        if (p.life <= 0) continue;
        const damp = Math.max(0, 1 - p.drag * dt);
        p.vx *= damp; p.vz *= damp;
        p.vy -= p.gravity * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
        if (p.y < 0.03) {
          p.y = 0.03;
          p.vy = Math.abs(p.vy) * 0.22;
          p.vx *= 0.5; p.vz *= 0.5;
        }
        const t = 1 - p.life / p.maxLife;
        const c = p.color;
        const idx = w * 3;
        this.posA[idx] = p.x; this.posA[idx + 1] = p.y; this.posA[idx + 2] = p.z;
        this.colA[idx] = c.r; this.colA[idx + 1] = c.g; this.colA[idx + 2] = c.b;
        this.sizeA[w] = p.size + (p.endSize - p.size) * t;
        this.alphaA[w] = Math.min(1, p.life * 6) * (1 - t * t * 0.55);
        parts[w] = p;
        w++;
      }
      parts.length = w;
      this.geo.setDrawRange(0, w);
      this.posAttr.needsUpdate = true;
      this.colAttr.needsUpdate = true;
      this.sizeAttr.needsUpdate = true;
      this.alphaAttr.needsUpdate = true;
    }

    clear() {
      this.parts.length = 0;
      this.geo.setDrawRange(0, 0);
    }
  }

  function radialTexture(inner, outer, size) {
    const s = size || 96;
    const c = document.createElement('canvas');
    c.width = c.height = s;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(s / 2, s / 2, 1, s / 2, s / 2, s / 2);
    grad.addColorStop(0, inner);
    grad.addColorStop(0.35, inner);
    grad.addColorStop(1, outer);
    g.fillStyle = grad;
    g.fillRect(0, 0, s, s);
    const tex = new T.CanvasTexture(c);
    tex.needsUpdate = true;
    return tex;
  }

  function holeTexture() {
    const s = 64;
    const c = document.createElement('canvas');
    c.width = c.height = s;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    grad.addColorStop(0, 'rgba(6,6,8,0.95)');
    grad.addColorStop(0.30, 'rgba(12,12,14,0.8)');
    grad.addColorStop(0.55, 'rgba(35,30,25,0.35)');
    grad.addColorStop(1, 'rgba(35,30,25,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, s, s);
    return new T.CanvasTexture(c);
  }

  class Effects {
    constructor(scene) {
      this.scene = scene;
      this.sparks = new Pool(scene, 900, true);
      this.smoke = new Pool(scene, 320, false);

      this.flareTex = radialTexture('rgba(255,244,210,1)', 'rgba(255,150,40,0)', 96);
      this.holeTex = holeTexture();

      this.tracers = [];
      const tracerGeo = new T.CylinderGeometry(0.016, 0.016, 1, 4, 1, true);
      for (let i = 0; i < 56; i++) {
        const mat = new T.MeshBasicMaterial({
          color: 0xffd27a, transparent: true, opacity: 0,
          blending: T.AdditiveBlending, depthWrite: false
        });
        const mesh = new T.Mesh(tracerGeo, mat);
        mesh.visible = false;
        mesh.frustumCulled = false;
        scene.add(mesh);
        this.tracers.push({ mesh, mat, life: 0, maxLife: 0.001 });
      }
      this.tracerIndex = 0;

      this.flashes = [];
      for (let i = 0; i < 18; i++) {
        const mat = new T.SpriteMaterial({
          map: this.flareTex, transparent: true, opacity: 0,
          blending: T.AdditiveBlending, depthWrite: false, depthTest: true
        });
        const sp = new T.Sprite(mat);
        sp.visible = false;
        sp.frustumCulled = false;
        scene.add(sp);
        this.flashes.push({ sp, mat, life: 0, maxLife: 0.001 });
      }
      this.flashIndex = 0;

      this.decals = [];
      for (let i = 0; i < 44; i++) {
        const mat = new T.SpriteMaterial({
          map: this.holeTex, transparent: true, opacity: 0,
          depthWrite: false
        });
        const sp = new T.Sprite(mat);
        sp.visible = false;
        scene.add(sp);
        this.decals.push({ sp, mat, life: 0, maxLife: 6 });
      }
      this.decalIndex = 0;

      this.rings = [];
      const ringGeo = new T.RingGeometry(0.82, 1, 36);
      for (let i = 0; i < 8; i++) {
        const mat = new T.MeshBasicMaterial({
          color: 0xffc07a, transparent: true, opacity: 0,
          side: T.DoubleSide, blending: T.AdditiveBlending, depthWrite: false
        });
        const mesh = new T.Mesh(ringGeo, mat);
        mesh.rotation.x = -Math.PI / 2;
        mesh.visible = false;
        scene.add(mesh);
        this.rings.push({ mesh, mat, life: 0, maxLife: 0.001, radius: 8 });
      }
      this.ringIndex = 0;

      this.lights = [];
      for (let i = 0; i < 4; i++) {
        const light = new T.PointLight(0xffa656, 0, 34, 2);
        scene.add(light);
        this.lights.push(light);
      }
      this.lightIndex = 0;
    }

    spark(pos, color, count, power) {
      const n = count || 7;
      const p = power == null ? 1 : power;
      for (let i = 0; i < n; i++) {
        this.sparks.spawn(
          pos.x, pos.y, pos.z,
          (Math.random() - 0.5) * 4.6 * p,
          (Math.random() * 3.8 + 0.4) * p,
          (Math.random() - 0.5) * 4.6 * p,
          0.16 + Math.random() * 0.3,
          0.09 + Math.random() * 0.09,
          0.05,
          color == null ? 0xffc070 : color,
          8, 2.2
        );
      }
    }

    dust(pos, count, color) {
      const n = count || 5;
      for (let i = 0; i < n; i++) {
        this.smoke.spawn(
          pos.x + (Math.random() - 0.5) * 0.5,
          pos.y + Math.random() * 0.4,
          pos.z + (Math.random() - 0.5) * 0.5,
          (Math.random() - 0.5) * 1.7,
          0.4 + Math.random() * 1.1,
          (Math.random() - 0.5) * 1.7,
          0.7 + Math.random() * 0.9,
          0.7, 2.2,
          color == null ? 0x7b6b58 : color,
          -0.3, 1.1
        );
      }
    }

    tracer(from, to, color) {
      const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
      const dist = Math.hypot(dx, dy, dz);
      if (dist < 0.1) return;
      const t = this.tracers[this.tracerIndex];
      this.tracerIndex = (this.tracerIndex + 1) % this.tracers.length;
      t.mesh.position.set((from.x + to.x) / 2, (from.y + to.y) / 2, (from.z + to.z) / 2);
      t.mesh.quaternion.setFromUnitVectors(
        new T.Vector3(0, 1, 0),
        new T.Vector3(dx / dist, dy / dist, dz / dist)
      );
      t.mesh.scale.set(1, dist, 1);
      t.mesh.visible = true;
      const c = color == null ? 0xffd27a : color;
      t.mat.color.setHex(c);
      t.mat.opacity = 0.92;
      t.life = t.maxLife = 0.075;
    }

    muzzleFlash(pos, scale) {
      const f = this.flashes[this.flashIndex];
      this.flashIndex = (this.flashIndex + 1) % this.flashes.length;
      f.sp.position.copy(pos);
      const s = scale || 1;
      f.sp.scale.set(0.55 * s, 0.55 * s, 1);
      f.sp.material.rotation = Math.random() * Math.PI * 2;
      f.sp.visible = true;
      f.mat.opacity = 1;
      f.life = f.maxLife = 0.055;
    }

    impact(pos, color) {
      this.spark(pos, color || 0xffb166, 5, 0.7);
      this.dust(pos, 2, 0x6f6252);
      const d = this.decals[this.decalIndex];
      this.decalIndex = (this.decalIndex + 1) % this.decals.length;
      d.sp.position.set(pos.x, pos.y, pos.z);
      d.sp.scale.setScalar(0.16 + Math.random() * 0.08);
      d.sp.material.rotation = Math.random() * Math.PI * 2;
      d.sp.visible = true;
      d.mat.opacity = 0.9;
      d.life = d.maxLife = 5.5;
    }

    explosion(pos) {
      for (let i = 0; i < 34; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = 2 + Math.random() * 10;
        this.sparks.spawn(
          pos.x, pos.y + 0.2, pos.z,
          Math.cos(a) * sp, 1.5 + Math.random() * 7, Math.sin(a) * sp,
          0.3 + Math.random() * 0.55,
          0.14 + Math.random() * 0.16,
          0.02,
          Math.random() < 0.35 ? 0xfff0c0 : 0xff9438,
          10, 1.6
        );
      }
      for (let i = 0; i < 16; i++) {
        this.smoke.spawn(
          pos.x + (Math.random() - 0.5) * 1.6,
          pos.y + Math.random() * 0.9,
          pos.z + (Math.random() - 0.5) * 1.6,
          (Math.random() - 0.5) * 3.2,
          1 + Math.random() * 3,
          (Math.random() - 0.5) * 3.2,
          1.2 + Math.random() * 1.6,
          0.9, 4.4,
          Math.random() < 0.5 ? 0x3a352f : 0x6a5a48,
          -0.6, 1.05
        );
      }
      const ring = this.rings[this.ringIndex];
      this.ringIndex = (this.ringIndex + 1) % this.rings.length;
      ring.mesh.position.set(pos.x, pos.y + 0.12, pos.z);
      ring.mesh.scale.setScalar(0.6);
      ring.mesh.visible = true;
      ring.mat.color.setHex(0xffa452);
      ring.mat.opacity = 0.75;
      ring.life = ring.maxLife = 0.5;
      ring.radius = 7.5;

      const light = this.lights[this.lightIndex];
      this.lightIndex = (this.lightIndex + 1) % this.lights.length;
      light.position.set(pos.x, pos.y + 1.2, pos.z);
      light.color.setHex(0xffa050);
      light.intensity = 4.2;
    }

    flashbang(pos) {
      for (let i = 0; i < 22; i++) {
        this.sparks.spawn(
          pos.x, pos.y + 0.3, pos.z,
          (Math.random() - 0.5) * 7,
          Math.random() * 5,
          (Math.random() - 0.5) * 7,
          0.25 + Math.random() * 0.3,
          0.12 + Math.random() * 0.12,
          0.02,
          0xdff2ff, 6, 1.8
        );
      }
      const ring = this.rings[this.ringIndex];
      this.ringIndex = (this.ringIndex + 1) % this.rings.length;
      ring.mesh.position.set(pos.x, pos.y + 0.16, pos.z);
      ring.mesh.scale.setScalar(0.5);
      ring.mesh.visible = true;
      ring.mat.color.setHex(0xcfeaff);
      ring.mat.opacity = 0.9;
      ring.life = ring.maxLife = 0.42;
      ring.radius = 9;

      const light = this.lights[this.lightIndex];
      this.lightIndex = (this.lightIndex + 1) % this.lights.length;
      light.position.set(pos.x, pos.y + 1, pos.z);
      light.color.setHex(0xd9ecff);
      light.intensity = 7;
    }

    update(dt) {
      this.sparks.update(dt);
      this.smoke.update(dt);

      for (let i = 0; i < this.tracers.length; i++) {
        const t = this.tracers[i];
        if (!t.mesh.visible) continue;
        t.life -= dt;
        if (t.life <= 0) {
          t.mesh.visible = false;
          continue;
        }
        t.mat.opacity = (t.life / t.maxLife) * 0.92;
      }

      for (let i = 0; i < this.flashes.length; i++) {
        const f = this.flashes[i];
        if (!f.sp.visible) continue;
        f.life -= dt;
        if (f.life <= 0) {
          f.sp.visible = false;
          continue;
        }
        f.mat.opacity = (f.life / f.maxLife);
      }

      for (let i = 0; i < this.decals.length; i++) {
        const d = this.decals[i];
        if (!d.sp.visible) continue;
        d.life -= dt;
        if (d.life <= 0) {
          d.sp.visible = false;
          continue;
        }
        d.mat.opacity = Math.min(0.9, d.life * 0.7);
      }

      for (let i = 0; i < this.rings.length; i++) {
        const r = this.rings[i];
        if (!r.mesh.visible) continue;
        r.life -= dt;
        if (r.life <= 0) {
          r.mesh.visible = false;
          continue;
        }
        const t = 1 - r.life / r.maxLife;
        r.mesh.scale.setScalar(0.5 + r.radius * t);
        r.mat.opacity = (1 - t) * 0.8;
      }

      for (let i = 0; i < this.lights.length; i++) {
        const l = this.lights[i];
        if (l.intensity > 0.01) {
          l.intensity = Math.max(0, l.intensity - dt * 22);
        }
      }
    }

    clear() {
      this.sparks.clear();
      this.smoke.clear();
      for (const t of this.tracers) { t.mesh.visible = false; t.life = 0; }
      for (const f of this.flashes) { f.sp.visible = false; f.life = 0; }
      for (const d of this.decals) { d.sp.visible = false; d.life = 0; }
      for (const r of this.rings) { r.mesh.visible = false; r.life = 0; }
      for (const l of this.lights) l.intensity = 0;
    }
  }

  CW.Effects = Effects;
})(window.CW = window.CW || {});
