import { Entity } from './Entity.js';
import { Transform } from '../components/Transform.js';
import { Velocity } from '../components/Velocity.js';
import { Health } from '../components/Health.js';
import { AI } from '../components/AI.js';
import { AudioSource } from '../components/AudioSource.js';
import * as THREE from 'three';

export class Monster extends Entity {
    constructor(options = {}) {
        super('monster');
        
        // Core components
        this.addComponent('Transform', new Transform({
            position: options.position || new THREE.Vector3(5, 0.5, 5),
            rotation: options.rotation || new THREE.Euler(0, 0, 0)
        }));
        
        this.addComponent('Velocity', new Velocity({
            maxSpeed: options.maxSpeed || 2.0,
            friction: options.friction || 0.8
        }));
        
        this.addComponent('Health', new Health(options.maxHealth || 50));
        
        this.addComponent('AI', new AI({
            state: options.initialState || 'idle',
            patrolSpeed: options.patrolSpeed || 1.0,
            chaseSpeed: options.chaseSpeed || 2.0,
            searchSpeed: options.searchSpeed || 1.5,
            detectionRange: options.detectionRange || 15,
            attackRange: options.attackRange || 2,
            attackDamage: options.attackDamage || 10,
            attackCooldown: options.attackCooldown || 1000,
            canPatrol: options.canPatrol !== false,
            canChase: options.canChase !== false,
            canAttack: options.canAttack !== false,
            canSearch: options.canSearch !== false
        }));
        
        this.addComponent('AudioSource', new AudioSource({
            volume: options.volume || 0.8,
            spatial: true,
            is3D: true,
            distance: 5,
            rolloff: 1.0
        }));
        
        // Monster-specific properties
        this.baseSpeed = options.baseSpeed || 2.0;
        this.currentSpeed = this.baseSpeed;
        this.difficultyMultiplier = options.difficultyMultiplier || 1.0;
        
        // Animation properties
        this.crouchHeight = 0;
        this.targetCrouchHeight = 0;
        this.crouchSpeed = 3.0;
        this.isCrouching = false;
        
        // Sound properties
        this.ambientSoundInterval = options.ambientSoundInterval || 5000;
        this.lastAmbientSoundTime = 0;
        this.footstepSoundInterval = options.footstepSoundInterval || 800;
        this.lastFootstepSoundTime = 0;
        
        // Visual properties
        this.isVisible = false;
        this.visibilityCheckInterval = 100; // ms
        this.lastVisibilityCheck = 0;
        
        // Spawn properties
        this.spawnDelay = options.spawnDelay || 0;
        this.isSpawned = this.spawnDelay <= 0;
        this.spawnTime = 0;
        
        // Stats
        this.stats = {
            playersCaught: 0,
            distanceTraveled: 0,
            timeActive: 0,
            attacksLanded: 0
        };
        
        this.lastPosition = this.getComponent('Transform').position.clone();
    }

    update(deltaTime, currentTime) {
        if (!this.isActive) return;
        
        const transform = this.getComponent('Transform');
        const ai = this.getComponent('AI');
        const health = this.getComponent('Health');
        
        if (!transform || !ai || !health) return;
        
        // Handle spawning
        if (!this.isSpawned) {
            this.spawnTime += deltaTime;
            if (this.spawnTime >= this.spawnDelay) {
                this.spawn();
            }
            return;
        }
        
        // Update AI
        this.updateAI(deltaTime, currentTime);
        
        // Update animations
        this.updateAnimations(deltaTime);
        
        // Update sounds
        this.updateSounds(currentTime);
        
        // Update visibility
        this.updateVisibility(currentTime);
        
        // Update stats
        this.updateStats(deltaTime);
        
        // Update speed based on difficulty
        this.updateSpeed();
    }

    spawn() {
        this.isSpawned = true;
        this.isActive = true;
        this.getComponent('Transform').position.y = 0.5; // Set proper height
    }

    updateAI(deltaTime, currentTime) {
        const ai = this.getComponent('AI');
        if (!ai) return;
        
        // Update search timer
        if (ai.state === 'search') {
            if (ai.updateSearchTimer(deltaTime)) {
                ai.setState('patrol');
            }
        }
    }

    updateAnimations(deltaTime) {
        const transform = this.getComponent('Transform');
        if (!transform) return;
        
        // Update crouch animation
        const heightDiff = this.targetCrouchHeight - this.crouchHeight;
        this.crouchHeight += heightDiff * this.crouchSpeed * deltaTime;
        
        // Apply crouch height to transform
        const baseHeight = 0.5;
        transform.position.y = baseHeight - this.crouchHeight;
    }

