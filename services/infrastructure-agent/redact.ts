const SECRET_PATTERNS: RegExp[] = [
  /(authorization\s*[:=]\s*)([^\s,;]+)/gi,
  /((?:database_url|password|passwd|token|api[_-]?key|session[_-]?secret|cookie)\s*[:=]\s*)([^\s,;]+)/gi,
  /(postgres(?:ql)?:\/\/[^:\s]+:)([^@\s]+)(@)/gi,
  /((?:bearer|basic)\s+)[a-z0-9._~+/=-]+/gi,
];

export function redactSecrets(value: string): string {
  let output = value;
  for (const pattern of SECRET_PATTERNS) {
    output = output.replace(pattern, (_match, prefix: string, _secret: string, suffix?: string) =>
      `${prefix}[REDACTED]${suffix ?? ''}`
    );
  }
  return output;
}
