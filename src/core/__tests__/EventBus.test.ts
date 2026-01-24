import { EventBus, EventType, ConclaveEvent } from '../EventBus';

describe('EventBus', () => {
  let eventBus: EventBus;

  beforeEach(() => {
    // Create a new scoped instance for each test to avoid cross-test pollution
    eventBus = EventBus.createInstance();
  });

  afterEach(() => {
    eventBus.removeAllListeners();
  });

  describe('Singleton pattern', () => {
    it('should return same instance from getInstance()', () => {
      const instance1 = EventBus.getInstance();
      const instance2 = EventBus.getInstance();
      expect(instance1).toBe(instance2);
    });

    it('should return different instances from createInstance()', () => {
      const instance1 = EventBus.createInstance();
      const instance2 = EventBus.createInstance();
      expect(instance1).not.toBe(instance2);
    });
  });

  describe('Event emission', () => {
    it('should emit events with type, payload, and timestamp', (done) => {
      const payload = { message: 'test' };

      eventBus.on('status', (event: ConclaveEvent) => {
        expect(event.type).toBe('status');
        expect(event.payload).toEqual(payload);
        expect(typeof event.timestamp).toBe('number');
        expect(event.timestamp).toBeGreaterThan(0);
        done();
      });

      eventBus.emitEvent('status', payload);
    });

    it('should also emit generic "event" for catch-all listeners', (done) => {
      const payload = { test: true };

      eventBus.on('event', (event: ConclaveEvent) => {
        expect(event.type).toBe('agent:thinking');
        expect(event.payload).toEqual(payload);
        done();
      });

      eventBus.emitEvent('agent:thinking', payload);
    });
  });

  describe('Event types', () => {
    const eventTypes: EventType[] = [
      'run:start',
      'run:complete',
      'agent:thinking',
      'token',
      'agent:response',
      'round:start',
      'round:complete',
      'status',
      'error',
      'cost:update',
      'tool:call',
      'tool:result',
      'consultation:started',
      'consultation:completed',
      'speaker:selected',
      'speaker:handoff'
    ];

    eventTypes.forEach(eventType => {
      it(`should emit "${eventType}" event`, (done) => {
        eventBus.on(eventType, (event: ConclaveEvent) => {
          expect(event.type).toBe(eventType);
          done();
        });

        eventBus.emitEvent(eventType, { test: true });
      });
    });
  });

  describe('Multiple listeners', () => {
    it('should notify all listeners for the same event', () => {
      const listener1 = jest.fn();
      const listener2 = jest.fn();

      eventBus.on('status', listener1);
      eventBus.on('status', listener2);

      eventBus.emitEvent('status', { message: 'test' });

      expect(listener1).toHaveBeenCalledTimes(1);
      expect(listener2).toHaveBeenCalledTimes(1);
    });

    it('should not affect listeners of different event types', () => {
      const statusListener = jest.fn();
      const errorListener = jest.fn();

      eventBus.on('status', statusListener);
      eventBus.on('error', errorListener);

      eventBus.emitEvent('status', { message: 'status' });

      expect(statusListener).toHaveBeenCalledTimes(1);
      expect(errorListener).not.toHaveBeenCalled();
    });
  });

  describe('Event payload', () => {
    it('should preserve complex payload objects', (done) => {
      const complexPayload = {
        nested: {
          array: [1, 2, 3],
          object: { key: 'value' }
        },
        string: 'test',
        number: 42,
        boolean: true
      };

      eventBus.on('status', (event: ConclaveEvent) => {
        expect(event.payload).toEqual(complexPayload);
        done();
      });

      eventBus.emitEvent('status', complexPayload);
    });

    it('should handle null payload', (done) => {
      eventBus.on('status', (event: ConclaveEvent) => {
        expect(event.payload).toBeNull();
        done();
      });

      eventBus.emitEvent('status', null);
    });

    it('should handle undefined payload', (done) => {
      eventBus.on('status', (event: ConclaveEvent) => {
        expect(event.payload).toBeUndefined();
        done();
      });

      eventBus.emitEvent('status', undefined);
    });
  });

  describe('Listener removal', () => {
    it('should allow removing specific listeners', () => {
      const listener = jest.fn();

      eventBus.on('status', listener);
      eventBus.emitEvent('status', { test: 1 });
      expect(listener).toHaveBeenCalledTimes(1);

      eventBus.off('status', listener);
      eventBus.emitEvent('status', { test: 2 });
      expect(listener).toHaveBeenCalledTimes(1); // Still 1, not called again
    });

    it('should allow removing all listeners', () => {
      const listener1 = jest.fn();
      const listener2 = jest.fn();
      const errorCatcher = jest.fn(); // To prevent unhandled error

      eventBus.on('status', listener1);
      eventBus.on('cost:update', listener2); // Use a non-error event

      eventBus.removeAllListeners();

      // Add error catcher to prevent unhandled error
      eventBus.on('error', errorCatcher);

      eventBus.emitEvent('status', {});
      eventBus.emitEvent('cost:update', {});

      expect(listener1).not.toHaveBeenCalled();
      expect(listener2).not.toHaveBeenCalled();
    });
  });

  describe('Timestamp accuracy', () => {
    it('should have timestamp close to current time', (done) => {
      const before = Date.now();

      eventBus.on('status', (event: ConclaveEvent) => {
        const after = Date.now();
        expect(event.timestamp).toBeGreaterThanOrEqual(before);
        expect(event.timestamp).toBeLessThanOrEqual(after);
        done();
      });

      eventBus.emitEvent('status', {});
    });
  });

  describe('Concurrent scoped instances', () => {
    it('should not share events between scoped instances', () => {
      const instance1 = EventBus.createInstance();
      const instance2 = EventBus.createInstance();

      const listener1 = jest.fn();
      const listener2 = jest.fn();

      instance1.on('status', listener1);
      instance2.on('status', listener2);

      instance1.emitEvent('status', { from: 'instance1' });

      expect(listener1).toHaveBeenCalledTimes(1);
      expect(listener2).not.toHaveBeenCalled();

      instance2.emitEvent('status', { from: 'instance2' });

      expect(listener1).toHaveBeenCalledTimes(1);
      expect(listener2).toHaveBeenCalledTimes(1);
    });
  });
});
