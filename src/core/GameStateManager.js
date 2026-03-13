import { EventBus } from './EventBus.js';

export class GameStateManager {
    constructor(eventBus = null) {
        this.eventBus = eventBus || new EventBus();
        this.states = {
            LOADING: 'loading',
            MENU: 'menu',
            PLAYING: 'playing',
            PAUSED: 'paused',
            GAME_OVER: 'game_over',
            LEVEL_COMPLETE: 'level_complete'
        };
        this.currentState = this.states.LOADING;
        this.stateData = {};
        this.stateHistory = [];
        this.maxHistorySize = 50;
        this.transitions = new Map();
        
        this.setupValidTransitions();
    }
    
    setupValidTransitions() {
        // Определяем допустимые переходы между состояниями
        this.transitions.set(this.states.LOADING, [
            this.states.MENU
        ]);
        
        this.transitions.set(this.states.MENU, [
            this.states.PLAYING,
            this.states.LOADING
        ]);
        
        this.transitions.set(this.states.PLAYING, [
            this.states.PAUSED,
            this.states.GAME_OVER,
            this.states.LEVEL_COMPLETE,
            this.states.MENU
        ]);
        
        this.transitions.set(this.states.PAUSED, [
            this.states.PLAYING,
            this.states.MENU,
            this.states.GAME_OVER
        ]);
        
        this.transitions.set(this.states.GAME_OVER, [
            this.states.MENU,
            this.states.PLAYING
        ]);
        
        this.transitions.set(this.states.LEVEL_COMPLETE, [
            this.states.PLAYING,
            this.states.MENU
        ]);
    }
    
    setState(newState, data = {}) {
        // Проверяем валидность состояния
        if (!Object.values(this.states).includes(newState)) {
            throw new Error(`Invalid state: ${newState}`);
        }
        
        // Проверяем допустимость перехода
        if (!this.canTransitionTo(newState)) {
            console.warn(`Invalid transition from ${this.currentState} to ${newState}`);
            return false;
        }
        
        const oldState = this.currentState;
        
        // Сохраняем историю
        this.stateHistory.push({
            from: oldState,
            to: newState,
            timestamp: Date.now(),
            data: { ...this.stateData }
        });
        
        // Ограничиваем размер истории
        if (this.stateHistory.length > this.maxHistorySize) {
            this.stateHistory.shift();
        }
        
        // Обновляем состояние
        this.currentState = newState;
        this.stateData = { ...this.stateData, ...data };
        
        // Уведомляем об изменении состояния
        this.eventBus.emit('state_changed', {
            from: oldState,
            to: newState,
            data: this.stateData,
            timestamp: Date.now()
        });
        
        return true;
    }
    
    canTransitionTo(newState) {
        const allowedTransitions = this.transitions.get(this.currentState);
        return allowedTransitions && allowedTransitions.includes(newState);
    }
    
    getState() {
        return this.currentState;
    }
    
    getStateData() {
        return { ...this.stateData };
    }
    
    isState(state) {
        return this.currentState === state;
    }
    
    isInGame() {
        return this.isState(this.states.PLAYING) || this.isState(this.states.PAUSED);
    }
    
    isActiveGame() {
        return this.isState(this.states.PLAYING);
    }
    
    updateStateData(data) {
        this.stateData = { ...this.stateData, ...data };
        
        this.eventBus.emit('state_data_updated', {
            state: this.currentState,
            data: this.stateData
        });
    }
    
    getStateHistory(limit = null) {
        if (limit && limit > 0) {
            return this.stateHistory.slice(-limit);
        }
        return [...this.stateHistory];
    }
    
    getLastTransition() {
        return this.stateHistory[this.stateHistory.length - 1] || null;
    }
    
    reset() {
        const oldState = this.currentState;
        this.currentState = this.states.LOADING;
        this.stateData = {};
        this.stateHistory = [];
        
        this.eventBus.emit('state_reset', {
            from: oldState,
            to: this.states.LOADING,
            timestamp: Date.now()
        });
    }
    
    // Утилиты для проверки конкретных состояний
    isLoading() {
        return this.isState(this.states.LOADING);
    }
    
    isInMenu() {
        return this.isState(this.states.MENU);
    }
    
    isPaused() {
        return this.isState(this.states.PAUSED);
    }
    
    isGameOver() {
        return this.isState(this.states.GAME_OVER);
    }
    
    isLevelComplete() {
        return this.isState(this.states.LEVEL_COMPLETE);
    }
    
    // Получение всех возможных переходов из текущего состояния
    getPossibleTransitions() {
        return this.transitions.get(this.currentState) || [];
    }
    
    // Валидация состояния
    validateState() {
        return Object.values(this.states).includes(this.currentState);
    }
}
