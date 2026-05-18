/**
 * RaceManager — 客户端编排层
 *
 * 支持两种模式：
 * - 本地模式（tame/race）：本地物理模拟
 * - 联机模式（online）：大厅 → 房间等待 → 比赛
 */

import { GameSimulation } from "./GameSimulation.js";
import { build3DHorse, removeHorseMeshes, syncHorseMeshes, fadeOutPlayerIndicator } from "./HorseRenderer.js";
import horseDataManager from "./HorseDataManager.js";
import networkManager from "./NetworkManager.js";
import raceTrack from "./RaceTrack.js";
import sceneManager from "./SceneManager.js";
import uiManager from "./UIManager.js";
import debugRenderer from "./DebugRenderer.js";
import { START_X, LANE_WIDTH, MODE_SETTINGS } from "../config/constants.js";
import { t, getLang, getHorseDisplayName } from "../i18n.js";

/**
 * 计算两个角度之间的最短差值（处理 -PI/PI 环绕）
 */
function _angleLerp(current, target) {
  let diff = target - current;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return diff;
}

class RaceManager {
  constructor() {
    /** @type {GameSimulation} 本地物理模拟层 */
    this.sim = new GameSimulation();
    this.inMenu = true;
    this._isOnline = false;

    // ── 联机模式数据 ──
    /** @type {Map<string, object>} key → { pseudoHorse, horseState, key } */
    this._netHorses = new Map();
    this._netPhase = "lobby";
    this._netFinished = false;
    this._netPlayerKey = null;
  }

  // ── 代理属性 ──
  get horses() {
    if (this._isOnline) {
      return Array.from(this._netHorses.values()).map(e => e.pseudoHorse);
    }
    return this.sim.horses;
  }

  get playerHorse() {
    if (this._isOnline) {
      const entry = this._netHorses.get(this._netPlayerKey);
      return entry ? entry.pseudoHorse : null;
    }
    return this.sim.playerHorse;
  }

  get raceFinished() {
    if (this._isOnline) return this._netFinished;
    return this.sim.raceFinished;
  }

  get gameMode() {
    if (this._isOnline) return "online";
    return this.sim.gameMode;
  }

  // ════════════════════════════════════════════════════════════
  //  本地模式（保持不变）
  // ════════════════════════════════════════════════════════════

  startGameMode(mode) {
    this._isOnline = false;
    this._clearRendering();
    raceTrack.clear();

    this.sim.initRace(mode, {
      savedHorseData: mode === "race" ? horseDataManager.loadSavedHorse() : null,
      generateHorseData: () => horseDataManager.generateHorseData(),
    });

    raceTrack.build(this.sim.laneCount, this.sim.finishX);

    for (const horse of this.sim.horses) {
      // 赛马模式下标记玩家的马需要显示指示器
      if (mode === "race" && horse.isPlayer) horse._showIndicator = true;
      horse.meshes = build3DHorse(horse);
    }

    uiManager.hideMenu();
    this.inMenu = false;

    if (mode === "race") {
      debugRenderer.setVisible(false);
      uiManager.setRaceModeUI();
    } else {
      debugRenderer.setVisible(true);
      uiManager.setTameModeUI();
    }

    sceneManager.resetCameraX(START_X);
  }

  updatePhysics(dt) {
    if (this.inMenu || this._isOnline) return;
    this.sim.update(dt);
  }

  checkRace() {
    if (this._isOnline) return;
    if (this.sim.raceFinished) return;

    if (this.sim.gameMode === "race") {
      uiManager.updateRankings(this.sim.horses);
    }

    const result = this.sim.checkFinish();
    if (result.finished) {
      uiManager.showFinishOverlay(this.sim.gameMode, this.sim.horses, this.sim.playerHorse);
    }
  }

  resetRace() {
    if (this._isOnline) {
      networkManager.disconnectAll();
      this._clearOnlineHorses();
      this._isOnline = false;
    }

    uiManager.hideFinishOverlay();
    this._showCountdown(false);
    this._hideFinishRankToast();
    this._hideOnlineResult();
    this._hideLobbyUI();
    this._hideRoomWaitUI();
    this._clearRendering();
    this.sim.cleanup();
    this.inMenu = true;
    uiManager.showMenu();
  }

  releaseAndNewHorse() {
    this.sim.raceFinished = false;
    uiManager.hideFinishOverlay();

    for (let i = 0; i < this.sim.horses.length; i++) {
      removeHorseMeshes(this.sim.horses[i]);
      const poolData = horseDataManager.generateHorseData();
      const newHorse = this.sim.replaceHorse(i, poolData);
      newHorse.meshes = build3DHorse(newHorse);
    }

    uiManager.forceRefreshStats();
  }

