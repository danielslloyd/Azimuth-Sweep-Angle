import { Unit, UnitState } from './Unit.js';

export const GamePhase = {
    BRIEFING: 'briefing',
    ACTIVE: 'active',
    VICTORY: 'victory',
    DEFEAT: 'defeat'
};

export class GameState {
    constructor() {
        this.phase = GamePhase.BRIEFING;
        this.friendlyUnits = [];
        this.enemyUnits = [];
        this.terrain = [];
        this.bullets = [];

        // Airstrike system
        this.airstrikeReady = true;
        this.airstrikeCooldown = 30; // seconds
        this.airstrikeTimer = 0;

        // Pending airstrike
        this.pendingAirstrike = null;

        // Time tracking
        this.gameTime = 0;
        this.lastUpdateTime = performance.now();

        // Callbacks
        this.onUnitKilled = null;
        this.onAirstrikeImpact = null;
        this.onBulletFired = null;
        this.onGameOver = null;
    }

    // Initialize a new mission
    initMission(mapData) {
        this.friendlyUnits = [];
        this.enemyUnits = [];
        this.terrain = mapData.terrain || [];
        this.phase = GamePhase.ACTIVE;
        this.gameTime = 0;

        // Spawn friendly squad
        mapData.friendlySpawns.forEach((spawn, index) => {
            const unit = new Unit(index, spawn.x, spawn.z, false);
            if (spawn.rotation !== undefined) {
                unit.rotation = spawn.rotation;
            }
            this.friendlyUnits.push(unit);
        });

        // Spawn enemies
        mapData.enemySpawns.forEach((spawn, index) => {
            const unit = new Unit(100 + index, spawn.x, spawn.z, true);
            if (spawn.rotation !== undefined) {
                unit.rotation = spawn.rotation;
            }
            this.enemyUnits.push(unit);
        });

        // Reset airstrike
        this.airstrikeReady = true;
        this.airstrikeTimer = 0;
    }

    // Main update loop
    update(currentTime) {
        const deltaTime = (currentTime - this.lastUpdateTime) / 1000;
        this.lastUpdateTime = currentTime;
        this.gameTime += deltaTime;

        if (this.phase !== GamePhase.ACTIVE) return;

        // Update airstrike cooldown
        if (!this.airstrikeReady) {
            this.airstrikeTimer -= deltaTime;
            if (this.airstrikeTimer <= 0) {
                this.airstrikeReady = true;
                this.airstrikeTimer = 0;
            }
        }

        // Process pending airstrike
        if (this.pendingAirstrike) {
            this.pendingAirstrike.delay -= deltaTime;
            if (this.pendingAirstrike.delay <= 0) {
                this.executeAirstrike(this.pendingAirstrike);
                this.pendingAirstrike = null;
            }
        }

        // Update friendly units
        this.friendlyUnits.forEach(unit => {
            unit.update(deltaTime, this.enemyUnits);

            // Try to fire
            const bullet = unit.tryFire(this.gameTime);
            if (bullet) {
                this.bullets.push(bullet);
                if (this.onBulletFired) {
                    this.onBulletFired(bullet);
                }

                // Process hit
                if (bullet.isHit) {
                    const target = this.enemyUnits.find(e => e.id === bullet.targetId);
                    if (target && target.alive) {
                        setTimeout(() => {
                            target.kill();
                            if (this.onUnitKilled) {
                                this.onUnitKilled(target);
                            }
                            this.checkVictoryConditions();
                        }, bullet.lifetime * 1000);
                    }
                }
            }
        });

        // Update enemy units
        this.enemyUnits.forEach(unit => {
            unit.update(deltaTime, this.friendlyUnits);

            // Try to fire
            const bullet = unit.tryFire(this.gameTime);
            if (bullet) {
                this.bullets.push(bullet);
                if (this.onBulletFired) {
                    this.onBulletFired(bullet);
                }

                // Process hit
                if (bullet.isHit) {
                    const target = this.friendlyUnits.find(f => f.id === bullet.targetId);
                    if (target && target.alive) {
                        setTimeout(() => {
                            target.kill();
                            if (this.onUnitKilled) {
                                this.onUnitKilled(target);
                            }
                            this.checkVictoryConditions();
                        }, bullet.lifetime * 1000);
                    }
                }
            }
        });

        // Clean up old bullets
        this.bullets = this.bullets.filter(b => b.lifetime > 0);
        this.bullets.forEach(b => b.lifetime -= deltaTime);
    }

