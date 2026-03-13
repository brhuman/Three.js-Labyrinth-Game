import { GameCore } from './core/GameCore.js';
import { EventBus } from './core/EventBus.js';
import { GameStateManager } from './core/GameStateManager.js';
import { ResourceManager } from './core/ResourceManager.js';

/**
 * Класс для постепенной интеграции новой архитектуры в существующий Game класс
 * Позволяет использовать новые компоненты без нарушения текущей функциональности
 */
export class GameIntegration {
    constructor(existingGame) {
        this.game = existingGame;
        
        // Создаём новые компоненты
        this.eventBus = new EventBus();
        this.stateManager = new GameStateManager(this.eventBus);
        this.resourceManager = new ResourceManager(this.eventBus);
        
        // GameCore будет создан позже, после полной интеграции
        this.gameCore = null;
        
        // Флаги для отслеживания интеграции
        this.integrationLevel = {
            eventBus: false,
            stateManager: false,
            resourceManager: false,
            renderer: false
        };
        
        this.setupIntegration();
    }
    
    setupIntegration() {
        this.integrateEventBus();
        this.integrateStateManager();
        this.integrateResourceManager();
        
        console.log('Game integration setup complete');
    }
    
    /**
     * Интеграция EventBus - заменяем прямые вызовы на события
     */
    integrateEventBus() {
        if (this.integrationLevel.eventBus) return;
        
        // Сохраняем оригинальные методы для отката
        this.originalMethods = {
            onMonsterSpawned: this.game.onMonsterSpawned?.bind(this.game),
            onKeyCollected: this.game.onKeyCollected?.bind(this.game),
            onLevelComplete: this.game.onLevelComplete?.bind(this.game),
            onGameOver: this.game.onGameOver?.bind(this.game)
        };
        
        // Заменяем прямые вызовы на события
        this.game.eventBus = this.eventBus;
        
        // Подписываемся на события и перенаправляем в старые методы
        this.eventBus.on('monster_spawned', (data) => {
            if (this.originalMethods.onMonsterSpawned) {
                this.originalMethods.onMonsterSpawned(data);
            }
        });
        
        this.eventBus.on('key_collected', (data) => {
            if (this.originalMethods.onKeyCollected) {
                this.originalMethods.onKeyCollected(data);
            }
        });
        
        this.eventBus.on('level_complete', (data) => {
            if (this.originalMethods.onLevelComplete) {
                this.originalMethods.onLevelComplete(data);
            }
        });
        
        this.eventBus.on('game_over', (data) => {
            if (this.originalMethods.onGameOver) {
                this.originalMethods.onGameOver(data);
            }
        });
        
        this.integrationLevel.eventBus = true;
        console.log('EventBus integration complete');
    }
    
    /**
     * Интеграция GameStateManager
     */
    integrateStateManager() {
        if (this.integrationLevel.stateManager) return;
        
        // Добавляем stateManager в игру
        this.game.stateManager = this.stateManager;
        
        // Синхронизируем текущее состояние
        const currentState = this.getCurrentGameState();
        if (currentState) {
            this.stateManager.setState(currentState);
        }
        
        // Перехватываем изменения состояния
        this.eventBus.on('state_changed', (data) => {
            this.syncGameState(data);
        });
        
        this.integrationLevel.stateManager = true;
        console.log('StateManager integration complete');
    }
    
    /**
     * Интеграция ResourceManager
     */
    integrateResourceManager() {
        if (this.integrationLevel.resourceManager) return;
        
        // Добавляем resourceManager в игру
        this.game.resourceManager = this.resourceManager;
        
        // Перенаправляем загрузку текстур через новый менеджер
        this.originalTextureLoader = this.game.textureLoader;
        this.game.textureLoader = {
            load: (path, onLoad, onProgress, onError) => {
                this.resourceManager.loadTexture(path)
                    .then(texture => {
                        if (onLoad) onLoad(texture);
                    })
                    .catch(error => {
                        if (onError) onError(error);
                    });
            }
        };
        
        // Перенаправляем загрузку звуков
        this.originalAudioLoader = this.game.audioLoader;
        this.game.audioLoader = {
            load: (path, onLoad, onProgress, onError) => {
                this.resourceManager.loadSound(path)
                    .then(buffer => {
                        if (onLoad) onLoad(buffer);
                    })
                    .catch(error => {
                        if (onError) onError(error);
                    });
            }
        };
        
        this.integrationLevel.resourceManager = true;
        console.log('ResourceManager integration complete');
    }
    
