import { describe, expect, it } from "vitest";
import { taskPollTicks } from "../src/task-poll.js";

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
