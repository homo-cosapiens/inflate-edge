import * as THREE from "three";

export function createScene3D(canvas) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#c8f5e9");
  scene.fog = new THREE.Fog("#c8f5e9", 28, 68);

  const camera = new THREE.PerspectiveCamera(46, 420 / 640, 0.1, 120);
  camera.position.set(0, 8.5, 12);
  camera.lookAt(0, 0.8, -8);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = false;

  scene.add(new THREE.HemisphereLight(0xeaffff, 0x6ba58b, 2.1));
  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.position.set(-4, 10, 7);
  scene.add(sun);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(100, 100),
    new THREE.MeshStandardMaterial({ color: 0x8dddc0, roughness: 1 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.22;
  scene.add(ground);

  const road = new THREE.Mesh(
    new THREE.PlaneGeometry(12, 62),
    new THREE.MeshStandardMaterial({ color: 0xfff0c7, roughness: 1 })
  );
  road.rotation.x = -Math.PI / 2;
  road.position.set(0, -0.1, -10);
  scene.add(road);

  const edgeMat = new THREE.MeshStandardMaterial({ color: 0x57bba5, roughness: 1 });
  for (const x of [-6.15, 6.15]) {
    const edge = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.16, 62), edgeMat);
    edge.position.set(x, 0, -10);
    scene.add(edge);
  }

  const laneMarks = [];
  const markMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 });
  for (const x of [-2, 2]) {
    for (let i = 0; i < 18; i++) {
      const mark = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.025, 1.35), markMat);
      mark.position.set(x, -0.075, -39 + i * 2.9);
      scene.add(mark);
      laneMarks.push(mark);
    }
  }

  const gateRoot = new THREE.Group();
  scene.add(gateRoot);
  const gateGroups = new Map();

  function worldXFromCore(x) {
    return (THREE.MathUtils.clamp(Number(x) || 210, 48, 372) - 210) / 30;
  }
  function worldZFromRow(y) {
    return -26 + (THREE.MathUtils.clamp(Number(y) || 0, -220, 600) + 180) * 0.05;
  }

  function signTexture(label, color) {
    const c = document.createElement("canvas");
    c.width = 512; c.height = 256;
    const g = c.getContext("2d");
    g.fillStyle = color;
    g.beginPath(); g.roundRect(8, 8, 496, 240, 36); g.fill();
    g.strokeStyle = "#ffffff"; g.lineWidth = 12; g.stroke();
    g.fillStyle = "#164b61";
    g.font = "900 112px system-ui, sans-serif";
    g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText(String(label), 256, 132);
    const texture = new THREE.CanvasTexture(c);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
    return texture;
  }

  function makeGate(label, color) {
    const group = new THREE.Group();
    const postMat = new THREE.MeshStandardMaterial({ color: 0x4ab6a5, roughness: 0.8 });
    for (const x of [-1.12, 1.12]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.45, 0.14), postMat);
      post.position.set(x, 0.72, 0);
      group.add(post);
    }
    const board = new THREE.Mesh(
      new THREE.PlaneGeometry(2.45, 1.2),
      new THREE.MeshStandardMaterial({ map: signTexture(label, color), roughness: 0.75 })
    );
    board.position.set(0, 1.42, 0.09);
    group.add(board);
    return group;
  }

  function disposeGroup(group) {
    group.traverse(obj => {
      if (!obj.isMesh) return;
      obj.geometry.dispose();
      const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
      materials.forEach(mat => {
        if (mat.map) mat.map.dispose();
        mat.dispose();
      });
    });
  }

  function updateRows(rows = []) {
    const active = new Set(rows);
    for (const [row, group] of gateGroups) {
      if (!active.has(row)) {
        gateRoot.remove(group);
        disposeGroup(group);
        gateGroups.delete(row);
      }
    }
    for (const row of rows) {
      let group = gateGroups.get(row);
      if (!group) {
        group = new THREE.Group();
        group.add(makeGate(row.left || "+15", "#b8f2d5"));
        group.children[0].position.x = -3.15;
        group.add(makeGate(row.right || "×2", "#ffcf70"));
        group.children[1].position.x = 3.15;
        gateRoot.add(group);
        gateGroups.set(row, group);
      }
      group.position.z = worldZFromRow(row.y);
      group.visible = !row.done;
    }
  }

  function resize() {
    const width = Math.max(1, canvas.clientWidth || 420);
    const height = Math.max(1, canvas.clientHeight || 640);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }
  window.addEventListener("resize", resize);
  const observer = "ResizeObserver" in window ? new ResizeObserver(resize) : null;
  if (observer) observer.observe(canvas);
  resize();

  function update(dt) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    for (const mark of laneMarks) {
      mark.position.z += Math.min(dt, 0.05) * 7;
      if (mark.position.z > 12) mark.position.z -= 52.2;
    }
  }
  function render() { renderer.render(scene, camera); }
  function dispose() {
    window.removeEventListener("resize", resize);
    if (observer) observer.disconnect();
    for (const group of gateGroups.values()) disposeGroup(group);
    gateGroups.clear();
    renderer.dispose();
  }

  return { scene, camera, renderer, gateRoot, updateRows, worldXFromCore, worldZFromRow, update, render, resize, dispose };
}
