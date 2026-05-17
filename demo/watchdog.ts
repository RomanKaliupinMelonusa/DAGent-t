/**
 * watchdog.ts — In-flight-aware inactivity watchdog.
 *
 * Tracks tool-call depth (start/complete pairs). The idle timer only
 * ticks when `inFlight === 0` — long-running Playwright navigations or
 * shell builds keep the counter positive and pause the clock.
 *
 * Usage:
 *   const wd = new ActivityWatchdog(120_000, onIdle);
 *   session.on("tool.execution_start",    () => wd.toolStarted());
 *   session.on("tool.execution_complete",  () => wd.toolCompleted());
 *   // … await session.sendAndWait(…)
 *   wd.dispose();
 */

export type WatchdogCallback = () => void;

export class ActivityWatchdog {
  private readonly thresholdMs: number;
  private readonly onInactivity: WatchdogCallback;
  private inFlight = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private fired = false;

  constructor(thresholdMs: number, onInactivity: WatchdogCallback) {
    this.thresholdMs = thresholdMs;
    this.onInactivity = onInactivity;
    // Start the timer immediately — if the LLM never issues a single
    // tool call, we still want to detect that as inactivity.
    this.resetTimer();
  }

  /** Called when any tool call begins. */
  toolStarted(): void {
    this.inFlight++;
    this.clearTimer();
  }

  /** Called when any tool call completes (success or failure). */
  toolCompleted(): void {
    this.inFlight = Math.max(0, this.inFlight - 1);
    if (this.inFlight === 0) {
      this.resetTimer();
    }
  }

  /** Stop the watchdog. Safe to call multiple times. */
  dispose(): void {
    this.clearTimer();
  }

  private resetTimer(): void {
    this.clearTimer();
    if (this.fired) return;
    this.timer = setTimeout(() => {
      this.fired = true;
      this.onInactivity();
    }, this.thresholdMs);
  }

  private clearTimer(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
