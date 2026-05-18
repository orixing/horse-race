/**
 * InputManager — 滑动/触摸输入系统
 */

import { t } from "../i18n.js";

class InputManager {
  constructor() {
    this.swipeStart = null;
    /** @type {function|null} 获取玩家马匹的回调 */
    this.getPlayerHorse = null;
    /** @type {function|null} 获取所有马匹的回调 */
    this.getHorses = null;
    /** @type {function|null} 判断是否在菜单/比赛结束的回调 */
    this.isInputBlocked = null;
  }

  /**
   * 初始化输入系统
   * @param {object} callbacks
   * @param {function} callbacks.getPlayerHorse 返回玩家马匹
   * @param {function} callbacks.getHorses 返回所有马匹数组
   * @param {function} callbacks.isInputBlocked 返回是否屏蔽输入
   * @param {function} [callbacks.onSwipe] 滑动回调（联机模式），返回 true 表示已处理
   */
  init(callbacks) {
    this.getPlayerHorse = callbacks.getPlayerHorse;
    this.getHorses = callbacks.getHorses;
    this.isInputBlocked = callbacks.isInputBlocked;
    this.onSwipe = callbacks.onSwipe || null;

    const canvas = document.getElementById("canvas3d");
    this._setupSwipe(canvas);
  }

  _setupSwipe(canvas) {
    const svg = document.querySelector("#swipe-indicator svg");

    const onStart = (x, y) => {
      this.swipeStart = { x, y };
    };

    const onMove = (x, y) => {
      if (!this.swipeStart) return;
      const dx = x - this.swipeStart.x;
      const dy = y - this.swipeStart.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len > 10) {
        const ax = x + (dx / len) * 10;
        const ay = y + (dy / len) * 10;
        const px1 = ax - (-dy / len) * 5;
        const py1 = ay - (dx / len) * 5;
        const px2 = ax + (-dy / len) * 5;
        const py2 = ay + (dx / len) * 5;
        svg.innerHTML = `
          <line x1="${this.swipeStart.x}" y1="${this.swipeStart.y}" x2="${x}" y2="${y}"
                stroke="rgba(170,100,255,0.6)" stroke-width="3" stroke-linecap="round"/>
          <polygon points="${x},${y} ${px1},${py1} ${px2},${py2}"
                   fill="rgba(170,100,255,0.8)"/>
        `;
      }
    };

    const onEnd = (x, y) => {
      if (!this.swipeStart) return;
      const dx = x - this.swipeStart.x;
      const dy = y - this.swipeStart.y;
      const len = Math.sqrt(dx * dx + dy * dy);

      if (len > 15) {
        // 联机模式：发给服务器（注意 dy 取反，屏幕上=世界+Y）
        if (this.onSwipe && this.onSwipe(dx / len, -dy / len)) {
          // 已由联机回调处理
        } else {
          // 本地模式：直接施力
          const playerHorse = this.getPlayerHorse();
          if (playerHorse && playerHorse.stamina > 0.01) {
            playerHorse.applyStamina(dx / len, -dy / len);
          }
        }
      }

      this.swipeStart = null;
      svg.innerHTML = "";
    };

    // 鼠标事件
    canvas.addEventListener("mousedown", (e) => {
      if (e.target !== canvas) return;
      onStart(e.clientX, e.clientY);
    });
    canvas.addEventListener("mousemove", (e) => onMove(e.clientX, e.clientY));
    canvas.addEventListener("mouseup", (e) => onEnd(e.clientX, e.clientY));

    // 触摸事件
    document.addEventListener("touchstart", (e) => {
      if (e.target.closest("button") || e.target.closest("#main-menu") ||
          e.target.closest("#finish-overlay") || e.target.closest("#horse-stats")) return;
      if (this.isInputBlocked()) return;
      e.preventDefault();
      const touch = e.touches[0];
      onStart(touch.clientX, touch.clientY);
      // 触摸也触发开始
      const horses = this.getHorses();
      for (const horse of horses) {
        if (!horse.running) horse.running = true;
      }
    }, { passive: false });

    document.addEventListener("touchmove", (e) => {
      if (!this.swipeStart) return;
      e.preventDefault();
      const touch = e.touches[0];
      onMove(touch.clientX, touch.clientY);
    }, { passive: false });

    document.addEventListener("touchend", (e) => {
      if (!this.swipeStart) return;
      e.preventDefault();
      const touch = e.changedTouches[0];
      onEnd(touch.clientX, touch.clientY);
    }, { passive: false });
  }
}

export default new InputManager();