    updateSounds(currentTime) {
        // Play ambient sounds periodically
        if (currentTime - this.lastAmbientSoundTime > this.ambientSoundInterval) {
            this.playAmbientSound();
            this.lastAmbientSoundTime = currentTime;
        }
        
        // Play footstep sounds when moving
        const velocity = this.getComponent('Velocity');
        if (velocity && velocity.getSpeed() > 0.1) {
            if (currentTime - this.lastFootstepSoundTime > this.footstepSoundInterval) {
                this.playFootstepSound();
                this.lastFootstepSoundTime = currentTime;
            }
        }
    }

    updateVisibility(currentTime) {
        if (currentTime - this.lastVisibilityCheck < this.visibilityCheckInterval) {
            return;
        }
        
        this.lastVisibilityCheck = currentTime;
        
        // Check if monster should be visible (simplified - in full implementation would check line of sight)
        const ai = this.getComponent('AI');
        if (ai && ai.target) {
            const distance = this.getComponent('Transform').position.distanceTo(ai.target);
            this.isVisible = distance < 20; // Visible within 20 units
        }
    }

    updateStats(deltaTime) {
        const transform = this.getComponent('Transform');
        if (!transform) return;
        
        // Update distance traveled
        const distance = transform.position.distanceTo(this.lastPosition);
        this.stats.distanceTraveled += distance;
        this.lastPosition = transform.position.clone();
        
        // Update time active
        if (this.isSpawned && this.isActive) {
            this.stats.timeActive += deltaTime;
        }
    }

    updateSpeed() {
        const ai = this.getComponent('AI');
        const velocity = this.getComponent('Velocity');
        
        if (!ai || !velocity) return;
        
        let speed = this.baseSpeed;
        
        switch (ai.state) {
            case 'patrol':
                speed = ai.patrolSpeed;
                break;
            case 'chase':
                speed = ai.chaseSpeed;
                break;
            case 'search':
                speed = ai.searchSpeed;
                break;
            default:
                speed = this.baseSpeed;
        }
        
        // Apply difficulty multiplier
        speed *= this.difficultyMultiplier;
        
        velocity.maxSpeed = speed;
        this.currentSpeed = speed;
    }

    setCrouching(crouching) {
        this.isCrouching = crouching;
        this.targetCrouchHeight = crouching ? 0.3 : 0;
    }

    attack(target) {
        const ai = this.getComponent('AI');
        if (!ai || !ai.canAttackNow(Date.now())) return false;
        
        ai.performAttack(Date.now());
        this.stats.attacksLanded++;
        
        // Apply damage to target (would be handled by event system)
        return true;
    }

    onPlayerCaught() {
        this.stats.playersCaught++;
        this.playAttackSound();
    }

    playAmbientSound() {
        const audio = this.getComponent('AudioSource');
        if (audio && this.isSpawned) {
            // Emit event to play ambient sound
            this.emit('play_monster_ambient', { position: this.getComponent('Transform').position });
        }
    }

    playFootstepSound() {
        const audio = this.getComponent('AudioSource');
        if (audio && this.isSpawned) {
            // Emit event to play footstep sound
            this.emit('play_monster_footstep', { position: this.getComponent('Transform').position });
        }
    }

    playAttackSound() {
        const audio = this.getComponent('AudioSource');
        if (audio && this.isSpawned) {
            // Emit event to play attack sound
            this.emit('play_monster_attack', { position: this.getComponent('Transform').position });
        }
    }

    setDifficulty(multiplier) {
        this.difficultyMultiplier = multiplier;
        this.updateSpeed();
    }

    setPatrolRoute(points) {
        const ai = this.getComponent('AI');
        if (ai) {
            ai.setPatrolPoints(points);
        }
    }

    reset() {
        const health = this.getComponent('Health');
        const transform = this.getComponent('Transform');
        const velocity = this.getComponent('Velocity');
        const ai = this.getComponent('AI');
        
        if (health) health.reset();
        if (transform) {
            transform.position.set(5, 0.5, 5);
            transform.rotation.set(0, 0, 0);
        }
        if (velocity) velocity.setLinear(0, 0, 0);
        if (ai) {
            ai.setState('idle');
            ai.setTarget(null);
            ai.resetSearch();
        }
        
        this.isSpawned = this.spawnDelay <= 0;
        this.spawnTime = 0;
        this.crouchHeight = 0;
        this.targetCrouchHeight = 0;
        this.isCrouching = false;
        this.isVisible = false;
        this.isActive = true;
    }

    getStats() {
        return { ...this.stats };
    }

    clone() {
        const monster = new Monster();
        monster.stats = { ...this.stats };
        monster.difficultyMultiplier = this.difficultyMultiplier;
        return monster;
    }

    emit(eventName, data) {
        // This would connect to the event bus
        // For now, console.log as placeholder
        console.log(`Monster event: ${eventName}`, data);
    }
}
