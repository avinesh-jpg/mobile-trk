package com.example.geotrack

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import com.example.geotrack.ui.screens.LoginScreen
import com.example.geotrack.ui.screens.TrackingScreen
import com.example.geotrack.ui.theme.DarkBackground
import com.example.geotrack.ui.theme.GeoTrackTheme

class MainActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        setContent {
            GeoTrackTheme {
                GeoTrackRoot()
            }
        }
    }
}

@Composable
fun GeoTrackRoot() {
    val app = GeoTrackApp.instance
    val currentUser by app.authRepository.currentUser.collectAsState()

    val user = currentUser
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(DarkBackground)
            .safeDrawingPadding()
    ) {
        if (user == null) {
            LoginScreen(
                authRepository = app.authRepository,
                onLoginSuccess = {}
            )
        } else {
            TrackingScreen(
                user = user,
                trackingRepository = app.trackingRepository,
                authRepository = app.authRepository,
                onLogout = {}
            )
        }
    }
}
