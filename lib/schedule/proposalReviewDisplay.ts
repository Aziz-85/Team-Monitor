/**
 * Display helpers for Proposed Schedule Review (testable without React).
 */

import type { ProposalQualityStatus } from '@/lib/schedule/proposalQualityGate';
import {
  proposalReviewTitleKey,
  shouldShowIncompleteProposalBanner,
} from '@/lib/schedule/proposalQualityGate';

export function getProposalReviewTitle(
  status: ProposalQualityStatus,
  t: (key: string) => string
): string {
  const key = proposalReviewTitleKey(status);
  if (status === 'INCOMPLETE') {
    return (t(key) as string) || 'Best Achievable Schedule';
  }
  return (t(key) as string) || 'Proposed Schedule Review';
}

export function getIncompleteProposalBanner(t: (key: string) => string): string {
  return (
    (t('schedule.proposal.incompleteBanner') as string) ||
    'This schedule does not fully meet coverage requirements.'
  );
}

export function showIncompleteProposalBanner(status: ProposalQualityStatus): boolean {
  return shouldShowIncompleteProposalBanner(status);
}

export function getApplyIncompleteConfirmMessage(t: (key: string) => string): string {
  return (t('schedule.proposal.applyIncompleteConfirm') as string) || 'Apply incomplete schedule?';
}
