package com.example.geotrack.data.model

data class ShiftRecord(
    val id: String,
    val userId: String,
    val employeeName: String,
    val startTime: Long,
    val endTime: Long? = null,
    val totalMinutes: Long = 0,
    val distanceKm: Double = 0.0,
    val geofencesVisited: List<String> = emptyList(),
    val isCompleted: Boolean = false
)
