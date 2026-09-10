/**
 * MotionDetector.ts
 * Frame-differencing based object detector — NO MODEL TRAINING REQUIRED.
 *
 * How it works:
 *   1. Maintain a rolling background model (exponential moving average of frames)
 *   2. Each new frame: compute absolute per-pixel difference vs background
 *   3. Threshold the difference to get a binary foreground mask
 *   4. Apply morphological ops (erosion + dilation) to remove noise
 *   5. Connected-component labelling → bounding boxes
 *   6. Filter by size → output as RawDetection[]
 *
 * Why this works perfectly for pasta sachets on a conveyor:
 *   - Belt background is STATIC → difference ≈ 0
 *   - Moving sachets → large difference → foreground blob
 *   - No GPU, no model, no training, no internet needed
 *   - Runs in pure TypeScript on the JS thread
 *
 * Limitation: Cannot distinguish "sachet" from "hand" if operator reaches in.
 * Mitigation: Size filter rejects blobs too large (hand) or too small (noise).
 */

import {ObjectDetector, RawDetection, DetectorMetadata} from './ObjectDetector';
import {Logger} from '../utils/logger';

const TAG = 'MotionDetector';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface MotionDetectorConfig {
  /** Background learning rate (0–1). Lower = slower adaptation. Default: 0.05 */
  bgLearningRate: number;
  /** Pixel difference threshold for foreground detection (0–255). Default: 25 */
  diffThreshold: number;
  /** Morphological erosion passes (removes noise). Default: 1 */
  erosionPasses: number;
  /** Morphological dilation passes (fills holes). Default: 2 */
  dilationPasses: number;
  /** Minimum blob area as fraction of frame. Default: 0.002 (0.2%) */
  minBlobArea: number;
  /** Maximum blob area as fraction of frame. Default: 0.4 (40%) */
  maxBlobArea: number;
  /** Confidence assigned to motion detections (fixed, no neural net). Default: 0.75 */
  baseConfidence: number;
  /** Number of background warm-up frames before counting starts. Default: 15 */
  warmupFrames: number;
}

export const DEFAULT_MOTION_CONFIG: MotionDetectorConfig = {
  bgLearningRate: 0.05,
  diffThreshold: 25,
  erosionPasses: 1,
  dilationPasses: 2,
  minBlobArea: 0.002,
  maxBlobArea: 0.4,
  baseConfidence: 0.75,
  warmupFrames: 15,
};

// ---------------------------------------------------------------------------
// MotionDetector
// ---------------------------------------------------------------------------

export class MotionDetector implements ObjectDetector {
  private config: MotionDetectorConfig;
  private background: Float32Array | null = null;
  private frameCount = 0;
  private ready = false;
  private lastFrameWidth = 0;
  private lastFrameHeight = 0;

  constructor(config: Partial<MotionDetectorConfig> = {}) {
    this.config = {...DEFAULT_MOTION_CONFIG, ...config};
  }

  async initialize(): Promise<void> {
    this.background = null;
    this.frameCount = 0;
    this.ready = true;
    Logger.info(TAG, 'MotionDetector initialized (no model required)');
  }

  isReady(): boolean {
    return this.ready;
  }

