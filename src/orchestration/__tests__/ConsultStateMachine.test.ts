/**
 * Unit Tests for ConsultStateMachine
 */

import { ConsultStateMachine } from '../ConsultStateMachine';
import { ConsultState } from '../../types/consult';

describe('ConsultStateMachine', () => {
  let machine: ConsultStateMachine;

  beforeEach(() => {
    machine = new ConsultStateMachine('test-consultation-123');
  });

  describe('Initialization', () => {
    it('should start in Idle state', () => {
      expect(machine.getCurrentState()).toBe(ConsultState.Idle);
    });

    it('should have no transitions initially', () => {
      expect(machine.getTransitions()).toHaveLength(0);
    });

    it('should not be in terminal state initially', () => {
      expect(machine.isTerminal()).toBe(false);
    });

    it('should not be in a round initially', () => {
      expect(machine.isInRound()).toBe(false);
    });
  });

  describe('Valid State Transitions', () => {
    it('should transition from Idle to Estimating', () => {
      machine.transition(ConsultState.Estimating);
      expect(machine.getCurrentState()).toBe(ConsultState.Estimating);
      expect(machine.getTransitions()).toHaveLength(1);
    });

    it('should transition through full workflow: Idle → Estimating → AwaitingConsent → Independent → Synthesis → CrossExam → Verdict → Complete', () => {
      machine.transition(ConsultState.Estimating);
      machine.transition(ConsultState.AwaitingConsent);
      machine.transition(ConsultState.Independent);
      machine.transition(ConsultState.Synthesis);
      machine.transition(ConsultState.CrossExam);
      machine.transition(ConsultState.Verdict);
      machine.transition(ConsultState.Complete);

      expect(machine.getCurrentState()).toBe(ConsultState.Complete);
      expect(machine.getTransitions()).toHaveLength(7);
      expect(machine.isTerminal()).toBe(true);
    });

    it('should support early termination: Synthesis → Complete', () => {
      machine.transition(ConsultState.Estimating);
      machine.transition(ConsultState.AwaitingConsent);
      machine.transition(ConsultState.Independent);
      machine.transition(ConsultState.Synthesis);
      machine.transition(ConsultState.Complete, 'early_termination_high_confidence');

      expect(machine.getCurrentState()).toBe(ConsultState.Complete);
      expect(machine.isTerminal()).toBe(true);
    });

    it('should allow abort from any non-terminal state', () => {
      machine.transition(ConsultState.Estimating);
      machine.transition(ConsultState.AwaitingConsent);
      machine.transition(ConsultState.Aborted, 'user_cancelled');

      expect(machine.getCurrentState()).toBe(ConsultState.Aborted);
      expect(machine.isTerminal()).toBe(true);
    });
  });

  describe('Invalid State Transitions', () => {
    it('should throw error for invalid transition: Idle → Synthesis', () => {
      expect(() => {
        machine.transition(ConsultState.Synthesis);
      }).toThrow('Invalid state transition: idle -> synthesis');
    });

    it('should throw error for invalid transition: Estimating → Verdict', () => {
      machine.transition(ConsultState.Estimating);
      expect(() => {
        machine.transition(ConsultState.Verdict);
      }).toThrow('Invalid state transition: estimating -> verdict');
    });

    it('should throw error for transition from terminal state (Complete)', () => {
      machine.transition(ConsultState.Estimating);
      machine.transition(ConsultState.AwaitingConsent);
      machine.transition(ConsultState.Independent);
      machine.transition(ConsultState.Synthesis);
      machine.transition(ConsultState.CrossExam);
      machine.transition(ConsultState.Verdict);
      machine.transition(ConsultState.Complete);

      expect(() => {
        machine.transition(ConsultState.Idle);
      }).toThrow('Invalid state transition: complete');
    });

    it('should throw error for transition from terminal state (Aborted)', () => {
      machine.transition(ConsultState.Estimating);
      machine.transition(ConsultState.Aborted);

      expect(() => {
        machine.transition(ConsultState.Estimating);
      }).toThrow('Invalid state transition: aborted');
    });
  });

  describe('State Validation', () => {
    it('should correctly identify valid transitions', () => {
      expect(machine.isValidTransition(ConsultState.Estimating)).toBe(true);
      expect(machine.isValidTransition(ConsultState.Aborted)).toBe(true);
      expect(machine.isValidTransition(ConsultState.Synthesis)).toBe(false);
    });

    it('should return correct allowed transitions for each state', () => {
      expect(machine.getAllowedTransitions()).toEqual([
        ConsultState.Estimating,
        ConsultState.Aborted
      ]);

      machine.transition(ConsultState.Estimating);
      expect(machine.getAllowedTransitions()).toEqual([
        ConsultState.AwaitingConsent,
        ConsultState.Aborted
      ]);
    });
  });

  describe('Round Tracking', () => {
    it('should return correct round number for each state', () => {
      expect(machine.getCurrentRound()).toBe(0); // Idle

      machine.transition(ConsultState.Estimating);
      expect(machine.getCurrentRound()).toBe(0);

      machine.transition(ConsultState.AwaitingConsent);
      expect(machine.getCurrentRound()).toBe(0);

      machine.transition(ConsultState.Independent);
      expect(machine.getCurrentRound()).toBe(1);

      machine.transition(ConsultState.Synthesis);
      expect(machine.getCurrentRound()).toBe(2);

      machine.transition(ConsultState.CrossExam);
      expect(machine.getCurrentRound()).toBe(3);

      machine.transition(ConsultState.Verdict);
      expect(machine.getCurrentRound()).toBe(4);

      machine.transition(ConsultState.Complete);
      expect(machine.getCurrentRound()).toBe(0);
    });

    it('should correctly identify if in round state', () => {
      expect(machine.isInRound()).toBe(false);

      machine.transition(ConsultState.Estimating);
      expect(machine.isInRound()).toBe(false);

      machine.transition(ConsultState.AwaitingConsent);
      machine.transition(ConsultState.Independent);
      expect(machine.isInRound()).toBe(true);

      machine.transition(ConsultState.Synthesis);
      expect(machine.isInRound()).toBe(true);
    });
  });

  describe('State Description', () => {
    it('should provide human-readable descriptions', () => {
      expect(machine.getStateDescription()).toBe('Ready to start consultation');

      machine.transition(ConsultState.Estimating);
      expect(machine.getStateDescription()).toBe('Calculating cost estimate');

      machine.transition(ConsultState.AwaitingConsent);
      expect(machine.getStateDescription()).toBe('Waiting for user approval');
    });
  });

  describe('Serialization', () => {
    it('should serialize to JSON', () => {
      machine.transition(ConsultState.Estimating);
      machine.transition(ConsultState.AwaitingConsent);

      const json = machine.toJSON();

      expect(json.consultation_id).toBe('test-consultation-123');
      expect(json.current_state).toBe(ConsultState.AwaitingConsent);
      expect(json.current_round).toBe(0);
      expect(json.is_terminal).toBe(false);
      expect(json.transitions).toHaveLength(2);
    });

    it('should deserialize from JSON', () => {
      machine.transition(ConsultState.Estimating);
      machine.transition(ConsultState.AwaitingConsent);

      const json = machine.toJSON();
      const restored = ConsultStateMachine.fromJSON(json);

      expect(restored.getCurrentState()).toBe(machine.getCurrentState());
      expect(restored.getTransitions()).toHaveLength(2);
    });
  });

  describe('Reset', () => {
    it('should reset to Idle state', () => {
      machine.transition(ConsultState.Estimating);
      machine.transition(ConsultState.AwaitingConsent);
      machine.reset();

      expect(machine.getCurrentState()).toBe(ConsultState.Idle);
      expect(machine.getTransitions()).toHaveLength(0);
    });
  });
});
