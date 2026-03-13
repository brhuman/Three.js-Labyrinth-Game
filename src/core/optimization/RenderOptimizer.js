import * as THREE from 'three';
import { LODManager } from './LODManager.js';
import { PoolManager } from './ObjectPool.js';

export class RenderOptimizer {
    constructor(options = {}) {
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        
        // Optimization systems
        this.lodManager = new LODManager();
        this.poolManager = new PoolManager();
        
        // Performance settings
        this.targetFPS = options.targetFPS || 60;
        this.adaptiveQuality = options.adaptiveQuality !== false;
        this.currentQuality = 'high';
        
        // Performance monitoring
        this.frameCount = 0;
        this.lastTime = 0;
        this.fps = 0;
        this.frameTime = 0;
        this.performanceHistory = [];
        this.maxHistorySize = 60; // Store last 60 frames
        
        // Frustum culling
        this.frustum = new THREE.Frustum();
        this.cameraMatrix = new THREE.Matrix4();
        
        // Occlusion culling (simplified)
        this.occlusionTestDistance = options.occlusionTestDistance || 50;
        
        // Batching
        this.batchedObjects = new Map();
        this.instancedMeshes = new Map();
        
        // View distance culling
        this.maxViewDistance = options.maxViewDistance || 200;
        this.cullingDistance = options.cullingDistance || 150;
        
        this.setupEventListeners();
    }

    setupEventListeners() {
        // Listen for resize events
        window.addEventListener('resize', () => {
            this.onResize();
        });
    }

    initialize(scene, camera, renderer) {
        this.scene = scene;
        this.camera = camera;
        this.renderer = renderer;
        
        this.lodManager.setCamera(camera);
        
        // Setup renderer optimizations
        this.setupRendererOptimizations();
        
        // Create common pools
        this.setupCommonPools();
    }

    setupRendererOptimizations() {
        if (!this.renderer) return;
        
        // Enable shadow optimizations
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        
        // Set pixel ratio for performance
        const pixelRatio = Math.min(window.devicePixelRatio, 2);
        this.renderer.setPixelRatio(pixelRatio);
        
        // Enable antialiasing based on quality
        this.updateAntialiasing();
        
        // Tone mapping optimizations
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.0;
    }

    setupCommonPools() {
        // Create pools for common game objects
        if (this.scene) {
            // Particle effects pool
            const particleTexture = new THREE.Texture();
            this.poolManager.createParticlePool('particles', particleTexture, 100, 500);
            
            // Audio pool
            if (this.camera) {
                this.poolManager.createAudioPool('sounds', this.camera.listener, 20, 100);
            }
        }
    }

    update(currentTime) {
        if (!this.scene || !this.camera) return;
        
        // Update performance metrics
        this.updatePerformanceMetrics(currentTime);
        
        // Update LOD system
        this.lodManager.update(currentTime);
        
        // Frustum culling
        this.performFrustumCulling();
        
        // Distance culling
        this.performDistanceCulling();
        
        // Adaptive quality adjustment
        if (this.adaptiveQuality) {
            this.adjustQuality();
        }
        
        // Update instanced meshes
        this.updateInstancedMeshes();
    }

    updatePerformanceMetrics(currentTime) {
        const deltaTime = currentTime - this.lastTime;
        this.lastTime = currentTime;
        
        this.frameTime = deltaTime;
        this.fps = 1000 / deltaTime;
        
        // Add to history
        this.performanceHistory.push({
            fps: this.fps,
            frameTime: this.frameTime,
            time: currentTime
        });
        
        // Limit history size
        if (this.performanceHistory.length > this.maxHistorySize) {
            this.performanceHistory.shift();
        }
        
        this.frameCount++;
    }

    performFrustumCulling() {
        // Update frustum
        this.cameraMatrix.multiplyMatrices(
            this.camera.projectionMatrix, 
            this.camera.matrixWorldInverse
        );
        this.frustum.setFromProjectionMatrix(this.cameraMatrix);
        
        // Cull objects outside frustum
        this.scene.traverse((object) => {
            if (object.isMesh || object.isPoints) {
                // Simple bounding sphere test
                const boundingSphere = new THREE.Sphere();
                object.geometry.computeBoundingSphere();
                boundingSphere.copy(object.geometry.boundingSphere);
                boundingSphere.applyMatrix4(object.matrixWorld);
                
                object.visible = this.frustum.intersectsSphere(boundingSphere);
            }
        });
    }

