/**
 * HorsePreview — 在 canvas 上渲染马匹3D静态预览
 *
 * 创建临时物理世界 + RagdollHorse → 获取站立姿态 → 临时 Three.js 场景渲染一帧
 */

import * as THREE from "three";
import { RagdollHorse, RAPIER } from "../RagdollHorse.js";
import { getHorseDisplayName } from "../i18n.js";
import { GROUND_Y } from "../config/constants.js";

// 复用单个离屏渲染器（所有预览共享）
let _renderer = null;

function _getRenderer() {
  if (!_renderer) {
    _renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    _renderer.setClearColor(0x000000, 0);
  }
  return _renderer;
}

/**
 * 在一个临时 Three.js 场景中构建马匹模型（独立于主场景）
 */
function _buildPreviewMeshes(scene, horse) {
  const m = {};
  const ap = horse.appearance;

  const mat = new THREE.MeshStandardMaterial({ color: ap.bodyColor });
  const hindLegMat = new THREE.MeshStandardMaterial({ color: ap.hindLegColor || ap.legColor });
  const foreLegMat = new THREE.MeshStandardMaterial({ color: ap.foreLegColor || ap.legColor });
  const maneMat = new THREE.MeshStandardMaterial({ color: ap.maneColor });
  const noseMat = new THREE.MeshStandardMaterial({ color: ap.noseColor });

  // 身体
  if (ap.pattern === "split") {
    const halfW = horse.bodyW / 2;
    const group = new THREE.Group();
    group.add(new THREE.Mesh(new THREE.BoxGeometry(halfW, horse.bodyH, 0.5), mat));
    group.children[0].position.x = -halfW / 2;
    const right = new THREE.Mesh(new THREE.BoxGeometry(halfW, horse.bodyH, 0.5),
      new THREE.MeshStandardMaterial({ color: ap.spotColor }));
    right.position.x = halfW / 2;
    group.add(right);
    m.body = group;
  } else if (ap.pattern === "spots") {
    const group = new THREE.Group();
    group.add(new THREE.Mesh(new THREE.BoxGeometry(horse.bodyW, horse.bodyH, 0.5), mat));
    const spotMat = new THREE.MeshStandardMaterial({ color: ap.spotColor });
    const spotsData = ap.spots || [];
    for (const s of spotsData) {
      const spot = new THREE.Mesh(new THREE.BoxGeometry(s.sz, s.sz, 0.52), spotMat);
      spot.position.set(s.x * horse.bodyW, s.y * horse.bodyH, 0);
      group.add(spot);
    }
    m.body = group;
  } else {
    m.body = new THREE.Mesh(new THREE.BoxGeometry(horse.bodyW, horse.bodyH, 0.5), mat);
  }
  scene.add(m.body);

  // 腿
  for (const [name, z] of [["hindLeg", 0.15], ["foreLeg", 0.15], ["hindLegR", -0.15], ["foreLegR", -0.15]]) {
    const isHind = name.startsWith("hind");
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(horse.legW, horse.legLen, horse.legW),
      isHind ? hindLegMat : foreLegMat
    );
    mesh.position.z = z;
    scene.add(mesh);
    m[name] = mesh;
  }

  // 颈
  m.neck = new THREE.Mesh(new THREE.BoxGeometry(horse.neckW, horse.neckLen, 0.14), mat);
  const mane = new THREE.Mesh(new THREE.BoxGeometry(0.02, horse.neckLen * 0.8, 0.08), maneMat);
  mane.position.set(0, 0, 0.06);
  m.neck.add(mane);
  scene.add(m.neck);

  // 头
  m.head = new THREE.Mesh(new THREE.BoxGeometry(horse.headW, horse.headH, 0.16), mat);
  const nose = new THREE.Mesh(new THREE.BoxGeometry(horse.headW * 0.3, horse.headH * 0.6, 0.12), noseMat);
  nose.position.set(horse.headW * 0.35, -horse.headH * 0.1, 0);
  m.head.add(nose);
  const eyeGeo = new THREE.BoxGeometry(0.02, 0.02, 0.17);
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
  const eye = new THREE.Mesh(eyeGeo, eyeMat);
  eye.position.set(horse.headW * 0.15, horse.headH * 0.15, 0);
  m.head.add(eye);
  scene.add(m.head);

  // 尾巴
  m.tailSegs = [];
  for (let i = 0; i < 3; i++) {
    const seg = new THREE.Mesh(
      new THREE.BoxGeometry(0.015, 0.12, 0.015),
      maneMat
    );
    scene.add(seg);
    m.tailSegs.push(seg);
  }

  // 骑手
  const sc = 0.7 + ((horse.genome.size || 100) / 100) * 0.3;
  const riderMat = new THREE.MeshStandardMaterial({ color: ap.riderColor });
  const skinMat = new THREE.MeshStandardMaterial({ color: 0xffcc99 });
  m.rider = new THREE.Mesh(new THREE.BoxGeometry(0.14 * sc, 0.22 * sc, 0.14 * sc), riderMat);
  m.rider.position.set(horse.bodyW / 6, horse.bodyH / 2 + 0.13, 0);
  m.body.add(m.rider);
  const rHead = new THREE.Mesh(new THREE.BoxGeometry(0.1 * sc, 0.1 * sc, 0.1 * sc), skinMat);
  rHead.position.set(0, 0.16 * sc, 0);
  m.rider.add(rHead);
  const helmet = new THREE.Mesh(new THREE.BoxGeometry(0.12 * sc, 0.06 * sc, 0.12 * sc), riderMat);
  helmet.position.set(0, 0.06 * sc, 0);
  rHead.add(helmet);

  // 项圈
  m.collar = new THREE.Mesh(
    new THREE.TorusGeometry(0.09, 0.018, 8, 16),
    new THREE.MeshStandardMaterial({ color: 0xddaa00 })
  );
  m.collar.rotation.x = Math.PI / 2;
  scene.add(m.collar);

  return m;
}

