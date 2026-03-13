import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GameCore } from '../../core/GameCore.js';

// Mock dependencies
vi.mock('../../core/EventBus.js', () => ({
    EventBus: vi.fn().mockImplementation(() => ({
        on: vi.fn(),
        emit: vi.fn(),
        clear: vi.fn()
    }))
}));

vi.mock('../../core/GameStateManager.js', () => ({
    GameStateManager: vi.fn().mockImplementation(() => ({
        setState: vi.fn().mockReturnValue(true),
        getState: vi.fn().mockReturnValue('loading'),
        isActiveGame: vi.fn().mockReturnValue(false),
        isInGame: vi.fn().mockReturnValue(false)
    }))
}));

vi.mock('../../core/ResourceManager.js', () => ({
    ResourceManager: vi.fn().mockImplementation(() => ({
        preloadGameResources: vi.fn().mockResolvedValue(),
        getResourceStats: vi.fn().mockReturnValue({
            textures: 0,
            sounds: 0,
            models: 0
        }),
        disposeAll: vi.fn()
    }))
}));

vi.mock('../../renderer/Renderer.js', () => ({
    Renderer: vi.fn().mockImplementation(() => ({
        render: vi.fn(),
        resize: vi.fn(),
        getStats: vi.fn().mockReturnValue({
            scene: { objects: 0 },
            performance: { fps: 60 }
        }),
        dispose: vi.fn()
    }))
}));

