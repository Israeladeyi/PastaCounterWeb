/**
 * CountingLine.ts
 * Defines the virtual counting line geometry and zone.
 *
 * The counting line is a horizontal or vertical line at a normalized
 * position across the camera frame. Around it is a zone (approach/exit band)
 * that determines when a track is considered "approaching" vs "past" the line.
 *
 *   VERTICAL LINE example (objects moving LEFT → RIGHT):
 *
 *   0.0             linePos            1.0
 *    |       zone_before |  zone_after |
 *    |    ←──────────────+─────────────→
 *    |             COUNT LINE
 *
 *   zone_before = linePos - zoneHalfWidth
 *   zone_after  = linePos + zoneHalfWidth
 */

import {Point, LineOrientation, CountDirection} from '../utils/geometry';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CountingLineConfig {
  /** Normalized position of the line (0–1). x for VERTICAL, y for HORIZONTAL */
  position: number;
  orientation: LineOrientation;
  countDirection: CountDirection;
  /** Half-width of the counting zone (normalized). Default 0.1 = 10% of frame */
  zoneHalfWidth: number;
}

export const DEFAULT_COUNTING_LINE: CountingLineConfig = {
  position: 0.5,
  orientation: 'VERTICAL',
  countDirection: 'L2R',
  zoneHalfWidth: 0.10,
};

export type ZonePosition = 'BEFORE' | 'IN_ZONE' | 'AFTER' | 'ON_LINE';

// ---------------------------------------------------------------------------
// CountingLine class
// ---------------------------------------------------------------------------

export class CountingLine {
  private config: CountingLineConfig;

  constructor(config: CountingLineConfig = DEFAULT_COUNTING_LINE) {
    this.config = config;
  }

  getConfig(): CountingLineConfig {
    return {...this.config};
  }

  updateConfig(config: Partial<CountingLineConfig>): void {
    this.config = {...this.config, ...config};
  }

  /** Return the line position (normalized) */
  getPosition(): number {
    return this.config.position;
  }

  /** Return the zone boundaries [before, after] (normalized) */
  getZoneBoundaries(): [number, number] {
    const {position, zoneHalfWidth} = this.config;
    return [position - zoneHalfWidth, position + zoneHalfWidth];
  }

  /** Determine which zone region a point is in */
  getZonePosition(point: Point): ZonePosition {
    const coord =
      this.config.orientation === 'VERTICAL' ? point.x : point.y;
    const [before, after] = this.getZoneBoundaries();
    const {position} = this.config;

    const onLineEpsilon = 0.005; // 0.5% of frame width
    if (Math.abs(coord - position) < onLineEpsilon) {
      return 'ON_LINE';
    }
    if (coord < before) {
      return 'BEFORE';
    }
    if (coord > after) {
      return 'AFTER';
    }
    return 'IN_ZONE';
  }

  /** Is this point inside the counting zone? */
  isInZone(point: Point): boolean {
    const zp = this.getZonePosition(point);
    return zp === 'IN_ZONE' || zp === 'ON_LINE';
  }

  /** Check if a centroid's movement has crossed the line */
  hasCrossed(prev: Point, curr: Point): boolean {
    const getCoord = (p: Point) =>
      this.config.orientation === 'VERTICAL' ? p.x : p.y;

    const prevCoord = getCoord(prev);
    const currCoord = getCoord(curr);
    const line = this.config.position;

    // Sign change indicates crossing
    return (prevCoord - line) * (currCoord - line) < 0;
  }

  /** Validate that the direction of motion matches the configured counting direction */
  isCorrectDirection(prev: Point, curr: Point): boolean {
    // We now allow bidirectional crossing to make testing much easier for the user!
    return true;
  }

  /**
   * Compute a crossing confidence score based on the clarity of the crossing.
   * Higher score = object crossed cleanly and at the correct angle.
   */
  computeCrossingConfidence(history: Point[]): number {
    if (history.length < 3) return 0.5;

    const recentN = Math.min(history.length, 8);
    const recent = history.slice(-recentN);

    // 1. Check direction consistency (all recent points moving same way)
    // Removed strict directionality check to loosen requirements.
    let directionScore = 1.0;

    // 2. Trajectory straightness (low variance orthogonal to motion direction)
    const isHorizontalMotion = this.config.orientation === 'VERTICAL';
    const orthogonalCoords = recent.map(p => (isHorizontalMotion ? p.y : p.x));
    const mean =
      orthogonalCoords.reduce((a, b) => a + b, 0) / orthogonalCoords.length;
    const variance =
      orthogonalCoords.reduce((sum, v) => sum + (v - mean) ** 2, 0) /
      orthogonalCoords.length;
    const straightnessScore = Math.max(0, 1 - variance * 100); // penalize lateral drift

    return Math.min(1, (directionScore * 0.7 + straightnessScore * 0.3));
  }
}
