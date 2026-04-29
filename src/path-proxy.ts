import { operand, raw, RuleExpression, type RuleOperand } from "./expression"

type RuleObject = Record<string, unknown> | Array<unknown>

/**
 * A strongly-typed proxy that provides nested property access for Firestore document data.
 *
 * Automatically generates correct path expressions like `resource.data.user.name` when
 * accessing nested properties. All properties return RuleExpressions suitable for use
 * in rule definitions.
 *
 * This enables type-safe access without string literals:
 * ```typescript
 * // Type-safe: autocomplete shows available fields
 * ctx.resource.data.owner
 *
 * // Not: string literal approach (loses type safety)
 * raw("resource.data.owner")
 * ```
 *
 * @template T - The type of the object, determines which properties are available
 *
 * @example
 * ```typescript
 * interface User { name: string; email: string }
 * const data: PathProxy<User> = createPathProxy("resource.data")
 *
 * data.name       // → RuleExpression: "resource.data.name"
 * data.email      // → RuleExpression: "resource.data.email"
 * ```
 */
export type PathProxy<T> = RuleExpression & {
  [K in keyof T]-?: T[K] extends RuleObject ? PathProxy<T[K]> : RuleExpression
} & {
  $get<K extends keyof T & string>(
    property: RuleOperand,
  ): T[K] extends RuleObject ? PathProxy<T[K]> : RuleExpression
}

const createExpressionProxy = (path: string | RuleExpression): RuleExpression => {
  const base = Object.assign(raw(path), {
    $get(property: RuleOperand) {
      return createExpressionProxy(raw(base, raw("["), operand(property), raw("]")))
    },
  })

  return new Proxy(base, {
    get(target, property, receiver): RuleExpression | undefined {
      if (property === "then") {
        throw new Error("PathProxy cannot be used in a Promise context.")
      }

      if (property in target) {
        return Reflect.get(target, property, receiver) as RuleExpression
      }

      if (typeof property === "symbol") {
        throw new Error("Property keys cannot be symbols.")
      }

      return createExpressionProxy(`${path}.${property}`)
    },
  })
}

/**
 * Creates a type-safe path proxy for accessing nested properties.
 *
 * The proxy intercepts property access and builds the full path dynamically.
 * This enables autocomplete and type checking while generating correct expressions.
 *
 * @template T - The type of the object structure being proxied
 *
 * @param basePath - The base path string (e.g., "resource.data", "request.resource.data")
 * @returns A PathProxy that provides typed property access
 *
 * @example
 * ```typescript
 * const userDataProxy = createPathProxy<User>("resource.data");
 *
 * userDataProxy.profile.name
 * // Returns: RuleExpression for "resource.data.profile.name"
 * ```
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export const createPathProxy = <T = {}>(basePath: string): PathProxy<T> =>
  createExpressionProxy(basePath) as PathProxy<T>
