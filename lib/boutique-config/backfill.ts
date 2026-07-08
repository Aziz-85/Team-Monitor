import { prisma } from '@/lib/db';
import {
  DEFAULT_BOUTIQUE_CONFIGURATION,
  DEFAULT_SHIFT_TEMPLATES,
  FRIDAY_DAY_OF_WEEK,
  defaultCoveragePolicy,
} from './defaults';

export type BackfillSummary = {
  boutiquesProcessed: number;
  configsCreated: number;
  templatesCreated: number;
  policiesCreated: number;
  policiesCopiedFromCoverageRule: number;
};

/**
 * Backfill Boutique Configuration for active boutiques (or a single boutique when scoped).
 *
 * For each boutique:
 *  1. Create a BoutiqueConfiguration row if missing (safe defaults).
 *  2. Create the default shift templates (Morning/Evening/Bridge) if missing.
 *  3. Create a coverage policy for each day if missing.
 *     - When a legacy CoverageRule exists for that day, copy its values in.
 *
 * Idempotent: existing rows are never overwritten. Never touches CoverageRule.
 */
export async function backfillBoutiqueConfiguration(boutiqueId?: string): Promise<BackfillSummary> {
  const boutiques = boutiqueId
    ? await prisma.boutique.findMany({ where: { id: boutiqueId } })
    : await prisma.boutique.findMany({ where: { isActive: true } });

  const summary: BackfillSummary = {
    boutiquesProcessed: 0,
    configsCreated: 0,
    templatesCreated: 0,
    policiesCreated: 0,
    policiesCopiedFromCoverageRule: 0,
  };

  for (const boutique of boutiques) {
    summary.boutiquesProcessed += 1;

    // 1. Configuration
    const existingConfig = await prisma.boutiqueConfiguration.findUnique({
      where: { boutiqueId: boutique.id },
    });
    if (!existingConfig) {
      await prisma.boutiqueConfiguration.create({
        data: { boutiqueId: boutique.id, ...DEFAULT_BOUTIQUE_CONFIGURATION },
      });
      summary.configsCreated += 1;
    }

    // 2. Shift templates
    const existingTemplates = await prisma.boutiqueShiftTemplate.findMany({
      where: { boutiqueId: boutique.id },
      select: { code: true },
    });
    const existingCodes = new Set(existingTemplates.map((t) => t.code));
    for (const template of DEFAULT_SHIFT_TEMPLATES) {
      if (existingCodes.has(template.code)) continue;
      await prisma.boutiqueShiftTemplate.create({
        data: { boutiqueId: boutique.id, ...template },
      });
      summary.templatesCreated += 1;
    }

    // 3. Coverage policy per day (copy legacy CoverageRule where available)
    const existingPolicies = await prisma.boutiqueCoveragePolicy.findMany({
      where: { boutiqueId: boutique.id },
      select: { dayOfWeek: true },
    });
    const existingDays = new Set(existingPolicies.map((p) => p.dayOfWeek));

    const legacyRules = await prisma.coverageRule.findMany({
      where: { OR: [{ boutiqueId: boutique.id }, { boutiqueId: null }] },
    });
    // Prefer boutique-specific rule over the global (null) rule for a given day.
    const legacyByDay = new Map<number, { minAM: number; minPM: number; enabled: boolean }>();
    for (const rule of legacyRules) {
      const isBoutiqueSpecific = rule.boutiqueId === boutique.id;
      const existing = legacyByDay.get(rule.dayOfWeek);
      if (!existing || isBoutiqueSpecific) {
        legacyByDay.set(rule.dayOfWeek, { minAM: rule.minAM, minPM: rule.minPM, enabled: rule.enabled });
      }
    }

    for (const dayPolicy of defaultCoveragePolicy()) {
      if (existingDays.has(dayPolicy.dayOfWeek)) continue;
      const legacy = legacyByDay.get(dayPolicy.dayOfWeek);
      if (legacy) {
        await prisma.boutiqueCoveragePolicy.create({
          data: {
            boutiqueId: boutique.id,
            dayOfWeek: dayPolicy.dayOfWeek,
            minMorning: legacy.minAM,
            minEvening: legacy.minPM,
            minTotal: null,
            isFridayOverride: dayPolicy.dayOfWeek === FRIDAY_DAY_OF_WEEK,
            isActive: legacy.enabled,
          },
        });
        summary.policiesCopiedFromCoverageRule += 1;
      } else {
        await prisma.boutiqueCoveragePolicy.create({
          data: {
            boutiqueId: boutique.id,
            dayOfWeek: dayPolicy.dayOfWeek,
            minMorning: dayPolicy.minMorning,
            minEvening: dayPolicy.minEvening,
            minTotal: dayPolicy.minTotal,
            isFridayOverride: dayPolicy.isFridayOverride,
            isActive: dayPolicy.isActive,
          },
        });
      }
      summary.policiesCreated += 1;
    }
  }

  return summary;
}
