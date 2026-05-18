/**
 * 摇摇赛马 — 主入口
 * 负责初始化各模块、绑定事件、驱动主循环
 */

import RAPIER from "@dimforge/rapier2d-compat";
import * as THREE from "three";
import { t, toggleLang, onLangChange } from "./i18n.js";
import sceneManager from "./core/SceneManager.js";
import raceManager from "./core/RaceManager.js";
import inputManager from "./core/InputManager.js";
import uiManager from "./core/UIManager.js";
import debugRenderer from "./core/DebugRenderer.js";
import horseDataManager from "./core/HorseDataManager.js";
import { syncHorseMeshes, rebuildNameLabel } from "./core/HorseRenderer.js";

// ── 主循环计时器 ──
let timer;

async function init() {
  uiManager.showLoading();

  await RAPIER.init();
  document.getElementById("info").textContent = "";

  // 初始化渲染
  sceneManager.init();
  debugRenderer.init();
  timer = new THREE.Timer();

  // 初始化输入
  inputManager.init({
    getPlayerHorse: () => raceManager.playerHorse,
    getHorses: () => raceManager.horses,
    isInputBlocked: () => raceManager.inMenu || raceManager.raceFinished,
  });

  // ── 绑定按钮事件 ──

  // 驯服野马
  document.getElementById("btn-practice").addEventListener("click", (e) => {
    e.stopPropagation();
    raceManager.startGameMode("tame");
  });

  // 赛马
  document.getElementById("btn-race").addEventListener("click", (e) => {
    e.stopPropagation();
    if (!horseDataManager.hasSavedHorse()) {
      alert(t("alertNoHorse"));
      return;
    }
    raceManager.startGameMode("race");
  });

  // 空格键重置
  window.addEventListener("keydown", (e) => {
    if (e.code === "Space") { e.preventDefault(); raceManager.resetRace(); }
  });

  // 保留此马
  document.getElementById("btn-keep").addEventListener("click", (e) => {
    e.stopPropagation();
    if (raceManager.playerHorse) {
      horseDataManager.saveHorse(raceManager.playerHorse);
    }
    raceManager.resetRace();
  });

  // 放生此马
  document.getElementById("btn-release").addEventListener("click", (e) => {
    e.stopPropagation();
    raceManager.releaseAndNewHorse();
  });

  // 点击屏幕开始比赛
  window.addEventListener("click", (e) => {
    if (raceManager.inMenu) return;
    if (e.target.closest(".lil-gui")) return;
    raceManager.startAllHorses();
  });

  // 返回主界面
  document.getElementById("btn-back-menu").addEventListener("click", (e) => {
    e.stopPropagation();
    raceManager.resetRace();
  });

  // 语言切换
  const langBtn = document.getElementById("lang-toggle");
  langBtn.textContent = t("langSwitch");
  langBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleLang();
  });

  onLangChange(() => {
    uiManager.updateStaticUI();
    for (const horse of raceManager.horses) {
      if (horse.meshes?.nameLabel) {
        rebuildNameLabel(horse);
      }
    }
    uiManager.forceRefreshStats();
  });

  // 初始化静态UI
  uiManager.updateStaticUI();

  // ── 全局函数（供 HTML 内联 onclick 调用）──
  window._releaseHorse = () => {
    if (raceManager.raceFinished) return;
    raceManager.releaseAndNewHorse();
  };

  window._saveHorse = async () => {
    await horseDataManager.saveToPool(raceManager.playerHorse);
  };

  // 启动主循环
  requestAnimationFrame(animate);
}

// ════════════════════════════════════════════════════════════
//  主循环
// ════════════════════════════════════════════════════════════
function animate() {
  requestAnimationFrame(animate);
  timer.update();
  const dt = Math.min(timer.getDelta(), 0.05);

  // 物理更新
  raceManager.updatePhysics(dt);

  // 3D同步
  for (const horse of raceManager.horses) {
    syncHorseMeshes(horse);
  }

  // 比赛检测
  raceManager.checkRace();

  // 相机跟踪
  if (raceManager.playerHorse) {
    sceneManager.followTarget(raceManager.playerHorse.posX);
  }

  // 耐力条
  uiManager.updateStaminaBar(raceManager.playerHorse);

  // 属性面板
  uiManager.updateHorseStats(raceManager.horses, raceManager.inMenu);

  // 渲染
  sceneManager.render();

  // 调试画布
  debugRenderer.updateVisibility(raceManager.playerHorse);
}

init().catch(err => {
  console.error(t("initFailed"), err);
  document.getElementById("info").textContent = t("errorMsg", { msg: err.message });
});
