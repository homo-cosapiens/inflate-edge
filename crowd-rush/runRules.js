export function createRun() {
  const state = {
    time: 0,
    phase: "ready",
    count: 20,
    x: 210,
    rows: [],
    hazards: [],
    wallHP: 0,
    enemyMaxHP: 0,
    flash: 0,
    events: [],
    playerRadius: 0.6,
    hazardRadius: 0.55
  };

  let wallAccumulator = 0;

  function pushEvent(type, detail = {}) {
    state.events.push({ type, time: state.time, ...detail });
  }

  function drainEvents() {
    const evs = state.events;
    state.events = [];
    return evs;
  }

  function reset() {
    state.time = 0;
    state.phase = "run";
    state.count = 20;
    state.x = 210;
    state.flash = 0;
    state.events = [];
    state.wallHP = 300;
    state.enemyMaxHP = 300;
    state.rows = [];
    state.hazards = [];
    wallAccumulator = 0;

    // 6行のゲート設定：×側を交互に配置（偶数行：右が×、奇数行：左が×）
    // 看板と判定が完全一致するように leftOp/rightOp を保持
    const gateData = [
      { add: 15, mul: 2, side: "right" }, // i = 0 (偶数): 右が×
      { add: 20, mul: 2, side: "left" },  // i = 1 (奇数): 左が×
      { add: 10, mul: 3, side: "right" }, // i = 2 (偶数): 右が×
      { add: 25, mul: 2, side: "left" },  // i = 3 (奇数): 左が×
      { add: 15, mul: 3, side: "right" }, // i = 4 (偶数): 右が×
      { add: 30, mul: 2, side: "left" }   // i = 5 (奇数): 左が×
    ];

    gateData.forEach((v, i) => {
      const rowY = 480 - 55 * (3 + 3 * i);
      const isRightMul = v.side === "right";
      
      const leftLabel = isRightMul ? `+${v.add}` : `×${v.mul}`;
      const rightLabel = isRightMul ? `×${v.mul}` : `+${v.add}`;
      
      const leftOp = isRightMul ? { type: "add", value: v.add } : { type: "mul", value: v.mul };
      const rightOp = isRightMul ? { type: "mul", value: v.mul } : { type: "add", value: v.add };

      state.rows.push({
        id: i,
        y: rowY,
        left: leftLabel,
        right: rightLabel,
        leftOp,
        rightOp,
        done: false
      });

      // hazardXは各行の×側中心に配置
      // 左ゲート中心: x = 115.5 (worldX = -3.15), 右ゲート中心: x = 304.5 (worldX = 3.15)
      const hazardXCoord = isRightMul ? 304.5 : 115.5;
      const hazardY = rowY - 82.5;

      state.hazards.push({
        id: i,
        y: hazardY,
        x: hazardXCoord,
        radius: 0.55,
        active: true
      });
    });
  }

  function step(dt, inputX) {
    if (state.phase !== "run" && state.phase !== "wall") return;
    if (!Number.isFinite(dt) || dt <= 0) return;

    const clampedDt = Math.min(dt, 0.05);
    state.time = Math.min(25, state.time + clampedDt);
    if (state.flash > 0) state.flash = Math.max(0, state.flash - clampedDt);

    if (typeof inputX === "number" && Number.isFinite(inputX)) {
      state.x = Math.max(48, Math.min(372, inputX));
    }

    if (state.phase === "run") {
      state.rows.forEach(r => {
        r.y += 55 * clampedDt;
        if (!r.done && r.y >= 480) {
          r.done = true;
          const wx = (state.x - 210) / 30;
          const leftMin = -3.15 - 1.12;
          const leftMax = -3.15 + 1.12;
          const rightMin = 3.15 - 1.12;
          const rightMax = 3.15 + 1.12;

          let chosenOp = null;
          let chosenSide = "";

          if (wx >= leftMin && wx <= leftMax) {
            chosenOp = r.leftOp;
            chosenSide = "left";
          } else if (wx >= rightMin && wx <= rightMax) {
            chosenOp = r.rightOp;
            chosenSide = "right";
          }

          if (chosenOp) {
            if (chosenOp.type === "add") {
              state.count += chosenOp.value;
              pushEvent("gain", { operation: "add", side: chosenSide, value: chosenOp.value, count: state.count });
            } else {
              state.count *= chosenOp.value;
              pushEvent("gain", { operation: "mul", side: chosenSide, value: chosenOp.value, count: state.count });
            }
          } else {
            pushEvent("miss", { count: state.count });
          }
        }
      });

      state.hazards.forEach(h => {
        h.y += 55 * clampedDt;
        if (h.active) {
          const dx = (state.x - h.x) / 30;
          const dz = (h.y - 480) * 0.05;
          const dist = Math.hypot(dx, dz);
          if (dist <= state.playerRadius + h.radius) {
            h.active = false;
            // 被弾は人数の60%切上げ損失
            const loss = Math.min(state.count, Math.ceil(state.count * 0.6));
            state.count = Math.max(0, state.count - loss);
            state.flash = 0.3;
            pushEvent("loss", { loss, count: state.count });
            if (state.count <= 0) {
              state.phase = "gameover";
              pushEvent("gameover", { count: state.count, time: state.time });
              return;
            }
          }
        }
      });

      if (state.time >= 20) {
        state.phase = "wall";
        pushEvent("wall_start", { count: state.count });
      }
    } else if (state.phase === "wall") {
      wallAccumulator += clampedDt;
      while (wallAccumulator >= 0.1 && state.wallHP > 0 && state.count > 0) {
        wallAccumulator -= 0.1;
        // 壁消費は0.1秒ごと10人と同量HP
        const consume = Math.min(10, state.count, Math.ceil(state.wallHP));
        state.count = Math.max(0, state.count - consume);
        state.wallHP = Math.max(0, state.wallHP - consume);
        pushEvent("wall_hit", { count: state.count, wallHP: state.wallHP, consumed: consume });
      }

      if (state.wallHP <= 0) {
        state.phase = "win";
        pushEvent("win", { count: state.count, time: state.time });
      } else if (state.count <= 0) {
        state.phase = "gameover";
        pushEvent("gameover", { count: state.count, time: state.time });
      } else if (state.time >= 25) {
        if (state.wallHP <= 0) {
          state.phase = "win";
          pushEvent("win", { count: state.count, time: state.time });
        } else {
          state.phase = "gameover";
          pushEvent("gameover", { count: state.count, time: state.time });
        }
      }
    }
  }

  return {
    state,
    reset,
    step,
    drainEvents
  };
}