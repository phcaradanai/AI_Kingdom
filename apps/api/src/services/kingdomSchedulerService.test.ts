import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  runSchedulerTick,
  getSchedulerStatus,
  resolveIntervalMs,
  MIN_INTERVAL_MS,
  __resetSchedulerStateForTest,
  type SchedulerDeps
} from "./kingdomSchedulerService.js";

/**
 * Pure unit tests for the autonomy scheduler tick logic.
 * No database and no timers — dependencies are injected.
 */

function deferred<T>(): { promise: Promise<T>; resolve: (v: T) => void; reject: (e: unknown) => void } {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function makeDeps(overrides: Partial<SchedulerDeps> = {}): SchedulerDeps & { runOnceCalls: number; logs: Array<{ message: string; error?: unknown }> } {
  const logs: Array<{ message: string; error?: unknown }> = [];
  const base = {
    runOnceCalls: 0,
    logs,
    isEnabled: async () => true,
    runOnce: async function (this: { runOnceCalls: number }) {
      return { run: { status: "COMPLETED" } };
    },
    now: () => new Date("2026-06-18T00:00:00.000Z"),
    log: (message: string, error?: unknown) => {
      logs.push({ message, error });
    }
  };
  // wrap runOnce to count calls unless overridden
  const wrapped: SchedulerDeps & { runOnceCalls: number; logs: typeof logs } = {
    ...base,
    isEnabled: overrides.isEnabled ?? base.isEnabled,
    now: overrides.now ?? base.now,
    log: overrides.log ?? base.log,
    runOnce:
      overrides.runOnce ??
      (async () => {
        wrapped.runOnceCalls += 1;
        return { run: { status: "COMPLETED" } };
      })
  } as SchedulerDeps & { runOnceCalls: number; logs: typeof logs };
  if (overrides.runOnce) {
    const orig = overrides.runOnce;
    wrapped.runOnce = async () => {
      wrapped.runOnceCalls += 1;
      return orig();
    };
  }
  return wrapped;
}

describe("kingdomSchedulerService", () => {
  afterEach(() => {
    __resetSchedulerStateForTest();
  });

  it("skips the run when LIVING_LOOP_ENABLED is false", async () => {
    const deps = makeDeps({ isEnabled: async () => false });
    const result = await runSchedulerTick(deps);
    assert.equal(result, "SKIPPED_DISABLED");
    assert.equal(deps.runOnceCalls, 0);
    const status = getSchedulerStatus();
    assert.equal(status.runsSkippedDisabled, 1);
    assert.equal(status.runsCompleted, 0);
    assert.equal(status.enabledSetting, false);
    assert.equal(status.ticksStarted, 1);
  });

  it("runs the loop when enabled and records the result", async () => {
    const deps = makeDeps({ isEnabled: async () => true });
    const result = await runSchedulerTick(deps);
    assert.equal(result, "RAN");
    assert.equal(deps.runOnceCalls, 1);
    const status = getSchedulerStatus();
    assert.equal(status.runsCompleted, 1);
    assert.equal(status.lastRunStatus, "COMPLETED");
    assert.equal(status.lastError, null);
    assert.equal(status.enabledSetting, true);
  });

  it("guards against overlapping runs", async () => {
    const gate = deferred<{ run: { status: string } }>();
    const deps = makeDeps({ runOnce: () => gate.promise });

    const first = runSchedulerTick(deps); // starts, awaits gate
    const second = await runSchedulerTick(deps); // should bail immediately

    assert.equal(second, "SKIPPED_OVERLAP");
    assert.equal(getSchedulerStatus().runsSkippedOverlap, 1);

    gate.resolve({ run: { status: "COMPLETED" } });
    assert.equal(await first, "RAN");
    assert.equal(deps.runOnceCalls, 1);
    assert.equal(getSchedulerStatus().runsCompleted, 1);
  });

  it("never throws when the loop run fails, and records the error", async () => {
    const deps = makeDeps({
      runOnce: async () => {
        throw new Error("boom from living loop");
      }
    });
    const result = await runSchedulerTick(deps);
    assert.equal(result, "ERROR");
    const status = getSchedulerStatus();
    assert.equal(status.errors, 1);
    assert.equal(status.lastError, "boom from living loop");
    assert.equal(status.tickInProgress, false);
    assert.equal(deps.logs.length, 1);
    assert.match(deps.logs[0]?.message ?? "", /tick failed/);
  });

  it("clears the in-progress flag even after an error (next tick can run)", async () => {
    const failing = makeDeps({
      runOnce: async () => {
        throw new Error("first fails");
      }
    });
    await runSchedulerTick(failing);
    const ok = makeDeps({ isEnabled: async () => true });
    const result = await runSchedulerTick(ok);
    assert.equal(result, "RAN");
    assert.equal(getSchedulerStatus().tickInProgress, false);
  });

  it("floors the interval at the minimum and rejects invalid values", () => {
    assert.equal(resolveIntervalMs(1000), MIN_INTERVAL_MS);
    assert.equal(resolveIntervalMs(0), MIN_INTERVAL_MS);
    assert.equal(resolveIntervalMs(-5), MIN_INTERVAL_MS);
    assert.equal(resolveIntervalMs(Number.NaN), MIN_INTERVAL_MS);
    assert.equal(resolveIntervalMs(600000), 600000);
  });
});
