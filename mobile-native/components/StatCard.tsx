import { Text, View } from 'react-native';
import { Card } from './Card';
import { colors, spacing, typography } from '@/constants/theme';

type StatCardProps = {
  title: string;
  value: string;
  subtitle?: string;
};

export function StatCard({ title, value, subtitle }: StatCardProps) {
  return (
    <Card>
      <Text style={[typography.label, { color: colors.textSecondary, marginBottom: spacing.xs }]}>
        {title}
      </Text>
      <Text style={[typography.title, { color: colors.text }]}>{value}</Text>
      {subtitle ? (
        <Text style={[typography.caption, { color: colors.textSecondary, marginTop: spacing.xs }]}>
          {subtitle}
        </Text>
      ) : null}
    </Card>
  );
}
