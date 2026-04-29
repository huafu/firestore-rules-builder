import {
  type PrimitiveRuleValue,
  raw,
  type RuleExpression,
  type RuleOperand,
  operand,
} from "./expression"
import { createPathProxy, type PathProxy } from "./path-proxy"

type ResourceShape<Data extends Record<string, unknown>> = {
  id: string
  data: Data
}
type RequestShape<Data extends Record<string, unknown>> = {
  resource: ResourceShape<Data>
  auth: {
    uid: string
    token: string
  }
}

/**
 * The main context object for building Firestore Security Rules expressions.
 *
 * Provides methods for logical operations, comparisons, data validation, and access to
 * Firestore runtime values (request, resource, params, server).
 *
 * @template Data - The type shape of the collection/document data
 * @template Params - The type shape of path parameters (e.g., userId from /{userId}/...)
 * @template Lib - Custom helper functions added via {@link FirestoreRulesBuilder.withHelpers}
 *
 * @example
 * ```typescript
 * const ctx = createRuleContext({ isAdmin });
 *
 * // Using logical operations
 * ctx.and(
 *   ctx.isset(ctx.request.auth.uid),
 *   ctx.eq(ctx.request.auth.uid, ctx.resource.data.owner)
 * )
 *
 * // Using data validation
 * ctx.hasAllKeys(['name', 'email'])
 *
 * // Using custom helpers
 * ctx.lib.isAdmin()
 * ```
 */
export interface RuleContext<
  Data extends Record<string, unknown>,
  Params extends Record<string, string>,
  Lib,
> {
  true: RuleExpression
  false: RuleExpression
  null: RuleExpression
  expr(source: string | (() => string) | RuleExpression): RuleExpression
  primitive(value: PrimitiveRuleValue): RuleExpression
  always(): RuleExpression
  never(): RuleExpression
  if(condition: RuleOperand): RuleExpression
  unless(condition: RuleOperand): RuleExpression
  and(...conditions: readonly RuleOperand[]): RuleExpression
  or(...conditions: readonly RuleOperand[]): RuleExpression
  not(condition: RuleOperand): RuleExpression
  ternary(condition: RuleOperand, trueExpr: RuleOperand, falseExpr: RuleOperand): RuleExpression
  select(
    ...cases: readonly [
      ...[condition: RuleOperand, result: RuleOperand][],
      defaultCase: RuleOperand,
    ]
  ): RuleExpression
  eq(left: RuleOperand, right: RuleOperand): RuleExpression
  neq(left: RuleOperand, right: RuleOperand): RuleExpression
  isset(value: RuleOperand): RuleExpression
  gt(left: RuleOperand, right: RuleOperand): RuleExpression
  gte(left: RuleOperand, right: RuleOperand): RuleExpression
  lt(left: RuleOperand, right: RuleOperand): RuleExpression
  lte(left: RuleOperand, right: RuleOperand): RuleExpression
  parens(condition: RuleOperand): RuleExpression
  join(separator: string, parts: readonly RuleOperand[], parens?: boolean): RuleExpression
  hasOnlyModified(keys: readonly Extract<keyof Data, string>[]): RuleExpression
  hasOnlyKeys(keys: readonly Extract<keyof Data, string>[]): RuleExpression
  hasAllKeys(keys: readonly Extract<keyof Data, string>[]): RuleExpression
  request: PathProxy<RequestShape<Data>>
  resource: PathProxy<ResourceShape<Data>>
  params: {
    [K in keyof Params]: RuleExpression
  }
  server: {
    time: RuleExpression
  }
  lib: Lib
}

// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
const createParamsProxy = <Params extends Record<string, string>>(): {
  [K in keyof Params]: RuleExpression
} =>
  new Proxy(
    {},
    {
      get(_target, property) {
        if (typeof property !== "string") {
          return undefined
        }

        return raw(property)
      },
    },
  ) as {
    [K in keyof Params]: RuleExpression
  }

/**
 * Factory function that creates a RuleContext for building Firestore Security Rules.
 *
 * The context provides all necessary operations for constructing rule expressions:
 * - **Logical operations**: and, or, not, if, unless, ternary, select
 * - **Comparison operations**: eq, neq, gt, gte, lt, lte, isset
 * - **Data validation**: hasOnlyModified, hasOnlyKeys, hasAllKeys
 * - **Runtime access**: request, resource, params, server
 * - **Custom helpers**: via the lib property (from withHelpers)
 *
 * @template Data - Type shape of collection data fields
 * @template Params - Type shape of path parameters
 * @template Lib - Custom helper functions type
 *
 * @param lib - Custom helper functions object (usually from withHelpers)
 * @returns A RuleContext instance for expression building
 *
 * @example
 * ```typescript
 * const ctx = createRuleContext({ isAdmin: () => raw("true") });
 *
 * // Build expressions
 * const rule = ctx.and(
 *   ctx.isset(ctx.request.auth.uid),
 *   ctx.lib.isAdmin()
 * );
 * ```
 */
