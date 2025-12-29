import ConsultOrchestrator from '../ConsultOrchestrator';
import { PartialResultManager } from '../../consult/persistence/PartialResultManager';
import { ConsultState } from '../../types/consult';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { rimraf } from 'rimraf';

// Mock PartialResultManager
jest.mock('../../consult/persistence/PartialResultManager');

describe('ConsultOrchestrator Persistence Integration', () => {
  let orchestrator: ConsultOrchestrator;
  
  beforeEach(() => {
    jest.clearAllMocks();
    orchestrator = new ConsultOrchestrator({ verbose: false });
  });

  it('should instantiate PartialResultManager', () => {
    // Verify that partialResultManager is initialized
    expect((orchestrator as any).partialResultManager).toBeDefined();
  });
});
