from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.db.models import LocationPing
from app.services.routing import process_staff_route

router = APIRouter()

@router.get("/history/{employee_id}")
async def get_employee_snapped_route(
    employee_id: int,
    date: str,  # YYYY-MM-DD
    db: Session = Depends(get_db),
):
    # Query pings ordered by capture timestamp (not DB insertion ID)
    rows = (
        db.query(LocationPing)
        .filter(LocationPing.employee_id == employee_id)
        .order_by(LocationPing.recorded_at.asc())
        .all()
    )

    raw_pings = [
        {
            "latitude": r.latitude,
            "longitude": r.longitude,
            "accuracy": getattr(r, "accuracy", 10.0),
            "is_mock": getattr(r, "is_mock", False),
            "timestamp": r.recorded_at,
        }
        for r in rows
    ]

    return await process_staff_route(raw_pings)