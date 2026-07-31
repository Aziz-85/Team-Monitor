import type { InfrastructureHealthStatus } from '@prisma/client';

export type InfrastructureHealthTransition = { appId: string; from: InfrastructureHealthStatus | null; to: InfrastructureHealthStatus; checkedAt: Date };
export interface InfrastructureNotifier { healthTransition(event: InfrastructureHealthTransition): Promise<void>; }
export const noOpInfrastructureNotifier: InfrastructureNotifier = { async healthTransition() { /* Integration intentionally not configured. */ } };
