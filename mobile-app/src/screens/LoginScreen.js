import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from '../services/api';
import { DEFAULT_API_HOST } from '../config';

export default function LoginScreen({ onLoginSuccess }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Required', 'Please enter email and password');
      return;
    }

    setLoading(true);
    let lastError = null;

    // Multi-attempt login with automated cloud-sleep recovery
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        await AsyncStorage.setItem('server_host', DEFAULT_API_HOST);
        const res = await api.post('/auth/login', { email: email.trim(), password: password.trim() });
        
        await AsyncStorage.setItem('auth_token', res.data.access_token);
        await AsyncStorage.setItem('user_profile', JSON.stringify(res.data));
        onLoginSuccess(res.data);
        return;
      } catch (err) {
        lastError = err;
        // If 401 (wrong password or email), stop immediately
        if (err.response && err.response.status === 401) {
          break;
        }
        // Cold-start wakeup recovery: server was triggered on attempt 1; wait 2.5s and retry attempt 2
        if (attempt === 1) {
          await new Promise((resolve) => setTimeout(resolve, 2500));
        }
      }
    }

    setLoading(false);
    const msg = lastError?.response?.data?.detail || 'Unable to connect to server. Please check your credentials.';
    Alert.alert('Login Failed', msg);
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <View style={styles.card}>
        <View style={styles.header}>
          <Text style={styles.title}>CM Vechicle</Text>
          <Text style={styles.subtitle}>Fleet Vehicle Tracking</Text>
        </View>

        <View style={styles.form}>
          <Text style={styles.label}>Email Address</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            placeholder="Enter your email"
            placeholderTextColor="#64748b"
          />

          <Text style={styles.label}>Password</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            placeholder="Enter your password"
            placeholderTextColor="#64748b"
          />

          <TouchableOpacity
            style={styles.button}
            onPress={handleLogin}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.buttonText}>Sign In</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#090d16',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    backgroundColor: '#111827',
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: '#1f2937',
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#06b6d4',
  },
  subtitle: {
    fontSize: 13,
    color: '#94a3b8',
    marginTop: 4,
  },
  form: {
    gap: 12,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    color: '#94a3b8',
    textTransform: 'uppercase',
  },
  input: {
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: '#f8fafc',
    fontSize: 14,
  },
  inputServer: {
    fontSize: 12,
    color: '#38bdf8',
  },
  button: {
    backgroundColor: '#0284c7',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 12,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: 'bold',
  },
  footerNote: {
    textAlign: 'center',
    color: '#64748b',
    fontSize: 11,
    marginTop: 20,
  },
});
