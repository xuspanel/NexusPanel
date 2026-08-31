/**
 * NexusPanel Lightweight Event Bus
 * Pure Vanilla Pub/Sub mechanism decoupling state & DOM updates.
 */
class NexusEventBus extends EventTarget {
  constructor() {
    super();
    this._listeners = new Map();
  }

  /**
   * Emit an event with optional detail payload
   * @param {string} eventName
   * @param {Object} [detail={}]
   * @returns {CustomEvent}
   */
  emit(eventName, detail = {}) {
    const event = new CustomEvent(eventName, {
      detail: detail,
      bubbles: true,
      cancelable: true,
    });
    this.dispatchEvent(event);
    return event;
  }

  /**
   * Subscribe to an event
   * @param {string} eventName
   * @param {Function} callback
   * @returns {Function} Unsubscribe function
   */
  on(eventName, callback) {
    const handler = (e) => callback(e.detail, e);
    this.addEventListener(eventName, handler);

    if (!this._listeners.has(callback)) {
      this._listeners.set(callback, new Map());
    }
    this._listeners.get(callback).set(eventName, handler);

    return () => this.off(eventName, callback);
  }

  /**
   * Subscribe to an event once
   * @param {string} eventName
   * @param {Function} callback
   */
  once(eventName, callback) {
    const handler = (e) => {
      this.off(eventName, callback);
      callback(e.detail, e);
    };
    this.addEventListener(eventName, handler);

    if (!this._listeners.has(callback)) {
      this._listeners.set(callback, new Map());
    }
    this._listeners.get(callback).set(eventName, handler);
  }

  /**
   * Unsubscribe from an event
   * @param {string} eventName
   * @param {Function} callback
   */
  off(eventName, callback) {
    const map = this._listeners.get(callback);
    if (map && map.has(eventName)) {
      const handler = map.get(eventName);
      this.removeEventListener(eventName, handler);
      map.delete(eventName);
      if (map.size === 0) this._listeners.delete(callback);
    } else {
      this.removeEventListener(eventName, callback);
    }
  }
}

window.NexusEvents = new NexusEventBus();
