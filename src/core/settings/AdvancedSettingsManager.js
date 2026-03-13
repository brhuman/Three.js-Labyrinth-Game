import { OptionsManager } from '../../options-manager.js';

export class AdvancedSettingsManager extends OptionsManager {
    constructor(game) {
        super(game);
        
        // Settings profiles
        this.profiles = new Map();
        this.currentProfile = 'default';
        
        // Advanced settings categories
        this.categories = {
            GRAPHICS: 'graphics',
            AUDIO: 'audio',
            GAMEPLAY: 'gameplay',
            CONTROLS: 'controls',
            ACCESSIBILITY: 'accessibility',
            PERFORMANCE: 'performance'
        };
        
        // Extended settings schema
        this.settingsSchema = {
            // Graphics settings
            [this.categories.GRAPHICS]: {
                resolution: { type: 'select', default: '1920x1080', options: ['1280x720', '1920x1080', '2560x1440', '3840x2160'] },
                quality: { type: 'select', default: 'high', options: ['low', 'medium', 'high', 'ultra'] },
                vsync: { type: 'boolean', default: true },
                antialiasing: { type: 'boolean', default: true },
                shadows: { type: 'select', default: 'medium', options: ['off', 'low', 'medium', 'high'] },
                textures: { type: 'select', default: 'high', options: ['low', 'medium', 'high'] },
                particles: { type: 'boolean', default: true },
                postprocessing: { type: 'boolean', default: true },
                fov: { type: 'slider', default: 75, min: 60, max: 120, step: 5 },
                brightness: { type: 'slider', default: 1.0, min: 0.5, max: 2.0, step: 0.1 }
            },
            
            // Audio settings
            [this.categories.AUDIO]: {
                masterVolume: { type: 'slider', default: 1.0, min: 0, max: 1, step: 0.1 },
                musicVolume: { type: 'slider', default: 0.7, min: 0, max: 1, step: 0.1 },
                sfxVolume: { type: 'slider', default: 0.8, min: 0, max: 1, step: 0.1 },
                voiceVolume: { type: 'slider', default: 0.9, min: 0, max: 1, step: 0.1 },
                audioQuality: { type: 'select', default: 'high', options: ['low', 'medium', 'high'] },
                surroundSound: { type: 'boolean', default: true },
                subtitles: { type: 'boolean', default: false },
                audioDevice: { type: 'select', default: 'default', options: ['default'] }
            },
            
            // Gameplay settings
            [this.categories.GAMEPLAY]: {
                difficulty: { type: 'select', default: 'normal', options: ['easy', 'normal', 'hard', 'nightmare'] },
                autoSave: { type: 'boolean', default: true },
                saveInterval: { type: 'select', default: '5', options: ['1', '5', '10', '15'] },
                tutorials: { type: 'boolean', default: true },
                hints: { type: 'boolean', default: true },
                crosshair: { type: 'boolean', default: true },
                minimap: { type: 'boolean', default: true },
                flashlightBattery: { type: 'boolean', default: true },
                monsterSpeed: { type: 'slider', default: 1.0, min: 0.5, max: 2.0, step: 0.1 },
                mazeSize: { type: 'select', default: 'medium', options: ['small', 'medium', 'large'] }
            },
            
            // Control settings
            [this.categories.CONTROLS]: {
                mouseSensitivity: { type: 'slider', default: 1.0, min: 0.1, max: 5.0, step: 0.1 },
                invertY: { type: 'boolean', default: false },
                rawInput: { type: 'boolean', default: true },
                acceleration: { type: 'boolean', default: false },
                keybindings: { type: 'object', default: {} },
                gamepadEnabled: { type: 'boolean', default: true },
                gamepadSensitivity: { type: 'slider', default: 1.0, min: 0.1, max: 5.0, step: 0.1 },
                vibration: { type: 'boolean', default: true }
            },
            
            // Accessibility settings
            [this.categories.ACCESSIBILITY]: {
                colorBlindMode: { type: 'select', default: 'none', options: ['none', 'protanopia', 'deuteranopia', 'tritanopia'] },
                highContrast: { type: 'boolean', default: false },
                largeText: { type: 'boolean', default: false },
                screenReader: { type: 'boolean', default: false },
                reducedMotion: { type: 'boolean', default: false },
                audioCues: { type: 'boolean', default: false },
                visualCues: { type: 'boolean', default: true },
                cameraShake: { type: 'slider', default: 0.5, min: 0, max: 1, step: 0.1 }
            },
            
            // Performance settings
            [this.categories.PERFORMANCE]: {
                targetFPS: { type: 'select', default: '60', options: ['30', '60', '120', '144'] },
                adaptiveQuality: { type: 'boolean', default: true },
                lodDistance: { type: 'slider', default: 100, min: 50, max: 200, step: 10 },
                maxParticles: { type: 'slider', default: 1000, min: 100, max: 5000, step: 100 },
                textureStreaming: { type: 'boolean', default: true },
                multithreading: { type: 'boolean', default: true },
                memoryLimit: { type: 'select', default: 'auto', options: ['low', 'medium', 'high', 'auto'] }
            }
        };
        
        // Initialize default settings
        this.initializeDefaultSettings();
        
        // Load profiles
        this.loadProfiles();
        
        // Setup validation
        this.setupValidation();
    }

