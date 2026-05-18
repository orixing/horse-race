/**
 * RagdollHorse — Rapier 2D 多刚体 Active Ragdoll 马匹
 *
 * 基于 NotebookLM 分析的原版 Horsey Game 物理方案：
 *
 * 核心原理（不需要任何"魔法"辅助力）：
 *   1. 电机扭矩驱动腿关节振荡
 *   2. 蹄子高摩擦锁地 → 电机扭矩转化为支撑力+推进力
 *   3. LEG_SKEW 前倾角将垂直蹬地力分解出水平推力
 *   4. 重心平衡（头部配重）决定稳定性
 *
 * 关键参数（NotebookLM 建议）：
 *   - 身体密度 3.0（降低质量让电机容易驱动）
 *   - 腿密度 1.0（有一定惯性）
 *   - motorStiffness 2000-3000（克服躯干转动惯量）
 *   - motorDamping 100-200（临界阻尼防弹跳）
 *   - linearDamping 0（不在空中损失速度）
 *   - angularDamping 0.5（极微弱稳定，保留 ragdoll 混沌感）
 *   - LEG_SKEW ~24°（腿前倾，关键！）
 *   - 蹄子摩擦 2.0（锁地）
 */

import RAPIER from "@dimforge/rapier2d-compat";
import * as THREE from "three";
import { getHorseDisplayName, HORSE_NAMES_I18N } from "./i18n.js";
export { RAPIER };

// ══════════════════════════════════════════════════════════
//  基因等位基因表（来自原版 genes.xml）
// ══════════════════════════════════════════════════════════
const GENE_ALLELES = {
  // ── 体型 ──
  size:            { A: 100, T: 50,  C: 35,  G: 75  },
  aspect:          { A: 200, T: 310, C: 150, G: 250 },
  skinny:          { A: 100, T: 200, C: 100, G: 75  },
  legLength:       { A: 80,  T: 50,  C: 120, G: 100 },
  legSkew:         { A: -7,  T: -3,  C: 5,   G: 0   },  // 后腿倾角 -7~+5
  armSkew:         { A: 7,   T: 3,   C: -5,  G: 0   },  // 前腿倾角 -5~+7

  // ── 运动力学 ──
  speedFactor:     { A: 90,  T: 130, C: 70,  G: 110 },  // 70~130
  legStrength:     { A: 104, T: 80,  C: 120, G: 95  },
  legFlexibility:  { A: 25,  T: 20,  C: 35,  G: 40  },  // 后腿灵活度 20~40
  armFlexibility:  { A: 30,  T: 20,  C: 40,  G: 25  },  // 前腿灵活度 20~40
  // legFlexBias / armFlexBias 不再独立随机，强制等于倾角（见 randomGenome）
  legThrustBack:   { A: 2,   T: 0,   C: 1,   G: 0   },
  stiffJoints:     { A: 50,  T: 0,   C: 0,   G: 18  },
  muscleUse:       { A: 80,  T: 50,  C: 100, G: 100 },

  // ── 控制 ──
  breakForce:      { A: 50,  T: 0,   C: 30,  G: 0   },
  brainSpastic:    { A: 2,   T: 0,   C: 0,   G: 1   },
  narcolepsy:      { A: 0,   T: 0,   C: 0,   G: 1   },
  locoSync:        { A: 0,   T: 1,   C: 0,   G: 1   },  // 0=交替步, 1=同步跳
  spinalLoco:      { A: 2,   T: 1,   C: 0,   G: 0   },  // 着地弹跳(A=2最强)

  // ── 步态信号耦合（FTOB/BTOF）──
  // FTOB = 前腿事件触发后腿反应，BTOF = 后腿事件触发前腿反应
  // event: 0=无, 1=着地时, 2=最后方时, 3=最前方时
  // react: 0=无, 1=加速到最后方, 2=加速到最前方, 3=反转方向
  legFtobEvent:    { A: 1,   T: 0,   C: 2,   G: 1   },  // 前腿什么时候触发后腿
  legFtobReact:    { A: 1,   T: 0,   C: 1,   G: 2   },  // 后腿怎么反应
  armBtofEvent:    { A: 1,   T: 0,   C: 2,   G: 1   },  // 后腿什么时候触发前腿
  armBtofReact:    { A: 1,   T: 0,   C: 1,   G: 2   },  // 前腿怎么反应

  // ── 颈部 ──
  neckFlexibility: { A: 0,   T: 10,  C: 40,  G: 23  },
};

function pickAllele(obj) {
  const keys = ["A", "T", "C", "G"];
  return obj[keys[Math.floor(Math.random() * 4)]];
}

export function randomGenome() {
  const g = {};
  for (const [k, v] of Object.entries(GENE_ALLELES)) g[k] = pickAllele(v);
  // 偏置强制等于倾角
  g.legFlexBias = g.legSkew;
  g.armFlexBias = g.armSkew;
  return g;
}

export function defaultGenome() {
  const g = {};
  for (const [k, v] of Object.entries(GENE_ALLELES)) g[k] = v.A;
  g.legFlexBias = g.legSkew;
  g.armFlexBias = g.armSkew;
  return g;
}

/** 速度型基因组：最优竞速 */
export function fastGenome() {
  return {
    size: 100, aspect: 200, skinny: 100, legLength: 120,
    legSkew: 24, armSkew: 20,
    speedFactor: 133, legStrength: 120, legFlexibility: 40, armFlexibility: 35,
    legFlexBias: 15, armFlexBias: 10, legThrustBack: 2, stiffJoints: 50,
    muscleUse: 100, breakForce: 0, brainSpastic: 0,
    narcolepsy: 0, locoSync: 1, spinalLoco: 2,
    legFtobEvent: 1, legFtobReact: 1, armBtofEvent: 1, armBtofReact: 1,
    neckFlexibility: 23,
  };
}

