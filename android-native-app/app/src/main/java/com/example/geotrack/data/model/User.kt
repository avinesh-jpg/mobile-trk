package com.example.geotrack.data.model

data class User(
    val id: String = "emp_101",
    val name: String = "John Doe",
    val email: String = "employee@company.com",
    val role: String = "technician", // technician, dispatcher, manager
    val token: String = "jwt_mock_token_geotrack",
    val serverHost: String = "https://geotrack-backend-e812.onrender.com/api/v1"
)
