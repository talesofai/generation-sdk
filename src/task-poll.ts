import { isRetryablePollError } from "./errors.js";

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, Math.max(0, ms));
  });
}

/** Run one poll request. Retryable transport/5xx errors return undefined so the ticker can continue. */
export async function tryPollRequest<T>(request: () => Promise<T>): Promise<T | undefined> {
  try {
    return await request();
  } catch (error) {
    if (!isRetryablePollError(error)) throw error;
    return undefined;
  }
}

/** Yield immediately, then wait `intervalMs` between later ticks until `maxWaitMs`. */
export async function* taskPollTicks(maxWaitMs: number, intervalMs: number): AsyncGenerator<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt <= maxWaitMs) {
    yield;
    if (Date.now() - startedAt > maxWaitMs) return;
    await sleep(intervalMs);
  }
}
