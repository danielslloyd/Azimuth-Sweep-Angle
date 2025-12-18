// First Mission: Village Assault
// A small village with enemy infantry positions

export const Map01 = {
    name: 'Village Assault',
    briefing: 'Infiltrate the village and eliminate all hostile forces. Watch for enemy positions in the buildings.',

    // Friendly spawn points (starting positions)
    friendlySpawns: [
        { x: -35, z: -35, rotation: Math.PI / 4 },
        { x: -33, z: -35, rotation: Math.PI / 4 },
        { x: -35, z: -33, rotation: Math.PI / 4 },
        { x: -33, z: -33, rotation: Math.PI / 4 }
    ],

    // Enemy spawn points
    enemySpawns: [
        // Village center patrol
        { x: 0, z: 0, rotation: -Math.PI / 2 },
        { x: 5, z: 3, rotation: Math.PI },

        // Building positions
        { x: -10, z: 10, rotation: -Math.PI / 4 },
        { x: 15, z: -5, rotation: Math.PI / 2 },

        // Eastern flank
        { x: 25, z: 15, rotation: -Math.PI / 2 },
        { x: 28, z: 10, rotation: -Math.PI }
    ],

    // Terrain features
    terrain: [
        // Central buildings
        { type: 'building', x: -5, z: 5, width: 8, height: 6 },
        { type: 'building', x: 8, z: 0, width: 6, height: 8 },
        { type: 'building', x: -8, z: -8, width: 5, height: 5 },

        // Trees/vegetation
        { type: 'tree', x: -20, z: 20, radius: 3 },
        { type: 'tree', x: -15, z: 25, radius: 2 },
        { type: 'tree', x: -25, z: 15, radius: 2.5 },
        { type: 'tree', x: 20, z: 20, radius: 3 },
        { type: 'tree', x: 25, z: 25, radius: 2 },
        { type: 'tree', x: 30, z: 18, radius: 2.5 },

        // Cover positions
        { type: 'cover', x: -15, z: 0, width: 3, height: 1, rotation: 0 },
        { type: 'cover', x: 0, z: -15, width: 4, height: 1, rotation: Math.PI / 4 },
        { type: 'cover', x: 15, z: 10, width: 3, height: 1, rotation: -Math.PI / 6 },

        // Road (represented as darker patches)
        { type: 'building', x: 0, z: -30, width: 4, height: 20 },
        { type: 'building', x: 0, z: 30, width: 4, height: 20 }
    ],

    // Grid labels visible on map
    gridOverlay: true,

    // Objectives (for future use)
    objectives: [
        {
            id: 'eliminate_all',
            type: 'eliminate',
            description: 'Eliminate all enemy combatants',
            target: 'all_enemies'
        }
    ]
};

// Second map: Open Field
export const Map02 = {
    name: 'Open Field',
    briefing: 'Enemy forces spotted in the open. This is a good opportunity for an airstrike.',

    friendlySpawns: [
        { x: -40, z: 0, rotation: 0 },
        { x: -40, z: 3, rotation: 0 },
        { x: -40, z: -3, rotation: 0 },
        { x: -43, z: 0, rotation: 0 }
    ],

    enemySpawns: [
        { x: 20, z: 0, rotation: Math.PI },
        { x: 25, z: 5, rotation: Math.PI },
        { x: 25, z: -5, rotation: Math.PI },
        { x: 30, z: 0, rotation: Math.PI },
        { x: 22, z: 8, rotation: Math.PI },
        { x: 22, z: -8, rotation: Math.PI },
        { x: 28, z: 10, rotation: Math.PI },
        { x: 28, z: -10, rotation: Math.PI }
    ],

    terrain: [
        // Sparse cover
        { type: 'cover', x: -20, z: 0, width: 4, height: 1 },
        { type: 'cover', x: 0, z: 10, width: 3, height: 1, rotation: Math.PI / 4 },
        { type: 'cover', x: 0, z: -10, width: 3, height: 1, rotation: -Math.PI / 4 },

        // Few trees
        { type: 'tree', x: -10, z: 20, radius: 2 },
        { type: 'tree', x: -10, z: -20, radius: 2 },
        { type: 'tree', x: 10, z: 25, radius: 3 },
        { type: 'tree', x: 10, z: -25, radius: 3 }
    ],

    gridOverlay: true,

    objectives: [
        {
            id: 'eliminate_all',
            type: 'eliminate',
            description: 'Eliminate all enemy combatants',
            target: 'all_enemies'
        }
    ]
};

// Export all maps
export const Maps = {
    'map01': Map01,
    'map02': Map02
};

export default Maps;
