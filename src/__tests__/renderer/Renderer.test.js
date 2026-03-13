import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Renderer } from '../../renderer/Renderer.js';

// Mock Three.js classes
vi.mock('three', () => ({
    Scene: vi.fn(() => ({
        add: vi.fn(),
        remove: vi.fn(),
        clear: vi.fn(),
        children: [],
        fog: null
    })),
    PerspectiveCamera: vi.fn((fov, aspect, near, far) => ({
        fov,
        aspect,
        near,
        far,
        position: { set: vi.fn() },
        updateProjectionMatrix: vi.fn()
    })),
    WebGLRenderer: vi.fn(() => ({
        setSize: vi.fn(),
        setPixelRatio: vi.fn(),
        setClearColor: vi.fn(),
        render: vi.fn(),
        dispose: vi.fn(),
        domElement: document.createElement('canvas'),
        shadowMap: { enabled: false, type: null },
        info: { memory: { geometries: 0, textures: 0 }, render: { calls: 0 } },
        capabilities: { isWebGL2: true }
    })),
    Fog: vi.fn(),
    SphereGeometry: vi.fn(),
    MeshBasicMaterial: vi.fn(),
    Mesh: vi.fn(),
    BufferGeometry: vi.fn(),
    BufferAttribute: vi.fn(),
    PointsMaterial: vi.fn(),
    Points: vi.fn(),
    SpriteMaterial: vi.fn(),
    Sprite: vi.fn(),
    CanvasTexture: vi.fn(),
    AmbientLight: vi.fn(),
    DirectionalLight: vi.fn(),
    AdditiveBlending: 1002,
    BackSide: 1,
    PCFShadowMap: 1
}));

