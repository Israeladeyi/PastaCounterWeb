import React, { useEffect, useState } from 'react';
import { Activity, Clock, Target, History } from 'lucide-react';
import { Link } from 'react-router-dom';
import { SessionRepository } from '../database/SessionRepository';
import { SessionRecord } from '../database/Database';

export default function DashboardScreen() {
  const [sessions, setSessions] = useState<SessionRecord[]>([]);

  useEffect(() => {
    SessionRepository.getAllSessions().then(setSessions);
  }, []);

  const totalPastaCounted = sessions.reduce((acc, s) => acc + s.total_count, 0);
  const avgConfidence = sessions.length 
    ? sessions.reduce((acc, s) => acc + s.average_confidence, 0) / sessions.length 
    : 0;

  return (
    <div style={{ padding: 32, maxWidth: 1200, margin: '0 auto', width: '100%' }}>
      <h1 className="display-font gradient-text" style={{ fontSize: '2.5rem', marginBottom: 32 }}>
        Welcome to PastaCounter
      </h1>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 24, marginBottom: 40 }}>
        <div className="glass-panel" style={{ padding: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <Target color="var(--primary)" size={24} />
            <h3 className="stat-label">Total Sachets Counted</h3>
          </div>
          <div className="stat-value" style={{ fontSize: '2.5rem' }}>{totalPastaCounted}</div>
        </div>
        
        <div className="glass-panel" style={{ padding: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <Activity color="var(--success)" size={24} />
            <h3 className="stat-label">Average Confidence</h3>
          </div>
          <div className="stat-value" style={{ fontSize: '2.5rem' }}>{(avgConfidence * 100).toFixed(1)}%</div>
        </div>

        <div className="glass-panel" style={{ padding: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <Clock color="var(--secondary)" size={24} />
            <h3 className="stat-label">Total Sessions</h3>
          </div>
          <div className="stat-value" style={{ fontSize: '2.5rem' }}>{sessions.length}</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 32 }}>
        {/* Quick Actions */}
        <div style={{ flex: 1 }}>
          <h2 className="display-font" style={{ marginBottom: 20 }}>Quick Actions</h2>
          <div className="glass-panel" style={{ padding: 32, textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ width: 64, height: 64, background: 'var(--bg-glass)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto' }}>
              <Activity size={32} color="var(--primary)" />
            </div>
            <h3 style={{ fontSize: '1.25rem' }}>Start New Session</h3>
            <p style={{ color: 'var(--text-muted)' }}>Launch the camera interface to begin counting pasta sachets on the conveyor belt.</p>
            <Link to="/live" style={{ textDecoration: 'none' }}>
              <button className="btn btn-primary" style={{ width: '100%', marginTop: 16 }}>
                Open Camera Interface
              </button>
            </Link>
          </div>
        </div>

        {/* Recent History */}
        <div style={{ flex: 2 }}>
          <h2 className="display-font" style={{ marginBottom: 20 }}>Recent Sessions</h2>
          <div className="glass-panel" style={{ padding: 24 }}>
            {sessions.length === 0 ? (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px 0' }}>
                <History size={48} opacity={0.5} style={{ margin: '0 auto 16px' }} />
                <p>No sessions recorded yet.</p>
              </div>
            ) : (
              <div className="session-list">
                {sessions.slice(0, 5).map(s => (
                  <div key={s.id} className="session-item">
                    <div>
                      <div style={{ fontWeight: 600, marginBottom: 4 }}>Session {new Date(s.start_time).toLocaleDateString()}</div>
                      <div className="stat-label">Duration: {(s.duration_ms / 1000).toFixed(1)}s</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--primary)' }}>{s.total_count}</div>
                      <div className="stat-label">Sachets</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
