const SECRET_PATTERNS: Array<[RegExp, string]> = [
  [/(authorization\s*[:=]\s*)[^\r\n,;]+/gi, '$1[REDACTED]'],
  [/((?:database_url|password|passwd|token|api[_-]?key|session[_-]?secret|cookie)\s*[:=]\s*)([^\s,;]+)/gi, '$1[REDACTED]'],
  [/(postgres(?:ql)?:\/\/[^:\s]+:)([^@\s]+)(@)/gi, '$1[REDACTED]$3'],
  [/((?:bearer|basic)\s+)[a-z0-9._~+/=-]+/gi, '$1[REDACTED]'],
];

export function redactSecrets(value: string): string {
  let output = value;
  for (const [pattern, replacement] of SECRET_PATTERNS) {
    output = output.replace(pattern, replacement);
  }
  return output;
}
