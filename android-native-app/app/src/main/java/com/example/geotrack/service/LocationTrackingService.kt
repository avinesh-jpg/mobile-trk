package com.example.geotrack.service

import android.annotation.SuppressLint
import android.app.Notification
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.BatteryManager
import android.os.Build
import android.os.Bundle
import android.os.IBinder
import android.os.PowerManager
import androidx.core.app.NotificationCompat
import com.example.geotrack.GeoTrackApp
import com.example.geotrack.MainActivity
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import java.util.Calendar
import kotlin.math.abs
import kotlin.math.sqrt

class LocationTrackingService : Service(), LocationListener, SensorEventListener {

    private val serviceScope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private var locationManager: LocationManager? = null
    private var sensorManager: SensorManager? = null
    private var accelerometer: Sensor? = null

    private var currentActivityType: String = "still"
    private var lastSensorTimestamp: Long = 0
    private var lastKnownLocation: Location? = null
    private var lastRecordedPingTime: Long = 0L
    private var heartbeatJob: Job? = null
    private var wakeLock: PowerManager.WakeLock? = null

    companion object {
        const val ACTION_START = "ACTION_START_TRACKING"
        const val ACTION_STOP = "ACTION_STOP_TRACKING"
        const val NOTIFICATION_ID = 4041

        fun startService(context: Context) {
            val intent = Intent(context, LocationTrackingService::class.java).apply {
                action = ACTION_START
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }

        fun stopService(context: Context) {
            val intent = Intent(context, LocationTrackingService::class.java).apply {
                action = ACTION_STOP
            }
            context.startService(intent)
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        locationManager = getSystemService(Context.LOCATION_SERVICE) as LocationManager
        sensorManager = getSystemService(Context.SENSOR_SERVICE) as SensorManager
        accelerometer = sensorManager?.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_START -> {
                if (GeoTrackApp.instance.trackingRepository.isShiftActive.value) {
                    startTrackingService()
                } else {
                    stopTrackingService()
                }
            }
            ACTION_STOP -> stopTrackingService()
            else -> {
                // System restarted service after OS killed it under battery/memory pressure (START_STICKY)
                if (GeoTrackApp.instance.trackingRepository.isShiftActive.value) {
                    startTrackingService()
                } else {
                    stopTrackingService()
                }
            }
        }
        return START_STICKY
    }

    private fun acquireWakeLock() {
        try {
            if (wakeLock == null) {
                val powerManager = getSystemService(Context.POWER_SERVICE) as? PowerManager
                wakeLock = powerManager?.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "GeoTrack::LocationTrackingWakeLock")?.apply {
                    setReferenceCounted(false)
                }
            }
            if (wakeLock?.isHeld == false) {
                wakeLock?.acquire(14 * 60 * 60 * 1000L) // 14 hours max duty safety timeout
            }
        } catch (_: Exception) {}
    }

    private fun releaseWakeLock() {
        try {
            if (wakeLock?.isHeld == true) {
                wakeLock?.release()
            }
            wakeLock = null
        } catch (_: Exception) {}
    }

