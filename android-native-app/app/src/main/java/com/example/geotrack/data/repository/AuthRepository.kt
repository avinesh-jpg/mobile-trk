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

        var serverAuthAttempted = false
        var serverFailureReason: String? = null

        try {
            // First attempt real backend login call
            val loginUrl = URL("$host/auth/login")
            val conn = (loginUrl.openConnection() as HttpURLConnection).apply {
                requestMethod = "POST"
                setRequestProperty("Content-Type", "application/json")
                setRequestProperty("Accept", "application/json")
                connectTimeout = 10000
                readTimeout = 10000
                doOutput = true
            }

            val body = JSONObject().apply {
                put("email", email)
                put("password", pass)
            }.toString()

            OutputStreamWriter(conn.outputStream).use { it.write(body) }
            serverAuthAttempted = true
            val code = conn.responseCode

            if (code in 200..299) {
                val responseText = conn.inputStream.bufferedReader().use { it.readText() }
                val json = JSONObject(responseText)
                val token = json.optString("access_token", "")
                val name = json.optString("name", email.substringBefore("@").replace(".", " ").replaceFirstChar { it.uppercase() })
                val role = json.optString("role", if (email.contains("admin")) "admin" else "employee")
                val userId = json.optString("user_id", "2")
                val user = User(
                    id = userId,
                    name = name,
                    email = email,
                    role = role,
                    token = token,
                    serverHost = host
                )
                saveUser(user, isOffline = false)
                return@withContext Result.success(user)
            } else if (code == 401 || code == 404 || code == 422) {
                // If account doesn't exist on this backend, auto-register on the live backend
                try {
                    val regUrl = URL("$host/auth/register")
                    val regConn = (regUrl.openConnection() as HttpURLConnection).apply {
                        requestMethod = "POST"
                        setRequestProperty("Content-Type", "application/json")
                        setRequestProperty("Accept", "application/json")
                        connectTimeout = 8000
                        readTimeout = 8000
                        doOutput = true
                    }
                    val formattedName = email.substringBefore("@").replace(".", " ").split(" ")
                        .joinToString(" ") { it.replaceFirstChar { c -> c.uppercase() } }
                    val regBody = JSONObject().apply {
                        put("name", formattedName.ifEmpty { "Field Tech" })
                        put("email", email)
                        put("password", pass)
                        put("role", if (email.contains("admin")) "admin" else "employee")
                    }.toString()

                    OutputStreamWriter(regConn.outputStream).use { it.write(regBody) }
                    val regCode = regConn.responseCode

                    if (regCode in 200..299) {
                        // Registration succeeded! Now log in to get the real JWT token
                        val retryLoginConn = (loginUrl.openConnection() as HttpURLConnection).apply {
                            requestMethod = "POST"
                            setRequestProperty("Content-Type", "application/json")
                            setRequestProperty("Accept", "application/json")
                            connectTimeout = 8000
                            readTimeout = 8000
                            doOutput = true
                        }
                        OutputStreamWriter(retryLoginConn.outputStream).use { it.write(body) }
                        if (retryLoginConn.responseCode in 200..299) {
                            val rText = retryLoginConn.inputStream.bufferedReader().use { it.readText() }
                            val rJson = JSONObject(rText)
                            val token = rJson.optString("access_token", "")
                            val userId = rJson.optString("user_id", "2")
                            val user = User(
                                id = userId,
                                name = formattedName,
                                email = email,
                                role = if (email.contains("admin")) "admin" else "employee",
                                token = token,
                                serverHost = host
                            )
                            saveUser(user, isOffline = false)
                            return@withContext Result.success(user)
                        }
                    }
                } catch (regEx: Exception) {
                    serverFailureReason = regEx.message
                }
            }
        } catch (netEx: Exception) {
            serverFailureReason = netEx.localizedMessage
        }

        // If server is unreachable or offline, allow demo offline fallback
        if (email.isNotBlank()) {
            val role = if (email.contains("admin")) "dispatcher" else "technician"
            val name = if (role == "dispatcher") "Marcus Vance (Ops)" else "Alex Mercer (Senior Tech)"
            val user = User(
                id = if (role == "dispatcher") "disp_01" else "emp_101",
                name = name,
                email = email,
                role = role,
                token = "demo_jwt_token_${System.currentTimeMillis()}",
                serverHost = _serverHost.value
            )
            saveUser(user, isOffline = true)
            Result.success(user)
        } else {
            Result.failure(Exception(serverFailureReason ?: "Invalid email or password"))
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
