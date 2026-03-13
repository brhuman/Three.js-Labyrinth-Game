import { describe, it, expect, beforeEach } from 'vitest';
import { Velocity } from '../../components/Velocity.js';
import * as THREE from 'three';

describe('Velocity', () => {
    let velocity;

    beforeEach(() => {
        velocity = new Velocity();
    });

    test('should create with default values', () => {
        expect(velocity.linear).toBeInstanceOf(THREE.Vector3);
        expect(velocity.angular).toBeInstanceOf(THREE.Vector3);
        expect(velocity.maxSpeed).toBe(10);
        expect(velocity.friction).toBe(0.9);
    });

    test('should create with custom values', () => {
        const custom = new Velocity({
            maxSpeed: 20,
            friction: 0.5,
            linear: new THREE.Vector3(1, 2, 3),
            angular: new THREE.Vector3(0.1, 0.2, 0.3)
        });

        expect(custom.maxSpeed).toBe(20);
        expect(custom.friction).toBe(0.5);
        expect(custom.linear.x).toBe(1);
        expect(custom.angular.x).toBe(0.1);
    });

    test('should set linear velocity', () => {
        velocity.setLinear(5, 10, 15);
        expect(velocity.linear.x).toBe(5);
        expect(velocity.linear.y).toBe(10);
        expect(velocity.linear.z).toBe(15);
    });

    test('should set linear velocity with vector', () => {
        const vector = new THREE.Vector3(1, 2, 3);
        velocity.setLinear(vector);
        expect(velocity.linear).toEqual(vector);
    });

    test('should apply force', () => {
        const force = new THREE.Vector3(10, 0, 0);
        velocity.applyForce(force);
        expect(velocity.linear.x).toBe(10);
    });

    test('should apply friction', () => {
        velocity.linear.set(100, 0, 0);
        velocity.applyFriction(1.0);
        expect(velocity.linear.x).toBe(90); // 100 * 0.9
    });

    test('should limit speed', () => {
        velocity.linear.set(50, 0, 0);
        velocity.limitSpeed();
        expect(velocity.getSpeed()).toBeLessThanOrEqual(velocity.maxSpeed);
    });

    test('should get speed', () => {
        velocity.linear.set(3, 4, 0);
        expect(velocity.getSpeed()).toBe(5); // sqrt(3^2 + 4^2)
    });

    test('should clone velocity', () => {
        const custom = new Velocity({ maxSpeed: 15, friction: 0.8 });
        const cloned = custom.clone();
        
        expect(cloned.maxSpeed).toBe(15);
        expect(cloned.friction).toBe(0.8);
        expect(cloned).not.toBe(custom);
    });
});
