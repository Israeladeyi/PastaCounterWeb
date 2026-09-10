import { MotionDetector } from '../detection/MotionDetector';
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
  data: Uint8ClampedArray;
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
  private detector: MotionDetector;
  private tracker: ByteTracker;
  private engine: CountingEngine;
  private countingLine: CountingLine;
  private sessionManager: SessionManager;
  private confidenceEngine: ConfidenceEngine;

  private isProcessing = false;
  private lastFrameTime = 0;

  constructor() {
    this.detector = new MotionDetector();
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
      const dt = this.lastFrameTime === 0 ? 33 : frame.timestamp - this.lastFrameTime;
      this.lastFrameTime = frame.timestamp;

      // 1. Detection (Motion Subtraction)
      const detections = await this.detector.detect(frame.data as unknown as Uint8Array, frame.width, frame.height, frame.timestamp);

      const validDetections = detections.filter(d => d.className === 'pasta_sachet');
      const warnings = Array.from(new Set(detections.filter(d => d.className !== 'pasta_sachet').map(d => d.className)));

      // 2. Tracking (Kalman + ByteTrack)
      const tracks = this.tracker.update(validDetections, frame.timestamp);

      // 3. Counting Engine (Line crossing, state machine)
      this.engine.processTracks(tracks, frame.timestamp);

      // 4. Confidence Evaluation
      const health = this.confidenceEngine.assessSystemHealth(tracks);

      return {
        boxes: validDetections.map(d => d.bbox),
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
