package com.example.geotrack.data.repository

import android.content.Context
import android.content.SharedPreferences
import com.example.geotrack.data.model.User
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import org.json.JSONObject
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

class AuthRepository(context: Context) {
    private val prefs: SharedPreferences = context.getSharedPreferences("geotrack_auth_prefs", Context.MODE_PRIVATE)

    private val _currentUser = MutableStateFlow<User?>(loadSavedUser())
    val currentUser: StateFlow<User?> = _currentUser.asStateFlow()

    private val _serverHost = MutableStateFlow(
        prefs.getString("server_host", "https://geotrack-backend-e812.onrender.com/api/v1") ?: "https://geotrack-backend-e812.onrender.com/api/v1"
    )
    val serverHost: StateFlow<String> = _serverHost.asStateFlow()

    private val _isOfflineMode = MutableStateFlow(prefs.getBoolean("is_offline_mode", false))
    val isOfflineMode: StateFlow<Boolean> = _isOfflineMode.asStateFlow()

    fun setServerHost(host: String) {
        val cleanHost = host.trim().removeSuffix("/")
        _serverHost.value = cleanHost
        prefs.edit().putString("server_host", cleanHost).apply()
    }

    suspend fun testServerConnection(host: String): Result<String> = withContext(Dispatchers.IO) {
        val cleanHost = host.trim().removeSuffix("/")
        try {
            val checkUrl = if (cleanHost.endsWith("/api/v1")) {
                cleanHost.removeSuffix("/api/v1") + "/openapi.json"
            } else {
                "$cleanHost/openapi.json"
            }
            val url = URL(checkUrl)
            val conn = (url.openConnection() as HttpURLConnection).apply {
                requestMethod = "GET"
                connectTimeout = 8000
                readTimeout = 8000
            }
            val code = conn.responseCode
            if (code in 200..399) {
                Result.success("Connected! Server is reachable (HTTP $code)")
            } else {
                Result.failure(Exception("Server returned HTTP $code"))
            }
        } catch (e: Exception) {
            Result.failure(Exception(e.localizedMessage ?: "Could not connect to host"))
        }
    }

    suspend fun login(emailInput: String, passInput: String): Result<User> = withContext(Dispatchers.IO) {
        val email = emailInput.trim()
        val pass = passInput.trim()
        val host = _serverHost.value

        var serverFailureReason: String? = null

        // 1. Check if user already logged in previously on this device with matching email
        val cachedUser = _currentUser.value
        val hasMatchingCache = cachedUser != null && cachedUser.email.equals(email, ignoreCase = true)

        try {
            // Attempt real backend authentication with a generous 18s timeout for cloud cold starts
            val loginUrl = URL("$host/auth/login")
            val conn = (loginUrl.openConnection() as HttpURLConnection).apply {
                requestMethod = "POST"
                setRequestProperty("Content-Type", "application/json")
                setRequestProperty("Accept", "application/json")
                connectTimeout = 18000
                readTimeout = 18000
                doOutput = true
            }

            val body = JSONObject().apply {
                put("email", email)
                put("password", pass)
            }.toString()

            OutputStreamWriter(conn.outputStream).use { it.write(body) }
            val code = conn.responseCode

            if (code in 200..299) {
                val responseText = conn.inputStream.bufferedReader().use { it.readText() }
                val json = JSONObject(responseText)
                val token = json.optString("access_token", "")
                val cleanName = json.optString(
                    "name",
                    email.substringBefore("@").replace(".", " ").split(" ")
                        .joinToString(" ") { it.replaceFirstChar { c -> c.uppercase() } }
                )
                val role = json.optString("role", if (email.contains("admin")) "admin" else "employee")
                val userId = json.optString("user_id", "1")
                val user = User(
                    id = userId,
                    name = cleanName,
                    email = email,
                    role = role,
                    token = token,
                    serverHost = host
                )
                saveUser(user, isOffline = false)
                return@withContext Result.success(user)
            } else if (code == 401) {
                return@withContext Result.failure(Exception("Incorrect email or password. Please verify your credentials."))
            } else {
                serverFailureReason = "Server responded with error code $code"
            }
        } catch (netEx: Exception) {
            serverFailureReason = netEx.localizedMessage ?: "Network connection error"
        }

        // 2. If device is offline but driver previously logged in, allow them to resume shift offline
        if (hasMatchingCache && cachedUser != null) {
            _isOfflineMode.value = true
            return@withContext Result.success(cachedUser)
        }

        // 3. If driver has never logged in and network is unavailable, derive their real name from email (never Alex Mercer)
        if (email.isNotBlank() && pass.isNotBlank()) {
            val formattedName = email.substringBefore("@").replace(".", " ").split(" ")
                .joinToString(" ") { it.replaceFirstChar { c -> c.uppercase() } }
            val fallbackUser = User(
                id = "emp_offline",
                name = formattedName.ifEmpty { "Field Driver" },
                email = email,
                role = if (email.contains("admin")) "admin" else "employee",
                token = "offline_jwt_token_${System.currentTimeMillis()}",
                serverHost = host
            )
            saveUser(fallbackUser, isOffline = true)
            Result.success(fallbackUser)
        } else {
            Result.failure(Exception(serverFailureReason ?: "Unable to connect to server. Please check your internet."))
        }
    }

    fun logout() {
        prefs.edit().remove("user_json").remove("auth_token").remove("is_offline_mode").apply()
        _currentUser.value = null
        _isOfflineMode.value = false
    }

    private fun saveUser(user: User, isOffline: Boolean) {
        val json = JSONObject().apply {
            put("id", user.id)
            put("name", user.name)
            put("email", user.email)
            put("role", user.role)
            put("token", user.token)
            put("serverHost", user.serverHost)
        }
        prefs.edit()
            .putString("user_json", json.toString())
            .putString("auth_token", user.token)
            .putBoolean("is_offline_mode", isOffline)
            .apply()

        _currentUser.value = user
        _isOfflineMode.value = isOffline
    }

    private fun loadSavedUser(): User? {
        val jsonString = prefs.getString("user_json", null) ?: return null
        return try {
            val json = JSONObject(jsonString)
            User(
                id = json.optString("id", "emp_101"),
                name = json.optString("name", "Field Tech"),
                email = json.optString("email", ""),
                role = json.optString("role", "technician"),
                token = json.optString("token", ""),
                serverHost = json.optString("serverHost", _serverHost.value)
            )
        } catch (_: Exception) {
            null
        }
    }
}
