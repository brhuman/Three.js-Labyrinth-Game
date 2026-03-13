import * as THREE from 'three';

export class Transform {
    constructor(options = {}) {
        this.position = options.position || new THREE.Vector3();
        this.rotation = options.rotation || new THREE.Euler();
        this.scale = options.scale || new THREE.Vector3(1, 1, 1);
        this.parent = null;
        this.children = [];
    }

    translate(vector) {
        this.position.add(vector);
        return this;
    }

    rotate(euler) {
        this.rotation.add(euler);
        return this;
    }

    setScale(scale) {
        if (typeof scale === 'number') {
            this.scale.set(scale, scale, scale);
        } else {
            this.scale.copy(scale);
        }
        return this;
    }

    getWorldPosition() {
        if (this.parent) {
            const worldPos = this.position.clone();
            return this.parent.getWorldPosition().add(worldPos);
        }
        return this.position.clone();
    }

    clone() {
        return new Transform({
            position: this.position.clone(),
            rotation: this.rotation.clone(),
            scale: this.scale.clone()
        });
    }
}
