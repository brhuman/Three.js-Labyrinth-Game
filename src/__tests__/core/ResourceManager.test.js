import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ResourceManager } from '../../core/ResourceManager.js';
import { EventBus } from '../../core/EventBus.js';

// Mock Three.js classes
vi.mock('three', () => ({
    LoadingManager: vi.fn(() => ({
        onLoad: null,
        onProgress: null,
        onError: null
    })),
    TextureLoader: vi.fn(() => ({
        load: vi.fn()
    })),
    AudioLoader: vi.fn(() => ({
        load: vi.fn()
    })),
    Texture: vi.fn(() => ({
        dispose: vi.fn(),
        wrapS: 0,
        wrapT: 0,
        repeat: { set: vi.fn() },
        flipY: false,
        encoding: 3000,
        generateMipmaps: true
    })),
    RepeatWrapping: 1000,
    THREE: {
        RepeatWrapping: 1000
    }
}));

describe('ResourceManager', () => {
    let resourceManager;
    let mockEventBus;
    
    beforeEach(() => {
        mockEventBus = new EventBus();
        resourceManager = new ResourceManager(mockEventBus);
        vi.spyOn(mockEventBus, 'emit');
    });
    
    describe('Initialization', () => {
        it('should initialize with empty caches', () => {
            expect(resourceManager.textures.size).toBe(0);
            expect(resourceManager.sounds.size).toBe(0);
            expect(resourceManager.models.size).toBe(0);
        });
        
        it('should have zero loaded resources initially', () => {
            const progress = resourceManager.getLoadProgress();
            expect(progress.loaded).toBe(0);
            expect(progress.total).toBe(0);
            expect(progress.percentage).toBe(0);
        });
    });
    
    describe('Texture loading', () => {
        it('should load texture and cache it', async () => {
            const mockTexture = { dispose: vi.fn() };
            const mockLoader = require('three').TextureLoader();
            
            mockLoader.load.mockImplementation((path, onLoad) => {
                setTimeout(() => onLoad(mockTexture), 10);
            });
            
            const texture = await resourceManager.loadTexture('/test.png');
            
            expect(texture).toBe(mockTexture);
            expect(resourceManager.hasTexture('/test.png')).toBe(true);
            expect(resourceManager.getTexture('/test.png')).toBe(mockTexture);
        });
        
        it('should return cached texture on subsequent calls', async () => {
            const mockTexture = { dispose: vi.fn() };
            const mockLoader = require('three').TextureLoader();
            
            mockLoader.load.mockImplementation((path, onLoad) => {
                setTimeout(() => onLoad(mockTexture), 10);
            });
            
            const texture1 = await resourceManager.loadTexture('/test.png');
            const texture2 = await resourceManager.loadTexture('/test.png');
            
            expect(texture1).toBe(texture2);
            expect(mockLoader.load).toHaveBeenCalledTimes(1);
        });
        
        it('should apply texture options', async () => {
            const mockTexture = { 
                dispose: vi.fn(),
                repeat: { set: vi.fn() },
                flipY: false
            };
            const mockLoader = require('three').TextureLoader();
            
            mockLoader.load.mockImplementation((path, onLoad) => {
                setTimeout(() => onLoad(mockTexture), 10);
            });
            
            const options = {
                repeat: [2, 3],
                flipY: true
            };
            
            await resourceManager.loadTexture('/test.png', options);
            
            expect(mockTexture.repeat.set).toHaveBeenCalledWith(2, 3);
            expect(mockTexture.flipY).toBe(true);
        });
        
        it('should emit events on texture load', async () => {
            const mockTexture = { dispose: vi.fn() };
            const mockLoader = require('three').TextureLoader();
            
            mockLoader.load.mockImplementation((path, onLoad) => {
                setTimeout(() => onLoad(mockTexture), 10);
            });
            
            await resourceManager.loadTexture('/test.png');
            
            expect(mockEventBus.emit).toHaveBeenCalledWith('texture_loaded', {
                path: '/test.png',
                texture: mockTexture,
                options: {}
            });
        });
    });
    
    describe('Sound loading', () => {
        it('should load sound and cache it', async () => {
            const mockBuffer = new ArrayBuffer(1024);
            const mockLoader = require('three').AudioLoader();
            
            mockLoader.load.mockImplementation((path, onLoad) => {
                setTimeout(() => onLoad(mockBuffer), 10);
            });
            
            const buffer = await resourceManager.loadSound('/test.mp3');
            
            expect(buffer).toBe(mockBuffer);
            expect(resourceManager.hasSound('/test.mp3')).toBe(true);
            expect(resourceManager.getSound('/test.mp3')).toBe(mockBuffer);
        });
        
        it('should return cached sound on subsequent calls', async () => {
            const mockBuffer = new ArrayBuffer(1024);
            const mockLoader = require('three').AudioLoader();
            
            mockLoader.load.mockImplementation((path, onLoad) => {
                setTimeout(() => onLoad(mockBuffer), 10);
            });
            
            const buffer1 = await resourceManager.loadSound('/test.mp3');
            const buffer2 = await resourceManager.loadSound('/test.mp3');
            
            expect(buffer1).toBe(buffer2);
            expect(mockLoader.load).toHaveBeenCalledTimes(1);
        });
        
        it('should emit events on sound load', async () => {
            const mockBuffer = new ArrayBuffer(1024);
            const mockLoader = require('three').AudioLoader();
            
            mockLoader.load.mockImplementation((path, onLoad) => {
                setTimeout(() => onLoad(mockBuffer), 10);
            });
            
            await resourceManager.loadSound('/test.mp3');
            
            expect(mockEventBus.emit).toHaveBeenCalledWith('sound_loaded', {
                path: '/test.mp3',
                buffer: mockBuffer
            });
        });
    });
    
    describe('Resource management', () => {
        it('should track loading progress correctly', async () => {
            const mockTexture = { dispose: vi.fn() };
            const mockLoader = require('three').TextureLoader();
            
            mockLoader.load.mockImplementation((path, onLoad) => {
                setTimeout(() => onLoad(mockTexture), 10);
            });
            
            const promise1 = resourceManager.loadTexture('/test1.png');
            const promise2 = resourceManager.loadTexture('/test2.png');
            
            // Во время загрузки
            const progress = resourceManager.getLoadProgress();
            expect(progress.total).toBe(2);
            expect(progress.loaded).toBe(0);
            expect(progress.isLoading).toBe(true);
            
            await Promise.all([promise1, promise2]);
            
            // После загрузки
            const finalProgress = resourceManager.getLoadProgress();
            expect(finalProgress.loaded).toBe(2);
            expect(finalProgress.total).toBe(2);
            expect(finalProgress.percentage).toBe(100);
            expect(finalProgress.isLoading).toBe(false);
        });
        
        it('should provide resource statistics', () => {
            const stats = resourceManager.getResourceStats();
            
            expect(stats).toEqual({
                textures: 0,
                sounds: 0,
                models: 0,
                loading: 0,
                progress: {
                    loaded: 0,
                    total: 0,
                    percentage: 0,
                    isLoading: false
                }
            });
        });
        
        it('should list loaded resources', () => {
            resourceManager.textures.set('/test.png', 'texture');
            resourceManager.sounds.set('/test.mp3', 'sound');
            resourceManager.models.set('/test.gltf', 'model');
            
            const list = resourceManager.listLoadedResources();
            
            expect(list.textures).toContain('/test.png');
            expect(list.sounds).toContain('/test.mp3');
            expect(list.models).toContain('/test.gltf');
        });
    });
    
    describe('Resource disposal', () => {
        it('should dispose texture', () => {
            const mockTexture = { dispose: vi.fn() };
            resourceManager.textures.set('/test.png', mockTexture);
            
            resourceManager.disposeTexture('/test.png');
            
            expect(mockTexture.dispose).toHaveBeenCalled();
            expect(resourceManager.hasTexture('/test.png')).toBe(false);
            expect(mockEventBus.emit).toHaveBeenCalledWith('texture_disposed', { path: '/test.png' });
        });
        
        it('should dispose sound', () => {
            resourceManager.sounds.set('/test.mp3', 'buffer');
            
            resourceManager.disposeSound('/test.mp3');
            
            expect(resourceManager.hasSound('/test.mp3')).toBe(false);
            expect(mockEventBus.emit).toHaveBeenCalledWith('sound_disposed', { path: '/test.mp3' });
        });
        
        it('should dispose all resources', () => {
            const mockTexture = { dispose: vi.fn() };
            const mockModel = { dispose: vi.fn() };
            
            resourceManager.textures.set('/test.png', mockTexture);
            resourceManager.models.set('/test.gltf', mockModel);
            resourceManager.sounds.set('/test.mp3', 'buffer');
            
            resourceManager.disposeAll();
            
            expect(mockTexture.dispose).toHaveBeenCalled();
            expect(mockModel.dispose).toHaveBeenCalled();
            expect(resourceManager.textures.size).toBe(0);
            expect(resourceManager.sounds.size).toBe(0);
            expect(resourceManager.models.size).toBe(0);
            expect(mockEventBus.emit).toHaveBeenCalledWith('all_resources_disposed');
        });
    });
    
    describe('Error handling', () => {
        it('should handle texture loading errors', async () => {
            const mockLoader = require('three').TextureLoader();
            const error = new Error('Failed to load');
            
            mockLoader.load.mockImplementation((path, onLoad, onProgress, onError) => {
                setTimeout(() => onError(error), 10);
            });
            
            await expect(resourceManager.loadTexture('/test.png')).rejects.toThrow('Failed to load');
            expect(mockEventBus.emit).toHaveBeenCalledWith('texture_error', {
                path: '/test.png',
                error
            });
        });
        
        it('should handle sound loading errors', async () => {
            const mockLoader = require('three').AudioLoader();
            const error = new Error('Failed to load');
            
            mockLoader.load.mockImplementation((path, onLoad, onProgress, onError) => {
                setTimeout(() => onError(error), 10);
            });
            
            await expect(resourceManager.loadSound('/test.mp3')).rejects.toThrow('Failed to load');
            expect(mockEventBus.emit).toHaveBeenCalledWith('sound_error', {
                path: '/test.mp3',
                error
            });
        });
    });
});
