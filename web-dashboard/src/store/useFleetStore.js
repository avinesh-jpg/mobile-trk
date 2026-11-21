import { create } from 'zustand';
import { api } from '../api';

export const useFleetStore = create((set, get) => ({
  // Authentication & Session
  user: (() => {
    try {
      const saved = localStorage.getItem('user');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  })(),
  setUser: (user) => {
    if (user) {
      localStorage.setItem('user', JSON.stringify(user));
    } else {
      localStorage.removeItem('user');
      localStorage.removeItem('token');
    }
    set({ user });
  },
  logout: () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    set({ user: null, employees: [], selectedUser: null });
  },

  // Active UI Navigation
  activeTab: 'live',
  setActiveTab: (tab) => set({ activeTab: tab }),

  // Fleet & Telemetry Data
  employees: [],
  selectedUser: null,
  geofences: [],
  loading: false,
  isWsConnected: false,
  setIsWsConnected: (isWsConnected) => set({ isWsConnected }),

  setSelectedUser: (user) => set({ selectedUser: user }),

  // Data Fetching Actions
  fetchEmployees: async () => {
    try {
      set({ loading: true });
      const res = await api.get('/location/latest');
      set({ employees: res.data });
      // If no employee is selected yet, select the first one
      if (res.data.length > 0 && !get().selectedUser) {
        set({ selectedUser: res.data[0] });
      }
    } catch (err) {
      console.error('Failed to fetch fleet telemetry:', err);
    } finally {
      set({ loading: false });
    }
  },

  fetchGeofences: async () => {
    try {
      const res = await api.get('/geofence/');
      set({ geofences: res.data });
    } catch (err) {
      console.error('Failed to fetch geofences:', err);
    }
  },

  // Real-Time Telemetry Event Dispatcher (High-Performance In-Memory Mutation)
  handleLiveTelemetry: (eventData) => {
    const { event, user_id } = eventData;
    if (!user_id) return;

    set((state) => {
      const updatedEmployees = state.employees.map((emp) => {
        if (emp.user_id !== user_id) return emp;

        if (event === 'shift_ended') {
          return {
            ...emp,
            is_online: false,
            latest_location: emp.latest_location
              ? {
                  ...emp.latest_location,
                  speed: 0,
                  is_moving: false,
                  activity_type: 'shift_ended',
                  recorded_at: eventData.recorded_at,
                }
              : null,
          };
        }

        if (event === 'location_update') {
          return {
            ...emp,
            is_online: true,
            latest_location: {
              latitude: eventData.latitude,
              longitude: eventData.longitude,
              heading: eventData.heading || 0,
              accuracy: eventData.accuracy || 10,
              speed: eventData.speed,
              battery_level: eventData.battery_level,
              activity_type: eventData.activity_type,
              is_mock: eventData.is_mock,
              recorded_at: eventData.recorded_at,
            },
          };
        }

        return emp;
      });

      // Synchronize selectedUser if this employee is currently selected on the map
      const currentSelected = state.selectedUser;
      const updatedSelected =
        currentSelected && currentSelected.user_id === user_id
          ? updatedEmployees.find((e) => e.user_id === user_id) || currentSelected
          : currentSelected;

      return {
        employees: updatedEmployees,
        selectedUser: updatedSelected,
      };
    });
  },
}));
