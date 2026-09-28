# GeoTrack - Enterprise Field & Fleet Location Tracking

GeoTrack is a native Android application built with **Kotlin** and **Jetpack Compose** that replaces the React Native mobile client and Web dashboard with an integrated, high-performance mobile telemetry solution.

## Key Features

1. **Shift Management & GPS Telemetry (CUJ 1)**:
   - Tactile Start/End Work Shift controls with live elapsed shift timer
   - Real-time GPS coordinates, altitude, bearing, and accuracy (± meters)
   - Live speedometer (km/h) with physical activity motion sensing (walking, in_vehicle, still)
   - Device battery level indicator and Mock / Spoofed GPS detection flag
   - Background foreground service with persistent status notification

2. **Interactive Live Fleet & Geofence Map (CUJ 2)**:
   - Custom Vector Canvas Map supporting zoom, pan, and centering controls
   - Multi-style map rendering: Satellite, Streets, and Dark Grid
   - Live traffic congestion overlays (flowing, moderate, congested)
   - Real-time personnel markers with Google Maps-style rotating compass heading pointers and animated radar pulse
   - Dynamic Geofence radius zones: Office HQ, Client Sites, and Fleet Depots with enter/exit status badges:
     - 🏢 In Office
     - 📍 At Client Site
     - 🚗 On The Way (Live speed)
     - 🛑 Stopped / Parked
     - ⚪ Shift Ended / Offline
   - Quick "Simulate GPS Movement Ping" action to test real-time streaming

3. **Route History & Breadcrumb Replay (CUJ 3)**:
   - Interactive historical playback with Play, Pause, and speed multipliers (1x, 2x, 5x)
   - Visual trajectory polyline with start, stop, and dwell markers
   - Timeline seek slider to inspect location and speed at any historical moment
   - Odometers: Today's travel distance and 7-day weekly total

4. **AI & ML Insights (CUJ 4)**:
   - Automated anomaly detection: Fake/Mock GPS warning, speed limit violations, and unauthorized geofence departures
   - Top geofence clusters with dwell time breakdowns
   - Fleet route efficiency scoring (%)
   - Weekly automated GPS log purge tool (preserves verified timesheets)

5. **Timesheets & Attendance (CUJ 5)**:
   - Detailed shift logs: Date, start time, end time, duration, distance, and geofences visited
   - Export CSV preview and one-tap clipboard copy

6. **Offline Queue & Local Persistence**:
   - Built-in SQLite local database queue for offline field operations
   - Automatic sync and manual "Sync Now" button when connection is re-established

## Architecture

- **UI**: Jetpack Compose, Material 3 Dark theme, Custom Vector Canvas Graphics
- **Architecture**: MVVM with Repository Pattern and Kotlin Coroutines / StateFlow
- **Data Persistence**: Local SQLite OpenHelper with thread-safe reactive Flows
- **Networking**: Resilient HTTP client with fallback to offline queue and demo accounts
