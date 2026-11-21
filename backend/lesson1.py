from datetime import datetime
from pydantic import ValidationError
from app.schemas.location import LocationPing

print("=== 1. TESTING VALID GPS PING ===")
try:
    valid_ping = LocationPing(
        latitude=11.107,
        longitude=77.339,
        speed=35.5,
        battery_level=85,
        recorded_at=datetime.now()
    )
    print("✅ Success! Valid Ping Created:")
    print(f"Latitude: {valid_ping.latitude}, Speed: {valid_ping.speed} km/h")
except ValidationError as e:
    print("❌ Error:", e)

print("\n=== 2. TESTING INVALID GPS PING (Bad Latitude & Battery) ===")
try:
    # Here latitude is 999 (impossible on Earth!) and battery is 150%
    invalid_ping = LocationPing(
        latitude=999.0,
        longitude=77.339,
        battery_level=150,
        recorded_at=datetime.now()
    )
except ValidationError as e:
    print("🛡️ Pydantic Blocked Bad Data Successfully:")
    print(e)