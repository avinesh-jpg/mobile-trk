import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from 'react-leaflet';
import L from 'leaflet';
import { api } from '../api';
import { User, Battery, Activity, AlertTriangle, Navigation, RefreshCw, Send } from 'lucide-react';

// Custom Google-style Navigation Marker with Compass Heading Rotation
const createAvatarIcon = (name, isOnline, isMock, heading = 0, speed = 0) => {
  const initials = name.slice(0, 2).toUpperCase();
  const bgClass = isMock ? '#ef4444' : (isOnline ? '#0284c7' : '#64748b');
  const isMoving = (speed || 0) > 2;
  
  return L.divIcon({
    className: 'custom-leaflet-marker',
    html: `
      <div style="position: relative; display: flex; align-items: center; justify-content: center;">
        ${isOnline ? '<div style="position: absolute; width: 48px; height: 48px; border-radius: 9999px; background: rgba(2,132,199,0.3); animation: ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>' : ''}
        
        <!-- Rotating Navigation Heading Pointer (Google Maps style) -->
        <div style="transform: rotate(${heading || 0}deg); transition: transform 0.5s ease; position: relative;">
          ${isMoving ? `
            <div style="position: absolute; top: -14px; left: 50%; transform: translateX(-50%); width: 0; height: 0; border-left: 7px solid transparent; border-right: 7px solid transparent; border-bottom: 12px solid #38bdf8; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.5));"></div>
          ` : ''}
          <div style="position: relative; width: 40px; height: 40px; border-radius: 9999px; background: ${bgClass}; color: #ffffff; font-weight: 800; font-size: 13px; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 10px rgba(0,0,0,0.6); border: 2.5px solid #ffffff;">
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

function ChangeMapView({ center, zoom }) {
  const map = useMap();
  useEffect(() => {
    const timer = setTimeout(() => {
      map.invalidateSize();
    }, 250);
    if (center && center[0] && center[1]) {
      map.setView(center, zoom || 15);
    }
    return () => clearTimeout(timer);
  }, [center, zoom, map]);
  return null;
}

export default function LiveMap({ liveFeed }) {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState(null);
  const [simulating, setSimulating] = useState(false);
  const [mapStyle, setMapStyle] = useState('google-hybrid'); // 'google-hybrid', 'google-streets', 'dark'
  const [showTraffic, setShowTraffic] = useState(true);

  const fetchEmployees = async () => {
    try {
      const res = await api.get('/location/latest');
      setEmployees(res.data);
      if (res.data.length > 0 && !selectedUser) {
        setSelectedUser(res.data[0]);
      }
    } catch (err) {
      console.error('Error fetching live employees:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEmployees();
    const interval = setInterval(fetchEmployees, 15000);
    return () => clearInterval(interval);
  }, []);

  // Update employee state dynamically when a WebSocket broadcast arrives
  useEffect(() => {
    if (!liveFeed) return;
    setEmployees((prev) => {
      return prev.map((emp) => {
        if (emp.user_id === liveFeed.user_id) {
          const updated = {
            ...emp,
            is_online: true,
            latest_location: {
              latitude: liveFeed.latitude,
              longitude: liveFeed.longitude,
              speed: liveFeed.speed,
              battery_level: liveFeed.battery_level,
              activity_type: liveFeed.activity_type,
              is_mock: liveFeed.is_mock,
              recorded_at: liveFeed.recorded_at,
            },
          };
          if (selectedUser?.user_id === emp.user_id) {
            setSelectedUser(updated);
          }
          return updated;
        }
        return emp;
      });
    });
  }, [liveFeed]);

  // Dev Tool: Send a simulated live ping to test the real-time pipeline
  const sendSimulatedPing = async (emp) => {
    setSimulating(true);
    try {
      const currentLat = emp.latest_location?.latitude || 12.9716;
      const currentLng = emp.latest_location?.longitude || 77.5946;
      const newLat = currentLat + (Math.random() - 0.5) * 0.003;
      const newLng = currentLng + (Math.random() - 0.5) * 0.003;

      await api.post('/location/ping', {
        latitude: newLat,
        longitude: newLng,
        speed: Math.round(20 + Math.random() * 30),
        battery_level: Math.round(70 + Math.random() * 20),
        activity_type: 'in_vehicle',
        is_moving: true,
        is_mock: false,
        recorded_at: new Date().toISOString()
      });
      fetchEmployees();
    } catch (err) {
      console.error('Simulate error:', err);
    } finally {
      setSimulating(false);
    }
  };

  const mapCenter = selectedUser?.latest_location
    ? [selectedUser.latest_location.latitude, selectedUser.latest_location.longitude]
    : [11.1542, 77.3060];

  return (
    <div className="flex-1 flex flex-col md:flex-row h-[calc(100vh-4rem)] w-full overflow-hidden">
      
      {/* Left Sidebar: Fleet List */}
      <div className="w-full md:w-96 bg-slate-900 border-r border-slate-800 flex flex-col z-20 flex-shrink-0">
        
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">Field Personnel</h2>
            <p className="text-xs text-slate-400">{employees.length} Registered Technicians</p>
          </div>
          <button
            onClick={fetchEmployees}
            title="Refresh Fleet"
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {/* Employee Cards List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {employees.map((emp) => {
            const isSelected = selectedUser?.user_id === emp.user_id;
            const hasLocation = !!emp.latest_location;

            return (
              <div
                key={emp.user_id}
                onClick={() => setSelectedUser(emp)}
                className={`p-3 rounded-xl border transition cursor-pointer ${
                  isSelected
                    ? 'bg-slate-800/90 border-cyan-500 shadow-md'
                    : 'bg-slate-950/40 border-slate-800 hover:bg-slate-800/40'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center space-x-2.5">
                    <div className="relative">
                      <div className={`w-8 h-8 rounded-full ${emp.is_online ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-400'} flex items-center justify-center font-bold text-xs`}>
                        {emp.name.slice(0, 2).toUpperCase()}
                      </div>
                      <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-slate-900 ${emp.is_online ? 'bg-emerald-400' : 'bg-slate-500'}`} />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-white leading-tight">{emp.name}</h3>
                      <p className="text-[11px] text-slate-400">{emp.email}</p>
                    </div>
                  </div>

                  {emp.latest_location?.is_mock && (
                    <span className="flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 border border-red-500/30" title="ML Flagged Fake GPS">
                      <AlertTriangle className="w-3 h-3" /> FAKE GPS
                    </span>
                  )}
                </div>

                {hasLocation ? (
                  <div className="grid grid-cols-3 gap-1 pt-2 border-t border-slate-800/80 text-[11px] text-slate-300">
                    <div className="flex items-center gap-1">
                      <Activity className="w-3 h-3 text-cyan-400" />
                      <span className="capitalize">{emp.latest_location.activity_type || 'Unknown'}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Navigation className="w-3 h-3 text-indigo-400" />
                      <span>{(emp.latest_location.activity_type === 'still' || (emp.latest_location.speed || 0) < 2) ? '0 km/h' : `${Math.round(emp.latest_location.speed)} km/h`}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Battery className="w-3 h-3 text-emerald-400" />
                      <span>{emp.latest_location.battery_level ?? '--'}%</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-slate-500 italic">No GPS coordinates recorded yet</p>
                )}

                {/* Test Simulate Ping Button */}
                <div className="mt-2.5 pt-2 border-t border-slate-800/50 flex justify-end">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      sendSimulatedPing(emp);
                    }}
                    disabled={simulating}
                    className="text-[10px] px-2 py-1 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 rounded flex items-center gap-1 cursor-pointer"
                  >
                    <Send className="w-2.5 h-2.5" /> Test Live Ping
                  </button>
                </div>
              </div>
            );
          })}
        </div>

      </div>

      {/* Right: Fullscreen Interactive Leaflet Map */}
      <div className="flex-1 h-full w-full relative min-h-[400px]">
        
        {/* Floating Map Style & Google Traffic Selector */}
        <div className="absolute top-4 right-4 z-[999] bg-slate-900/90 backdrop-blur-md border border-slate-700/80 rounded-xl p-1 shadow-2xl flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => setMapStyle('google-hybrid')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 ${
              mapStyle === 'google-hybrid'
                ? 'bg-gradient-to-r from-cyan-500 to-indigo-600 text-white shadow'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            🛰️ Satellite + Names
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

          <div className="h-4 w-[1px] bg-slate-700 mx-1" />

          {/* Google Live Traffic Toggle */}
          <button
            onClick={() => setShowTraffic(!showTraffic)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
              showTraffic
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                : 'bg-slate-800 text-slate-400'
            }`}
            title="Real-time road congestion and traffic conditions"
          >
            🚦 Traffic: {showTraffic ? 'ON' : 'OFF'}
          </button>
        </div>

        <MapContainer
          center={mapCenter}
          zoom={15}
          scrollWheelZoom={true}
          style={{ height: '100%', width: '100%', minHeight: '100%' }}
        >
          {mapStyle === 'google-hybrid' && (
            <TileLayer
              attribution='&copy; Google Maps'
              url={`https://mt1.google.com/vt/lyrs=y${showTraffic ? ',traffic' : ''}&x={x}&y={y}&z={z}`}
              maxZoom={20}
              subdomains={['mt0', 'mt1', 'mt2', 'mt3']}
            />
          )}

          {mapStyle === 'google-streets' && (
            <TileLayer
              attribution='&copy; Google Maps'
              url={`https://mt1.google.com/vt/lyrs=m${showTraffic ? ',traffic' : ''}&x={x}&y={y}&z={z}`}
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

          <ChangeMapView center={mapCenter} />

          {/* Render markers & meter-accuracy radar circles for all active employees */}
          {employees.map((emp) => {
            if (!emp.latest_location) return null;
            const pos = [emp.latest_location.latitude, emp.latest_location.longitude];
            const accuracyMeters = emp.latest_location.accuracy || 15;

            return (
              <React.Fragment key={emp.user_id}>
                {/* GPS Accuracy Circle (meter-level precision radius) */}
                <Circle
                  center={pos}
                  radius={accuracyMeters}
                  pathOptions={{
                    color: '#0284c7',
                    fillColor: '#38bdf8',
                    fillOpacity: 0.15,
                    weight: 1.5,
                    dashArray: '4, 4'
                  }}
                />

                <Marker
                  position={pos}
                  icon={createAvatarIcon(
                    emp.name,
                    emp.is_online,
                    emp.latest_location.is_mock,
                    emp.latest_location.heading,
                    emp.latest_location.speed
                  )}
                >
                  <Popup>
                    <div className="p-1.5 text-slate-900 min-w-[200px]">
                      <div className="border-b pb-1 mb-2">
                        <h4 className="font-bold text-sm text-slate-900">{emp.name}</h4>
                        <p className="text-[11px] text-slate-500">{emp.email}</p>
                      </div>
                      <div className="text-xs space-y-1.5">
                        <div className="flex justify-between">
                          <span className="text-slate-500 font-medium">Speed:</span>
                          <span className="font-bold text-slate-900">{(emp.latest_location.activity_type === 'still' || (emp.latest_location.speed || 0) < 2) ? 0 : Math.round(emp.latest_location.speed)} km/h</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500 font-medium">GPS Accuracy:</span>
                          <span className="font-bold text-emerald-600">±{Math.round(accuracyMeters)} meters</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500 font-medium">Compass Heading:</span>
                          <span className="font-bold text-slate-900">{Math.round(emp.latest_location.heading || 0)}°</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500 font-medium">Activity:</span>
                          <span className="font-bold capitalize text-slate-900">{emp.latest_location.activity_type}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500 font-medium">Battery:</span>
                          <span className="font-bold text-slate-900">{emp.latest_location.battery_level}%</span>
                        </div>
                        <div className="flex justify-between border-t pt-1 text-[11px] text-slate-400">
                          <span>Updated:</span>
                          <span>{new Date(emp.latest_location.recorded_at).toLocaleTimeString()}</span>
                        </div>
                        {emp.latest_location.is_mock && (
                          <div className="mt-1 p-1 bg-red-100 border border-red-300 text-red-700 text-[10px] font-bold rounded text-center">
                            ⚠️ Warning: Mock / Spoofed GPS Detected
                          </div>
                        )}
                      </div>
                    </div>
                  </Popup>
                </Marker>
              </React.Fragment>
            );
          })}
        </MapContainer>
      </div>

    </div>
  );
}
