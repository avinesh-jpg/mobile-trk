import { useEffect, useState } from "react";
import { MapContainer, TileLayer, Polyline, CircleMarker, Popup, useMap } from "react-leaflet";
import * as apiModule from "../api";

const API_URL = import.meta.env.VITE_API_URL || "https://geotrack-backend.onrender.com";

function MapResizer({ center }) {
  const map = useMap();

  useEffect(() => {
    const timer = setTimeout(() => {
      map.invalidateSize();
      if (center && center.length === 2) {
        map.setView(center, 14);
      }
    }, 150);
    return () => clearTimeout(timer);
  }, [map, center]);

  return null;
}

export default function RouteHistory() {
  const [users, setUsers] = useState([]);
  const [employeeId, setEmployeeId] = useState("");
  const [selectedDate, setSelectedDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [routePath, setRoutePath] = useState([]);
  const [stats, setStats] = useState({ distanceKm: 0, confidence: 0, points: 0 });
  const [loading, setLoading] = useState(false);

  const getAuthHeaders = () => {
    const token = localStorage.getItem("token");
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  useEffect(() => {
    async function fetchStaff() {
      try {
        if (typeof apiModule.getUsers === "function") {
          const data = await apiModule.getUsers();
          setUsers(data || []);
          if (data && data.length > 0) {
            setEmployeeId(String(data[0].id));
          }
          return;
        }

        const res = await fetch(`${API_URL}/api/auth/users`, {
          headers: getAuthHeaders(),
        });
        if (res.ok) {
          const data = await res.json();
          setUsers(data || []);
          if (data && data.length > 0) {
            setEmployeeId(String(data[0].id));
          }
        }
      } catch (err) {
        console.error("Failed to load staff list:", err);
      }
    }

    fetchStaff();
  }, []);

  useEffect(() => {
    async function loadSnappedRoute() {
      if (!employeeId || !selectedDate) return;
      setLoading(true);
      try {
        const res = await fetch(
          `${API_URL}/api/location/history/${employeeId}?date=${selectedDate}`,
          { headers: getAuthHeaders() }
        );
        const data = await res.json();
        setRoutePath(data.road_snapped_path || []);
        setStats({
          distanceKm: data.total_distance_km || 0,
          confidence: data.map_match_confidence || 0,
          points: data.clean_count || 0,
        });
      } catch (err) {
        console.error("Failed to fetch route history:", err);
      } finally {
        setLoading(false);
      }
    }

    loadSnappedRoute();
  }, [employeeId, selectedDate]);

  const startPoint = routePath.length > 0 ? routePath[0] : null;
  const endPoint = routePath.length > 0 ? routePath[routePath.length - 1] : null;
  const defaultCenter = [11.0168, 76.9558];

  return (
    <div className="flex flex-col h-[calc(100vh-80px)] p-4 gap-3 text-slate-100">
      {/* Controls & Metrics Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-800/90 border border-slate-700 px-4 py-3 rounded-lg">
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-sm font-semibold text-slate-300">Staff:</label>
          <select
            value={employeeId}
            onChange={(e) => setEmployeeId(e.target.value)}
            className="bg-slate-900 text-white border border-slate-700 px-3 py-1.5 rounded-md text-sm"
          >
            {users.length === 0 && <option value="1">Staff #1</option>}
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.full_name || u.username || u.email || `Staff #${u.id}`}
              </option>
            ))}
          </select>

          <label className="text-sm font-semibold text-slate-300">Date:</label>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="bg-slate-900 text-white border border-slate-700 px-3 py-1.5 rounded-md text-sm"
          />
        </div>

        <div className="flex flex-wrap items-center gap-5 text-sm">
          <span>
            Distance Traveled:{" "}
            <strong className="text-sky-400">{stats.distanceKm} km</strong>
          </span>
          <span>
            Road Match Accuracy:{" "}
            <strong className="text-emerald-400">
              {Math.round(stats.confidence * 100)}%
            </strong>
          </span>
          <span>
            Clean Pings: <strong>{stats.points}</strong>
          </span>
          {loading && (
            <span className="text-amber-400 animate-pulse">
              Snapping route...
            </span>
          )}
        </div>
      </div>

      {/* Full-Height Map */}
      <div className="flex-1 min-h-[520px] w-full rounded-lg overflow-hidden border border-slate-700">
        <MapContainer
          center={startPoint || defaultCenter}
          zoom={14}
          style={{ height: "100%", width: "100%" }}
        >
          <MapResizer center={startPoint} />
          <TileLayer
            attribution='&copy; OpenStreetMap contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {routePath.length > 1 && (
            <Polyline
              positions={routePath}
              pathOptions={{ color: "#3b82f6", weight: 5, opacity: 0.9 }}
            />
          )}

          {startPoint && (
            <CircleMarker
              center={startPoint}
              radius={8}
              pathOptions={{ color: "#10b981", fillColor: "#10b981", fillOpacity: 1 }}
            >
              <Popup>Shift Start</Popup>
            </CircleMarker>
          )}

          {endPoint && (
            <CircleMarker
              center={endPoint}
              radius={8}
              pathOptions={{ color: "#ef4444", fillColor: "#ef4444", fillOpacity: 1 }}
            >
              <Popup>Last Known Location</Popup>
            </CircleMarker>
          )}
        </MapContainer>
      </div>
    </div>
  );
}