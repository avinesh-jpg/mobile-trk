# GeoTrack Enterprise: Comprehensive Technical & Operational Documentation

**Version:** 2.0.0  
**Last Updated:** November 20, 2026  
**Architecture:** Distributed Mobile-Cloud Fleet & Field Workforce Telemetry System  
**Live Production Dashboard:** [https://geotrack-dashboard.onrender.com](https://geotrack-dashboard.onrender.com)  
**Live Production Backend API:** [https://geotrack-backend-e812.onrender.com/api/v1](https://geotrack-backend-e812.onrender.com/api/v1)  
**Interactive API Documentation:** [https://geotrack-backend-e812.onrender.com/docs](https://geotrack-backend-e812.onrender.com/docs)  

---

## Table of Contents
1. [Executive Summary & System Vision](#1-executive-summary--system-vision)
2. [High-Level System Architecture](#2-high-level-system-architecture)
3. [Backend Service (FastAPI & Python 3.12)](#3-backend-service-fastapi--python-312)
   - [Database Schema (Supabase PostgreSQL)](#database-schema-supabase-postgresql)
   - [Core REST & WebSocket API Endpoints](#core-rest--websocket-api-endpoints)
   - [AI & Machine Learning Engine](#ai--machine-learning-engine)
4. [Mobile Applications](#4-mobile-applications)
   - [React Native / Expo Client (`mobile-app`)](#react-native--expo-client-mobile-app)
   - [Native Android Kotlin Client (`android-native-app`)](#native-android-kotlin-client-android-native-app)
   - [Adaptive 4-Second GPS Telemetry & Sensor Fusion](#adaptive-4-second-gps-telemetry--sensor-fusion)
   - [Strict Daily Shift & Privacy Rules](#strict-daily-shift--privacy-rules)
   - [Offline Buffering & Auto-Synchronization](#offline-buffering--auto-synchronization)
5. [Web Admin Dashboard (React + Vite + Leaflet)](#5-web-admin-dashboard-react--vite--leaflet)
   - [Live Fleet Map & Dynamic Status Engine](#live-fleet-map--dynamic-status-engine)
   - [Route Replay & Highway Road Snapping](#route-replay--highway-road-snapping)
   - [Geofence Management & Automatic Client Visit Auditing](#geofence-management--automatic-client-visit-auditing)
   - [Timesheet & Anomaly Analytics](#timesheet--anomaly-analytics)
6. [Cloud Infrastructure & DevOps](#6-cloud-infrastructure--devops)
   - [Render PaaS Deployment (`render.yaml`)](#render-paas-deployment-renderyaml)
   - [Supabase Managed PostgreSQL Pooler](#supabase-managed-postgresql-pooler)
   - [Automated Workday Keep-Alive via GitHub Actions](#automated-workday-keep-alive-via-github-actions)
7. [Installation, Setup & Local Development Guide](#7-installation-setup--local-development-guide)
8. [Troubleshooting & Maintenance Playbook](#8-troubleshooting--maintenance-playbook)

---

## 1. Executive Summary & System Vision

**GeoTrack** is an enterprise-grade field workforce management and real-time vehicle telemetry platform. It was engineered specifically to solve the challenges of real-world mobile tracking:
* **Elimination of GPS drift and jitter:** Stationary drift, indoor noise, and multipath reflections are filtered out using mathematical bounds and 2D Kalman filters.
* **True-to-Life Road Alignment:** Raw, zigzagged GPS coordinates are mapped to actual road network geometries using Hidden Markov Models (HMM) and OSRM (Open Source Routing Machine).
* **Strict Privacy & Labor Compliance:** Tracking is bound strictly to the employee's active workday shift (6:00 AM – 8:00 PM IST). Personal early-morning travel and off-duty activities are strictly excluded from company records.
* **Zero Telemetry Loss:** Dead zones, rural corridors, and subway transits are preserved via encrypted local SQLite queues and synchronized upon network recovery.
* **Battery Efficiency:** Hardware sensors (accelerometers) and velocity-adaptive throttling prevent continuous battery drain when employees are desk-bound or parked.

---

## 2. High-Level System Architecture

```mermaid
flowchart TD
    subgraph Mobile Devices
        MA["Expo / React Native App<br/>(Android / iOS)"]
        NA["Kotlin Native App<br/>(Jetpack Compose)"]
    end

    subgraph Ingestion & Edge
        FW["Fused Location Provider / GPS"]
        OFFLINE["Offline SQLite Queue"]
        ACCEL["Accelerometer (Motion Detection)"]
    end

    subgraph Cloud Infrastructure (Render.com)
        BE["FastAPI Cloud Backend<br/>(Python 3.12 / Uvicorn)"]
        WS["WebSocket Broadcaster<br/>(/ws/live)"]
        ROUTING["AI Denoising & Kalman Filter<br/>+ OSRM Road-Matching"]
        ML["DBSCAN Stay Point Clustering<br/>& Anti-Spoofing Engine"]
    end

    subgraph Data Tier (Supabase)
        DB[("PostgreSQL 15 Database<br/>Connection Pooler :6543")]
    end

    subgraph Web Portal
        DASH["React 18 Admin Dashboard<br/>(Vite + Tailwind + Leaflet)"]
    end

    subgraph Automation
        GHA["GitHub Actions Keep-Alive<br/>(08:00 AM - 08:00 PM IST)"]
    end

    FW --> MA & NA
    ACCEL --> MA & NA
    MA & NA <--> OFFLINE
    MA & NA -- "HTTPS /api/v1/location/ping" --> BE
    MA & NA -- "HTTPS /api/v1/location/batch" --> BE
    BE <--> DB
    BE --> WS
    WS -- "Real-Time Updates" --> DASH
    BE <--> ROUTING
    BE <--> ML
    DASH -- "REST Requests" --> BE
    GHA -- "Heartbeat Ping (every 10m)" --> BE & DASH
```

### Data Flow Lifecycle:
1. **Motion Trigger:** When an employee taps **"Start Shift"**, a foreground persistent notification is displayed, and high-frequency GPS fixes (4-second intervals) are initiated.
2. **Device-Level Filtering:** The accelerometer classifies physical activity (`walking`, `in_vehicle`, `still`). When stationary, breadcrumbs are throttled to 60-second heartbeats to preserve battery.
3. **Transmission & Buffering:** Each ping is sent over TLS to `/api/v1/location/ping`. If offline, points append to local device storage and flush in batches once signal returns.
4. **Ingestion & Server Denoising:** The FastAPI backend verifies credentials, executes anti-spoofing tests, filters velocity leaps (> 180 km/h), suppresses stationary jitter, and persists the record.
5. **Real-Time Fan-Out:** Updates are broadcast via WebSockets to connected admin dispatchers within ~50ms.
6. **Road Snapping on Replay:** When an admin views past routes, the backend applies a 2D Kalman filter, eliminates start-up cache jumps, and maps points to OpenStreetMap highway geometries.

---

## 3. Backend Service (FastAPI & Python 3.12)

The backend is built with FastAPI, SQLAlchemy, and Pydantic v2, utilizing asynchronous I/O and connection pooling for performance.

### Database Schema (Supabase PostgreSQL)

```mermaid
erDiagram
    USERS ||--o{ LOCATIONS : logs
    USERS ||--o{ DETECTED_VISITS : generates
    GEOFENCES ||--o{ DETECTED_VISITS : identifies

    USERS {
        int id PK
        string name
        string email UK
        string hashed_password
        string role "admin | employee"
        boolean is_active
        datetime created_at
    }

    LOCATIONS {
        bigint id PK
        int user_id FK
        float latitude
        float longitude
        float altitude
        float speed "km/h"
        float heading "degrees"
        float accuracy "meters"
        int battery_level "0-100"
        boolean is_moving
        string activity_type "still | walking | in_vehicle | shift_ended"
        boolean is_mock
        datetime recorded_at "Captured by GPS"
        datetime created_at "Logged by DB"
    }

    GEOFENCES {
        int id PK
        string name
        string client_name
        float latitude
        float longitude
        float radius_meters "default 100m"
        datetime created_at
    }

    DETECTED_VISITS {
        bigint id PK
        int user_id FK
        int geofence_id FK
        datetime arrival_time
        datetime departure_time
        int duration_minutes
        string notes
    }

    ROUTE_CACHE {
        string cache_key PK
        int user_id
        date route_date
        json snapped_coordinates
        float distance_km
        datetime created_at
    }
```

### Core REST & WebSocket API Endpoints

#### Authentication (`/api/v1/auth`)
* `POST /login`: OAuth2 password flow returning a signed JWT bearer token (30-day expiry).
* `POST /register`: Registers new employees (admin restricted).
* `GET /me`: Returns the profile and permissions of the authenticated user.

#### Telemetry Ingestion & State (`/api/v1/location`)
* `POST /ping`: Ingests a single real-time GPS breadcrumb. Broadcasts automatically to WebSockets.
* `POST /batch`: Ingests an array of cached offline breadcrumbs uploaded when re-establishing connectivity.
* `POST /stop-shift`: Signals shift completion, stores a `shift_ended` breadcrumb, and resets dispatcher fleet badges.
* `GET /latest`: Returns the live status, last known position, today's distance, and 7-day cumulative distance for all employees.
* `GET /history/{user_id}?date=YYYY-MM-DD`: Returns the road-snapped journey, clean raw points, and statistics for an employee on a selected date.
* `POST /purge-older-than-7-days`: Maintenance endpoint to clear raw breadcrumbs older than 7 days while preserving summary timesheets.

#### Geofencing & Visits (`/api/v1/geofence`)
* `GET /`: Lists all active client and office circular zones.
* `POST /`: Creates a new geofence with a designated radius.
* `DELETE /{id}`: Deletes a geofence.
* `GET /visits`: Audits detected client site arrivals, departures, and dwell times.

#### AI Analytics & Timesheets (`/api/v1/analytics`)
* `GET /timesheet?date=YYYY-MM-DD`: Calculates daily working hours, travel distance, and client sites visited for payroll.
* `GET /anomalies`: Surfaces flagged velocity anomalies, mock locations, and irregular route patterns.

#### Real-Time Broadcast (`/ws/live`)
* `WebSocket /ws/live`: Real-time duplex communication channel for dispatchers to receive live map movements and shift status alerts.

---

### AI & Machine Learning Engine

#### 1. 2D Kalman Filter & HMM Road-Matching Pipeline (`app/services/routing.py`)
```mermaid
flowchart LR
    RAW["Raw Telemetry Pings"] --> OUTLIER["Outlier & Teleport Filter<br/>(Drops >25m acc & initial leaps)"]
    OUTLIER --> KALMAN["2D Kinematic Kalman Filter<br/>(Position & Velocity Smoothing)"]
    KALMAN --> CHUNKER["Chunker (8 Pings / Overlap 1)"]
    CHUNKER --> OSRM["OSRM HMM Map-Matching"]
    OSRM --> GUARD{"Anti-Detour Loop Guard<br/>(OSRM vs Haversine > 1.7x?)"}
    GUARD -- "Yes (U-turn Glitch)" --> DIRECT["Direct Interpolation Fallback"]
    GUARD -- "No (Legitimate Road)" --> SNAPPED["Snap to Highway Polyline"]
    DIRECT --> MERGE["Stitch & Decouple Route"]
    SNAPPED --> MERGE
    MERGE --> METRICS["Odometer Calculation & Route Replay"]
```

* **Startup Teleport Guard:** Filters out stale cached coordinates emitted at application launch (`getLastKnownLocation`) before the phone's GPS achieves an authentic satellite lock.
* **Anti-Detour Loop Guard:** OSRM map-matching can occasionally force artificial roundabouts or U-turn loops on rural roads. If the matched path exceeds direct Haversine distance by $> 1.7\times$, the system discards the artifact and retains the direct road vector.

#### 2. Spatio-Temporal DBSCAN Stay Point Detection (`app/ml/clustering.py`)
* Converts lat/lng pairs to spherical radians.
* Evaluates density with `min_samples = 3` and `epsilon = 60m`.
* Identifies dwell clusters where an employee spent $\ge 15\text{ minutes}$, automatically recording a `DetectedVisit` record against nearest geofences.

#### 3. Anti-Spoofing & Anomaly Engine (`app/ml/anomaly.py`)
* Checks Android `is_mock` provider flags.
* Flags speed jumps exceeding physical thresholds ($> 180\text{ km/h}$) between consecutive pings separated by $> 500\text{ meters}$.

---

## 4. Mobile Applications

The GeoTrack platform includes two client implementations:
1. **React Native / Expo Client (`mobile-app`)**: Cross-platform deployment for Android and iOS.
2. **Native Android Kotlin Client (`android-native-app`)**: High-performance implementation using Jetpack Compose, Coroutines, and Foreground Services.

### Key Mobile Capabilities:

#### Adaptive 4-Second GPS Telemetry & Sensor Fusion
* **Active Travel Mode (Speed $> 2.5\text{ km/h}$ or Accelerometer $> 0.4\text{g}$):** GPS samples every 4 seconds with a 5–6 meter displacement threshold. This resolution ensures smooth curves during vehicle and motorcycle travel.
* **Stationary Mode (Speed $< 2.0\text{ km/h}$ & Accelerometer still):** Breadcrumbs throttle to 60-second heartbeats, reducing battery consumption to $\approx 1.5 - 2.5\%$ per hour.

#### Strict Daily Shift & Privacy Rules
* Tracking is bound to `shift_date` (`YYYY-MM-DD`).
* Tracking requires explicit action: the employee must tap **"Start Shift"** in the morning.
* When **8:00 PM** arrives, tracking is automatically shut down, persistent notifications are removed, and a `shift_ended` event is submitted to the backend.
* On a new day, the background service verifies whether "Start Shift" was tapped *today*. If not, background location updates are terminated immediately. Early morning personal travel remains untracked.

#### Offline Buffering & Auto-Synchronization
* In network dead zones, pings are stored in local storage (SQLite or AsyncStorage).
* When network connectivity is restored, the queue automatically syncs in batches (`POST /api/v1/location/batch`) without user intervention.

---

## 5. Web Admin Dashboard (React + Vite + Leaflet)

The web dashboard provides operations teams with live fleet visibility, historical route analysis, and workforce metrics.

```
web-dashboard/src/
├── api.js                      # Axios HTTP client & WebSocket reconnection manager
├── App.jsx                     # Top-level application shell & tab routing
├── index.css                   # Tailwind CSS styling and Leaflet animation keyframes
└── components/
    ├── Navbar.jsx              # Navigation bar, live connection indicator, user profile
    ├── LiveMap.jsx             # Real-time multi-employee fleet map with status cards
    ├── RouteHistory.jsx        # Road-snapped route replay with time scrubber & stats
    ├── GeofenceManager.jsx     # Visual geofence editor (circular zones on map)
    ├── AnalyticsAI.jsx         # AI anomaly detection & stay point analytics
    ├── TimesheetExport.jsx     # Payroll-ready timesheet generator (CSV / PDF export)
    └── UserManager.jsx         # Employee account provisioning and role administration
```

### Dashboard Modules:

#### 1. Live Fleet Map (`LiveMap.jsx`)
* **Real-Time Position Updates:** Renders employees using SVG vehicle markers rotated according to their real-time compass heading.
* **Dynamic Status Evaluation:**
  * 🏢 **In Office:** Inside designated headquarters geofence.
  * 📍 **At Client Site:** Inside an authorized customer geofence.
  * 🚗 **On The Way:** Moving ($> 2.5\text{ km/h}$) outside all geofences.
  * 🛑 **Stopped / Parked:** Stationary outside geofences.
  * ⚪ **Shift Ended / Offline:** Shift ended or no ping received for $> 5\text{ minutes}$.
* **Odometer Displays:** Real-time distance indicators for **Today's Travel** (resets at midnight) and **This Week (7D)** (resets every Monday).

#### 2. Route Replay & Highway Road Snapping (`RouteHistory.jsx`)
* **Interactive Player:** Step forward and backward through an employee's workday route.
* **Road Snapping Toggle:** Switch between raw GPS points and OSRM highway-matched routes.
* **Speed Profile Badging:** Identifies stationary stops, walking sections, and high-speed highway travel.

#### 3. Geofence Manager (`GeofenceManager.jsx`)
* Visual creation of geofences via interactive map clicks.
* Adjustable radius ($50\text{m} - 5000\text{m}$) with real-time perimeter visualization.

#### 4. Timesheets & Export (`TimesheetExport.jsx`)
* Automated calculation of shift start time, shift end time, active travel duration, stationary duration, and verified kilometers traveled.
* Single-click export to CSV for payroll integration.

---

## 6. Cloud Infrastructure & DevOps

```mermaid
flowchart TD
    subgraph GitHub
        REPO["Repository (main branch)"]
        ACTION["Keep-Alive Workflow<br/>(.github/workflows/keepalive.yml)"]
    end

    subgraph Render Cloud
        BE_SRV["FastAPI Web Service<br/>(geotrack-backend)"]
        DASH_SRV["React Static Site<br/>(geotrack-dashboard)"]
    end

    subgraph Supabase
        S_POOLER["PgBouncer Pooler (port 6543)"]
        S_DB[("PostgreSQL 15 Instance")]
    end

    REPO -- "Auto Deploy" --> BE_SRV
    REPO -- "Auto Deploy" --> DASH_SRV
    ACTION -- "Pings every 10m (8 AM - 8 PM IST)" --> BE_SRV & DASH_SRV
    BE_SRV <--> S_POOLER
    S_POOLER <--> S_DB
```

### Infrastructure Components:

1. **Render.com Web Services:**
   * **Backend:** Python 3.12 Web Service running `uvicorn app.main:app --host 0.0.0.0 --port $PORT`.
   * **Dashboard:** Static site build running `npm install && npm run build` with single-page app rewrite rules (`/* -> /index.html`).
2. **Supabase Managed PostgreSQL:**
   * Hosted in Mumbai (`ap-south-1`) for low latency across India.
   * Transaction connection pooling via port `6543`.
3. **GitHub Actions Workday Keep-Alive (`.github/workflows/keepalive.yml`):**
   * Scheduled cron: `*/10 2-14 * * *` (Runs every 10 minutes from 07:30 AM to 08:20 PM IST).
   * Pings backend and dashboard endpoints to prevent Render free-tier cold starts during active business hours.
   * Silenced automatically at night to allow servers to spin down when work ends.

---

## 7. Installation, Setup & Local Development Guide

### Prerequisites
* **Python:** 3.10, 3.11, or 3.12
* **Node.js:** 18.x or 20.x and npm
* **Git**
* *(Optional for native Android):* Android Studio Ladybug+ and JDK 17

### 1. Repository Setup
```bash
git clone https://github.com/avinesh-jpg/mobile-trk.git
cd "mobile-trk"
```

### 2. Backend Setup
```bash
cd backend
python -m venv venv

# Windows
.\venv\Scripts\activate
# Linux / macOS
source venv/bin/activate

pip install -r requirements.txt
```

Create `backend/.env`:
```ini
DATABASE_URL=postgresql://postgres.xxx:yyy@aws-0-ap-south-1.pooler.supabase.com:6543/postgres
SECRET_KEY=your_secure_random_jwt_secret_key_here
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=43200
OSRM_BASE_URL=https://router.project-osrm.org
```

Run backend server:
```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```
Interactive documentation will be available at `http://localhost:8000/docs`.

### 3. Web Dashboard Setup
```bash
cd ../web-dashboard
npm install
```

Create `web-dashboard/.env`:
```ini
VITE_API_BASE=http://localhost:8000/api/v1
VITE_WS_BASE=ws://localhost:8000/ws/live
```

Run dashboard development server:
```bash
npm run dev
```
Open `http://localhost:5173` in your browser.

### 4. Mobile App Setup (React Native / Expo)
```bash
cd ../mobile-app
npm install
npx expo start
```
Scan the QR code with the Expo Go app on your Android or iOS device, or build a standalone release APK:
```bash
npx eas-cli build --platform android --profile preview
```

---

## 8. Troubleshooting & Maintenance Playbook

| Issue / Symptom | Root Cause | Resolution |
| :--- | :--- | :--- |
| **Initial 10–20 km jump on morning start** | Android's `getLastKnownLocation` emitted a stale coordinate from a previous trip before achieving GPS satellite lock. | Handled automatically by the startup teleport filter in `app/services/routing.py`. Purge stale points using `DELETE FROM locations WHERE id IN (...)` if encountered in legacy test data. |
| **Route replay forms an artificial loop / U-turn** | OSRM map-matching forced an artificial roundabout on a rural single-carriageway road. | The built-in Anti-Detour Loop Guard automatically falls back to direct interpolation when OSRM distance exceeds direct distance by $> 1.7\times$. |
| **Render backend takes 50 seconds to respond** | Free-tier service spun down after 15 minutes of inactivity outside keep-alive hours. | The GitHub Action `.github/workflows/keepalive.yml` automatically keeps the instance active between 8:00 AM and 8:00 PM IST. For 24/7 zero-latency response, upgrade the Render web service to the Starter tier ($7/month). |
| **Tracking captured early-morning personal travel** | Background service was active overnight from an unclosed previous shift. | Updated in `commit f25921c`: shifts are now strictly date-bound. The app rejects and disarms tracking on a new day until the employee explicitly taps "Start Shift". |
| **Distance shows 0.00 km on Route Replay** | No telemetry was logged for the selected date, or all fixes had low satellite accuracy ($> 25\text{m}$). | Check the date picker in Route Replay. Verify that GPS location permission is set to "Allow all the time" on the employee's phone. |
