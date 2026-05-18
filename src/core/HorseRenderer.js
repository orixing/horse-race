/**
 * HorseRenderer — 马匹3D模型构建 + 物理→3D同步 + 名牌管理
 */

import * as THREE from "three";
import { getHorseDisplayName } from "../i18n.js";
import sceneManager from "./SceneManager.js";

/**
 * 构建一匹马的3D模型
 * @param {RagdollHorse} horse 马匹实例
 * @returns {object} meshes 对象
 */
export function build3DHorse(horse) {
  const scene = sceneManager.scene;
  const m = {};
  const ap = horse.appearance;

  // 材质
  const bodyColor = ap.bodyColor;
  const mat = new THREE.MeshStandardMaterial({ color: bodyColor });
  const hindLegMat = new THREE.MeshStandardMaterial({ color: ap.hindLegColor || ap.legColor });
  const foreLegMat = new THREE.MeshStandardMaterial({ color: ap.foreLegColor || ap.legColor });
  const maneMat = new THREE.MeshStandardMaterial({ color: ap.maneColor });
  const noseMat = new THREE.MeshStandardMaterial({ color: ap.noseColor });

  // 身体（花纹处理）
  if (ap.pattern === "split") {
    const halfW = horse.bodyW / 2;
    const group = new THREE.Group();
    const left = new THREE.Mesh(new THREE.BoxGeometry(halfW, horse.bodyH, 0.5), mat);
    left.position.x = -halfW / 2;
    group.add(left);
    const right = new THREE.Mesh(new THREE.BoxGeometry(halfW, horse.bodyH, 0.5),
      new THREE.MeshStandardMaterial({ color: ap.spotColor }));
    right.position.x = halfW / 2;
    group.add(right);
    m.body = group;
  } else if (ap.pattern === "spots") {
    const group = new THREE.Group();
    group.add(new THREE.Mesh(new THREE.BoxGeometry(horse.bodyW, horse.bodyH, 0.5), mat));
    const spotMat = new THREE.MeshStandardMaterial({ color: ap.spotColor });
    const spotCount = 3 + Math.floor(Math.random() * 4);
    for (let i = 0; i < spotCount; i++) {
      const sz = 0.04 + Math.random() * 0.08;
      const spot = new THREE.Mesh(new THREE.BoxGeometry(sz, sz, 0.52), spotMat);
      spot.position.set(
        (Math.random() - 0.5) * horse.bodyW * 0.8,
        (Math.random() - 0.5) * horse.bodyH * 0.6,
        0
      );
      group.add(spot);
    }
    m.body = group;
  } else {
    m.body = new THREE.Mesh(new THREE.BoxGeometry(horse.bodyW, horse.bodyH, 0.5), mat);
  }
  scene.add(m.body);

  // 腿（前后腿各自颜色）
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

  // 颈（主色）
  m.neck = new THREE.Mesh(new THREE.BoxGeometry(horse.neckW, horse.neckLen, 0.14), mat);
  const mane = new THREE.Mesh(new THREE.BoxGeometry(0.02, horse.neckLen * 0.8, 0.08), maneMat);
  mane.position.set(0, 0, 0.06);
  m.neck.add(mane);
  scene.add(m.neck);

  // 头（主色）
  m.head = new THREE.Mesh(new THREE.BoxGeometry(horse.headW, horse.headH, 0.16), mat);
  scene.add(m.head);

  // 鼻子
  const nose = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.06, 0.12), noseMat);
  nose.position.set(horse.headW / 2 - 0.01, -0.01, 0);
  m.head.add(nose);

  // 眼睛
  for (const zs of [1, -1]) {
    const eye = new THREE.Mesh(
      new THREE.CircleGeometry(0.022, 10),
      new THREE.MeshBasicMaterial({ color: 0xffffff })
    );
    eye.position.z = zs * 0.09;
    eye.rotation.y = zs > 0 ? 0 : Math.PI;
    m.head.add(eye);
    const pupil = new THREE.Mesh(
      new THREE.CircleGeometry(0.01, 8),
      new THREE.MeshBasicMaterial({ color: 0x111111 })
    );
    pupil.position.set(0.004, -0.002, zs * 0.001);
    eye.add(pupil);
  }

  // 耳朵
  for (const z of [0.035, -0.035]) {
    const ear = new THREE.Mesh(
      new THREE.ConeGeometry(0.02, 0.08, 4),
      new THREE.MeshStandardMaterial({ color: new THREE.Color(bodyColor).multiplyScalar(0.9) })
    );
    ear.position.set(-0.02, 0.08, z);
    m.head.add(ear);
  }

  // 尾巴（鬃毛色）
  m.tailSegs = [];
  for (let i = 0; i < 3; i++) {
    const seg = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.09, 0.025), maneMat);
    scene.add(seg);
    m.tailSegs.push(seg);
  }

  // 名牌
  horse.name = ap.name || "???";
  const displayName = getHorseDisplayName(ap.names || ap.name) || horse.name;
  const nameCanvas = document.createElement("canvas");
  nameCanvas.width = 512; nameCanvas.height = 32;
  const nc = nameCanvas.getContext("2d");
  nc.fillStyle = horse.isPlayer ? "#ffdd44" : "#ffffff";
  nc.font = "bold 14px monospace"; nc.textAlign = "center";
  nc.fillText(displayName, 256, 22);
  const nameTex = new THREE.CanvasTexture(nameCanvas);
  m.nameLabel = new THREE.Mesh(
    new THREE.PlaneGeometry(2.0, 0.2),
    new THREE.MeshBasicMaterial({ map: nameTex, transparent: true, depthTest: false })
  );
  m.nameLabel.renderOrder = 999;
  scene.add(m.nameLabel);

  // ── 骑手 ──
  const sc = 0.7 + ((horse.genome.size || 100) / 100) * 0.3;
  const riderMat = new THREE.MeshStandardMaterial({ color: ap.riderColor });
  const skinMat = new THREE.MeshStandardMaterial({ color: 0xffcc99 });

  m.rider = new THREE.Mesh(
    new THREE.BoxGeometry(0.14 * sc, 0.22 * sc, 0.14 * sc), riderMat
  );
  m.rider.position.set(horse.bodyW / 6, horse.bodyH / 2 + 0.13, 0);
  m.body.add(m.rider);

  const rHead = new THREE.Mesh(
    new THREE.BoxGeometry(0.1 * sc, 0.1 * sc, 0.1 * sc), skinMat
  );
  rHead.position.set(0, 0.16 * sc, 0);
  m.rider.add(rHead);

  const helmet = new THREE.Mesh(
    new THREE.BoxGeometry(0.12 * sc, 0.06 * sc, 0.12 * sc), riderMat
  );
  helmet.position.set(0, 0.06 * sc, 0);
  rHead.add(helmet);

  // ── 项圈 ──
  m.collar = new THREE.Mesh(
    new THREE.TorusGeometry(0.09, 0.018, 8, 16),
    new THREE.MeshStandardMaterial({ color: 0xddaa00 })
  );
  m.collar.rotation.x = Math.PI / 2;
  scene.add(m.collar);

  // ── 绳子 ──
  const ropeMat = new THREE.LineBasicMaterial({ color: 0x886633, linewidth: 2 });
  const ropeGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 0)
  ]);
  m.rope = new THREE.Line(ropeGeo, ropeMat);
  scene.add(m.rope);

  return m;
}

