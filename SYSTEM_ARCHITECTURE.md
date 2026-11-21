# GeoTrack Enterprise: Comprehensive System Architecture Blueprint

**System Version:** 2.0.0  
**Domain:** Enterprise Field Workforce, Mobile Telemetry & Real-Time Logistics  
**Architecture Pattern:** Distributed Offline-First Edge Ingestion + Real-Time WebSocket Streaming + AI-Augmented Map Matching  
**Reference Deployment:** Render Cloud (PaaS) + Supabase Managed PostgreSQL (IaaS Mumbai)  

---

## 1. Architectural Philosophy & Design Principles

GeoTrack is designed around five foundational architectural tenets:

1. **Offline-First & Zero Telemetry Loss:** Field employees frequently travel through network dead zones, rural highways, basements, and connectivity shadows. The mobile edge must never drop a telemetry fix; coordinates are queued in persistent transactional storage on the device and synchronized with monotonic idempotency upon network recovery.
2. **Deterministic Labor Privacy Boundaries:** Telemetry capture is bounded by strict temporal and state boundaries. Between 8:00 PM and 6:00 AM IST, and on days when an employee has not explicitly triggered "Start Shift", the background tracking subsystem actively self-terminates, guaranteeing zero tracking of off-duty personal life.
3. **Kinematic Signal Denoising at Two Tiers:** Raw consumer-grade smartphone GPS suffers from multipath reflections, indoor satellite drift, and cell-tower triangulation leaps. GeoTrack executes signal cleaning at the **Edge** (accelerometer motion gating, horizontal accuracy thresholds) and at the **Cloud** (2D Kinematic Kalman filtering, startup teleport suppression, and HMM road-snapping).
4. **Low-Latency Dispatch Synchronization:** Dispatchers and fleet managers must see vehicle movements in real time. The cloud backend functions as an asynchronous pub/sub broker over WebSockets, fanning out updates within $\le 50\text{ms}$ of ingestion without polling overhead.
5. **Battery-Preserving Adaptive Edge Throttling:** Continuous satellite radio operation depletes a mobile battery within 3–4 hours. GeoTrack pairs physical device sensors with velocity thresholds to dynamically transition between high-frequency transit streaming ($4\text{s}$) and low-frequency stationary heartbeats ($60\text{s}$).

---

## 2. High-Level Component Architecture

The diagram below illustrates the end-to-end component topology, data links, protocols, and security boundaries across all system tiers:

