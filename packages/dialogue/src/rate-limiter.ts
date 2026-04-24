export interface RateLimiter {
  schedule<T>(task: () => Promise<T>): Promise<T>;
}

export interface RateLimiterOptions {
  readonly minIntervalMs?: number;
  readonly maxQueueSize?: number;
}

const DEFAULT_MIN_INTERVAL_MS = 250;
const DEFAULT_QUEUE_SIZE = 32;

export function createRateLimiter(options: RateLimiterOptions = {}): RateLimiter {
  const minInterval = Math.max(options.minIntervalMs ?? DEFAULT_MIN_INTERVAL_MS, 0);
  const maxQueue = Math.max(options.maxQueueSize ?? DEFAULT_QUEUE_SIZE, 1);

  const queue: Array<{
    readonly task: () => Promise<unknown>;
    readonly resolve: (value: unknown) => void;
    readonly reject: (reason?: unknown) => void;
  }> = [];

  let isProcessing = false;

  const processNext = () => {
    if (isProcessing) {
      return;
    }

    const next = queue.shift();

    if (!next) {
      return;
    }

    isProcessing = true;

    const runTask = async () => {
      try {
        const result = await next.task();
        next.resolve(result);
      } catch (error) {
        next.reject(error);
      } finally {
        setTimeout(() => {
          isProcessing = false;
          processNext();
        }, minInterval);
      }
    };

    void runTask();
  };

  return {
    schedule<T>(task: () => Promise<T>): Promise<T> {
      if (queue.length >= maxQueue) {
        return Promise.reject(
          new Error("Rate limiter queue is full; consider raising maxQueueSize.")
        );
      }

      return new Promise<T>((resolve, reject) => {
        queue.push({ task, resolve, reject });
        processNext();
      });
    }
  };
}

