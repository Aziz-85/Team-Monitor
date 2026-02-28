import {
  Pressable,
  Text,
  type GestureResponderEvent,
  type PressableProps,
} from 'react-native';
import { colors, radius, spacing, typography } from '@/constants/theme';

type PrimaryButtonProps = PressableProps & {
  title: string;
  onPress?: (e: GestureResponderEvent) => void;
};

export function PrimaryButton({ title, onPress, disabled, style, ...rest }: PrimaryButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        {
          backgroundColor: disabled ? colors.border : pressed ? colors.primaryPressed : colors.primary,
          paddingVertical: spacing.sm,
          paddingHorizontal: spacing.lg,
          borderRadius: radius.md,
          alignItems: 'center',
          justifyContent: 'center',
        },
        typeof style === 'function' ? style({ pressed: !!pressed }) : style,
      ]}
      {...rest}>
      <Text style={[typography.subtitle, { color: '#fff' }]}>{title}</Text>
    </Pressable>
  );
}
