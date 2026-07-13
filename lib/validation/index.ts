/** Unified Zod validation facade (Architecture Stabilization Phase 6). */

export {
  formatZodError,
  validationErrorResponse,
  parseValue,
  parseJsonBody,
  parseJsonString,
  parseApplyPlanFromFormData,
  optionalFormSha256,
  formForceReprocess,
  type ParseResult,
  type ParseSuccess,
  type ParseFailure,
} from '@/lib/validation/zodError';

export {
  nonEmptyString,
  monthKeySchema,
  fileSha256Schema,
  optionalFileSha256Schema,
  adminAssignableRoleSchema,
  empIdSchema,
  boutiqueIdSchema,
  salesTxnTypeSchema,
  boutiqueInScope,
} from '@/lib/validation/primitives';

export {
  importApplyFormFieldsSchema,
  type ImportApplyFormFields,
} from '@/lib/validation/schemas/importCommon';

export {
  boutiqueApplyPlanSchema,
  employeeApplyPlanSchema,
} from '@/lib/validation/schemas/targetsImport';

export {
  yearlySalesApplyPlanSchema,
  importLedgerBodySchema,
  importLedgerRowSchema,
  type ImportLedgerBody,
  type ImportLedgerRowInput,
} from '@/lib/validation/schemas/salesImport';

export {
  userCreateSchema,
  userPatchSchema,
  userDeleteQuerySchema,
  type UserCreateInput,
  type UserPatchInput,
} from '@/lib/validation/schemas/users';

export {
  parseServerEnv,
  validateEnvOnStartup,
  assertStagingDatabaseIsolation,
  appEnvSchema,
  type ParsedServerEnv,
} from '@/lib/validation/env';
