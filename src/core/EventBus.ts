import { EventEmitter } from 'events';

export type EventType =
  | 'run:start'
  | 'run:complete'
  | 'agent:thinking'
  | 'token'
  | 'agent:response'
  | 'round:start'
  | 'round:complete'
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
  | 'health:check_started'
  | 'health:status_updated'
  | 'cost:gate_triggered';

export interface ConclaveEvent {
  type: EventType;
  payload: any;
  timestamp: number;
}

export class EventBus extends EventEmitter {
  private static instance: EventBus;

  private constructor() {
    super();
  }

  public static getInstance(): EventBus {
    if (!EventBus.instance) {
      EventBus.instance = new EventBus();
    }
    return EventBus.instance;
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
