/**
 * RaceState — Colyseus 状态 Schema
 *
 * 服务端权威状态，自动同步到所有客户端。
 * 只包含渲染所需的最小数据集。
 */

import { Schema, MapSchema, ArraySchema, defineTypes } from "@colyseus/schema";

// ── 单个刚体状态（位置+角度）──
export class BodyState extends Schema {}
defineTypes(BodyState, {
  x: "number",
  y: "number",
  angle: "number",
});

// ── 房间内玩家信息（等待阶段用）──
export class PlayerInfo extends Schema {}
defineTypes(PlayerInfo, {
  sessionId: "string",
  name: "string",
  ready: "boolean",
  isHost: "boolean",
});

// ── 一匹马的完整同步状态 ──
export class HorseState extends Schema {
  constructor() {
    super();
    this.body = new BodyState();
    this.hindLeg = new BodyState();
    this.foreLeg = new BodyState();
    this.neck = new BodyState();
    this.head = new BodyState();
    this.tailSegs = new ArraySchema();
    // 初始化3段尾巴
    for (let i = 0; i < 3; i++) {
      this.tailSegs.push(new BodyState());
    }
  }
}
defineTypes(HorseState, {
  // 身份
  sessionId: "string",    // 玩家 sessionId（AI 马为空）
  lane: "number",
  laneZ: "number",
  isPlayer: "boolean",
  isAI: "boolean",

  // 刚体状态
  body: BodyState,
  hindLeg: BodyState,
  foreLeg: BodyState,
  neck: BodyState,
  head: BodyState,
  tailSegs: [BodyState],

  // 游戏数据
  posX: "number",
  stamina: "number",
  running: "boolean",
  fallen: "boolean",

  // 外观（客户端构建3D模型用，只在加入时设置一次）
  appearanceJSON: "string",
  genomeJSON: "string",

  // 尺寸数据（客户端构建3D模型用）
  bodyW: "number",
  bodyH: "number",
  legW: "number",
  legLen: "number",
  neckW: "number",
  neckLen: "number",
  headW: "number",
  headH: "number",
});

// ── 房间总状态 ──
export class RaceRoomState extends Schema {
  constructor() {
    super();
    this.horses = new MapSchema();
    this.players = new MapSchema();
  }
}
defineTypes(RaceRoomState, {
  phase: "string",        // "lobby" | "countdown" | "racing" | "finished"
  countdown: "number",    // 倒计时秒数
  finishX: "number",      // 终点位置
  laneCount: "number",    // 赛道数
  hostId: "string",       // 房主 sessionId
  roomName: "string",     // 房间名称
  horses: { map: HorseState },
  players: { map: PlayerInfo },
});
