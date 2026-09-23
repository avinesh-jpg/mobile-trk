import * as TaskManager from 'expo-task-manager';
import * as Battery from 'expo-battery';
import api from './api';
import { LOCATION_TASK_NAME } from '../config';
import { saveOfflineLocation, syncOfflineLocations } from './offlineStorage';

TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }) => {
  if (error) {
    console.error('Background location error:', error);
    return;
  }

  if (data) {
    const { locations } = data;
    if (locations && locations.length > 0) {
      const latest = locations[0];
      
      let batteryLevel = null;
      try {
        const level = await Battery.getBatteryLevelAsync();
        batteryLevel = Math.round(level * 100);
      } catch (e) {}

      const pingPayload = {
        latitude: latest.coords.latitude,
        longitude: latest.coords.longitude,
        altitude: latest.coords.altitude || null,
        speed: latest.coords.speed ? Math.round(latest.coords.speed * 3.6) : 0, // Convert m/s to km/h
        heading: latest.coords.heading || 0,
        accuracy: latest.coords.accuracy || 10,
        battery_level: batteryLevel,
        is_moving: (latest.coords.speed || 0) > 0.5,
        activity_type: (latest.coords.speed || 0) > 4 ? 'in_vehicle' : ((latest.coords.speed || 0) > 0.5 ? 'walking' : 'still'),
        is_mock: latest.mocked || false,
        recorded_at: new Date(latest.timestamp).toISOString(),
      };

      try {
        await api.post('/location/ping', pingPayload);
        // Try flushing any previously accumulated offline logs
        await syncOfflineLocations();
      } catch (networkErr) {
        // Device is offline or in dead zone; save locally
        await saveOfflineLocation(pingPayload);
      }
    }
  }
});
