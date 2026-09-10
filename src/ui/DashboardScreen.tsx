import { useEffect, useState } from 'react';
import { Activity, Clock, Target, History, Play } from 'lucide-react';
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
    <div style={{ maxWidth: 1200, margin: '0 auto', width: '100%' }}>
      <h1 className="page-title">Dashboard</h1>

      {/* KPI Cards */}
      <div className="bento-grid">
        <div className="glass-card stat-card">
          <div className="stat-icon">
            <Target size={28} />
          </div>
          <div>
            <div className="stat-value">{totalPastaCounted}</div>
            <div className="stat-label">Total Counted</div>
          </div>
        </div>
        
        <div className="glass-card stat-card">
          <div className="stat-icon" style={{ color: 'var(--success)' }}>
            <Activity size={28} />
          </div>
          <div>
            <div className="stat-value">{(avgConfidence * 100).toFixed(1)}%</div>
            <div className="stat-label">Avg Confidence</div>
          </div>
        </div>

        <div className="glass-card stat-card">
          <div className="stat-icon" style={{ color: '#f59e0b' }}>
            <Clock size={28} />
          </div>
          <div>
            <div className="stat-value">{sessions.length}</div>
            <div className="stat-label">Total Sessions</div>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
        {/* Quick Actions */}
        <div style={{ flex: '1 1 300px' }}>
          <h2 style={{ fontSize: '1.25rem', marginBottom: 20, fontWeight: 600 }}>Quick Actions</h2>
          <div className="glass-card" style={{ textAlign: 'center', padding: '40px 24px' }}>
            <div style={{ width: 80, height: 80, background: 'rgba(59, 130, 246, 0.1)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
              <Play size={40} color="var(--primary)" style={{ marginLeft: 6 }} />
            </div>
            <h3 style={{ fontSize: '1.25rem', marginBottom: 8 }}>Start New Session</h3>
            <p style={{ color: 'var(--text-muted)', marginBottom: 24, fontSize: '0.9rem' }}>
              Launch the live camera interface to begin counting pasta sachets on the conveyor.
            </p>
            <Link to="/" style={{ textDecoration: 'none' }}>
              <button className="fab-btn btn-success" style={{ width: '100%', padding: '16px', fontSize: '1rem', justifyContent: 'center' }}>
                Open Camera Interface
              </button>
            </Link>
          </div>
        </div>

        {/* Recent History */}
        <div style={{ flex: '2 1 400px' }}>
          <h2 style={{ fontSize: '1.25rem', marginBottom: 20, fontWeight: 600 }}>Recent Sessions</h2>
          <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
            {sessions.length === 0 ? (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '60px 0' }}>
                <History size={48} opacity={0.3} style={{ margin: '0 auto 16px' }} />
                <p>No sessions recorded yet.</p>
              </div>
            ) : (
              <div>
                {sessions.slice(0, 5).map((s, idx) => (
                  <div key={s.id} style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center',
                    padding: '20px 24px',
                    borderBottom: idx !== Math.min(sessions.length, 5) - 1 ? '1px solid var(--border)' : 'none'
                  }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '1rem', marginBottom: 4 }}>
                        Session {new Date(s.start_time).toLocaleDateString()}
                      </div>
                      <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                        Duration: {(s.duration_ms / 1000).toFixed(1)}s
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--primary)' }}>
                        {s.total_count}
                      </div>
                      <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: 1 }}>
                        Sachets
                      </div>
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
