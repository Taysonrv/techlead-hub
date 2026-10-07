type RateState = {
  lastRequestAt: number;
  queueDepth: number;
  totalRequests: number;
  throttledResponses: number;
  retryAfterUntil: number | null;
};

const DEFAULT_INTERVAL_MS = 6_200;

class MovideskRateLimiter {
  private tail: Promise<void> = Promise.resolve();
  private state: RateState = {
    lastRequestAt: 0,
    queueDepth: 0,
    totalRequests: 0,
    throttledResponses: 0,
    retryAfterUntil: null,
  };

  async acquire() {
    this.state.queueDepth += 1;
    const previous = this.tail;
    let release!: () => void;
    this.tail = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try {
      const now = Date.now();
      const configured = Number(process.env.MOVIDESK_REQUEST_INTERVAL_MS ?? DEFAULT_INTERVAL_MS);
      const interval = Number.isFinite(configured) && configured >= DEFAULT_INTERVAL_MS ? configured : DEFAULT_INTERVAL_MS;
      const retryWait = this.state.retryAfterUntil ? Math.max(0, this.state.retryAfterUntil - now) : 0;
      const rateWait = Math.max(0, this.state.lastRequestAt + interval - now);
      const wait = Math.max(retryWait, rateWait);
      if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
      this.state.lastRequestAt = Date.now();
      this.state.totalRequests += 1;
      if (this.state.retryAfterUntil && this.state.retryAfterUntil <= this.state.lastRequestAt) {
        this.state.retryAfterUntil = null;
      }
    } finally {
      this.state.queueDepth = Math.max(0, this.state.queueDepth - 1);
      release();
    }
  }

  registerThrottle(retryAfterSeconds?: number | null) {
    this.state.throttledResponses += 1;
    if (retryAfterSeconds && Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
      this.state.retryAfterUntil = Math.max(this.state.retryAfterUntil ?? 0, Date.now() + retryAfterSeconds * 1000);
    }
  }

  snapshot() {
    const interval = Number(process.env.MOVIDESK_REQUEST_INTERVAL_MS ?? DEFAULT_INTERVAL_MS);
    const safeInterval = Number.isFinite(interval) && interval >= DEFAULT_INTERVAL_MS ? interval : DEFAULT_INTERVAL_MS;
    return {
      limitPerMinute: 10,
      configuredIntervalMs: safeInterval,
      effectiveMaxPerMinute: Number((60_000 / safeInterval).toFixed(2)),
      queueDepth: this.state.queueDepth,
      totalRequestsSinceStartup: this.state.totalRequests,
      throttledResponsesSinceStartup: this.state.throttledResponses,
      retryAfterUntil: this.state.retryAfterUntil ? new Date(this.state.retryAfterUntil).toISOString() : null,
      lastRequestAt: this.state.lastRequestAt ? new Date(this.state.lastRequestAt).toISOString() : null,
    };
  }
}

export const movideskRateLimiter = new MovideskRateLimiter();