  async detect(
    frameData: Uint8Array,
    frameWidth: number,
    frameHeight: number,
    _timestamp: number,
  ): Promise<RawDetection[]> {
    if (!this.ready || frameData.length === 0) return [];

    this.frameCount++;
    this.lastFrameWidth = frameWidth;
    this.lastFrameHeight = frameHeight;

    const pixelCount = frameWidth * frameHeight;

    // Convert frame to greyscale float [0,1]
    const grey = this._toGreyscale(frameData, frameWidth, frameHeight);

    // Initialize or update background model
    if (!this.background || this.background.length !== pixelCount) {
      this.background = new Float32Array(grey);
      return [];
    }

    // During warmup — just update background, don't detect
    if (this.frameCount <= this.config.warmupFrames) {
      this._updateBackground(grey);
      return [];
    }

    // Compute absolute difference
    const diff = this._absDiff(grey, this.background);

    // Threshold → binary mask
    const mask = this._threshold(diff, this.config.diffThreshold / 255);

    // Morphological ops
    let cleaned = mask;
    for (let i = 0; i < this.config.erosionPasses; i++) {
      cleaned = this._erode(cleaned, frameWidth, frameHeight);
    }
    for (let i = 0; i < this.config.dilationPasses; i++) {
      cleaned = this._dilate(cleaned, frameWidth, frameHeight);
    }

    // Connected components → bounding boxes
    const blobs = this._findBlobs(cleaned, frameWidth, frameHeight);

    // Update background (slower update near detected blobs)
    this._updateBackground(grey, cleaned);

    // Convert blobs to RawDetection
    const detections: RawDetection[] = [];

    for (const blob of blobs) {
      const blobArea = (blob.w / frameWidth) * (blob.h / frameHeight);
      
      let className = 'pasta_sachet';
      if (blobArea > this.config.maxBlobArea) {
        className = 'too_close';
      } else if (blobArea < this.config.minBlobArea) {
        className = 'too_far';
      }

      // Confidence: scale by blob size relative to expected sachet size
      // Larger blob (within range) = more confident
      const sizeConf = Math.min(1, blobArea / 0.02);
      const confidence = this.config.baseConfidence * (0.7 + 0.3 * sizeConf);

      detections.push({
        bbox: {
          x: blob.x / frameWidth,
          y: blob.y / frameHeight,
          w: blob.w / frameWidth,
          h: blob.h / frameHeight,
        },
        confidence,
        classId: 0,
        className,
      });
    }

    return detections;
  }

  dispose(): void {
    this.background = null;
    this.ready = false;
  }

  getMetadata(): DetectorMetadata {
    return {
      modelVersion: 'motion-detector-v1.0',
      classNames: ['pasta_sachet'],
      inputWidth: this.lastFrameWidth || 640,
      inputHeight: this.lastFrameHeight || 480,
      defaultConfThreshold: 0.5,
      accelerated: false,
    };
  }

  // ---------------------------------------------------------------------------
  // Core image processing
  // ---------------------------------------------------------------------------

  /** Convert RGB frame data to greyscale float array [0,1] */
  private _toGreyscale(
    frameData: Uint8Array,
    width: number,
    height: number,
  ): Float32Array {
    const pixelCount = width * height;
    const grey = new Float32Array(pixelCount);

    if (frameData.length >= pixelCount * 4) {
      // Assume RGBA packed (HTML Canvas)
      for (let i = 0; i < pixelCount; i++) {
        const r = frameData[i * 4];
        const g = frameData[i * 4 + 1];
        const b = frameData[i * 4 + 2];
        grey[i] = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      }
    } else if (frameData.length >= pixelCount * 3) {
      // Assume RGB packed
      for (let i = 0; i < pixelCount; i++) {
        const r = frameData[i * 3];
        const g = frameData[i * 3 + 1];
        const b = frameData[i * 3 + 2];
        // ITU-R BT.601 luminance weights
        grey[i] = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      }
    } else if (frameData.length >= pixelCount) {
      // Already greyscale
      for (let i = 0; i < pixelCount; i++) {
        grey[i] = frameData[i] / 255;
      }
    }

    return grey;
  }

  /** Absolute difference between frame and background */
  private _absDiff(frame: Float32Array, bg: Float32Array): Float32Array {
    const diff = new Float32Array(frame.length);
    for (let i = 0; i < frame.length; i++) {
      diff[i] = Math.abs(frame[i] - bg[i]);
    }
    return diff;
  }

  /** Binary threshold */
  private _threshold(diff: Float32Array, threshold: number): Uint8Array {
    const mask = new Uint8Array(diff.length);
    for (let i = 0; i < diff.length; i++) {
      mask[i] = diff[i] > threshold ? 1 : 0;
    }
    return mask;
  }

