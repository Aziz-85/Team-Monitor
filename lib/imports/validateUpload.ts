export type ImportUploadValidationOptions = {
  allowedExtensions: string[];
  maxBytes: number;
  allowedMimeTypes?: string[];
};

export type ValidatedImportUpload = {
  buffer: Buffer;
  fileName: string;
  fileSizeBytes: number;
  mimeType: string | null;
};

export type ImportUploadValidationError = {
  ok: false;
  error: string;
  status: 400;
};

export type ImportUploadValidationSuccess = {
  ok: true;
  upload: ValidatedImportUpload;
};

export type ImportUploadValidationResult =
  | ImportUploadValidationSuccess
  | ImportUploadValidationError;

/** Extract a file upload from multipart FormData (ignores string fields). */
export function importFileFromFormData(
  formData: FormData | null | undefined
): File | null {
  const entry = formData?.get('file');
  return entry instanceof File ? entry : null;
}

function normalizeExtension(fileName: string): string {
  const lower = fileName.toLowerCase();
  const dot = lower.lastIndexOf('.');
  return dot >= 0 ? lower.slice(dot) : '';
}

/** Shared upload validation for Excel and document imports. */
export async function validateImportUpload(
  file: Blob | File | null | undefined,
  options: ImportUploadValidationOptions
): Promise<ImportUploadValidationResult> {
  if (!file || !(file instanceof Blob)) {
    return { ok: false, error: 'Missing file in FormData', status: 400 };
  }

  const fileName = (file instanceof File && file.name ? file.name : 'upload.bin').trim();
  const ext = normalizeExtension(fileName);
  if (!options.allowedExtensions.some((allowed) => ext === allowed.toLowerCase())) {
    return {
      ok: false,
      error: `Allowed file types: ${options.allowedExtensions.join(', ')}`,
      status: 400,
    };
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer.length === 0) {
    return { ok: false, error: 'File is empty', status: 400 };
  }
  if (buffer.length > options.maxBytes) {
    return {
      ok: false,
      error: `File exceeds maximum size of ${options.maxBytes} bytes`,
      status: 400,
    };
  }

  const mimeType = (file.type ?? '').trim().toLowerCase() || null;
  if (
    mimeType &&
    options.allowedMimeTypes?.length &&
    !options.allowedMimeTypes.includes(mimeType)
  ) {
    return { ok: false, error: 'File MIME type not allowed', status: 400 };
  }

  return {
    ok: true,
    upload: {
      buffer,
      fileName,
      fileSizeBytes: buffer.length,
      mimeType,
    },
  };
}

export const TARGETS_EXCEL_UPLOAD: ImportUploadValidationOptions = {
  allowedExtensions: ['.xlsx', '.xlsm', '.xls'],
  maxBytes: 8 * 1024 * 1024,
  allowedMimeTypes: [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'application/vnd.ms-excel.sheet.macroenabled.12',
  ],
};

export const YEARLY_SALES_UPLOAD: ImportUploadValidationOptions = {
  allowedExtensions: ['.xlsx', '.xlsm'],
  maxBytes: 12 * 1024 * 1024,
};
