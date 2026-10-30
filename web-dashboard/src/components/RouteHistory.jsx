import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Polyline, Marker, Popup, useMap, CircleMarker } from 'react-leaflet';
import L from 'leaflet';
import { api } from '../api';
import {
  Navigation, Play, Pause, RotateCcw, Clock, Route
} from 'lucide-react';


function AutoFitBounds({ positions }) {
  const map = useMap();
  useEffect(() => {
    if (positions && positions.length > 0) {
      const bounds = L.latLngBounds(positions);
      map.fitBounds(bounds, { padding: [60, 60], maxZoom: 17 });
    }
  }, [positions, map]);
  return null;
}

// Compute compass bearing between two coordinates in degrees
function calculateBearing(lat1, lon1, lat2, lon2) {
  const y = Math.sin((lon2 - lon1) * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180);
  const x = Math.cos(lat1 * Math.PI / 180) * Math.sin(lat2 * Math.PI / 180) -
            Math.sin(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.cos((lon2 - lon1) * Math.PI / 180);
  const brng = Math.atan2(y, x) * 180 / Math.PI;
  return (brng + 360) % 360;
}

// Take the first `count` points of a list of segments (used to highlight the traveled part of the route)
function sliceSegments(segments, count) {
  const out = [];
  let remaining = count;
  for (const seg of segments) {
    if (remaining <= 0) break;
    if (seg.length <= remaining) {
      out.push(seg);
      remaining -= seg.length;
    } else {
      out.push(seg.slice(0, remaining));
      remaining = 0;
    }
  }
  return out;
}

// Animated Replay Vehicle Marker with rotating heading needle
const createStartIcon = () => {
  return L.divIcon({
    className: 'custom-start-pin',
    html: `
      <div style="display: flex; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: 50%; background: #10b981; border: 2.5px solid #ffffff; box-shadow: 0 4px 10px rgba(0,0,0,0.5); font-size: 15px;">
        🏁
      </div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -16]
  });
};

const createEndIcon = () => {
  return L.divIcon({
    className: 'custom-end-pin',
    html: `
      <div style="display: flex; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: 50%; background: #ef4444; border: 2.5px solid #ffffff; box-shadow: 0 4px 10px rgba(0,0,0,0.5); font-size: 15px;">
        🎯
      </div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -16]
  });
};

const createReplayMarkerIcon = (initials, heading = 0, speed = 0) => {
  return L.divIcon({
    className: 'custom-replay-marker',
    html: `
      <div style="position: relative; display: flex; align-items: center; justify-content: center;">
        <div style="position: absolute; width: 50px; height: 50px; border-radius: 9999px; background: rgba(6,182,212,0.35); animation: ping 1.2s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>
        
        <!-- Rotating Navigation Heading Arrow (Google Maps Style) -->
        <div style="transform: rotate(${heading || 0}deg); transition: transform 0.25s linear; position: relative;">
          <div style="position: absolute; top: -14px; left: 50%; transform: translateX(-50%); width: 0; height: 0; border-left: 7px solid transparent; border-right: 7px solid transparent; border-bottom: 13px solid #38bdf8; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.6));"></div>
          <div style="width: 38px; height: 38px; border-radius: 9999px; background: linear-gradient(135deg, #0284c7, #06b6d4); color: #ffffff; font-weight: 800; font-size: 13px; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 14px rgba(0,0,0,0.7); border: 2.5px solid #ffffff;">
            ${initials}
          </div>
        </div>
      </div>
    `,
    iconSize: [50, 50],
    iconAnchor: [25, 25],
    popupAnchor: [0, -25],
  });
};

