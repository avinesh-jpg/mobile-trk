import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Alert,
  SafeAreaView,
} from 'react-native';
import * as Location from 'expo-location';
import * as Battery from 'expo-battery';
import { Accelerometer } from 'expo-sensors';
import { LOCATION_TASK_NAME } from '../config';
import api from '../services/api';
import { syncOfflineLocations } from '../services/offlineStorage';

export default function TrackingScreen({ user, onLogout }) {
  const [isTracking, setIsTracking] = useState(false);
  const [activity, setActivity] = useState('still');
  const foregroundWatcher = useRef(null);

  // Monitor motion sensor and check initial tracking state
  useEffect(() => {
    Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME).then((started) => {
      setIsTracking(started);
    });

    const sensorSub = Accelerometer.addListener((accelData) => {
      const magnitude = Math.sqrt(
        accelData.x * accelData.x +
        accelData.y * accelData.y +
        accelData.z * accelData.z
      );
      const motionDelta = Math.abs(magnitude - 1.0);
      if (motionDelta > 0.4) {
        setActivity('walking/moving');
      } else {
        setActivity('still');
      }
    });
    Accelerometer.setUpdateInterval(10000); // 10 seconds check to preserve battery

    return () => {
      sensorSub.remove();
      if (foregroundWatcher.current) {
        foregroundWatcher.current.remove();
      }
    };
  }, []);

  const sendLocationPing = async (coords, isMock = false) => {
    try {
      let liveBattery = null;
      try {
        const freshLvl = await Battery.getBatteryLevelAsync();
        liveBattery = Math.round(freshLvl * 100);
      } catch (e) {}

      const rawSpeedKmh = coords.speed ? (coords.speed * 3.6) : 0;
      // Real movement requires both physical accelerometer locomotion AND minimum speed (> 2.5 km/h)
      const isPhysicallyMoving = activity !== 'still' && rawSpeedKmh > 2.5;
      const cleanSpeed = isPhysicallyMoving ? Math.round(rawSpeedKmh) : 0;
      const cleanActivity = isPhysicallyMoving ? (rawSpeedKmh > 15 ? 'in_vehicle' : 'walking') : 'still';

      await api.post('/location/ping', {
        latitude: coords.latitude,
        longitude: coords.longitude,
        altitude: coords.altitude || null,
        speed: cleanSpeed,
        heading: coords.heading || 0,
        accuracy: coords.accuracy || 10,
        battery_level: liveBattery,
        is_moving: isPhysicallyMoving,
        activity_type: cleanActivity,
        is_mock: isMock || coords.mocked || false,
        recorded_at: new Date().toISOString(),
      });
      // Automatically flush any cached offline points
      await syncOfflineLocations();
    } catch (err) {
      console.log('Telemetry sync postponed:', err.message);
    }
  };

  const startTracking = async () => {
    const { status: fgStatus } = await Location.requestForegroundPermissionsAsync();
    if (fgStatus !== 'granted') {
      Alert.alert('Permission Required', 'Location permission is required during active shift.');
      return;
    }

    try {
      // 1. BATTERY SAVER: Balanced accuracy uses cell/Wi-Fi when still, saving 70% power
      // 2. Poll every 30 seconds or 35 meters instead of 5 seconds (greatly reduces radio wakeups)
      foregroundWatcher.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced,
          timeInterval: 30000, // Every 30 seconds (optimal for battery)
          distanceInterval: 35, // Or 35 meters traveled
        },
        (loc) => {
          sendLocationPing(loc.coords, loc.mocked);
        }
      );

      // Background tracking for standalone APK
      try {
        const { status: bgStatus } = await Location.requestBackgroundPermissionsAsync();
        if (bgStatus === 'granted') {
          await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
            accuracy: Location.Accuracy.Balanced,
            timeInterval: 45000, // 45 seconds in background
            distanceInterval: 40,
            foregroundService: {
              notificationTitle: 'Shift Active',
              notificationBody: 'Work shift in progress (Battery Saver Active).',
              notificationColor: '#10b981',
            },
          });
        }
      } catch (bgErr) {}

      setIsTracking(true);
    } catch (err) {
      Alert.alert('Error', err.message);
    }
  };

  const stopTracking = async () => {
    try {
      if (foregroundWatcher.current) {
        foregroundWatcher.current.remove();
        foregroundWatcher.current = null;
      }
      const running = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
      if (running) {
        await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
      }
      setIsTracking(false);
    } catch (err) {
      console.error('Stop error:', err);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        
        {/* User Profile Header */}
        <View style={styles.header}>
          <View style={styles.userInfo}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {user.name ? user.name.slice(0, 2).toUpperCase() : 'EM'}
              </Text>
            </View>
            <View>
              <Text style={styles.userName}>{user.name}</Text>
              <Text style={styles.userEmail}>{user.email}</Text>
            </View>
          </View>
          <TouchableOpacity style={styles.logoutBtn} onPress={onLogout}>
            <Text style={styles.logoutText}>Logout</Text>
          </TouchableOpacity>
        </View>

        {/* Center Shift Status Card */}
        <View style={styles.centerContainer}>
          <View style={[styles.statusCard, isTracking ? styles.cardOnline : styles.cardOffline]}>
            <View style={styles.statusIndicatorRow}>
              <View style={[styles.statusDot, isTracking ? styles.dotOnline : styles.dotOffline]} />
              <Text style={[styles.statusBadgeText, isTracking ? styles.textOnline : styles.textOffline]}>
                {isTracking ? 'ONLINE' : 'OFFLINE'}
              </Text>
            </View>

            <Text style={styles.statusHeading}>
              {isTracking ? 'Shift in Progress' : 'Shift Ended / Paused'}
            </Text>
            <Text style={styles.statusSubtext}>
              {isTracking
                ? 'Your work hours are being logged.'
                : 'Tap Start Shift below when you begin work.'}
            </Text>
          </View>

          {/* Clean Start / End Action Button */}
          <TouchableOpacity
            style={[styles.mainButton, isTracking ? styles.buttonStop : styles.buttonStart]}
            onPress={isTracking ? stopTracking : startTracking}
            activeOpacity={0.8}
          >
            <Text style={styles.mainButtonText}>
              {isTracking ? 'End Shift' : 'Start Shift'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Minimal Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            {isTracking ? 'Status: Active on duty' : 'Status: Off duty'}
          </Text>
        </View>

      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#090d16',
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 30,
    paddingBottom: 20,
    justifyContent: 'space-between',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#06b6d4',
    fontWeight: 'bold',
    fontSize: 16,
  },
  userName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#f8fafc',
  },
  userEmail: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 2,
  },
  logoutBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: '#1e293b',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  logoutText: {
    color: '#f87171',
    fontSize: 12,
    fontWeight: '600',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  statusCard: {
    borderRadius: 20,
    padding: 28,
    alignItems: 'center',
    borderWidth: 1.5,
    marginBottom: 30,
  },
  cardOnline: {
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
    borderColor: '#10b981',
  },
  cardOffline: {
    backgroundColor: 'rgba(51, 65, 85, 0.25)',
    borderColor: '#334155',
  },
  statusIndicatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  dotOnline: {
    backgroundColor: '#10b981',
  },
  dotOffline: {
    backgroundColor: '#64748b',
  },
  statusBadgeText: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  textOnline: {
    color: '#10b981',
  },
  textOffline: {
    color: '#94a3b8',
  },
  statusHeading: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 6,
    textAlign: 'center',
  },
  statusSubtext: {
    fontSize: 13,
    color: '#94a3b8',
    textAlign: 'center',
  },
  mainButton: {
    paddingVertical: 18,
    borderRadius: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  buttonStart: {
    backgroundColor: '#10b981',
  },
  buttonStop: {
    backgroundColor: '#ef4444',
  },
  mainButtonText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  footer: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  footerText: {
    color: '#64748b',
    fontSize: 12,
  },
});
