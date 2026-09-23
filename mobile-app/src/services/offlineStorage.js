import AsyncStorage from '@react-native-async-storage/async-storage';
import api from './api';

const OFFLINE_QUEUE_KEY = '@geotrack_offline_queue';

export const saveOfflineLocation = async (loc) => {
  try {
    const existing = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY);
    const queue = existing ? JSON.parse(existing) : [];
    queue.push(loc);
    // Keep max 1000 points to prevent storage bloat
    if (queue.length > 1000) {
      queue.shift();
    }
    await AsyncStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
  } catch (e) {
    console.error('Error saving offline location:', e);
  }
};

export const syncOfflineLocations = async () => {
  try {
    const existing = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY);
    if (!existing) return 0;

    const queue = JSON.parse(existing);
    if (queue.length === 0) return 0;

    const response = await api.post('/location/batch', { locations: queue });
    if (response.status === 201) {
      await AsyncStorage.removeItem(OFFLINE_QUEUE_KEY);
      return queue.length;
    }
  } catch (e) {
    // Network still unavailable; keep queued points
    console.log('Sync postponed: server not reachable.');
  }
  return 0;
};
