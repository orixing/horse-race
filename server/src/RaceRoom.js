/**
 * RaceRoom — Colyseus 赛马房间
 *
 * 流程：
 * 1. 创建房间 → phase="lobby"，等待玩家加入
 * 2. 第一个加入的玩家为房主
 * 3. 玩家可切换准备状态
 * 4. 房主点"开始" → 倒计时 → 开赛
 * 5. 每帧：物理步进 → 同步状态
 * 6. 终点检测 → 广播结果
 */

import { Room } from "colyseus";
import { RaceRoomState, HorseState, BodyState, PlayerInfo } from "./schema/RaceState.js";
import { RagdollHorse, randomGenome, RAPIER } from "../../src/RagdollHorse.js";
import { randomHorseNames } from "../../src/i18n.js";
import {
  LANE_WIDTH, START_X, GROUND_Y, MODE_SETTINGS,
} from "../../src/config/constants.js";

const MAX_PLAYERS = 5;
const COUNTDOWN_SECONDS = 3;
const PHYSICS_DT = 1 / 60;   // 固定物理步长

export class RaceRoom extends Room {

  async onCreate(options) {
    // 初始化 Rapier WASM
    await RAPIER.init();

    this.setState(new RaceRoomState());
    this.state.phase = "lobby";
    this.state.countdown = 0;
    this.state.hostId = "";
    this.state.roomName = options.roomName || "赛马房间";

    const settings = MODE_SETTINGS.race;
    this.state.finishX = settings.finishX;
    this.state.laneCount = settings.laneCount;

    this.maxClients = MAX_PLAYERS;

    // 内部物理数据（不同步，服务端专用）
    this._worlds = [];
    this._horses = [];          // RagdollHorse 实例
    this._horseKeys = [];       // 对应 state.horses 的 key
    this._countdownTimer = 0;
    this._raceFinished = false;
    this._raceStartTime = 0;        // 开赛时间戳
    this._finishedSet = new Set();   // 已冲线的马匹索引
    this._rankings = [];             // 逐个记录冲线 { rank, key, time }
    this._playerOptions = new Map(); // sessionId → joinOptions（保存基因组等）
    this._tickCount = 0;
    this._tickRateTimer = 0;
    this._tickRate = 0;

    // 注册消息处理
    this.onMessage("swipe", (client, data) => {
      this._onSwipe(client, data);
    });

    this.onMessage("toggleReady", (client) => {
      this._onToggleReady(client);
    });

    this.onMessage("startGame", (client) => {
      this._onStartGame(client);
    });

    this.onMessage("ping", (client, data) => {
      client.send("pong", { t: data.t });
    });

    // 物理模拟循环（60fps 固定步长）
    this.setSimulationInterval((dt) => this._tick(dt), 1000 / 60);

    // 设置 metadata 让 LobbyRoom 显示
    await this.setMetadata({
      roomName: this.state.roomName,
      playerCount: 0,
    });

    console.log(`[RaceRoom] 房间创建: ${this.roomId}, 名称: ${this.state.roomName}`);
  }

  async onJoin(client, options) {
    console.log(`[RaceRoom] 玩家加入: ${client.sessionId}`);

    // 如果比赛已开始，不允许加入（安全检查）
    if (this.state.phase !== "lobby") {
      client.leave();
      return;
    }

    // 保存玩家的加入选项（基因组等），等开赛时用
    this._playerOptions.set(client.sessionId, options || {});

    // 创建 PlayerInfo
    const pi = new PlayerInfo();
    pi.sessionId = client.sessionId;
    pi.name = options?.playerName || `玩家${this.state.players.size + 1}`;
    pi.ready = false;
    pi.isHost = false;
    this.state.players.set(client.sessionId, pi);

    // 第一个加入的是房主
    if (this.state.hostId === "" || !this.state.players.has(this.state.hostId)) {
      this._setHost(client.sessionId);
    }

    // 更新 metadata
    await this.setMetadata({
      roomName: this.state.roomName,
      playerCount: this.state.players.size,
    });
  }

  async onLeave(client, consented) {
    console.log(`[RaceRoom] 玩家离开: ${client.sessionId}`);

    if (this.state.phase === "lobby") {
      // 大厅阶段：移除玩家
      this.state.players.delete(client.sessionId);
      this._playerOptions.delete(client.sessionId);

      // 房主离开 → 转移给下一个
      if (client.sessionId === this.state.hostId) {
        const nextPlayer = this.state.players.entries().next().value;
        if (nextPlayer) {
          this._setHost(nextPlayer[0]);
        } else {
          this.state.hostId = "";
        }
      }

      // 更新 metadata
      await this.setMetadata({
        roomName: this.state.roomName,
        playerCount: this.state.players.size,
      });
    } else {
      // 比赛中：AI 接管
      const idx = this._horseKeys.indexOf(client.sessionId);
      if (idx >= 0 && this._horses[idx]) {
        this._horses[idx].isAI = true;
        this._horses[idx].isPlayer = false;
        const hs = this.state.horses.get(client.sessionId);
        if (hs) {
          hs.isAI = true;
          hs.isPlayer = false;
        }
      }
    }
  }

