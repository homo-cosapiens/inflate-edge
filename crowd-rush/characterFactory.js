import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import * as SkeletonUtils from "three/addons/utils/SkeletonUtils.js";

export async function createCharacterFactory({ url = "./assets/character-male-e.glb", maxCount = 80 } = {}) {
  const gltf = await new GLTFLoader().loadAsync(url);
  const source = gltf.scene;
  source.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(source);
  const size = bounds.getSize(new THREE.Vector3());
  if (!Number.isFinite(size.y) || size.y < 1e-5) throw new Error("GLB model has no usable height");
  const center = bounds.getCenter(new THREE.Vector3());
  const scale = 1 / size.y;
  const limit = Math.max(1, Math.min(80, Math.floor(maxCount) || 80));
  const clips = gltf.animations || [];
  const clip = clips.find(c => /sprint/i.test(c.name))
    || clips.find(c => /walk/i.test(c.name))
    || clips.find(c => /idle/i.test(c.name)) || null;
  const crowds = new Map();

  function setCount(group, count) {
    const record = crowds.get(group);
    if (!record) throw new Error("Unknown crowd group");
    const target = Math.max(0, Math.min(limit, Math.floor(Number(count) || 0)));
    while (record.items.length < target) {
      const actor = new THREE.Group(), normalized = new THREE.Group();
      normalized.scale.setScalar(scale);
      normalized.position.set(-center.x * scale, -bounds.min.y * scale, -center.z * scale);
      const model = SkeletonUtils.clone(source);
      normalized.add(model); actor.add(normalized); group.add(actor);
      const mixer = new THREE.AnimationMixer(model);
      if (clip) mixer.clipAction(clip).play();
      record.items.push({ actor, mixer });
    }
    while (record.items.length > target) {
      const item = record.items.pop();
      item.mixer.stopAllAction(); group.remove(item.actor);
    }
    const cols = Math.max(1, Math.min(10, Math.ceil(Math.sqrt(target * 1.3))));
    record.items.forEach((item, i) => {
      const row = Math.floor(i / cols), col = i % cols;
      const rowCount = Math.min(cols, target - row * cols);
      item.actor.position.set((col - (rowCount - 1) / 2) * .38, 0, row * .43);
    });
    record.count = target;
    return target;
  }

  function createCrowd(count = 20) {
    const group = new THREE.Group();
    crowds.set(group, { items: [], count: 0 });
    setCount(group, count);
    return group;
  }

  function update(dt) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    const delta = Math.min(dt, .05);
    for (const record of crowds.values()) {
      for (const item of record.items) item.mixer.update(delta);
    }
  }

  function disposeCrowd(group) {
    const record = crowds.get(group);
    if (!record) return;
    record.items.forEach(item => { item.mixer.stopAllAction(); group.remove(item.actor); });
    crowds.delete(group);
    if (group.parent) group.parent.remove(group);
  }

  return { createCrowd, setCount, update, disposeCrowd, maxCount: limit, animationName: clip ? clip.name : null };
}
