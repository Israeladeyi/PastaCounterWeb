/**
 * ByteTracker.ts — ByteTrack multi-object tracker in TypeScript
 * 3-pass association:
 *   Pass 1: high-conf detections vs confirmed tracks (IoU)
 *   Pass 2: low-conf detections vs unmatched confirmed tracks (IoU)
 *   Pass 3: unmatched detections vs lost tracks (IoU)
 */
import {BoundingBox, computeIoUMatrix} from '../utils/geometry';
import {Track, TrackState, createTrack, updateTrackDetection, markTrackLost} from './Track';
import {hungarianMatch} from './HungarianMatcher';
import {KalmanFilter2D} from './KalmanFilter';

export interface Detection {
  bbox: BoundingBox;
  confidence: number;
  classId: number;
  className: string;
}

export interface ByteTrackerConfig {
  trackThreshold: number;   // high-conf threshold for Pass 1
  matchThreshold: number;   // IoU threshold for matching
  lowThreshold: number;     // low-conf threshold for Pass 2
  minHits: number;          // hits before CONFIRMED
  maxLost: number;          // frames before DELETED
}

export const DEFAULT_BYTETRACK_CONFIG: ByteTrackerConfig = {
  trackThreshold: 0.5,
  matchThreshold: 0.3,
  lowThreshold: 0.1,
  minHits: 3,
  maxLost: 15,
};

export class ByteTracker {
  private config: ByteTrackerConfig;
  private tracks: Track[] = [];
  private lostTracks: Track[] = [];
  private kalmanFilters: Map<number, KalmanFilter2D> = new Map();
  private frameIndex = 0;

  constructor(config: ByteTrackerConfig = DEFAULT_BYTETRACK_CONFIG) {
    this.config = config;
  }

  reset(): void {
    this.tracks = [];
    this.lostTracks = [];
    this.kalmanFilters.clear();
    this.frameIndex = 0;
  }

  update(detections: Detection[], timestamp: number): Track[] {
    this.frameIndex++;

    // Kalman predict all active tracks
    for (const track of this.tracks) {
      const kf = this.kalmanFilters.get(track.id);
      if (kf) {
        const predicted = kf.predict();
        track.center = {x: predicted.x, y: predicted.y};
      }
    }

    // Split detections by confidence
    const highDets = detections.filter(d => d.confidence >= this.config.trackThreshold);
    const lowDets  = detections.filter(d =>
      d.confidence >= this.config.lowThreshold &&
      d.confidence <  this.config.trackThreshold,
    );

    const confirmedTracks = this.tracks.filter(t =>
      t.state === TrackState.CONFIRMED ||
      t.state === TrackState.TRACKING   ||
      t.state === TrackState.APPROACHING ||
      t.state === TrackState.COUNTED    ||
      t.state === TrackState.EXITED,
    );
    const unconfirmedTracks = this.tracks.filter(t => t.state === TrackState.DETECTED);

    // ---- PASS 1: high-conf vs confirmed ----
    const {matched: m1, unmatchedDets: udHigh, unmatchedTracks: utConfirmed} =
      this._match(highDets, confirmedTracks);

    for (const [detIdx, trackIdx] of m1) {
      const det = highDets[detIdx];
      const track = confirmedTracks[trackIdx];
      updateTrackDetection(track, det.bbox, det.confidence);
      const kf = this.kalmanFilters.get(track.id);
      if (kf) kf.update(track.center.x, track.center.y);
      this._maybePromote(track);
    }

    // ---- PASS 2: low-conf vs unmatched confirmed ----
    const unmatchedConfirmed = utConfirmed.map(i => confirmedTracks[i]);
    const {matched: m2, unmatchedTracks: utConfirmed2} =
      this._match(lowDets, unmatchedConfirmed);

    for (const [detIdx, trackIdx] of m2) {
      const det = lowDets[detIdx];
      const track = unmatchedConfirmed[trackIdx];
      updateTrackDetection(track, det.bbox, det.confidence);
      const kf = this.kalmanFilters.get(track.id);
      if (kf) kf.update(track.center.x, track.center.y);
    }

    // ---- PASS 3: unmatched high-conf vs lost tracks ----
    const remainingHighDetIdxs = udHigh;
    const remainingHighDets = remainingHighDetIdxs.map(i => highDets[i]);
    const {matched: m3, unmatchedDets: udFinal} =
      this._match(remainingHighDets, this.lostTracks);

    for (const [detIdx, trackIdx] of m3) {
      const det = remainingHighDets[detIdx];
      const track = this.lostTracks[trackIdx];
      updateTrackDetection(track, det.bbox, det.confidence);
      track.state = TrackState.REACQUIRED;
      const kf = this.kalmanFilters.get(track.id);
      if (kf) kf.update(track.center.x, track.center.y);
      this.tracks.push(track);
    }

    // Remove matched lost tracks
    const matchedLostIdxs = new Set(m3.map(([, ti]) => ti));
    this.lostTracks = this.lostTracks.filter((_, i) => !matchedLostIdxs.has(i));

    // Mark unmatched confirmed tracks as lost
    const finalUnmatchedConfirmed = utConfirmed2.map(i => unmatchedConfirmed[i]);
    for (const track of finalUnmatchedConfirmed) {
      markTrackLost(track);
      if (track.timeSinceLost > this.config.maxLost) {
        track.state = TrackState.DELETED;
      } else {
        track.state = TrackState.LOST;
        this.lostTracks.push(track);
      }
    }

    // Create new tracks from unmatched final detections
    for (const detIdx of udFinal) {
      const det = remainingHighDets[detIdx];
      const newTrack = createTrack(
        det.bbox, det.confidence, det.classId, det.className,
        this.frameIndex, timestamp,
      );
      const kf = new KalmanFilter2D();
      kf.initialize(newTrack.center.x, newTrack.center.y);
      this.kalmanFilters.set(newTrack.id, kf);
      this.tracks.push(newTrack);
    }

    // Handle unconfirmed tracks that still unmatched
    for (const track of unconfirmedTracks) {
      markTrackLost(track);
      if (track.timeSinceLost > 2) {
        track.state = TrackState.DELETED;
      }
    }

    // Cleanup
    this.tracks = this.tracks.filter(t => t.state !== TrackState.DELETED);
    this.lostTracks = this.lostTracks.filter(t => t.timeSinceLost <= this.config.maxLost);

    // Remove kalman filters for deleted tracks
    const activeIds = new Set([
      ...this.tracks.map(t => t.id),
      ...this.lostTracks.map(t => t.id),
    ]);
    for (const id of this.kalmanFilters.keys()) {
      if (!activeIds.has(id)) this.kalmanFilters.delete(id);
    }

    return this.tracks.filter(t =>
      t.state !== TrackState.DELETED &&
      t.state !== TrackState.REJECTED,
    );
  }

