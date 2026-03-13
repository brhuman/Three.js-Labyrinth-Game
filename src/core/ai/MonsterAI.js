import * as THREE from 'three';
import { findPathAStar } from '../../utils.js';

export class MonsterAI {
    constructor(options = {}) {
        // Path caching
        this.pathCache = new Map();
        this.maxCacheSize = options.maxCacheSize || 1000;
        this.cacheHitCount = 0;
        this.cacheMissCount = 0;
        
        // Update throttling
        this.lastUpdateTime = 0;
        this.updateInterval = options.updateInterval || 500; // ms
        this.pathRecalculationInterval = options.pathRecalculationInterval || 2000; // ms
        
        // AI behavior
        this.detectionRange = options.detectionRange || 15;
        this.attackRange = options.attackRange || 2;
        this.lostTargetTime = options.lostTargetTime || 5000; // ms
        
        // Movement
        this.baseSpeed = options.baseSpeed || 2.0;
        this.chaseSpeed = options.chaseSpeed || 3.0;
        this.patrolSpeed = options.patrolSpeed || 1.0;
        
        // State
        this.state = 'idle';
        this.target = null;
        this.currentTargetIndex = 0;
        this.path = [];
        this.lastPathCalculation = 0;
        this.stuckTimer = 0;
        this.stuckThreshold = options.stuckThreshold || 3000; // ms
        this.lastPosition = new THREE.Vector3();
        
        // Memory
        this.lastKnownPlayerPosition = null;
        this.playerLostTime = 0;
        this.investigationPoints = [];
        
        // Behavior modifiers
        this.aggressiveness = options.aggressiveness || 1.0;
        this.caution = options.caution || 0.5;
        this.persistence = options.persistence || 1.0;
        
        // Performance tracking
        this.performanceStats = {
            pathCalculations: 0,
            cacheHits: 0,
            cacheMisses: 0,
            averagePathLength: 0,
            stateChanges: 0
        };
    }

    update(monster, player, maze, currentTime) {
        // Throttle updates for performance
        if (currentTime - this.lastUpdateTime < this.updateInterval) {
            return;
        }
        
        this.lastUpdateTime = currentTime;
        
        // Update state machine
        this.updateState(monster, player, maze, currentTime);
        
        // Execute current state behavior
        this.executeState(monster, player, maze, currentTime);
        
        // Check if stuck
        this.checkIfStuck(monster, currentTime);
        
        // Update performance stats
        this.updatePerformanceStats();
    }

    updateState(monster, player, maze, currentTime) {
        const monsterPos = monster.getComponent('Transform').position;
        const playerPos = player ? player.getComponent('Transform').position : null;
        
        const previousState = this.state;
        
        switch (this.state) {
            case 'idle':
                if (this.canDetectPlayer(playerPos, monsterPos, maze)) {
                    this.transitionToChase(playerPos, currentTime);
                } else if (Math.random() < 0.01 * this.aggressiveness) {
                    this.state = 'patrol';
                }
                break;
                
            case 'patrol':
                if (this.canDetectPlayer(playerPos, monsterPos, maze)) {
                    this.transitionToChase(playerPos, currentTime);
                } else if (this.path.length === 0) {
                    this.state = 'idle';
                }
                break;
                
            case 'chase':
                if (!playerPos) {
                    this.transitionToSearch(currentTime);
                } else {
                    const distance = monsterPos.distanceTo(playerPos);
                    if (distance <= this.attackRange) {
                        this.state = 'attack';
                    } else if (distance > this.detectionRange * 2) {
                        this.transitionToSearch(currentTime);
                    } else if (currentTime - this.lastPathCalculation > this.pathRecalculationInterval) {
                        // Recalculate path periodically
                        this.calculatePath(monsterPos, playerPos, maze, currentTime);
                    }
                }
                break;
                
            case 'search':
                if (this.canDetectPlayer(playerPos, monsterPos, maze)) {
                    this.transitionToChase(playerPos, currentTime);
                } else if (currentTime - this.playerLostTime > this.lostTargetTime * this.persistence) {
                    this.state = 'patrol';
                    this.generatePatrolRoute(monsterPos, maze);
                }
                break;
                
            case 'attack':
                if (!playerPos || monsterPos.distanceTo(playerPos) > this.attackRange) {
                    this.state = 'chase';
                }
                break;
        }
        
        // Track state changes
        if (previousState !== this.state) {
            this.performanceStats.stateChanges++;
        }
    }

    executeState(monster, player, maze, currentTime) {
        const monsterPos = monster.getComponent('Transform').position;
        const velocity = monster.getComponent('Velocity');
        
        switch (this.state) {
            case 'idle':
                this.executeIdle(monster, currentTime);
                break;
                
            case 'patrol':
                this.executePatrol(monster, maze, currentTime);
                break;
                
            case 'chase':
                this.executeChase(monster, player, maze, currentTime);
                break;
                
            case 'search':
                this.executeSearch(monster, maze, currentTime);
                break;
                
            case 'attack':
                this.executeAttack(monster, player, currentTime);
                break;
        }
    }

