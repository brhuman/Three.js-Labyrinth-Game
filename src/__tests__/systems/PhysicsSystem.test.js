import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PhysicsSystem } from '../../core/systems/PhysicsSystem.js';
import { Entity } from '../../entities/Entity.js';
import { Transform } from '../../components/Transform.js';
import { Velocity } from '../../components/Velocity.js';
import * as THREE from 'three';

describe('PhysicsSystem', () => {
    let physicsSystem;
    let mockEventBus;
    let entity;

    beforeEach(() => {
        mockEventBus = {
            emit: vi.fn()
        };
        
        physicsSystem = new PhysicsSystem(mockEventBus);
        
        entity = new Entity('test');
        entity.addComponent('Transform', new Transform());
        entity.addComponent('Velocity', new Velocity());
        
        physicsSystem.addEntity(entity);
    });

    test('should add entity with required components', () => {
        expect(physicsSystem.entities.has(entity)).toBe(true);
    });

    test('should not add entity without required components', () => {
        const incompleteEntity = new Entity('incomplete');
        incompleteEntity.addComponent('Transform', new Transform());
        
        physicsSystem.addEntity(incompleteEntity);
        expect(physicsSystem.entities.has(incompleteEntity)).toBe(false);
    });

    test('should apply gravity', () => {
        const transform = entity.getComponent('Transform');
        const velocity = entity.getComponent('Velocity');
        
        transform.position.y = 10;
        physicsSystem.applyGravity(entity, 0.1);
        
        expect(velocity.linear.y).toBeLessThan(0); // Should be negative (downward)
    });

    test('should update position based on velocity', () => {
        const transform = entity.getComponent('Transform');
        const velocity = entity.getComponent('Velocity');
        
        velocity.linear.set(10, 0, 0);
        const initialX = transform.position.x;
        
        physicsSystem.updatePosition(entity, 0.1);
        
        expect(transform.position.x).toBeGreaterThan(initialX);
    });

    test('should handle ground collision', () => {
        const transform = entity.getComponent('Transform');
        const velocity = entity.getComponent('Velocity');
        
        transform.position.y = -1;
        velocity.linear.y = -5;
        
        physicsSystem.checkGroundCollision(entity);
        
        expect(transform.position.y).toBe(0); // Should be clamped to ground level
        expect(velocity.linear.y).toBe(0); // Should stop downward velocity
        expect(mockEventBus.emit).toHaveBeenCalledWith('ground_collision', { entity });
    });

    test('should limit speed', () => {
        const velocity = entity.getComponent('Velocity');
        velocity.linear.set(100, 0, 0);
        
        physicsSystem.limitSpeed(entity);
        
        expect(velocity.getSpeed()).toBeLessThanOrEqual(velocity.maxSpeed);
    });

    test('should check if entity is on ground', () => {
        const transform = entity.getComponent('Transform');
        
        transform.position.y = 0;
        expect(physicsSystem.isOnGround(entity)).toBe(true);
        
        transform.position.y = 2;
        expect(physicsSystem.isOnGround(entity)).toBe(false);
    });

    test('should perform jump', () => {
        const velocity = entity.getComponent('Velocity');
        const initialY = velocity.linear.y;
        
        const jumped = physicsSystem.jump(entity);
        
        expect(jumped).toBe(true);
        expect(velocity.linear.y).toBeGreaterThan(initialY);
        expect(mockEventBus.emit).toHaveBeenCalledWith('jump', { entity });
    });

    test('should not jump when not on ground', () => {
        const transform = entity.getComponent('Transform');
        const velocity = entity.getComponent('Velocity');
        
        transform.position.y = 10; // In the air
        const jumped = physicsSystem.jump(entity);
        
        expect(jumped).toBe(false);
        expect(velocity.linear.y).toBe(0);
    });

    test('should remove entity', () => {
        physicsSystem.removeEntity(entity);
        expect(physicsSystem.entities.has(entity)).toBe(false);
    });

    test('should update all entities', () => {
        const entity2 = new Entity('test2');
        entity2.addComponent('Transform', new Transform());
        entity2.addComponent('Velocity', new Velocity());
        physicsSystem.addEntity(entity2);
        
        const updateSpy = vi.spyOn(physicsSystem, 'applyPhysics');
        
        physicsSystem.update(0.016); // 60 FPS frame
        
        expect(updateSpy).toHaveBeenCalledTimes(2); // Should update both entities
    });

    test('should dispose properly', () => {
        physicsSystem.dispose();
        expect(physicsSystem.entities.size).toBe(0);
    });
});