// ── 马匹名字池（中文名作为内部ID，显示时通过 i18n 获取双语名）──
const HORSE_NAMES = HORSE_NAMES_I18N.map(n => n.zh);

// ── 马匹配色方案 ──
const BODY_COLORS = [
  0xcc8844, 0x886633, 0xddaa55, 0x553322, 0xbb7733, // 棕色系
  0x222222, 0x333333, 0x444444,                       // 黑色系
  0xeeeeee, 0xddddcc, 0xccbbaa,                       // 白/灰色系
  0xaa4422, 0x993311, 0xbb5533,                       // 红棕色系
  0xddbb66, 0xccaa44,                                 // 金色系
];

const LEG_PATTERNS = ["same", "dark", "white_socks", "gradient"];
const PATTERN_TYPES = ["solid", "split", "spots"];

function randomAppearance() {
  const bodyColor = BODY_COLORS[Math.floor(Math.random() * BODY_COLORS.length)];
  const legPattern = LEG_PATTERNS[Math.floor(Math.random() * LEG_PATTERNS.length)];
  const pattern = PATTERN_TYPES[Math.floor(Math.random() * PATTERN_TYPES.length)];
  const riderColors = [0xff3333, 0x3366ff, 0x33cc33, 0xffcc00, 0xff66cc, 0x9933ff, 0xff8800, 0x00cccc];
  const riderColor = riderColors[Math.floor(Math.random() * riderColors.length)];
  const name = HORSE_NAMES[Math.floor(Math.random() * HORSE_NAMES.length)];

  // 斑点第二色（用于 split 和 spots 花纹）
  const spot2 = BODY_COLORS[Math.floor(Math.random() * BODY_COLORS.length)];

  // 腿色
  let legColor, hindLegColor, foreLegColor;
  switch (legPattern) {
    case "dark":
      legColor = new THREE.Color(bodyColor).multiplyScalar(0.5).getHex();
      break;
    case "white_socks":
      legColor = 0xeeeeee;
      break;
    case "gradient":
      legColor = new THREE.Color(bodyColor).multiplyScalar(0.7).getHex();
      break;
    default: // same
      legColor = new THREE.Color(bodyColor).multiplyScalar(0.75).getHex();
      break;
  }

  // split 花纹时前后腿各自跟对应半身颜色
  if (pattern === "split") {
    hindLegColor = new THREE.Color(bodyColor).multiplyScalar(0.75).getHex();   // 后半=主色
    foreLegColor = new THREE.Color(spot2).multiplyScalar(0.75).getHex();       // 前半=第二色
  } else {
    hindLegColor = legColor;
    foreLegColor = legColor;
  }

  // 鬃毛/尾巴色
  const maneOptions = [
    new THREE.Color(bodyColor).multiplyScalar(0.3).getHex(), // 深色
    0x222222, // 黑色
    0xeeeecc, // 浅色
    new THREE.Color(bodyColor).multiplyScalar(0.5).getHex(), // 中间色
  ];
  const maneColor = maneOptions[Math.floor(Math.random() * maneOptions.length)];

  // 鼻子色
  const noseColor = Math.random() > 0.5 ? 0x332211 : 0xffccaa;

  const displayName = getHorseDisplayName(name);
  return { bodyColor, legColor, hindLegColor, foreLegColor, maneColor, noseColor, riderColor, name, displayName, pattern, spotColor: spot2 };
}

export { randomAppearance, HORSE_NAMES };

