import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom';
import { Activity, LayoutDashboard, Settings as SettingsIcon } from 'lucide-react';
import { Database } from './database/Database';

// Screens
import LiveCountingScreen from './ui/LiveCountingScreen';
import DashboardScreen from './ui/DashboardScreen';
import SettingsScreen from './ui/SettingsScreen';

export default function App() {

  useEffect(() => {
    // Initialize Database
    Database.init().catch(console.error);
    // Load config from local storage (Web version of Zustand persist will handle this automatically if configured, 
    // but for now we manually init or let Zustand do it)
  }, []);

  return (
    <BrowserRouter>
      <div className="app-container">
        <div className="sidebar">
          <div className="sidebar-header">
            <Activity color="var(--primary)" size={28} />
            <h1>PastaCounter</h1>
          </div>
          <nav className="nav-links">
            <NavLink to="/" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
              <Activity size={24} />
              <span>Live Count</span>
            </NavLink>
            <NavLink to="/dashboard" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
              <LayoutDashboard size={24} />
              <span>Dashboard</span>
            </NavLink>
            <NavLink to="/settings" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
              <SettingsIcon size={24} />
              <span>Settings</span>
            </NavLink>
          </nav>
        </div>

        <div className="main-content">
          <Routes>
            <Route path="/" element={<LiveCountingScreen />} />
            <Route path="/dashboard" element={<DashboardScreen />} />
            <Route path="/live" element={<LiveCountingScreen />} />
            <Route path="/settings" element={<SettingsScreen />} />
          </Routes>
        </div>
      </div>
    </BrowserRouter>
  );
}
