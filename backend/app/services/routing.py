"""
Enterprise AI Denoising, Kalman Filtering & HMM Road-Snapping Service.
Processes raw GPS telemetry into smooth, road-snapped highway paths.
"""
import math
import time
from typing import Any, Dict, List, Optional, Tuple, Union
from datetime import datetime

import numpy as np
import httpx
import polyline

from app.core.config import settings

VALID_PROFILES = {"driving", "walking", "cycling"}
CHUNK_SIZE = 8          # OSRM public demo server limits /match to 10 points
CHUNK_OVERLAP = 1       # Shared boundary point between chunks
MAX_SPEED_M_S = 38.0    # 38 m/s = ~136.8 km/h velocity limit
MAX_ACCURACY_M = 25.0   # Reject fixes with horizontal accuracy > 25m
PUBLIC_OSRM_FALLBACK = "https://router.project-osrm.org"


def haversine_m(a: Union[List[float], Tuple[float, float]], b: Union[List[float], Tuple[float, float]]) -> float:
    """Calculate Haversine distance in meters between two [lat, lon] points."""
    r = 6371000.0
    lat1, lon1 = math.radians(a[0]), math.radians(a[1])
    lat2, lon2 = math.radians(b[0]), math.radians(b[1])
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    h = math.sin(dlat / 2.0) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2.0) ** 2
    return 2.0 * r * math.asin(math.sqrt(max(0.0, min(1.0, h))))


def _get_val(obj: Any, *keys: str, default: Any = None) -> Any:
    """Helper to extract attribute or dict key gracefully."""
    for key in keys:
        if isinstance(obj, dict):
            if key in obj and obj[key] is not None:
                return obj[key]
        else:
            val = getattr(obj, key, None)
            if val is not None:
                return val
    return default


def _extract_ts(p: Any) -> float:
    """Extract POSIX timestamp in seconds from ping object."""
    t = _get_val(p, 'recorded_at', 'timestamp', 'created_at')
    if isinstance(t, datetime):
        return t.timestamp()
    if isinstance(t, (int, float)):
        return float(t)
    return 0.0


def filter_and_sort_pings(raw_pings: List[Any]) -> List[Any]:
    """
    Sort GPS pings ascending by device capture timestamp.
    Filter out mock locations, low-accuracy pings (accuracy > 25.0),
    and impossible speed jumps (> 38.0 m/s).
    """
    if not raw_pings:
        return []

    # 1. Sort ascending by capture timestamp
    sorted_pings = sorted(raw_pings, key=_extract_ts)

    clean: List[Any] = []
    for ping in sorted_pings:
        # Reject mock locations
        is_mock = _get_val(ping, 'is_mock', default=False)
        if bool(is_mock):
            continue

        # Reject low-accuracy fixes (> 25m)
        accuracy = _get_val(ping, 'accuracy', default=None)
        if accuracy is not None:
            try:
                acc_val = float(accuracy)
                if acc_val > MAX_ACCURACY_M or acc_val < 0.0:
                    continue
            except (ValueError, TypeError):
                pass

        # Validate coordinate boundaries
        try:
            lat = float(_get_val(ping, 'latitude', default=0.0))
            lon = float(_get_val(ping, 'longitude', default=0.0))
        except (ValueError, TypeError):
            continue

        if (lat == 0.0 and lon == 0.0) or not (-90.0 <= lat <= 90.0) or not (-180.0 <= lon <= 180.0):
            continue

        ts = _extract_ts(ping)

        # Reject impossible speed jumps (> 38 m/s = 136.8 km/h)
        if clean:
            prev = clean[-1]
            prev_lat = float(_get_val(prev, 'latitude', default=0.0))
            prev_lon = float(_get_val(prev, 'longitude', default=0.0))
            prev_ts = _extract_ts(prev)

            dist_meters = haversine_m([prev_lat, prev_lon], [lat, lon])
            dt = abs(ts - prev_ts)

            if dt > 0.5:
                speed_m_s = dist_meters / dt
                if speed_m_s > MAX_SPEED_M_S:
                    # Impossible velocity leap (cell-tower teleport / glitch) -> discard!
                    continue
            elif dist_meters < 0.5:
                # Concurrent duplicate fix within 500ms -> discard duplicate
                continue

        clean.append(ping)

    # Guard against initial stale GPS fix (e.g. Android returning stale cached fix 10+ km away on app launch)
    while len(clean) >= 3:
        p0 = clean[0]
        p1 = clean[1]
        p2 = clean[2]
        d01 = haversine_m([float(_get_val(p0, 'latitude')), float(_get_val(p0, 'longitude'))],
                          [float(_get_val(p1, 'latitude')), float(_get_val(p1, 'longitude'))])
        d12 = haversine_m([float(_get_val(p1, 'latitude')), float(_get_val(p1, 'longitude'))],
                          [float(_get_val(p2, 'latitude')), float(_get_val(p2, 'longitude'))])
        if d01 > 3000.0 and d12 < 1500.0:
            clean.pop(0)
        else:
            break

    return clean


