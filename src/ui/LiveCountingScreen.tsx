import { useEffect, useRef, useState } from 'react';
import { Play, Square, RefreshCw, Activity, Clock, Target } from 'lucide-react';
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
      <h1 className="page-title" style={{ marginBottom: 0 }}>Live Scanner</h1>
      
      {/* Video Area */}
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
          className="overlay-canvas"
        />
        <canvas ref={extractionCanvasRef} style={{ display: 'none' }} />
        
        {/* Top Left Stats Overlay */}
        <div className="live-stats-overlay">
          {isCounting && (
            <div className="glass-pill" style={{ color: 'var(--danger)', borderColor: 'rgba(239, 68, 68, 0.3)' }}>
              <div className="recording-indicator" />
              <span>RECORDING</span>
            </div>
          )}
          <div className="glass-pill pill-huge">
            {count}
            <span style={{ fontSize: '1rem', fontWeight: 500, color: 'var(--text-muted)' }}>PCS</span>
          </div>
          <div className="glass-pill" style={{ fontSize: '1.25rem' }}>
            <Clock size={20} color="var(--primary)" />
            {formatTime(timeRemaining || session.durationMs)}
          </div>
        </div>

        {/* Top Right Warning Overlay */}
        {activeWarning && (
          <div style={{
            position: 'absolute',
            top: 24,
            right: 24,
            background: 'var(--danger)',
            color: 'white',
            padding: '12px 24px',
            borderRadius: 12,
            fontWeight: 700,
            boxShadow: '0 8px 32px var(--danger-glow)',
            animation: 'tooltip-pulse 2s infinite',
            transformOrigin: 'center'
          }}>
            ⚠️ {activeWarning}
          </div>
        )}

        {/* Bottom Right Metrics Overlay */}
        <div style={{
          position: 'absolute',
          bottom: 24,
          right: 24,
          display: 'flex',
          gap: 12
        }}>
          <div className="glass-pill">
            <Target size={18} color="var(--success)" />
            <span>{(confidence * 100).toFixed(1)}%</span>
          </div>
          <div className="glass-pill">
            <Activity size={18} color="#f59e0b" />
            <span>{pipelineRef.current.getSessionManager().getSnapshot().ratePerMin.toFixed(0)} /min</span>
          </div>
        </div>
      </div>

      {/* Floating Action Button */}
      <div className="fab-container">
        {!isCounting ? (
          <button className="fab-btn btn-success" onClick={() => setIsCounting(true)}>
            <Play fill="currentColor" size={24} /> START COUNTING
          </button>
        ) : (
          <button className="fab-btn btn-danger" onClick={() => setIsCounting(false)}>
            <Square fill="currentColor" size={24} /> STOP
          </button>
        )}
      </div>

      <div style={{ textAlign: 'center' }}>
        <button 
          onClick={() => { pipelineRef.current.reset(); setCount(0); }}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--text-muted)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            cursor: 'pointer',
            padding: '8px 16px',
            borderRadius: 8,
            transition: 'background 0.2s',
            fontWeight: 500
          }}
          onMouseOver={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
          onMouseOut={e => e.currentTarget.style.background = 'transparent'}
        >
          <RefreshCw size={16} /> Reset Counter
        </button>
      </div>
    </div>
  );
}
