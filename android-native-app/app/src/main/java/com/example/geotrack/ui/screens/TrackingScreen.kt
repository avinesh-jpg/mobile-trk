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
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.BatteryStd
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.CloudDone
import androidx.compose.material.icons.filled.CloudUpload
import androidx.compose.material.icons.filled.DirectionsRun
import androidx.compose.material.icons.filled.ExitToApp
import androidx.compose.material.icons.filled.GpsFixed
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.LocationOff
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Navigation
import androidx.compose.material.icons.filled.OpenInNew
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Send
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Speed
import androidx.compose.material.icons.filled.Storage
import androidx.compose.material.icons.filled.Stop
import androidx.compose.material.icons.filled.Sync
import androidx.compose.material.icons.filled.Timer
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import com.example.geotrack.data.model.LocationPing
import com.example.geotrack.data.model.User
import com.example.geotrack.data.repository.AuthRepository
import com.example.geotrack.data.repository.TrackingRepository
import com.example.geotrack.service.LocationTrackingService
import com.example.geotrack.ui.theme.AmberWarning
import com.example.geotrack.ui.theme.CyanPrimary
import com.example.geotrack.ui.theme.CyanVariant
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
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

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
    val isShiftPaused by trackingRepository.isShiftPaused.collectAsState()
    val shiftStartTime by trackingRepository.shiftStartTime.collectAsState()
    val latestPing by trackingRepository.latestPing.collectAsState()
    val todayDistance by trackingRepository.todayDistanceKm.collectAsState()
    val weekDistance by trackingRepository.weekDistanceKm.collectAsState()
    val pendingSync by trackingRepository.pendingSyncCount.collectAsState()
    val totalSavedCount by trackingRepository.totalSavedCount.collectAsState()
    val lastSyncStatus by trackingRepository.lastCloudSyncStatus.collectAsState()
    val allSavedPings by trackingRepository.allSavedPings.collectAsState(initial = emptyList())
    val serverHost by authRepository.serverHost.collectAsState()

    var statusNoticeMessage by remember { mutableStateOf<String?>(null) }
    var isSimulatingPing by remember { mutableStateOf(false) }

    // Runtime Permission & Hardware GPS States
    var hasLocationPermission by remember {
        mutableStateOf(hasLocationPermissions(context))
    }
    var isPreciseLocation by remember {
        mutableStateOf(
            ContextCompat.checkSelfPermission(
                context,
                Manifest.permission.ACCESS_FINE_LOCATION
            ) == PackageManager.PERMISSION_GRANTED
        )
    }
    var isGpsHardwareEnabled by remember {
        mutableStateOf(isDeviceLocationEnabled(context))
    }

    var showPermissionRationaleDialog by remember { mutableStateOf(false) }
    var showGpsDisabledDialog by remember { mutableStateOf(false) }
    var startShiftPending by remember { mutableStateOf(false) }

    // Re-verify permission and GPS state when app returns to foreground
    LifecycleEventEffect(Lifecycle.Event.ON_RESUME) {
        hasLocationPermission = hasLocationPermissions(context)
        isPreciseLocation = ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.ACCESS_FINE_LOCATION
        ) == PackageManager.PERMISSION_GRANTED
        isGpsHardwareEnabled = isDeviceLocationEnabled(context)
    }

    // Runtime permission launcher
    val locationPermissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestMultiplePermissions()
    ) { permissionsMap ->
        val fineGranted = permissionsMap[Manifest.permission.ACCESS_FINE_LOCATION] == true
        val coarseGranted = permissionsMap[Manifest.permission.ACCESS_COARSE_LOCATION] == true
        hasLocationPermission = fineGranted || coarseGranted
        isPreciseLocation = fineGranted
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
    LaunchedEffect(isShiftActive, isShiftPaused, shiftStartTime) {
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
    val cardBorderColor = if (isShiftActive && !isShiftPaused) CyanPrimary else DarkBorder

    Column(
        modifier = modifier
            .fillMaxSize()
            .background(DarkBackground)
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        // Top Header
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(vertical = 4.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Box(
                    modifier = Modifier
                        .size(44.dp)
                        .clip(CircleShape)
                        .background(CyanPrimary.copy(alpha = 0.2f)),
                    contentAlignment = Alignment.Center
                ) {
                    val initials = user.name.split(" ").mapNotNull { it.firstOrNull()?.toString() }.take(2).joinToString("")
                    Text(
                        text = initials.ifEmpty { "FT" },
                        color = CyanPrimary,
                        fontWeight = FontWeight.Bold,
                        fontSize = 16.sp
                    )
                }
                Column {
                    Text(
                        text = user.name,
                        fontSize = 17.sp,
                        fontWeight = FontWeight.Bold,
                        color = TextPrimary
                    )
                    Text(
                        text = user.email,
                        fontSize = 12.sp,
                        color = TextSecondary
                    )
                }
            }

            OutlinedButton(
                onClick = {
                    LocationTrackingService.stopService(context)
                    authRepository.logout()
                    onLogout()
                },
                shape = RoundedCornerShape(8.dp),
                modifier = Modifier.testTag("logout_button")
            ) {
                Icon(
                    imageVector = Icons.Default.ExitToApp,
                    contentDescription = "Logout",
                    tint = RedDanger,
                    modifier = Modifier.size(16.dp)
                )
                Spacer(modifier = Modifier.width(4.dp))
                Text("Logout", fontSize = 12.sp, color = RedDanger)
            }
        }

        // Location Permission & Hardware Status Banner
        LocationStatusBanner(
            hasPermission = hasLocationPermission,
            isPrecise = isPreciseLocation,
            isGpsEnabled = isGpsHardwareEnabled,
            onRequestPermission = requestPermissionsAction,
            onOpenAppSettings = {
                val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                    data = Uri.fromParts("package", context.packageName, null)
                }
                context.startActivity(intent)
            },
            onOpenLocationSettings = {
                val intent = Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS)
                context.startActivity(intent)
            }
        )

        // Center Shift Status Card
        val cardBgColor = when {
            !isShiftActive -> DarkSurface
            isShiftPaused -> AmberWarning.copy(alpha = 0.08f)
            else -> EmeraldSuccess.copy(alpha = 0.08f)
        }

        Card(
            colors = CardDefaults.cardColors(
                containerColor = cardBgColor
            ),
            shape = RoundedCornerShape(20.dp),
            border = CardDefaults.outlinedCardBorder().copy(
                brush = androidx.compose.ui.graphics.SolidColor(cardBorderColor)
            ),
            modifier = Modifier.fillMaxWidth()
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(22.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                // Online / Paused / Offline Status Indicator Badge
                val badgeBg = when {
                    !isShiftActive -> DarkSurfaceVariant
                    isShiftPaused -> AmberWarning.copy(alpha = 0.18f)
                    else -> EmeraldSuccess.copy(alpha = 0.18f)
                }
                val badgeColor = when {
                    !isShiftActive -> TextSecondary
                    isShiftPaused -> AmberWarning
                    else -> EmeraldSuccess
                }
                val dotColor = when {
                    !isShiftActive -> TextMuted
                    isShiftPaused -> AmberWarning
                    else -> EmeraldSuccess
                }

                val badgeText = when {
                    !isShiftActive -> "OFFLINE / NOT STARTED"
                    isShiftPaused -> "SHIFT PAUSED (ON BREAK)"
                    else -> "ONLINE & TRACKING"
                }

                Surface(
                    shape = RoundedCornerShape(20.dp),
                    color = badgeBg,
                    modifier = Modifier.padding(bottom = 12.dp)
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 14.dp, vertical = 6.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Box(
                            modifier = Modifier
                                .size(10.dp)
                                .clip(CircleShape)
                                .background(dotColor)
                        )
                        Text(
                            text = badgeText,
                            fontSize = 12.sp,
                            fontWeight = FontWeight.ExtraBold,
                            color = badgeColor,
                            letterSpacing = 1.sp
                        )
                    }
                }

                val titleText = when {
                    !isShiftActive -> "Shift Not Started"
                    isShiftPaused -> "Shift Paused"
                    else -> "Shift in Progress"
                }

                Text(
                    text = titleText,
                    fontSize = 22.sp,
                    fontWeight = FontWeight.Bold,
                    color = TextPrimary
                )

                if (isShiftActive) {
                    Row(
                        modifier = Modifier.padding(top = 8.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Default.Timer,
                            contentDescription = null,
                            tint = if (isShiftPaused) AmberWarning else CyanPrimary,
                            modifier = Modifier.size(20.dp)
                        )
                        Text(
                            text = timeFormatted,
                            fontSize = 28.sp,
                            fontWeight = FontWeight.Black,
                            color = if (isShiftPaused) AmberWarning else CyanPrimary,
                            letterSpacing = 1.5.sp
                        )
                    }
                    Text(
                        text = if (isShiftPaused) "Tracking paused for break • Tap Resume Shift to continue" else "GPS satellites streaming telemetry (< 3s real-time stream)",
                        fontSize = 12.sp,
                        color = if (isShiftPaused) AmberWarning else TextSecondary,
                        modifier = Modifier.padding(top = 4.dp),
                        textAlign = TextAlign.Center
                    )
                } else {
                    Text(
                        text = "Tap Start Shift below when you begin duty",
                        fontSize = 13.sp,
                        color = TextSecondary,
                        modifier = Modifier.padding(top = 6.dp)
                    )
                }

                Spacer(modifier = Modifier.height(18.dp))

                // Shift Controls: Start Shift & Pause Shift / Resume Shift
                if (!isShiftActive) {
                    Button(
                        onClick = {
                            if (!hasLocationPermission) {
                                startShiftPending = true
                                requestPermissionsAction()
                            } else if (!isDeviceLocationEnabled(context)) {
                                showGpsDisabledDialog = true
                            } else {
                                scope.launch {
                                    trackingRepository.startShift()
                                    LocationTrackingService.startService(context)
                                }
                            }
                        },
                        shape = RoundedCornerShape(16.dp),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = CyanPrimary,
                            contentColor = Color.Black
                        ),
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(54.dp)
                            .testTag("start_shift_button")
                    ) {
                        Icon(
                            imageVector = Icons.Default.PlayArrow,
                            contentDescription = null,
                            modifier = Modifier.size(22.dp)
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(
                            text = "Start Shift & Stream Location",
                            fontSize = 16.sp,
                            fontWeight = FontWeight.Bold
                        )
                    }
                } else {
                    Column(
                        modifier = Modifier.fillMaxWidth(),
                        verticalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        if (!isShiftPaused) {
                            Button(
                                onClick = {
                                    scope.launch {
                                        trackingRepository.pauseShift()
                                    }
                                },
                                shape = RoundedCornerShape(16.dp),
                                colors = ButtonDefaults.buttonColors(
                                    containerColor = AmberWarning,
                                    contentColor = Color.Black
                                ),
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .height(50.dp)
                                    .testTag("pause_shift_button")
                            ) {
                                Icon(
                                    imageVector = Icons.Default.Pause,
                                    contentDescription = null,
                                    modifier = Modifier.size(22.dp)
                                )
                                Spacer(modifier = Modifier.width(8.dp))
                                Text(
                                    text = "Pause Shift (Break)",
                                    fontSize = 16.sp,
                                    fontWeight = FontWeight.Bold
                                )
                            }
                        } else {
                            Button(
                                onClick = {
                                    if (!hasLocationPermission) {
                                        requestPermissionsAction()
                                    } else if (!isDeviceLocationEnabled(context)) {
                                        showGpsDisabledDialog = true
                                    } else {
                                        scope.launch {
                                            trackingRepository.resumeShift()
                                        }
                                    }
                                },
                                shape = RoundedCornerShape(16.dp),
                                colors = ButtonDefaults.buttonColors(
                                    containerColor = EmeraldSuccess,
                                    contentColor = Color.White
                                ),
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .height(50.dp)
                                    .testTag("resume_shift_button")
                            ) {
                                Icon(
                                    imageVector = Icons.Default.PlayArrow,
                                    contentDescription = null,
                                    modifier = Modifier.size(22.dp)
                                )
                                Spacer(modifier = Modifier.width(8.dp))
                                Text(
                                    text = "Resume Shift",
                                    fontSize = 16.sp,
                                    fontWeight = FontWeight.Bold
                                )
                            }
                        }

                        OutlinedButton(
                            onClick = {
                                scope.launch {
                                    trackingRepository.endShift()
                                    LocationTrackingService.stopService(context)
                                }
                            },
                            shape = RoundedCornerShape(12.dp),
                            colors = ButtonDefaults.outlinedButtonColors(
                                contentColor = RedDanger
                            ),
                            border = androidx.compose.foundation.BorderStroke(1.dp, RedDanger.copy(alpha = 0.5f)),
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(44.dp)
                                .testTag("end_shift_button")
                        ) {
                            Icon(
                                imageVector = Icons.Default.Stop,
                                contentDescription = null,
                                modifier = Modifier.size(18.dp),
                                tint = RedDanger
                            )
                            Spacer(modifier = Modifier.width(6.dp))
                            Text(
                                text = "End Shift & Complete Timesheet",
                                fontSize = 13.sp,
                                fontWeight = FontWeight.SemiBold,
                                color = RedDanger
                            )
                        }
                    }
                }
            }
        }

        // Live Telemetry Metric Cards
        val ping = latestPing
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            TelemetryMetricCard(
                icon = Icons.Default.Speed,
                label = "SPEED",
                value = String.format("%.1f km/h", ping?.speed ?: 0.0),
                subtext = if ((ping?.speed ?: 0.0) > 2.0) "Moving" else "Stationary",
                accentColor = CyanPrimary,
                modifier = Modifier.weight(1f)
            )

            TelemetryMetricCard(
                icon = Icons.Default.DirectionsRun,
                label = "MOTION",
                value = when (ping?.activityType) {
                    "in_vehicle" -> "In Vehicle"
                    "walking" -> "Walking"
                    "paused" -> "On Break"
                    else -> "Stationary"
                },
                subtext = "Sensors Active",
                accentColor = EmeraldSuccess,
                modifier = Modifier.weight(1f)
            )

            TelemetryMetricCard(
                icon = Icons.Default.BatteryStd,
                label = "BATTERY",
                value = "${ping?.batteryLevel ?: 85}%",
                subtext = "Normal Power",
                accentColor = Color(0xFFF59E0B),
                modifier = Modifier.weight(1f)
            )
        }

        // Cloud & Local Storage Status Monitor Card
        Card(
            colors = CardDefaults.cardColors(containerColor = DarkSurface),
            shape = RoundedCornerShape(16.dp),
            border = CardDefaults.outlinedCardBorder().copy(brush = androidx.compose.ui.graphics.SolidColor(DarkBorder)),
            modifier = Modifier.fillMaxWidth().testTag("storage_cloud_monitor_card")
        ) {
            Column(
                modifier = Modifier.padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Default.Storage,
                            contentDescription = null,
                            tint = CyanPrimary,
                            modifier = Modifier.size(18.dp)
                        )
                        Text(
                            text = "Storage & Cloud Sync Monitor",
                            fontWeight = FontWeight.Bold,
                            color = TextPrimary,
                            fontSize = 14.sp
                        )
                    }

                    Surface(
                        shape = RoundedCornerShape(6.dp),
                        color = if (lastSyncStatus.contains("201 OK")) EmeraldSuccess.copy(alpha = 0.15f) else AmberWarning.copy(alpha = 0.15f)
                    ) {
                        Text(
                            text = if (lastSyncStatus.contains("201 OK")) "LIVE SYNC ACTIVE" else "STORAGE READY",
                            fontSize = 10.sp,
                            fontWeight = FontWeight.Bold,
                            color = if (lastSyncStatus.contains("201 OK")) EmeraldSuccess else AmberWarning,
                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                        )
                    }
                }

                HorizontalDivider(color = DarkBorder)

                // Storage stats row
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Column {
                        Text("LOCAL SQLITE STORAGE", fontSize = 10.sp, color = TextMuted, fontWeight = FontWeight.Bold)
                        Text(
                            text = "$totalSavedCount pings saved",
                            fontSize = 14.sp,
                            fontWeight = FontWeight.Bold,
                            color = EmeraldSuccess
                        )
                    }
                    Column(horizontalAlignment = Alignment.End) {
                        Text("PENDING OFFLINE QUEUE", fontSize = 10.sp, color = TextMuted, fontWeight = FontWeight.Bold)
                        Text(
                            text = "$pendingSync pings queued",
                            fontSize = 14.sp,
                            fontWeight = FontWeight.Bold,
                            color = if (pendingSync > 0) AmberWarning else TextSecondary
                        )
                    }
                }

                // Cloud transmission status
                Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Text("LAST TRANSMISSION STATUS", fontSize = 10.sp, color = TextMuted, fontWeight = FontWeight.Bold)
                    Text(
                        text = lastSyncStatus,
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Medium,
                        color = if (lastSyncStatus.contains("201 OK")) EmeraldSuccess else TextPrimary
                    )
                }

                Text(
                    text = "Server Target: $serverHost",
                    fontSize = 11.sp,
                    color = TextMuted
                )

                // Sync and Movement Action Buttons
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    // Send Movement Ping Button (Visibly moves dashboard map!)
                    Button(
                        onClick = {
                            isSimulatingPing = true
                            scope.launch {
                                val p = trackingRepository.sendSimulatedPing()
                                isSimulatingPing = false
                                statusNoticeMessage = "Movement sent! Lat: %.4f, Lng: %.4f • Dashboard map updated!".format(p.latitude, p.longitude)
                            }
                        },
                        enabled = !isSimulatingPing,
                        shape = RoundedCornerShape(10.dp),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = CyanPrimary,
                            contentColor = Color.Black
                        ),
                        modifier = Modifier.weight(1f).testTag("simulate_ping_button")
                    ) {
                        if (isSimulatingPing) {
                            CircularProgressIndicator(color = Color.Black, modifier = Modifier.size(16.dp))
                        } else {
                            Icon(Icons.Default.Send, contentDescription = null, modifier = Modifier.size(16.dp))
                            Spacer(modifier = Modifier.width(6.dp))
                            Text("Send Movement Ping", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                        }
                    }

                    // Sync Now Button
                    OutlinedButton(
                        onClick = {
                            scope.launch {
                                val count = trackingRepository.syncOfflineLocations()
                                statusNoticeMessage = if (count > 0) "Synced $count pending locations to server!" else "All records already synced!"
                            }
                        },
                        shape = RoundedCornerShape(10.dp),
                        modifier = Modifier.testTag("sync_offline_button")
                    ) {
                        Icon(Icons.Default.Sync, contentDescription = null, modifier = Modifier.size(14.dp), tint = CyanPrimary)
                        Spacer(modifier = Modifier.width(4.dp))
                        Text("Sync Queue", fontSize = 12.sp, color = CyanPrimary)
                    }
                }

                // Toast notice if triggered
                if (statusNoticeMessage != null) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(8.dp))
                            .background(EmeraldSuccess.copy(alpha = 0.15f))
                            .padding(10.dp)
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(6.dp)
                        ) {
                            Icon(Icons.Default.Check, contentDescription = null, tint = EmeraldSuccess, modifier = Modifier.size(16.dp))
                            Text(
                                text = statusNoticeMessage ?: "",
                                color = EmeraldSuccess,
                                fontSize = 12.sp,
                                fontWeight = FontWeight.Bold
                            )
                        }
                    }
                }
            }
        }

        // GPS Coordinates & Live Position Card
        Card(
            colors = CardDefaults.cardColors(containerColor = DarkSurface),
            shape = RoundedCornerShape(16.dp),
            border = CardDefaults.outlinedCardBorder().copy(brush = androidx.compose.ui.graphics.SolidColor(DarkBorder)),
            modifier = Modifier.fillMaxWidth()
        ) {
            Column(
                modifier = Modifier.padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Default.GpsFixed,
                            contentDescription = null,
                            tint = CyanPrimary,
                            modifier = Modifier.size(18.dp)
                        )
                        Text("Live Satellite Coordinates", fontWeight = FontWeight.SemiBold, color = TextPrimary, fontSize = 14.sp)
                    }
                    Text(
                        text = "Accuracy: ±${Math.round(ping?.accuracy ?: 8f)}m",
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Bold,
                        color = EmeraldSuccess
                    )
                }

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Column {
                        Text("Latitude", fontSize = 11.sp, color = TextMuted)
                        Text(
                            text = String.format("%.5f° N", ping?.latitude ?: 37.7749),
                            fontSize = 14.sp,
                            fontWeight = FontWeight.Medium,
                            color = TextPrimary
                        )
                    }
                    Column {
                        Text("Longitude", fontSize = 11.sp, color = TextMuted)
                        Text(
                            text = String.format("%.5f° W", ping?.longitude ?: -122.4194),
                            fontSize = 14.sp,
                            fontWeight = FontWeight.Medium,
                            color = TextPrimary
                        )
                    }
                    Column {
                        Text("Compass Heading", fontSize = 11.sp, color = TextMuted)
                        Text(
                            text = "${Math.round(ping?.heading ?: 45f)}°",
                            fontSize = 14.sp,
                            fontWeight = FontWeight.Medium,
                            color = CyanPrimary
                        )
                    }
                }

                if (ping?.isMock == true) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(8.dp))
                            .background(RedDanger.copy(alpha = 0.15f))
                            .padding(8.dp)
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(6.dp)
                        ) {
                            Icon(Icons.Default.Warning, contentDescription = null, tint = RedDanger, modifier = Modifier.size(16.dp))
                            Text("Warning: Mock / Fake GPS Provider active", color = RedDanger, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                        }
                    }
                }
            }
        }

        // Distance Odometers Card
        Card(
            colors = CardDefaults.cardColors(containerColor = DarkSurface),
            shape = RoundedCornerShape(16.dp),
            border = CardDefaults.outlinedCardBorder().copy(brush = androidx.compose.ui.graphics.SolidColor(DarkBorder)),
            modifier = Modifier.fillMaxWidth()
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(18.dp),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Column {
                    Text("TODAY'S TRAVEL", fontSize = 11.sp, color = TextMuted, fontWeight = FontWeight.Bold)
                    Text(
                        text = "$todayDistance km",
                        fontSize = 22.sp,
                        fontWeight = FontWeight.Black,
                        color = EmeraldSuccess
                    )
                }
                Column(horizontalAlignment = Alignment.End) {
                    Text("THIS WEEK (7D)", fontSize = 11.sp, color = TextMuted, fontWeight = FontWeight.Bold)
                    Text(
                        text = "$weekDistance km",
                        fontSize = 22.sp,
                        fontWeight = FontWeight.Black,
                        color = CyanPrimary
                    )
                }
            }
        }

        // Recent Local Storage Records (Direct Proof It Saves to Storage!)
        Card(
            colors = CardDefaults.cardColors(containerColor = DarkSurfaceVariant),
            shape = RoundedCornerShape(16.dp),
            border = CardDefaults.outlinedCardBorder().copy(brush = androidx.compose.ui.graphics.SolidColor(DarkBorder)),
            modifier = Modifier.fillMaxWidth().testTag("saved_pings_history_card")
        ) {
            Column(
                modifier = Modifier.padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Default.History,
                            contentDescription = null,
                            tint = CyanPrimary,
                            modifier = Modifier.size(18.dp)
                        )
                        Text(
                            text = "Recent SQLite Storage Records",
                            fontWeight = FontWeight.Bold,
                            color = TextPrimary,
                            fontSize = 13.sp
                        )
                    }

                    Text(
                        text = "${allSavedPings.size} total in DB",
                        fontSize = 11.sp,
                        color = TextMuted
                    )
                }

                if (allSavedPings.isEmpty()) {
                    Text(
                        text = "No location records in local database yet. Tap 'Start Shift' or 'Send Movement Ping' to write the first GPS record to storage.",
                        fontSize = 12.sp,
                        color = TextSecondary,
                        modifier = Modifier.padding(vertical = 8.dp)
                    )
                } else {
                    val recentFive = allSavedPings.take(5)
                    val timeFormat = remember { SimpleDateFormat("HH:mm:ss", Locale.getDefault()) }

                    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        recentFive.forEach { item ->
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clip(RoundedCornerShape(8.dp))
                                    .background(DarkSurface)
                                    .padding(horizontal = 10.dp, vertical = 8.dp),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Column {
                                    Text(
                                        text = "#${item.id} • Lat: ${String.format("%.4f", item.latitude)}, Lng: ${String.format("%.4f", item.longitude)}",
                                        fontSize = 12.sp,
                                        fontWeight = FontWeight.Bold,
                                        color = TextPrimary
                                    )
                                    Text(
                                        text = "${timeFormat.format(Date(item.recordedAt))} • Speed: ${String.format("%.1f", item.speed)} km/h • ${item.activityType}",
                                        fontSize = 10.sp,
                                        color = TextMuted
                                    )
                                }

                                Surface(
                                    shape = RoundedCornerShape(4.dp),
                                    color = if (item.isSynced) EmeraldSuccess.copy(alpha = 0.15f) else AmberWarning.copy(alpha = 0.15f)
                                ) {
                                    Text(
                                        text = if (item.isSynced) "SYNCED" else "QUEUED",
                                        fontSize = 9.sp,
                                        fontWeight = FontWeight.ExtraBold,
                                        color = if (item.isSynced) EmeraldSuccess else AmberWarning,
                                        modifier = Modifier.padding(horizontal = 6.dp, vertical = 3.dp)
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    // Permission Rationale Dialog
    if (showPermissionRationaleDialog) {
        AlertDialog(
            onDismissRequest = { showPermissionRationaleDialog = false },
            icon = {
                Icon(
                    imageVector = Icons.Default.LocationOn,
                    contentDescription = null,
                    tint = CyanPrimary,
                    modifier = Modifier.size(28.dp)
                )
            },
            title = {
                Text(
                    text = "Location Permission Required",
                    fontWeight = FontWeight.Bold,
                    color = TextPrimary
                )
            },
            text = {
                Text(
                    text = "CM Vechicle requires location access to record accurate GPS coordinates, stream telemetry, and verify shift attendance while on duty.\n\nWithout this permission, the app cannot track your shift. Please grant 'Precise Location' permission to continue.",
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
                    colors = ButtonDefaults.buttonColors(
                        containerColor = CyanPrimary,
                        contentColor = Color.Black
                    ),
                    modifier = Modifier.testTag("dialog_grant_permission_button")
                ) {
                    Text("Grant Permission", fontWeight = FontWeight.Bold)
                }
            },
            dismissButton = {
                Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    TextButton(
                        onClick = {
                            showPermissionRationaleDialog = false
                            val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                                data = Uri.fromParts("package", context.packageName, null)
                            }
                            context.startActivity(intent)
                        }
                    ) {
                        Text("App Settings", color = CyanPrimary)
                    }
                    TextButton(onClick = { showPermissionRationaleDialog = false }) {
                        Text("Cancel", color = TextMuted)
                    }
                }
            },
            containerColor = DarkSurface,
            titleContentColor = TextPrimary,
            textContentColor = TextSecondary
        )
    }

    // GPS Hardware Disabled Dialog
    if (showGpsDisabledDialog) {
        AlertDialog(
            onDismissRequest = { showGpsDisabledDialog = false },
            icon = {
                Icon(
                    imageVector = Icons.Default.LocationOff,
                    contentDescription = null,
                    tint = AmberWarning,
                    modifier = Modifier.size(28.dp)
                )
            },
            title = {
                Text(
                    text = "Turn On Device GPS",
                    fontWeight = FontWeight.Bold,
                    color = TextPrimary
                )
            },
            text = {
                Text(
                    text = "Location services are switched off on this device. To stream GPS coordinates and record distance during your active shift, please turn on Location in Settings.",
                    color = TextSecondary,
                    fontSize = 14.sp
                )
            },
            confirmButton = {
                Button(
                    onClick = {
                        showGpsDisabledDialog = false
                        val intent = Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS)
                        context.startActivity(intent)
                    },
                    colors = ButtonDefaults.buttonColors(
                        containerColor = AmberWarning,
                        contentColor = Color.Black
                    ),
                    modifier = Modifier.testTag("dialog_open_gps_settings_button")
                ) {
                    Text("Open Location Settings", fontWeight = FontWeight.Bold)
                }
            },
            dismissButton = {
                TextButton(onClick = { showGpsDisabledDialog = false }) {
                    Text("Cancel", color = TextMuted)
                }
            },
            containerColor = DarkSurface,
            titleContentColor = TextPrimary,
            textContentColor = TextSecondary
        )
    }
}

