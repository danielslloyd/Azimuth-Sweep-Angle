import * as THREE from 'three';

// IR/Thermal color palette
const COLORS = {
    COLD: 0x0a0a12,        // Dark blue-black (ground)
    MEDIUM: 0x404050,      // Medium gray (terrain/trees)
    WARM: 0x808090,        // Lighter gray
    HOT: 0xffffff,         // White (humans, vehicles)
    FRIENDLY: 0x00ff88,    // Teal-green (friendly markers)
    ENEMY: 0xff4444,       // Red (enemy markers)
    EXPLOSION: 0xffff00,   // Yellow-white (explosions)
    GRID: 0x1a1a2a,        // Subtle grid lines
    BULLET: 0xffffaa,      // Bright tracer
    IR_LASER: 0xff0000,    // Red IR laser
    FOV_FRIENDLY: 0x00ff88, // Friendly sight cone
    FOV_ENEMY: 0xff4444,   // Enemy sight cone
    DEBUG_MARKER: 0x00ffff, // Cyan debug markers
    AIRSTRIKE_TARGET: 0xff6600 // Orange airstrike marker
};

export class Renderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.width = window.innerWidth;
        this.height = window.innerHeight;

        // Three.js setup
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(COLORS.COLD);

        // Orthographic camera for top-down view
        const aspect = this.width / this.height;
        const viewSize = 50;
        this.camera = new THREE.OrthographicCamera(
            -viewSize * aspect, viewSize * aspect,
            viewSize, -viewSize,
            0.1, 1000
        );
        this.camera.position.set(0, 100, 0);
        this.camera.lookAt(0, 0, 0);

        // Renderer
        this.renderer = new THREE.WebGLRenderer({
            canvas: this.canvas,
            antialias: true
        });
        this.renderer.setSize(this.width, this.height);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

        // Object pools
        this.unitMeshes = new Map();
        this.bulletMeshes = [];
        this.explosionMeshes = [];
        this.terrainMeshes = [];

        // Visual overlays
        this.irLaserMeshes = new Map();      // IR lasers (always visible)
        this.hostileBoxMeshes = new Map();   // Red boxes around hostiles (always visible)
        this.fovMeshes = new Map();          // Debug: sight cones
        this.destinationMarkers = new Map(); // Debug: movement destinations
        this.airstrikeMarker = null;         // Debug: airstrike target

        // Debug mode
        this.debugMode = false;

        // Materials (reusable)
        this.materials = {
            friendly: new THREE.MeshBasicMaterial({ color: COLORS.HOT }),
            enemy: new THREE.MeshBasicMaterial({ color: COLORS.HOT }),
            terrain: new THREE.MeshBasicMaterial({ color: COLORS.MEDIUM }),
            bullet: new THREE.MeshBasicMaterial({ color: COLORS.BULLET }),
            explosion: new THREE.MeshBasicMaterial({
                color: COLORS.EXPLOSION,
                transparent: true,
                opacity: 1
            }),
            grid: new THREE.LineBasicMaterial({
                color: COLORS.GRID,
                transparent: true,
                opacity: 0.3
            }),
            irLaser: new THREE.LineBasicMaterial({
                color: COLORS.IR_LASER,
                transparent: true,
                opacity: 0.8,
                linewidth: 2
            }),
            hostileBox: new THREE.LineBasicMaterial({
                color: COLORS.ENEMY,
                transparent: true,
                opacity: 0.9,
                linewidth: 2
            }),
            fovFriendly: new THREE.MeshBasicMaterial({
                color: COLORS.FOV_FRIENDLY,
                transparent: true,
                opacity: 0.15,
                side: THREE.DoubleSide
            }),
            fovEnemy: new THREE.MeshBasicMaterial({
                color: COLORS.FOV_ENEMY,
                transparent: true,
                opacity: 0.15,
                side: THREE.DoubleSide
            }),
            destinationMarker: new THREE.MeshBasicMaterial({
                color: COLORS.DEBUG_MARKER,
                transparent: true,
                opacity: 0.6
            }),
            airstrikeMarker: new THREE.MeshBasicMaterial({
                color: COLORS.AIRSTRIKE_TARGET,
                transparent: true,
                opacity: 0.5
            })
        };

        // Geometries (reusable)
        this.geometries = {
            unit: this.createUnitGeometry(),
            bullet: new THREE.SphereGeometry(0.2, 8, 8),
            explosion: new THREE.CircleGeometry(1, 32),
            destinationMarker: this.createDestinationMarkerGeometry(),
            hostileBox: this.createHostileBoxGeometry()
        };

        this.setupGrid();
        this.setupLighting();
        this.handleResize();
    }

    createUnitGeometry() {
        // Simple human silhouette from above (circle with direction indicator)
        const shape = new THREE.Shape();
        shape.moveTo(0, 0.8);
        shape.lineTo(-0.4, -0.5);
        shape.lineTo(0, -0.3);
        shape.lineTo(0.4, -0.5);
        shape.closePath();

        const geometry = new THREE.ShapeGeometry(shape);
        geometry.rotateX(-Math.PI / 2);
        return geometry;
    }

    createDestinationMarkerGeometry() {
        // Diamond shape for destination marker
        const shape = new THREE.Shape();
        shape.moveTo(0, 1.5);
        shape.lineTo(1, 0);
        shape.lineTo(0, -1.5);
        shape.lineTo(-1, 0);
        shape.closePath();

        const geometry = new THREE.ShapeGeometry(shape);
        geometry.rotateX(-Math.PI / 2);
        return geometry;
    }

    createHostileBoxGeometry() {
        // Create a box outline geometry
        const size = 2.5;
        const points = [
            new THREE.Vector3(-size, 0, -size),
            new THREE.Vector3(size, 0, -size),
            new THREE.Vector3(size, 0, size),
            new THREE.Vector3(-size, 0, size),
            new THREE.Vector3(-size, 0, -size)
        ];
        return new THREE.BufferGeometry().setFromPoints(points);
    }

    createFOVGeometry(fovAngle, range) {
        // Create pie slice geometry for field of view
        const segments = 24;
        const shape = new THREE.Shape();

        shape.moveTo(0, 0);

        const halfAngle = fovAngle / 2;
        for (let i = 0; i <= segments; i++) {
            const angle = -halfAngle + (fovAngle * i / segments);
            const x = Math.sin(angle) * range;
            const y = Math.cos(angle) * range;
            shape.lineTo(x, y);
        }

        shape.lineTo(0, 0);

        const geometry = new THREE.ShapeGeometry(shape);
        geometry.rotateX(-Math.PI / 2);
        return geometry;
    }

    createIRLaserGeometry(length) {
        const points = [
            new THREE.Vector3(0, 0.3, 0),
            new THREE.Vector3(0, 0.3, length)
        ];
        return new THREE.BufferGeometry().setFromPoints(points);
    }

    setupGrid() {
        // Create tactical grid (10x10 cells labeled A-J, 1-10)
        const gridSize = 100;
        const cellSize = 10;
        const gridHelper = new THREE.GridHelper(
            gridSize,
            gridSize / cellSize,
            COLORS.GRID,
            COLORS.GRID
        );
        gridHelper.material.transparent = true;
        gridHelper.material.opacity = 0.2;
        this.scene.add(gridHelper);

        // Store grid info for coordinate lookup
        this.gridInfo = {
            size: gridSize,
            cellSize: cellSize,
            offset: gridSize / 2,
            columns: 'ABCDEFGHIJ'.split(''),
            rows: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
        };
    }

    setupLighting() {
        // Ambient light for uniform IR-style illumination
        const ambient = new THREE.AmbientLight(0xffffff, 1);
        this.scene.add(ambient);
    }

    handleResize() {
        window.addEventListener('resize', () => {
            this.width = window.innerWidth;
            this.height = window.innerHeight;

            const aspect = this.width / this.height;
            const viewSize = 50;

            this.camera.left = -viewSize * aspect;
            this.camera.right = viewSize * aspect;
            this.camera.top = viewSize;
            this.camera.bottom = -viewSize;
            this.camera.updateProjectionMatrix();

            this.renderer.setSize(this.width, this.height);
        });
    }

    // Toggle debug mode
    toggleDebugMode() {
        this.debugMode = !this.debugMode;

        // Update visibility of debug elements
        this.fovMeshes.forEach(mesh => {
            mesh.visible = this.debugMode;
        });

        this.destinationMarkers.forEach(mesh => {
            mesh.visible = this.debugMode;
        });

        if (this.airstrikeMarker) {
            this.airstrikeMarker.visible = this.debugMode;
        }

        return this.debugMode;
    }

    // Set debug mode directly
    setDebugMode(enabled) {
        this.debugMode = enabled;

        this.fovMeshes.forEach(mesh => {
            mesh.visible = this.debugMode;
        });

        this.destinationMarkers.forEach(mesh => {
            mesh.visible = this.debugMode;
        });

        if (this.airstrikeMarker) {
            this.airstrikeMarker.visible = this.debugMode;
        }
    }

    // Convert grid coordinate (e.g., "C5") to world position
    gridToWorld(gridCoord) {
        const col = gridCoord.charAt(0).toUpperCase();
        const row = parseInt(gridCoord.slice(1));

        const colIndex = this.gridInfo.columns.indexOf(col);
        const rowIndex = row - 1;

        if (colIndex === -1 || rowIndex < 0 || rowIndex >= 10) {
            return null;
        }

        const x = (colIndex - 4.5) * this.gridInfo.cellSize;
        const z = (rowIndex - 4.5) * this.gridInfo.cellSize;

        return { x, z };
    }

    // Convert world position to grid coordinate
    worldToGrid(x, z) {
        const colIndex = Math.floor((x + this.gridInfo.offset) / this.gridInfo.cellSize);
        const rowIndex = Math.floor((z + this.gridInfo.offset) / this.gridInfo.cellSize);

        if (colIndex < 0 || colIndex >= 10 || rowIndex < 0 || rowIndex >= 10) {
            return null;
        }

        return this.gridInfo.columns[colIndex] + this.gridInfo.rows[rowIndex];
    }

    // Add or update a unit with all visual elements
    updateUnit(unit) {
        // Update main unit mesh
        let mesh = this.unitMeshes.get(unit.id);

        if (!mesh) {
            const material = unit.isEnemy ?
                this.materials.enemy.clone() :
                this.materials.friendly.clone();

            mesh = new THREE.Mesh(this.geometries.unit, material);
            mesh.scale.set(1.5, 1, 1.5);
            this.scene.add(mesh);
            this.unitMeshes.set(unit.id, mesh);
        }

        mesh.position.set(unit.x, 0.1, unit.z);
        mesh.rotation.y = -unit.rotation;
        mesh.visible = unit.alive;

        // Pulse effect for selected units
        if (unit.selected) {
            const pulse = 0.8 + Math.sin(Date.now() * 0.01) * 0.2;
            mesh.material.color.setHex(unit.isEnemy ? COLORS.ENEMY : COLORS.FRIENDLY);
            mesh.scale.set(1.5 * pulse, 1, 1.5 * pulse);
        } else {
            mesh.material.color.setHex(COLORS.HOT);
            mesh.scale.set(1.5, 1, 1.5);
        }

        // Update IR laser (always visible for living units)
        this.updateIRLaser(unit);

        // Update hostile box (always visible for enemies)
        if (unit.isEnemy) {
            this.updateHostileBox(unit);
        }

        // Update FOV cone (debug only)
        this.updateFOV(unit);

        // Update destination marker (debug only, for friendlies with targets)
        if (!unit.isEnemy) {
            this.updateDestinationMarker(unit);
        }
    }

    // Update IR laser beam from unit
    updateIRLaser(unit) {
        let laserLine = this.irLaserMeshes.get(unit.id);

        if (!laserLine) {
            const geometry = this.createIRLaserGeometry(unit.sightRange || 30);
            laserLine = new THREE.Line(geometry, this.materials.irLaser.clone());
            this.scene.add(laserLine);
            this.irLaserMeshes.set(unit.id, laserLine);
        }

        laserLine.position.set(unit.x, 0, unit.z);
        laserLine.rotation.y = -unit.rotation;
        laserLine.visible = unit.alive;

        // Flicker effect for IR laser
        const flicker = 0.6 + Math.random() * 0.4;
        laserLine.material.opacity = flicker * 0.8;
    }

    // Update red box around hostile
    updateHostileBox(unit) {
        let boxLine = this.hostileBoxMeshes.get(unit.id);

        if (!boxLine) {
            boxLine = new THREE.Line(this.geometries.hostileBox.clone(), this.materials.hostileBox.clone());
            this.scene.add(boxLine);
            this.hostileBoxMeshes.set(unit.id, boxLine);
        }

        boxLine.position.set(unit.x, 0.15, unit.z);
        boxLine.visible = unit.alive;

        // Pulsing effect
        const pulse = 0.7 + Math.sin(Date.now() * 0.005) * 0.3;
        boxLine.material.opacity = pulse;
    }

    // Update FOV cone (debug visual)
    updateFOV(unit) {
        let fovMesh = this.fovMeshes.get(unit.id);

        if (!fovMesh) {
            const fovAngle = unit.fovAngle || (Math.PI / 2.5);
            const range = unit.sightRange || 30;
            const geometry = this.createFOVGeometry(fovAngle, range);
            const material = unit.isEnemy ?
                this.materials.fovEnemy.clone() :
                this.materials.fovFriendly.clone();

            fovMesh = new THREE.Mesh(geometry, material);
            this.scene.add(fovMesh);
            this.fovMeshes.set(unit.id, fovMesh);
        }

        fovMesh.position.set(unit.x, 0.05, unit.z);
        fovMesh.rotation.y = -unit.rotation;
        fovMesh.visible = this.debugMode && unit.alive;

        // Subtle animation for FOV sweep effect
        const sweep = Math.sin(Date.now() * 0.002) * 0.05;
        fovMesh.material.opacity = 0.12 + sweep;
    }

    // Update destination marker (debug visual)
    updateDestinationMarker(unit) {
        let marker = this.destinationMarkers.get(unit.id);

        const hasDestination = unit.targetX !== null && unit.targetZ !== null;

        if (!marker) {
            marker = new THREE.Mesh(
                this.geometries.destinationMarker,
                this.materials.destinationMarker.clone()
            );
            this.scene.add(marker);
            this.destinationMarkers.set(unit.id, marker);
        }

        if (hasDestination) {
            marker.position.set(unit.targetX, 0.1, unit.targetZ);
            marker.visible = this.debugMode;

            // Pulsing animation
            const pulse = 0.8 + Math.sin(Date.now() * 0.008) * 0.2;
            marker.scale.set(pulse, 1, pulse);
            marker.material.opacity = 0.4 + Math.sin(Date.now() * 0.006) * 0.2;

            // Draw line from unit to destination
            this.updatePathLine(unit);
        } else {
            marker.visible = false;
            this.removePathLine(unit.id);
        }
    }

    // Path line from unit to destination
    updatePathLine(unit) {
        const lineId = `path_${unit.id}`;
        let line = this.scene.getObjectByName(lineId);

        if (!line) {
            const material = new THREE.LineDashedMaterial({
                color: COLORS.DEBUG_MARKER,
                transparent: true,
                opacity: 0.5,
                dashSize: 1,
                gapSize: 0.5
            });
            const geometry = new THREE.BufferGeometry();
            line = new THREE.Line(geometry, material);
            line.name = lineId;
            this.scene.add(line);
        }

        const points = [
            new THREE.Vector3(unit.x, 0.1, unit.z),
            new THREE.Vector3(unit.targetX, 0.1, unit.targetZ)
        ];
        line.geometry.setFromPoints(points);
        line.computeLineDistances();
        line.visible = this.debugMode;
    }

    removePathLine(unitId) {
        const lineId = `path_${unitId}`;
        const line = this.scene.getObjectByName(lineId);
        if (line) {
            line.visible = false;
        }
    }

    // Set airstrike target marker (debug visual)
    setAirstrikeTarget(x, z, radius) {
        if (!this.airstrikeMarker) {
            // Create airstrike target marker - concentric circles
            const group = new THREE.Group();

            // Outer circle
            const outerGeometry = new THREE.RingGeometry(radius - 0.5, radius, 32);
            outerGeometry.rotateX(-Math.PI / 2);
            const outerMesh = new THREE.Mesh(outerGeometry, this.materials.airstrikeMarker.clone());
            group.add(outerMesh);

            // Inner circle
            const innerGeometry = new THREE.RingGeometry(radius * 0.4, radius * 0.5, 32);
            innerGeometry.rotateX(-Math.PI / 2);
            const innerMesh = new THREE.Mesh(innerGeometry, this.materials.airstrikeMarker.clone());
            group.add(innerMesh);

            // Center dot
            const centerGeometry = new THREE.CircleGeometry(0.5, 16);
            centerGeometry.rotateX(-Math.PI / 2);
            const centerMesh = new THREE.Mesh(centerGeometry, this.materials.airstrikeMarker.clone());
            group.add(centerMesh);

            // Cross hairs
            const crossMaterial = new THREE.LineBasicMaterial({
                color: COLORS.AIRSTRIKE_TARGET,
                transparent: true,
                opacity: 0.7
            });

            const hPoints = [
                new THREE.Vector3(-radius, 0, 0),
                new THREE.Vector3(radius, 0, 0)
            ];
            const hGeometry = new THREE.BufferGeometry().setFromPoints(hPoints);
            const hLine = new THREE.Line(hGeometry, crossMaterial);
            group.add(hLine);

            const vPoints = [
                new THREE.Vector3(0, 0, -radius),
                new THREE.Vector3(0, 0, radius)
            ];
            const vGeometry = new THREE.BufferGeometry().setFromPoints(vPoints);
            const vLine = new THREE.Line(vGeometry, crossMaterial);
            group.add(vLine);

            this.airstrikeMarker = group;
            this.scene.add(this.airstrikeMarker);
        }

        this.airstrikeMarker.position.set(x, 0.2, z);
        this.airstrikeMarker.visible = this.debugMode;

        // Store for radius updates
        this.airstrikeMarker.userData = { x, z, radius };
    }

    // Clear airstrike target marker
    clearAirstrikeTarget() {
        if (this.airstrikeMarker) {
            this.airstrikeMarker.visible = false;
        }
    }

    // Update airstrike marker animation
    updateAirstrikeMarker() {
        if (this.airstrikeMarker && this.airstrikeMarker.visible) {
            // Rotation animation
            this.airstrikeMarker.rotation.y += 0.02;

            // Pulsing animation
            const pulse = 0.8 + Math.sin(Date.now() * 0.01) * 0.2;
            this.airstrikeMarker.children.forEach(child => {
                if (child.material) {
                    child.material.opacity = pulse * 0.6;
                }
            });
        }
    }

    removeUnit(unitId) {
        // Remove main mesh
        const mesh = this.unitMeshes.get(unitId);
        if (mesh) {
            this.scene.remove(mesh);
            this.unitMeshes.delete(unitId);
        }

        // Remove IR laser
        const laser = this.irLaserMeshes.get(unitId);
        if (laser) {
            this.scene.remove(laser);
            this.irLaserMeshes.delete(unitId);
        }

        // Remove hostile box
        const box = this.hostileBoxMeshes.get(unitId);
        if (box) {
            this.scene.remove(box);
            this.hostileBoxMeshes.delete(unitId);
        }

        // Remove FOV
        const fov = this.fovMeshes.get(unitId);
        if (fov) {
            this.scene.remove(fov);
            this.fovMeshes.delete(unitId);
        }

        // Remove destination marker
        const dest = this.destinationMarkers.get(unitId);
        if (dest) {
            this.scene.remove(dest);
            this.destinationMarkers.delete(unitId);
        }

        // Remove path line
        this.removePathLine(unitId);
    }

    // Add terrain elements
    addTerrain(terrain) {
        terrain.forEach(item => {
            let geometry;

            if (item.type === 'tree') {
                geometry = new THREE.CircleGeometry(item.radius || 2, 16);
            } else if (item.type === 'building') {
                geometry = new THREE.PlaneGeometry(
                    item.width || 5,
                    item.height || 5
                );
            } else if (item.type === 'cover') {
                geometry = new THREE.PlaneGeometry(
                    item.width || 3,
                    item.height || 1
                );
            }

            geometry.rotateX(-Math.PI / 2);

            const mesh = new THREE.Mesh(geometry, this.materials.terrain);
            mesh.position.set(item.x, 0.05, item.z);
            if (item.rotation) {
                mesh.rotation.y = item.rotation;
            }

            this.scene.add(mesh);
            this.terrainMeshes.push(mesh);
        });
    }

    // Create bullet tracer
    addBullet(bullet) {
        const mesh = new THREE.Mesh(
            this.geometries.bullet,
            this.materials.bullet.clone()
        );
        mesh.position.set(bullet.x, 0.5, bullet.z);
        mesh.userData = { ...bullet };

        this.scene.add(mesh);
        this.bulletMeshes.push(mesh);

        return mesh;
    }

    updateBullets(deltaTime) {
        this.bulletMeshes = this.bulletMeshes.filter(mesh => {
            const bullet = mesh.userData;

            // Move bullet
            mesh.position.x += bullet.vx * deltaTime;
            mesh.position.z += bullet.vz * deltaTime;

            // Check if bullet is out of bounds or expired
            bullet.lifetime -= deltaTime;

            if (bullet.lifetime <= 0 ||
                Math.abs(mesh.position.x) > 60 ||
                Math.abs(mesh.position.z) > 60) {
                this.scene.remove(mesh);
                return false;
            }

            return true;
        });
    }

    // Create explosion effect
    addExplosion(x, z, radius = 5) {
        const material = this.materials.explosion.clone();
        const geometry = new THREE.CircleGeometry(radius, 32);
        geometry.rotateX(-Math.PI / 2);

        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(x, 0.2, z);
        mesh.userData = {
            lifetime: 1.5,
            maxLifetime: 1.5,
            radius: radius
        };

        this.scene.add(mesh);
        this.explosionMeshes.push(mesh);

        return mesh;
    }

    updateExplosions(deltaTime) {
        this.explosionMeshes = this.explosionMeshes.filter(mesh => {
            mesh.userData.lifetime -= deltaTime;

            const progress = 1 - (mesh.userData.lifetime / mesh.userData.maxLifetime);

            // Expand and fade
            const scale = 1 + progress * 2;
            mesh.scale.set(scale, 1, scale);
            mesh.material.opacity = 1 - progress;

            if (mesh.userData.lifetime <= 0) {
                this.scene.remove(mesh);
                return false;
            }

            return true;
        });
    }

    // Camera controls
    panCamera(dx, dz) {
        this.camera.position.x += dx;
        this.camera.position.z += dz;
    }

    zoomCamera(delta) {
        const currentSize = this.camera.top;
        const newSize = Math.max(20, Math.min(100, currentSize + delta));
        const aspect = this.width / this.height;

        this.camera.left = -newSize * aspect;
        this.camera.right = newSize * aspect;
        this.camera.top = newSize;
        this.camera.bottom = -newSize;
        this.camera.updateProjectionMatrix();
    }

    render(deltaTime) {
        this.updateBullets(deltaTime);
        this.updateExplosions(deltaTime);
        this.updateAirstrikeMarker();
        this.renderer.render(this.scene, this.camera);
    }

    // Get grid position under mouse (for debugging)
    getGridAtMouse(mouseX, mouseY) {
        const x = (mouseX / this.width) * 2 - 1;
        const y = -(mouseY / this.height) * 2 + 1;

        const viewSize = this.camera.top;
        const aspect = this.width / this.height;

        const worldX = x * viewSize * aspect + this.camera.position.x;
        const worldZ = -y * viewSize + this.camera.position.z;

        return this.worldToGrid(worldX, worldZ);
    }

    // Check if debug mode is enabled
    isDebugMode() {
        return this.debugMode;
    }
}

export { COLORS };
