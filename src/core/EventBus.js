export class EventBus {
    constructor() {
        this.listeners = new Map();
        this.onceListeners = new Map();
        this.debugMode = false;
    }
    
    on(event, callback) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }
        this.listeners.get(event).push(callback);
        
        if (this.debugMode) {
            console.log(`[EventBus] Subscribed to event: ${event}`);
        }
        
        // Возвращаем функцию отписки
        return () => this.off(event, callback);
    }
    
    off(event, callback) {
        if (this.listeners.has(event)) {
            const callbacks = this.listeners.get(event);
            const index = callbacks.indexOf(callback);
            if (index > -1) {
                callbacks.splice(index, 1);
                
                if (this.debugMode) {
                    console.log(`[EventBus] Unsubscribed from event: ${event}`);
                }
            }
        }
    }
    
    emit(event, data) {
        if (this.debugMode) {
            console.log(`[EventBus] Emitting event: ${event}`, data);
        }
        
        // Обычные подписчики
        if (this.listeners.has(event)) {
            const callbacks = this.listeners.get(event);
            callbacks.forEach(callback => {
                try {
                    callback(data);
                } catch (error) {
                    console.error(`[EventBus] Error in event handler for ${event}:`, error);
                }
            });
        }
        
        // One-time подписчики
        if (this.onceListeners.has(event)) {
            const callbacks = this.onceListeners.get(event);
            callbacks.forEach(callback => {
                try {
                    callback(data);
                } catch (error) {
                    console.error(`[EventBus] Error in once event handler for ${event}:`, error);
                }
            });
            this.onceListeners.delete(event);
        }
    }
    
    once(event, callback) {
        if (!this.onceListeners.has(event)) {
            this.onceListeners.set(event, []);
        }
        this.onceListeners.get(event).push(callback);
        
        if (this.debugMode) {
            console.log(`[EventBus] Subscribed once to event: ${event}`);
        }
    }
    
    clear() {
        this.listeners.clear();
        this.onceListeners.clear();
        
        if (this.debugMode) {
            console.log(`[EventBus] All event listeners cleared`);
        }
    }
    
    clearEvent(event) {
        this.listeners.delete(event);
        this.onceListeners.delete(event);
        
        if (this.debugMode) {
            console.log(`[EventBus] Event ${event} listeners cleared`);
        }
    }
    
    getListenerCount(event) {
        const regularCount = this.listeners.has(event) ? this.listeners.get(event).length : 0;
        const onceCount = this.onceListeners.has(event) ? this.onceListeners.get(event).length : 0;
        return regularCount + onceCount;
    }
    
    getAllEvents() {
        const events = new Set();
        this.listeners.forEach((_, event) => events.add(event));
        this.onceListeners.forEach((_, event) => events.add(event));
        return Array.from(events);
    }
    
    setDebugMode(enabled) {
        this.debugMode = enabled;
    }
}

// Создаём глобальный экземпляр для использования в приложении
export const globalEventBus = new EventBus();
