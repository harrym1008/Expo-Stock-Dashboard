// Async queue rate limiter with linear 429 backoff
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

    // Pending jobs and sliding-window timestamps
    this.queue = [];
    this.secondTimestamps = [];
    this.minuteTimestamps = [];
    this.processing = false;

    // A successful response resets the next 429 to a 5-second cooldown
    this.cooldownUntil = 0;
    this.consecutive429Count = 0;
  }

  // Queues a job... resolves when it actually runs
  async schedule(fn) {
    return new Promise((resolve, reject) => {
      this.queue.push({ fn, resolve, reject });
      this.processQueue();
    });
  }

  // Marks a 429 and pauses new dispatches for 5s per consecutive response
  handle429(_retryAfterSeconds = null) {
    this.consecutive429Count += 1;
    const backoffMs = this.consecutive429Count * 5000;
    this.cooldownUntil = Math.max(this.cooldownUntil, Date.now() + backoffMs);
    return backoffMs;
  }

  // Marks a successful response and resets the 429 backoff
  notifySuccess() {
    this.consecutive429Count = 0;
  }

  // Drain the queue respecting per-second/per-minute windows + cooldowns
  async processQueue() {
    if (this.processing || this.queue.length === 0) return;
    this.processing = true;

    // Yield so a synchronous batch of schedule() calls all queue first
    await Promise.resolve();

    while (this.queue.length > 0) {
      const now = Date.now();

      // If in active cooldown from 429, pause processing
      if (this.cooldownUntil > now) {
        const sleepMs = this.cooldownUntil - now;
        await new Promise((r) => setTimeout(r, sleepMs));
        continue;
      }

      // Prune sliding window timestamps
      const currentNow = Date.now();
      this.secondTimestamps = this.secondTimestamps.filter((t) => currentNow - t < 1000);
      this.minuteTimestamps = this.minuteTimestamps.filter((t) => currentNow - t < 60000);

      // Wait until both windows have room
      const canSendSecond = this.secondTimestamps.length < this.maxPerSecond;
      const canSendMinute = this.minuteTimestamps.length < this.maxPerMinute;

      if (canSendSecond && canSendMinute) {
        const item = this.queue.shift();
        if (item) {
          const dispatchTime = Date.now();
          this.secondTimestamps.push(dispatchTime);
          this.minuteTimestamps.push(dispatchTime);

          Promise.resolve()
            .then(item.fn)
            .then(item.resolve)
            .catch(item.reject);

          const pacingDelay = this.queue.length > 0
            ? Math.min(this.maxBacklogDelay, this.backlogDelayPerItem)
            : 0;

          if (pacingDelay > 0) {
            await new Promise((r) => setTimeout(r, pacingDelay));
          }
        }
      } else {
        // Calculate optimal wait delay when rate limit thresholds are reached
        let waitTime = 50;
        if (!canSendSecond && this.secondTimestamps.length > 0) {
          const oldestSecond = this.secondTimestamps[0];
          waitTime = Math.max(waitTime, 1000 - (currentNow - oldestSecond) + 15);
        }
        if (!canSendMinute && this.minuteTimestamps.length > 0) {
          const oldestMinute = this.minuteTimestamps[0];
          waitTime = Math.max(waitTime, 60000 - (currentNow - oldestMinute) + 50);
        }

        await new Promise((r) => setTimeout(r, waitTime));
      }
    }

    this.processing = false;
  }
}


// Finnhub: 60/min, 8/sec
export const finnhubRateLimiter = new RateLimiter({
  maxPerSecond: 8,
  maxPerMinute: 60,
  backlogDelayPerItem: 50,
  maxBacklogDelay: 1000,
});

// Yahoo Finance: 360/min, 20/sec
export const yahooRateLimiter = new RateLimiter({
  maxPerSecond: 20,
  maxPerMinute: 360,
  backlogDelayPerItem: 15,
  maxBacklogDelay: 300,
});
