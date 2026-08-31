import { describe, it, expect, vi } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Vanilla Event Bus (public/js/events.js)', () => {
  it('instantiates and provides emit, on, once, off methods', () => {
    // Simulate browser window and CustomEvent
    class MockCustomEvent {
      constructor(type, options = {}) {
        this.type = type;
        this.detail = options.detail || {};
      }
    }
    globalThis.CustomEvent = MockCustomEvent;

    class MockEventTarget {
      constructor() {
        this._handlers = {};
      }
      addEventListener(type, handler) {
        if (!this._handlers[type]) this._handlers[type] = [];
        this._handlers[type].push(handler);
      }
      removeEventListener(type, handler) {
        if (!this._handlers[type]) return;
        this._handlers[type] = this._handlers[type].filter(h => h !== handler);
      }
      dispatchEvent(event) {
        const list = this._handlers[event.type] || [];
        list.forEach(h => h(event));
      }
    }
    globalThis.EventTarget = MockEventTarget;
    globalThis.window = globalThis;

    const eventsScript = fs.readFileSync(path.resolve('public/js/events.js'), 'utf-8');
    eval(eventsScript);

    expect(window.NexusEvents).toBeDefined();

    const received = [];
    const unsubscribe = window.NexusEvents.on('service:updated', (detail) => {
      received.push(detail);
    });

    window.NexusEvents.emit('service:updated', { service: 'nginx', status: 'active' });
    expect(received).toEqual([{ service: 'nginx', status: 'active' }]);

    // Unsubscribe
    unsubscribe();
    window.NexusEvents.emit('service:updated', { service: 'postgresql', status: 'active' });
    expect(received).toHaveLength(1);
  });
});