  startAllHorses() {
    if (this._isOnline) return;
    this.sim.startAllHorses();
    // 开赛后淡出玩家指示器（只触发一次）
    for (const horse of this.sim.horses) {
      const ind = horse.meshes?.playerIndicator;
      if (horse.isPlayer && ind && ind.userData._fadeStart < 0) {
        fadeOutPlayerIndicator(horse, 3);
      }
    }
  }

  _clearRendering() {
    for (const horse of this.sim.horses) {
      removeHorseMeshes(horse);
    }
  }

  // ════════════════════════════════════════════════════════════
  //  联机模式 — 大厅
  // ════════════════════════════════════════════════════════════

  /**
   * 进入联机大厅
   */
  async enterLobby(serverUrl) {
    this._showLoading();
    networkManager.onRoomsUpdate((rooms) => this._updateRoomListUI(rooms));
    const ok = await networkManager.connectLobby(serverUrl);
    this._hideLoading();
    if (!ok) {
      alert(t("connectLobbyFailed"));
      return;
    }

    this._isOnline = true;
    this._serverUrl = serverUrl;
    uiManager.hideMenu();
    this.inMenu = false;
    this._showLobbyUI();
  }

  /**
   * 创建新房间（随机名称）
   */
  async createRoom() {
    const saved = horseDataManager.loadSavedHorse();
    const roomName = this._randomRoomName();
    const options = { roomName };
    if (saved) {
      options.genome = saved.genome;
      options.horseData = saved;
    }

    this._showLoading();
    this._setupRoomCallbacks();
    const ok = await networkManager.createRoom(options);
    this._hideLoading();
    if (!ok) {
      alert(t("createRoomFailed"));
      return;
    }

    this._netPlayerKey = networkManager.sessionId;
    this._hideLobbyUI();
    this._showRoomWaitUI(roomName);
  }

  /**
   * 刷新房间列表（重新连接大厅）
   */
  async refreshRooms() {
    networkManager.leaveLobby();
    const ok = await networkManager.connectLobby(this._serverUrl);
    if (!ok) {
      alert(t("refreshFailed"));
    }
  }

  _randomRoomName() {
    const isEn = getLang() === "en";
    if (isEn) {
      const adjectives = ["Crazy", "Lightning", "Thunder", "Wild", "Blazing", "Turbo", "Storm", "Star", "Rapid", "Shadow"];
      const nouns = ["Derby", "Arena", "Sprint", "Track", "Cup", "Grand Prix", "Rally", "Chase", "Dash", "Race"];
      const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
      const noun = nouns[Math.floor(Math.random() * nouns.length)];
      return `${adj} ${noun}`;
    } else {
      const adjectives = ["疯狂", "飞驰", "闪电", "旋风", "烈焰", "极速", "狂野", "风暴", "雷霆", "星光"];
      const nouns = ["赛场", "竞技场", "草原", "跑道", "牧场", "战场", "大奖赛", "锦标赛", "杯", "联赛"];
      const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
      const noun = nouns[Math.floor(Math.random() * nouns.length)];
      return `${adj}${noun}`;
    }
  }

  /**
   * 加入已有房间
   */
  async joinRoom(roomId) {
    const saved = horseDataManager.loadSavedHorse();
    const options = {};
    if (saved) {
      options.genome = saved.genome;
      options.horseData = saved;
    }

    this._showLoading();
    this._setupRoomCallbacks();
    const ok = await networkManager.joinRoom(roomId, options);
    this._hideLoading();
    if (!ok) {
      alert(t("joinRoomFailed"));
      return;
    }

    this._netPlayerKey = networkManager.sessionId;
    this._hideLobbyUI();
    const state = networkManager.room.state;
    this._showRoomWaitUI(state.roomName || "赛马房间");
  }

  /**
   * 离开当前房间，回到大厅
   */
  leaveRoom() {
    networkManager.disconnect();
    this._clearOnlineHorses();
    this._hideRoomWaitUI();
    this._showLobbyUI();
  }

  /**
   * 切换准备状态
   */
  toggleReady() {
    networkManager.toggleReady();
  }

  /**
   * 房主开始比赛
   */
  startGame() {
    networkManager.startGame();
  }

