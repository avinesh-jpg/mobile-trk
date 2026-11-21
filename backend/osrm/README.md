# GeoTrack Self-Hosted OSRM Highway Routing Engine

This directory provides the production Docker setup to run your own private, self-hosted **Open Source Routing Machine (OSRM)** container.

---

## Why Self-Host OSRM?
1. **Zero Public Rate Limits:** The public demo server (`router.project-osrm.org`) restricts batches to 8–10 points and rate-limits high traffic. Your private container supports batches of 500+ points with unlimited requests.
2. **Sub-25ms Latency:** Because the routing engine runs locally or in your private VPC, route snapping takes milliseconds instead of seconds.
3. **Data Independence:** Works completely offline without depending on external map APIs.

---

## Architecture

```
                  ┌─────────────────────────────────────────┐
                  │          FastAPI Backend                │
                  │   (backend/app/services/routing.py)     │
                  └───────────────────┬─────────────────────┘
                                      │
                 ┌────────────────────┴────────────────────┐
                 │                                         │
                 ▼                                         ▼
   [Primary: Private Container]            [Fallback: Public Demo]
       http://localhost:5000               https://router.project-osrm.org
  (0-25ms, Unlimited Points)                  (Fallback if Docker is down)
```

---

## Quick Start Guide

### Prerequisites
* [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed and running.

### 1. Automated Setup (One Command)
* **On Windows (PowerShell):**
  ```powershell
  cd backend\osrm
  .\setup_osrm.ps1
  ```
* **On Linux / Cloud VPS (Bash):**
  ```bash
  cd backend/osrm
  chmod +x setup_osrm.sh
  ./setup_osrm.sh
  ```

This script will:
1. Download the latest OpenStreetMap road extract for Southern India (`southern-zone-latest.osm.pbf`) from Geofabrik.
2. Extract the road hierarchy and routing graphs using OSRM's Multi-Level Dijkstra (MLD) algorithm.
3. Launch the `geotrack-osrm` Docker container on `http://localhost:5000`.

### 2. Configure Backend `.env`
In `backend/.env`, set:
```ini
OSRM_BASE_URL=http://localhost:5000
```

If the Docker container is stopped, the backend automatically falls back to the public demo server without failing requests!
