package com.example.geotrack

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Build
import com.example.geotrack.data.local.LocationLocalDataSource
import com.example.geotrack.data.repository.AuthRepository
import com.example.geotrack.data.repository.TrackingRepository

class GeoTrackApp : Application() {

    lateinit var localDataSource: LocationLocalDataSource
        private set
    lateinit var authRepository: AuthRepository
        private set
    lateinit var trackingRepository: TrackingRepository
        private set

    companion object {
        const val TRACKING_CHANNEL_ID = "geotrack_tracking_channel"
        lateinit var instance: GeoTrackApp
            private set
    }

    override fun onCreate() {
        super.onCreate()
        instance = this

        localDataSource = LocationLocalDataSource(this)
        authRepository = AuthRepository(this)
        trackingRepository = TrackingRepository(this, localDataSource, authRepository)

        createNotificationChannel()
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                TRACKING_CHANNEL_ID,
                "CM Vehicle Shift Tracking",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Shows persistent foreground status during active work shifts"
                setShowBadge(false)
            }
            val manager = getSystemService(NotificationManager::class.java)
            manager.createNotificationChannel(channel)
        }
    }
}
