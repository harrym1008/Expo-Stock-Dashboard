/**
 * Sliding window async queue rate limiter supporting both per-second and per-minute constraints.
 */
export class RateLimiter {
  constructor({ maxPerSecond, maxPerMinute }) {
    this.maxPerSecond = maxPerSecond;
    this.maxPerMinute = maxPerMinute;
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
        }
      } else {
        // Calculate optimal wait delay
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
}

// 1. Finnhub: 60/min, 10/sec
export const finnhubRateLimiter = new RateLimiter({
  maxPerSecond: 10,
  maxPerMinute: 60,
});

// 2. Yahoo Finance: 100/min, 10/sec
export const yahooRateLimiter = new RateLimiter({
  maxPerSecond: 10,
  maxPerMinute: 100,
});
