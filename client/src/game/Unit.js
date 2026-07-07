// A soldier (friendly or enemy). Mechanical layer only: movement along a
// path, turning, vision checks, fire cooldown. Decisions live in SquadAI /
// EnemyAI.

import { CONFIG } from "../config.js";
import { angleTo, canSee, dist, normalizeAngle } from "./LOS.js";

export class Unit {
  constructor(id, side, pos, heading = 0) {
    this.id = id;
    this.side = side; // "friendly" | "enemy"
    this.pos = { ...pos };
    this.heading = heading;
    this.speed = CONFIG.UNIT_SPEED;
    this.alive = true;

    this.path = null;         // remaining waypoints
    this.moveGoal = null;     // final destination (for rendering)
    this.watchHeading = null; // where to face when stationary
    this.fireCooldown = 0;
    this.firing = false;      // engaged a target this tick (renderer hint)

    // AI bookkeeping (used by SquadAI/EnemyAI)
    this.ai = {};
  }

  get moving() {
    return this.alive && this.path && this.path.length > 0;
  }

  setPath(path, goal) {
    this.path = path && path.length ? [...path] : null;
    this.moveGoal = this.path ? { ...(goal ?? path[path.length - 1]) } : null;
  }

  stop() {
    this.path = null;
    this.moveGoal = null;
  }

  kill() {
    this.alive = false;
    this.stop();
    this.firing = false;
  }

  update(dt) {
    if (!this.alive) return;
    this.fireCooldown = Math.max(0, this.fireCooldown - dt);

    if (this.moving) {
      const wp = this.path[0];
      const d = dist(this.pos, wp);
      const desired = angleTo(this.pos, wp);
      this._turnToward(desired, dt);
      const step = this.speed * dt;
      if (d <= step) {
        this.pos = { ...wp };
        this.path.shift();
        if (this.path.length === 0) {
          this.path = null;
          this.moveGoal = null;
        }
      } else {
        this.pos.x += Math.cos(desired) * step;
        this.pos.y += Math.sin(desired) * step;
      }
    } else if (this.watchHeading !== null) {
      this._turnToward(this.watchHeading, dt);
    }
  }

  _turnToward(target, dt) {
    const diff = normalizeAngle(target - this.heading);
    const maxTurn = CONFIG.TURN_SPEED * dt;
    if (Math.abs(diff) <= maxTurn) this.heading = target;
    else this.heading += Math.sign(diff) * maxTurn;
    this.heading = normalizeAngle(this.heading);
  }

  seesPoint(p, walls) {
    return canSee(this, p, CONFIG.VISION_RANGE, CONFIG.VISION_ANGLE / 2, walls);
  }

  seesUnit(other, walls) {
    return other.alive && this.seesPoint(other.pos, walls);
  }
}