export class RagdollHorse {
  constructor(world, genome, startX = 0) {
    this.world = world;
    this.genome = { ...defaultGenome(), ...genome };
    this.appearance = randomAppearance();
    this.motorPhase = 0;
    this.elapsed = 0;
    this.running = false;

    // 耐力系统
    this.stamina = 0;
    this.staminaRegenRate = 0.3 + Math.random() * 0.2;  // 0.3~0.5随机
    this.staminaMaxForce = 10;
    this.lastSwipeForce = null;   // 调试用：记录上次滑动施力

    // 蹬地冷却（防止一帧内多次蹬地）
    this.kickCooldown = { hindLeg: 0, foreLeg: 0 };
    this.kickCooldownTime = 0.08; // 80ms 冷却

    const g = this.genome;

    // ── 从基因推算尺寸 ──
    const sc = 0.7 + (g.size / 100) * 0.3;
    this.bodyW   = (0.9 + (g.aspect / 310) * 0.7) * sc;
    this.bodyH   = (0.45 - (g.skinny / 200) * 0.15) * sc;
    const baseLegLen = (0.35 + (g.legLength / 120) * 0.55) * sc;
    this.hindLegLenScale = 0.9 + Math.random() * 0.2; // 0.9~1.1
    this.foreLegLenScale = 0.9 + Math.random() * 0.2; // 0.9~1.1
    this.legLen  = baseLegLen; // 基础腿长（构建时用各自的缩放）
    this.legW    = 0.07 * sc;
    this.neckLen = 0.32 * sc;
    this.neckW   = 0.07 * sc;
    this.headW   = 0.24 * sc;
    this.headH   = 0.10 * sc;
    this.hoofH   = this.legW * 0.5;

    // ── 估算体重（用于力的缩放）──
    // 身体面积 × 密度 ≈ 质量
    const bodyArea = this.bodyW * this.bodyH;
    const bodyMass = bodyArea * 3.0; // 密度3.0
    this.estimatedMass = bodyMass;

    // ── 电机参数（按体重缩放）──
    const strengthF = (g.legStrength / 100) * (g.muscleUse / 100);
    const stiffF    = 1 + g.stiffJoints / 30;
    const massScale = bodyMass / 1.0; // 基准质量≈1.0时的参数

    this.motorFreq      = (g.speedFactor / 100) * 2.5;
    this.hindFlexRad    = g.legFlexibility * Math.PI / 180;
    this.foreFlexRad    = (g.armFlexibility !== undefined ? g.armFlexibility : g.legFlexibility) * Math.PI / 180;
    this.hindBiasRad    = g.legFlexBias * Math.PI / 180;
    this.foreBiasRad    = (g.armFlexBias !== undefined ? g.armFlexBias : g.legFlexBias) * Math.PI / 180;
    this.hindSkewRad    = (g.legSkew || 0) * Math.PI / 180;
    this.foreSkewRad    = (g.armSkew || 0) * Math.PI / 180;

    // 电机参数按体重缩放
    this.motorStiffness = strengthF * stiffF * 1200 * massScale;
    this.motorDamping   = strengthF * stiffF * 80 * massScale;

    // 蹬地推力也按体重缩放
    this.kickStrength     = strengthF * 200.0 * massScale;
    // 蹬地摩擦力系数（前后腿分开）
    // 后腿是发动机（大摩擦=强推进），前腿是着陆架（小摩擦=轻制动）
    this.hindFrictionCoeff = 0.8;
    this.foreFrictionCoeff = 0.3;

    this.thrustBack     = g.legThrustBack;
    this.locoSync       = g.locoSync || 0;
    this.spinalLoco     = g.spinalLoco || 0;
    this.fallen         = false;

    // 侧翻检测 + 救马模式
    this.minKickThreshold = this.kickStrength * 0.2; // 最小蹬地力阈值
    this._noKickTimer = 0;       // 距上次有效蹬地的时间
    this._rescueMode = false;    // 是否在救马模式
    this._rescueBurst = 0;       // 救马模式连续使用次数（0~4）
    this._rescueBurstTimer = 0;  // 连续使用间隔计时

    // FTOB/BTOF 步态耦合状态
    this._gaitState = {
      hindLeg: { phase: 0, triggered: false },
      foreLeg: { phase: 0, triggered: false },
    };

    // ── 站立高度（取较短腿的投影高度）──
    const hindLegH = this.legLen * this.hindLegLenScale * Math.cos(this.hindSkewRad);
    const foreLegH = this.legLen * this.foreLegLenScale * Math.cos(this.foreSkewRad);
    this.spawnY = Math.min(hindLegH, foreLegH) + this.bodyH / 2 + this.hoofH + 0.02;

    // ── 调试数据（蹬地力可视化）──
    this.kickDebug = { hindLeg: null, foreLeg: null };

    // ── 构建 ──
    this.bodies = {};
    this.joints = {};
    this.colliders = {};

    const startY = this.spawnY;
    this._buildBody(startX, startY);
    this._buildLegs(startX, startY);
    this._buildNeck(startX, startY);
    this._buildTail(startX, startY);
    this._disableSelfCollision();
  }

  _disableSelfCollision() {
    for (const key of ["hindLeg", "foreLeg", "neck", "head"]) {
      if (this.joints[key]?.setContactsEnabled) {
        this.joints[key].setContactsEnabled(false);
      }
    }
    for (const j of this.joints.tailSegs || []) {
      if (j?.setContactsEnabled) j.setContactsEnabled(false);
    }
  }

  // ════════════════════════════════════════════════════════
  //  身体 — 密度 3.0（不要太重）
  // ════════════════════════════════════════════════════════
  _buildBody(x, y) {
    const desc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(x, y)
      .setLinearDamping(0.0)    // 0! 原版 BREAK_FORCE=0 时无线性阻力
      .setAngularDamping(0.5);  // 极微弱，保留 ragdoll 混沌
    this.bodies.body = this.world.createRigidBody(desc);

    const cd = RAPIER.ColliderDesc.cuboid(this.bodyW / 2, this.bodyH / 2)
      .setFriction(0.3)
      .setRestitution(0.02)
      .setDensity(3.0);
    this.colliders.body = this.world.createCollider(cd, this.bodies.body);
  }

  // ════════════════════════════════════════════════════════
  //  腿 — 带 LEG_SKEW 前倾角！
  // ════════════════════════════════════════════════════════
  _buildLegs(x, y) {
    const bw = this.bodyW, lw = this.legW, bh = this.bodyH;
    const foreLegPhase = this.locoSync ? 0.0 : 0.5;

    this._buildOneLeg("hindLeg", x, y,
      -bw / 2 + lw * 2, -bh / 2, 0.0, this.hindSkewRad);
    this._buildOneLeg("foreLeg", x, y,
      bw / 2 - lw * 2, -bh / 2, foreLegPhase, this.foreSkewRad);
  }

