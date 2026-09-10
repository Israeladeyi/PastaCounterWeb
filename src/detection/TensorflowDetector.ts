import * as tf from '@tensorflow/tfjs';
import * as cocoSsd from '@tensorflow-models/coco-ssd';
import { BoundingBox } from '../utils/geometry';

export interface RawDetection {
  bbox: BoundingBox;
  confidence: number;
  classId: number;
  className: string;
}

export class TensorflowDetector {
  private model: cocoSsd.ObjectDetection | null = null;
  public isReady: boolean = false;

  constructor() {
    this.initialize();
  }

  async initialize(): Promise<void> {
    if (this.model) return;
    try {
      await tf.ready();
      this.model = await cocoSsd.load({ base: 'mobilenet_v2' });
      this.isReady = true;
      console.log('TensorFlow COCO-SSD loaded successfully!');
    } catch (err) {
      console.error('Failed to load COCO-SSD model:', err);
    }
  }

  async detect(videoElement: HTMLVideoElement, _timestamp: number): Promise<RawDetection[]> {
    if (!this.isReady || !this.model) return [];
    if (videoElement.readyState < 2 || videoElement.videoWidth === 0) return [];

    try {
      // Run inference
      const predictions = await this.model.detect(videoElement);
      
      const vw = videoElement.videoWidth;
      const vh = videoElement.videoHeight;

      return predictions
        .filter((p: any) => p.score > 0.4) // Threshold
        .map((p: any, idx: number) => {
          const [px, py, pw, ph] = p.bbox;
          
          return {
            bbox: {
              x: px / vw,
              y: py / vh,
              w: pw / vw,
              h: ph / vh,
              area: (pw * ph) / (vw * vh)
            },
            confidence: p.score,
            classId: idx, // Not strictly needed for coco-ssd
            className: p.class
          };
        });
    } catch (e) {
      console.error("TF Detection error:", e);
      return [];
    }
  }

  resetBackground() {
    // No-op for TF detector, needed for compatibility with Pipeline reset
  }
}