    initializeDefaultSettings() {
        // Initialize all settings with defaults
        Object.entries(this.settingsSchema).forEach(([category, settings]) => {
            Object.entries(settings).forEach(([key, config]) => {
                if (!(key in this.settings)) {
                    this.settings[key] = config.default;
                }
            });
        });
    }

    setupValidation() {
        this.validators = {
            range: (value, min, max) => value >= min && value <= max,
            options: (value, options) => options.includes(value),
            type: (value, type) => typeof value === type
        };
    }

    // Profile management
    createProfile(name, settings = {}) {
        const profile = {
            name: name,
            settings: { ...this.settings, ...settings },
            created: Date.now(),
            modified: Date.now(),
            description: settings.description || '',
            icon: settings.icon || '⚙️'
        };
        
        this.profiles.set(name, profile);
        this.saveProfiles();
        
        return profile;
    }

    deleteProfile(name) {
        if (name === 'default') {
            throw new Error('Cannot delete default profile');
        }
        
        if (this.currentProfile === name) {
            this.switchToProfile('default');
        }
        
        this.profiles.delete(name);
        this.saveProfiles();
    }

    switchToProfile(name) {
        const profile = this.profiles.get(name);
        if (!profile) {
            throw new Error(`Profile '${name}' not found`);
        }
        
        // Save current settings to current profile
        if (this.currentProfile && this.profiles.has(this.currentProfile)) {
            const currentProfile = this.profiles.get(this.currentProfile);
            currentProfile.settings = { ...this.settings };
            currentProfile.modified = Date.now();
        }
        
        // Apply new profile settings
        this.settings = { ...profile.settings };
        this.currentProfile = name;
        
        // Update UI and save
        this.updateUI();
        this.saveSettings();
        
        this.emit('profile_switched', { profile: name });
    }

    getProfile(name) {
        return this.profiles.get(name);
    }

    getAllProfiles() {
        return Array.from(this.profiles.values());
    }

    getCurrentProfile() {
        return this.profiles.get(this.currentProfile);
    }

    // Preset profiles
    createPresetProfiles() {
        // Performance profile
        this.createProfile('performance', {
            description: 'Optimized for maximum performance',
            icon: '🚀',
            quality: 'low',
            shadows: 'off',
            particles: false,
            postprocessing: false,
            antialiasing: false,
            targetFPS: '60',
            adaptiveQuality: true,
            maxParticles: 500,
            lodDistance: 50
        });

        // Quality profile
        this.createProfile('quality', {
            description: 'Maximum visual quality',
            icon: '✨',
            quality: 'ultra',
            shadows: 'high',
            particles: true,
            postprocessing: true,
            antialiasing: true,
            targetFPS: '144',
            adaptiveQuality: false,
            maxParticles: 5000,
            lodDistance: 200
        });

        // Balanced profile
        this.createProfile('balanced', {
            description: 'Balanced performance and quality',
            icon: '⚖️',
            quality: 'high',
            shadows: 'medium',
            particles: true,
            postprocessing: true,
            antialiasing: true,
            targetFPS: '60',
            adaptiveQuality: true,
            maxParticles: 1000,
            lodDistance: 100
        });

        // Accessibility profile
        this.createProfile('accessibility', {
            description: 'Enhanced accessibility features',
            icon: '♿',
            highContrast: true,
            largeText: true,
            audioCues: true,
            visualCues: true,
            cameraShake: 0,
            subtitles: true
        });
    }

