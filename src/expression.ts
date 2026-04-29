import type { FormattingOptions } from "./types"

/**
 * Primitive value types that can be used in Firestore Security Rules expressions.
 *
 * @example
 * const value: PrimitiveRuleValue = "hello"; // string
 * const num: PrimitiveRuleValue = 42; // number
 * const flag: PrimitiveRuleValue = true; // boolean
 * const empty: PrimitiveRuleValue = null; // null
 */
export type PrimitiveRuleValue = string | number | boolean | null

/**
 * A rule operand can be a RuleExpression, raw RuleExpr, or primitive value.
 * This is converted to a RuleExpression through the {@link operand} function.
 */
export type RuleOperand = RuleExpression | RuleExpr | PrimitiveRuleValue

/**
 * Internal class representing a rule expression with lazy evaluation and caching support.
 *
 * This class allows composition of rule expressions using lazy-evaluated functions,
 * which enables proper dependency tracking and formatting. Expressions are cached
 * after first toString() call for performance.
 *
 * @internal
 */
class RuleExpr {
  protected _source: (string | ((options?: FormattingOptions) => string))[]
  protected _cachedSource?: string

  public constructor(...source: (string | ((options?: FormattingOptions) => string))[]) {
    this._source = source
  }

  /**
   * Converts the expression to its formatted string representation.
   * Results are cached for performance.
   *
   * @param options - Formatting options
   * @returns The formatted Firestore Security Rules expression code
   */
  public toString(options?: FormattingOptions): string {
    if (this._cachedSource !== undefined && !options?.stripComments && !options?.indentationLevel) {
      return this._cachedSource
    }
    const source = this._source.map((s) => (typeof s === "function" ? s(options) : s)).join("")
    this._cachedSource = reformat(source, options?.indentationLevel)
    return this._cachedSource
  }

  /**
   * Enables primitive coercion for use in template strings and contexts
   * expecting a primitive value.
   *
   * @returns The string representation of this expression
   */
  public [Symbol.toPrimitive](): string {
    return this.toString()
  }

  /**
   * Returns the first `len` characters of this expression's source code.
   *
   * @param len - The maximum number of characters to return
   * @returns A substring of up to `len` characters from the start
   */
  public head(len: number): string {
    let src = ""
    for (const part of this._source) {
      const str = typeof part === "function" ? part() : part
      if (src.length + str.length > len) {
        return src + str.slice(0, len - src.length)
      }
      src += str
    }
    return src
  }

  /**
   * Returns the last `len` characters of this expression's source code.
   *
   * @param len - The maximum number of characters to return
   * @returns A substring of up to `len` characters from the end
   */
  public tail(len: number): string {
    let src = ""
    for (let i = this._source.length - 1; i >= 0; i--) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const part = this._source[i]!
      const str = typeof part === "function" ? part() : part
      if (src.length + str.length > len) {
        return str.slice(str.length - (len - src.length)) + src
      }
      src = str + src
    }
    return src
  }

  /**
   * Checks if this expression starts with the given prefix.
   *
   * @param prefix - The prefix to check for
   * @returns True if the expression starts with the prefix, false otherwise
   */
  public startsWith(prefix: string): boolean {
    const head = this.head(prefix.length)
    return head === prefix
  }

  /**
   * Checks if this expression ends with the given suffix.
   *
   * @param suffix - The suffix to check for
   * @returns True if the expression ends with the suffix, false otherwise
   */
  public endsWith(suffix: string): boolean {
    const tail = this.tail(suffix.length)
    return tail === suffix
  }
}

/**
 * Public alias for the RuleExpr class, representing a Firestore Security Rules expression.
 * Provides caching, lazy evaluation, and primitive coercion support.
 *
 * @example
 * const expr = raw("request.auth != null");
 * const expr2 = raw(() => `resource.data.owner == ${ctx.request.auth.uid}`);
 */
