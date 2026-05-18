/**
 * RaceManager — 比赛逻辑（创建马匹、物理世界、终点检测、排名、重置）
 */

import RAPIER from "@dimforge/rapier2d-compat";
import { RagdollHorse, randomGenome } from "../RagdollHorse.js";
import {
  LANE_WIDTH, START_X, GROUND_Y,
  TAME_CONFIGS, RACE_CONFIGS, MODE_SETTINGS,
} from "../config/constants.js";
import { build3DHorse, removeHorseMeshes } from "./HorseRenderer.js";
import horseDataManager from "./HorseDataManager.js";
import raceTrack from "./RaceTrack.js";
import sceneManager from "./SceneManager.js";
import uiManager from "./UIManager.js";
import debugRenderer from "./DebugRenderer.js";
import { t } from "../i18n.js";

class RaceManager {
  constructor() {
    this.worlds = [];
    this.horses = [];
    this.playerHorse = null;
    this.raceFinished = false;
    this.inMenu = true;
    this.gameMode = null; // "tame" | "race"
    this.laneCount = 1;
    this.finishX = 20;
  }

  /**
   * 启动一个游戏模式
   * @param {"tame"|"race"} mode
   */
  startGameMode(mode) {
    this.gameMode = mode;

    // 清理旧数据
    this.clearAllHorses();
    raceTrack.clear();

    // 模式设置
    const settings = MODE_SETTINGS[mode];
    this.laneCount = settings.laneCount;
    this.finishX = settings.finishX;

    // 重建赛道
    raceTrack.build(this.laneCount, this.finishX);

    // 创建马匹
    const configs = mode === "race" ? RACE_CONFIGS : TAME_CONFIGS;
    const startZ = -(configs.length - 1) * LANE_WIDTH / 2;

    for (let i = 0; i < configs.length; i++) {
      const cfg = configs[i];

      const horseWorld = new RAPIER.World({ x: 0.0, y: -9.81 });
      const groundBody = horseWorld.createRigidBody(
        RAPIER.RigidBodyDesc.fixed().setTranslation(0, GROUND_Y - 0.5)
      );
      horseWorld.createCollider(
        RAPIER.ColliderDesc.cuboid(500, 0.5).setFriction(0.8).setRestitution(0.02),
        groundBody
      );
      this.worlds.push(horseWorld);

      let genome, poolData;
      if (mode === "race" && cfg.isPlayer) {
        const saved = horseDataManager.loadSavedHorse();
        if (saved) {
          genome = saved.genome || randomGenome();
          poolData = saved;
        } else {
          genome = randomGenome();
        }
      } else {
        poolData = horseDataManager.generateHorseData();
        genome = poolData ? poolData.genome : randomGenome();
      }

      const horse = new RagdollHorse(horseWorld, genome, START_X);
      if (poolData) horse.importData(poolData);
      horse.horseWorld = horseWorld;
      horse.lane = cfg.lane;
      horse.isPlayer = cfg.isPlayer || false;
      horse.isAI = !horse.isPlayer;
      horse.laneZ = startZ + i * LANE_WIDTH;

      horse.meshes = build3DHorse(horse);
      this.horses.push(horse);
      if (horse.isPlayer) this.playerHorse = horse;
    }

    // UI切换
    uiManager.hideMenu();
    this.inMenu = false;
    this.raceFinished = false;

    if (mode === "race") {
      debugRenderer.setVisible(false);
      uiManager.setRaceModeUI();
    } else {
      debugRenderer.setVisible(true);
      uiManager.setTameModeUI();
    }

    // 重置相机
    sceneManager.resetCameraX(START_X);
  }

  /**
   * 清理所有马匹和物理世界
   */
  clearAllHorses() {
    for (const horse of this.horses) {
      removeHorseMeshes(horse);
      if (horse.horseWorld) {
        const allBodies = [
          horse.bodies.body, horse.bodies.hindLeg, horse.bodies.foreLeg,
          horse.bodies.neck, horse.bodies.head, ...horse.bodies.tailSegs,
        ];
        for (const b of allBodies) {
          if (b) horse.horseWorld.removeRigidBody(b);
        }
      }
    }
    this.horses = [];
    this.worlds = [];
    this.playerHorse = null;
  }

  /**
   * 更新物理模拟（每帧调用）
   */
  updatePhysics(dt) {
    if (this.raceFinished || this.inMenu) return;
    for (const horse of this.horses) {
      horse.update(dt);
      if (horse.running) horse.horseWorld.step();
    }
  }

  /**
   * 终点检测和排名更新
   */
  checkRace() {
    if (this.raceFinished) return;

    // 赛马模式：更新排名
    if (this.gameMode === "race") {
      uiManager.updateRankings(this.horses);
    }

    // 终点检测
    if (this.playerHorse && this.playerHorse.posX >= this.finishX) {
      this.raceFinished = true;
      uiManager.showFinishOverlay(this.gameMode, this.horses, this.playerHorse);
    }
  }

  /**
   * 重置比赛 → 返回主菜单
   */
  resetRace() {
    this.raceFinished = false;
    uiManager.hideFinishOverlay();
    this.clearAllHorses();
    this.inMenu = true;
    this.gameMode = null;
    uiManager.showMenu();
  }

  /**
   * 放生此马 → 不回主菜单，直接重置+新马
   */
  releaseAndNewHorse() {
    this.raceFinished = false;
    uiManager.hideFinishOverlay();

    const configs = this.gameMode === "race" ? RACE_CONFIGS : TAME_CONFIGS;

    for (let i = 0; i < this.horses.length; i++) {
      const oldHorse = this.horses[i];
      const cfg = configs[i];

      // 删除旧3D网格
      removeHorseMeshes(oldHorse);

      // 删除旧物理刚体
      const allBodies = [
        oldHorse.bodies.body, oldHorse.bodies.hindLeg, oldHorse.bodies.foreLeg,
        oldHorse.bodies.neck, oldHorse.bodies.head, ...oldHorse.bodies.tailSegs,
      ];
      for (const b of allBodies) {
        if (b) oldHorse.horseWorld.removeRigidBody(b);
      }

      // 创建新马
      const poolData = horseDataManager.generateHorseData();
      const genome = poolData ? poolData.genome : randomGenome();
      const newHorse = new RagdollHorse(oldHorse.horseWorld, genome, START_X);
      if (poolData) newHorse.importData(poolData);
      newHorse.horseWorld = oldHorse.horseWorld;
      newHorse.lane = oldHorse.lane;
      newHorse.isPlayer = cfg.isPlayer || false;
      newHorse.isAI = !newHorse.isPlayer;
      newHorse.laneZ = oldHorse.laneZ;

      newHorse.meshes = build3DHorse(newHorse);
      this.horses[i] = newHorse;
      if (newHorse.isPlayer) this.playerHorse = newHorse;
    }

    // 强制右侧面板刷新
    uiManager.forceRefreshStats();
  }

  /**
   * 让所有未运行的马匹开始跑
   */
  startAllHorses() {
    for (const horse of this.horses) {
      if (!horse.running) horse.running = true;
    }
  }
}

export default new RaceManager();
