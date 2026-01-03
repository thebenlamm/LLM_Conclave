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

  describe('Security: Stdin Size Limits', () => {
    it('rejects stdin exceeding maxStdinBytes limit', async () => {
      const mockStdin = new Readable() as NodeJS.ReadStream;
      mockStdin.isTTY = false;
      mockStdin._read = () => {};
      mockStdin.destroy = jest.fn();

      // 100 byte limit for testing
      const handler = new StdinHandler(10000, mockStdin, 100);
      const readPromise = handler.readStdin();

      // Send data exceeding 100 bytes
      const largeChunk = Buffer.alloc(150, 'x');
      mockStdin.emit('data', largeChunk);

      const result = await readPromise;
      // Should return empty result due to error being caught
      expect(result.hasStdin).toBe(false);
      expect(result.content).toBe('');
      expect(mockStdin.destroy).toHaveBeenCalled();
    });

    it('allows stdin within limit', async () => {
      const mockStdin = new Readable() as NodeJS.ReadStream;
      mockStdin.isTTY = false;
      mockStdin._read = () => {};

      // 100 byte limit
      const handler = new StdinHandler(10000, mockStdin, 100);
      const readPromise = handler.readStdin();

      // Send data within limit
      mockStdin.emit('data', Buffer.from('small content'));
      mockStdin.emit('end');

      const result = await readPromise;
      expect(result.hasStdin).toBe(true);
      expect(result.content).toBe('small content');
    });

    it('rejects when cumulative data exceeds limit', async () => {
      const mockStdin = new Readable() as NodeJS.ReadStream;
      mockStdin.isTTY = false;
      mockStdin._read = () => {};
      mockStdin.destroy = jest.fn();

      // 100 byte limit
      const handler = new StdinHandler(10000, mockStdin, 100);
      const readPromise = handler.readStdin();

      // Send multiple small chunks that together exceed limit
      mockStdin.emit('data', Buffer.alloc(40, 'a'));
      mockStdin.emit('data', Buffer.alloc(40, 'b'));
      mockStdin.emit('data', Buffer.alloc(40, 'c')); // This pushes over 100

      const result = await readPromise;
      expect(result.hasStdin).toBe(false);
      expect(mockStdin.destroy).toHaveBeenCalled();
    });

    it('includes size limit in error message', async () => {
      const mockStdin = new Readable() as NodeJS.ReadStream;
      mockStdin.isTTY = false;
      mockStdin._read = () => {};
      mockStdin.destroy = jest.fn();

      // Spy on console.error to check error message
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      // 1024 bytes = 1KB
      const handler = new StdinHandler(10000, mockStdin, 1024);
      const readPromise = handler.readStdin();

      mockStdin.emit('data', Buffer.alloc(2000, 'x'));

      await readPromise;
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('1KB limit')
      );
      consoleSpy.mockRestore();
    });

    it('handles string chunks by converting to Buffer', async () => {
      const mockStdin = new Readable() as NodeJS.ReadStream;
      mockStdin.isTTY = false;
      mockStdin._read = () => {};

      const handler = new StdinHandler(10000, mockStdin, 1024);
      const readPromise = handler.readStdin();

      // Emit string instead of Buffer
      mockStdin.emit('data', 'string content');
      mockStdin.emit('end');

      const result = await readPromise;
      expect(result.hasStdin).toBe(true);
      expect(result.content).toBe('string content');
    });
  });

  describe('Security: Race Condition Prevention', () => {
    it('prevents double resolution on close after end', async () => {
      const mockStdin = new Readable() as NodeJS.ReadStream;
      mockStdin.isTTY = false;
      mockStdin._read = () => {};

      const handler = new StdinHandler(10000, mockStdin, 1024);
      const readPromise = handler.readStdin();

      // Emit both end and close
      mockStdin.emit('data', Buffer.from('content'));
      mockStdin.emit('end');
      mockStdin.emit('close'); // Should be ignored due to settled flag

      const result = await readPromise;
      expect(result.hasStdin).toBe(true);
      expect(result.content).toBe('content');
    });

    it('cleans up listeners after completion', async () => {
      const mockStdin = new Readable() as NodeJS.ReadStream;
      mockStdin.isTTY = false;
      mockStdin._read = () => {};
      const removeSpy = jest.spyOn(mockStdin, 'removeListener');

      const handler = new StdinHandler(10000, mockStdin, 1024);
      const readPromise = handler.readStdin();

      mockStdin.emit('data', Buffer.from('test'));
      mockStdin.emit('end');

      await readPromise;

      // Verify all listeners were removed
      expect(removeSpy).toHaveBeenCalledWith('data', expect.any(Function));
      expect(removeSpy).toHaveBeenCalledWith('end', expect.any(Function));
      expect(removeSpy).toHaveBeenCalledWith('close', expect.any(Function));
      expect(removeSpy).toHaveBeenCalledWith('error', expect.any(Function));
    });
  });
});