describe('GameCore', () => {
    let gameCore;
    let mockEventBus;
    let mockStateManager;
    let mockResourceManager;
    let mockRenderer;
    
    beforeEach(() => {
        // Получаем mock-объекты
        const { EventBus } = require('../../core/EventBus.js');
        const { GameStateManager } = require('../../core/GameStateManager.js');
        const { ResourceManager } = require('../../core/ResourceManager.js');
        const { Renderer } = require('../../renderer/Renderer.js');
        
        mockEventBus = new EventBus();
        mockStateManager = new GameStateManager();
        mockResourceManager = new ResourceManager();
        mockRenderer = new Renderer();
        
        gameCore = new GameCore({
            eventBus: mockEventBus,
            stateManager: mockStateManager,
            resourceManager: mockResourceManager,
            renderer: mockRenderer
        });
        
        // Mock requestAnimationFrame
        global.requestAnimationFrame = vi.fn((cb) => setTimeout(cb, 16));
    });
    
    describe('Initialization', () => {
        it('should initialize with default dependencies', () => {
            const { EventBus, GameStateManager, ResourceManager, Renderer } = require('../../core/GameCore.js');
            
            const core = new GameCore();
            
            expect(EventBus).toHaveBeenCalled();
            expect(GameStateManager).toHaveBeenCalled();
            expect(ResourceManager).toHaveBeenCalled();
            expect(Renderer).toHaveBeenCalled();
        });
        
        it('should setup event listeners', () => {
            expect(mockEventBus.on).toHaveBeenCalledWith('state_changed', expect.any(Function));
            expect(mockEventBus.on).toHaveBeenCalledWith('all_resources_loaded', expect.any(Function));
            expect(mockEventBus.on).toHaveBeenCalledWith('resize', expect.any(Function));
            expect(mockEventBus.on).toHaveBeenCalledWith('error', expect.any(Function));
        });
        
        it('should initialize successfully', async () => {
            const result = await gameCore.initialize();
            
            expect(result).toBe(true);
            expect(mockStateManager.setState).toHaveBeenCalledWith('loading');
            expect(mockResourceManager.preloadGameResources).toHaveBeenCalled();
            expect(mockStateManager.setState).toHaveBeenCalledWith('menu');
            expect(gameCore.isInitialized).toBe(true);
        });
        
        it('should emit initialization events', async () => {
            await gameCore.initialize();
            
            expect(mockEventBus.emit).toHaveBeenCalledWith('initialization_started');
            expect(mockEventBus.emit).toHaveBeenCalledWith('resources_preload_started');
            expect(mockEventBus.emit).toHaveBeenCalledWith('resources_preload_complete');
            expect(mockEventBus.emit).toHaveBeenCalledWith('renderer_setup_started');
            expect(mockEventBus.emit).toHaveBeenCalledWith('renderer_setup_complete');
            expect(mockEventBus.emit).toHaveBeenCalledWith('initialization_complete');
        });
        
        it('should handle initialization errors', async () => {
            mockResourceManager.preloadGameResources.mockRejectedValue(new Error('Load failed'));
            
            const result = await gameCore.initialize();
            
            expect(result).toBe(false);
            expect(mockEventBus.emit).toHaveBeenCalledWith('core_error', expect.objectContaining({
                error: expect.any(Error)
            }));
        });
    });
    
    describe('Game loop', () => {
        beforeEach(async () => {
            await gameCore.initialize();
        });
        
        it('should start game loop', () => {
            expect(gameCore.isRunning).toBe(false);
            
            gameCore.start();
            
            expect(gameCore.isRunning).toBe(true);
            expect(mockEventBus.emit).toHaveBeenCalledWith('game_started');
            expect(global.requestAnimationFrame).toHaveBeenCalled();
        });
        
        it('should not start if not initialized', () => {
            const uninitializedCore = new GameCore();
            
            expect(() => uninitializedCore.start()).toThrow('Game core not initialized');
        });
        
        it('should not start if already running', () => {
            gameCore.start();
            
            // Второй вызов не должен запускать новый цикл
            gameCore.start();
            
            expect(global.requestAnimationFrame).toHaveBeenCalledTimes(1);
        });
        
        it('should stop game loop', () => {
            gameCore.start();
            gameCore.stop();
            
            expect(gameCore.isRunning).toBe(false);
            expect(mockEventBus.emit).toHaveBeenCalledWith('game_stopped');
        });
        
        it('should update and render when running', () => {
            mockStateManager.isActiveGame.mockReturnValue(true);
            
            gameCore.start();
            
            // Проверяем, что вызываются методы обновления и рендеринга
            expect(mockRenderer.render).toHaveBeenCalled();
        });
        
        it('should not update when game is not active', () => {
            mockStateManager.isActiveGame.mockReturnValue(false);
            
            gameCore.start();
            
            // Рендеринг должен работать, но обновления игры - нет
            expect(mockRenderer.render).toHaveBeenCalled();
            expect(mockEventBus.emit).not.toHaveBeenCalledWith('update', expect.any(Object));
        });
    });
    
    describe('State handling', () => {
        beforeEach(async () => {
            await gameCore.initialize();
        });
        
        it('should handle game start state change', () => {
            mockStateManager.getState.mockReturnValue('playing');
            
            gameCore.handleStateChange({ from: 'menu', to: 'playing' });
            
            expect(mockEventBus.emit).toHaveBeenCalledWith('game_start');
            expect(mockEventBus.emit).toHaveBeenCalledWith('core_state_changed', {
                from: 'menu',
                to: 'playing'
            });
        });
        
        it('should handle pause state change', () => {
            mockStateManager.getState.mockReturnValue('paused');
            
            gameCore.handleStateChange({ from: 'playing', to: 'paused' });
            
            expect(mockEventBus.emit).toHaveBeenCalledWith('game_pause');
        });
        
        it('should handle menu state change', () => {
            mockStateManager.getState.mockReturnValue('menu');
            
            gameCore.handleStateChange({ from: 'playing', to: 'menu' });
            
            expect(mockEventBus.emit).toHaveBeenCalledWith('menu_enter');
        });
        
        it('should handle game over state change', () => {
            mockStateManager.getState.mockReturnValue('game_over');
            
            gameCore.handleStateChange({ from: 'playing', to: 'game_over' });
            
            expect(mockEventBus.emit).toHaveBeenCalledWith('game_over');
        });
    });
    
    describe('Resource handling', () => {
        beforeEach(async () => {
            await gameCore.initialize();
        });
        
        it('should handle resources loaded event', () => {
            gameCore.onResourcesLoaded();
            
            expect(mockEventBus.emit).toHaveBeenCalledWith('core_resources_loaded');
        });
    });
    
    describe('Error handling', () => {
        beforeEach(async () => {
            await gameCore.initialize();
        });
        
        it('should handle core errors', () => {
            const error = new Error('Test error');
            const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
            
            gameCore.handleError(error);
            
            expect(consoleSpy).toHaveBeenCalledWith('GameCore Error:', error);
            expect(mockEventBus.emit).toHaveBeenCalledWith('core_error', { error });
            
            consoleSpy.mockRestore();
        });
        
        it('should return to menu on game errors', () => {
            mockStateManager.isInGame.mockReturnValue(true);
            const error = new Error('Game error');
            const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
            
            gameCore.handleError(error);
            
            expect(mockStateManager.setState).toHaveBeenCalledWith('menu', {
                error: error.message,
                fromGame: true
            });
            
            consoleSpy.mockRestore();
        });
    });
    
    describe('Resize handling', () => {
        beforeEach(async () => {
            await gameCore.initialize();
        });
        
        it('should handle resize events', () => {
            const resizeData = { width: 1024, height: 768 };
            
            gameCore.handleResize(resizeData);
            
            expect(mockRenderer.resize).toHaveBeenCalledWith(1024, 768);
        });
    });
    
    describe('API access', () => {
        it('should provide access to core components', () => {
            expect(gameCore.getEventBus()).toBe(mockEventBus);
            expect(gameCore.getStateManager()).toBe(mockStateManager);
            expect(gameCore.getResourceManager()).toBe(mockResourceManager);
            expect(gameCore.getRenderer()).toBe(mockRenderer);
        });
    });
    
    describe('Statistics', () => {
        it('should return comprehensive stats', () => {
            const stats = gameCore.getStats();
            
            expect(stats).toHaveProperty('core');
            expect(stats).toHaveProperty('renderer');
            expect(stats).toHaveProperty('resources');
            
            expect(stats.core).toEqual({
                initialized: false,
                running: false,
                state: 'loading'
            });
        });
    });
    
    describe('Cleanup', () => {
        beforeEach(async () => {
            await gameCore.initialize();
            gameCore.start();
        });
        
        it('should dispose all resources', () => {
            gameCore.dispose();
            
            expect(gameCore.isRunning).toBe(false);
            expect(gameCore.isInitialized).toBe(false);
            expect(mockRenderer.dispose).toHaveBeenCalled();
            expect(mockResourceManager.disposeAll).toHaveBeenCalled();
            expect(mockEventBus.clear).toHaveBeenCalled();
            expect(mockEventBus.emit).toHaveBeenCalledWith('core_disposed');
        });
    });
});