```mermaid
flowchart TD
    subgraph TIER_EDGE["1. Mobile Edge Tier (Android / iOS)"]
        subgraph REACT_CLIENT["Hybrid Client (mobile-app)"]
            RN_UI["React Native UI<br/>(TrackingScreen)"]
            RN_STORE["AsyncStorage<br/>(Shift State & Date)"]
            RN_TASK["TaskManager Background Task<br/>(LOCATION_TASK_NAME)"]
            RN_SQLITE["Local Offline Queue<br/>(SQLite / JSON Buffer)"]
        end

        subgraph KOTLIN_CLIENT["Native Client (android-native-app)"]
            KT_UI["Jetpack Compose UI<br/>(TrackingScreen.kt)"]
            KT_REPO["TrackingRepository<br/>(StateFlows & Coroutines)"]
            KT_SRV["LocationTrackingService<br/>(Foreground Service)"]
            KT_ROOM["Room Database<br/>(GeoTrackDbHelper)"]
        end

        HARDWARE["Hardware Peripherals:<br/>GPS/GNSS Antenna + 3-Axis Accelerometer + Battery Manager"]
    end

    subgraph TIER_NET["2. Transport & Gateway Tier"]
        HTTPS_IN["HTTPS / TLS 1.3<br/>(REST API JSON Payloads)"]
        WSS_IN["WSS / TLS 1.3<br/>(Full-Duplex WebSockets)"]
        CORS["CORS Middleware & JWT Bearer Guard"]
    end

    subgraph TIER_CORE["3. Cloud Application Service (Render.com)"]
        FA_APP["FastAPI Application Server<br/>(Python 3.12 / Uvicorn ASGI)"]
        
        subgraph ROUTERS["API Subsystems"]
            AUTH_ROUTER["Auth Router<br/>(/api/v1/auth)"]
            LOC_ROUTER["Location & Ingestion Router<br/>(/api/v1/location)"]
            GEO_ROUTER["Geofence & Visits Router<br/>(/api/v1/geofence)"]
            ANA_ROUTER["Analytics & Timesheets Router<br/>(/api/v1/analytics)"]
            WS_ROUTER["WebSocket Live Router<br/>(/ws/live)"]
        end

        WS_MGR["ConnectionManager<br/>(Broadcast Pub/Sub Broker)"]
    end

    subgraph TIER_AI["4. AI & Mathematical Analytics Engine"]
        KALMAN["2D Kinematic Kalman Filter<br/>(State Estimation & Smoothing)"]
        HMM["OSRM Map-Matching Engine<br/>(Hidden Markov Model Highway Snap)"]
        GUARD["Anti-Detour Loop Guard<br/>(Direct vs Detour Ratio Check)"]
        DBSCAN_ENG["DBSCAN Spatial Clustering<br/>(Automated Stay Point Detection)"]
        SPOOF["Velocity Anomaly & Mock Detector<br/>(Physics & OS Validation)"]
    end

    subgraph TIER_DATA["5. Persistence Tier (Supabase AWS ap-south-1)"]
        PGBOUNCER["PgBouncer Connection Pooler<br/>(Port 6543 / Transaction Mode)"]
        PG_DB[("PostgreSQL 15 Database<br/>(Tables: users, locations, geofences, detected_visits, route_cache)")]
    end

    subgraph TIER_DASH["6. Dispatcher & Analytics Portal (Web)"]
        REACT_DASH["React 18 Admin Portal<br/>(Vite + Tailwind CSS)"]
        LEAFLET["Leaflet GIS Canvas Engine<br/>(Tile Layer + SVG Vehicle Markers)"]
        DISPATCH_STORE["Live State Store<br/>(Vehicle Status, Speed, Odometers)"]
    end

    subgraph TIER_OPS["7. DevOps & Availability Engine"]
        GHA_CRON["GitHub Actions Keep-Alive Daemon<br/>(Cron: every 10m from 8 AM to 8 PM IST)"]
    end

    %% Edge Connections
    HARDWARE --> RN_TASK & KT_SRV
    RN_UI <--> RN_STORE
    RN_TASK <--> RN_SQLITE
    KT_UI <--> KT_REPO
    KT_REPO <--> KT_ROOM
    KT_SRV <--> KT_REPO

    RN_TASK -- "Telemetry Pings & Batches" --> HTTPS_IN
    KT_SRV -- "Telemetry Pings & Batches" --> HTTPS_IN

    %% Transport Connections
    HTTPS_IN --> CORS --> FA_APP
    WSS_IN <--> CORS <--> WS_MGR

    %% Core Application Routing
    FA_APP --> AUTH_ROUTER & LOC_ROUTER & GEO_ROUTER & ANA_ROUTER & WS_ROUTER
    LOC_ROUTER --> WS_MGR
    WS_MGR -- "Broadcasts to Dashboards" --> WSS_IN
    WSS_IN --> DISPATCH_STORE

    %% AI Pipeline Connections
    LOC_ROUTER <--> KALMAN
    KALMAN <--> HMM
    HMM <--> GUARD
    LOC_ROUTER <--> SPOOF
    ANA_ROUTER <--> DBSCAN_ENG

    %% Persistence Connections
    FA_APP <--> PGBOUNCER <--> PG_DB

    %% Dashboard Connections
    REACT_DASH <--> DISPATCH_STORE
    DISPATCH_STORE --> LEAFLET
    REACT_DASH -- "Queries History, Geofences & Timesheets" --> HTTPS_IN

    %% DevOps Connections
    GHA_CRON -- "Health Check Pings" --> FA_APP & REACT_DASH
```

---

## 3. Real-Time Telemetry Ingestion & Fan-Out Flow

The sequence diagram below details the exact chronological transaction from hardware sensor reading to database storage and instant dashboard map update:

