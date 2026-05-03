import { RuleError } from "./context"
import {
  expr,
  operand,
  primitive,
  RuleExpression,
  type PrimitiveRuleValue,
  type RuleOperand,
} from "./expression"
import type {
  AnyFullDbCollectionBase,
  AnyFullDbNamespace,
  ResourceProxyFor,
  RuleContextDbNsHelpers,
} from "./types"

type ProxyValue<T> = T extends PrimitiveRuleValue
  ? RuleExpression
  : T extends Record<string, unknown> | Array<unknown>
    ? PathProxy<T>
    : RuleExpression

/**
 * Typed property proxy over a Firestore rules path.
 *
 * Dot access (`proxy.field`) emits static dotted paths, while `$prop(...)`
 * emits indexed access for dynamic or computed keys.
 */
export type PathProxy<T> = RuleExpression & {
  [K in keyof T]-?: ProxyValue<T[K]>
} & {
  $prop<K extends keyof T & string>(property: RuleExpression | K): ProxyValue<T[K]>
}

const createExpressionProxy = (path: string | RuleExpression): RuleExpression => {
  const base = Object.assign(expr("prop")`${path}`, {
    $prop(property: RuleOperand) {
      return createExpressionProxy(expr("prop")`${path}[${operand(property)}]`)
    },
  })

  return new Proxy(base, {
    get(target, property, receiver): RuleExpression | undefined {
      if (property in target) {
        return Reflect.get(target, property, receiver) as RuleExpression
      }

      if (typeof property !== "string") {
        throw new RuleError("Property keys must be strings.")
      }

      return createExpressionProxy(expr("prop")`${path}.${property}`)
    },
  })
}

/**
 * Creates a path proxy that lazily expands property access into rule source.
 *
 * Use this for typed access to structures such as `request`, `resource`, and
 * `get(...).data` without manually concatenating string paths.
 *
 * @param basePath - Base path expression or literal.
 * @returns A proxy whose property access produces nested path expressions.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export const createPathProxy = <T = {}>(basePath: string | RuleExpression): PathProxy<T> =>
  createExpressionProxy(basePath) as PathProxy<T>

/**
 * Creates expressions for route parameters such as `userId` or `postId`.
 *
 * Unlike `createPathProxy`, params resolve directly to identifier expressions
 * because Firestore route params are already scalar variables in rule code.
 */
export const createParamsProxy = <Params extends Record<string, unknown>>(): ParamsProxy<Params> =>
  new Proxy(
    {},
    {
      get(_target, property) {
        if (typeof property !== "string") {
          throw new RuleError("Property keys must be strings.")
        }

        return expr("param")`${property}`
      },
    },
  ) as ParamsProxy<Params>

export type ParamsProxy<Params extends Record<string, unknown>> = {
  [K in keyof Params]: RuleExpression
}

const dbPathBind = (value: RuleOperand): RuleExpression | string =>
  primitive.isString(value) || primitive.isNumber(value)
    ? String(value)
    : expr("bind")`$(${operand(value)})`

/**
 * Creates the proxy tree behind the `db` helper.
 *
 * Collection access grows the document path segment by segment. Once a document
 * path is fully bound, the proxy exposes `$exists()` and `$get()` to emit the
 * corresponding Firestore helper calls.
 *
 * @param path - Optional pre-bound document path.
 * @returns A typed database traversal helper tree.
 */
export const createDbHelpersProxy = <Ns extends AnyFullDbNamespace>(
  path?: string | RuleExpression,
): RuleContextDbNsHelpers<Ns> =>
  new Proxy(
    path
      ? {
          $exists: () => expr("exists")`exists(${path})`,
          $get: () => createResourceProxy(expr("get")`get(${path})`),
        }
      : {},
    {
      get(target, property, receiver) {
        if (property in target) {
          return Reflect.get(target, property, receiver) as RuleExpression
        }

        if (typeof property !== "string") {
          throw new RuleError("Property keys must be strings.")
        }

        const dbPath = path ? expr("segment")`${path}/${property}` : property
        return (id: RuleOperand) => createDbHelpersProxy(expr("path")`${dbPath}/${dbPathBind(id)}`)
      },
    },
  ) as RuleContextDbNsHelpers<Ns>

const createResourceProxy = <Col extends AnyFullDbCollectionBase>(at: string | RuleExpression) =>
  createPathProxy(at) as ResourceProxyFor<Col>
