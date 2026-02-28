import { Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '@/constants/theme';

export type ChipVariant = 'AM' | 'PM' | 'OFF' | 'LEAVE' | 'default';

const VARIANT_STYLES: Record<
  ChipVariant,
  { bg: string; text: string }
> = {
  AM: { bg: '#dbeafe', text: '#1d4ed8' },
  PM: { bg: '#e0e7ff', text: '#4338ca' },
  OFF: { bg: '#f1f5f9', text: '#64748b' },
  LEAVE: { bg: '#fef3c7', text: '#b45309' },
  default: { bg: colors.border, text: colors.textSecondary },
};

type ChipProps = {
  label: string;
  variant?: ChipVariant;
};

export function Chip({ label, variant = 'default' }: ChipProps) {
  const style = VARIANT_STYLES[variant];
  return (
    <View
      style={{
        backgroundColor: style.bg,
        paddingHorizontal: spacing.sm,
        paddingVertical: spacing.xs,
        borderRadius: radius.full,
        alignSelf: 'flex-start',
      }}>
      <Text style={[typography.label, { color: style.text, fontSize: 11 }]}>
        {label}
      </Text>
    </View>
  );
}
