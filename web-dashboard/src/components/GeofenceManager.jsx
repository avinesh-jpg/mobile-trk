import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Circle, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import { api } from '../api';
import { Shield, Plus, Trash2, MapPin } from 'lucide-react';

const createGeofenceMarkerIcon = () => L.divIcon({
  className: 'custom-geofence-pin',
  html: `
    <div style="display: flex; align-items: center; justify-content: center; width: 30px; height: 30px; border-radius: 50%; background: #6366f1; border: 2.5px solid #ffffff; box-shadow: 0 4px 10px rgba(0,0,0,0.5); font-size: 14px;">
      🏢
    </div>
  `,
  iconSize: [30, 30],
  iconAnchor: [15, 15],
  popupAnchor: [0, -15]
});

export default function GeofenceManager() {
  const [geofences, setGeofences] = useState([]);
  const [name, setName] = useState('');
  const [clientName, setClientName] = useState('');
  const [lat, setLat] = useState('12.9716');
  const [lng, setLng] = useState('77.5946');
  const [radius, setRadius] = useState('150');
  const [loading, setLoading] = useState(false);

  const fetchGeofences = async () => {
    try {
      const res = await api.get('/geofence');
      setGeofences(res.data);
    } catch (err) {
      console.error('Error fetching geofences:', err);
    }
  };

  useEffect(() => {
    fetchGeofences();
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post('/geofence', {
        name,
        client_name: clientName,
        latitude: parseFloat(lat),
        longitude: parseFloat(lng),
        radius_meters: parseFloat(radius),
      });
      setName('');
      setClientName('');
      fetchGeofences();
    } catch (err) {
      console.error('Error creating geofence:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await api.delete(`/geofence/${id}`);
      fetchGeofences();
    } catch (err) {
      console.error('Error deleting geofence:', err);
    }
  };

  return (
    <div className="flex-1 flex flex-col md:flex-row h-[calc(100vh-4rem)] overflow-hidden">
      
      {/* Sidebar: Geofence List & Add Form */}
      <div className="w-full md:w-96 bg-slate-900 border-r border-slate-800 flex flex-col z-20">
        
        <div className="p-4 border-b border-slate-800">
          <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <Shield className="w-4 h-4 text-cyan-400" /> Geofenced Client Sites
          </h2>
          <p className="text-xs text-slate-400">Boundary zones for automatic visit confirmation</p>
        </div>

        {/* Add New Geofence Form */}
        <div className="p-4 border-b border-slate-800 bg-slate-950/40">
          <h3 className="text-xs font-bold text-slate-300 uppercase mb-3 flex items-center gap-1.5">
            <Plus className="w-3.5 h-3.5 text-cyan-400" /> Add New Site Boundary
          </h3>
          <form onSubmit={handleCreate} className="space-y-2.5 text-xs">
            <input
              type="text"
              placeholder="Site / Location Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
              required
            />
            <input
              type="text"
              placeholder="Client Name (Optional)"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                type="number"
                step="any"
                placeholder="Latitude"
                value={lat}
                onChange={(e) => setLat(e.target.value)}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none"
                required
              />
              <input
                type="number"
                step="any"
                placeholder="Longitude"
                value={lng}
                onChange={(e) => setLng(e.target.value)}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none"
                required
              />
            </div>
            <input
              type="number"
              placeholder="Radius (Meters)"
              value={radius}
              onChange={(e) => setRadius(e.target.value)}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none"
              required
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-semibold rounded-lg shadow cursor-pointer disabled:opacity-50"
            >
              {loading ? 'Creating...' : 'Save Geofence'}
            </button>
          </form>
        </div>

        {/* Existing Geofences List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {geofences.map((geo) => (
            <div
              key={geo.id}
              className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl flex items-center justify-between"
            >
              <div>
                <h4 className="text-xs font-bold text-white">{geo.name}</h4>
                <p className="text-[11px] text-slate-400">{geo.client_name || 'Client Site'}</p>
                <p className="text-[10px] text-cyan-400 mt-1">Radius: {geo.radius_meters} meters</p>
              </div>
              <button
                onClick={() => handleDelete(geo.id)}
                className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-slate-800 rounded-lg transition cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>

      </div>

      {/* Map View with Geofence Circles */}
      <div className="flex-1 relative">
        <MapContainer
          center={[12.9716, 77.5946]}
          zoom={13}
          style={{ height: '100%', width: '100%', minHeight: '100%' }}
          className="w-full h-full"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {geofences.map((geo) => (
            <React.Fragment key={geo.id}>
              <Circle
                center={[geo.latitude, geo.longitude]}
                radius={geo.radius_meters}
                pathOptions={{ color: '#06b6d4', fillColor: '#06b6d4', fillOpacity: 0.2 }}
              />
              <Marker position={[geo.latitude, geo.longitude]} icon={createGeofenceMarkerIcon()}>
                <Popup>
                  <div className="p-1 text-slate-900 font-semibold text-xs">
                    🏢 {geo.name} ({geo.radius_meters}m zone)
                  </div>
                </Popup>
              </Marker>
            </React.Fragment>
          ))}
        </MapContainer>
      </div>

    </div>
  );
}
