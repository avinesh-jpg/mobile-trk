"""
Road snapping (map matching) for GPS trails using an OSRM server.

The trail is split into small overlapping chunks (OSRM handles ~100 points per
request), each chunk is matched to the road network using timestamps and GPS
accuracy radiuses, and the pieces are stitched back into continuous segments.

If a chunk cannot be matched, its raw GPS points are used for that part and the
result is flagged as not fully snapped, so the UI can tell the user honestly.
"""
import math
import time
from typing import Any, Dict, List, Optional, Tuple

import requests

from app.core.config import settings

CHUNK_SIZE = 80          # points per OSRM request
CHUNK_OVERLAP = 1        # shared point between chunks so segments join up
MIN_RADIUS_M = 10.0      # OSRM default (5 m) is too tight for phone GPS
MAX_RADIUS_M = 50.0
JOIN_DISTANCE_M = 40.0   # join consecutive segments that end/start this close
REQUEST_TIMEOUT_S = 15
PAUSE_BETWEEN_CHUNKS_S = 0.25   # be polite to the public OSRM server
VALID_PROFILES = {"driving", "walking", "cycling"}

LatLng = List[float]  # [lat, lng]


def haversine_m(a: LatLng, b: LatLng) -> float:
    r = 6371000.0
    p1, p2 = math.radians(a[0]), math.radians(b[0])
    dphi = p2 - p1
    dlmb = math.radians(b[1] - a[1])
    h = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlmb / 2) ** 2
    return 2 * r * math.asin(math.sqrt(h))


def prepare_points(locations: list) -> List[Dict[str, Any]]:
    """Convert DB rows to plain dicts with strictly increasing timestamps."""
    pts: List[Dict[str, Any]] = []
    last_ts: Optional[int] = None
    for loc in locations:
        if loc.recorded_at is None:
            continue
        ts = int(loc.recorded_at.timestamp())
        if last_ts is not None and ts <= last_ts:
            continue  # OSRM requires strictly increasing timestamps
        last_ts = ts
        acc = loc.accuracy if loc.accuracy is not None else 20.0
        pts.append({
            "lat": float(loc.latitude),
            "lng": float(loc.longitude),
            "ts": ts,
            "radius": max(MIN_RADIUS_M, min(float(acc), MAX_RADIUS_M)),
        })
    return pts


def make_chunks(points: List[Dict[str, Any]]) -> List[List[Dict[str, Any]]]:
    if len(points) <= CHUNK_SIZE:
        return [points] if len(points) >= 2 else []
    chunks = []
    step = CHUNK_SIZE - CHUNK_OVERLAP
    i = 0
    while i < len(points) - CHUNK_OVERLAP:
        chunk = points[i:i + CHUNK_SIZE]
        if len(chunk) >= 2:
            chunks.append(chunk)
        i += step
    return chunks


def _match_chunk(
    session: requests.Session,
    chunk: List[Dict[str, Any]],
    profile: str,
) -> Optional[Tuple[List[List[LatLng]], float]]:
    """Return (segments, distance_m) for one chunk, or None if matching failed."""
    coords = ";".join(f"{p['lng']:.6f},{p['lat']:.6f}" for p in chunk)
    params = {
        "geometries": "geojson",
        "overview": "full",
        "gaps": "split",
        "tidy": "true",
        "timestamps": ";".join(str(p["ts"]) for p in chunk),
        "radiuses": ";".join(f"{p['radius']:.0f}" for p in chunk),
    }
    url = f"{settings.OSRM_BASE_URL.rstrip('/')}/match/v1/{profile}/{coords}"
    try:
        resp = session.get(url, params=params, timeout=REQUEST_TIMEOUT_S)
        if resp.status_code != 200:
            return None
        data = resp.json()
    except (requests.RequestException, ValueError):
        return None

    if data.get("code") != "Ok" or not data.get("matchings"):
        return None

    segments: List[List[LatLng]] = []
    distance = 0.0
    for m in data["matchings"]:
        line = [[lat, lng] for lng, lat in m["geometry"]["coordinates"]]
        if len(line) >= 2:
            segments.append(line)
            distance += float(m.get("distance") or 0.0)
    if not segments:
        return None
    return segments, distance


def _raw_segment(chunk: List[Dict[str, Any]]) -> Tuple[List[LatLng], float]:
    line = [[p["lat"], p["lng"]] for p in chunk]
    dist = sum(haversine_m(line[i - 1], line[i]) for i in range(1, len(line)))
    return line, dist


def _merge_close_segments(segments: List[List[LatLng]]) -> List[List[LatLng]]:
    merged: List[List[LatLng]] = []
    for seg in segments:
        if merged and haversine_m(merged[-1][-1], seg[0]) <= JOIN_DISTANCE_M:
            merged[-1].extend(seg)
        else:
            merged.append(list(seg))
    return merged


def snap_trail(locations: list, profile: str = "driving") -> Dict[str, Any]:
    """
    Snap a list of Location rows (ordered by time) to roads.

    Returns:
      {
        "segments":    [[ [lat,lng], ... ], ...]   continuous road-following pieces
        "coordinates": flat [lat,lng] list (all segments in order)
        "distance_m":  total distance along the returned geometry
        "snapped":     True only if every chunk matched to roads
        "failed_chunks": number of chunks that fell back to raw GPS
        "profile":     profile used
      }
    """
    if profile not in VALID_PROFILES:
        profile = "driving"

    points = prepare_points(locations)
    chunks = make_chunks(points)
    if not chunks:
        raw = [[p["lat"], p["lng"]] for p in points]
        return {
            "segments": [raw] if raw else [],
            "coordinates": raw,
            "distance_m": 0.0,
            "snapped": False,
            "failed_chunks": 0,
            "profile": profile,
        }

    all_segments: List[List[LatLng]] = []
    total_distance = 0.0
    failed = 0

    with requests.Session() as session:
        for idx, chunk in enumerate(chunks):
            if idx > 0:
                time.sleep(PAUSE_BETWEEN_CHUNKS_S)
            result = _match_chunk(session, chunk, profile)
            if result is None:
                # one retry for transient errors / rate limiting
                time.sleep(1.0)
                result = _match_chunk(session, chunk, profile)
            if result is None:
                failed += 1
                line, dist = _raw_segment(chunk)
                all_segments.append(line)
                total_distance += dist
            else:
                segs, dist = result
                all_segments.extend(segs)
                total_distance += dist

    segments = _merge_close_segments(all_segments)
    flat = [pt for seg in segments for pt in seg]
    return {
        "segments": segments,
        "coordinates": flat,
        "distance_m": round(total_distance, 1),
        "snapped": failed == 0,
        "failed_chunks": failed,
        "profile": profile,
    }
