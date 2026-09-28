package com.example.geotrack.data.model

data class Geofence(
    val id: String,
    val name: String,
    val latitude: Double,
    val longitude: Double,
    val radiusMeters: Double,
    val type: String = "office", // office, client, depot
    val address: String = ""
)
