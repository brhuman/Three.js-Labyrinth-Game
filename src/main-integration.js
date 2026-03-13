/**
 * Файл для постепенной интеграции новой архитектуры в существующий Game класс
 * 
 * ИСПОЛЬЗОВАНИЕ:
 * 1. Заменить import './main.js' на import './main-integration.js' в index.html
 * 2. Постепенно переносить функционал из main.js в новую архитектуру
 * 3. Тестировать каждый этап интеграции
 */

import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import { Maze } from './maze.js';
import { OptionsManager } from './options-manager.js';
import { findPathAStar, getAccessibleArea } from './utils.js';
import { translations } from './translations.js';

// Импортируем новую архитектуру
import { GameIntegration } from './GameIntegration.js';

class Game {
    constructor() {
        // === ОРИГИНАЛЬНАЯ ИНИЦИАЛИЗАЦИЯ ===
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.controls = null;
        this.startingLevel = 1;
        this.level = 1;
        this.baseMazeSize = 10;
        this.mazeSize = this.baseMazeSize;
        this.startTime = null;
        
        this.moveForward = false;
        this.moveBackward = false;
        this.moveLeft = false;
        this.moveRight = false;
        this.rotateLeft = false;
        this.rotateRight = false;
        this.isCrouching = false;
        this.canJump = true;
        
        this.velocity = new THREE.Vector3();
        this.direction = new THREE.Vector3();
        
        this.baseHeight = 0.7;
        this.crouchHeight = 0.35;
        this.currentHeight = this.baseHeight;
        
        this.prevTime = performance.now();
        
        // Minimap / Fog of War
        this.minimapCanvas = document.getElementById('minimap');
        this.minimapCtx = this.minimapCanvas.getContext('2d');
        this.explorationGrid = [];
        this.minimapSize = 180;
        this.minimapCanvas.width = this.minimapSize;
        this.minimapCanvas.height = this.minimapSize;

        this.textures = {};
        
        // Monster
        this.monster = null;
        this.isGameOver = false;
        this.monsterSpawned = false;
        this.monsterTextures = [];
        this.basePlayerSpeed = 19.6;
        this.playerSpeed = this.basePlayerSpeed;

        // === НОВАЯ АРХИТЕКТУРА ===
        // Создаём интеграцию с новой архитектурой
        this.integration = new GameIntegration(this);
        
        // Получаем доступ к новым компонентам
        this.eventBus = this.integration.eventBus;
        this.stateManager = this.integration.stateManager;
        this.resourceManager = this.integration.resourceManager;
        
        // Флаг для использования новой архитектуры
        this.useNewArchitecture = true;
        
        console.log('Game initialized with new architecture integration');
        console.log('Integration status:', this.integration.getIntegrationStatus());
        
        // Продолжаем с оригинальной инициализацией
        this.initOriginal();
    }
    
    initOriginal() {
        // Сохраняем ссылку на оригинальный init для постепенной миграции
        this.init();
    }
    
    // === МОДИФИЦИРОВАННЫЕ МЕТОДЫ С ИСПОЛЬЗОВАНИЕМ НОВОЙ АРХИТЕКТУРЫ ===
    
    /**
     * Пример эмитации события с использованием новой архитектуры
     */
    onMonsterSpawned(data) {
        if (this.useNewArchitecture) {
            // Используем EventBus
            this.eventBus.emit('monster_spawned', data);
        } else {
            // Оригинальная логика (заглушка)
            console.log('Monster spawned:', data);
        }
    }
    
    onKeyCollected(data) {
        if (this.useNewArchitecture) {
            this.eventBus.emit('key_collected', data);
        } else {
            console.log('Key collected:', data);
        }
    }
    
    onLevelComplete(data) {
        if (this.useNewArchitecture) {
            this.eventBus.emit('level_complete', data);
        } else {
            console.log('Level complete:', data);
        }
    }
    
    onGameOver(data) {
        if (this.useNewArchitecture) {
            this.eventBus.emit('game_over', data);
        } else {
            console.log('Game over:', data);
        }
    }
    
    /**
     * Пример загрузки текстуры через новый ResourceManager
     */
    loadTextureNew(path, options = {}) {
        if (this.useNewArchitecture && this.resourceManager) {
            return this.resourceManager.loadTexture(path, options);
        } else {
            // Оригинальная загрузка (заглушка)
            return new Promise((resolve) => {
                const loader = new THREE.TextureLoader();
                loader.load(path, resolve);
            });
        }
    }
    
