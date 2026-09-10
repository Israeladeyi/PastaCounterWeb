/**
 * ObjectDetector.ts
 * Abstract interface for all object detector implementations.
 *
 * The application is designed around this interface so that:
 *  - MockDetector can be used during development/testing
 *  - TFLiteDetector can be dropped in for production without
 *    changing any downstream code (tracker, counting engine, etc.)
 *  - Future detectors (ONNX, CoreML, cloud) can be added cleanly
 */

import {BoundingBox} from '../utils/geometry';

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export interface RawDetection {
  bbox: BoundingBox;
  confidence: number;
  classId: number;
  className: string;
}

export interface DetectorMetadata {
  /** Model version string (stored in every session record) */
  modelVersion: string;
  /** Class names in index order */
  classNames: string[];
  /** Model input width in pixels */
  inputWidth: number;
  /** Model input height in pixels */
  inputHeight: number;
  /** Default confidence threshold the model was trained/calibrated against */
  defaultConfThreshold: number;
  /** Whether hardware acceleration is active */
  accelerated: boolean;
}

// ---------------------------------------------------------------------------
// ObjectDetector interface
// ---------------------------------------------------------------------------

export interface ObjectDetector {
  /**
   * Initialize the detector (load model, allocate buffers, warm up).
   * Should be called once before the first inference.
   */
  initialize(): Promise<void>;

  /**
   * Run inference on a single frame.
   *
   * @param frameData - Raw frame data (Uint8Array, RGB, size inputWidth×inputHeight)
   * @param frameWidth  - Original frame width in pixels
   * @param frameHeight - Original frame height in pixels
   * @param timestamp   - Frame timestamp in ms
   * @returns Array of raw detections (before NMS / filtering)
   */
  detect(
    frameData: Uint8Array,
    frameWidth: number,
    frameHeight: number,
    timestamp: number,
  ): Promise<RawDetection[]>;

  /** Release model resources */
  dispose(): void;

  /** Metadata about the loaded model */
  getMetadata(): DetectorMetadata;

  /** Whether the detector is ready to run inference */
  isReady(): boolean;
}