export const createRuleContext = <
  Lib,
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  Data extends Record<string, unknown> = {},
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  Params extends Record<string, string> = {},
>(
  lib: Lib,
): RuleContext<Data, Params, Lib> => {
  const requestProxy = createPathProxy<RequestShape<Data>>("request")
  const resourceProxy = createPathProxy<ResourceShape<Data>>("resource")

  const ctx: RuleContext<Data, Params, Lib> = {
    true: raw("true"),
    false: raw("false"),
    null: raw("null"),
    expr: (source: string | (() => string) | RuleExpression): RuleExpression => raw(source),
    primitive: (value: PrimitiveRuleValue): RuleExpression => {
      return operand(value)
    },
    always: (): RuleExpression => ctx.true,
    never: (): RuleExpression => ctx.false,
    if: (condition: RuleOperand): RuleExpression => operand(condition),
    unless: (condition: RuleOperand): RuleExpression => ctx.not(condition),
    isset: (value: RuleOperand): RuleExpression => ctx.neq(value, ctx.null),
    and: (...conditions: readonly RuleOperand[]): RuleExpression =>
      ctx.join(" && ", conditions, true),
    or: (...conditions: readonly RuleOperand[]): RuleExpression =>
      ctx.join(" || ", conditions, true),
    ternary: (
      condition: RuleOperand,
      trueExpr: RuleOperand,
      falseExpr: RuleOperand,
    ): RuleExpression =>
      raw(operand(condition), " ? ", operand(trueExpr), " : ", operand(falseExpr)),
    select: (
      ...cases: readonly [
        ...[condition: RuleOperand, result: RuleOperand][],
        defaultCase: RuleOperand,
      ]
    ): RuleExpression => {
      if (cases.length === 0) {
        throw new Error("select requires at least a default case")
      }

      const defaultCase = cases[cases.length - 1] as RuleOperand
      const conditionResultPairs = cases.slice(0, -1) as readonly [RuleOperand, RuleOperand][]
      return raw(
        () =>
          conditionResultPairs
            .map(([condition, result]) => `${operand(condition)} ? ${operand(result)} : `)
            .join("") + operand(defaultCase),
      )
    },
    eq: (left: RuleOperand, right: RuleOperand): RuleExpression =>
      raw(operand(left), " == ", operand(right)),
    neq: (left: RuleOperand, right: RuleOperand): RuleExpression =>
      raw(operand(left), " != ", operand(right)),
    gt: (left: RuleOperand, right: RuleOperand): RuleExpression =>
      raw(operand(left), " > ", operand(right)),
    gte: (left: RuleOperand, right: RuleOperand): RuleExpression =>
      raw(operand(left), " >= ", operand(right)),
    lt: (left: RuleOperand, right: RuleOperand): RuleExpression =>
      raw(operand(left), " < ", operand(right)),
    lte: (left: RuleOperand, right: RuleOperand): RuleExpression =>
      raw(operand(left), " <= ", operand(right)),
    not: (condition: RuleOperand): RuleExpression => raw("!", ctx.parens(condition)),
    parens: (op: RuleOperand): RuleExpression =>
      raw(() => {
        const expr = operand(op)
        if (expr.startsWith("(") && expr.endsWith(")")) {
          return expr
        }
        return raw(`(${expr})`)
      }),
    join: (separator: string, parts: readonly RuleOperand[], parens = false): RuleExpression =>
      raw(() => {
        const source = raw(parts.join(separator))
        return parens ? ctx.parens(source) : source
      }),
    hasOnlyModified: (keys: readonly Extract<keyof Data, string>[]): RuleExpression =>
      raw(
        `request.resource.data.diff(resource.data).changedKeys().hasOnly(${JSON.stringify(keys)})`,
      ),
    hasOnlyKeys: (keys: readonly Extract<keyof Data, string>[]): RuleExpression =>
      raw(`request.resource.data.keys().hasOnly(${JSON.stringify(keys)})`),
    hasAllKeys: (keys: readonly Extract<keyof Data, string>[]): RuleExpression =>
      raw(`request.resource.data.keys().hasAll(${JSON.stringify(keys)})`),
    request: requestProxy,
    resource: resourceProxy,
    params: createParamsProxy(),
    server: {
      time: raw("request.time"),
    },
    lib,
  }
  return ctx
}
