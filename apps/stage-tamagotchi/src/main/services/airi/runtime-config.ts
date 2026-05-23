/**
 * Parses environment-style boolean flags.
 *
 * Use when:
 * - Reading optional process environment flags.
 * - Falling back to an existing config value when the input is absent or invalid.
 *
 * Expects:
 * - Common truthy values: `1`, `true`, `yes`, `on`.
 * - Common falsy values: `0`, `false`, `no`, `off`.
 *
 * Returns:
 * - The parsed boolean, or `fallback` for missing/unsupported values.
 */
export function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value == null)
    return fallback

  const normalized = value.trim().toLowerCase()
  if (['1', 'true', 'yes', 'on'].includes(normalized))
    return true
  if (['0', 'false', 'no', 'off'].includes(normalized))
    return false

  return fallback
}

/**
 * Normalizes optional text from config and environment values.
 *
 * Before:
 * - `"  hello  "`
 * - `"   "`
 *
 * After:
 * - `"hello"`
 * - `undefined`
 */
export function trimOptional(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed || undefined
}
