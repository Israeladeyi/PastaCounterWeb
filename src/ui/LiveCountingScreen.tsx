import { useEffect, useRef, useState } from 'react';
import { Play, Square, RefreshCw, Activity, Clock, Target, CameraOff } from 'lucide-react';
import { Pipeline } from '../pipeline/Pipeline';
import { useConfigStore } from '../store/configStore';

export default function LiveCountingScreen() {
  const { session, countingLine } = useConfigStore();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
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
    let stream: MediaStream | null = null;

    if (isCounting) {
      // Start Webcam
      navigator.mediaDevices.getUserMedia({ 
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'environment' } 
      })
      .then(s => {
        stream = s;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      })
      .catch(err => {
        console.error("Error accessing webcam:", err);
        alert("Could not access webcam. Please ensure permissions are granted.");
      });
    } else {
      // Stop Webcam
      if (videoRef.current && videoRef.current.srcObject) {
        (videoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
        videoRef.current.srcObject = null;
      }
    }

    return () => {
      if (stream) {
        stream.getTracks().forEach(t => t.stop());
      }
      if (videoRef.current && videoRef.current.srcObject) {
        (videoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
        videoRef.current.srcObject = null;
      }
    };
  }, [isCounting]);

  const processFrame = async () => {
    if (!isCounting || !videoRef.current || !canvasRef.current) {
      rAFRef.current = requestAnimationFrame(processFrame);
      return;
    }

    const video = videoRef.current;
    if (video.readyState !== video.HAVE_ENOUGH_DATA) {
      rAFRef.current = requestAnimationFrame(processFrame);
      return;
    }

    // Ensure canvas matches video dimensions
    if (canvasRef.current.width !== video.videoWidth) {
      canvasRef.current.width = video.videoWidth;
      canvasRef.current.height = video.videoHeight;
    }

    const w = video.videoWidth;
    const h = video.videoHeight;
    // Process through pipeline
    const result = await pipelineRef.current.processFrame({
      width: w,
      height: h,
      videoElement: video,
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
        ctx.font = 'bold 14px Inter';
        result.boxes.forEach(b => {
          ctx.strokeRect(b.x * w, b.y * h, b.w * w, b.h * h);
          if (b.label) {
            ctx.fillStyle = '#10b981';
            ctx.fillText(b.label.toUpperCase(), b.x * w, (b.y * h) - 5);
          }
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
      if (rAFRef.current) cancelAnimationFrame(rAFRef.current);
    }
    
    return () => {
      if (rAFRef.current) cancelAnimationFrame(rAFRef.current);
    };
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
        {!isCounting && (
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: '#0B0F19', zIndex: 5 }}>
            <CameraOff size={64} color="var(--text-muted)" style={{ opacity: 0.5, marginBottom: 16 }} />
            <p style={{ color: 'var(--text-muted)', fontSize: '1.2rem', fontWeight: 500 }}>Camera Disabled for Security</p>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', opacity: 0.7, marginTop: 8 }}>Click Start Counting to activate camera</p>
          </div>
        )}
        <video 
          ref={videoRef} 
          autoPlay 
          playsInline 
          muted 
          className="video-element"
          style={{ opacity: isCounting ? 1 : 0, transition: 'opacity 0.3s' }}
        />
        <canvas 
          ref={canvasRef} 
          className="overlay-canvas"
        />
        
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
