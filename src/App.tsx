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
        <nav className="top-nav">
          <NavLink to="/" className="nav-brand gradient-text">
            <Activity size={28} color="#3b82f6" />
            PastaCounter
          </NavLink>
          
          <div className="nav-links">
            <NavLink to="/" className={({isActive}) => `nav-link ${isActive ? 'active' : ''}`}>
              <LayoutDashboard size={20} /> Dashboard
            </NavLink>
            <NavLink to="/live" className={({isActive}) => `nav-link ${isActive ? 'active' : ''}`}>
              <Activity size={20} /> Live Counting
            </NavLink>
            <NavLink to="/settings" className={({isActive}) => `nav-link ${isActive ? 'active' : ''}`}>
              <SettingsIcon size={20} /> Settings
            </NavLink>
          </div>
        </nav>

        <Routes>
          <Route path="/" element={<DashboardScreen />} />
          <Route path="/live" element={<LiveCountingScreen />} />
          <Route path="/settings" element={<SettingsScreen />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}
