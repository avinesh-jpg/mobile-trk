import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Polyline, Marker, Popup, useMap, CircleMarker } from 'react-leaflet';
import L from 'leaflet';
import { api } from '../api';
import {
  Navigation, Play, Pause, RotateCcw, Clock, Route,
  Activity, ShieldCheck, CheckCircle2, AlertCircle, RefreshCw
} from 'lucide-react';

// Map resizer to ensure full-height Leaflet rendering without gray tiles
function MapResizer() {
  const map = useMap();
  useEffect(() => {
    const timer = setTimeout(() => {
      map.invalidateSize();
    }, 200);
    return () => clearTimeout(timer);
  }, [map]);
  return null;
}

// Auto fit bounds to route geometry
function AutoFitBounds({ positions }) {
  const map = useMap();
  useEffect(() => {
    if (positions && positions.length > 0) {
      try {
        const bounds = L.latLngBounds(positions);
        map.fitBounds(bounds, { padding: [50, 50], maxZoom: 17 });
      } catch (_) {}
    }
  }, [positions, map]);
  return null;
}

// Compute compass bearing between two coordinates in degrees
function calculateBearing(lat1, lon1, lat2, lon2) {
  const y = Math.sin((lon2 - lon1) * Math.PI / 180) * Math.cos(lat1 * Math.PI / 180);
  const x = Math.cos(lat1 * Math.PI / 180) * Math.sin(lat2 * Math.PI / 180) -
            Math.sin(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.cos((lon2 - lon1) * Math.PI / 180);
  const brng = Math.atan2(y, x) * 180 / Math.PI;
  return (brng + 360) % 360;
}

// Animated Replay Vehicle Marker with rotating heading needle
const createReplayMarkerIcon = (initials, heading = 0, speed = 0) => {
  return L.divIcon({
    className: 'custom-replay-marker',
    html: `
      <div style="position: relative; display: flex; align-items: center; justify-content: center;">
        <div style="position: absolute; width: 48px; height: 48px; border-radius: 9999px; background: rgba(6,182,212,0.35); animation: ping 1.2s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>
        
        <!-- Rotating Navigation Heading Arrow (Google Maps Style) -->
        <div style="transform: rotate(${heading || 0}deg); transition: transform 0.25s linear; position: relative;">
          <div style="position: absolute; top: -14px; left: 50%; transform: translateX(-50%); width: 0; height: 0; border-left: 7px solid transparent; border-right: 7px solid transparent; border-bottom: 13px solid #38bdf8; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.6));"></div>
          <div style="width: 38px; height: 38px; border-radius: 9999px; background: linear-gradient(135deg, #0284c7, #06b6d4); color: #ffffff; font-weight: 800; font-size: 13px; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 14px rgba(0,0,0,0.7); border: 2.5px solid #ffffff;">
            ${initials}
          </div>
        </div>
      </div>
    `,
    iconSize: [48, 48],
    iconAnchor: [24, 24],
    popupAnchor: [0, -24],
  });
};

export default function RouteHistory() {
  const [employees, setEmployees] = useState([]);
  const [selectedUser, setSelectedUser] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(false);
  const [mapStyle, setMapStyle] = useState('google-hybrid');
  const profile = 'driving';
  const [snapToRoads, setSnapToRoads] = useState(true);

  // Backend AI Road-Snapping response state
  const [rawCount, setRawCount] = useState(0);
  const [cleanCount, setCleanCount] = useState(0);
  const [denoisedPings, setDenoisedPings] = useState([]);
  const [roadSnappedPath, setRoadSnappedPath] = useState([]);
  const [totalDistanceKm, setTotalDistanceKm] = useState(0.0);
  const [mapMatchConfidence, setMapMatchConfidence] = useState(0.0);

  // Route Replay Player State
  const [isPlaying, setIsPlaying] = useState(false);
  const [replayIndex, setReplayIndex] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1); // 1x, 2x, 5x, 10x
  const replayIntervalRef = useRef(null);

  // Fetch registered employees
  useEffect(() => {
    const loadStaff = async () => {
      try {
        const res = await api.get('/auth/users');
        const userList = Array.isArray(res.data) ? res.data : [];
        setEmployees(userList);
        if (userList.length > 0 && !selectedUser) {
          setSelectedUser(userList[0].id);
        }
      } catch (err) {
        // Fallback to /auth/employees if /auth/users is restricted
        try {
          const empRes = await api.get('/auth/employees');
          const userList = Array.isArray(empRes.data) ? empRes.data : [];
          setEmployees(userList);
          if (userList.length > 0 && !selectedUser) {
            setSelectedUser(userList[0].id);
          }
        } catch (e) {
          console.error('Failed to load staff list:', e);
        }
      }
    };
    loadStaff();
  }, []);

  // Fetch full AI road-snapping route replay data from backend
  const fetchRoute = async () => {
    if (!selectedUser) return;
    setLoading(true);
    setIsPlaying(false);
    setReplayIndex(0);

    try {
      const res = await api.get(`/location/history/${selectedUser}`, {
        params: { date, profile }
      });
      const data = res.data || {};
      
      setRawCount(data.raw_count || 0);
      setCleanCount(data.clean_count || 0);
      setDenoisedPings(data.denoised_pings || []);
      setRoadSnappedPath(data.road_snapped_path || []);
      setTotalDistanceKm(data.total_distance_km || 0.0);
      setMapMatchConfidence(data.map_match_confidence || 0.0);
    } catch (err) {
      console.error('Failed to fetch route history:', err);
      setRawCount(0);
      setCleanCount(0);
      setDenoisedPings([]);
      setRoadSnappedPath([]);
      setTotalDistanceKm(0.0);
      setMapMatchConfidence(0.0);
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
    if (window.confirm("Clear all historical test telemetry for this employee? This will reset distance to 0 km.")) {
      try {
        await api.delete(`/location/clear/${selectedUser}`);
        setRawCount(0);
        setCleanCount(0);
        setDenoisedPings([]);
        setRoadSnappedPath([]);
        setTotalDistanceKm(0.0);
        setMapMatchConfidence(0.0);
        setReplayIndex(0);
        setIsPlaying(false);
      } catch (err) {
        console.error("Clear error:", err);
      }
    }
  };

  // Active path to draw on map (prefer roadSnappedPath when snapToRoads is ON, fallback to denoised pings)
  const activePath = (snapToRoads && roadSnappedPath.length > 0)
    ? roadSnappedPath
    : denoisedPings.map((p) => [p.latitude, p.longitude]);

  const startPoint = activePath.length > 0 ? activePath[0] : null;
  const endPoint = activePath.length > 0 ? activePath[activePath.length - 1] : null;

  // Replay bounds
  const replayMax = Math.max(0, activePath.length - 1);

  // Step through route points during playback
  useEffect(() => {
    if (!isPlaying) {
      if (replayIntervalRef.current) clearInterval(replayIntervalRef.current);
      return;
    }

    const stepMs = Math.max(30, Math.round(180 / playbackSpeed));
    replayIntervalRef.current = setInterval(() => {
      setReplayIndex((prev) => {
        if (prev >= replayMax) {
          setIsPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, stepMs);

    return () => {
      if (replayIntervalRef.current) clearInterval(replayIntervalRef.current);
    };
  }, [isPlaying, playbackSpeed, replayMax]);

  // Traveled portion highlighted in cyan glow
  const traveledPath = activePath.slice(0, Math.max(1, replayIndex + 1));
  const currentReplayCoord = activePath[replayIndex] || startPoint;

  // Compute bearing and telemetry stats for current position
  let currentReplayHeading = 0;
  if (activePath.length > 1 && replayIndex < activePath.length - 1) {
    const nextPt = activePath[replayIndex + 1];
    currentReplayHeading = calculateBearing(
      currentReplayCoord[0], currentReplayCoord[1],
      nextPt[0], nextPt[1]
    );
  }

  // Map replay index to nearest denoised ping for telemetry telemetry HUD
  const mappedPingIndex = denoisedPings.length > 0
    ? Math.min(denoisedPings.length - 1, Math.round((replayIndex / Math.max(1, activePath.length - 1)) * (denoisedPings.length - 1)))
    : 0;
  const currentPing = denoisedPings[mappedPingIndex] || null;

  const selectedEmpObj = employees.find((e) => String(e.id) === String(selectedUser));
  const initials = selectedEmpObj ? selectedEmpObj.name.slice(0, 2).toUpperCase() : 'TR';

  return (
    <div className="flex-1 flex flex-col h-[calc(100vh-4rem)] overflow-hidden bg-slate-950">
      
      {/* Top Filter & Control Bar */}
      <div className="bg-slate-900/90 border-b border-slate-800 p-4 flex flex-wrap items-center justify-between gap-4 z-20">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <label className="block text-[11px] font-semibold text-slate-400 uppercase mb-1">Staff Member</label>
            <select
              value={selectedUser}
              onChange={(e) => setSelectedUser(e.target.value)}
              className="bg-slate-800 border border-slate-700 text-white text-xs rounded-lg px-3 py-2 focus:outline-none focus:border-cyan-500 cursor-pointer min-w-[180px]"
            >
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>{emp.name} ({emp.email})</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-400 uppercase mb-1">Travel Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="bg-slate-800 border border-slate-700 text-white text-xs rounded-lg px-3 py-2 focus:outline-none focus:border-cyan-500 cursor-pointer"
            />
          </div>

          <div className="flex items-center gap-2 mt-5">
            <button
              onClick={fetchRoute}
              disabled={loading}
              className="px-4 py-2 bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-white text-xs font-semibold rounded-lg shadow cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>{loading ? 'Snapping...' : 'Refresh Route'}</span>
            </button>

            <button
              onClick={() => setSnapToRoads(!snapToRoads)}
              className={`px-3 py-2 rounded-lg text-xs font-semibold border transition cursor-pointer flex items-center gap-1.5 ${
                snapToRoads
                  ? 'bg-cyan-500/20 border-cyan-500/60 text-cyan-300 shadow'
                  : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'
              }`}
              title="Toggle between OSRM road-snapped path and clean Kalman GPS path"
            >
              🛣️ Snap to Roads ({snapToRoads ? 'ON' : 'OFF'})
            </button>

            <button
              onClick={handleClearHistory}
              className="px-3 py-2 bg-red-950/40 hover:bg-red-900/60 border border-red-800/80 text-red-300 text-xs font-semibold rounded-lg transition cursor-pointer"
              title="Delete old accumulated test telemetry and reset distance to 0 km"
            >
              🗑️ Reset Data
            </button>
          </div>
        </div>

        {/* Summary Metric Badges: Distance Traveled | Road Match Accuracy | Clean Pings */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Distance Traveled */}
          <div className="bg-slate-800/90 border border-slate-700/80 rounded-xl px-3.5 py-2 flex items-center gap-2.5 shadow-sm">
            <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400">
              <Route className="w-4 h-4" />
            </div>
            <div>
              <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Distance Traveled</div>
              <div className="text-sm font-extrabold text-emerald-400">{totalDistanceKm.toFixed(2)} km</div>
            </div>
          </div>

          {/* Road Match Accuracy */}
          <div className="bg-slate-800/90 border border-slate-700/80 rounded-xl px-3.5 py-2 flex items-center gap-2.5 shadow-sm">
            <div className="p-1.5 rounded-lg bg-cyan-500/10 text-cyan-400">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Road Match Accuracy</div>
              <div className="text-sm font-extrabold text-cyan-400">
                {mapMatchConfidence > 0 ? `${mapMatchConfidence}%` : 'N/A'}
              </div>
            </div>
          </div>

          {/* Clean Pings (AI Denoised) */}
          <div className="bg-slate-800/90 border border-slate-700/80 rounded-xl px-3.5 py-2 flex items-center gap-2.5 shadow-sm">
            <div className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-400">
              <CheckCircle2 className="w-4 h-4" />
            </div>
            <div>
              <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Clean Pings</div>
              <div className="text-sm font-extrabold text-white">
                {cleanCount} <span className="text-xs text-slate-400 font-normal">/ {rawCount} raw</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Full-Height Leaflet Map (min-h-[520px]) */}
      <div className="flex-1 relative min-h-[520px] w-full">
        
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
            🛰️ Satellite
          </button>
          <button
            onClick={() => setMapStyle('google-streets')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 ${
              mapStyle === 'google-streets'
                ? 'bg-gradient-to-r from-cyan-500 to-indigo-600 text-white shadow'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            🗺️ Streets
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

        {/* Live Replay HUD Overlay */}
        {currentPing && activePath.length > 1 && (
          <div className="absolute top-4 left-4 z-[999] bg-slate-900/90 backdrop-blur-md border border-cyan-500/40 rounded-xl p-3 shadow-2xl min-w-[220px] text-xs">
            <div className="flex items-center justify-between border-b border-slate-800 pb-1.5 mb-2">
              <span className="font-bold text-white flex items-center gap-1.5">
                <Navigation className="w-3.5 h-3.5 text-cyan-400" />
                <span>Route Telemetry</span>
              </span>
              <span className="text-[10px] bg-cyan-500/20 text-cyan-300 font-mono px-1.5 py-0.5 rounded">
                #{replayIndex + 1}/{activePath.length}
              </span>
            </div>
            <div className="space-y-1.5 text-slate-300">
              <div className="flex justify-between">
                <span className="text-slate-400">Time:</span>
                <span className="font-bold text-white">
                  {currentPing.recorded_at ? new Date(currentPing.recorded_at).toLocaleTimeString() : '--:--'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Speed:</span>
                <span className="font-bold text-emerald-400">
                  {Math.round(currentPing.speed || 0)} km/h
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Activity:</span>
                <span className="font-bold capitalize text-cyan-400">
                  {currentPing.activity_type || 'still'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Accuracy:</span>
                <span className="font-bold text-slate-200">
                  ±{currentPing.accuracy || 5}m
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Leaflet MapContainer with MapResizer */}
        <MapContainer
          center={[11.1542, 77.3060]}
          zoom={14}
          style={{ height: '100%', width: '100%', minHeight: '520px' }}
          className="w-full h-full"
        >
          <MapResizer />

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

          {activePath.length > 0 && (
            <>
              <AutoFitBounds positions={activePath} />
              
              {/* Layer 1: Dark blue outer border for high road contrast */}
              <Polyline
                positions={activePath}
                pathOptions={{ color: '#0f172a', weight: 8, opacity: 0.85, lineCap: 'round', lineJoin: 'round' }}
              />

              {/* Layer 2: Main road-snapped polyline */}
              <Polyline
                positions={activePath}
                pathOptions={{ color: '#0284c7', weight: 5, opacity: 0.95, lineCap: 'round', lineJoin: 'round' }}
              />

              {/* Layer 3: Traveled portion highlighted in vibrant glowing cyan */}
              {traveledPath.length > 0 && (
                <Polyline
                  positions={traveledPath}
                  pathOptions={{ color: '#00f0ff', weight: 5, opacity: 1.0, lineCap: 'round', lineJoin: 'round' }}
                />
              )}

              {/* Green start CircleMarker */}
              {startPoint && (
                <CircleMarker
                  center={startPoint}
                  radius={8}
                  pathOptions={{
                    fillColor: '#10b981',
                    color: '#ffffff',
                    weight: 2.5,
                    fillOpacity: 1
                  }}
                >
                  <Popup>
                    <div className="p-1 text-slate-900 font-bold text-xs">
                      🟢 Journey Start
                      <div className="text-[11px] font-normal text-slate-600">
                        {denoisedPings[0]?.recorded_at ? new Date(denoisedPings[0].recorded_at).toLocaleTimeString() : ''}
                      </div>
                    </div>
                  </Popup>
                </CircleMarker>
              )}

              {/* Red end CircleMarker */}
              {endPoint && (
                <CircleMarker
                  center={endPoint}
                  radius={8}
                  pathOptions={{
                    fillColor: '#ef4444',
                    color: '#ffffff',
                    weight: 2.5,
                    fillOpacity: 1
                  }}
                >
                  <Popup>
                    <div className="p-1 text-slate-900 font-bold text-xs">
                      🔴 Journey Destination
                      <div className="text-[11px] font-normal text-slate-600">
                        {denoisedPings[denoisedPings.length - 1]?.recorded_at ? new Date(denoisedPings[denoisedPings.length - 1].recorded_at).toLocaleTimeString() : ''}
                      </div>
                    </div>
                  </Popup>
                </CircleMarker>
              )}

              {/* Dynamic Animated Route Replay Vehicle Marker */}
              {currentReplayCoord && (
                <Marker
                  position={currentReplayCoord}
                  icon={createReplayMarkerIcon(
                    initials,
                    currentReplayHeading,
                    currentPing?.speed || 0
                  )}
                  zIndexOffset={1000}
                >
                  <Popup>
                    <div className="p-1 text-slate-900 font-bold text-xs">
                      🚗 {selectedEmpObj?.name || 'Technician'}
                      <div className="text-[11px] text-slate-600 font-normal">
                        Speed: {Math.round(currentPing?.speed || 0)} km/h
                      </div>
                    </div>
                  </Popup>
                </Marker>
              )}
            </>
          )}
        </MapContainer>

        {/* Bottom Floating Route Replay Player Bar */}
        {activePath.length > 1 && (
          <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-[999] w-[92%] max-w-3xl bg-slate-900/95 backdrop-blur-xl border border-slate-700/80 rounded-2xl p-4 shadow-2xl flex flex-col gap-3">
            
            {/* Timeline Scrubber */}
            <div className="flex items-center gap-3">
              <span className="text-[11px] font-mono text-cyan-400 font-bold min-w-[55px]">
                {denoisedPings[0]?.recorded_at ? new Date(denoisedPings[0].recorded_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'}
              </span>

              <input
                type="range"
                min={0}
                max={replayMax}
                value={Math.min(replayIndex, replayMax)}
                onChange={(e) => {
                  setReplayIndex(Number(e.target.value));
                  setIsPlaying(false);
                }}
                className="flex-1 h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
              />

              <span className="text-[11px] font-mono text-cyan-400 font-bold min-w-[55px] text-right">
                {denoisedPings[denoisedPings.length - 1]?.recorded_at ? new Date(denoisedPings[denoisedPings.length - 1].recorded_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'}
              </span>
            </div>

            {/* Playback Controls */}
            <div className="flex items-center justify-between">
              
              <div className="flex items-center gap-2">
                {/* Reset / Beginning */}
                <button
                  onClick={() => {
                    setReplayIndex(0);
                    setIsPlaying(false);
                  }}
                  className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition cursor-pointer"
                  title="Restart from beginning"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>

                {/* Play / Pause Toggle */}
                <button
                  onClick={() => setIsPlaying(!isPlaying)}
                  className="px-5 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-white font-bold text-xs shadow-lg flex items-center gap-2 cursor-pointer transition"
                >
                  {isPlaying ? (
                    <>
                      <Pause className="w-4 h-4 fill-white" />
                      <span>Pause</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4 fill-white" />
                      <span>Play Replay</span>
                    </>
                  )}
                </button>
              </div>

              {/* Progress Timestamp */}
              <div className="text-center">
                <span className="text-xs text-slate-400">Position: </span>
                <span className="text-xs font-bold text-white">
                  {currentPing?.recorded_at ? new Date(currentPing.recorded_at).toLocaleTimeString() : '--:--'}
                </span>
              </div>

              {/* Speed Multiplier Buttons */}
              <div className="flex items-center gap-1 bg-slate-800/80 p-1 rounded-lg border border-slate-700/60">
                {[1, 2, 5, 10].map((spd) => (
                  <button
                    key={spd}
                    onClick={() => setPlaybackSpeed(spd)}
                    className={`px-2.5 py-1 text-xs font-bold rounded-md transition cursor-pointer ${
                      playbackSpeed === spd
                        ? 'bg-cyan-500 text-white shadow-sm'
                        : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
                    }`}
                  >
                    {spd}x
                  </button>
                ))}
              </div>

            </div>

          </div>
        )}

        {/* Empty state when no data */}
        {activePath.length === 0 && !loading && (
          <div className="absolute top-8 left-1/2 -translate-x-1/2 bg-slate-900/90 border border-slate-800 text-slate-400 text-xs px-4 py-2.5 rounded-xl shadow-xl backdrop-blur z-20 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-slate-400" />
            <span>No valid route telemetry logged for this employee on {date}.</span>
          </div>
        )}
      </div>

    </div>
  );
}