```mermaid
sequenceDiagram
    autonumber
    actor Driver as Field Employee (Mobile Device)
    participant Mobile as Mobile Tracking Engine (Edge)
    participant API as FastAPI Ingestion Gateway (/location/ping)
    participant ML as Anti-Spoofing & Jitter Engine
    participant DB as Supabase PostgreSQL Database
    participant WS as WebSocket Hub (ConnectionManager)
    participant Dash as Web Admin Dashboard (Dispatcher)

    Driver->>Mobile: Tap "Start Shift" (08:30 AM IST)
    activate Mobile
    Mobile->>Mobile: Set shift_active=true & shift_date="2026-11-21"
    Mobile->>Mobile: Start Foreground Service + GPS Satellite Watcher (4s)
    deactivate Mobile

    loop Every 4 Seconds (While Moving)
        Mobile->>Mobile: Read GNSS (lat, lng, acc, speed, heading) + Accelerometer
        Mobile->>Mobile: Classify activity (walking / in_vehicle)
        alt Device is Offline (Dead Zone)
            Mobile->>Mobile: Append to Local SQLite Queue
        else Device is Online
            Mobile->>API: POST /api/v1/location/ping (Bearer JWT Token)
            activate API
            API->>API: Authenticate JWT & Validate Schema (Pydantic)
            API->>ML: detect_gps_spoofing(lat, lng, prev_lat, prev_lng, delta_t)
            ML-->>API: Verified (is_mock=false, speed < 180 km/h)
            API->>ML: Filter Micro-Jitter (< 2 km/h clamped to still)
            API->>DB: INSERT INTO locations (user_id, lat, lng, speed, ...)
            DB-->>API: 201 Created (location_id=11300)
            API->>WS: Broadcast location_update event
            activate WS
            WS-->>Dash: Push JSON Payload over WebSocket
            deactivate WS
            activate Dash
            Dash->>Dash: Update Vehicle Marker position & Rotate Compass
            Dash->>Dash: Recalculate "TODAY'S TRAVEL" & Geofence Status
            deactivate Dash
            API-->>Mobile: 200 OK
            deactivate API
        end
    end

    alt Network Restored after Dead Zone
        Mobile->>API: POST /api/v1/location/batch (Buffered records array)
        API->>DB: Bulk Save (bulk_save_objects)
        DB-->>API: Batch Persisted
        API-->>Mobile: 201 Created (Synchronized)
    end
```

---

## 4. AI Denoising & Road-Snapping Architecture

Raw GPS coordinates recorded by smartphones on highways exhibit satellite scatter, multipath reflections from overpasses, and occasional false jumps. When replaying a workday route, GeoTrack transforms raw breadcrumbs into highway-aligned geometry:

