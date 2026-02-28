import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { clearTokens } from '@/lib/authStore';
import { getServerBaseUrl, normalizeUrl, setServerBaseUrl } from '@/lib/serverUrl';
import { useAuth } from '@/contexts/AuthContext';
import { PrimaryButton } from '@/components/PrimaryButton';
import {
  fetchPushStatus,
  registerPushToken,
  updatePushPreferences,
  type PushStatus,
} from '@/lib/pushNotifications';
import { colors, spacing, typography } from '@/constants/theme';

const DEFAULT_URL = 'https://dhtasks.com';

export default function SettingsScreen() {
  const [url, setUrl] = useState(DEFAULT_URL);
  const [saved, setSaved] = useState(false);
  const [pushStatus, setPushStatus] = useState<PushStatus | null>(null);
  const [pushLoading, setPushLoading] = useState(false);
  const [registering, setRegistering] = useState(false);
  const { setHasToken } = useAuth();
  const router = useRouter();

  const loadPushStatus = useCallback(async () => {
    setPushLoading(true);
    try {
      const status = await fetchPushStatus();
      setPushStatus(status ?? null);
    } finally {
      setPushLoading(false);
    }
  }, []);

  useEffect(() => {
    getServerBaseUrl().then(setUrl);
  }, []);

  useEffect(() => {
    loadPushStatus();
  }, [loadPushStatus]);

  const saveUrl = useCallback(async () => {
    const normalized = normalizeUrl(url.trim()) || DEFAULT_URL;
    await setServerBaseUrl(normalized);
    setUrl(normalized);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }, [url]);

  const onRegisterPush = useCallback(async () => {
    setRegistering(true);
    try {
      const result = await registerPushToken();
      if (result.ok) await loadPushStatus();
      else setPushStatus((prev) => (prev ? { ...prev, tokenRegistered: false } : null));
    } finally {
      setRegistering(false);
    }
  }, [loadPushStatus]);

  const onScheduleToggle = useCallback(
    async (value: boolean) => {
      if (!pushStatus) return;
      setPushStatus((prev) => (prev ? { ...prev, scheduleEnabled: value } : null));
      const result = await updatePushPreferences({ scheduleEnabled: value });
      if (!result.ok) loadPushStatus();
    },
    [pushStatus, loadPushStatus]
  );

  const onTaskToggle = useCallback(
    async (value: boolean) => {
      if (!pushStatus) return;
      setPushStatus((prev) => (prev ? { ...prev, tasksEnabled: value } : null));
      const result = await updatePushPreferences({ tasksEnabled: value });
      if (!result.ok) loadPushStatus();
    },
    [pushStatus, loadPushStatus]
  );

  const logout = useCallback(async () => {
    await clearTokens();
    setHasToken(false);
    router.replace('/login');
  }, [setHasToken, router]);

  const permissionLabel =
    pushStatus?.permissionGranted === true
      ? 'Permission granted'
      : pushStatus?.permissionGranted === false
        ? 'Permission denied'
        : 'Permission not determined';
  const tokenLabel = pushStatus?.tokenRegistered ? 'Token registered' : 'Token not registered';

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Settings</Text>

      <Text style={styles.sectionTitle}>Push notifications</Text>
      {pushLoading ? (
        <ActivityIndicator size="small" color={colors.primary} style={styles.pushLoader} />
      ) : (
        <View style={styles.pushSection}>
          <Text style={styles.statusRow}>
            <Text style={styles.label}>Status: </Text>
            <Text style={styles.statusValue}>{permissionLabel}</Text>
          </Text>
          <Text style={styles.statusRow}>
            <Text style={styles.label}>Device: </Text>
            <Text style={styles.statusValue}>{tokenLabel}</Text>
          </Text>
          {pushStatus?.permissionGranted !== true && (
            <PrimaryButton
              title={registering ? 'Requesting…' : 'Enable notifications'}
              onPress={onRegisterPush}
              disabled={registering}
            />
          )}
          {pushStatus?.permissionGranted === true && !pushStatus.tokenRegistered && (
            <PrimaryButton
              title={registering ? 'Registering…' : 'Register device'}
              onPress={onRegisterPush}
              disabled={registering}
            />
          )}
          {pushStatus?.tokenRegistered && (
            <>
              <View style={styles.toggleRow}>
                <Text style={styles.toggleLabel}>Schedule notifications</Text>
                <Switch
                  value={pushStatus.scheduleEnabled}
                  onValueChange={onScheduleToggle}
                  trackColor={{ false: colors.border, true: colors.primary }}
                  thumbColor={colors.surface}
                />
              </View>
              <View style={styles.toggleRow}>
                <Text style={styles.toggleLabel}>Task notifications</Text>
                <Switch
                  value={pushStatus.tasksEnabled}
                  onValueChange={onTaskToggle}
                  trackColor={{ false: colors.border, true: colors.primary }}
                  thumbColor={colors.surface}
                />
              </View>
            </>
          )}
        </View>
      )}

      <Text style={styles.sectionTitle}>Server</Text>
      <Text style={styles.label}>Server URL</Text>
      <TextInput
        style={styles.input}
        value={url}
        onChangeText={setUrl}
        placeholder={DEFAULT_URL}
        placeholderTextColor={colors.textSecondary}
        autoCapitalize="none"
        autoCorrect={false}
      />
      <PrimaryButton title={saved ? 'Saved' : 'Save URL'} onPress={saveUrl} />
      <View style={styles.spacer} />
      <PrimaryButton title="Log out" onPress={logout} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: spacing.lg, backgroundColor: colors.background },
  title: { ...typography.title, color: colors.text, marginBottom: spacing.lg },
  sectionTitle: { ...typography.subtitle, color: colors.text, marginTop: spacing.md, marginBottom: spacing.sm },
  label: { ...typography.label, color: colors.textSecondary, marginBottom: spacing.xs },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: spacing.sm,
    ...typography.body,
    color: colors.text,
    marginBottom: spacing.md,
  },
  spacer: { height: spacing.lg },
  pushSection: { marginBottom: spacing.md },
  pushLoader: { marginVertical: spacing.sm },
  statusRow: { ...typography.body, marginBottom: spacing.xs },
  statusValue: { color: colors.text },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginVertical: spacing.sm,
  },
  toggleLabel: { ...typography.body, color: colors.text },
});
