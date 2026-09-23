import numpy as np
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional
from sklearn.cluster import DBSCAN
from app.ml.anomaly import haversine_distance_meters

def detect_stay_points(
    points: List[Dict[str, Any]],
    eps_meters: float = 60.0,
    min_stay_minutes: int = 15
) -> List[Dict[str, Any]]:
    """
    Spatio-temporal clustering using DBSCAN to automatically detect when an
    employee stays at a client site or stationary stop.
    
    Each point dict must have:
    - 'latitude': float
    - 'longitude': float
    - 'recorded_at': datetime
    """
    if len(points) < 5:
        return []

    # Convert coordinates to radians for haversine metric
    coords = np.array([[p["latitude"], p["longitude"]] for p in points])
    radians_coords = np.radians(coords)
    
    # 6371000m is earth radius; eps in radians
    kms_per_radian = 6371000.0
    epsilon = eps_meters / kms_per_radian

    db = DBSCAN(eps=epsilon, min_samples=3, metric='haversine')
    db.fit(radians_coords)
    labels = db.labels_

    detected_visits = []
    unique_labels = set(labels)

    for cluster_id in unique_labels:
        if cluster_id == -1:
            # Noise points (moving, transit)
            continue

        cluster_indices = np.where(labels == cluster_id)[0]
        cluster_points = [points[i] for i in cluster_indices]

        # Calculate arrival and departure times
        times = [p["recorded_at"] for p in cluster_points]
        arrival_time = min(times)
        departure_time = max(times)
        duration_minutes = int((departure_time - arrival_time).total_seconds() / 60)

        if duration_minutes >= min_stay_minutes:
            centroid_lat = float(np.mean([p["latitude"] for p in cluster_points]))
            centroid_lng = float(np.mean([p["longitude"] for p in cluster_points]))
            
            # Confidence score based on density of points
            confidence = min(1.0, round(len(cluster_points) / (duration_minutes + 1), 2))

            detected_visits.append({
                "arrival_time": arrival_time,
                "departure_time": departure_time,
                "duration_minutes": duration_minutes,
                "centroid_lat": centroid_lat,
                "centroid_lng": centroid_lng,
                "confidence_score": confidence,
                "point_count": len(cluster_points)
            })

    return detected_visits

def match_visit_to_geofence(
    centroid_lat: float,
    centroid_lng: float,
    geofences: List[Dict[str, Any]]
) -> Optional[int]:
    """Finds if a detected visit centroid falls within any geofence radius."""
    for geo in geofences:
        dist = haversine_distance_meters(centroid_lat, centroid_lng, geo["latitude"], geo["longitude"])
        if dist <= geo.get("radius_meters", 100.0):
            return geo["id"]
    return None
