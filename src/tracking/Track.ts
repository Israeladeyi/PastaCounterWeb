/**
 * Track.ts — Track entity with lifecycle state machine support.
 */
import {BoundingBox, bboxCenter, Point} from '../utils/geometry';

// ---------------------------------------------------------------------------
// TrackState enum
// ---------------------------------------------------------------------------
export enum TrackState {
  DETECTED    = 'DETECTED',
  CONFIRMED   = 'CONFIRMED',
  TRACKING    = 'TRACKING',
  APPROACHING = 'APPROACHING',
  CROSSED     = 'CROSSED',
  COUNTED     = 'COUNTED',
  EXITED      = 'EXITED',
  LOST        = 'LOST',
  REACQUIRED  = 'REACQUIRED',
  OCCLUDED    = 'OCCLUDED',
  MERGED      = 'MERGED',
  REJECTED    = 'REJECTED',
  DELETED     = 'DELETED',
}

// ---------------------------------------------------------------------------
// Track entity
// ---------------------------------------------------------------------------
export interface Track {
  /** Monotonically increasing ID assigned by ByteTracker */
  id: number;
  /** Current bounding box in normalized coordinates [0,1] */
  bbox: BoundingBox;
  /** Centroid in normalized coordinates */
  center: Point;
  /** Historical centroid positions (max 30 frames) */
  history: Point[];
  /** Current lifecycle state */
  state: TrackState;
  /** Detection confidence from last matched detection */
  detectionConf: number;
  /** Smoothed track confidence (function of hit streak, time since lost) */
  trackConf: number;
  /** Class id from detector */
  classId: number;
  /** Class label from detector */
  className: string;
  /** Frames since last matched detection */
  timeSinceLost: number;
  /** Consecutive detection matches */
  hitStreak: number;
  /** Frame index when this track was created */
  createdAtFrame: number;
  /** Timestamp (ms) when track was created */
  createdAtTs: number;
  /** Whether the crossing was detected */
  crossingDetected: boolean;
  /** Whether this track has been counted */
  counted: boolean;
  /** Kalman filter state — stored externally in ByteTracker but referenced here */
  kalmanId?: number;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

let _nextId = 1;

/** Reset the track ID counter (only for testing) */
export function __resetTrackIdCounter(): void {
  _nextId = 1;
}

export function createTrack(
  bbox: BoundingBox,
  detectionConf: number,
  classId: number,
  className: string,
  createdAtFrame: number,
  createdAtTs: number,
): Track {
  const center = bboxCenter(bbox);
  return {
    id: _nextId++,
    bbox,
    center,
    history: [center],
    state: TrackState.DETECTED,
    detectionConf,
    trackConf: detectionConf * 0.5, // low initial confidence
    classId,
    className,
    timeSinceLost: 0,
    hitStreak: 1,
    createdAtFrame,
    createdAtTs,
    crossingDetected: false,
    counted: false,
  };
}

/** Update a track with a new matched detection */
export function updateTrackDetection(
  track: Track,
  bbox: BoundingBox,
  detectionConf: number,
): void {
  track.bbox = bbox;
  track.center = bboxCenter(bbox);
  track.history.push(track.center);
  if (track.history.length > 30) track.history.shift();
  track.detectionConf = detectionConf;
  track.timeSinceLost = 0;
  track.hitStreak++;
  // Smoothed track confidence increases with hit streak
  const hitScore = Math.min(1, track.hitStreak / 10);
  track.trackConf = detectionConf * 0.5 + hitScore * 0.5;
}

/** Mark a track as lost (no detection match this frame) */
export function markTrackLost(track: Track): void {
  track.timeSinceLost++;
  track.hitStreak = 0;
  track.trackConf = Math.max(0, track.trackConf - 0.05);
}
