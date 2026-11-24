/* ============================================================
   巷战 3D · 纯逻辑单元测试（Node 内置 assert，无需依赖）
   运行：node tests/core.test.js
   ============================================================ */
'use strict';

const assert = require('assert');
const path = require('path');
const CW = require(path.join(__dirname, '..', 'js', 'core.js'));
const { Core, Ammo, Match } = CW;

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    process.exitCode = 1;
  }
}
function near(actual, expected, eps, msg) {
  assert.ok(Math.abs(actual - expected) <= (eps == null ? 1e-6 : eps),
    `${msg || 'value'} 期望 ${expected}，实际 ${actual}`);
}

console.log('巷战 3D · core 单元测试');
console.log('\n[基础数学]');

test('clamp 上下界', () => {
  assert.strictEqual(Core.clamp(-3, 0, 1), 0);
  assert.strictEqual(Core.clamp(0.5, 0, 1), 0.5);
  assert.strictEqual(Core.clamp(9, 0, 1), 1);
});

test('lerp 线性插值', () => {
  assert.strictEqual(Core.lerp(10, 20, 0), 10);
  assert.strictEqual(Core.lerp(10, 20, 1), 20);
  assert.strictEqual(Core.lerp(10, 20, 0.5), 15);
});

test('lerpAngle 跨 ±π 走最短弧', () => {
  // 从 10° 到 350°（即 -10°），最短路径应经过 0°，而非绕行 180°
  const a = (10 * Math.PI) / 180;
  const b = (350 * Math.PI) / 180;
  const mid = Core.lerpAngle(a, b, 0.5);
  near(mid, 0, 1e-6, '最短弧中点');
});

test('dist2D 只在水平面计算', () => {
  assert.strictEqual(Core.dist2D(0, 0, 3, 4), 5);
  assert.strictEqual(Core.dist2D(1, -1, 1, -1), 0);
});

console.log('\n[伤害衰减]');

test('近距离满伤害', () => {
  near(Core.damageAfterFalloff(30, 0, 40, 0.6), 30, 1e-9);
});

test('远距离保底系数', () => {
  near(Core.damageAfterFalloff(30, 40, 40, 0.6), 18, 1e-9);
  near(Core.damageAfterFalloff(30, 500, 40, 0.6), 18, 1e-9);
});

test('中距离介于两者之间', () => {
  const d = Core.damageAfterFalloff(30, 20, 40, 0.6);
  assert.ok(d > 18 && d < 30, `实际 ${d}`);
});

test('range<=0 表示无衰减', () => {
  assert.strictEqual(Core.damageAfterFalloff(30, 999, 0, 0.6), 30);
});

console.log('\n[射线检测]');

test('raySphere 正前方命中并返回进入距离', () => {
  // 从原点向 +z，球心 (0,0,10)、半径 1 -> 进入点 z=9
  near(Core.raySphere(0, 0, 0, 0, 0, 1, 0, 0, 10, 1), 9, 1e-9);
});

test('raySphere 背向错过', () => {
  assert.strictEqual(Core.raySphere(0, 0, 0, 0, 0, -1, 0, 0, 10, 1), -1);
});

test('raySphere 侧向擦过但未命中', () => {
  assert.strictEqual(Core.raySphere(0, 0, 0, 0, 0, 1, 2.5, 0, 10, 1), -1);
});

test('raySphere 起点在球内返回最近正交点', () => {
  const t = Core.raySphere(0, 0, 10, 0, 0, 1, 0, 0, 10, 1);
  near(t, 1, 1e-9);
});

test('rayAABB 正前方命中面', () => {
  // 盒子 x/z 各 -1..1，y 0..2；从 (0,1,-10) 向 +z
  near(Core.rayAABB(0, 1, -10, 0, 0, 1, -1, 0, -1, 1, 2, 1), 9, 1e-9);
});

test('rayAABB 平行于轴且在外侧时错过', () => {
  assert.strictEqual(
    Core.rayAABB(5, 1, -10, 0, 0, 1, -1, 0, -1, 1, 2, 1), -1);
});

