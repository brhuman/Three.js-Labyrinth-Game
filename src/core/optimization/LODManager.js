import * as THREE from 'three';

export class LODManager {
    constructor() {
        this.lodLevels = {
            near: { distance: 10, quality: 'high' },
            medium: { distance: 30, quality: 'medium' },
            far: { distance: 100, quality: 'low' }
        };
        
        this.objects = new Map();
        this.camera = null;
        this.lastUpdateTime = 0;
        this.updateInterval = 100; // ms between LOD updates
    }

    setCamera(camera) {
        this.camera = camera;
    }

    addObject(object, lodOptions = {}) {
        const lodData = {
            object: object,
            lodLevels: lodOptions.levels || this.createDefaultLOD(object),
            currentLevel: 'high',
            lastUpdate: 0
        };
        
        this.objects.set(object.uuid, lodData);
        return object.uuid;
    }

    removeObject(object) {
        this.objects.delete(object.uuid);
    }

    createDefaultLOD(object) {
        const levels = {};
        
        // High quality (original)
        levels.high = object.clone();
        
        // Medium quality (reduced geometry)
        levels.medium = this.createReducedGeometry(object, 0.5);
        
        // Low quality (further reduced)
        levels.low = this.createReducedGeometry(object, 0.25);
        
        return levels;
    }

    createReducedGeometry(original, reductionFactor) {
        const reduced = original.clone();
        
        // Reduce geometry complexity
        reduced.traverse((child) => {
            if (child.geometry) {
                const geometry = child.geometry;
                
                // Reduce vertices (simplified approach)
                if (geometry.attributes.position) {
                    const positions = geometry.attributes.position.array;
                    const newPositions = new Float32Array(Math.floor(positions.length * reductionFactor));
                    
                    for (let i = 0; i < newPositions.length; i += 3) {
                        const sourceIndex = Math.floor(i / reductionFactor);
                        newPositions[i] = positions[sourceIndex];
                        newPositions[i + 1] = positions[sourceIndex + 1];
                        newPositions[i + 2] = positions[sourceIndex + 2];
                    }
                    
                    geometry.setAttribute('position', new THREE.BufferAttribute(newPositions, 3));
                }
                
                // Simplify material
                if (child.material) {
                    const material = child.material.clone();
                    if (material.map) {
                        // Reduce texture quality for distant objects
                        material.map.anisotropy = 1;
                    }
                    child.material = material;
                }
            }
        });
        
        return reduced;
    }

    update(currentTime) {
        if (!this.camera) return;
        
        // Throttle updates
        if (currentTime - this.lastUpdateTime < this.updateInterval) {
            return;
        }
        
        this.lastUpdateTime = currentTime;
        
        this.objects.forEach((lodData, uuid) => {
            const distance = this.camera.position.distanceTo(lodData.object.position);
            const newLevel = this.getLODLevel(distance);
            
            if (newLevel !== lodData.currentLevel) {
                this.switchLOD(lodData, newLevel);
            }
        });
    }

    getLODLevel(distance) {
        if (distance < this.lodLevels.near.distance) {
            return 'high';
        } else if (distance < this.lodLevels.medium.distance) {
            return 'medium';
        } else {
            return 'low';
        }
    }

    switchLOD(lodData, newLevel) {
        const oldObject = lodData.lodLevels[lodData.currentLevel];
        const newObject = lodData.lodLevels[newLevel];
        
        // Copy transform
        newObject.position.copy(lodData.object.position);
        newObject.rotation.copy(lodData.object.rotation);
        newObject.scale.copy(lodData.object.scale);
        
        // Replace in scene
        if (lodData.object.parent) {
            const parent = lodData.object.parent;
            const index = parent.children.indexOf(lodData.object);
            
            if (index !== -1) {
                parent.children[index] = newObject;
                newObject.parent = parent;
            }
        }
        
        // Update reference
        lodData.object = newObject;
        lodData.currentLevel = newLevel;
    }

    setLODDistances(near, medium, far) {
        this.lodLevels.near.distance = near;
        this.lodLevels.medium.distance = medium;
        this.lodLevels.far.distance = far;
    }

    setUpdateInterval(interval) {
        this.updateInterval = interval;
    }

    getObjectCount() {
        return this.objects.size;
    }

    getLODStats() {
        const stats = {
            total: this.objects.size,
            high: 0,
            medium: 0,
            low: 0
        };
        
        this.objects.forEach(lodData => {
            stats[lodData.currentLevel]++;
        });
        
        return stats;
    }

    dispose() {
        this.objects.forEach(lodData => {
            Object.values(lodData.lodLevels).forEach(level => {
                if (level.geometry) level.geometry.dispose();
                if (level.material) level.material.dispose();
            });
        });
        
        this.objects.clear();
        this.camera = null;
    }
}
