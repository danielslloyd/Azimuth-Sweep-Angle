// Game: owns the world and all subsystems, advances the simulation, and is
// the single entry point for validated commands (from the pipeline).

import { World } from "./World.js";
import { Unit } from "./Unit.js";
import { Combat } from "./Combat.js";
import { Awareness } from "./Awareness.js";
import { SquadAI } from "./SquadAI.js";
import { EnemyAI } from "./EnemyAI.js";
import { AirstrikeController } from "./Airstrike.js";
import { logEvent } from "../debug/log.js";
import { COMPASS } from "./LOS.js";

export class Game {
  constructor(mapDef, say) {
    this.say = say;
    this.world = new World(mapDef);
    this.state = "playing"; // playing | won | lost
    this.time = 0;

    this.friendlies = mapDef.friendlySpawns.map((s) => {
      const u = new Unit(s.id, "friendly", this.world.gridToWorld(s.grid), -Math.PI / 2);
      return u;
    });
    this.enemies = mapDef.enemies.map((def) => {
      const e = new Unit(def.id, "enemy", this.world.gridToWorld(def.grid), Math.PI / 2);
      e.ai.def = def;
      if (def.facing) e.heading = COMPASS[def.facing];
      return e;
    });

    this.combat = new Combat(this.world);
    this.awareness = new Awareness(this.world);
    this.squad = new SquadAI(this.world, this.friendlies, this.awareness, this.combat, say);
    this.enemyAI = new EnemyAI(this.world, this.enemies, this.combat);
    this.airstrike = new AirstrikeController(this.world);

    // Shots at friendlies from shooters the squad can't see raise a suspicion
    this.combat.onShot = ({ shooter, target }) => {
      if (target.side !== "friendly") return;
      const contact = this.awareness.contacts.get(shooter.id);
      if (!contact || contact.level !== "known") {
        this.awareness.addUnseenFireSuspicion(target.pos, shooter.pos);
      }
    };

    this._prevAlive = new Set(this.allUnits().filter((u) => u.alive).map((u) => u.id));

    logEvent("GAME", `Map "${mapDef.name}" loaded. Mission: ${mapDef.goal.text}`, {
      data: {
        friendlies: this.friendlies.map((u) => `${u.id}@${this.world.worldToGrid(u.pos)}`),
        enemies: this.enemies.map((u) => `${u.id}@${this.world.worldToGrid(u.pos)}`),
      },
    });
  }

  allUnits() {
    return [...this.friendlies, ...this.enemies];
  }

  tick(dt) {
    if (this.state !== "playing") return;
    this.time += dt;

    for (const u of this.allUnits()) u.update(dt);
    this.combat.update(dt);
    this.awareness.update(dt, this.friendlies, this.enemies);
    this.squad.update(dt, this.enemies);
    this.enemyAI.update(dt, this.friendlies);
    this.airstrike.update(dt, this.allUnits());
    this._checkCasualties();
    this._checkEndState();
  }

  _checkCasualties() {
    for (const u of this.allUnits()) {
      if (!u.alive && this._prevAlive.has(u.id)) {
        this._prevAlive.delete(u.id);
        logEvent("GAME", `${u.id} KIA at ${this.world.worldToGrid(u.pos)}`);
        if (u.side === "friendly") this.squad.reportCasualty(u);
      }
    }
  }

  _checkEndState() {
    if (!this.enemies.some((e) => e.alive)) {
      this.state = "won";
      logEvent("GAME", "MISSION COMPLETE — all hostiles down. Press R to restart.");
      this.say(this.squad.aliveUnits()[0]?.id ?? "alpha-1", "All hostiles down. Area clear.");
    } else if (!this.friendlies.some((f) => f.alive)) {
      this.state = "lost";
      logEvent("GAME", "MISSION FAILED — squad wiped. Press R to restart.", { error: "squad wiped" });
    }
  }

  // Single entry point for validated commands from the pipeline.
  applyCommand(cmd, traceId) {
    logEvent("COMMAND", `Dispatching: ${cmd.intent} ${cmd.units?.join(",") ?? ""} ${cmd.grid ?? ""} ${cmd.direction ?? ""}`.trim(), {
      traceId, data: cmd,
    });

    if (this.state !== "playing") {
      logEvent("COMMAND", `Ignored — mission is over (${this.state})`, { traceId });
      return;
    }

    if (cmd.intent === "airstrike") {
      const result = this.airstrike.call(cmd.grid, traceId);
      this.say("overlord", result.text, traceId);
      return;
    }

    if (cmd.intent === "unclear") {
      const speaker = this.squad.aliveUnits()[0];
      if (speaker) this.say(speaker.id, cmd.question || "Say again?", traceId);
      return;
    }

    this.squad.applyCommand(cmd, traceId);
  }
}
