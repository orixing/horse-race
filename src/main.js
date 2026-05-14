/**
 * 赛马布娃娃物理 — 完整赛马游戏
 * 场景完全复刻原版 horce swap 项目
 */

import RAPIER from "@dimforge/rapier2d-compat";
import * as THREE from "three";
import GUI from "lil-gui";
import { RagdollHorse, randomGenome, defaultGenome, fastGenome } from "./RagdollHorse.js";

// ── 赛道常量（与原版一致）──
const LANE_WIDTH = 2.5;
const LANE_COUNT = 1;
const START_X = -8;
const FINISH_X = 20;
const TRACK_LENGTH = 300;
const GROUND_Y = 0;
const FINISH_DISPLAY_TIME = 3.0;

// ── 全局 ──
let worlds = [];
let renderer, scene, camera, timer;
let horses = [];
let playerHorse = null;
let debugCtx;
let raceFinished = false;
let finishTimer = 0;
let inMenu = true;  // 是否在主界面
const cameraConfig = { viewAngle: 20, viewDist: 12 };

// ── 马匹配置（先用1匹调试）──
const HORSE_CONFIGS = [
  { name: "COLOSSULUS", color: 0xbb7733, number: 1, numberColor: 0xff33ff, isPlayer: true },
];

const config = {
  paused: false,
  showDebug: true,
  debugScale: 40,
  debugOffsetY: 155,
};

async function init() {
  const info = document.getElementById("info");
  info.textContent = "正在加载...";

  await RAPIER.init();

  initThreeJS();
  createRacetrack();
  createFinishLine();
  createHorses();

  debugCtx = document.getElementById("debug-canvas").getContext("2d");
  setupGUI();

  timer = new THREE.Timer();
  info.textContent = "";

  // 主界面 → 练习模式按钮：隐藏菜单，进入等待点击状态
  document.getElementById("btn-practice").addEventListener("click", (e) => {
    e.stopPropagation(); // 防止冒泡触发开始比赛
    document.getElementById("main-menu").classList.add("hidden");
    inMenu = false;
    info.textContent = "点击屏幕开始";
  });

  window.addEventListener("keydown", (e) => {
    if (e.code === "Space") { e.preventDefault(); resetRace(); }
  });

  // 保留此马
  document.getElementById("btn-keep").addEventListener("click", (e) => {
    e.stopPropagation();
    if (playerHorse) {
      const data = playerHorse.exportData();
      data.name = playerHorse.name + "_" + new Date().toLocaleTimeString();
      const saved = JSON.parse(localStorage.getItem("savedHorses") || "[]");
      saved.push(data);
      localStorage.setItem("savedHorses", JSON.stringify(saved));
    }
    resetRace();
  });

  // 放生此马 → 不回主菜单，直接重置+新马
  document.getElementById("btn-release").addEventListener("click", (e) => {
    e.stopPropagation();
    releaseAndNewHorse();
  });

  // 点击屏幕开始比赛（不在主界面 + 马未开跑时）
  window.addEventListener("click", (e) => {
    if (inMenu) return;
    if (e.target.closest(".lil-gui")) return;
    for (const horse of horses) {
      if (!horse.running) horse.running = true;
    }
  });

  // 滑动施力
  setupSwipe(document.getElementById("canvas3d"));

  requestAnimationFrame(animate);
}

// ════════════════════════════════════════════════════════════
//  滑动施力
// ════════════════════════════════════════════════════════════
let swipeStart = null;

function setupSwipe(canvas) {
  const svg = document.querySelector("#swipe-indicator svg");

  canvas.addEventListener("mousedown", (e) => {
    if (e.target !== canvas) return;
    swipeStart = { x: e.clientX, y: e.clientY };
  });

  canvas.addEventListener("mousemove", (e) => {
    if (!swipeStart) return;
    const dx = e.clientX - swipeStart.x;
    const dy = e.clientY - swipeStart.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len > 10) {
      const ax = e.clientX + (dx / len) * 10;
      const ay = e.clientY + (dy / len) * 10;
      const px1 = ax - (-dy / len) * 5;
      const py1 = ay - (dx / len) * 5;
      const px2 = ax + (-dy / len) * 5;
      const py2 = ay + (dx / len) * 5;
      svg.innerHTML = `
        <line x1="${swipeStart.x}" y1="${swipeStart.y}" x2="${e.clientX}" y2="${e.clientY}"
              stroke="rgba(170,100,255,0.6)" stroke-width="3" stroke-linecap="round"/>
        <polygon points="${e.clientX},${e.clientY} ${px1},${py1} ${px2},${py2}"
                 fill="rgba(170,100,255,0.8)"/>
      `;
    }
  });

  canvas.addEventListener("mouseup", (e) => {
    if (!swipeStart) return;
    const dx = e.clientX - swipeStart.x;
    const dy = e.clientY - swipeStart.y;
    const len = Math.sqrt(dx * dx + dy * dy);

    if (len > 15 && playerHorse && playerHorse.stamina > 0.01) {
      // 屏幕右→世界+X，屏幕上→世界+Y
      playerHorse.applyStamina(dx / len, -dy / len);
    }

    swipeStart = null;
    svg.innerHTML = "";
  });
}

