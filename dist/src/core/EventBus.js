"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EventBus = void 0;
const events_1 = require("events");
class EventBus extends events_1.EventEmitter {
    constructor() {
        super();
    }
    static getInstance() {
        if (!EventBus.instance) {
            EventBus.instance = new EventBus();
        }
        return EventBus.instance;
    }
    emitEvent(type, payload) {
        const event = {
            type,
            payload,
            timestamp: Date.now()
        };
        this.emit(type, event);
        // Also emit a generic 'event' for catch-all listeners (like WebSockets)
        this.emit('event', event);
    }
}
exports.EventBus = EventBus;
