package com.example.geotrack.data.local

import android.content.ContentValues
import android.content.Context
import com.example.geotrack.data.model.Geofence
import com.example.geotrack.data.model.LocationPing
import com.example.geotrack.data.model.ShiftRecord
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.channels.BufferOverflow
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.flowOn
import kotlinx.coroutines.withContext

class LocationLocalDataSource(context: Context) {
    private val dbHelper = GeoTrackDbHelper(context)
    private val changeTrigger = MutableSharedFlow<Unit>(replay = 1, onBufferOverflow = BufferOverflow.DROP_OLDEST)

    init {
        changeTrigger.tryEmit(Unit)
    }

    suspend fun insertPing(ping: LocationPing): Long = withContext(Dispatchers.IO) {
        val db = dbHelper.writableDatabase
        val values = ContentValues().apply {
            put("user_id", ping.userId)
            put("latitude", ping.latitude)
            put("longitude", ping.longitude)
            put("altitude", ping.altitude)
            put("speed", ping.speed)
            put("heading", ping.heading)
            put("accuracy", ping.accuracy)
            put("battery_level", ping.batteryLevel)
            put("is_moving", if (ping.isMoving) 1 else 0)
            put("activity_type", ping.activityType)
            put("is_mock", if (ping.isMock) 1 else 0)
            put("recorded_at", ping.recordedAt)
            put("is_synced", if (ping.isSynced) 1 else 0)
        }
        val id = db.insert(GeoTrackDbHelper.TABLE_PINGS, null, values)
        changeTrigger.tryEmit(Unit)
        id
    }

    suspend fun getUnsyncedPings(): List<LocationPing> = withContext(Dispatchers.IO) {
        val db = dbHelper.readableDatabase
        val cursor = db.query(
            GeoTrackDbHelper.TABLE_PINGS,
            null,
            "is_synced = 0",
            null,
            null,
            null,
            "recorded_at ASC",
            "100"
        )
        val list = mutableListOf<LocationPing>()
        cursor.use {
            while (it.moveToNext()) {
                list.add(
                    LocationPing(
                        id = it.getLong(it.getColumnIndexOrThrow("id")),
                        userId = it.getString(it.getColumnIndexOrThrow("user_id")),
                        latitude = it.getDouble(it.getColumnIndexOrThrow("latitude")),
                        longitude = it.getDouble(it.getColumnIndexOrThrow("longitude")),
                        altitude = if (it.isNull(it.getColumnIndexOrThrow("altitude"))) null else it.getDouble(it.getColumnIndexOrThrow("altitude")),
                        speed = it.getDouble(it.getColumnIndexOrThrow("speed")),
                        heading = it.getFloat(it.getColumnIndexOrThrow("heading")),
                        accuracy = it.getFloat(it.getColumnIndexOrThrow("accuracy")),
                        batteryLevel = if (it.isNull(it.getColumnIndexOrThrow("battery_level"))) null else it.getInt(it.getColumnIndexOrThrow("battery_level")),
                        isMoving = it.getInt(it.getColumnIndexOrThrow("is_moving")) == 1,
                        activityType = it.getString(it.getColumnIndexOrThrow("activity_type")),
                        isMock = it.getInt(it.getColumnIndexOrThrow("is_mock")) == 1,
                        recordedAt = it.getLong(it.getColumnIndexOrThrow("recorded_at")),
                        isSynced = it.getInt(it.getColumnIndexOrThrow("is_synced")) == 1
                    )
                )
            }
        }
        list
    }

    suspend fun getTotalPingsCount(): Int = withContext(Dispatchers.IO) {
        val db = dbHelper.readableDatabase
        val cursor = db.rawQuery("SELECT COUNT(*) FROM ${GeoTrackDbHelper.TABLE_PINGS}", null)
        var count = 0
        cursor.use {
            if (it.moveToFirst()) {
                count = it.getInt(0)
            }
        }
        count
    }