// ════════════════════════════════════════════════════════════
//  Three.js（与原版一致）
// ════════════════════════════════════════════════════════════
function initThreeJS() {
  const canvas = document.getElementById("canvas3d");
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x88bb55);

  camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 200);
  updateCameraAngle();

  scene.add(new THREE.AmbientLight(0xffffff, 0.8));
  const dirLight = new THREE.DirectionalLight(0xffeedd, 1.5);
  dirLight.position.set(5, 10, 5);
  scene.add(dirLight);

  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
}

function updateCameraAngle() {
  const rad = cameraConfig.viewAngle * Math.PI / 180;
  const d = cameraConfig.viewDist;
  camera.position.set(
    camera.position.x || START_X,
    1.0 + d * Math.sin(rad),
    d * Math.cos(rad)
  );
  camera.lookAt(camera.position.x, 1.0, 0);
}

// ════════════════════════════════════════════════════════════
//  赛道（完全复刻原版）
// ════════════════════════════════════════════════════════════
function createRacetrack() {
  const trackWidth = LANE_COUNT * LANE_WIDTH + 2;
  const halfZ = trackWidth / 2;

  // 草地
  const grass = new THREE.Mesh(
    new THREE.PlaneGeometry(TRACK_LENGTH, trackWidth + 10),
    new THREE.MeshStandardMaterial({ color: 0x66aa33 })
  );
  grass.rotation.x = -Math.PI / 2;
  grass.position.set(TRACK_LENGTH / 2 - 20, -0.01, 0);
  scene.add(grass);

  // 泥土赛道
  const track = new THREE.Mesh(
    new THREE.PlaneGeometry(TRACK_LENGTH, trackWidth),
    new THREE.MeshStandardMaterial({ color: 0xcc9955 })
  );
  track.rotation.x = -Math.PI / 2;
  track.position.set(TRACK_LENGTH / 2 - 20, 0, 0);
  scene.add(track);

  // 车道分隔线
  const startZ = -(LANE_COUNT - 1) * LANE_WIDTH / 2;
  for (let i = 0; i <= LANE_COUNT; i++) {
    const z = startZ - LANE_WIDTH / 2 + i * LANE_WIDTH;
    const line = new THREE.Mesh(
      new THREE.PlaneGeometry(TRACK_LENGTH, 0.04),
      new THREE.MeshBasicMaterial({ color: 0xffffff, opacity: 0.5, transparent: true })
    );
    line.rotation.x = -Math.PI / 2;
    line.position.set(TRACK_LENGTH / 2 - 20, 0.01, z);
    scene.add(line);
  }

  // 围栏
  const postMat = new THREE.MeshStandardMaterial({ color: 0xffffff });
  for (let x = -20; x <= TRACK_LENGTH - 20; x += 4) {
    for (const z of [-halfZ - 0.3, halfZ + 0.3]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.2, 0.1), postMat);
      post.position.set(x, 0.6, z);
      scene.add(post);
      const rail = new THREE.Mesh(new THREE.BoxGeometry(4, 0.06, 0.06), postMat);
      rail.position.set(x + 2, 0.9, z);
      scene.add(rail);
      const rail2 = new THREE.Mesh(new THREE.BoxGeometry(4, 0.06, 0.06), postMat);
      rail2.position.set(x + 2, 0.5, z);
      scene.add(rail2);
    }
  }

  // 观众看台
  const standMat = new THREE.MeshStandardMaterial({ color: 0x999999 });
  for (let x = -10; x <= 10; x += 2) {
    const h = 2 + Math.random() * 2;
    const stand = new THREE.Mesh(new THREE.BoxGeometry(1.8, h, 2), standMat);
    stand.position.set(x, h / 2, -halfZ - 4);
    scene.add(stand);
  }
  const roof = new THREE.Mesh(
    new THREE.BoxGeometry(24, 0.3, 3),
    new THREE.MeshStandardMaterial({ color: 0xdd4444 })
  );
  roof.position.set(0, 5, -halfZ - 4);
  scene.add(roof);

  // 起跑线
  const startLine = new THREE.Mesh(
    new THREE.PlaneGeometry(0.15, trackWidth),
    new THREE.MeshBasicMaterial({ color: 0xffffff })
  );
  startLine.rotation.x = -Math.PI / 2;
  startLine.position.set(START_X, 0.02, 0);
  scene.add(startLine);
}

