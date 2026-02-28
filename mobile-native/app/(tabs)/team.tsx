import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useCallback, useMemo } from 'react';
import { useTeamToday } from '@/hooks/useTeamToday';
import { TeamMemberCard } from '@/components/TeamMemberCard';
import { colors, spacing, typography } from '@/constants/theme';
import type { TeamTodayMember } from '@/types/api';

function renderItem({ item }: { item: TeamTodayMember }) {
  return <TeamMemberCard member={item} />;
}

const keyExtractor = (item: TeamTodayMember) => item.empId;

export default function TeamScreen() {
  const { data, isOffline, isLoading, isError, refetch } = useTeamToday();

  const refreshControl = useMemo(
    () => (
      <RefreshControl
        refreshing={isLoading}
        onRefresh={refetch}
        colors={[colors.primary]}
      />
    ),
    [isLoading, refetch]
  );

  const ListHeader = useCallback(() => {
    if (!data) return null;
    return (
      <View style={styles.header}>
        <Text style={styles.title}>Team · Today</Text>
        <Text style={styles.date}>{data.date}</Text>
        {isOffline ? (
          <Text style={styles.offline}>Offline — showing cached list</Text>
        ) : null}
      </View>
    );
  }, [data, isOffline]);

  if (isLoading && !data) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading team…</Text>
      </View>
    );
  }

  if (isError && !data) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Unable to load team</Text>
        <Text style={styles.hint}>Pull to refresh when back online</Text>
      </View>
    );
  }

  const members = data?.members ?? [];

  const listEmpty = useCallback(
    () => (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>No team members for this date</Text>
      </View>
    ),
    []
  );

  return (
    <FlatList
      data={members}
      ListEmptyComponent={listEmpty}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      ListHeaderComponent={ListHeader}
      contentContainerStyle={styles.listContent}
      refreshControl={refreshControl}
      initialNumToRender={10}
      maxToRenderPerBatch={10}
      windowSize={5}
    />
  );
}

const styles = StyleSheet.create({
  listContent: {
    padding: spacing.lg,
    paddingBottom: spacing.xl,
  },
  header: {
    marginBottom: spacing.md,
  },
  title: { ...typography.title, color: colors.text },
  date: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.xs },
  offline: {
    ...typography.label,
    color: colors.error,
    marginTop: spacing.sm,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
    backgroundColor: colors.background,
  },
  loadingText: { ...typography.body, color: colors.textSecondary, marginTop: spacing.md },
  errorText: { ...typography.subtitle, color: colors.text },
  hint: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.sm },
  empty: { paddingVertical: spacing.xl, alignItems: 'center' },
  emptyText: { ...typography.body, color: colors.textSecondary },
});
