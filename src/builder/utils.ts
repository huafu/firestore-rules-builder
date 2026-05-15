/**
 * Internal utilities shared across builder modules.
 */

/** Internal empty-object utility for generic defaults. */
export type EmptyObject = Record<never, never>

/**
 * Extracts variable names from a match path pattern.
 *
 * Supports both `{param}` and `{param=**}` syntaxes.
 */
export function extractPathParamNames(pathPattern: string): Set<string> {
  const names = new Set<string>()
  const matcher = /\{([A-Za-z_][A-Za-z0-9_]*)(?:=\*\*)?\}/g
  let match = matcher.exec(pathPattern)
  while (match) {
    if (match[1]) {
      names.add(match[1])
    }
    match = matcher.exec(pathPattern)
  }
  return names
}
