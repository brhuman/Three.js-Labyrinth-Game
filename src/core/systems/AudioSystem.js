import * as THREE from 'three';

export class AudioSystem {
    constructor(eventBus) {
        this.eventBus = eventBus;
        this.audioContext = null;
        this.audioListener = null;
        this.sounds = new Map();
        this.activeSounds = new Set();
        this.masterVolume = 1.0;
        this.isInitialized = false;
    }

    async initialize() {
        try {
            // Create audio context
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            
            // Create Three.js audio listener
            this.audioListener = new THREE.AudioListener();
            
            this.isInitialized = true;
            this.eventBus.emit('audio_system_initialized');
            
            return true;
        } catch (error) {
            console.error('Failed to initialize audio system:', error);
            this.eventBus.emit('audio_system_error', { error });
            return false;
        }
    }

    async loadSound(name, url) {
        if (!this.isInitialized) {
            await this.initialize();
        }

        try {
            const response = await fetch(url);
            const arrayBuffer = await response.arrayBuffer();
            const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
            
            this.sounds.set(name, audioBuffer);
            this.eventBus.emit('sound_loaded', { name });
            
            return audioBuffer;
        } catch (error) {
            console.error(`Failed to load sound ${name}:`, error);
            this.eventBus.emit('sound_load_error', { name, error });
            return null;
        }
    }

    loadMultipleSounds(soundMap) {
        const promises = Object.entries(soundMap).map(([name, url]) => 
            this.loadSound(name, url)
        );
        return Promise.all(promises);
    }

    playSound(soundName, options = {}) {
        if (!this.isInitialized || !this.sounds.has(soundName)) {
            return null;
        }

        const buffer = this.sounds.get(soundName);
        const sound = new THREE.Audio(this.audioListener);
        
        sound.setBuffer(buffer);
        sound.setLoop(options.loop || false);
        sound.setVolume((options.volume || 1.0) * this.masterVolume);
        sound.setPlaybackRate(options.pitch || 1.0);
        
        if (options.position) {
            sound.position.copy(options.position);
        }
        
        sound.play();
        this.activeSounds.add(sound);
        
        // Remove from active sounds when finished
        sound.onEnded = () => {
            this.activeSounds.delete(sound);
        };
        
        return sound;
    }

    play3DSound(soundName, position, volume = 1.0) {
        return this.playSound(soundName, {
            position: position,
            volume: volume,
            spatial: true
        });
    }

    stopSound(sound) {
        if (sound && this.activeSounds.has(sound)) {
            sound.stop();
            this.activeSounds.delete(sound);
        }
    }

    stopAllSounds() {
        this.activeSounds.forEach(sound => {
            sound.stop();
        });
        this.activeSounds.clear();
    }

    setMasterVolume(volume) {
        this.masterVolume = Math.max(0, Math.min(1, volume));
        
        // Update volume of all active sounds
        this.activeSounds.forEach(sound => {
            // Note: Three.js doesn't expose current volume, so this is limited
            // In a full implementation, we'd track original volumes
        });
    }

    pauseAll() {
        this.activeSounds.forEach(sound => {
            sound.pause();
        });
    }

    resumeAll() {
        this.activeSounds.forEach(sound => {
            if (!sound.isPlaying) {
                sound.play();
            }
        });
    }

    getAudioListener() {
        return this.audioListener;
    }

    isSoundLoaded(name) {
        return this.sounds.has(name);
    }

    getLoadedSounds() {
        return Array.from(this.sounds.keys());
    }

    getActiveSoundsCount() {
        return this.activeSounds.size;
    }

    dispose() {
        this.stopAllSounds();
        this.sounds.clear();
        
        if (this.audioContext) {
            this.audioContext.close();
            this.audioContext = null;
        }
        
        this.audioListener = null;
        this.isInitialized = false;
        this.eventBus.emit('audio_system_disposed');
    }
}
