/**
 * Consult State Machine
 *
 * Manages state transitions for the 4-round consultation engine.
 * Ensures valid state flow and emits events for each transition.
 */

import { EventBus } from '../core/EventBus';
import { ConsultState, StateTransition } from '../types/consult';

export class ConsultStateMachine {
  private currentState: ConsultState;
  private transitions: StateTransition[];
  private eventBus: EventBus;
  private consultationId: string;

  // Define valid state transitions
  private static readonly VALID_TRANSITIONS: Map<ConsultState, ConsultState[]> = new Map([
    // Idle can transition to Estimating or Aborted
    [ConsultState.Idle, [ConsultState.Estimating, ConsultState.Aborted]],

    // Estimating can transition to AwaitingConsent or Aborted
    [ConsultState.Estimating, [ConsultState.AwaitingConsent, ConsultState.Aborted]],

    // AwaitingConsent can transition to Independent or Aborted
    [ConsultState.AwaitingConsent, [ConsultState.Independent, ConsultState.Aborted]],

    // Independent can transition to Synthesis or Aborted
    [ConsultState.Independent, [ConsultState.Synthesis, ConsultState.Aborted]],

    // Synthesis can transition to CrossExam, Complete (early termination), or Aborted
    [ConsultState.Synthesis, [ConsultState.CrossExam, ConsultState.Complete, ConsultState.Aborted]],

    // CrossExam can transition to Verdict, Complete (temporary/early exit), or Aborted
    [ConsultState.CrossExam, [ConsultState.Verdict, ConsultState.Complete, ConsultState.Aborted]],

    // Verdict can transition to Complete or Aborted
    [ConsultState.Verdict, [ConsultState.Complete, ConsultState.Aborted]],

    // Complete and Aborted are terminal states - no transitions allowed
    [ConsultState.Complete, []],
    [ConsultState.Aborted, []]
  ]);

  constructor(consultationId: string) {
    this.consultationId = consultationId;
    this.currentState = ConsultState.Idle;
    this.transitions = [];
    this.eventBus = EventBus.getInstance();
  }

  /**
   * Get the current state
   */
  public getCurrentState(): ConsultState {
    return this.currentState;
  }

  /**
   * Get all state transitions
   */
  public getTransitions(): StateTransition[] {
    return [...this.transitions];
  }

  /**
   * Check if a state transition is valid
   */
  public isValidTransition(to: ConsultState): boolean {
    const allowedStates = ConsultStateMachine.VALID_TRANSITIONS.get(this.currentState);
    if (!allowedStates) {
      return false;
    }
    return allowedStates.includes(to);
  }

  /**
   * Transition to a new state
   * @throws Error if transition is invalid
   */
  public transition(to: ConsultState, reason?: string): void {
    // Validate transition
    if (!this.isValidTransition(to)) {
      throw new Error(
        `Invalid state transition: ${this.currentState} -> ${to}. ` +
        `Valid transitions from ${this.currentState}: ${this.getAllowedTransitions().join(', ')}`
      );
    }

    const from = this.currentState;
    this.currentState = to;

    // Record transition
    const transition: StateTransition = {
      from,
      to,
      timestamp: new Date().toISOString(),
      reason
    };
    this.transitions.push(transition);

    // Emit event
    this.emitStateChange(from, to, reason);
  }

  /**
   * Get list of allowed transitions from current state
   */
  public getAllowedTransitions(): ConsultState[] {
    return ConsultStateMachine.VALID_TRANSITIONS.get(this.currentState) || [];
  }

  /**
   * Check if current state is terminal (Complete or Aborted)
   */
  public isTerminal(): boolean {
    return this.currentState === ConsultState.Complete || this.currentState === ConsultState.Aborted;
  }

  /**
   * Reset to Idle state (for testing or re-initialization)
   */
  public reset(): void {
    this.currentState = ConsultState.Idle;
    this.transitions = [];
    this.emitStateChange(ConsultState.Idle, ConsultState.Idle, 'reset');
  }

