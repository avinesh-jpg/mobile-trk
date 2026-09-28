package com.example.geotrack.data.model

data class LocationPing(
    val id: Long = 0,
    val userId: String = "emp_101",
    val latitude: Double,
    val longitude: Double,
    val altitude: Double? = null,
    val speed: Double = 0.0, // km/h
    val heading: Float = 0f,
    val accuracy: Float = 10f, // meters
    val batteryLevel: Int? = 85,
    val isMoving: Boolean = false,
    val activityType: String = "still", // still, walking, in_vehicle, shift_ended
    val isMock: Boolean = false,
    val recordedAt: Long = System.currentTimeMillis(),
    val isSynced: Boolean = false
)
