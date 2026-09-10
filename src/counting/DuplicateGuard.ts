/**
 * DuplicateGuard.ts
 * Guarantees that no sachet can be counted more than once per session.
 *
 * Maintains a Set of all counted track IDs for the duration of a session.
 * Also handles the re-identification problem: if the tracker loses a track
 * (ID=17) and re-creates it as a new track (ID=43) for the same physical
 * sachet, we must detect this and prevent a second count.
 *
 * Re-ID detection strategy:
 *   When a track is about to be counted, check whether any recently-counted
 *   track had a similar trajectory (spatial proximity + temporal proximity).
 *   If yes, flag as probable duplicate.
 */

import {Track} from '../tracking/Track';
import {Point, pointDistance} from '../utils/geometry';
import {Logger} from '../utils/logger';

const TAG = 'DuplicateGuard';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const RE_ID_SPATIAL_THRESHOLD = 0.08; // normalized distance — 8% of frame
const RE_ID_TEMPORAL_THRESHOLD = 1000; // ms — 1 second

// ---------------------------------------------------------------------------
// Counted track record
// ---------------------------------------------------------------------------

interface CountedRecord {
  trackId: number;
  crossingPoint: Point;
  countedAt: number; // ms
}

// ---------------------------------------------------------------------------
// DuplicateGuard
// ---------------------------------------------------------------------------

export class DuplicateGuard {
  /** Set of track IDs that have been counted this session */
  private countedIds: Set<number> = new Set();
  /** Recent crossing records for re-ID detection */
  private recentCrossings: CountedRecord[] = [];

  /** Call at the start of each counting session */
  reset(): void {
    this.countedIds.clear();
    this.recentCrossings = [];
    Logger.info(TAG, 'DuplicateGuard reset for new session');
  }

  /**
   * Check whether a track is safe to count.
   *
   * @returns 'OK' if safe to count, 'DUPLICATE' if this track ID was already
   *          counted, 'PROBABLE_RE_ID' if suspected same physical object.
   */
  check(
    track: Track,
    crossingPoint: Point,
    timestamp: number,
  ): 'OK' | 'DUPLICATE' | 'PROBABLE_RE_ID' {
    // 1. Exact ID match
    if (this.countedIds.has(track.id)) {
      Logger.warn(TAG, `Duplicate count prevented: track ${track.id}`);
      return 'DUPLICATE';
    }

    // 2. Re-ID check: is there a recently counted object at nearly the same position?
    const probableReId = this.recentCrossings.find(record => {
      const spatial = pointDistance(record.crossingPoint, crossingPoint);
      const temporal = Math.abs(timestamp - record.countedAt);
      return spatial < RE_ID_SPATIAL_THRESHOLD && temporal < RE_ID_TEMPORAL_THRESHOLD;
    });

    if (probableReId) {
      Logger.warn(TAG, `Probable re-ID duplicate: track ${track.id}`, {
        previousTrackId: probableReId.trackId,
        spatial: pointDistance(probableReId.crossingPoint, crossingPoint),
        temporal: timestamp - probableReId.countedAt,
      });
      return 'PROBABLE_RE_ID';
    }

    return 'OK';
  }

  /**
   * Record a track as counted. Call AFTER the count is accepted.
   */
  markCounted(track: Track, crossingPoint: Point, timestamp: number): void {
    this.countedIds.add(track.id);
    this.recentCrossings.push({
      trackId: track.id,
      crossingPoint,
      countedAt: timestamp,
    });

    // Keep recent crossings list bounded
    if (this.recentCrossings.length > 200) {
      this.recentCrossings.shift();
    }
  }

  hasCounted(trackId: number): boolean {
    return this.countedIds.has(trackId);
  }

  getCountedCount(): number {
    return this.countedIds.size;
  }

  /** For debug/diagnostics */
  getCountedIds(): number[] {
    return [...this.countedIds];
  }
}
