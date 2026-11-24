/* ============================================================
   巷战 3D · 纯逻辑核心：射线、碰撞、弹药、比分
   （可在 Node 中独立测试）
   ============================================================ */
(function (CW) {
  'use strict';

  const Core = {};

  Core.clamp = function (v, a, b) {
    return v < a ? a : v > b ? b : v;
  };

  Core.lerp = function (a, b, t) {
    return a + (b - a) * t;
  };

  Core.lerpAngle = function (a, b, t) {
    let d = (b - a) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    return a + d * t;
  };

  Core.dist2D = function (ax, az, bx, bz) {
    return Math.hypot(bx - ax, bz - az);
  };

  /* 距离衰减：愈远伤害愈低，但不低于 minFactor */
  Core.damageAfterFalloff = function (base, dist, range, minFactor) {
    const floor = minFactor == null ? 0.6 : minFactor;
    if (!range || range <= 0) return base;
    const f = Core.clamp(1 - (1 - floor) * (dist / range), floor, 1);
    return base * f;
  };

  /* 射线与球体相交，回传最近正向距离，否则 -1。
     方向 (dx,dy,dz) 必须为单位向量。 */
  Core.raySphere = function (ox, oy, oz, dx, dy, dz, cx, cy, cz, r) {
    const mx = ox - cx, my = oy - cy, mz = oz - cz;
    const b = mx * dx + my * dy + mz * dz;
    const c = mx * mx + my * my + mz * mz - r * r;
    if (c > 0 && b > 0) return -1;
    const disc = b * b - c;
    if (disc < 0) return -1;
    const sq = Math.sqrt(disc);
    let t = -b - sq;
    if (t < 0) t = -b + sq;
    return t >= 0 ? t : -1;
  };

  /* 射线与轴对齐盒（3D）相交，回传进入距离，否则 -1 */
  Core.rayAABB = function (ox, oy, oz, dx, dy, dz, minX, minY, minZ, maxX, maxY, maxZ) {
    let tmin = 0, tmax = Infinity;
    const axes = [
      [ox, dx, minX, maxX],
      [oy, dy, minY, maxY],
      [oz, dz, minZ, maxZ]
    ];
    for (let i = 0; i < 3; i++) {
      const o = axes[i][0], d = axes[i][1], lo = axes[i][2], hi = axes[i][3];
      if (Math.abs(d) < 1e-9) {
        if (o < lo || o > hi) return -1;
      } else {
        let t1 = (lo - o) / d, t2 = (hi - o) / d;
        if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
        if (t1 > tmin) tmin = t1;
        if (t2 < tmax) tmax = t2;
        if (tmin > tmax) return -1;
      }
    }
    return tmin;
  };

  /* 圆形角色与 AABB 清单的轴分离碰撞，会直接修改 pos.x / pos.z。
     boxes 每项需有 minX/maxX/minZ/maxZ/minY/maxY。
     回传是否有碰撞。 */
  Core.resolveCircle = function (pos, dx, dz, radius, boxes, minY, maxY) {
    minY = minY == null ? 0.05 : minY;
    maxY = maxY == null ? 1.7 : maxY;
    let hit = false;

    pos.x += dx;
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i];
      if (b.maxY <= minY || b.minY >= maxY) continue;
      if (pos.x + radius > b.minX && pos.x - radius < b.maxX &&
          pos.z + radius > b.minZ && pos.z - radius < b.maxZ) {
        pos.x = dx > 0 ? b.minX - radius : b.maxX + radius;
        hit = true;
      }
    }

    pos.z += dz;
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i];
      if (b.maxY <= minY || b.minY >= maxY) continue;
      if (pos.x + radius > b.minX && pos.x - radius < b.maxX &&
          pos.z + radius > b.minZ && pos.z - radius < b.maxZ) {
        pos.z = dz > 0 ? b.minZ - radius : b.maxZ + radius;
        hit = true;
      }
    }
    return hit;
  };

  /* 在圆锥内产生随机方向（近似，均匀度足够用于射击散布） */
  Core.randomInCone = function (dx, dy, dz, spread, rand) {
    const r = rand || Math.random;
    const len = Math.hypot(dx, dy, dz) || 1;
    dx /= len; dy /= len; dz /= len;
    // 建立正交基底
    let ux, uy, uz;
    if (Math.abs(dy) < 0.9) {
      ux = dz; uy = 0; uz = -dx;
    } else {
      ux = 0; uy = -dz; uz = dy;
    }
    let ul = Math.hypot(ux, uy, uz) || 1;
    ux /= ul; uy /= ul; uz /= ul;
    const vx = dy * uz - dz * uy;
    const vy = dz * ux - dx * uz;
    const vz = dx * uy - dy * ux;

    const radius = Math.tan(spread) * Math.sqrt(r());
    const theta = r() * Math.PI * 2;
    let nx = dx + (Math.cos(theta) * ux + Math.sin(theta) * vx) * radius;
    let ny = dy + (Math.cos(theta) * uy + Math.sin(theta) * vy) * radius;
    let nz = dz + (Math.cos(theta) * uz + Math.sin(theta) * vz) * radius;
    const nl = Math.hypot(nx, ny, nz) || 1;
    return { x: nx / nl, y: ny / nl, z: nz / nl };
  };

  /* 可重现随机数（测试用） */
  Core.seededRandom = function (seed) {
    let s = (seed >>> 0) || 1;
    return function () {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  };

  /* ---------------- 弹药 ---------------- */
  class Ammo {
    constructor(magSize, reserve) {
      this.magSize = magSize;
      this.mag = magSize;
      this.reserve = reserve || 0;
      this.reloading = false;
    }
    canFire() {
      return this.mag > 0 && !this.reloading;
    }
    fire() {
      if (!this.canFire()) return false;
      this.mag--;
      return true;
    }
    startReload() {
      if (this.reloading || this.mag >= this.magSize || this.reserve <= 0) return false;
      this.reloading = true;
      return true;
    }
    finishReload() {
      if (!this.reloading) return 0;
      const need = this.magSize - this.mag;
      const take = Math.max(0, Math.min(need, this.reserve));
      this.mag += take;
      this.reserve -= take;
      this.reloading = false;
      return take;
    }
    refill(full) {
      this.mag = this.magSize;
      if (full) this.reserve = Math.max(this.reserve, this.magSize * 3);
    }
  }

  /* ---------------- 比分 ---------------- */
  class Match {
    constructor(target) {
      this.target = target || 25;
      this.scores = { red: 0, blue: 0 };
      this.over = false;
      this.winner = null;
    }
    addKill(team) {
      if (this.over || (team !== 'red' && team !== 'blue')) return false;
      this.scores[team]++;
      if (this.scores[team] >= this.target) {
        this.over = true;
        this.winner = team;
      }
      return true;
    }
    leader() {
      if (this.scores.red === this.scores.blue) return null;
      return this.scores.red > this.scores.blue ? 'red' : 'blue';
    }
    ensureEnd() {
      if (this.over) return;
      this.over = true;
      this.winner = this.leader();
    }
  }

  /* ---------------- 手榴弹抛物线 ---------------- */
  Core.ballisticVelocity = function (from, to, flightTime, gravity) {
    const g = gravity == null ? 18 : gravity;
    const t = Math.max(0.2, flightTime);
    return {
      x: (to.x - from.x) / t,
      y: (to.y - from.y + 0.5 * g * t * t) / t,
      z: (to.z - from.z) / t
    };
  };

  CW.Core = Core;
  CW.Ammo = Ammo;
  CW.Match = Match;
})(
  typeof window !== 'undefined'
    ? (window.CW = window.CW || {})
    : (globalThis.CW = globalThis.CW || {})
);
if (typeof module !== 'undefined' && module.exports) {
  module.exports = typeof window !== 'undefined' ? window.CW : globalThis.CW;
}
