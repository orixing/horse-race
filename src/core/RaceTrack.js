/**
 * RaceTrack — 赛道3D场景构建（草地、泥土、围栏、看台、起跑线、终点线）
 */

import * as THREE from "three";
import { LANE_WIDTH, TRACK_LENGTH, START_X } from "../config/constants.js";
import sceneManager from "./SceneManager.js";

class RaceTrack {
  constructor() {
    this.trackObjects = [];
  }

  _add(obj) {
    this.trackObjects.push(obj);
    sceneManager.scene.add(obj);
  }

  clear() {
    for (const obj of this.trackObjects) {
      sceneManager.scene.remove(obj);
    }
    this.trackObjects = [];
  }

  /**
   * 创建完整赛道
   * @param {number} laneCount 赛道数
   * @param {number} finishX 终点线X坐标
   */
  build(laneCount, finishX) {
    this.clear();
    this._createRacetrack(laneCount);
    this._createFinishLine(laneCount, finishX);
  }

  _createRacetrack(laneCount) {
    const trackWidth = laneCount * LANE_WIDTH + 2;
    const halfZ = trackWidth / 2;

    // 草地
    const grass = new THREE.Mesh(
      new THREE.PlaneGeometry(TRACK_LENGTH, trackWidth + 10),
      new THREE.MeshStandardMaterial({ color: 0x66aa33 })
    );
    grass.rotation.x = -Math.PI / 2;
    grass.position.set(TRACK_LENGTH / 2 - 20, -0.01, 0);
    this._add(grass);

    // 泥土赛道
    const track = new THREE.Mesh(
      new THREE.PlaneGeometry(TRACK_LENGTH, trackWidth),
      new THREE.MeshStandardMaterial({ color: 0xcc9955 })
    );
    track.rotation.x = -Math.PI / 2;
    track.position.set(TRACK_LENGTH / 2 - 20, 0, 0);
    this._add(track);

    // 车道分隔线
    const startZ = -(laneCount - 1) * LANE_WIDTH / 2;
    for (let i = 0; i <= laneCount; i++) {
      const z = startZ - LANE_WIDTH / 2 + i * LANE_WIDTH;
      const line = new THREE.Mesh(
        new THREE.PlaneGeometry(TRACK_LENGTH, 0.04),
        new THREE.MeshBasicMaterial({ color: 0xffffff, opacity: 0.5, transparent: true })
      );
      line.rotation.x = -Math.PI / 2;
      line.position.set(TRACK_LENGTH / 2 - 20, 0.01, z);
      this._add(line);
    }

    // 围栏
    const postMat = new THREE.MeshStandardMaterial({ color: 0xffffff });
    for (let x = -20; x <= TRACK_LENGTH - 20; x += 4) {
      for (const z of [-halfZ - 0.3, halfZ + 0.3]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.2, 0.1), postMat);
        post.position.set(x, 0.6, z);
        this._add(post);
        const rail = new THREE.Mesh(new THREE.BoxGeometry(4, 0.06, 0.06), postMat);
        rail.position.set(x + 2, 0.9, z);
        this._add(rail);
        const rail2 = new THREE.Mesh(new THREE.BoxGeometry(4, 0.06, 0.06), postMat);
        rail2.position.set(x + 2, 0.5, z);
        this._add(rail2);
      }
    }

    // 观众看台
    const standMat = new THREE.MeshStandardMaterial({ color: 0x999999 });
    for (let x = -10; x <= 10; x += 2) {
      const h = 2 + Math.random() * 2;
      const stand = new THREE.Mesh(new THREE.BoxGeometry(1.8, h, 2), standMat);
      stand.position.set(x, h / 2, -halfZ - 4);
      this._add(stand);
    }
    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(24, 0.3, 3),
      new THREE.MeshStandardMaterial({ color: 0xdd4444 })
    );
    roof.position.set(0, 5, -halfZ - 4);
    this._add(roof);

    // 起跑线
    const startLine = new THREE.Mesh(
      new THREE.PlaneGeometry(0.15, trackWidth),
      new THREE.MeshBasicMaterial({ color: 0xffffff })
    );
    startLine.rotation.x = -Math.PI / 2;
    startLine.position.set(START_X, 0.02, 0);
    this._add(startLine);
  }

  _createFinishLine(laneCount, finishX) {
    const trackWidth = laneCount * LANE_WIDTH + 2;
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
        tile.position.set(finishX + c * checkerSize, 0.02, -halfZ + r * checkerSize + checkerSize / 2);
        this._add(tile);
      }
    }

    // 拱门
    const archMat = new THREE.MeshStandardMaterial({ color: 0xcc0000 });
    const pole1 = new THREE.Mesh(new THREE.BoxGeometry(0.15, 3, 0.15), archMat);
    pole1.position.set(finishX + 0.5, 1.5, -halfZ - 0.3);
    this._add(pole1);
    const pole2 = new THREE.Mesh(new THREE.BoxGeometry(0.15, 3, 0.15), archMat);
    pole2.position.set(finishX + 0.5, 1.5, halfZ + 0.3);
    this._add(pole2);
    const bar = new THREE.Mesh(
      new THREE.BoxGeometry(0.15, 0.15, trackWidth + 1),
      archMat
    );
    bar.position.set(finishX + 0.5, 3, 0);
    this._add(bar);

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
    textMesh.position.set(finishX + 0.5, 3.3, 0);
    this._add(textMesh);
  }
}

export default new RaceTrack();
