import { describe, it, expect, beforeEach } from 'vitest';
import { Transform } from '../../components/Transform.js';
import * as THREE from 'three';

describe('Transform', () => {
    let transform;

    beforeEach(() => {
        transform = new Transform();
    });

    test('should create with default values', () => {
        expect(transform.position).toBeInstanceOf(THREE.Vector3);
        expect(transform.rotation).toBeInstanceOf(THREE.Euler);
        expect(transform.scale).toBeInstanceOf(THREE.Vector3);
        expect(transform.scale.x).toBe(1);
        expect(transform.scale.y).toBe(1);
        expect(transform.scale.z).toBe(1);
    });

    test('should create with custom values', () => {
        const position = new THREE.Vector3(1, 2, 3);
        const rotation = new THREE.Euler(0.5, 0.3, 0.1);
        const scale = new THREE.Vector3(2, 2, 2);

        const customTransform = new Transform({
            position, rotation, scale
        });

        expect(customTransform.position).toEqual(position);
        expect(customTransform.rotation).toEqual(rotation);
        expect(customTransform.scale).toEqual(scale);
    });

    test('should translate position', () => {
        const vector = new THREE.Vector3(1, 2, 3);
        transform.translate(vector);

        expect(transform.position.x).toBe(1);
        expect(transform.position.y).toBe(2);
        expect(transform.position.z).toBe(3);
    });

    test('should rotate', () => {
        const euler = new THREE.Euler(0.1, 0.2, 0.3);
        transform.rotate(euler);

        expect(transform.rotation.x).toBe(0.1);
        expect(transform.rotation.y).toBe(0.2);
        expect(transform.rotation.z).toBe(0.3);
    });

    test('should set scale with number', () => {
        transform.setScale(2);
        expect(transform.scale.x).toBe(2);
        expect(transform.scale.y).toBe(2);
        expect(transform.scale.z).toBe(2);
    });

    test('should set scale with vector', () => {
        const scale = new THREE.Vector3(1, 2, 3);
        transform.setScale(scale);
        expect(transform.scale).toEqual(scale);
    });

    test('should clone transform', () => {
        const position = new THREE.Vector3(5, 10, 15);
        transform.position.copy(position);

        const cloned = transform.clone();
        
        expect(cloned.position).toEqual(position);
        expect(cloned).not.toBe(transform);
    });
});
