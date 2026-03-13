import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GameStateManager } from '../../core/GameStateManager.js';
import { EventBus } from '../../core/EventBus.js';

describe('GameStateManager', () => {
    let gameStateManager;
    let mockEventBus;
    
    beforeEach(() => {
        mockEventBus = new EventBus();
        gameStateManager = new GameStateManager(mockEventBus);
        vi.spyOn(mockEventBus, 'emit');
    });
    
    describe('Initial state', () => {
        it('should initialize in LOADING state', () => {
            expect(gameStateManager.getState()).toBe('loading');
        });
        
        it('should have empty state data', () => {
            expect(gameStateManager.getStateData()).toEqual({});
        });
        
        it('should have empty state history', () => {
            expect(gameStateManager.getStateHistory()).toEqual([]);
        });
    });
    
    describe('State transitions', () => {
        it('should allow valid transition from LOADING to MENU', () => {
            const result = gameStateManager.setState('menu', { test: 'data' });
            
            expect(result).toBe(true);
            expect(gameStateManager.getState()).toBe('menu');
            expect(gameStateManager.getStateData()).toEqual({ test: 'data' });
            expect(mockEventBus.emit).toHaveBeenCalledWith('state_changed', {
                from: 'loading',
                to: 'menu',
                data: { test: 'data' },
                timestamp: expect.any(Number)
            });
        });
        
        it('should allow transition from MENU to PLAYING', () => {
            gameStateManager.setState('menu');
            const result = gameStateManager.setState('playing');
            
            expect(result).toBe(true);
            expect(gameStateManager.getState()).toBe('playing');
        });
        
        it('should allow transition from PLAYING to PAUSED', () => {
            gameStateManager.setState('menu');
            gameStateManager.setState('playing');
            const result = gameStateManager.setState('paused');
            
            expect(result).toBe(true);
            expect(gameStateManager.getState()).toBe('paused');
        });
        
        it('should reject invalid transition', () => {
            const result = gameStateManager.setState('playing'); // Direct from LOADING
            
            expect(result).toBe(false);
            expect(gameStateManager.getState()).toBe('loading');
        });
        
        it('should reject invalid state name', () => {
            expect(() => {
                gameStateManager.setState('invalid_state');
            }).toThrow('Invalid state: invalid_state');
        });
    });
    
    describe('State utilities', () => {
        beforeEach(() => {
            gameStateManager.setState('menu');
        });
        
        it('should check current state correctly', () => {
            expect(gameStateManager.isState('menu')).toBe(true);
            expect(gameStateManager.isState('playing')).toBe(false);
        });
        
        it('should check if in menu', () => {
            expect(gameStateManager.isInMenu()).toBe(true);
            expect(gameStateManager.isInGame()).toBe(false);
            expect(gameStateManager.isActiveGame()).toBe(false);
        });
        
        it('should check if in game', () => {
            gameStateManager.setState('playing');
            
            expect(gameStateManager.isInGame()).toBe(true);
            expect(gameStateManager.isActiveGame()).toBe(true);
            expect(gameStateManager.isInMenu()).toBe(false);
        });
        
        it('should check if paused', () => {
            gameStateManager.setState('playing');
            gameStateManager.setState('paused');
            
            expect(gameStateManager.isPaused()).toBe(true);
            expect(gameStateManager.isInGame()).toBe(true);
            expect(gameStateManager.isActiveGame()).toBe(false);
        });
    });
    
    describe('State data management', () => {
        it('should update state data', () => {
            gameStateManager.setState('menu', { level: 1 });
            gameStateManager.updateStateData({ score: 100 });
            
            expect(gameStateManager.getStateData()).toEqual({
                level: 1,
                score: 100
            });
            
            expect(mockEventBus.emit).toHaveBeenCalledWith('state_data_updated', {
                state: 'menu',
                data: { level: 1, score: 100 }
            });
        });
        
        it('should not mutate original state data', () => {
            const data = { level: 1 };
            gameStateManager.setState('menu', data);
            
            // Модифицируем оригинальный объект
            data.level = 2;
            
            // Внутренние данные не должны измениться
            expect(gameStateManager.getStateData().level).toBe(1);
        });
    });
    
    describe('State history', () => {
        it('should track state transitions', () => {
            gameStateManager.setState('menu');
            gameStateManager.setState('playing');
            gameStateManager.setState('paused');
            
            const history = gameStateManager.getStateHistory();
            
            expect(history).toHaveLength(3);
            expect(history[0]).toEqual({
                from: 'loading',
                to: 'menu',
                timestamp: expect.any(Number),
                data: {}
            });
            expect(history[1]).toEqual({
                from: 'menu',
                to: 'playing',
                timestamp: expect.any(Number),
                data: {}
            });
            expect(history[2]).toEqual({
                from: 'playing',
                to: 'paused',
                timestamp: expect.any(Number),
                data: {}
            });
        });
        
        it('should limit history size', () => {
            // Устанавливаем маленький лимит для теста
            gameStateManager.maxHistorySize = 3;
            
            gameStateManager.setState('menu');
            gameStateManager.setState('playing');
            gameStateManager.setState('paused');
            gameStateManager.setState('game_over');
            
            const history = gameStateManager.getStateHistory();
            
            // Должно остаться только 3 последних перехода
            expect(history).toHaveLength(3);
            expect(history[0].from).toBe('menu');
            expect(history[2].to).toBe('game_over');
        });
        
        it('should get last transition', () => {
            gameStateManager.setState('menu');
            gameStateManager.setState('playing');
            
            const lastTransition = gameStateManager.getLastTransition();
            
            expect(lastTransition).toEqual({
                from: 'menu',
                to: 'playing',
                timestamp: expect.any(Number),
                data: {}
            });
        });
    });
    
    describe('Transition validation', () => {
        it('should return possible transitions', () => {
            gameStateManager.setState('menu');
            const possible = gameStateManager.getPossibleTransitions();
            
            expect(possible).toContain('playing');
            expect(possible).toContain('loading');
        });
        
        it('should validate current state', () => {
            expect(gameStateManager.validateState()).toBe(true);
            
            // Имитируем невалидное состояние
            gameStateManager.currentState = 'invalid';
            expect(gameStateManager.validateState()).toBe(false);
        });
    });
    
    describe('Reset functionality', () => {
        it('should reset to initial state', () => {
            gameStateManager.setState('menu', { level: 5, score: 1000 });
            gameStateManager.setState('playing');
            
            gameStateManager.reset();
            
            expect(gameStateManager.getState()).toBe('loading');
            expect(gameStateManager.getStateData()).toEqual({});
            expect(gameStateManager.getStateHistory()).toEqual([]);
            
            expect(mockEventBus.emit).toHaveBeenCalledWith('state_reset', {
                from: 'playing',
                to: 'loading',
                timestamp: expect.any(Number)
            });
        });
    });
    
    describe('Edge cases', () => {
        it('should handle empty history gracefully', () => {
            expect(gameStateManager.getLastTransition()).toBeNull();
        });
        
        it('should handle transition to same state', () => {
            gameStateManager.setState('menu');
            
            // Попытка перехода в то же состояние должна быть отклонена
            const result = gameStateManager.setState('menu');
            
            expect(result).toBe(false);
            expect(mockEventBus.emit).toHaveBeenCalledTimes(1); // Только первый вызов
        });
    });
});
