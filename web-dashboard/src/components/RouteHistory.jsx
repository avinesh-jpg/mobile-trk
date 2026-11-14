import { useEffect, useState } from "react";
import { MapContainer, TileLayer, Polyline, Marker, Popup } from "react-leaflet";
import { api } from "../api";

export default function RouteHistory({ employeeId, selectedDate }) {
  const [routePath, setRoutePath] = useState([]);
  const [stats, setStats] = useState({ distanceKm: 0, confidence: 0 });

  useEffect(() => {
    async function loadSnappedRoute() {
      const res = await api.get(`/history/${employeeId}`, {
        params: { date: selectedDate },
      });
      // Use road_snapped_path instead of raw GPS coordinates
      setRoutePath(res.data.road_snapped_path || []);
      setStats({
        distanceKm: res.data.total_distance_km,
        confidence: res.data.map_match_confidence,
      });
    }
    if (employeeId && selectedDate) loadSnappedRoute();
  }, [employeeId, selectedDate]);

  const startPoint = routePath[0];
  const endPoint = routePath[routePath.length - 1];

  return (
    <div>
      <div className="route-summary">
        <span>Distance Traveled: <strong>{stats.distanceKm} km</strong></span>
        <span> | Road Match Accuracy: <strong>{Math.round(stats.confidence * 100)}%</strong></span>
      </div>

      <MapContainer
        center={startPoint || [11.0168, 76.9558]}
        zoom={14}
        style={{ height: "500px", width: "100%" }}
      >
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />

        {/* Draws the smooth street-aligned path */}
        {routePath.length > 1 && (
          <Polyline positions={routePath} color="#2563eb" weight={5} opacity={0.85} />
        )}

        {startPoint && (
          <Marker position={startPoint}>
            <Popup>Shift Start</Popup>
          </Marker>
        )}

        {endPoint && (
          <Marker position={endPoint}>
            <Popup>Last Known Location</Popup>
          </Marker>
        )}
      </MapContainer>
    </div>
  );
}