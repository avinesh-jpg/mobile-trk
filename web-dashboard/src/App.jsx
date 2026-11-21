import React, { useEffect } from 'react';
import Navbar from './components/Navbar';
import LiveMap from './components/LiveMap';
import RouteHistory from './components/RouteHistory';
import AnalyticsAI from './components/AnalyticsAI';
import GeofenceManager from './components/GeofenceManager';
import TimesheetExport from './components/TimesheetExport';
import UserManager from './components/UserManager';
import Login from './components/Login';
import { WS_BASE } from './api';
import { useFleetStore } from './store/useFleetStore';

export default function App() {
  const user = useFleetStore((state) => state.user);
  const setUser = useFleetStore((state) => state.setUser);
  const logout = useFleetStore((state) => state.logout);
  const activeTab = useFleetStore((state) => state.activeTab);
  const setActiveTab = useFleetStore((state) => state.setActiveTab);
  const isWsConnected = useFleetStore((state) => state.isWsConnected);
  const setIsWsConnected = useFleetStore((state) => state.setIsWsConnected);
  const handleLiveTelemetry = useFleetStore((state) => state.handleLiveTelemetry);
  const fetchEmployees = useFleetStore((state) => state.fetchEmployees);
  const fetchGeofences = useFleetStore((state) => state.fetchGeofences);

  // Initial data preloading on login
  useEffect(() => {
    if (user) {
      fetchEmployees();
      fetchGeofences();
    }
  }, [user]);

  // Maintain WebSocket connection to FastAPI backend & stream into Zustand store
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
          if (data.event === 'location_update' || data.event === 'shift_ended') {
            // Push directly into centralized Zustand store with high performance
            handleLiveTelemetry(data);
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

  if (!user) {
    return <Login onLoginSuccess={(userData) => setUser(userData)} />;
  }

  return (
    <div className="h-screen w-screen bg-slate-950 flex flex-col font-sans overflow-hidden">
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        user={user}
        onLogout={logout}
        isWsConnected={isWsConnected}
      />

      <main className="flex-1 w-full h-[calc(100vh-4rem)] flex flex-col overflow-hidden relative">
        {activeTab === 'live' && <LiveMap onNavigateTab={setActiveTab} />}
        {activeTab === 'history' && <RouteHistory />}
        {activeTab === 'analytics' && <AnalyticsAI />}
        {activeTab === 'geofences' && <GeofenceManager />}
        {activeTab === 'reports' && <TimesheetExport />}
        {activeTab === 'users' && <UserManager />}
      </main>
    </div>
  );
}
