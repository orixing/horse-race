/**
 * SceneManager — Three.js 场景、渲染器、相机、灯光管理
 */

import * as THREE from "three";
import { CAMERA_CONFIG, START_X } from "../config/constants.js";

class SceneManager {
  constructor() {
    this.renderer = null;
    this.scene = null;
    this.camera = null;
    this.cameraConfig = { ...CAMERA_CONFIG };
  }

  init() {
    const canvas = document.getElementById("canvas3d");
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x88bb55);

    this.camera = new THREE.PerspectiveCamera(
      50, window.innerWidth / window.innerHeight, 0.1, 200
    );
    this.updateCameraAngle();

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.8));
    const dirLight = new THREE.DirectionalLight(0xffeedd, 1.5);
    dirLight.position.set(5, 10, 5);
    this.scene.add(dirLight);

    window.addEventListener("resize", () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  updateCameraAngle() {
    const rad = this.cameraConfig.viewAngle * Math.PI / 180;
    const d = this.cameraConfig.viewDist;
    this.camera.position.set(
      this.camera.position.x || START_X,
      1.0 + d * Math.sin(rad),
      d * Math.cos(rad)
    );
    this.camera.lookAt(this.camera.position.x, 1.0, 0);
  }

  /**
   * 平滑跟踪目标 X 坐标
   */
  followTarget(targetX) {
    const rad = this.cameraConfig.viewAngle * Math.PI / 180;
    const d = this.cameraConfig.viewDist;
    this.camera.position.x += (targetX - this.camera.position.x) * 0.05;
    this.camera.position.y = 1.0 + d * Math.sin(rad);
    this.camera.position.z = d * Math.cos(rad);
    this.camera.lookAt(this.camera.position.x, 1.0, 0);
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  resetCameraX(x) {
    this.camera.position.x = x;
  }
}

export default new SceneManager();
