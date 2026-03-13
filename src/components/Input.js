export class Input {
    constructor() {
        // Movement keys
        this.keys = {
            w: false,
            a: false,
            s: false,
            d: false,
            space: false,
            shift: false,
            ctrl: false
        };

        // Mouse state
        this.mouse = {
            x: 0,
            y: 0,
            deltaX: 0,
            deltaY: 0,
            locked: false
        };

        // Touch state for mobile
        this.touch = {
            active: false,
            startX: 0,
            startY: 0,
            currentX: 0,
            currentY: 0
        };

        // Actions
        this.actions = {
            jump: false,
            crouch: false,
            sprint: false,
            interact: false,
            flashlight: false
        };
    }

    setKey(key, pressed) {
        if (this.keys.hasOwnProperty(key)) {
            this.keys[key] = pressed;
        }
    }

    updateMouse(x, y, deltaX = 0, deltaY = 0) {
        this.mouse.x = x;
        this.mouse.y = y;
        this.mouse.deltaX = deltaX;
        this.mouse.deltaY = deltaY;
    }

    setMouseLocked(locked) {
        this.mouse.locked = locked;
    }

    setTouch(startX, startY, currentX, currentY) {
        this.touch.startX = startX;
        this.touch.startY = startY;
        this.touch.currentX = currentX;
        this.touch.currentY = currentY;
        this.touch.active = true;
    }

    clearTouch() {
        this.touch.active = false;
    }

    setAction(action, active) {
        if (this.actions.hasOwnProperty(action)) {
            this.actions[action] = active;
        }
    }

    // Movement vectors
    getMovementVector() {
        const vector = { x: 0, y: 0 };
        
        if (this.keys.w) vector.y += 1;
        if (this.keys.s) vector.y -= 1;
        if (this.keys.a) vector.x -= 1;
        if (this.keys.d) vector.x += 1;
        
        return vector;
    }

    isMoving() {
        return this.keys.w || this.keys.s || this.keys.a || this.keys.d;
    }

    // Reset delta values each frame
    resetDeltas() {
        this.mouse.deltaX = 0;
        this.mouse.deltaY = 0;
    }

    clone() {
        const input = new Input();
        input.keys = { ...this.keys };
        input.mouse = { ...this.mouse };
        input.touch = { ...this.touch };
        input.actions = { ...this.actions };
        return input;
    }
}
