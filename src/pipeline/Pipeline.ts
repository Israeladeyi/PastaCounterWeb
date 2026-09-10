import { TensorflowDetector } from '../detection/TensorflowDetector';
import { ByteTracker } from '../tracking/ByteTracker';
import { CountingEngine } from '../counting/CountingEngine';
import { SessionManager } from '../session/SessionManager';
import { BoundingBox } from '../utils/geometry';
import { Track } from '../tracking/Track';
import { ConfidenceEngine } from '../confidence/ConfidenceEngine';

import { CountingLine, CountingLineConfig } from '../counting/CountingLine';
import { DuplicateGuard } from '../counting/DuplicateGuard';

export interface FrameData {
  width: number;
  height: number;
  data?: Uint8ClampedArray; // Kept for backwards compatibility if needed
  videoElement: HTMLVideoElement;
  timestamp: number;
}

export interface PipelineResult {
  boxes: BoundingBox[];
  tracks: Track[];
  count: number;
  systemConfidence: number;
  warnings: string[];
}

export class Pipeline {
  private detector: TensorflowDetector;
  private tracker: ByteTracker;
  private engine: CountingEngine;
  private countingLine: CountingLine;
  private sessionManager: SessionManager;
  private confidenceEngine: ConfidenceEngine;

  private isProcessing = false;


  constructor() {
    this.detector = new TensorflowDetector();
    this.tracker = new ByteTracker();
    
    this.sessionManager = new SessionManager();
    
    // Counting line positioned at 60% down the screen, expecting downward movement
    this.countingLine = new CountingLine({ 
      position: 0.6, 
      orientation: 'HORIZONTAL', 
      countDirection: 'T2B', 
      zoneHalfWidth: 0.1 
    });
    this.engine = new CountingEngine(
      this.countingLine,
      new DuplicateGuard()
    );

    // Route counting events into the session manager
    this.engine.setEventListener((event) => {
      this.sessionManager.onCountEvent(event);
    });

    this.confidenceEngine = new ConfidenceEngine();
  }

  public async processFrame(frame: FrameData): Promise<PipelineResult | null> {
    if (this.isProcessing) return null;
    this.isProcessing = true;

    try {
      // 1. Detection (Tensorflow COCO-SSD)
      const detections = await this.detector.detect(frame.videoElement, frame.timestamp);

      // In the new TF model, we accept any object that is detected to be counted.
      // E.g., if it detects a "cell phone" (often confused for a pen) or "bottle".
      const validDetections = detections; 
      
      // We don't have hardcoded proximity warnings in TF right now, but we can infer them from bounding box size if needed later.
      const warnings: string[] = [];

      // 2. Tracking (Kalman + ByteTrack)
      const tracks = this.tracker.update(validDetections, frame.timestamp);

      // 3. Counting Engine (Line crossing, state machine)
      this.engine.processTracks(tracks, frame.timestamp);

      // 4. Confidence Evaluation
      const health = this.confidenceEngine.assessSystemHealth(tracks);

      return {
        boxes: validDetections.map(d => {
          // We will inject the class name into the track so it can be rendered
          return { ...d.bbox, label: d.className };
        }),
        tracks: tracks,
        count: this.sessionManager.getSnapshot().confirmedCount,
        systemConfidence: health.overall,
        warnings
      };
    } finally {
      this.isProcessing = false;
    }
  }

  public reset() {
    this.tracker = new ByteTracker();
    this.detector.resetBackground();
    this.engine.reset();
  }

  public updateConfig(lineConfig: CountingLineConfig, sessionDurationMs: number) {
    this.countingLine.updateConfig(lineConfig);
    this.sessionManager.updateConfig({ durationMs: sessionDurationMs });
  }

  public getSessionManager() {
    return this.sessionManager;
  }
}
