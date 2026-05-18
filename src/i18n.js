/**
 * 国际化模块 — 中英文切换
 */

const translations = {
  zh: {
    // 页面标题
    pageTitle: "摇摇赛马",
    // 主界面
    gameTitle: "摇摇赛马",
    gameIntro: "马匹会自己移动，滑动屏幕，利用脖子上的缰绳控制住马",
    btnPractice: "驯服野马",
    practiceNote: "尝试捕获新的随机马匹",
    btnRace: "开始赛马",
    raceNote: "使用捕获的马匹参赛",
    // 游戏UI
    loading: "加载中...",
    loadingProgress: "正在加载...",
    tapToStart: "点击屏幕开始",
    stamina: "耐力",
    // 比赛结果
    champion: "冠军!",
    rankN: "第 {n} 名",
    tameSuccess: "驯服成功!",
    // 结算按钮
    keepHorse: "保留此马",
    keepDesc: "选择这匹马参赛",
    releaseHorse: "放生此马",
    releaseDesc: "试试别的马",
    backToMenu: "返回主界面",
    backDesc: "再来一局",
    // 提示
    alertNoHorse: "请先去捕捉你的马匹！",
    // 调试信息
    swipeInfo: "滑动 len={len} stamina={stamina} player={player}",
    // 马匹属性面板
    statHindLegs: "后腿",
    statTiltAngle: "倾角",
    statFlexibility: "灵活",
    statLegLenFactor: "腿长系数",
    statForeLegs: "前腿",
    statCoordination: "协调性",
    statGait: "步态",
    statAlternating: "交替步",
    statSyncJump: "同步跳",
    statFrontToBack: "前→后",
    statBackToFront: "后→前",
    statNoCoupling: "无联动",
    statFrontLeg: "前腿",
    statHindLeg: "后腿",
    statBodyType: "体型",
    statSize: "大小",
    statAspectRatio: "长宽比",
    statSlimness: "纤瘦",
    statBaseLegLen: "基础腿长",
    statControl: "控制",
    statRearThrust: "后蹬",
    statNone: "无",
    statWeak: "弱",
    statStrong: "强",
    statDrag: "阻力",
    statSpasm: "痉挛",
    statLight: "轻",
    statHeavy: "重",
    statDizziness: "头晕",
    statYes: "有",
    statBounce: "弹跳",
    statNeckFlex: "颈灵活",
    statOther: "其他",
    statStaminaRegen: "耐力回复",
    // 步态事件名
    eventNone: "无",
    eventGroundContact: "触地",
    eventBottom: "到底",
    eventTop: "到顶",
    // 步态反应名
    reactNone: "无",
    reactPush: "蹬",
    reactLift: "抬",
    reactReverse: "反转",
    // 耦合描述
    couplingFrontToBack: "前腿{event}→{react}后腿",
    couplingBackToFront: "后腿{event}→{react}前腿",
    // 侧边面板按钮
    sideRelease: "放生此马",
    sideReleaseDesc: "试试别的马",
    sideDevSave: "保存到马匹池 [DEV]",
    sidePoolCount: "池中 {n} 匹",
    // 保存提示
    saveSuccess: "已保存到 horsePool.json！池中共 {n} 匹马",
    saveFailed: "保存失败",
    saveFailedWith: "保存失败: {msg}",
    // 错误
    initFailed: "初始化失败:",
    errorMsg: "错误: {msg}",
    // 语言切换按钮
    langSwitch: "EN",
  },
  en: {
    // 页面标题
    pageTitle: "Wobbly Derby",
    // 主界面
    gameTitle: "Wobbly Derby",
    gameIntro: "Horses move on their own. Swipe the screen, use the reins on the neck to control the horse",
    btnPractice: "Tame Wild Horse",
    practiceNote: "Try to capture a new random horse",
    btnRace: "Start Racing",
    raceNote: "Race with your captured horse",
    // 游戏UI
    loading: "Loading...",
    loadingProgress: "Loading...",
    tapToStart: "Tap to Start",
    stamina: "Stamina",
    // 比赛结果
    champion: "Champion!",
    rankN: "Place {n}",
    tameSuccess: "Taming Successful!",
    // 结算按钮
    keepHorse: "Keep This Horse",
    keepDesc: "Choose this horse for racing",
    releaseHorse: "Release This Horse",
    releaseDesc: "Try a different horse",
    backToMenu: "Back to Menu",
    backDesc: "Play Again",
    // 提示
    alertNoHorse: "Please capture your horse first!",
    // 调试信息
    swipeInfo: "Swipe len={len} stamina={stamina} player={player}",
    // 马匹属性面板
    statHindLegs: "Hind Legs",
    statTiltAngle: "Tilt Angle",
    statFlexibility: "Flexibility",
    statLegLenFactor: "Leg Length Factor",
    statForeLegs: "Forelegs",
    statCoordination: "Coordination",
    statGait: "Gait",
    statAlternating: "Alternating",
    statSyncJump: "Sync Jump",
    statFrontToBack: "Front→Back",
    statBackToFront: "Back→Front",
    statNoCoupling: "No Coupling",
    statFrontLeg: "Foreleg",
    statHindLeg: "Hindleg",
    statBodyType: "Body Type",
    statSize: "Size",
    statAspectRatio: "Aspect Ratio",
    statSlimness: "Slimness",
    statBaseLegLen: "Base Leg Len",
    statControl: "Control",
    statRearThrust: "Rear Thrust",
    statNone: "None",
    statWeak: "Weak",
    statStrong: "Strong",
    statDrag: "Drag",
    statSpasm: "Spasm",
    statLight: "Light",
    statHeavy: "Heavy",
    statDizziness: "Dizziness",
    statYes: "Yes",
    statBounce: "Bounce",
    statNeckFlex: "Neck Flex",
    statOther: "Other",
    statStaminaRegen: "Stamina Regen",
    // 步态事件名
    eventNone: "None",
    eventGroundContact: "Ground",
    eventBottom: "Bottom",
    eventTop: "Top",
    // 步态反应名
    reactNone: "None",
    reactPush: "Push",
    reactLift: "Lift",
    reactReverse: "Reverse",
    // 耦合描述
    couplingFrontToBack: "Fore {event}→{react} Hind",
    couplingBackToFront: "Hind {event}→{react} Fore",
    // 侧边面板按钮
    sideRelease: "Release This Horse",
    sideReleaseDesc: "Try a different horse",
    sideDevSave: "Save to Pool [DEV]",
    sidePoolCount: "{n} in pool",
    // 保存提示
    saveSuccess: "Saved to horsePool.json! Total {n} horses in pool",
    saveFailed: "Save Failed",
    saveFailedWith: "Save Failed: {msg}",
    // 错误
    initFailed: "Init Failed:",
    errorMsg: "Error: {msg}",
    // 语言切换按钮
    langSwitch: "中文",
  },
};

