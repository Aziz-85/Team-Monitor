import { z } from 'zod';
import { adminAssignableRoleSchema, empIdSchema } from '@/lib/validation/primitives';

export const userCreateSchema = z.object({
  empId: empIdSchema,
  password: z.string().min(1, 'password is required'),
  role: adminAssignableRoleSchema.default('EMPLOYEE'),
});

export const userPatchSchema = z
  .object({
    empId: empIdSchema,
    role: adminAssignableRoleSchema.optional(),
    disabled: z.boolean().optional(),
    mustChangePassword: z.boolean().optional(),
    canEditSchedule: z.boolean().optional(),
  })
  .refine(
    (body) =>
      body.role !== undefined ||
      body.disabled !== undefined ||
      body.mustChangePassword !== undefined ||
      body.canEditSchedule !== undefined,
    { message: 'at least one field to update is required' }
  );

export const userDeleteQuerySchema = z.object({
  empId: empIdSchema,
});

export type UserCreateInput = z.infer<typeof userCreateSchema>;
export type UserPatchInput = z.infer<typeof userPatchSchema>;