    executeIdle(monster, currentTime) {
        const velocity = monster.getComponent('Velocity');
        velocity.linear.set(0, 0, 0);
        
        // Random animations or sounds
        if (Math.random() < 0.001) {
            // Play idle sound
        }
    }

    executePatrol(monster, maze, currentTime) {
        if (this.path.length === 0) {
            this.generatePatrolRoute(monster.getComponent('Transform').position, maze);
            return;
        }
        
        this.moveAlongPath(monster, this.patrolSpeed);
    }

    executeChase(monster, player, maze, currentTime) {
        const monsterPos = monster.getComponent('Transform').position;
        const playerPos = player.getComponent('Transform').position;
        
        // Calculate or get cached path
        if (this.path.length === 0 || currentTime - this.lastPathCalculation > this.pathRecalculationInterval) {
            this.calculatePath(monsterPos, playerPos, maze, currentTime);
        }
        
        // Move towards player
        if (this.path.length > 0) {
            this.moveAlongPath(monster, this.chaseSpeed);
        } else {
            // Direct movement if no path found
            this.moveDirectlyTowards(monster, playerPos, this.chaseSpeed);
        }
    }

    executeSearch(monster, maze, currentTime) {
        if (this.path.length === 0) {
            this.generateSearchPath(monster.getComponent('Transform').position, maze);
            return;
        }
        
        this.moveAlongPath(monster, this.searchSpeed || this.patrolSpeed);
    }

    executeAttack(monster, player, currentTime) {
        const velocity = monster.getComponent('Velocity');
        velocity.linear.set(0, 0, 0);
        
        // Face player
        const monsterPos = monster.getComponent('Transform').position;
        const playerPos = player.getComponent('Transform').position;
        const direction = new THREE.Vector3()
            .subVectors(playerPos, monsterPos)
            .normalize();
        
        const angle = Math.atan2(direction.x, direction.z);
        monster.getComponent('Transform').rotation.y = angle;
        
        // Perform attack
        if (currentTime - this.lastAttackTime > 1000) {
            this.performAttack(monster, player);
            this.lastAttackTime = currentTime;
        }
    }

    calculatePath(start, end, maze, currentTime) {
        const pathKey = this.getPathKey(start, end);
        
        // Check cache first
        if (this.pathCache.has(pathKey)) {
            const cachedPath = this.pathCache.get(pathKey);
            if (this.isPathValid(cachedPath, maze)) {
                this.path = cachedPath;
                this.currentTargetIndex = 0;
                this.cacheHitCount++;
                this.performanceStats.cacheHits++;
                return;
            }
        }
        
        // Calculate new path
        const newPath = findPathAStar(start, end, maze);
        
        if (newPath && newPath.length > 0) {
            this.path = newPath;
            this.currentTargetIndex = 0;
            this.lastPathCalculation = currentTime;
            
            // Cache the path
            this.cachePath(pathKey, newPath);
            
            this.cacheMissCount++;
            this.performanceStats.cacheMisses++;
            this.performanceStats.pathCalculations++;
        }
    }

    moveAlongPath(monster, speed) {
        if (this.path.length === 0 || this.currentTargetIndex >= this.path.length) {
            return;
        }
        
        const monsterPos = monster.getComponent('Transform').position;
        const velocity = monster.getComponent('Velocity');
        const targetPos = this.path[this.currentTargetIndex];
        
        const direction = new THREE.Vector3()
            .subVectors(targetPos, monsterPos)
            .normalize();
        
        const distance = monsterPos.distanceTo(targetPos);
        
        if (distance < 0.5) {
            // Reached waypoint
            this.currentTargetIndex++;
            if (this.currentTargetIndex >= this.path.length) {
                this.path = [];
                this.currentTargetIndex = 0;
            }
        } else {
            // Move towards waypoint
            velocity.linear.x = direction.x * speed;
            velocity.linear.z = direction.z * speed;
            
            // Update rotation
            const angle = Math.atan2(direction.x, direction.z);
            monster.getComponent('Transform').rotation.y = angle;
        }
    }

    moveDirectlyTowards(monster, target, speed) {
        const monsterPos = monster.getComponent('Transform').position;
        const velocity = monster.getComponent('Velocity');
        
        const direction = new THREE.Vector3()
            .subVectors(target, monsterPos)
            .normalize();
        
        velocity.linear.x = direction.x * speed;
        velocity.linear.z = direction.z * speed;
        
        const angle = Math.atan2(direction.x, direction.z);
        monster.getComponent('Transform').rotation.y = angle;
    }