    private fun startTrackingService() {
        acquireWakeLock()
        val notification = buildForegroundNotification("CM Vehicle Active", "Live vehicle tracking active (4s high-precision stream)")
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION)
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }

        registerSensors()
        registerLocationUpdates()
        startPeriodicHeartbeat()
    }

    private fun stopTrackingService() {
        releaseWakeLock()
        heartbeatJob?.cancel()
        unregisterSensors()
        unregisterLocationUpdates()
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    private fun buildForegroundNotification(title: String, content: String): Notification {
        val pendingIntent = PendingIntent.getActivity(
            this,
            0,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )

        return NotificationCompat.Builder(this, GeoTrackApp.TRACKING_CHANNEL_ID)
            .setContentTitle(title)
            .setContentText(content)
            .setSmallIcon(android.R.drawable.ic_menu_mylocation)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setColor(0xFF0284C7.toInt())
            .build()
    }

    @SuppressLint("MissingPermission")
    private fun registerLocationUpdates() {
        try {
            locationManager?.let { lm ->
                // Adaptive 4-second interval for bike & bus high-precision tracking
                if (lm.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
                    lm.requestLocationUpdates(
                        LocationManager.GPS_PROVIDER,
                        4000L,
                        0f,
                        this
                    )
                }
                if (lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) {
                    lm.requestLocationUpdates(
                        LocationManager.NETWORK_PROVIDER,
                        8000L,
                        0f,
                        this
                    )
                }

                // Immediately capture and emit last known position
                val lastGps = try { if (lm.isProviderEnabled(LocationManager.GPS_PROVIDER)) lm.getLastKnownLocation(LocationManager.GPS_PROVIDER) else null } catch (_: Exception) { null }
                val lastNet = try { if (lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) lm.getLastKnownLocation(LocationManager.NETWORK_PROVIDER) else null } catch (_: Exception) { null }
                val best = lastGps ?: lastNet
                best?.let {
                    lastKnownLocation = it
                    onLocationChanged(it)
                }
            }
        } catch (_: Exception) {}
    }

    private fun startPeriodicHeartbeat() {
        heartbeatJob?.cancel()
        heartbeatJob = serviceScope.launch {
            while (isActive) {
                delay(12000)
                val cal = Calendar.getInstance()
                val hour = cal.get(Calendar.HOUR_OF_DAY)
                if (hour >= 20 || hour < 6) {
                    try {
                        GeoTrackApp.instance.trackingRepository.endShift()
                    } catch (_: Exception) {}
                    stopTrackingService()
                    break
                }

                val now = System.currentTimeMillis()
                // If no update from OS listener in 12s, emit heartbeat with best available position
                if (now - lastRecordedPingTime >= 10000) {
                    val loc = lastKnownLocation ?: fetchCurrentLocation()
                    if (loc != null) {
                        dispatchLocationPing(loc)
                    }
                }
            }
        }
    }

    @SuppressLint("MissingPermission")
    private fun fetchCurrentLocation(): Location? {
        val lm = locationManager ?: return null
        return try {
            val gps = if (lm.isProviderEnabled(LocationManager.GPS_PROVIDER)) lm.getLastKnownLocation(LocationManager.GPS_PROVIDER) else null
            val net = if (lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) lm.getLastKnownLocation(LocationManager.NETWORK_PROVIDER) else null
            gps ?: net
        } catch (_: Exception) { null }
    }

    private fun unregisterLocationUpdates() {
        try {
            locationManager?.removeUpdates(this)
        } catch (_: Exception) {}
    }

    private fun registerSensors() {
        accelerometer?.let {
            sensorManager?.registerListener(this, it, SensorManager.SENSOR_DELAY_NORMAL)
        }
    }

    private fun unregisterSensors() {
        sensorManager?.unregisterListener(this)
    }

    override fun onLocationChanged(location: Location) {
        lastKnownLocation = location
        dispatchLocationPing(location)
    }

    private fun dispatchLocationPing(location: Location) {
        if (!GeoTrackApp.instance.trackingRepository.isShiftActive.value) {
            stopTrackingService()
            return
        }

        val cal = Calendar.getInstance()
        val hour = cal.get(Calendar.HOUR_OF_DAY)
        if (hour >= 20 || hour < 6) {
            serviceScope.launch {
                try {
                    GeoTrackApp.instance.trackingRepository.endShift()
                } catch (_: Exception) {}
                stopTrackingService()
            }
            return
        }

        val speedKmh = if (location.hasSpeed()) (location.speed * 3.6) else 0.0
        val isMoving = speedKmh > 2.0 || currentActivityType == "walking"
        val cleanActivity = when {
            speedKmh > 12.0 -> "in_vehicle"
            isMoving -> "walking"
            else -> "still"
        }

        // Adaptive throttle:
        // While moving on bike/bus/walking, stream every fix (4 seconds)
        // While stationary at desk, throttle heartbeat to once every 60 seconds
        val now = System.currentTimeMillis()
        val minIntervalMs = if (isMoving) 3800L else 60000L
        if (now - lastRecordedPingTime < minIntervalMs) return
        lastRecordedPingTime = now

        val batteryPct = getBatteryPercentage()
        val isMock = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            location.isMock
        } else {
            @Suppress("DEPRECATION")
            location.isFromMockProvider
        }

        serviceScope.launch {
            GeoTrackApp.instance.trackingRepository.recordLocationPing(
                lat = location.latitude,
                lng = location.longitude,
                altitude = if (location.hasAltitude()) location.altitude else null,
                speedKmh = speedKmh,
                heading = if (location.hasBearing()) location.bearing else 0f,
                accuracy = if (location.hasAccuracy()) location.accuracy else 8f,
                battery = batteryPct,
                activity = cleanActivity,
                isMock = isMock
            )
        }
    }

    override fun onSensorChanged(event: SensorEvent?) {
        if (event == null) return
        val now = System.currentTimeMillis()
        if (now - lastSensorTimestamp < 3000) return
        lastSensorTimestamp = now

        val x = event.values[0]
        val y = event.values[1]
        val z = event.values[2]
        val mag = sqrt((x * x + y * y + z * z).toDouble())
        val delta = abs(mag - 9.8)

        currentActivityType = if (delta > 2.0) {
            "walking"
        } else {
            "still"
        }
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}
    override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) {}
    override fun onProviderEnabled(provider: String) {}
    override fun onProviderDisabled(provider: String) {}

    private fun getBatteryPercentage(): Int? {
        val batteryIntent = registerReceiver(null, android.content.IntentFilter(Intent.ACTION_BATTERY_CHANGED))
        return batteryIntent?.let {
            val level = it.getIntExtra(BatteryManager.EXTRA_LEVEL, -1)
            val scale = it.getIntExtra(BatteryManager.EXTRA_SCALE, -1)
            if (level >= 0 && scale > 0) {
                (level * 100) / scale
            } else null
        }
    }

    override fun onDestroy() {
        releaseWakeLock()
        heartbeatJob?.cancel()
        unregisterSensors()
        unregisterLocationUpdates()
        serviceScope.cancel()
        super.onDestroy()
    }
}
