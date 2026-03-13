/**
 * Options Manager - Handles all options menu functionality
 * Manages state, localStorage, and UI updates
 */
export class OptionsManager {
    constructor(game) {
        this.game = game;
        
        // Default settings
        this.defaults = {
            startingLevel: 1,
            difficulty: 'normal',
            shadowQuality: 'low', // Low quality shadows instead of off
            renderScale: 'balanced',
            effectsEnabled: true,
            masterVolume: 1.0,
            showFPS: false,
            fogOfWar: true,
            language: 'en',
            audioGroups: {
                all: true,
                krick: true,
                monster: true,
                facula: true
            }
        };
        
        // Current settings (will be loaded from localStorage)
        this.settings = this.loadSettings();
        
        this.init();
    }
    
    init() {
        this.setupEventListeners();
        this.updateUI();
        this.applySettings();
    }
    
    loadSettings() {
        const saved = localStorage.getItem('gameOptions');
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                return { ...this.defaults, ...parsed };
            } catch (e) {
                console.warn('Failed to parse saved options, using defaults');
            }
        }
        return { ...this.defaults };
    }
    
    saveSettings() {
        localStorage.setItem('gameOptions', JSON.stringify(this.settings));
    }
    
    setupEventListeners() {
        // Starting level buttons
        const levelDec = document.getElementById('level-dec');
        const levelInc = document.getElementById('level-inc');
        
        if (levelDec) {
            levelDec.addEventListener('click', () => {
                if (this.settings.startingLevel > 1) {
                    this.settings.startingLevel--;
                    this.updateLevelDisplay();
                    this.saveSettings();
                }
            });
        }
        
        if (levelInc) {
            levelInc.addEventListener('click', () => {
                if (this.settings.startingLevel < 10) {
                    this.settings.startingLevel++;
                    this.updateLevelDisplay();
                    this.saveSettings();
                }
            });
        }
        
        // Difficulty buttons
        document.querySelectorAll('.difficulty-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.settings.difficulty = btn.dataset.difficulty;
                this.updateDifficultyButtons();
                this.updateDifficultyDescription();
                this.saveSettings();
                this.applyDifficulty();
            });
        });
        
        // Graphics quality buttons - removed since we only use advanced settings now
        
        // Resolution buttons
        document.querySelectorAll('.adv-btn[data-type="resolution"]').forEach(btn => {
            btn.addEventListener('click', () => {
                this.settings.renderScale = btn.dataset.adv;
                this.updateResolutionButtons();
                this.updateResolutionDescription();
                this.saveSettings();
                this.applyResolution();
            });
        });
        
        // Effects buttons
        document.querySelectorAll('.adv-btn[data-type="effects"]').forEach(btn => {
            btn.addEventListener('click', () => {
                this.settings.effectsEnabled = btn.dataset.adv === 'on';
                this.updateEffectsButtons();
                this.saveSettings();
                this.applyEffects();
            });
        });
        
        // Shadow quality buttons (existing advanced buttons)
        document.querySelectorAll('.adv-btn[data-type="shadow"]').forEach(btn => {
            btn.addEventListener('click', () => {
                this.settings.shadowQuality = btn.dataset.adv;
                this.updateShadowButtons();
                this.saveSettings();
                this.applyShadowQuality();
            });
        });
        
        // Master volume slider
        const volumeSlider = document.getElementById('master-volume');
        if (volumeSlider) {
            volumeSlider.addEventListener('input', (e) => {
                this.settings.masterVolume = parseFloat(e.target.value);
                this.saveSettings();
                this.applyVolume();
                
                // Auto-enable all sound if volume > 0
                if (this.settings.masterVolume > 0 && !this.settings.audioGroups.all) {
                    this.settings.audioGroups.all = true;
                    this.settings.audioGroups.krick = true;
                    this.settings.audioGroups.monster = true;
                    this.settings.audioGroups.facula = true;
                    this.updateAudioButtons();
                    this.saveSettings();
                }
            });
        }
        
        // Audio checkbox buttons
        document.querySelectorAll('.audio-checkbox-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const audio = btn.dataset.audio;
                const isChecked = btn.classList.contains('checked');
                
                if (!isChecked) {
                    // Enable
                    btn.classList.add('checked');
                    btn.querySelector('.checkbox-icon').textContent = '✓';
                    
                    if (audio === 'all') {
                        // Enable all audio
                        this.settings.audioGroups.all = true;
                        this.settings.audioGroups.krick = true;
                        this.settings.audioGroups.monster = true;
                        this.settings.audioGroups.facula = true;
                        this.updateAllAudioButtons();
                    } else {
                        this.settings.audioGroups[audio] = true;
                    }
                } else {
                    // Disable
                    btn.classList.remove('checked');
                    btn.querySelector('.checkbox-icon').textContent = '';
                    
                    if (audio === 'all') {
                        // Disable all audio and set volume to 0
                        this.settings.audioGroups.all = false;
                        this.settings.audioGroups.krick = false;
                        this.settings.audioGroups.monster = false;
                        this.settings.audioGroups.facula = false;
                        this.settings.masterVolume = 0;
                        
                        // Update volume slider
                        if (volumeSlider) {
                            volumeSlider.value = 0;
                        }
                        this.updateAllAudioButtons();
                    } else {
                        this.settings.audioGroups[audio] = false;
                    }
                }
                
                this.saveSettings();
                this.applyAudioSettings();
            });
        });
        
        // Technical checkbox buttons
        document.querySelectorAll('.tech-checkbox-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const setting = btn.dataset.setting;
                const isChecked = btn.classList.contains('checked');
                
                if (!isChecked) {
                    // Enable
                    btn.classList.add('checked');
                    btn.querySelector('.checkbox-icon').textContent = '✓';
                    
                    if (setting === 'fps') {
                        this.settings.showFPS = true;
                        document.getElementById('fps-display').style.display = 'block';
                    } else if (setting === 'fow') {
                        this.settings.fogOfWar = true;
                    }
                } else {
                    // Disable
                    btn.classList.remove('checked');
                    btn.querySelector('.checkbox-icon').textContent = '';
                    
                    if (setting === 'fps') {
                        this.settings.showFPS = false;
                        document.getElementById('fps-display').style.display = 'none';
                    } else if (setting === 'fow') {
                        this.settings.fogOfWar = false;
                    }
                }
                
                this.saveSettings();
                this.applyTechnicalSettings();
            });
        });
        
        // Language buttons
        document.querySelectorAll('.lang-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.settings.language = btn.dataset.lang;
                this.updateLanguageButtons();
                this.saveSettings();
                this.applyLanguage();
            });
        });
    }
    
    updateUI() {
        // Clear all selected states first
        document.querySelectorAll('.selected').forEach(btn => {
            btn.classList.remove('selected');
        });
        
        this.updateLevelDisplay();
        this.updateDifficultyButtons();
        this.updateDifficultyDescription();
        this.updateResolutionButtons();
        this.updateResolutionDescription();
        this.updateEffectsButtons();
        this.updateShadowButtons();
        this.updateVolumeSlider();
        this.updateAudioButtons();
        this.updateTechnicalButtons();
        this.updateLanguageButtons();
    }
    
    updateLevelDisplay() {
        const levelVal = document.getElementById('starting-level-val');
        if (levelVal) {
            levelVal.textContent = this.settings.startingLevel;
        }
    }
    
    updateDifficultyButtons() {
        document.querySelectorAll('.difficulty-btn').forEach(btn => {
            if (btn.dataset.difficulty === this.settings.difficulty) {
                btn.classList.add('selected');
            } else {
                btn.classList.remove('selected');
            }
        });
    }
    
    updateDifficultyDescription() {
        const desc = document.querySelector('.difficulty-description');
        if (desc) {
            const speeds = {
                'super_easy': 50,
                'easy': 65,
                'normal': 80,
                'hard': 100
            };
            const speed = speeds[this.settings.difficulty] || 80;
            const displayName = this.settings.difficulty.replace('_', ' ').split(' ').map(word => 
                word.charAt(0).toUpperCase() + word.slice(1)
            ).join(' ');
            desc.textContent = `Monster speed: ${speed}% (${displayName})`;
        }
    }
    
    updateResolutionButtons() {
        document.querySelectorAll('.adv-btn[data-type="resolution"]').forEach(btn => {
            if (btn.dataset.adv === this.settings.renderScale) {
                btn.classList.add('selected');
            } else {
                btn.classList.remove('selected');
            }
        });
    }
    
    updateResolutionDescription() {
        const descElement = document.querySelector('.resolution-description span');
        if (!descElement) return;
        
        const descriptions = {
            'performance': 'Render scale: 50% for maximum performance',
            'balanced': 'Render scale: 75% for good performance',
            'high': 'Render scale: 100% standard quality',
            'native': 'Render scale: 100% native device resolution'
        };
        
        descElement.textContent = descriptions[this.settings.renderScale] || descriptions.balanced;
    }
    
    updateEffectsButtons() {
        document.querySelectorAll('.adv-btn[data-type="effects"]').forEach(btn => {
            const isOn = btn.dataset.adv === 'on';
            if (isOn === this.settings.effectsEnabled) {
                btn.classList.add('selected');
            } else {
                btn.classList.remove('selected');
            }
        });
    }
    
    updateShadowButtons() {
        document.querySelectorAll('.adv-btn[data-type="shadow"]').forEach(btn => {
            if (btn.dataset.adv === this.settings.shadowQuality) {
                btn.classList.add('selected');
            } else {
                btn.classList.remove('selected');
            }
        });
        this.updateShadowDescription();
    }
    
    updateShadowDescription() {
        const descElement = document.querySelector('.shadow-description span');
        if (!descElement) return;
        
        const descriptions = {
            'low': 'Shadows: 256x resolution, basic quality',
            'medium': 'Shadows: 1024x resolution, enhanced details',
            'high': 'Shadows: 2048x with soft edges, high quality',
            'ultra': 'Shadows: 4096x cinematic, ultimate quality'
        };
        
        descElement.textContent = descriptions[this.settings.shadowQuality] || descriptions.low;
    }
    
    updateVolumeSlider() {
        const slider = document.getElementById('master-volume');
        if (slider) {
            slider.value = this.settings.masterVolume;
        }
    }
    
    updateAudioButtons() {
        this.updateAllAudioButtons();
    }
    
    updateAllAudioButtons() {
        document.querySelectorAll('.audio-checkbox-btn').forEach(btn => {
            const audio = btn.dataset.audio;
            const icon = btn.querySelector('.checkbox-icon');
            
            if (this.settings.audioGroups[audio]) {
                btn.classList.add('checked');
                icon.textContent = '✓';
            } else {
                btn.classList.remove('checked');
                icon.textContent = '';
            }
        });
    }
    
    updateTechnicalButtons() {
        document.querySelectorAll('.tech-checkbox-btn').forEach(btn => {
            const setting = btn.dataset.setting;
            const icon = btn.querySelector('.checkbox-icon');
            
            if (setting === 'fps' && this.settings.showFPS) {
                btn.classList.add('checked');
                icon.textContent = '✓';
            } else if (setting === 'fow' && this.settings.fogOfWar) {
                btn.classList.add('checked');
                icon.textContent = '✓';
            } else if (setting === 'fps') {
                btn.classList.remove('checked');
                icon.textContent = '';
            } else if (setting === 'fow') {
                btn.classList.remove('checked');
                icon.textContent = '';
            }
        });
    }
    
    updateLanguageButtons() {
        document.querySelectorAll('.lang-btn').forEach(btn => {
            if (btn.dataset.lang === this.settings.language) {
                btn.classList.add('selected');
            } else {
                btn.classList.remove('selected');
            }
        });
    }
    
    applySettings() {
        this.applyDifficulty();
        this.applyResolution();
        this.applyEffects();
        this.applyShadowQuality();
        this.applyVolume();
        this.applyAudioSettings();
        this.applyTechnicalSettings();
        this.applyLanguage();
    }
    
    applyDifficulty() {
        if (this.game && this.game.difficultyMultipliers) {
            this.game.difficulty = this.settings.difficulty;
            this.game.monsterSpeed = this.game.baseMonsterSpeed * this.game.difficultyMultipliers[this.settings.difficulty];
        }
    }
    
    applyResolution() {
        if (this.game) {
            this.game.renderScale = this.settings.renderScale;
            this.game.applyGranularGraphics(); // Trigger graphics update
        }
    }
    
    applyEffects() {
        if (this.game) {
            this.game.effectsEnabled = this.settings.effectsEnabled;
            this.game.applyGranularGraphics(); // Trigger graphics update
        }
    }
    
    applyShadowQuality() {
        if (this.game) {
            this.game.shadowQuality = this.settings.shadowQuality;
            this.game.updateMoonLightShadows(); // Update moon light shadows specifically
        }
    }
    
    applyVolume() {
        if (this.game) {
            this.game.masterVolume = this.settings.masterVolume;
        }
    }
    
    applyAudioSettings() {
        if (this.game) {
            this.game.audioGroups = { ...this.settings.audioGroups };
        }
    }
    
    applyTechnicalSettings() {
        if (this.game) {
            this.game.showFPS = this.settings.showFPS;
            this.game.fogOfWar = this.settings.fogOfWar;
            
            // Update FPS display
            const fpsDisplay = document.getElementById('fps-display');
            if (fpsDisplay) {
                fpsDisplay.style.display = this.settings.showFPS ? 'block' : 'none';
            }
        }
    }
    
    applyLanguage() {
        if (this.game) {
            this.game.currentLanguage = this.settings.language;
        }
    }
    
    // Public methods for game to get current settings
    getStartingLevel() {
        return this.settings.startingLevel;
    }
    
    getDifficulty() {
        return this.settings.difficulty;
    }
    
    getRenderScale() {
        return this.settings.renderScale;
    }
    
    getEffectsEnabled() {
        return this.settings.effectsEnabled;
    }
    
    getShadowQuality() {
        return this.settings.shadowQuality;
    }
    
    getMasterVolume() {
        return this.settings.masterVolume;
    }
    
    getShowFPS() {
        return this.settings.showFPS;
    }
    
    getFogOfWar() {
        return this.settings.fogOfWar;
    }
    
    getLanguage() {
        return this.settings.language;
    }
    
    getAudioGroups() {
        return { ...this.settings.audioGroups };
    }
}
