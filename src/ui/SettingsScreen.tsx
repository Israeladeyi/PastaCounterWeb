import { useConfigStore } from '../store/configStore';
import { Save, Settings2, Clock, Crosshair } from 'lucide-react';

export default function SettingsScreen() {
  const { countingLine, updateCountingLine, session, updateSession } = useConfigStore();
  const linePosition = Math.round(countingLine.position * 100);

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', width: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 32 }}>
        <div style={{ width: 48, height: 48, background: 'rgba(59, 130, 246, 0.1)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Settings2 size={24} color="var(--primary)" />
        </div>
        <h1 className="page-title" style={{ marginBottom: 0 }}>System Settings</h1>
      </div>

      <div className="glass-card" style={{ padding: 40 }}>
        
        <div className="settings-group">
          <h3><Crosshair size={20} color="var(--primary)" /> Vision Configuration</h3>
          
          <div className="form-group" style={{ marginTop: 24 }}>
            <label>Counting Line Position (Y-Axis %)</label>
            <input 
              type="range" 
              min="10" 
              max="90" 
              value={linePosition}
              onChange={(e) => updateCountingLine({ position: parseInt(e.target.value) / 100 })}
              style={{ 
                width: '100%', 
                accentColor: 'var(--primary)',
                height: 6,
                background: 'rgba(255,255,255,0.1)',
                borderRadius: 4,
                outline: 'none',
                marginTop: 12
              }}
            />
            <div style={{ textAlign: 'right', marginTop: 8, color: 'var(--primary)', fontWeight: 600 }}>
              {linePosition}%
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: 8 }}>
              Adjust where the virtual tripwire is placed on the camera feed. Objects crossing this line will be counted.
            </p>
          </div>
        </div>

        <div className="settings-group" style={{ marginTop: 40 }}>
          <h3><Clock size={20} color="var(--success)" /> Session Configuration</h3>
          
          <div className="form-group" style={{ marginTop: 24 }}>
            <label>Default Session Duration</label>
            <select 
              className="form-control"
              value={session.durationMs}
              onChange={(e) => updateSession({ durationMs: parseInt(e.target.value) })}
              style={{ marginTop: 8 }}
            >
              <option value={60000}>1 Minute (Test)</option>
              <option value={300000}>5 Minutes</option>
              <option value={600000}>10 Minutes</option>
              <option value={3600000}>1 Hour</option>
            </select>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: 12 }}>
              The counter will automatically stop and save the session data when this time limit is reached.
            </p>
          </div>
        </div>

        <div style={{ marginTop: 48, paddingTop: 32, borderTop: '1px solid var(--border)' }}>
          <button className="fab-btn btn-success" onClick={() => alert('Settings saved successfully!')} style={{ width: '100%', justifyContent: 'center', padding: '16px' }}>
            <Save size={20} /> Save Configuration
          </button>
        </div>

      </div>
    </div>
  );
}