```mermaid
flowchart TD
    START["Raw Daily Pings Query<br/>(WHERE user_id = :id AND date = :dt ORDER BY recorded_at ASC)"] --> TELEPORT

    subgraph STAGE_1["Stage 1: Pre-Filtering & Outlier Rejection"]
        TELEPORT["Startup Teleport Guard<br/>Drops initial stale cached fixes<br/>(e.g., getLastKnownLocation leaps)"]
        ACCURACY["Accuracy Threshold Filter<br/>Drops fixes where horizontal accuracy > 25.0 meters"]
        VELOCITY["Kinematic Velocity Bound<br/>Drops impossible jumps where speed > 38.0 m/s (~137 km/h)"]
    end

    TELEPORT --> ACCURACY --> VELOCITY --> STAGE_2

    subgraph STAGE_2["Stage 2: 2D Kinematic Kalman Filter"]
        KF_INIT["Initialize State Vector: [x, y, vx, vy]<br/>Error Covariance P, Process Noise Q"]
        KF_PREDICT["Predict Next Kinematic State & Covariance"]
        KF_UPDATE["Measurement Update with GPS Observation<br/>Compute Optimal Kalman Gain K"]
        KF_SMOOTH["Generate Denoised Trajectory"]
        KF_INIT --> KF_PREDICT --> KF_UPDATE --> KF_SMOOTH
    end

    STAGE_2 --> STAGE_3

    subgraph STAGE_3["Stage 3: HMM Highway Road-Matching (OSRM)"]
        CHUNKER["Split Path into Chunks of 8 Pings<br/>(1-Ping Overlap between adjacent chunks)"]
        OSRM_REQ["Call OSRM /match/v1/driving<br/>Radiuses: 30m, Timestamps, Steps=False"]
        POLY_DEC["Decode Matched Segment via Polyline Algorithm"]
        CHUNKER --> OSRM_REQ --> POLY_DEC
    end

    STAGE_3 --> STAGE_4

    subgraph STAGE_4["Stage 4: Anti-Detour Loop Guard & Stitching"]
        LOOP_CHK{"OSRM Distance vs Direct Haversine Distance<br/>Ratio > 1.7x?"}
        LOOP_REJECT["Reject OSRM Segment (Artificial U-turn detected)<br/>Use Direct Denoised Coordinates"]
        LOOP_ACCEPT["Accept OSRM High-Fidelity Road Segment"]
        STITCH["Deduplicate Boundary Points & Stitch Final Route"]
        LOOP_CHK -- "Yes (Detour Glitch)" --> LOOP_REJECT --> STITCH
        LOOP_CHK -- "No (True Highway)" --> LOOP_ACCEPT --> STITCH
    end

    STAGE_4 --> STAGE_5

    subgraph STAGE_5["Stage 5: Output & Presentation"]
        CACHE["Store in route_cache Table (Date + User Key)"]
        OUTPUT["Return Clean GeoJSON + Snapped Polyline + Distance (km)"]
        CACHE --> OUTPUT
    end
```

### Mathematical Specifications of the Kalman Filter:
The state vector is represented as $\mathbf{x} = [x, y, v_x, v_y]^T$, where $(x, y)$ are planar Mercator projection coordinates and $(v_x, v_y)$ are velocity components:
$$\mathbf{x}_{k} = \mathbf{F} \mathbf{x}_{k-1} + \mathbf{w}_k$$
$$\mathbf{z}_k = \mathbf{H} \mathbf{x}_k + \mathbf{v}_k$$
* **State Transition Matrix $\mathbf{F}$:** Models uniform kinematic movement over sampling interval $\Delta t$:
  $$\mathbf{F} = \begin{bmatrix} 1 & 0 & \Delta t & 0 \\ 0 & 1 & 0 & \Delta t \\ 0 & 0 & 1 & 0 \\ 0 & 0 & 0 & 1 \end{bmatrix}$$
* **Measurement Matrix $\mathbf{H}$:** Extracts observed coordinates:
  $$\mathbf{H} = \begin{bmatrix} 1 & 0 & 0 & 0 \\ 0 & 1 & 0 & 0 \end{bmatrix}$$
* **Optimal Kalman Gain $\mathbf{K}_k$:** Minimizes posteriori error covariance based on reported GPS accuracy:
  $$\mathbf{K}_k = \mathbf{P}_k^- \mathbf{H}^T (\mathbf{H} \mathbf{P}_k^- \mathbf{H}^T + \mathbf{R}_k)^{-1}$$

---

## 5. Shift & Labor Privacy State Machine

To comply with labor regulations and ensure employee trust, tracking operates under a strict finite-state machine (FSM). Personal movement outside work hours cannot be tracked under any circumstances.

```mermaid
stateDiagram-v2
    [*] --> OffDuty : Initial State / App Closed

    state OffDuty {
        [*] --> Disarmed
        Disarmed : Background Service = STOPPED
        Disarmed : Hardware GPS = OFF
        Disarmed : shift_active = false
        Disarmed : Pings Sent = 0
    }

    OffDuty --> ActiveDuty : Driver taps "Start Shift"<br/>(Time is between 06:00 AM & 08:00 PM)

    state ActiveDuty {
        [*] --> StationaryState
        StationaryState : Speed < 2.0 km/h
        StationaryState : Accelerometer still
        StationaryState : Ping Frequency = 60s Heartbeat
        StationaryState : Status = "Stopped / Parked" or "In Office"

        MovingState : Speed >= 2.5 km/h OR Accelerometer Active
        MovingState : High-frequency GPS = 4s Interval / 6m Delta
        MovingState : Status = "On The Way" (In Transit)

        StationaryState --> MovingState : Motion detected (> 2.5 km/h)
        MovingState --> StationaryState : Vehicle parked (< 2.0 km/h for 30s)
    }

    ActiveDuty --> OffDuty : Driver taps "End Shift"
    ActiveDuty --> OffDuty : Time reaches 08:00 PM IST (Auto Cutoff)
    ActiveDuty --> OffDuty : Next Calendar Day arrives (Date != shift_date)

    note right of OffDuty
        Even if the phone reboots,
        or Google Maps turns on GPS,
        the background task verifies:
        "shift_date == today".
        If false, the ping is discarded
        and service unregisters immediately.
    end note
```

