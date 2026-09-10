/**
 * ConfidenceEngine.ts
 * Multi-factor confidence scoring system.
 *
 * The neural network's raw detection confidence is just ONE of many
 * factors. This engine computes a holistic system confidence that the
 * operator can trust.
 *
 * Factors weighted in the overall confidence:
 *   - detector_confidence  (neural net output)
 *   - track_stability      (hit streak, time since lost)
 *   - trajectory_quality   (straight, consistent velocity)
 *   - crossing_certainty   (clean line crossing vs. wobble)
 *   - object_size          (large objects = more reliable detection)
 *   - lighting_quality     (estimated from frame brightness)
 *   - camera_stability     (inter-frame motion estimate)
 *   - overlap_penalty      (many overlapping objects = less reliable)
 */

import {Track} from '../tracking/Track';
import {Logger} from '../utils/logger';

const TAG = 'ConfidenceEngine';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ConfidenceFactors {
  detectorConfidence: number;    // 0–1 from neural net
  trackStability: number;        // 0–1
  trajectoryQuality: number;     // 0–1
  crossingCertainty: number;     // 0–1
  objectSize: number;            // 0–1
  lightingQuality: number;       // 0–1
  cameraStability: number;       // 0–1
  overlapPenalty: number;        // 0–1 (1 = no penalty)
}

export interface SystemHealth {
  overall: number;               // 0–1
  factors: ConfidenceFactors;
  warnings: SystemWarning[];
  isCountingReliable: boolean;
}

export interface SystemWarning {
  type: WarningType;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  message: string;
}

export type WarningType =
  | 'LOW_LIGHTING'
  | 'POOR_LIGHTING'
  | 'CAMERA_UNSTABLE'
  | 'OBJECTS_TOO_SMALL'
  | 'TOO_MUCH_OVERLAP'
  | 'LOW_DETECTION_CONFIDENCE'
  | 'TRACKING_UNSTABLE'
  | 'EXCESSIVE_OCCLUSION';

// ---------------------------------------------------------------------------
// Thresholds
// ---------------------------------------------------------------------------

const MIN_RELIABLE_CONFIDENCE = 0.65;
const LIGHTING_LOW_THRESHOLD = 0.3;
const LIGHTING_POOR_THRESHOLD = 0.15;
const SIZE_TOO_SMALL_THRESHOLD = 0.002;
const OVERLAP_RATIO_HIGH_THRESHOLD = 0.4;
const CAMERA_STABILITY_LOW_THRESHOLD = 0.5;

// ---------------------------------------------------------------------------
// ConfidenceEngine
// ---------------------------------------------------------------------------

export class ConfidenceEngine {
  private lastLightingEstimate = 1.0;
  private lastCameraStability = 1.0;
  private lastOverlapRatio = 0.0;

  // ---------------------------------------------------------------------------
  // Update environmental estimates (call once per frame)
  // ---------------------------------------------------------------------------

  updateLightingEstimate(brightness: number): void {
    // Smoothed estimate
    this.lastLightingEstimate =
      this.lastLightingEstimate * 0.7 + brightness * 0.3;
  }

  updateCameraStability(motionMagnitude: number): void {
    // Convert motion magnitude to stability score (inverse)
    // motionMagnitude: 0 = no motion, 1 = full-frame motion
    const stability = Math.max(0, 1 - motionMagnitude * 5);
    this.lastCameraStability = this.lastCameraStability * 0.7 + stability * 0.3;
  }

  updateOverlapRatio(ratio: number): void {
    this.lastOverlapRatio = this.lastOverlapRatio * 0.8 + ratio * 0.2;
  }

  // ---------------------------------------------------------------------------
  // Compute confidence for a single crossing event
  // ---------------------------------------------------------------------------

  computeCrossingConfidence(
    track: Track,
    crossingConf: number,
  ): ConfidenceFactors {
    const trackStability = this._computeTrackStability(track);
    const trajectoryQuality = this._computeTrajectoryQuality(track);
    const objectSize = this._computeObjectSizeScore(track);
    const overlapPenalty = 1 - Math.min(this.lastOverlapRatio, 0.8);

    return {
      detectorConfidence: track.detectionConf,
      trackStability,
      trajectoryQuality,
      crossingCertainty: crossingConf,
      objectSize,
      lightingQuality: this.lastLightingEstimate,
      cameraStability: this.lastCameraStability,
      overlapPenalty,
    };
  }

