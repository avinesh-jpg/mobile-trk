from math import radians, cos, sin, asin, sqrt
from datetime import datetime
from typing import Optional

def haversine_distance_meters(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate the great circle distance between two points on the earth in meters."""
    R = 6371000.0  # Earth radius in meters
    dLat = radians(lat2 - lat1)
    dLon = radians(lon2 - lon1)
    a = sin(dLat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dLon / 2) ** 2
    c = 2 * asin(sqrt(a))
    return R * c

def detect_gps_spoofing(
    new_lat: float,
    new_lng: float,
    new_time: datetime,
    prev_lat: Optional[float],
    prev_lng: Optional[float],
    prev_time: Optional[datetime],
    client_mock_flag: Optional[bool] = False
) -> bool:
    """
    ML Anomaly Rule & Velocity Check:
    Flags true if client OS reports mock location or if velocity leap exceeds physical limits (> 180 km/h).
    """
    if client_mock_flag:
        return True

    if prev_lat is None or prev_lng is None or prev_time is None:
        return False

    time_diff_seconds = abs((new_time - prev_time).total_seconds())
    if time_diff_seconds < 1:
        return False

    distance_m = haversine_distance_meters(prev_lat, prev_lng, new_lat, new_lng)
    speed_kmh = (distance_m / time_diff_seconds) * 3.6

    # If speed between points exceeds 180 km/h in city/road transport, flag as anomaly/spoof
    if speed_kmh > 180.0 and distance_m > 500:
        return True

    return False

def calculate_real_travel_distance(points: list, min_movement_m: float = 15.0, min_speed_kmh: float = 2.0) -> float:
    """
    Filters out indoor GPS jitter/drift and calculates real physical travel distance.
    - Discards points with poor GPS satellite accuracy (> 35m).
    - Discards impossible velocity leaps (> 140 km/h) caused by cell-tower cold-start jumps.
    - Discards micro-wobbles while stationary.
    """
    if len(points) < 2:
        return 0.0

    total_meters = 0.0
    last_valid_point = None

    for pt in points:
        # Ignore points with poor satellite fix (> 35m accuracy)
        acc = getattr(pt, 'accuracy', None)
        if acc is not None and acc > 35.0:
            continue

        if last_valid_point is None:
            last_valid_point = pt
            continue

        dist = haversine_distance_meters(
            last_valid_point.latitude, last_valid_point.longitude,
            pt.latitude, pt.longitude
        )

        # Velocity check: Calculate real velocity between consecutive fixes
        if pt.recorded_at and last_valid_point.recorded_at:
            time_diff = abs((pt.recorded_at - last_valid_point.recorded_at).total_seconds())
            if time_diff < 0.5:
                # Concurrent duplicate ping within 500ms
                continue
            calculated_speed_kmh = (dist / max(time_diff, 1.0)) * 3.6
            # If speed > 140 km/h, it is a GPS teleport / cell-tower jump -> DISCARD!
            if calculated_speed_kmh > 140.0:
                continue

        speed = getattr(pt, 'speed', 0.0) or 0.0
        activity = getattr(pt, 'activity_type', '') or 'unknown'
        is_still = (activity == 'still') or (speed < min_speed_kmh)

        # Ignore micro-jitter when stationary (< 15m)
        if dist < min_movement_m and is_still:
            continue

        # Valid physical travel movement
        total_meters += dist
        last_valid_point = pt

    return total_meters

def filter_clean_trajectory(points: list, min_movement_m: float = 15.0) -> list:
    """
    Filters out stationary GPS jitter and impossible teleports for smooth route playback.
    """
    if len(points) < 2:
        return points

    # First filter out bad accuracy fixes (> 35m)
    accurate_points = [p for p in points if (getattr(p, 'accuracy', None) is None or p.accuracy <= 35.0)]
    if len(accurate_points) < 2:
        accurate_points = points

    cleaned = [accurate_points[0]]
    for pt in accurate_points[1:]:
        last_pt = cleaned[-1]
        dist = haversine_distance_meters(
            last_pt.latitude, last_pt.longitude,
            pt.latitude, pt.longitude
        )

        # Check for teleport leap
        if pt.recorded_at and last_pt.recorded_at:
            time_diff = abs((pt.recorded_at - last_pt.recorded_at).total_seconds())
            if time_diff < 0.5:
                continue
            speed_kmh = (dist / max(time_diff, 1.0)) * 3.6
            if speed_kmh > 140.0:
                # Discard teleport leap
                continue

        speed = getattr(pt, 'speed', 0.0) or 0.0
        if dist >= min_movement_m or speed >= 2.0:
            cleaned.append(pt)

    if cleaned[-1] != accurate_points[-1] and len(accurate_points) > 1:
        cleaned.append(accurate_points[-1])

    return cleaned


