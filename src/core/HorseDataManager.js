/**
 * HorseDataManager — 马匹数据持久化（localStorage / horsePool.json）
 */

import horsePool from "../horsePool.json";
import { t } from "../i18n.js";
import { DEV_MODE } from "../config/constants.js";

class HorseDataManager {
  constructor() {
    this.pool = horsePool;
  }

  /**
   * 生成马匹数据：当前所有模式都走纯随机
   * TODO: 发布模式可改为从 horsePool.json 抽马
   */
  generateHorseData() {
    return null; // 纯随机
  }

  /**
   * 保存马匹到 localStorage
   */
  saveHorse(horse) {
    const data = horse.exportData();
    data.name = horse.name;
    localStorage.setItem("savedHorse", JSON.stringify(data));
  }

  /**
   * 读取保存的马匹数据
   * @returns {object|null}
   */
  loadSavedHorse() {
    const saved = localStorage.getItem("savedHorse");
    return saved ? JSON.parse(saved) : null;
  }

  /**
   * 是否有保存的马匹
   */
  hasSavedHorse() {
    return !!localStorage.getItem("savedHorse");
  }

  /**
   * 开发模式：保存马匹到池子（写入 horsePool.json）
   */
  async saveToPool(horse) {
    if (!horse) return;
    const data = horse.exportData();
    data.id = Date.now();

    this.pool.push(data);

    try {
      const resp = await fetch("/api/save-horse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(this.pool, null, 2),
      });
      if (resp.ok) {
        alert(t("saveSuccess", { n: this.pool.length }));
      } else {
        alert(t("saveFailed"));
      }
    } catch (e) {
      alert(t("saveFailedWith", { msg: e.message }));
    }
  }

  get poolSize() {
    return this.pool.length;
  }

  get isDevMode() {
    return DEV_MODE;
  }
}

export default new HorseDataManager();