@Composable
private fun LocationStatusBanner(
    hasPermission: Boolean,
    isPrecise: Boolean,
    isGpsEnabled: Boolean,
    onRequestPermission: () -> Unit,
    onOpenAppSettings: () -> Unit,
    onOpenLocationSettings: () -> Unit,
    modifier: Modifier = Modifier
) {
    when {
        !hasPermission -> {
            Card(
                colors = CardDefaults.cardColors(containerColor = DarkSurface),
                shape = RoundedCornerShape(14.dp),
                border = CardDefaults.outlinedCardBorder().copy(
                    brush = androidx.compose.ui.graphics.SolidColor(AmberWarning)
                ),
                modifier = modifier.fillMaxWidth().testTag("permission_warning_banner")
            ) {
                Column(
                    modifier = Modifier.padding(14.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Default.LocationOff,
                            contentDescription = null,
                            tint = AmberWarning,
                            modifier = Modifier.size(20.dp)
                        )
                        Text(
                            text = "GPS Location Permission Required",
                            fontSize = 13.sp,
                            fontWeight = FontWeight.Bold,
                            color = TextPrimary
                        )
                    }

                    Text(
                        text = "CM Vechicle requires location permission to record GPS coordinates and track your route while a shift is active.",
                        fontSize = 12.sp,
                        color = TextSecondary
                    )

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Button(
                            onClick = onRequestPermission,
                            colors = ButtonDefaults.buttonColors(
                                containerColor = CyanPrimary,
                                contentColor = Color.Black
                            ),
                            shape = RoundedCornerShape(8.dp),
                            modifier = Modifier.weight(1f).testTag("banner_grant_permission_button")
                        ) {
                            Icon(Icons.Default.LocationOn, contentDescription = null, modifier = Modifier.size(16.dp))
                            Spacer(modifier = Modifier.width(4.dp))
                            Text("Grant Permission", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                        }

                        OutlinedButton(
                            onClick = onOpenAppSettings,
                            shape = RoundedCornerShape(8.dp),
                            modifier = Modifier.testTag("banner_open_settings_button")
                        ) {
                            Icon(Icons.Default.Settings, contentDescription = null, modifier = Modifier.size(14.dp), tint = TextSecondary)
                            Spacer(modifier = Modifier.width(4.dp))
                            Text("Settings", fontSize = 12.sp, color = TextSecondary)
                        }
                    }
                }
            }
        }

        !isGpsEnabled -> {
            Card(
                colors = CardDefaults.cardColors(containerColor = DarkSurface),
                shape = RoundedCornerShape(14.dp),
                border = CardDefaults.outlinedCardBorder().copy(
                    brush = androidx.compose.ui.graphics.SolidColor(AmberWarning)
                ),
                modifier = modifier.fillMaxWidth().testTag("gps_disabled_banner")
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(14.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Row(
                        modifier = Modifier.weight(1f),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Default.LocationOff,
                            contentDescription = null,
                            tint = AmberWarning,
                            modifier = Modifier.size(20.dp)
                        )
                        Column {
                            Text(
                                text = "Device Location (GPS) is OFF",
                                fontSize = 13.sp,
                                fontWeight = FontWeight.Bold,
                                color = TextPrimary
                            )
                            Text(
                                text = "Turn on GPS in device settings to stream coordinates",
                                fontSize = 11.sp,
                                color = TextSecondary
                            )
                        }
                    }

                    Button(
                        onClick = onOpenLocationSettings,
                        colors = ButtonDefaults.buttonColors(
                            containerColor = AmberWarning,
                            contentColor = Color.Black
                        ),
                        shape = RoundedCornerShape(8.dp),
                        modifier = Modifier.testTag("banner_enable_gps_button")
                    ) {
                        Text("Turn On", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                    }
                }
            }
        }

        else -> {
            Surface(
                shape = RoundedCornerShape(12.dp),
                color = DarkSurface,
                border = androidx.compose.foundation.BorderStroke(1.dp, DarkBorder),
                modifier = modifier.fillMaxWidth()
            ) {
                Row(
                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Default.CheckCircle,
                            contentDescription = null,
                            tint = EmeraldSuccess,
                            modifier = Modifier.size(16.dp)
                        )
                        Text(
                            text = if (isPrecise) "GPS Ready (Precise Location Active)" else "GPS Ready (Approximate Location)",
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Medium,
                            color = EmeraldSuccess
                        )
                    }

                    Text(
                        text = "Authorized",
                        fontSize = 10.sp,
                        fontWeight = FontWeight.Bold,
                        color = TextMuted
                    )
                }
            }
        }
    }
}

@Composable
private fun TelemetryMetricCard(
    icon: ImageVector,
    label: String,
    value: String,
    subtext: String,
    accentColor: Color,
    modifier: Modifier = Modifier
) {
    Card(
        colors = CardDefaults.cardColors(containerColor = DarkSurface),
        shape = RoundedCornerShape(14.dp),
        border = CardDefaults.outlinedCardBorder().copy(brush = androidx.compose.ui.graphics.SolidColor(DarkBorder)),
        modifier = modifier
    ) {
        Column(
            modifier = Modifier.padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp)
        ) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                tint = accentColor,
                modifier = Modifier.size(20.dp)
            )
            Text(label, fontSize = 11.sp, color = TextMuted)
            Text(value, fontSize = 15.sp, fontWeight = FontWeight.Bold, color = TextPrimary)
            Text(subtext, fontSize = 10.sp, color = TextSecondary)
        }
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
    val locationManager = context.getSystemService(Context.LOCATION_SERVICE) as? LocationManager ?: return false
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
        locationManager.isLocationEnabled
    } else {
        locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER) ||
                locationManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)
    }
}