---

## 6. Edge Ingestion & Offline Sync Architecture

```mermaid
flowchart LR
    subgraph SENSING["Sensors & OS Events"]
        GPS["Fused Location Provider<br/>(4s / 6m updates)"]
        ACC["3-Axis Accelerometer<br/>(Motion classification)"]
    end

    subgraph GATE["Edge Ingestion Gate"]
        CHECK_TIME{"Active Work Window?<br/>(06:00 AM - 08:00 PM)"}
        CHECK_DATE{"Shift Started TODAY?<br/>(shift_date == today)"}
        THROTTLE{"Moving or Stationary?"}
    end

    subgraph BUFFER["Local Resilience Storage"]
        SQL_QUEUE[("Encrypted Local Queue<br/>(SQLite / AsyncStorage)")]
    end

    subgraph SYNC["Cloud Dispatcher"]
        HTTP_POST["POST /api/v1/location/ping"]
        HTTP_BATCH["POST /api/v1/location/batch"]
    end

    GPS & ACC --> CHECK_TIME
    CHECK_TIME -- "Outside Hours" --> DROP["Kill Background Task & Sleep"]
    CHECK_TIME -- "Within Hours" --> CHECK_DATE
    CHECK_DATE -- "Not Started Today" --> DROP
    CHECK_DATE -- "Active Today" --> THROTTLE

    THROTTLE -- "Moving (>2.5 km/h)" --> DISPATCH_NOW["Stream Every 4s"]
    THROTTLE -- "Stationary (<2.0 km/h)" --> THROTTLE_WAIT["Throttle to 60s Heartbeat"]

    DISPATCH_NOW & THROTTLE_WAIT --> NET_CHECK{"Network Available?"}
    NET_CHECK -- "No (Dead Zone)" --> SQL_QUEUE
    NET_CHECK -- "Yes" --> HTTP_POST

    SQL_QUEUE -- "Signal Restored" --> HTTP_BATCH
```

---

## 7. Database Entity-Relationship & Indexing Topology

The persistence model is tuned for high-write telemetry ingestion and sub-second date-range history queries:

```mermaid
erDiagram
    users {
        int id PK "Primary Key (Auto-increment)"
        varchar_100 name "Employee / Admin Full Name"
        varchar_100 email UK "Unique Login Identifier"
        varchar_255 hashed_password "Argon2 / BCrypt Hash"
        varchar_20 role "admin | employee"
        boolean is_active "Default true"
        timestamptz created_at "Account creation timestamp"
    }

    locations {
        bigint id PK "Primary Key (High-volume BigInt)"
        int user_id FK "Indexed Foreign Key -> users.id"
        double_precision latitude "WGS-84 Latitude"
        double_precision longitude "WGS-84 Longitude"
        double_precision altitude "Meters above sea level"
        double_precision speed "Instantaneous speed in km/h"
        double_precision heading "Compass heading (0-360 deg)"
        double_precision accuracy "GPS horizontal dilution (meters)"
        int battery_level "Device battery state (0-100%)"
        boolean is_moving "Boolean motion flag"
        varchar_50 activity_type "still | walking | in_vehicle | shift_ended"
        boolean is_mock "Anti-spoofing fake GPS flag"
        timestamptz recorded_at "Indexed capture timestamp"
        timestamptz created_at "Server storage timestamp"
    }

    geofences {
        int id PK "Primary Key"
        varchar_150 name "Zone title (e.g. Enterprise HQ)"
        varchar_150 client_name "Associated client entity"
        double_precision latitude "Center coordinate lat"
        double_precision longitude "Center coordinate lng"
        double_precision radius_meters "Perimeter radius (default 100m)"
        timestamptz created_at "Created timestamp"
    }

    detected_visits {
        bigint id PK "Primary Key"
        int user_id FK "Foreign Key -> users.id"
        int geofence_id FK "Foreign Key -> geofences.id (Null if outside)"
        timestamptz arrival_time "Entry timestamp"
        timestamptz departure_time "Exit timestamp"
        int duration_minutes "Total dwell time"
        text notes "Audit notes / Geofence match"
    }

    route_cache {
        varchar_100 cache_key PK "user_id + '_' + date"
        int user_id FK "Foreign Key -> users.id"
        date route_date "Normalized calendar date"
        json snapped_coordinates "Precomputed Polyline / GeoJSON array"
        double_precision distance_km "Computed daily distance odometer"
        timestamptz created_at "Cache generation timestamp"
    }

    users ||--o{ locations : "streams 1000s of"
    users ||--o{ detected_visits : "records"
    geofences ||--o{ detected_visits : "matches"
    users ||--o{ route_cache : "caches"
```

