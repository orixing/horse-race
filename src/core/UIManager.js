/**
 * UIManager — UI更新（属性面板、耐力条、排名、结算界面、静态文本）
 */

import { t, getLang, getHorseDisplayName } from "../i18n.js";

class UIManager {
  /**
   * 更新所有静态UI文本（语言切换时调用）
   */
  updateStaticUI() {
    document.title = t("pageTitle");
    document.getElementById("html-root").lang = getLang() === "zh" ? "zh" : "en";

    const langBtn = document.getElementById("lang-toggle");
    if (langBtn) langBtn.textContent = t("langSwitch");

    document.querySelectorAll("[data-i18n]").forEach(el => {
      const key = el.getAttribute("data-i18n");
      el.textContent = t(key);
    });
  }

  /**
   * 显示加载中
   */
  showLoading() {
    document.getElementById("info").textContent = t("loadingProgress");
  }

  /**
   * 显示主菜单
   */
  showMenu() {
    document.getElementById("main-menu").classList.remove("hidden");
    document.getElementById("rankings").innerHTML = "";
    document.getElementById("rankings").style.display = "none";
    const panel = document.getElementById("stats-panel");
    panel.classList.remove("visible", "open");
    document.getElementById("release-horse-bar").classList.remove("active");
  }

  /**
   * 隐藏主菜单，进入游戏
   */
  hideMenu() {
    document.getElementById("main-menu").classList.add("hidden");
  }

  /**
   * 设置赛马模式UI
   */
  setRaceModeUI() {
    const panel = document.getElementById("stats-panel");
    panel.classList.remove("visible", "open");
    document.getElementById("rankings").style.display = "block";
    document.getElementById("info").style.display = "none";
    document.getElementById("release-horse-bar").classList.remove("active");
  }

  /**
   * 设置驯服模式UI
   */
  setTameModeUI() {
    const panel = document.getElementById("stats-panel");
    panel.classList.add("visible");
    panel.classList.remove("open"); // 默认收起
    document.getElementById("rankings").style.display = "none";
    document.getElementById("info").style.display = "none";
    document.getElementById("release-horse-bar").classList.add("active");
  }

  /**
   * 更新排名显示
   */
  updateRankings(horses) {
    const rankings = [...horses].sort((a, b) => b.posX - a.posX);
    const rankDiv = document.getElementById("rankings");
    const startX = -8; // START_X
    rankDiv.innerHTML = rankings.map((h, i) => {
      const pos = Math.max(0, h.posX - startX).toFixed(1);
      const color = h.isPlayer ? "#ffdd44" : "#fff";
      const marker = h.isPlayer ? " ⭐" : "";
      const names = h.appearance?.names || h.appearance?.name || h.name;
      const displayName = getHorseDisplayName(names);
      return `<span style="color:${color}">${i + 1}. ${displayName}${marker} <small>${pos}m</small></span>`;
    }).join("<br>");
  }

  /**
   * 显示终点覆盖层
   */
  showFinishOverlay(gameMode, horses, playerHorse) {
    document.getElementById("release-horse-bar").classList.remove("active");
    document.getElementById("stats-panel").classList.remove("open");
    const overlay = document.getElementById("finish-overlay");
    overlay.classList.add("active");

    if (gameMode === "race") {
      const rankings = [...horses].sort((a, b) => b.posX - a.posX);
      const rank = rankings.indexOf(playerHorse) + 1;
      overlay.querySelector(".title").textContent = rank === 1 ? t("champion") : t("rankN", { n: rank });
      document.getElementById("tame-choices").style.display = "none";
      document.getElementById("race-choices").style.display = "flex";
    } else {
      overlay.querySelector(".title").textContent = t("tameSuccess");
      document.getElementById("tame-choices").style.display = "flex";
      document.getElementById("race-choices").style.display = "none";
    }
  }

  /**
   * 隐藏终点覆盖层
   */
  hideFinishOverlay() {
    document.getElementById("finish-overlay").classList.remove("active");
  }

  /**
   * 更新耐力条
   */
  updateStaminaBar(playerHorse) {
    if (!playerHorse) return;
    const fill = document.getElementById("stamina-bar-fill");
    if (fill) fill.style.width = `${playerHorse.stamina * 100}%`;
  }