// ════════════════════════════════════════════════════════════
//  终点线（完全复刻原版）
// ════════════════════════════════════════════════════════════
function createFinishLine() {
  const trackWidth = LANE_COUNT * LANE_WIDTH + 2;
  const halfZ = trackWidth / 2;

  // 棋盘格
  const checkerSize = 0.5;
  const rows = Math.ceil(trackWidth / checkerSize);
  const cols = 2;
  const whiteMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const blackMat = new THREE.MeshBasicMaterial({ color: 0x111111 });

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const mat = (r + c) % 2 === 0 ? whiteMat : blackMat;
      const tile = new THREE.Mesh(new THREE.PlaneGeometry(checkerSize, checkerSize), mat);
      tile.rotation.x = -Math.PI / 2;
      tile.position.set(FINISH_X + c * checkerSize, 0.02, -halfZ + r * checkerSize + checkerSize / 2);
      scene.add(tile);
    }
  }

  // 拱门
  const archMat = new THREE.MeshStandardMaterial({ color: 0xcc0000 });
  const pole1 = new THREE.Mesh(new THREE.BoxGeometry(0.15, 3, 0.15), archMat);
  pole1.position.set(FINISH_X + 0.5, 1.5, -halfZ - 0.3);
  scene.add(pole1);
  const pole2 = new THREE.Mesh(new THREE.BoxGeometry(0.15, 3, 0.15), archMat);
  pole2.position.set(FINISH_X + 0.5, 1.5, halfZ + 0.3);
  scene.add(pole2);
  const bar = new THREE.Mesh(
    new THREE.BoxGeometry(0.15, 0.15, trackWidth + 1),
    archMat
  );
  bar.position.set(FINISH_X + 0.5, 3, 0);
  scene.add(bar);

  // FINISH 文字
  const cv = document.createElement("canvas");
  cv.width = 512; cv.height = 64;
  const ctx = cv.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 48px monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("FINISH", 256, 34);
  const tex = new THREE.CanvasTexture(cv);
  const textMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(3, 0.4),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true })
  );
  textMesh.position.set(FINISH_X + 0.5, 3.3, 0);
  scene.add(textMesh);
}

// ════════════════════════════════════════════════════════════
//  马匹创建（每匹马独立物理世界）
// ════════════════════════════════════════════════════════════
function createHorses() {
  const startZ = -(LANE_COUNT - 1) * LANE_WIDTH / 2;

  for (let i = 0; i < LANE_COUNT; i++) {
    const cfg = HORSE_CONFIGS[i];

    // 每匹马独立物理世界
    const horseWorld = new RAPIER.World({ x: 0.0, y: -9.81 });
    const groundBody = horseWorld.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(0, GROUND_Y - 0.5)
    );
    horseWorld.createCollider(
      RAPIER.ColliderDesc.cuboid(500, 0.5).setFriction(0.8).setRestitution(0.02),
      groundBody
    );
    worlds.push(horseWorld);

    const genome = randomGenome();
    const horse = new RagdollHorse(horseWorld, genome, START_X);
    horse.horseWorld = horseWorld;
    horse.name = cfg.name;
    horse.color = cfg.color;
    horse.lane = i;
    horse.isPlayer = cfg.isPlayer || false;
    horse.laneZ = startZ + i * LANE_WIDTH;

    horse.meshes = build3DHorse(horse);
    horses.push(horse);
    if (horse.isPlayer) playerHorse = horse;
  }
}

