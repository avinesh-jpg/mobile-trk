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

def calculate_real_travel_distance(points: list, min_movement_m: float = 25.0, min_speed_kmh: float = 2.5) -> float:
    """
    Filters out indoor GPS jitter/drift and calculates real physical travel distance.
    - Discards micro-wobbles (< 25m) while sitting at a desk.
    - Discards points with bad GPS satellite accuracy (> 45m).
    - Uses sensor motion state (still vs moving).
    """
    if len(points) < 2:
        return 0.0

    total_meters = 0.0
    last_valid_point = None

    for pt in points:
        # Ignore points with poor satellite fix
        if getattr(pt, 'accuracy', None) and pt.accuracy > 45.0:
            continue

        if last_valid_point is None:
            last_valid_point = pt
            continue

        dist = haversine_distance_meters(
            last_valid_point.latitude, last_valid_point.longitude,
            pt.latitude, pt.longitude
        )

        speed = getattr(pt, 'speed', 0.0) or 0.0
        activity = getattr(pt, 'activity_type', '') or 'unknown'
        is_still = (activity == 'still') or (speed < min_speed_kmh)

        # Ignore micro-jitter when stationary (< 25m)
        if dist < min_movement_m and is_still:
            continue

        # Valid physical travel movement
        total_meters += dist
        last_valid_point = pt

    return total_meters

def filter_clean_trajectory(points: list, min_movement_m: float = 25.0) -> list:
    """
    Filters out stationary GPS jitter scribbles for route playback.
    Only records significant travel movements on the route trail.
    """
    if len(points) < 2:
        return points

    cleaned = [points[0]]
    for pt in points[1:]:
        last_pt = cleaned[-1]
        dist = haversine_distance_meters(
            last_pt.latitude, last_pt.longitude,
            pt.latitude, pt.longitude
        )
        speed = getattr(pt, 'speed', 0.0) or 0.0
        if dist >= min_movement_m or speed > 3.0:
            cleaned.append(pt)

    if cleaned[-1] != points[-1]:
        cleaned.append(points[-1])

    return cleaned

