/** Replace `{key}` placeholders in admin i18n strings (single-arg `useT` has no built-in ICU). */
export function interpolateLabel(
  template: string,
  vars: Record<string, string | number>
): string {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.split(`{${key}}`).join(String(value));
  }
  return result;
}
