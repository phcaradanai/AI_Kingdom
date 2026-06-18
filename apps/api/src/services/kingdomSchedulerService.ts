import { env } from "../config/env.js";

// Heavy modules (settings + living loop, which pull in Prisma) are loaded lazily
// inside the default deps so importing this module — e.g. in unit tests that inject
// their own deps — never drags in the database client.

/**
 * Kingdom Autonomy Scheduler (M19).
 *
 * A single in-process background worker that periodically drives the existing,
 * fully-gated Living Loop (observe -> propose -> act). This is the piece that lets
 * the Kingdom "work on its own" after the King issues a decree, without a manual
 * POST /api/living-loop/run each cycle.
 *
 * Safety: this scheduler adds NO new capability. Every tick re-reads
 * `LIVING_LOOP_ENABLED` from settings and, only when enabled, calls
 * `runLivingLoopOnce("SCHEDULED")`. All downstream gates (data value gate,
 * auto-validation / auto-sandbox-patch opt-in settings, risk policy, runner
 * refusal, NEEDS_REVIEW landing, no auto branch push / PR / merge / deploy)
 * remain exactly as they were. Disabled by default — the scheduler ticks but
 * does nothing until the King turns the Living Loop on.
 */

export type SchedulerTickResult = "RAN" | "SKIPPED_DISABLED" | "SKIPPED_OVERLAP" | "ERROR";

export type SchedulerStatus = {
  /** Whether the interval timer is currently active. */
  running: boolean;
  /** Configured tick interval in milliseconds. */
  intervalMs: number;
  /** Last observed value of the LIVING_LOOP_ENABLED setting (null until first tick). */
  enabledSetting: boolean | null;
  /** True while a tick is mid-flight (overlap guard). */
  tickInProgress: boolean;
  ticksStarted: number;
  runsCompleted: number;
  runsSkippedDisabled: number;
  runsSkippedOverlap: number;
  errors: number;
  startedAt: string | null;
  lastTickAt: string | null;
  lastRunAt: string | null;
  lastRunStatus: string | null;
  lastError: string | null;
};

export type SchedulerDeps = {
  /** Read the LIVING_LOOP_ENABLED runtime setting. */
  isEnabled: () => Promise<boolean>;
  /** Execute one Living Loop cycle. */
  runOnce: () => Promise<{ run: { status?: string | null } }>;
  /** Clock (injectable for tests). */
  now: () => Date;
  /** Logger (injectable for tests). */
  log: (message: string, error?: unknown) => void;
};

/** Floor on the tick interval so a misconfigured env value can never hammer the loop. */
export const MIN_INTERVAL_MS = 15_000;

const defaultDeps: SchedulerDeps = {
  isEnabled: async () => {
    const { getBooleanSetting } = await import("./settingsService.js");
    return getBooleanSetting("LIVING_LOOP_ENABLED", false);
  },
  runOnce: async () => {
    const { runLivingLoopOnce } = await import("./livingLoopService.js");
    return runLivingLoopOnce("SCHEDULED");
  },
  now: () => new Date(),
  log: (message, error) => {
    if (error !== undefined) console.error(message, error);
    else console.log(message);
  }
};

type MutableState = {
  enabledSetting: boolean | null;
  tickInProgress: boolean;
  ticksStarted: number;
  runsCompleted: number;
  runsSkippedDisabled: number;
  runsSkippedOverlap: number;
  errors: number;
  startedAt: string | null;
  lastTickAt: string | null;
  lastRunAt: string | null;
  lastRunStatus: string | null;
  lastError: string | null;
};

function freshState(): MutableState {
  return {
    enabledSetting: null,
    tickInProgress: false,
    ticksStarted: 0,
    runsCompleted: 0,
    runsSkippedDisabled: 0,
    runsSkippedOverlap: 0,
    errors: 0,
    startedAt: null,
    lastTickAt: null,
    lastRunAt: null,
    lastRunStatus: null,
    lastError: null
  };
}

