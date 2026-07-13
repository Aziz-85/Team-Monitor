import { z } from 'zod';
import { normalizeMonthKey } from '@/lib/time';

export const nonEmptyString = z.string().trim().min(1);

export const monthKeySchema = z
  .string()
  .trim()
  .transform((value) => normalizeMonthKey(value))
  .pipe(z.string().regex(/^\d{4}-\d{2}$/, 'month must be YYYY-MM'));

export const fileSha256Schema = z
  .string()
  .trim()
  .regex(/^[a-f0-9]{64}$/i, 'fileSha256 must be a 64-character hex digest');

export const optionalFileSha256Schema = z
  .string()
  .trim()
  .regex(/^[a-f0-9]{64}$/i, 'fileSha256 must be a 64-character hex digest')
  .optional()
  .nullable();

/** Roles assignable via admin user CRUD (excludes SUPER_ADMIN). */
export const adminAssignableRoleSchema = z.enum([
  'EMPLOYEE',
  'MANAGER',
  'ASSISTANT_MANAGER',
  'ADMIN',
  'AREA_MANAGER',
]);

export const empIdSchema = nonEmptyString.max(64);

export const boutiqueIdSchema = nonEmptyString;

export const salesTxnTypeSchema = z.enum(['SALE', 'RETURN', 'EXCHANGE']);

export function boutiqueInScope(allowedBoutiqueIds: string[]) {
  return z
    .string()
    .refine((id) => allowedBoutiqueIds.includes(id), 'apply plan contains out-of-scope boutique');
}
