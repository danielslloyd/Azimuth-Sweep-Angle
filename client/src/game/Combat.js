// Fire resolution: probabilistic one-hit-kill shots with distance falloff
// and cover. Emits tracers (for rendering) and gunfire noise events (for
// enemy hearing).

import { CONFIG } from "../config.js";
import { angleTo, dist, hasLOS } from "./LOS.js";
import { logEvent } from "../debug/log.js";

export class Combat {
  constructor(world) {
    this.world = world;
    this.tracers = []; // {from, to, hit, ttl}
    this.noises = [];  // {pos, ttl} gunfire this tick, consumed by EnemyAI
    this.onShot = null; // ({shooter, target, hit}) => void
  }

  canEngage(shooter, target) {
    if (!shooter.alive || !target.alive) return false;
    if (dist(shooter.pos, target.pos) > CONFIG.FIRE_RANGE) return false;
    return hasLOS(shooter.pos, target.pos, this.world.walls);
  }

  // Attempt a shot; respects the shooter's cooldown. Returns true if fired.
  tryFire(shooter, target) {
    if (shooter.fireCooldown > 0 || !this.canEngage(shooter, target)) return false;

    shooter.fireCooldown = CONFIG.FIRE_COOLDOWN * (0.8 + Math.random() * 0.4);
    shooter.watchHeading = angleTo(shooter.pos, target.pos);

    const d = dist(shooter.pos, target.pos);
    let p = CONFIG.HIT_BASE + (CONFIG.HIT_MIN - CONFIG.HIT_BASE) * (d / CONFIG.FIRE_RANGE);
    const targetInCover = this.world.inCoverFrom(target.pos, shooter.pos);
    if (targetInCover) p *= CONFIG.COVER_MULTIPLIER;
    if (shooter.moving) p *= CONFIG.MOVING_SHOOTER_MULT;

    const hit = Math.random() < p;
    // Miss tracers land near the target, not on it
    const to = hit
      ? { ...target.pos }
      : {
          x: target.pos.x + (Math.random() - 0.5) * 30,
          y: target.pos.y + (Math.random() - 0.5) * 30,
        };
    this.tracers.push({ from: { ...shooter.pos }, to, hit, ttl: CONFIG.TRACER_LIFETIME });
    this.noises.push({ pos: { ...shooter.pos }, ttl: 0.5 });
    if (this.onShot) this.onShot({ shooter, target, hit });

    if (hit) {
      target.kill();
      logEvent("ACTION", `${shooter.id} killed ${target.id} at ${this.world.worldToGrid(target.pos)}`, {
        data: { shooter: shooter.id, target: target.id, distance: Math.round(d), hitProb: +p.toFixed(2), targetInCover },
      });
    }
    return true;
  }

  update(dt) {
    for (const t of this.tracers) t.ttl -= dt;
    this.tracers = this.tracers.filter((t) => t.ttl > 0);
    for (const n of this.noises) n.ttl -= dt;
    this.noises = this.noises.filter((n) => n.ttl > 0);
  }
}
