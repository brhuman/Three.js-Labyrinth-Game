import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GameCore } from '../../core/GameCore.js';
import { EventBus } from '../../core/EventBus.js';
import { Player } from '../../entities/Player.js';
import { Monster } from '../../entities/Monster.js';
import { PhysicsSystem } from '../../core/systems/PhysicsSystem.js';
import { AISystem } from '../../core/systems/AISystem.js';
import { UISystem } from '../../core/systems/UISystem.js';
import * as THREE from 'three';

describe('Gameplay Integration', () => {
    let gameCore;
    let eventBus;
    let player;
    let monster;
    let physicsSystem;
    let aiSystem;
    let uiSystem;

    beforeEach(() => {
        eventBus = new EventBus();
        gameCore = new GameCore({ eventBus });
        
        player = new Player();
        monster = new Monster({ spawnDelay: 0 });
        
        physicsSystem = new PhysicsSystem(eventBus);
        aiSystem = new AISystem(eventBus);
        uiSystem = new UISystem(eventBus);
        
        // Add entities to systems
        physicsSystem.addEntity(player);
        physicsSystem.addEntity(monster);
        aiSystem.addEntity(monster);
    });

    test('should initialize game systems', async () => {
        const initialized = await gameCore.initialize();
        expect(initialized).toBe(true);
        expect(gameCore.isInitialized).toBe(true);
    });

    test('should handle player movement', () => {
        const transform = player.getComponent('Transform');
        const velocity = player.getComponent('Velocity');
        
        // Set initial position
        transform.position.set(0, 0.7, 0);
        
        // Apply forward velocity
        velocity.linear.set(5, 0, 0);
        
        // Update physics
        physicsSystem.update(0.016); // 60 FPS
        
        // Check position changed
        expect(transform.position.x).toBeGreaterThan(0);
    });

    test('should handle player jumping', () => {
        const transform = player.getComponent('Transform');
        const velocity = player.getComponent('Velocity');
        
        // Start on ground
        transform.position.y = 0.7;
        
        // Jump
        const jumped = player.jump();
        expect(jumped).toBe(true);
        expect(velocity.linear.y).toBeGreaterThan(0);
        
        // Update physics - should apply gravity
        physicsSystem.update(0.1);
        expect(velocity.linear.y).toBeLessThan(3.2); // Gravity should reduce upward velocity
    });

    test('should handle flashlight battery drain', () => {
        const flashlight = player.getComponent('Flashlight');
        
        // Turn on flashlight
        flashlight.turnOn();
        expect(flashlight.isOn).toBe(true);
        
        // Update battery
        flashlight.updateBattery(1.0); // 1 second
        
        expect(flashlight.currentBattery).toBeLessThan(100);
    });

    test('should handle monster AI states', () => {
        const ai = monster.getComponent('AI');
        const transform = monster.getComponent('Transform');
        const playerTransform = player.getComponent('Transform');
        
        // Set monster to patrol state
        ai.setState('patrol');
        ai.setPatrolPoints([
            new THREE.Vector3(5, 0, 5),
            new THREE.Vector3(10, 0, 5)
        ]);
        
        expect(ai.state).toBe('patrol');
        
        // Simulate player detection
        playerTransform.position.set(8, 0.7, 5); // Close to monster
        
        // Update AI
        aiSystem.update(0.016, Date.now());
        
        // Monster should detect player and switch to chase
        expect(ai.state).toBe('chase');
    });

    test('should handle health and damage', () => {
        const health = player.getComponent('Health');
        
        expect(health.currentHealth).toBe(100);
        
        // Take damage
        const isDead = player.takeDamage(30);
        expect(isDead).toBe(false);
        expect(health.currentHealth).toBe(70);
        
        // Take lethal damage
        const isDead2 = player.takeDamage(100);
        expect(isDead2).toBe(true);
        expect(player.isActive).toBe(false);
    });

    test('should handle power-ups', () => {
        // Test speed power-up
        player.applySpeedPowerup(5.0);
        expect(player.speedPowerupRemaining).toBe(5.0);
        expect(player.currentSpeed).toBeGreaterThan(player.baseSpeed);
        
        // Test battery collection
        player.addBattery(25);
        expect(player.stats.batteriesCollected).toBe(1);
        
        const flashlight = player.getComponent('Flashlight');
        expect(flashlight.currentBattery).toBe(100); // Should be capped
    });

    test('should handle game state changes', () => {
        const stateManager = gameCore.getStateManager();
        
        // Start in menu state
        expect(stateManager.getState()).toBe('menu');
        
        // Start game
        stateManager.setState('playing');
        expect(stateManager.getState()).toBe('playing');
        
        // Pause game
        stateManager.setState('paused');
        expect(stateManager.getState()).toBe('paused');
        
        // Game over
        stateManager.setState('game_over');
        expect(stateManager.getState()).toBe('game_over');
    });

    test('should handle UI updates', () => {
        // Mock DOM elements
        const mockElement = {
            style: { display: 'none' },
            textContent: '',
            querySelector: vi.fn(() => ({ style: { backgroundColor: '' } }))
        };
        
        vi.spyOn(document, 'getElementById').mockReturnValue(mockElement);
        
        uiSystem.initialize();
        
        // Update health
        uiSystem.updateHealth(75);
        expect(uiSystem.uiState.health).toBe(75);
        
        // Update battery
        uiSystem.updateBattery(50);
        expect(uiSystem.uiState.battery).toBe(50);
        
        // Update level
        uiSystem.updateLevel(2);
        expect(uiSystem.uiState.level).toBe(2);
    });

    test('should handle event communication', () => {
        const mockCallback = vi.fn();
        eventBus.on('test_event', mockCallback);
        
        eventBus.emit('test_event', { data: 'test' });
        
        expect(mockCallback).toHaveBeenCalledWith({ data: 'test' });
    });

    test('should handle collision detection', () => {
        const transform = player.getComponent('Transform');
        const velocity = player.getComponent('Velocity');
        
        // Position player above ground
        transform.position.y = 5;
        velocity.linear.y = -10; // Falling down
        
        // Update physics
        physicsSystem.update(0.1);
        
        // Should detect ground collision and stop falling
        expect(transform.position.y).toBe(0.7); // Ground level
        expect(velocity.linear.y).toBe(0); // Velocity stopped
    });

    test('should handle monster spawning', () => {
        const monsterWithDelay = new Monster({ spawnDelay: 2.0 });
        
        expect(monsterWithDelay.isSpawned).toBe(false);
        expect(monsterWithDelay.isActive).toBe(true);
        
        // Update spawn timer
        monsterWithDelay.update(1.0, Date.now());
        expect(monsterWithDelay.isSpawned).toBe(false);
        
        monsterWithDelay.update(1.5, Date.now());
        expect(monsterWithDelay.isSpawned).toBe(true);
    });

    test('should handle game reset', () => {
        // Modify game state
        player.takeDamage(50);
        player.setCrouching(true);
        player.applySpeedPowerup(5.0);
        
        // Reset
        player.reset();
        
        // Check reset state
        const health = player.getComponent('Health');
        const flashlight = player.getComponent('Flashlight');
        
        expect(health.currentHealth).toBe(100);
        expect(flashlight.currentBattery).toBe(100);
        expect(player.isCrouching).toBe(false);
        expect(player.speedPowerupRemaining).toBe(0);
        expect(player.isActive).toBe(true);
    });

    test('should handle level progression', () => {
        // Complete level
        player.onLevelComplete();
        expect(player.stats.levelsCompleted).toBe(1);
        
        // Reset for next level
        player.reset();
        expect(player.isActive).toBe(true);
        expect(player.getComponent('Health').currentHealth).toBe(100);
    });
});