    /**
     * Пример загрузки звука через новый ResourceManager
     */
    loadSoundNew(path) {
        if (this.useNewArchitecture && this.resourceManager) {
            return this.resourceManager.loadSound(path);
        } else {
            // Оригинальная загрузка (заглушка)
            return new Promise((resolve) => {
                const loader = new THREE.AudioLoader();
                loader.load(path, resolve);
            });
        }
    }
    
    /**
     * Пример управления состоянием через GameStateManager
     */
    setGameState(newState, data = {}) {
        if (this.useNewArchitecture && this.stateManager) {
            return this.stateManager.setState(newState, data);
        } else {
            // Оригинальное управление состоянием (заглушка)
            console.log('State changed to:', newState, data);
            return true;
        }
    }
    
    getGameState() {
        if (this.useNewArchitecture && this.stateManager) {
            return this.stateManager.getState();
        } else {
            return this.integration.getCurrentGameState();
        }
    }
    
    // === УТИЛИТЫ ДЛЯ ИНТЕГРАЦИИ ===
    
    /**
     * Переключение между старой и новой архитектурой
     */
    toggleArchitecture(useNew) {
        this.useNewArchitecture = useNew;
        console.log(`Switched to ${useNew ? 'new' : 'old'} architecture`);
        
        if (useNew) {
            console.log('Integration status:', this.integration.getIntegrationStatus());
        }
    }
    
    /**
     * Получение статистики интеграции
     */
    getIntegrationStats() {
        return this.integration.getIntegrationStats();
    }
    
    /**
     * Полная интеграция с GameCore
     */
    async fullIntegration() {
        try {
            console.log('Starting full integration...');
            
            const gameCore = await this.integration.fullIntegration();
            
            // Сохраняем ссылку на GameCore
            this.gameCore = gameCore;
            
            console.log('Full integration complete!');
            console.log('GameCore stats:', this.gameCore.getStats());
            
            return gameCore;
        } catch (error) {
            console.error('Full integration failed:', error);
            throw error;
        }
    }
    
    /**
     * Откат интеграции
     */
    rollbackIntegration() {
        this.integration.rollback();
        this.useNewArchitecture = false;
        console.log('Integration rolled back');
    }
    
    /**
     * Очистка ресурсов
     */
    dispose() {
        if (this.integration) {
            this.integration.dispose();
        }
        
        if (this.gameCore) {
            this.gameCore.dispose();
        }
    }
    
    // === ОСТАЛЬНЫЕ МЕТОДЫ ИЗ ОРИГИНАЛЬНОГО main.js ===
    // Здесь будут все остальные методы из оригинального Game класса
    // Они будут постепенно перенесены в новую архитектуру
    
    // Заглушки для оригинальных методов (будут заменены на реальные)
    init() {
        console.log('Original init() called - this will be gradually replaced');
        // Здесь будет оригинальная логика init()
    }
    
    animate() {
        console.log('Original animate() called - this will be gradually replaced');
        // Здесь будет оригинальная логика animate()
    }
    
    buildMaze() {
        console.log('Original buildMaze() called - this will be gradually replaced');
        // Здесь будет оригинальная логика buildMaze()
    }
    
    updatePlayerMovement() {
        console.log('Original updatePlayerMovement() called - this will be gradually replaced');
        // Здесь будет оригинальная логика updatePlayerMovement()
    }
    
    checkPlayerCollision() {
        console.log('Original checkPlayerCollision() called - this will be gradually replaced');
        // Здесь будет оригинальная логика checkPlayerCollision()
    }
    
    spawnMonster() {
        console.log('Original spawnMonster() called - this will be gradually replaced');
        // Здесь будет оригинальная логика spawnMonster()
    }
    
    updateMonster() {
        console.log('Original updateMonster() called - this will be gradually replaced');
        // Здесь будет оригинальная логика updateMonster()
    }
    
    // ... остальные методы будут добавлены по мере необходимости
}

// === ГЛОБАЛЬНЫЕ ФУНКЦИИ ===

/**
 * Создание экземпляра игры с поддержкой новой архитектуры
 */
function createGame() {
    const game = new Game();
    
    // Добавляем глобальные функции для отладки
    window.gameDebug = {
        game,
        toggleArchitecture: (useNew) => game.toggleArchitecture(useNew),
        getIntegrationStats: () => game.getIntegrationStats(),
        fullIntegration: () => game.fullIntegration(),
        rollbackIntegration: () => game.rollbackIntegration(),
        eventBus: game.eventBus,
        stateManager: game.stateManager,
        resourceManager: game.resourceManager
    };
    
    console.log('Game created with integration support');
    console.log('Debug functions available at window.gameDebug');
    
    return game;
}

export { Game, createGame };

// Автоматический запуск (как в оригинале)
let game;

window.addEventListener('DOMContentLoaded', () => {
    game = createGame();
});
