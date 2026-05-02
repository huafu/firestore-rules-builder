import { RuleError } from "./context"
import type { FormattingOptions } from "./types"

type RuleSourcePart =
  | string
  | ((options?: FormattingOptions) => string | RuleExpression)
  | RuleExpression

/**
 * Primitive literals that can be embedded directly into generated rule source.
 */
export type PrimitiveRuleValue = string | number | boolean | null

/**
 * Value accepted by rule operators and helper APIs.
 *
 * Primitive values are normalized through {@link operand}, while existing
 * expressions are reused as-is.
 */
export type RuleOperand = RuleExpression | PrimitiveRuleValue

/**
 * Lazily composed Firestore rule expression.
 *
 * Instances keep their source as fragments until rendering, which lets the
 * builder compose helpers, proxies, and conditional blocks without eagerly
 * flattening everything into strings. The plain rendered form is cached only
 * when no formatting overrides are applied.
 */
export class RuleExpression<Id extends string | null = string | null> {
  protected _id: Id | null
  protected _source: RuleSourcePart[]
  protected _cachedSource?: string | undefined

  static is<Id extends string>(value: unknown, id: Id): value is RuleExpression<Id>
  static is(value: unknown): value is RuleExpression
  static is(value: unknown, id?: string): value is RuleExpression {
    return value instanceof RuleExpression && (id == null || value._id === id)
  }

  static toString(
    expr: RuleExpression,
    options?: FormattingOptions & { prepend?: string; append?: string },
  ): string {
    return expr.toString(options)
  }

  static toSourceLines(
    expr: RuleExpression,
    options?: FormattingOptions & { prepend?: string; append?: string },
  ): string[] {
    return expr.toSourceLines(options)
  }

  static create<Id extends string | null>(id: Id, source: RuleSourcePart[]): RuleExpression<Id> {
    // TODO: handle merging or other logic for expressions depending on their IDs
    return new RuleExpression(id, ...source)
  }

  public constructor(id: Id | undefined, ...source: RuleSourcePart[]) {
    this._id = id ?? null
    this._source = source.map((s) => (s && RuleExpression.is(s) ? s._source : s)).flat()
  }

  /**
   * Renders the expression into Firestore source code.
   *
   * The cache is used only for the default formatting path so that indented or
   * wrapped render requests do not leak into later calls.
   *
   * @param options - Optional rendering controls.
   * @returns The formatted Firestore rule expression.
   */
  protected toString(options?: FormattingOptions): string {
    const canCache =
      !options?.stripComments && !options?.indentationLevel && !options?.prepend && !options?.append
    if (this._cachedSource !== undefined && canCache) {
      return this._cachedSource
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { prepend, append, ...opt } = options ?? {}
    const source = this._source
      .map((s) => (typeof s === "function" ? s(opt) : RuleExpression.is(s) ? s.toString(opt) : s))
      .join("")
    const formatted = reformat(source, options)
    if (canCache) {
      this._cachedSource = formatted
    }
    return formatted
  }

  protected toSourceLines(options?: FormattingOptions): string[] {
    return this.toString(options).split("\n")
  }
}

/**
 * Creates expression builders that can be called directly or used as tagged templates.
 *
 * When an identifier is provided, the resulting expressions carry that ID.
 * Builder internals use those IDs to recognize certain helper forms and to
 * preserve specific expression semantics.
 *
 * @param id - Optional expression identifier.
 * @returns A function that builds expressions from source parts or templates.
 */
export const expr = ((id) =>
  (...args) => {
    if (args.length === 0) {
      if (!id) throw new RuleError("Expression ID is required when no source is provided.")
      return new RuleExpression(id, id)
    }
    const [first, ...rest] = args
    if (args.length === 1 && first && RuleExpression.is(first, id)) {
      return first
    }
    if (
      Array.isArray(first) &&
      Object.prototype.hasOwnProperty.call(first, "raw") &&
      Array.isArray((first as TemplateStringsArray).raw)
    ) {
      return new RuleExpression(id, ...toParts(first as TemplateStringsArray, ...rest))
    }
    return new RuleExpression(id, ...(args as RuleSourcePart[]))
  }) as ExpressionBuilder

export interface Expr<Id extends string | null = null> {
  (strings: TemplateStringsArray, ...values: RuleSourcePart[]): RuleExpression<Id>
  (...source: RuleSourcePart[]): RuleExpression<Id>
}
export interface ExpressionBuilder {
  <Id extends string>(id: Id): Expr<Id>
  (): Expr
}

/**
 * Splits a tagged template into lazily rendered source fragments.
 *
 * @param strings - Literal string fragments.
 * @param values - Interpolated fragments or expressions.
 * @returns Source parts that can be stored without immediate rendering.
 */
const toParts = (strings: TemplateStringsArray, ...values: RuleSourcePart[]): RuleSourcePart[] => {
  const source: RuleSourcePart[] = []

  for (const [index, stringPart] of strings.entries()) {
    if (stringPart !== "") {
      source.push(stringPart)
    }

    const value = values[index]
    if (value !== undefined) {
      source.push(value)
    }
  }

  return source
}

/**
 * Normalizes any operand into a {@link RuleExpression}.
 *
 * Existing expressions are returned unchanged. Primitive values are converted to
 * Firestore-safe literal source, with strings JSON-escaped.
 *
 * @param operand - Expression or primitive operand.
 * @returns A renderable expression.
 */
export const operand = (operand: RuleOperand): RuleExpression => {
  if (operand && RuleExpression.is(operand)) {
    return operand
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

  return expr("const")(src)
}

/**
 * Re-indents a rendered source block using the requested formatting options.
 *
 * @param source - Source block to reformat.
 * @param options - Rendering options including indentation and wrappers.
 * @returns The formatted block.
 */
const reformat = (source: string, options?: FormattingOptions): string => {
  const lines = source.split("\n")
  const firstNonEmptyLine = lines.find((line) => line.trim() !== "")
  if (firstNonEmptyLine === undefined) {
    return surroundWith(source, options)
  }
  const indentMatch = firstNonEmptyLine.match(/^(\s*)/)
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const currentIndent = indentMatch ? indentMatch[1]! : ""
  const src = currentIndent ? source.replace(new RegExp(`^${currentIndent}`, "gm"), "") : source
  return indentBlock(surroundWith(src, options), options?.indentationLevel ?? 0)
}

const surroundWith = (str: string, options?: FormattingOptions): string => {
  let result = str
  if (options?.prepend) {
    result = result.replace(/^([\s]*)/, `$1${options.prepend}`)
  }
  if (options?.append) {
    result = result.replace(/([\s]*)$/, `${options.append}$1`)
  }
  return result
}

/**
 * Returns the two-space indentation prefix for a nesting level.
 */
export const indentFor = (level: number): string => "  ".repeat(level)

/**
 * Indents each non-empty line in a rendered source block.
 *
 * @param source - Source block to indent.
 * @param level - Nesting level, expressed in two-space steps.
 * @returns The indented block.
 */
export const indentBlock = (source: string, level: number): string => {
  const indentStr = indentFor(level)
  return source
    .split("\n")
    .map((line) => (line.trim() === "" ? "" : indentStr + line))
    .join("\n")
}

/**
 * Runtime primitive type guards used when proxy helpers decide how to bind values.
 */
export const primitive = {
  isString: (value: RuleOperand): value is string => typeof value === "string",
  isNumber: (value: RuleOperand): value is number => typeof value === "number",
  isBoolean: (value: RuleOperand): value is boolean => typeof value === "boolean",
  isNull: (value: RuleOperand): value is null => value === null,
}
