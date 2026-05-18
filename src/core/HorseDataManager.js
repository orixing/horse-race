/**
 * HorseDataManager — 马厩数据持久化（localStorage）
 *
 * 马厩有 8 个槽位，每个槽位可存放一匹马或为空(null)。
 * 另外记录当前"出战"马匹的槽位索引。
 */

const STABLE_SIZE = 8;
const STORAGE_KEY = "horseStable";
const ACTIVE_KEY = "activeSlot";

// 兼容旧数据：迁移 savedHorse → 马厩槽位 0
function _migrateOldData() {
  const old = localStorage.getItem("savedHorse");
  if (old && !localStorage.getItem(STORAGE_KEY)) {
    const stable = new Array(STABLE_SIZE).fill(null);
    stable[0] = JSON.parse(old);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stable));
    localStorage.setItem(ACTIVE_KEY, "0");
    localStorage.removeItem("savedHorse");
  }
}

class HorseDataManager {
  constructor() {
    _migrateOldData();
  }

  /** 获取整个马厩数据（8 个槽位的数组） */
  getStable() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
    return new Array(STABLE_SIZE).fill(null);
  }

  /** 保存整个马厩数据 */
  _saveStable(stable) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stable));
  }

  /** 获取指定槽位的马匹数据 */
  getSlot(index) {
    const stable = this.getStable();
    return stable[index] || null;
  }

  /** 获取当前出战马匹的槽位索引（-1 表示未选择） */
  getActiveSlot() {
    const v = localStorage.getItem(ACTIVE_KEY);
    if (v === null) return -1;
    const idx = parseInt(v, 10);
    // 确认该槽位有马
    const stable = this.getStable();
    if (idx >= 0 && idx < STABLE_SIZE && stable[idx]) return idx;
    return -1;
  }

  /** 设置出战马匹的槽位索引 */
  setActiveSlot(index) {
    localStorage.setItem(ACTIVE_KEY, String(index));
  }

  /** 马厩槽位总数 */
  get size() {
    return STABLE_SIZE;
  }

  /** 有多少匹马 */
  getHorseCount() {
    return this.getStable().filter(s => s !== null).length;
  }

  /** 找到第一个空槽位索引，满了返回 -1 */
  getFirstEmptySlot() {
    const stable = this.getStable();
    for (let i = 0; i < STABLE_SIZE; i++) {
      if (!stable[i]) return i;
    }
    return -1;
  }

  /**
   * 保存马匹到第一个空槽位
   * @returns {number} 存入的槽位索引，-1 表示满了
   */
  saveHorse(horse) {
    const slot = this.getFirstEmptySlot();
    if (slot < 0) return -1;

    const data = horse.exportData();
    data.name = horse.name;
    data.appearanceName = horse.appearance?.names || horse.appearance?.name || horse.name;

    const stable = this.getStable();
    stable[slot] = data;
    this._saveStable(stable);

    // 如果还没有出战马匹，自动设为出战
    if (this.getActiveSlot() < 0) {
      this.setActiveSlot(slot);
    }

    return slot;
  }

  /** 移除指定槽位的马匹 */
  removeHorse(index) {
    // 先检查是否是出战马
    const wasActive = parseInt(localStorage.getItem(ACTIVE_KEY), 10) === index;

    const stable = this.getStable();
    stable[index] = null;
    this._saveStable(stable);

    // 如果移除的是出战马匹，自动切换到第一匹剩余的马
    if (wasActive) {
      const next = stable.findIndex(s => s !== null);
      localStorage.setItem(ACTIVE_KEY, String(next)); // -1 if none left
    }
  }

  /**
   * 记录比赛结果
   * @param {number} index 槽位索引
   * @param {boolean} isWin 是否冠军
   * @param {number} [rank] 名次
   */
  addRaceResult(index, isWin, rank) {
    const stable = this.getStable();
    const data = stable[index];
    if (!data) return;
    data.raceCount = (data.raceCount || 0) + 1;
    if (isWin) data.winCount = (data.winCount || 0) + 1;
    if (rank !== undefined && (data.bestRank === undefined || rank < data.bestRank)) {
      data.bestRank = rank;
    }
    this._saveStable(stable);
  }

  /**
   * 修改马匹名字
   * @param {number} index 槽位索引
   * @param {string} newName 新名字
   */
  updateHorseName(index, newName) {
    const stable = this.getStable();
    const data = stable[index];
    if (!data) return;
    data.name = newName;
    // 同时更新双语名字对象
    if (data.appearanceName && typeof data.appearanceName === "object") {
      data.appearanceName.zh = newName;
      data.appearanceName.en = newName;
    } else {
      data.appearanceName = newName;
    }
    if (data.appearance) {
      data.appearance.name = newName;
      if (data.appearance.names) {
        data.appearance.names.zh = newName;
        data.appearance.names.en = newName;
      }
    }
    this._saveStable(stable);
  }

  // ── 兼容旧接口 ──

  /** 读取当前出战马匹数据（兼容旧代码） */
  loadSavedHorse() {
    const idx = this.getActiveSlot();
    if (idx < 0) return null;
    return this.getSlot(idx);
  }

  /** 是否有出战马匹（兼容旧代码） */
  hasSavedHorse() {
    return this.getActiveSlot() >= 0;
  }
}

export default new HorseDataManager();
