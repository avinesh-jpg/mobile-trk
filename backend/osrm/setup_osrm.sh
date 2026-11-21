#!/bin/bash
# ==============================================================================
# GeoTrack Enterprise: Automated OSRM Self-Hosted Engine Setup (Linux / Cloud VPS)
# ==============================================================================
set -e

echo "=========================================="
echo "  GeoTrack Self-Hosted OSRM Setup Engine  "
echo "=========================================="

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
DATA_DIR="$DIR/data"
mkdir -p "$DATA_DIR"

PBF_PATH="$DATA_DIR/map.osm.pbf"

if [ ! -f "$PBF_PATH" ]; then
    echo "Step 1: Downloading Southern Zone India OSM extract..."
    curl -L -o "$PBF_PATH" "https://download.geofabrik.de/asia/india/southern-zone-latest.osm.pbf"
    echo "Download complete."
else
    echo "Step 1: Existing OSM map extract found ($PBF_PATH). Skipping download."
fi

echo "Step 2: Extracting road graph (osrm-extract)..."
docker run --rm -v "$DATA_DIR:/data" ghcr.io/project-osrm/osrm-backend osrm-extract -p /opt/car.lua /data/map.osm.pbf

echo "Step 3: Partitioning cells (osrm-partition)..."
docker run --rm -v "$DATA_DIR:/data" ghcr.io/project-osrm/osrm-backend osrm-partition /data/map.osrm

echo "Step 4: Customizing weights (osrm-customize)..."
docker run --rm -v "$DATA_DIR:/data" ghcr.io/project-osrm/osrm-backend osrm-customize /data/map.osrm

echo "Step 5: Starting GeoTrack OSRM Routing Service via Docker Compose..."
cd "$DIR" && docker compose up -d

echo "========================================================"
echo "✅ Self-Hosted OSRM is live at http://localhost:5000"
echo "========================================================"
