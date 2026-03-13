export class AchievementSystem {
    constructor(eventBus) {
        this.eventBus = eventBus;
        this.achievements = new Map();
        this.unlockedAchievements = new Set();
        this.progressTracking = new Map();
        this.isInitialized = false;
        
        // Achievement categories
        this.categories = {
            SURVIVAL: 'survival',
            EXPLORATION: 'exploration',
            COMBAT: 'combat',
            COLLECTION: 'collection',
            SPEEDRUN: 'speedrun',
            SPECIAL: 'special'
        };
        
        // Statistics tracking
        this.stats = {
            totalPlayTime: 0,
            levelsCompleted: 0,
            monstersEvaded: 0,
            batteriesCollected: 0,
            distanceTraveled: 0,
            flashlightTime: 0,
            crouchTime: 0,
            deaths: 0,
            perfectLevels: 0
        };
        
        this.setupEventListeners();
        this.registerDefaultAchievements();
    }

    setupEventListeners() {
        // Game events
        this.eventBus.on('level_complete', (data) => this.onLevelComplete(data));
        this.eventBus.on('game_over', (data) => this.onGameOver(data));
        this.eventBus.on('player_death', (data) => this.onPlayerDeath(data));
        
        // Player actions
        this.eventBus.on('battery_collected', (data) => this.onBatteryCollected(data));
        this.eventBus.on('monster_evaded', (data) => this.onMonsterEvaded(data));
        this.eventBus.on('flashlight_toggled', (data) => this.onFlashlightToggled(data));
        this.eventBus.on('player_crouched', (data) => this.onPlayerCrouched(data));
        
        // Progress events
        this.eventBus.on('distance_traveled', (data) => this.onDistanceTraveled(data));
        this.eventBus.on('time_elapsed', (data) => this.onTimeElapsed(data));
    }

    registerDefaultAchievements() {
        // Survival achievements
        this.registerAchievement('first_survivor', {
            name: 'First Survivor',
            description: 'Complete your first level',
            category: this.categories.SURVIVAL,
            icon: '🏆',
            points: 10,
            condition: (stats) => stats.levelsCompleted >= 1
        });

        this.registerAchievement('speed_demon', {
            name: 'Speed Demon',
            description: 'Complete a level in under 2 minutes',
            category: this.categories.SPEEDRUN,
            icon: '⚡',
            points: 25,
            condition: (stats, context) => context.levelTime < 120
        });

        this.registerAchievement('perfect_run', {
            name: 'Perfect Run',
            description: 'Complete a level without taking damage',
            category: this.categories.SURVIVAL,
            icon: '⭐',
            points: 50,
            condition: (stats, context) => context.damageTaken === 0
        });

        // Exploration achievements
        this.registerAchievement('explorer', {
            name: 'Explorer',
            description: 'Travel 1000 meters total',
            category: this.categories.EXPLORATION,
            icon: '🗺️',
            points: 15,
            condition: (stats) => stats.distanceTraveled >= 1000
        });

        this.registerAchievement('maze_master', {
            name: 'Maze Master',
            description: 'Complete 10 levels',
            category: this.categories.EXPLORATION,
            icon: '🧭',
            points: 30,
            condition: (stats) => stats.levelsCompleted >= 10
        });

        // Collection achievements
        this.registerAchievement('battery_collector', {
            name: 'Battery Collector',
            description: 'Collect 50 batteries',
            category: this.categories.COLLECTION,
            icon: '🔋',
            points: 20,
            condition: (stats) => stats.batteriesCollected >= 50
        });

        this.registerAchievement('power_hungry', {
            name: 'Power Hungry',
            description: 'Collect 100 batteries',
            category: this.categories.COLLECTION,
            icon: '⚡',
            points: 40,
            condition: (stats) => stats.batteriesCollected >= 100
        });

        // Combat achievements
        this.registerAchievement('ghost', {
            name: 'Ghost',
            description: 'Evade 100 monsters',
            category: this.categories.COMBAT,
            icon: '👻',
            points: 25,
            condition: (stats) => stats.monstersEvaded >= 100
        });

        this.registerAchievement('untouchable', {
            name: 'Untouchable',
            description: 'Complete 5 levels without dying',
            category: this.categories.COMBAT,
            icon: '🛡️',
            points: 35,
            condition: (stats) => stats.perfectLevels >= 5
        });

        // Special achievements
        this.registerAchievement('marathon_runner', {
            name: 'Marathon Runner',
            description: 'Play for 2 hours total',
            category: this.categories.SPECIAL,
            icon: '🏃',
            points: 20,
            condition: (stats) => stats.totalPlayTime >= 7200 // 2 hours in seconds
        });

        this.registerAchievement('darkness_dweller', {
            name: 'Darkness Dweller',
            description: 'Keep flashlight off for 10 minutes total',
            category: this.categories.SPECIAL,
            icon: '🌙',
            points: 15,
            condition: (stats) => stats.flashlightTime >= 600
        });

        this.registerAchievement('silent_stalker', {
            name: 'Silent Stalker',
            description: 'Crouch for 5 minutes total',
            category: this.categories.SPECIAL,
            icon: '🤫',
            points: 15,
            condition: (stats) => stats.crouchTime >= 300
        });
    }

    registerAchievement(id, config) {
        const achievement = {
            id: id,
            name: config.name,
            description: config.description,
            category: config.category,
            icon: config.icon || '🏆',
            points: config.points || 10,
            condition: config.condition,
            unlocked: false,
            unlockedAt: null,
            progress: 0,
            maxProgress: config.maxProgress || 1,
            secret: config.secret || false,
            hidden: config.hidden || false
        };

        this.achievements.set(id, achievement);
        return achievement;
    }

    checkAchievements(gameState = {}, context = {}) {
        const currentStats = { ...this.stats, ...gameState };
        
        this.achievements.forEach((achievement, id) => {
            if (this.unlockedAchievements.has(id)) return;
            
            try {
                const unlocked = achievement.condition(currentStats, context);
                
                if (unlocked && !achievement.unlocked) {
                    this.unlockAchievement(id);
                }
            } catch (error) {
                console.error(`Error checking achievement ${id}:`, error);
            }
        });
    }

    unlockAchievement(id) {
        if (this.unlockedAchievements.has(id)) return;
        
        const achievement = this.achievements.get(id);
        if (!achievement) return;

        achievement.unlocked = true;
        achievement.unlockedAt = Date.now();
        this.unlockedAchievements.add(id);

        this.showAchievementNotification(achievement);
        this.eventBus.emit('achievement_unlocked', { achievement });
        
        // Save to persistent storage
        this.saveAchievements();
    }

    showAchievementNotification(achievement) {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = 'achievement-notification';
        notification.innerHTML = `
            <div class="achievement-popup">
                <div class="achievement-icon">${achievement.icon}</div>
                <div class="achievement-info">
                    <div class="achievement-title">${achievement.name}</div>
                    <div class="achievement-description">${achievement.description}</div>
                    <div class="achievement-points">+${achievement.points} points</div>
                </div>
            </div>
        `;

        // Add styles if not already present
        if (!document.querySelector('#achievement-styles')) {
            const style = document.createElement('style');
            style.id = 'achievement-styles';
            style.textContent = `
                .achievement-notification {
                    position: fixed;
                    top: 20px;
                    right: 20px;
                    z-index: 10000;
                    animation: slideIn 0.5s ease-out;
                }
                
                .achievement-popup {
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                    padding: 15px 20px;
                    border-radius: 10px;
                    box-shadow: 0 10px 30px rgba(0,0,0,0.3);
                    display: flex;
                    align-items: center;
                    gap: 15px;
                    min-width: 300px;
                }
                
                .achievement-icon {
                    font-size: 2em;
                }
                
                .achievement-title {
                    font-weight: bold;
                    font-size: 1.1em;
                    margin-bottom: 5px;
                }
                
                .achievement-description {
                    font-size: 0.9em;
                    opacity: 0.9;
                    margin-bottom: 5px;
                }
                
                .achievement-points {
                    font-size: 0.8em;
                    opacity: 0.8;
                }
                
                @keyframes slideIn {
                    from {
                        transform: translateX(100%);
                        opacity: 0;
                    }
                    to {
                        transform: translateX(0);
                        opacity: 1;
                    }
                }
                
                @keyframes slideOut {
                    from {
                        transform: translateX(0);
                        opacity: 1;
                    }
                    to {
                        transform: translateX(100%);
                        opacity: 0;
                    }
                }
            `;
            document.head.appendChild(style);
        }

        document.body.appendChild(notification);

        // Remove after 5 seconds
        setTimeout(() => {
            notification.style.animation = 'slideOut 0.5s ease-out';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 500);
        }, 5000);
    }

    // Event handlers
    onLevelComplete(data) {
        this.stats.levelsCompleted++;
        
        const context = {
            levelTime: data.levelTime || 0,
            damageTaken: data.damageTaken || 0
        };
        
        if (context.damageTaken === 0) {
            this.stats.perfectLevels++;
        }
        
        this.checkAchievements({}, context);
    }

    onGameOver(data) {
        this.checkAchievements();
    }

    onPlayerDeath(data) {
        this.stats.deaths++;
        this.checkAchievements();
    }

    onBatteryCollected(data) {
        this.stats.batteriesCollected++;
        this.checkAchievements();
    }

    onMonsterEvaded(data) {
        this.stats.monstersEvaded++;
        this.checkAchievements();
    }

    onFlashlightToggled(data) {
        if (data.isOn) {
            // Start tracking flashlight time
            this.flashlightStartTime = Date.now();
        } else {
            // Add elapsed time
            if (this.flashlightStartTime) {
                const elapsed = (Date.now() - this.flashlightStartTime) / 1000;
                this.stats.flashlightTime += elapsed;
                this.flashlightStartTime = null;
                this.checkAchievements();
            }
        }
    }

    onPlayerCrouched(data) {
        if (data.isCrouching) {
            this.crouchStartTime = Date.now();
        } else {
            if (this.crouchStartTime) {
                const elapsed = (Date.now() - this.crouchStartTime) / 1000;
                this.stats.crouchTime += elapsed;
                this.crouchStartTime = null;
                this.checkAchievements();
            }
        }
    }

    onDistanceTraveled(data) {
        this.stats.distanceTraveled += data.distance;
        this.checkAchievements();
    }

    onTimeElapsed(data) {
        this.stats.totalPlayTime += data.time;
        this.checkAchievements();
    }

    // Utility methods
    getAchievement(id) {
        return this.achievements.get(id);
    }

    getAchievementsByCategory(category) {
        const achievements = [];
        this.achievements.forEach((achievement) => {
            if (achievement.category === category) {
                achievements.push(achievement);
            }
        });
        return achievements;
    }

    getUnlockedAchievements() {
        const unlocked = [];
        this.unlockedAchievements.forEach(id => {
            unlocked.push(this.achievements.get(id));
        });
        return unlocked;
    }

    getLockedAchievements() {
        const locked = [];
        this.achievements.forEach((achievement) => {
            if (!this.unlockedAchievements.has(achievement.id)) {
                locked.push(achievement);
            }
        });
        return locked;
    }

    getTotalPoints() {
        let totalPoints = 0;
        this.unlockedAchievements.forEach(id => {
            const achievement = this.achievements.get(id);
            totalPoints += achievement.points;
        });
        return totalPoints;
    }

    getCompletionPercentage() {
        return Math.round((this.unlockedAchievements.size / this.achievements.size) * 100);
    }

    getStats() {
        return {
            ...this.stats,
            achievementsUnlocked: this.unlockedAchievements.size,
            totalAchievements: this.achievements.size,
            totalPoints: this.getTotalPoints(),
            completionPercentage: this.getCompletionPercentage()
        };
    }

    saveAchievements() {
        const saveData = {
            unlockedAchievements: Array.from(this.unlockedAchievements),
            stats: this.stats,
            timestamp: Date.now()
        };
        
        try {
            localStorage.setItem('deadly_labyrinth_achievements', JSON.stringify(saveData));
        } catch (error) {
            console.error('Failed to save achievements:', error);
        }
    }

    loadAchievements() {
        try {
            const saveData = localStorage.getItem('deadly_labyrinth_achievements');
            if (saveData) {
                const data = JSON.parse(saveData);
                
                // Restore unlocked achievements
                this.unlockedAchievements = new Set(data.unlockedAchievements || []);
                
                // Restore stats
                this.stats = { ...this.stats, ...data.stats };
                
                // Update achievement states
                this.unlockedAchievements.forEach(id => {
                    const achievement = this.achievements.get(id);
                    if (achievement) {
                        achievement.unlocked = true;
                        achievement.unlockedAt = data.timestamp;
                    }
                });
                
                return true;
            }
        } catch (error) {
            console.error('Failed to load achievements:', error);
        }
        
        return false;
    }

    resetAchievements() {
        this.unlockedAchievements.clear();
        this.stats = {
            totalPlayTime: 0,
            levelsCompleted: 0,
            monstersEvaded: 0,
            batteriesCollected: 0,
            distanceTraveled: 0,
            flashlightTime: 0,
            crouchTime: 0,
            deaths: 0,
            perfectLevels: 0
        };
        
        // Reset achievement states
        this.achievements.forEach(achievement => {
            achievement.unlocked = false;
            achievement.unlockedAt = null;
        });
        
        this.saveAchievements();
    }

    initialize() {
        this.loadAchievements();
        this.isInitialized = true;
        this.eventBus.emit('achievement_system_initialized');
    }

    dispose() {
        this.saveAchievements();
        this.achievements.clear();
        this.unlockedAchievements.clear();
        this.progressTracking.clear();
    }
}