    // Settings validation
    validateSetting(key, value) {
        const category = this.getSettingCategory(key);
        if (!category) return false;

        const schema = this.settingsSchema[category][key];
        if (!schema) return false;

        // Type validation
        if (schema.type === 'number' && typeof value !== 'number') {
            return false;
        }

        // Range validation
        if (schema.type === 'slider') {
            return this.validators.range(value, schema.min, schema.max);
        }

        // Options validation
        if (schema.type === 'select') {
            return this.validators.options(value, schema.options);
        }

        // Boolean validation
        if (schema.type === 'boolean') {
            return this.validators.type(value, 'boolean');
        }

        return true;
    }

    getSettingCategory(key) {
        for (const [category, settings] of Object.entries(this.settingsSchema)) {
            if (key in settings) {
                return category;
            }
        }
        return null;
    }

    // Override setSetting to include validation
    setSetting(key, value) {
        if (!this.validateSetting(key, value)) {
            console.warn(`Invalid setting value for ${key}:`, value);
            return false;
        }

        const oldValue = this.settings[key];
        this.settings[key] = value;
        
        // Update current profile
        if (this.profiles.has(this.currentProfile)) {
            const profile = this.profiles.get(this.currentProfile);
            profile.settings[key] = value;
            profile.modified = Date.now();
        }

        this.updateUI();
        this.saveSettings();
        
        this.emit('setting_changed', { key, value, oldValue });
        return true;
    }

    // Batch settings updates
    updateSettings(settings) {
        const changes = {};
        const validSettings = {};

        // Validate all settings first
        Object.entries(settings).forEach(([key, value]) => {
            if (this.validateSetting(key, value)) {
                validSettings[key] = value;
                changes[key] = { oldValue: this.settings[key], newValue: value };
            } else {
                console.warn(`Skipping invalid setting: ${key}`);
            }
        });

        // Apply valid settings
        Object.assign(this.settings, validSettings);

        // Update current profile
        if (this.profiles.has(this.currentProfile)) {
            const profile = this.profiles.get(this.currentProfile);
            Object.assign(profile.settings, validSettings);
            profile.modified = Date.now();
        }

        this.updateUI();
        this.saveSettings();
        
        this.emit('settings_updated', { changes });
    }

    // Settings import/export
    exportSettings() {
        return {
            version: '1.0',
            timestamp: Date.now(),
            currentProfile: this.currentProfile,
            settings: this.settings,
            profiles: Array.from(this.profiles.entries()).map(([name, profile]) => [name, {
                ...profile,
                settings: profile.settings
            }])
        };
    }

    importSettings(importData) {
        try {
            if (!importData.version || !importData.settings) {
                throw new Error('Invalid settings file format');
            }

            // Validate and import settings
            const validSettings = {};
            Object.entries(importData.settings).forEach(([key, value]) => {
                if (this.validateSetting(key, value)) {
                    validSettings[key] = value;
                }
            });

            // Import profiles
            if (importData.profiles) {
                this.profiles.clear();
                importData.profiles.forEach(([name, profile]) => {
                    this.profiles.set(name, profile);
                });
            }

            // Apply settings
            this.updateSettings(validSettings);

            // Switch to imported profile
            if (importData.currentProfile && this.profiles.has(importData.currentProfile)) {
                this.switchToProfile(importData.currentProfile);
            }

            this.saveProfiles();
            this.emit('settings_imported', { timestamp: importData.timestamp });
            
            return true;
        } catch (error) {
            console.error('Failed to import settings:', error);
            return false;
        }
    }

    // Reset functionality
    resetToDefaults() {
        const defaults = {};
        
        Object.entries(this.settingsSchema).forEach(([category, settings]) => {
            Object.entries(settings).forEach(([key, config]) => {
                defaults[key] = config.default;
            });
        });

        this.updateSettings(defaults);
        this.emit('settings_reset');
    }

    resetCategory(category) {
        const defaults = {};
        
        if (this.settingsSchema[category]) {
            Object.entries(this.settingsSchema[category]).forEach(([key, config]) => {
                defaults[key] = config.default;
            });
        }

        this.updateSettings(defaults);
        this.emit('category_reset', { category });
    }

    // Settings search and filtering
    searchSettings(query) {
        const results = [];
        
        Object.entries(this.settingsSchema).forEach(([category, settings]) => {
            Object.entries(settings).forEach(([key, config]) => {
                const searchText = `${key} ${category} ${config.description || ''}`.toLowerCase();
                if (searchText.includes(query.toLowerCase())) {
                    results.push({
                        key,
                        category,
                        config,
                        currentValue: this.settings[key]
                    });
                }
            });
        });

        return results;
    }

