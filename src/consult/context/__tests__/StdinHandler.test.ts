import { StdinHandler } from '../StdinHandler';
import { Readable } from 'stream';

describe('StdinHandler', () => {
  afterEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  describe('detectStdin', () => {
    it('returns false when stdin is TTY', () => {
      const mockStdin = new Readable() as NodeJS.ReadStream;
      mockStdin.isTTY = true;
      
      const handler = new StdinHandler(10000, mockStdin);
      expect(handler.detectStdin()).toBe(false);
    });

    it('returns true when stdin is piped (not TTY)', () => {
      const mockStdin = new Readable() as NodeJS.ReadStream;
      mockStdin.isTTY = false;
      
      const handler = new StdinHandler(10000, mockStdin);
      expect(handler.detectStdin()).toBe(true);
    });
  });

  describe('readStdin', () => {
    it('returns empty result when no stdin detected', async () => {
      const mockStdin = new Readable() as NodeJS.ReadStream;
      mockStdin.isTTY = true;
      
      const handler = new StdinHandler(10000, mockStdin);
      const result = await handler.readStdin();
      expect(result.hasStdin).toBe(false);
      expect(result.content).toBe('');
      expect(result.tokenEstimate).toBe(0);
    });

    it('reads piped content successfully', async () => {
      const mockStdin = new Readable() as NodeJS.ReadStream;
      mockStdin.isTTY = false;
      mockStdin._read = () => {}; // No-op
      
      const handler = new StdinHandler(10000, mockStdin);
      const readPromise = handler.readStdin();

      // Emit data
      mockStdin.emit('readable');
      mockStdin.push('test content');
      mockStdin.push(null); // End of stream

      const result = await readPromise;
      expect(result.hasStdin).toBe(true);
      expect(result.content).toBe('test content');
      expect(result.tokenEstimate).toBe(3);
    });

    it('times out when stream hangs', async () => {
      jest.useFakeTimers();
      
      const mockStdin = new Readable() as NodeJS.ReadStream;
      mockStdin.isTTY = false;
      mockStdin._read = () => {};
      mockStdin.destroy = jest.fn();

      const handler = new StdinHandler(100, mockStdin);
      const readPromise = handler.readStdin();

      // Fast forward time
      jest.advanceTimersByTime(101);

      // The handler catches the error and returns empty result
      const result = await readPromise;
      expect(result.hasStdin).toBe(false);
      expect(result.content).toBe('');
      // Should have called destroy
      expect(mockStdin.destroy).toHaveBeenCalled();
    });
  });

  describe('formatStdinContext', () => {
    it('formats content with header', () => {
      const handler = new StdinHandler();
      const result = handler.formatStdinContext('test content');
      expect(result).toContain('### Stdin Input');
      expect(result).toContain('test content');
    });

    it('returns empty string for empty content', () => {
      const handler = new StdinHandler();
      expect(handler.formatStdinContext('')).toBe('');
      expect(handler.formatStdinContext('   ')).toBe('');
    });
  });
});