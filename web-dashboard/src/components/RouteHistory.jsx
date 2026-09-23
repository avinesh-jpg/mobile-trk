import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Polyline, Marker, Popup, useMap, CircleMarker } from 'react-leaflet';
import L from 'leaflet';
import axios from 'axios';
import { api } from '../api';
import { Calendar, User, Navigation, Play, Flag, Clock, Route, CheckCircle } from 'lucide-react';

function AutoFitBounds({ positions }) {
  const map = useMap();
  useEffect(() => {
    if (positions && positions.length > 0) {
      const bounds = L.latLngBounds(positions);
      map.fitBounds(bounds, { padding: [50, 50] });
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
  const [mapStyle, setMapStyle] = useState('google-hybrid');
  const [snapToRoads, setSnapToRoads] = useState(true);
  const [snappedCoords, setSnappedCoords] = useState([]);
  const [isSnapping, setIsSnapping] = useState(false);
  const [snappedDistanceMeters, setSnappedDistanceMeters] = useState(null);

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

  // Turn-by-Turn Road Snapping via OSRM (Google Maps Navigation Style)
  useEffect(() => {
    if (!history || history.length < 2) {
      setSnappedCoords([]);
      setSnappedDistanceMeters(null);
      return;
    }

    // Filter significant waypoints (at least 20m apart)
    const waypoints = [];
    let lastPoint = null;
    for (const pt of history) {
      if (pt.accuracy && pt.accuracy > 45) continue;
      if (!lastPoint) {
        waypoints.push(pt);
        lastPoint = pt;
      } else {
        const dLat = (pt.latitude - lastPoint.latitude) * Math.PI / 180;
        const dLon = (pt.longitude - lastPoint.longitude) * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                  Math.cos(lastPoint.latitude * Math.PI / 180) * Math.cos(pt.latitude * Math.PI / 180) *
                  Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const dist = 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        if (dist >= 20) {
          waypoints.push(pt);
          lastPoint = pt;
        }
      }
    }

    if (history.length > 0 && waypoints[waypoints.length - 1] !== history[history.length - 1]) {
      waypoints.push(history[history.length - 1]);
    }

    if (waypoints.length < 2) {
      setSnappedCoords([]);
      setSnappedDistanceMeters(null);
      return;
    }

    // Limit waypoints to 60 for fast OSRM processing
    let sampled = waypoints;
    if (sampled.length > 60) {
      const step = Math.ceil(sampled.length / 60);
      const reduced = [sampled[0]];
      for (let i = step; i < sampled.length - 1; i += step) {
        reduced.push(sampled[i]);
      }
      reduced.push(sampled[sampled.length - 1]);
      sampled = reduced;
    }

    setIsSnapping(true);
    const coordsParam = sampled.map((p) => `${p.longitude},${p.latitude}`).join(';');
    const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${coordsParam}?overview=full&geometries=geojson`;

    axios.get(osrmUrl, { timeout: 8000 })
      .then((res) => {
        if (res.data?.code === 'Ok' && res.data.routes?.length > 0) {
          const routeGeo = res.data.routes[0].geometry.coordinates;
          const latLngs = routeGeo.map(([lon, lat]) => [lat, lon]);
          setSnappedCoords(latLngs);
          setSnappedDistanceMeters(res.data.routes[0].distance);
        }
      })
      .catch((err) => {
        console.warn('OSRM Road Snapping unavailable, using direct polyline:', err.message);
        setSnappedCoords([]);
        setSnappedDistanceMeters(null);
      })
      .finally(() => {
        setIsSnapping(false);
      });
  }, [history]);

  const handleClearHistory = async () => {
    if (!selectedUser) return;
    if (window.confirm("Clear all historical test telemetry for this employee? This will reset distance to 0 m.")) {
      try {
        await api.delete(`/location/clear/${selectedUser}`);
        setHistory([]);
        setSnappedCoords([]);
        setSnappedDistanceMeters(null);
      } catch (err) {
        console.error("Clear error:", err);
      }
    }
  };

  // Raw straight-line calculation
  let rawMeters = 0;
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
      const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

      const speed = curr.speed || 0;
      const isStill = (curr.activity_type === 'still') || (speed < 2.5);

      if (dist < 25 && isStill) continue;

      rawMeters += dist;
      lastValid = curr;
    }
  }

  // Choose snapped road distance if available, otherwise raw
  const activeMeters = (snapToRoads && snappedDistanceMeters) ? snappedDistanceMeters : rawMeters;
  const displayDistance = activeMeters >= 1000
    ? `${(activeMeters / 1000).toFixed(2)} km (${Math.round(activeMeters)} m)`
    : `${Math.round(activeMeters)} meters`;

  const rawPolylineCoords = history.map((h) => [h.latitude, h.longitude]);
  const activePolyline = (snapToRoads && snappedCoords.length > 0) ? snappedCoords : rawPolylineCoords;
  const startPoint = rawPolylineCoords[0];
  const endPoint = rawPolylineCoords[rawPolylineCoords.length - 1];

  return (
    <div className="flex-1 flex flex-col h-[calc(100vh-4rem)] overflow-hidden">
      
      {/* Top Filter & Control Bar */}
      <div className="bg-slate-900 border-b border-slate-800 p-4 flex flex-wrap items-center justify-between gap-4 z-20">
        <div className="flex flex-wrap items-center gap-4">
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

            {/* Road Snapping Toggle */}
            <button
              onClick={() => setSnapToRoads(!snapToRoads)}
              className={`px-3 py-2 text-xs font-semibold rounded-lg border transition cursor-pointer flex items-center gap-1.5 ${
                snapToRoads
                  ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40 shadow-sm'
                  : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white'
              }`}
              title="Snap GPS trail onto actual roads like Google Maps navigation"
            >
              <Route className="w-3.5 h-3.5" />
              <span>{snapToRoads ? '🛣️ Snap to Roads (ON)' : '📍 Direct Points'}</span>
            </button>

            <button
              onClick={handleClearHistory}
              className="px-3 py-2 bg-red-950/40 hover:bg-red-900/60 border border-red-800 text-red-300 text-xs font-semibold rounded-lg transition cursor-pointer"
              title="Delete old accumulated test drift and reset distance to 0 m"
            >
              🗑️ Reset Data
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
            <span className="ml-1.5 font-bold text-emerald-400">
              {displayDistance} {snapToRoads && snappedDistanceMeters ? '(Road-Matched)' : ''}
            </span>
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

        {isSnapping && (
          <div className="absolute top-4 left-4 z-[999] bg-slate-900/90 border border-cyan-500/40 text-cyan-300 text-xs px-3 py-1.5 rounded-lg shadow-lg flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-ping" />
            <span>Snapping path onto road network...</span>
          </div>
        )}

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

          {activePolyline.length > 0 && (
            <>
              <AutoFitBounds positions={activePolyline} />
              
              {/* Google Navigation Glowing Road Underlay */}
              <Polyline
                positions={activePolyline}
                pathOptions={{ color: '#0284c7', weight: 8, opacity: 0.35 }}
              />

              {/* Main Crisp Road Trail */}
              <Polyline
                positions={activePolyline}
                pathOptions={{ color: '#06b6d4', weight: 4.5, opacity: 0.95 }}
              />

              {/* Breadcrumb dots representing actual recorded GPS pings */}
              {rawPolylineCoords.map((coord, idx) => (
                <CircleMarker
                  key={idx}
                  center={coord}
                  radius={3}
                  pathOptions={{
                    color: '#38bdf8',
                    fillColor: '#0369a1',
                    fillOpacity: 0.9,
                    weight: 1
                  }}
                />
              ))}

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
                      🎯 Latest Point: {new Date(history[history.length - 1].recorded_at).toLocaleTimeString()}
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