  _buildOneLeg(name, bodyX, bodyY, hipLocalX, hipLocalY, phaseOffset, skew) {
    const legScale = name === "hindLeg" ? this.hindLegLenScale : this.foreLegLenScale;
    const ll = this.legLen * legScale, lw = this.legW;

    // 腿的初始位置：带前倾角
    const worldHipX = bodyX + hipLocalX;
    const worldHipY = bodyY + hipLocalY;
    const legCenterX = worldHipX + Math.sin(skew) * ll / 2;
    const legCenterY = worldHipY - Math.cos(skew) * ll / 2;

    const desc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(legCenterX, legCenterY)
      .setRotation(skew)          // 初始就是倾斜的！
      .setLinearDamping(0.0)
      .setAngularDamping(0.2);
    const legBody = this.world.createRigidBody(desc);

    // 腿杆
    const legCD = RAPIER.ColliderDesc.cuboid(lw / 2, ll / 2)
      .setFriction(1.5)
      .setRestitution(0.0)
      .setDensity(3.0);
    this.world.createCollider(legCD, legBody);

    // 蹄子 — 高摩擦锁地 + SPINAL_LOCO弹性（Rapier自动算弹跳）
    const bounciness = (this.spinalLoco || 0) * 0.2; // spinalLoco=2 → restitution=0.4
    const hoofCD = RAPIER.ColliderDesc.cuboid(lw * 1.2, this.hoofH)
      .setFriction(3.0)
      .setRestitution(bounciness)
      .setDensity(4.0)
      .setTranslation(0, -ll / 2 + this.hoofH);
    const hoofCollider = this.world.createCollider(hoofCD, legBody);
    this.colliders[name + "Hoof"] = hoofCollider;

    // 铰链关节
    const jd = RAPIER.JointData.revolute(
      { x: hipLocalX, y: hipLocalY },
      { x: 0, y: ll / 2 }
    );
    const joint = this.world.createImpulseJoint(jd, this.bodies.body, legBody, true);

    // 角度限制：[BIAS + SKEW - FLEX/2,  BIAS + SKEW + FLEX/2]
    // 关键：限位要比正弦波范围宽 ~20°，只做安全边界防抽搐
    // 正常步态完全由 PD 电机柔性控制
    const bias = name === "hindLeg" ? this.hindBiasRad : this.foreBiasRad;
    const center = bias + skew;
    const padding = 20 * Math.PI / 180;
    const flexRad = name === "hindLeg" ? this.hindFlexRad : this.foreFlexRad;
    const limitLo = center - flexRad / 2 - padding;
    const limitHi = center + flexRad / 2 + padding;
    joint.setLimits(limitLo, limitHi);

    joint.configureMotorPosition(center, this.motorStiffness, this.motorDamping);

    this.bodies[name] = legBody;
    this.joints[name] = joint;
    this.joints[name + "_phase"] = phaseOffset;
    // 存实际腿长（含缩放）
    if (!this._actualLegLen) this._actualLegLen = {};
    this._actualLegLen[name] = ll;
  }

  // ════════════════════════════════════════════════════════
  //  颈部 — 作为配重平衡身体
  // ════════════════════════════════════════════════════════
  _buildNeck(x, y) {
    const bw = this.bodyW, bh = this.bodyH;
    const nl = this.neckLen, nw = this.neckW;

    const pivotLX = bw / 2 - 0.02;
    const pivotLY = bh / 2;
    const neckRest = -0.4;
    const neckCX = x + pivotLX + Math.sin(-neckRest) * nl / 2;
    const neckCY = y + pivotLY + Math.cos(-neckRest) * nl / 2;

    const desc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(neckCX, neckCY)
      .setRotation(neckRest)
      .setLinearDamping(0.0)
      .setAngularDamping(2.0);
    const neckBody = this.world.createRigidBody(desc);

    const cd = RAPIER.ColliderDesc.cuboid(nw / 2, nl / 2)
      .setFriction(0.2)
      .setDensity(1.5);  // 颈部有一定质量做配重
    this.world.createCollider(cd, neckBody);

    const jd = RAPIER.JointData.revolute(
      { x: pivotLX, y: pivotLY },
      { x: 0, y: -nl / 2 }
    );
    const joint = this.world.createImpulseJoint(jd, this.bodies.body, neckBody, true);
    // neckFlexibility: 0=僵硬(限位窄,电机强), 40=灵活(限位宽,电机弱)
    const neckFlex = (this.genome.neckFlexibility || 0) * Math.PI / 180;
    const neckStiff = 150 - (this.genome.neckFlexibility || 0) * 2.5; // 0→150, 40→50
    const neckDamp = 20 - (this.genome.neckFlexibility || 0) * 0.3;   // 0→20, 40→8
    joint.setLimits(neckRest - neckFlex - 0.2, neckRest + neckFlex + 0.1);
    joint.configureMotorPosition(neckRest, Math.max(neckStiff, 30), Math.max(neckDamp, 5));

    this.bodies.neck = neckBody;
    this.joints.neck = joint;
    this.joints.neck_rest = neckRest;

    this._buildHead(neckCX, neckCY, neckRest, nl);
  }

  _buildHead(neckCX, neckCY, neckRest, nl) {
    const hw = this.headW, hh = this.headH;
    const neckTopX = neckCX + Math.sin(-neckRest) * nl / 2;
    const neckTopY = neckCY + Math.cos(-neckRest) * nl / 2;
    const headAngle = neckRest + 0.4;

    const desc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(neckTopX + hw * 0.3, neckTopY)
      .setRotation(headAngle)
      .setLinearDamping(0.0)
      .setAngularDamping(2.0);
    const headBody = this.world.createRigidBody(desc);

    const cd = RAPIER.ColliderDesc.cuboid(hw / 2, hh / 2)
      .setFriction(0.2)
      .setDensity(2.0);  // 头较重 — 做前方配重！
    this.world.createCollider(cd, headBody);

    const jd = RAPIER.JointData.revolute(
      { x: 0, y: nl / 2 },
      { x: -hw / 2, y: 0 }
    );
    const joint = this.world.createImpulseJoint(jd, this.bodies.neck, headBody, true);
    joint.setLimits(-0.4, 0.4);
    joint.configureMotorPosition(0, 40, 6);

    this.bodies.head = headBody;
    this.joints.head = joint;
  }

