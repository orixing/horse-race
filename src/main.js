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
const cameraConfig = { viewAngle: 20, viewDist: 12 };

// ── 马匹配置（先用1匹调试）──
const HORSE_CONFIGS = [
  { name: "COLOSSULUS", color: 0xbb7733, number: 1, numberColor: 0xff33ff, isPlayer: true },
];

const config = {
  paused: false,
  showDebug: true,
  debugScale: 80,
  debugOffsetY: 330,
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

  // 主界面 → 练习模式按钮
  document.getElementById("btn-practice").addEventListener("click", () => {
    document.getElementById("main-menu").classList.add("hidden");
    info.textContent = "点击屏幕开始 — 空格重新比赛";
  });

  window.addEventListener("keydown", (e) => {
    if (e.code === "Space") { e.preventDefault(); resetRace(); }
  });

  // 点击屏幕开始比赛（主界面消失后才生效）
  window.addEventListener("click", (e) => {
    if (!document.getElementById("main-menu").classList.contains("hidden")) return;
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
  if (raceFinished) {
    finishTimer -= dt;
    if (finishTimer <= 0) resetRace();
    return;
  }

  // 排名
  const rankings = [...horses].sort((a, b) => b.posX - a.posX);

  // 更新排名UI
  const rankDiv = document.getElementById("rankings");
  rankDiv.innerHTML = rankings.map((h, i) =>
    `<span style="color:${h.isPlayer ? '#ffdd44' : '#fff'}">${i + 1}. ${h.name}</span>`
  ).join("<br>");

  // 终点检测
  if (playerHorse && playerHorse.posX >= FINISH_X) {
    raceFinished = true;
    finishTimer = FINISH_DISPLAY_TIME;

    const playerRank = rankings.indexOf(playerHorse) + 1;
    const overlay = document.getElementById("finish-overlay");
    overlay.classList.add("active");
    overlay.querySelector(".title").textContent = playerRank === 1 ? "WINNER!" : "FINISH!";
    overlay.querySelector(".rank").textContent = `第 ${playerRank} 名`;
  }
}

function resetRace() {
  raceFinished = false;
  document.getElementById("finish-overlay").classList.remove("active");

  // 回到主界面
  document.getElementById("main-menu").classList.remove("hidden");
  document.getElementById("rankings").innerHTML = "";

  for (const horse of horses) {
    horse.reset(START_X);
    // 重新随机基因（非玩家马）
    if (!horse.isPlayer) {
      Object.assign(horse.genome, randomGenome());
    }
  }
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
  drawBox(st.body, horse.bodyW / 2, horse.bodyH / 2, "#cc8844", "身体");
  drawBox(st.hindLeg, horse.legW / 2, horse.legLen / 2, "#997733", "后腿");
  drawBox(st.foreLeg, horse.legW / 2, horse.legLen / 2, "#997733", "前腿");
  drawBox(st.neck, horse.neckW / 2, horse.neckLen / 2, "#bb8844", "颈");
  drawBox(st.head, horse.headW / 2, horse.headH / 2, "#bb8844", "头");
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
    ctx.fillStyle = color; ctx.font = "9px monospace";
    ctx.fillText(`${kick.force.toFixed(1)}N`, hipSp.x + kick.dirX * fs + 5, hipSp.y - kick.dirY * fs - 2);
    // 摩擦力箭头
    if (kick.frictionForce !== undefined) {
      const fricS = Math.abs(kick.frictionForce) * 3;
      const fricDir = kick.frictionForce > 0 ? 1 : -1;
      ctx.strokeStyle = "#fff"; ctx.lineWidth = 4; ctx.beginPath();
      ctx.moveTo(hoofSp.x, hoofSp.y); ctx.lineTo(hoofSp.x + fricDir * fricS, hoofSp.y); ctx.stroke();
      ctx.fillStyle = "#fff"; ctx.font = "9px monospace";
      ctx.fillText(`摩擦${Math.abs(kick.frictionForce).toFixed(1)}N`, hoofSp.x + fricDir * fricS + 3, hoofSp.y - 5);
    }
  }

  // 信息面板
  const vel = horse.bodies.body.linvel();
  const angvel = horse.bodies.body.angvel();
  const g = horse.genome;
  ctx.fillStyle = "#fff"; ctx.font = "11px monospace"; ctx.textAlign = "left";
  ctx.fillText(`位置: ${horse.posX.toFixed(1)}/${FINISH_X}m  速度: (${vel.x.toFixed(2)}, ${vel.y.toFixed(2)})  角速度: ${angvel.toFixed(2)}`, 10, 15);
  ctx.fillText(`相位: ${horse.motorPhase.toFixed(2)}  水平速度: ${Math.abs(vel.x).toFixed(2)} m/s`, 10, 28);
  ctx.fillText(`接触: ${contactCount}  法向力: ${totalNormal.toFixed(3)}  蹬地力: ${horse.kickStrength.toFixed(0)}`, 10, 41);
  ctx.fillText(`后腿:倾${g.legSkew||0}°偏${g.legFlexBias}° 前腿:倾${g.armSkew||0}°偏${g.armFlexBias||g.legFlexBias}° 灵活:${g.legFlexibility}°`, 10, 54);
  ctx.fillText(`后摩擦:${horse.hindFrictionCoeff.toFixed(1)} 前摩擦:${horse.foreFrictionCoeff.toFixed(1)}  耐力:${(horse.stamina * 100).toFixed(0)}%`, 10, 67);

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
    ctx.font = "10px monospace";
    ctx.fillText(`骑手 ${sf.force.toFixed(1)}N`, sp.x + sf.fx * fScale + 5, sp.y - sf.fy * fScale - 5);
  }

  // 图例
  ctx.fillStyle = "#0f0"; ctx.fillText("■ 后蹄接触", 10, 83);
  ctx.fillStyle = "#0ff"; ctx.fillText("■ 前蹄接触", 110, 83);
  ctx.fillStyle = "#ff0"; ctx.fillText("■ 碰撞摩擦", 210, 83);
  ctx.fillStyle = "#f0f"; ctx.fillText("↑ 后腿蹬力", 310, 83);
  ctx.fillStyle = "#f80"; ctx.fillText("↑ 前腿蹬力", 410, 83);
  ctx.fillStyle = "#fff"; ctx.fillText("→ 蹬地摩擦", 510, 83);
  ctx.fillStyle = "#ff44aa"; ctx.fillText("→ 骑手外力", 630, 83);
}

