// The squad's shared knowledge of the enemy — deliberately separate from
// ground truth so the player (who sees everything) can watch what the squad
// actually knows.
//
// Contact levels per enemy:
//   known      — some living friendly currently sees it (precise, targetable)
//   last-known — previously seen, LOS lost; position is where it was last seen
//   (absent)   — never seen, or last-known went stale
//
// Suspicions are directional/region warnings ("contacts to the SE") from the
// player or from taking fire from an unseen shooter. Units orient and posture
// on suspicions but cannot target them.

import { CONFIG } from "../config.js";
import { COMPASS, compassName, angleTo } from "./LOS.js";
import { logEvent } from "../debug/log.js";

export class Awareness {
  constructor(world) {
    this.world = world;
    this.contacts = new Map(); // enemyId -> {level, pos, lastSeen, seenBy, reported}
    this.suspicions = [];      // {angle, grid, pos, strength, source, createdAt}
    this.time = 0;
  }

  update(dt, friendlies, enemies) {
    this.time += dt;

    for (const enemy of enemies) {
      const seer = enemy.alive
        ? friendlies.find((f) => f.alive && f.seesUnit(enemy, this.world.walls))
        : null;
      const existing = this.contacts.get(enemy.id);

      if (seer) {
        const isNew = !existing || existing.level !== "known";
        this.contacts.set(enemy.id, {
          level: "known",
          pos: { ...enemy.pos },
          lastSeen: this.time,
          seenBy: seer.id,
          reported: existing?.reported ?? false,
          firstSpotted: isNew && !existing,
        });
      } else if (existing && existing.level === "known") {
        existing.level = "last-known";
        if (!enemy.alive) this.contacts.delete(enemy.id); // saw it die
      } else if (existing && existing.level === "last-known") {
        if (this.time - existing.lastSeen > CONFIG.LAST_KNOWN_STALE) {
          this.contacts.delete(enemy.id);
          logEvent("ACTION", `Contact ${enemy.id} lost (last-known info stale)`);
        }
      }
    }

    this.suspicions = this.suspicions.filter(
      (s) => this.time - s.createdAt < CONFIG.SUSPICION_FADE
    );
  }

  // Player alert: direction ("SE") and/or grid ("D7"). Squad centroid anchors
  // directional wedges.
  addAlert({ direction, grid, source }, friendlies) {
    const alive = friendlies.filter((f) => f.alive);
    if (!alive.length) return null;
    const centroid = {
      x: alive.reduce((s, f) => s + f.pos.x, 0) / alive.length,
      y: alive.reduce((s, f) => s + f.pos.y, 0) / alive.length,
    };
    const suspicion = {
      angle: direction ? COMPASS[direction] : null,
      grid: grid || null,
      pos: grid ? this.world.gridToWorld(grid) : null,
      origin: centroid,
      strength: 1,
      source: source || "player",
      createdAt: this.time,
    };
    this.suspicions.push(suspicion);
    logEvent("ACTION", `Squad alerted: threat ${direction ? `to the ${direction}` : ""}${grid ? ` at ${grid}` : ""}`.trim(), {
      data: { direction, grid, source: suspicion.source },
    });
    return suspicion;
  }

  // Taking fire from somewhere we can't see -> suspicion toward the shot
  addUnseenFireSuspicion(victimPos, tracerFrom) {
    const angle = angleTo(victimPos, tracerFrom);
    this.suspicions.push({
      angle,
      grid: null,
      pos: null,
      origin: { ...victimPos },
      strength: 1,
      source: "taking-fire",
      createdAt: this.time,
    });
    logEvent("ACTION", `Taking fire from unseen shooter, bearing ${compassName(angle)}`);
  }

  knownEnemies(enemies) {
    return enemies.filter(
      (e) => e.alive && this.contacts.get(e.id)?.level === "known"
    );
  }

  // Best current threat direction for a unit at pos: nearest known contact,
  // else nearest last-known, else strongest suspicion. Null if quiet.
  threatDirectionFor(pos) {
    let best = null;
    let bestD = Infinity;
    for (const c of this.contacts.values()) {
      const d = Math.hypot(c.pos.x - pos.x, c.pos.y - pos.y);
      const weight = c.level === "known" ? d : d * 3; // prefer live contacts
      if (weight < bestD) {
        bestD = weight;
        best = angleTo(pos, c.pos);
      }
    }
    if (best !== null) return best;
    for (const s of this.suspicions) {
      if (s.angle !== null) return s.angle;
      if (s.pos) return angleTo(pos, s.pos);
    }
    return null;
  }

  // A reference threat *position* for cover-seeking (cover needs a point, not
  // just a bearing). Synthesizes a point for directional suspicions.
  threatPositionFor(pos) {
    let best = null;
    let bestD = Infinity;
    for (const c of this.contacts.values()) {
      const d = Math.hypot(c.pos.x - pos.x, c.pos.y - pos.y);
      const weight = c.level === "known" ? d : d * 3;
      if (weight < bestD) {
        bestD = weight;
        best = c.pos;
      }
    }
    if (best) return best;
    for (const s of this.suspicions) {
      if (s.pos) return s.pos;
      if (s.angle !== null) {
        return {
          x: pos.x + Math.cos(s.angle) * 200,
          y: pos.y + Math.sin(s.angle) * 200,
        };
      }
    }
    return null;
  }

  get hasAnyThreat() {
    return this.contacts.size > 0 || this.suspicions.length > 0;
  }
}