  computeOverallFromFactors(factors: ConfidenceFactors): number {
    return (
      factors.detectorConfidence * 0.25 +
      factors.trackStability * 0.20 +
      factors.trajectoryQuality * 0.15 +
      factors.crossingCertainty * 0.20 +
      factors.objectSize * 0.05 +
      factors.lightingQuality * 0.08 +
      factors.cameraStability * 0.05 +
      factors.overlapPenalty * 0.02
    );
  }

  // ---------------------------------------------------------------------------
  // System health assessment (call periodically for UI display)
  // ---------------------------------------------------------------------------

  assessSystemHealth(activeTracks: Track[]): SystemHealth {
    const warnings: SystemWarning[] = [];

    // Lighting
    if (this.lastLightingEstimate < LIGHTING_POOR_THRESHOLD) {
      warnings.push({
        type: 'POOR_LIGHTING',
        severity: 'CRITICAL',
        message: 'Insufficient lighting — counting unreliable. Improve lighting.',
      });
    } else if (this.lastLightingEstimate < LIGHTING_LOW_THRESHOLD) {
      warnings.push({
        type: 'LOW_LIGHTING',
        severity: 'HIGH',
        message: 'Low lighting detected. Move to better-lit area.',
      });
    }

    // Camera stability
    if (this.lastCameraStability < CAMERA_STABILITY_LOW_THRESHOLD) {
      warnings.push({
        type: 'CAMERA_UNSTABLE',
        severity: 'HIGH',
        message: 'Camera movement detected. Mount or stabilize the phone.',
      });
    }

    // Object size
    if (activeTracks.length > 0) {
      const avgArea =
        activeTracks.reduce(
          (sum, t) => sum + t.bbox.w * t.bbox.h,
          0,
        ) / activeTracks.length;

      if (avgArea < SIZE_TOO_SMALL_THRESHOLD) {
        warnings.push({
          type: 'OBJECTS_TOO_SMALL',
          severity: 'HIGH',
          message: 'Sachets are too small. Move camera closer.',
        });
      }
    }

    // Overlap
    if (this.lastOverlapRatio > OVERLAP_RATIO_HIGH_THRESHOLD) {
      warnings.push({
        type: 'TOO_MUCH_OVERLAP',
        severity: 'MEDIUM',
        message:
          'Too much overlap between sachets. Adjust camera or reduce flow.',
      });
    }

    // Compute overall health
    const factors: ConfidenceFactors = {
      detectorConfidence: 1.0, // assume OK if no tracks
      trackStability: activeTracks.length > 0
        ? activeTracks.reduce((s, t) => s + t.trackConf, 0) / activeTracks.length
        : 1.0,
      trajectoryQuality: 1.0,
      crossingCertainty: 1.0,
      objectSize: 1.0,
      lightingQuality: this.lastLightingEstimate,
      cameraStability: this.lastCameraStability,
      overlapPenalty: 1 - this.lastOverlapRatio,
    };

    const overall = this.computeOverallFromFactors(factors);
    const isReliable = overall >= MIN_RELIABLE_CONFIDENCE && warnings.every(w => w.severity !== 'CRITICAL');

    if (!isReliable) {
      Logger.warn(TAG, 'System health: UNRELIABLE', {overall, warnings: warnings.length});
    }

    return {overall, factors, warnings, isCountingReliable: isReliable};
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private _computeTrackStability(track: Track): number {
    // Higher hit streak = more stable
    const hitScore = Math.min(1, track.hitStreak / 10);
    // Lower time since lost = more stable
    const lostScore = Math.max(0, 1 - track.timeSinceLost / 5);
    return hitScore * 0.6 + lostScore * 0.4;
  }

  private _computeTrajectoryQuality(track: Track): number {
    if (track.history.length < 3) return 0.5;
    const n = Math.min(track.history.length, 10);
    const recent = track.history.slice(-n);

    // Measure velocity consistency (low variance = good quality)
    const velocities: number[] = [];
    for (let i = 1; i < recent.length; i++) {
      const dx = recent[i].x - recent[i - 1].x;
      const dy = recent[i].y - recent[i - 1].y;
      velocities.push(Math.sqrt(dx * dx + dy * dy));
    }
    const mean = velocities.reduce((a, b) => a + b, 0) / velocities.length;
    const variance =
      velocities.reduce((s, v) => s + (v - mean) ** 2, 0) / velocities.length;

    return Math.max(0, 1 - variance * 1000);
  }

  private _computeObjectSizeScore(track: Track): number {
    const area = track.bbox.w * track.bbox.h;
    // Optimal size: 1–20% of frame
    if (area < 0.001) return 0.1;
    if (area < 0.005) return 0.5;
    if (area < 0.20) return 1.0;
    if (area < 0.40) return 0.7;
    return 0.4; // Very large — probably too close
  }
}
