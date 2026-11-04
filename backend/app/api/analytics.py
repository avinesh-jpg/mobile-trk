from datetime import datetime, timedelta, timezone
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from app.api.deps import get_db, require_admin
from app.core.config import settings
from app.db.models import User, Location, Geofence, DetectedVisit
from app.ml.clustering import detect_stay_points, match_visit_to_geofence
from app.ml.anomaly import haversine_distance_meters, calculate_real_travel_distance

IST = timezone(timedelta(hours=5, minutes=30))

def to_ist(dt: datetime) -> datetime:
    """Ensure datetime is converted to India Standard Time (IST)."""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(IST)

router = APIRouter(prefix="/analytics", tags=["ML & AI Analytics"])

@router.post("/detect-stops/{user_id}")
def process_stops_with_ml(
    user_id: int,
    date_str: Optional[str] = Query(None, description="Format: YYYY-MM-DD"),
    min_stay_minutes: int = Query(15, ge=5),
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """
    Applies DBSCAN spatio-temporal clustering machine learning to automatically
    detect visits and stops from raw GPS telemetry.
    """
    query = db.query(Location).filter(Location.user_id == user_id)
    if date_str:
        start_date = datetime.strptime(date_str, "%Y-%m-%d").replace(tzinfo=timezone.utc)
        end_date = start_date + timedelta(days=1)
        query = query.filter(Location.recorded_at >= start_date, Location.recorded_at < end_date)

    raw_points = query.order_by(Location.recorded_at.asc()).all()
    if len(raw_points) < 5:
        return {"message": "Insufficient GPS data for clustering", "detected_visits": []}

    dict_points = [
        {
            "latitude": p.latitude,
            "longitude": p.longitude,
            "recorded_at": p.recorded_at
        }
        for p in raw_points
    ]

    detected = detect_stay_points(dict_points, eps_meters=60.0, min_stay_minutes=min_stay_minutes)
    all_geofences = db.query(Geofence).all()
    geofence_dicts = [
        {"id": g.id, "latitude": g.latitude, "longitude": g.longitude, "radius_meters": g.radius_meters}
        for g in all_geofences
    ]

    saved_visits = []
    for visit in detected:
        matched_geo_id = match_visit_to_geofence(
            visit["centroid_lat"], visit["centroid_lng"], geofence_dicts
        )
        
        db_visit = DetectedVisit(
            user_id=user_id,
            geofence_id=matched_geo_id,
            arrival_time=visit["arrival_time"],
            departure_time=visit["departure_time"],
            duration_minutes=visit["duration_minutes"],
            centroid_lat=visit["centroid_lat"],
            centroid_lng=visit["centroid_lng"],
            confidence_score=visit["confidence_score"]
        )
        db.add(db_visit)
        saved_visits.append({
            **visit,
            "geofence_id": matched_geo_id
        })

    db.commit()
    return {
        "message": f"Successfully identified {len(saved_visits)} stops using DBSCAN clustering",
        "detected_count": len(saved_visits),
        "visits": saved_visits
    }

@router.get("/visits/{user_id}")
def get_user_visits(
    user_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """Retrieve all ML-detected visits for an employee."""
    visits = db.query(DetectedVisit).filter(DetectedVisit.user_id == user_id).order_by(DetectedVisit.arrival_time.desc()).all()
    return visits

@router.post("/ai-summary/{user_id}")
def generate_ai_field_summary(
    user_id: int,
    date_str: Optional[str] = Query(None, description="Format: YYYY-MM-DD"),
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """
    Generates an automated executive AI summary of the employee's travel day
    using metrics and Google Gemini LLM.
    """
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    query = db.query(Location).filter(Location.user_id == user_id)
    if date_str:
        start_date = datetime.strptime(date_str, "%Y-%m-%d").replace(tzinfo=timezone.utc)
        end_date = start_date + timedelta(days=1)
        query = query.filter(Location.recorded_at >= start_date, Location.recorded_at < end_date)

    points = query.order_by(Location.recorded_at.asc()).all()
    if not points:
        return {"summary": f"No telemetry recorded for {user.name} on this date."}

    # Calculate real physical travel distance (filtering indoor GPS micro-drift)
    total_distance_m = calculate_real_travel_distance(points, min_movement_m=25.0, min_speed_kmh=2.5)
    total_km = round(total_distance_m / 1000.0, 2)
    first_ping = to_ist(points[0].recorded_at).strftime("%I:%M %p")
    last_ping = to_ist(points[-1].recorded_at).strftime("%I:%M %p")
    spoofed_count = sum(1 for p in points if p.is_mock)

    # Fetch detected visits
    visits = db.query(DetectedVisit).filter(DetectedVisit.user_id == user_id).all()
    visit_count = len(visits)

    # Check for Gemini API Key
    ai_narrative = ""
    if settings.GEMINI_API_KEY:
        try:
            from google import genai
            client = genai.Client(api_key=settings.GEMINI_API_KEY)
            prompt = f"""
            You are an AI supervisor for field operations. Summarize this employee's travel workday in 2 concise, professional paragraphs:
            - Employee: {user.name} ({user.email})
            - Total Distance Covered: {total_km} km
            - Shift Active Hours: from {first_ping} to {last_ping}
            - Total GPS Points Logged: {len(points)}
            - Verified Stops/Client Visits: {visit_count}
            - Suspicious / Spoofed GPS points flagged: {spoofed_count}
            
            Give key insights into productivity, travel pacing, and whether any anomalies (like GPS spoofing) require attention.
            """
            response = client.models.generate_content(
                model='gemini-2.0-flash',
                contents=prompt
            )
            ai_narrative = response.text
        except Exception as e:
            ai_narrative = f"AI Generation Notice: {str(e)}"

    if not ai_narrative:
        # Fallback intelligent deterministic summary
        ai_narrative = (
            f"**Field Summary for {user.name}**:\n"
            f"Employee covered approximately **{total_km} km** between **{first_ping}** and **{last_ping}**. "
            f"The system recorded {len(points)} telemetry updates and identified **{visit_count} client visits / stops**. "
            + (f"⚠️ **Alert**: {spoofed_count} GPS points were flagged as potential mock locations." if spoofed_count > 0 else "✅ No GPS spoofing or anomalies detected.")
        )

    return {
        "user_id": user.id,
        "user_name": user.name,
        "date": date_str or "All Time",
        "total_distance_km": total_km,
        "active_window": f"{first_ping} - {last_ping}",
        "total_pings": len(points),
        "verified_stops": visit_count,
        "suspicious_pings": spoofed_count,
        "ai_narrative": ai_narrative
    }

@router.get("/export/timesheet")
def export_timesheet(
    user_id: Optional[int] = Query(None),
    start_date: Optional[str] = Query(None, description="YYYY-MM-DD"),
    end_date: Optional[str] = Query(None, description="YYYY-MM-DD"),
    fuel_rate: float = Query(8.0, description="Fuel rate per km"),
    format: str = Query("json", description="json or csv"),
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """
    1-Click Timesheet & Field Travel Log Exporter.
    Aggregates shift hours, distance, stops, battery, and fuel allowance.
    Outputs as downloadable CSV or structured JSON for PDF rendering.
    """
    import io
    import csv
    from fastapi.responses import StreamingResponse

    # Determine employees to include
    if user_id:
        employees = db.query(User).filter(User.id == user_id).all()
    else:
        employees = db.query(User).filter(User.role == "employee").all()

    # Determine date range filter
    now_utc = datetime.now(timezone.utc)
    if start_date:
        start_dt = datetime.strptime(start_date, "%Y-%m-%d").replace(tzinfo=timezone.utc)
    else:
        start_dt = now_utc - timedelta(days=7)

    if end_date:
        end_dt = datetime.strptime(end_date, "%Y-%m-%d").replace(tzinfo=timezone.utc) + timedelta(days=1)
    else:
        end_dt = now_utc + timedelta(days=1)

    records = []

    for emp in employees:
        points = (
            db.query(Location)
            .filter(
                Location.user_id == emp.id,
                Location.recorded_at >= start_dt,
                Location.recorded_at < end_dt
            )
            .order_by(Location.recorded_at.asc())
            .all()
        )

        # Group points by date string in IST (YYYY-MM-DD)
        daily_groups = {}
        for p in points:
            d_str = to_ist(p.recorded_at).strftime("%Y-%m-%d")
            if d_str not in daily_groups:
                daily_groups[d_str] = []
            daily_groups[d_str].append(p)

        for d_str, day_points in daily_groups.items():
            first_pt = day_points[0]
            last_pt = day_points[-1]

            # Calculate real day distance (filtering indoor GPS micro-drift)
            day_dist_m = calculate_real_travel_distance(day_points, min_movement_m=25.0, min_speed_kmh=2.5)
            day_km = round(day_dist_m / 1000.0, 2)

            # Shift duration in minutes
            shift_minutes = int((last_pt.recorded_at - first_pt.recorded_at).total_seconds() / 60)
            shift_hours_str = f"{shift_minutes // 60}h {shift_minutes % 60}m"

            # Count stops for this day
            d_start_dt = datetime.strptime(d_str, "%Y-%m-%d").replace(tzinfo=timezone.utc)
            d_end_dt = d_start_dt + timedelta(days=1)
            day_stops = (
                db.query(DetectedVisit)
                .filter(
                    DetectedVisit.user_id == emp.id,
                    DetectedVisit.arrival_time >= d_start_dt,
                    DetectedVisit.arrival_time < d_end_dt
                )
                .count()
            )

            spoofed_pings = sum(1 for p in day_points if p.is_mock)
            fuel_amount = round(day_km * fuel_rate, 2)

            records.append({
                "date": d_str,
                "employee_id": emp.id,
                "employee_name": emp.name,
                "employee_email": emp.email,
                "shift_start": to_ist(first_pt.recorded_at).strftime("%I:%M %p"),
                "shift_end": to_ist(last_pt.recorded_at).strftime("%I:%M %p"),
                "total_duration": shift_hours_str,
                "duration_minutes": shift_minutes,
                "total_distance_km": day_km,
                "verified_stops": day_stops,
                "spoofed_alerts": spoofed_pings,
                "end_battery": last_pt.battery_level,
                "fuel_reimbursement": fuel_amount,
                "status": "Flagged" if spoofed_pings > 0 else "Verified"
            })

    if format.lower() == "csv":
        output = io.StringIO()
        writer = csv.DictWriter(output, fieldnames=[
            "date", "employee_name", "employee_email", "shift_start", "shift_end",
            "total_duration", "total_distance_km", "verified_stops",
            "fuel_reimbursement", "end_battery", "status"
        ])
        writer.writeheader()
        for r in records:
            writer.writerow({
                "date": r["date"],
                "employee_name": r["employee_name"],
                "employee_email": r["employee_email"],
                "shift_start": r["shift_start"],
                "shift_end": r["shift_end"],
                "total_duration": r["total_duration"],
                "total_distance_km": r["total_distance_km"],
                "verified_stops": r["verified_stops"],
                "fuel_reimbursement": f"₹{r['fuel_reimbursement']}",
                "end_battery": f"{r['end_battery']}%",
                "status": r["status"]
            })
        output.seek(0)
        return StreamingResponse(
            io.BytesIO(output.getvalue().encode('utf-8')),
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename=GeoTrack_Timesheet_{datetime.now().strftime('%Y%m%d')}.csv"}
        )

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "total_records": len(records),
        "fuel_rate": fuel_rate,
        "records": records
    }
