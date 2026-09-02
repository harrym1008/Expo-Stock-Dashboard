/**
 * Adaptive sliding window async queue rate limiter supporting:
 * - Immediate processing for low traffic (0 extra latency for isolated requests)
 * - Proportional backlog pacing (gradually slows down dispatch speed as queue depth builds up)
 * - Per-second and per-minute sliding window constraints
 * - Adaptive ease-off and exponential backoff when HTTP 429 Too Many Requests responses are encountered
 * - Queue freeze during cooldown and throttled pacing during recovery
 */
export class RateLimiter {
  constructor({
    maxPerSecond,
    maxPerMinute,
    backlogDelayPerItem = 50,
    maxBacklogDelay = 1000,
    baseBackoffMs = 2000,
    maxBackoffMs = 30000,
    easeOffThrottleRatio = 0.35,
    easeOffMinSpacingMs = 150,
    recoverySuccessThreshold = 5,
  }) {
    this.maxPerSecond = maxPerSecond;
    this.maxPerMinute = maxPerMinute;
    this.backlogDelayPerItem = backlogDelayPerItem;
    this.maxBacklogDelay = maxBacklogDelay;
    this.baseBackoffMs = baseBackoffMs;
    this.maxBackoffMs = maxBackoffMs;
    this.easeOffThrottleRatio = easeOffThrottleRatio;
    this.easeOffMinSpacingMs = easeOffMinSpacingMs;
    this.recoverySuccessThreshold = recoverySuccessThreshold;

    this.queue = [];
    this.secondTimestamps = [];
    this.minuteTimestamps = [];
    this.processing = false;

    // 429 ease-off state
    this.cooldownUntil = 0;
    this.consecutive429Count = 0;
    this.last429Timestamp = 0;
    this.isEasedOff = false;
    this.successCountSince429 = 0;
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

  /**
   * Report an HTTP 429 (Too Many Requests).
   * Freezes queue dispatch, calculates exponential/header backoff, and enters ease-off mode.
   * Debounces near-simultaneous 429 bursts (< 2s) so parallel in-flight requests don't cascade backoff tiers.
   * @param {number|null} retryAfterSeconds Optional retry-after duration from response header
   * @returns {number} Backoff delay in milliseconds
   */
  handle429(retryAfterSeconds = null) {
    const now = Date.now();

    // Debounce: only bump consecutive strike if last 429 was over 2 seconds ago
    if (now - this.last429Timestamp > 2000) {
      this.consecutive429Count++;
    }
    this.last429Timestamp = now;

    let backoffMs;
    if (typeof retryAfterSeconds === 'number' && retryAfterSeconds > 0) {
      backoffMs = Math.max(retryAfterSeconds * 1000, 1000);
    } else {
      // Exponential backoff: baseBackoffMs * 2^(strike - 1) + random jitter (0-500ms)
      const exponent = Math.max(0, this.consecutive429Count - 1);
      const rawBackoff = this.baseBackoffMs * Math.pow(2, exponent);
      const jitter = Math.floor(Math.random() * 500);
      backoffMs = Math.min(this.maxBackoffMs, rawBackoff + jitter);
    }

    this.cooldownUntil = Math.max(this.cooldownUntil, now + backoffMs);
    this.isEasedOff = true;
    this.successCountSince429 = 0;

    console.warn(
      `[RateLimiter] ⚠️ 429 Too Many Requests detected! Easing off for ${Math.round(backoffMs)}ms (strike ${this.consecutive429Count}, queue depth: ${this.queue.length}).`
    );

    return backoffMs;
  }

  /**
   * Report a successful request (HTTP 200).
   * Gradually recovers from ease-off mode once enough consecutive successes occur.
   */
  notifySuccess() {
    if (!this.isEasedOff && this.consecutive429Count === 0) return;

    this.successCountSince429++;
    if (this.successCountSince429 >= this.recoverySuccessThreshold) {
      this.isEasedOff = false;
      this.consecutive429Count = 0;
      this.successCountSince429 = 0;
      console.log(`[RateLimiter] ✅ Rate limit ease-off recovered. Resumed normal operational limits.`);
    }
  }

  getStatus() {
    const now = Date.now();
    return {
      queueLength: this.queue.length,
      isEasedOff: this.isEasedOff,
      consecutive429Count: this.consecutive429Count,
      inCooldown: now < this.cooldownUntil,
      cooldownRemainingMs: Math.max(0, this.cooldownUntil - now),
    };
  }

  async processQueue() {
    if (this.processing || this.queue.length === 0) return;
    this.processing = true;
    // Yield to microtask queue so any synchronous batch of schedule() calls is queued
    await Promise.resolve();

    while (this.queue.length > 0) {
      const now = Date.now();

      // 1. If in active cooldown from 429, pause processing
      if (this.cooldownUntil > now) {
        const sleepMs = this.cooldownUntil - now;
        await new Promise((r) => setTimeout(r, sleepMs));
        continue;
      }

      // 2. Prune sliding window timestamps
      const currentNow = Date.now();
      this.secondTimestamps = this.secondTimestamps.filter((t) => currentNow - t < 1000);
      this.minuteTimestamps = this.minuteTimestamps.filter((t) => currentNow - t < 60000);

      // 3. Determine active rate limits (throttled when in ease-off mode)
      const allowedPerSecond = this.isEasedOff
        ? Math.max(2, Math.floor(this.maxPerSecond * this.easeOffThrottleRatio))
        : this.maxPerSecond;
      const allowedPerMinute = this.isEasedOff
        ? Math.max(30, Math.floor(this.maxPerMinute * this.easeOffThrottleRatio))
        : this.maxPerMinute;

      const canSendSecond = this.secondTimestamps.length < allowedPerSecond;
      const canSendMinute = this.minuteTimestamps.length < allowedPerMinute;

      if (canSendSecond && canSendMinute) {
        const item = this.queue.shift();
        if (item) {
          const dispatchTime = Date.now();
          this.secondTimestamps.push(dispatchTime);
          this.minuteTimestamps.push(dispatchTime);

          item
            .fn()
            .then(item.resolve)
            .catch(item.reject);

          // 4. Calculate pacing delay
          let pacingDelay = 0;
          if (this.isEasedOff) {
            // In ease-off mode, enforce minimum spacing between requests to be gentle on the server
            pacingDelay = this.easeOffMinSpacingMs;
          } else if (this.queue.length > 0 && this.backlogDelayPerItem > 0) {
            pacingDelay = Math.min(
              this.maxBacklogDelay,
              this.queue.length * this.backlogDelayPerItem
            );
          }

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

// 2. Yahoo Finance: Increased to 360/min, 30/sec (15ms pacing per queued item up to 300ms) with 429 ease-off backoff
export const yahooRateLimiter = new RateLimiter({
  maxPerSecond: 30,
  maxPerMinute: 360,
  backlogDelayPerItem: 15,
  maxBacklogDelay: 300,
  baseBackoffMs: 2000,
  maxBackoffMs: 30000,
  easeOffThrottleRatio: 0.35,
  easeOffMinSpacingMs: 150,
  recoverySuccessThreshold: 5,
});
