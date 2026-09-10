/**
 * MockDetector.ts
 * Development/testing implementation of ObjectDetector.
 *
 * Generates synthetic detections that simulate pasta sachets moving
 * across the frame. Used in:
 *  - Phase 1–3 development (before the real TFLite model is available)
 *  - Unit tests
 *  - Performance benchmarking without a real model
 *  - CI/CD pipeline validation
 *
 * The mock generates objects that:
 *  - Start at a random position on one side of the frame
 *  - Move with constant velocity (simulating a conveyor belt)
 *  - Have realistic-looking bounding boxes
 *  - Can be configured to simulate overlap, occlusion, etc.
 */

import {BoundingBox} from '../utils/geometry';
import {ObjectDetector, RawDetection, DetectorMetadata} from './ObjectDetector';
import {Logger} from '../utils/logger';

const TAG = 'MockDetector';

// ---------------------------------------------------------------------------
// Simulated sachet state
// ---------------------------------------------------------------------------

interface SimulatedSachet {
  id: number;
  x: number; // normalized
  y: number; // normalized
  w: number; // normalized width
  h: number; // normalized height
  vx: number; // velocity x per frame
  vy: number; // velocity y per frame
  conf: number; // simulated detection confidence
  active: boolean;
  framesSinceSpawn: number;
  /** Randomly drop detection some frames to simulate occlusion */
  occlusionFrames: Set<number>;
}

// ---------------------------------------------------------------------------
// MockDetector configuration
// ---------------------------------------------------------------------------

export interface MockDetectorConfig {
  /** How many sachets are in the scene at once */
  maxConcurrentSachets: number;
  /** Frames between new sachet spawns */
  spawnIntervalFrames: number;
  /** Velocity (normalized per frame) in the x direction */
  velocityX: number;
  /** Slight random drift in y direction */
  velocityYVariance: number;
  /** Detection confidence range */
  minConf: number;
  maxConf: number;
  /** Probability of a detection being dropped (simulates occlusion/flicker) */
  dropProbability: number;
}

export const DEFAULT_MOCK_CONFIG: MockDetectorConfig = {
  maxConcurrentSachets: 3,
  spawnIntervalFrames: 20,
  velocityX: 0.012,
  velocityYVariance: 0.001,
  minConf: 0.65,
  maxConf: 0.95,
  dropProbability: 0.05,
};

// ---------------------------------------------------------------------------
// MockDetector
// ---------------------------------------------------------------------------

export class MockDetector implements ObjectDetector {
  private config: MockDetectorConfig;
  private sachets: SimulatedSachet[] = [];
  private frameCount = 0;
  private nextId = 1;
  private ready = false;

  constructor(config: MockDetectorConfig = DEFAULT_MOCK_CONFIG) {
    this.config = config;
  }

  async initialize(): Promise<void> {
    Logger.info(TAG, 'MockDetector initialized (no real model — development mode)');
    this.sachets = [];
    this.frameCount = 0;
    this.nextId = 1;
    this.ready = true;
  }

  async detect(
    _frameData: Uint8Array,
    frameWidth: number,
    frameHeight: number,
    _timestamp: number,
  ): Promise<RawDetection[]> {
    if (!this.ready) return [];
    this.frameCount++;

    // Spawn new sachet?
    if (
      this.frameCount % this.config.spawnIntervalFrames === 0 &&
      this.sachets.filter(s => s.active).length <
        this.config.maxConcurrentSachets
    ) {
      this._spawnSachet();
    }

    // Update all sachets
    const detections: RawDetection[] = [];

    for (const sachet of this.sachets) {
      if (!sachet.active) continue;

      // Move sachet
      sachet.x += sachet.vx;
      sachet.y += sachet.vy + (Math.random() - 0.5) * this.config.velocityYVariance;
      sachet.framesSinceSpawn++;

      // Remove if off screen
      if (sachet.x > 1.1) {
        sachet.active = false;
        continue;
      }

      // Simulate occlusion / flicker
      if (Math.random() < this.config.dropProbability) {
        continue; // drop this detection this frame
      }

      const bbox: BoundingBox = {
        x: Math.max(0, sachet.x - sachet.w / 2),
        y: Math.max(0, sachet.y - sachet.h / 2),
        w: sachet.w,
        h: sachet.h,
      };

      detections.push({
        bbox,
        confidence: sachet.conf + (Math.random() - 0.5) * 0.05,
        classId: 0,
        className: 'pasta_sachet',
      });
    }

    // Remove inactive sachets
    this.sachets = this.sachets.filter(s => s.active);

    return detections;
  }

  private _spawnSachet(): void {
    const conf =
      this.config.minConf +
      Math.random() * (this.config.maxConf - this.config.minConf);

    const sachet: SimulatedSachet = {
      id: this.nextId++,
      x: -0.05, // start just off the left edge
      y: 0.3 + Math.random() * 0.4, // random vertical position
      w: 0.08 + Math.random() * 0.04, // sachet width
      h: 0.06 + Math.random() * 0.03, // sachet height
      vx: this.config.velocityX * (0.9 + Math.random() * 0.2),
      vy: 0,
      conf,
      active: true,
      framesSinceSpawn: 0,
      occlusionFrames: new Set(),
    };

    this.sachets.push(sachet);
    Logger.debug(TAG, `Sachet ${sachet.id} spawned`, {
      x: sachet.x,
      y: sachet.y,
      vx: sachet.vx,
    });
  }

  dispose(): void {
    this.sachets = [];
    this.ready = false;
  }

  isReady(): boolean {
    return this.ready;
  }

  getMetadata(): DetectorMetadata {
    return {
      modelVersion: 'mock-v1.0',
      classNames: ['pasta_sachet'],
      inputWidth: 640,
      inputHeight: 640,
      defaultConfThreshold: 0.5,
      accelerated: false,
    };
  }
}
