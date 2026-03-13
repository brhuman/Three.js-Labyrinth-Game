import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EventBus } from '../../core/EventBus.js';

describe('EventBus', () => {
    let eventBus;
    
    beforeEach(() => {
        eventBus = new EventBus();
        // Включаем debug mode для тестов
        eventBus.setDebugMode(true);
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });
    
    afterEach(() => {
        vi.restoreAllMocks();
    });
    
    describe('Basic subscription', () => {
        it('should subscribe to events', () => {
            const callback = vi.fn();
            eventBus.on('test-event', callback);
            
            eventBus.emit('test-event', { data: 'test' });
            
            expect(callback).toHaveBeenCalledWith({ data: 'test' });
            expect(callback).toHaveBeenCalledTimes(1);
        });
        
        it('should return unsubscribe function', () => {
            const callback = vi.fn();
            const unsubscribe = eventBus.on('test-event', callback);
            
            unsubscribe();
            eventBus.emit('test-event', { data: 'test' });
            
            expect(callback).not.toHaveBeenCalled();
        });
        
        it('should handle multiple subscribers', () => {
            const callback1 = vi.fn();
            const callback2 = vi.fn();
            
            eventBus.on('test-event', callback1);
            eventBus.on('test-event', callback2);
            
            eventBus.emit('test-event', { data: 'test' });
            
            expect(callback1).toHaveBeenCalledWith({ data: 'test' });
            expect(callback2).toHaveBeenCalledWith({ data: 'test' });
        });
    });
    
    describe('Once subscription', () => {
        it('should call once subscriber only once', () => {
            const callback = vi.fn();
            eventBus.once('test-event', callback);
            
            eventBus.emit('test-event', { data: 'test1' });
            eventBus.emit('test-event', { data: 'test2' });
            
            expect(callback).toHaveBeenCalledTimes(1);
            expect(callback).toHaveBeenCalledWith({ data: 'test1' });
        });
        
        it('should handle multiple once subscribers', () => {
            const callback1 = vi.fn();
            const callback2 = vi.fn();
            
            eventBus.once('test-event', callback1);
            eventBus.once('test-event', callback2);
            
            eventBus.emit('test-event', { data: 'test' });
            
            expect(callback1).toHaveBeenCalledTimes(1);
            expect(callback2).toHaveBeenCalledTimes(1);
        });
    });
    
    describe('Error handling', () => {
        it('should handle errors in callbacks gracefully', () => {
            const errorCallback = vi.fn(() => {
                throw new Error('Test error');
            });
            const normalCallback = vi.fn();
            
            eventBus.on('test-event', errorCallback);
            eventBus.on('test-event', normalCallback);
            
            expect(() => {
                eventBus.emit('test-event', { data: 'test' });
            }).not.toThrow();
            
            expect(normalCallback).toHaveBeenCalled();
            expect(console.error).toHaveBeenCalledWith(
                expect.stringContaining('Error in event handler for test-event'),
                expect.any(Error)
            );
        });
    });
    
    describe('Event management', () => {
        it('should clear all events', () => {
            const callback = vi.fn();
            eventBus.on('event1', callback);
            eventBus.on('event2', callback);
            eventBus.once('event3', callback);
            
            eventBus.clear();
            
            eventBus.emit('event1', {});
            eventBus.emit('event2', {});
            eventBus.emit('event3', {});
            
            expect(callback).not.toHaveBeenCalled();
        });
        
        it('should clear specific event', () => {
            const callback1 = vi.fn();
            const callback2 = vi.fn();
            
            eventBus.on('event1', callback1);
            eventBus.on('event2', callback2);
            
            eventBus.clearEvent('event1');
            
            eventBus.emit('event1', {});
            eventBus.emit('event2', {});
            
            expect(callback1).not.toHaveBeenCalled();
            expect(callback2).toHaveBeenCalled();
        });
        
        it('should return correct listener count', () => {
            const callback = vi.fn();
            
            expect(eventBus.getListenerCount('test-event')).toBe(0);
            
            eventBus.on('test-event', callback);
            expect(eventBus.getListenerCount('test-event')).toBe(1);
            
            eventBus.on('test-event', callback);
            expect(eventBus.getListenerCount('test-event')).toBe(2);
            
            eventBus.once('test-event', callback);
            expect(eventBus.getListenerCount('test-event')).toBe(3);
        });
        
        it('should list all events', () => {
            eventBus.on('event1', vi.fn());
            eventBus.on('event2', vi.fn());
            eventBus.once('event3', vi.fn());
            
            const events = eventBus.getAllEvents();
            
            expect(events).toContain('event1');
            expect(events).toContain('event2');
            expect(events).toContain('event3');
            expect(events).toHaveLength(3);
        });
    });
    
    describe('Debug mode', () => {
        it('should log debug information when enabled', () => {
            const callback = vi.fn();
            
            eventBus.on('test-event', callback);
            expect(console.log).toHaveBeenCalledWith(
                expect.stringContaining('Subscribed to event: test-event')
            );
            
            eventBus.emit('test-event', {});
            expect(console.log).toHaveBeenCalledWith(
                expect.stringContaining('Emitting event: test-event'),
                {}
            );
        });
    });
});
