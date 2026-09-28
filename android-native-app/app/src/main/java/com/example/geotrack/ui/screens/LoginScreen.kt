package com.example.geotrack.ui.screens

import androidx.compose.foundation.background
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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Navigation
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Public
import androidx.compose.material.icons.filled.Sync
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.geotrack.data.repository.AuthRepository
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
import kotlinx.coroutines.launch

@Composable
fun LoginScreen(
    authRepository: AuthRepository,
    onLoginSuccess: () -> Unit,
    modifier: Modifier = Modifier
) {
    val serverHost by authRepository.serverHost.collectAsState()
    var email by remember { mutableStateOf("employee@company.com") }
    var password by remember { mutableStateOf("emp123") }
    var hostInput by remember { mutableStateOf(serverHost) }
    var isLoading by remember { mutableStateOf(false) }
    var isTestingHost by remember { mutableStateOf(false) }
    var hostTestMessage by remember { mutableStateOf<Pair<Boolean, String>?>(null) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()

    Box(
        modifier = modifier
            .fillMaxSize()
            .background(DarkBackground)
            .padding(20.dp),
        contentAlignment = Alignment.Center
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .verticalScroll(rememberScrollState()),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            // App Branding Icon & Title
            Box(
                modifier = Modifier
                    .size(64.dp)
                    .clip(RoundedCornerShape(16.dp))
                    .background(CyanPrimary.copy(alpha = 0.15f)),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    imageVector = Icons.Default.Navigation,
                    contentDescription = "GeoTrack Logo",
                    tint = CyanPrimary,
                    modifier = Modifier.size(36.dp)
                )
            }

            Spacer(modifier = Modifier.height(16.dp))

            Text(
                text = "GeoTrack Field",
                fontSize = 26.sp,
                fontWeight = FontWeight.Bold,
                color = CyanPrimary,
                textAlign = TextAlign.Center
            )
            Text(
                text = "Employee Traveling Companion & Fleet Telemetry",
                fontSize = 13.sp,
                color = TextSecondary,
                textAlign = TextAlign.Center,
                modifier = Modifier.padding(top = 4.dp, bottom = 20.dp)
            )

            // Login Card
            Card(
                colors = CardDefaults.cardColors(containerColor = DarkSurface),
                shape = RoundedCornerShape(20.dp),
                border = CardDefaults.outlinedCardBorder().copy(brush = androidx.compose.ui.graphics.SolidColor(DarkBorder)),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(
                    modifier = Modifier.padding(22.dp),
                    verticalArrangement = Arrangement.spacedBy(14.dp)
                ) {
                    if (errorMessage != null) {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(8.dp))
                                .background(RedDanger.copy(alpha = 0.15f))
                                .padding(10.dp)
                        ) {
                            Text(
                                text = errorMessage ?: "",
                                color = RedDanger,
                                fontSize = 12.sp
                            )
                        }
                    }

                    // Email Input
                    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text(
                            text = "EMAIL ADDRESS",
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Bold,
                            color = TextSecondary
                        )
                        OutlinedTextField(
                            value = email,
                            onValueChange = { email = it; errorMessage = null },
                            leadingIcon = {
                                Icon(Icons.Default.Person, contentDescription = null, tint = TextMuted)
                            },
                            singleLine = true,
                            colors = OutlinedTextFieldDefaults.colors(
                                focusedBorderColor = CyanPrimary,
                                unfocusedBorderColor = DarkBorder,
                                focusedTextColor = TextPrimary,
                                unfocusedTextColor = TextPrimary,
                                focusedContainerColor = DarkSurfaceVariant,
                                unfocusedContainerColor = DarkSurfaceVariant
                            ),
                            shape = RoundedCornerShape(10.dp),
                            modifier = Modifier.fillMaxWidth().testTag("email_input")
                        )
                    }

                    // Password Input
                    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text(
                            text = "PASSWORD",
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Bold,
                            color = TextSecondary
                        )
                        OutlinedTextField(
                            value = password,
                            onValueChange = { password = it; errorMessage = null },
                            visualTransformation = PasswordVisualTransformation(),
                            leadingIcon = {
                                Icon(Icons.Default.Lock, contentDescription = null, tint = TextMuted)
                            },
                            singleLine = true,
                            colors = OutlinedTextFieldDefaults.colors(
                                focusedBorderColor = CyanPrimary,
                                unfocusedBorderColor = DarkBorder,
                                focusedTextColor = TextPrimary,
                                unfocusedTextColor = TextPrimary,
                                focusedContainerColor = DarkSurfaceVariant,
                                unfocusedContainerColor = DarkSurfaceVariant
                            ),
                            shape = RoundedCornerShape(10.dp),
                            modifier = Modifier.fillMaxWidth().testTag("password_input")
                        )
                    }

                    // Server Host Input with Connection Test Button
                    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                text = "CLOUD SERVER HOST",
                                fontSize = 11.sp,
                                fontWeight = FontWeight.Bold,
                                color = TextSecondary
                            )

                            TextButton(
                                onClick = {
                                    val formattedHost = if (!hostInput.startsWith("http://") && !hostInput.startsWith("https://")) {
                                        if (hostInput.startsWith("192.168.") || hostInput.startsWith("10.0.") || hostInput.startsWith("localhost")) {
                                            "http://$hostInput"
                                        } else {
                                            "https://$hostInput"
                                        }
                                    } else hostInput
                                    hostInput = formattedHost
                                    isTestingHost = true
                                    hostTestMessage = null
                                    scope.launch {
                                        val res = authRepository.testServerConnection(formattedHost)
                                        isTestingHost = false
                                        if (res.isSuccess) {
                                            hostTestMessage = Pair(true, res.getOrNull() ?: "Server Reachable")
                                        } else {
                                            hostTestMessage = Pair(false, res.exceptionOrNull()?.message ?: "Connection failed")
                                        }
                                    }
                                },
                                enabled = !isTestingHost
                            ) {
                                if (isTestingHost) {
                                    CircularProgressIndicator(modifier = Modifier.size(12.dp), color = CyanPrimary)
                                } else {
                                    Icon(Icons.Default.Sync, contentDescription = null, modifier = Modifier.size(12.dp), tint = CyanPrimary)
                                    Spacer(modifier = Modifier.width(4.dp))
                                    Text("Test Connection", fontSize = 11.sp, color = CyanPrimary)
                                }
                            }
                        }

                        OutlinedTextField(
                            value = hostInput,
                            onValueChange = {
                                hostInput = it
                                hostTestMessage = null
                            },
                            leadingIcon = {
                                Icon(Icons.Default.Public, contentDescription = null, tint = TextMuted)
                            },
                            singleLine = true,
                            colors = OutlinedTextFieldDefaults.colors(
                                focusedBorderColor = CyanPrimary,
                                unfocusedBorderColor = DarkBorder,
                                focusedTextColor = CyanPrimary,
                                unfocusedTextColor = CyanPrimary,
                                focusedContainerColor = DarkSurfaceVariant,
                                unfocusedContainerColor = DarkSurfaceVariant
                            ),
                            shape = RoundedCornerShape(10.dp),
                            modifier = Modifier.fillMaxWidth().testTag("server_host_input")
                        )

                        if (hostTestMessage != null) {
                            val (success, msg) = hostTestMessage!!
                            Text(
                                text = msg,
                                fontSize = 11.sp,
                                fontWeight = FontWeight.Bold,
                                color = if (success) EmeraldSuccess else RedDanger,
                                modifier = Modifier.padding(top = 2.dp)
                            )
                        }
                    }

                    // Primary Login Button
                    Button(
                        onClick = {
                            if (email.isBlank() || password.isBlank()) {
                                errorMessage = "Please enter both email and password"
                                return@Button
                            }
                            val cleanHost = hostInput.trim().removeSuffix("/")
                            val formattedHost = if (!cleanHost.startsWith("http://") && !cleanHost.startsWith("https://")) {
                                if (cleanHost.startsWith("192.168.") || cleanHost.startsWith("10.0.") || cleanHost.startsWith("localhost")) {
                                    "http://$cleanHost"
                                } else {
                                    "https://$cleanHost"
                                }
                            } else cleanHost

                            isLoading = true
                            authRepository.setServerHost(formattedHost)
                            scope.launch {
                                val result = authRepository.login(email, password)
                                isLoading = false
                                if (result.isSuccess) {
                                    onLoginSuccess()
                                } else {
                                    errorMessage = result.exceptionOrNull()?.message ?: "Login failed"
                                }
                            }
                        },
                        enabled = !isLoading,
                        shape = RoundedCornerShape(12.dp),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = Color(0xFF0284C7),
                            contentColor = Color.White
                        ),
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(50.dp)
                            .testTag("login_button")
                    ) {
                        if (isLoading) {
                            CircularProgressIndicator(
                                color = Color.White,
                                modifier = Modifier.size(22.dp)
                            )
                        } else {
                            Text(
                                text = "Sign In to Start Shift",
                                fontSize = 15.sp,
                                fontWeight = FontWeight.Bold
                            )
                        }
                    }

                    // Quick Demo Credentials Presets
                    Text(
                        text = "Quick Demo Profiles:",
                        fontSize = 12.sp,
                        color = TextMuted,
                        modifier = Modifier.padding(top = 4.dp)
                    )
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        OutlinedButton(
                            onClick = {
                                email = "employee@company.com"
                                password = "emp123"
                            },
                            shape = RoundedCornerShape(8.dp),
                            modifier = Modifier.weight(1f).testTag("demo_employee_button")
                        ) {
                            Text("Field Tech", fontSize = 11.sp, color = CyanPrimary)
                        }
                        OutlinedButton(
                            onClick = {
                                email = "admin@geotrack.com"
                                password = "admin"
                            },
                            shape = RoundedCornerShape(8.dp),
                            modifier = Modifier.weight(1f).testTag("demo_admin_button")
                        ) {
                            Text("Dispatcher", fontSize = 11.sp, color = Color(0xFF8B5CF6))
                        }
                    }
                }
            }

            Spacer(modifier = Modifier.height(18.dp))
            Text(
                text = "Default demo login: employee@company.com / emp123",
                color = TextMuted,
                fontSize = 11.sp,
                textAlign = TextAlign.Center
            )
        }
    }
}
