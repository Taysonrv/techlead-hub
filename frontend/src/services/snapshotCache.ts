/** Cache shared by analytical screens. Invalidated requests cannot restore old data. */
export class SnapshotCache<T> {
  private cachedAt = 0;
  private rows: T[] | null = null;
  private pending: Promise<T[]> | null = null;
  private generation = 0;
  private lastErrorAt = 0;

  private readonly load: () => Promise<T[]>;
  private readonly now: () => number;
  private readonly ttl: number;
  private readonly staleLimit: number;

  constructor(
    load: () => Promise<T[]>,
    now: () => number = Date.now,
    ttl = 30_000,
    staleLimit = 5 * 60_000,
  ) {
    this.load = load;
    this.now = now;
    this.ttl = ttl;
    this.staleLimit = staleLimit;
  }

  get(): Promise<T[]> {
    if (this.rows && this.now() - this.cachedAt < this.ttl) return Promise.resolve(this.rows);
    if (this.pending) return this.pending;
    const generation = this.generation;
    const request = this.load().then((rows) => {
      if (generation !== this.generation) throw new SnapshotInvalidatedError();
      this.rows = rows;
      this.cachedAt = this.now();
      this.lastErrorAt = 0;
      return rows;
    }).catch((error: unknown) => {
      if (generation !== this.generation) throw new SnapshotInvalidatedError();
      this.lastErrorAt = this.now();
      if (this.rows && this.now() - this.cachedAt < this.staleLimit) return this.rows;
      throw error;
    }).finally(() => {
      if (this.pending === request) this.pending = null;
    });
    this.pending = request;
    return request;
  }

  invalidate() {
    this.generation++;
    this.rows = null;
    this.cachedAt = 0;
    this.lastErrorAt = 0;
    this.pending = null;
  }

  state() {
    return {
      cachedAt: this.cachedAt,
      lastErrorAt: this.lastErrorAt,
      stale: Boolean(this.rows && (this.lastErrorAt || this.now() - this.cachedAt >= this.ttl)),
    };
  }
}

export class SnapshotInvalidatedError extends Error {
  constructor() { super("O snapshot foi invalidado durante a atualização."); }
}
