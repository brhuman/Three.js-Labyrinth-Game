import { Entity } from './Entity.js';
import { Transform } from '../components/Transform.js';
import { Velocity } from '../components/Velocity.js';
import { Health } from '../components/Health.js';
import { Flashlight } from '../components/Flashlight.js';
import { Input } from '../components/Input.js';
import { AudioSource } from '../components/AudioSource.js';
import * as THREE from 'three';

export class Player extends Entity {
    constructor(options = {}) {
        super('player');
        
        // Core components
        this.addComponent('Transform', new Transform({
            position: options.position || new THREE.Vector3(0, 0.7, 0),
            rotation: options.rotation || new THREE.Euler(0, 0, 0)
        }));
        
        this.addComponent('Velocity', new Velocity({
            maxSpeed: options.maxSpeed || 10,
            friction: options.friction || 0.9
        }));
        
        this.addComponent('Health', new Health(options.maxHealth || 100));
        
        this.addComponent('Flashlight', new Flashlight(options.initialBattery || 100));
        
        this.addComponent('Input', new Input());
        
        this.addComponent('AudioSource', new AudioSource({
            volume: 0.5,
            spatial: true,
            is3D: true
        }));
        
        // Player-specific properties
        this.isCrouching = false;
        this.isSprinting = false;
        this.canJump = true;
        this.jumpCooldown = 0;
        
        // Movement speeds
        this.baseSpeed = options.baseSpeed || 5.0;
        this.crouchSpeed = options.crouchSpeed || 2.0;
        this.sprintSpeed = options.sprintSpeed || 8.0;
        this.currentSpeed = this.baseSpeed;
        
        // Height settings
        this.baseHeight = options.baseHeight || 0.7;
        this.crouchHeight = options.crouchHeight || 0.35;
        this.currentHeight = this.baseHeight;
        
        // Power-up timers
        this.speedPowerupRemaining = 0;
        this.slowPowerupRemaining = 0;
        this.radarPowerupRemaining = 0;
        
        // Stats
        this.stats = {
            distanceTraveled: 0,
            batteriesCollected: 0,
            monstersEvaded: 0,
            timeAlive: 0,
            levelsCompleted: 0
        };
        
        this.lastPosition = this.getComponent('Transform').position.clone();
    }

    update(deltaTime) {
        const transform = this.getComponent('Transform');
        const velocity = this.getComponent('Velocity');
        const flashlight = this.getComponent('Flashlight');
        const health = this.getComponent('Health');
        
        if (!transform || !velocity || !flashlight || !health) return;
        
        // Update power-up timers
        this.updatePowerups(deltaTime);
        
        // Update flashlight battery
        flashlight.updateBattery(deltaTime);
        
        // Update health invulnerability
        health.updateInvulnerability(deltaTime);
        
        // Update jump cooldown
        if (this.jumpCooldown > 0) {
            this.jumpCooldown -= deltaTime;
        }
        
        // Update movement speed based on state
        this.updateMovementSpeed();
        
        // Update stats
        this.updateStats(deltaTime);
        
        // Update height based on crouching
        this.updateHeight();
    }

    updatePowerups(deltaTime) {
        if (this.speedPowerupRemaining > 0) {
            this.speedPowerupRemaining -= deltaTime;
        }
        
        if (this.slowPowerupRemaining > 0) {
            this.slowPowerupRemaining -= deltaTime;
        }
        
        if (this.radarPowerupRemaining > 0) {
            this.radarPowerupRemaining -= deltaTime;
        }
    }

    updateMovementSpeed() {
        const velocity = this.getComponent('Velocity');
        if (!velocity) return;
        
        let speed = this.baseSpeed;
        
        if (this.isCrouching) {
            speed = this.crouchSpeed;
        } else if (this.isSprinting) {
            speed = this.sprintSpeed;
        }
        
        // Apply power-up modifiers
        if (this.speedPowerupRemaining > 0) {
            speed *= 1.5;
        }
        
        if (this.slowPowerupRemaining > 0) {
            speed *= 0.5;
        }
        
        velocity.maxSpeed = speed;
        this.currentSpeed = speed;
    }

    updateHeight() {
        const transform = this.getComponent('Transform');
        if (!transform) return;
        
        const targetHeight = this.isCrouching ? this.crouchHeight : this.baseHeight;
        
        // Smooth height transition
        const heightDiff = targetHeight - this.currentHeight;
        this.currentHeight += heightDiff * 0.1;
        
        transform.position.y = this.currentHeight;
    }

    updateStats(deltaTime) {
        const transform = this.getComponent('Transform');
        if (!transform) return;
        
        // Update distance traveled
        const distance = transform.position.distanceTo(this.lastPosition);
        this.stats.distanceTraveled += distance;
        this.lastPosition = transform.position.clone();
        
        // Update time alive
        this.stats.timeAlive += deltaTime;
    }

    jump() {
        const velocity = this.getComponent('Velocity');
        if (!velocity) return false;
        
        if (this.canJump && this.jumpCooldown <= 0) {
            velocity.linear.y = 3.2; // Jump force
            this.jumpCooldown = 0.5; // 500ms cooldown
            return true;
        }
        return false;
    }

    setCrouching(crouching) {
        this.isCrouching = crouching;
    }

    setSprinting(sprinting) {
        this.isSprinting = sprinting;
    }

    toggleFlashlight() {
        const flashlight = this.getComponent('Flashlight');
        if (!flashlight) return false;
        
        return flashlight.toggle();
    }

    takeDamage(amount) {
        const health = this.getComponent('Health');
        if (!health) return false;
        
        const isDead = health.takeDamage(amount);
        
        if (isDead) {
            this.onDeath();
        }
        
        return isDead;
    }

    heal(amount) {
        const health = this.getComponent('Health');
        if (!health) return;
        
        health.heal(amount);
    }

    addBattery(amount) {
        const flashlight = this.getComponent('Flashlight');
        if (!flashlight) return;
        
        flashlight.addBattery(amount);
        this.stats.batteriesCollected++;
    }

    applySpeedPowerup(duration) {
        this.speedPowerupRemaining = duration;
    }

    applySlowPowerup(duration) {
        this.slowPowerupRemaining = duration;
    }

    applyRadarPowerup(duration) {
        this.radarPowerupRemaining = duration;
    }

    onDeath() {
        // Handle player death
        this.isActive = false;
    }

    onLevelComplete() {
        this.stats.levelsCompleted++;
    }

    reset() {
        const health = this.getComponent('Health');
        const flashlight = this.getComponent('Flashlight');
        const transform = this.getComponent('Transform');
        const velocity = this.getComponent('Velocity');
        
        if (health) health.reset();
        if (flashlight) flashlight.reset();
        if (transform) {
            transform.position.set(0, this.baseHeight, 0);
            transform.rotation.set(0, 0, 0);
        }
        if (velocity) velocity.setLinear(0, 0, 0);
        
        this.isCrouching = false;
        this.isSprinting = false;
        this.canJump = true;
        this.jumpCooldown = 0;
        this.currentHeight = this.baseHeight;
        
        this.speedPowerupRemaining = 0;
        this.slowPowerupRemaining = 0;
        this.radarPowerupRemaining = 0;
        
        this.isActive = true;
    }

    getStats() {
        return { ...this.stats };
    }

    clone() {
        const player = new Player();
        player.stats = { ...this.stats };
        return player;
    }
}
