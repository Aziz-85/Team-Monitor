import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import api from '@/lib/api';
import { setTokens } from '@/lib/authStore';
import { registerPushToken } from '@/lib/pushNotifications';
import { useAuth } from '@/contexts/AuthContext';
import { PrimaryButton } from '@/components/PrimaryButton';
import { colors, spacing, typography } from '@/constants/theme';
import type { LoginResponse } from '@/types/api';

export default function LoginScreen() {
  const [empId, setEmpId] = useState('');
  const [password, setPassword] = useState('');
  const { setHasToken } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();

  const loginMutation = useMutation({
    mutationFn: async (): Promise<LoginResponse> => {
      const { data } = await api.post<LoginResponse>('/api/mobile/auth/login', {
        empId: empId.trim(),
        password,
        deviceHint: 'mobile',
      });
      return data;
    },
    onSuccess: async (data) => {
      await setTokens(data.accessToken, data.refreshToken);
      try {
        const { data: meData } = await api.get('/api/mobile/me');
        queryClient.setQueryData(['me'], meData);
      } catch {
        queryClient.setQueryData(['me'], null);
      }
      setHasToken(true);
      router.replace('/(tabs)');
      void registerPushToken();
    },
  });

  const handleLogin = () => {
    if (!empId.trim() || !password) return;
    loginMutation.mutate();
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.form}>
        <Text style={styles.title}>Sign in</Text>
        <Text style={styles.label}>Employee ID</Text>
        <TextInput
          style={styles.input}
          value={empId}
          onChangeText={setEmpId}
          placeholder="Emp ID"
          placeholderTextColor={colors.textSecondary}
          autoCapitalize="none"
          autoCorrect={false}
          editable={!loginMutation.isPending}
        />
        <Text style={styles.label}>Password</Text>
        <TextInput
          style={styles.input}
          value={password}
          onChangeText={setPassword}
          placeholder="Password"
          placeholderTextColor={colors.textSecondary}
          secureTextEntry
          editable={!loginMutation.isPending}
        />
        {loginMutation.isError && (
          <Text style={styles.error}>
            {loginMutation.error && 'response' in loginMutation.error
              ? (loginMutation.error as { response?: { data?: { error?: string } } }).response?.data?.error || 'Login failed'
              : 'Login failed'}
          </Text>
        )}
        <PrimaryButton
          title={loginMutation.isPending ? 'Signing in…' : 'Sign in'}
          onPress={handleLogin}
          disabled={loginMutation.isPending || !empId.trim() || !password}
        />
        {loginMutation.isPending && (
          <ActivityIndicator style={styles.spinner} size="small" color={colors.primary} />
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
    padding: spacing.lg,
  },
  form: {
    gap: spacing.sm,
  },
  title: {
    ...typography.title,
    color: colors.text,
    marginBottom: spacing.md,
  },
  label: {
    ...typography.label,
    color: colors.textSecondary,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: spacing.sm,
    ...typography.body,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  error: {
    ...typography.caption,
    color: colors.error,
    marginBottom: spacing.sm,
  },
  spinner: {
    marginTop: spacing.sm,
  },
});
