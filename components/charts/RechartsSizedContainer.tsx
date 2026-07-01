'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

type RechartsSizedContainerProps = {
  className?: string;
  children: (size: { width: number; height: number }) => ReactNode;
};

/**
 * Mount Recharts only after the parent has measurable dimensions.
 * Avoids ResponsiveContainer width(-1)/height(-1) warnings when layout is not ready.
 */
export function RechartsSizedContainer({ className, children }: RechartsSizedContainerProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const update = () => {
      const width = el.clientWidth;
      const height = el.clientHeight;
      if (width > 0 && height > 0) {
        setSize((prev) =>
          prev?.width === width && prev?.height === height ? prev : { width, height }
        );
      }
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className={className}>
      {size ? children(size) : null}
    </div>
  );
}