  onDispose() {
    console.log(`[RaceRoom] 房间销毁: ${this.roomId}`);
  }

  // ════════════════════════════════════════════════════════════
  //  房主管理
  // ════════════════════════════════════════════════════════════

  _setHost(sessionId) {
    // 清除旧房主标志
    if (this.state.hostId && this.state.players.has(this.state.hostId)) {
      this.state.players.get(this.state.hostId).isHost = false;
    }
    this.state.hostId = sessionId;
    if (this.state.players.has(sessionId)) {
      this.state.players.get(sessionId).isHost = true;
    }
  }

  // ════════════════════════════════════════════════════════════
  //  消息处理
  // ════════════════════════════════════════════════════════════

  _onToggleReady(client) {
    if (this.state.phase !== "lobby") return;
    const pi = this.state.players.get(client.sessionId);
    if (!pi) return;
    pi.ready = !pi.ready;
  }

  _onStartGame(client) {
    // 只有房主能开始
    if (client.sessionId !== this.state.hostId) return;
    if (this.state.phase !== "lobby") return;

    this._startCountdown();
  }

  _onSwipe(client, data) {
    if (this.state.phase !== "racing") return;
    const idx = this._horseKeys.indexOf(client.sessionId);
    if (idx < 0) return;
    const horse = this._horses[idx];
    if (!horse || horse.stamina <= 0.01) return;

    const { dx, dy } = data;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 0.001) return;
    horse.applyStamina(dx / len, dy / len);
  }

  // ════════════════════════════════════════════════════════════
  //  游戏流程
  // ════════════════════════════════════════════════════════════

  async _startCountdown() {
    // 锁定房间，不再接受新玩家
    await this.lock();

    // 为所有玩家创建马匹
    this._createAllHorses();

    this.state.phase = "countdown";
    this.state.countdown = COUNTDOWN_SECONDS;
    this._countdownTimer = COUNTDOWN_SECONDS;
  }

  _createAllHorses() {
    const playerCount = this.state.players.size;
    this.state.laneCount = playerCount;
    const startZ = -(playerCount - 1) * LANE_WIDTH / 2;
    let lane = 0;

    this.state.players.forEach((pi, sessionId) => {
      if (lane >= MAX_PLAYERS) return;

      const options = this._playerOptions.get(sessionId) || {};

      // 创建物理世界
      const horseWorld = new RAPIER.World({ x: 0.0, y: -9.81 });
      const groundBody = horseWorld.createRigidBody(
        RAPIER.RigidBodyDesc.fixed().setTranslation(0, GROUND_Y - 0.5)
      );
      horseWorld.createCollider(
        RAPIER.ColliderDesc.cuboid(500, 0.5).setFriction(0.8).setRestitution(0.02),
        groundBody
      );
      this._worlds.push(horseWorld);

      // 创建马匹
      const genome = options?.genome || randomGenome();
      const horse = new RagdollHorse(horseWorld, genome, START_X);
      if (options?.horseData) horse.importData(options.horseData);
      horse.horseWorld = horseWorld;
      horse.lane = lane;
      horse.isPlayer = true;
      horse.isAI = false;
      horse.laneZ = startZ + lane * LANE_WIDTH;

      this._horses.push(horse);

      // 创建同步状态
      const key = sessionId;
      this._horseKeys.push(key);
      const hs = new HorseState();
      hs.sessionId = sessionId;
      hs.lane = lane;
      hs.laneZ = horse.laneZ;
      hs.isPlayer = true;
      hs.isAI = false;
      hs.running = false;
      hs.stamina = 0;
      hs.fallen = false;
      hs.posX = START_X;
      hs.appearanceJSON = JSON.stringify(horse.appearance);
      hs.genomeJSON = JSON.stringify(horse.genome);
      hs.bodyW = horse.bodyW;
      hs.bodyH = horse.bodyH;
      hs.legW = horse.legW;
      hs.legLen = horse.legLen;
      hs.neckW = horse.neckW;
      hs.neckLen = horse.neckLen;
      hs.headW = horse.headW;
      hs.headH = horse.headH;
      this.state.horses.set(key, hs);
      this._syncHorseState(this._horses.length - 1);

      lane++;
    });
  }

  _fillAIHorses() {
    const startZ = -(MAX_PLAYERS - 1) * LANE_WIDTH / 2;
    while (this._horses.length < MAX_PLAYERS) {
      const lane = this._horses.length;
      const horseWorld = new RAPIER.World({ x: 0.0, y: -9.81 });
      const groundBody = horseWorld.createRigidBody(
        RAPIER.RigidBodyDesc.fixed().setTranslation(0, GROUND_Y - 0.5)
      );
      horseWorld.createCollider(
        RAPIER.ColliderDesc.cuboid(500, 0.5).setFriction(0.8).setRestitution(0.02),
        groundBody
      );
      this._worlds.push(horseWorld);

      const genome = randomGenome();
      const horse = new RagdollHorse(horseWorld, genome, START_X);
      horse.horseWorld = horseWorld;
      horse.lane = lane;
      horse.isPlayer = false;
      horse.isAI = true;
      horse.laneZ = startZ + lane * LANE_WIDTH;
      this._horses.push(horse);

      const key = `ai_${lane}`;
      this._horseKeys.push(key);
      const hs = new HorseState();
      hs.sessionId = "";
      hs.lane = lane;
      hs.laneZ = horse.laneZ;
      hs.isPlayer = false;
      hs.isAI = true;
      hs.running = false;
      hs.stamina = 0;
      hs.fallen = false;
      hs.posX = START_X;
      hs.appearanceJSON = JSON.stringify(horse.appearance);
      hs.genomeJSON = JSON.stringify(horse.genome);
      hs.bodyW = horse.bodyW;
      hs.bodyH = horse.bodyH;
      hs.legW = horse.legW;
      hs.legLen = horse.legLen;
      hs.neckW = horse.neckW;
      hs.neckLen = horse.neckLen;
      hs.headW = horse.headW;
      hs.headH = horse.headH;
      this.state.horses.set(key, hs);
      this._syncHorseState(this._horses.length - 1);
    }
  }

  // ════════════════════════════════════════════════════════════
  //  物理模拟主循环（服务端 60fps）
  // ════════════════════════════════════════════════════════════

  _tick(deltaMs) {
    const dt = deltaMs / 1000;

    // tick 率统计
    this._tickCount++;
    this._tickRateTimer += dt;
    if (this._tickRateTimer >= 1.0) {
      this._tickRate = this._tickCount;
      this._tickCount = 0;
      this._tickRateTimer -= 1.0;
      this.broadcast("tickRate", { rate: this._tickRate });
    }

    // ── lobby 阶段不做物理 ──
    if (this.state.phase === "lobby") return;

    // ── 倒计时阶段 ──
    if (this.state.phase === "countdown") {
      this._countdownTimer -= dt;
      this.state.countdown = Math.max(0, Math.ceil(this._countdownTimer));
      if (this._countdownTimer <= 0) {
        this.state.phase = "racing";
        this._raceStartTime = Date.now();
        // 所有马开始跑
        for (const horse of this._horses) {
          horse.running = true;
        }
      }
      // 倒计时期间也要同步位置（马站着不动）
      this._syncAllStates();
      return;
    }

    // ── 等待 / 已结束 ──
    if (this.state.phase !== "racing") return;

    // ── 比赛中：物理步进 ──
    for (const horse of this._horses) {
      horse.update(PHYSICS_DT);
      if (horse.running) horse.horseWorld.step();
    }

    // ── 同步状态到 Schema ──
    this._syncAllStates();

    // ── 终点检测（逐个冲线）──
    if (!this._raceFinished) {
      const now = Date.now();
      for (let i = 0; i < this._horses.length; i++) {
        if (this._finishedSet.has(i)) continue;
        const horse = this._horses[i];
        if (horse.posX >= this.state.finishX) {
          this._finishedSet.add(i);
          const rank = this._rankings.length + 1;
          const time = (now - this._raceStartTime) / 1000; // 秒
          const key = this._horseKeys[i];
          this._rankings.push({ rank, key, time });

          // 通知单匹马冲线
          this.broadcast("horseFinished", { rank, key, time });
        }
      }

      // 所有马都冲线了 → 比赛结束
      if (this._finishedSet.size >= this._horses.length) {
        this._raceFinished = true;
        this.state.phase = "finished";
        this.broadcast("raceResult", { rankings: this._rankings });
      }
    }
  }

  // ════════════════════════════════════════════════════════════
  //  状态同步
  // ════════════════════════════════════════════════════════════

  _syncAllStates() {
    for (let i = 0; i < this._horses.length; i++) {
      this._syncHorseState(i);
    }
  }

  _syncHorseState(index) {
    const horse = this._horses[index];
    const key = this._horseKeys[index];
    const hs = this.state.horses.get(key);
    if (!horse || !hs) return;

    const st = horse.getBodyState();

    // 同步刚体位置
    this._copyBody(hs.body, st.body);
    this._copyBody(hs.hindLeg, st.hindLeg);
    this._copyBody(hs.foreLeg, st.foreLeg);
    this._copyBody(hs.neck, st.neck);
    this._copyBody(hs.head, st.head);

    // 尾巴
    for (let i = 0; i < st.tailSegs.length && i < hs.tailSegs.length; i++) {
      this._copyBody(hs.tailSegs[i], st.tailSegs[i]);
    }

    // 游戏数据
    hs.posX = horse.posX;
    hs.stamina = horse.stamina;
    hs.running = horse.running;
    hs.fallen = horse.fallen;
  }

  _copyBody(target, source) {
    target.x = source.x;
    target.y = source.y;
    target.angle = source.angle;
  }
}
