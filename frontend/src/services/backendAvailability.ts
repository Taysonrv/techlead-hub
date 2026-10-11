type TransportFailure = { status?: number; canceled?: boolean };
type ScheduleRetry = (retry: () => void) => () => void;

/** Confirms connectivity failures before showing a global outage. */
export class BackendAvailability {
  private unavailable = false;
  private responseGeneration = 0;
  private pending: Promise<void> | null = null;
  private cancelRetry: (() => void) | null = null;
  private readonly probe: () => Promise<boolean>;
  private readonly onChange: (unavailable: boolean) => void;
  private readonly scheduleRetry: ScheduleRetry;

  constructor(
    probe: () => Promise<boolean>,
    onChange: (unavailable: boolean) => void,
    scheduleRetry: ScheduleRetry = (retry) => {
      const timer = setTimeout(retry, 10_000);
      return () => clearTimeout(timer);
    },
  ) {
    this.probe = probe;
    this.onChange = onChange;
    this.scheduleRetry = scheduleRetry;
  }

  isUnavailable() { return this.unavailable; }

  reportSuccess() {
    this.responseGeneration++;
    this.cancelRetry?.();
    this.cancelRetry = null;
    this.update(false);
  }

  reportFailure({ status, canceled }: TransportFailure): Promise<void> {
    if (canceled) return Promise.resolve();
    if (status !== undefined && ![502, 503, 504].includes(status)) {
      this.reportSuccess();
      return Promise.resolve();
    }
    return this.check();
  }

  check(): Promise<void> {
    if (this.pending) return this.pending;
    const generation = this.responseGeneration;
    const request = Promise.resolve().then(this.probe).catch(() => false).then((healthy) => {
      // A late failed probe cannot override a more recent API response.
      if (generation === this.responseGeneration) this.update(!healthy);
    }).finally(() => {
      if (this.pending === request) this.pending = null;
      if (this.unavailable && !this.cancelRetry) {
        this.cancelRetry = this.scheduleRetry(() => {
          this.cancelRetry = null;
          void this.check();
        });
      }
    });
    this.pending = request;
    return request;
  }

  private update(unavailable: boolean) {
    if (!unavailable) {
      this.cancelRetry?.();
      this.cancelRetry = null;
    }
    if (this.unavailable === unavailable) return;
    this.unavailable = unavailable;
    this.onChange(unavailable);
  }
}
