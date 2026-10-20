import * as THREE from "three";
import { createScene3D } from "./scene3d.js";
import { createCharacterFactory } from "./characterFactory.js";
import { createRun } from "./runRules.js";
import { createRunEffects } from "./runEffects.js";

(async function () {
  const canvas = document.getElementById("playCanvas");
  const statusEl = document.getElementById("status");
  const crowdCountEl = document.getElementById("crowdCount");
  const visibleCountEl = document.getElementById("visibleCount");
  const elapsedTimeEl = document.getElementById("elapsedTime");
  const startButton = document.getElementById("startButton");
  const soundButton = document.getElementById("soundButton");

  startButton.disabled = true;

  let sceneCtrl = null;
  let charFactory = null;
  let crowdGroup = null;
  let runLogic = null;
  let runEffects = null;

  let isReady = false;
  let isRunning = false;
  let isFocused = true;
  let lastTime = 0;
  let isMuted = true;

  let inputX = 210;
  let targetInputX = 210;
  let activePointerId = null;
  let isDragging = false;
  let dragStartX = 0;
  let dragBaseX = 210;
  let currentRenderCount = -1;

  // GLB攻撃者プール（最大10体、geometry/materialの都度生成なし）
  let attackerPoolGroup = null;
  const attackerSlots = []; // { actor, mixer, active, progress, startPos, targetPos }
  const attackerPoolMixers = [];

  // 終了後の余韻タイマー (effectTail = 1.2秒)
  let effectTailTimer = 0;
  let postGamePhase = null;

  // 壁突撃遷移状態
  let wallTransitionTimer = 0;
  let isTransitioningToWall = false;

  try {
    sceneCtrl = createScene3D(canvas);
    
    // カメラ位置・注視点
    sceneCtrl.camera.position.set(0, 15, 23);
    sceneCtrl.camera.lookAt(0, 0, 0);

    statusEl.textContent = "モデル読み込み中…";
    charFactory = await createCharacterFactory({ url: "./assets/character-male-e.glb", maxCount: 80 });
    
    crowdGroup = charFactory.createCrowd(20);
    sceneCtrl.scene.add(crowdGroup);

    // 攻撃者プールの生成（charFactory.createCrowd(10)を使用）
    attackerPoolGroup = charFactory.createCrowd(10);
    attackerPoolGroup.visible = true;
    sceneCtrl.scene.add(attackerPoolGroup);

    // attackerPoolGroup内の各actorを初期非表示にし、スロット管理構築
    // charFactoryの構造: groupの中に子供(actor)が入っており、内部でmixerを持っている
    // ここではアニメーション更新を効率化するため、attackerPoolGroupのitemsを走査
    // （createCharacterFactory内部のcrowds Mapにアクセスできないため、group.childrenから取得）
    attackerPoolGroup.children.forEach(actor => {
      actor.visible = false;
      // ミキサーはモデル自体に紐づいているか、またはfactoryで管理されている。
      // characterFactoryのupdateはクロージャー内管理のため、attacker用にもう一度mixerを作成するか、
      // または単にポーズを固定・アニメーションさせる。ここでは個別にAnimationMixerを作成して安全に管理。
      const model = actor.children[0]; // normalized -> model
      let mixer = null;
      if (model) {
        // 同じクリップでmixerを回す
        mixer = new THREE.AnimationMixer(model);
      }
      attackerSlots.push({
        actor,
        mixer,
        active: false,
        progress: 0,
        startPos: new THREE.Vector3(),
        targetPos: new THREE.Vector3()
      });
      if (mixer) attackerPoolMixers.push(mixer);
    });

    runLogic = createRun();
    runEffects = createRunEffects(sceneCtrl);

    // 初期 ready
    runLogic.reset();
    const s = runLogic.state;
    s.phase = "ready";
    s.count = 20;
    targetInputX = 210;
    inputX = 210;
    s.x = 210;

    const wx = sceneCtrl.worldXFromCore(s.x);
    const wz = sceneCtrl.worldZFromRow(480);
    crowdGroup.position.set(wx, 0, wz);

    const activeRows = s.rows.filter(r => !r.done && r.y >= -220).slice(0, 2);
    sceneCtrl.updateRows(activeRows);

    currentRenderCount = Math.min(s.count, 80);
    charFactory.setCount(crowdGroup, currentRenderCount);

    crowdCountEl.textContent = `${s.count} 人`;
    visibleCountEl.textContent = `${currentRenderCount} / 80 体`;
    elapsedTimeEl.textContent = `${s.time.toFixed(1)} 秒`;

    runEffects.reset();
    runEffects.update(s, 0);

    isReady = true;
    startButton.disabled = false;
    statusEl.textContent = "準備完了！スタートを押してください";
  } catch (err) {
    console.error(err);
    startButton.disabled = true;
    statusEl.textContent = `エラー: ${err.message || "モデルの読み込みに失敗しました"}`;
    return;
  }

  if (soundButton) {
    soundButton.addEventListener("click", () => {
      isMuted = !isMuted;
      soundButton.textContent = isMuted ? "音: OFF" : "音: ON";
      runEffects.setMuted(isMuted);
      if (!isMuted) {
        runEffects.unlockAudio();
      }
    });
  }

  function resetInputStates() {
    isDragging = false;
    if (activePointerId !== null) {
      try { canvas.releasePointerCapture(activePointerId); } catch (_) {}
      activePointerId = null;
    }
    keys["ArrowLeft"] = false;
    keys["ArrowRight"] = false;
  }

  function releasePointer(pid) {
    if (activePointerId === pid && activePointerId !== null) {
      try { canvas.releasePointerCapture(activePointerId); } catch (_) {}
      activePointerId = null;
    }
    isDragging = false;
  }

  function onPointerDown(e) {
    if (!isRunning || activePointerId !== null || runLogic.state.phase === "wall") return;
    activePointerId = e.pointerId;
    isDragging = true;
    dragStartX = e.clientX;
    dragBaseX = targetInputX;
    try { canvas.setPointerCapture(activePointerId); } catch (_) {}
  }

  function onPointerMove(e) {
    if (!isDragging || e.pointerId !== activePointerId || !isRunning || runLogic.state.phase === "wall") return;
    const dx = e.clientX - dragStartX;
    const rect = canvas.getBoundingClientRect();
    const scaleFactor = 324 / Math.max(1, rect.width);
    targetInputX = THREE.MathUtils.clamp(dragBaseX + dx * scaleFactor, 48, 372);
  }

  function onPointerUp(e) {
    if (e.pointerId === activePointerId) {
      releasePointer(e.pointerId);
    }
  }

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", (e) => releasePointer(e.pointerId));

  const keys = {};
  window.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      if (isRunning && runLogic.state.phase !== "wall") {
        e.preventDefault();
        keys[e.key] = true;
      }
    }
  });
  window.addEventListener("keyup", (e) => {
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      keys[e.key] = false;
    }
  });

  function handleBlurOrHidden() {
    isFocused = false;
    resetInputStates();
  }

  function handleFocusOrVisible() {
    isFocused = true;
    lastTime = performance.now();
  }

  window.addEventListener("blur", handleBlurOrHidden);
  window.addEventListener("focus", handleFocusOrVisible);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      handleBlurOrHidden();
    } else {
      handleFocusOrVisible();
    }
  });

  startButton.addEventListener("click", () => {
    if (!isReady) return;
    
    resetInputStates();
    runLogic.reset();
    runEffects.reset();

    // retryリセット時に全ての壁突撃遷移状態・攻撃者スロットを完全にリセット
    wallTransitionTimer = 0;
    isTransitioningToWall = false;
    effectTailTimer = 0;
    postGamePhase = null;

    attackerSlots.forEach(slot => {
      slot.active = false;
      slot.actor.visible = false;
    });

    const s = runLogic.state;
    s.phase = "run";
    s.count = 20;
    targetInputX = 210;
    inputX = 210;
    s.x = 210;

    if (crowdGroup) {
      const wx = sceneCtrl.worldXFromCore(s.x);
      const wz = sceneCtrl.worldZFromRow(480);
      crowdGroup.position.set(wx, 0, wz);
    }

    const renderCount = Math.min(s.count, 80);
    if (charFactory && crowdGroup) {
      if (renderCount !== currentRenderCount) {
        charFactory.setCount(crowdGroup, renderCount);
        currentRenderCount = renderCount;
      }
    }

    crowdCountEl.textContent = `${s.count} 人`;
    visibleCountEl.textContent = `${renderCount} / 80 体`;
    elapsedTimeEl.textContent = `${s.time.toFixed(1)} 秒`;
    statusEl.textContent = "ラン中！ (判定リングを避けよう)";

    const activeRows = s.rows.filter(r => !r.done && r.y >= -220).slice(0, 2);
    sceneCtrl.updateRows(activeRows);

    isRunning = true;
    lastTime = performance.now();
  });

  function spawnAttackerFromPool() {
    const freeSlot = attackerSlots.find(slot => !slot.active);
    if (!freeSlot || !crowdGroup) return;

    freeSlot.active = true;
    freeSlot.actor.visible = true;
    freeSlot.progress = 0;
    // 現在の群衆先頭位置からスタート
    freeSlot.startPos.copy(crowdGroup.position);
    freeSlot.targetPos.set((Math.random() - 0.5) * 1.5, 0, 3.2); // 壁z=3.2付近へ突撃
    freeSlot.actor.position.copy(freeSlot.startPos);
  }

  function updateAttackers(dt) {
    attackerPoolMixers.forEach(m => m.update(dt));
    attackerSlots.forEach(slot => {
      if (!slot.active) return;
      slot.progress += dt / 0.15; // 0.15秒で走らせる
      slot.actor.position.lerpVectors(slot.startPos, slot.targetPos, Math.min(1, slot.progress));
      if (slot.progress >= 1) {
        slot.active = false;
        slot.actor.visible = false;
      }
    });
  }

  function loop(timestamp) {
    requestAnimationFrame(loop);

    if (!lastTime) lastTime = timestamp;
    let dt = (timestamp - lastTime) / 1000;
    lastTime = timestamp;

    if (dt > 0.05) dt = 0.05;

    if (!isReady || !isFocused || document.hidden) {
      if (sceneCtrl) {
        sceneCtrl.render();
      }
      return;
    }

    const s = runLogic.state;

    if (!isRunning) {
      // 終了後effectTail（1.2秒）の処理
      if (postGamePhase && effectTailTimer > 0) {
        effectTailTimer -= dt;
        if (runEffects) runEffects.update(s, dt);
        updateAttackers(dt);
        if (charFactory) charFactory.update(dt);
        sceneCtrl.update(dt);
        sceneCtrl.render();
      } else {
        if (sceneCtrl && runEffects && runLogic) {
          runEffects.update(s, 0);
          sceneCtrl.render();
        }
      }
      return;
    }

    if (!Number.isFinite(dt) || dt <= 0) dt = 0.016;

    // wall中は入力を無効化し s.x = 210
    if (s.phase === "wall") {
      targetInputX = 210;
      inputX = 210;
      s.x = 210;
      keys["ArrowLeft"] = false;
      keys["ArrowRight"] = false;
    } else {
      if (keys["ArrowLeft"]) targetInputX -= 150 * dt;
      if (keys["ArrowRight"]) targetInputX += 150 * dt;
      targetInputX = THREE.MathUtils.clamp(targetInputX, 48, 372);
      inputX += (targetInputX - inputX) * Math.min(1, 15 * dt);
      s.x = inputX;
    }

    // 壁突撃遷移中の処理 (20秒の wall_start で約0.25秒かけて z7 → 4.3 へ移動)
    if (isTransitioningToWall) {
      wallTransitionTimer += dt;
      const t = Math.min(1, wallTransitionTimer / 0.25);
      // 遷移後の群衆xは0を維持
      const currentX = THREE.MathUtils.lerp(sceneCtrl.worldXFromCore(s.x), 0, t);
      const currentZ = THREE.MathUtils.lerp(7, 4.3, t);
      if (crowdGroup) {
        crowdGroup.position.set(currentX, 0, currentZ);
      }
      if (t >= 1) {
        isTransitioningToWall = false;
      }
    } else {
      runLogic.step(dt, inputX);
    }

    const events = runLogic.drainEvents();
    events.forEach(ev => {
      if (ev.type === "wall_start") {
        isTransitioningToWall = true;
        wallTransitionTimer = 0;
      }
      if (ev.type === "wall_hit") {
        spawnAttackerFromPool();
      }
    });

    // 順序厳守: effects.update(s, dt) -> handleEvents(events)
    runEffects.update(s, dt);
    runEffects.handleEvents(events);

    sceneCtrl.update(dt);
    charFactory.update(dt);
    updateAttackers(dt);

    if (crowdGroup && !isTransitioningToWall) {
      const wx = sceneCtrl.worldXFromCore(s.x);
      const wz = sceneCtrl.worldZFromRow(480);
      // s.phase=gameoverがrun途中ならz7維持、壁戦後だけ4.3
      const finalZ = (s.phase === "wall" || s.phase === "win" || (s.phase === "gameover" && s.time >= 20)) ? 4.3 : wz;
      // 壁戦以降は群衆xも0を維持
      const finalX = (s.phase === "wall" || s.phase === "win" || (s.phase === "gameover" && s.time >= 20)) ? 0 : wx;
      crowdGroup.position.set(finalX, 0, finalZ);
    }

    const actualCount = s.count;
    const renderCount = Math.min(actualCount, 80);
    crowdCountEl.textContent = `${actualCount} 人`;
    visibleCountEl.textContent = `${renderCount} / 80 体`;
    elapsedTimeEl.textContent = `${s.time.toFixed(1)} 秒`;

    if (renderCount !== currentRenderCount) {
      charFactory.setCount(crowdGroup, renderCount);
      currentRenderCount = renderCount;
    }

    const activeRows = s.rows.filter(r => !r.done && r.y >= -220).slice(0, 2);
    sceneCtrl.updateRows(activeRows);

    // HUD説明の切り替え
    if (s.phase === "run") {
      statusEl.textContent = "ラン中！ 障害物の判定リングを避けよう";
    } else if (s.phase === "wall") {
      statusEl.textContent = `壁決戦中！ 壁HP: ${Math.ceil(s.wallHP)}`;
    }

    if (s.phase === "win" || s.phase === "gameover") {
      isRunning = false;
      postGamePhase = s.phase;
      effectTailTimer = 1.2; // 1.2秒間余韻を流す
      if (s.phase === "win") {
        statusEl.textContent = `勝利！ 記録: ${s.time.toFixed(1)}秒 (残り人数: ${s.count}) 🎉`;
      } else {
        statusEl.textContent = `ゲームオーバー (人数: ${s.count}, 壁HP: ${Math.ceil(s.wallHP)})`;
      }
    }

    sceneCtrl.render();
  }

  requestAnimationFrame((ts) => {
    lastTime = ts;
    requestAnimationFrame(loop);
  });
})();