  _setupRoomCallbacks() {
    networkManager.onHorseAdd((hs, key) => this._onNetHorseAdd(hs, key));
    networkManager.onHorseRemove((hs, key) => this._onNetHorseRemove(hs, key));
    networkManager.onPhaseChange((phase) => this._onNetPhaseChange(phase));
    networkManager.onHorseFinished((data) => this._onNetHorseFinished(data));
    networkManager.onRaceResult((data) => this._onNetRaceResult(data));
    networkManager.onPlayerAdd(() => this._refreshPlayerListUI());
    networkManager.onPlayerRemove(() => this._refreshPlayerListUI());
    networkManager.onStateChange(() => this._refreshPlayerListUI());
    networkManager.onError((msg) => alert(msg));
  }

  // ════════════════════════════════════════════════════════════
  //  联机模式 — 比赛中
  // ════════════════════════════════════════════════════════════

  _onNetHorseAdd(horseState, key) {
    const appearance = JSON.parse(horseState.appearanceJSON || "{}");
    const genome = JSON.parse(horseState.genomeJSON || "{}");

    const isLocal = networkManager.isLocalPlayer(horseState);
    const laneNum = horseState.lane + 1; // lane 0=最远=#1, lane 4=最近=#5
    const pseudoHorse = {
      appearance,
      genome,
      name: appearance.name || "???",
      isPlayer: isLocal,
      _showIndicator: isLocal,
      _laneLabel: t("laneNumber", { n: laneNum }),
      isAI: horseState.isAI,
      lane: horseState.lane,
      laneZ: horseState.laneZ,
      bodyW: horseState.bodyW,
      bodyH: horseState.bodyH,
      legW: horseState.legW,
      legLen: horseState.legLen,
      neckW: horseState.neckW,
      neckLen: horseState.neckLen,
      headW: horseState.headW,
      headH: horseState.headH,
      posX: horseState.posX,
      posY: 0,
      stamina: horseState.stamina,
      running: horseState.running,
      fallen: horseState.fallen,
      elapsed: 0,
      meshes: null,
    };

    pseudoHorse.meshes = build3DHorse(pseudoHorse);

    this._netHorses.set(key, {
      pseudoHorse,
      horseState,
      key,
    });
  }

  _onNetHorseRemove(horseState, key) {
    const entry = this._netHorses.get(key);
    if (entry) {
      removeHorseMeshes(entry.pseudoHorse);
      this._netHorses.delete(key);
    }
  }

  _onNetPhaseChange(phase) {
    this._netPhase = phase;

    if (phase === "countdown") {
      // 倒计时开始，切换到游戏渲染界面
      this._hideRoomWaitUI();
      debugRenderer.setVisible(false);
      uiManager.setRaceModeUI();

      // 建赛道
      const state = networkManager.room.state;
      raceTrack.build(state.laneCount || 5, state.finishX || 30);
      sceneManager.resetCameraX(START_X);

      // 显示倒计时覆盖层
      this._showCountdown(true);
    }

    if (phase === "racing") {
      // 隐藏倒计时
      this._showCountdown(false);

      // 开赛后淡出玩家指示器
      for (const [key, entry] of this._netHorses) {
        if (entry.pseudoHorse.isPlayer) {
          fadeOutPlayerIndicator(entry.pseudoHorse, 3);
        }
      }
    }

    if (phase === "finished") {
      this._netFinished = true;
    }
  }

  /**
   * 单匹马冲线 — 如果是自己，显示名次提示
   */
  _onNetHorseFinished(data) {
    const { rank, key, time } = data;
    if (key === networkManager.sessionId) {
      // 自己冲线了，显示名次提示
      const text = rank === 1 ? t("finishChampionToast") : t("finishRankToast", { n: rank });
      this._showFinishRankToast(text);
    }
  }

  /**
   * 所有马冲线 — 显示完整排名结算界面
   */
  _onNetRaceResult(data) {
    this._netFinished = true;
    this._hideFinishRankToast();
    this._showOnlineResult(data.rankings);
  }