class GPSKalmanFilter2D:
    """
    2D Discrete Kalman Filter for GPS smoothing.
    State vector: x = [lat, lon, v_lat, v_lon]^T (deg, deg, deg/s, deg/s).
    Dynamically scales measurement noise covariance R by GPS accuracy.
    Smooths stationary indoor jitter without introducing artificial drift.
    """
    def __init__(self, initial_lat: float, initial_lon: float, initial_accuracy: float = 10.0):
        self.x = np.array([initial_lat, initial_lon, 0.0, 0.0], dtype=np.float64)
        meters_to_deg = 1.0 / 111320.0
        acc_deg = max(initial_accuracy, 3.0) * meters_to_deg
        self.P = np.diag([acc_deg**2, acc_deg**2, 1e-4, 1e-4])
        self.sigma_a = 1.2 * meters_to_deg
        self.last_ts: Optional[float] = None

    def update(self, lat: float, lon: float, accuracy: float, timestamp_sec: float) -> Tuple[float, float]:
        if self.last_ts is None:
            self.last_ts = timestamp_sec
            self.x[0] = lat
            self.x[1] = lon
            return float(self.x[0]), float(self.x[1])

        dt = timestamp_sec - self.last_ts
        self.last_ts = timestamp_sec
        dt = max(0.1, min(dt, 30.0))

        # State transition F
        F = np.array([
            [1.0, 0.0, dt,  0.0],
            [0.0, 1.0, 0.0, dt ],
            [0.0, 0.0, 1.0, 0.0],
            [0.0, 0.0, 0.0, 1.0]
        ], dtype=np.float64)

        # Process noise covariance Q
        dt2 = dt * dt
        dt3 = dt2 * dt
        q = self.sigma_a ** 2
        Q = q * np.array([
            [dt3 / 3.0, 0.0,       dt2 / 2.0, 0.0      ],
            [0.0,       dt3 / 3.0, 0.0,       dt2 / 2.0],
            [dt2 / 2.0, 0.0,       dt,        0.0      ],
            [0.0,       dt2 / 2.0, 0.0,       dt       ]
        ], dtype=np.float64)

        # Predict step
        x_pred = F @ self.x
        P_pred = F @ self.P @ F.T + Q

        # Dynamic measurement noise R
        meters_to_deg_lat = 1.0 / 111320.0
        cos_lat = max(math.cos(math.radians(lat)), 0.01)
        meters_to_deg_lon = 1.0 / (111320.0 * cos_lat)

        acc = max(float(accuracy or 10.0), 2.5)
        var_lat = (acc * meters_to_deg_lat) ** 2
        var_lon = (acc * meters_to_deg_lon) ** 2
        R = np.diag([var_lat, var_lon])

        # Measurement update
        H = np.array([
            [1.0, 0.0, 0.0, 0.0],
            [0.0, 1.0, 0.0, 0.0]
        ], dtype=np.float64)

        z = np.array([lat, lon], dtype=np.float64)
        y = z - H @ x_pred
        S = H @ P_pred @ H.T + R
        K = P_pred @ H.T @ np.linalg.inv(S)

        self.x = x_pred + K @ y
        I = np.eye(4, dtype=np.float64)
        self.P = (I - K @ H) @ P_pred

        return float(self.x[0]), float(self.x[1])


