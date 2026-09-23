import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_API_HOST } from '../config';

const api = axios.create({
  baseURL: DEFAULT_API_HOST,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use(async (config) => {
  try {
    const customHost = await AsyncStorage.getItem('server_host');
    if (customHost) {
      config.baseURL = customHost;
    }
    const token = await AsyncStorage.getItem('auth_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  } catch (e) {
    console.error('API interceptor error:', e);
  }
  return config;
});

export default api;
