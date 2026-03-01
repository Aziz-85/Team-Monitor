import type { ComponentType, SVGProps } from 'react';

/**
 * Return the appropriate icon for text direction.
 * Use for chevrons/arrows in pagination, breadcrumbs, next/prev, back buttons.
 */
export function dirIcon<T extends SVGProps<SVGSVGElement>>(
  isRtl: boolean,
  LtrIcon: ComponentType<T>,
  RtlIcon: ComponentType<T>
): ComponentType<T> {
  return isRtl ? RtlIcon : LtrIcon;
}