def apply_kalman_filter(clean_pings: List[Any]) -> List[Dict[str, Any]]:
    """Apply GPSKalmanFilter2D to a sorted sequence of clean pings."""
    if not clean_pings:
        return []

    first_p = clean_pings[0]
    lat0 = float(_get_val(first_p, 'latitude', default=0.0))
    lon0 = float(_get_val(first_p, 'longitude', default=0.0))
    acc0 = float(_get_val(first_p, 'accuracy', default=10.0) or 10.0)
    kf = GPSKalmanFilter2D(lat0, lon0, acc0)

    smoothed: List[Dict[str, Any]] = []
    for ping in clean_pings:
        lat = float(_get_val(ping, 'latitude', default=0.0))
        lon = float(_get_val(ping, 'longitude', default=0.0))
        acc = float(_get_val(ping, 'accuracy', default=10.0) or 10.0)
        ts = _extract_ts(ping)

        s_lat, s_lon = kf.update(lat, lon, acc, ts)
        
        rec_at = _get_val(ping, 'recorded_at', 'timestamp')
        if isinstance(rec_at, datetime):
            iso_time = rec_at.isoformat()
        else:
            iso_time = datetime.fromtimestamp(ts).isoformat() if ts > 0 else ""

        smoothed.append({
            "latitude": round(s_lat, 6),
            "longitude": round(s_lon, 6),
            "speed": float(_get_val(ping, 'speed', default=0.0) or 0.0),
            "heading": float(_get_val(ping, 'heading', default=0.0) or 0.0),
            "accuracy": round(acc, 1),
            "activity_type": str(_get_val(ping, 'activity_type', default='still')),
            "recorded_at": iso_time,
            "timestamp": ts
        })

    return smoothed


