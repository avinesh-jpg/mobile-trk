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

  // --- STRICT DAILY SHIFT VERIFICATION ---
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const today = `${year}-${month}-${day}`;

  const active = await AsyncStorage.getItem('shift_active');
  const shiftDate = await AsyncStorage.getItem('shift_date');

  // If shift was NOT explicitly started TODAY, disarm background updates immediately and do not ping
  if (active !== 'true' || shiftDate !== today) {
    try {
      await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
    } catch (e) {}
    await AsyncStorage.removeItem('shift_active');
    await AsyncStorage.removeItem('shift_date');
    return;
  }

  // --- 8:00 PM AUTO SHIFT END & GPS SHUTDOWN ---
  const hour = d.getHours(); // 0-23 in local device time (20 = 8:00 PM)

  // If time is 8:00 PM or night before 6:00 AM
  if (hour >= 20 || hour < 6) {
    try {
      // Stop background location updates and remove foreground persistent notification
      await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
    } catch (e) {}

    await AsyncStorage.removeItem('shift_active');
    await AsyncStorage.removeItem('shift_date');

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

      const rawSpeedKmh = latest.coords.speed ? (latest.coords.speed * 3.6) : 0;
      const isVehicleMoving = rawSpeedKmh > 2.5;
      const isWalkingMotion = rawSpeedKmh > 1.2;
      const isMoving = isVehicleMoving || isWalkingMotion;
      const cleanSpeed = isMoving ? Math.round(rawSpeedKmh) : 0;
      const cleanActivity = isMoving ? (rawSpeedKmh > 12 ? 'in_vehicle' : 'walking') : 'still';

      // Adaptive throttle: while stationary in background, send heartbeat once every 60s
      // While moving on bus/bike/walking, stream every 4s fix
      const nowMs = Date.now();
      const lastBgStr = await AsyncStorage.getItem('last_bg_ping_time');
      const lastBgMs = lastBgStr ? parseInt(lastBgStr, 10) : 0;
      if (!isMoving && (nowMs - lastBgMs < 60000)) {
        return;
      }
      if (!isMoving) {
        await AsyncStorage.setItem('last_bg_ping_time', String(nowMs));
      }

      const pingPayload = {
        latitude: latest.coords.latitude,
        longitude: latest.coords.longitude,
        altitude: latest.coords.altitude || null,
        speed: cleanSpeed,
        heading: latest.coords.heading || 0,
        accuracy: latest.coords.accuracy || 10,
        battery_level: batteryLevel,
        is_moving: isMoving,
        activity_type: cleanActivity,
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