    // Issue command to units
    issueCommand(command) {
        const { action, targets, gridCoord, params } = command;

        // Determine which units to command
        let targetUnits = [];

        if (targets === 'all' || targets === 'squad' || targets === 'alpha') {
            targetUnits = this.friendlyUnits.filter(u => u.alive);
        } else if (targets === 'alpha-1' || targets === '1') {
            targetUnits = this.friendlyUnits.filter(u => u.callsign === 'Alpha-1' && u.alive);
        } else if (targets === 'alpha-2' || targets === '2') {
            targetUnits = this.friendlyUnits.filter(u => u.callsign === 'Alpha-2' && u.alive);
        } else if (targets === 'alpha-3' || targets === '3') {
            targetUnits = this.friendlyUnits.filter(u => u.callsign === 'Alpha-3' && u.alive);
        } else if (targets === 'alpha-4' || targets === '4') {
            targetUnits = this.friendlyUnits.filter(u => u.callsign === 'Alpha-4' && u.alive);
        } else {
            // Default to all living units
            targetUnits = this.friendlyUnits.filter(u => u.alive);
        }

        // Execute action
        switch (action) {
            case 'move':
                if (gridCoord) {
                    targetUnits.forEach((unit, index) => {
                        // Spread units slightly when moving as a group
                        const offsetX = (index % 2 - 0.5) * 2;
                        const offsetZ = (Math.floor(index / 2) - 0.5) * 2;
                        unit.moveTo(
                            gridCoord.x + offsetX,
                            gridCoord.z + offsetZ
                        );
                    });
                    return {
                        success: true,
                        message: `${targetUnits.length} units moving to position`
                    };
                }
                break;

            case 'hold':
                targetUnits.forEach(unit => {
                    unit.hold();
                });
                return {
                    success: true,
                    message: `${targetUnits.length} units holding position`
                };

            case 'engage':
                targetUnits.forEach(unit => {
                    unit.engageOnSight = true;
                    unit.findAndEngageTarget(this.enemyUnits);
                });
                return {
                    success: true,
                    message: `${targetUnits.length} units engaging targets`
                };

            case 'cease_fire':
                targetUnits.forEach(unit => {
                    unit.engageOnSight = false;
                    unit.engagementTarget = null;
                });
                return {
                    success: true,
                    message: `${targetUnits.length} units holding fire`
                };

            case 'airstrike':
                return this.requestAirstrike(gridCoord, params?.type || 'precision');

            default:
                return {
                    success: false,
                    message: 'Unknown command'
                };
        }

        return { success: false, message: 'Invalid command parameters' };
    }

    // Request an airstrike
    requestAirstrike(gridCoord, type = 'precision') {
        if (!this.airstrikeReady) {
            return {
                success: false,
                message: `Airstrike on cooldown. ${Math.ceil(this.airstrikeTimer)} seconds remaining.`
            };
        }

        if (!gridCoord) {
            return {
                success: false,
                message: 'No coordinates specified for airstrike'
            };
        }

        // Start airstrike sequence
        const delay = type === 'cluster' ? 5 : 3; // seconds
        const radius = type === 'cluster' ? 12 : 6;

        this.pendingAirstrike = {
            x: gridCoord.x,
            z: gridCoord.z,
            type: type,
            radius: radius,
            delay: delay
        };

        this.airstrikeReady = false;
        this.airstrikeTimer = this.airstrikeCooldown;

        return {
            success: true,
            message: `Airstrike inbound. Impact in ${delay} seconds.`,
            impactTime: delay
        };
    }

    // Execute airstrike impact
    executeAirstrike(strike) {
        const { x, z, radius, type } = strike;

        // Check all units for damage
        const casualties = [];

        [...this.friendlyUnits, ...this.enemyUnits].forEach(unit => {
            if (unit.checkExplosionDamage(x, z, radius)) {
                casualties.push(unit);
                if (this.onUnitKilled) {
                    this.onUnitKilled(unit);
                }
            }
        });

        if (this.onAirstrikeImpact) {
            this.onAirstrikeImpact({
                x, z, radius, type,
                casualties: casualties
            });
        }

        this.checkVictoryConditions();

        return casualties;
    }

    // Check win/lose conditions
    checkVictoryConditions() {
        const livingFriendlies = this.friendlyUnits.filter(u => u.alive).length;
        const livingEnemies = this.enemyUnits.filter(u => u.alive).length;

        if (livingFriendlies === 0) {
            this.phase = GamePhase.DEFEAT;
            if (this.onGameOver) {
                this.onGameOver('defeat');
            }
        } else if (livingEnemies === 0) {
            this.phase = GamePhase.VICTORY;
            if (this.onGameOver) {
                this.onGameOver('victory');
            }
        }
    }

    // Get current squad status
    getSquadStatus() {
        return {
            living: this.friendlyUnits.filter(u => u.alive).length,
            total: this.friendlyUnits.length,
            units: this.friendlyUnits.map(u => u.getStatus())
        };
    }

    // Get airstrike status
    getAirstrikeStatus() {
        if (this.airstrikeReady) {
            return 'READY';
        } else if (this.pendingAirstrike) {
            return `INBOUND ${Math.ceil(this.pendingAirstrike.delay)}s`;
        } else {
            return `COOLDOWN ${Math.ceil(this.airstrikeTimer)}s`;
        }
    }

    // Get all units for rendering
    getAllUnits() {
        return [...this.friendlyUnits, ...this.enemyUnits];
    }
}