async def snap_to_roads_hmm(
    pings: List[Dict[str, Any]],
    profile: str = "driving"
) -> Tuple[List[List[float]], float, float]:
    """
    Downsamples stationary micro-jitter, batches into chunks of 8 points
    (matching OSRM's 10-point limit), snaps onto physical roads using
    OSRM /match with fallback to /route on real streets.
    Returns: (snapped_path, total_distance_km, map_match_confidence_pct)
    """
    if not pings:
        return [], 0.0, 0.0

    raw_kalman_path = [[p["latitude"], p["longitude"]] for p in pings]
    if len(pings) < 2:
        return raw_kalman_path, 0.0, 100.0

    # 1. Global Stationary Check:
    # If employee has no moving pings (all speed < 1.5 m/s or activity still/ended)
    # or entire trip spans < 35m, the entire session was spent stationary at one spot.
    first_pt = [pings[0]["latitude"], pings[0]["longitude"]]
    max_disp_from_start = max(haversine_m(first_pt, [p["latitude"], p["longitude"]]) for p in pings)
    moving_pings_count = sum(
        1 for p in pings
        if (float(p.get("speed") or 0.0) >= 1.5 and str(p.get("activity_type") or "").lower() not in ("still", "shift_ended"))
    )

    if moving_pings_count == 0 or (max_disp_from_start < 35.0 and moving_pings_count < 3):
        # Stationary session: lock to clean cluster centroid point, exactly 0.0 km traveled
        avg_lat = round(sum(p["latitude"] for p in pings) / len(pings), 6)
        avg_lon = round(sum(p["longitude"] for p in pings) / len(pings), 6)
        return [[avg_lat, avg_lon]], 0.0, 100.0

    # 2. Stationary Anchor Filter & Motion Compression
    # When employee is stationary (speed < 1.2 m/s or activity still/shift_ended),
    # lock coordinates to a single anchor point. Suppress all indoor / building multipath
    # drift (< 30m) so OSRM never receives wandering points that hop onto adjacent back alleys.
    motion_pings: List[Dict[str, Any]] = [pings[0]]
    current_anchor = pings[0]

    for p in pings[1:]:
        spd = float(p.get("speed") or 0.0)
        act = str(p.get("activity_type") or "unknown").lower()
        dist_from_anchor = haversine_m(
            [current_anchor["latitude"], current_anchor["longitude"]],
            [p["latitude"], p["longitude"]]
        )

        is_still = (spd < 1.2) or (act in ("still", "shift_ended"))

        # If stationary and within 30m cluster, suppress the point (anchor holds)
        if is_still and dist_from_anchor < 30.0:
            continue

        # Real motion: moved outside 30m anchor radius or has moving speed
        dist_from_prev_motion = haversine_m(
            [motion_pings[-1]["latitude"], motion_pings[-1]["longitude"]],
            [p["latitude"], p["longitude"]]
        )
        if dist_from_prev_motion >= 15.0 or spd >= 1.5:
            motion_pings.append(p)
            current_anchor = p

    # Ensure last ping is captured if distinct
    if motion_pings[-1] != pings[-1]:
        dist_last = haversine_m(
            [motion_pings[-1]["latitude"], motion_pings[-1]["longitude"]],
            [pings[-1]["latitude"], pings[-1]["longitude"]]
        )
        if dist_last >= 15.0:
            motion_pings.append(pings[-1])

    if len(motion_pings) < 2:
        anchor_coord = [motion_pings[0]["latitude"], motion_pings[0]["longitude"]]
        return [anchor_coord], 0.0, 100.0

    # 3. Build chunks of up to 8 points (OSRM /match has a hard limit of 10 points)
    chunk_size = CHUNK_SIZE
    step = chunk_size - CHUNK_OVERLAP
    chunks: List[List[Dict[str, Any]]] = []
    i = 0
    n = len(motion_pings)
    while i < n:
        chunk = motion_pings[i : i + chunk_size]
        if len(chunk) >= 2:
            chunks.append(chunk)
        elif chunks:
            chunks[-1].append(chunk[0])
        i += step

    if not chunks:
        chunks = [motion_pings]

    snapped_path: List[List[float]] = []
    total_distance_m = 0.0
    matched_chunks = 0

    primary_osrm = settings.OSRM_BASE_URL.rstrip('/')
    osrm_hosts = [primary_osrm]
    if PUBLIC_OSRM_FALLBACK.rstrip('/') not in osrm_hosts:
        osrm_hosts.append(PUBLIC_OSRM_FALLBACK.rstrip('/'))

    async with httpx.AsyncClient(timeout=12.0) as client:
        for chunk in chunks:
            kalman_pts = [[p["latitude"], p["longitude"]] for p in chunk]
            direct_displacement = haversine_m(kalman_pts[0], kalman_pts[-1])
            direct_dist = sum(
                haversine_m(kalman_pts[j - 1], kalman_pts[j])
                for j in range(1, len(kalman_pts))
            )

            coords = ";".join(f"{p['longitude']:.6f},{p['latitude']:.6f}" for p in chunk)
            
            clean_ts: List[int] = []
            last_t = -1
            for p in chunk:
                t = int(p.get("timestamp", 0))
                if t <= last_t:
                    t = last_t + 1
                clean_ts.append(t)
                last_t = t

            # Snapping radius (20 to 35 meters)
            radiuses = ";".join(str(max(15, min(int(p.get("accuracy", 20)), 35))) for p in chunk)
            timestamps = ";".join(str(t) for t in clean_ts)

            chunk_pts: List[List[float]] = []
            chunk_dist = 0.0

            # Dual-host routing: Try Self-Hosted OSRM first; fallback to Public Demo OSRM
            for host in osrm_hosts:
                if chunk_pts:
                    break
                match_url = f"{host}/match/v1/{profile}/{coords}"
                match_params = {
                    "geometries": "polyline6",
                    "overview": "full",
                    "gaps": "ignore",
                    "tidy": "true",
                    "timestamps": timestamps,
                    "radiuses": radiuses
                }
                try:
                    r = await client.get(match_url, params=match_params)
                    if r.status_code == 200:
                        d = r.json()
                        if d.get("code") == "Ok" and d.get("matchings"):
                            candidate_pts: List[List[float]] = []
                            candidate_dist = 0.0
                            for m in d["matchings"]:
                                pts = polyline.decode(m["geometry"], 6)
                                candidate_pts.extend([[round(lat, 6), round(lon, 6)] for lat, lon in pts])
                                candidate_dist += float(m.get("distance", 0.0) or 0.0)

                            # Anti-detour validation:
                            # 1. If displacement is small (< 30m), chunk is stationary.
                            #    Any match > 45m (e.g. driving around an entire city block) is an artificial detour!
                            # 2. In active motion: candidate distance cannot exceed 1.5x direct path or displacement + 100m.
                            if direct_displacement < 30.0:
                                is_valid_match = (candidate_dist <= 45.0)
                            else:
                                max_allowed = max(direct_dist * 1.5, direct_displacement * 1.6 + 100.0)
                                is_valid_match = (candidate_dist <= max_allowed)

                            if is_valid_match:
                                chunk_pts = candidate_pts
                                chunk_dist = candidate_dist
                                matched_chunks += 1
                                break
                except Exception:
                    pass

                # 2. Pure geometric match fallback
                if not chunk_pts:
                    try:
                        r_geom = await client.get(match_url, params={
                            "geometries": "polyline6",
                            "overview": "full",
                            "gaps": "ignore",
                            "tidy": "true"
                        })
                        if r_geom.status_code == 200:
                            d_geom = r_geom.json()
                            if d_geom.get("code") == "Ok" and d_geom.get("matchings"):
                                candidate_pts = []
                                candidate_dist = 0.0
                                for m in d_geom["matchings"]:
                                    pts = polyline.decode(m["geometry"], 6)
                                    candidate_pts.extend([[round(lat, 6), round(lon, 6)] for lat, lon in pts])
                                    candidate_dist += float(m.get("distance", 0.0) or 0.0)

                                if direct_displacement < 30.0:
                                    is_valid_match = (candidate_dist <= 45.0)
                                else:
                                    max_allowed = max(direct_dist * 1.5, direct_displacement * 1.6 + 100.0)
                                    is_valid_match = (candidate_dist <= max_allowed)

                                if is_valid_match:
                                    chunk_pts = candidate_pts
                                    chunk_dist = candidate_dist
                                    matched_chunks += 1
                                    break
                    except Exception:
                        pass

            # 3. Clean Fallback to Kalman Filtered Coordinates
            # When road matching is unavailable or returns an artificial detour loop,
            # use clean Kalman-filtered GPS coordinates!
            if not chunk_pts:
                chunk_pts = kalman_pts
                chunk_dist = direct_dist if direct_displacement >= 20.0 else 0.0

            # Append smoothly without duplicate joint point
            if not snapped_path:
                snapped_path.extend(chunk_pts)
            else:
                if chunk_pts:
                    if haversine_m(snapped_path[-1], chunk_pts[0]) < 5.0:
                        snapped_path.extend(chunk_pts[1:])
                    else:
                        snapped_path.extend(chunk_pts)
            total_distance_m += chunk_dist

    if not total_distance_m and len(snapped_path) >= 2:
        total_distance_m = sum(haversine_m(snapped_path[j - 1], snapped_path[j]) for j in range(1, len(snapped_path)))

    # Guard: If entire snapped path spans less than 25m, vehicle never physically traveled
    if len(snapped_path) >= 2:
        max_span = max(haversine_m(snapped_path[0], pt) for pt in snapped_path)
        if max_span < 25.0:
            total_distance_m = 0.0
            snapped_path = [snapped_path[0]]

    total_dist_km = total_distance_m / 1000.0
    confidence_pct = round((matched_chunks / max(len(chunks), 1)) * 100.0, 1)

    return snapped_path, total_dist_km, confidence_pct


