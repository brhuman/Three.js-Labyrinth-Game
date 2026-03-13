import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GameIntegration } from '../../GameIntegration.js';

// Mock Game class
const createMockGame = () => ({
    gameStarted: false,
    isPaused: false,
    isGameOver: false,
    onMonsterSpawned: vi.fn(),
    onKeyCollected: vi.fn(),
    onLevelComplete: vi.fn(),
    onGameOver: vi.fn(),
    textureLoader: {
        load: vi.fn()
    },
    audioLoader: {
        load: vi.fn()
    }
});

describe('GameIntegration', () => {
    let gameIntegration;
    let mockGame;
    
    beforeEach(() => {
        mockGame = createMockGame();
        gameIntegration = new GameIntegration(mockGame);
    });
    
    describe('Initialization', () => {
        it('should initialize with integration levels set to false', () => {
            const status = gameIntegration.getIntegrationStatus();
            
            expect(status.eventBus).toBe(false);
            expect(status.stateManager).toBe(false);
            expect(status.resourceManager).toBe(false);
            expect(status.renderer).toBe(false);
            expect(status.overall).toBe(false);
        });
        
        it('should setup integration automatically', () => {
            // Проверяем, что компоненты были добавлены в игру
            expect(mockGame.eventBus).toBeDefined();
            expect(mockGame.stateManager).toBeDefined();
            expect(mockGame.resourceManager).toBeDefined();
        });
    });
    
    describe('EventBus Integration', () => {
        it('should integrate event bus and redirect events', () => {
            const testData = { test: 'data' };
            
            // Эмитируем событие
            gameIntegration.emitEvent('monster_spawned', testData);
            
            // Проверяем, что оригинальный метод был вызван
            expect(mockGame.onMonsterSpawned).toHaveBeenCalledWith(testData);
        });
        
        it('should handle key collected events', () => {
            const testData = { keyId: 1 };
            
            gameIntegration.emitEvent('key_collected', testData);
            
            expect(mockGame.onKeyCollected).toHaveBeenCalledWith(testData);
        });
        
        it('should handle level complete events', () => {
            const testData = { level: 2 };
            
            gameIntegration.emitEvent('level_complete', testData);
            
            expect(mockGame.onLevelComplete).toHaveBeenCalledWith(testData);
        });
        
        it('should handle game over events', () => {
            const testData = { reason: 'monster' };
            
            gameIntegration.emitEvent('game_over', testData);
            
            expect(mockGame.onGameOver).toHaveBeenCalledWith(testData);
        });
    });
    
    describe('StateManager Integration', () => {
        it('should determine current game state correctly', () => {
            // Test menu state
            mockGame.gameStarted = false;
            mockGame.isPaused = false;
            mockGame.isGameOver = false;
            expect(gameIntegration.getCurrentGameState()).toBe('menu');
            
            // Test playing state
            mockGame.gameStarted = true;
            mockGame.isPaused = false;
            mockGame.isGameOver = false;
            expect(gameIntegration.getCurrentGameState()).toBe('playing');
            
            // Test paused state
            mockGame.gameStarted = true;
            mockGame.isPaused = true;
            mockGame.isGameOver = false;
            expect(gameIntegration.getCurrentGameState()).toBe('paused');
            
            // Test game over state
            mockGame.gameStarted = true;
            mockGame.isPaused = false;
            mockGame.isGameOver = true;
            expect(gameIntegration.getCurrentGameState()).toBe('game_over');
        });
        
        it('should sync game state with state manager', () => {
            const stateData = { to: 'playing', from: 'menu' };
            
            gameIntegration.syncGameState(stateData);
            
            expect(mockGame.gameStarted).toBe(true);
            expect(mockGame.isPaused).toBe(false);
            expect(mockGame.isGameOver).toBe(false);
        });
        
        it('should handle menu state sync', () => {
            const stateData = { to: 'menu', from: 'playing' };
            
            // Устанавливаем игровое состояние
            mockGame.gameStarted = true;
            mockGame.isPaused = false;
            mockGame.isGameOver = false;
            
            gameIntegration.syncGameState(stateData);
            
            expect(mockGame.gameStarted).toBe(false);
            expect(mockGame.isPaused).toBe(false);
            expect(mockGame.isGameOver).toBe(false);
        });
    });
    
    describe('ResourceManager Integration', () => {
        it('should redirect texture loading through resource manager', async () => {
            const mockTexture = { id: 'test-texture' };
            const onLoad = vi.fn();
            
            // Mock resource manager
            gameIntegration.resourceManager.loadTexture = vi.fn().mockResolvedValue(mockTexture);
            
            mockGame.textureLoader.load('/test.png', onLoad);
            
            // Ждём асинхронной операции
            await new Promise(resolve => setTimeout(resolve, 10));
            
            expect(gameIntegration.resourceManager.loadTexture).toHaveBeenCalledWith('/test.png');
            expect(onLoad).toHaveBeenCalledWith(mockTexture);
        });
        
        it('should redirect audio loading through resource manager', async () => {
            const mockBuffer = new ArrayBuffer(1024);
            const onLoad = vi.fn();
            
            // Mock resource manager
            gameIntegration.resourceManager.loadSound = vi.fn().mockResolvedValue(mockBuffer);
            
            mockGame.audioLoader.load('/test.mp3', onLoad);
            
            // Ждём асинхронной операции
            await new Promise(resolve => setTimeout(resolve, 10));
            
            expect(gameIntegration.resourceManager.loadSound).toHaveBeenCalledWith('/test.mp3');
            expect(onLoad).toHaveBeenCalledWith(mockBuffer);
        });
        
        it('should handle loading errors', async () => {
            const error = new Error('Load failed');
            const onError = vi.fn();
            
            // Mock resource manager
            gameIntegration.resourceManager.loadTexture = vi.fn().mockRejectedValue(error);
            
            mockGame.textureLoader.load('/test.png', null, null, onError);
            
            // Ждём асинхронной операции
            await new Promise(resolve => setTimeout(resolve, 10));
            
            expect(onError).toHaveBeenCalledWith(error);
        });
    });
    
    describe('Integration Status', () => {
        it('should track integration progress', () => {
            const status = gameIntegration.getIntegrationStatus();
            
            // После инициализации все компоненты должны быть интегрированы
            expect(status.eventBus).toBe(true);
            expect(status.stateManager).toBe(true);
            expect(status.resourceManager).toBe(true);
            expect(status.overall).toBe(true);
        });
        
        it('should provide integration statistics', () => {
            const stats = gameIntegration.getIntegrationStats();
            
            expect(stats).toHaveProperty('status');
            expect(stats).toHaveProperty('eventBus');
            expect(stats).toHaveProperty('stateManager');
            expect(stats).toHaveProperty('resourceManager');
            
            expect(stats.status).toHaveProperty('overall');
            expect(stats.eventBus).toHaveProperty('listeners');
            expect(stats.stateManager).toHaveProperty('currentState');
            expect(stats.resourceManager).toHaveProperty('stats');
        });
    });
    
    describe('Rollback functionality', () => {
        it('should rollback integration changes', () => {
            const originalTextureLoader = { load: vi.fn() };
            const originalAudioLoader = { load: vi.fn() };
            
            // Сохраняем оригинальные загрузчики
            gameIntegration.originalTextureLoader = originalTextureLoader;
            gameIntegration.originalAudioLoader = originalAudioLoader;
            
            gameIntegration.rollback();
            
            // Проверяем, что оригинальные загрузчики восстановлены
            expect(mockGame.textureLoader).toBe(originalTextureLoader);
            expect(mockGame.audioLoader).toBe(originalAudioLoader);
            
            // Проверяем, что флаги сброшены
            const status = gameIntegration.getIntegrationStatus();
            expect(status.eventBus).toBe(false);
            expect(status.stateManager).toBe(false);
            expect(status.resourceManager).toBe(false);
        });
    });
    
    describe('Full Integration', () => {
        it('should create GameCore when all components integrated', async () => {
            // Mock GameCore
            const mockGameCore = {
                initialize: vi.fn().mockResolvedValue(true),
                dispose: vi.fn()
            };
            
            // Mock GameCore constructor
            const { GameCore } = require('../../core/GameCore.js');
            GameCore.mockImplementation(() => mockGameCore);
            
            const result = await gameIntegration.fullIntegration();
            
            expect(GameCore).toHaveBeenCalledWith({
                eventBus: gameIntegration.eventBus,
                stateManager: gameIntegration.stateManager,
                resourceManager: gameIntegration.resourceManager
            });
            
            expect(mockGameCore.initialize).toHaveBeenCalled();
            expect(result).toBe(mockGameCore);
        });
        
        it('should throw error if not fully integrated', async () => {
            // Искусственно сбрасываем один из компонентов
            gameIntegration.integrationLevel.eventBus = false;
            
            await expect(gameIntegration.fullIntegration()).rejects.toThrow('Not all components are integrated yet');
        });
    });
    
    describe('Cleanup', () => {
        it('should dispose all resources', () => {
            const disposeSpy = vi.spyOn(gameIntegration.resourceManager, 'disposeAll');
            const clearSpy = vi.spyOn(gameIntegration.eventBus, 'clear');
            
            gameIntegration.dispose();
            
            expect(disposeSpy).toHaveBeenCalled();
            expect(clearSpy).toHaveBeenCalled();
        });
        
        it('should dispose GameCore if exists', () => {
            const mockGameCore = {
                dispose: vi.fn()
            };
            
            gameIntegration.gameCore = mockGameCore;
            gameIntegration.dispose();
            
            expect(mockGameCore.dispose).toHaveBeenCalled();
        });
    });
});
