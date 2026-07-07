// Enemy behavior: patrol -> alert (heard something) -> engage (sees squad).
// Enemies use the same vision/LOS/cover/combat systems as friendlies.

import { CONFIG } from "../config.js";
import { angleTo, dist, COMPASS } from "./LOS.js";
import { logEvent } from "../debug/log.js";

export class EnemyAI {
  constructor(world, enemies, combat) {
    this.world = world;
    this.enemies = enemies;
    this.combat = combat;

    for (const e of this.enemies) {
      const def = e.ai.def; // set by Game when spawning
      e.ai.state = "patrol";
      e.ai.patrol = (def.patrol || []).map((g) => world.gridToWorld(g));
      e.ai.patrolIdx = 0;
      e.ai.pause = Math.random() * 2;
      e.ai.lastKnown = null;
      e.ai.lastKnownAge = 0;
      e.ai.coverPoint = null;
      if (def.facing) e.watchHeading = COMPASS[def.facing];
    }
  }

  update(dt, friendlies) {
    const living = friendlies.filter((f) => f.alive);

    for (const e of this.enemies) {
      if (!e.alive) continue;
      const ai = e.ai;

      // Perception
      const visible = living.filter((f) => e.seesUnit(f, this.world.walls));
      if (visible.length) {
        const target = visible.sort((a, b) => dist(e.pos, a.pos) - dist(e.pos, b.pos))[0];
        ai.lastKnown = { ...target.pos };
        ai.lastKnownAge = 0;
        if (ai.state !== "engage") {
          ai.state = "engage";
          logEvent("GAME", `${e.id} spotted ${target.id} — engaging`, {
            data: { enemy: e.id, target: target.id, grid: this.world.worldToGrid(target.pos) },
          });
        }
        this._engage(e, target, dt);
        continue;
      }

      // Hearing gunfire
      if (ai.state === "patrol") {
        const noise = this.combat.noises.find((n) => dist(e.pos, n.pos) < CONFIG.GUNFIRE_ALERT_RADIUS);
        if (noise) {
          ai.state = "alert";
          ai.lastKnown = { ...noise.pos };
          ai.lastKnownAge = 0;
          e.stop();
          e.watchHeading = angleTo(e.pos, noise.pos);
          logEvent("GAME", `${e.id} heard gunfire, investigating ${this.world.worldToGrid(noise.pos)}`);
        }
      }

      if (ai.lastKnown) ai.lastKnownAge += dt;

      switch (ai.state) {
        case "engage":
        case "alert": {
          e.firing = false;
          // Lost visual: push toward last known position, then give up
          if (ai.lastKnown && ai.lastKnownAge > 1.5 && !e.moving) {
            if (dist(e.pos, ai.lastKnown) > 30) {
              const path = this.world.findPath(e.pos, ai.lastKnown);
              if (path) e.setPath(path, ai.lastKnown);
            } else if (ai.lastKnownAge > 8) {
              ai.state = "patrol";
              ai.lastKnown = null;
              logEvent("GAME", `${e.id} lost the trail, resuming patrol`);
            }
          }
          break;
        }

        case "patrol": {
          e.firing = false;
          if (!ai.patrol.length) break; // static guard
          if (!e.moving) {
            ai.pause -= dt;
            if (ai.pause <= 0) {
              ai.pause = 1 + Math.random() * 2;
              ai.patrolIdx = (ai.patrolIdx + 1) % ai.patrol.length;
              const path = this.world.findPath(e.pos, ai.patrol[ai.patrolIdx]);
              if (path) e.setPath(path, ai.patrol[ai.patrolIdx]);
            }
          }
          break;
        }
      }
    }
  }

  _engage(e, target, dt) {
    e.firing = true;
    this.combat.tryFire(e, target);

    // Seek cover against the target if exposed
    if (!e.moving && !this.world.inCoverFrom(e.pos, target.pos)) {
      const occupied = this.enemies.filter((o) => o.alive && o !== e).map((o) => o.ai.coverPoint ?? o.pos);
      const cp = this.world.findCover(e.pos, target.pos, occupied);
      if (cp) {
        const path = this.world.findPath(e.pos, cp);
        if (path) {
          e.setPath(path, cp);
          e.ai.coverPoint = cp;
        }
      }
    }
  }
}