describe('Renderer', () => {
    let renderer;
    let mockEventBus;
    let mockResourceManager;
    
    beforeEach(() => {
        mockEventBus = { emit: vi.fn(), on: vi.fn() };
        mockResourceManager = { 
            loadTexture: vi.fn().mockResolvedValue({}),
            loadSound: vi.fn().mockResolvedValue({})
        };
        
        renderer = new Renderer({
            eventBus: mockEventBus,
            resourceManager: mockResourceManager,
            width: 800,
            height: 600
        });
    });
    
    describe('Initialization', () => {
        it('should create renderer with default options', () => {
            expect(renderer.options.width).toBe(800);
            expect(renderer.options.height).toBe(600);
            expect(renderer.options.antialias).toBe(true);
            expect(renderer.options.shadows).toBe(true);
        });
        
        it('should create scene, camera and WebGL renderer', () => {
            const THREE = require('three');
            expect(THREE.Scene).toHaveBeenCalled();
            expect(THREE.PerspectiveCamera).toHaveBeenCalledWith(75, 800/600, 0.1, 1000);
            expect(THREE.WebGLRenderer).toHaveBeenCalledWith({
                antialias: true,
                powerPreference: "high-performance"
            });
        });
        
        it('should emit initialization events', () => {
            expect(mockEventBus.emit).toHaveBeenCalledWith('renderer_initialized', {
                width: 800,
                height: 600
            });
            expect(mockEventBus.emit).toHaveBeenCalledWith('scene_created');
            expect(mockEventBus.emit).toHaveBeenCalledWith('camera_created');
            expect(mockEventBus.emit).toHaveBeenCalledWith('renderer_created');
        });
    });
    
    describe('Scene setup', () => {
        it('should setup scene with fog', () => {
            const THREE = require('three');
            expect(THREE.Fog).toHaveBeenCalledWith(0x020502, 10, 100);
        });
        
        it('should create sky elements', () => {
            const THREE = require('three');
            expect(THREE.SphereGeometry).toHaveBeenCalledWith(500, 32, 32);
            expect(THREE.MeshBasicMaterial).toHaveBeenCalledWith({
                color: 0x020208,
                side: 1
            });
        });
    });
    
    describe('Lighting setup', () => {
        it('should create ambient light', () => {
            const THREE = require('three');
            expect(THREE.AmbientLight).toHaveBeenCalledWith(0x404040, 0.3);
        });
        
        it('should create moon light with shadows', () => {
            const THREE = require('three');
            expect(THREE.DirectionalLight).toHaveBeenCalledWith(0x406080, 0.5);
        });
        
        it('should emit lighting setup complete event', () => {
            expect(mockEventBus.emit).toHaveBeenCalledWith('lighting_setup_complete');
        });
    });
    
    describe('Rendering', () => {
        it('should render scene', () => {
            renderer.render();
            
            const THREE = require('three');
            const webglRenderer = THREE.WebGLRenderer.mock.results[0].value;
            expect(webglRenderer.render).toHaveBeenCalled();
        });
        
        it('should update performance monitor', () => {
            const initialTime = performance.now();
            vi.mocked(performance.now).mockReturnValue(initialTime);
            
            renderer.render();
            
            vi.mocked(performance.now).mockReturnValue(initialTime + 100);
            renderer.render();
            
            expect(mockEventBus.emit).toHaveBeenCalledWith('fps_updated', expect.objectContaining({
                fps: expect.any(Number),
                frameTime: expect.any(Number)
            }));
        });
    });
    
    describe('Resize handling', () => {
        it('should resize renderer and camera', () => {
            renderer.resize(1024, 768);
            
            expect(renderer.options.width).toBe(1024);
            expect(renderer.options.height).toBe(768);
            
            const THREE = require('three');
            const camera = THREE.PerspectiveCamera.mock.results[0].value;
            expect(camera.aspect).toBe(1024 / 768);
            expect(camera.updateProjectionMatrix).toHaveBeenCalled();
            
            const webglRenderer = THREE.WebGLRenderer.mock.results[0].value;
            expect(webglRenderer.setSize).toHaveBeenCalledWith(1024, 768);
        });
        
        it('should emit resize event', () => {
            renderer.resize(1024, 768);
            
            expect(mockEventBus.emit).toHaveBeenCalledWith('renderer_resized', {
                width: 1024,
                height: 768
            });
        });
    });
    
    describe('Graphics quality', () => {
        it('should update graphics quality settings', () => {
            const THREE = require('three');
            const webglRenderer = THREE.WebGLRenderer.mock.results[0].value;
            
            renderer.updateGraphicsQuality('low');
            expect(webglRenderer.setPixelRatio).toHaveBeenCalledWith(1);
            expect(webglRenderer.antialias).toBe(false);
            
            renderer.updateGraphicsQuality('ultra');
            expect(webglRenderer.setPixelRatio).toHaveBeenCalledWith(expect.any(Number));
            expect(webglRenderer.antialias).toBe(true);
        });
        
        it('should emit graphics quality updated event', () => {
            renderer.updateGraphicsQuality('high');
            
            expect(mockEventBus.emit).toHaveBeenCalledWith('graphics_quality_updated', {
                quality: 'high'
            });
        });
    });
    
    describe('Shadow quality', () => {
        it('should update shadow quality settings', () => {
            const THREE = require('three');
            const moonLight = THREE.DirectionalLight.mock.results[0].value;
            
            renderer.updateShadowQuality('high');
            expect(moonLight.shadow.mapSize.width).toBe(2048);
            expect(moonLight.shadow.mapSize.height).toBe(2048);
        });
        
        it('should emit shadow quality updated event', () => {
            renderer.updateShadowQuality('medium');
            
            expect(mockEventBus.emit).toHaveBeenCalledWith('shadow_quality_updated', {
                quality: 'medium'
            });
        });
    });
    
    describe('Object management', () => {
        it('should add objects to scene', () => {
            const mockObject = { id: 'test' };
            const THREE = require('three');
            const scene = THREE.Scene.mock.results[0].value;
            
            renderer.addObject(mockObject);
            
            expect(scene.add).toHaveBeenCalledWith(mockObject);
            expect(mockEventBus.emit).toHaveBeenCalledWith('object_added', {
                object: mockObject
            });
        });
        
        it('should remove objects from scene', () => {
            const mockObject = { id: 'test' };
            const THREE = require('three');
            const scene = THREE.Scene.mock.results[0].value;
            
            renderer.removeObject(mockObject);
            
            expect(scene.remove).toHaveBeenCalledWith(mockObject);
            expect(mockEventBus.emit).toHaveBeenCalledWith('object_removed', {
                object: mockObject
            });
        });
    });
    
    describe('Light management', () => {
        it('should update light intensity', () => {
            const mockLight = { intensity: 0.5 };
            renderer.lights.set('test', mockLight);
            
            renderer.updateLightIntensity('test', 0.8);
            
            expect(mockLight.intensity).toBe(0.8);
            expect(mockEventBus.emit).toHaveBeenCalledWith('light_updated', {
                lightName: 'test',
                intensity: 0.8
            });
        });
        
        it('should handle non-existent light', () => {
            renderer.updateLightIntensity('nonexistent', 0.8);
            
            expect(mockEventBus.emit).not.toHaveBeenCalledWith('light_updated', expect.any(Object));
        });
    });
    
    describe('Statistics', () => {
        it('should return renderer statistics', () => {
            const stats = renderer.getStats();
            
            expect(stats).toHaveProperty('scene');
            expect(stats).toHaveProperty('renderer');
            expect(stats).toHaveProperty('performance');
            
            expect(stats.scene).toHaveProperty('objects');
            expect(stats.scene).toHaveProperty('lights');
            expect(stats.renderer).toHaveProperty('info');
            expect(stats.performance).toHaveProperty('fps');
        });
    });
    
    describe('Event listeners', () => {
        it('should setup resize event listener', () => {
            expect(mockEventBus.on).toHaveBeenCalledWith('resize', expect.any(Function));
        });
        
        it('should setup graphics quality event listener', () => {
            expect(mockEventBus.on).toHaveBeenCalledWith('graphics_quality_changed', expect.any(Function));
        });
        
        it('should setup shadow quality event listener', () => {
            expect(mockEventBus.on).toHaveBeenCalledWith('shadow_quality_changed', expect.any(Function));
        });
    });
    
    describe('Cleanup', () => {
        it('should dispose renderer properly', () => {
            const THREE = require('three');
            const webglRenderer = THREE.WebGLRenderer.mock.results[0].value;
            const scene = THREE.Scene.mock.results[0].value;
            
            renderer.dispose();
            
            expect(webglRenderer.dispose).toHaveBeenCalled();
            expect(scene.clear).toHaveBeenCalled();
            expect(renderer.lights.size).toBe(0);
            expect(mockEventBus.emit).toHaveBeenCalledWith('renderer_disposed');
        });
    });
});
