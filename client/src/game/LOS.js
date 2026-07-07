// Line-of-sight and geometry helpers. Walls block sight; low cover does not.

export function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function angleTo(from, to) {
  return Math.atan2(to.y - from.y, to.x - from.x);
}

export function normalizeAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

// Segment (p1->p2) vs axis-aligned rect {x,y,w,h}. Returns true if it crosses.
export function segmentIntersectsRect(p1, p2, r) {
  // Quick accept: either endpoint inside
  if (pointInRect(p1, r) || pointInRect(p2, r)) return true;
  const corners = [
    { x: r.x, y: r.y },
    { x: r.x + r.w, y: r.y },
    { x: r.x + r.w, y: r.y + r.h },
    { x: r.x, y: r.y + r.h },
  ];
  for (let i = 0; i < 4; i++) {
    if (segmentsIntersect(p1, p2, corners[i], corners[(i + 1) % 4])) return true;
  }
  return false;
}

export function pointInRect(p, r) {
  return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
}

function ccw(a, b, c) {
  return (c.y - a.y) * (b.x - a.x) > (b.y - a.y) * (c.x - a.x);
}

export function segmentsIntersect(a, b, c, d) {
  return ccw(a, c, d) !== ccw(b, c, d) && ccw(a, b, c) !== ccw(a, b, d);
}

// True if nothing sight-blocking sits between a and b.
export function hasLOS(a, b, walls) {
  for (const w of walls) {
    if (segmentIntersectsRect(a, b, w)) return false;
  }
  return true;
}

// Distance from origin along direction (dx,dy) to the first wall hit, capped
// at maxDist. Used to draw vision cones clipped by walls.
export function raycast(origin, angle, maxDist, walls) {
  const end = {
    x: origin.x + Math.cos(angle) * maxDist,
    y: origin.y + Math.sin(angle) * maxDist,
  };
  let closest = maxDist;
  for (const w of walls) {
    const hit = raySegmentRect(origin, end, w);
    if (hit !== null && hit < closest) closest = hit;
  }
  return closest;
}

function raySegmentRect(p1, p2, r) {
  // Liang-Barsky style: parametric clip of segment against rect, return t*len
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  let tmin = 0;
  let tmax = 1;
  const p = [-dx, dx, -dy, dy];
  const q = [p1.x - r.x, r.x + r.w - p1.x, p1.y - r.y, r.y + r.h - p1.y];
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) {
      if (q[i] < 0) return null;
    } else {
      const t = q[i] / p[i];
      if (p[i] < 0) tmin = Math.max(tmin, t);
      else tmax = Math.min(tmax, t);
      if (tmin > tmax) return null;
    }
  }
  return tmin * Math.hypot(dx, dy);
}

// Can `viewer` (with pos, heading) see point p given cone params + walls?
export function canSee(viewer, p, range, halfAngle, walls) {
  const d = dist(viewer.pos, p);
  if (d > range) return false;
  const a = normalizeAngle(angleTo(viewer.pos, p) - viewer.heading);
  if (Math.abs(a) > halfAngle) return false;
  return hasLOS(viewer.pos, p, walls);
}

export const COMPASS = {
  N: -Math.PI / 2, NE: -Math.PI / 4, E: 0, SE: Math.PI / 4,
  S: Math.PI / 2, SW: (3 * Math.PI) / 4, W: Math.PI, NW: (-3 * Math.PI) / 4,
};

export function compassName(angle) {
  const names = ["E", "SE", "S", "SW", "W", "NW", "N", "NE"];
  const idx = Math.round(normalizeAngle(angle) / (Math.PI / 4)) & 7;
  return names[(idx + 8) % 8];
}
