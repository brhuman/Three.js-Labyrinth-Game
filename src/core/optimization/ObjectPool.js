import * as THREE from 'three';

export class ObjectPool {
    constructor(createFn, resetFn, initialSize = 10, maxSize = 100) {
        this.createFn = createFn;
        this.resetFn = resetFn;
        this.pool = [];
        this.active = new Set();
        this.initialSize = initialSize;
        this.maxSize = maxSize;
        
        // Pre-populate pool
        for (let i = 0; i < initialSize; i++) {
            this.pool.push(this.createFn());
        }
        
        this.stats = {
            created: initialSize,
            reused: 0,
            disposed: 0
        };
    }

    acquire() {
        let object;
        
        if (this.pool.length > 0) {
            object = this.pool.pop();
            this.stats.reused++;
        } else if (this.active.size < this.maxSize) {
            object = this.createFn();
            this.stats.created++;
        } else {
            console.warn('ObjectPool: Maximum size reached, reusing active object');
            // Return first active object (not ideal, but prevents crashes)
            object = this.active.values().next().value;
            this.release(object);
            return this.acquire();
        }
        
        this.active.add(object);
        return object;
    }

    release(object) {
        if (!this.active.has(object)) {
            console.warn('ObjectPool: Attempting to release non-active object');
            return;
        }
        
        this.active.delete(object);
        this.resetFn(object);
        
        if (this.pool.length < this.maxSize) {
            this.pool.push(object);
        } else {
            // Pool is full, dispose of the object
            this.disposeObject(object);
            this.stats.disposed++;
        }
    }

    disposeObject(object) {
        if (object.geometry) object.geometry.dispose();
        if (object.material) {
            if (Array.isArray(object.material)) {
                object.material.forEach(mat => mat.dispose());
            } else {
                object.material.dispose();
            }
        }
        if (object.dispose) object.dispose();
    }

    preload(count) {
        const toCreate = Math.min(count, this.maxSize - this.pool.length - this.active.size);
        
        for (let i = 0; i < toCreate; i++) {
            this.pool.push(this.createFn());
            this.stats.created++;
        }
    }

    clear() {
        // Dispose all pooled objects
        this.pool.forEach(object => this.disposeObject(object));
        this.pool = [];
        
        // Dispose all active objects
        this.active.forEach(object => this.disposeObject(object));
        this.active.clear();
        
        this.stats.disposed = this.stats.created;
    }

    getStats() {
        return {
            ...this.stats,
            poolSize: this.pool.length,
            activeCount: this.active.size,
            totalCount: this.pool.length + this.active.size,
            efficiency: this.stats.reused / (this.stats.created + this.stats.reused) || 0
        };
    }

    getUtilization() {
        return this.active.size / (this.pool.length + this.active.size) || 0;
    }
}

// Specific pool types for common game objects
export class MeshPool extends ObjectPool {
    constructor(geometry, material, initialSize = 10, maxSize = 100) {
        super(
            () => new THREE.Mesh(geometry.clone(), material.clone()),
            (mesh) => {
                mesh.position.set(0, 0, 0);
                mesh.rotation.set(0, 0, 0);
                mesh.scale.set(1, 1, 1);
                mesh.visible = false;
            },
            initialSize,
            maxSize
        );
    }
}

export class ParticlePool extends ObjectPool {
    constructor(texture, initialSize = 50, maxSize = 500) {
        super(
            () => {
                const geometry = new THREE.BufferGeometry();
                const positions = new Float32Array(3);
                const colors = new Float32Array(3);
                const sizes = new Float32Array(1);
                
                geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
                geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
                geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
                
                const material = new THREE.PointsMaterial({
                    map: texture,
                    size: 1,
                    vertexColors: true,
                    transparent: true,
                    opacity: 1
                });
                
                return new THREE.Points(geometry, material);
            },
            (particle) => {
                const positions = particle.geometry.attributes.position.array;
                const colors = particle.geometry.attributes.color.array;
                const sizes = particle.geometry.attributes.size.array;
                
                // Reset particle data
                positions[0] = positions[1] = positions[2] = 0;
                colors[0] = colors[1] = colors[2] = 1;
                sizes[0] = 1;
                
                particle.visible = false;
                particle.material.opacity = 1;
            },
            initialSize,
            maxSize
        );
    }
}

export class AudioPool extends ObjectPool {
    constructor(audioListener, initialSize = 10, maxSize = 50) {
        super(
            () => new THREE.Audio(audioListener),
            (audio) => {
                audio.stop();
                audio.setVolume(1);
                audio.setPlaybackRate(1);
                audio.setLoop(false);
            },
            initialSize,
            maxSize
        );
    }
}

// Pool manager for handling multiple pools
export class PoolManager {
    constructor() {
        this.pools = new Map();
    }

    createPool(name, createFn, resetFn, initialSize = 10, maxSize = 100) {
        const pool = new ObjectPool(createFn, resetFn, initialSize, maxSize);
        this.pools.set(name, pool);
        return pool;
    }

    createMeshPool(name, geometry, material, initialSize = 10, maxSize = 100) {
        const pool = new MeshPool(geometry, material, initialSize, maxSize);
        this.pools.set(name, pool);
        return pool;
    }

    createParticlePool(name, texture, initialSize = 50, maxSize = 500) {
        const pool = new ParticlePool(texture, initialSize, maxSize);
        this.pools.set(name, pool);
        return pool;
    }

    createAudioPool(name, audioListener, initialSize = 10, maxSize = 50) {
        const pool = new AudioPool(audioListener, initialSize, maxSize);
        this.pools.set(name, pool);
        return pool;
    }

    getPool(name) {
        return this.pools.get(name);
    }

    acquireFromPool(name) {
        const pool = this.pools.get(name);
        if (!pool) {
            console.error(`PoolManager: Pool '${name}' not found`);
            return null;
        }
        return pool.acquire();
    }

    releaseToPool(name, object) {
        const pool = this.pools.get(name);
        if (!pool) {
            console.error(`PoolManager: Pool '${name}' not found`);
            return;
        }
        pool.release(object);
    }

    preloadPool(name, count) {
        const pool = this.pools.get(name);
        if (!pool) {
            console.error(`PoolManager: Pool '${name}' not found`);
            return;
        }
        pool.preload(count);
    }

    getStats() {
        const stats = {};
        this.pools.forEach((pool, name) => {
            stats[name] = pool.getStats();
        });
        return stats;
    }

    clearAll() {
        this.pools.forEach(pool => pool.clear());
        this.pools.clear();
    }

    getTotalStats() {
        let totalCreated = 0;
        let totalReused = 0;
        let totalDisposed = 0;
        let totalActive = 0;
        let totalPooled = 0;
        
        this.pools.forEach(pool => {
            const stats = pool.getStats();
            totalCreated += stats.created;
            totalReused += stats.reused;
            totalDisposed += stats.disposed;
            totalActive += stats.activeCount;
            totalPooled += stats.poolSize;
        });
        
        return {
            created: totalCreated,
            reused: totalReused,
            disposed: totalDisposed,
            active: totalActive,
            pooled: totalPooled,
            total: totalActive + totalPooled,
            efficiency: totalReused / (totalCreated + totalReused) || 0
        };
    }
}
