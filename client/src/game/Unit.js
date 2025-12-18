// Unit states
export const UnitState = {
    IDLE: 'idle',
    MOVING: 'moving',
    ENGAGING: 'engaging',
    TAKING_COVER: 'taking_cover',
    DEAD: 'dead'
};

// Callsigns for squad members
const CALLSIGNS = ['Alpha-1', 'Alpha-2', 'Alpha-3', 'Alpha-4'];
const ENEMY_CALLSIGNS = ['Tango', 'Hostile', 'Bogey', 'Contact'];

export class Unit {
    constructor(id, x, z, isEnemy = false) {
        this.id = id;
        this.x = x;
        this.z = z;
        this.rotation = 0;
        this.isEnemy = isEnemy;
        this.alive = true;
        this.selected = false;
        this.state = UnitState.IDLE;

        // Movement
        this.targetX = null;
        this.targetZ = null;
        this.speed = isEnemy ? 8 : 10; // Units per second
        this.path = [];

        // Combat
        this.engagementTarget = null;
        this.lastFireTime = 0;
        this.fireRate = isEnemy ? 1.5 : 1.0; // Shots per second
        this.accuracy = isEnemy ? 0.15 : 0.25; // Hit probability

        // Callsign
        this.callsign = isEnemy ?
            ENEMY_CALLSIGNS[id % ENEMY_CALLSIGNS.length] + '-' + (Math.floor(id / ENEMY_CALLSIGNS.length) + 1) :
            CALLSIGNS[id % CALLSIGNS.length];

        // Behaviors
        this.holdPosition = false;
        this.engageOnSight = true;

        // Vision/FOV
        this.fovAngle = Math.PI / 2.5; // ~72 degrees field of view
        this.sightRange = 30; // Visual range in units
    }

    // Move towards target
    moveTo(x, z) {
        this.targetX = x;
        this.targetZ = z;
        this.state = UnitState.MOVING;
        this.holdPosition = false;
    }

    // Hold current position
    hold() {
        this.targetX = null;
        this.targetZ = null;
        this.state = UnitState.IDLE;
        this.holdPosition = true;
    }

    // Update unit position and state
    update(deltaTime, enemies, coverPositions) {
        if (!this.alive) return;

        // Update position if moving
        if (this.targetX !== null && this.targetZ !== null) {
            const dx = this.targetX - this.x;
            const dz = this.targetZ - this.z;
            const dist = Math.sqrt(dx * dx + dz * dz);

            if (dist > 0.5) {
                // Move towards target
                const moveSpeed = this.speed * deltaTime;
                const moveRatio = Math.min(moveSpeed / dist, 1);

                this.x += dx * moveRatio;
                this.z += dz * moveRatio;

                // Face movement direction
                this.rotation = Math.atan2(dx, dz);
            } else {
                // Reached target
                this.x = this.targetX;
                this.z = this.targetZ;
                this.targetX = null;
                this.targetZ = null;
                this.state = UnitState.IDLE;
            }
        }

        // Check for engagement targets
        if (this.engageOnSight && enemies && enemies.length > 0) {
            this.findAndEngageTarget(enemies);
        }
    }

    // Find nearest enemy and engage
    findAndEngageTarget(enemies) {
        if (!this.alive) return;

        const livingEnemies = enemies.filter(e => e.alive);
        if (livingEnemies.length === 0) {
            this.engagementTarget = null;
            return;
        }

        // Find closest enemy within range (30 units)
        let closest = null;
        let closestDist = 30;

        livingEnemies.forEach(enemy => {
            const dx = enemy.x - this.x;
            const dz = enemy.z - this.z;
            const dist = Math.sqrt(dx * dx + dz * dz);

            if (dist < closestDist) {
                closestDist = dist;
                closest = enemy;
            }
        });

        this.engagementTarget = closest;

        if (closest) {
            // Face the target
            const dx = closest.x - this.x;
            const dz = closest.z - this.z;
            this.rotation = Math.atan2(dx, dz);

            if (this.state !== UnitState.MOVING) {
                this.state = UnitState.ENGAGING;
            }
        }
    }

    // Try to fire at engagement target
    tryFire(currentTime) {
        if (!this.alive || !this.engagementTarget || !this.engagementTarget.alive) {
            return null;
        }

        const timeSinceLastFire = currentTime - this.lastFireTime;
        const fireInterval = 1 / this.fireRate;

        if (timeSinceLastFire < fireInterval) {
            return null;
        }

        this.lastFireTime = currentTime;

        // Calculate bullet trajectory
        const dx = this.engagementTarget.x - this.x;
        const dz = this.engagementTarget.z - this.z;
        const dist = Math.sqrt(dx * dx + dz * dz);

        // Determine if hit (probabilistic)
        const hitRoll = Math.random();
        const adjustedAccuracy = this.accuracy * (1 - dist / 60); // Accuracy decreases with distance
        const isHit = hitRoll < adjustedAccuracy;

        // Bullet velocity
        const bulletSpeed = 80;
        const vx = (dx / dist) * bulletSpeed;
        const vz = (dz / dist) * bulletSpeed;

        return {
            x: this.x,
            z: this.z,
            vx: vx,
            vz: vz,
            targetId: this.engagementTarget.id,
            isHit: isHit,
            lifetime: dist / bulletSpeed + 0.1
        };
    }

    // Kill this unit
    kill() {
        this.alive = false;
        this.state = UnitState.DEAD;
        this.targetX = null;
        this.targetZ = null;
        this.engagementTarget = null;
    }

    // Check if within explosion radius
    checkExplosionDamage(explosionX, explosionZ, radius) {
        if (!this.alive) return false;

        const dx = explosionX - this.x;
        const dz = explosionZ - this.z;
        const dist = Math.sqrt(dx * dx + dz * dz);

        // Kill probability based on distance from center
        if (dist < radius) {
            const killChance = 1 - (dist / radius) * 0.5;
            if (Math.random() < killChance) {
                this.kill();
                return true;
            }
        }

        return false;
    }

    // Get status for display
    getStatus() {
        return {
            callsign: this.callsign,
            state: this.state,
            alive: this.alive,
            position: { x: this.x, z: this.z },
            hasTarget: this.engagementTarget !== null
        };
    }
}
