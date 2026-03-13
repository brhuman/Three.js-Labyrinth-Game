import { Entity } from './Entity.js';
import { Transform } from '../components/Transform.js';
import { AudioSource } from '../components/AudioSource.js';
import * as THREE from 'three';

export class Monster extends Entity {
    constructor(options = {}) {
        super('monster');
        
        // Core components
        this.addComponent('Transform', new Transform({
            position: options.position || new THREE.Vector3(5, 1, 5),
            rotation: options.rotation || new THREE.Euler(0, 0, 0)
        }));
        
        // 3D Audio component
        this.addComponent('AudioSource', new AudioSource({
            volume: 0.3,
            spatial: true,
            is3D: true,
            distance: 2,
            rolloff: 1.5,
            loop: true
        }));
        
        // Monster properties
        this.basePosition = this.getComponent('Transform').position.clone();
        this.glowIntensity = 1.0;
        this.pulseSpeed = 2.0;
        this.pulseTime = 0;
        
        // Audio properties
        this.maxVolume = 1.0;
        this.minVolume = 0.1;
        this.maxDistance = 20;
        this.audioInitialized = false;
        
        // Create visual representation
        this.createVisuals();
    }
    
    createVisuals() {
        // Create red sphere
        this.geometry = new THREE.SphereGeometry(0.8, 32, 32);
        this.material = new THREE.MeshStandardMaterial({
            color: 0xff0000,
            emissive: 0xff0000,
            emissiveIntensity: 0.5,
            roughness: 0.3,
            metalness: 0.7
        });
        
        this.mesh = new THREE.Mesh(this.geometry, this.material);
        this.mesh.position.copy(this.getComponent('Transform').position);
        this.mesh.castShadow = true;
        this.mesh.receiveShadow = true;
        
        // Add glow effect
        this.glowLight = new THREE.PointLight(0xff0000, 2, 10);
        this.glowLight.position.copy(this.getComponent('Transform').position);
        
        // Store reference for external access
        this.visualObject = this.mesh;
        this.lightObject = this.glowLight;
    }
    
    update(deltaTime, currentTime) {
        if (!this.isActive) return;
        
        const transform = this.getComponent('Transform');
        if (!transform) return;
        
        // Update pulsing glow effect
        this.pulseTime += deltaTime * this.pulseSpeed;
        const pulseFactor = (Math.sin(this.pulseTime) + 1) * 0.5;
        this.glowIntensity = 0.5 + pulseFactor * 0.5;
        
        // Update visuals
        this.updateVisuals();
        
        // Update audio based on player distance
        this.updateAudioBasedOnDistance();
    }
    
    updateVisuals() {
        const transform = this.getComponent('Transform');
        
        // Update mesh position
        if (this.mesh) {
            this.mesh.position.copy(transform.position);
            this.material.emissiveIntensity = this.glowIntensity;
        }
        
        // Update glow light
        if (this.glowLight) {
            this.glowLight.position.copy(transform.position);
            this.glowLight.intensity = 2 * this.glowIntensity;
        }
    }
    
    updateAudioBasedOnDistance() {
        const audio = this.getComponent('AudioSource');
        if (!audio) return;
        
        // Get player position (assuming global player reference)
        const playerPosition = this.getPlayerPosition();
        if (!playerPosition) return;
        
        const monsterPosition = this.getComponent('Transform').position;
        const distance = monsterPosition.distanceTo(playerPosition);
        
        // Calculate volume based on distance
        const volumeFactor = Math.max(0, 1 - (distance / this.maxDistance));
        const targetVolume = this.minVolume + (this.maxVolume - this.minVolume) * volumeFactor;
        
        // Apply volume to audio component
        audio.setVolume(targetVolume);
        
        // Update audio position
        audio.setPosition(monsterPosition);
        
        // Start ambient sound if not already playing and player is close enough
        if (!this.audioInitialized && distance < this.maxDistance) {
            this.startAmbientSound();
            this.audioInitialized = true;
        } else if (this.audioInitialized && distance > this.maxDistance * 1.5) {
            this.stopAmbientSound();
            this.audioInitialized = false;
        }
    }
    
    getPlayerPosition() {
        // This should be connected to the actual player entity
        // For now, return a placeholder or try to get from global game state
        if (window.gameState && window.gameState.player) {
            return window.gameState.player.getComponent('Transform').position;
        }
        return null;
    }
    
    startAmbientSound() {
        const audio = this.getComponent('AudioSource');
        if (audio && !audio.isPlayingSound()) {
            // Emit event to play monster ambient sound
            this.emit('play_monster_ambient', { 
                position: this.getComponent('Transform').position,
                loop: true,
                volume: audio.volume
            });
        }
    }
    
    stopAmbientSound() {
        const audio = this.getComponent('AudioSource');
        if (audio) {
            // Emit event to stop monster ambient sound
            this.emit('stop_monster_ambient', { 
                position: this.getComponent('Transform').position
            });
        }
    }
    
    setPosition(position) {
        const transform = this.getComponent('Transform');
        if (transform) {
            transform.position.copy(position);
            this.basePosition = position.clone();
        }
    }
    
    getVisualObject() {
        return this.mesh;
    }
    
    getLightObject() {
        return this.glowLight;
    }
    
    reset() {
        const transform = this.getComponent('Transform');
        const audio = this.getComponent('AudioSource');
        
        if (transform) {
            transform.position.copy(this.basePosition);
        }
        
        if (audio) {
            audio.stop();
            this.audioInitialized = false;
        }
        
        this.pulseTime = 0;
        this.glowIntensity = 1.0;
        this.isActive = true;
    }
    
    emit(eventName, data) {
        // Connect to event bus
        if (window.gameEventBus) {
            window.gameEventBus.emit(eventName, data);
        } else {
            console.log(`Monster event: ${eventName}`, data);
        }
    }
}
