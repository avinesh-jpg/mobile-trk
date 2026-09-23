from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime

class LocationPing(BaseModel):
    latitude: float = Field(..., ge=-90.0, le=90.0)
    longitude: float = Field(..., ge=-180.0, le=180.0)
    altitude: Optional[float] = None
    speed: Optional[float] = None
    heading: Optional[float] = None
    accuracy: Optional[float] = None
    battery_level: Optional[int] = Field(None, ge=0, le=100)
    is_moving: Optional[bool] = False
    activity_type: Optional[str] = "unknown"
    is_mock: Optional[bool] = False
    recorded_at: datetime

class LocationBatch(BaseModel):
    locations: List[LocationPing]

class LocationOut(BaseModel):
    id: int
    user_id: int
    latitude: float
    longitude: float
    altitude: Optional[float] = None
    speed: Optional[float] = None
    heading: Optional[float] = None
    accuracy: Optional[float] = None
    battery_level: Optional[int] = None
    is_moving: bool
    activity_type: str
    is_mock: bool
    recorded_at: datetime

    class Config:
        from_attributes = True

class UserLiveStatus(BaseModel):
    user_id: int
    name: str
    email: str
    role: str
    latest_location: Optional[LocationOut] = None
    is_online: bool = False
