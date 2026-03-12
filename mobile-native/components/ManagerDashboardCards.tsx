import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useManagerDashboard } from '@/hooks/useManagerDashboard';
import { StatCard } from '@/components/StatCard';
import { colors, spacing, typography } from '@/constants/theme';
import type { Role } from '@/types/api';

/** Full integer SAR display — no K/M abbreviations. */
function formatSar(n: number): string {
  return Number.isFinite(n) ? Math.trunc(n).toLocaleString('en-US', { maximumFractionDigits: 0 }) : '—';
}

export function ManagerDashboardCards({ role }: { role: Role }) {
  const { data, isOffline, isLoading, isError } = useManagerDashboard(role);

  if (isLoading && !data) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="small" color={colors.primary} />
        <Text style={styles.loadingText}>Loading dashboard…</Text>
      </View>
    );
  }

  if (isError && !data) {
    return (
      <View style={styles.cards}>
        <StatCard title="Tasks" value="—" subtitle="Unable to load" />
        <StatCard title="Sales" value="—" subtitle="Unable to load" />
        <StatCard title="Coverage" value="—" subtitle="Unable to load" />
      </View>
    );
  }

  if (!data) {
    return (
      <View style={styles.cards}>
        <StatCard title="Tasks" value="—" subtitle="Connect API" />
        <StatCard title="Sales" value="—" subtitle="Connect API" />
        <StatCard title="Coverage" value="—" subtitle="Connect API" />
      </View>
    );
  }

  const tasksSub = isOffline ? 'Last saved (offline)' : `${data.date}`;
  const salesSub = isOffline
    ? 'Last saved (offline)'
    : `${data.sales.percent}% of target`;
  const coverageStatus = data.coverage.isOk ? 'OK' : 'Below policy';
  const coverageSub = isOffline
    ? 'Last saved (offline)'
    : `${data.coverage.am} AM / ${data.coverage.pm} PM · ${coverageStatus}`;

  return (
    <View style={styles.cards}>
      <StatCard
        title="Tasks"
        value={`${data.tasks.done} / ${data.tasks.total}`}
        subtitle={tasksSub}
      />
      <StatCard
        title="Sales (SAR)"
        value={`${formatSar(data.sales.achieved)} / ${formatSar(data.sales.target)} SAR`}
        subtitle={salesSub}
      />
      <StatCard
        title="Coverage"
        value={data.coverage.isOk ? 'OK' : 'Below policy'}
        subtitle={coverageSub}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  cards: { gap: spacing.md },
  loading: {
    padding: spacing.lg,
    alignItems: 'center',
    gap: spacing.sm,
  },
  loadingText: { ...typography.caption, color: colors.textSecondary },
});
