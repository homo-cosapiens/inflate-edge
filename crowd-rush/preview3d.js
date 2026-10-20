import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const canvas = document.getElementById("previewCanvas");
const status = document.getElementById("status");
const scene = new THREE.Scene();
scene.background = new THREE.Color("#baf3e4");
const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 1000);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setClearColor("#baf3e4", 1);
renderer.shadowMap.enabled = false;

scene.add(new THREE.HemisphereLight(0xe8ffff, 0x579a83, 2.0));
const sun = new THREE.DirectionalLight(0xffffff, 2.2);
sun.position.set(4, 8, 5);
scene.add(sun);

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(30, 30),
  new THREE.MeshStandardMaterial({ color: 0x83d9b8, roughness: 1 })
);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.025;
scene.add(ground);
const grid = new THREE.GridHelper(18, 18, 0x9ae9ce, 0xb4efd9);
grid.position.y = -0.015;
scene.add(grid);

let mixer = null;
let model = null;
let modelHeight = 1.8;

function resize() {
  const w = Math.max(1, canvas.clientWidth);
  const h = Math.max(1, canvas.clientHeight);
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  if (model) fitCamera();
}
function fitCamera() {
  if (!model) return;
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  modelHeight = Math.max(size.y, 0.1);
  const targetY = center.y;
  const v = THREE.MathUtils.degToRad(camera.fov);
  const distV = size.y / (2 * Math.tan(v / 2));
  const distH = size.x / (2 * Math.tan(v / 2) * camera.aspect);
  const distance = Math.max(distV, distH, size.z * 0.7, 0.8) * 1.5;
  camera.near = Math.max(0.01, distance / 1000);
  camera.far = distance * 20 + 100;
  camera.position.set(0, targetY + distance * 0.07, distance);
  camera.lookAt(0, targetY, 0);
  camera.updateProjectionMatrix();
}
resize();
window.addEventListener("resize", resize);
if ("ResizeObserver" in window) new ResizeObserver(resize).observe(canvas);

status.textContent = "読み込み中: ./assets/character-male-e.glb";
new GLTFLoader().load(
  "./assets/character-male-e.glb",
  gltf => {
    model = gltf.scene;
    scene.add(model);
    model.updateMatrixWorld(true);
    const initial = new THREE.Box3().setFromObject(model);
    const center = initial.getCenter(new THREE.Vector3());
    const bottom = initial.min.y;
    model.position.x -= center.x;
    model.position.z -= center.z;
    model.position.y -= bottom;
    model.updateMatrixWorld(true);

    if (gltf.animations && gltf.animations.length) {
      const clips = gltf.animations;
      const chosen = clips.find(c => /sprint/i.test(c.name))
        || clips.find(c => /walk/i.test(c.name))
        || clips.find(c => /idle/i.test(c.name));
      mixer = new THREE.AnimationMixer(model);
      if (chosen) {
        mixer.clipAction(chosen).reset().play();
        status.textContent = "読み込み成功 · " + chosen.name + " 再生中 (" + clips.length + " clips)";
      } else {
        status.textContent = "モデル表示成功 · sprint / walk / idle が見つかりません";
      }
    } else {
      status.textContent = "モデル表示成功 · アニメーションクリップなし";
    }
    fitCamera();
  },
  event => {
    if (event.total) status.textContent = "モデル読み込み中… " + Math.round(event.loaded / event.total * 100) + "%";
  },
  error => {
    console.error("GLB load failed:", error);
    status.textContent = "読み込み失敗: character-male-e.glb — " + (error.message || "GLTFLoader error");
  }
);

const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  if (mixer) mixer.update(dt);
  renderer.render(scene, camera);
}
animate();
