import { RateLimiter } from '../src/utils/rateLimiter';

describe('Async Rate Limiter', () => {
  test('executes scheduled asynchronous tasks in FIFO order', async () => {
    // Schedule two asynchronous tasks and verify they execute in the order they were scheduled
    const limiter = new RateLimiter({
      maxPerSecond: 10,
      maxPerMinute: 60,
    });
    const executionLog = [];
    const task1 = limiter.schedule(async () => {
      executionLog.push('task1');
      return 1;
    });
    const task2 = limiter.schedule(async () => {
      executionLog.push('task2');
      return 2;
    });

    const results = await Promise.all([task1, task2]);

    expect(results).toEqual([1, 2]);
    expect(executionLog).toEqual(['task1', 'task2']);
  });

  test('applies exponential backoff on HTTP 429 responses and resets on success', () => {
    const limiter = new RateLimiter({
      maxPerSecond: 5,
      maxPerMinute: 30,
    });

    expect(limiter.consecutive429Count).toBe(0);

    const backoff1 = limiter.handle429();   // Simulate first 429 response
    expect(limiter.consecutive429Count).toBe(1);
    expect(backoff1).toBe(5000);

    const backoff2 = limiter.handle429();   // Simulate second consecutive 429 response
    expect(limiter.consecutive429Count).toBe(2);
    expect(backoff2).toBe(10000);

    limiter.notifySuccess();                // Simulate a successful request to reset the backoff
    expect(limiter.consecutive429Count).toBe(0);  
  });
});
