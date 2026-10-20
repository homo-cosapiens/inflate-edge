import * as THREE from "three";
import { createScene3D } from "./scene3d.js";
import { createCharacterFactory } from "./characterFactory.js";

(async function () {
  const canvas = document.getElementById("playCanvas");
  const statusEl = document.getElementById("status");
  const crowdCountEl = document.getElementById("crowdCount");
  const visibleCountEl = document.getElementById("visibleCount");
  const elapsedTimeEl = document.getElementById("elapsedTime");
  const startButton = document.getElementById("startButton");

  startButton.disabled = true;

  let sceneCtrl = null;
  let charFactory = null;
  let crowdGroup = null;

  let isReady = false;
  let isRunning = false;
  let isFocused = true;
  let lastTime = 0;

  let inputX = 210;
  let targetInputX = 210;
  let activePointerId = null;
  let isDragging = false;
  let dragStartX = 0;
  let dragBaseX = 210;
  let currentRenderCount = -1;

  try {
    sceneCtrl = createScene3D(canvas);
    
    // カメラ位置・注視点の調整: 後方上空から縦画角46°で群衆全体と先2ゲートを確実に収める
    sceneCtrl.camera.position.set(0, 15, 23);
    sceneCtrl.camera.lookAt(0, 0, 0);

    statusEl.textContent = "モデル読み込み中…";
    charFactory = await createCharacterFactory({ url: "./assets/character-male-e.glb", maxCount: 80 });
    
    crowdGroup = charFactory.createCrowd(20);
    sceneCtrl.scene.add(crowdGroup);

    // 初期readyで群衆をz7に置き、core.resetしてゲートとHUDを表示
    window.CrowdCore.reset();
    const s = window.CrowdCore.state;
    s.phase = "ready";
    s.count = 20;
    targetInputX = 210;
    inputX = 210;
    s.x = 210;

    const wx = sceneCtrl.worldXFromCore(s.x);
    const wz = sceneCtrl.worldZFromRow(480); // = 7
    crowdGroup.position.set(wx, 0, wz);

    sceneCtrl.updateRows(s.rows);
    currentRenderCount = Math.min(s.count, 80);
    charFactory.setCount(crowdGroup, currentRenderCount);

    crowdCountEl.textContent = `${s.count} 人`;
    visibleCountEl.textContent = `${currentRenderCount} / 80体`;
    elapsedTimeEl.textContent = `${s.time.toFixed(1)} 秒`;

    isReady = true;
    startButton.disabled = false;
    statusEl.textContent = "準備完了！スタートを押してください";
  } catch (err) {
    console.error(err);
    startButton.disabled = true;
    statusEl.textContent = `エラー: ${err.message || "モデルの読み込みに失敗しました"}`;
    return;
  }

  // 入力リセット処理
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
    if (!isRunning || activePointerId !== null) return;
    activePointerId = e.pointerId;
    isDragging = true;
    dragStartX = e.clientX;
    dragBaseX = targetInputX;
    try { canvas.setPointerCapture(activePointerId); } catch (_) {}
  }

  function onPointerMove(e) {
    if (!isDragging || e.pointerId !== activePointerId || !isRunning) return;
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
      if (isRunning) {
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

  // blur/hidden で進行停止
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

  // スタート / リトライボタン
  startButton.addEventListener("click", () => {
    if (!isReady) return;
    
    // リスタート時はpointer/keys解除、即群衆positionとHUDをreset
    resetInputStates();

    window.CrowdCore.reset();
    const s = window.CrowdCore.state;
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
    visibleCountEl.textContent = `${renderCount} / 80体`;
    elapsedTimeEl.textContent = `${s.time.toFixed(1)} 秒`;

    sceneCtrl.updateRows(s.rows);

    isRunning = true;
    statusEl.textContent = "ラン中！";
    lastTime = performance.now();
  });

  // メインループ (1RAF)
  function loop(timestamp) {
    requestAnimationFrame(loop);

    if (!lastTime) lastTime = timestamp;
    let dt = (timestamp - lastTime) / 1000;
    lastTime = timestamp;

    if (dt > 0.05) dt = 0.05;

    if (!isReady || !isRunning || !isFocused || document.hidden) {
      if (sceneCtrl) {
        sceneCtrl.render();
      }
      return;
    }

    if (!Number.isFinite(dt) || dt <= 0) dt = 0.016;

    if (keys["ArrowLeft"]) targetInputX -= 150 * dt;
    if (keys["ArrowRight"]) targetInputX += 150 * dt;
    targetInputX = THREE.MathUtils.clamp(targetInputX, 48, 372);
    
    inputX += (targetInputX - inputX) * Math.min(1, 15 * dt);

    const s = window.CrowdCore.state;
    s.x = inputX;

    window.CrowdCore.step(dt);

    sceneCtrl.updateRows(s.rows);
    sceneCtrl.update(dt);
    charFactory.update(dt);

    if (crowdGroup) {
      const wx = sceneCtrl.worldXFromCore(s.x);
      const wz = sceneCtrl.worldZFromRow(480);
      crowdGroup.position.set(wx, 0, wz);

      const actualCount = s.count;
      const renderCount = Math.min(actualCount, 80);
      crowdCountEl.textContent = `${actualCount} 人`;
      visibleCountEl.textContent = `${renderCount} / 80体`;
      elapsedTimeEl.textContent = `${s.time.toFixed(1)} 秒`;

      if (renderCount !== currentRenderCount) {
        charFactory.setCount(crowdGroup, renderCount);
        currentRenderCount = renderCount;
      }
    }

    const allDone = s.rows.length > 0 && s.rows.every(r => r.done);
    if (allDone && s.phase === "run") {
      s.phase = "done";
      isRunning = false;
      statusEl.textContent = `ゴール！ 記録: ${s.time.toFixed(1)}秒 (人数: ${s.count})`;
    }

    sceneCtrl.render();
  }

  requestAnimationFrame((ts) => {
    lastTime = ts;
    requestAnimationFrame(loop);
  });
})();