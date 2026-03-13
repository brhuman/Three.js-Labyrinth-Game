export class InputSystem {
    constructor(eventBus, domElement) {
        this.eventBus = eventBus;
        this.domElement = domElement || document.body;
        this.isEnabled = true;
        
        // Input state
        this.keys = {};
        this.mouse = {
            x: 0,
            y: 0,
            deltaX: 0,
            deltaY: 0,
            locked: false
        };
        
        // Callbacks
        this.onKeyDown = this.handleKeyDown.bind(this);
        this.onKeyUp = this.handleKeyUp.bind(this);
        this.onMouseMove = this.handleMouseMove.bind(this);
        this.onMouseDown = this.handleMouseDown.bind(this);
        this.onMouseUp = this.handleMouseUp.bind(this);
        this.onPointerLockChange = this.handlePointerLockChange.bind(this);
        this.onContextMenu = this.handleContextMenu.bind(this);
        
        this.setupEventListeners();
    }

    setupEventListeners() {
        // Keyboard events
        document.addEventListener('keydown', this.onKeyDown);
        document.addEventListener('keyup', this.onKeyUp);
        
        // Mouse events
        this.domElement.addEventListener('mousemove', this.onMouseMove);
        this.domElement.addEventListener('mousedown', this.onMouseDown);
        this.domElement.addEventListener('mouseup', this.onMouseUp);
        
        // Pointer lock
        document.addEventListener('pointerlockchange', this.onPointerLockChange);
        document.addEventListener('mozpointerlockchange', this.onPointerLockChange);
        
        // Context menu
        this.domElement.addEventListener('contextmenu', this.onContextMenu);
    }

    handleKeyDown(event) {
        if (!this.isEnabled) return;
        
        const key = event.code.toLowerCase();
        this.keys[key] = true;
        
        // Emit key press event
        this.eventBus.emit('key_down', { key, code: event.code, event });
        
        // Handle specific actions
        this.handleKeyAction(key, true);
    }

    handleKeyUp(event) {
        if (!this.isEnabled) return;
        
        const key = event.code.toLowerCase();
        this.keys[key] = false;
        
        // Emit key release event
        this.eventBus.emit('key_up', { key, code: event.code, event });
        
        // Handle specific actions
        this.handleKeyAction(key, false);
    }

    handleMouseMove(event) {
        if (!this.isEnabled) return;
        
        const movementX = event.movementX || event.mozMovementX || event.webkitMovementX || 0;
        const movementY = event.movementY || event.mozMovementY || event.webkitMovementY || 0;
        
        this.mouse.deltaX = movementX;
        this.mouse.deltaY = movementY;
        this.mouse.x = event.clientX;
        this.mouse.y = event.clientY;
        
        // Emit mouse move event
        this.eventBus.emit('mouse_move', {
            x: this.mouse.x,
            y: this.mouse.y,
            deltaX: this.mouse.deltaX,
            deltaY: this.mouse.deltaY,
            locked: this.mouse.locked
        });
    }

    handleMouseDown(event) {
        if (!this.isEnabled) return;
        
        this.eventBus.emit('mouse_down', {
            button: event.button,
            x: event.clientX,
            y: event.clientY
        });
    }

    handleMouseUp(event) {
        if (!this.isEnabled) return;
        
        this.eventBus.emit('mouse_up', {
            button: event.button,
            x: event.clientX,
            y: event.clientY
        });
    }

    handlePointerLockChange() {
        const isLocked = document.pointerLockElement === this.domElement ||
                         document.mozPointerLockElement === this.domElement;
        
        this.mouse.locked = isLocked;
        
        this.eventBus.emit('pointer_lock_change', { locked: isLocked });
    }

    handleContextMenu(event) {
        event.preventDefault();
    }

    handleKeyAction(key, pressed) {
        switch (key) {
            case 'space':
                this.eventBus.emit('action_jump', { pressed });
                break;
            case 'shiftleft':
            case 'shiftright':
                this.eventBus.emit('action_sprint', { pressed });
                break;
            case 'controlleft':
            case 'controlright':
                this.eventBus.emit('action_crouch', { pressed });
                break;
            case 'keyf':
                this.eventBus.emit('action_flashlight', { pressed });
                break;
            case 'keye':
                if (pressed) {
                    this.eventBus.emit('action_interact');
                }
                break;
            case 'escape':
                if (pressed) {
                    this.eventBus.emit('action_escape');
                }
                break;
        }
    }

    // Public API
    isKeyPressed(key) {
        return this.keys[key.toLowerCase()] || false;
    }

    getMovementVector() {
        let forward = 0;
        let right = 0;
        
        if (this.isKeyPressed('keyw')) forward += 1;
        if (this.isKeyPressed('keys')) forward -= 1;
        if (this.isKeyPressed('keya')) right -= 1;
        if (this.isKeyPressed('keyd')) right += 1;
        
        return { forward, right };
    }

    getMouseDelta() {
        return {
            x: this.mouse.deltaX,
            y: this.mouse.deltaY
        };
    }

    isMouseLocked() {
        return this.mouse.locked;
    }

    requestPointerLock() {
        this.domElement.requestPointerLock();
    }

    exitPointerLock() {
        document.exitPointerLock();
    }

    setEnabled(enabled) {
        this.isEnabled = enabled;
    }

    // Reset mouse delta each frame
    resetMouseDelta() {
        this.mouse.deltaX = 0;
        this.mouse.deltaY = 0;
    }

    dispose() {
        // Remove event listeners
        document.removeEventListener('keydown', this.onKeyDown);
        document.removeEventListener('keyup', this.onKeyUp);
        this.domElement.removeEventListener('mousemove', this.onMouseMove);
        this.domElement.removeEventListener('mousedown', this.onMouseDown);
        this.domElement.removeEventListener('mouseup', this.onMouseUp);
        document.removeEventListener('pointerlockchange', this.onPointerLockChange);
        document.removeEventListener('mozpointerlockchange', this.onPointerLockChange);
        this.domElement.removeEventListener('contextmenu', this.onContextMenu);
        
        // Clear state
        this.keys = {};
        this.mouse.locked = false;
    }
}
