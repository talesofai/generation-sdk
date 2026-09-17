import { describe, expect, it } from "vitest";
import {
  GenerationProviderError,
  GenerationTimeoutError,
  GenerationTransportError,
  isRetryablePollError,
} from "../src/errors.js";
import { taskPollTicks, tryPollRequest } from "../src/task-poll.js";

describe("taskPollTicks", () => {
  it("yields immediately so the first poll does not wait", async () => {
    const started = Date.now();
    let yielded = false;
    for await (const _ of taskPollTicks(1000, 10_000)) {
      yielded = true;
      break;
    }
    expect(yielded).toBe(true);
    expect(Date.now() - started).toBeLessThan(50);
  });
});

describe("isRetryablePollError", () => {
  it("retries transport failures and HTTP 5xx", () => {
    expect(
      isRetryablePollError(
        new GenerationTransportError(
          { method: "GET", path: "/v1/video/generations/task", elapsedMs: 10_483 },
          new Error("fetch failed"),
        ),
      ),
    ).toBe(true);
    expect(isRetryablePollError(new GenerationProviderError("upstream", { status: 502 }))).toBe(true);
  });

  it("does not retry timeouts, 4xx, or validation failures", () => {
    expect(isRetryablePollError(new GenerationTimeoutError("Timed out waiting for video generation"))).toBe(false);
    expect(isRetryablePollError(new GenerationProviderError("bad request", { status: 400 }))).toBe(false);
    expect(isRetryablePollError(new Error("fetch failed"))).toBe(false);
  });
});

describe("tryPollRequest", () => {
  it("returns undefined for retryable poll errors", async () => {
    await expect(
      tryPollRequest(async () => {
        throw new GenerationProviderError("bad gateway", { status: 502 });
      }),
    ).resolves.toBeUndefined();
  });

  it("rethrows non-retryable errors", async () => {
    await expect(
      tryPollRequest(async () => {
        throw new GenerationProviderError("copyright", { status: 400 });
      }),
    ).rejects.toThrow("copyright");
  });
});

describe("taskPollTicks", () => {
  it("yields immediately so the first poll does not wait", async () => {
    const started = Date.now();
    let yielded = false;
    for await (const _ of taskPollTicks(1000, 10_000)) {
      yielded = true;
      break;
    }
    expect(yielded).toBe(true);
    expect(Date.now() - started).toBeLessThan(50);
  });
});