    canDetectPlayer(playerPos, monsterPos, maze) {
        if (!playerPos) return false;
        
        const distance = monsterPos.distanceTo(playerPos);
        
        if (distance > this.detectionRange) return false;
        
        // Check line of sight (simplified)
        return this.hasLineOfSight(monsterPos, playerPos, maze);
    }

    hasLineOfSight(start, end, maze) {
        // Simplified line of sight check
        // In full implementation, would check maze walls
        return true;
    }

    transitionToChase(playerPos, currentTime) {
        this.state = 'chase';
        this.target = playerPos;
        this.lastKnownPlayerPosition = playerPos.clone();
        this.path = [];
        this.currentTargetIndex = 0;
    }

    transitionToSearch(currentTime) {
        this.state = 'search';
        this.playerLostTime = currentTime;
        this.path = [];
        this.currentTargetIndex = 0;
    }

    generatePatrolRoute(position, maze) {
        // Generate random patrol points
        this.path = [];
        const numPoints = 3 + Math.floor(Math.random() * 3);
        
        for (let i = 0; i < numPoints; i++) {
            const angle = (Math.PI * 2 * i) / numPoints + Math.random() * 0.5;
            const distance = 5 + Math.random() * 10;
            
            const x = position.x + Math.cos(angle) * distance;
            const z = position.z + Math.sin(angle) * distance;
            
            this.path.push(new THREE.Vector3(x, position.y, z));
        }
        
        this.currentTargetIndex = 0;
    }

    generateSearchPath(position, maze) {
        // Generate search pattern around last known position
        if (this.lastKnownPlayerPosition) {
            this.path = [];
            const searchRadius = 10;
            const numPoints = 8;
            
            for (let i = 0; i < numPoints; i++) {
                const angle = (Math.PI * 2 * i) / numPoints;
                const x = this.lastKnownPlayerPosition.x + Math.cos(angle) * searchRadius;
                const z = this.lastKnownPlayerPosition.z + Math.sin(angle) * searchRadius;
                
                this.path.push(new THREE.Vector3(x, position.y, z));
            }
            
            this.currentTargetIndex = 0;
        }
    }

    checkIfStuck(monster, currentTime) {
        const monsterPos = monster.getComponent('Transform').position;
        const distance = monsterPos.distanceTo(this.lastPosition);
        
        if (distance < 0.1) {
            this.stuckTimer += this.updateInterval;
            
            if (this.stuckTimer > this.stuckThreshold) {
                // Monster is stuck, try to recover
                this.recoverFromStuck(monster);
                this.stuckTimer = 0;
            }
        } else {
            this.stuckTimer = 0;
        }
        
        this.lastPosition.copy(monsterPos);
    }

    recoverFromStuck(monster) {
        // Clear current path and generate new one
        this.path = [];
        this.currentTargetIndex = 0;
        
        // Add random impulse
        const velocity = monster.getComponent('Velocity');
        const randomAngle = Math.random() * Math.PI * 2;
        velocity.linear.x = Math.cos(randomAngle) * 2;
        velocity.linear.z = Math.sin(randomAngle) * 2;
    }

    getPathKey(start, end) {
        return `${Math.round(start.x)},${Math.round(start.z)}-${Math.round(end.x)},${Math.round(end.z)}`;
    }

    cachePath(key, path) {
        // Remove oldest entries if cache is full
        if (this.pathCache.size >= this.maxCacheSize) {
            const firstKey = this.pathCache.keys().next().value;
            this.pathCache.delete(firstKey);
        }
        
        this.pathCache.set(key, {
            path: path,
            timestamp: Date.now(),
            usage: 1
        });
    }

    isPathValid(cachedData, maze) {
        // Check if cached path is still valid
        const maxAge = 10000; // 10 seconds
        
        if (Date.now() - cachedData.timestamp > maxAge) {
            return false;
        }
        
        // Additional validation could be added here
        return true;
    }

    performAttack(monster, player) {
        // Handle attack logic
        const damage = 10 * this.aggressiveness;
        
        // This would be handled by event system
        console.log(`Monster attacks for ${damage} damage`);
    }

    updatePerformanceStats() {
        const totalPaths = this.cacheHitCount + this.cacheMissCount;
        if (totalPaths > 0) {
            this.performanceStats.cacheHitRate = this.cacheHitCount / totalPaths;
        }
        
        if (this.path.length > 0) {
            this.performanceStats.averagePathLength = 
                (this.performanceStats.averagePathLength + this.path.length) / 2;
        }
    }

    getStats() {
        return {
            ...this.performanceStats,
            currentState: this.state,
            pathLength: this.path.length,
            cacheSize: this.pathCache.size,
            stuckTimer: this.stuckTimer
        };
    }

    clearCache() {
        this.pathCache.clear();
        this.cacheHitCount = 0;
        this.cacheMissCount = 0;
    }

    dispose() {
        this.clearCache();
        this.path = [];
        this.target = null;
        this.lastKnownPlayerPosition = null;
    }
}
