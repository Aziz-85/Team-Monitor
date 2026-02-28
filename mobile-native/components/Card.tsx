import { View, type ViewProps } from 'react-native';
import { colors, radius, spacing } from '@/constants/theme';

type CardProps = ViewProps & {
  children: React.ReactNode;
};

export function Card({ children, style, ...rest }: CardProps) {
  return (
    <View
      style={[
        {
          backgroundColor: colors.surface,
          borderRadius: radius.lg,
          padding: spacing.md,
          borderWidth: 1,
          borderColor: colors.border,
        },
        style,
      ]}
      {...rest}>
      {children}
    </View>
  );
}
