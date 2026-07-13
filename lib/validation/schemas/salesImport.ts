import { z } from 'zod';
import {
  boutiqueIdSchema,
  nonEmptyString,
  salesTxnTypeSchema,
} from '@/lib/validation/primitives';

const yearlySalesApplyWriteSchema = z.object({
  dateKey: z.string(),
  dateIso: z.string(),
  userId: z.string(),
  empId: z.string(),
  employeeName: z.string().optional(),
  amount: z.number(),
  action: z.enum(['INSERT', 'UPDATE']),
  existingSalesEntryId: z.string().nullable().optional(),
  amountBefore: z.number().nullable().optional(),
  sourceBefore: z.string().nullable().optional(),
  stableKey: z.string(),
});

export function yearlySalesApplyPlanSchema(expectedBoutiqueId: string) {
  return z
    .object({
      boutiqueId: z.string(),
      fileName: z.string(),
      fileSha256: z.string(),
      year: z.string().nullable().optional(),
      monthRange: z
        .object({
          from: z.string(),
          to: z.string(),
        })
        .nullable()
        .optional(),
      writes: z.array(yearlySalesApplyWriteSchema),
    })
    .transform((plan) => ({
      boutiqueId: plan.boutiqueId,
      fileName: plan.fileName,
      fileSha256: plan.fileSha256,
      year: plan.year ?? null,
      monthRange: plan.monthRange ?? null,
      writes: plan.writes.map((write) => ({
        dateKey: write.dateKey,
        dateIso: write.dateIso,
        userId: write.userId,
        empId: write.empId,
        employeeName: write.employeeName ?? write.empId,
        amount: write.amount,
        action: write.action,
        existingSalesEntryId: write.existingSalesEntryId ?? null,
        amountBefore: write.amountBefore ?? null,
        sourceBefore: write.sourceBefore ?? null,
        stableKey: write.stableKey,
      })),
    }))
    .refine((plan) => plan.boutiqueId === expectedBoutiqueId, {
      message: 'apply plan boutiqueId does not match operational scope',
    });
}

export const importLedgerRowSchema = z.object({
  empId: z.string().optional(),
  employeeId: z.string().optional(),
  email: z.string().optional(),
  name: z.string().optional(),
  date: z.string().optional(),
  txnDate: z.string().optional(),
  type: salesTxnTypeSchema.optional(),
  amount: z.number().optional(),
  amountSar: z.number().optional(),
  grossAmount: z.number().optional(),
  referenceNo: z.string().optional(),
  lineNo: z.string().optional(),
  originalReference: z.string().optional(),
  rowIndex: z.number().optional(),
});

export const importLedgerBodySchema = z.object({
  boutiqueId: boutiqueIdSchema,
  periodKey: nonEmptyString,
  fileName: z.string().trim().min(1).default('import'),
  fileHash: z.string().nullable().optional(),
  rows: z.array(importLedgerRowSchema).default([]),
});

export type ImportLedgerBody = z.infer<typeof importLedgerBodySchema>;
export type ImportLedgerRowInput = z.infer<typeof importLedgerRowSchema>;
