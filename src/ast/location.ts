/**
 * A single source position in line/column/offset form.
 */
export interface Position {
  line: number
  column: number
  offset: number
}

/**
 * A half-open source span from start to end.
 */
export interface SourceRange {
  start: Position
  end: Position
  source?: string
}

/**
 * Shape implemented by nodes that may carry source location information.
 */
export interface Locatable {
  loc?: SourceRange
}

/**
 * Factory option bag for attaching source location metadata.
 */
export interface WithLocation {
  loc?: SourceRange
}

/**
 * Returns true when a value can be treated as a locatable object.
 */
export function hasLocation(value: unknown): value is Locatable {
  if (typeof value !== "object" || value === null) {
    return false
  }

  const maybeLocatable = value as Locatable
  return maybeLocatable.loc === undefined || typeof maybeLocatable.loc === "object"
}
