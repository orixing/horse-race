/**
 * HorseDataManager — 马匹数据持久化（localStorage）
 */

class HorseDataManager {
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

}

export default new HorseDataManager();
