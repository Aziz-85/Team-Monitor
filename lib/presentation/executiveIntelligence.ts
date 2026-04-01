import type { ExecutiveTone } from '@/components/ui/ExecutiveIntelligence';

export type PresentationSignal = {
  tone: ExecutiveTone;
  shortLabel: string;
  hint: string;
};

type Thresholds = {
  successMin: number;
  warningMin: number;
};

const defaultThresholds: Thresholds = {
  successMin: 100,
  warningMin: 80,
};

function toFiniteNumber(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

export function paceSignal(
  achievementPercent: number,
  labels?: {
    ahead?: string;
    near?: string;
    behind?: string;
    aheadHint?: string;
    nearHint?: string;
    behindHint?: string;
  },
  thresholds: Thresholds = defaultThresholds
): PresentationSignal {
  const pct = toFiniteNumber(achievementPercent);
  if (pct >= thresholds.successMin) {
    return {
      tone: 'success',
      shortLabel: labels?.ahead ?? 'Ahead of target',
      hint: labels?.aheadHint ?? 'Current pace meets or exceeds required target.',
    };
  }
  if (pct >= thresholds.warningMin) {
    return {
      tone: 'warning',
      shortLabel: labels?.near ?? 'Slightly below pace',
      hint: labels?.nearHint ?? 'Close to target pace; monitor next period closely.',
    };
  }
  return {
    tone: 'danger',
    shortLabel: labels?.behind ?? 'Behind pace',
    hint: labels?.behindHint ?? 'Needs focused follow-up to recover target pace.',
  };
}

export function completionSignal(
  completionPercent: number,
  labels?: {
    healthy?: string;
    attention?: string;
    critical?: string;
    healthyHint?: string;
    attentionHint?: string;
    criticalHint?: string;
  }
): PresentationSignal {
  const pct = toFiniteNumber(completionPercent);
  if (pct >= 90) {
    return {
      tone: 'success',
      shortLabel: labels?.healthy ?? 'Completion healthy',
      hint: labels?.healthyHint ?? 'Task completion trend is strong.',
    };
  }
  if (pct >= 70) {
    return {
      tone: 'warning',
      shortLabel: labels?.attention ?? 'Needs attention',
      hint: labels?.attentionHint ?? 'Some tasks are slipping; prioritize follow-up.',
    };
  }
  return {
    tone: 'danger',
    shortLabel: labels?.critical ?? 'Completion risk',
    hint: labels?.criticalHint ?? 'Low completion trend; immediate action recommended.',
  };
}

export function coverageSignal(
  coveragePercent: number,
  labels?: {
    healthy?: string;
    watch?: string;
    weak?: string;
    healthyHint?: string;
    watchHint?: string;
    weakHint?: string;
  }
): PresentationSignal {
  const pct = toFiniteNumber(coveragePercent);
  if (pct >= 95) {
    return {
      tone: 'success',
      shortLabel: labels?.healthy ?? 'Coverage is healthy',
      hint: labels?.healthyHint ?? 'Team coverage is stable for planned operations.',
    };
  }
  if (pct >= 85) {
    return {
      tone: 'warning',
      shortLabel: labels?.watch ?? 'Coverage watch',
      hint: labels?.watchHint ?? 'Coverage is acceptable but may need adjustment soon.',
    };
  }
  return {
    tone: 'danger',
    shortLabel: labels?.weak ?? 'Coverage gap',
    hint: labels?.weakHint ?? 'Coverage is below safe level for planned execution.',
  };
}

export function attentionSeverity(
  count: number,
  labels?: {
    none?: string;
    low?: string;
    high?: string;
    noneHint?: string;
    lowHint?: string;
    highHint?: string;
  }
): PresentationSignal {
  const n = Math.max(0, Math.trunc(toFiniteNumber(count)));
  if (n === 0) {
    return {
      tone: 'success',
      shortLabel: labels?.none ?? 'No immediate issues',
      hint: labels?.noneHint ?? 'No urgent operational alerts detected.',
    };
  }
  if (n <= 3) {
    return {
      tone: 'warning',
      shortLabel: labels?.low ?? 'Some attention needed',
      hint: labels?.lowHint ?? 'A few items need manager follow-up.',
    };
  }
  return {
    tone: 'danger',
    shortLabel: labels?.high ?? 'High attention required',
    hint: labels?.highHint ?? 'Multiple critical items require immediate action.',
  };
}

