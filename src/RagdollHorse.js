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
  legSkew:         { A: -10, T: -10, C: -10, G: -10 },  // 后腿倾角 固定-10
  armSkew:         { A: 5,   T: 5,   C: 5,   G: 5   },  // 前腿倾角 固定5

  // ── 运动力学 ──
  speedFactor:     { A: 50,  T: 133, C: 30,  G: 100 },
  legStrength:     { A: 104, T: 80,  C: 120, G: 95  },
  legFlexibility:  { A: 30,  T: 30,  C: 30,  G: 30  },  // 固定30
  legFlexBias:     { A: -10, T: -10, C: -10, G: -10 },  // 后腿偏置 固定-10
  armFlexBias:     { A: 5,   T: 5,   C: 5,   G: 5   },  // 前腿偏置 固定5
  legThrustBack:   { A: 2,   T: 0,   C: 1,   G: 0   },
  stiffJoints:     { A: 50,  T: 0,   C: 0,   G: 18  },
  muscleUse:       { A: 80,  T: 50,  C: 100, G: 100 },

  // ── 控制 ──
  breakForce:      { A: 50,  T: 0,   C: 30,  G: 0   },
  brainSpastic:    { A: 2,   T: 0,   C: 0,   G: 1   },
  narcolepsy:      { A: 0,   T: 0,   C: 0,   G: 1   },
  locoSync:        { A: 0,   T: 1,   C: 0,   G: 0   },

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
  return g;
}

export function defaultGenome() {
  const g = {};
  for (const [k, v] of Object.entries(GENE_ALLELES)) g[k] = v.A;
  return g;
}

/** 速度型基因组：最优竞速 */
export function fastGenome() {
  return {
    size: 100, aspect: 200, skinny: 100, legLength: 120,
    legSkew: 24, armSkew: 20,
    speedFactor: 133, legStrength: 120, legFlexibility: 40,
    legFlexBias: -10, armFlexBias: 15, legThrustBack: 2, stiffJoints: 50,
    muscleUse: 100, breakForce: 0, brainSpastic: 0,
    narcolepsy: 0, locoSync: 0,
    neckFlexibility: 23,
  };
}

