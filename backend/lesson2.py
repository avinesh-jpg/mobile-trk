import math
from datetime import datetime

# 1. Define our distance function using the Haversine formula
def calculate_distance_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Calculates distance in kilometers between two GPS points on Earth.
    """
    R = 6371.0  # Earth's radius in kilometers

    # Convert degrees to radians (math functions in Python require radians!)
    d_lat = math.radians(lat2 - lat1)
    d_lon = math.radians(lon2 - lon1)
    
    # Haversine trigonometric formula
    a = (math.sin(d_lat / 2) ** 2 + 
         math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * 
         math.sin(d_lon / 2) ** 2)
    
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    distance = R * c
    return round(distance, 2)


# 2. Define our speed calculator function
def calculate_speed_kmh(distance_km: float, time_seconds: float) -> float:
    """
    Speed = Distance / Time (converted to km/h)
    """
    if time_seconds <= 0:
        return 0.0
    hours = time_seconds / 3600.0
    speed = distance_km / hours
    return round(speed, 1)


# === 3. TEST WITH THIS MORNING'S REAL TRIP DATA ===
print("=== REAL GPS TRIP CALCULATION ===")

# Start Point: Tiruppur Kangeyam Rd (06:27 AM)
start_lat, start_lon = 11.1072, 77.3396
start_time = datetime(2026, 11, 20, 6, 27, 19)

# End Point: Destination (06:59 AM)
end_lat, end_lon = 11.1542, 77.3060
end_time = datetime(2026, 11, 20, 6, 59, 41)

# Calculate physical distance
trip_distance = calculate_distance_km(start_lat, start_lon, end_lat, end_lon)

# Calculate duration in seconds
duration_seconds = (end_time - start_time).total_seconds()
duration_minutes = round(duration_seconds / 60, 1)

# Calculate average speed
avg_speed = calculate_speed_kmh(trip_distance, duration_seconds)

print(f"📍 Start Coordinate : ({start_lat}, {start_lon})")
print(f"📍 End Coordinate   : ({end_lat}, {end_lon})")
print(f"⏱️ Duration         : {duration_minutes} minutes ({int(duration_seconds)} seconds)")
print(f"📏 Direct Distance  : {trip_distance} km")
print(f"🚗 Average Speed    : {avg_speed} km/h")

# Anomaly Check (Spoof Detection Rule!)
if avg_speed > 150.0:
    print("🚨 ANOMALY ALERT: Impossible vehicle speed! Possible GPS spoofing.")
else:
    print("✅ Physics Check Passed: Normal road vehicle movement.")