/**
 * 将物理姿态应用到 Three.js meshes
 */
function _applyPose(meshes, bodyState, horse) {
  const st = bodyState;
  function apply(mesh, s) {
    mesh.position.x = s.x;
    mesh.position.y = s.y;
    mesh.position.z = 0;
    mesh.rotation.z = s.angle;
  }

  apply(meshes.body, st.body);
  apply(meshes.hindLeg, st.hindLeg); meshes.hindLeg.position.z = 0.15;
  apply(meshes.foreLeg, st.foreLeg); meshes.foreLeg.position.z = 0.15;
  meshes.hindLegR.position.set(st.hindLeg.x, st.hindLeg.y, -0.15);
  meshes.hindLegR.rotation.z = st.hindLeg.angle;
  meshes.foreLegR.position.set(st.foreLeg.x, st.foreLeg.y, -0.15);
  meshes.foreLegR.rotation.z = st.foreLeg.angle;
  apply(meshes.neck, st.neck);
  apply(meshes.head, st.head);
  st.tailSegs.forEach((s, i) => { if (meshes.tailSegs[i]) apply(meshes.tailSegs[i], s); });

  // 项圈
  if (meshes.collar) {
    const na = st.neck.angle;
    meshes.collar.position.set(
      st.neck.x + Math.sin(na) * (-horse.neckLen / 2),
      st.neck.y - Math.cos(na) * (-horse.neckLen / 2),
      0
    );
    meshes.collar.rotation.z = na;
  }
}

/**
 * 渲染马匹3D预览到指定 canvas
 * @param {HTMLCanvasElement} canvas 目标 canvas
 * @param {object} horseData 从 HorseDataManager 取出的数据
 */
export async function renderHorsePreview(canvas, horseData) {
  await RAPIER.init();

  // 创建临时物理世界
  const world = new RAPIER.World({ x: 0, y: -9.81 });
  const groundBody = world.createRigidBody(
    RAPIER.RigidBodyDesc.fixed().setTranslation(0, GROUND_Y - 0.5)
  );
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(500, 0.5).setFriction(0.8).setRestitution(0.02),
    groundBody
  );

  // 创建马匹获取初始姿态
  const genome = horseData.genome || {};
  const horse = new RagdollHorse(world, genome, 0);
  if (horseData) horse.importData(horseData);

  const bodyState = horse.getBodyState();

  // 临时 Three.js 场景
  const scene = new THREE.Scene();

  // 灯光
  const ambient = new THREE.AmbientLight(0xffffff, 0.7);
  scene.add(ambient);
  const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
  dirLight.position.set(2, 3, 4);
  scene.add(dirLight);

  // 构建模型
  const meshes = _buildPreviewMeshes(scene, horse);
  _applyPose(meshes, bodyState, horse);

  // 相机：居中看向马匹
  const bodyPos = bodyState.body;
  // 优先用自身尺寸，回退到父容器
  const el = canvas.parentElement || canvas;
  const rect = el.getBoundingClientRect();
  const w = Math.max(Math.floor(rect.width), 64);
  const h = Math.max(Math.floor(rect.height), 48);

  const camDist = h < 120 ? 4.5 : 3.8;
  const camera = new THREE.PerspectiveCamera(25, w / h, 0.1, 50);
  camera.position.set(bodyPos.x + 0.1, bodyPos.y + 0.15, camDist);
  camera.lookAt(bodyPos.x + 0.1, bodyPos.y, 0);

  // 渲染
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const renderer = _getRenderer();
  renderer.setSize(w * dpr, h * dpr);
  renderer.render(scene, camera);

  // 复制到目标 canvas
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  // 强制 CSS 尺寸跟随容器，不被 canvas 属性撑开
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  const ctx = canvas.getContext("2d");
  ctx.drawImage(renderer.domElement, 0, 0);

  // 清理
  scene.traverse((obj) => {
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) {
      if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
      else obj.material.dispose();
    }
  });

  // 释放物理世界
  world.free();
}