function build3DHorse(horse) {
  const m = {};
  const color = horse.color;
  const mat = new THREE.MeshStandardMaterial({ color });
  const legMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(color).multiplyScalar(0.75) });
  const tailMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(color).multiplyScalar(0.45) });

  m.body = new THREE.Mesh(new THREE.BoxGeometry(horse.bodyW, horse.bodyH, 0.5), mat);
  scene.add(m.body);

  for (const [name, z] of [["hindLeg", 0.15], ["foreLeg", 0.15], ["hindLegR", -0.15], ["foreLegR", -0.15]]) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(horse.legW, horse.legLen, horse.legW), legMat);
    mesh.position.z = z;
    scene.add(mesh);
    m[name] = mesh;
  }

  m.neck = new THREE.Mesh(new THREE.BoxGeometry(horse.neckW, horse.neckLen, 0.14), mat);
  scene.add(m.neck);

  m.head = new THREE.Mesh(new THREE.BoxGeometry(horse.headW, horse.headH, 0.16), mat);
  scene.add(m.head);

  // 眼睛
  for (const zs of [1, -1]) {
    const eye = new THREE.Mesh(new THREE.CircleGeometry(0.022, 10), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    eye.position.z = zs * 0.09; eye.rotation.y = zs > 0 ? 0 : Math.PI;
    m.head.add(eye);
    const pupil = new THREE.Mesh(new THREE.CircleGeometry(0.01, 8), new THREE.MeshBasicMaterial({ color: 0x111111 }));
    pupil.position.set(0.004, -0.002, zs * 0.001); eye.add(pupil);
  }

  // 耳朵
  for (const z of [0.035, -0.035]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.08, 4),
      new THREE.MeshStandardMaterial({ color: new THREE.Color(color).multiplyScalar(0.9) }));
    ear.position.set(-0.02, 0.08, z); m.head.add(ear);
  }

  // 尾巴
  m.tailSegs = [];
  for (let i = 0; i < 3; i++) {
    const seg = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.09, 0.025), tailMat);
    scene.add(seg); m.tailSegs.push(seg);
  }

  // 名牌
  const nameCanvas = document.createElement("canvas");
  nameCanvas.width = 256; nameCanvas.height = 32;
  const nc = nameCanvas.getContext("2d");
  nc.fillStyle = horse.isPlayer ? "#ffdd44" : "#ffffff";
  nc.font = "bold 16px monospace"; nc.textAlign = "center";
  nc.fillText(horse.name, 128, 22);
  const nameTex = new THREE.CanvasTexture(nameCanvas);
  m.nameLabel = new THREE.Mesh(
    new THREE.PlaneGeometry(1.5, 0.2),
    new THREE.MeshBasicMaterial({ map: nameTex, transparent: true, depthTest: false })
  );
  m.nameLabel.renderOrder = 999;
  scene.add(m.nameLabel);

  // ── 骑手 ──
  const sc = 0.7 + ((horse.genome.size || 100) / 100) * 0.3;
  const riderColors = [0xff3333, 0x3366ff, 0x33cc33, 0xffcc00, 0xff66cc, 0x9933ff];
  const riderColor = riderColors[Math.floor(Math.random() * riderColors.length)];
  const riderMat = new THREE.MeshStandardMaterial({ color: riderColor });
  const skinMat = new THREE.MeshStandardMaterial({ color: 0xffcc99 });

  // 骑手身体（挂在body mesh上）
  m.rider = new THREE.Mesh(
    new THREE.BoxGeometry(0.14 * sc, 0.22 * sc, 0.14 * sc), riderMat
  );
  m.rider.position.set(horse.bodyW / 6, horse.bodyH / 2 + 0.13, 0);
  m.body.add(m.rider);

  // 骑手头
  const rHead = new THREE.Mesh(
    new THREE.BoxGeometry(0.1 * sc, 0.1 * sc, 0.1 * sc), skinMat
  );
  rHead.position.set(0, 0.16 * sc, 0);
  m.rider.add(rHead);

  // 头盔
  const helmet = new THREE.Mesh(
    new THREE.BoxGeometry(0.12 * sc, 0.06 * sc, 0.12 * sc), riderMat
  );
  helmet.position.set(0, 0.06 * sc, 0);
  rHead.add(helmet);

  // ── 项圈（脖子底部的环）──
  m.collar = new THREE.Mesh(
    new THREE.TorusGeometry(0.09, 0.018, 8, 16),
    new THREE.MeshStandardMaterial({ color: 0xddaa00 })
  );
  m.collar.rotation.x = Math.PI / 2;
  scene.add(m.collar);

  // ── 绳子（骑手手→项圈，每帧更新端点）──
  const ropeMat = new THREE.LineBasicMaterial({ color: 0x886633, linewidth: 2 });
  const ropeGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 0)
  ]);
  m.rope = new THREE.Line(ropeGeo, ropeMat);
  scene.add(m.rope);

  return m;
}

