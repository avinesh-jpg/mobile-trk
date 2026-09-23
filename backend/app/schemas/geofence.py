from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime

class GeofenceCreate(BaseModel):
    name: str
    client_name: Optional[str] = None
    latitude: float = Field(..., ge=-90.0, le=90.0)
    longitude: float = Field(..., ge=-180.0, le=180.0)
    radius_meters: float = Field(100.0, gt=0)

class GeofenceOut(BaseModel):
    id: int
    name: str
    client_name: Optional[str] = None
    latitude: float
    longitude: float
    radius_meters: float
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True
