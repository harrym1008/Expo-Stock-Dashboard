/**
 * Adaptive sliding window async queue rate limiter supporting:
 * - Immediate processing for low traffic (0 extra latency for isolated requests)
 * - Proportional backlog pacing (gradually slows down dispatch speed as queue depth builds up)
 * - Per-second and per-minute sliding window constraints
 */
export class RateLimiter {
  constructor({
    maxPerSecond,
    maxPerMinute,
    backlogDelayPerItem = 50,
    maxBacklogDelay = 1000,
  }) {
    this.maxPerSecond = maxPerSecond;
    this.maxPerMinute = maxPerMinute;
    this.backlogDelayPerItem = backlogDelayPerItem;
    this.maxBacklogDelay = maxBacklogDelay;
    this.queue = [];
    this.secondTimestamps = [];
    this.minuteTimestamps = [];
    this.processing = false;
  }

  /**
   * Schedule an async function through the rate limiter.
   * Returns a promise that resolves when the function executes.
   */
  async schedule(fn) {
    return new Promise((resolve, reject) => {
      this.queue.push({ fn, resolve, reject });
      this.processQueue();
    });
  }

  async processQueue() {
    if (this.processing || this.queue.length === 0) return;
    this.processing = true;
    // Yield to microtask queue so any synchronous batch of schedule() calls is queued
    await Promise.resolve();

    while (this.queue.length > 0) {
      const now = Date.now();

      // Prune sliding window timestamps
      this.secondTimestamps = this.secondTimestamps.filter((t) => now - t < 1000);
      this.minuteTimestamps = this.minuteTimestamps.filter((t) => now - t < 60000);

      const canSendSecond = this.secondTimestamps.length < this.maxPerSecond;
      const canSendMinute = this.minuteTimestamps.length < this.maxPerMinute;

      if (canSendSecond && canSendMinute) {
        const item = this.queue.shift();
        if (item) {
          this.secondTimestamps.push(now);
          this.minuteTimestamps.push(now);

          item
            .fn()
            .then(item.resolve)
            .catch(item.reject);

          // If more requests are waiting in the queue, add adaptive pacing delay.
          // Small queues (0 remaining) don't wait at all (instant execution).
          // As queue builds up, delays increase proportionally to pace requests and form a backlog.
          if (this.queue.length > 0 && this.backlogDelayPerItem > 0) {
            const backlogDelay = Math.min(
              this.maxBacklogDelay,
              this.queue.length * this.backlogDelayPerItem
            );
            await new Promise((r) => setTimeout(r, backlogDelay));
          }
        }
      } else {
        // Calculate optimal wait delay when rate limit thresholds are reached
        let waitTime = 50;
        if (!canSendSecond && this.secondTimestamps.length > 0) {
          const oldestSecond = this.secondTimestamps[0];
          waitTime = Math.max(waitTime, 1000 - (now - oldestSecond) + 15);
        }
        if (!canSendMinute && this.minuteTimestamps.length > 0) {
          const oldestMinute = this.minuteTimestamps[0];
          waitTime = Math.max(waitTime, 60000 - (now - oldestMinute) + 50);
        }

        await new Promise((r) => setTimeout(r, waitTime));
      }
    }

    this.processing = false;
  }

  get queueLength() {
    return this.queue.length;
  }
}

// 1. Finnhub: 60/min, 10/sec (50ms pacing per queued item up to 1000ms)
export const finnhubRateLimiter = new RateLimiter({
  maxPerSecond: 10,
  maxPerMinute: 60,
  backlogDelayPerItem: 50,
  maxBacklogDelay: 1000,
});

// 2. Yahoo Finance: 100/min, 10/sec (40ms pacing per queued item up to 800ms)
export const yahooRateLimiter = new RateLimiter({
  maxPerSecond: 10,
  maxPerMinute: 100,
  backlogDelayPerItem: 40,
  maxBacklogDelay: 800,
});
