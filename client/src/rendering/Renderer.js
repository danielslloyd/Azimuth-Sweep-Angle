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
    BULLET: 0xffffaa       // Bright tracer
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
            })
        };

        // Geometries (reusable)
        this.geometries = {
            unit: this.createUnitGeometry(),
            bullet: new THREE.SphereGeometry(0.2, 8, 8),
            explosion: new THREE.CircleGeometry(1, 32)
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

    // Add or update a unit
    updateUnit(unit) {
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
    }

    removeUnit(unitId) {
        const mesh = this.unitMeshes.get(unitId);
        if (mesh) {
            this.scene.remove(mesh);
            this.unitMeshes.delete(unitId);
        }
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
}

export { COLORS };
