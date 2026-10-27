package com.example.geotrack.ui.screens

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.location.LocationManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ExitToApp
import androidx.compose.material.icons.filled.Navigation
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Stop
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import com.example.geotrack.data.model.User
import com.example.geotrack.data.repository.AuthRepository
import com.example.geotrack.data.repository.TrackingRepository
import com.example.geotrack.service.LocationTrackingService
import com.example.geotrack.ui.theme.CyanPrimary
import com.example.geotrack.ui.theme.DarkBackground
import com.example.geotrack.ui.theme.DarkBorder
import com.example.geotrack.ui.theme.DarkSurface
import com.example.geotrack.ui.theme.DarkSurfaceVariant
import com.example.geotrack.ui.theme.EmeraldSuccess
import com.example.geotrack.ui.theme.RedDanger
import com.example.geotrack.ui.theme.TextMuted
import com.example.geotrack.ui.theme.TextPrimary
import com.example.geotrack.ui.theme.TextSecondary
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

@Composable
fun TrackingScreen(
    user: User,
    trackingRepository: TrackingRepository,
    authRepository: AuthRepository,
    onLogout: () -> Unit,
    modifier: Modifier = Modifier
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    val isShiftActive by trackingRepository.isShiftActive.collectAsState()
    val shiftStartTime by trackingRepository.shiftStartTime.collectAsState()

    // Runtime Permission & Hardware GPS States
    var hasLocationPermission by remember { mutableStateOf(hasLocationPermissions(context)) }
    var isGpsHardwareEnabled by remember { mutableStateOf(isDeviceLocationEnabled(context)) }
    var showPermissionRationaleDialog by remember { mutableStateOf(false) }
    var showGpsDisabledDialog by remember { mutableStateOf(false) }
    var startShiftPending by remember { mutableStateOf(false) }

    // Re-verify permission and GPS state when app returns to foreground
    LifecycleEventEffect(Lifecycle.Event.ON_RESUME) {
        hasLocationPermission = hasLocationPermissions(context)
        isGpsHardwareEnabled = isDeviceLocationEnabled(context)
    }

    val locationPermissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestMultiplePermissions()
    ) { permissionsMap ->
        val fineGranted = permissionsMap[Manifest.permission.ACCESS_FINE_LOCATION] == true
        val coarseGranted = permissionsMap[Manifest.permission.ACCESS_COARSE_LOCATION] == true
        hasLocationPermission = fineGranted || coarseGranted
        isGpsHardwareEnabled = isDeviceLocationEnabled(context)

        if (startShiftPending) {
            startShiftPending = false
            if (hasLocationPermission) {
                if (isGpsHardwareEnabled) {
                    scope.launch {
                        trackingRepository.startShift()
                        LocationTrackingService.startService(context)
                    }
                } else {
                    showGpsDisabledDialog = true
                }
            }
        }
    }

    val requestPermissionsAction = {
        val permissions = mutableListOf(
            Manifest.permission.ACCESS_FINE_LOCATION,
            Manifest.permission.ACCESS_COARSE_LOCATION
        )
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            permissions.add(Manifest.permission.POST_NOTIFICATIONS)
        }
        locationPermissionLauncher.launch(permissions.toTypedArray())
    }

    // Elapsed Time Tick
    var elapsedSeconds by remember { mutableLongStateOf(0L) }
    LaunchedEffect(isShiftActive, shiftStartTime) {
        while (isShiftActive) {
            elapsedSeconds = trackingRepository.getActiveElapsedSeconds()
            delay(1000)
        }
        if (!isShiftActive) {
            elapsedSeconds = 0L
        }
    }

    val hours = elapsedSeconds / 3600
    val minutes = (elapsedSeconds % 3600) / 60
    val seconds = elapsedSeconds % 60
    val timeFormatted = String.format("%02d:%02d:%02d", hours, minutes, seconds)

    val activeColor by animateColorAsState(
        targetValue = if (isShiftActive) EmeraldSuccess else Color(0xFF64748B),
        animationSpec = tween(400)
    )

    Column(
        modifier = modifier
            .fillMaxSize()
            .background(DarkBackground)
            .padding(horizontal = 24.dp, vertical = 20.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.SpaceBetween
    ) {
        // Top Minimal Header: Brand & User Info & Logout
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = 8.dp, bottom = 16.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                Box(
                    modifier = Modifier
                        .size(42.dp)
                        .clip(RoundedCornerShape(12.dp))
                        .background(CyanPrimary.copy(alpha = 0.15f)),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        imageVector = Icons.Default.Navigation,
                        contentDescription = "CM Vechicle",
                        tint = CyanPrimary,
                        modifier = Modifier.size(24.dp)
                    )
                }

                Column {
                    Text(
                        text = "CM Vechicle",
                        fontSize = 18.sp,
                        fontWeight = FontWeight.Bold,
                        color = Color.White
                    )
                    Text(
                        text = user.name.ifEmpty { user.email },
                        fontSize = 12.sp,
                        color = TextSecondary
                    )
                }
            }

            IconButton(
                onClick = {
                    if (isShiftActive) {
                        scope.launch {
                            LocationTrackingService.stopService(context)
                            trackingRepository.endShift()
                            authRepository.logout()
                            onLogout()
                        }
                    } else {
                        authRepository.logout()
                        onLogout()
                    }
                },
                modifier = Modifier
                    .size(40.dp)
                    .clip(CircleShape)
                    .background(DarkSurfaceVariant)
            ) {
                Icon(
                    imageVector = Icons.Default.ExitToApp,
                    contentDescription = "Logout",
                    tint = TextMuted,
                    modifier = Modifier.size(20.dp)
                )
            }
        }

        // Center: Status Badge & Shift Duration
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(16.dp),
            modifier = Modifier.padding(vertical = 20.dp)
        ) {
            // Big Circular Pulse / Status Card
            Card(
                colors = CardDefaults.cardColors(containerColor = DarkSurface),
                shape = RoundedCornerShape(24.dp),
                border = CardDefaults.outlinedCardBorder().copy(
                    brush = androidx.compose.ui.graphics.SolidColor(
                        if (isShiftActive) EmeraldSuccess.copy(alpha = 0.5f) else DarkBorder
                    )
                ),
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 8.dp)
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 32.dp, horizontal = 20.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    // Online/Offline Status Dot
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Box(
                            modifier = Modifier
                                .size(12.dp)
                                .clip(CircleShape)
                                .background(activeColor)
                        )
                        Text(
                            text = if (isShiftActive) "ONLINE • ACTIVE ON DUTY" else "OFFLINE • SHIFT NOT STARTED",
                            fontSize = 13.sp,
                            fontWeight = FontWeight.Bold,
                            color = activeColor,
                            letterSpacing = 0.5.sp
                        )
                    }

                    // Large Digital Clock
                    Text(
                        text = if (isShiftActive) timeFormatted else "-- : -- : --",
                        fontSize = 38.sp,
                        fontWeight = FontWeight.Bold,
                        color = if (isShiftActive) Color.White else TextMuted,
                        letterSpacing = 2.sp
                    )

                    Text(
                        text = if (isShiftActive)
                            "Live GPS tracking is active in background"
                        else
                            "Tap the button below when you begin your shift",
                        fontSize = 13.sp,
                        color = TextSecondary,
                        textAlign = TextAlign.Center
                    )
                }
            }
        }

        // Bottom: Single Prominent Action Button
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .padding(bottom = 24.dp)
        ) {
            Button(
                onClick = {
                    if (isShiftActive) {
                        // End Shift
                        scope.launch {
                            LocationTrackingService.stopService(context)
                            trackingRepository.endShift()
                        }
                    } else {
                        // Start Shift
                        if (!hasLocationPermission) {
                            startShiftPending = true
                            showPermissionRationaleDialog = true
                        } else if (!isDeviceLocationEnabled(context)) {
                            showGpsDisabledDialog = true
                        } else {
                            scope.launch {
                                trackingRepository.startShift()
                                LocationTrackingService.startService(context)
                            }
                        }
                    }
                },
                shape = RoundedCornerShape(18.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = if (isShiftActive) RedDanger else Color(0xFF0284C7),
                    contentColor = Color.White
                ),
                elevation = ButtonDefaults.buttonElevation(defaultElevation = 8.dp),
                modifier = Modifier
                    .fillMaxWidth()
                    .height(64.dp)
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    Icon(
                        imageVector = if (isShiftActive) Icons.Default.Stop else Icons.Default.PlayArrow,
                        contentDescription = null,
                        modifier = Modifier.size(28.dp)
                    )
                    Text(
                        text = if (isShiftActive) "END SHIFT" else "START SHIFT",
                        fontSize = 20.sp,
                        fontWeight = FontWeight.Bold,
                        letterSpacing = 1.sp
                    )
                }
            }
        }
    }

    // Permission Dialog
    if (showPermissionRationaleDialog) {
        AlertDialog(
            onDismissRequest = { showPermissionRationaleDialog = false },
            title = {
                Text(text = "Location Permission Required", fontWeight = FontWeight.Bold)
            },
            text = {
                Text(
                    text = "CM Vechicle requires location access to record accurate GPS coordinates and track your vehicle route during your active shift.\n\nPlease grant location permission to start tracking.",
                    color = TextSecondary,
                    fontSize = 14.sp
                )
            },
            confirmButton = {
                Button(
                    onClick = {
                        showPermissionRationaleDialog = false
                        requestPermissionsAction()
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = CyanPrimary)
                ) {
                    Text("Grant Permission", color = Color.White)
                }
            },
            dismissButton = {
                TextButton(onClick = { showPermissionRationaleDialog = false }) {
                    Text("Cancel", color = TextMuted)
                }
            }
        )
    }

    // Hardware GPS Disabled Dialog
    if (showGpsDisabledDialog) {
        AlertDialog(
            onDismissRequest = { showGpsDisabledDialog = false },
            title = {
                Text(text = "Device Location Is Turned Off", fontWeight = FontWeight.Bold)
            },
            text = {
                Text(
                    text = "Please turn on your phone's Location / GPS in Android Settings so CM Vechicle can track your route.",
                    color = TextSecondary,
                    fontSize = 14.sp
                )
            },
            confirmButton = {
                Button(
                    onClick = {
                        showGpsDisabledDialog = false
                        context.startActivity(Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS))
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = CyanPrimary)
                ) {
                    Text("Open Settings", color = Color.White)
                }
            },
            dismissButton = {
                TextButton(onClick = { showGpsDisabledDialog = false }) {
                    Text("Dismiss", color = TextMuted)
                }
            }
        )
    }
}

private fun hasLocationPermissions(context: Context): Boolean {
    val fine = ContextCompat.checkSelfPermission(
        context,
        Manifest.permission.ACCESS_FINE_LOCATION
    ) == PackageManager.PERMISSION_GRANTED
    val coarse = ContextCompat.checkSelfPermission(
        context,
        Manifest.permission.ACCESS_COARSE_LOCATION
    ) == PackageManager.PERMISSION_GRANTED
    return fine || coarse
}

private fun isDeviceLocationEnabled(context: Context): Boolean {
    val locationManager = context.getSystemService(Context.LOCATION_SERVICE) as? LocationManager
    return locationManager?.isProviderEnabled(LocationManager.GPS_PROVIDER) == true ||
            locationManager?.isProviderEnabled(LocationManager.NETWORK_PROVIDER) == true
}
