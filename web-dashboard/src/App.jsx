import React, { useState, useEffect } from 'react';
import Navbar from './components/Navbar';
import LiveMap from './components/LiveMap';
import RouteHistory from './components/RouteHistory';
import AnalyticsAI from './components/AnalyticsAI';
import GeofenceManager from './components/GeofenceManager';
import TimesheetExport from './components/TimesheetExport';
import Login from './components/Login';
import { WS_BASE } from './api';

export default function App() {
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('user');
    return saved ? JSON.parse(saved) : null;
  });
  const [activeTab, setActiveTab] = useState('live');
  const [isWsConnected, setIsWsConnected] = useState(false);
  const [liveFeed, setLiveFeed] = useState(null);

  // Maintain WebSocket connection to FastAPI backend
  useEffect(() => {
    if (!user) return;

    let ws = null;
    let reconnectTimeout = null;

    const connectWs = () => {
      ws = new WebSocket(WS_BASE);

      ws.onopen = () => {
        setIsWsConnected(true);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.event === 'location_update') {
            setLiveFeed(data);
          }
        } catch (e) {
          console.error('Error parsing WS message:', e);
        }
      };

      ws.onclose = () => {
        setIsWsConnected(false);
        // Attempt reconnect after 3 seconds
        reconnectTimeout = setTimeout(connectWs, 3000);
      };

      ws.onerror = () => {
        setIsWsConnected(false);
      };
    };

    connectWs();

    return () => {
      if (ws) ws.close();
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
    };
  }, [user]);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
  };

  if (!user) {
    return <Login onLoginSuccess={(userData) => setUser(userData)} />;
  }

  return (
    <div className="h-screen w-screen bg-slate-950 flex flex-col font-sans overflow-hidden">
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        user={user}
        onLogout={handleLogout}
        isWsConnected={isWsConnected}
      />

      <main className="flex-1 w-full h-[calc(100vh-4rem)] flex flex-col overflow-hidden relative">
        {activeTab === 'live' && <LiveMap liveFeed={liveFeed} />}
        {activeTab === 'history' && <RouteHistory />}
        {activeTab === 'analytics' && <AnalyticsAI />}
        {activeTab === 'geofences' && <GeofenceManager />}
        {activeTab === 'reports' && <TimesheetExport />}
      </main>
    </div>
  );
}