    performDistanceCulling() {
        if (!this.camera) return;
        
        this.scene.traverse((object) => {
            if (object.isMesh || object.isPoints) {
                const distance = this.camera.position.distanceTo(object.position);
                
                // Hide objects beyond culling distance
                if (distance > this.cullingDistance) {
                    object.visible = false;
                } else if (distance <= this.maxViewDistance) {
                    // Only show if within max view distance and already visible
                    if (object.visible !== false) {
                        object.visible = true;
                    }
                }
            }
        });
    }

    adjustQuality() {
        if (this.performanceHistory.length < 30) return; // Need enough data
        
        const recentFPS = this.performanceHistory.slice(-30);
        const avgFPS = recentFPS.reduce((sum, frame) => sum + frame.fps, 0) / recentFPS.length;
        
        // Adjust quality based on performance
        if (avgFPS < this.targetFPS * 0.8 && this.currentQuality !== 'low') {
            this.setQuality('low');
        } else if (avgFPS > this.targetFPS * 1.2 && this.currentQuality !== 'high') {
            this.setQuality('high');
        } else if (avgFPS >= this.targetFPS * 0.8 && avgFPS <= this.targetFPS * 1.2 && this.currentQuality !== 'medium') {
            this.setQuality('medium');
        }
    }

    setQuality(quality) {
        this.currentQuality = quality;
        
        switch (quality) {
            case 'low':
                this.applyLowQuality();
                break;
            case 'medium':
                this.applyMediumQuality();
                break;
            case 'high':
                this.applyHighQuality();
                break;
        }
    }

    applyLowQuality() {
        if (this.renderer) {
            this.renderer.setPixelRatio(1);
            this.renderer.shadowMap.enabled = false;
            this.renderer.antialias = false;
        }
        
        // Reduce LOD distances
        this.lodManager.setLODDistances(5, 15, 50);
        
        // Reduce view distance
        this.cullingDistance = 100;
        this.maxViewDistance = 150;
    }

    applyMediumQuality() {
        if (this.renderer) {
            this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
            this.renderer.shadowMap.enabled = true;
            this.renderer.shadowMap.type = THREE.PCFShadowMap;
            this.renderer.antialias = true;
        }
        
        // Medium LOD distances
        this.lodManager.setLODDistances(10, 30, 100);
        
        // Medium view distance
        this.cullingDistance = 150;
        this.maxViewDistance = 200;
    }

    applyHighQuality() {
        if (this.renderer) {
            this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
            this.renderer.shadowMap.enabled = true;
            this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
            this.renderer.antialias = true;
        }
        
        // High LOD distances
        this.lodManager.setLODDistances(15, 50, 150);
        
        // High view distance
        this.cullingDistance = 200;
        this.maxViewDistance = 300;
    }

    updateAntialiasing() {
        if (!this.renderer) return;
        
        this.renderer.antialias = this.currentQuality !== 'low';
    }

    createInstancedMesh(geometry, material, maxCount = 100) {
        const instancedMesh = new THREE.InstancedMesh(geometry, material, maxCount);
        const id = `instanced_${Date.now()}`;
        this.instancedMeshes.set(id, {
            mesh: instancedMesh,
            instances: [],
            maxCount: maxCount
        });
        
        return { mesh: instancedMesh, id };
    }

    addInstancedInstance(meshId, transform) {
        const instancedData = this.instancedMeshes.get(meshId);
        if (!instancedData || instancedData.instances.length >= instancedData.maxCount) {
            return false;
        }
        
        const matrix = new THREE.Matrix4();
        matrix.compose(transform.position, transform.rotation, transform.scale);
        
        const index = instancedData.instances.length;
        instancedData.mesh.setMatrixAt(index, matrix);
        instancedData.mesh.instanceMatrix.needsUpdate = true;
        
        instancedData.instances.push(transform);
        
        return true;
    }

    updateInstancedMeshes() {
        this.instancedMeshes.forEach(instancedData => {
            instancedData.mesh.instanceMatrix.needsUpdate = true;
        });
    }

    onResize() {
        if (this.renderer) {
            // Adjust quality based on new resolution
            this.adjustQuality();
        }
    }

    getPerformanceStats() {
        const avgFPS = this.performanceHistory.length > 0 
            ? this.performanceHistory.reduce((sum, frame) => sum + frame.fps, 0) / this.performanceHistory.length 
            : 0;
        
        return {
            fps: Math.round(this.fps),
            avgFPS: Math.round(avgFPS),
            frameTime: Math.round(this.frameTime * 100) / 100,
            quality: this.currentQuality,
            lodStats: this.lodManager.getLODStats(),
            poolStats: this.poolManager.getTotalStats(),
            frameCount: this.frameCount
        };
    }

    dispose() {
        this.lodManager.dispose();
        this.poolManager.clearAll();
        this.instancedMeshes.clear();
        this.performanceHistory = [];
    }
}
