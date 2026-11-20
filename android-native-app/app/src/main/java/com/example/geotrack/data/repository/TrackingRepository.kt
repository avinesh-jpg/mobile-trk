package com.example.geotrack.data.repository

import android.content.Context
import android.content.SharedPreferences
import com.example.geotrack.data.local.LocationLocalDataSource
import com.example.geotrack.data.model.LocationPing
import com.example.geotrack.data.model.ShiftRecord
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.sin
import kotlin.math.sqrt

class TrackingRepository(
    private val context: Context,
    private val localDataSource: LocationLocalDataSource,
    private val authRepository: AuthRepository
) {
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private val prefs: SharedPreferences = context.getSharedPreferences("geotrack_shift_prefs", Context.MODE_PRIVATE)

    private val todayDateStr: String
        get() = SimpleDateFormat("yyyy-MM-dd", Locale.getDefault()).format(Date())

    private val isShiftActiveToday: Boolean
        get() = prefs.getBoolean("shift_active", false) && (prefs.getString("shift_date", "") == todayDateStr)

    private val _isShiftActive = MutableStateFlow(isShiftActiveToday)
    val isShiftActive: StateFlow<Boolean> = _isShiftActive.asStateFlow()

    private val _isShiftPaused = MutableStateFlow(prefs.getBoolean("shift_paused", false))
    val isShiftPaused: StateFlow<Boolean> = _isShiftPaused.asStateFlow()

    private val _shiftStartTime = MutableStateFlow(prefs.getLong("shift_start_time", 0L))
    val shiftStartTime: StateFlow<Long> = _shiftStartTime.asStateFlow()

    private var accumulatedActiveMs: Long = prefs.getLong("accumulated_active_ms", 0L)
    private var lastResumeTime: Long = prefs.getLong("last_resume_time", prefs.getLong("shift_start_time", 0L))

    private val _currentShiftId = MutableStateFlow(prefs.getString("current_shift_id", "") ?: "")
    val currentShiftId: StateFlow<String> = _currentShiftId.asStateFlow()

    private val _latestPing = MutableStateFlow<LocationPing?>(null)
    val latestPing: StateFlow<LocationPing?> = _latestPing.asStateFlow()

    private val _todayDistanceKm = MutableStateFlow(0.0)
    val todayDistanceKm: StateFlow<Double> = _todayDistanceKm.asStateFlow()

    private val _weekDistanceKm = MutableStateFlow(14.8)
    val weekDistanceKm: StateFlow<Double> = _weekDistanceKm.asStateFlow()

    private val _pendingSyncCount = MutableStateFlow(0)
    val pendingSyncCount: StateFlow<Int> = _pendingSyncCount.asStateFlow()

    private val _totalSavedCount = MutableStateFlow(0)
    val totalSavedCount: StateFlow<Int> = _totalSavedCount.asStateFlow()

    private val _lastCloudSyncStatus = MutableStateFlow("Ready (Waiting for telemetry)")
    val lastCloudSyncStatus: StateFlow<String> = _lastCloudSyncStatus.asStateFlow()

    private val _lastSyncTimestamp = MutableStateFlow(0L)
    val lastSyncTimestamp: StateFlow<Long> = _lastSyncTimestamp.asStateFlow()

    val allSavedPings: Flow<List<LocationPing>> = localDataSource.getAllPings()

    private var previousPing: LocationPing? = null
    private var simLat = 37.7749
    private var simLng = -122.4194

    init {
        // Enforce strict daily shift: invalidate any leftover shift from yesterday or earlier
        if (prefs.getBoolean("shift_active", false) && prefs.getString("shift_date", "") != todayDateStr) {
            prefs.edit()
                .putBoolean("shift_active", false)
                .putBoolean("shift_paused", false)
                .remove("shift_date")
                .remove("shift_start_time")
                .remove("accumulated_active_ms")
                .remove("last_resume_time")
                .remove("current_shift_id")
                .apply()
            _isShiftActive.value = false
            _isShiftPaused.value = false
            _shiftStartTime.value = 0L
            _currentShiftId.value = ""
        }

        scope.launch {
            updateCounts()
            syncOfflineLocations()
            // Periodic background flush every 15 seconds to sync any offline buffered pings
            while (isActive) {
                delay(15000)
                try {
                    val count = localDataSource.getUnsyncedPings().size
                    if (count > 0) {
                        syncOfflineLocations()
                    }
                } catch (_: Exception) {}
            }
        }
    }

    fun getActiveElapsedSeconds(): Long {
        if (!_isShiftActive.value) return 0L
        val now = System.currentTimeMillis()
        val totalMs = if (_isShiftPaused.value) {
            accumulatedActiveMs
        } else {
            val currentInterval = if (lastResumeTime > 0) (now - lastResumeTime).coerceAtLeast(0L) else 0L
            accumulatedActiveMs + currentInterval
        }
        return (totalMs / 1000L).coerceAtLeast(0L)
    }

    suspend fun startShift(): String = withContext(Dispatchers.IO) {
        val shiftId = "shift_${System.currentTimeMillis()}"
        val now = System.currentTimeMillis()
        val user = authRepository.currentUser.value

        accumulatedActiveMs = 0L
        lastResumeTime = now

        prefs.edit()
            .putBoolean("shift_active", true)
            .putString("shift_date", todayDateStr)
            .putBoolean("shift_paused", false)
            .putLong("shift_start_time", now)
            .putLong("accumulated_active_ms", 0L)
            .putLong("last_resume_time", now)
            .putString("current_shift_id", shiftId)
            .apply()

        _isShiftActive.value = true
        _isShiftPaused.value = false
        _shiftStartTime.value = now
        _currentShiftId.value = shiftId
        _todayDistanceKm.value = 0.0

        val record = ShiftRecord(
            id = shiftId,
            userId = user?.id ?: "emp_101",
            employeeName = user?.name ?: "Field Tech",
            startTime = now,
            endTime = null,
            totalMinutes = 0,
            distanceKm = 0.0,
            geofencesVisited = emptyList(),
            isCompleted = false
        )
        localDataSource.insertOrUpdateShift(record)
        updateCounts()
        scope.launch {
            // Wake up Render server asynchronously with cold-start tolerance
            try {
                val host = authRepository.serverHost.value
                val rootUrl = if (host.endsWith("/api/v1")) host.removeSuffix("/api/v1") + "/" else "$host/"
                val conn = (URL(rootUrl).openConnection() as HttpURLConnection).apply {
                    requestMethod = "GET"
                    connectTimeout = 35000
                    readTimeout = 35000
                }
                conn.responseCode
            } catch (_: Exception) {}
            syncOfflineLocations()
        }
        shiftId
    }

    suspend fun pauseShift() = withContext(Dispatchers.IO) {
        if (!_isShiftActive.value || _isShiftPaused.value) return@withContext
        val now = System.currentTimeMillis()
        if (lastResumeTime > 0) {
            accumulatedActiveMs += (now - lastResumeTime).coerceAtLeast(0L)
        }

        prefs.edit()
            .putBoolean("shift_paused", true)
            .putLong("accumulated_active_ms", accumulatedActiveMs)
            .apply()

        _isShiftPaused.value = true
    }

    suspend fun resumeShift() = withContext(Dispatchers.IO) {
        if (!_isShiftActive.value || !_isShiftPaused.value) return@withContext
        val now = System.currentTimeMillis()
        lastResumeTime = now

        prefs.edit()
            .putBoolean("shift_paused", false)
            .putLong("last_resume_time", now)
            .apply()

        _isShiftPaused.value = false
    }

    suspend fun endShift() = withContext(Dispatchers.IO) {
        val shiftId = _currentShiftId.value
        val now = System.currentTimeMillis()
        val totalSecs = getActiveElapsedSeconds()
        val minutes = totalSecs / 60
        val user = authRepository.currentUser.value

        if (shiftId.isNotEmpty()) {
            val record = ShiftRecord(
                id = shiftId,
                userId = user?.id ?: "emp_101",
                employeeName = user?.name ?: "Field Tech",
                startTime = _shiftStartTime.value.let { if (it > 0) it else now },
                endTime = now,
                totalMinutes = minutes,
                distanceKm = _todayDistanceKm.value,
                geofencesVisited = listOf("Enterprise HQ / Office", "Acme Logistics Site"),
                isCompleted = true
            )
            localDataSource.insertOrUpdateShift(record)
        }

        prefs.edit()
            .putBoolean("shift_active", false)
            .remove("shift_date")
            .putBoolean("shift_paused", false)
            .remove("shift_start_time")
            .remove("accumulated_active_ms")
            .remove("last_resume_time")
            .remove("current_shift_id")
            .apply()

        _isShiftActive.value = false
        _isShiftPaused.value = false
        _shiftStartTime.value = 0L
        _currentShiftId.value = ""
        accumulatedActiveMs = 0L
        lastResumeTime = 0L

        // Post stop shift to backend
        try {
            val host = authRepository.serverHost.value
            val url = URL("$host/location/stop-shift")
            val conn = (url.openConnection() as HttpURLConnection).apply {
                requestMethod = "POST"
                setRequestProperty("Content-Type", "application/json")
                if (!user?.token.isNullOrEmpty()) {
                    setRequestProperty("Authorization", "Bearer ${user?.token}")
                }
                connectTimeout = 25000
                readTimeout = 25000
                doOutput = false
            }
            conn.responseCode
        } catch (_: Exception) {}
        updateCounts()
    }

    suspend fun stopShift() = endShift()

    suspend fun recordLocationPing(
        lat: Double,
        lng: Double,
        altitude: Double? = null,
        speedKmh: Double = 0.0,
        heading: Float = 0f,
        accuracy: Float = 10f,
        battery: Int? = 85,
        activity: String = "still",
        isMock: Boolean = false
    ): LocationPing = withContext(Dispatchers.IO) {
        val user = authRepository.currentUser.value
        val now = System.currentTimeMillis()

        // Distance calculation
        var distMeters = 0.0
        val isPaused = _isShiftPaused.value
        if (!isPaused && _isShiftActive.value) {
            previousPing?.let { prev ->
                distMeters = computeDistanceMeters(prev.latitude, prev.longitude, lat, lng)
                if (distMeters > 1.5 && distMeters < 50000.0) {
                    val distKm = distMeters / 1000.0
                    _todayDistanceKm.value = Math.round((_todayDistanceKm.value + distKm) * 100.0) / 100.0
                    _weekDistanceKm.value = Math.round((_weekDistanceKm.value + distKm) * 100.0) / 100.0
                }
            }
        }

        val isPhysicallyMoving = !isPaused && (speedKmh > 1.5 || activity == "walking" || activity == "in_vehicle")
        val cleanActivity = if (isPaused) {
            "paused"
        } else if (isPhysicallyMoving) {
            if (speedKmh > 15.0) "in_vehicle" else "walking"
        } else "still"

        val ping = LocationPing(
            userId = user?.id ?: "emp_101",
            latitude = lat,
            longitude = lng,
            altitude = altitude,
            speed = speedKmh,
            heading = heading,
            accuracy = accuracy,
            batteryLevel = battery,
            isMoving = isPhysicallyMoving,
            activityType = cleanActivity,
            isMock = isMock,
            recordedAt = now,
            isSynced = false
        )

        previousPing = ping
        _latestPing.value = ping

        // 1. Save to local SQLite database
        val insertedId = localDataSource.insertPing(ping)
        val pingWithId = ping.copy(id = insertedId)

        // 2. Stream to cloud backend server
        val (sent, responseDesc) = sendPingToCloud(pingWithId)
        if (sent) {
            localDataSource.markPingsSynced(listOf(insertedId))
            _lastCloudSyncStatus.value = "Synced to Cloud (201 OK) • Ping #$insertedId"
            _lastSyncTimestamp.value = now
            // Auto-flush any queued offline pings since cloud connection is verified active
            scope.launch {
                try {
                    val pending = localDataSource.getUnsyncedPings()
                    if (pending.isNotEmpty()) {
                        syncOfflineLocations()
                    }
                } catch (_: Exception) {}
            }
        } else {
            _lastCloudSyncStatus.value = "Saved in SQLite • Offline queued ($responseDesc)"
        }
        updateCounts()

        pingWithId
    }

    private suspend fun sendPingToCloud(ping: LocationPing): Pair<Boolean, String> = withContext(Dispatchers.IO) {
        val user = authRepository.currentUser.value
        try {
            val host = authRepository.serverHost.value
            val url = URL("$host/location/ping")
            val conn = (url.openConnection() as HttpURLConnection).apply {
                requestMethod = "POST"
                setRequestProperty("Content-Type", "application/json")
                setRequestProperty("Accept", "application/json")
                if (!user?.token.isNullOrEmpty()) {
                    setRequestProperty("Authorization", "Bearer ${user?.token}")
                }
                connectTimeout = 35000
                readTimeout = 35000
                doOutput = true
            }

            val isoDate = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
                timeZone = TimeZone.getTimeZone("UTC")
            }.format(Date(ping.recordedAt))

            val body = JSONObject().apply {
                put("latitude", ping.latitude)
                put("longitude", ping.longitude)
                put("altitude", ping.altitude ?: JSONObject.NULL)
                put("speed", ping.speed)
                put("heading", ping.heading)
                put("accuracy", ping.accuracy)
                put("battery_level", ping.batteryLevel ?: JSONObject.NULL)
                put("is_moving", ping.isMoving)
                put("activity_type", ping.activityType)
                put("is_mock", ping.isMock)
                put("recorded_at", isoDate)
            }.toString()

            OutputStreamWriter(conn.outputStream).use { it.write(body) }
            val code = conn.responseCode
            if (code in 200..299) {
                Pair(true, "HTTP $code")
            } else {
                Pair(false, "HTTP $code")
            }
        } catch (e: Exception) {
            Pair(false, e.localizedMessage ?: "Network error")
        }
    }

    private suspend fun sendBatchToCloud(pings: List<LocationPing>): Boolean = withContext(Dispatchers.IO) {
        val user = authRepository.currentUser.value
        try {
            val host = authRepository.serverHost.value
            val url = URL("$host/location/batch")
            val conn = (url.openConnection() as HttpURLConnection).apply {
                requestMethod = "POST"
                setRequestProperty("Content-Type", "application/json")
                setRequestProperty("Accept", "application/json")
                if (!user?.token.isNullOrEmpty()) {
                    setRequestProperty("Authorization", "Bearer ${user?.token}")
                }
                connectTimeout = 35000
                readTimeout = 35000
                doOutput = true
            }

            val isoFormat = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
                timeZone = TimeZone.getTimeZone("UTC")
            }

            val array = JSONArray()
            for (p in pings) {
                val obj = JSONObject().apply {
                    put("latitude", p.latitude)
                    put("longitude", p.longitude)
                    put("altitude", p.altitude ?: JSONObject.NULL)
                    put("speed", p.speed)
                    put("heading", p.heading)
                    put("accuracy", p.accuracy)
                    put("battery_level", p.batteryLevel ?: JSONObject.NULL)
                    put("is_moving", p.isMoving)
                    put("activity_type", p.activityType)
                    put("is_mock", p.isMock)
                    put("recorded_at", isoFormat.format(Date(p.recordedAt)))
                }
                array.put(obj)
            }

            val body = JSONObject().apply {
                put("locations", array)
            }.toString()

            OutputStreamWriter(conn.outputStream).use { it.write(body) }
            val code = conn.responseCode
            code in 200..299
        } catch (_: Exception) {
            false
        }
    }

    suspend fun syncOfflineLocations(): Int = withContext(Dispatchers.IO) {
        val unsynced = localDataSource.getUnsyncedPings()
        if (unsynced.isEmpty()) return@withContext 0

        var totalSynced = 0
        // Batch upload in chunks of 50 to optimize payload size and server processing
        val chunks = unsynced.chunked(50)
        for (chunk in chunks) {
            val success = sendBatchToCloud(chunk)
            if (success) {
                val ids = chunk.map { it.id }
                localDataSource.markPingsSynced(ids)
                totalSynced += chunk.size
            } else {
                // If cloud connection failed, break and retry on next cycle
                break
            }
        }
        if (totalSynced > 0) {
            _lastCloudSyncStatus.value = "Synced $totalSynced queued pings to Cloud via Batch API"
            _lastSyncTimestamp.value = System.currentTimeMillis()
        }
        updateCounts()
        totalSynced
    }

    private suspend fun updateCounts() {
        val unsynced = localDataSource.getUnsyncedPings()
        _pendingSyncCount.value = unsynced.size
        _totalSavedCount.value = localDataSource.getTotalPingsCount()
    }

    suspend fun sendSimulatedPing(): LocationPing = withContext(Dispatchers.IO) {
        // Increment coordinates along a simulated route to make dashboard map visibly move
        simLat += (Math.random() - 0.48) * 0.003
        simLng += (Math.random() - 0.48) * 0.003
        val speed = if (_isShiftPaused.value) 0.0 else (18.0 + Math.random() * 20.0)
        recordLocationPing(
            lat = simLat,
            lng = simLng,
            altitude = 18.0,
            speedKmh = speed,
            heading = ((simLat * 1000) % 360).toFloat(),
            accuracy = 4.5f,
            battery = 88,
            activity = if (_isShiftPaused.value) "paused" else if (speed > 15.0) "in_vehicle" else "walking",
            isMock = false
        )
    }

    companion object {
        fun computeDistanceMeters(lat1: Double, lon1: Double, lat2: Double, lon2: Double): Double {
            val r = 6371000.0 // Earth radius in meters
            val dLat = Math.toRadians(lat2 - lat1)
            val dLon = Math.toRadians(lon2 - lon1)
            val a = sin(dLat / 2) * sin(dLat / 2) +
                    cos(Math.toRadians(lat1)) * cos(Math.toRadians(lat2)) *
                    sin(dLon / 2) * sin(dLon / 2)
            val c = 2 * atan2(sqrt(a), sqrt(1 - a))
            return r * c
        }
    }
}
