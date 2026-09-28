package com.example.geotrack.data.local

import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper

class GeoTrackDbHelper(context: Context) : SQLiteOpenHelper(context, DATABASE_NAME, null, DATABASE_VERSION) {

    companion object {
        const val DATABASE_NAME = "geotrack_local.db"
        const val DATABASE_VERSION = 1

        const val TABLE_PINGS = "location_pings"
        const val TABLE_SHIFTS = "shift_records"
        const val TABLE_GEOFENCES = "geofences"
    }

    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL("""
            CREATE TABLE $TABLE_PINGS (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                latitude REAL NOT NULL,
                longitude REAL NOT NULL,
                altitude REAL,
                speed REAL NOT NULL,
                heading REAL NOT NULL,
                accuracy REAL NOT NULL,
                battery_level INTEGER,
                is_moving INTEGER NOT NULL,
                activity_type TEXT NOT NULL,
                is_mock INTEGER NOT NULL,
                recorded_at INTEGER NOT NULL,
                is_synced INTEGER NOT NULL DEFAULT 0
            )
        """.trimIndent())

        db.execSQL("""
            CREATE TABLE $TABLE_SHIFTS (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                employee_name TEXT NOT NULL,
                start_time INTEGER NOT NULL,
                end_time INTEGER,
                total_minutes INTEGER NOT NULL,
                distance_km REAL NOT NULL,
                geofences_visited TEXT,
                is_completed INTEGER NOT NULL
            )
        """.trimIndent())

        db.execSQL("""
            CREATE TABLE $TABLE_GEOFENCES (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                latitude REAL NOT NULL,
                longitude REAL NOT NULL,
                radius_meters REAL NOT NULL,
                type TEXT NOT NULL,
                address TEXT
            )
        """.trimIndent())

        // Insert initial geofences matching web dashboard
        db.execSQL("INSERT INTO $TABLE_GEOFENCES VALUES ('gf_hq', 'Enterprise HQ / Office', 37.7749, -122.4194, 250.0, 'office', '100 Mission St, San Francisco')")
        db.execSQL("INSERT INTO $TABLE_GEOFENCES VALUES ('gf_client_a', 'Acme Logistics Site', 37.7833, -122.4167, 300.0, 'client', '450 Howard St, San Francisco')")
        db.execSQL("INSERT INTO $TABLE_GEOFENCES VALUES ('gf_depot', 'Fleet Distribution Depot', 37.7650, -122.4220, 400.0, 'depot', '800 Potrero Ave, San Francisco')")
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
        db.execSQL("DROP TABLE IF EXISTS $TABLE_PINGS")
        db.execSQL("DROP TABLE IF EXISTS $TABLE_SHIFTS")
        db.execSQL("DROP TABLE IF EXISTS $TABLE_GEOFENCES")
        onCreate(db)
    }
}
