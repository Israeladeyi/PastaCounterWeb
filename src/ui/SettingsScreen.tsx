import React from 'react';
import { useConfigStore } from '../store/configStore';
import { Save } from 'lucide-react';

export default function SettingsScreen() {
  const { countingLine, updateCountingLine, session, updateSession } = useConfigStore();
  const linePosition = Math.round(countingLine.position * 100);

  return (
    <div style={{ padding: 32, maxWidth: 800, margin: '0 auto', width: '100%' }}>
      <h1 className="display-font gradient-text" style={{ fontSize: '2.5rem', marginBottom: 32 }}>
        System Settings
      </h1>

      <div className="glass-panel" style={{ padding: 32, display: 'flex', flexDirection: 'column', gap: 24 }}>
        
        <div>
          <label className="stat-label" style={{ display: 'block', marginBottom: 8 }}>Counting Line Position (Y-Axis %)</label>
          <input 
            type="range" 
            min="10" 
            max="90" 
            value={linePosition}
            onChange={(e) => updateCountingLine({ position: parseInt(e.target.value) / 100 })}
            style={{ width: '100%' }}
          />
          <div style={{ textAlign: 'right', marginTop: 4, color: 'var(--text-muted)' }}>{linePosition}%</div>
        </div>

        <div>
          <label className="stat-label" style={{ display: 'block', marginBottom: 8 }}>Session Duration</label>
          <select 
            value={session.durationMs}
            onChange={(e) => updateSession({ durationMs: parseInt(e.target.value) })}
            style={{ width: '100%', padding: 12, borderRadius: 8, background: 'var(--bg-panel-solid)', color: 'white', border: '1px solid var(--border-subtle)' }}
          >
            <option value={60000}>1 Minute</option>
            <option value={300000}>5 Minutes</option>
            <option value={600000}>10 Minutes</option>
            <option value={3600000}>1 Hour</option>
          </select>
        </div>

        <div style={{ marginTop: 16, paddingTop: 24, borderTop: '1px solid var(--border-subtle)' }}>
          <button className="btn btn-primary" onClick={() => alert('Settings saved locally!')}>
            <Save size={18} /> Save Configuration
          </button>
        </div>

      </div>
    </div>
  );
}
