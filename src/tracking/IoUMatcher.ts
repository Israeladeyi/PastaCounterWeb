/**
 * IoUMatcher.ts
 * Lightweight IoU-based track-detection matching.
 * Used as the fallback matcher when ByteTrack is not available,
 * or for the secondary association pass (low-confidence detections).
 */

import {BoundingBox, computeIoU} from '../utils/geometry';
import {hungarianMatch} from './HungarianMatcher';

/**
 * Match a list of tracks to a list of detections using IoU cost.
 *
 * @param trackBboxes      - Current bounding boxes of active tracks
 * @param detectionBboxes  - Bounding boxes from the detector
 * @param iouThreshold     - Minimum IoU required for a valid match (0–1)
 */
export function matchByIoU(
  trackBboxes: BoundingBox[],
  detectionBboxes: BoundingBox[],
  _iouThreshold: number,
): [number, number][] {
  if (trackBboxes.length === 0 || detectionBboxes.length === 0) {
    return [];
  }

  // Build cost matrix: cost = 1 - IoU  (lower is better)
  const costMatrix: number[][] = trackBboxes.map(tb =>
    detectionBboxes.map(db => {
      const iou = computeIoU(tb, db);
      return 1 - iou;
    }),
  );

  // Maximum cost = 1 - iouThreshold (assignments above this are rejected)
  return hungarianMatch(costMatrix);
}