  /**
   * 每帧同步服务端状态到3D渲染（带 lerp 插值）
   */
  syncOnlineHorses() {
    if (!this._isOnline) return;
    if (this._netPhase === "lobby") return;

    // 更新倒计时数字
    if (this._netPhase === "countdown" && networkManager.room) {
      const cd = networkManager.room.state.countdown;
      this._updateCountdownNumber(cd);
    }

    const LERP = 0.25; // 插值系数：越大越跟手，越小越平滑

    let playerPosX = START_X;

    for (const [key, entry] of this._netHorses) {
      const hs = entry.horseState;
      const ph = entry.pseudoHorse;

      ph.posX = hs.posX;
      ph.stamina = hs.stamina;
      ph.running = hs.running;
      ph.fallen = hs.fallen;
      if (ph.running) ph.elapsed += 1 / 60;

      if (ph.meshes) {
        // 从服务端读取目标值
        const target = {
          body: { x: hs.body.x, y: hs.body.y, angle: hs.body.angle },
          hindLeg: { x: hs.hindLeg.x, y: hs.hindLeg.y, angle: hs.hindLeg.angle },
          foreLeg: { x: hs.foreLeg.x, y: hs.foreLeg.y, angle: hs.foreLeg.angle },
          neck: { x: hs.neck.x, y: hs.neck.y, angle: hs.neck.angle },
          head: { x: hs.head.x, y: hs.head.y, angle: hs.head.angle },
          tailSegs: [],
        };
        for (let i = 0; i < hs.tailSegs.length; i++) {
          const ts = hs.tailSegs[i];
          target.tailSegs.push({ x: ts.x, y: ts.y, angle: ts.angle });
        }

        // 初始化或插值渲染状态
        if (!ph._render) {
          // 首帧：直接用服务端值
          ph._render = JSON.parse(JSON.stringify(target));
        } else {
          // 后续帧：lerp 过渡
          const r = ph._render;
          const parts = ["body", "hindLeg", "foreLeg", "neck", "head"];
          for (const p of parts) {
            r[p].x += (target[p].x - r[p].x) * LERP;
            r[p].y += (target[p].y - r[p].y) * LERP;
            r[p].angle += _angleLerp(r[p].angle, target[p].angle) * LERP;
          }
          for (let i = 0; i < target.tailSegs.length; i++) {
            if (!r.tailSegs[i]) {
              r.tailSegs[i] = { ...target.tailSegs[i] };
            } else {
              r.tailSegs[i].x += (target.tailSegs[i].x - r.tailSegs[i].x) * LERP;
              r.tailSegs[i].y += (target.tailSegs[i].y - r.tailSegs[i].y) * LERP;
              r.tailSegs[i].angle += _angleLerp(r.tailSegs[i].angle, target.tailSegs[i].angle) * LERP;
            }
          }
        }

        const st = ph._render;
        ph.getBodyState = () => st;
        ph.getCollarWorldPos = () => {
          const na = st.neck.angle;
          return {
            x: st.neck.x + Math.sin(na) * (-ph.neckLen / 2),
            y: st.neck.y - Math.cos(na) * (-ph.neckLen / 2),
          };
        };

        syncHorseMeshes(ph);
      }

      if (networkManager.isLocalPlayer(hs)) {
        playerPosX = hs.posX;
      }
    }

    sceneManager.followTarget(playerPosX);

    const player = this.playerHorse;
    if (player) {
      uiManager.updateStaminaBar(player);
    }

    if (this._netPhase === "racing" && !this._netFinished) {
      const allHorses = this.horses;
      uiManager.updateRankings(allHorses);
    }
  }

  sendSwipe(dx, dy) {
    if (!this._isOnline) return;
    networkManager.sendSwipe(dx, dy);
  }

  _clearOnlineHorses() {
    for (const [key, entry] of this._netHorses) {
      removeHorseMeshes(entry.pseudoHorse);
    }
    this._netHorses.clear();
    raceTrack.clear();
  }

  get isOnline() {
    return this._isOnline;
  }

  // ════════════════════════════════════════════════════════════
  //  UI 辅助方法
  // ════════════════════════════════════════════════════════════

  _showLobbyUI() {
    const el = document.getElementById("online-lobby");
    el.classList.add("active");
    // 刷新大厅界面的本地化文本
    this._refreshLobbyTexts();
  }

  _refreshLobbyTexts() {
    const lobby = document.getElementById("online-lobby");
    lobby.querySelector(".lobby-title").textContent = t("lobbyTitle");
    document.getElementById("btn-create-room").textContent = t("btnCreateRoom");
    document.getElementById("btn-refresh-rooms").textContent = t("btnRefresh");
    document.getElementById("btn-back-lobby").textContent = t("btnBackMenu");
    // 如果房间列表为空，刷新空提示
    const empty = lobby.querySelector(".room-empty");
    if (empty) empty.textContent = t("noRooms");
  }

  _hideLobbyUI() {
    document.getElementById("online-lobby").classList.remove("active");
  }

  _showRoomWaitUI(roomName) {
    const el = document.getElementById("room-wait");
    el.classList.add("active");
    document.getElementById("room-wait-title").textContent = roomName;
    document.getElementById("room-wait-phase").textContent = t("waitingPlayers");
    document.getElementById("btn-start-game").textContent = t("btnStartGame");
    document.getElementById("btn-leave-room").textContent = t("btnLeaveRoom");
    this._refreshPlayerListUI();
  }

  _hideRoomWaitUI() {
    document.getElementById("room-wait").classList.remove("active");
  }

