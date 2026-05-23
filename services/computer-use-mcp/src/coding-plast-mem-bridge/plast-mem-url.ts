/**
 * Normalizes a Plast Mem service base URL.
 *
 * Before:
 * - `" http://127.0.0.1:3000/// "`
 *
 * After:
 * - `"http://127.0.0.1:3000"`
 */
export function normalizePlastMemBaseUrl(baseUrl: string): string {
  const normalized = baseUrl.trim()
  if (!normalized)
    throw new Error('plast-mem baseUrl is required')

  return normalized.replace(/\/+$/g, '')
}
