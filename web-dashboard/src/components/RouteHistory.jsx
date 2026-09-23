import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Polyline, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { api } from '../api';
import { Calendar, User, Navigation, Play, Flag, Clock } from 'lucide-react';

function AutoFitBounds({ positions }) {
  const map = useMap();
  useEffect(() => {
    if (positions && positions.length > 0) {
      const bounds = L.latLngBounds(positions);
      map.fitBounds(bounds, { padding: [40, 40] });
    }
  }, [positions, map]);
  return null;
}

export default function RouteHistory() {
  const [employees, setEmployees] = useState([]);
  const [selectedUser, setSelectedUser] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [mapStyle, setMapStyle] = useState('satellite');

  useEffect(() => {
    api.get('/auth/employees').then((res) => {
      setEmployees(res.data);
      if (res.data.length > 0) {
        setSelectedUser(res.data[0].id);
      }
    });
  }, []);

  const fetchRoute = async () => {
    if (!selectedUser) return;
    setLoading(true);
    try {
      const res = await api.get(`/location/history/${selectedUser}?date_str=${date}`);
      setHistory(res.data);
    } catch (err) {
      console.error('Failed to fetch route history:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedUser) {
      fetchRoute();
    }
  }, [selectedUser, date]);

  const handleClearHistory = async () => {
    if (!selectedUser) return;
    if (window.confirm("Clear all historical test telemetry for this employee? This will reset distance to 0 m.")) {
      try {
        await api.delete(`/location/clear/${selectedUser}`);
        setHistory([]);
      } catch (err) {
        console.error("Clear error:", err);
      }
    }
  };

  // Calculate accurate travel distance filtering stationary indoor jitter
  let totalMeters = 0;
  if (history.length > 1) {
    let lastValid = history[0];
    for (let i = 1; i < history.length; i++) {
      const curr = history[i];
      if (curr.accuracy && curr.accuracy > 45) continue;
      const R = 6371000;
      const dLat = (curr.latitude - lastValid.latitude) * Math.PI / 180;
      const dLon = (curr.longitude - lastValid.longitude) * Math.PI / 180;
      const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                Math.cos(lastValid.latitude * Math.PI / 180) * Math.cos(curr.latitude * Math.PI / 180) *
                Math.sin(dLon / 2) * Math.sin(dLon / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      const dist = R * c;

      const speed = curr.speed || 0;
      const isStill = (curr.activity_type === 'still') || (speed < 2.5);

      // Deadband: Discard micro-jitter under 25 meters while sitting/still
      if (dist < 25 && isStill) continue;

      totalMeters += dist;
      lastValid = curr;
    }
  }

  const displayDistance = totalMeters >= 1000
    ? `${(totalMeters / 1000).toFixed(2)} km (${Math.round(totalMeters)} m)`
    : `${Math.round(totalMeters)} meters`;

  const polylineCoords = history.map((h) => [h.latitude, h.longitude]);
  const startPoint = polylineCoords[0];
  const endPoint = polylineCoords[polylineCoords.length - 1];

  return (
    <div className="flex-1 flex flex-col h-[calc(100vh-4rem)] overflow-hidden">
      
      {/* Top Filter Bar */}
      <div className="bg-slate-900 border-b border-slate-800 p-4 flex flex-wrap items-center justify-between gap-4 z-20">
        <div className="flex items-center space-x-4">
          <div>
            <label className="block text-[11px] font-semibold text-slate-400 uppercase mb-1">Select Employee</label>
            <select
              value={selectedUser}
              onChange={(e) => setSelectedUser(e.target.value)}
              className="bg-slate-800 border border-slate-700 text-white text-xs rounded-lg px-3 py-2 focus:outline-none focus:border-cyan-500"
            >
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>{emp.name} ({emp.email})</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-400 uppercase mb-1">Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="bg-slate-800 border border-slate-700 text-white text-xs rounded-lg px-3 py-2 focus:outline-none focus:border-cyan-500"
            />
          </div>

          <div className="flex items-center gap-2 mt-4">
            <button
              onClick={fetchRoute}
              disabled={loading}
              className="px-4 py-2 bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-white text-xs font-semibold rounded-lg shadow cursor-pointer disabled:opacity-50"
            >
              {loading ? 'Loading...' : 'Fetch Route'}
            </button>

            <button
              onClick={handleClearHistory}
              className="px-3 py-2 bg-red-950/40 hover:bg-red-900/60 border border-red-800 text-red-300 text-xs font-semibold rounded-lg transition cursor-pointer"
              title="Delete old accumulated test drift and reset distance to 0 m"
            >
              🗑️ Reset Test Data
            </button>
          </div>
        </div>

        {/* Route Stats Summary */}
        <div className="flex flex-wrap items-center gap-6 text-xs text-slate-300">
          <div>
            <span className="text-slate-400">Total Waypoints:</span>
            <span className="ml-1.5 font-bold text-white">{history.length}</span>
          </div>
          <div>
            <span className="text-slate-400">Travel Distance:</span>
            <span className="ml-1.5 font-bold text-emerald-400">{displayDistance}</span>
          </div>
          {history.length > 0 && (
            <div>
              <span className="text-slate-400">Active Window:</span>
              <span className="ml-1.5 font-bold text-cyan-400">
                {new Date(history[0].recorded_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} -{' '}
                {new Date(history[history.length - 1].recorded_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Map View */}
      <div className="flex-1 relative">
        
        {/* Floating Map Style Selector */}
        <div className="absolute top-4 right-4 z-[999] bg-slate-900/90 backdrop-blur-md border border-slate-700/80 rounded-xl p-1 shadow-2xl flex items-center gap-1">
          <button
            onClick={() => setMapStyle('google-hybrid')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 ${
              mapStyle === 'google-hybrid'
                ? 'bg-gradient-to-r from-cyan-500 to-indigo-600 text-white shadow'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            🛰️ Google Satellite + Names
          </button>
          <button
            onClick={() => setMapStyle('google-streets')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 ${
              mapStyle === 'google-streets'
                ? 'bg-gradient-to-r from-cyan-500 to-indigo-600 text-white shadow'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            🗺️ Google Streets
          </button>
          <button
            onClick={() => setMapStyle('dark')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 ${
              mapStyle === 'dark'
                ? 'bg-gradient-to-r from-cyan-500 to-indigo-600 text-white shadow'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            🌙 Dark
          </button>
        </div>

        <MapContainer
          center={[11.1542, 77.3060]}
          zoom={13}
          style={{ height: '100%', width: '100%', minHeight: '100%' }}
          className="w-full h-full"
        >
          {mapStyle === 'google-hybrid' && (
            <TileLayer
              attribution='&copy; Google Maps'
              url="https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}"
              maxZoom={20}
              subdomains={['mt0', 'mt1', 'mt2', 'mt3']}
            />
          )}

          {mapStyle === 'google-streets' && (
            <TileLayer
              attribution='&copy; Google Maps'
              url="https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}"
              maxZoom={20}
              subdomains={['mt0', 'mt1', 'mt2', 'mt3']}
            />
          )}

          {mapStyle === 'dark' && (
            <TileLayer
              attribution='&copy; <a href="https://carto.com/">CARTO</a>'
              url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            />
          )}

          {polylineCoords.length > 0 && (
            <>
              <AutoFitBounds positions={polylineCoords} />
              
              {/* The Journey Polyline Trail */}
              <Polyline
                positions={polylineCoords}
                pathOptions={{ color: '#06b6d4', weight: 4, opacity: 0.8 }}
              />

              {/* Start Point Marker */}
              {startPoint && (
                <Marker position={startPoint}>
                  <Popup>
                    <div className="p-1 text-slate-900 font-semibold text-xs">
                      🏁 Journey Start: {new Date(history[0].recorded_at).toLocaleTimeString()}
                    </div>
                  </Popup>
                </Marker>
              )}

              {/* End Point Marker */}
              {endPoint && (
                <Marker position={endPoint}>
                  <Popup>
                    <div className="p-1 text-slate-900 font-semibold text-xs">
                      🎯 Latest / End Point: {new Date(history[history.length - 1].recorded_at).toLocaleTimeString()}
                    </div>
                  </Popup>
                </Marker>
              )}
            </>
          )}
        </MapContainer>

        {history.length === 0 && !loading && (
          <div className="absolute top-8 left-1/2 -translate-x-1/2 bg-slate-900/90 border border-slate-800 text-slate-400 text-xs px-4 py-2 rounded-xl shadow-xl backdrop-blur z-20">
            No route telemetry logged for this employee on {date}.
          </div>
        )}
      </div>

    </div>
  );
}