  private _match(
    dets: Detection[],
    tracks: Track[],
  ): {matched: [number, number][]; unmatchedDets: number[]; unmatchedTracks: number[]} {
    if (dets.length === 0 || tracks.length === 0) {
      return {
        matched: [],
        unmatchedDets: dets.map((_, i) => i),
        unmatchedTracks: tracks.map((_, i) => i),
      };
    }

    const trackBboxes = tracks.map(t => t.bbox);
    const detBboxes   = dets.map(d => d.bbox);

    // Cost matrix: 1 - IoU (we minimize)
    const iouMatrix = computeIoUMatrix(detBboxes, trackBboxes);
    const costMatrix = iouMatrix.map(row => row.map(v => 1 - v));

    const assignment = hungarianMatch(costMatrix);

    const matched: [number, number][] = [];
    const matchedDetIdxs = new Set<number>();
    const matchedTrackIdxs = new Set<number>();

    for (const [detIdx, trackIdx] of assignment) {
      const iou = iouMatrix[detIdx][trackIdx];
      if (iou < this.config.matchThreshold) continue;
      matched.push([detIdx, trackIdx]);
      matchedDetIdxs.add(detIdx);
      matchedTrackIdxs.add(trackIdx);
    }

    const unmatchedDets = dets.map((_, i) => i).filter(i => !matchedDetIdxs.has(i));
    const unmatchedTracks = tracks.map((_, i) => i).filter(i => !matchedTrackIdxs.has(i));

    return {matched, unmatchedDets, unmatchedTracks};
  }

  private _maybePromote(track: Track): void {
    if (track.state === TrackState.DETECTED && track.hitStreak >= this.config.minHits) {
      track.state = TrackState.CONFIRMED;
    }
    if (track.state === TrackState.CONFIRMED) {
      track.state = TrackState.TRACKING;
    }
    if (track.state === TrackState.REACQUIRED) {
      track.state = TrackState.TRACKING;
    }
  }

  getActiveTracks(): Track[] {
    return this.tracks;
  }
}
