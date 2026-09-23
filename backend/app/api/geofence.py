from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.api.deps import get_db, require_admin
from app.db.models import Geofence, User
from app.schemas.geofence import GeofenceCreate, GeofenceOut

router = APIRouter(prefix="/geofence", tags=["Geofences & Client Sites"])

@router.post("", response_model=GeofenceOut, status_code=status.HTTP_201_CREATED)
def create_geofence(
    geo_in: GeofenceCreate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """Create a new client site or office geofence."""
    geofence = Geofence(
        name=geo_in.name,
        client_name=geo_in.client_name,
        latitude=geo_in.latitude,
        longitude=geo_in.longitude,
        radius_meters=geo_in.radius_meters
    )
    db.add(geofence)
    db.commit()
    db.refresh(geofence)
    return geofence

@router.get("", response_model=List[GeofenceOut])
def list_geofences(
    db: Session = Depends(get_db)
):
    """List all geofences."""
    return db.query(Geofence).all()

@router.delete("/{geofence_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_geofence(
    geofence_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """Delete a geofence."""
    geo = db.query(Geofence).filter(Geofence.id == geofence_id).first()
    if not geo:
        raise HTTPException(status_code=404, detail="Geofence not found")
    db.delete(geo)
    db.commit()
    return None
