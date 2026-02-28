import Constants from 'expo-constants';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { Card } from '@/components/Card';
import { PrimaryButton } from '@/components/PrimaryButton';
import {
  fetchPushStatus,
  getExpoPushTokenIfGranted,
  getPermissionStatus,
  registerPushToken,
  requestPermission,
  sendTestPush,
  updatePushPreferences,
  type PushStatus,
} from '@/lib/pushNotifications';
import { colors, spacing, typography } from '@/constants/theme';

const DEBOUNCE_MS = 300;

function maskToken(token: string): string {
  if (token.length <= 20) return token.slice(0, 6) + '...';
  return token.slice(0, 10) + '...' + token.slice(-6);
}

function permissionLabel(granted: boolean | null): string {
  if (granted === true) return 'Granted';
  if (granted === false) return 'Denied';
  return 'Not asked';
}

export default function ControlScreen() {
  const [prefs, setPrefs] = useState<PushStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [permissionStatus, setPermissionStatus] = useState<boolean | null>(null);
  const [maskedToken, setMaskedToken] = useState<string | null>(null);
  const [registerResult, setRegisterResult] = useState<'ok' | 'error' | null>(null);
  const [registerError, setRegisterError] = useState<string | null>(null);
  const [enabling, setEnabling] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testSent, setTestSent] = useState<number | null>(null);
  const [testReason, setTestReason] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [status, perm, token] = await Promise.all([
        fetchPushStatus(),
        getPermissionStatus(),
        getPermissionStatus().then((p) =>
          p === true ? getExpoPushTokenIfGranted() : Promise.resolve(null)
        ),
      ]);
      setPrefs(status ?? null);
      setPermissionStatus(perm ?? null);
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
      setPermissionStatus(granted ? true : false);
      if (granted) {
        const token = await getExpoPushTokenIfGranted();
        setMaskedToken(token ? maskToken(token) : null);
      }
      await load();
    } finally {
      setEnabling(false);
    }
  }, [load]);

  const onRegisterDevice = useCallback(async () => {
    setRegistering(true);
    setRegisterResult(null);
    setRegisterError(null);
    try {
      const appVersion =
        Constants.expoConfig?.version ?? Constants.manifest?.version ?? undefined;
      const result = await registerPushToken({
        deviceHint: 'mobile-native',
        appVersion,
      });
      if (result.ok) {
        setRegisterResult('ok');
        const token = await getExpoPushTokenIfGranted();
        setMaskedToken(token ? maskToken(token) : null);
      } else {
        setRegisterResult('error');
        setRegisterError(result.error ?? 'Failed');
      }
      await load();
    } finally {
      setRegistering(false);
    }
  }, [load]);

  const persistPrefs = useCallback(
    (next: Partial<Pick<PushStatus, 'scheduleEnabled' | 'tasksEnabled'>>) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(async () => {
        debounceRef.current = null;
        await updatePushPreferences(next);
      }, DEBOUNCE_MS);
    },
    []
  );

  const onScheduleToggle = useCallback(
    (value: boolean) => {
      setPrefs((p) => (p ? { ...p, scheduleEnabled: value } : null));
      persistPrefs({ scheduleEnabled: value });
    },
    [persistPrefs]
  );

  const onTasksToggle = useCallback(
    (value: boolean) => {
      setPrefs((p) => (p ? { ...p, tasksEnabled: value } : null));
      persistPrefs({ tasksEnabled: value });
    },
    [persistPrefs]
  );

  const onSendTest = useCallback(async () => {
    setTesting(true);
    setTestSent(null);
    setTestReason(null);
    try {
      const result = await sendTestPush();
      if (result.ok && result.sent != null) {
        setTestSent(result.sent);
      } else {
        setTestSent(0);
        setTestReason(result.reason ?? result.error ?? null);
      }
    } finally {
      setTesting(false);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  if (loading && !prefs) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="small" color={colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Control</Text>

      <Card style={styles.card}>
        <Text style={styles.sectionTitle}>Permission</Text>
        <PrimaryButton
          title={enabling ? 'Requesting…' : 'Enable Notifications'}
          onPress={onEnableNotifications}
          disabled={enabling}
        />
        <Text style={styles.statusLabel}>Status: {permissionLabel(permissionStatus)}</Text>
      </Card>

      <Card style={styles.card}>
        <Text style={styles.sectionTitle}>Device Registration</Text>
        <PrimaryButton
          title={registering ? 'Registering…' : 'Register this device'}
          onPress={onRegisterDevice}
          disabled={registering}
        />
        <Text style={styles.statusLabel}>Token: {maskedToken ?? '—'}</Text>
        <Text style={styles.statusLabel}>
          Last register: {registerResult === null ? '—' : registerResult === 'ok' ? 'ok' : 'error'}
          {registerError ? ` (${registerError})` : ''}
        </Text>
      </Card>

      <Card style={styles.card}>
        <Text style={styles.sectionTitle}>Preferences</Text>
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
      </Card>

      <Card style={styles.card}>
        <Text style={styles.sectionTitle}>Test</Text>
        <PrimaryButton
          title={testing ? 'Sending…' : 'Send test notification'}
          onPress={onSendTest}
          disabled={testing}
        />
        {testSent !== null && (
          <Text style={styles.statusLabel}>Sent: {testSent}</Text>
        )}
        {testReason != null && testReason !== '' && (
          <Text style={[styles.statusLabel, { color: colors.error }]}>{testReason}</Text>
        )}
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xl },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  title: { ...typography.title, color: colors.text, marginBottom: spacing.lg },
  card: { marginBottom: spacing.lg },
  sectionTitle: {
    ...typography.subtitle,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  statusLabel: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.sm },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginVertical: spacing.sm,
  },
  toggleLabel: { ...typography.body, color: colors.text },
});