export class RagdollHorse {
  constructor(world, genome, startX = 0) {
    this.world = world;
    this.genome = { ...defaultGenome(), ...genome };
    this.motorPhase = 0;
    this.elapsed = 0;
    this.running = false;

    // 耐力系统
    this.stamina = 0;
    this.staminaRegenRate = 0.2;  // 每秒恢复 0.2（5秒充满）
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
    this.legLen  = (0.35 + (g.legLength / 120) * 0.55) * sc;
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
    this.flexRad        = g.legFlexibility * Math.PI / 180;
    this.hindBiasRad    = g.legFlexBias * Math.PI / 180;
    this.foreBiasRad    = (g.armFlexBias !== undefined ? g.armFlexBias : g.legFlexBias) * Math.PI / 180;
    this.hindSkewRad    = (g.legSkew || 0) * Math.PI / 180;
    this.foreSkewRad    = (g.armSkew || 0) * Math.PI / 180;

    // 电机参数按体重缩放：大马力更大，小马力更小
    this.motorStiffness = strengthF * stiffF * 1200 * massScale;
    this.motorDamping   = strengthF * stiffF * 80 * massScale;

    // 蹬地推力也按体重缩放
    this.kickStrength     = strengthF * 250.0 * massScale;
    // 蹬地摩擦力系数（前后腿分开）
    // 后腿是发动机（大摩擦=强推进），前腿是着陆架（小摩擦=轻制动）
    this.hindFrictionCoeff = 0.8;
    this.foreFrictionCoeff = 0.3;

    this.thrustBack     = g.legThrustBack;
    this.locoSync       = g.locoSync || 0;

    // ── 站立高度（取前后腿中较短的投影高度）──
    const maxSkew = Math.max(Math.abs(this.hindSkewRad), Math.abs(this.foreSkewRad));
    this.spawnY = this.legLen * Math.cos(maxSkew) + this.bodyH / 2 + this.hoofH + 0.02;

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
    const ll = this.legLen, lw = this.legW;

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
      .setFriction(1.0)
      .setRestitution(0.0)
      .setDensity(2.0);
    this.world.createCollider(legCD, legBody);

    // 蹄子
    const hoofCD = RAPIER.ColliderDesc.cuboid(lw * 1.2, this.hoofH)
      .setFriction(1.5)
      .setRestitution(0.0)
      .setDensity(3.0)
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
    const limitLo = center - this.flexRad / 2 - padding;
    const limitHi = center + this.flexRad / 2 + padding;
    joint.setLimits(limitLo, limitHi);

    joint.configureMotorPosition(center, this.motorStiffness, this.motorDamping);

    this.bodies[name] = legBody;
    this.joints[name] = joint;
    this.joints[name + "_phase"] = phaseOffset;
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
    joint.setLimits(-0.7, 0.4);
    joint.configureMotorPosition(neckRest, 120, 15);

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
    this.flexRad        = g.legFlexibility * Math.PI / 180;
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

    this.motorPhase += this.motorFreq * dt;
    this.elapsed += dt;

    for (const name of ["hindLeg", "foreLeg"]) {
      const skew = name === "hindLeg" ? this.hindSkewRad : this.foreSkewRad;
      const bias = name === "hindLeg" ? this.hindBiasRad : this.foreBiasRad;
      const phase = this.motorPhase + this.joints[name + "_phase"];
      const s = Math.sin(phase * Math.PI * 2);

      let target = skew + bias + s * this.flexRad;

      if (g.brainSpastic > 0) {
        target += (Math.random() - 0.5) * g.brainSpastic * 0.06;
      }

      // ── 内置电机 ──
      const joint = this.joints[name];
      joint.configureMotorPosition(target, this.motorStiffness, this.motorDamping);

      // ── 蹬地推力：蹄子接近地面时施加 ──
      this.kickDebug[name] = null;

      // 用蹄子 Y 坐标判断是否接触地面（不依赖碰撞力）
      const legBody = this.bodies[name];
      const legAngle = legBody.rotation();
      const legPos = legBody.translation();
      const hoofY = legPos.y - Math.cos(legAngle) * this.legLen / 2;
      const onGround = hoofY < 0.08; // 蹄子离地面 0.08 以内视为着地

      this.kickCooldown[name] = Math.max(0, this.kickCooldown[name] - dt);
      if (onGround && this.kickCooldown[name] <= 0) {
        this.kickCooldown[name] = this.kickCooldownTime;
        const bodyBody = this.bodies.body;

        // 髋关节世界坐标
        const bodyAngle = bodyBody.rotation();
        const bodyPos = bodyBody.translation();
        const bw = this.bodyW, bh = this.bodyH;
        const hipLX = name === "hindLeg" ? (-bw / 2 + this.legW * 2) : (bw / 2 - this.legW * 2);
        const hipLY = -bh / 2;
        const cosB = Math.cos(bodyAngle), sinB = Math.sin(bodyAngle);
        const hipWX = bodyPos.x + hipLX * cosB - hipLY * sinB;
        const hipWY = bodyPos.y + hipLX * sinB + hipLY * cosB;

        // 沿腿方向（蹄子→髋关节）
        const dirX = -Math.sin(legAngle);
        const dirY = Math.cos(legAngle);

        // 蹄子世界坐标（调试绘制用）
        const hoofWX = legPos.x + Math.sin(legAngle) * this.legLen / 2;
        const hoofWY = legPos.y - Math.cos(legAngle) * this.legLen / 2;

        {

          const kickForce = this.kickStrength * Math.abs(s);

          // ① 身体：在髋关节处，沿腿方向向上的力（支撑身体+产生旋转）
          bodyBody.applyImpulseAtPoint(
            { x: dirX * kickForce * dt, y: dirY * kickForce * dt },
            { x: hipWX, y: hipWY },
            true
          );

          // ② 摩擦力 = 法向力(垂直分量) × 摩擦系数，方向取水平分量方向
          // 腿越垂直 → 法向力大、摩擦力大（支撑好）
          // 腿越水平 → 法向力小、摩擦力小（撑不住）
          const coeff = name === "hindLeg" ? this.hindFrictionCoeff : this.foreFrictionCoeff;
          const normalComponent = kickForce * Math.abs(dirY); // 垂直分量=法向力
          const frictionForce = normalComponent * coeff;
          const moveDir = dirX > 0 ? 1 : -1;
          legBody.applyImpulse(
            { x: moveDir * frictionForce * dt, y: 0 },
            true
          );

          // 记录调试
          this.kickDebug[name] = {
            hipX: hipWX, hipY: hipWY,
            hoofX: hoofWX, hoofY: hoofWY,
            dirX, dirY,
            force: kickForce,
            frictionForce: moveDir * frictionForce,
          };
        }
      }
    }

    // 嗜睡症
    if (g.narcolepsy > 0 && Math.random() < g.narcolepsy * 0.003) {
      this.bodies.body.applyTorqueImpulse((Math.random() - 0.5) * 1.0, true);
    }

    // 颈部补偿身体俯仰
    if (this.joints.neck) {
      const bodyAng = this.bodies.body.rotation();
      const rest = this.joints.neck_rest - bodyAng * 0.5;
      this.joints.neck.configureMotorPosition(rest, 120, 15);
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

    this.bodies.body.setTranslation({ x, y }, true);
    this.bodies.body.setRotation(0, true);

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

    this.motorPhase = 0;
    this.elapsed = 0;
    this.running = false;
    this.stamina = 0;
    this.lastSwipeForce = null;
    this.kickCooldown = { hindLeg: 0, foreLeg: 0 };
  }

  get posX() { return this.bodies.body.translation().x; }
  get posY() { return this.bodies.body.translation().y; }
}
