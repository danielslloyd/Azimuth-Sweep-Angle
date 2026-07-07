// Central tuning knobs. All distances in world pixels; grid cells are CELL px.

export const CONFIG = {
  // World
  CELL: 60,               // one grid cell, px
  COLS: 10,               // A..J
  ROWS: 10,               // 1..10

  // Units
  UNIT_RADIUS: 8,
  UNIT_SPEED: 55,          // px/s
  VISION_RANGE: 210,       // 3.5 cells
  VISION_ANGLE: (120 * Math.PI) / 180,
  TURN_SPEED: (270 * Math.PI) / 180, // rad/s

  // Combat
  FIRE_RANGE: 240,
  FIRE_COOLDOWN: 1.1,      // seconds between shots
  HIT_BASE: 0.55,          // hit prob at point blank
  HIT_MIN: 0.08,           // hit prob at max range
  COVER_MULTIPLIER: 0.35,  // hit prob multiplier when target in cover vs shooter
  MOVING_SHOOTER_MULT: 0.6,
  TRACER_LIFETIME: 0.15,   // seconds a tracer line is drawn

  // Cover
  COVER_SEARCH_RADIUS: 140, // how far a unit will move to reach cover
  COVER_POINT_OFFSET: 14,   // distance from cover rect edge to stand

  // Awareness
  LAST_KNOWN_STALE: 25,     // s until a last-known contact marker goes stale
  SUSPICION_FADE: 45,       // s for a player alert to fade out
  GUNFIRE_ALERT_RADIUS: 260,// enemies hear shots within this radius

  // Airstrike
  STRIKE_COOLDOWN: 40,      // s
  STRIKE_DELAY: 4,          // s from call to impact
  STRIKE_RADIUS: 80,        // lethal-ish radius
  STRIKE_KILL_CENTER: 0.95, // kill prob at center
  STRIKE_KILL_EDGE: 0.15,   // kill prob at edge

  // Squad autonomy
  BOUND_LENGTH: 100,        // advance-toward-goal bound distance
  BOUND_PAUSE_MIN: 1.5,     // s pause between bounds
  BOUND_PAUSE_MAX: 4.0,
  GOAL_RADIUS: 90,          // "at the objective" distance

  // Server
  SERVER: "",               // same origin
};

export const WORLD_W = CONFIG.CELL * CONFIG.COLS;
export const WORLD_H = CONFIG.CELL * CONFIG.ROWS;

export const COLORS = {
  bg: "#0d1117",
  gridLine: "#1c2430",
  gridLabel: "#3d4a5c",
  wall: "#4a5568",
  cover: "#6b5d45",
  friendly: "#4da3ff",
  friendlyCone: "rgba(77,163,255,0.10)",
  friendlySelected: "#9fd0ff",
  enemy: "#ff5a5a",
  enemyCone: "rgba(255,140,60,0.10)",
  dead: "#3a3f47",
  tracer: "#fff2b0",
  tracerMiss: "rgba(255,242,176,0.35)",
  path: "rgba(77,163,255,0.5)",
  knownRing: "#ffd24d",
  lastKnownGhost: "rgba(255,210,77,0.45)",
  suspicion: "rgba(255,120,60,0.14)",
  strikeTelegraph: "rgba(255,80,80,0.35)",
  explosion: "#ffc24d",
  goal: "rgba(120,255,150,0.5)",
};