// 马匹名字中英文对照
export const HORSE_NAMES_I18N = [
  { zh: "烈焰", en: "Blaze" },
  { zh: "疾风", en: "Gale" },
  { zh: "雷霆", en: "Thunder" },
  { zh: "黑鬃", en: "Black Mane" },
  { zh: "星辰", en: "Starlight" },
  { zh: "暴风", en: "Storm" },
  { zh: "闪电", en: "Lightning" },
  { zh: "铁蹄", en: "Iron Hoof" },
  { zh: "飞影", en: "Shadow" },
  { zh: "狂奔", en: "Gallop" },
  { zh: "银月", en: "Silver Moon" },
  { zh: "赤兔", en: "Red Hare" },
  { zh: "追风", en: "Wind Chaser" },
  { zh: "破晓", en: "Dawn" },
  { zh: "霜降", en: "Frost" },
  { zh: "野火", en: "Wildfire" },
  { zh: "奔雷", en: "Rolling Thunder" },
  { zh: "夜行", en: "Night Walker" },
  { zh: "金鞍", en: "Golden Saddle" },
  { zh: "旋风", en: "Whirlwind" },
  { zh: "天马", en: "Pegasus" },
  { zh: "骄阳", en: "Blazing Sun" },
  { zh: "流星", en: "Meteor" },
  { zh: "长风", en: "Long Wind" },
  { zh: "白驹", en: "White Colt" },
  { zh: "猎风", en: "Wind Hunter" },
  { zh: "狂沙", en: "Wild Sand" },
  { zh: "霹雳", en: "Thunderbolt" },
  { zh: "龙驹", en: "Dragon Colt" },
  { zh: "烟雨", en: "Misty Rain" },
  { zh: "踏雪", en: "Snow Treader" },
  { zh: "凌云", en: "Cloud Soarer" },
];

let currentLang = localStorage.getItem("gameLang") || "zh";

// 所有监听语言变化的回调
const listeners = [];

export function getLang() {
  return currentLang;
}

export function setLang(lang) {
  currentLang = lang;
  localStorage.setItem("gameLang", lang);
  // 通知所有监听者
  for (const cb of listeners) cb(lang);
}

export function toggleLang() {
  setLang(currentLang === "zh" ? "en" : "zh");
}

export function t(key, params = {}) {
  let str = translations[currentLang]?.[key] || translations.zh[key] || key;
  for (const [k, v] of Object.entries(params)) {
    str = str.replace(`{${k}}`, v);
  }
  return str;
}

export function onLangChange(cb) {
  listeners.push(cb);
}

/**
 * 获取马匹的显示名字
 * @param {string} zhName 中文名
 * @returns {string} 当前语言的显示名
 */
export function getHorseName(zhName) {
  const entry = HORSE_NAMES_I18N.find(n => n.zh === zhName);
  if (!entry) return zhName;
  if (currentLang === "en") return entry.en;
  return entry.zh;
}

/**
 * 获取马匹的双语显示名字 (用于名牌等)
 * @param {string} zhName 中文名
 * @returns {string} "中文名 / English Name" 或单语名
 */
export function getHorseDisplayName(zhName) {
  const entry = HORSE_NAMES_I18N.find(n => n.zh === zhName);
  if (!entry) return zhName;
  return `${entry.zh} / ${entry.en}`;
}
