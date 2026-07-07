// Canvas 2D renderer. Deliberately primitive: circles, triangles, rectangles,
// wedges — every piece of game state the AI acts on is drawn so the player
// can debug behavior visually.

import { CONFIG, WORLD_W, WORLD_H, COLORS } from "../config.js";
import { raycast } from "../game/LOS.js";

const MARGIN = 26; // room for grid labels
const LETTERS = "ABCDEFGHIJ";

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    canvas.width = WORLD_W + MARGIN * 2;
    canvas.height = WORLD_H + MARGIN * 2;
    this.toggles = {
      cones: true,
      paths: true,
      awareness: true,
      suspicion: true,
      coverPoints: false,
      labels: true,
    };
  }

  draw(game) {
    const { ctx } = this;
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.save();
    ctx.translate(MARGIN, MARGIN);

    this._grid(ctx);
    this._goal(ctx, game);
    if (this.toggles.suspicion) this._suspicions(ctx, game);
    if (this.toggles.cones) {
      for (const u of game.allUnits()) if (u.alive) this._visionCone(ctx, u, game);
    }
    this._obstacles(ctx, game);
    if (this.toggles.coverPoints) this._coverPoints(ctx, game);
    if (this.toggles.paths) {
      for (const u of game.allUnits()) if (u.alive) this._path(ctx, u);
    }
    this._airstrikes(ctx, game);
    this._tracers(ctx, game);
    for (const u of game.allUnits()) this._unit(ctx, u);
    if (this.toggles.awareness) this._awareness(ctx, game);
    this._banner(ctx, game);

    ctx.restore();
  }

  _grid(ctx) {
    ctx.strokeStyle = COLORS.gridLine;
    ctx.lineWidth = 1;
    ctx.font = "11px monospace";
    ctx.fillStyle = COLORS.gridLabel;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (let c = 0; c <= CONFIG.COLS; c++) {
      const x = c * CONFIG.CELL;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, WORLD_H);
      ctx.stroke();
      if (c < CONFIG.COLS) {
        ctx.fillText(LETTERS[c], x + CONFIG.CELL / 2, -MARGIN / 2);
        ctx.fillText(LETTERS[c], x + CONFIG.CELL / 2, WORLD_H + MARGIN / 2);
      }
    }
    for (let r = 0; r <= CONFIG.ROWS; r++) {
      const y = r * CONFIG.CELL;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(WORLD_W, y);
      ctx.stroke();
      if (r < CONFIG.ROWS) {
        ctx.fillText(String(r + 1), -MARGIN / 2, y + CONFIG.CELL / 2);
        ctx.fillText(String(r + 1), WORLD_W + MARGIN / 2, y + CONFIG.CELL / 2);
      }
    }
  }

  _goal(ctx, game) {
    const pos = game.squad.goalPos;
    if (!pos) return;
    ctx.strokeStyle = COLORS.goal;
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, CONFIG.GOAL_RADIUS * 0.5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = COLORS.goal;
    ctx.font = "10px monospace";
    ctx.textAlign = "center";
    ctx.fillText("OBJ", pos.x, pos.y - CONFIG.GOAL_RADIUS * 0.5 - 6);
  }

  _suspicions(ctx, game) {
    for (const s of game.awareness.suspicions) {
      const age = game.awareness.time - s.createdAt;
      const alpha = Math.max(0, 1 - age / CONFIG.SUSPICION_FADE);
      if (s.angle !== null && s.origin) {
        // directional wedge from squad centroid outward
        ctx.fillStyle = COLORS.suspicion;
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.moveTo(s.origin.x, s.origin.y);
        ctx.arc(s.origin.x, s.origin.y, 260, s.angle - 0.45, s.angle + 0.45);
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha = 1;
      } else if (s.pos) {
        ctx.strokeStyle = `rgba(255,120,60,${0.5 * alpha})`;
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.arc(s.pos.x, s.pos.y, 40, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
  }

  _visionCone(ctx, unit, game) {
    const half = CONFIG.VISION_ANGLE / 2;
    const steps = 24;
    ctx.fillStyle = unit.side === "friendly" ? COLORS.friendlyCone : COLORS.enemyCone;
    ctx.beginPath();
    ctx.moveTo(unit.pos.x, unit.pos.y);
    for (let i = 0; i <= steps; i++) {
      const a = unit.heading - half + (i / steps) * CONFIG.VISION_ANGLE;
      const d = raycast(unit.pos, a, CONFIG.VISION_RANGE, game.world.walls);
      ctx.lineTo(unit.pos.x + Math.cos(a) * d, unit.pos.y + Math.sin(a) * d);
    }
    ctx.closePath();
    ctx.fill();
  }

  _obstacles(ctx, game) {
    for (const o of game.world.walls) {
      ctx.fillStyle = COLORS.wall;
      ctx.fillRect(o.x, o.y, o.w, o.h);
    }
    for (const o of game.world.cover) {
      ctx.fillStyle = COLORS.cover;
      ctx.fillRect(o.x, o.y, o.w, o.h);
      // hatching to distinguish low cover from walls
      ctx.strokeStyle = "rgba(0,0,0,0.35)";
      ctx.lineWidth = 1;
      for (let x = o.x - o.h; x < o.x + o.w; x += 6) {
        ctx.beginPath();
        ctx.moveTo(Math.max(o.x, x), x < o.x ? o.y + (o.x - x) : o.y);
        ctx.lineTo(Math.min(o.x + o.w, x + o.h), x + o.h > o.x + o.w ? o.y + (o.x + o.w - x) : o.y + o.h);
        ctx.stroke();
      }
    }
  }

  _coverPoints(ctx, game) {
    ctx.fillStyle = "rgba(150,200,150,0.5)";
    for (const cp of game.world.coverPoints) {
      ctx.beginPath();
      ctx.arc(cp.x, cp.y, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  _path(ctx, unit) {
    if (!unit.moving) return;
    ctx.strokeStyle = unit.side === "friendly" ? COLORS.path : "rgba(255,90,90,0.35)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(unit.pos.x, unit.pos.y);
    for (const wp of unit.path) ctx.lineTo(wp.x, wp.y);
    ctx.stroke();
    ctx.setLineDash([]);
    if (unit.moveGoal) {
      ctx.strokeStyle = ctx.strokeStyle;
      ctx.beginPath();
      ctx.arc(unit.moveGoal.x, unit.moveGoal.y, 5, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  _airstrikes(ctx, game) {
    for (const s of game.airstrike.pending) {
      ctx.strokeStyle = COLORS.strikeTelegraph;
      ctx.fillStyle = COLORS.strikeTelegraph;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(s.pos.x, s.pos.y, CONFIG.STRIKE_RADIUS, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(s.pos.x - 8, s.pos.y);
      ctx.lineTo(s.pos.x + 8, s.pos.y);
      ctx.moveTo(s.pos.x, s.pos.y - 8);
      ctx.lineTo(s.pos.x, s.pos.y + 8);
      ctx.stroke();
      ctx.font = "12px monospace";
      ctx.textAlign = "center";
      ctx.fillStyle = "#ff8080";
      ctx.fillText(s.timer.toFixed(1), s.pos.x, s.pos.y - CONFIG.STRIKE_RADIUS - 8);
    }
    for (const ex of game.airstrike.explosions) {
      const t = ex.age / 0.8;
      ctx.globalAlpha = 1 - t;
      ctx.fillStyle = COLORS.explosion;
      ctx.beginPath();
      ctx.arc(ex.pos.x, ex.pos.y, ex.radius * (0.4 + 0.6 * t), 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  _tracers(ctx, game) {
    for (const t of game.combat.tracers) {
      ctx.strokeStyle = t.hit ? COLORS.tracer : COLORS.tracerMiss;
      ctx.lineWidth = t.hit ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(t.from.x, t.from.y);
      ctx.lineTo(t.to.x, t.to.y);
      ctx.stroke();
    }
  }

  _unit(ctx, unit) {
    const r = CONFIG.UNIT_RADIUS;
    const { x, y } = unit.pos;

    if (!unit.alive) {
      ctx.strokeStyle = COLORS.dead;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x - r * 0.7, y - r * 0.7);
      ctx.lineTo(x + r * 0.7, y + r * 0.7);
      ctx.moveTo(x + r * 0.7, y - r * 0.7);
      ctx.lineTo(x - r * 0.7, y + r * 0.7);
      ctx.stroke();
      return;
    }

    if (unit.side === "friendly") {
      ctx.fillStyle = COLORS.friendly;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = COLORS.enemy;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(unit.heading) * r * 1.3, y + Math.sin(unit.heading) * r * 1.3);
      ctx.lineTo(x + Math.cos(unit.heading + 2.5) * r, y + Math.sin(unit.heading + 2.5) * r);
      ctx.lineTo(x + Math.cos(unit.heading - 2.5) * r, y + Math.sin(unit.heading - 2.5) * r);
      ctx.closePath();
      ctx.fill();
    }

    // heading tick
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(unit.heading) * r, y + Math.sin(unit.heading) * r);
    ctx.lineTo(x + Math.cos(unit.heading) * (r + 6), y + Math.sin(unit.heading) * (r + 6));
    ctx.stroke();

    if (this.toggles.labels) {
      ctx.font = "9px monospace";
      ctx.textAlign = "center";
      ctx.fillStyle = unit.side === "friendly" ? COLORS.friendlySelected : "#ff9a9a";
      ctx.fillText(unit.id.replace("hostile-", "H").replace("alpha-", "A"), x, y - r - 5);
    }
  }

  _awareness(ctx, game) {
    for (const [enemyId, c] of game.awareness.contacts.entries()) {
      if (c.level === "known") {
        ctx.strokeStyle = COLORS.knownRing;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(c.pos.x, c.pos.y, CONFIG.UNIT_RADIUS + 5, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        // hollow ghost at last-known position
        ctx.strokeStyle = COLORS.lastKnownGhost;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.arc(c.pos.x, c.pos.y, CONFIG.UNIT_RADIUS + 2, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.font = "9px monospace";
        ctx.textAlign = "center";
        ctx.fillStyle = COLORS.lastKnownGhost;
        ctx.fillText("?", c.pos.x, c.pos.y + 3);
      }
    }
  }

  _banner(ctx, game) {
    if (game.state === "playing") return;
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(0, WORLD_H / 2 - 40, WORLD_W, 80);
    ctx.font = "bold 28px monospace";
    ctx.textAlign = "center";
    ctx.fillStyle = game.state === "won" ? "#7dff9a" : "#ff6a6a";
    ctx.fillText(game.state === "won" ? "MISSION COMPLETE" : "SQUAD WIPED", WORLD_W / 2, WORLD_H / 2);
    ctx.font = "13px monospace";
    ctx.fillStyle = "#ccc";
    ctx.fillText("Press R to restart", WORLD_W / 2, WORLD_H / 2 + 24);
  }
}
