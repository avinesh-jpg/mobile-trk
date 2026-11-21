# ==============================================================================
# GeoTrack Enterprise: Automated OSRM Self-Hosted Engine Setup (Windows)
# ==============================================================================
# Prerequisites: Docker Desktop installed and running.
# ==============================================================================

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  GeoTrack Self-Hosted OSRM Setup Engine  " -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

$dataDir = Join-Path $PSScriptRoot "data"
if (-not (Test-Path $dataDir)) {
    New-Item -ItemType Directory -Path $dataDir | Out-Null
    Write-Host "Created data directory: $dataDir" -ForegroundColor Green
}

$pbfPath = Join-Path $dataDir "map.osm.pbf"

if (-not (Test-Path $pbfPath)) {
    Write-Host "`nStep 1: Downloading OpenStreetMap road network data..." -ForegroundColor Yellow
    Write-Host "Default: Geofabrik Southern Zone India (Tamil Nadu, Karnataka, Kerala, AP, Telangana)" -ForegroundColor DarkGray
    $url = "https://download.geofabrik.de/asia/india/southern-zone-latest.osm.pbf"
    
    Invoke-WebRequest -Uri $url -OutFile $pbfPath
    Write-Host "Download complete: $pbfPath" -ForegroundColor Green
} else {
    Write-Host "`nStep 1: Existing OSM map extract found ($pbfPath). Skipping download." -ForegroundColor Green
}

Write-Host "`nStep 2: Extracting road graph (osrm-extract with car profile)..." -ForegroundColor Yellow
docker run --rm -v "${dataDir}:/data" ghcr.io/project-osrm/osrm-backend osrm-extract -p /opt/car.lua /data/map.osm.pbf

Write-Host "`nStep 3: Partitioning cells (osrm-partition MLD)..." -ForegroundColor Yellow
docker run --rm -v "${dataDir}:/data" ghcr.io/project-osrm/osrm-backend osrm-partition /data/map.osrm

Write-Host "`nStep 4: Customizing weights (osrm-customize MLD)..." -ForegroundColor Yellow
docker run --rm -v "${dataDir}:/data" ghcr.io/project-osrm/osrm-backend osrm-customize /data/map.osrm

Write-Host "`nStep 5: Starting GeoTrack OSRM Routing Service via Docker Compose..." -ForegroundColor Yellow
docker compose up -d

Write-Host "`n========================================================" -ForegroundColor Green
Write-Host "✅ Self-Hosted OSRM is live at http://localhost:5000" -ForegroundColor Green
Write-Host "   Health check: http://localhost:5000/route/v1/driving/77.3396,11.1072;77.3060,11.1542" -ForegroundColor DarkGray
Write-Host "========================================================" -ForegroundColor Green
