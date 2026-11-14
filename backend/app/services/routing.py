import math
from datetime import datetime
from typing import List, Dict, Any, Optional
import numpy as np
import httpx
import polyline

# Point to your self-hosted OSRM server (or public demo server for testing only)
OSRM_BASE_URL = "http://router.project-osrm.org"


def haversine_meters(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate distance in meters between two WGS84 coordinates."""
    R = 6371000.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = (
        math.sin(dphi / 2.0) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2.0) ** 2
    )
    return 2.0 * R * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))


def filter_and_sort_pings(
    pings: List[Dict[str, Any]],
    max_accuracy_m: float = 25.0,
    max_speed_mps: float = 38.0,  # ~136 km/h max realistic road speed
) -> List[Dict[str, Any]]:
    """
    Stage 1A: Sort by device capture timestamp (fixes offline SQLite batch syncs)
    and drop low-accuracy or impossible teleportation spikes.
    """
    if not pings:
        return []

    # 1. Sort strictly by device capture time
    sorted_pings = sorted(pings, key=lambda p: p["timestamp"])

    cleaned: List[Dict[str, Any]] = []
    for ping in sorted_pings:
        # Drop mock locations or high-error cell/Wi-Fi pings
        if ping.get("is_mock", False):
            continue
        accuracy = ping.get("accuracy")
        if accuracy is not None and accuracy > max_accuracy_m:
            continue

        if not cleaned:
            cleaned.append(ping)
            continue

        prev = cleaned[-1]
        dt = (ping["timestamp"] - prev["timestamp"]).total_seconds()

        # Deduplicate identical or sub-second duplicate pings
        if dt < 1.0:
            continue

        dist = haversine_meters(
            prev["latitude"], prev["longitude"], ping["latitude"], ping["longitude"]
        )
        speed = dist / dt

        # Reject impossible GPS jumps onto parallel streets
        if speed > max_speed_mps:
            continue

        cleaned.append(ping)

    return cleaned


class GPSKalmanFilter2D:
    """
    Stage 1B: 2D Kinematic Kalman Filter (State: [lat, lon, v_lat, v_lon]).
    Smooths stationary indoor jitter while preserving true movement trajectories.
    """

    def __init__(self, process_noise: float = 1e-5, measurement_noise: float = 1e-4):
        self.q = process_noise
        self.r_base = measurement_noise
        self.x: Optional[np.ndarray] = None  # State vector [lat, lon, v_lat, v_lon]
        self.P: Optional[np.ndarray] = None  # Covariance matrix
        self.last_ts: Optional[datetime] = None

    def filter_trajectory(self, pings: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        if len(pings) < 2:
            return pings

        smoothed: List[Dict[str, Any]] = []
        for ping in pings:
            ts = ping["timestamp"]
            z = np.array([ping["latitude"], ping["longitude"]], dtype=float)

            # Scale measurement noise dynamically using reported GPS accuracy
            acc = ping.get("accuracy") or 10.0
            r_scale = max(1.0, (acc / 10.0) ** 2)
            R = np.eye(2) * (self.r_base * r_scale)

            if self.x is None:
                self.x = np.array([z[0], z[1], 0.0, 0.0], dtype=float)
                self.P = np.eye(4) * 1e-3
                self.last_ts = ts
                smoothed.append({**ping})
                continue

            dt = max(1.0, (ts - self.last_ts).total_seconds())
            self.last_ts = ts

            # State transition matrix
            F = np.array(
                [
                    [1, 0, dt, 0],
                    [0, 1, 0, dt],
                    [0, 0, 1, 0],
                    [0, 0, 0, 1],
                ],
                dtype=float,
            )
            Q = np.eye(4) * (self.q * dt)

            # Predict
            self.x = F @ self.x
            self.P = F @ self.P @ F.T + Q

            # Update
            H = np.array([[1, 0, 0, 0], [0, 1, 0, 0]], dtype=float)
            y = z - (H @ self.x)
            S = H @ self.P @ H.T + R
            K = self.P @ H.T @ np.linalg.inv(S)

            self.x = self.x + (K @ y)
            self.P = (np.eye(4) - (K @ H)) @ self.P

            smoothed.append(
                {
                    **ping,
                    "latitude": float(self.x[0]),
                    "longitude": float(self.x[1]),
                }
            )

        return smoothed


async def snap_to_roads_hmm(
    pings: List[Dict[str, Any]],
    profile: str = "driving",
    chunk_size: int = 80,
) -> Dict[str, Any]:
    """
    Stage 2: Hidden Markov Model (HMM) + Viterbi Map Matching via OSRM /match.
    Snaps denoised GPS points onto actual road centerlines.
    """
    if not pings:
        return {"matched_coordinates": [], "distance_meters": 0.0, "confidence": 0.0}

    if len(pings) == 1:
        p = pings[0]
        return {
            "matched_coordinates": [[p["latitude"], p["longitude"]]],
            "distance_meters": 0.0,
            "confidence": 1.0,
        }

    matched_coords: List[List[float]] = []
    total_distance = 0.0
    confidences: List[float] = []

    async with httpx.AsyncClient(timeout=10.0) as client:
        # Process in overlapping chunks so road transitions stay continuous
        step = chunk_size - 1
        for i in range(0, len(pings), step):
            batch = pings[i : i + chunk_size]
            if len(batch) < 2:
                break

            # OSRM expects "lon,lat;lon,lat"
            coord_str = ";".join(f"{p['longitude']},{p['latitude']}" for p in batch)
            timestamps_str = ";".join(
                str(int(p["timestamp"].timestamp())) for p in batch
            )
            radiuses_str = ";".join(
                str(min(50, max(10, int(p.get("accuracy") or 15)))) for p in batch
            )

            url = f"{OSRM_BASE_URL}/match/v1/{profile}/{coord_str}"
            params = {
                "steps": "false",
                "geometries": "polyline6",
                "overview": "full",
                "timestamps": timestamps_str,
                "radiuses": radiuses_str,
                "gaps": "ignore",
            }

            try:
                resp = await client.get(url, params=params)
                data = resp.json()

                if data.get("code") == "Ok" and data.get("matchings"):
                    for matching in data["matchings"]:
                        # Decode precision-6 polyline into [[lat, lon], ...]
                        decoded = polyline.decode(matching["geometry"], 6)
                        if matched_coords and decoded:
                            # Avoid duplicating overlapping boundary vertex
                            matched_coords.extend(decoded[1:])
                        else:
                            matched_coords.extend(decoded)

                        total_distance += matching.get("distance", 0.0)
                        confidences.append(matching.get("confidence", 0.8))
                else:
                    # Fallback to Kalman-smoothed points if off-road (e.g., inside large warehouse/campus)
                    fallback = [[p["latitude"], p["longitude"]] for p in batch]
                    matched_coords.extend(fallback[1:] if matched_coords else fallback)

            except Exception:
                fallback = [[p["latitude"], p["longitude"]] for p in batch]
                matched_coords.extend(fallback[1:] if matched_coords else fallback)

    avg_confidence = sum(confidences) / len(confidences) if confidences else 0.5
    return {
        "matched_coordinates": matched_coords,  # Ready for Leaflet <Polyline positions={...} />
        "distance_meters": round(total_distance, 2),
        "confidence": round(avg_confidence, 3),
    }


async def process_staff_route(raw_pings: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Full End-to-End Route Cleaning + AI Road-Snapping Pipeline."""
    clean_pings = filter_and_sort_pings(raw_pings)
    kf = GPSKalmanFilter2D()
    denoised_pings = kf.filter_trajectory(clean_pings)
    snapped_result = await snap_to_roads_hmm(denoised_pings)

    return {
        "raw_count": len(raw_pings),
        "clean_count": len(denoised_pings),
        "denoised_pings": denoised_pings,
        "road_snapped_path": snapped_result["matched_coordinates"],
        "total_distance_km": round(snapped_result["distance_meters"] / 1000.0, 2),
        "map_match_confidence": snapped_result["confidence"],
    }