  // ════════════════════════════════════════════════════════
  //  尾巴
  // ════════════════════════════════════════════════════════
  _buildTail(x, y) {
    const bw = this.bodyW, bh = this.bodyH;
    const segLen = 0.09, segW = 0.02, numSegs = 3;

    let parent = this.bodies.body;
    let anchor = { x: -bw / 2, y: bh / 4 };
    this.bodies.tailSegs = [];
    this.joints.tailSegs = [];

    let px = x + anchor.x, py = y + anchor.y;
    const tailAng = 2.2;

    for (let i = 0; i < numSegs; i++) {
      const cx = px - Math.cos(tailAng) * segLen / 2;
      const cy = py + Math.sin(tailAng) * segLen / 2;

      const desc = RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(cx, cy)
        .setLinearDamping(1.0)
        .setAngularDamping(2.0);
      const seg = this.world.createRigidBody(desc);

      const cd = RAPIER.ColliderDesc.cuboid(segW / 2, segLen / 2)
        .setFriction(0.1).setDensity(0.3);
      this.world.createCollider(cd, seg);

      const jd = RAPIER.JointData.revolute(anchor, { x: 0, y: -segLen / 2 });
      const j = this.world.createImpulseJoint(jd, parent, seg, true);
      j.setLimits(-0.5, 0.5);
      j.configureMotorPosition(0, 3, 1);

      this.bodies.tailSegs.push(seg);
      this.joints.tailSegs.push(j);

      anchor = { x: 0, y: segLen / 2 };
      parent = seg;
      px = cx - Math.cos(tailAng) * segLen / 2;
      py = cy + Math.sin(tailAng) * segLen / 2;
    }
  }

  // ════════════════════════════════════════════════════════
  //  每帧更新
  // ════════════════════════════════════════════════════════
  /** 从 genome 重新计算运动参数（支持实时调参）*/
  _recalcParams() {
    const g = this.genome;
    const strengthF = (g.legStrength / 100) * (g.muscleUse / 100);
    const stiffF    = 1 + g.stiffJoints / 30;

    this.motorFreq      = (g.speedFactor / 100) * 2.5;
    this.hindFlexRad    = g.legFlexibility * Math.PI / 180;
    this.foreFlexRad    = (g.armFlexibility !== undefined ? g.armFlexibility : g.legFlexibility) * Math.PI / 180;
    this.hindBiasRad    = g.legFlexBias * Math.PI / 180;
    this.foreBiasRad    = (g.armFlexBias !== undefined ? g.armFlexBias : g.legFlexBias) * Math.PI / 180;
    this.hindSkewRad    = (g.legSkew || 0) * Math.PI / 180;
    this.foreSkewRad    = (g.armSkew || 0) * Math.PI / 180;
    const massScale = this.estimatedMass / 1.0;
    this.motorStiffness = strengthF * stiffF * 1200 * massScale;
    this.motorDamping   = strengthF * stiffF * 80 * massScale;
    this.kickStrength   = strengthF * 50.0 * massScale;
    this.thrustBack     = g.legThrustBack;
    this.locoSync       = g.locoSync || 0;
    this.spinalLoco     = g.spinalLoco || 0;
  }

  /**
   * 步态事件-反应耦合
   * @param {string} srcLeg   事件源腿（触发者）
   * @param {string} dstLeg   反应腿（被触发者）
   * @param {number} eventType 0=无, 1=着地时, 2=最后方时(sin最小), 3=最前方时(sin最大)
   * @param {number} reactType 0=无, 1=加速跳到最后方, 2=加速跳到最前方, 3=反转相位
   */
  _checkGaitEvent(srcLeg, dstLeg, eventType, reactType, dt) {
    if (!eventType || !reactType) return;

    const gs = this._gaitState;
    const srcPhase = gs[srcLeg].phase;
    const srcS = Math.sin(srcPhase * Math.PI * 2);
    const prevS = Math.sin((srcPhase - this.motorFreq * dt) * Math.PI * 2);

    let eventFired = false;

    switch (eventType) {
      case 1: {
        // 着地事件：蹄子刚碰到地面
        const legBody = this.bodies[srcLeg];
        if (legBody) {
          const legAngle = legBody.rotation();
          const legPos = legBody.translation();
          const hoofY = legPos.y - Math.cos(legAngle) * this.legLen / 2;
          if (hoofY < 0.08 && !gs[srcLeg].triggered) {
            eventFired = true;
            gs[srcLeg].triggered = true;
          }
          if (hoofY >= 0.08) gs[srcLeg].triggered = false;
        }
        break;
      }
      case 2:
        // 最后方事件：sin 从负变正（过零点，腿在最后方附近）
        if (prevS < 0 && srcS >= 0) eventFired = true;
        break;
      case 3:
        // 最前方事件：sin 从正变负（过零点，腿在最前方附近）
        if (prevS > 0 && srcS <= 0) eventFired = true;
        break;
    }

    if (!eventFired) return;

    switch (reactType) {
      case 1:
        // 加速跳到最后方（phase 跳到 sin=-1 的位置 = 0.75 周期）
        gs[dstLeg].phase = Math.floor(gs[dstLeg].phase) + 0.75;
        break;
      case 2:
        // 加速跳到最前方（phase 跳到 sin=+1 的位置 = 0.25 周期）
        gs[dstLeg].phase = Math.floor(gs[dstLeg].phase) + 0.25;
        break;
      case 3:
        // 反转方向（给相位加 0.5 周期）
        gs[dstLeg].phase += 0.5;
        break;
    }
  }