// ════════════════════════════════════════════════════════════
//  物理→3D同步
// ════════════════════════════════════════════════════════════
function syncHorseMeshes(horse) {
  const st = horse.getBodyState();
  const z = horse.laneZ;
  const m = horse.meshes;

  function apply(mesh, s) {
    mesh.position.x = s.x; mesh.position.y = s.y; mesh.position.z = z;
    mesh.rotation.z = s.angle;
  }

  apply(m.body, st.body);
  apply(m.hindLeg, st.hindLeg); m.hindLeg.position.z = z + 0.15;
  apply(m.foreLeg, st.foreLeg); m.foreLeg.position.z = z + 0.15;
  m.hindLegR.position.set(st.hindLeg.x, st.hindLeg.y, z - 0.15); m.hindLegR.rotation.z = st.hindLeg.angle;
  m.foreLegR.position.set(st.foreLeg.x, st.foreLeg.y, z - 0.15); m.foreLegR.rotation.z = st.foreLeg.angle;
  apply(m.neck, st.neck);
  apply(m.head, st.head);
  st.tailSegs.forEach((s, i) => apply(m.tailSegs[i], s));
  m.nameLabel.position.set(st.body.x, st.body.y + horse.bodyH / 2 + 0.5, z);

  // 骑手弹跳动画
  if (m.rider && horse.running) {
    const t = horse.elapsed;
    m.rider.position.y = horse.bodyH / 2 + 0.13 + Math.sin(t * 5) * 0.015;
    m.rider.rotation.z = Math.sin(t * 5) * 0.06;
  }

  // 项圈跟随脖子底部
  if (m.collar) {
    const collar = horse.getCollarWorldPos();
    if (collar) {
      m.collar.position.set(collar.x, collar.y, z);
      m.collar.rotation.z = st.neck.angle;
    }
  }

  // 绳子端点更新（骑手手部 → 项圈）
  if (m.rope && m.collar) {
    // 骑手手部世界坐标（body mesh 上的子对象位置）
    const riderWorld = new THREE.Vector3();
    m.rider.getWorldPosition(riderWorld);
    const handX = riderWorld.x + 0.07;
    const handY = riderWorld.y - 0.05;

    const collar = horse.getCollarWorldPos();
    if (collar) {
      const positions = m.rope.geometry.attributes.position;
      positions.setXYZ(0, handX, handY, z);
      positions.setXYZ(1, collar.x, collar.y, z);
      positions.needsUpdate = true;
    }
  }
}

// ════════════════════════════════════════════════════════════
//  比赛逻辑
// ════════════════════════════════════════════════════════════
function checkRace(dt) {
  if (raceFinished) return;

  // 终点检测
  if (playerHorse && playerHorse.posX >= FINISH_X) {
    raceFinished = true;
    const overlay = document.getElementById("finish-overlay");
    overlay.classList.add("active");
  }
}

function resetRace() {
  raceFinished = false;
  document.getElementById("finish-overlay").classList.remove("active");

  // 回到主界面
  inMenu = true;
  document.getElementById("main-menu").classList.remove("hidden");
  document.getElementById("rankings").innerHTML = "";

  for (const horse of horses) {
    horse.reset(START_X);
    if (!horse.isPlayer) {
      Object.assign(horse.genome, randomGenome());
    }
  }
}