/**
 * 同步一匹马的物理状态到3D网格
 */
export function syncHorseMeshes(horse) {
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

  // 绳子端点更新
  if (m.rope && m.collar) {
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

/**
 * 重建马匹名牌（语言切换时调用）
 */
export function rebuildNameLabel(horse) {
  const scene = sceneManager.scene;
  if (!horse.meshes?.nameLabel) return;

  scene.remove(horse.meshes.nameLabel);
  horse.meshes.nameLabel.geometry.dispose();
  horse.meshes.nameLabel.material.map?.dispose();
  horse.meshes.nameLabel.material.dispose();

  const displayName = getHorseDisplayName(horse.appearance.names || horse.appearance.name);
  const nameCanvas = document.createElement("canvas");
  nameCanvas.width = 512; nameCanvas.height = 32;
  const nc = nameCanvas.getContext("2d");
  nc.fillStyle = horse.isPlayer ? "#ffdd44" : "#ffffff";
  nc.font = "bold 14px monospace"; nc.textAlign = "center";
  nc.fillText(displayName, 256, 22);
  const nameTex = new THREE.CanvasTexture(nameCanvas);
  horse.meshes.nameLabel = new THREE.Mesh(
    new THREE.PlaneGeometry(2.0, 0.2),
    new THREE.MeshBasicMaterial({ map: nameTex, transparent: true, depthTest: false })
  );
  horse.meshes.nameLabel.renderOrder = 999;
  scene.add(horse.meshes.nameLabel);
}

/**
 * 从场景中移除一匹马的所有3D对象
 */
export function removeHorseMeshes(horse) {
  const scene = sceneManager.scene;
  if (!horse.meshes) return;
  for (const key of Object.keys(horse.meshes)) {
    if (key === "tailSegs") {
      horse.meshes.tailSegs.forEach(s => scene.remove(s));
    } else if (horse.meshes[key]?.removeFromParent) {
      horse.meshes[key].removeFromParent();
      scene.remove(horse.meshes[key]);
    }
  }
}
