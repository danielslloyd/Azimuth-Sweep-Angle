// Client-side mirror of the server's command schema, so commands injected
// via the raw-JSON debug box get the same validation as LLM output.

export const INTENTS = [
  "move", "advance", "hold", "engage", "cease_fire", "airstrike",
  "alert", "set_goal", "status", "unclear",
];
export const UNITS = ["alpha-1", "alpha-2", "alpha-3", "alpha-4", "all"];
export const DIRECTIONS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW", ""];
const GRID_RE = /^[A-J](10|[1-9])$/;

// Returns array of error strings; empty = valid. Normalizes grid to uppercase.
export function validateCommand(cmd) {
  const errors = [];
  if (typeof cmd !== "object" || cmd === null) return ["command is not an object"];
  if (!INTENTS.includes(cmd.intent)) errors.push(`unknown intent ${JSON.stringify(cmd.intent)}`);
  if (!Array.isArray(cmd.units)) {
    errors.push("units must be an array");
  } else if (cmd.units.length === 0) {
    cmd.units = ["all"]; // unspecified -> whole squad
  } else {
    const bad = cmd.units.filter((u) => !UNITS.includes(u));
    if (bad.length) errors.push(`unknown units ${JSON.stringify(bad)}`);
  }
  if (cmd.grid) {
    cmd.grid = cmd.grid.toUpperCase();
    if (!GRID_RE.test(cmd.grid)) errors.push(`bad grid reference ${JSON.stringify(cmd.grid)}`);
  }
  if (cmd.direction && !DIRECTIONS.includes(cmd.direction)) {
    errors.push(`bad direction ${JSON.stringify(cmd.direction)}`);
  }
  if (["move", "airstrike"].includes(cmd.intent) && !cmd.grid) {
    errors.push(`intent ${cmd.intent} requires a grid reference`);
  }
  return errors;
}
