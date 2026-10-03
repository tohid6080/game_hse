/** Joins class names, skipping falsy parts (CSS-module lookups can be undefined). */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}
