/**
 * CountingEngine.ts
 * The heart of the system.
 *
 * Receives Track update events from the ByteTracker and applies:
 *  1. Zone entry/exit detection
 *  2. Line-crossing detection
 *  3. Direction validation
 *  4. Duplicate prevention (DuplicateGuard)
 *  5. State machine transitions (TrackStateMachine)
 *  6. Confidence scoring
 *  7. Uncertain event flagging
 *
 * The CountingEngine ONLY receives Track objects — it never touches raw
 * camera frames or detection tensors. This boundary makes it fully testable
 * with synthetic trajectories.
 *
 * OUTPUT: it emits CountEvent objects which the SessionManager accumulates.
 */

import {Track, TrackState} from '../tracking/Track';
import {CountingLine} from './CountingLine';
import {DuplicateGuard} from './DuplicateGuard';
import {trackStateMachine} from './StateMachine';
import {Point, bboxCenter} from '../utils/geometry';
import {Logger} from '../utils/logger';

const TAG = 'CountingEngine';

// ---------------------------------------------------------------------------
// Event types
// ---------------------------------------------------------------------------

export type CountEventType = 'COUNT' | 'UNCERTAIN' | 'REJECTED' | 'WARNING';

export interface CountEvent {
  type: CountEventType;
  trackId: number;
  timestamp: number;
  crossingPoint: Point;
  direction: string;
  detectionConf: number;
  trackConf: number;
  crossingConf: number;
  overallConf: number;
  reason?: string;
  count?: number; // total count at time of event
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface CountingEngineConfig {
  /** Minimum track confidence to attempt counting */
  minTrackConfidence: number;
  /** Minimum crossing confidence to accept a count */
  minCrossingConfidence: number;
  /** Minimum overall confidence (below this → UNCERTAIN event) */
  minOverallConfidence: number;
}

export const DEFAULT_COUNTING_CONFIG: CountingEngineConfig = {
  minTrackConfidence: 0.3,
  minCrossingConfidence: 0.5,
  minOverallConfidence: 0.6,
};

// ---------------------------------------------------------------------------
// CountingEngine
// ---------------------------------------------------------------------------

export class CountingEngine {
  private config: CountingEngineConfig;
  private countingLine: CountingLine;
  private duplicateGuard: DuplicateGuard;

  private confirmedCount = 0;
  private uncertainCount = 0;
  private events: CountEvent[] = [];

  /** External event listener (called for every COUNT / UNCERTAIN / REJECTED) */
  private onEvent: ((event: CountEvent) => void) | null = null;

  constructor(
    countingLine: CountingLine,
    duplicateGuard: DuplicateGuard,
    config: CountingEngineConfig = DEFAULT_COUNTING_CONFIG,
  ) {
    this.countingLine = countingLine;
    this.duplicateGuard = duplicateGuard;
    this.config = config;
  }

  setEventListener(listener: (event: CountEvent) => void): void {
    this.onEvent = listener;
  }

  updateConfig(config: Partial<CountingEngineConfig>): void {
    this.config = {...this.config, ...config};
  }

  /** Call at the start of each counting session */
  reset(): void {
    this.confirmedCount = 0;
    this.uncertainCount = 0;
    this.events = [];
    this.duplicateGuard.reset();
    Logger.info(TAG, 'CountingEngine reset');
  }

  /**
   * Process a batch of tracks from one frame of the tracker.
   * This is called every frame (or every tracker update).
   *
   * @param tracks    - All current tracks from ByteTracker
   * @param timestamp - Frame timestamp (ms)
   */
  processTracks(tracks: Track[], timestamp: number): void {
    for (const track of tracks) {
      this._processTrack(track, timestamp);
    }
  }

  // ---------------------------------------------------------------------------
  // Core per-track processing
  // ---------------------------------------------------------------------------

