// Precision airstrikes: cooldown-gated, delayed impact, radial kill
// probability, friendly fire very much enabled. Ignores LOS.

import { CONFIG } from "../config.js";
import { dist } from "./LOS.js";
import { logEvent } from "../debug/log.js";

export class AirstrikeController {
  constructor(world) {
    this.world = world;
    this.cooldown = 0;          // s until next strike is available
    this.pending = [];          // {pos, grid, timer, traceId}
    this.explosions = [];       // {pos, age, radius} for rendering
  }

  get ready() {
    return this.cooldown <= 0;
  }

  // Returns an acknowledgment string (spoken by "Overlord", the air asset).
  call(grid, traceId) {
    const pos = this.world.gridToWorld(grid);
    if (!pos) return { ok: false, text: `Negative, no such grid ${grid}.` };
    if (!this.ready) {
      const t = Math.ceil(this.cooldown);
      logEvent("COMMAND", `Airstrike on ${grid} denied — ${t}s cooldown remaining`, { traceId, error: "cooldown" });
      return { ok: false, text: `Negative, air support reloading. ${t} seconds.` };
    }
    this.cooldown = CONFIG.STRIKE_COOLDOWN;
    this.pending.push({ pos, grid, timer: CONFIG.STRIKE_DELAY, traceId });
    logEvent("COMMAND", `Airstrike called on ${grid}, impact in ${CONFIG.STRIKE_DELAY}s`, {
      traceId, data: { grid, delaySeconds: CONFIG.STRIKE_DELAY },
    });
    return { ok: true, text: `Copy, ordnance inbound on ${grid.split("").join(" ")}. ${CONFIG.STRIKE_DELAY} seconds. Heads down.` };
  }

  update(dt, allUnits) {
    this.cooldown = Math.max(0, this.cooldown - dt);

    for (const s of this.pending) {
      s.timer -= dt;
      if (s.timer <= 0) this._detonate(s, allUnits);
    }
    this.pending = this.pending.filter((s) => s.timer > 0);

    for (const ex of this.explosions) ex.age += dt;
    this.explosions = this.explosions.filter((ex) => ex.age < 0.8);
  }

  _detonate(strike, allUnits) {
    this.explosions.push({ pos: strike.pos, age: 0, radius: CONFIG.STRIKE_RADIUS });
    const kills = [];
    for (const u of allUnits) {
      if (!u.alive) continue;
      const d = dist(u.pos, strike.pos);
      if (d > CONFIG.STRIKE_RADIUS) continue;
      const p = CONFIG.STRIKE_KILL_CENTER +
        (CONFIG.STRIKE_KILL_EDGE - CONFIG.STRIKE_KILL_CENTER) * (d / CONFIG.STRIKE_RADIUS);
      if (Math.random() < p) {
        u.kill();
        kills.push(u.id);
      }
    }
    logEvent("ACTION", `Airstrike impact at ${strike.grid} — ${kills.length ? "killed " + kills.join(", ") : "no casualties"}`, {
      traceId: strike.traceId,
      data: { grid: strike.grid, kills },
    });
  }
}
