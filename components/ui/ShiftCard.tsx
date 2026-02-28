import { ReactNode } from 'react';

type Variant = 'morning' | 'evening';

const styles: Record<Variant, string> = {
  morning: 'border-sky-200 bg-sky-100 text-sky-700',
  evening: 'border-amber-200 bg-amber-50 text-amber-800',
};

export function ShiftCard({
  variant,
  title,
  children,
}: {
  variant: Variant;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className={`rounded-lg border p-4 ${styles[variant]}`}>
      <h3 className="mb-2 text-sm font-semibold">{title}</h3>
      <div className="text-base">{children}</div>
    </div>
  );
}
