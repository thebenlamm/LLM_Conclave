import { EventEmitter } from 'events';

export type EventType =
  | 'run:start'
  | 'run:complete'
  | 'agent:thinking'
  | 'token'
  | 'agent:response'
  | 'round:start'
  | 'round:complete'
  | 'round:completed'
  | 'status'
  | 'error'
  | 'cost:update'
  | 'tool:call'
  | 'tool:result'
  // Consult Mode Events (4-Round Consultation Engine)
  | 'consultation:started'
  | 'consultation:cost_estimated'
  | 'consultation:user_consent'
  | 'consultation:round_artifact'
  | 'consultation:provider_substituted'
  | 'consultation:completed'
  | 'consultation:state_change'
  | 'consultation:pulse_cancel'
  | 'agent:completed'
  | 'health:check_started'
  | 'health:status_updated'
  | 'cost:gate_triggered'
  // Dynamic Speaker Selection Events
  | 'speaker:selected'
  | 'speaker:handoff';

export interface ConclaveEvent {
  type: EventType;
  payload: any;
  timestamp: number;
}

export class EventBus extends EventEmitter {
  private static instance: EventBus;

  /**
   * Constructor is public to allow creating scoped instances.
   * Use getInstance() for the global singleton (CLI use).
   * Use createInstance() or new EventBus() for scoped instances (MCP/concurrent use).
   */
  constructor() {
    super();
    // Prevent Node.js ERR_UNHANDLED_ERROR crashes.
    // EventEmitter throws if 'error' events have no listeners.
    // Components may or may not register their own error handlers,
    // so this default ensures we never crash from unhandled errors.
    this.on('error', () => {});
  }

  /**
   * Get the global singleton instance.
   * Use this for CLI commands where only one session runs at a time.
   * For concurrent requests (MCP server), use createInstance() instead.
   */
  public static getInstance(): EventBus {
    if (!EventBus.instance) {
      EventBus.instance = new EventBus();
    }
    return EventBus.instance;
  }

  /**
   * Create a new scoped EventBus instance.
   * Use this for concurrent requests (MCP server) to avoid event cross-talk.
   */
  public static createInstance(): EventBus {
    return new EventBus();
  }

  public emitEvent(type: EventType, payload: any) {
    const event: ConclaveEvent = {
      type,
      payload,
      timestamp: Date.now()
    };
    this.emit(type, event);
    // Also emit a generic 'event' for catch-all listeners (like WebSockets)
    this.emit('event', event);
  }
}