test('rayAABB 完全偏离高度错过', () => {
  assert.strictEqual(
    Core.rayAABB(0, 5, -10, 0, 0, 1, -1, 0, -1, 1, 2, 1), -1);
});

test('rayAABB 起点在盒内返回 0', () => {
  assert.strictEqual(
    Core.rayAABB(0, 1, 0, 0, 0, 1, -1, 0, -1, 1, 2, 1), 0);
});

console.log('\n[角色碰撞]');

const wall = { minX: 2, maxX: 4, minY: 0, maxY: 3, minZ: -5, maxZ: 5 };

test('resolveCircle 沿 +x 撞墙后被推出', () => {
  const pos = { x: 1.4, z: 0 };
  const hit = Core.resolveCircle(pos, 1.0, 0, 0.4, [wall]);
  assert.strictEqual(hit, true);
  near(pos.x, 2 - 0.4, 1e-9, 'x');
});

test('resolveCircle 沿 -x 撞墙后被推出', () => {
  const pos = { x: 4.6, z: 0 };
  Core.resolveCircle(pos, -1.0, 0, 0.4, [wall]);
  near(pos.x, 4 + 0.4, 1e-9, 'x');
});

test('resolveCircle 墙外自由移动不受影响', () => {
  const pos = { x: 0, z: 0 };
  const hit = Core.resolveCircle(pos, 0.5, 0, 0.4, [wall]);
  assert.strictEqual(hit, false);
  near(pos.x, 0.5, 1e-9, 'x');
});

test('resolveCircle 轴分离：沿 z 撞墙换轴推出', () => {
  const pos = { x: 3, z: -5.8 };
  const hit = Core.resolveCircle(pos, 0, 1.0, 0.4, [wall]);
  assert.strictEqual(hit, true);
  near(pos.z, -5 - 0.4, 1e-9, 'z');
});

test('resolveCircle 高度不重叠时忽略该障碍', () => {
  const pos = { x: 1.4, z: 0 };
  const hit = Core.resolveCircle(pos, 1.0, 0, 0.4, [wall], 4, 6);
  assert.strictEqual(hit, false);
  near(pos.x, 2.4, 1e-9, 'x');
});

console.log('\n[随机与散布]');

test('seededRandom 同种子可复现', () => {
  const a = Core.seededRandom(42);
  const b = Core.seededRandom(42);
  for (let i = 0; i < 8; i++) assert.strictEqual(a(), b());
});

test('seededRandom 输出在 [0,1)', () => {
  const r = Core.seededRandom(7);
  for (let i = 0; i < 500; i++) {
    const v = r();
    assert.ok(v >= 0 && v < 1, `越界值 ${v}`);
  }
});

test('randomInCone 返回单位向量', () => {
  const r = Core.seededRandom(3);
  for (let i = 0; i < 200; i++) {
    const d = Core.randomInCone(0, 0, 1, 0.05, r);
    near(Math.hypot(d.x, d.y, d.z), 1, 1e-9, '长度');
  }
});

test('randomInCone 零散布保持原方向', () => {
  const d = Core.randomInCone(0, 0, 1, 0, Core.seededRandom(1));
  near(d.x, 0, 1e-12);
  near(d.y, 0, 1e-12);
  near(d.z, 1, 1e-12);
});

test('randomInCone 落点角度不超过设定散布', () => {
  const r = Core.seededRandom(9);
  const spread = 0.08;
  for (let i = 0; i < 300; i++) {
    const d = Core.randomInCone(0, 0, 1, spread, r);
    const angle = Math.acos(Math.min(1, d.z));
    assert.ok(angle <= spread + 1e-9, `角度 ${angle} > ${spread}`);
  }
});

console.log('\n[弹药系统]');

test('初始满弹匣可射击', () => {
  const a = new Ammo(30, 90);
  assert.strictEqual(a.canFire(), true);
  assert.strictEqual(a.fire(), true);
  assert.strictEqual(a.mag, 29);
});