  /**
   * Emit state change event via EventBus
   */
  private emitStateChange(from: ConsultState, to: ConsultState, reason?: string): void {
    this.eventBus.emitEvent('consultation:state_change' as any, {
      consultation_id: this.consultationId,
      from_state: from,
      to_state: to,
      reason: reason || null,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Get a human-readable description of the current state
   */
  public getStateDescription(): string {
    const descriptions: Record<ConsultState, string> = {
      [ConsultState.Idle]: 'Ready to start consultation',
      [ConsultState.Estimating]: 'Calculating cost estimate',
      [ConsultState.AwaitingConsent]: 'Waiting for user approval',
      [ConsultState.Independent]: 'Round 1: Independent analysis in progress',
      [ConsultState.Synthesis]: 'Round 2: Synthesizing consensus',
      [ConsultState.CrossExam]: 'Round 3: Cross-examination phase',
      [ConsultState.Verdict]: 'Round 4: Generating final verdict',
      [ConsultState.Complete]: 'Consultation completed successfully',
      [ConsultState.Aborted]: 'Consultation was aborted'
    };

    return descriptions[this.currentState];
  }

  /**
   * Get the consultation phase (1-4) based on current state
   * Returns 0 for non-round states, 1-4 for round states
   */
  public getCurrentRound(): number {
    const roundMap: Record<ConsultState, number> = {
      [ConsultState.Idle]: 0,
      [ConsultState.Estimating]: 0,
      [ConsultState.AwaitingConsent]: 0,
      [ConsultState.Independent]: 1,
      [ConsultState.Synthesis]: 2,
      [ConsultState.CrossExam]: 3,
      [ConsultState.Verdict]: 4,
      [ConsultState.Complete]: 0,
      [ConsultState.Aborted]: 0
    };

    return roundMap[this.currentState];
  }

  /**
   * Check if currently in a debate round state (1-4)
   */
  public isInRound(): boolean {
    return this.getCurrentRound() > 0;
  }

  /**
   * Create a state machine snapshot for logging/persistence
   */
  public toJSON() {
    return {
      consultation_id: this.consultationId,
      current_state: this.currentState,
      current_round: this.getCurrentRound(),
      is_terminal: this.isTerminal(),
      transitions: this.transitions.map(t => ({
        from: t.from,
        to: t.to,
        timestamp: t.timestamp,
        reason: t.reason
      }))
    };
  }

  /**
   * Validate state machine snapshot data
   */
  private static validateSnapshotData(data: unknown): data is {
    consultation_id: string;
    current_state: ConsultState;
    transitions: Array<{ from: ConsultState; to: ConsultState; timestamp: string; reason?: string }>;
  } {
    if (!data || typeof data !== 'object') {
      return false;
    }

    const obj = data as Record<string, unknown>;

    // Validate consultation_id
    if (typeof obj.consultation_id !== 'string' || obj.consultation_id.length === 0) {
      return false;
    }

    // Validate current_state is a valid ConsultState
    if (typeof obj.current_state !== 'string' ||
        !Object.values(ConsultState).includes(obj.current_state as ConsultState)) {
      return false;
    }

    // Validate transitions array
    if (!Array.isArray(obj.transitions)) {
      return false;
    }

    // Validate each transition
    for (const t of obj.transitions) {
      if (!t || typeof t !== 'object') {
        return false;
      }
      const transition = t as Record<string, unknown>;
      if (typeof transition.from !== 'string' ||
          !Object.values(ConsultState).includes(transition.from as ConsultState)) {
        return false;
      }
      if (typeof transition.to !== 'string' ||
          !Object.values(ConsultState).includes(transition.to as ConsultState)) {
        return false;
      }
      if (typeof transition.timestamp !== 'string') {
        return false;
      }
      if (transition.reason !== undefined && typeof transition.reason !== 'string') {
        return false;
      }
    }

    return true;
  }

  /**
   * Restore state machine from a snapshot
   * @throws Error if data is invalid
   */
  public static fromJSON(data: unknown): ConsultStateMachine {
    if (!ConsultStateMachine.validateSnapshotData(data)) {
      throw new Error('Invalid state machine snapshot data');
    }

    const machine = new ConsultStateMachine(data.consultation_id);
    machine.currentState = data.current_state;
    machine.transitions = data.transitions.map((t) => ({
      from: t.from,
      to: t.to,
      timestamp: t.timestamp,
      reason: t.reason
    }));
    return machine;
  }
}