    /**
     * Определяет текущее состояние игры на основе переменных
     */
    getCurrentGameState() {
        if (this.game.isGameOver) return 'game_over';
        if (this.game.isPaused) return 'paused';
        if (this.game.gameStarted && !this.game.isPaused) return 'playing';
        if (!this.game.gameStarted) return 'menu';
        return 'loading';
    }
    
    /**
     * Синхронизирует состояние игры с GameStateManager
     */
    syncGameState(data) {
        const { to: newState } = data;
        
        // Обновляем переменные игры для обратной совместимости
        switch (newState) {
            case 'menu':
                this.game.gameStarted = false;
                this.game.isPaused = false;
                this.game.isGameOver = false;
                break;
                
            case 'playing':
                this.game.gameStarted = true;
                this.game.isPaused = false;
                this.game.isGameOver = false;
                break;
                
            case 'paused':
                this.game.isPaused = true;
                break;
                
            case 'game_over':
                this.game.isGameOver = true;
                break;
        }
    }
    
    /**
     * Эмитит события используя старую логику
     */
    emitEvent(eventName, data) {
        this.eventBus.emit(eventName, data);
    }
    
    /**
     * Проверяет состояние интеграции
     */
    getIntegrationStatus() {
        return {
            ...this.integrationLevel,
            overall: Object.values(this.integrationLevel).every(Boolean)
        };
    }
    
    /**
     * Возвращает статистику интеграции
     */
    getIntegrationStats() {
        return {
            status: this.getIntegrationStatus(),
            eventBus: {
                listeners: this.eventBus.getAllEvents().length,
                debugMode: this.eventBus.debugMode
            },
            stateManager: {
                currentState: this.stateManager.getState(),
                possibleTransitions: this.stateManager.getPossibleTransitions()
            },
            resourceManager: {
                stats: this.resourceManager.getResourceStats(),
                progress: this.resourceManager.getLoadProgress()
            }
        };
    }
    
    /**
     * Откатывает интеграцию (для тестирования)
     */
    rollback() {
        if (!this.integrationLevel.eventBus) return;
        
        // Восстанавливаем оригинальные методы
        if (this.originalTextureLoader) {
            this.game.textureLoader = this.originalTextureLoader;
        }
        
        if (this.originalAudioLoader) {
            this.game.audioLoader = this.originalAudioLoader;
        }
        
        // Очищаем новые компоненты
        this.eventBus.clear();
        
        // Сбрасываем флаги
        Object.keys(this.integrationLevel).forEach(key => {
            this.integrationLevel[key] = false;
        });
        
        console.log('Integration rollback complete');
    }
    
    /**
     * Полная интеграция с созданием GameCore
     */
    async fullIntegration() {
        if (!this.getIntegrationStatus().overall) {
            throw new Error('Not all components are integrated yet');
        }
        
        // Создаём GameCore с уже настроенными компонентами
        this.gameCore = new GameCore({
            eventBus: this.eventBus,
            stateManager: this.stateManager,
            resourceManager: this.resourceManager
        });
        
        // Инициализируем GameCore
        await this.gameCore.initialize();
        
        console.log('Full integration with GameCore complete');
        return this.gameCore;
    }
    
    /**
     * Очистка ресурсов
     */
    dispose() {
        this.resourceManager.disposeAll();
        this.eventBus.clear();
        
        if (this.gameCore) {
            this.gameCore.dispose();
        }
    }
}
