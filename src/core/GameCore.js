import { EventBus } from './EventBus.js';
import { GameStateManager } from './GameStateManager.js';
import { ResourceManager } from './ResourceManager.js';
import { Renderer } from '../renderer/Renderer.js';

export class GameCore {
    constructor(options = {}) {
        // Создаём ядро системы
        this.eventBus = options.eventBus || new EventBus();
        this.stateManager = new GameStateManager(this.eventBus);
        this.resourceManager = options.resourceManager || new ResourceManager(this.eventBus);
        this.renderer = options.renderer || new Renderer({
            eventBus: this.eventBus,
            resourceManager: this.resourceManager,
            ...options.renderer
        });
        
        this.isInitialized = false;
        this.isRunning = false;
        
        this.setupCoreEventListeners();
    }
    
    setupCoreEventListeners() {
        // События состояния
        this.eventBus.on('state_changed', (data) => {
            this.handleStateChange(data);
        });
        
        // События ресурсов
        this.eventBus.on('all_resources_loaded', () => {
            this.onResourcesLoaded();
        });
        
        // События окна
        this.eventBus.on('resize', (data) => {
            this.handleResize(data);
        });
        
        // Ошибки
        this.eventBus.on('error', (error) => {
            this.handleError(error);
        });
    }
    
    async initialize() {
        try {
            this.eventBus.emit('initialization_started');
            
            // Устанавливаем начальное состояние
            this.stateManager.setState('loading');
            
            // Предзагружаем ресурсы
            await this.preloadResources();
            
            // Настраиваем рендерер
            await this.setupRenderer();
            
            // Инициализация завершена
            this.isInitialized = true;
            this.stateManager.setState('menu');
            
            this.eventBus.emit('initialization_complete');
            
            return true;
        } catch (error) {
            this.handleError(error);
            return false;
        }
    }
    
    async preloadResources() {
        this.eventBus.emit('resources_preload_started');
        
        try {
            await this.resourceManager.preloadGameResources();
            this.eventBus.emit('resources_preload_complete');
        } catch (error) {
            this.eventBus.emit('resources_preload_failed', { error });
            throw error;
        }
    }
    
    async setupRenderer() {
        this.eventBus.emit('renderer_setup_started');
        
        // Здесь можно добавить дополнительную настройку рендерера
        // Например, пост-эффекты, настройки качества и т.д.
        
        this.eventBus.emit('renderer_setup_complete');
    }
    
    start() {
        if (!this.isInitialized) {
            throw new Error('Game core not initialized. Call initialize() first.');
        }
        
        if (this.isRunning) {
            return;
        }
        
        this.isRunning = true;
        this.eventBus.emit('game_started');
        
        // Запускаем игровой цикл
        this.startGameLoop();
    }
    
    stop() {
        if (!this.isRunning) {
            return;
        }
        
        this.isRunning = false;
        this.eventBus.emit('game_stopped');
    }
    
    startGameLoop() {
        let lastTime = 0;
        
        const gameLoop = (currentTime) => {
            if (!this.isRunning) {
                return;
            }
            
            const deltaTime = (currentTime - lastTime) / 1000;
            lastTime = currentTime;
            
            // Обновляем игру
            this.update(deltaTime);
            
            // Рендерим
            this.render();
            
            // Продолжаем цикл
            requestAnimationFrame(gameLoop);
        };
        
        requestAnimationFrame(gameLoop);
    }
    
    update(deltaTime) {
        if (!this.isRunning) return;
        
        // Обновляем только если игра активна
        if (this.stateManager.isActiveGame()) {
            this.eventBus.emit('update', { deltaTime });
        }
    }
    
    render() {
        if (!this.isRunning) return;
        
        this.renderer.render();
    }
    
    handleStateChange(data) {
        this.eventBus.emit('core_state_changed', data);
        
        switch (data.to) {
            case 'playing':
                this.onGameStart();
                break;
            case 'paused':
                this.onGamePause();
                break;
            case 'menu':
                this.onMenuEnter();
                break;
            case 'game_over':
                this.onGameOver();
                break;
        }
    }
    
    onGameStart() {
        this.eventBus.emit('game_start');
    }
    
    onGamePause() {
        this.eventBus.emit('game_pause');
    }
    
    onMenuEnter() {
        this.eventBus.emit('menu_enter');
    }
    
    onGameOver() {
        this.eventBus.emit('game_over');
    }
    
    onResourcesLoaded() {
        this.eventBus.emit('core_resources_loaded');
    }
    
    handleResize(data) {
        this.renderer.resize(data.width, data.height);
    }
    
    handleError(error) {
        console.error('GameCore Error:', error);
        this.eventBus.emit('core_error', { error });
        
        // В критических случаях можно вернуть в меню
        if (this.stateManager.isInGame()) {
            this.stateManager.setState('menu', { 
                error: error.message,
                fromGame: true 
            });
        }
    }
    
    // API для взаимодействия с ядром
    getEventBus() {
        return this.eventBus;
    }
    
    getStateManager() {
        return this.stateManager;
    }
    
    getResourceManager() {
        return this.resourceManager;
    }
    
    getRenderer() {
        return this.renderer;
    }
    
    // Утилиты
    getStats() {
        return {
            core: {
                initialized: this.isInitialized,
                running: this.isRunning,
                state: this.stateManager.getState()
            },
            renderer: this.renderer.getStats(),
            resources: this.resourceManager.getResourceStats()
        };
    }
    
    // Очистка
    dispose() {
        this.stop();
        
        this.renderer.dispose();
        this.resourceManager.disposeAll();
        
        this.eventBus.clear();
        
        this.isInitialized = false;
        this.eventBus.emit('core_disposed');
    }
}
