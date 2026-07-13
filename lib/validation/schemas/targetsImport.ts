import { z } from 'zod';
import { boutiqueInScope } from '@/lib/validation/primitives';

const boutiqueTargetInsertRowSchema = z.object({
  month: z.string(),
  boutiqueId: z.string(),
  boutiqueName: z.string(),
  target: z.number(),
  source: z.string(),
  notes: z.string(),
});

const boutiqueTargetUpdateRowSchema = boutiqueTargetInsertRowSchema.extend({
  existingId: z.string(),
});

export function boutiqueApplyPlanSchema(allowedBoutiqueIds: string[]) {
  const scopedId = boutiqueInScope(allowedBoutiqueIds);
  return z.object({
    inserts: z.array(boutiqueTargetInsertRowSchema.extend({ boutiqueId: scopedId })),
    updates: z.array(boutiqueTargetUpdateRowSchema.extend({ boutiqueId: scopedId })),
  });
}

const employeeTargetInsertRowSchema = z.object({
  month: z.string(),
  boutiqueId: z.string(),
  userId: z.string(),
  target: z.number(),
  source: z.string(),
  notes: z.string(),
});

const employeeTargetUpdateRowSchema = employeeTargetInsertRowSchema.extend({
  id: z.string(),
});

export function employeeApplyPlanSchema(allowedBoutiqueIds: string[]) {
  const scopedId = boutiqueInScope(allowedBoutiqueIds);
  return z.object({
    inserts: z.array(employeeTargetInsertRowSchema.extend({ boutiqueId: scopedId })),
    updates: z.array(employeeTargetUpdateRowSchema.extend({ boutiqueId: scopedId })),
  });
}
