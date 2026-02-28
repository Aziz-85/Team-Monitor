import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { WebView } from 'react-native-webview';

const STORAGE_KEY = '@dhahran_team_server_url';
const DEFAULT_SERVER_URL = 'https://dhtasks.com';

function isValidBaseUrl(url: string): boolean {
  const trimmed = url.trim();
  return trimmed.startsWith('http://') || trimmed.startsWith('https://');
}

function normalizeBaseUrl(url: string): string {
  let u = url.trim();
  if (!u) return u;
  if (!u.endsWith('/')) u += '/';
  return u;
}

export default function App() {
  const [initialUrl, setInitialUrl] = useState<string | null>(null);
  const [showSetup, setShowSetup] = useState(false);
  const [inputUrl, setInputUrl] = useState(DEFAULT_SERVER_URL);
  const [inputError, setInputError] = useState('');
  const [loading, setLoading] = useState(true);
  const [webViewLoading, setWebViewLoading] = useState(true);

  const loadStoredUrl = useCallback(async () => {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (stored) setInitialUrl(stored);
    } catch {
      setInitialUrl(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStoredUrl();
  }, [loadStoredUrl]);

  const saveUrl = useCallback(async () => {
    setInputError('');
    if (!isValidBaseUrl(inputUrl)) {
      setInputError('URL must start with http:// or https://');
      return;
    }
    const url = normalizeBaseUrl(inputUrl);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, url);
      setInitialUrl(url);
      setShowSetup(false);
      setInputUrl('');
    } catch (e) {
      setInputError(e instanceof Error ? e.message : 'Failed to save');
    }
  }, [inputUrl]);

  const openSettings = useCallback(() => {
    setInputUrl(initialUrl ?? DEFAULT_SERVER_URL);
    setShowSetup(true);
  }, [initialUrl]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#0f172a" />
        <StatusBar style="auto" />
      </View>
    );
  }

  if (showSetup || !initialUrl) {
    return (
      <View style={styles.setupContainer}>
        <Text style={styles.setupTitle}>Server Setup</Text>
        <Text style={styles.setupHint}>Enter the base URL of your Dhahran Team server</Text>
        <TextInput
          style={[styles.input, inputError ? styles.inputError : null]}
          placeholder="https://dhtasks.com or http://192.168.1.50:3000"
          placeholderTextColor="#94a3b8"
          value={inputUrl}
          onChangeText={(t) => {
            setInputUrl(t);
            setInputError('');
          }}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
        />
        {inputError ? <Text style={styles.errorText}>{inputError}</Text> : null}
        <TouchableOpacity style={styles.primaryButton} onPress={saveUrl}>
          <Text style={styles.primaryButtonText}>Save & Open</Text>
        </TouchableOpacity>
        <StatusBar style="auto" />
      </View>
    );
  }

  return (
    <View style={styles.webViewContainer}>
      <View style={styles.header}>
        <View style={styles.headerSpacer} />
        <TouchableOpacity style={styles.settingsButton} onPress={openSettings} hitSlop={12}>
          <Text style={styles.settingsButtonText}>Settings</Text>
        </TouchableOpacity>
      </View>
      {webViewLoading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#0f172a" />
        </View>
      )}
      <WebView
        source={{ uri: initialUrl }}
        style={styles.webview}
        javaScriptEnabled
        domStorageEnabled
        sharedCookiesEnabled
        onLoadStart={() => setWebViewLoading(true)}
        onLoadEnd={() => setWebViewLoading(false)}
      />
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
  },
  setupContainer: {
    flex: 1,
    backgroundColor: '#f8fafc',
    padding: 24,
    justifyContent: 'center',
  },
  setupTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 8,
  },
  setupHint: {
    fontSize: 14,
    color: '#64748b',
    marginBottom: 20,
  },
  input: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    backgroundColor: '#fff',
    marginBottom: 8,
  },
  inputError: {
    borderColor: '#dc2626',
  },
  errorText: {
    color: '#dc2626',
    fontSize: 13,
    marginBottom: 12,
  },
  primaryButton: {
    backgroundColor: '#0f172a',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 8,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  webViewContainer: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 10,
    paddingTop: 48,
    backgroundColor: '#f8fafc',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  headerSpacer: {
    flex: 1,
  },
  settingsButton: {
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  settingsButtonText: {
    fontSize: 15,
    color: '#0f172a',
    fontWeight: '500',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#f8fafc',
    justifyContent: 'center',
    alignItems: 'center',
  },
  webview: {
    flex: 1,
  },
});
