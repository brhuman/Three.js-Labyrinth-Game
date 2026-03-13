import * as THREE from 'three';

export class AudioSource {
    constructor(options = {}) {
        this.volume = options.volume || 1.0;
        this.pitch = options.pitch || 1.0;
        this.loop = options.loop || false;
        this.spatial = options.spatial || false;
        this.distance = options.distance || 10;
        this.rolloff = options.rolloff || 1.0;
        this.is3D = options.is3D || false;
        this.buffer = null;
        this.sound = null;
        this.isPlaying = false;
    }

    setAudioBuffer(buffer) {
        this.buffer = buffer;
    }

    createSound(audioListener) {
        if (!this.buffer) return null;

        const sound = new THREE.Audio(audioListener);
        sound.setBuffer(this.buffer);
        sound.setLoop(this.loop);
        sound.setVolume(this.volume);
        sound.setPlaybackRate(this.pitch);

        if (this.is3D) {
            sound.setRefDistance(this.distance);
            sound.setRolloffFactor(this.rolloff);
        }

        this.sound = sound;
        return sound;
    }

    play() {
        if (this.sound && !this.isPlaying) {
            this.sound.play();
            this.isPlaying = true;
        }
    }

    stop() {
        if (this.sound && this.isPlaying) {
            this.sound.stop();
            this.isPlaying = false;
        }
    }

    pause() {
        if (this.sound && this.isPlaying) {
            this.sound.pause();
            this.isPlaying = false;
        }
    }

    setVolume(volume) {
        this.volume = Math.max(0, Math.min(1, volume));
        if (this.sound) {
            this.sound.setVolume(this.volume);
        }
    }

    setPitch(pitch) {
        this.pitch = Math.max(0.1, Math.min(3, pitch));
        if (this.sound) {
            this.sound.setPlaybackRate(this.pitch);
        }
    }

    setPosition(position) {
        if (this.sound && this.is3D) {
            this.sound.position.copy(position);
        }
    }

    setLoop(loop) {
        this.loop = loop;
        if (this.sound) {
            this.sound.setLoop(loop);
        }
    }

    isPlayingSound() {
        return this.isPlaying && this.sound && this.sound.isPlaying;
    }

    clone() {
        return new AudioSource({
            volume: this.volume,
            pitch: this.pitch,
            loop: this.loop,
            spatial: this.spatial,
            distance: this.distance,
            rolloff: this.rolloff,
            is3D: this.is3D
        });
    }
}
