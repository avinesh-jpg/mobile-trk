import * as TaskManager from 'expo-task-manager';
import * as Battery from 'expo-battery';
import api from './api';
import { LOCATION_TASK_NAME } from '../config';
import { saveOfflineLocation, syncOfflineLocations } from './offlineStorage';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';

TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }) => {
  if (error) {
    console.error('Background location error:', error);
    return;
  }

  // --- 8:00 PM AUTO SHIFT END & GPS SHUTDOWN ---
  const now = new Date();
  const hour = now.getHours(); // 0-23 in local device time (20 = 8:00 PM)

  // If time is 8:00 PM or night before 6:00 AM
  if (hour >= 20 || hour < 6) {
    try {
      // Stop background location updates and remove foreground persistent notification
      await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
    } catch (e) {}

    await AsyncStorage.removeItem('shift_active');

    // Inform cloud backend that shift ended automatically at 8:00 PM
    try {
      await api.post('/location/stop-shift');
    } catch (e) {}

    return;
  }
  // ----------------------------------------------

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
