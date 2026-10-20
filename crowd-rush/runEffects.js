import * as THREE from "three";

export function createRunEffects(sceneCtrl) {
  const scene = sceneCtrl.scene;

  // 共有ジオメトリ・マテリアル
  const particleGeo = new THREE.BoxGeometry(0.15, 0.15, 0.15);
  const greenMat = new THREE.MeshBasicMaterial({ color: 0x22c55e });
  const redMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });
  const confettiMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });

  const wallBlockGeo = new THREE.BoxGeometry(0.8, 0.8, 0.8);
  const wallMatNormal = new THREE.MeshStandardMaterial({ color: 0x3b82f6, roughness: 0.4 });
  const wallMatHit = new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.4 });

  // プレイヤー判定円（半径0.6）
  const playerRingGeo = new THREE.RingGeometry(0.55, 0.65, 32);
  playerRingGeo.rotateX(-Math.PI / 2);
  const playerRingMat = new THREE.MeshBasicMaterial({
    color: 0xffaa00,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.7
  });
  const playerCircleMesh = new THREE.Mesh(playerRingGeo, playerRingMat);
  playerCircleMesh.position.set(0, 0.02, 7);
  scene.add(playerCircleMesh);

  // 壁モデルグループ
  const wallGroup = new THREE.Group();
  wallGroup.position.set(0, 0, -22); // ラン中もz=-22で遠景表示を維持
  scene.add(wallGroup);

  const wallBlocks = [];
  for (let i = 0; i < 30; i++) {
    const mesh = new THREE.Mesh(wallBlockGeo, wallMatNormal);
    const bx = ((i % 5) - 2) * 0.85;
    const by = (Math.floor(i / 5) % 3) * 0.85 + 0.4;
    const bz = (Math.floor(i / 15)) * 0.85;
    mesh.position.set(bx, by, bz);
    wallGroup.add(mesh);
    wallBlocks.push({
      mesh,
      originalPos: mesh.position.clone(),
      originalRot: mesh.rotation.clone(),
      velocity: new THREE.Vector3(),
      hit: false
    });
  }

  // 壁用テクスチャ数字表示プレーン
  const wallCanvas = document.createElement("canvas");
  wallCanvas.width = 256;
  wallCanvas.height = 128;
  const wallCtx = wallCanvas.getContext("2d");
  const wallTexture = new THREE.CanvasTexture(wallCanvas);
  const wallSignMat = new THREE.MeshBasicMaterial({ map: wallTexture, transparent: true });
  const wallSignGeo = new THREE.PlaneGeometry(3, 1.5);
  const wallSignMesh = new THREE.Mesh(wallSignGeo, wallSignMat);
  wallSignMesh.position.set(0, 3, 0);
  wallGroup.add(wallSignMesh);

  let lastDrawnHP = -1;
  function updateWallCanvas(hp) {
    const currentHP = Math.max(0, Math.ceil(hp));
    if (currentHP === lastDrawnHP) return;
    lastDrawnHP = currentHP;

    wallCtx.clearRect(0, 0, 256, 128);
    wallCtx.fillStyle = "rgba(15, 23, 42, 0.8)";
    wallCtx.beginPath();
    wallCtx.roundRect(16, 16, 224, 96, 24);
    wallCtx.fill();
    wallCtx.fillStyle = "#ffffff";
    wallCtx.font = "900 48px system-ui, sans-serif";
    wallCtx.textAlign = "center";
    wallCtx.textBaseline = "middle";
    wallCtx.fillText(`HP: ${currentHP}`, 128, 64);
    wallTexture.needsUpdate = true;
  }
  updateWallCanvas(300);

  // パーティクル管理（上限100）
  const particles = [];
  function spawnParticles(type, count = 15, origin = new THREE.Vector3(0, 1, 7)) {
    const mat = type === "gain" ? greenMat : type === "loss" ? redMat : confettiMat;
    for (let i = 0; i < count; i++) {
      if (particles.length >= 100) {
        const old = particles.shift();
        scene.remove(old.mesh);
      }
      const mesh = new THREE.Mesh(particleGeo, mat);
      mesh.position.copy(origin);
      scene.add(mesh);

      const velocity = new THREE.Vector3(
        (Math.random() - 0.5) * 6,
        Math.random() * 6 + 2,
        (Math.random() - 0.5) * 6
      );
      particles.push({ mesh, velocity, life: 1.0 });
    }
  }

  // 障害物メッシュ管理
  const hazardMeshes = new Map();
  const hazardCylGeo = new THREE.CylinderGeometry(0.55, 0.55, 0.4, 16);
  const hazardCylMat = new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.5 });
  const hazardRingGeo = new THREE.RingGeometry(0.5, 0.6, 24);
  hazardRingGeo.rotateX(-Math.PI / 2);
  const hazardRingMat = new THREE.MeshBasicMaterial({ color: 0xef4444, side: THREE.DoubleSide });

  function updateHazards(hazards) {
    const activeIds = new Set(hazards.map(h => h.id));
    for (const [id, group] of hazardMeshes) {
      if (!activeIds.has(id) || !hazards.find(h => h.id === id)?.active) {
        scene.remove(group);
        hazardMeshes.delete(id);
      }
    }

    hazards.forEach(h => {
      if (!h.active) return;
      let group = hazardMeshes.get(h.id);
      if (!group) {
        group = new THREE.Group();
        const cylMesh = new THREE.Mesh(hazardCylGeo, hazardCylMat);
        cylMesh.position.y = 0.2;
        group.add(cylMesh);

        const ringMesh = new THREE.Mesh(hazardRingGeo, hazardRingMat);
        ringMesh.position.y = 0.01;
        group.add(ringMesh);

        scene.add(group);
        hazardMeshes.set(h.id, group);
      }

      const wx = (h.x - 210) / 30;
      const wz = 7 + (h.y - 480) * 0.05;
      group.position.set(wx, 0, wz);
      
      // h.radius / 0.55 に基づいてスケール調整
      const scaleFactor = (typeof h.number === "number" ? h.radius : (h.radius || 0.55)) / 0.55;
      const rScale = (h.radius !== undefined ? h.radius : 0.55) / 0.55;
      group.scale.set(rScale, 1, rScale);

      group.visible = (wz >= -30 && wz <= 12);
    });
  }

  // オーディオ管理
  let audioUnlocked = false;
  let isMuted = false;
  let lastSoundTime = 0;
  const audioCache = {};
  const audioFiles = {
    gain: "./assets/audio/pluck_001.ogg",
    loss: "./assets/audio/minimize_001.ogg",
    win: "./assets/audio/confirmation_002.ogg"
  };

  function getAudio(key) {
    if (!audioCache[key]) {
      const audio = new Audio(audioFiles[key]);
      audio.preload = "auto";
      audio.volume = 0.35;
      audioCache[key] = audio;
    }
    return audioCache[key];
  }

  function playSound(key) {
    if (!audioUnlocked || isMuted) return;
    const now = performance.now();
    if ((key === "gain" || key === "loss") && now - lastSoundTime < 80) return;
    lastSoundTime = now;

    try {
      const audio = getAudio(key);
      audio.currentTime = 0;
      audio.play().catch(() => {});
    } catch (_) {}
  }

  function unlockAudio() {
    if (audioUnlocked) return;
    audioUnlocked = true;
    
    const keys = Object.keys(audioFiles);
    keys.forEach(key => {
      try {
        const a = getAudio(key);
        a.muted = true;
        a.play().then(() => {
          a.pause();
          a.currentTime = 0;
          a.muted = false;
        }).catch(() => {
          a.muted = false;
        });
      } catch (_) {}
    });
  }

  function setMuted(bool) {
    isMuted = !!bool;
    if (isMuted) {
      Object.values(audioCache).forEach(a => {
        try { a.pause(); } catch (_) {}
      });
    }
  }

  function reset() {
    wallGroup.position.set(0, 0, -22);
    wallGroup.visible = true; // リセット時も遠景表示を維持
    lastDrawnHP = -1;
    updateWallCanvas(300);

    wallBlocks.forEach(b => {
      b.mesh.position.copy(b.originalPos);
      b.mesh.rotation.copy(b.originalRot);
      b.velocity.set(0, 0, 0);
      b.mesh.material = wallMatNormal;
      b.hit = false;
    });

    particles.forEach(p => scene.remove(p.mesh));
    particles.length = 0;

    for (const group of hazardMeshes.values()) {
      scene.remove(group);
    }
    hazardMeshes.clear();
  }

  let cachedX = 210;

  function update(state, dt) {
    const clampedDt = Number.isFinite(dt) ? Math.max(0, Math.min(dt, 0.05)) : 0;
    cachedX = state.x;

    // プレイヤー判定円の位置更新（run中のみ表示）
    const wx = (state.x - 210) / 30;
    playerCircleMesh.position.x = wx;
    playerCircleMesh.visible = (state.phase === "run");

    if (state.hazards) {
      updateHazards(state.hazards);
    }

    // 壁の見た目制御
    if (state.phase === "run") {
      wallGroup.position.set(0, 0, -22);
      wallGroup.visible = true; // 遠景表示を維持
    } else if (state.phase === "wall") {
      wallGroup.position.set(0, 0, 3);
      wallGroup.visible = true;
      updateWallCanvas(state.wallHP);
    } else if (state.phase === "win") {
      wallGroup.visible = true;
      updateWallCanvas(state.wallHP); // win時もHP0などを表示更新
    } else if (state.phase === "gameover") {
      wallGroup.visible = true;
      updateWallCanvas(state.wallHP);
    }

    // 飛散ブロックの物理演算
    wallBlocks.forEach(b => {
      if (b.velocity.lengthSq() > 0 && clampedDt > 0) {
        b.mesh.position.addScaledVector(b.velocity, clampedDt);
        b.velocity.y -= 9.8 * clampedDt;
        b.mesh.rotation.x += clampedDt * 3;
        b.mesh.rotation.y += clampedDt * 2;
      }
    });

    // パーティクル更新
    if (clampedDt > 0) {
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.life -= clampedDt;
        if (p.life <= 0) {
          scene.remove(p.mesh);
          particles.splice(i, 1);
        } else {
          p.mesh.position.addScaledVector(p.velocity, clampedDt);
          p.velocity.y -= 5 * clampedDt;
          p.mesh.scale.multiplyScalar(0.95);
        }
      }
    }
  }

  function handleEvents(events) {
    events.forEach(ev => {
      const currentWorldX = (cachedX - 210) / 30;
      if (ev.type === "gain") {
        playSound("gain");
        spawnParticles("gain", 20, new THREE.Vector3(currentWorldX, 1, 7));
      } else if (ev.type === "loss" || ev.type === "gameover") {
        playSound("loss");
        spawnParticles("loss", 25, new THREE.Vector3(currentWorldX, 1, 7));
      } else if (ev.type === "wall_start") {
        wallGroup.position.set(0, 0, 3);
        wallGroup.visible = true;
      } else if (ev.type === "wall_hit") {
        const unhitBlocks = wallBlocks.filter(b => !b.hit);
        if (unhitBlocks.length > 0) {
          const targetBlock = unhitBlocks[0];
          targetBlock.hit = true;
          targetBlock.velocity.set((Math.random() - 0.5) * 8, Math.random() * 5 + 3, -2 - Math.random() * 4);
          targetBlock.mesh.material = wallMatHit;
        }
      } else if (ev.type === "win") {
        playSound("win");
        spawnParticles("win", 60, new THREE.Vector3(0, 3, 0));
      }
    });
  }

  function dispose() {
    scene.remove(playerCircleMesh);
    playerRingGeo.dispose();
    playerRingMat.dispose();

    scene.remove(wallGroup);
    wallBlockGeo.dispose();
    wallMatNormal.dispose();
    wallMatHit.dispose();
    wallSignGeo.dispose();
    wallSignMat.dispose();
    wallTexture.dispose();

    hazardCylGeo.dispose();
    hazardCylMat.dispose();
    hazardRingGeo.dispose();
    hazardRingMat.dispose();

    particleGeo.dispose();
    greenMat.dispose();
    redMat.dispose();
    confettiMat.dispose();

    for (const group of hazardMeshes.values()) {
      scene.remove(group);
    }
    hazardMeshes.clear();

    particles.forEach(p => scene.remove(p.mesh));
    particles.length = 0;
  }

  return {
    reset,
    update,
    handleEvents,
    unlockAudio,
    setMuted,
    dispose
  };
}