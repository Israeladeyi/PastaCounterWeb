/**
 * SessionManager.ts
 * Manages the lifecycle of a 60-second counting session.
 *
 * Session states:
 *   IDLE → COUNTDOWN → COUNTING → COMPLETE → IDLE
 *
 * Critical design: uses performance.now() (monotonic high-resolution clock)
 * NOT frame counting or Date.now() for timing. This ensures the session
 * duration is accurate regardless of FPS drops.
 *
 * At exactly SESSION_DURATION_MS the session stops accepting counts.
 */

import {MonotonicTimer} from '../utils/performance';
import {Logger} from '../utils/logger';
import {CountEvent} from '../counting/CountingEngine';

const TAG = 'SessionManager';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SessionState = 'IDLE' | 'COUNTDOWN' | 'COUNTING' | 'COMPLETE';

export interface SessionConfig {
  /** Session duration in milliseconds. Default: 60000 (60 seconds) */
  durationMs: number;
  /** Countdown duration before counting starts (ms) */
  countdownMs: number;
}

export const DEFAULT_SESSION_CONFIG: SessionConfig = {
  durationMs: 60_000,
  countdownMs: 3_000,
};

export interface SessionSnapshot {
  sessionId: string;
  state: SessionState;
  elapsedMs: number;
  remainingMs: number;
  confirmedCount: number;
  uncertainCount: number;
  ratePerMin: number;
  ratePerSec: number;
  peakRatePerMin: number;
  overallConfidence: number;
  modelVersion: string;
}

export interface SessionResult {
  sessionId: string;
  startedAt: number;
  endedAt: number;
  durationMs: number;
  totalCount: number;
  confirmedCount: number;
  uncertainEvents: number;
  avgRatePerMin: number;
  peakRatePerMin: number;
  overallConfidence: number;
  modelVersion: string;
  events: CountEvent[];
}

// ---------------------------------------------------------------------------
// Rate Calculator (rolling window)
// ---------------------------------------------------------------------------

class RateCalculator {
  private readonly windowMs: number;
  private countTimestamps: number[] = [];

  constructor(windowMs = 5000) {
    this.windowMs = windowMs;
  }

  recordCount(timestamp: number): void {
    this.countTimestamps.push(timestamp);
    // Remove old timestamps outside window
    const cutoff = timestamp - this.windowMs;
    while (
      this.countTimestamps.length > 0 &&
      this.countTimestamps[0] < cutoff
    ) {
      this.countTimestamps.shift();
    }
  }

  getRatePerMin(): number {
    if (this.countTimestamps.length < 2) {
      return this.countTimestamps.length > 0 ? 60 : 0;
    }
    const windowSeconds = this.windowMs / 1000;
    return (this.countTimestamps.length / windowSeconds) * 60;
  }

  getRatePerSec(): number {
    return this.getRatePerMin() / 60;
  }

  reset(): void {
    this.countTimestamps = [];
  }
}

// ---------------------------------------------------------------------------
// SessionManager
// ---------------------------------------------------------------------------

export class SessionManager {
  private config: SessionConfig;
  private state: SessionState = 'IDLE';
  private timer: MonotonicTimer = new MonotonicTimer();
  private rateCalc: RateCalculator = new RateCalculator(5000);

  private sessionId: string = '';
  private sessionStartWallClock = 0;
  private confirmedCount = 0;
  private uncertainCount = 0;
  private events: CountEvent[] = [];
  private confidenceHistory: number[] = [];
  private peakRatePerMin = 0;
  private modelVersion = 'unknown';

  // Callbacks
  private onStateChange: ((state: SessionState) => void) | null = null;
  private onCountdown: ((remaining: number) => void) | null = null;
  private onComplete: ((result: SessionResult) => void) | null = null;

  private countdownInterval: ReturnType<typeof setInterval> | null = null;

  constructor(config: SessionConfig = DEFAULT_SESSION_CONFIG) {
    this.config = config;
  }

  // ---------------------------------------------------------------------------
  // Configuration
  // ---------------------------------------------------------------------------

  updateConfig(config: Partial<SessionConfig>): void {
    this.config = {...this.config, ...config};
  }

  setModelVersion(version: string): void {
    this.modelVersion = version;
  }

  // ---------------------------------------------------------------------------
  // Event listeners
  // ---------------------------------------------------------------------------

  onStateChanged(cb: (state: SessionState) => void): void {
    this.onStateChange = cb;
  }

  onCountdownTick(cb: (remaining: number) => void): void {
    this.onCountdown = cb;
  }

  onSessionComplete(cb: (result: SessionResult) => void): void {
    this.onComplete = cb;
  }

  // ---------------------------------------------------------------------------
  // Session control
  // ---------------------------------------------------------------------------

  start(): void {
    if (this.state !== 'IDLE') {
      Logger.warn(TAG, 'start() called while not IDLE');
      return;
    }
    this._reset();
    this._startCountdown();
  }

  abort(): void {
    this._cleanup();
    this.state = 'IDLE';
    this.onStateChange?.('IDLE');
    Logger.warn(TAG, 'Session aborted');
  }

  // ---------------------------------------------------------------------------
  // Counting event processing
  // ---------------------------------------------------------------------------

