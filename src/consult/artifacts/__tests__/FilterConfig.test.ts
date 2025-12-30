import { FilterConfig } from '../FilterConfig';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Mock fs and os
jest.mock('fs');
jest.mock('os');
jest.mock('path');

describe('FilterConfig', () => {
  let filterConfig: FilterConfig;
  const mockHomeDir = '/mock/home';

  beforeEach(() => {
    jest.resetAllMocks();
    (os.homedir as jest.Mock).mockReturnValue(mockHomeDir);
    (path.join as jest.Mock).mockImplementation((...args) => args.join('/'));
  });

  it('should use default limits when no config file exists', () => {
    (fs.existsSync as jest.Mock).mockReturnValue(false);

    filterConfig = new FilterConfig();
    
    expect(filterConfig.getRound3Limits()).toEqual({
      consensus_points: 3,
      tensions: 2
    });
    expect(filterConfig.getRound4Limits()).toEqual({
      consensus_points: 3,
      tensions: 2,
      challenges: 5,
      rebuttals: 5
    });
  });

  it('should override limits from config file', () => {
    (fs.existsSync as jest.Mock).mockReturnValue(true);
    const mockConfig = {
      filtering: {
        round3: { consensus_points: 10, tensions: 5 },
        round4: { consensus_points: 8, tensions: 4, challenges: 10, rebuttals: 10 }
      }
    };
    (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(mockConfig));

    filterConfig = new FilterConfig();

    expect(filterConfig.getRound3Limits()).toEqual({
      consensus_points: 10,
      tensions: 5
    });
    expect(filterConfig.getRound4Limits()).toEqual({
      consensus_points: 8,
      tensions: 4,
      challenges: 10,
      rebuttals: 10
    });
  });

  it('should merge partial config with defaults', () => {
    (fs.existsSync as jest.Mock).mockReturnValue(true);
    const mockConfig = {
      filtering: {
        round3: { consensus_points: 10 } // Missing tensions
        // Missing round4 entirely
      }
    };
    (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(mockConfig));

    filterConfig = new FilterConfig();

    expect(filterConfig.getRound3Limits()).toEqual({
      consensus_points: 10,
      tensions: 2 // Default
    });
    expect(filterConfig.getRound4Limits()).toEqual({
      consensus_points: 3,
      tensions: 2,
      challenges: 5,
      rebuttals: 5
    }); // All Defaults
  });

  it('should handle malformed config file gracefully', () => {
    (fs.existsSync as jest.Mock).mockReturnValue(true);
    (fs.readFileSync as jest.Mock).mockReturnValue('{ invalid json }');
    const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    filterConfig = new FilterConfig();

    expect(filterConfig.getRound3Limits()).toEqual({
      consensus_points: 3,
      tensions: 2
    });
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});
