import { z } from 'zod';
import { optionalFileSha256Schema } from '@/lib/validation/primitives';

export const importApplyFormFieldsSchema = z.object({
  fileSha256: optionalFileSha256Schema,
  forceReprocess: z.boolean().default(false),
});

export type ImportApplyFormFields = z.infer<typeof importApplyFormFieldsSchema>;
