import * as THREE from 'three';
import { findPathAStar } from '../../utils.js';

export class MonsterController {
    constructor(game) {
        this.game = game;
        
        // Migration of states from game
        this.path = [];
        this.currentPathIndex = 0;
        this.lastPathUpdateTime = 0;
        this.targetPosition = null;
        this.stuckTime = 0;
        this.lastPosition = new THREE.Vector3();
        
        // Settings
        this.radius = 0.25; // For circle-vs-wall sliding logic
        this.waypointThreshold = 0.15; // How close to get to waypoint before next
        this.recalculateInterval = 250; 
        this.stuckRecalculateInterval = 100;
    }

    update(delta) {
        const game = this.game;
        if (!game.monsterSpawned || !game.monster || game.isGameOver) return;
        
        // 1. Performance Updates
        this.updatePerformance();
        
        // 2. Visual Effects (Crouch, Pulse, Float)
        this.updateEffects(delta);
        
        // 3. Look at Player (Smooth rotation)
        this.updateRotation(delta);
        
        // 4. Movement & Pathfinding
        this.updateMovement(delta);
        
        // 5. Check Game Over
        const distToPlayer = game.camera.position.distanceTo(game.monster.position);
        if (distToPlayer < 0.6) {
            game.handleGameOver();
        }
    }

    updatePerformance() {
        const game = this.game;
        // Keep monster visible. Future distance optimizations go here.
        game.monster.visible = true;
        game.monsterLight.intensity = 2;
        game.monsterLight.castShadow = true;
    }

    updateEffects(delta) {
        const game = this.game;
        const timeOffset = Date.now() / 200;
        const nightLowering = game.level > 2 ? 0.1 : 0;
        
        const needsToCrouch = this.checkCrouchNeed();
        game.monsterTargetCrouchHeight = needsToCrouch ? 0.25 : 0;
        
        if (Math.abs(game.monsterCrouchHeight - game.monsterTargetCrouchHeight) > 0.01) {
            const crouchDiff = game.monsterTargetCrouchHeight - game.monsterCrouchHeight;
            game.monsterCrouchHeight += crouchDiff * game.monsterCrouchSpeed * delta;
        } else {
            game.monsterCrouchHeight = game.monsterTargetCrouchHeight;
        }
        
        // Ghostly floating
        game.monster.position.y = 0.6 + Math.sin(timeOffset) * 0.15 - nightLowering - game.monsterCrouchHeight;

        // Subtle scale pulse (ghost breathing)
        const pulseScale = 1.0 + Math.sin(Date.now() / 400) * 0.05; 
        
        // Glow pulsation
        const glowLight = game.monster.children.find(child => child.isPointLight);
        if (glowLight) {
            const pulseIntensity = 2.0 + Math.sin(Date.now() / 300) * 0.5;
            glowLight.intensity = pulseIntensity;
        }
        
        const crouchScale = 1.0 - (game.monsterCrouchHeight * 0.15);
        const finalScale = pulseScale * crouchScale;
        game.monster.scale.set(finalScale, finalScale, finalScale);
    }

    updateRotation(delta) {
        const game = this.game;
        const dxToCam = game.camera.position.x - game.monster.position.x;
        const dzToCam = game.camera.position.z - game.monster.position.z;
        const targetRot = Math.atan2(dxToCam, dzToCam);
        
        let diff = targetRot - game.monster.rotation.y;
        while (diff < -Math.PI) diff += Math.PI * 2;
        while (diff > Math.PI) diff -= Math.PI * 2;
        
        game.monster.rotation.y += diff * 6.0 * delta;
    }

