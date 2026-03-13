import { describe, it, expect, beforeEach } from 'vitest';
import { Health } from '../../components/Health.js';

describe('Health', () => {
    let health;

    beforeEach(() => {
        health = new Health(100);
    });

    test('should create with default max health', () => {
        expect(health.maxHealth).toBe(100);
        expect(health.currentHealth).toBe(100);
        expect(health.isInvulnerable).toBe(false);
    });

    test('should take damage', () => {
        const isDead = health.takeDamage(30);
        expect(health.currentHealth).toBe(70);
        expect(isDead).toBe(false);
    });

    test('should die when health reaches zero', () => {
        const isDead = health.takeDamage(100);
        expect(health.currentHealth).toBe(0);
        expect(isDead).toBe(true);
        expect(health.isDead()).toBe(true);
    });

    test('should not take damage when invulnerable', () => {
        health.setInvulnerable(5.0);
        const isDead = health.takeDamage(50);
        expect(health.currentHealth).toBe(100);
        expect(isDead).toBe(false);
    });

    test('should heal', () => {
        health.takeDamage(30);
        health.heal(20);
        expect(health.currentHealth).toBe(90);
    });

    test('should not exceed max health when healing', () => {
        health.heal(50);
        expect(health.currentHealth).toBe(100);
    });

    test('should update invulnerability', () => {
        health.setInvulnerable(2.0);
        expect(health.isInvulnerable).toBe(true);
        expect(health.invulnerabilityTime).toBe(2.0);

        health.updateInvulnerability(1.0);
        expect(health.isInvulnerable).toBe(true);
        expect(health.invulnerabilityTime).toBe(1.0);

        health.updateInvulnerability(1.5);
        expect(health.isInvulnerable).toBe(false);
        expect(health.invulnerabilityTime).toBe(0);
    });

    test('should get health percentage', () => {
        health.takeDamage(30);
        expect(health.getHealthPercentage()).toBe(0.7);
    });

    test('should reset', () => {
        health.takeDamage(50);
        health.setInvulnerable(5.0);
        health.reset();
        
        expect(health.currentHealth).toBe(100);
        expect(health.isInvulnerable).toBe(false);
        expect(health.invulnerabilityTime).toBe(0);
    });

    test('should clone health', () => {
        const custom = new Health(150);
        const cloned = custom.clone();
        
        expect(cloned.maxHealth).toBe(150);
        expect(cloned.currentHealth).toBe(150);
    });
});
