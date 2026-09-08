export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, Math.max(0, ms));
  });
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