let state: MutableState = freshState();
let timer: ReturnType<typeof setInterval> | null = null;
let activeDeps: SchedulerDeps = defaultDeps;

/** Resolve the effective interval, honoring the floor. */
export function resolveIntervalMs(raw: number = env.LIVING_LOOP_INTERVAL_MS): number {
  if (!Number.isFinite(raw) || raw <= 0) return MIN_INTERVAL_MS;
  return Math.max(MIN_INTERVAL_MS, Math.floor(raw));
}

/**
 * Run exactly one scheduler tick. Never throws — any error is captured into status.
 * Exported so it can be unit-tested without timers or a database.
 */
export async function runSchedulerTick(deps: SchedulerDeps = activeDeps): Promise<SchedulerTickResult> {
  // Overlap guard: JS is single-threaded, so reading + setting the flag before the
  // first await is atomic. A long-running cycle therefore can't be re-entered.
  if (state.tickInProgress) {
    state.runsSkippedOverlap += 1;
    return "SKIPPED_OVERLAP";
  }
  state.tickInProgress = true;
  state.ticksStarted += 1;
  state.lastTickAt = deps.now().toISOString();

  try {
    const enabled = await deps.isEnabled();
    state.enabledSetting = enabled;
    if (!enabled) {
      state.runsSkippedDisabled += 1;
      return "SKIPPED_DISABLED";
    }

    const result = await deps.runOnce();
    state.runsCompleted += 1;
    state.lastRunAt = deps.now().toISOString();
    state.lastRunStatus = result?.run?.status ?? null;
    state.lastError = null;
    return "RAN";
  } catch (error) {
    state.errors += 1;
    state.lastError = error instanceof Error ? error.message : String(error);
    deps.log("[KingdomScheduler] living-loop tick failed", error);
    return "ERROR";
  } finally {
    state.tickInProgress = false;
  }
}

/**
 * Start the background scheduler. Idempotent: a second call is a no-op while running.
 * `deps` may be overridden in tests. The timer is unref'd so it never keeps the
 * process alive on its own.
 */
export function startKingdomScheduler(options?: { deps?: Partial<SchedulerDeps>; intervalMs?: number }): SchedulerStatus {
  if (timer) return getSchedulerStatus();
  activeDeps = { ...defaultDeps, ...(options?.deps ?? {}) };
  const intervalMs = resolveIntervalMs(options?.intervalMs ?? env.LIVING_LOOP_INTERVAL_MS);
  state.startedAt = activeDeps.now().toISOString();
  timer = setInterval(() => {
    void runSchedulerTick(activeDeps);
  }, intervalMs);
  if (typeof timer.unref === "function") timer.unref();
  activeDeps.log(`[KingdomScheduler] started (interval ${intervalMs}ms; gated by LIVING_LOOP_ENABLED)`);
  return getSchedulerStatus();
}

/** Stop the background scheduler and clear the timer. Idempotent. */
export function stopKingdomScheduler(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

/** Current scheduler status snapshot. */
export function getSchedulerStatus(): SchedulerStatus {
  return {
    running: timer !== null,
    intervalMs: resolveIntervalMs(),
    enabledSetting: state.enabledSetting,
    tickInProgress: state.tickInProgress,
    ticksStarted: state.ticksStarted,
    runsCompleted: state.runsCompleted,
    runsSkippedDisabled: state.runsSkippedDisabled,
    runsSkippedOverlap: state.runsSkippedOverlap,
    errors: state.errors,
    startedAt: state.startedAt,
    lastTickAt: state.lastTickAt,
    lastRunAt: state.lastRunAt,
    lastRunStatus: state.lastRunStatus,
    lastError: state.lastError
  };
}

/** Test-only: reset internal counters/state and stop any active timer. */
export function __resetSchedulerStateForTest(): void {
  stopKingdomScheduler();
  state = freshState();
  activeDeps = defaultDeps;
}