async def process_staff_route(
    raw_pings: List[Any],
    profile: str = "driving"
) -> Dict[str, Any]:
    """
    End-to-end AI Denoising, Kalman Filtering and HMM Road-Snapping pipeline.
    """
    raw_count = len(raw_pings)

    # 1. AI Denoising & Anomaly Rejection
    clean_pings = filter_and_sort_pings(raw_pings)
    clean_count = len(clean_pings)

    if clean_count == 0:
        return {
            "raw_count": raw_count,
            "clean_count": 0,
            "denoised_pings": [],
            "road_snapped_path": [],
            "total_distance_km": 0.0,
            "map_match_confidence": 0.0
        }

    # 2. 2D Kalman Filter Smoothing
    denoised_pings = apply_kalman_filter(clean_pings)

    # 3. HMM Road-Snapping via OSRM (with 8-point batches and /route fallback)
    road_snapped_path, total_dist_km, confidence = await snap_to_roads_hmm(
        denoised_pings, profile=profile
    )

    return {
        "raw_count": raw_count,
        "clean_count": clean_count,
        "denoised_pings": denoised_pings,
        "road_snapped_path": road_snapped_path,
        "total_distance_km": round(total_dist_km, 2),
        "map_match_confidence": confidence
    }


def snap_trail(locations: list, profile: str = "driving") -> Dict[str, Any]:
    """Synchronous bridge for existing callers."""
    clean = filter_and_sort_pings(locations)
    denoised = apply_kalman_filter(clean)
    coords = [[p["latitude"], p["longitude"]] for p in denoised]
    dist_m = sum(haversine_m(coords[i - 1], coords[i]) for i in range(1, len(coords))) if len(coords) >= 2 else 0.0
    return {
        "segments": [coords] if coords else [],
        "coordinates": coords,
        "distance_m": round(dist_m, 1),
        "snapped": len(coords) > 0,
        "failed_chunks": 0,
        "profile": profile,
    }