    suspend fun markPingsSynced(ids: List<Long>) = withContext(Dispatchers.IO) {
        if (ids.isEmpty()) return@withContext
        val db = dbHelper.writableDatabase
        db.beginTransaction()
        try {
            for (id in ids) {
                val cv = ContentValues().apply { put("is_synced", 1) }
                db.update(GeoTrackDbHelper.TABLE_PINGS, cv, "id = ?", arrayOf(id.toString()))
            }
            db.setTransactionSuccessful()
        } finally {
            db.endTransaction()
        }
        changeTrigger.tryEmit(Unit)
    }

    fun getAllPings(): Flow<List<LocationPing>> = flow {
        changeTrigger.collect {
            emit(loadAllPingsInternal())
        }
    }.flowOn(Dispatchers.IO)

    private fun loadAllPingsInternal(): List<LocationPing> {
        val db = dbHelper.readableDatabase
        val cursor = db.query(
            GeoTrackDbHelper.TABLE_PINGS,
            null,
            null,
            null,
            null,
            null,
            "recorded_at DESC",
            "500"
        )
        val list = mutableListOf<LocationPing>()
        cursor.use {
            while (it.moveToNext()) {
                list.add(
                    LocationPing(
                        id = it.getLong(it.getColumnIndexOrThrow("id")),
                        userId = it.getString(it.getColumnIndexOrThrow("user_id")),
                        latitude = it.getDouble(it.getColumnIndexOrThrow("latitude")),
                        longitude = it.getDouble(it.getColumnIndexOrThrow("longitude")),
                        altitude = if (it.isNull(it.getColumnIndexOrThrow("altitude"))) null else it.getDouble(it.getColumnIndexOrThrow("altitude")),
                        speed = it.getDouble(it.getColumnIndexOrThrow("speed")),
                        heading = it.getFloat(it.getColumnIndexOrThrow("heading")),
                        accuracy = it.getFloat(it.getColumnIndexOrThrow("accuracy")),
                        batteryLevel = if (it.isNull(it.getColumnIndexOrThrow("battery_level"))) null else it.getInt(it.getColumnIndexOrThrow("battery_level")),
                        isMoving = it.getInt(it.getColumnIndexOrThrow("is_moving")) == 1,
                        activityType = it.getString(it.getColumnIndexOrThrow("activity_type")),
                        isMock = it.getInt(it.getColumnIndexOrThrow("is_mock")) == 1,
                        recordedAt = it.getLong(it.getColumnIndexOrThrow("recorded_at")),
                        isSynced = it.getInt(it.getColumnIndexOrThrow("is_synced")) == 1
                    )
                )
            }
        }
        return list
    }

    suspend fun purgePingsOlderThanDays(days: Int): Int = withContext(Dispatchers.IO) {
        val cutoff = System.currentTimeMillis() - (days * 24L * 60 * 60 * 1000)
        val db = dbHelper.writableDatabase
        val count = db.delete(GeoTrackDbHelper.TABLE_PINGS, "recorded_at < ?", arrayOf(cutoff.toString()))
        changeTrigger.tryEmit(Unit)
        count
    }

    suspend fun insertOrUpdateShift(shift: ShiftRecord) = withContext(Dispatchers.IO) {
        val db = dbHelper.writableDatabase
        val cv = ContentValues().apply {
            put("id", shift.id)
            put("user_id", shift.userId)
            put("employee_name", shift.employeeName)
            put("start_time", shift.startTime)
            put("end_time", shift.endTime)
            put("total_minutes", shift.totalMinutes)
            put("distance_km", shift.distanceKm)
            put("geofences_visited", shift.geofencesVisited.joinToString(","))
            put("is_completed", if (shift.isCompleted) 1 else 0)
        }
        db.insertWithOnConflict(GeoTrackDbHelper.TABLE_SHIFTS, null, cv, android.database.sqlite.SQLiteDatabase.CONFLICT_REPLACE)
        changeTrigger.tryEmit(Unit)
    }