function releaseAndNewHorse() {
  raceFinished = false;
  document.getElementById("finish-overlay").classList.remove("active");
  info.textContent = "点击屏幕开始";

  // 完整重建每匹马（删除旧的，创建新的）
  for (let i = 0; i < horses.length; i++) {
    const oldHorse = horses[i];
    const cfg = HORSE_CONFIGS[i];

    // 删除旧3D网格
    const m = oldHorse.meshes;
    for (const key of Object.keys(m)) {
      if (key === "tailSegs") { m.tailSegs.forEach(s => scene.remove(s)); }
      else if (m[key]?.removeFromParent) { m[key].removeFromParent(); scene.remove(m[key]); }
    }

    // 删除旧物理刚体
    const allBodies = [
      oldHorse.bodies.body, oldHorse.bodies.hindLeg, oldHorse.bodies.foreLeg,
      oldHorse.bodies.neck, oldHorse.bodies.head, ...oldHorse.bodies.tailSegs,
    ];
    for (const b of allBodies) {
      if (b) oldHorse.horseWorld.removeRigidBody(b);
    }

    // 创建新马
    const genome = randomGenome();
    const newHorse = new RagdollHorse(oldHorse.horseWorld, genome, START_X);
    newHorse.horseWorld = oldHorse.horseWorld;
    newHorse.name = cfg.name;
    newHorse.color = cfg.color;
    newHorse.lane = oldHorse.lane;
    newHorse.isPlayer = cfg.isPlayer || false;
    newHorse.laneZ = oldHorse.laneZ;

    newHorse.meshes = build3DHorse(newHorse);
    horses[i] = newHorse;
    if (newHorse.isPlayer) playerHorse = newHorse;
  }

  // 强制右侧面板刷新
  const statsDiv = document.getElementById("horse-stats");
  if (statsDiv) statsDiv._lastHtml = null;
}