  /**
   * 更新马匹属性面板
   */
  updateHorseStats(horses, inMenu) {
    const div = document.getElementById("horse-stats");
    if (!div || inMenu) {
      if (div) { div.innerHTML = ""; div._lastHtml = null; }
      return;
    }

    // 辅助函数
    function bar(label, val, min, max, color = "#4af") {
      const pct = Math.max(0, Math.min(100, ((val - min) / (max - min)) * 100));
      return `<div class="stat-row">
        <span class="stat-label">${label}</span>
        <div class="bar-wrap"><div class="bar-fill" style="width:${pct}%;background:${color}"></div></div>
        <span class="stat-value">${typeof val === "number" ? (Number.isInteger(val) ? val : val.toFixed(2)) : val}</span>
      </div>`;
    }
    function tag(label, val, options) {
      let tagHtml = "";
      for (const o of options) {
        const active = val === o.val || (o.match && o.match(val));
        tagHtml += `<span class="tag ${active ? "tag-on" : "tag-off"}">${o.text}</span> `;
      }
      return `<div class="stat-row"><span class="stat-label">${label}</span><span>${tagHtml}</span></div>`;
    }
    function row(label, val) {
      return `<div class="stat-row"><span class="stat-label">${label}</span><span class="stat-value">${val}</span></div>`;
    }
    function section(title) {
      return `<div class="section-title">${title}</div>`;
    }

    let html = "";
    for (const h of horses) {
      const g = h.genome;
      const horseNames = h.appearance?.names || h.appearance?.name || h.name;
      const horseName = getHorseDisplayName(horseNames);
      html += `<div class="horse-name">${horseName} ${h.isPlayer ? "⭐" : ""}</div>`;

      // 后腿
      html += `<div class="section">`;
      html += section(t("statHindLegs"));
      html += bar(t("statTiltAngle"), g.legSkew||0, -10, 10, "#f80");
      html += bar(t("statFlexibility"), g.legFlexibility, 20, 40, "#fa0");
      html += bar(t("statLegLenFactor"), h.hindLegLenScale, 0.9, 1.1, "#fa0");
      html += `</div>`;

      // 前腿
      html += `<div class="section">`;
      html += section(t("statForeLegs"));
      html += bar(t("statTiltAngle"), g.armSkew||0, -10, 10, "#08f");
      html += bar(t("statFlexibility"), g.armFlexibility||g.legFlexibility, 20, 40, "#0af");
      html += bar(t("statLegLenFactor"), h.foreLegLenScale, 0.9, 1.1, "#0af");
      html += `</div>`;

      // 协调性
      const eventNames = [t("eventNone"), t("eventGroundContact"), t("eventBottom"), t("eventTop")];
      const reactNames = [t("reactNone"), t("reactPush"), t("reactLift"), t("reactReverse")];
      html += `<div class="section">`;
      html += section(t("statCoordination"));
      html += tag(t("statGait"), g.locoSync, [
        { val: 0, text: t("statAlternating") },
        { val: 1, text: t("statSyncJump") },
      ]);
      const ftobE = eventNames[g.legFtobEvent||0];
      const ftobR = reactNames[g.legFtobReact||0];
      const btofE = eventNames[g.armBtofEvent||0];
      const btofR = reactNames[g.armBtofReact||0];
      html += row(t("statFrontToBack"), (ftobE === t("eventNone") || ftobR === t("reactNone")) ? t("statNoCoupling") : t("couplingFrontToBack", { event: ftobE, react: ftobR }));
      html += row(t("statBackToFront"), (btofE === t("eventNone") || btofR === t("reactNone")) ? t("statNoCoupling") : t("couplingBackToFront", { event: btofE, react: btofR }));
      html += `</div>`;

      // 体型
      html += `<div class="section">`;
      html += section(t("statBodyType"));
      html += bar(t("statSize"), g.size, 35, 100, "#c8c");
      html += bar(t("statAspectRatio"), g.aspect, 150, 310, "#c8c");
      html += bar(t("statSlimness"), g.skinny, 75, 200, "#c8c");
      html += bar(t("statBaseLegLen"), g.legLength, 50, 120, "#c8c");
      html += `</div>`;

      // 控制
      html += `<div class="section">`;
      html += section(t("statControl"));
      html += tag(t("statRearThrust"), g.legThrustBack, [
        { val: 0, text: t("statNone") },
        { val: 1, text: t("statWeak") },
        { val: 2, text: t("statStrong") },
      ]);
      html += bar(t("statDrag"), g.breakForce, 0, 50, "#f44");
      html += tag(t("statSpasm"), g.brainSpastic, [
        { val: 0, text: t("statNone") },
        { val: 1, text: t("statLight") },
        { val: 2, text: t("statHeavy") },
      ]);
      html += tag(t("statDizziness"), g.narcolepsy, [
        { val: 0, text: t("statNone") },
        { val: 1, text: t("statYes") },
      ]);
      html += tag(t("statBounce"), g.spinalLoco, [
        { val: 0, text: t("statNone") },
        { val: 1, text: t("statWeak") },
        { val: 2, text: t("statStrong") },
      ]);
      html += bar(t("statNeckFlex"), g.neckFlexibility, 0, 40, "#8af");
      html += `</div>`;

      // 其他
      html += `<div class="section">`;
      html += section(t("statOther"));
      html += bar(t("statStaminaRegen"), h.staminaRegenRate, 0.3, 0.5, "#a4f");
      html += `</div>`;


    }

    if (div._lastHtml !== html) {
      div.innerHTML = html;
      div._lastHtml = html;
    }
  }

  /**
   * 强制刷新属性面板（语言切换时）
   */
  forceRefreshStats() {
    const statsDiv = document.getElementById("horse-stats");
    if (statsDiv) statsDiv._lastHtml = null;
  }
}

export default new UIManager();
