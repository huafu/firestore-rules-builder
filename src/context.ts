import { operand, expr, RuleExpression, type RuleOperand } from "./expression"
import { createDbHelpersProxy, createParamsProxy, createPathProxy } from "./proxy"
import {
  singularize,
  type AnyFullDbCollectionBase,
  type AnyFullDbNamespace,
  type AnyFullDbSchema,
  type ParentLoadersFor,
  type RuleContextBase,
  type RuleContextDataHelpers,
  type RuleContextDbHelpers,
  type RuleContextProxies,
} from "./types"

/**
 * Creates the core expression toolkit injected into every rule callback.
 *
 * The returned object is shared by all builders and provides the primitive
 * boolean/null constants plus the logical, comparison, and composition helpers
 * used throughout the DSL.
 */
export const createRuleContextBase = (): RuleContextBase => {
  const ctx: RuleContextBase = {
    true: expr("true")(),
    false: expr("false")(),
    null: expr("null")(),
    expr,
    raw: expr("raw"),
    const: (value) => operand(value) as RuleExpression<"const">,
    return: (value) => expr("return")`return ${operand(value)};`,
    always: () => ctx.if(ctx.true),
    never: () => ctx.if(ctx.false),
    if: (...condition) =>
      expr("if")(condition.length === 1 ? operand(condition[0]) : ctx.andBlock(...condition)),
    unless: (...condition) =>
      condition.length === 1
        ? ctx.if(ctx.not(condition[0]))
        : ctx.if(ctx.not(ctx.orBlock(...condition))),
    isset: (value) => expr("isset")(ctx.neq(value, ctx.null)),
    and: (...conditions) => expr("and")(ctx.join(` && `, conditions)),
    andBlock: (...conditions) => ctx.parens(expr("and")(ctx.join(`&& `, conditions, true)), true),
    or: (...conditions) => expr("or")(ctx.join(` || `, conditions)),
    orBlock: (...conditions) => ctx.parens(expr("or")(ctx.join(`|| `, conditions, true)), true),
    ternary: (condition, trueExpr, falseExpr) =>
      expr("ternary")`${operand(condition)} ? ${operand(trueExpr)} : ${operand(falseExpr)}`,
    select: (...cases) => {
      if (cases.length === 0) {
        throw new RuleError("select requires at least a default case")
      }
      const defaultCase = cases[cases.length - 1] as RuleOperand
      const conditionResultPairs = cases.slice(0, -1) as readonly [RuleOperand, RuleOperand][]
      return expr("select")(
        ...conditionResultPairs.map(
          ([condition, result]) => expr("case")`${operand(condition)} ? ${operand(result)} : `,
        ),
        operand(defaultCase),
      )
    },
    eq: (left, right) => expr("eq")`${operand(left)} == ${operand(right)}`,
    neq: (left, right) => expr("neq")`${operand(left)} != ${operand(right)}`,
    gt: (left, right) => expr("gt")`${operand(left)} > ${operand(right)}`,
    gte: (left, right) => expr("gte")`${operand(left)} >= ${operand(right)}`,
    lt: (left, right) => expr("lt")`${operand(left)} < ${operand(right)}`,
    lte: (left, right) => expr("lte")`${operand(left)} <= ${operand(right)}`,
    not: (condition) => expr("not")`!${ctx.parens(condition)}`,
    when: (value, equalTo, thenExpr, elseExpr) => {
      const condition = ctx.eq(value, equalTo)
      const thenPart = typeof thenExpr === "function" ? thenExpr(value) : operand(thenExpr)
      const elsePart = typeof elseExpr === "function" ? elseExpr(value) : operand(elseExpr)
      return ctx.ternary(condition, thenPart, elsePart)
    },
    default: (value, defaultValue) => ctx.ternary(ctx.neq(value, ctx.null), value, defaultValue),
    parens: (op, nl = false) => {
      const e = operand(op)
      if (RuleExpression.is(e, "parens")) return e
      if (!nl) return expr("parens")`(${e})`
      return expr("parens")((opt) => {
        return `(\n${RuleExpression.toString(e, { ...opt, indentationLevel: 1 })}\n)`
      })
    },
    join: (separator, parts, nl = false) =>
      expr("join")((opt) => {
        if (parts.length === 0) return ""
        if (parts.length === 1) return operand(parts[0] as RuleExpression)
        const sep = nl ? `\n${separator.trimStart()}` : separator
        return parts
          .map((s) =>
            RuleExpression.toString(operand(s), {
              ...opt,
              indentationLevel: 0,
            }).trimStart(),
          )
          .join(sep)
      }),
  }
  return ctx
}