  update(dt) {
    const g = this.genome;
    this._recalcParams();

    // 未开始时：电机锁在初始角度，不振荡，不蹬地
    if (!this.running) {
      for (const name of ["hindLeg", "foreLeg"]) {
        const skew = name === "hindLeg" ? this.hindSkewRad : this.foreSkewRad;
        const bias = name === "hindLeg" ? this.hindBiasRad : this.foreBiasRad;
        const restAngle = skew + bias;
        this.joints[name].configureMotorPosition(restAngle, this.motorStiffness, this.motorDamping);
        this.kickDebug[name] = null;
      }
      return;
    }

    this.elapsed += dt;

    // ── 步态信号耦合系统 ──
    // 每条腿有独立的相位，通过事件-反应互相影响
    const gs = this._gaitState;
    gs.hindLeg.phase += this.motorFreq * dt;
    gs.foreLeg.phase += this.motorFreq * dt;

    // 检测事件并触发反应
    this._checkGaitEvent("foreLeg", "hindLeg", g.legFtobEvent, g.legFtobReact, dt);
    this._checkGaitEvent("hindLeg", "foreLeg", g.armBtofEvent, g.armBtofReact, dt);

    for (const name of ["hindLeg", "foreLeg"]) {
      const skew = name === "hindLeg" ? this.hindSkewRad : this.foreSkewRad;
      const bias = name === "hindLeg" ? this.hindBiasRad : this.foreBiasRad;
      const phase = gs[name].phase;
      const s = Math.sin(phase * Math.PI * 2);

      const flexRad = name === "hindLeg" ? this.hindFlexRad : this.foreFlexRad;
      let target = skew + bias + s * flexRad;

      if (g.brainSpastic > 0) {
        target += (Math.random() - 0.5) * g.brainSpastic * 0.06;
      }

      // ── 内置电机 ──
      const joint = this.joints[name];
      if (!this.fallen) {
        joint.configureMotorPosition(target, this.motorStiffness, this.motorDamping);
      }

      // ── 蹬地力：着地瞬间沿腿方向施加在蹄子上 ──
      this.kickDebug[name] = null;

      const legBody = this.bodies[name];
      const legAngle = legBody.rotation();
      const legPos = legBody.translation();
      const ll = this._actualLegLen?.[name] || this.legLen;
      const hoofY = legPos.y - Math.cos(legAngle) * ll / 2;
      const onGround = hoofY < 0.08;

      if (onGround) {
        // 沿腿方向（蹄子→髋关节 = 向上偏斜）
        const dirX = -Math.sin(legAngle);
        const dirY = Math.cos(legAngle);

        // 角度系数：腿在中间位置(=skew+bias)时系数1，越偏离越小，最大角度时为0
        const bodyAngle = this.bodies.body.rotation();
        const relAngle = legAngle - bodyAngle; // 相对于身体的关节角度
        const centerAngle = skew + bias;       // 中间位置
        const halfRange = flexRad / 2;    // 最大偏离量
        const deviation = Math.abs(relAngle - centerAngle); // 当前偏离量
        // 余弦曲线：中间=1，偏离一半≈0.75，极限=0
        const t = Math.min(1, deviation / Math.max(halfRange, 0.01));
        const angleCoeff = 0.2 + 0.8 * Math.cos(t * Math.PI / 2); // 最小0.2，最大1.0

        const kickForce = this.kickStrength * angleCoeff * dt;

        // 施加在蹄子上（通过关节约束传导到身体）
        const hoofWX = legPos.x - dirX * ll / 2;
        const hoofWY = legPos.y - dirY * ll / 2;
        legBody.applyImpulseAtPoint(
          { x: dirX * kickForce, y: dirY * kickForce },
          { x: hoofWX, y: hoofWY },
          true
        );

        // legThrustBack: 额外水平向前推力（0=无, 1=弱, 2=强）
        if (this.thrustBack > 0) {
          const thrustForce = this.thrustBack * this.kickStrength * 0.3 * angleCoeff * dt;
          this.bodies.body.applyImpulse({ x: thrustForce, y: 0 }, true);
        }

        // 记录有效蹬地（用于侧翻检测）
        const actualKick = this.kickStrength * angleCoeff;
        if (actualKick >= this.minKickThreshold) {
          this._noKickTimer = 0;
          this._rescueMode = false;
        }

        // 调试
        this.kickDebug[name] = {
          hipX: hoofWX, hipY: hoofWY,
          hoofX: hoofWX, hoofY: hoofWY,
          dirX, dirY,
          force: actualKick,
          frictionForce: 0,
        };
      }

      /*
      // [已注释] 手动蹬地力和摩擦力
      this.kickCooldown[name] = Math.max(0, this.kickCooldown[name] - dt);
      if (onGround && this.kickCooldown[name] <= 0) {
        this.kickCooldown[name] = this.kickCooldownTime;
        const bodyBody = this.bodies.body;
        const bodyAngle = bodyBody.rotation();
        const bodyPos = bodyBody.translation();
        const bw = this.bodyW, bh = this.bodyH;
        const hipLX = name === "hindLeg" ? (-bw / 2 + this.legW * 2) : (bw / 2 - this.legW * 2);
        const hipLY = -bh / 2;
        const cosB = Math.cos(bodyAngle), sinB = Math.sin(bodyAngle);
        const hipWX = bodyPos.x + hipLX * cosB - hipLY * sinB;
        const hipWY = bodyPos.y + hipLX * sinB + hipLY * cosB;
        const dirX = -Math.sin(legAngle);
        const dirY = Math.cos(legAngle);
        const hoofWX = legPos.x + Math.sin(legAngle) * this.legLen / 2;
        const hoofWY = legPos.y - Math.cos(legAngle) * this.legLen / 2;
        const kickForce = this.kickStrength;
        bodyBody.applyImpulseAtPoint(
          { x: dirX * kickForce * dt, y: dirY * kickForce * dt },
          { x: hipWX, y: hipWY }, true);
        const coeff = name === "hindLeg" ? this.hindFrictionCoeff : this.foreFrictionCoeff;
        const frictionForce = kickForce * Math.abs(dirY) * coeff;
        const moveDir = dirX > 0 ? 1 : -1;
        legBody.applyImpulse({ x: moveDir * frictionForce * dt, y: 0 }, true);
        this.kickDebug[name] = { hipX: hipWX, hipY: hipWY, hoofX: hoofWX, hoofY: hoofWY,
          dirX, dirY, force: kickForce, frictionForce: moveDir * frictionForce };
      }
      */
    }

    // ── 摔倒检测：身体倾斜>60°时电机归零变ragdoll ──
    const bodyRot = Math.abs(this.bodies.body.rotation());
    this.fallen = bodyRot > (60 * Math.PI / 180);
    if (this.fallen) {
      // 关闭所有电机
      for (const jName of ["hindLeg", "foreLeg"]) {
        this.joints[jName].configureMotorPosition(0, 0, 0);
      }
      if (this.joints.neck) this.joints.neck.configureMotorPosition(0, 0, 0);
      if (this.joints.head) this.joints.head.configureMotorPosition(0, 0, 0);
    }

    // 头晕（扭矩按体重缩放，重马晃得更猛）
    if (g.narcolepsy > 0 && Math.random() < g.narcolepsy * 0.003) {
      const massScale = this.estimatedMass / 1.0;
      this.bodies.body.applyTorqueImpulse((Math.random() - 0.5) * 1.0 * massScale, true);
    }

    // 颈部补偿身体俯仰（刚度由 neckFlexibility 基因决定）
    if (this.joints.neck && !this.fallen) {
      const nf = g.neckFlexibility || 0;
      const neckStiff = Math.max(150 - nf * 2.5, 30);
      const neckDamp = Math.max(20 - nf * 0.3, 5);
      const bodyAng = this.bodies.body.rotation();
      const rest = this.joints.neck_rest - bodyAng * 0.5;
      this.joints.neck.configureMotorPosition(rest, neckStiff, neckDamp);
    }

    // 制动力
    if (g.breakForce > 0) {
      const vel = this.bodies.body.linvel();
      this.bodies.body.applyImpulse(
        { x: vel.x * -g.breakForce * 0.001, y: 0 }, true
      );
    }

    // 耐力恢复
    this.stamina = Math.min(1, this.stamina + this.staminaRegenRate * dt);
    // 滑动力衰减显示
    if (this.lastSwipeForce) {
      this.lastSwipeForce.timer -= dt;
      if (this.lastSwipeForce.timer <= 0) this.lastSwipeForce = null;
    }

    // 侧翻检测：1秒内没有有效蹬地 → 进入救马模式
    this._noKickTimer += dt;
    if (this._noKickTimer > 1.0 && !this._rescueMode) {
      this._rescueMode = true;
      this._rescueBurst = 0;
      this._rescueBurstTimer = 0;
    }

    // 救马模式：AI马攒满体力后连续4次往右上拉（摔倒时也生效）
    if (this._rescueMode && this.isAI && this.running) {
      if (this._rescueBurst > 0) {
        // 正在连续使用中
        this._rescueBurstTimer -= dt;
        if (this._rescueBurstTimer <= 0 && this.stamina >= 0.1) {
          const angle = (60 + (Math.random() - 0.5) * 20) * Math.PI / 180; // 右上60°±10°
          this.applyStamina(Math.cos(angle), Math.sin(angle));
          this._rescueBurst--;
          this._rescueBurstTimer = 0.1; // 0.1秒间隔
        }
      } else if (this.stamina >= 1.0) {
        // 攒满了，开始连续4次
        this._rescueBurst = 4;
        this._rescueBurstTimer = 0;
      }
    }

    // AI 骑手逻辑（非玩家马，救马模式时不走正常AI）
    if (this.isAI && this.running && !this.fallen && !this._rescueMode) {
      this._aiTimer = (this._aiTimer || 0) - dt;
      if (this._aiTimer <= 0) {
        this._aiTimer = 0.5 + Math.random() * 1.0; // 0.5~1.5秒检查间隔

        if (this.stamina > 0.1) {
          // 有 stamina*200% 的几率使用（体力50%时100%必用，体力10%时20%几率）
          if (Math.random() < this.stamina * 2) {
            // 右上45度 ± 10度
            const angle = (45 + (Math.random() - 0.5) * 20) * Math.PI / 180;
            const dirX = Math.cos(angle);
            const dirY = Math.sin(angle);
            this.applyStamina(dirX, dirY);
          }
        }
      }
    }
  }

