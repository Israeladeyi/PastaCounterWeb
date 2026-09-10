import { useEffect, useRef, useState } from 'react';
import { Play, Square, RefreshCw } from 'lucide-react';
import { Pipeline } from '../pipeline/Pipeline';
import { useConfigStore } from '../store/configStore';

export default function LiveCountingScreen() {
  const { session, countingLine } = useConfigStore();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const extractionCanvasRef = useRef<HTMLCanvasElement>(null);
  
  const [isCounting, setIsCounting] = useState(false);
  const [count, setCount] = useState(0);
  const [confidence, setConfidence] = useState(1.0);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [activeWarning, setActiveWarning] = useState<string | null>(null);
  
  // Create pipeline instance (one per screen mount)
  const pipelineRef = useRef(new Pipeline());
  const rAFRef = useRef<number>();

  // Sync config
  useEffect(() => {
    pipelineRef.current.updateConfig(countingLine, session.durationMs);
  }, [countingLine, session.durationMs]);

  useEffect(() => {
    // 1. Start Webcam
    navigator.mediaDevices.getUserMedia({ 
      video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'environment' } 
    })
    .then(stream => {
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    })
    .catch(err => {
      console.error("Error accessing webcam:", err);
      alert("Could not access webcam. Please ensure permissions are granted.");
    });

    return () => {
      if (rAFRef.current) cancelAnimationFrame(rAFRef.current);
      if (videoRef.current?.srcObject) {
        (videoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
      }
    };
  }, []);

  const processFrame = async () => {
    if (!isCounting || !videoRef.current || !extractionCanvasRef.current || !canvasRef.current) {
      rAFRef.current = requestAnimationFrame(processFrame);
      return;
    }

    const video = videoRef.current;
    if (video.readyState !== video.HAVE_ENOUGH_DATA) {
      rAFRef.current = requestAnimationFrame(processFrame);
      return;
    }

    // Ensure canvas matches video dimensions
    if (extractionCanvasRef.current.width !== video.videoWidth) {
      extractionCanvasRef.current.width = video.videoWidth;
      extractionCanvasRef.current.height = video.videoHeight;
      canvasRef.current.width = video.videoWidth;
      canvasRef.current.height = video.videoHeight;
    }

    const w = video.videoWidth;
    const h = video.videoHeight;

    // Extract frame
    const ctxEx = extractionCanvasRef.current.getContext('2d', { willReadFrequently: true });
    if (!ctxEx) return;
    
    // Draw video to hidden canvas
    ctxEx.drawImage(video, 0, 0, w, h);
    const imageData = ctxEx.getImageData(0, 0, w, h);

    // Process through pipeline
    const result = await pipelineRef.current.processFrame({
      width: w,
      height: h,
      data: imageData.data,
      timestamp: performance.now()
    });

    if (result) {
      setCount(result.count);
      setConfidence(result.systemConfidence);
      setTimeRemaining(pipelineRef.current.getSessionManager().getSnapshot().remainingMs);
      
      if (result.warnings && result.warnings.length > 0) {
        if (result.warnings.includes('too_close')) setActiveWarning('Camera is too close!');
        else if (result.warnings.includes('too_far')) setActiveWarning('Camera is too far!');
      } else {
        setActiveWarning(null);
      }
      
      // Draw overlays
      const ctx = canvasRef.current.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, w, h);
        
        // Draw Line
        const isHorizontal = countingLine.orientation === 'HORIZONTAL';
        const linePos = isHorizontal ? h * countingLine.position : w * countingLine.position;
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 2;
        ctx.beginPath();
        if (isHorizontal) {
          ctx.moveTo(0, linePos);
          ctx.lineTo(w, linePos);
        } else {
          ctx.moveTo(linePos, 0);
          ctx.lineTo(linePos, h);
        }
        ctx.stroke();

        // Draw Bounding Boxes
        ctx.strokeStyle = '#10b981';
        ctx.lineWidth = 2;
        result.boxes.forEach(b => {
          ctx.strokeRect(b.x * w, b.y * h, b.w * w, b.h * h);
        });

        // Draw Tracks
        ctx.strokeStyle = '#3b82f6';
        ctx.fillStyle = '#3b82f6';
        ctx.font = '16px Arial';
        result.tracks.forEach(t => {
          const tx = t.center.x * w;
          const ty = t.center.y * h;
          
          ctx.beginPath();
          ctx.arc(tx, ty, 5, 0, 2 * Math.PI);
          ctx.fill();
          ctx.fillText(`ID:${t.id}`, tx + 10, ty - 10);
        });
      }
    }

    rAFRef.current = requestAnimationFrame(processFrame);
  };

  useEffect(() => {
    if (isCounting) {
      pipelineRef.current.getSessionManager().start();
      rAFRef.current = requestAnimationFrame(processFrame);
    } else {
      pipelineRef.current.getSessionManager().abort();
    }
  }, [isCounting]);

  const formatTime = (ms: number) => {
    const totalSeconds = Math.ceil(ms / 1000);
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="live-container">
      {/* Video / Canvas Area */}
      <div className="video-wrapper">
        <video 
          ref={videoRef} 
          autoPlay 
          playsInline 
          muted 
          className="video-element"
        />
        <canvas 
          ref={canvasRef} 
          className="canvas-overlay"
        />
        {/* Hidden canvas for pixel extraction */}
        <canvas ref={extractionCanvasRef} style={{ display: 'none' }} />
        
        {activeWarning && (
          <div style={{
            position: 'absolute',
            top: 16,
            left: '50%',
            transform: 'translateX(-50%)',
            backgroundColor: 'var(--danger)',
            color: 'white',
            padding: '8px 16px',
            borderRadius: 8,
            fontWeight: 'bold',
            boxShadow: '0 4px 6px rgba(0,0,0,0.3)',
            zIndex: 10,
            animation: 'pulse 2s infinite'
          }}>
            ⚠️ {activeWarning}
          </div>
        )}

        {isCounting && (
          <div style={{ position: 'absolute', top: 20, right: 20, display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(0,0,0,0.5)', padding: '8px 12px', borderRadius: 20 }}>
            <div className="recording-indicator" />
            <span style={{ fontSize: 14, fontWeight: 600 }}>LIVE</span>
          </div>
        )}
      </div>

      {/* Control Panel */}
      <div className="glass-panel data-panel">
        <div className="count-display">
          <h2 className="display-font gradient-text">TOTAL COUNT</h2>
          <div className="count-number">{count}</div>
        </div>

        <div style={{ padding: '0 20px' }}>
          <div className="stat-grid">
            <div className="stat-card">
              <div className="stat-label">Confidence</div>
              <div className="stat-value" style={{ color: confidence > 0.8 ? 'var(--success)' : 'var(--accent)' }}>
                {(confidence * 100).toFixed(1)}%
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Rate (ppm)</div>
              <div className="stat-value">{pipelineRef.current.getSessionManager().getSnapshot().ratePerMin.toFixed(1)}</div>
            </div>
            <div className="stat-card" style={{ gridColumn: 'span 2' }}>
              <div className="stat-label">Time Remaining</div>
              <div className="stat-value" style={{ fontFamily: 'monospace', fontSize: '2rem', textAlign: 'center' }}>
                {formatTime(timeRemaining || session.durationMs)}
              </div>
            </div>
          </div>
        </div>

        <div className="controls-card">
          {!isCounting ? (
            <button className="btn btn-primary" style={{ width: '100%', padding: '16px' }} onClick={() => setIsCounting(true)}>
              <Play size={20} /> START SESSION
            </button>
          ) : (
            <button className="btn btn-danger" style={{ width: '100%', padding: '16px' }} onClick={() => setIsCounting(false)}>
              <Square size={20} /> STOP SESSION
            </button>
          )}

          <div style={{ display: 'flex', gap: 12 }}>
            <button className="btn glass-panel" style={{ flex: 1 }} onClick={() => { pipelineRef.current.reset(); setCount(0); }}>
              <RefreshCw size={18} /> Reset
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