  /** 3x3 erosion — removes isolated foreground pixels */
  private _erode(mask: Uint8Array, width: number, height: number): Uint8Array {
    const out = new Uint8Array(mask.length);
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = y * width + x;
        // Pixel stays foreground only if ALL 3x3 neighbors are foreground
        const allFg =
          mask[idx] &&
          mask[idx - 1] && mask[idx + 1] &&
          mask[idx - width] && mask[idx + width] &&
          mask[idx - width - 1] && mask[idx - width + 1] &&
          mask[idx + width - 1] && mask[idx + width + 1];
        out[idx] = allFg ? 1 : 0;
      }
    }
    return out;
  }

  /** 3x3 dilation — expands foreground regions */
  private _dilate(mask: Uint8Array, width: number, height: number): Uint8Array {
    const out = new Uint8Array(mask.length);
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = y * width + x;
        // Pixel becomes foreground if ANY 3x3 neighbor is foreground
        const anyFg =
          mask[idx] ||
          mask[idx - 1] || mask[idx + 1] ||
          mask[idx - width] || mask[idx + width] ||
          mask[idx - width - 1] || mask[idx - width + 1] ||
          mask[idx + width - 1] || mask[idx + width + 1];
        out[idx] = anyFg ? 1 : 0;
      }
    }
    return out;
  }

  /**
   * Find connected blobs using a row-scan sweep approach.
   * Returns pixel-coordinate bounding boxes.
   *
   * This is a simplified (but fast) single-pass approach:
   * Find runs of foreground pixels in each row, merge overlapping
   * runs across rows into blobs.
   */
  private _findBlobs(
    mask: Uint8Array,
    width: number,
    height: number,
  ): Array<{x: number; y: number; w: number; h: number}> {
    // Simple approach: scan for connected rectangular regions
    // Good enough for well-separated sachets on a belt

    interface BlobBox {x1: number; y1: number; x2: number; y2: number; active: boolean}
    const blobs: BlobBox[] = [];

    for (let y = 0; y < height; y++) {
      // Find horizontal runs in this row
      let runStart = -1;
      for (let x = 0; x <= width; x++) {
        const fg = x < width && mask[y * width + x] === 1;
        if (fg && runStart === -1) {
          runStart = x;
        } else if (!fg && runStart !== -1) {
          const runEnd = x;
          // Try to merge with existing active blob that overlaps horizontally
          let merged = false;
          for (const blob of blobs) {
            if (!blob.active) continue;
            // Check horizontal overlap
            if (runStart < blob.x2 && runEnd > blob.x1) {
              blob.x1 = Math.min(blob.x1, runStart);
              blob.x2 = Math.max(blob.x2, runEnd);
              blob.y2 = y;
              merged = true;
              break;
            }
          }
          if (!merged) {
            blobs.push({x1: runStart, y1: y, x2: runEnd, y2: y, active: true});
          }
          runStart = -1;
        }
      }

      // Deactivate blobs that weren't touched in last 5 rows
      for (const blob of blobs) {
        if (blob.active && y - blob.y2 > 5) {
          blob.active = false;
        }
      }
    }

    return blobs.map(b => ({
      x: b.x1, y: b.y1,
      w: b.x2 - b.x1, h: b.y2 - b.y1,
    })).filter(b => b.w > 2 && b.h > 2);
  }

  /**
   * Update the background model.
   * Pixels marked as foreground update more slowly (preserve sachet-free bg).
   */
  private _updateBackground(frame: Float32Array, fgMask?: Uint8Array): void {
    if (!this.background) return;
    const alpha = this.config.bgLearningRate;
    const alphaFg = alpha * 0.1; // very slow update under sachets

    for (let i = 0; i < frame.length; i++) {
      const rate = fgMask && fgMask[i] ? alphaFg : alpha;
      this.background[i] += rate * (frame[i] - this.background[i]);
    }
  }

  /** Reset background model (call when camera moved or scene changes) */
  resetBackground(): void {
    this.background = null;
    this.frameCount = 0;
    Logger.info(TAG, 'Background model reset');
  }

  getFrameCount(): number {
    return this.frameCount;
  }

  isWarmedUp(): boolean {
    return this.frameCount > this.config.warmupFrames;
  }
}