export default function RouteHistory() {
  const [employees, setEmployees] = useState([]);
  const [selectedUser, setSelectedUser] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [mapStyle, setMapStyle] = useState('google-hybrid');
  const [snapToRoads, setSnapToRoads] = useState(true);
  const [snappedSegments, setSnappedSegments] = useState([]);   // road-following pieces from the backend
  const [snappedCoords, setSnappedCoords] = useState([]);         // same points, flattened
  const [isSnapping, setIsSnapping] = useState(false);
  const [snappedDistanceMeters, setSnappedDistanceMeters] = useState(null);
  const [snapFailed, setSnapFailed] = useState(false);            // true if some/all of the route could not be matched to roads
  const [profile, setProfile] = useState('driving');              // driving | walking | cycling

  // Route Replay Player State
  const [isPlaying, setIsPlaying] = useState(false);
  const [replayIndex, setReplayIndex] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1); // 1x, 2x, 5x, 10x
  const replayIntervalRef = useRef(null);

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
    setIsPlaying(false);
    setReplayIndex(0);
    try {
      const res = await api.get(`/location/history/${selectedUser}?date_str=${date}`);
      // Clean out cold-start teleport leaps and accuracy > 35m
      const validPoints = (res.data || []).filter((pt, idx, arr) => {
        if (pt.accuracy && pt.accuracy > 35) return false;
        if (idx > 0) {
          const prev = arr[idx - 1];
          const dLat = (pt.latitude - prev.latitude) * 111.32;
          const dLon = (pt.longitude - prev.longitude) * 111.32 * Math.cos(pt.latitude * Math.PI / 180);
          const distKm = Math.sqrt(dLat * dLat + dLon * dLon);
          const timeSec = Math.abs((new Date(pt.recorded_at) - new Date(prev.recorded_at)) / 1000);
          if (timeSec > 0 && (distKm / (timeSec / 3600)) > 140) return false; // discard > 140 km/h leap
        }
        return true;
      });

      setHistory(validPoints);
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

  // Road snapping is done by the backend (chunked map matching + cache).
  // If it fails we show the raw GPS points instead of inventing a smooth curve.
  useEffect(() => {
    if (!selectedUser || !history || history.length < 2) {
      setSnappedSegments([]);
      setSnappedCoords([]);
      setSnappedDistanceMeters(null);
      setSnapFailed(false);
      return;
    }

    let cancelled = false;
    setIsSnapping(true);
    api
      .get(`/location/route/${selectedUser}`, { params: { date_str: date, profile } })
      .then((res) => {
        if (cancelled) return;
        const data = res.data || {};
        setSnappedSegments(data.segments || []);
        setSnappedCoords(data.coordinates || []);
        setSnappedDistanceMeters(data.snapped ? data.distance_m : null);
        setSnapFailed(!data.snapped);
      })
      .catch((err) => {
        if (cancelled) return;
        console.warn('Road snapping failed, showing raw GPS points:', err.message);
        setSnappedSegments([]);
        setSnappedCoords([]);
        setSnappedDistanceMeters(null);
        setSnapFailed(true);
      })
      .finally(() => {
        if (!cancelled) setIsSnapping(false);
      });

    return () => {
      cancelled = true;
    };
  }, [history, selectedUser, date, profile]);

  // Route Replay Playback Timer
  useEffect(() => {
    if (!isPlaying) {
      if (replayIntervalRef.current) clearInterval(replayIntervalRef.current);
      return;
    }

    const intervalMs = Math.max(100, Math.round(1000 / playbackSpeed));
    replayIntervalRef.current = setInterval(() => {
      setReplayIndex((prev) => {
        if (prev >= history.length - 1) {
          setIsPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, intervalMs);

    return () => {
      if (replayIntervalRef.current) clearInterval(replayIntervalRef.current);
    };
  }, [isPlaying, playbackSpeed, history.length]);

  const handleClearHistory = async () => {
    if (!selectedUser) return;
    if (window.confirm("Clear all historical test telemetry for this employee? This will reset distance to 0 m.")) {
      try {
        await api.delete(`/location/clear/${selectedUser}`);
        setHistory([]);
        setSnappedSegments([]);
        setSnappedCoords([]);
        setSnappedDistanceMeters(null);
        setSnapFailed(false);
        setReplayIndex(0);
        setIsPlaying(false);
      } catch (err) {
        console.error("Clear error:", err);
      }
    }
  };

  // Accurate Physical Travel Distance (Matches backend logic)
  let rawMeters = 0;
  if (history.length > 1) {
    let lastValid = history[0];
    for (let i = 1; i < history.length; i++) {
      const curr = history[i];
      if (curr.accuracy && curr.accuracy > 35) continue;
      const R = 6371000;
      const dLat = (curr.latitude - lastValid.latitude) * Math.PI / 180;
      const dLon = (curr.longitude - lastValid.longitude) * Math.PI / 180;
      const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                Math.cos(lastValid.latitude * Math.PI / 180) * Math.cos(curr.latitude * Math.PI / 180) *
                Math.sin(dLon / 2) * Math.sin(dLon / 2);
      const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

      // Velocity leap check
      const timeDiff = Math.abs((new Date(curr.recorded_at) - new Date(lastValid.recorded_at)) / 1000);
      if (timeDiff > 0 && (dist / timeDiff) * 3.6 > 140) continue;

      const speed = curr.speed || 0;
      const isStill = (curr.activity_type === 'still') || (speed < 2.0);
      if (dist < 15 && isStill) continue;

      rawMeters += dist;
      lastValid = curr;
    }
  }

  const activeMeters = (snapToRoads && snappedDistanceMeters) ? snappedDistanceMeters : rawMeters;
  const displayDistance = activeMeters >= 1000
    ? `${(activeMeters / 1000).toFixed(2)} km (${Math.round(activeMeters)} m)`
    : `${Math.round(activeMeters)} meters`;

  const rawPolylineCoords = history.map((h) => [h.latitude, h.longitude]);
  const useSnapped = snapToRoads && snappedCoords.length > 0;
  const activePolyline = useSnapped ? snappedCoords : rawPolylineCoords;
  const activeSegments = useSnapped ? snappedSegments : [rawPolylineCoords];
  const startPoint = useSnapped && activePolyline.length > 0 ? activePolyline[0] : rawPolylineCoords[0];
  const endPoint = useSnapped && activePolyline.length > 0 ? activePolyline[activePolyline.length - 1] : rawPolylineCoords[rawPolylineCoords.length - 1];

  // Traveled portion of the path for replay highlighting
  const replayFraction = history.length > 1 ? replayIndex / (history.length - 1) : 0;
  const traveledPolylineCutoff = Math.max(1, Math.round(activePolyline.length * replayFraction));
  const traveledSegments = sliceSegments(activeSegments, traveledPolylineCutoff);

  // Replay Current Point (Snaps vehicle marker to the exact road geometry)
  const currentReplayPoint = history[replayIndex] || null;
  const snappedIndex = Math.max(0, Math.min(activePolyline.length - 1, traveledPolylineCutoff - 1));
  const currentReplayCoord = (useSnapped && activePolyline[snappedIndex])
    ? activePolyline[snappedIndex]
    : (currentReplayPoint ? [currentReplayPoint.latitude, currentReplayPoint.longitude] : null);

  // Compute heading dynamically for replay marker (orient along the road tangent when snapped)
  let currentReplayHeading = currentReplayPoint?.heading || 0;
  if (useSnapped && activePolyline.length > 1) {
    const nextIdx = Math.min(activePolyline.length - 1, snappedIndex + 1);
    if (nextIdx !== snappedIndex) {
      currentReplayHeading = calculateBearing(
        activePolyline[snappedIndex][0], activePolyline[snappedIndex][1],
        activePolyline[nextIdx][0], activePolyline[nextIdx][1]
      );
    }
  } else if (!currentReplayHeading && replayIndex < history.length - 1) {
    const nextPoint = history[replayIndex + 1];
    currentReplayHeading = calculateBearing(
      currentReplayPoint.latitude, currentReplayPoint.longitude,
      nextPoint.latitude, nextPoint.longitude
    );
  }

  const selectedEmpObj = employees.find((e) => String(e.id) === String(selectedUser));
  const initials = selectedEmpObj ? selectedEmpObj.name.slice(0, 2).toUpperCase() : 'TR';

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
            >
            </input>
          </div>

          <div className="flex items-center gap-2 mt-4">
            <button
              onClick={fetchRoute}
              disabled={loading}
              className="px-4 py-2 bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-white text-xs font-semibold rounded-lg shadow cursor-pointer disabled:opacity-50"
            >
              {loading ? 'Loading...' : 'Fetch Route'}
            </button>

            {/* Road Curve / Snap Toggle */}
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
              <span>{snapToRoads ? (isSnapping ? '🛣️ Snapping to roads…' : '🛣️ Snap to Roads (ON)') : '📍 Direct Points'}</span>
            </button>

            <select
              value={profile}
              onChange={(e) => setProfile(e.target.value)}
              className="bg-slate-800 border border-slate-700 text-white text-xs rounded-lg px-2 py-2 focus:outline-none focus:border-cyan-500"
              title="Travel mode used for road matching"
            >
              <option value="driving">🚗 Driving</option>
              <option value="walking">🚶 Walking</option>
              <option value="cycling">🚲 Cycling</option>
            </select>

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
            <span className="text-slate-400">Recorded Pings:</span>
            <span className="ml-1.5 font-bold text-white">{history.length}</span>
          </div>
          <div>
            <span className="text-slate-400">Total Travel:</span>
            <span className="ml-1.5 font-bold text-emerald-400">
              {displayDistance}
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

        {snapToRoads && snapFailed && !isSnapping && history.length > 1 && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[999] bg-amber-950/90 border border-amber-700 text-amber-200 text-xs font-semibold rounded-lg px-4 py-2 shadow-2xl">
            ⚠️ Couldn&apos;t match all of this route to roads — showing raw GPS points for the unmatched parts. Try again in a moment.
          </div>
        )}
        
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
            🛰️ Google Satellite
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

        {/* Live Replay HUD Overlay */}
        {currentReplayPoint && history.length > 1 && (
          <div className="absolute top-4 left-4 z-[999] bg-slate-900/90 backdrop-blur-md border border-cyan-500/40 rounded-xl p-3 shadow-2xl min-w-[220px] text-xs">
            <div className="flex items-center justify-between border-b border-slate-800 pb-1.5 mb-2">
              <span className="font-bold text-white flex items-center gap-1.5">
                <Navigation className="w-3.5 h-3.5 text-cyan-400" />
                <span>Replay Telemetry</span>
              </span>
              <span className="text-[10px] bg-cyan-500/20 text-cyan-300 font-mono px-1.5 py-0.5 rounded">
                #{replayIndex + 1}/{history.length}
              </span>
            </div>
            <div className="space-y-1.5 text-slate-300">
              <div className="flex justify-between">
                <span className="text-slate-400">Timestamp:</span>
                <span className="font-bold text-white">
                  {new Date(currentReplayPoint.recorded_at).toLocaleTimeString()}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Current Speed:</span>
                <span className="font-bold text-emerald-400">
                  {Math.round(currentReplayPoint.speed || 0)} km/h
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Activity:</span>
                <span className="font-bold capitalize text-cyan-400">
                  {currentReplayPoint.activity_type || 'moving'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Battery:</span>
                <span className="font-bold text-slate-200">
                  {currentReplayPoint.battery_level ? `${currentReplayPoint.battery_level}%` : '--'}
                </span>
              </div>
            </div>
          </div>
        )}

        <MapContainer
          center={[11.1542, 77.3060]}
          zoom={14}
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
              
              {/* Google Maps Iconic Navigation Blue Route Trail */}
              {/* Layer 1: Dark Blue Outer Border / Casing for crisp road contrast */}
              <Polyline
                positions={activeSegments}
                pathOptions={{ color: '#1e40af', weight: 8, opacity: 0.85, lineCap: 'round', lineJoin: 'round' }}
              />

              {/* Layer 2: Vibrant Google Navigation Royal Blue Inner Core */}
              <Polyline
                positions={activeSegments}
                pathOptions={{ color: '#2563eb', weight: 5, opacity: 1.0, lineCap: 'round', lineJoin: 'round' }}
              />

              {/* Traveled Route Glow (Bright Cyan Traveled Trail during Route Replay) */}
              {traveledSegments.length > 0 && (
                <Polyline
                  positions={traveledSegments}
                  pathOptions={{ color: '#00f0ff', weight: 5, opacity: 1.0, lineCap: 'round', lineJoin: 'round' }}
                />
              )}

              {/* Actual GPS Breadcrumbs (Small Dots) */}
              {rawPolylineCoords.map((coord, idx) => (
                <CircleMarker
                  key={idx}
                  center={coord}
                  radius={idx <= replayIndex ? 3.5 : 2.5}
                  pathOptions={{
                    color: idx <= replayIndex ? '#38bdf8' : '#64748b',
                    fillColor: idx <= replayIndex ? '#0284c7' : '#334155',
                    fillOpacity: 0.85,
                    weight: 1
                  }}
                />
              ))}

              {/* Start Point Marker */}
              {startPoint && (
                <Marker position={startPoint} icon={createStartIcon()}>
                  <Popup>
                    <div className="p-1 text-slate-900 font-semibold text-xs">
                      🏁 Journey Start: {new Date(history[0].recorded_at).toLocaleTimeString()}
                    </div>
                  </Popup>
                </Marker>
              )}

              {/* End Point Marker */}
              {endPoint && (
                <Marker position={endPoint} icon={createEndIcon()}>
                  <Popup>
                    <div className="p-1 text-slate-900 font-semibold text-xs">
                      🎯 Final Point: {new Date(history[history.length - 1].recorded_at).toLocaleTimeString()}
                    </div>
                  </Popup>
                </Marker>
              )}

              {/* Dynamic Animated Route Replay Marker */}
              {currentReplayCoord && (
                <Marker
                  position={currentReplayCoord}
                  icon={createReplayMarkerIcon(
                    initials,
                    currentReplayHeading,
                    currentReplayPoint?.speed || 0
                  )}
                  zIndexOffset={1000}
                >
                  <Popup>
                    <div className="p-1 text-slate-900 font-semibold text-xs">
                      🚗 {selectedEmpObj?.name || 'Technician'} at {new Date(currentReplayPoint.recorded_at).toLocaleTimeString()}
                      <div className="text-[11px] text-slate-600 font-normal">
                        Speed: {Math.round(currentReplayPoint.speed || 0)} km/h
                      </div>
                    </div>
                  </Popup>
                </Marker>
              )}
            </>
          )}
        </MapContainer>

        {/* Bottom Floating Route Replay Player Bar */}
        {history.length > 1 && (
          <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-[999] w-[92%] max-w-3xl bg-slate-900/95 backdrop-blur-xl border border-slate-700/80 rounded-2xl p-4 shadow-2xl flex flex-col gap-3">
            
            {/* Timeline Scrubber */}
            <div className="flex items-center gap-3">
              <span className="text-[11px] font-mono text-cyan-400 font-bold min-w-[55px]">
                {history[0] ? new Date(history[0].recorded_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'}
              </span>

              <input
                type="range"
                min={0}
                max={history.length - 1}
                value={replayIndex}
                onChange={(e) => {
                  setReplayIndex(Number(e.target.value));
                  setIsPlaying(false);
                }}
                className="flex-1 h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
              />

              <span className="text-[11px] font-mono text-cyan-400 font-bold min-w-[55px] text-right">
                {history[history.length - 1] ? new Date(history[history.length - 1].recorded_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'}
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
                <span className="text-xs text-slate-400">Current Position: </span>
                <span className="text-xs font-bold text-white">
                  {currentReplayPoint ? new Date(currentReplayPoint.recorded_at).toLocaleTimeString() : '--:--'}
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

        {history.length === 0 && !loading && (
          <div className="absolute top-8 left-1/2 -translate-x-1/2 bg-slate-900/90 border border-slate-800 text-slate-400 text-xs px-4 py-2 rounded-xl shadow-xl backdrop-blur z-20">
            No route telemetry logged for this employee on {date}.
          </div>
        )}
      </div>

    </div>
  );
}