    getSettingsByCategory(category) {
        const categorySettings = {};
        
        if (this.settingsSchema[category]) {
            Object.entries(this.settingsSchema[category]).forEach(([key, config]) => {
                categorySettings[key] = {
                    config,
                    currentValue: this.settings[key]
                };
            });
        }

        return categorySettings;
    }

    // Performance optimization
    optimizeForHardware() {
        const gpuInfo = this.getGPUInfo();
        const memoryInfo = this.getMemoryInfo();
        
        let optimizedSettings = {};

        // Adjust based on GPU
        if (gpuInfo.tier === 'low') {
            optimizedSettings = {
                ...optimizedSettings,
                quality: 'low',
                shadows: 'off',
                particles: false,
                postprocessing: false,
                antialiasing: false
            };
        } else if (gpuInfo.tier === 'medium') {
            optimizedSettings = {
                ...optimizedSettings,
                quality: 'medium',
                shadows: 'low',
                particles: true,
                postprocessing: false,
                antialiasing: true
            };
        }

        // Adjust based on memory
        if (memoryInfo.low) {
            optimizedSettings = {
                ...optimizedSettings,
                maxParticles: 500,
                lodDistance: 50,
                textureStreaming: true
            };
        }

        this.updateSettings(optimizedSettings);
        this.emit('hardware_optimization_applied');
    }

    getGPUInfo() {
        // Simplified GPU detection
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
        
        if (!gl) {
            return { tier: 'low', vendor: 'unknown' };
        }

        const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
        if (debugInfo) {
            const vendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL);
            const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
            
            // Simple tier classification
            if (renderer.includes('Intel') && !renderer.includes('Iris')) {
                return { tier: 'low', vendor, renderer };
            } else if (renderer.includes('NVIDIA') || renderer.includes('Radeon')) {
                return { tier: 'high', vendor, renderer };
            } else {
                return { tier: 'medium', vendor, renderer };
            }
        }

        return { tier: 'medium', vendor: 'unknown' };
    }

    getMemoryInfo() {
        if (performance.memory) {
            const memory = performance.memory;
            const usedGB = memory.usedJSHeapSize / (1024 * 1024 * 1024);
            const totalGB = memory.totalJSHeapSize / (1024 * 1024 * 1024);
            
            return {
                used: usedGB,
                total: totalGB,
                low: totalGB < 4
            };
        }

        return { used: 0, total: 0, low: false };
    }

    // Persistence
    saveProfiles() {
        try {
            const profilesData = Array.from(this.profiles.entries()).map(([name, profile]) => [name, {
                ...profile,
                settings: profile.settings
            }]);
            
            localStorage.setItem('deadly_labyrinth_profiles', JSON.stringify({
                currentProfile: this.currentProfile,
                profiles: profilesData
            }));
        } catch (error) {
            console.error('Failed to save profiles:', error);
        }
    }

    loadProfiles() {
        try {
            const profilesData = localStorage.getItem('deadly_labyrinth_profiles');
            if (profilesData) {
                const data = JSON.parse(profilesData);
                
                this.currentProfile = data.currentProfile || 'default';
                
                data.profiles.forEach(([name, profile]) => {
                    this.profiles.set(name, profile);
                });

                // Apply current profile settings
                if (this.profiles.has(this.currentProfile)) {
                    const profile = this.profiles.get(this.currentProfile);
                    this.settings = { ...profile.settings };
                }
            }

            // Create preset profiles if none exist
            if (this.profiles.size <= 1) {
                this.createPresetProfiles();
            }
        } catch (error) {
            console.error('Failed to load profiles:', error);
            this.createPresetProfiles();
        }
    }

    // Utility methods
    getSettingSchema(key) {
        const category = this.getSettingCategory(key);
        return category ? this.settingsSchema[category][key] : null;
    }

    getAllSettingsSchema() {
        return this.settingsSchema;
    }

    getProfileStats() {
        return {
            totalProfiles: this.profiles.size,
            currentProfile: this.currentProfile,
            customProfiles: Array.from(this.profiles.keys()).filter(name => 
                !['default', 'performance', 'quality', 'balanced', 'accessibility'].includes(name)
            ).length
        };
    }

    emit(event, data) {
        // This would connect to the event bus
        console.log(`AdvancedSettingsManager event: ${event}`, data);
    }
}
