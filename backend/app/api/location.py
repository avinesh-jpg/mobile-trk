import json
from typing import List, Optional
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import desc
from app.api.deps import get_db, get_current_user, require_admin
from app.api.websocket import manager
from app.db.models import User, Location, RouteCache
from app.schemas.location import LocationPing, LocationBatch, LocationOut, UserLiveStatus
from app.ml.anomaly import detect_gps_spoofing, filter_clean_trajectory, calculate_real_travel_distance
from app.services.routing import process_staff_route, snap_trail, VALID_PROFILES

router = APIRouter(prefix="/location", tags=["Location & Telemetry"])

@router.post("/ping", response_model=LocationOut, status_code=status.HTTP_201_CREATED)
async def ingest_location_ping(
    ping: LocationPing,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Ingest a real-time GPS coordinate from the employee mobile app.
    Applies ML anomaly/fake-GPS check and broadcasts to live web dashboards.
    """
    # Fetch last known location to detect impossible jumps
    prev_loc = (
        db.query(Location)
        .filter(Location.user_id == current_user.id)
        .order_by(desc(Location.recorded_at))
        .first()
    )

    is_spoofed = detect_gps_spoofing(
        new_lat=ping.latitude,
        new_lng=ping.longitude,
        new_time=ping.recorded_at,
        prev_lat=prev_loc.latitude if prev_loc else None,
        prev_lng=prev_loc.longitude if prev_loc else None,
        prev_time=prev_loc.recorded_at if prev_loc else None,
        client_mock_flag=ping.is_mock
    )

    # Enforce stationary speed threshold: micro-jitter under 2 km/h while still is 0 km/h
    reported_speed = ping.speed or 0.0
    act_type = ping.activity_type or "unknown"

    # Enforce automatic 8:00 PM IST cutoff
    ist_tz = timezone(timedelta(hours=5, minutes=30))
    now_ist = datetime.now(ist_tz)
    is_after_hours = (now_ist.hour >= 20 or now_ist.hour < 6)

    if is_after_hours:
        clean_speed = 0.0
        clean_moving = False
        act_type = "shift_ended"
    elif act_type == "still" or reported_speed < 2.0:
        clean_speed = 0.0
        clean_moving = False
        act_type = "still"
    else:
        clean_speed = reported_speed
        clean_moving = True

    db_loc = Location(
        user_id=current_user.id,
        latitude=ping.latitude,
        longitude=ping.longitude,
        altitude=ping.altitude,
        speed=clean_speed,
        heading=ping.heading,
        accuracy=ping.accuracy,
        battery_level=ping.battery_level,
        is_moving=clean_moving,
        activity_type=act_type,
        is_mock=is_spoofed,
        recorded_at=ping.recorded_at
    )
    db.add(db_loc)
    db.commit()
    db.refresh(db_loc)

    # Real-time WebSocket broadcast to connected Admin Dashboards
    broadcast_data = {
        "event": "location_update",
        "user_id": current_user.id,
        "user_name": current_user.name,
        "latitude": db_loc.latitude,
        "longitude": db_loc.longitude,
        "heading": db_loc.heading or 0.0,
        "accuracy": db_loc.accuracy or 10.0,
        "speed": db_loc.speed,
        "battery_level": db_loc.battery_level,
        "activity_type": db_loc.activity_type,
        "is_mock": db_loc.is_mock,
        "recorded_at": db_loc.recorded_at.isoformat()
    }
    await manager.broadcast(broadcast_data)

    return db_loc

@router.post("/batch", status_code=status.HTTP_201_CREATED)
def ingest_batch_locations(
    batch: LocationBatch,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Ingest batch cached GPS points collected while mobile device was offline.
    """
    if not batch.locations:
        return {"message": "No locations received", "count": 0}

    new_records = []
    for p in batch.locations:
        new_records.append(
            Location(
                user_id=current_user.id,
                latitude=p.latitude,
                longitude=p.longitude,
                altitude=p.altitude,
                speed=p.speed,
                heading=p.heading,
                accuracy=p.accuracy,
                battery_level=p.battery_level,
                is_moving=p.is_moving or False,
                activity_type=p.activity_type or "unknown",
                is_mock=p.is_mock or False,
                recorded_at=p.recorded_at
            )
        )
    db.bulk_save_objects(new_records)
    db.commit()
    return {"message": "Successfully synchronized offline locations", "count": len(new_records)}

@router.post("/stop-shift")
async def stop_shift_tracking(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Called when employee taps 'End Shift' / 'Stop Tracking' in mobile app.
    Marks status as shift_ended, drops speed to 0, and notifies dashboard in real-time.
    """
    now_utc = datetime.now(timezone.utc)
    last_loc = (
        db.query(Location)
        .filter(Location.user_id == current_user.id)
        .order_by(desc(Location.recorded_at))
        .first()
    )
    if last_loc:
        stop_loc = Location(
            user_id=current_user.id,
            latitude=last_loc.latitude,
            longitude=last_loc.longitude,
            altitude=last_loc.altitude,
            speed=0.0,
            heading=last_loc.heading,
            accuracy=last_loc.accuracy,
            battery_level=last_loc.battery_level,
            is_moving=False,
            activity_type="shift_ended",
            is_mock=False,
            recorded_at=now_utc
        )
        db.add(stop_loc)
        db.commit()

    broadcast_data = {
        "event": "shift_ended",
        "user_id": current_user.id,
        "user_name": current_user.name,
        "is_online": False,
        "speed": 0.0,
        "activity_type": "shift_ended",
        "recorded_at": now_utc.isoformat()
    }
    await manager.broadcast(broadcast_data)
    return {"message": "Shift ended successfully", "status": "offline"}

@router.get("/latest", response_model=List[UserLiveStatus])
def get_all_latest_locations(
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """
    Admin endpoint to fetch the latest known location and active status for all employees.
    """
    employees = db.query(User).filter(User.role == "employee").all()
    now_utc = datetime.now(timezone.utc)
    ist_tz = timezone(timedelta(hours=5, minutes=30))
    now_ist = datetime.now(ist_tz)
    is_after_hours = (now_ist.hour >= 20 or now_ist.hour < 6)
    results = []

    for emp in employees:
        last_loc = (
            db.query(Location)
            .filter(Location.user_id == emp.id)
            .order_by(desc(Location.recorded_at))
            .first()
        )
        
        # Consider online only if pinged within last 5 minutes AND not shift_ended AND not past 8:00 PM cutoff
        is_online = False
        latest_loc_out = None
        if last_loc and last_loc.recorded_at:
            delta = (now_utc - last_loc.recorded_at).total_seconds()
            if delta <= 300 and last_loc.activity_type != "shift_ended" and not is_after_hours:
                is_online = True
            
            # If no updates for > 75 seconds or after hours, person is stationary (speed = 0)
            loc_data = LocationOut.model_validate(last_loc)
            if (delta > 75 or is_after_hours) and is_online:
                loc_data.speed = 0.0
                loc_data.is_moving = False
                loc_data.activity_type = "still"
            latest_loc_out = loc_data

        # Calculate employee's distance today in IST (resets daily at 00:00 IST)
        start_of_today_ist = now_ist.replace(hour=0, minute=0, second=0, microsecond=0)
        start_of_today = start_of_today_ist.astimezone(timezone.utc)

        today_points = (
            db.query(Location)
            .filter(Location.user_id == emp.id, Location.recorded_at >= start_of_today)
            .order_by(Location.recorded_at.asc())
            .all()
        )
        today_meters = calculate_real_travel_distance(today_points)

        # Calculate employee's distance for current week (resets every Monday 00:00 IST)
        start_of_week_ist = (now_ist - timedelta(days=now_ist.weekday())).replace(hour=0, minute=0, second=0, microsecond=0)
        start_of_week = start_of_week_ist.astimezone(timezone.utc)

        week_points = (
            db.query(Location)
            .filter(Location.user_id == emp.id, Location.recorded_at >= start_of_week)
            .order_by(Location.recorded_at.asc())
            .all()
        )
        week_meters = calculate_real_travel_distance(week_points)

        results.append(
            UserLiveStatus(
                user_id=emp.id,
                name=emp.name,
                email=emp.email,
                role=emp.role,
                latest_location=latest_loc_out,
                is_online=is_online,
                today_distance_km=round(today_meters / 1000.0, 2),
                week_distance_km=round(week_meters / 1000.0, 2)
            )
        )
    return results

@router.post("/purge-older-than-7-days")
def purge_old_telemetry(
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """
    Wipes raw breadcrumb locations older than 7 days to maintain weekly cycle and lightweight DB.
    """
    cutoff = datetime.now(timezone.utc) - timedelta(days=7)
    deleted_count = db.query(Location).filter(Location.recorded_at < cutoff).delete()
    db.commit()
    return {"message": f"Successfully purged {deleted_count} telemetry records older than 7 days."}

@router.get("/history/{user_id}")
async def get_location_history(
    user_id: int,
    date: Optional[str] = Query(None, description="Format: YYYY-MM-DD (IST day)"),
    date_str: Optional[str] = Query(None, description="Alternative date param YYYY-MM-DD"),
    profile: str = Query("driving", description="driving | walking | cycling"),
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """
    Route replay history endpoint with AI Denoising, 2D Kalman filter & HMM Road-Snapping.
    Matches exact Location columns (user_id, recorded_at), filters out mock locations,
    low accuracy fixes (>25m) and velocity leaps (>38m/s), returning road-snapped path.
    """
    target_date = date or date_str
    ist_tz = timezone(timedelta(hours=5, minutes=30))
    if not target_date:
        target_date = datetime.now(ist_tz).strftime("%Y-%m-%d")

    try:
        dt = datetime.strptime(target_date, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")

    start_date_ist = dt.replace(hour=0, minute=0, second=0, microsecond=0, tzinfo=ist_tz)
    end_date_ist = start_date_ist + timedelta(days=1)

    # Filter by user_id and capture timestamp ordered ascending
    query = (
        db.query(Location)
        .filter(
            Location.user_id == user_id,
            Location.recorded_at >= start_date_ist,
            Location.recorded_at < end_date_ist
        )
        .order_by(Location.recorded_at.asc())
    )
    raw_pings = query.limit(10000).all()

    # Run AI Denoising, Kalman Filtering & HMM Road-Snapping
    route_data = await process_staff_route(raw_pings, profile=profile)
    route_data["date"] = target_date
    route_data["employee_id"] = user_id
    route_data["user_id"] = user_id
    route_data["profile"] = profile
    route_data["segments"] = [route_data["road_snapped_path"]] if route_data["road_snapped_path"] else []
    route_data["coordinates"] = route_data["road_snapped_path"]
    route_data["distance_m"] = round(route_data["total_distance_km"] * 1000.0, 1)
    route_data["snapped"] = route_data["map_match_confidence"] > 0
    return route_data

@router.delete("/clear/{user_id}")
def clear_user_locations(
    user_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """Admin endpoint to wipe historical test logs for an employee to reset clean testing."""
    count = db.query(Location).filter(Location.user_id == user_id).delete()
    db.commit()
    return {"message": f"Successfully cleared {count} test telemetry records."}


IST = timezone(timedelta(hours=5, minutes=30))

@router.get("/route/{user_id}")
async def get_snapped_route(
    user_id: int,
    date_str: Optional[str] = Query(None, description="Format: YYYY-MM-DD (IST day)"),
    date: Optional[str] = Query(None, description="Format: YYYY-MM-DD (IST day)"),
    profile: str = Query("driving", description="driving | walking | cycling"),
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """
    Admin endpoint: the employee's trail for a day, snapped onto real roads.
    Uses process_staff_route for HMM road snapping and AI denoising.
    """
    target_date = date or date_str
    if not target_date:
        target_date = datetime.now(IST).strftime("%Y-%m-%d")

    return await get_location_history(
        user_id=user_id,
        date=target_date,
        profile=profile,
        db=db,
        admin=admin
    )
