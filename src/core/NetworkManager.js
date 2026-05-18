/**
 * NetworkManager — 客户端 Colyseus 网络层
 *
 * 负责：大厅连接、房间列表、创建/加入房间、发送输入、接收状态更新。
 * 不包含任何渲染逻辑。
 */

import { Client, getStateCallbacks } from "colyseus.js";

class NetworkManager {
  constructor() {
    /** @type {import("colyseus.js").Client} */
    this.client = null;

    // ── 大厅 ──
    /** @type {import("colyseus.js").Room} */
    this.lobby = null;
    this.rooms = [];        // 实时房间列表
    this._onRoomsUpdate = null;

    // ── 游戏房间 ──
    /** @type {import("colyseus.js").Room} */
    this.room = null;
    this.connected = false;
    this.sessionId = null;
    this.ping = 0;
    this.serverTickRate = 0;
    this._pingInterval = null;

    // 游戏房间回调
    this._onHorseAdd = null;
    this._onHorseRemove = null;
    this._onStateChange = null;
    this._onPhaseChange = null;
    this._onHorseFinished = null;
    this._onRaceResult = null;
    this._onPlayerAdd = null;
    this._onPlayerRemove = null;
    this._onPlayerChange = null;
    this._onError = null;
  }

  // ════════════════════════════════════════════════════════════
  //  大厅（LobbyRoom）
  // ════════════════════════════════════════════════════════════

  /**
   * 连接到大厅，获取实时房间列表
   */
  async connectLobby(serverUrl) {
    this.client = new Client(serverUrl);
    try {
      this.lobby = await this.client.joinOrCreate("lobby");
      console.log(`[Network] 已加入大厅`);

      // 初始房间列表
      this.lobby.onMessage("rooms", (allRooms) => {
        this.rooms = allRooms;
        if (this._onRoomsUpdate) this._onRoomsUpdate(this.rooms);
      });

      // 房间新增/更新
      this.lobby.onMessage("+", ([roomId, room]) => {
        const idx = this.rooms.findIndex(r => r.roomId === roomId);
        if (idx !== -1) {
          this.rooms[idx] = room;
        } else {
          this.rooms.push(room);
        }
        if (this._onRoomsUpdate) this._onRoomsUpdate(this.rooms);
      });

      // 房间移除
      this.lobby.onMessage("-", (roomId) => {
        this.rooms = this.rooms.filter(r => r.roomId !== roomId);
        if (this._onRoomsUpdate) this._onRoomsUpdate(this.rooms);
      });

      return true;
    } catch (e) {
      console.error("[Network] 大厅连接失败:", e);
      return false;
    }
  }

  /**
   * 离开大厅
   */
  leaveLobby() {
    if (this.lobby) {
      this.lobby.leave();
      this.lobby = null;
    }
    this.rooms = [];
  }

  // ════════════════════════════════════════════════════════════
  //  游戏房间（RaceRoom）
  // ════════════════════════════════════════════════════════════

  /**
   * 创建新房间
   */
  async createRoom(options = {}) {
    if (!this.client) return false;
    try {
      this.room = await this.client.create("race", options);
      this._onRoomJoined();
      return true;
    } catch (e) {
      console.error("[Network] 创建房间失败:", e);
      return false;
    }
  }

  /**
   * 通过 roomId 加入已有房间
   */
  async joinRoom(roomId, options = {}) {
    if (!this.client) return false;
    try {
      this.room = await this.client.joinById(roomId, options);
      this._onRoomJoined();
      return true;
    } catch (e) {
      console.error("[Network] 加入房间失败:", e);
      return false;
    }
  }

  _onRoomJoined() {
    this.connected = true;
    this.sessionId = this.room.sessionId;
    console.log(`[Network] 已加入房间: ${this.room.id}, sessionId: ${this.sessionId}`);
    this._setupListeners();
  }

