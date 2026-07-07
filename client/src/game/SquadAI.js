// Squad-level AI: executes player orders and fills the gaps with autonomy —
// bounding toward the mission goal, reporting contacts, engaging, and
// seeking cover facing known/suspected threats.
//
// Per-unit order state lives in unit.ai:
//   order: "none" | "move" (explicit player move, in progress) | "hold"
//   holdPos: anchor when holding (cover-seek stays near it)
//   boundTimer: pause before next autonomous bound
//   coverPoint: cover position this unit claimed

import { CONFIG } from "../config.js";
import { angleTo, dist, compassName } from "./LOS.js";
import { logEvent } from "../debug/log.js";

const ACKS = {
  move: ["Copy, moving to {grid}.", "Roger, heading to {grid}.", "On our way to {grid}."],
  advance: ["Copy, moving out.", "Roger, advancing on the objective.", "Pushing up."],
  hold: ["Roger, holding position.", "Copy, holding.", "Holding here."],
  engage: ["Weapons free, engaging.", "Copy, engaging.", "Roger, opening fire."],
  cease_fire: ["Copy, holding fire.", "Ceasing fire.", "Weapons hold, roger."],
  alert: ["Copy, watching the {direction}.", "Roger, eyes {direction}.", "Understood, threat from the {direction}."],
  set_goal: ["Copy, new objective: {goal}.", "Roger, objective updated."],
};

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export class SquadAI {
  constructor(world, units, awareness, combat, say) {
    this.world = world;
    this.units = units; // friendly units
    this.awareness = awareness;
    this.combat = combat;
    this.say = say; // (speakerId, text, traceId) -> TTS + SQUAD log

    this.goal = { ...world.map.goal };
    this.goalPos = world.gridToWorld(this.goal.grid);
    this.stance = "hold"; // "hold" until the player says to move out
    this.weapons = "free";

    for (const u of this.units) {
      u.ai = { order: "none", holdPos: { ...u.pos }, boundTimer: 1 + Math.random() * 2, coverPoint: null };
      u.watchHeading = u.heading;
    }
  }

  aliveUnits() {
    return this.units.filter((u) => u.alive);
  }

  resolveUnits(names) {
    if (!names || names.includes("all")) return this.aliveUnits();
    return this.aliveUnits().filter((u) => names.includes(u.id));
  }

  // ---- Command execution (returns spoken acknowledgment) -------------------

  applyCommand(cmd, traceId) {
    const targets = this.resolveUnits(cmd.units);
    const speaker = targets[0] ?? this.aliveUnits()[0];
    if (!speaker) {
      logEvent("COMMAND", "No living units to execute command", { traceId, error: "squad wiped" });
      return;
    }

    switch (cmd.intent) {
      case "move": {
        const center = this.world.gridToWorld(cmd.grid);
        if (!center) {
          this.say(speaker.id, `Negative, can't find grid ${cmd.grid}.`, traceId);
          return;
        }
        const offsets = [
          { x: 0, y: 0 }, { x: 20, y: -20 }, { x: -20, y: 20 }, { x: 20, y: 20 },
        ];
        targets.forEach((u, i) => {
          const dest = this.world.clampToWorld({
            x: center.x + offsets[i % offsets.length].x,
            y: center.y + offsets[i % offsets.length].y,
          });
          const path = this.world.findPath(u.pos, dest);
          if (path) {
            u.setPath(path, dest);
            u.ai.order = "move";
            u.ai.coverPoint = null;
            logEvent("ACTION", `${u.id} moving to ${cmd.grid} (${path.length} waypoints)`, {
              traceId, data: { unit: u.id, grid: cmd.grid, waypoints: path.length },
            });
          } else {
            logEvent("ACTION", `${u.id} has no path to ${cmd.grid}`, { traceId, error: "unreachable" });
          }
        });
        this.say(speaker.id, pick(ACKS.move).replace("{grid}", cmd.grid), traceId);
        break;
      }

      case "advance": {
        this.stance = "advance";
        targets.forEach((u) => {
          if (u.ai.order === "hold") u.ai.order = "none";
          u.ai.boundTimer = Math.random() * 1.5;
        });
        this.say(speaker.id, pick(ACKS.advance), traceId);
        break;
      }

      case "hold": {
        this.stance = "hold";
        targets.forEach((u) => {
          u.stop();
          u.ai.order = "hold";
          u.ai.holdPos = { ...u.pos };
        });
        this.say(speaker.id, pick(ACKS.hold), traceId);
        break;
      }

      case "engage": {
        this.weapons = "free";
        this.say(speaker.id, pick(ACKS.engage), traceId);
        break;
      }

      case "cease_fire": {
        this.weapons = "hold";
        this.say(speaker.id, pick(ACKS.cease_fire), traceId);
        break;
      }

      case "alert": {
        this.awareness.addAlert(
          { direction: cmd.direction || null, grid: cmd.grid || null, source: "player" },
          this.aliveUnits()
        );
        const dirWord = cmd.direction ? longDirection(cmd.direction) : cmd.grid || "that area";
        this.say(speaker.id, pick(ACKS.alert).replaceAll("{direction}", dirWord), traceId);
        break;
      }

      case "set_goal": {
        if (cmd.goal) this.goal.text = cmd.goal;
        if (cmd.grid) {
          this.goal.grid = cmd.grid;
          this.goalPos = this.world.gridToWorld(cmd.grid);
        }
        logEvent("COMMAND", `Mission goal updated: "${this.goal.text}" (${this.goal.grid})`, { traceId });
        this.say(speaker.id, pick(ACKS.set_goal).replace("{goal}", this.goal.text), traceId);
        break;
      }

      case "status": {
        this.say(speaker.id, this.sitrep(), traceId);
        break;
      }

      default:
        this.say(speaker.id, "Say again, didn't catch that.", traceId);
    }
  }

  sitrep() {
    const alive = this.aliveUnits();
    const known = [...this.awareness.contacts.entries()].filter(([, c]) => c.level === "known");
    const lastKnown = [...this.awareness.contacts.entries()].filter(([, c]) => c.level === "last-known");
    let report = `${alive.length} effectives. `;
    if (known.length) {
      const grids = known.map(([, c]) => this.world.worldToGrid(c.pos)).join(", ");
      report += `${known.length} hostiles in sight at ${grids}. `;
    } else if (lastKnown.length) {
      report += `No visual. Last known contacts near ${lastKnown.map(([, c]) => this.world.worldToGrid(c.pos)).join(", ")}. `;
    } else {
      report += "No enemy contact. ";
    }
    report += this.stance === "advance" ? "Advancing on the objective." : "Holding position.";
    return report;
  }

  // ---- Autonomy tick --------------------------------------------------------

  update(dt, enemies) {
    this._reportNewContacts();
    const known = this.awareness.knownEnemies(enemies);

    for (const u of this.aliveUnits()) {
      // 1. Engage: nearest known enemy we can actually shoot
      let engaged = false;
      if (this.weapons === "free" && known.length) {
        const target = known
          .filter((e) => this.combat.canEngage(u, e))
          .sort((a, b) => dist(u.pos, a.pos) - dist(u.pos, b.pos))[0];
        if (target) {
          this.combat.tryFire(u, target);
          engaged = true;
          u.firing = true;
        } else {
          u.firing = false;
        }
      } else {
        u.firing = false;
      }

      // 2. Cover: threats known/suspected, not under an explicit move order,
      //    and not already protected -> claim a cover point
      if (!u.moving && u.ai.order !== "move" && this.awareness.hasAnyThreat) {
        const threatPos = this.awareness.threatPositionFor(u.pos);
        if (threatPos && !this.world.inCoverFrom(u.pos, threatPos)) {
          const occupied = this.aliveUnits()
            .filter((o) => o !== u)
            .map((o) => o.ai.coverPoint ?? o.pos);
          const anchor = u.ai.order === "hold" ? u.ai.holdPos : u.pos;
          const cp = this.world.findCover(anchor, threatPos, occupied);
          if (cp) {
            const path = this.world.findPath(u.pos, cp);
            if (path) {
              u.setPath(path, cp);
              u.ai.coverPoint = cp;
              logEvent("ACTION", `${u.id} taking cover behind ${cp.obstacle.id}`, {
                data: { unit: u.id, threatGrid: this.world.worldToGrid(threatPos) },
              });
            }
          }
        }
      }

      // 3. Advance: quiet battlefield + stance advance + nothing else to do
      if (
        !u.moving && !engaged && this.stance === "advance" &&
        u.ai.order === "none" && !this.awareness.knownEnemies(enemies).length &&
        this.goalPos && dist(u.pos, this.goalPos) > CONFIG.GOAL_RADIUS
      ) {
        u.ai.boundTimer -= dt;
        if (u.ai.boundTimer <= 0) {
          u.ai.boundTimer =
            CONFIG.BOUND_PAUSE_MIN + Math.random() * (CONFIG.BOUND_PAUSE_MAX - CONFIG.BOUND_PAUSE_MIN);
          const a = angleTo(u.pos, this.goalPos);
          const spread = (Math.random() - 0.5) * 0.8;
          const step = Math.min(CONFIG.BOUND_LENGTH, dist(u.pos, this.goalPos));
          const dest = this.world.clampToWorld({
            x: u.pos.x + Math.cos(a + spread) * step,
            y: u.pos.y + Math.sin(a + spread) * step,
          });
          const path = this.world.findPath(u.pos, dest);
          if (path) {
            u.setPath(path, dest);
            u.ai.coverPoint = null;
          }
        }
      }

      // 4. Orientation when stationary: face the threat, else the objective
      if (!u.moving && !engaged) {
        const threatDir = this.awareness.threatDirectionFor(u.pos);
        if (threatDir !== null) u.watchHeading = threatDir;
        else if (this.goalPos && this.stance === "advance") u.watchHeading = angleTo(u.pos, this.goalPos);
      }

      // Explicit move order finished -> hold there
      if (u.ai.order === "move" && !u.moving) {
        u.ai.order = "hold";
        u.ai.holdPos = { ...u.pos };
        logEvent("ACTION", `${u.id} arrived at ${this.world.worldToGrid(u.pos)}, holding`);
      }
    }
  }

  _reportNewContacts() {
    for (const [enemyId, c] of this.awareness.contacts.entries()) {
      if (c.level === "known" && !c.reported) {
        c.reported = true;
        const grid = this.world.worldToGrid(c.pos);
        const speaker = this.units.find((u) => u.id === c.seenBy && u.alive) ?? this.aliveUnits()[0];
        if (speaker) {
          const bearing = compassName(angleTo(speaker.pos, c.pos));
          this.say(speaker.id, `Contact! Hostile at ${grid}, ${longDirection(bearing)}!`);
        }
      }
    }
  }

  reportCasualty(unit) {
    const speaker = this.aliveUnits()[0];
    if (speaker) this.say(speaker.id, `${unit.id.replace("-", " ")} is down!`);
  }
}

function longDirection(short) {
  const names = {
    N: "north", NE: "northeast", E: "east", SE: "southeast",
    S: "south", SW: "southwest", W: "west", NW: "northwest",
  };
  return names[short] ?? short;
}
