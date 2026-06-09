import { describe, it, expect } from "vitest";
import { HostThrottle } from "../src/core/throttle.js";
import { politenessSchema } from "../src/config/schema.js";

/** A throttle with a controllable clock and a sleep that advances it. */
function makeThrottle(minIntervalMs: number, throttleLocalhost = false) {
  let clock = 1000;
  const sleeps: number[] = [];
  const throttle = new HostThrottle({
    minIntervalMs,
    throttleLocalhost,
    now: () => clock,
    sleep: async (ms) => {
      sleeps.push(ms);
      clock += ms;
    },
  });
  return { throttle, sleeps, advance: (ms: number) => (clock += ms) };
}

describe("HostThrottle", () => {
  it("does not wait on the first hit to a host", async () => {
    const { throttle, sleeps } = makeThrottle(1000);
    await throttle.acquire("example.com");
    expect(sleeps).toEqual([]);
  });

  it("spaces consecutive same-host hits by the interval", async () => {
    const { throttle, sleeps } = makeThrottle(1000);
    await throttle.acquire("example.com"); // t=1000, fires immediately
    await throttle.acquire("example.com"); // no real time passed -> waits ~1000
    expect(sleeps).toEqual([1000]);
  });

  it("does not wait when enough time has already elapsed", async () => {
    const { throttle, sleeps, advance } = makeThrottle(1000);
    await throttle.acquire("example.com");
    advance(1500); // more than the interval passes
    await throttle.acquire("example.com");
    expect(sleeps).toEqual([]);
  });

  it("tracks hosts independently", async () => {
    const { throttle, sleeps } = makeThrottle(1000);
    await throttle.acquire("a.com");
    await throttle.acquire("b.com"); // different host -> no wait
    expect(sleeps).toEqual([]);
  });

  it("skips localhost by default but throttles it when asked", async () => {
    const off = makeThrottle(1000, false);
    await off.throttle.acquire("localhost");
    await off.throttle.acquire("localhost");
    expect(off.sleeps).toEqual([]);

    const on = makeThrottle(1000, true);
    await on.throttle.acquire("localhost");
    await on.throttle.acquire("localhost");
    expect(on.sleeps).toEqual([1000]);
  });

  it("is a no-op when the interval is zero", async () => {
    const { throttle, sleeps } = makeThrottle(0);
    await throttle.acquire("example.com");
    await throttle.acquire("example.com");
    expect(sleeps).toEqual([]);
  });
});

describe("politeness schema defaults", () => {
  it("applies safe defaults", () => {
    expect(politenessSchema.parse({})).toEqual({
      minRequestIntervalMs: 1000,
      maxConcurrency: 2,
      respectRobots: false,
      throttleLocalhost: false,
    });
  });
});