export const RuleExpression = RuleExpr
/**
 * Type alias for RuleExpr with string coercion, making it behave like a string in most contexts.
 */
export type RuleExpression = RuleExpr & string

/**
 * Creates a new RuleExpression from one or more source parts.
 *
 * Supports both immediate strings and lazy-evaluated functions, enabling
 * proper dependency tracking in rule construction.
 *
 * @param source - One or more sources: strings, functions, or existing RuleExpressions
 * @returns A new RuleExpression with lazy evaluation support
 *
 * @example
 * // Static expression
 * const expr1 = raw("request.auth != null");
 *
 * // Lazy-evaluated expression
 * const expr2 = raw(() => calculateCondition());
 *
 * // Composition
 * const expr3 = raw("(", condition, ")");
 */
export const raw = (
  ...source: (string | ((options?: FormattingOptions) => string) | RuleExpression)[]
): RuleExpression => {
  if (source.length === 1 && source[0] instanceof RuleExpr) {
    return source[0]
  }
  return new RuleExpr(...source) as RuleExpression
}

/**
 * Converts a RuleOperand into a RuleExpression.
 *
 * Handles primitive values (string, number, boolean, null) by converting them
 * to their appropriate Firestore representation (JSON strings, numbers, true/false, null).
 *
 * @param operand - The operand to convert (can be expression, value, or primitive)
 * @returns A RuleExpression representing the operand
 *
 * @example
 * operand(42) // → "42"
 * operand(true) // → "true"
 * operand(null) // → "null"
 * operand("hello") // → '"hello"'
 * operand(raw("request.auth")) // → request.auth (unchanged)
 */
export const operand = (operand: RuleOperand): RuleExpression => {
  if (operand && operand instanceof RuleExpr) {
    return operand as RuleExpression
  }

  let src: string
  if (typeof operand === "boolean") {
    src = operand ? "true" : "false"
  } else if (typeof operand === "number") {
    src = String(operand)
  } else if (operand === null) {
    src = "null"
  } else {
    src = JSON.stringify(operand)
  }

  return raw(src)
}

/**
 * Reformats source code to remove existing indentation and apply a new indent level.
 *
 * Detects and strips the current indentation from the first non-empty line,
 * then applies the specified indentation level.
 *
 * @param source - The source code to reformat
 * @param level - The indentation level (default: 0). Each level is 2 spaces.
 * @returns The reformatted source code
 *
 * @example
 * const code = "    hello\n    world";
 * reformat(code, 1) // → "  hello\n  world"
 */
export const reformat = (source: string, level = 0): string => {
  const lines = source.split("\n")
  const firstNonEmptyLine = lines.find((line) => line.trim() !== "")
  if (firstNonEmptyLine === undefined) {
    return source
  }
  const indentMatch = firstNonEmptyLine.match(/^(\s*)/)
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const currentIndent = indentMatch ? indentMatch[1]! : ""
  const src = currentIndent ? source.replace(new RegExp(`^${currentIndent}`, "gm"), "") : source
  return indentBlock(src, level)
}

/**
 * Generates an indentation string for the given level.
 *
 * @param level - The indentation level. Each level is 2 spaces.
 * @returns A string of spaces for indentation
 *
 * @example
 * indentFor(0) // → ""
 * indentFor(1) // → "  "
 * indentFor(2) // → "    "
 */
export const indentFor = (level: number): string => "  ".repeat(level)

/**
 * Indents all lines of a source code block to the specified level.
 *
 * Empty lines are preserved but not indented.
 *
 * @param source - The source code to indent
 * @param level - The indentation level. Each level is 2 spaces.
 * @returns The indented source code
 *
 * @example
 * const code = "hello\nworld";
 * indentBlock(code, 1) // → "  hello\n  world"
 */
export const indentBlock = (source: string, level: number): string => {
  const indentStr = indentFor(level)
  return source
    .split("\n")
    .map((line) => (line.trim() === "" ? "" : indentStr + line))
    .join("\n")
}
