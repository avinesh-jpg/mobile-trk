package com.example.geotrack.data.model

data class AnomalyAlert(
    val id: String,
    val userId: String,
    val employeeName: String,
    val timestamp: Long,
    val type: String, // FAKE_GPS, SPEED_SPIKE, GEOFENCE_DEVIATION, BATTERY_DROP
    val title: String,
    val description: String,
    val severity: String = "HIGH" // HIGH, MEDIUM, LOW
)