  /**
   * 滑动施力：在项圈位置（脖子底部）施加冲量
   * @param {number} dirX 归一化方向X（屏幕右=世界+X）
   * @param {number} dirY 归一化方向Y（屏幕上=世界+Y）
   */
  applyStamina(dirX, dirY) {
    if (this.stamina <= 0.01 || !this.bodies.neck) return;
    const massScale = this.estimatedMass / 1.0;
    // 每次最多消耗 1/4 耐力
    const use = Math.min(this.stamina, 0.25);
    const force = use * this.staminaMaxForce * massScale;
    const len = Math.sqrt(dirX * dirX + dirY * dirY);
    if (len < 0.001) return;
    const nx = dirX / len, ny = dirY / len;

    // 项圈位置 = 脖子底部
    const neckBody = this.bodies.neck;
    const neckAngle = neckBody.rotation();
    const neckPos = neckBody.translation();
    const collarX = neckPos.x + Math.sin(neckAngle) * (this.neckLen / 2);
    const collarY = neckPos.y - Math.cos(neckAngle) * (this.neckLen / 2);

    // 在项圈位置对身体施加冲量
    this.bodies.body.applyImpulseAtPoint(
      { x: nx * force, y: ny * force },
      { x: collarX, y: collarY },
      true
    );

    // 记录调试
    this.lastSwipeForce = {
      x: collarX, y: collarY,
      fx: nx * force, fy: ny * force,
      force,
      timer: 0.5, // 显示 0.5 秒
    };

    this.stamina -= use; // 消耗 1/4
  }

