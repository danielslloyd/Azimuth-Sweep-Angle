// World: the map, grid conversions, obstacles, and cover geometry.

import { CONFIG, WORLD_W, WORLD_H } from "../config.js";
import { PathFinder } from "./Path.js";
import { angleTo, dist, normalizeAngle } from "./LOS.js";

const LETTERS = "ABCDEFGHIJ";

export class World {
  constructor(mapDef) {
    this.map = mapDef;
    this.width = WORLD_W;
    this.height = WORLD_H;
    // walls block sight + fire + movement; cover blocks movement only but
    // grants a defense bonus when it lies between a unit and its attacker
    this.walls = mapDef.obstacles.filter((o) => o.type === "wall");
    this.cover = mapDef.obstacles.filter((o) => o.type === "cover");
    this.obstacles = mapDef.obstacles;
    this.pathfinder = new PathFinder(this.obstacles, CONFIG.UNIT_RADIUS);
    this.coverPoints = this._buildCoverPoints();
  }

  // "C5" -> center of that cell
  gridToWorld(ref) {
    const col = LETTERS.indexOf(ref[0].toUpperCase());
    const row = parseInt(ref.slice(1), 10) - 1;
    if (col < 0 || row < 0 || row >= CONFIG.ROWS) return null;
    return {
      x: col * CONFIG.CELL + CONFIG.CELL / 2,
      y: row * CONFIG.CELL + CONFIG.CELL / 2,
    };
  }

  worldToGrid(p) {
    const col = Math.min(CONFIG.COLS - 1, Math.max(0, Math.floor(p.x / CONFIG.CELL)));
    const row = Math.min(CONFIG.ROWS - 1, Math.max(0, Math.floor(p.y / CONFIG.CELL)));
    return `${LETTERS[col]}${row + 1}`;
  }

  // Standing spots on each side of every obstacle (walls give hard cover too).
  _buildCoverPoints() {
    const pts = [];
    const off = CONFIG.COVER_POINT_OFFSET;
    for (const o of this.obstacles) {
      const sides = [
        { x: o.x + o.w / 2, y: o.y - off, normal: -Math.PI / 2 },       // N side
        { x: o.x + o.w / 2, y: o.y + o.h + off, normal: Math.PI / 2 },  // S side
        { x: o.x - off, y: o.y + o.h / 2, normal: Math.PI },            // W side
        { x: o.x + o.w + off, y: o.y + o.h / 2, normal: 0 },            // E side
      ];
      for (const s of sides) {
        if (s.x < 0 || s.y < 0 || s.x > this.width || s.y > this.height) continue;
        pts.push({ x: s.x, y: s.y, obstacle: o, normal: s.normal });
      }
    }
    return pts;
  }

  // Does `coverPoint`'s obstacle shield a unit standing there from a threat
  // at `threatPos`? True when the threat lies roughly behind the obstacle.
  coverFaces(coverPoint, threatPos) {
    const toThreat = angleTo(coverPoint, threatPos);
    // The obstacle is opposite the point's outward normal
    const toObstacle = normalizeAngle(coverPoint.normal + Math.PI);
    return Math.abs(normalizeAngle(toThreat - toObstacle)) < Math.PI / 2.4;
  }

  // Best reachable cover point near `pos` shielding against `threatPos`,
  // or null. `occupied` = positions of other units to avoid stacking.
  findCover(pos, threatPos, occupied = []) {
    let best = null;
    let bestScore = Infinity;
    for (const cp of this.coverPoints) {
      const d = dist(pos, cp);
      if (d > CONFIG.COVER_SEARCH_RADIUS) continue;
      if (!this.coverFaces(cp, threatPos)) continue;
      if (occupied.some((o) => dist(o, cp) < CONFIG.UNIT_RADIUS * 2.5)) continue;
      if (d < bestScore) {
        bestScore = d;
        best = cp;
      }
    }
    return best;
  }

  // Is `unitPos` protected by some obstacle against a shot from `shooterPos`?
  // (Standing close behind an obstacle that lies between the two.)
  inCoverFrom(unitPos, shooterPos) {
    for (const cp of this.coverPoints) {
      if (dist(unitPos, cp) < CONFIG.UNIT_RADIUS * 2.2 && this.coverFaces(cp, shooterPos)) {
        return true;
      }
    }
    return false;
  }

  findPath(start, goal) {
    return this.pathfinder.findPath(start, goal);
  }

  clampToWorld(p) {
    return {
      x: Math.min(this.width - 5, Math.max(5, p.x)),
      y: Math.min(this.height - 5, Math.max(5, p.y)),
    };
  }
}
