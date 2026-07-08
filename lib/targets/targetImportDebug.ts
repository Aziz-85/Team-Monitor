import { describeRawValue } from './parseTargetValue';

export type TargetImportRowDebug = {
  detectedHeaders: string[];
  targetValueType: string;
  targetDisplayValue: string;
};

export function buildTargetImportDebug(
  detectedHeaders: string[],
  targetRaw: unknown
): TargetImportRowDebug {
  const described = describeRawValue(targetRaw);
  return {
    detectedHeaders,
    targetValueType: described.type,
    targetDisplayValue: described.display,
  };
}

export function logTargetImportError(scope: string, rowIndex: number, message: string, debug: TargetImportRowDebug): void {
  console.warn(`[${scope}] row ${rowIndex}: ${message}`, debug);
}