/**
 * Creates the `db` traversal helpers used to build `exists(...)` and `get(...)` expressions.
 *
 * The helper tree is rooted at the Firestore documents namespace and is later
 * specialized through typed collection access.
 */
export const createRuleContextDbHelpers = <
  Db extends AnyFullDbSchema,
>(): RuleContextDbHelpers<Db> => ({
  db: createDbHelpersProxy(),
})

/**
 * Creates collection-scoped data helpers and optional parent document loaders.
 *
 * Collection callbacks receive key validation helpers automatically. When the
 * current collection is nested, the returned context also exposes `parent`, a
 * typed map of ancestor loaders keyed by collection name.
 *
 * @param parents - Ordered ancestor collection names for the current scope.
 * @returns Collection data helpers for the current builder scope.
 */
export const createRuleContextDataHelpers = <
  Db extends AnyFullDbSchema,
  Ns extends AnyFullDbCollectionBase,
>(
  parents: string[],
): RuleContextDataHelpers<Db, Ns> => {
  const base = {
    hasOnlyModified: (keys) =>
      expr(
        "hasOnlyModified",
      )`request.resource.data.diff(resource.data).changedKeys().hasOnly(${JSON.stringify(keys)})`,
    hasOnlyKeys: (keys) =>
      expr("hasOnlyKeys")`request.resource.data.keys().hasOnly(${JSON.stringify(keys)})`,
    hasAllKeys: (keys) =>
      expr("hasAllKeys")`request.resource.data.keys().hasAll(${JSON.stringify(keys)})`,
  } as RuleContextDataHelpers<Db, Ns>

  if (parents.length > 0) {
    const parent = new Proxy(
      {},
      {
        get(_target, property) {
          if (typeof property !== "string") {
            throw new RuleError("Property keys must be strings.")
          }

          const index = parents.findIndex((p) => p === property)
          if (index === -1) {
            throw new RuleError(`Parent "${property}" not found in parents array.`)
          }
          const path = parents
            .slice(0, index + 1)
            .map((p) => `${p}/$(${singularize(p)}Id)`)
            .join("/")
          return createDbHelpersProxy(path)
        },
      },
    ) as ParentLoadersFor<Ns>
    return {
      ...base,
      parent,
    }
  }

  return base
}

/**
 * Creates proxy-based runtime objects for rule callbacks.
 *
 * These proxies turn property access into lazy expressions, which keeps the DSL
 * type-safe while still rendering ordinary Firestore rule paths such as
 * `request.auth.uid` or `resource.data.ownerId`.
 */
export const createRuleContextProxies = <
  Db extends AnyFullDbSchema,
  Ns extends AnyFullDbNamespace | AnyFullDbCollectionBase,
>(): RuleContextProxies<Db, Ns> =>
  ({
    request: createPathProxy("request"),
    resource: createPathProxy("resource"),
    params: createParamsProxy(),
  }) as unknown as RuleContextProxies<Db, Ns>

export class RuleError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "RuleError"
  }
}

export type ErrorFactory = (message?: string) => RuleError

/**
 * Creates an error which can be thrown later in rule callbacks to produce a custom error message but with the current stack trace (instead of the one at the throw site).
 * @param message - The error message to use for the created error.
 * @returns An error object with the specified message and adjusted stack trace.
 */
export const ruleError = (message?: string): ErrorFactory => {
  const container: { stack?: string | undefined } = {}
  if (typeof Error.captureStackTrace === "function") {
    // V8 environments (Node.js, Chrome, Edge)
    // The second argument excludes 'createRuleError' itself from the stack
    Error.captureStackTrace(container, ruleError)
  } else {
    // Fallback for Firefox, Safari, and other engines
    container.stack = new Error().stack?.split("\n").slice(1).join("\n")
  }
  return (msg = message ?? "RuleError") => {
    const ruleErr = new RuleError(msg)
    ruleErr.stack = container.stack as string
    return ruleErr
  }
}
