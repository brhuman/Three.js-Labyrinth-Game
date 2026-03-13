import * as THREE from 'three';

export class Entity {
    constructor(id) {
        this.id = id;
        this.components = new Map();
        this.isActive = true;
    }

    addComponent(name, component) {
        this.components.set(name, component);
        return this;
    }

    getComponent(name) {
        return this.components.get(name);
    }

    hasComponent(name) {
        return this.components.has(name);
    }

    removeComponent(name) {
        this.components.delete(name);
        return this;
    }

    dispose() {
        this.components.clear();
        this.isActive = false;
    }

    clone(newId) {
        const newEntity = new Entity(newId);
        this.components.forEach((component, name) => {
            // Deep clone components if they have a clone method
            if (component && typeof component.clone === 'function') {
                newEntity.addComponent(name, component.clone());
            } else {
                newEntity.addComponent(name, component);
            }
        });
        return newEntity;
    }
}