// ════════════════════════════════════════════════════════════
//  GUI
// ════════════════════════════════════════════════════════════
function setupGUI() {
  const gui = new GUI({ title: "赛马控制", width: 260 });

  if (playerHorse) {
    function sync(key) { return (v) => { playerHorse.genome[key] = v; }; }

    const p = gui.addFolder("运动基因（实时）");
    p.add(playerHorse.genome, "speedFactor", 30, 133, 1).name("速度因子").onChange(sync("speedFactor"));
    p.add(playerHorse.genome, "legStrength", 60, 120, 1).name("腿部力量").onChange(sync("legStrength"));
    p.add(playerHorse.genome, "legFlexibility", 10, 60, 1).name("灵活度").onChange(sync("legFlexibility"));
    p.add(playerHorse.genome, "legFlexBias", -20, 30, 1).name("后腿偏置").onChange(sync("legFlexBias"));
    p.add(playerHorse.genome, "armFlexBias", -20, 30, 1).name("前腿偏置").onChange(sync("armFlexBias"));
    p.add(playerHorse.genome, "legSkew", -16, 24, 1).name("后腿倾角").onChange(sync("legSkew"));
    p.add(playerHorse.genome, "armSkew", -20, 20, 1).name("前腿倾角").onChange(sync("armSkew"));
    p.add(playerHorse, "kickStrength", 0, 200, 1).name("蹬地力");
    p.add(playerHorse, "hindFrictionCoeff", 0, 5, 0.1).name("后腿摩擦");
    p.add(playerHorse, "foreFrictionCoeff", 0, 5, 0.1).name("前腿摩擦");
    p.add(playerHorse.genome, "stiffJoints", 0, 50, 1).name("关节僵硬").onChange(sync("stiffJoints"));

    const cam = gui.addFolder("视角");
    cam.add(cameraConfig, "viewAngle", 5, 60, 1).name("俯视角度").onChange(updateCameraAngle);
    cam.add(cameraConfig, "viewDist", 5, 30, 0.5).name("视距").onChange(updateCameraAngle);
  }

  const v = gui.addFolder("调试");
  v.add(config, "paused").name("暂停");
  v.add(config, "showDebug").name("调试面板");

  gui.add({ reset: resetRace }, "reset").name("↩ 重新比赛");
}

// ════════════════════════════════════════════════════════════
//  主循环
// ════════════════════════════════════════════════════════════
function animate() {
  requestAnimationFrame(animate);
  timer.update();
  const dt = Math.min(timer.getDelta(), 0.05);

  if (!config.paused && !raceFinished) {
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

  renderer.render(scene, camera);

  const dc = document.getElementById("debug-canvas");
  if (config.showDebug) { dc.style.display = "block"; drawDebug(); }
  else dc.style.display = "none";
}

init().catch(err => {
  console.error("初始化失败:", err);
  document.getElementById("info").textContent = `错误: ${err.message}`;
});