  /**
   * Called by CountingEngine for every COUNT or UNCERTAIN event.
   * Only accepted during COUNTING state and within time window.
   */
  onCountEvent(event: CountEvent): void {
    if (this.state !== 'COUNTING') return;

    const elapsed = this.timer.getElapsedMs();
    if (elapsed >= this.config.durationMs) {
      // Time's up — trigger completion
      this._complete();
      return;
    }

    this.events.push(event);

    if (event.type === 'COUNT') {
      this.confirmedCount++;
      const now = Date.now();
      this.rateCalc.recordCount(now);
      const currentRate = this.rateCalc.getRatePerMin();
      if (currentRate > this.peakRatePerMin) {
        this.peakRatePerMin = currentRate;
      }
    } else if (event.type === 'UNCERTAIN') {
      this.uncertainCount++;
    }

    if (event.overallConf > 0) {
      this.confidenceHistory.push(event.overallConf);
    }
  }

  // ---------------------------------------------------------------------------
  // Tick (call every frame from the pipeline)
  // ---------------------------------------------------------------------------

  tick(): void {
    if (this.state !== 'COUNTING') return;

    const elapsed = this.timer.getElapsedMs();
    if (elapsed >= this.config.durationMs) {
      this._complete();
    }
  }

  // ---------------------------------------------------------------------------
  // Snapshot for UI
  // ---------------------------------------------------------------------------

  getSnapshot(): SessionSnapshot {
    const elapsed =
      this.state === 'COUNTING' ? this.timer.getElapsedMs() : 0;
    const remaining = Math.max(0, this.config.durationMs - elapsed);

    return {
      sessionId: this.sessionId,
      state: this.state,
      elapsedMs: elapsed,
      remainingMs: remaining,
      confirmedCount: this.confirmedCount,
      uncertainCount: this.uncertainCount,
      ratePerMin: this.rateCalc.getRatePerMin(),
      ratePerSec: this.rateCalc.getRatePerSec(),
      peakRatePerMin: this.peakRatePerMin,
      overallConfidence: this._computeSessionConfidence(),
      modelVersion: this.modelVersion,
    };
  }

  getState(): SessionState {
    return this.state;
  }

  // ---------------------------------------------------------------------------
  // Internal
  // ---------------------------------------------------------------------------

  private _reset(): void {
    this.sessionId = `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    this.confirmedCount = 0;
    this.uncertainCount = 0;
    this.events = [];
    this.confidenceHistory = [];
    this.peakRatePerMin = 0;
    this.rateCalc.reset();
    this.timer.reset();
  }

  private _startCountdown(): void {
    this.state = 'COUNTDOWN';
    this.onStateChange?.('COUNTDOWN');
    Logger.info(TAG, 'Countdown started', {sessionId: this.sessionId});

    let remaining = Math.ceil(this.config.countdownMs / 1000);
    this.onCountdown?.(remaining);

    this.countdownInterval = setInterval(() => {
      remaining--;
      this.onCountdown?.(remaining);
      if (remaining <= 0) {
        clearInterval(this.countdownInterval!);
        this.countdownInterval = null;
        this._startCounting();
      }
    }, 1000);
  }

  private _startCounting(): void {
    this.state = 'COUNTING';
    this.sessionStartWallClock = Date.now();
    this.timer.start();
    this.onStateChange?.('COUNTING');
    Logger.info(TAG, 'Counting started', {
      sessionId: this.sessionId,
      durationMs: this.config.durationMs,
    });
  }

  private _complete(): void {
    if (this.state !== 'COUNTING') return;
    this.state = 'COMPLETE';
    this.timer.pause();
    const actualDuration = this.timer.getElapsedMs();

    const result: SessionResult = {
      sessionId: this.sessionId,
      startedAt: this.sessionStartWallClock,
      endedAt: Date.now(),
      durationMs: actualDuration,
      totalCount: this.confirmedCount + this.uncertainCount,
      confirmedCount: this.confirmedCount,
      uncertainEvents: this.uncertainCount,
      avgRatePerMin:
        actualDuration > 0
          ? (this.confirmedCount / actualDuration) * 60_000
          : 0,
      peakRatePerMin: this.peakRatePerMin,
      overallConfidence: this._computeSessionConfidence(),
      modelVersion: this.modelVersion,
      events: [...this.events],
    };

    this.onStateChange?.('COMPLETE');
    this.onComplete?.(result);

    Logger.info(TAG, 'Session COMPLETE', {
      count: result.confirmedCount,
      duration: (actualDuration / 1000).toFixed(3) + 's',
      confidence: result.overallConfidence.toFixed(3),
    });
  }

  private _cleanup(): void {
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
      this.countdownInterval = null;
    }
    this.timer.pause();
  }

  private _computeSessionConfidence(): number {
    if (this.confidenceHistory.length === 0) return 0;
    const avg =
      this.confidenceHistory.reduce((a, b) => a + b, 0) /
      this.confidenceHistory.length;

    // Penalize by uncertain event rate
    const totalEvents =
      this.confirmedCount + this.uncertainCount;
    const uncertainRate =
      totalEvents > 0 ? this.uncertainCount / totalEvents : 0;

    return Math.max(0, avg * (1 - uncertainRate * 0.5));
  }
}