test('换弹补足弹匣并扣除备弹', () => {
  const a = new Ammo(30, 90);
  for (let i = 0; i < 22; i++) a.fire();
  assert.strictEqual(a.mag, 8);
  assert.strictEqual(a.startReload(), true);
  assert.strictEqual(a.canFire(), false, '换弹中不可射击');
  assert.strictEqual(a.finishReload(), 22);
  assert.strictEqual(a.mag, 30);
  assert.strictEqual(a.reserve, 68);
  assert.strictEqual(a.canFire(), true);
});

test('备弹不足时只补现有数量', () => {
  const a = new Ammo(30, 10);
  for (let i = 0; i < 25; i++) a.fire();
  a.startReload();
  assert.strictEqual(a.finishReload(), 10);
  assert.strictEqual(a.mag, 15);
  assert.strictEqual(a.reserve, 0);
});

test('满弹匣或空备弹无法开始换弹', () => {
  const full = new Ammo(30, 90);
  assert.strictEqual(full.startReload(), false);
  const empty = new Ammo(5, 0);
  empty.mag = 0;
  assert.strictEqual(empty.startReload(), false);
});

test('弹匣为空时射击失败', () => {
  const a = new Ammo(2, 0);
  assert.strictEqual(a.fire(), true);
  assert.strictEqual(a.fire(), true);
  assert.strictEqual(a.fire(), false);
  assert.strictEqual(a.mag, 0);
});

test('refill 补满并可补足备弹', () => {
  const a = new Ammo(30, 0);
  a.fire();
  a.refill(true);
  assert.strictEqual(a.mag, 30);
  assert.strictEqual(a.reserve, 90);
});

console.log('\n[比分与胜负]');

test('击杀只给红蓝两支队伍计分', () => {
  const m = new Match(5);
  assert.strictEqual(m.addKill('red'), true);
  assert.strictEqual(m.addKill('green'), false);
  assert.strictEqual(m.scores.red, 1);
  assert.strictEqual(m.scores.blue, 0);
});

test('达到目标分立即结束并记录胜方', () => {
  const m = new Match(2);
  m.addKill('blue');
  assert.strictEqual(m.over, false);
  m.addKill('blue');
  assert.strictEqual(m.over, true);
  assert.strictEqual(m.winner, 'blue');
});

test('结束后不再接受比分变化', () => {
  const m = new Match(1);
  m.addKill('red');
  assert.strictEqual(m.addKill('red'), false);
  assert.strictEqual(m.scores.red, 1);
});

test('leader 平局返回 null', () => {
  const m = new Match(5);
  assert.strictEqual(m.leader(), null);
  m.addKill('red');
  assert.strictEqual(m.leader(), 'red');
});

test('ensureEnd 由时间结束判胜，平局 winner 为 null', () => {
  const m = new Match(20);
  m.scores.red = 3;
  m.scores.blue = 3;
  m.ensureEnd();
  assert.strictEqual(m.over, true);
  assert.strictEqual(m.winner, null);
});

console.log('\n[手榴弹弹道]');

test('ballisticVelocity 同高度飞行时垂直分量抵消重力', () => {
  const v = Core.ballisticVelocity({ x: 0, y: 1.6, z: 0 }, { x: 0, y: 1.6, z: 12 }, 1.2, 18);
  near(v.x, 0, 1e-9);
  near(v.z, 10, 1e-9);
  near(v.y, 0.5 * 18 * 1.2, 1e-9); // 10.8
});

test('ballisticVelocity 最短飞行时间被钳制', () => {
  const v = Core.ballisticVelocity({ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }, 0, 18);
  near(v.x, 50, 1e-9); // 10 / 0.2
});

test('ballisticVelocity 解析积分后落点正确', () => {
  const g = 18, t = 1.5;
  const from = { x: 1, y: 1.4, z: -3 };
  const to = { x: 6, y: 0.2, z: 9 };
  const v = Core.ballisticVelocity(from, to, t, g);
  // 以初速度 + 重力加速度积分 t 秒
  near(from.x + v.x * t, to.x, 1e-9, 'x');
  near(from.y + v.y * t - 0.5 * g * t * t, to.y, 1e-9, 'y');
  near(from.z + v.z * t, to.z, 1e-9, 'z');
});

console.log(`\n结果：${passed} 项通过${process.exitCode ? '，存在失败' : '，全部通过'}`);