  _setupListeners() {
    const room = this.room;
    const $ = getStateCallbacks(room);

    // 监听马匹添加/移除（比赛开始后才有）
    $(room.state).horses.onAdd((horseState, key) => {
      console.log(`[Network] 马匹加入: ${key}`);
      if (this._onHorseAdd) this._onHorseAdd(horseState, key);
    });

    $(room.state).horses.onRemove((horseState, key) => {
      console.log(`[Network] 马匹移除: ${key}`);
      if (this._onHorseRemove) this._onHorseRemove(horseState, key);
    });

    // 监听玩家添加/移除（大厅等待阶段）
    $(room.state).players.onAdd((playerInfo, key) => {
      console.log(`[Network] 玩家加入房间: ${key}`);
      if (this._onPlayerAdd) this._onPlayerAdd(playerInfo, key);
    });

    $(room.state).players.onRemove((playerInfo, key) => {
      console.log(`[Network] 玩家离开房间: ${key}`);
      if (this._onPlayerRemove) this._onPlayerRemove(playerInfo, key);
    });

    // 监听 phase 变化
    $(room.state).listen("phase", (value, prev) => {
      console.log(`[Network] 阶段变化: ${prev} → ${value}`);
      if (this._onPhaseChange) this._onPhaseChange(value, prev);
    });

    // 监听 hostId 变化
    $(room.state).listen("hostId", (value, prev) => {
      console.log(`[Network] 房主变更: ${prev} → ${value}`);
    });

    // 状态每帧更新
    room.onStateChange((state) => {
      if (this._onStateChange) this._onStateChange(state);
    });

    // 单匹马冲线
    room.onMessage("horseFinished", (data) => {
      console.log(`[Network] 马匹冲线: #${data.rank} ${data.key} ${data.time}s`);
      if (this._onHorseFinished) this._onHorseFinished(data);
    });

    // 所有马冲线，最终结果
    room.onMessage("raceResult", (data) => {
      console.log("[Network] 比赛结果:", data);
      if (this._onRaceResult) this._onRaceResult(data);
    });

    // ping/pong 延迟测量
    room.onMessage("pong", (data) => {
      this.ping = Date.now() - data.t;
    });

    // 服务端 tick 率
    room.onMessage("tickRate", (data) => {
      this.serverTickRate = data.rate;
    });

    // 定期发送 ping
    this._pingInterval = setInterval(() => {
      if (this.room) this.room.send("ping", { t: Date.now() });
    }, 1000);

    // 服务端错误消息
    room.onMessage("error", (msg) => {
      console.warn("[Network] 服务端消息:", msg);
      if (this._onError) this._onError(msg);
    });

    // 断线处理
    room.onLeave((code) => {
      console.log(`[Network] 离开房间, code: ${code}`);
      this.connected = false;
    });

    room.onError((code, message) => {
      console.error(`[Network] 房间错误: ${code} - ${message}`);
    });
  }

  // ════════════════════════════════════════════════════════════
  //  游戏操作
  // ════════════════════════════════════════════════════════════

  /** 切换准备状态 */
  toggleReady() {
    if (!this.room) return;
    this.room.send("toggleReady");
  }

  /** 房主开始比赛 */
  startGame() {
    if (!this.room) return;
    this.room.send("startGame");
  }

  /** 发送滑动输入 */
  sendSwipe(dx, dy) {
    if (!this.room) return;
    this.room.send("swipe", { dx, dy });
  }

  /** 断开游戏房间 */
  disconnect() {
    if (this._pingInterval) {
      clearInterval(this._pingInterval);
      this._pingInterval = null;
    }
    if (this.room) {
      this.room.leave();
      this.room = null;
    }
    this.connected = false;
    this.sessionId = null;
    this.ping = 0;
    this.serverTickRate = 0;
  }

  /** 断开一切 */
  disconnectAll() {
    this.disconnect();
    this.leaveLobby();
  }

  // ════════════════════════════════════════════════════════════
  //  回调注册
  // ════════════════════════════════════════════════════════════

  onRoomsUpdate(cb) { this._onRoomsUpdate = cb; }
  onHorseAdd(cb) { this._onHorseAdd = cb; }
  onHorseRemove(cb) { this._onHorseRemove = cb; }
  onStateChange(cb) { this._onStateChange = cb; }
  onPhaseChange(cb) { this._onPhaseChange = cb; }
  onHorseFinished(cb) { this._onHorseFinished = cb; }
  onRaceResult(cb) { this._onRaceResult = cb; }
  onPlayerAdd(cb) { this._onPlayerAdd = cb; }
  onPlayerRemove(cb) { this._onPlayerRemove = cb; }
  onPlayerChange(cb) { this._onPlayerChange = cb; }
  onError(cb) { this._onError = cb; }

  /** 判断某个 horseState 是否是本地玩家 */
  isLocalPlayer(horseState) {
    return horseState.sessionId === this.sessionId;
  }
}

export default new NetworkManager();
