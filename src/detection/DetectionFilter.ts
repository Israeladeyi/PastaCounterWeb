/**
 * DetectionFilter.ts
 * Post-processing filter applied to raw detector output.
 *
 * Steps:
 *  1. Confidence threshold filtering
 *  2. Size filtering (min/max bounding box area)
 *  3. Non-Maximum Suppression (NMS) — prevents duplicate detections
 *     of the same object at slightly different positions
 *  4. Class filtering (only count allowed classes)
 *
 * NMS Implementation:
 *  - Sort by confidence (descending)
 *  - Greedily select the highest-confidence box
 *  - Suppress boxes with IoU > nmsThreshold against selected box
 *  - Repeat for remaining boxes
 */

import {BoundingBox, bboxArea, computeIoU} from '../utils/geometry';
import {RawDetection} from './ObjectDetector';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface FilterConfig {
  /** Minimum detection confidence (0–1) */
  minConfidence: number;
  /** Minimum bounding box area (normalized, 0–1) */
  minArea: number;
  /** Maximum bounding box area (normalized, 0–1) */
  maxArea: number;
  /** NMS IoU threshold — boxes with IoU > this are suppressed */
  nmsThreshold: number;
  /** Class IDs to count (empty = accept all) */
  allowedClassIds: number[];
}

export const DEFAULT_FILTER_CONFIG: FilterConfig = {
  minConfidence: 0.4,
  minArea: 0.001,   // 0.1% of frame — very small sachets
  maxArea: 0.5,     // 50% of frame — reject absurdly large detections
  nmsThreshold: 0.45,
  allowedClassIds: [],
};

// ---------------------------------------------------------------------------
// DetectionFilter
// ---------------------------------------------------------------------------

export class DetectionFilter {
  private config: FilterConfig;

  constructor(config: FilterConfig = DEFAULT_FILTER_CONFIG) {
    this.config = config;
  }

  updateConfig(config: Partial<FilterConfig>): void {
    this.config = {...this.config, ...config};
  }

  /**
   * Apply all filters to raw detector output.
   * Returns filtered detections suitable for the tracker.
   */
  filter(rawDetections: RawDetection[]): RawDetection[] {
    let dets = rawDetections;

    // 1. Confidence filter
    dets = dets.filter(d => d.confidence >= this.config.minConfidence);

    // 2. Class filter
    if (this.config.allowedClassIds.length > 0) {
      dets = dets.filter(d =>
        this.config.allowedClassIds.includes(d.classId),
      );
    }

    // 3. Size filter
    dets = dets.filter(d => {
      const area = bboxArea(d.bbox);
      return area >= this.config.minArea && area <= this.config.maxArea;
    });

    // 4. NMS per class
    dets = this._applyNMS(dets);

    return dets;
  }

  private _applyNMS(detections: RawDetection[]): RawDetection[] {
    if (detections.length === 0) return [];

    // Group by class for per-class NMS
    const byClass = new Map<number, RawDetection[]>();
    for (const det of detections) {
      if (!byClass.has(det.classId)) byClass.set(det.classId, []);
      byClass.get(det.classId)!.push(det);
    }

    const result: RawDetection[] = [];
    for (const classGroup of byClass.values()) {
      result.push(...this._nms(classGroup, this.config.nmsThreshold));
    }
    return result;
  }

  private _nms(
    detections: RawDetection[],
    iouThreshold: number,
  ): RawDetection[] {
    // Sort by confidence descending
    const sorted = [...detections].sort((a, b) => b.confidence - a.confidence);
    const kept: RawDetection[] = [];

    while (sorted.length > 0) {
      const top = sorted.shift()!;
      kept.push(top);

      // Remove boxes with high IoU against the selected box
      let i = 0;
      while (i < sorted.length) {
        if (computeIoU(top.bbox, sorted[i].bbox) > iouThreshold) {
          sorted.splice(i, 1);
        } else {
          i++;
        }
      }
    }

    return kept;
  }

  getConfig(): FilterConfig {
    return {...this.config};
  }
}
