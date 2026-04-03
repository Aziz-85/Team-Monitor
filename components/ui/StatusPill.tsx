import {
  pillBase,
  pillCompleted,
  pillInfo,
  pillLate,
  pillMuted,
  pillPending,
  pillNeutral,
} from '@/lib/ui-styles';

type Variant = 'primary' | 'backup1' | 'backup2' | 'unassigned' | 'pending' | 'late' | 'completed' | 'neutral';

const styles: Record<Variant, string> = {
  primary: pillInfo,
  backup1: pillPending,
  backup2: pillMuted,
  unassigned: pillLate,
  pending: pillPending,
  late: pillLate,
  completed: pillCompleted,
  neutral: pillNeutral,
};

export function StatusPill({ variant, children }: { variant: Variant; children: React.ReactNode }) {
  return <span className={`${pillBase} ${styles[variant]}`}>{children}</span>;
}