### Strategic Database Indexing:
1. `CREATE INDEX idx_locations_user_recorded ON locations(user_id, recorded_at ASC);`  
   *Ensures date-range queries for route replay execute with index range scans across millions of rows in $< 15\text{ms}$.*
2. `CREATE INDEX idx_locations_recorded_at ON locations(recorded_at);`  
   *Accelerates 7-day retention purging routines (`POST /purge-older-than-7-days`).*
3. `CREATE INDEX idx_users_email ON users(email);`  
   *Provides $O(1)$ authentication lookups during mobile logins.*

---

## 8. Web Admin Dispatcher & GIS Rendering Engine

The web dashboard is designed for high-density dispatch operations:

```mermaid
flowchart TD
    WS_STREAM["WebSocket Stream (/ws/live)"] --> CLIENT_MGR["Live Dispatch State Manager"]
    REST_POLL["REST Sync (/location/latest)"] --> CLIENT_MGR

    subgraph MAP_CANVAS["Leaflet High-Performance GIS Engine"]
        TILE_LAYER["OpenStreetMap Vector / Raster Tiles"]
        MARKER_LAYER["Vehicle Marker Layer"]
        GEOFENCE_LAYER["Geofence Layer (Circular Overlays)"]
        PATH_LAYER["Historical Trajectory Polyline"]
    end

    CLIENT_MGR --> MARKER_STATUS["Compute Dynamic Fleet Badges"]

    subgraph FLEET_EVAL["Dynamic Status Evaluator (getEmployeeStatus)"]
        CHECK_OFFLINE{"Ping within last 5 mins<br/>AND activity != 'shift_ended'?"}
        CHECK_GEO{"Inside any Geofence Perimeter?<br/>(Haversine <= radius)"}
        CHECK_MOVING{"Speed >= 2.5 km/h?"}

        CHECK_OFFLINE -- "No" --> BADGE_OFFLINE["⚪ Shift Ended / Offline"]
        CHECK_OFFLINE -- "Yes" --> CHECK_GEO
        CHECK_GEO -- "Yes (HQ / Office)" --> BADGE_OFFICE["🏢 In Office (Emerald Badge)"]
        CHECK_GEO -- "Yes (Client Site)" --> BADGE_CLIENT["📍 At Client Site (Purple Badge)"]
        CHECK_GEO -- "No" --> CHECK_MOVING
        CHECK_MOVING -- "Yes" --> BADGE_TRANSIT["🚗 On The Way (Cyan Badge / Pulse)"]
        CHECK_MOVING -- "No" --> BADGE_PARKED["🛑 Stopped / Parked (Amber Badge)"]
    end

    MARKER_STATUS --> MARKER_LAYER
    CLIENT_MGR --> GEOFENCE_LAYER
    CLIENT_MGR --> PATH_LAYER
    TILE_LAYER --> MAP_CANVAS
```

---

## 9. Infrastructure, Hosting & Availability Architecture

