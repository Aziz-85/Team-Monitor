import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useMe } from '@/hooks/useMe';
import { StatCard } from '@/components/StatCard';
import { ManagerDashboardCards } from '@/components/ManagerDashboardCards';
import { colors, spacing, typography } from '@/constants/theme';
import type { Role } from '@/types/api';

const MANAGER_ROLES: Role[] = ['MANAGER', 'ASSISTANT_MANAGER', 'ADMIN'];

function PlaceholderCards({ role }: { role: Role }) {
  const placeholders: Array<{ title: string; value: string; subtitle?: string }> = (() => {
    switch (role) {
      case 'EMPLOYEE':
        return [
          { title: "Today's tasks", value: '—', subtitle: 'Connect API later' },
          { title: "Today's schedule", value: '—', subtitle: 'Connect API later' },
          { title: 'Monthly target', value: '—', subtitle: 'Connect API later' },
        ];
      default:
        return [
          { title: 'Overview', value: '—', subtitle: 'Connect API later' },
          { title: 'Stats', value: '—', subtitle: 'Connect API later' },
          { title: 'Summary', value: '—', subtitle: 'Connect API later' },
        ];
    }
  })();

  return (
    <View style={styles.cards}>
      {placeholders.map((p, i) => (
        <StatCard key={i} title={p.title} value={p.value} subtitle={p.subtitle} />
      ))}
    </View>
  );
}

export default function HomeScreen() {
  const { data: me } = useMe();
  const role: Role = me?.user?.role ?? 'EMPLOYEE';
  const showManagerDashboard = MANAGER_ROLES.includes(role);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Dashboard</Text>
      {me?.boutique ? (
        <Text style={styles.subtitle}>{me.boutique.name}</Text>
      ) : null}
      {showManagerDashboard ? (
        <ManagerDashboardCards role={role} />
      ) : (
        <PlaceholderCards role={role} />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xl },
  title: { ...typography.title, color: colors.text, marginBottom: spacing.xs },
  subtitle: { ...typography.caption, color: colors.textSecondary, marginBottom: spacing.md },
  cards: { gap: spacing.md },
});
