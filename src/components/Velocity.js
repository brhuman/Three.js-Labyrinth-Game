import * as THREE from 'three';

export class Velocity {
    constructor(options = {}) {
        this.linear = options.linear || new THREE.Vector3();
        this.angular = options.angular || new THREE.Vector3();
        this.maxSpeed = options.maxSpeed || 10;
        this.friction = options.friction || 0.9;
    }

    setLinear(x, y, z) {
        if (typeof x === 'number') {
            this.linear.set(x, y, z);
        } else {
            this.linear.copy(x);
        }
        return this;
    }

    setAngular(x, y, z) {
        if (typeof x === 'number') {
            this.angular.set(x, y, z);
        } else {
            this.angular.copy(x);
        }
        return this;
    }

    applyForce(force) {
        this.linear.add(force);
        return this;
    }

    applyFriction(deltaTime) {
        const frictionFactor = Math.pow(this.friction, deltaTime);
        this.linear.multiplyScalar(frictionFactor);
        this.angular.multiplyScalar(frictionFactor);
        return this;
    }

    limitSpeed() {
        const speed = this.linear.length();
        if (speed > this.maxSpeed) {
            this.linear.normalize().multiplyScalar(this.maxSpeed);
        }
        return this;
    }

    getSpeed() {
        return this.linear.length();
    }

    clone() {
        return new Velocity({
            linear: this.linear.clone(),
            angular: this.angular.clone(),
            maxSpeed: this.maxSpeed,
            friction: this.friction
        });
    }
}