  /** 获取项圈世界坐标（供绘制绳子用）*/
  getCollarWorldPos() {
    if (!this.bodies.neck) return null;
    const nb = this.bodies.neck;
    const a = nb.rotation();
    const p = nb.translation();
    return {
      x: p.x + Math.sin(a) * (-this.neckLen / 2),
      y: p.y - Math.cos(a) * (-this.neckLen / 2),
    };
  }

  // ════════════════════════════════════════════════════════
  getBodyState() {
    return {
      body:     this._st(this.bodies.body),
      hindLeg:  this._st(this.bodies.hindLeg),
      foreLeg:  this._st(this.bodies.foreLeg),
      neck:     this._st(this.bodies.neck),
      head:     this._st(this.bodies.head),
      tailSegs: this.bodies.tailSegs.map(b => this._st(b)),
    };
  }
  _st(rb) { const t = rb.translation(); return { x: t.x, y: t.y, angle: rb.rotation() }; }

  reset(x) {
    const y = this.spawnY;
    const allBodies = [
      this.bodies.body, this.bodies.hindLeg, this.bodies.foreLeg,
      this.bodies.neck, this.bodies.head, ...this.bodies.tailSegs,
    ];
    for (const b of allBodies) {
      b.setLinvel({ x: 0, y: 0 }, true);
      b.setAngvel(0, true);
    }

    // 重新计算参数（基因可能被改过）
    this._recalcParams();

    this.bodies.body.setTranslation({ x, y }, true);
    this.bodies.body.setRotation(0, true);

    // 腿
    const bw = this.bodyW, bh = this.bodyH, ll = this.legLen;
    const hindHipX = x - bw / 2 + this.legW * 2;
    const foreHipX = x + bw / 2 - this.legW * 2;

    for (const [body, hipX, skew] of [
      [this.bodies.hindLeg, hindHipX, this.hindSkewRad],
      [this.bodies.foreLeg, foreHipX, this.foreSkewRad],
    ]) {
      body.setTranslation({
        x: hipX + Math.sin(skew) * ll / 2,
        y: y - bh / 2 - Math.cos(skew) * ll / 2
      }, true);
      body.setRotation(skew, true);
    }

    // 颈部
    if (this.bodies.neck) {
      const neckRest = this.joints.neck_rest || -0.4;
      const pivotX = x + bw / 2 - 0.02;
      const pivotY = y + bh / 2;
      const neckCX = pivotX + Math.sin(-neckRest) * this.neckLen / 2;
      const neckCY = pivotY + Math.cos(-neckRest) * this.neckLen / 2;
      this.bodies.neck.setTranslation({ x: neckCX, y: neckCY }, true);
      this.bodies.neck.setRotation(neckRest, true);
    }

    // 头部
    if (this.bodies.head) {
      const neckPos = this.bodies.neck.translation();
      const neckRest = this.joints.neck_rest || -0.4;
      const neckTopX = neckPos.x + Math.sin(-neckRest) * this.neckLen / 2;
      const neckTopY = neckPos.y + Math.cos(-neckRest) * this.neckLen / 2;
      this.bodies.head.setTranslation({ x: neckTopX + this.headW * 0.3, y: neckTopY }, true);
      this.bodies.head.setRotation(neckRest + 0.4, true);
    }

    // 尾巴
    for (const seg of this.bodies.tailSegs) {
      seg.setLinvel({ x: 0, y: 0 }, true);
      seg.setAngvel(0, true);
    }

    this.motorPhase = 0;
    this.elapsed = 0;
    this.running = false;
    this.stamina = 0;
    this.lastSwipeForce = null;
    this.kickCooldown = { hindLeg: 0, foreLeg: 0 };
    this.fallen = false;
    this._lastOnGround = {};
    this._noKickTimer = 0;
    this._rescueMode = false;
    this._rescueBurst = 0;
    this._rescueBurstTimer = 0;
    this._gaitState = {
      hindLeg: { phase: 0, triggered: false },
      foreLeg: { phase: 0, triggered: false },
    };
  }

  get posX() { return this.bodies.body.translation().x; }
  get posY() { return this.bodies.body.translation().y; }

  /** 导出完整马匹数据（用于保存/还原）*/
  exportData() {
    return {
      genome: { ...this.genome },
      hindLegLenScale: this.hindLegLenScale,
      foreLegLenScale: this.foreLegLenScale,
      staminaRegenRate: this.staminaRegenRate,
      appearance: { ...this.appearance },
      timestamp: Date.now(),
    };
  }

  /** 从保存数据还原（在构造后调用）*/
  importData(data) {
    if (data.genome) Object.assign(this.genome, data.genome);
    if (data.hindLegLenScale !== undefined) this.hindLegLenScale = data.hindLegLenScale;
    if (data.foreLegLenScale !== undefined) this.foreLegLenScale = data.foreLegLenScale;
    if (data.staminaRegenRate !== undefined) this.staminaRegenRate = data.staminaRegenRate;
    if (data.appearance) this.appearance = { ...data.appearance };
    this._recalcParams();
  }
}
