from sqlalchemy import Column, Integer, BigInteger, String, Boolean, Float, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.db.session import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    email = Column(String(100), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    role = Column(String(20), default="employee")  # 'admin' or 'employee'
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    locations = relationship("Location", back_populates="user", cascade="all, delete-orphan")
    visits = relationship("DetectedVisit", back_populates="user", cascade="all, delete-orphan")

class Location(Base):
    __tablename__ = "locations"

    id = Column(BigInteger, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    altitude = Column(Float, nullable=True)
    speed = Column(Float, nullable=True)  # km/h
    heading = Column(Float, nullable=True)  # degrees
    accuracy = Column(Float, nullable=True)  # meters
    battery_level = Column(Integer, nullable=True)  # 0 - 100
    is_moving = Column(Boolean, default=False)
    activity_type = Column(String(50), default="unknown")  # 'still', 'walking', 'in_vehicle'
    is_mock = Column(Boolean, default=False)  # fake GPS flag
    recorded_at = Column(DateTime(timezone=True), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", back_populates="locations")

class Geofence(Base):
    __tablename__ = "geofences"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(150), nullable=False)
    client_name = Column(String(150), nullable=True)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    radius_meters = Column(Float, default=100.0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    visits = relationship("DetectedVisit", back_populates="geofence")

class DetectedVisit(Base):
    __tablename__ = "detected_visits"

    id = Column(BigInteger, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    geofence_id = Column(Integer, ForeignKey("geofences.id", ondelete="SET NULL"), nullable=True)
    arrival_time = Column(DateTime(timezone=True), nullable=False)
    departure_time = Column(DateTime(timezone=True), nullable=True)
    duration_minutes = Column(Integer, nullable=True)
    centroid_lat = Column(Float, nullable=True)
    centroid_lng = Column(Float, nullable=True)
    confidence_score = Column(Float, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", back_populates="visits")
    geofence = relationship("Geofence", back_populates="visits")