  private _processTrack(track: Track, timestamp: number): void {
    // Skip tracks that are not yet confirmed, or are already done
    if (
      track.state === TrackState.DETECTED ||
      track.state === TrackState.COUNTED ||
      track.state === TrackState.EXITED ||
      track.state === TrackState.DELETED ||
      track.state === TrackState.REJECTED
    ) {
      return;
    }

    const center = track.center;
    const zonePos = this.countingLine.getZonePosition(center);

    // --- Zone state management ---
    if (
      (track.state === TrackState.CONFIRMED ||
        track.state === TrackState.TRACKING) &&
      zonePos === 'IN_ZONE'
    ) {
      // Track has entered the counting zone
      const result = trackStateMachine.transition(
        track.state,
        TrackState.APPROACHING,
      );
      if (result) {
        track.state = result.newState;
        Logger.debug(TAG, `Track ${track.id} APPROACHING line`);
      }
    }

    if (
      track.state === TrackState.APPROACHING &&
      (zonePos === 'BEFORE' || zonePos === 'AFTER')
    ) {
      // Track exited zone without crossing — back to tracking
      const result = trackStateMachine.transition(
        track.state,
        TrackState.TRACKING,
      );
      if (result) {
        track.state = result.newState;
        Logger.debug(TAG, `Track ${track.id} exited zone without crossing`);
      }
    }

    // --- Crossing detection ---
    if (
      track.state === TrackState.APPROACHING &&
      track.history.length >= 2
    ) {
      const prev = track.history[track.history.length - 2];
      const curr = track.history[track.history.length - 1];

      const crossed = this.countingLine.hasCrossed(prev, curr);

      if (crossed) {
        track.crossingDetected = true;

        // Transition to CROSSED
        const crossResult = trackStateMachine.transition(
          track.state,
          TrackState.CROSSED,
        );
        if (!crossResult) return;
        track.state = crossResult.newState;

        // Validate direction
        const correctDirection = this.countingLine.isCorrectDirection(
          prev,
          curr,
        );

        if (!correctDirection) {
          // Wrong direction — revert to TRACKING, do not count
          const revertResult = trackStateMachine.transition(
            track.state,
            TrackState.TRACKING,
          );
          if (revertResult) track.state = revertResult.newState;

          Logger.info(TAG, `Track ${track.id} crossed in WRONG DIRECTION — ignored`);
          this._emitEvent({
            type: 'REJECTED',
            trackId: track.id,
            timestamp,
            crossingPoint: curr,
            direction: 'WRONG_DIRECTION',
            detectionConf: track.detectionConf,
            trackConf: track.trackConf,
            crossingConf: 0,
            overallConf: 0,
            reason: 'Wrong direction',
          });
          return;
        }

        // Compute confidences
        const crossingConf = this.countingLine.computeCrossingConfidence(
          track.history,
        );
        const overallConf = this._computeOverallConfidence(
          track.detectionConf,
          track.trackConf,
          crossingConf,
        );

        // Check duplicate
        const duplicateCheck = this.duplicateGuard.check(
          track,
          curr,
          timestamp,
        );

        if (duplicateCheck === 'DUPLICATE') {
          Logger.warn(TAG, `Track ${track.id} is a duplicate — rejected`);
          this._emitEvent({
            type: 'REJECTED',
            trackId: track.id,
            timestamp,
            crossingPoint: curr,
            direction: this.countingLine.getConfig().countDirection,
            detectionConf: track.detectionConf,
            trackConf: track.trackConf,
            crossingConf,
            overallConf,
            reason: 'Duplicate track ID',
          });
          return;
        }

        if (duplicateCheck === 'PROBABLE_RE_ID') {
          // Uncertain — flag but still count (operator can review)
          this.uncertainCount++;
          this._emitEvent({
            type: 'UNCERTAIN',
            trackId: track.id,
            timestamp,
            crossingPoint: curr,
            direction: this.countingLine.getConfig().countDirection,
            detectionConf: track.detectionConf,
            trackConf: track.trackConf,
            crossingConf,
            overallConf,
            reason: 'Possible re-identification — may be duplicate',
          });
          return;
        }

        // Check minimum confidence
        if (
          track.trackConf < this.config.minTrackConfidence ||
          crossingConf < this.config.minCrossingConfidence
        ) {
          // Low confidence — flag as uncertain
          this.uncertainCount++;
          Logger.warn(TAG, `Track ${track.id} low confidence crossing`, {
            trackConf: track.trackConf,
            crossingConf,
          });
          this._emitEvent({
            type: 'UNCERTAIN',
            trackId: track.id,
            timestamp,
            crossingPoint: curr,
            direction: this.countingLine.getConfig().countDirection,
            detectionConf: track.detectionConf,
            trackConf: track.trackConf,
            crossingConf,
            overallConf,
            reason: 'Low crossing confidence',
            count: this.confirmedCount,
          });
          return;
        }

        // All checks passed — ACCEPT THE COUNT
        const countResult = trackStateMachine.transition(
          track.state,
          TrackState.COUNTED,
        );
        if (!countResult) return;
        track.state = countResult.newState;
        track.counted = true;

        this.confirmedCount++;
        this.duplicateGuard.markCounted(track, curr, timestamp);

        Logger.info(TAG, `COUNT ACCEPTED`, {
          trackId: track.id,
          totalCount: this.confirmedCount,
          detectionConf: track.detectionConf,
          trackConf: track.trackConf,
          crossingConf,
          overallConf,
        });

        this._emitEvent({
          type: 'COUNT',
          trackId: track.id,
          timestamp,
          crossingPoint: curr,
          direction: this.countingLine.getConfig().countDirection,
          detectionConf: track.detectionConf,
          trackConf: track.trackConf,
          crossingConf,
          overallConf,
          count: this.confirmedCount,
        });
      }
    }

    // --- EXITED detection (counted + back in BEFORE or AFTER zone) ---
    if (track.state === TrackState.COUNTED && zonePos !== 'IN_ZONE') {
      const exitResult = trackStateMachine.transition(
        track.state,
        TrackState.EXITED,
      );
      if (exitResult) {
        track.state = exitResult.newState;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Confidence calculation
  // ---------------------------------------------------------------------------

  private _computeOverallConfidence(
    detConf: number,
    trackConf: number,
    crossingConf: number,
  ): number {
    // Weighted product — all factors must be good
    return Math.min(
      1,
      (detConf * 0.35 + trackConf * 0.35 + crossingConf * 0.30),
    );
  }

  // ---------------------------------------------------------------------------
  // Event emission
  // ---------------------------------------------------------------------------

  private _emitEvent(event: CountEvent): void {
    this.events.push(event);
    if (this.onEvent) {
      this.onEvent(event);
    }
  }

  // ---------------------------------------------------------------------------
  // Accessors
  // ---------------------------------------------------------------------------

  getConfirmedCount(): number {
    return this.confirmedCount;
  }

  getUncertainCount(): number {
    return this.uncertainCount;
  }

  getEvents(): CountEvent[] {
    return [...this.events];
  }

  getCountEvents(): CountEvent[] {
    return this.events.filter(e => e.type === 'COUNT');
  }

  getUncertainEvents(): CountEvent[] {
    return this.events.filter(e => e.type === 'UNCERTAIN');
  }
}
