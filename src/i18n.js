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
    raceNote: "与人机一较高下",
    btnOnline: "联机赛马",
    onlineNote: "与其他玩家实时对战",
    btnStable: "我的马厩",
    stableNote: "管理我捕获的马匹",
    stableSelectHint: "管理你的马匹",
    stableEmpty: "空",
    stableActive: "已出战",
    stableSlot: "槽位 {n}",
    stableSaved: "已存入马厩槽位 {n}",
    stableManage: "管理",
    stableSetActive: "设为出战",
    stableRelease: "放生",
    stableReleaseConfirm: "确定要放生这匹马吗？",
    stableDetailTitle: "马匹详情",
    stableClose: "返回",
    stableInfoRaces: "出战次数",
    stableInfoWins: "冠军次数",
    stableInfoBest: "最好成绩",
    stableNoBest: "暂无",
    stableFull: "马厩已满！需要为新马腾出位置。",
    stableMakeRoom: "放生一匹马为刚刚捕获的马腾出位置",
    stableAbandonNew: "放弃新马并返回主界面",
    connecting: "正在连接服务器...",
    waitingPlayers: "等待其他玩家...",
    countdown: "倒计时 {n}",
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
    // 错误
    initFailed: "初始化失败:",
    errorMsg: "错误: {msg}",
    // 联机大厅
    lobbyTitle: "联机大厅",
    playerName: "昵称",
    playerNamePlaceholder: "输入昵称...",
    btnCreateRoom: "创建房间",
    btnRefresh: "刷新",
    btnBackMenu: "返回主界面",
    noRooms: "暂无房间，点击上方创建一个",
    roomPlayers: "{n}/{max} 玩家",
    btnJoin: "加入",
    // 房间等待
    waitingPlayers: "等待玩家加入...",
    btnStartGame: "开始比赛",
    btnLeaveRoom: "离开房间",
    tagHost: "房主",
    tagYou: "你",
    raceFinished: "比赛结束",
    finishRankToast: "第 {n} 名!",
    finishChampionToast: "冠军!",
    abandoned: "放弃",
    laneNumber: "{n}号赛道",
    connectLobbyFailed: "连接大厅失败！",
    createRoomFailed: "创建房间失败！",
    joinRoomFailed: "加入房间失败！",
    refreshFailed: "刷新失败！",
    // 返回按钮
    btnBackHome: "返回",
    confirmLeaveRace: "比赛进行中，确定要退出吗？",
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
    raceNote: "Compete against AI opponents",
    btnOnline: "Online Race",
    onlineNote: "Race against other players online",
    btnStable: "My Stable",
    stableNote: "Manage your captured horses",
    stableSelectHint: "Manage your horses",
    stableEmpty: "Empty",
    stableActive: "Active",
    stableSlot: "Slot {n}",
    stableSaved: "Saved to stable slot {n}",
    stableManage: "Manage",
    stableSetActive: "Set Active",
    stableRelease: "Release",
    stableReleaseConfirm: "Are you sure you want to release this horse?",
    stableDetailTitle: "Horse Details",
    stableClose: "Back",
    stableInfoRaces: "Races",
    stableInfoWins: "Wins",
    stableInfoBest: "Best Rank",
    stableNoBest: "N/A",
    stableFull: "Stable is full! Make room for the new horse.",
    stableMakeRoom: "Release a horse to make room for your new capture",
    stableAbandonNew: "Abandon new horse and return to menu",
    connecting: "Connecting to server...",
    waitingPlayers: "Waiting for players...",
    countdown: "Countdown {n}",
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
    // 错误
    initFailed: "Init Failed:",
    errorMsg: "Error: {msg}",
    // 联机大厅
    lobbyTitle: "Online Lobby",
    playerName: "Name",
    playerNamePlaceholder: "Enter name...",
    btnCreateRoom: "Create Room",
    btnRefresh: "Refresh",
    btnBackMenu: "Back to Menu",
    noRooms: "No rooms yet. Create one above!",
    roomPlayers: "{n}/{max} players",
    btnJoin: "Join",
    // 房间等待
    waitingPlayers: "Waiting for players...",
    btnStartGame: "Start Race",
    btnLeaveRoom: "Leave Room",
    tagHost: "Host",
    tagYou: "You",
    raceFinished: "Race Finished",
    finishRankToast: "#{n}!",
    finishChampionToast: "Champion!",
    abandoned: "Quit",
    laneNumber: "Lane {n}",
    connectLobbyFailed: "Failed to connect to lobby!",
    createRoomFailed: "Failed to create room!",
    joinRoomFailed: "Failed to join room!",
    refreshFailed: "Refresh failed!",
    // 返回按钮
    btnBackHome: "Back",
    confirmLeaveRace: "Race in progress. Are you sure you want to quit?",
    // 语言切换按钮
    langSwitch: "中文",
  },
};

// 马匹名字池 — 中英文各自独立，不一一对应
export const HORSE_NAMES_ZH = [
  "烈焰", "疾风", "雷霆", "黑鬃", "星辰", "暴风", "闪电", "铁蹄",
  "飞影", "狂奔", "银月", "赤兔", "追风", "破晓", "霜降", "野火",
  "奔雷", "夜行", "金鞍", "旋风", "天马", "骄阳", "流星", "长风",
  "白驹", "猎风", "狂沙", "霹雳", "龙驹", "烟雨", "踏雪", "凌云",
];

export const HORSE_NAMES_EN = [
  "Biscuit", "Wobbles", "Noodle", "Turbo", "Chaos", "Pickles", "Bandit", "Nugget",
  "Bumble", "Socks", "Dizzy", "Mustard", "Clumsy", "Pepper", "Muffin", "Rascal",
  "Tater", "Zigzag", "Spud", "Gizmo", "Waffles", "Boots", "Pretzel", "Jinx",
  "Pudding", "Scooter", "Maple", "Tumble", "Crumbs", "Dash", "Bongo", "Sprout",
];

const _hasLocalStorage = typeof localStorage !== "undefined";
let currentLang = (_hasLocalStorage && localStorage.getItem("gameLang")) || "zh";

// 所有监听语言变化的回调
const listeners = [];

export function getLang() {
  return currentLang;
}

export function setLang(lang) {
  currentLang = lang;
  if (_hasLocalStorage) localStorage.setItem("gameLang", lang);
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
 * 随机取一个马匹名字（返回 { zh, en } 双语名）
 * 中英文从各自独立的名字池中随机抽取，不对应
 */
export function randomHorseNames() {
  const zh = HORSE_NAMES_ZH[Math.floor(Math.random() * HORSE_NAMES_ZH.length)];
  const en = HORSE_NAMES_EN[Math.floor(Math.random() * HORSE_NAMES_EN.length)];
  return { zh, en };
}

/**
 * 获取马匹的当前语言显示名字
 * @param {{ zh: string, en: string } | string} names 双语名对象，或旧版纯中文名字符串
 * @returns {string} 当前语言的显示名
 */
export function getHorseName(names) {
  if (typeof names === "string") return names; // 兼容旧数据
  return currentLang === "en" ? names.en : names.zh;
}

/**
 * 获取马匹的显示名字（根据当前语言）
 * @param {{ zh: string, en: string } | string} names 双语名对象，或旧版纯字符串
 * @returns {string} 当前语言对应的名字
 */
export function getHorseDisplayName(names) {
  if (!names) return "???";
  if (typeof names === "string") return names;
  return currentLang === "en" ? names.en : names.zh;
}
