import axios from 'axios';

export const API_BASE = import.meta.env.VITE_API_BASE || 'http://127.0.0.1:8000/api/v1';
export const WS_BASE = import.meta.env.VITE_WS_BASE || 'ws://127.0.0.1:8000/ws/live';

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
