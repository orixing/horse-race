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
import networkManager from "./core/NetworkManager.js";

// ── 服务器地址配置 ──
const SERVER_URL = "wss://horse.orixyz.xyz";

// ── 主循环计时器 ──
let timer;

// ── FPS 计算 ──
let _fpsFrames = 0;
let _fpsTime = 0;
let _fpsDisplay = 0;

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
    // 联机模式：滑动输入发给服务器
    onSwipe: (dx, dy) => {
      if (raceManager.isOnline) {
        raceManager.sendSwipe(dx, dy);
        return true; // 拦截本地处理
      }
      return false;
    },
  });

  // ── 绑定按钮事件 ──

  // 驯服野马
  document.getElementById("btn-practice").addEventListener("click", (e) => {
    e.stopPropagation();
    raceManager.startGameMode("tame");
  });

  // 本地赛马
  document.getElementById("btn-race").addEventListener("click", (e) => {
    e.stopPropagation();
    if (!horseDataManager.hasSavedHorse()) {
      alert(t("alertNoHorse"));
      return;
    }
    raceManager.startGameMode("race");
  });

  // 联机赛马 → 进入大厅
  document.getElementById("btn-online").addEventListener("click", (e) => {
    e.stopPropagation();
    raceManager.enterLobby(SERVER_URL);
  });

  // ── 大厅 UI 事件 ──

  // 创建房间（随机名称）
  document.getElementById("btn-create-room").addEventListener("click", (e) => {
    e.stopPropagation();
    raceManager.createRoom();
  });

  // 刷新房间列表
  document.getElementById("btn-refresh-rooms").addEventListener("click", (e) => {
    e.stopPropagation();
    raceManager.refreshRooms();
  });

  // 返回主界面（从大厅）
  document.getElementById("btn-back-lobby").addEventListener("click", (e) => {
    e.stopPropagation();
    raceManager.resetRace();
  });

  // ── 房间等待 UI 事件 ──

  // 开始比赛（房主）
  document.getElementById("btn-start-game").addEventListener("click", (e) => {
    e.stopPropagation();
    raceManager.startGame();
  });

  // 离开房间
  document.getElementById("btn-leave-room").addEventListener("click", (e) => {
    e.stopPropagation();
    raceManager.leaveRoom();
  });

  // ── 通用事件 ──

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

  // 点击屏幕开始比赛（仅本地模式）
  window.addEventListener("click", (e) => {
    if (raceManager.inMenu) return;
    if (raceManager.isOnline) return; // 联机模式不响应点击开始
    if (e.target.closest(".lil-gui")) return;
    if (e.target.closest("#online-lobby")) return;
    if (e.target.closest("#room-wait")) return;
    raceManager.startAllHorses();
  });

  // 返回主界面（比赛结束后）
  document.getElementById("btn-back-menu").addEventListener("click", (e) => {
    e.stopPropagation();
    raceManager.resetRace();
  });

  // 返回主界面（联机结算后）
  document.getElementById("btn-online-back").addEventListener("click", (e) => {
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

  if (raceManager.isOnline) {
    // ── 联机模式：从服务端状态同步渲染 ──
    raceManager.syncOnlineHorses();
  } else {
    // ── 本地模式：本地物理 + 渲染 ──
    raceManager.updatePhysics(dt);

    for (const horse of raceManager.horses) {
      syncHorseMeshes(horse);
    }

    raceManager.checkRace();

    if (raceManager.playerHorse) {
      sceneManager.followTarget(raceManager.playerHorse.posX);
    }

    uiManager.updateStaminaBar(raceManager.playerHorse);
  }

  // 属性面板（两种模式都需要，但大厅阶段跳过）
  if (!raceManager.isOnline || raceManager.horses.length > 0) {
    uiManager.updateHorseStats(raceManager.horses, raceManager.inMenu);
  }

  // 渲染
  sceneManager.render();

  // 调试画布（仅本地模式）
  if (!raceManager.isOnline) {
    debugRenderer.updateVisibility(raceManager.playerHorse);
  }

  // ── 性能统计（左上角）──
  _fpsFrames++;
  _fpsTime += dt;
  if (_fpsTime >= 0.5) {
    _fpsDisplay = Math.round(_fpsFrames / _fpsTime);
    _fpsFrames = 0;
    _fpsTime = 0;
  }
  const infoEl = document.getElementById("info");
  if (!raceManager.inMenu) {
    infoEl.style.display = "";
    if (raceManager.isOnline) {
      infoEl.textContent =
        `FPS: ${_fpsDisplay}  |  ` +
        `Server: ${networkManager.serverTickRate} tick/s  |  ` +
        `Ping: ${networkManager.ping} ms`;
    } else {
      infoEl.textContent = `FPS: ${_fpsDisplay}`;
    }
  }
}

init().catch(err => {
  console.error(t("initFailed"), err);
  document.getElementById("info").textContent = t("errorMsg", { msg: err.message });
});
