package com.example.geotrack.data.model

data class EmployeeFleet(
    val userId: String,
    val name: String,
    val email: String,
    val isOnline: Boolean,
    val latestLocation: LocationPing? = null,
    val todayDistanceKm: Double = 0.0,
    val weekDistanceKm: Double = 0.0,
    val statusType: String = "offline", // office, client, on_the_way, stopped, offline
    val statusLabel: String = "Offline",
    val statusSubText: String = ""
)
