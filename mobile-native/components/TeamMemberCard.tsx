import React, { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Card } from './Card';
import { Chip } from './Chip';
import { colors, spacing, typography } from '@/constants/theme';
import type { TeamTodayMember, TeamTodayShift } from '@/types/api';

function formatSar(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

const SHIFT_VARIANT: Record<TeamTodayShift, 'AM' | 'PM' | 'OFF' | 'LEAVE'> = {
  AM: 'AM',
  PM: 'PM',
  OFF: 'OFF',
  LEAVE: 'LEAVE',
};

function TeamMemberCardInner({ member }: { member: TeamTodayMember }) {
  const chipVariant = SHIFT_VARIANT[member.shift] ?? 'default';
  return (
    <Card>
      <View style={styles.row}>
        <View style={styles.main}>
          <Text style={styles.name} numberOfLines={1}>
            {member.name}
          </Text>
          <Text style={styles.empId}>{member.empId}</Text>
          {member.role ? (
            <Text style={styles.role}>{member.role}</Text>
          ) : null}
        </View>
        <Chip label={member.shift} variant={chipVariant} />
      </View>
      <View style={styles.stats}>
        <Text style={styles.statLabel}>Sales today</Text>
        <Text style={styles.statValue}>{formatSar(member.salesToday)} SAR</Text>
      </View>
      <View style={styles.stats}>
        <Text style={styles.statLabel}>Tasks</Text>
        <Text style={styles.statValue}>
          {member.tasksDone} / {member.tasksTotal}
        </Text>
      </View>
    </Card>
  );
}

export const TeamMemberCard = memo(TeamMemberCardInner);

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.sm,
  },
  main: { flex: 1, marginRight: spacing.sm },
  name: { ...typography.subtitle, color: colors.text },
  empId: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.xs },
  role: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.xs },
  stats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  statLabel: { ...typography.label, color: colors.textSecondary },
  statValue: { ...typography.body, color: colors.text },
});
