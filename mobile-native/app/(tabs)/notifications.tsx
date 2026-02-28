import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { PrimaryButton } from '@/components/PrimaryButton';
import {
  fetchPushStatus,
  getExpoPushTokenIfGranted,
  getPermissionStatus,
  registerPushToken,
  requestPermission,
  updatePushPreferences,
  type PushStatus,
} from '@/lib/pushNotifications';
import { colors, spacing, typography } from '@/constants/theme';

function maskToken(token: string): string {
  if (token.length <= 20) return token.slice(0, 6) + '…';
  return token.slice(0, 10) + '…' + token.slice(-6);
}

export default function NotificationsScreen() {
  const [prefs, setPrefs] = useState<PushStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [enabling, setEnabling] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [maskedToken, setMaskedToken] = useState<string | null>(null);
  const [registerOk, setRegisterOk] = useState<boolean | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [status, token] = await Promise.all([
        fetchPushStatus(),
        getPermissionStatus().then((granted) =>
          granted === true ? getExpoPushTokenIfGranted() : Promise.resolve(null)
        ),
      ]);
      setPrefs(status ?? null);
      setMaskedToken(token ? maskToken(token) : null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onEnableNotifications = useCallback(async () => {
    setEnabling(true);
    try {
      const granted = await requestPermission();
      if (granted) {
        const token = await getExpoPushTokenIfGranted();
        setMaskedToken(token ? maskToken(token) : null);
        await load();
      } else {
        await load();
      }
    } finally {
      setEnabling(false);
    }
  }, [load]);

  const onRegisterDevice = useCallback(async () => {
    setRegistering(true);
    setRegisterOk(null);
    try {
      const result = await registerPushToken();
      setRegisterOk(result.ok);
      if (result.ok) {
        const token = await getExpoPushTokenIfGranted();
        setMaskedToken(token ? maskToken(token) : null);
      }
      await load();
    } finally {
      setRegistering(false);
    }
  }, [load]);

  const onScheduleToggle = useCallback(
    async (value: boolean) => {
      if (!prefs) return;
      setPrefs((p) => (p ? { ...p, scheduleEnabled: value } : null));
      const result = await updatePushPreferences({ scheduleEnabled: value });
      if (!result.ok) load();
    },
    [prefs, load]
  );

  const onTasksToggle = useCallback(
    async (value: boolean) => {
      if (!prefs) return;
      setPrefs((p) => (p ? { ...p, tasksEnabled: value } : null));
      const result = await updatePushPreferences({ tasksEnabled: value });
      if (!result.ok) load();
    },
    [prefs, load]
  );

  const permissionStatus =
    prefs?.permissionGranted === true
      ? 'Granted'
      : prefs?.permissionGranted === false
        ? 'Denied'
        : 'Not determined';

  if (loading && !prefs) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="small" color={colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Notifications</Text>

      <View style={styles.section}>
        <PrimaryButton
          title={enabling ? 'Requesting…' : 'Enable Notifications'}
          onPress={onEnableNotifications}
          disabled={enabling}
        />
        <PrimaryButton
          title={registering ? 'Registering…' : 'Register this device'}
          onPress={onRegisterDevice}
          disabled={registering}
          style={styles.buttonSpacer}
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Permission</Text>
        <Text style={styles.value}>{permissionStatus}</Text>
      </View>
      <View style={styles.section}>
        <Text style={styles.label}>Expo push token</Text>
        <Text style={styles.value} numberOfLines={1}>
          {maskedToken ?? '—'}
        </Text>
      </View>
      <View style={styles.section}>
        <Text style={styles.label}>Registered</Text>
        <Text style={styles.value}>
          {registerOk === null ? (prefs?.tokenRegistered ? 'Yes' : 'No') : registerOk ? 'Yes' : 'No'}
        </Text>
      </View>

      <View style={styles.section}>
        <View style={styles.toggleRow}>
          <Text style={styles.toggleLabel}>Schedule notifications</Text>
          <Switch
            value={prefs?.scheduleEnabled ?? true}
            onValueChange={onScheduleToggle}
            trackColor={{ false: colors.border, true: colors.primary }}
            thumbColor={colors.surface}
          />
        </View>
        <View style={styles.toggleRow}>
          <Text style={styles.toggleLabel}>Task notifications</Text>
          <Switch
            value={prefs?.tasksEnabled ?? true}
            onValueChange={onTasksToggle}
            trackColor={{ false: colors.border, true: colors.primary }}
            thumbColor={colors.surface}
          />
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xl },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  title: { ...typography.title, color: colors.text, marginBottom: spacing.lg },
  section: { marginBottom: spacing.lg },
  buttonSpacer: { marginTop: spacing.sm },
  label: { ...typography.label, color: colors.textSecondary, marginBottom: spacing.xs },
  value: { ...typography.body, color: colors.text, marginBottom: spacing.sm },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginVertical: spacing.sm,
  },
  toggleLabel: { ...typography.body, color: colors.text },
});