    updateMovement(delta) {
        const game = this.game;
        const monsterPos = game.monster.position;
        const playerPos = game.camera.position;

        const dx = playerPos.x - monsterPos.x;
        const dz = playerPos.z - monsterPos.z;
        const distToPlayer = Math.sqrt(dx * dx + dz * dz);
        
        if (distToPlayer <= 0.05) return;

        let targetX, targetZ;
        const hasLOS = game.checkLineOfSight(monsterPos.x, monsterPos.z, playerPos.x, playerPos.z);
        
        if (hasLOS) {
            // Direct LOS
            targetX = playerPos.x;
            targetZ = playerPos.z;
            this.path = []; // invalidates path
        } else {
            // Pathfinding needed
            const now = performance.now();
            const isLikelyStuck = this.stuckTime > 0.5;
            const recalcLimit = isLikelyStuck ? this.stuckRecalculateInterval : this.recalculateInterval;
            
            if (now - this.lastPathUpdateTime > recalcLimit) {
                this.recalculateAStarPath();
                this.lastPathUpdateTime = now;
            }

            if (this.targetPosition) {
                targetX = this.targetPosition.x;
                targetZ = this.targetPosition.z;
                
                // Advance waypoint if close
                const waypointDist = Math.sqrt(
                    Math.pow(targetX - monsterPos.x, 2) + Math.pow(targetZ - monsterPos.z, 2)
                );
                
                if (waypointDist < this.waypointThreshold) {
                    this.currentPathIndex++;
                    this.updateTargetFromPath();
                    // Retarget immediately to new waypoint
                    if (this.targetPosition) {
                        targetX = this.targetPosition.x;
                        targetZ = this.targetPosition.z;
                    }
                }
            } else {
                // Fallback to direct homing if no path can be found (prevent idle lock)
                targetX = playerPos.x;
                targetZ = playerPos.z;
            }
        }

        // --- Move Character ---
        const moveDx = targetX - monsterPos.x;
        const moveDz = targetZ - monsterPos.z;
        const moveDist = Math.sqrt(moveDx * moveDx + moveDz * moveDz);

        if (moveDist > 0.01) {
            const currentSpeed = game.monsterCrouchHeight > 0.01 ? game.monsterSpeed * 0.85 : game.monsterSpeed;
            
            // Intended displacement step
            let stepX = (moveDx / moveDist) * currentSpeed * delta;
            let stepZ = (moveDz / moveDist) * currentSpeed * delta;

            this.lastPosition.copy(monsterPos);

            // True Circle-vs-Grid Collision & Sliding
            const newPos = this.slideCollision(monsterPos.x, monsterPos.z, stepX, stepZ);
            monsterPos.x = newPos.x;
            monsterPos.z = newPos.z;

            // Stuck detection & recovery 
            const distMoved = Math.sqrt(
                Math.pow(monsterPos.x - this.lastPosition.x, 2) + 
                Math.pow(monsterPos.z - this.lastPosition.z, 2)
            );
            
            // If moved < 20% of expected speed
            if (distMoved < currentSpeed * delta * 0.2) {
                this.stuckTime += delta;
                if (this.stuckTime > 1.0) {
                    // Forcefully push out to cell center
                    const cellX = Math.floor(monsterPos.x + 0.5);
                    const cellZ = Math.floor(monsterPos.z + 0.5);
                    monsterPos.x += (cellX - monsterPos.x) * 0.2;
                    monsterPos.z += (cellZ - monsterPos.z) * 0.2;
                    
                    if (distToPlayer > 2.0) {
                        this.lastPathUpdateTime = 0; // force immediate recalc
                    }
                }
            } else {
                this.stuckTime = 0;
            }
        }
    }

    // Advanced Circle-vs-AABB physics to permit smooth corner sliding
    slideCollision(x, z, stepX, stepZ) {
        // Try precise diagonal first
        if (!this.isColliding(x + stepX, z + stepZ)) {
            return { x: x + stepX, z: z + stepZ };
        }

        // SLIDING ALONG X OR Z
        let finalX = x;
        let finalZ = z;

        const canMoveX = !this.isColliding(x + stepX, z);
        const canMoveZ = !this.isColliding(x, z + stepZ);

        if (canMoveX) {
            finalX += stepX * 1.1; // Boost slightly for sliding friction loss
        } else if (canMoveZ) {
            finalZ += stepZ * 1.1; 
        } else {
            // Try single axis half-step
            if (!this.isColliding(x + stepX * 0.5, z)) finalX += stepX * 0.5;
            if (!this.isColliding(x, z + stepZ * 0.5)) finalZ += stepZ * 0.5;
        }

        return { x: finalX, z: finalZ };
    }

