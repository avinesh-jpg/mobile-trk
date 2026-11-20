import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Alert,
  BackHandler,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import * as Battery from 'expo-battery';
import { Accelerometer } from 'expo-sensors';
import { LOCATION_TASK_NAME } from '../config';
import api from '../services/api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { saveOfflineLocation, syncOfflineLocations } from '../services/offlineStorage';

const isExpoGo = Constants.appOwnership === 'expo' || Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

const getTodayDateStr = () => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export default function TrackingScreen({ user, onLogout }) {
  const [isTracking, setIsTracking] = useState(false);
  const [activity, setActivity] = useState('still');
  const foregroundWatcher = useRef(null);
  const lastStationaryPingTime = useRef(0);

  // Strict Daily Shift: Only resume tracking if explicitly started TODAY
  useEffect(() => {
    const checkDailyShiftState = async () => {
      try {
        const active = await AsyncStorage.getItem('shift_active');
        const shiftDate = await AsyncStorage.getItem('shift_date');
        const today = getTodayDateStr();

        if (active === 'true' && shiftDate === today) {
          // Started earlier today - safely resume
          startTracking(true);
        } else {
          // Expired from yesterday or never started today: enforce off-duty state
          await AsyncStorage.removeItem('shift_active');
          await AsyncStorage.removeItem('shift_date');
          setIsTracking(false);
          if (!isExpoGo) {
            try {
              const started = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
              if (started) {
                await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
              }
            } catch (e) {}
          }
        }
      } catch (e) {}
    };

    checkDailyShiftState();

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

    // Auto-check for 8:00 PM cutoff while app is open in foreground
    const cutoffInterval = setInterval(() => {
      const now = new Date();
      const hour = now.getHours();

      if (hour >= 20 || hour < 6) {
        AsyncStorage.getItem('shift_active').then((active) => {
          if (active === 'true') {
            stopTracking();
            Alert.alert(
              'Shift Complete',
              'It is 8:00 PM. Your shift has ended, GPS is turned off, and the app will now close.',
              [
                {
                  text: 'OK',
                  onPress: () => {
                    BackHandler.exitApp();
                  },
                },
              ],
              { cancelable: false }
            );
          }
        });
      }
    }, 30000); // Check every 30 seconds

    return () => {
      clearInterval(cutoffInterval);
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
      // Real movement: either vehicle movement (> 2.5 km/h) OR walking motion
      const isVehicleMoving = rawSpeedKmh > 2.5;
      const isWalkingMotion = activity !== 'still' && rawSpeedKmh > 1.2;
      const isPhysicallyMoving = isVehicleMoving || isWalkingMotion;
      const cleanSpeed = isPhysicallyMoving ? Math.round(rawSpeedKmh) : 0;
      const cleanActivity = isPhysicallyMoving ? (rawSpeedKmh > 12 ? 'in_vehicle' : 'walking') : 'still';

      // Adaptive throttle: while stationary, only send heartbeat once every 60s
      // While moving (bike/bus/walking), stream every fix (4s) for high road precision
      const nowMs = Date.now();
      if (!isPhysicallyMoving && (nowMs - lastStationaryPingTime.current < 60000)) {
        return;
      }
      if (!isPhysicallyMoving) {
        lastStationaryPingTime.current = nowMs;
      }

      const payload = {
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
      };

      try {
        await api.post('/location/ping', payload);
        // Automatically flush any cached offline points
        await syncOfflineLocations();
      } catch (err) {
        console.log('Telemetry sync postponed, caching offline:', err.message);
        await saveOfflineLocation(payload);
      }
    } catch (err) {
      console.log('Telemetry processing error:', err.message);
    }
  };

  const startTracking = async (isResuming = false) => {
    try {
      // Prevent starting shift after 8:00 PM
      const now = new Date();
      const hour = now.getHours();
      if (hour >= 20 || hour < 6) {
        if (!isResuming) {
          Alert.alert(
            'Shift Hours Closed',
            'Shift hours end automatically at 8:00 PM. Tracking cannot be started until tomorrow morning (6:00 AM).'
          );
        }
        return;
      }

      const { status: fgStatus } = await Location.requestForegroundPermissionsAsync();
      if (fgStatus !== 'granted') {
        if (!isResuming) {
          Alert.alert('Permission Required', 'Precise location is required while on active shift.');
        }
        return;
      }

      // Stop any existing watcher before starting a new one
      if (foregroundWatcher.current) {
        foregroundWatcher.current.remove();
        foregroundWatcher.current = null;
      }

      // 1. High GPS accuracy captures satellite coordinates every 4s (high-precision road tracking)
      foregroundWatcher.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: 4000,
          distanceInterval: 6,
        },
        (loc) => {
          sendLocationPing(loc.coords, loc.mocked);
        }
      );

      // Persist active shift bound strictly to today's date
      const today = getTodayDateStr();
      await AsyncStorage.setItem('shift_active', 'true');
      await AsyncStorage.setItem('shift_date', today);
      setIsTracking(true);

      // 2. Safe background location check (Only in standalone APK; skipped in Expo Go to avoid sandbox warning)
      if (!isExpoGo) {
        try {
          const bgCheck = await Location.getBackgroundPermissionsAsync();
          let bgGranted = bgCheck.status === 'granted';

          // Only ask if not already granted and not an auto-resume
          if (!bgGranted && !isResuming) {
            const bgReq = await Location.requestBackgroundPermissionsAsync();
            bgGranted = bgReq.status === 'granted';
          }

          if (bgGranted) {
            const alreadyRunning = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
            if (!alreadyRunning) {
              await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
                accuracy: Location.Accuracy.High,
                timeInterval: 4000,
                distanceInterval: 6,
                foregroundService: {
                  notificationTitle: 'CM Vechicle Active',
                  notificationBody: 'Live tracking active (high-precision 4s stream).',
                  notificationColor: '#0284c7',
                },
              });
            }
          }
        } catch (bgErr) {
          console.log('Background task fallback to foreground:', bgErr.message);
        }
      }
    } catch (err) {
      console.error('Tracking start error:', err);
    }
  };

  const stopTracking = async () => {
    try {
      if (foregroundWatcher.current) {
        foregroundWatcher.current.remove();
        foregroundWatcher.current = null;
      }
      if (!isExpoGo) {
        try {
          const running = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
          if (running) {
            await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
          }
        } catch (e) {}
      }

      await AsyncStorage.removeItem('shift_active');
      await AsyncStorage.removeItem('shift_date');
      setIsTracking(false);
      setActivity('still');

      // Immediately notify cloud backend and web dashboard that shift ended
      try {
        await api.post('/location/stop-shift');
      } catch (e) {
        console.log('Stop-shift notify postponed (offline):', e.message);
      }
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
              <Text style={{ fontSize: 13, fontWeight: 'bold', color: '#06b6d4', textTransform: 'uppercase' }}>CM Vechicle</Text>
              <Text style={styles.userName}>{user.name || user.email}</Text>
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
