import * as THREE from 'three';
import { findPathAStar } from '../../utils.js';

export class AISystem {
    constructor(eventBus) {
        this.eventBus = eventBus;
        this.entities = new Set();
        this.pathCache = new Map();
        this.lastUpdateTime = 0;
        this.updateInterval = 500; // ms between AI updates
        this.maxCacheSize = 100;
    }

    addEntity(entity) {
        this.entities.add(entity);
    }

    removeEntity(entity) {
        this.entities.delete(entity);
    }

    update(deltaTime, currentTime) {
        // Throttle AI updates
        if (currentTime - this.lastUpdateTime < this.updateInterval) {
            return;
        }

        this.entities.forEach(entity => {
            if (!entity.isActive) return;

            const aiComponent = entity.getComponent('AI');
            const transform = entity.getComponent('Transform');
            const velocity = entity.getComponent('Velocity');

            if (aiComponent && transform && velocity) {
                this.updateAI(entity, deltaTime);
            }
        });

        this.lastUpdateTime = currentTime;
    }

    updateAI(entity, deltaTime) {
        const ai = entity.getComponent('AI');
        const transform = entity.getComponent('Transform');
        const velocity = entity.getComponent('Velocity');

        switch (ai.state) {
            case 'idle':
                this.updateIdleState(entity, deltaTime);
                break;
            case 'patrol':
                this.updatePatrolState(entity, deltaTime);
                break;
            case 'chase':
                this.updateChaseState(entity, deltaTime);
                break;
            case 'attack':
                this.updateAttackState(entity, deltaTime);
                break;
            case 'search':
                this.updateSearchState(entity, deltaTime);
                break;
        }
    }

    updateIdleState(entity, deltaTime) {
        const ai = entity.getComponent('AI');
        const transform = entity.getComponent('Transform');

        // Check if player is detected
        if (this.canDetectPlayer(entity)) {
            ai.state = 'chase';
            ai.target = this.getPlayerPosition();
            this.eventBus.emit('ai_state_change', { 
                entity, 
                from: 'idle', 
                to: 'chase' 
            });
        }
    }

    updatePatrolState(entity, deltaTime) {
        const ai = entity.getComponent('AI');
        const transform = entity.getComponent('Transform');
        const velocity = entity.getComponent('Velocity');

        // Check if player is detected
        if (this.canDetectPlayer(entity)) {
            ai.state = 'chase';
            ai.target = this.getPlayerPosition();
            this.eventBus.emit('ai_state_change', { 
                entity, 
                from: 'patrol', 
                to: 'chase' 
            });
            return;
        }

        // Move to patrol point
        if (ai.patrolPoints && ai.patrolPoints.length > 0) {
            const targetPoint = ai.patrolPoints[ai.currentPatrolIndex];
            const distance = transform.position.distanceTo(targetPoint);

            if (distance < 1.0) {
                // Reached patrol point, move to next
                ai.currentPatrolIndex = (ai.currentPatrolIndex + 1) % ai.patrolPoints.length;
            } else {
                // Move towards patrol point
                this.moveTowards(entity, targetPoint, ai.patrolSpeed);
            }
        }
    }

    updateChaseState(entity, deltaTime) {
        const ai = entity.getComponent('AI');
        const transform = entity.getComponent('Transform');

        // Update target position
        ai.target = this.getPlayerPosition();

        if (!ai.target) {
            ai.state = 'search';
            this.eventBus.emit('ai_state_change', { 
                entity, 
                from: 'chase', 
                to: 'search' 
            });
            return;
        }

        const distance = transform.position.distanceTo(ai.target);

        // Check if can attack
        if (distance < ai.attackRange) {
            ai.state = 'attack';
            this.eventBus.emit('ai_state_change', { 
                entity, 
                from: 'chase', 
                to: 'attack' 
            });
        } else if (distance > ai.detectionRange * 2) {
            // Lost player, start searching
            ai.state = 'search';
            ai.searchTimer = 5.0; // Search for 5 seconds
            this.eventBus.emit('ai_state_change', { 
                entity, 
                from: 'chase', 
                to: 'search' 
            });
        } else {
            // Chase player
            this.moveTowards(entity, ai.target, ai.chaseSpeed);
        }
    }

    updateAttackState(entity, deltaTime) {
        const ai = entity.getComponent('AI');
        const transform = entity.getComponent('Transform');

        if (!ai.target) {
            ai.state = 'search';
            return;
        }

        const distance = transform.position.distanceTo(ai.target);

        if (distance < ai.attackRange) {
            // Attack
            if (currentTime - ai.lastAttackTime > ai.attackCooldown) {
                this.performAttack(entity);
                ai.lastAttackTime = currentTime;
            }
        } else {
            // Player moved out of range, chase again
            ai.state = 'chase';
        }
    }

    updateSearchState(entity, deltaTime) {
        const ai = entity.getComponent('AI');

        ai.searchTimer -= deltaTime;

        if (ai.searchTimer <= 0) {
            // Give up searching, return to patrol
            ai.state = 'patrol';
            this.eventBus.emit('ai_state_change', { 
                entity, 
                from: 'search', 
                to: 'patrol' 
            });
        } else if (this.canDetectPlayer(entity)) {
            // Found player again
            ai.state = 'chase';
            ai.target = this.getPlayerPosition();
            this.eventBus.emit('ai_state_change', { 
                entity, 
                from: 'search', 
                to: 'chase' 
            });
        } else {
            // Search last known position
            if (ai.lastKnownPosition) {
                this.moveTowards(entity, ai.lastKnownPosition, ai.searchSpeed);
            }
        }
    }

    moveTowards(entity, target, speed) {
        const transform = entity.getComponent('Transform');
        const velocity = entity.getComponent('Velocity');

        if (!transform || !velocity) return;

        // Calculate direction to target
        const direction = new THREE.Vector3()
            .subVectors(target, transform.position)
            .normalize();

        // Apply velocity
        velocity.linear.x = direction.x * speed;
        velocity.linear.z = direction.z * speed;

        // Update rotation to face target
        const angle = Math.atan2(direction.x, direction.z);
        transform.rotation.y = angle;
    }

    canDetectPlayer(entity) {
        const ai = entity.getComponent('AI');
        const transform = entity.getComponent('Transform');

        if (!ai || !transform) return false;

        const playerPosition = this.getPlayerPosition();
        if (!playerPosition) return false;

        const distance = transform.position.distanceTo(playerPosition);
        
        // Check distance
        if (distance > ai.detectionRange) return false;

        // Check line of sight (simplified - in full implementation would check walls)
        return true;
    }

    getPlayerPosition() {
        // This should get the player entity's position
        // For now, return a placeholder
        this.eventBus.emit('get_player_position_request');
        return null; // Will be filled by event response
    }

    performAttack(entity) {
        this.eventBus.emit('ai_attack', { entity });
    }

    findPath(start, end, maze) {
        const key = this.getPathKey(start, end);
        
        // Check cache first
        if (this.pathCache.has(key)) {
            return this.pathCache.get(key);
        }

        // Calculate path using A*
        const path = findPathAStar(start, end, maze);
        
        // Cache the result
        this.cachePath(key, path);
        
        return path;
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
        
        this.pathCache.set(key, path);
    }

    clearCache() {
        this.pathCache.clear();
    }

    setUpdateInterval(interval) {
        this.updateInterval = interval;
    }

    dispose() {
        this.entities.clear();
        this.pathCache.clear();
    }
}