// ════════════════════════════════════════════════════════════
//  2D调试（仅玩家马）
// ════════════════════════════════════════════════════════════
function drawDebug() {
  if (!playerHorse) return;
  const horse = playerHorse;
  const canvas = debugCtx.canvas;
  const ctx = debugCtx;
  const w = canvas.width, h = canvas.height, s = config.debugScale;
  ctx.clearRect(0, 0, w, h);

  const offsetX = w / 2 - horse.posX * s;
  function toScreen(wx, wy) { return { x: offsetX + wx * s, y: config.debugOffsetY - wy * s }; }

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
  let contactCount = 0, totalNormal = 0;
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
          contactCount++; totalNormal += Math.abs(imp);
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
    // 腿轴线
    ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(hipSp.x, hipSp.y); ctx.lineTo(hoofSp.x, hoofSp.y); ctx.stroke(); ctx.setLineDash([]);
    // 蹬地力箭头
    const fs = kick.force * 3;
    ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(hipSp.x, hipSp.y);
    ctx.lineTo(hipSp.x + kick.dirX * fs, hipSp.y - kick.dirY * fs); ctx.stroke();
    // 摩擦力箭头
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

// ════════════════════════════════════════════════════════════
//  GUI
// ════════════════════════════════════════════════════════════
function setupGUI() {
  // GUI 面板隐藏，不创建
}

// ════════════════════════════════════════════════════════════
//  主循环
// ════════════════════════════════════════════════════════════
function animate() {
  requestAnimationFrame(animate);
  timer.update();
  const dt = Math.min(timer.getDelta(), 0.05);

  if (!config.paused && !raceFinished && !inMenu) {
    for (const horse of horses) {
      horse.update(dt);
      if (horse.running) horse.horseWorld.step();
    }
  }

  for (const horse of horses) syncHorseMeshes(horse);
  checkRace(dt);

  // 相机跟踪（与原版一致）
  if (playerHorse) {
    const rad = cameraConfig.viewAngle * Math.PI / 180;
    const d = cameraConfig.viewDist;
    const targetX = playerHorse.posX;
    camera.position.x += (targetX - camera.position.x) * 0.05;
    camera.position.y = 1.0 + d * Math.sin(rad);
    camera.position.z = d * Math.cos(rad);
    camera.lookAt(camera.position.x, 1.0, 0);
  }

  // 耐力条
  if (playerHorse) {
    const fill = document.getElementById("stamina-bar-fill");
    if (fill) fill.style.width = `${playerHorse.stamina * 100}%`;
  }

  // 马匹参数面板
  updateHorseStats();

  renderer.render(scene, camera);

  const dc = document.getElementById("debug-canvas");
  if (config.showDebug) { dc.style.display = "block"; drawDebug(); }
  else dc.style.display = "none";
}

function updateHorseStats() {
  const div = document.getElementById("horse-stats");
  if (!div || inMenu) {
    if (div) { div.innerHTML = ""; div._lastHtml = null; }
    return;
  }

  const savedHorses = JSON.parse(localStorage.getItem("savedHorses") || "[]");

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
    // options: [{val, text, cls}]
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
    const massScale = (h.estimatedMass || 1) / 1.0;
    const strengthF = (g.legStrength / 100) * (g.muscleUse / 100);
    const baseLegLen = (0.35 + (g.legLength / 120) * 0.55) * (0.7 + (g.size / 100) * 0.3);
    html += `<div class="horse-name">${h.name} ${h.isPlayer ? "⭐" : ""}</div>`;

    // 后腿
    html += `<div class="section">`;
    html += section("后腿");
    html += bar("倾角", g.legSkew||0, -10, 10, "#f80");
    html += bar("灵活", g.legFlexibility, 20, 40, "#fa0");
    html += bar("腿长系数", h.hindLegLenScale, 0.9, 1.1, "#fa0");
    html += `</div>`;

    // 前腿
    html += `<div class="section">`;
    html += section("前腿");
    html += bar("倾角", g.armSkew||0, -10, 10, "#08f");
    html += bar("灵活", g.armFlexibility||g.legFlexibility, 20, 40, "#0af");
    html += bar("腿长系数", h.foreLegLenScale, 0.9, 1.1, "#0af");
    html += `</div>`;

    // 协调性
    const eventNames = ["无", "触地", "到底", "到顶"];
    const reactNames = ["无", "蹬", "抬", "反转"];
    html += `<div class="section">`;
    html += section("协调性");
    html += tag("步态", g.locoSync, [
      { val: 0, text: "交替步" },
      { val: 1, text: "同步跳" },
    ]);
    const ftobE = eventNames[g.legFtobEvent||0];
    const ftobR = reactNames[g.legFtobReact||0];
    const btofE = eventNames[g.armBtofEvent||0];
    const btofR = reactNames[g.armBtofReact||0];
    html += row("前→后", (ftobE === "无" || ftobR === "无") ? "无联动" : `前腿${ftobE}→${ftobR}后腿`);
    html += row("后→前", (btofE === "无" || btofR === "无") ? "无联动" : `后腿${btofE}→${btofR}前腿`);
    html += `</div>`;

    // 体型
    html += `<div class="section">`;
    html += section("体型");
    html += bar("大小", g.size, 35, 100, "#c8c");
    html += bar("长宽比", g.aspect, 150, 310, "#c8c");
    html += bar("纤瘦", g.skinny, 75, 200, "#c8c");
    html += bar("基础腿长", g.legLength, 50, 120, "#c8c");
    html += `</div>`;

    // 控制
    html += `<div class="section">`;
    html += section("控制");
    html += tag("后蹬", g.legThrustBack, [
      { val: 0, text: "无" },
      { val: 1, text: "弱" },
      { val: 2, text: "强" },
    ]);
    html += bar("阻力", g.breakForce, 0, 50, "#f44");
    html += tag("痉挛", g.brainSpastic, [
      { val: 0, text: "无" },
      { val: 1, text: "轻" },
      { val: 2, text: "重" },
    ]);
    html += tag("头晕", g.narcolepsy, [
      { val: 0, text: "无" },
      { val: 1, text: "有" },
    ]);
    html += tag("弹跳", g.spinalLoco, [
      { val: 0, text: "无" },
      { val: 1, text: "弱" },
      { val: 2, text: "强" },
    ]);
    html += bar("颈灵活", g.neckFlexibility, 0, 40, "#8af");
    html += `</div>`;

    // 其他
    html += `<div class="section">`;
    html += section("其他");
    html += bar("耐力回复", h.staminaRegenRate, 0.3, 0.5, "#a4f");
    html += `</div>`;

    if (h.isPlayer) {
      html += `<button class="save-btn" onclick="window._saveHorse()">💾 保存此马</button>`;
      html += `<span class="saved-count">已保存 ${savedHorses.length} 匹</span>`;
    }
  }

  if (div._lastHtml !== html) {
    div.innerHTML = html;
    div._lastHtml = html;
  }
}

// 保存马匹到 localStorage
window._saveHorse = function() {
  if (!playerHorse) return;
  const data = playerHorse.exportData();
  data.name = playerHorse.name + "_" + new Date().toLocaleTimeString();
  const saved = JSON.parse(localStorage.getItem("savedHorses") || "[]");
  saved.push(data);
  localStorage.setItem("savedHorses", JSON.stringify(saved));
  alert(`已保存！共 ${saved.length} 匹马`);
};

init().catch(err => {
  console.error("初始化失败:", err);
  document.getElementById("info").textContent = `错误: ${err.message}`;
});