    fun getAllShifts(): Flow<List<ShiftRecord>> = flow {
        changeTrigger.collect {
            emit(loadAllShiftsInternal())
        }
    }.flowOn(Dispatchers.IO)

    private fun loadAllShiftsInternal(): List<ShiftRecord> {
        val db = dbHelper.readableDatabase
        val cursor = db.query(
            GeoTrackDbHelper.TABLE_SHIFTS,
            null,
            null,
            null,
            null,
            null,
            "start_time DESC",
            "100"
        )
        val list = mutableListOf<ShiftRecord>()
        cursor.use {
            while (it.moveToNext()) {
                val geofencesRaw = it.getString(it.getColumnIndexOrThrow("geofences_visited")) ?: ""
                val gfList = if (geofencesRaw.isEmpty()) emptyList() else geofencesRaw.split(",")
                list.add(
                    ShiftRecord(
                        id = it.getString(it.getColumnIndexOrThrow("id")),
                        userId = it.getString(it.getColumnIndexOrThrow("user_id")),
                        employeeName = it.getString(it.getColumnIndexOrThrow("employee_name")),
                        startTime = it.getLong(it.getColumnIndexOrThrow("start_time")),
                        endTime = if (it.isNull(it.getColumnIndexOrThrow("end_time"))) null else it.getLong(it.getColumnIndexOrThrow("end_time")),
                        totalMinutes = it.getLong(it.getColumnIndexOrThrow("total_minutes")),
                        distanceKm = it.getDouble(it.getColumnIndexOrThrow("distance_km")),
                        geofencesVisited = gfList,
                        isCompleted = it.getInt(it.getColumnIndexOrThrow("is_completed")) == 1
                    )
                )
            }
        }
        return list
    }

    suspend fun insertGeofence(gf: Geofence) = withContext(Dispatchers.IO) {
        val db = dbHelper.writableDatabase
        val cv = ContentValues().apply {
            put("id", gf.id)
            put("name", gf.name)
            put("latitude", gf.latitude)
            put("longitude", gf.longitude)
            put("radius_meters", gf.radiusMeters)
            put("type", gf.type)
            put("address", gf.address)
        }
        db.insertWithOnConflict(GeoTrackDbHelper.TABLE_GEOFENCES, null, cv, android.database.sqlite.SQLiteDatabase.CONFLICT_REPLACE)
        changeTrigger.tryEmit(Unit)
    }

    suspend fun deleteGeofence(id: String) = withContext(Dispatchers.IO) {
        val db = dbHelper.writableDatabase
        db.delete(GeoTrackDbHelper.TABLE_GEOFENCES, "id = ?", arrayOf(id))
        changeTrigger.tryEmit(Unit)
    }

    fun getAllGeofences(): Flow<List<Geofence>> = flow {
        changeTrigger.collect {
            emit(loadAllGeofencesInternal())
        }
    }.flowOn(Dispatchers.IO)

    private fun loadAllGeofencesInternal(): List<Geofence> {
        val db = dbHelper.readableDatabase
        val cursor = db.query(
            GeoTrackDbHelper.TABLE_GEOFENCES,
            null,
            null,
            null,
            null,
            null,
            "name ASC"
        )
        val list = mutableListOf<Geofence>()
        cursor.use {
            while (it.moveToNext()) {
                list.add(
                    Geofence(
                        id = it.getString(it.getColumnIndexOrThrow("id")),
                        name = it.getString(it.getColumnIndexOrThrow("name")),
                        latitude = it.getDouble(it.getColumnIndexOrThrow("latitude")),
                        longitude = it.getDouble(it.getColumnIndexOrThrow("longitude")),
                        radiusMeters = it.getDouble(it.getColumnIndexOrThrow("radius_meters")),
                        type = it.getString(it.getColumnIndexOrThrow("type")),
                        address = it.getString(it.getColumnIndexOrThrow("address")) ?: ""
                    )
                )
            }
        }
        return list
    }
}
