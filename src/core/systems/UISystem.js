export class UISystem {
    constructor(eventBus) {
        this.eventBus = event;
        this.elements = new Map();
        this.isVisible = true;
        this.isInitialized = false;
        
        // UI state
        this.uiState = {
            health: 100,
            battery: 100,
            level: 1,
            time: 0,
            isPaused: false,
            isGameOver: false
        };

        this.setupEventListeners();
    }

    setupEventListeners() {
        this.eventBus.on('ui_show', (data) => this.showElement(data.element));
        this.eventBus.on('ui_hide', (data) => this.hideElement(data.element));
        this.eventBus.on('ui_update', (data) => this.updateElement(data.element, data.content));
        this.eventBus.on('health_changed', (data) => this.updateHealth(data.health));
        this.eventBus.on('battery_changed', (data) => this.updateBattery(data.battery));
        this.eventBus.on('level_changed', (data) => this.updateLevel(data.level));
        this.eventBus.on('game_paused', () => this.showPauseMenu());
        this.eventBus.on('game_resumed', () => this.hidePauseMenu());
        this.eventBus.on('game_over', () => this.showGameOver());
        this.eventBus.on('level_complete', () => this.showLevelComplete());
    }

    initialize() {
        this.cacheElements();
        this.setupUI();
        this.isInitialized = true;
        this.eventBus.emit('ui_system_initialized');
    }

    cacheElements() {
        // Cache common UI elements
        const elements = [
            'health-bar', 'battery-bar', 'level-display', 'time-display',
            'pause-menu', 'game-over-screen', 'level-complete-screen',
            'main-menu', 'settings-menu', 'crosshair', 'minimap'
        ];

        elements.forEach(id => {
            const element = document.getElementById(id);
            if (element) {
                this.elements.set(id, element);
            }
        });
    }

    setupUI() {
        this.updateHealth(this.uiState.health);
        this.updateBattery(this.uiState.battery);
        this.updateLevel(this.uiState.level);
        this.hideAllMenus();
    }

    showElement(elementId) {
        const element = this.elements.get(elementId);
        if (element) {
            element.style.display = 'block';
            this.eventBus.emit('ui_element_shown', { element: elementId });
        }
    }

    hideElement(elementId) {
        const element = this.elements.get(elementId);
        if (element) {
            element.style.display = 'none';
            this.eventBus.emit('ui_element_hidden', { element: elementId });
        }
    }

    updateElement(elementId, content) {
        const element = this.elements.get(elementId);
        if (element) {
            if (typeof content === 'string') {
                element.textContent = content;
            } else if (typeof content === 'object') {
                Object.assign(element, content);
            }
            this.eventBus.emit('ui_element_updated', { element: elementId, content });
        }
    }

    updateHealth(health) {
        this.uiState.health = health;
        const healthBar = this.elements.get('health-bar');
        if (healthBar) {
            const fillElement = healthBar.querySelector('.fill') || healthBar;
            fillElement.style.width = `${health}%`;
            
            // Change color based on health level
            if (health > 60) {
                fillElement.style.backgroundColor = '#4CAF50';
            } else if (health > 30) {
                fillElement.style.backgroundColor = '#FF9800';
            } else {
                fillElement.style.backgroundColor = '#F44336';
            }
        }
    }

    updateBattery(battery) {
        this.uiState.battery = battery;
        const batteryBar = this.elements.get('battery-bar');
        if (batteryBar) {
            const fillElement = batteryBar.querySelector('.fill') || batteryBar;
            fillElement.style.width = `${battery}%`;
            
            // Change color based on battery level
            if (battery > 40) {
                fillElement.style.backgroundColor = '#2196F3';
            } else if (battery > 15) {
                fillElement.style.backgroundColor = '#FF9800';
            } else {
                fillElement.style.backgroundColor = '#F44336';
            }
        }
    }

    updateLevel(level) {
        this.uiState.level = level;
        const levelDisplay = this.elements.get('level-display');
        if (levelDisplay) {
            levelDisplay.textContent = `Level ${level}`;
        }
    }

    updateTime(time) {
        this.uiState.time = time;
        const timeDisplay = this.elements.get('time-display');
        if (timeDisplay) {
            const minutes = Math.floor(time / 60);
            const seconds = Math.floor(time % 60);
            timeDisplay.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        }
    }

    showPauseMenu() {
        this.uiState.isPaused = true;
        this.showElement('pause-menu');
        this.eventBus.emit('pause_menu_shown');
    }

    hidePauseMenu() {
        this.uiState.isPaused = false;
        this.hideElement('pause-menu');
        this.eventBus.emit('pause_menu_hidden');
    }

    showGameOver() {
        this.uiState.isGameOver = true;
        this.showElement('game-over-screen');
        this.eventBus.emit('game_over_shown');
    }

    showLevelComplete() {
        this.showElement('level-complete-screen');
        this.eventBus.emit('level_complete_shown');
    }

    showMainMenu() {
        this.hideAllMenus();
        this.showElement('main-menu');
        this.eventBus.emit('main_menu_shown');
    }

    showSettingsMenu() {
        this.hideAllMenus();
        this.showElement('settings-menu');
        this.eventBus.emit('settings_menu_shown');
    }

    hideAllMenus() {
        const menus = ['pause-menu', 'game-over-screen', 'level-complete-screen', 'main-menu', 'settings-menu'];
        menus.forEach(menu => this.hideElement(menu));
    }

    showCrosshair() {
        this.showElement('crosshair');
    }

    hideCrosshair() {
        this.hideElement('crosshair');
    }

    showMinimap() {
        this.showElement('minimap');
    }

    hideMinimap() {
        this.hideElement('minimap');
    }

    updateMinimap(data) {
        const minimap = this.elements.get('minimap');
        if (minimap && minimap.getContext) {
            const ctx = minimap.getContext('2d');
            
            // Clear minimap
            ctx.clearRect(0, 0, minimap.width, minimap.height);
            
            // Draw maze walls
            if (data.walls) {
                ctx.fillStyle = '#333';
                data.walls.forEach(wall => {
                    ctx.fillRect(wall.x, wall.y, wall.width, wall.height);
                });
            }
            
            // Draw player position
            if (data.playerPos) {
                ctx.fillStyle = '#00FF00';
                ctx.beginPath();
                ctx.arc(data.playerPos.x, data.playerPos.y, 3, 0, Math.PI * 2);
                ctx.fill();
            }
            
            // Draw monster position
            if (data.monsterPos) {
                ctx.fillStyle = '#FF0000';
                ctx.beginPath();
                ctx.arc(data.monsterPos.x, data.monsterPos.y, 3, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }

    showNotification(message, type = 'info', duration = 3000) {
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message;
        
        document.body.appendChild(notification);
        
        // Animate in
        setTimeout(() => {
            notification.classList.add('show');
        }, 10);
        
        // Remove after duration
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => {
                document.body.removeChild(notification);
            }, 300);
        }, duration);
    }

    showDialog(title, message, buttons = []) {
        const dialog = document.createElement('div');
        dialog.className = 'dialog-overlay';
        
        dialog.innerHTML = `
            <div class="dialog">
                <h3>${title}</h3>
                <p>${message}</p>
                <div class="dialog-buttons">
                    ${buttons.map(btn => `<button class="dialog-btn" data-action="${btn.action}">${btn.text}</button>`).join('')}
                </div>
            </div>
        `;
        
        document.body.appendChild(dialog);
        
        // Add event listeners
        dialog.querySelectorAll('.dialog-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const action = btn.dataset.action;
                this.eventBus.emit('dialog_action', { action });
                document.body.removeChild(dialog);
            });
        });
        
        return dialog;
    }

    setVisible(visible) {
        this.isVisible = visible;
        const ui = document.querySelector('.ui-container');
        if (ui) {
            ui.style.display = visible ? 'block' : 'none';
        }
    }

    getUIState() {
        return { ...this.uiState };
    }

    dispose() {
        this.elements.clear();
        this.eventBus.off('ui_show');
        this.eventBus.off('ui_hide');
        this.eventBus.off('ui_update');
        this.eventBus.off('health_changed');
        this.eventBus.off('battery_changed');
        this.eventBus.off('level_changed');
        this.eventBus.off('game_paused');
        this.eventBus.off('game_resumed');
        this.eventBus.off('game_over');
        this.eventBus.off('level_complete');
    }
}
