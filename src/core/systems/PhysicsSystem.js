import * as THREE from 'three';

export class PhysicsSystem {
    constructor(eventBus) {
        this.eventBus = eventBus;
        this.gravity = 12.0;
        this.jumpForce = 3.2;
        this.groundLevel = 0;
        this.entities = new Set();
    }

    addEntity(entity) {
        if (entity.hasComponent('Velocity') && entity.hasComponent('Transform')) {
            this.entities.add(entity);
        }
    }

    removeEntity(entity) {
        this.entities.delete(entity);
    }

    update(deltaTime) {
        this.entities.forEach(entity => {
            if (!entity.isActive) return;

            const velocity = entity.getComponent('Velocity');
            const transform = entity.getComponent('Transform');

            if (velocity && transform) {
                this.applyGravity(entity, deltaTime);
                this.updatePosition(entity, deltaTime);
                this.applyFriction(entity, deltaTime);
                this.checkGroundCollision(entity);
                this.limitSpeed(entity);
            }
        });
    }

    applyGravity(entity, deltaTime) {
        const velocity = entity.getComponent('Velocity');
        
        // Apply gravity only if entity is not on ground
        if (!this.isOnGround(entity)) {
            velocity.linear.y -= this.gravity * deltaTime;
        }
    }

    updatePosition(entity, deltaTime) {
        const velocity = entity.getComponent('Velocity');
        const transform = entity.getComponent('Transform');

        // Update position based on velocity
        const movement = velocity.linear.clone().multiplyScalar(deltaTime);
        transform.position.add(movement);
    }

    applyFriction(entity, deltaTime) {
        const velocity = entity.getComponent('Velocity');
        velocity.applyFriction(deltaTime);
    }

    checkGroundCollision(entity) {
        const transform = entity.getComponent('Transform');
        const velocity = entity.getComponent('Velocity');

        if (transform.position.y <= this.groundLevel) {
            transform.position.y = this.groundLevel;
            
            // Stop downward velocity when hitting ground
            if (velocity.linear.y < 0) {
                velocity.linear.y = 0;
            }

            // Emit ground collision event
            this.eventBus.emit('ground_collision', { entity });
        }
    }

    limitSpeed(entity) {
        const velocity = entity.getComponent('Velocity');
        velocity.limitSpeed();
    }

    isOnGround(entity) {
        const transform = entity.getComponent('Transform');
        return Math.abs(transform.position.y - this.groundLevel) < 0.1;
    }

    jump(entity) {
        const velocity = entity.getComponent('Velocity');
        
        if (this.isOnGround(entity)) {
            velocity.linear.y = this.jumpForce;
            this.eventBus.emit('jump', { entity });
            return true;
        }
        return false;
    }

    setGravity(value) {
        this.gravity = value;
    }

    setJumpForce(value) {
        this.jumpForce = value;
    }

    getEntityVelocity(entity) {
        const velocity = entity.getComponent('Velocity');
        return velocity ? velocity.linear.clone() : new THREE.Vector3();
    }

    dispose() {
        this.entities.clear();
    }
}
