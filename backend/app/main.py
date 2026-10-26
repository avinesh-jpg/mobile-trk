from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.api import auth, location, geofence, analytics, websocket
from app.db.session import engine, Base
from app.db import models  # noqa: F401  (registers tables with Base.metadata)

# Create any missing tables (including route_cache) on startup
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="Enterprise Employee Field Location Tracking API with Machine Learning & AI Analytics",
    docs_url="/docs",
    redoc_url="/redoc"
)

# Enable CORS for Web Dashboard and Mobile App
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

# Register API Routers
app.include_router(auth.router, prefix=settings.API_V1_STR)
app.include_router(location.router, prefix=settings.API_V1_STR)
app.include_router(geofence.router, prefix=settings.API_V1_STR)
app.include_router(analytics.router, prefix=settings.API_V1_STR)
app.include_router(websocket.router)

@app.get("/")
def root():
    return {
        "status": "online",
        "service": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "docs": "/docs",
        "endpoints": {
            "auth": f"{settings.API_V1_STR}/auth",
            "location": f"{settings.API_V1_STR}/location",
            "geofence": f"{settings.API_V1_STR}/geofence",
            "analytics": f"{settings.API_V1_STR}/analytics",
            "live_websocket": "/ws/live"
        }
    }
