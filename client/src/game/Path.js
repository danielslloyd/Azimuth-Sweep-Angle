// A* pathfinding on a fine grid (nodes every NODE px). Walls and cover both
// block movement (you walk around sandbags, you shoot over them).

import { WORLD_W, WORLD_H } from "../config.js";
import { pointInRect } from "./LOS.js";

const NODE = 20;
const GRID_W = Math.ceil(WORLD_W / NODE);
const GRID_H = Math.ceil(WORLD_H / NODE);

export class PathFinder {
  constructor(obstacles, unitRadius) {
    this.blocked = new Uint8Array(GRID_W * GRID_H);
    const pad = unitRadius + 2;
    for (let gy = 0; gy < GRID_H; gy++) {
      for (let gx = 0; gx < GRID_W; gx++) {
        const cx = gx * NODE + NODE / 2;
        const cy = gy * NODE + NODE / 2;
        for (const o of obstacles) {
          const inflated = { x: o.x - pad, y: o.y - pad, w: o.w + pad * 2, h: o.h + pad * 2 };
          if (pointInRect({ x: cx, y: cy }, inflated)) {
            this.blocked[gy * GRID_W + gx] = 1;
            break;
          }
        }
      }
    }
  }

  isBlocked(gx, gy) {
    if (gx < 0 || gy < 0 || gx >= GRID_W || gy >= GRID_H) return true;
    return this.blocked[gy * GRID_W + gx] === 1;
  }

  toNode(p) {
    return {
      gx: Math.min(GRID_W - 1, Math.max(0, Math.floor(p.x / NODE))),
      gy: Math.min(GRID_H - 1, Math.max(0, Math.floor(p.y / NODE))),
    };
  }

  nodeCenter(gx, gy) {
    return { x: gx * NODE + NODE / 2, y: gy * NODE + NODE / 2 };
  }

  // Find nearest unblocked node to a (possibly blocked) target node.
  nearestOpen(gx, gy) {
    if (!this.isBlocked(gx, gy)) return { gx, gy };
    for (let r = 1; r < 12; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          if (!this.isBlocked(gx + dx, gy + dy)) return { gx: gx + dx, gy: gy + dy };
        }
      }
    }
    return null;
  }

  // Returns array of waypoints (world coords) from start to goal, or null.
  findPath(start, goal) {
    const s = this.toNode(start);
    let g = this.toNode(goal);
    const sOpen = this.nearestOpen(s.gx, s.gy);
    const gOpen = this.nearestOpen(g.gx, g.gy);
    if (!sOpen || !gOpen) return null;

    const key = (gx, gy) => gy * GRID_W + gx;
    const open = new MinHeap();
    const gScore = new Map();
    const came = new Map();
    const startKey = key(sOpen.gx, sOpen.gy);
    const goalKey = key(gOpen.gx, gOpen.gy);
    gScore.set(startKey, 0);
    open.push(startKey, 0);

    const h = (gx, gy) => Math.hypot(gx - gOpen.gx, gy - gOpen.gy);
    const DIRS = [
      [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
      [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414],
    ];

    let found = false;
    let iterations = 0;
    while (open.size > 0 && iterations++ < 20000) {
      const current = open.pop();
      if (current === goalKey) { found = true; break; }
      const cgx = current % GRID_W;
      const cgy = Math.floor(current / GRID_W);
      for (const [dx, dy, cost] of DIRS) {
        const nx = cgx + dx;
        const ny = cgy + dy;
        if (this.isBlocked(nx, ny)) continue;
        // No diagonal corner cutting
        if (dx !== 0 && dy !== 0 && (this.isBlocked(cgx + dx, cgy) || this.isBlocked(cgx, cgy + dy))) continue;
        const nk = key(nx, ny);
        const tentative = gScore.get(current) + cost;
        if (tentative < (gScore.get(nk) ?? Infinity)) {
          gScore.set(nk, tentative);
          came.set(nk, current);
          open.push(nk, tentative + h(nx, ny));
        }
      }
    }
    if (!found) return null;

    // Reconstruct, then simplify collinear runs
    const nodes = [];
    let cur = goalKey;
    while (cur !== undefined) {
      nodes.push(cur);
      cur = came.get(cur);
    }
    nodes.reverse();
    const pts = nodes.map((k) => this.nodeCenter(k % GRID_W, Math.floor(k / GRID_W)));
    pts[pts.length - 1] = { x: goal.x, y: goal.y };
    return simplify(pts);
  }
}

function simplify(pts) {
  if (pts.length <= 2) return pts;
  const out = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const a = out[out.length - 1];
    const b = pts[i];
    const c = pts[i + 1];
    const cross = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
    if (Math.abs(cross) > 0.01) out.push(b);
  }
  out.push(pts[pts.length - 1]);
  return out;
}

class MinHeap {
  constructor() {
    this.items = [];
  }
  get size() {
    return this.items.length;
  }
  push(value, priority) {
    this.items.push({ value, priority });
    let i = this.items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.items[parent].priority <= this.items[i].priority) break;
      [this.items[parent], this.items[i]] = [this.items[i], this.items[parent]];
      i = parent;
    }
  }
  pop() {
    const top = this.items[0];
    const last = this.items.pop();
    if (this.items.length > 0) {
      this.items[0] = last;
      let i = 0;
      while (true) {
        const l = i * 2 + 1;
        const r = i * 2 + 2;
        let smallest = i;
        if (l < this.items.length && this.items[l].priority < this.items[smallest].priority) smallest = l;
        if (r < this.items.length && this.items[r].priority < this.items[smallest].priority) smallest = r;
        if (smallest === i) break;
        [this.items[smallest], this.items[i]] = [this.items[i], this.items[smallest]];
        i = smallest;
      }
    }
    return top.value;
  }
}
