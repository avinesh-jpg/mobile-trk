import axios from 'axios';

export const API_BASE = import.meta.env.VITE_API_BASE || 'https://geotrack-backend-e812.onrender.com/api/v1';
export const WS_BASE = import.meta.env.VITE_WS_BASE || 'wss://geotrack-backend-e812.onrender.com/ws/live';


export const api = axios.create({
  baseURL: API_BASE,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.reload();
    }
    return Promise.reject(error);
  }
);
