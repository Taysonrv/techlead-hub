import {
  NextFunction,
  Request,
  Response,
} from "express";

type RateLimitOptions = {
  windowMs: number;
  maxAttempts: number;
  message: string;
};

type Attempt = {
  count: number;
  expiresAt: number;
};

export function createRateLimitMiddleware({
  windowMs,
  maxAttempts,
  message,
}: RateLimitOptions) {
  const attempts =
    new Map<string, Attempt>();

  const cleanup =
    setInterval(() => {
      const now = Date.now();

      for (const [key, attempt] of attempts) {
        if (attempt.expiresAt <= now) {
          attempts.delete(key);
        }
      }
    }, Math.min(windowMs, 60_000));

  cleanup.unref();

  return (
    request: Request,
    response: Response,
    next: NextFunction
  ) => {
    const now = Date.now();
    const key =
      request.ip ||
      request.socket.remoteAddress ||
      "local";
    const current = attempts.get(key);

    if (!current || current.expiresAt <= now) {
      attempts.set(key, {
        count: 1,
        expiresAt: now + windowMs,
      });

      next();
      return;
    }

    if (current.count >= maxAttempts) {
      const retryAfterSeconds =
        Math.max(
          1,
          Math.ceil(
            (current.expiresAt - now) /
              1_000
          )
        );

      response.setHeader(
        "Retry-After",
        retryAfterSeconds.toString()
      );

      response.status(429).json({
        message,
      });
      return;
    }

    current.count += 1;
    next();
  };
}
