/**
 * performance.ts — Monotonic timer, latency tracker, FPS counter
 */

// ---------------------------------------------------------------------------
// MonotonicTimer
// ---------------------------------------------------------------------------
export class MonotonicTimer {
  private startTime: number | null = null;
  private pausedAt: number | null = null;
  private totalPausedMs = 0;

  start(): void {
    this.startTime = performance.now();
    this.pausedAt = null;
    this.totalPausedMs = 0;
  }

  reset(): void {
    this.startTime = null;
    this.pausedAt = null;
    this.totalPausedMs = 0;
  }

  pause(): void {
    if (this.startTime !== null && this.pausedAt === null) {
      this.pausedAt = performance.now();
    }
  }

  resume(): void {
    if (this.pausedAt !== null) {
      this.totalPausedMs += performance.now() - this.pausedAt;
      this.pausedAt = null;
    }
  }

  getElapsedMs(): number {
    if (this.startTime === null) return 0;
    const now = this.pausedAt !== null ? this.pausedAt : performance.now();
    return now - this.startTime - this.totalPausedMs;
  }
}

// ---------------------------------------------------------------------------
// LatencyTracker — rolling average of latency samples
// ---------------------------------------------------------------------------
export class LatencyTracker {
  private samples: number[] = [];
  private readonly maxSamples: number;

  constructor(maxSamples = 60) {
    this.maxSamples = maxSamples;
  }

  record(latencyMs: number): void {
    this.samples.push(latencyMs);
    if (this.samples.length > this.maxSamples) this.samples.shift();
  }

  getAverage(): number {
    if (this.samples.length === 0) return 0;
    return this.samples.reduce((a, b) => a + b, 0) / this.samples.length;
  }

  getP95(): number {
    if (this.samples.length === 0) return 0;
    const sorted = [...this.samples].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length * 0.95)] ?? sorted[sorted.length - 1];
  }

  getMax(): number {
    return this.samples.length === 0 ? 0 : Math.max(...this.samples);
  }

  reset(): void {
    this.samples = [];
  }
}

// ---------------------------------------------------------------------------
// FpsCounter — rolling FPS over a time window
// ---------------------------------------------------------------------------
export class FpsCounter {
  private ticks: number[] = [];
  private readonly windowMs: number;

  constructor(windowMs = 1000) {
    this.windowMs = windowMs;
  }

  tick(): void {
    const now = performance.now();
    this.ticks.push(now);
    const cutoff = now - this.windowMs;
    while (this.ticks.length > 0 && this.ticks[0] < cutoff) {
      this.ticks.shift();
    }
  }

  getFps(): number {
    if (this.ticks.length < 2) return 0;
    const span = this.ticks[this.ticks.length - 1] - this.ticks[0];
    if (span <= 0) return 0;
    return ((this.ticks.length - 1) / span) * 1000;
  }

  reset(): void {
    this.ticks = [];
  }
}

// ---------------------------------------------------------------------------
// stopwatch utility
// ---------------------------------------------------------------------------
export function stopwatch(): () => number {
  const start = performance.now();
  return () => performance.now() - start;
}
