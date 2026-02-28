import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useAuth } from '@/contexts/AuthContext';
import { colors } from '@/constants/theme';

export default function AuthGate() {
  const { hasToken } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (hasToken === null) return;
    if (hasToken) {
      router.replace('/(tabs)');
    } else {
      router.replace('/login');
    }
  }, [hasToken, router]);

  if (hasToken === null) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }
  return null;
}
