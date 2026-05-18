/**
 * 全局常量和配置
 */

// ── 赛道常量 ──
export const LANE_WIDTH = 2.5;
export const START_X = -8;
export const TRACK_LENGTH = 300;
export const GROUND_Y = 0;
export const FINISH_DISPLAY_TIME = 3.0;

// ── 马匹赛道配置 ──
export const TAME_CONFIGS = [
  { lane: 0, isPlayer: true },
];

export const RACE_CONFIGS = [
  { lane: 0 },
  { lane: 1 },
  { lane: 2 },
  { lane: 3 },
  { lane: 4, isPlayer: true },
];

// ── 相机配置 ──
export const CAMERA_CONFIG = {
  viewAngle: 20,
  viewDist: 12,
};

// ── 调试配置 ──
export const DEBUG_CONFIG = {
  paused: false,
  showDebug: true,
  debugScale: 40,
  debugOffsetY: 155,
};

// ── 模式相关参数（可变状态，由 RaceManager 管理）──
export const MODE_SETTINGS = {
  tame: { laneCount: 1, finishX: 20 },
  race: { laneCount: 5, finishX: 30 },
};
