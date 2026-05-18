/**
 * GameSimulation — 纯物理模拟层（零渲染依赖）
 *
 * 可在浏览器和 Node.js 服务端共用。
 * 负责：物理世界创建、马匹实例化、物理步进、终点检测、状态导出。
 */

import RAPIER from "@dimforge/rapier2d-compat";
import { RagdollHorse, randomGenome } from "../RagdollHorse.js";
import {
  LANE_WIDTH, START_X, GROUND_Y,
  TAME_CONFIGS, RACE_CONFIGS, MODE_SETTINGS,
} from "../config/constants.js";

export class GameSimulation {
  constructor() {
    this.worlds = [];
    this.horses = [];
    this.playerHorse = null;
    this.raceFinished = false;
    this.gameMode = null;
    this.laneCount = 1;
    this.finishX = 20;
  }

  /**
   * 初始化比赛（创建物理世界和马匹）
   * @param {"tame"|"race"} mode
   * @param {object} [options]
   * @param {object} [options.savedHorseData] 玩家保存的马匹数据
   */
  initRace(mode, options = {}) {
    this.cleanup();

    this.gameMode = mode;
    const settings = MODE_SETTINGS[mode];
    this.laneCount = settings.laneCount;
    this.finishX = settings.finishX;
    this.raceFinished = false;

    const configs = mode === "race" ? RACE_CONFIGS : TAME_CONFIGS;
    const startZ = -(configs.length - 1) * LANE_WIDTH / 2;

    for (let i = 0; i < configs.length; i++) {
      const cfg = configs[i];

      // 创建物理世界
      const horseWorld = new RAPIER.World({ x: 0.0, y: -9.81 });
      const groundBody = horseWorld.createRigidBody(
        RAPIER.RigidBodyDesc.fixed().setTranslation(0, GROUND_Y - 0.5)
      );
      horseWorld.createCollider(
        RAPIER.ColliderDesc.cuboid(500, 0.5).setFriction(0.8).setRestitution(0.02),
        groundBody
      );
      this.worlds.push(horseWorld);

      // 决定基因组
      let genome, savedData;
      if (mode === "race" && cfg.isPlayer && options.savedHorseData) {
        genome = options.savedHorseData.genome || randomGenome();
        savedData = options.savedHorseData;
      } else {
        genome = randomGenome();
        savedData = null;
      }

      // 创建马匹
      const horse = new RagdollHorse(horseWorld, genome, START_X);
      if (savedData) horse.importData(savedData);
      horse.horseWorld = horseWorld;
      horse.lane = cfg.lane;
      horse.isPlayer = cfg.isPlayer || false;
      horse.isAI = !horse.isPlayer;
      horse.laneZ = startZ + i * LANE_WIDTH;

      this.horses.push(horse);
      if (horse.isPlayer) this.playerHorse = horse;
    }
  }

  /**
   * 物理步进（每帧调用）
   */
  update(dt) {
    if (this.raceFinished) return;
    for (const horse of this.horses) {
      horse.update(dt);
      if (horse.running) horse.horseWorld.step();
    }
  }

  /**
   * 终点检测
   * @returns {{ finished: boolean, rank?: number }} 结果
   */
  checkFinish() {
    if (this.raceFinished) return { finished: true };

    if (this.playerHorse && this.playerHorse.posX >= this.finishX) {
      this.raceFinished = true;
      const rankings = [...this.horses].sort((a, b) => b.posX - a.posX);
      const rank = rankings.indexOf(this.playerHorse) + 1;
      return { finished: true, rank };
    }
    return { finished: false };
  }

  /**
   * 获取所有马匹的排名（按 posX 降序）
   */
  getRankings() {
    return [...this.horses].sort((a, b) => b.posX - a.posX);
  }

  /**
   * 让所有未运行的马匹开始跑
   */
  startAllHorses() {
    for (const horse of this.horses) {
      if (!horse.running) horse.running = true;
    }
  }

  /**
   * 替换一匹马（放生+新马）
   * @param {number} index 马匹索引
   * @returns {RagdollHorse} 新马匹
   */
  replaceHorse(index) {
    const oldHorse = this.horses[index];
    const configs = this.gameMode === "race" ? RACE_CONFIGS : TAME_CONFIGS;
    const cfg = configs[index];

    // 删除旧物理刚体
    this._removeHorseBodies(oldHorse);

    // 创建新马
    const genome = randomGenome();
    const newHorse = new RagdollHorse(oldHorse.horseWorld, genome, START_X);
    newHorse.horseWorld = oldHorse.horseWorld;
    newHorse.lane = oldHorse.lane;
    newHorse.isPlayer = cfg.isPlayer || false;
    newHorse.isAI = !newHorse.isPlayer;
    newHorse.laneZ = oldHorse.laneZ;

    this.horses[index] = newHorse;
    if (newHorse.isPlayer) this.playerHorse = newHorse;

    return newHorse;
  }

  /**
   * 清理所有物理资源
   */
  cleanup() {
    for (const horse of this.horses) {
      this._removeHorseBodies(horse);
    }
    this.horses = [];
    this.worlds = [];
    this.playerHorse = null;
    this.raceFinished = false;
    this.gameMode = null;
  }

  /**
   * 删除一匹马的所有物理刚体
   */
  _removeHorseBodies(horse) {
    if (!horse.horseWorld) return;
    const allBodies = [
      horse.bodies.body, horse.bodies.hindLeg, horse.bodies.foreLeg,
      horse.bodies.neck, horse.bodies.head, ...horse.bodies.tailSegs,
    ];
    for (const b of allBodies) {
      if (b) horse.horseWorld.removeRigidBody(b);
    }
  }

  /**
   * 导出所有马匹状态（用于网络同步）
   */
  exportState() {
    return this.horses.map(horse => ({
      bodyState: horse.getBodyState(),
      posX: horse.posX,
      posY: horse.posY,
      stamina: horse.stamina,
      running: horse.running,
      fallen: horse.fallen,
      lane: horse.lane,
      isPlayer: horse.isPlayer,
    }));
  }
}
