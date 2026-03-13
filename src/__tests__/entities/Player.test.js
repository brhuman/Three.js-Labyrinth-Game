import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Player } from '../../entities/Player.js';
import * as THREE from 'three';

describe('Player', () => {
    let player;

    beforeEach(() => {
        player = new Player();
    });

    test('should create with default components', () => {
        expect(player.id).toBe('player');
        expect(player.hasComponent('Transform')).toBe(true);
        expect(player.hasComponent('Velocity')).toBe(true);
        expect(player.hasComponent('Health')).toBe(true);
        expect(player.hasComponent('Flashlight')).toBe(true);
        expect(player.hasComponent('Input')).toBe(true);
        expect(player.hasComponent('AudioSource')).toBe(true);
    });

    test('should have correct initial stats', () => {
        expect(player.stats.distanceTraveled).toBe(0);
        expect(player.stats.batteriesCollected).toBe(0);
        expect(player.stats.monstersEvaded).toBe(0);
        expect(player.stats.timeAlive).toBe(0);
        expect(player.stats.levelsCompleted).toBe(0);
    });

    test('should update stats', () => {
        const transform = player.getComponent('Transform');
        transform.position.set(10, 0, 0);
        
        player.update(1.0);
        
        expect(player.stats.distanceTraveled).toBeGreaterThan(0);
        expect(player.stats.timeAlive).toBe(1.0);
    });

    test('should jump', () => {
        const jumped = player.jump();
        expect(jumped).toBe(true);
        
        const velocity = player.getComponent('Velocity');
        expect(velocity.linear.y).toBeGreaterThan(0);
    });

    test('should not jump during cooldown', () => {
        player.jump(); // First jump
        const jumped = player.jump(); // Second jump immediately
        expect(jumped).toBe(false);
    });

    test('should toggle crouching', () => {
        player.setCrouching(true);
        expect(player.isCrouching).toBe(true);
        expect(player.currentSpeed).toBe(player.crouchSpeed);
        
        player.setCrouching(false);
        expect(player.isCrouching).toBe(false);
        expect(player.currentSpeed).toBe(player.baseSpeed);
    });

    test('should toggle sprinting', () => {
        player.setSprinting(true);
        expect(player.isSprinting).toBe(true);
        expect(player.currentSpeed).toBe(player.sprintSpeed);
        
        player.setSprinting(false);
        expect(player.isSprinting).toBe(false);
        expect(player.currentSpeed).toBe(player.baseSpeed);
    });

    test('should toggle flashlight', () => {
        const flashlight = player.getComponent('Flashlight');
        const initialOn = flashlight.isOn;
        
        const toggled = player.toggleFlashlight();
        expect(toggled).toBe(!initialOn);
        expect(flashlight.isOn).toBe(!initialOn);
    });

    test('should take damage', () => {
        const isDead = player.takeDamage(30);
        expect(isDead).toBe(false);
        
        const health = player.getComponent('Health');
        expect(health.currentHealth).toBe(70);
    });

    test('should die when health depleted', () => {
        const isDead = player.takeDamage(150);
        expect(isDead).toBe(true);
        expect(player.isActive).toBe(false);
    });

    test('should heal', () => {
        player.takeDamage(50);
        player.heal(30);
        
        const health = player.getComponent('Health');
        expect(health.currentHealth).toBe(80);
    });

    test('should add battery', () => {
        player.addBattery(25);
        expect(player.stats.batteriesCollected).toBe(1);
        
        const flashlight = player.getComponent('Flashlight');
        expect(flashlight.currentBattery).toBe(100); // Should be capped at max
    });

    test('should apply speed powerup', () => {
        player.applySpeedPowerup(5.0);
        expect(player.speedPowerupRemaining).toBe(5.0);
        expect(player.currentSpeed).toBeGreaterThan(player.baseSpeed);
    });

    test('should apply slow powerup', () => {
        player.applySlowPowerup(3.0);
        expect(player.slowPowerupRemaining).toBe(3.0);
        expect(player.currentSpeed).toBeLessThan(player.baseSpeed);
    });

    test('should apply radar powerup', () => {
        player.applyRadarPowerup(10.0);
        expect(player.radarPowerupRemaining).toBe(10.0);
    });

    test('should update powerup timers', () => {
        player.applySpeedPowerup(1.0);
        player.update(0.5);
        expect(player.speedPowerupRemaining).toBe(0.5);
        
        player.update(0.6);
        expect(player.speedPowerupRemaining).toBe(0);
    });

    test('should reset', () => {
        player.takeDamage(50);
        player.setCrouching(true);
        player.applySpeedPowerup(5.0);
        
        player.reset();
        
        const health = player.getComponent('Health');
        const flashlight = player.getComponent('Flashlight');
        
        expect(health.currentHealth).toBe(100);
        expect(flashlight.currentBattery).toBe(100);
        expect(player.isCrouching).toBe(false);
        expect(player.speedPowerupRemaining).toBe(0);
        expect(player.isActive).toBe(true);
    });

    test('should complete level', () => {
        player.onLevelComplete();
        expect(player.stats.levelsCompleted).toBe(1);
    });

    test('should get stats', () => {
        player.stats.distanceTraveled = 100;
        player.stats.batteriesCollected = 3;
        
        const stats = player.getStats();
        expect(stats.distanceTraveled).toBe(100);
        expect(stats.batteriesCollected).toBe(3);
    });
});
