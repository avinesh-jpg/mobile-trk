# ==============================================================================
# GeoTrack Enterprise: Production Cloud OSRM Container Dockerfile
# Self-contained highway routing engine for Render / AWS / GCP / DigitalOcean
# ==============================================================================
FROM ghcr.io/project-osrm/osrm-backend:latest

WORKDIR /data

# Install curl to download map extract
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates && rm -rf /var/lib/apt/lists/*

# Default to South Zone India (Tamil Nadu, Karnataka, Kerala, AP, Telangana)
# Can be overridden during build: docker build --build-arg OSM_PBF_URL=...
ARG OSM_PBF_URL=https://download.geofabrik.de/asia/india/southern-zone-latest.osm.pbf

RUN echo "Downloading OpenStreetMap extract from ${OSRM_PBF_URL}..." \
    && curl -L -o /data/map.osm.pbf "${OSRM_PBF_URL}" \
    && echo "Extracting road hierarchy with car profile..." \
    && osrm-extract -p /opt/car.lua /data/map.osm.pbf \
    && rm -f /data/map.osm.pbf \
    && echo "Partitioning cells (MLD)..." \
    && osrm-partition /data/map.osrm \
    && echo "Customizing road graph weights..." \
    && osrm-customize /data/map.osrm

ENV PORT=5000
EXPOSE 5000

# Start routing daemon on the designated port with support for 500+ GPS point match batches
CMD sh -c "osrm-routed --algorithm mld /data/map.osrm --max-matching-size 500 --port ${PORT}"
