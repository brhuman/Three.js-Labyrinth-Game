import { describe, it, expect, beforeEach } from 'vitest';
import { Entity } from '../../entities/Entity.js';
import { Transform } from '../../components/Transform.js';
import { Velocity } from '../../components/Velocity.js';
import { Health } from '../../components/Health.js';
import * as THREE from 'three';

describe('Entity', () => {
    let entity;

    beforeEach(() => {
        entity = new Entity('test-entity');
    });

    test('should create entity with id', () => {
        expect(entity.id).toBe('test-entity');
        expect(entity.isActive).toBe(true);
        expect(entity.components.size).toBe(0);
    });

    test('should add components', () => {
        const transform = new Transform();
        const velocity = new Velocity();

        entity.addComponent('Transform', transform);
        entity.addComponent('Velocity', velocity);

        expect(entity.hasComponent('Transform')).toBe(true);
        expect(entity.hasComponent('Velocity')).toBe(true);
        expect(entity.getComponent('Transform')).toBe(transform);
        expect(entity.getComponent('Velocity')).toBe(velocity);
    });

    test('should remove components', () => {
        const transform = new Transform();
        entity.addComponent('Transform', transform);

        expect(entity.hasComponent('Transform')).toBe(true);

        entity.removeComponent('Transform');

        expect(entity.hasComponent('Transform')).toBe(false);
        expect(entity.getComponent('Transform')).toBeUndefined();
    });

    test('should clone entity', () => {
        const position = new THREE.Vector3(1, 2, 3);
        const transform = new Transform({ position });
        const health = new Health(100);

        entity.addComponent('Transform', transform);
        entity.addComponent('Health', health);

        const cloned = entity.clone('cloned-entity');

        expect(cloned.id).toBe('cloned-entity');
        expect(cloned.hasComponent('Transform')).toBe(true);
        expect(cloned.hasComponent('Health')).toBe(true);
        expect(cloned.getComponent('Transform').position).toEqual(position);
        expect(cloned.getComponent('Health').maxHealth).toBe(100);
    });

    test('should dispose entity', () => {
        entity.addComponent('Transform', new Transform());
        entity.addComponent('Health', new Health());

        entity.dispose();

        expect(entity.isActive).toBe(false);
        expect(entity.components.size).toBe(0);
    });

    test('should return undefined for non-existent component', () => {
        expect(entity.getComponent('NonExistent')).toBeUndefined();
        expect(entity.hasComponent('NonExistent')).toBe(false);
    });
});