    isColliding(x, z) {
        const game = this.game;
        // Check 8 points around circumference
        const offsets = [
            { x: this.radius, z: 0 },
            { x: -this.radius, z: 0 },
            { x: 0, z: this.radius },
            { x: 0, z: -this.radius },
            { x: this.radius * 0.7, z: this.radius * 0.7 },
            { x: -this.radius * 0.7, z: this.radius * 0.7 },
            { x: this.radius * 0.7, z: -this.radius * 0.7 },
            { x: -this.radius * 0.7, z: -this.radius * 0.7 }
        ];

        for (const off of offsets) {
            const checkX = Math.floor(x + off.x + 0.5);
            const checkZ = Math.floor(z + off.z + 0.5);
            
            if (checkX < 0 || checkX >= game.mazeSize || checkZ < 0 || checkZ >= game.mazeSize) {
                return true; // Map bounds
            }
            if (game.grid[checkZ][checkX] === 1) { // 1 is wall. 4 is crouch beam (passable)
                return true;
            }
        }
        return false;
    }

    recalculateAStarPath() {
        const game = this.game;
        const currentCellX = Math.floor(game.monster.position.x + 0.5);
        const currentCellZ = Math.floor(game.monster.position.z + 0.5);
        const playerCellX = Math.floor(game.camera.position.x + 0.5);
        const playerCellZ = Math.floor(game.camera.position.z + 0.5);
        
        const newPath = findPathAStar(
            game.grid, game.mazeSize, game.mazeSize,
            currentCellX, currentCellZ,
            playerCellX, playerCellZ,
            true
        );
        
        if (newPath.length > 0) {
            this.path = newPath;
            this.currentPathIndex = 0;
            if (this.path.length > 1) {
                // If the first waypoint is our current cell, skip to next to avoid walking backward
                const distToFirst = Math.sqrt(
                    Math.pow(this.path[0][0] - game.monster.position.x, 2) +
                    Math.pow(this.path[0][1] - game.monster.position.z, 2)
                );
                if (distToFirst < 0.5) this.currentPathIndex = 1; 
            }
            this.updateTargetFromPath();
        }
    }

    updateTargetFromPath() {
        if (this.path.length > 0 && this.currentPathIndex < this.path.length) {
            const targetCell = this.path[this.currentPathIndex];
            this.targetPosition = new THREE.Vector3(targetCell[0], 0.5, targetCell[1]);
        } else {
            this.targetPosition = null;
        }
    }

    checkCrouchNeed() {
        const game = this.game;
        const checkDistance = 1.5;
        const monsterX = game.monster.position.x;
        const monsterZ = game.monster.position.z;
        
        const dx = game.camera.position.x - monsterX;
        const dz = game.camera.position.z - monsterZ;
        const dist = Math.sqrt(dx * dx + dz * dz);
        
        if (dist < 0.01) return false;
        
        const dirX = (dx / dist) * checkDistance;
        const dirZ = (dz / dist) * checkDistance;
        
        const checkPoints = [
            {x: monsterX + dirX * 0.5, z: monsterZ + dirZ * 0.5},
            {x: monsterX + dirX, z: monsterZ + dirZ},
            {x: monsterX + dirX * 1.5, z: monsterZ + dirZ * 1.5}
        ];
        
        for (const point of checkPoints) {
            const cellX = Math.floor(point.x + 0.5);
            const cellZ = Math.floor(point.z + 0.5);
            if (cellX >= 0 && cellX < game.mazeSize && cellZ >= 0 && cellZ < game.mazeSize) {
                if (game.grid[cellZ][cellX] === 4) { // 4 is crouch beam
                    return true;
                }
            }
        }
        return false;
    }
}