  _updateRoomListUI(rooms) {
    const container = document.getElementById("room-list-container");
    // 只显示 race 类型的房间
    const lobbyRooms = rooms.filter(r => r.name === "race");

    if (lobbyRooms.length === 0) {
      container.innerHTML = `<div class="room-empty">${t("noRooms")}</div>`;
      return;
    }

    container.innerHTML = lobbyRooms.map(r => `
      <div class="room-card">
        <div class="room-info">
          <div class="room-name">${r.metadata?.roomName || "Room"}</div>
          <div class="room-players">${t("roomPlayers", { n: r.clients, max: r.maxClients })}</div>
        </div>
        <button class="btn-join" data-room-id="${r.roomId}">${t("btnJoin")}</button>
      </div>
    `).join("");

    // 绑定加入按钮
    container.querySelectorAll(".btn-join").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const roomId = btn.getAttribute("data-room-id");
        this.joinRoom(roomId);
      });
    });
  }

  _refreshPlayerListUI() {
    if (!networkManager.room) return;
    const state = networkManager.room.state;
    const container = document.getElementById("player-list");
    const myId = networkManager.sessionId;

    let html = "";
    state.players.forEach((pi, key) => {
      const isMe = pi.sessionId === myId;
      const tags = [];
      if (pi.isHost) tags.push(`<span class="player-tag tag-host">${t("tagHost")}</span>`);
      if (isMe) tags.push(`<span class="player-tag tag-you">${t("tagYou")}</span>`);

      html += `
        <div class="player-row">
          <span class="player-name">${pi.name}</span>
          <div>${tags.join(" ")}</div>
        </div>
      `;
    });

    container.innerHTML = html;

    // 只有房主显示"开始比赛"按钮
    const isHost = state.hostId === myId;
    const btnStart = document.getElementById("btn-start-game");
    btnStart.style.display = isHost ? "" : "none";
    btnStart.disabled = false;
  }

  _showFinishRankToast(text) {
    const el = document.getElementById("finish-rank-toast");
    const textEl = document.getElementById("finish-rank-text");
    textEl.textContent = text;
    // 重新触发动画
    textEl.style.animation = "none";
    textEl.offsetHeight;
    textEl.style.animation = "";
    el.classList.add("active");
  }

  _hideFinishRankToast() {
    document.getElementById("finish-rank-toast").classList.remove("active");
  }

  _showOnlineResult(rankings) {
    const el = document.getElementById("online-result-overlay");
    const listEl = document.getElementById("online-result-list");
    const myId = networkManager.sessionId;

    // 查找马匹名字
    const getHorseName = (key) => {
      const entry = this._netHorses.get(key);
      if (entry) {
        const names = entry.pseudoHorse.appearance?.names || entry.pseudoHorse.appearance?.name;
        if (names) return getHorseDisplayName(names);
        return entry.pseudoHorse.name || key;
      }
      return key.startsWith("ai_") ? "AI" : key.slice(0, 6);
    };

    listEl.innerHTML = rankings.map(r => {
      const isMe = r.key === myId;
      const rankClass = r.rank === 1 ? "gold" : r.rank === 2 ? "silver" : r.rank === 3 ? "bronze" : "";
      const name = getHorseName(r.key);
      const timeStr = r.time.toFixed(2) + "s";
      const suffix = isMe ? ` (${t("tagYou")})` : "";
      return `
        <div class="result-row ${isMe ? "is-me" : ""}">
          <span class="result-rank ${rankClass}">#${r.rank}</span>
          <span class="result-name">${name}${suffix}</span>
          <span class="result-time">${timeStr}</span>
        </div>
      `;
    }).join("");

    el.querySelector(".result-title").textContent = t("raceFinished");
    el.classList.add("active");
  }

  _hideOnlineResult() {
    document.getElementById("online-result-overlay").classList.remove("active");
  }

  _showLoading() {
    document.getElementById("loading-mask").classList.add("active");
  }

  _hideLoading() {
    document.getElementById("loading-mask").classList.remove("active");
  }

  _showCountdown(show) {
    const el = document.getElementById("countdown-overlay");
    if (show) {
      el.classList.add("active");
    } else {
      el.classList.remove("active");
    }
  }

  _updateCountdownNumber(n) {
    const el = document.getElementById("countdown-number");
    const text = n > 0 ? String(n) : "GO!";
    if (el.textContent !== text) {
      el.textContent = text;
      // 重新触发脉冲动画
      el.style.animation = "none";
      el.offsetHeight; // force reflow
      el.style.animation = "";
    }
  }
}

export default new RaceManager();
