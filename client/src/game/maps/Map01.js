// Map 01 — "Compound". 600x600 world, 60px cells, grid A1 (NW) to J10 (SE).
// Friendlies spawn SW; an enemy patrol loops the center; a guard pair holds
// the compound in the NE. Mission: clear the compound at H3.

export const MAP01 = {
  name: "Compound",
  goal: {
    text: "Clear all hostiles from the compound at grid H3",
    grid: "H3",
  },
  // x,y = top-left, in world px. wall = blocks sight/fire/movement,
  // cover = low (crates/sandbags): blocks movement, shields adjacent units.
  obstacles: [
    // Compound walls (NE, around H2-I3): U-shape open to the south
    { type: "wall", x: 400, y: 80, w: 150, h: 18, id: "compound-north" },
    { type: "wall", x: 400, y: 80, w: 18, h: 120, id: "compound-west" },
    { type: "wall", x: 532, y: 80, w: 18, h: 120, id: "compound-east" },
    // Center building (~E5/F5)
    { type: "wall", x: 250, y: 250, w: 110, h: 70, id: "center-building" },
    // West rock (~B4)
    { type: "wall", x: 60, y: 190, w: 70, h: 50, id: "west-rock" },
    // South building (~E8)
    { type: "wall", x: 240, y: 430, w: 80, h: 60, id: "south-building" },

    // Scattered low cover (crates / sandbags)
    { type: "cover", x: 160, y: 350, w: 40, h: 16, id: "crates-c6" },
    { type: "cover", x: 390, y: 300, w: 40, h: 16, id: "crates-g6" },
    { type: "cover", x: 450, y: 220, w: 16, h: 40, id: "sandbags-h4" },
    { type: "cover", x: 300, y: 150, w: 40, h: 16, id: "crates-f3" },
    { type: "cover", x: 100, y: 480, w: 40, h: 16, id: "crates-b9" },
    { type: "cover", x: 480, y: 420, w: 40, h: 16, id: "crates-i8" },
  ],
  friendlySpawns: [
    { id: "alpha-1", grid: "B9" },
    { id: "alpha-2", grid: "A9" },
    { id: "alpha-3", grid: "B10" },
    { id: "alpha-4", grid: "A10" },
  ],
  enemies: [
    // Patrol loops around the center building (kept a cell north of the
    // friendly spawn's vision range so missions don't start with contact)
    { id: "hostile-1", grid: "D4", patrol: ["D4", "G4", "G6", "D6"] },
    { id: "hostile-2", grid: "G4", patrol: ["G4", "G6", "D6", "D4"] },
    { id: "hostile-3", grid: "G6", patrol: ["G6", "D6", "D4", "G4"] },
    // Compound guards (static posts, facing south)
    { id: "hostile-4", grid: "H2", patrol: [], facing: "S" },
    { id: "hostile-5", grid: "I3", patrol: [], facing: "S" },
  ],
};
