/**
 * DebugRenderer — 2D调试画布（仅渲染玩家马匹的物理状态）
 */

import { DEBUG_CONFIG } from "../config/constants.js";

class DebugRenderer {
  constructor() {
    this.ctx = null;
    this.config = DEBUG_CONFIG;
  }

  init() {
    this.ctx = document.getElementById("debug-canvas").getContext("2d");
  }

  /**
   * 绘制调试画布
   * @param {RagdollHorse} playerHorse 玩家马匹
   */
  draw(playerHorse) {
    if (!playerHorse) return;
    const horse = playerHorse;
    const canvas = this.ctx.canvas;
    const ctx = this.ctx;
    const w = canvas.width, h = canvas.height, s = this.config.debugScale;
    ctx.clearRect(0, 0, w, h);

    const offsetX = w / 2 - horse.posX * s;
    function toScreen(wx, wy) { return { x: offsetX + wx * s, y: DEBUG_CONFIG.debugOffsetY - wy * s }; }

    // 地面
    ctx.fillStyle = "rgba(120, 80, 40, 0.4)";
    ctx.fillRect(toScreen(-100, 0).x, toScreen(0, 0).y, 200 * s, 80);
    ctx.strokeStyle = "#8a6"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(toScreen(-100, 0).x, toScreen(0, 0).y);
    ctx.lineTo(toScreen(100, 0).x, toScreen(0, 0).y); ctx.stroke();

    // 刚体
    const st = horse.getBodyState();
    function drawBox(s2, halfW, halfH, color, label) {
      const sc = toScreen(s2.x, s2.y);
      ctx.save(); ctx.translate(sc.x, sc.y); ctx.rotate(-s2.angle);
      ctx.fillStyle = color; ctx.globalAlpha = 0.6;
      ctx.fillRect(-halfW * s, -halfH * s, halfW * 2 * s, halfH * 2 * s);
      ctx.globalAlpha = 1; ctx.strokeStyle = "#fff"; ctx.lineWidth = 1;
      ctx.strokeRect(-halfW * s, -halfH * s, halfW * 2 * s, halfH * 2 * s);
      if (label) { ctx.fillStyle = "#fff"; ctx.font = "9px monospace"; ctx.textAlign = "center"; ctx.fillText(label, 0, 3); }
      ctx.restore();
    }
    drawBox(st.body, horse.bodyW / 2, horse.bodyH / 2, "#cc8844");
    drawBox(st.hindLeg, horse.legW / 2, horse.legLen / 2, "#997733");
    drawBox(st.foreLeg, horse.legW / 2, horse.legLen / 2, "#997733");
    drawBox(st.neck, horse.neckW / 2, horse.neckLen / 2, "#bb8844");
    drawBox(st.head, horse.headW / 2, horse.headH / 2, "#bb8844");
    st.tailSegs.forEach((ts) => drawBox(ts, 0.012, 0.045, "#665533", ""));

    // 接触力
    function drawContacts(hoofCollider, color) {
      if (!hoofCollider) return;
      horse.horseWorld.contactPairsWith(hoofCollider, (c2) => {
        horse.horseWorld.contactPair(hoofCollider, c2, (manifold) => {
          const normal = manifold.normal();
          const n = manifold.numSolverContacts();
          for (let i = 0; i < n; i++) {
            const pt = manifold.solverContactPoint(i);
            if (!pt) continue;
            const imp = manifold.contactImpulse(i);
            const fric = manifold.contactTangentImpulse(i);
            const sp = toScreen(pt.x, pt.y);
            ctx.fillStyle = color; ctx.beginPath(); ctx.arc(sp.x, sp.y, 5, 0, Math.PI * 2); ctx.fill();
            if (Math.abs(imp) > 0.0001) {
              ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(sp.x, sp.y);
              ctx.lineTo(sp.x + normal.x * imp * 250, sp.y - normal.y * imp * 250); ctx.stroke();
            }
            if (Math.abs(fric) > 0.0001) {
              ctx.strokeStyle = "#ff0"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(sp.x, sp.y);
              ctx.lineTo(sp.x - normal.y * fric * 250, sp.y - normal.x * fric * 250); ctx.stroke();
            }
          }
        });
      });
    }
    drawContacts(horse.colliders.hindLegHoof, "#0f0");
    drawContacts(horse.colliders.foreLegHoof, "#0ff");

    // 蹬地力
    for (const [name, color] of [["hindLeg", "#f0f"], ["foreLeg", "#f80"]]) {
      const kick = horse.kickDebug[name];
      if (!kick) continue;
      const hipSp = toScreen(kick.hipX, kick.hipY);
      const hoofSp = toScreen(kick.hoofX, kick.hoofY);
      ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.moveTo(hipSp.x, hipSp.y); ctx.lineTo(hoofSp.x, hoofSp.y); ctx.stroke(); ctx.setLineDash([]);
      const fs = kick.force * 3;
      ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(hipSp.x, hipSp.y);
      ctx.lineTo(hipSp.x + kick.dirX * fs, hipSp.y - kick.dirY * fs); ctx.stroke();
      if (kick.frictionForce !== undefined) {
        const fricS = Math.abs(kick.frictionForce) * 3;
        const fricDir = kick.frictionForce > 0 ? 1 : -1;
        ctx.strokeStyle = "#fff"; ctx.lineWidth = 4; ctx.beginPath();
        ctx.moveTo(hoofSp.x, hoofSp.y); ctx.lineTo(hoofSp.x + fricDir * fricS, hoofSp.y); ctx.stroke();
      }
    }

    // 骑手外力箭头
    if (horse.lastSwipeForce) {
      const sf = horse.lastSwipeForce;
      const sp = toScreen(sf.x, sf.y);
      const fScale = 5;
      ctx.strokeStyle = "#ff44aa"; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(sp.x, sp.y);
      ctx.lineTo(sp.x + sf.fx * fScale, sp.y - sf.fy * fScale);
      ctx.stroke();
      ctx.fillStyle = "#ff44aa";
      ctx.beginPath(); ctx.arc(sp.x + sf.fx * fScale, sp.y - sf.fy * fScale, 5, 0, Math.PI * 2); ctx.fill();
    }
  }

  /**
   * 控制调试面板显示/隐藏
   */
  setVisible(visible) {
    this.config.showDebug = visible;
    const dc = document.getElementById("debug-canvas");
    dc.style.display = visible ? "block" : "none";
  }

  updateVisibility(playerHorse) {
    const dc = document.getElementById("debug-canvas");
    if (this.config.showDebug) {
      dc.style.display = "block";
      this.draw(playerHorse);
    } else {
      dc.style.display = "none";
    }
  }
}

export default new DebugRenderer();