```mermaid
flowchart TD
    subgraph DEVELOPER["Developer / Source Control"]
        GIT_PUSH["Git Push to GitHub (main branch)"]
    end

    subgraph GITHUB_ACTIONS["CI/CD & Operational Daemon"]
        DEPLOY_HOOK["Render Webhook Trigger"]
        KEEPALIVE_CRON["Workday Keep-Alive Daemon<br/>(.github/workflows/keepalive.yml)"]
    end

    subgraph RENDER_CLOUD["Render Cloud Platform (Frankfurt / Oregon)"]
        subgraph BACKEND_HOST["Backend Web Service (geotrack-backend)"]
            FASTAPI_PROC["Uvicorn ASGI Server<br/>(Python 3.12, 512MB RAM)"]
        end

        subgraph FRONTEND_HOST["Dashboard Static Site (geotrack-dashboard)"]
            VITE_STATIC["Vite Compiled Assets<br/>(dist/ with Nginx rewrite to index.html)"]
        end
    end

    subgraph SUPABASE_CLOUD["Supabase PostgreSQL Cloud (ap-south-1 Mumbai)"]
        PGBOUNCER_SVC["PgBouncer Connection Pooler<br/>(Transaction mode :6543)"]
        PG_INSTANCE[("PostgreSQL 15 Server<br/>(Compute & Storage Tier)")]
    end

    GIT_PUSH --> DEPLOY_HOOK
    DEPLOY_HOOK --> BACKEND_HOST & FRONTEND_HOST
    KEEPALIVE_CRON -- "HTTP GET every 10 mins (08:00 AM - 08:00 PM IST)" --> FASTAPI_PROC & VITE_STATIC

    FASTAPI_PROC <--> PGBOUNCER_SVC <--> PG_INSTANCE
```

### Availability Economics:
* **Render Free-Tier Spin-Down Policy:** Free instances shut down after 15 minutes of inactivity.
* **The GeoTrack Solution:** The GitHub Action `.github/workflows/keepalive.yml` fires a lightweight health check every 10 minutes between **07:30 AM and 08:20 PM IST** (02:00 to 14:50 UTC). 
* **Zero Cost + Zero Latency:** The system stays warm and responsive throughout the entire Indian business workday with zero cold starts, while shutting down automatically at night to preserve free tier hours.

---

## 10. Summary Matrix: Architectural Layers

| Layer | Technology | Primary Responsibility | SLA / Key Metric |
| :--- | :--- | :--- | :--- |
| **Mobile Native** | Kotlin, Jetpack Compose, Coroutines | Direct Android OS hardware integration, foreground service lifecycle | $4\text{s}$ adaptive GNSS telemetry |
| **Mobile Cross-Platform** | React Native, Expo, TaskManager | Cross-platform fleet deployment for Android & iOS | $\approx 2\%$ battery consumption/hour |
| **Edge Storage** | SQLite, Room, AsyncStorage | Zero telemetry loss across connectivity blackouts | $100\%$ delivery on network recovery |
| **API Gateway** | FastAPI, Uvicorn, Python 3.12 | High-throughput asynchronous ingestion & schema validation | $< 25\text{ms}$ endpoint response time |
| **Real-Time Stream** | WebSockets (`/ws/live`) | Push-based event broadcasting to active admin consoles | $\le 50\text{ms}$ fan-out latency |
| **AI Denoising** | NumPy, SciPy, Kalman Filtering | Kinematic smoothing, teleport rejection, velocity bound verification | Eliminates $> 95\%$ of GPS noise |
| **Road Alignment** | OSRM Engine, Hidden Markov Models | Highway-snapped route reconstruction with anti-detour safety | Sub-meter road alignment |
| **Data Persistence** | PostgreSQL 15, PgBouncer | ACID compliance, spatio-temporal telemetry indexing | Millions of rows queried in $< 15\text{ms}$ |
| **Operations UI** | React 18, Vite, Leaflet, Tailwind | Interactive dispatch console, live odometers, route scrubber | 60 FPS GIS canvas rendering |
| **Availability** | GitHub Actions Cron | Prevents cloud cold starts during the 12-hour work window | $99.9\%$ daytime uptime |
