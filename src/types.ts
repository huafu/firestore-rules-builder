/* eslint-disable @typescript-eslint/no-empty-object-type */
import type { FirestoreChildRulesBuilder } from "./builder"
import type { expr, PrimitiveRuleValue, Expr, RuleExpression, RuleOperand } from "./expression"
import type { RegisterHelper } from "./helpers-registry"
import type { ParamsProxy, PathProxy } from "./proxy"

export type PrimitiveDbValue = Date | string | number | boolean | null

type CastId<T> = T extends never
  ? string
  : IsAny<T> extends true
    ? unknown
    : IsUndefined<T> extends true
      ? string
      : T
type CastData<T> = T extends never
  ? {}
  : IsAny<T> extends true
    ? {}
    : IsUndefined<T> extends true
      ? {}
      : T
type CastChildren<T> = T extends never
  ? never
  : IsAny<T> extends true
    ? never
    : IsUndefined<T> extends true
      ? never
      : {
          [K in keyof T]-?: T[K]
        }

export interface DbCollection<
  Data = Record<string, unknown>,
  Children extends AnyDbNamespace = never,
  Id extends string = string,
> {
  /**
   * Optional explicit document identifier type exposed through `resource.id`.
   *
   * When omitted, document IDs default to `string`.
   */
  id: CastId<Id>
  /**
   * Nested collections that can be reached below documents in this collection.
   */
  namespace: CastChildren<Children>
  /**
   * Shape of the document data available through `resource.data` and request payloads.
   */
  data: CastData<Data>
}

/**
 * Optional metadata that augments schema-derived runtime values.
 *
 * The primary use is refining the shape of `request.auth.token` claims.
 */
export interface DbMeta {
  authClaims?: object
}

type NormalizeAuthClaims<T> = [T] extends [never]
  ? Record<string, unknown>
  : T extends object
    ? [keyof T & string] extends [never]
      ? Record<string, unknown>
      : T
    : Record<string, unknown>

export type FullDbMeta<Meta extends DbMeta> = {
  authClaims: NormalizeAuthClaims<Exclude<Meta["authClaims"], undefined>>
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyDbCollection = { id: any; namespace: any; data: any }

export type DbNamespace<K extends string = string> = Record<K, AnyDbCollection>

export type AnyDbNamespace = DbNamespace

/**
 * Top-level schema shape accepted by {@link createFirestoreRulesBuilder}.
 */
export type DbSchema = AnyDbNamespace

// Utility to detect the `any` type.
type IsAny<T> = 0 extends 1 & T ? true : false
// True only when T is exactly undefined (not any, not unions containing other types).
export type IsUndefined<T> =
  IsAny<T> extends true
    ? false
    : [T] extends [undefined]
      ? undefined extends T
        ? true
        : false
      : false

// Fallback type used when a value is left undefined in schema definitions.
export type Default<T, D> = IsUndefined<T> extends true ? D : T

type FullDbCollectionBase<
  Parents extends readonly AnyFullDbCollectionBase[],
  Key extends string,
  Col extends AnyDbCollection,
> = {
  name: Key
  singular: Singularize<Key>
  id: Col["id"]
  data: Col["data"]
  parents: Parents
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyFullDbCollectionBase = FullDbCollectionBase<any, any, any>

export type FullDbCollection<
  Parents extends readonly AnyFullDbCollectionBase[],
  Key extends string,
  Col extends AnyDbCollection,
> = FullDbCollectionBase<Parents, Key, Col> & {
  namespace: Col["namespace"] extends never
    ? never
    : FullDbNamespace<[...Parents, FullDbCollectionBase<Parents, Key, Col>], Col["namespace"]>
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyFullDbCollection = FullDbCollection<any, any, any>

/**
 * Expanded namespace representation used internally by the typed builder.
 *
 * Every collection entry is normalized into a full collection descriptor that
 * carries parent metadata, singularized names, and expanded children.
 */
export type FullDbNamespace<
  Parents extends readonly AnyFullDbCollectionBase[],
  Ns extends AnyDbNamespace,
> = {
  collections: {
    [K in keyof Ns & string]-?: FullDbCollection<Parents, K, Ns[K]>
  }
  parents: Parents
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyFullDbNamespace = FullDbNamespace<any, any>

/**
 * Fully expanded schema used throughout builder, context, and proxy typing.
 */
export type FullDbSchema<Schema extends DbSchema, Meta extends DbMeta = DbMeta> = FullDbNamespace<
  [],
  Schema
> & {
  meta: FullDbMeta<Meta>
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyFullDbSchema = FullDbSchema<any>
export type EmptySchema = FullDbSchema<{}>

/**
 * Path parameters available in the current namespace or collection scope.
 *
 * Names are derived from ancestor singular forms, for example `users` becomes
 * `userId`.
 */
export type PathParamsFor<Ns extends AnyFullDbNamespace | AnyFullDbCollectionBase> = Prettify<
  {
    [K in Ns["parents"][number]["singular"] as `${K}Id`]: string
  } & (Ns extends AnyFullDbCollectionBase
    ? {
        [K in `${Ns["singular"]}Id`]: string
      }
    : {})
>

/**
 * Ordered helper parameter tuple used when binding a concrete document path.
 */
export type FullParamsFor<Col extends AnyFullDbCollectionBase> = Col["parents"] extends readonly []
  ? [
      {
        [K in `${Col["singular"]}Id`]: RuleOperand
      },
    ]
  : [
      Prettify<
        {
          [K in Col["parents"][number]["singular"] as `${K}Id`]: RuleOperand
        } & {
          [K in `${Col["singular"]}Id`]: RuleOperand
        }
      >,
    ]

/**
 * Ordered tuple of ancestor collection names for the current scope.
 */
export type ParentNamesFor<Ns extends AnyFullDbNamespace | AnyFullDbCollectionBase> =
  Ns["parents"] extends readonly []
    ? []
    : // eslint-disable-next-line @typescript-eslint/no-explicit-any
      Ns["parents"] extends readonly [...any[], infer Last]
      ? Last extends AnyFullDbCollectionBase
        ? [...ParentNamesFor<Last>, Last["name"]]
        : never
      : never

/**
 * Loader helpers exposed under `parent` for nested collection contexts.
 *
 * Keys are ancestor collection names, while values expose `$exists()`, `$get()`,
 * and any nested descendants available below that ancestor.
 */
export type ParentLoadersFor<Ns extends AnyFullDbNamespace | AnyFullDbCollectionBase> = {
  // Parent helpers are keyed by collection name because the singular label is type-level only.
  [P in Ns["parents"][number] as P["name"]]: Prettify<
    RuleContextDbDocHelpers<P> &
      (P["namespace"] extends never ? {} : RuleContextDbNsHelpers<P["namespace"]>)
  >
}

/**
 * Proxy type for the current stored document.
 */
export type ResourceProxyFor<Col extends AnyFullDbCollectionBase> = PathProxy<{
  id: Col["id"]
  data: Col["data"]
}>

export type ResourceKeysFor<Col extends AnyFullDbCollectionBase> = keyof Col["data"] & string

/**
 * Resolves the collection represented by a namespace-or-collection scope.
 */
export type CollectionFor<Ns extends AnyFullDbNamespace | AnyFullDbCollectionBase> =
  Ns extends AnyFullDbCollectionBase
    ? Omit<Ns, "namespace">
    : Ns extends AnyFullDbNamespace
      ? Ns["parents"] extends readonly []
        ? never
        : // eslint-disable-next-line @typescript-eslint/no-explicit-any
          Ns["parents"] extends readonly [...any[], infer P]
          ? P extends AnyFullDbCollectionBase
            ? P
            : never
          : never
      : never

/**
 * Valid document data keys for the current collection scope.
 */
export type DataKeysFor<Ns extends AnyFullDbNamespace | AnyFullDbCollectionBase> =
  CollectionFor<Ns> extends AnyFullDbCollectionBase
    ? keyof CollectionFor<Ns>["data"] & string
    : never

/**
 * Typed `request` proxy for the current scope.
 */
export type RequestProxyFor<
  Db extends AnyFullDbSchema,
  Ns extends AnyFullDbNamespace | AnyFullDbCollectionBase,
> = PathProxy<
  {
    auth: {
      uid: string
      token: Db["meta"]["authClaims"]
    }
    time: string
  } & (CollectionFor<Ns> extends AnyFullDbCollectionBase
    ? {
        resource: {
          id: CollectionFor<Ns>["id"]
          data: CollectionFor<Ns>["data"]
        }
      }
    : {})
>

/**
 * Proxy fields available when the builder is positioned on a namespace.
 */
export type RuleNamespaceContextProxies<
  Db extends AnyFullDbSchema,
  Ns extends AnyFullDbNamespace,
> = Prettify<
  {
    params: PathProxy<PathParamsFor<Ns>>
    request: RequestProxyFor<Db, Ns>
  } & (CollectionFor<Ns> extends AnyFullDbCollectionBase
    ? {
        resource: ResourceProxyFor<CollectionFor<Ns>>
      }
    : {})
>

/**
 * Proxy fields available when the builder is positioned on a concrete collection.
 */
export type RuleCollectionContextProxies<
  Db extends AnyFullDbSchema,
  Col extends AnyFullDbCollectionBase,
> = {
  params: ParamsProxy<PathParamsFor<Col>>
  request: RequestProxyFor<Db, Col>
  resource: ResourceProxyFor<Col>
}

/**
 * Scope-sensitive proxy portion of the rule context.
 */
export type RuleContextProxies<
  Db extends AnyFullDbSchema,
  Ns extends AnyFullDbNamespace | AnyFullDbCollectionBase,
> = Ns extends AnyFullDbCollectionBase
  ? RuleCollectionContextProxies<Db, Ns>
  : Ns extends AnyFullDbNamespace
    ? RuleNamespaceContextProxies<Db, Ns>
    : {
        request: RequestProxyFor<Db, Ns>
      }

/**
 * Collection data validation helpers exposed inside collection rule callbacks.
 */
export type RuleContextDataHelpers<
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  Db extends AnyFullDbSchema,
  Ns extends AnyFullDbNamespace | AnyFullDbCollectionBase,
> =
  CollectionFor<Ns> extends AnyFullDbCollectionBase
    ? {
        hasOnlyModified(keys: readonly DataKeysFor<Ns>[]): RuleExpression<"hasOnlyModified">
        hasOnlyKeys(keys: readonly DataKeysFor<Ns>[]): RuleExpression<"hasOnlyKeys">
        hasAllKeys(keys: readonly DataKeysFor<Ns>[]): RuleExpression<"hasAllKeys">
      } & (CollectionFor<Ns>["parents"] extends readonly [] ? {} : { parent: ParentLoadersFor<Ns> })
    : {}

type RuleContextDbDocHelpers<Col extends AnyFullDbCollection> = {
  $exists: () => RuleExpression<"exists">
  $get: () => ResourceProxyFor<Col>
}

/**
 * Database traversal helper tree exposed under `db`.
 */
export type RuleContextDbNsHelpers<Ns extends AnyFullDbNamespace> = {
  [K in keyof Ns["collections"]]: (
    id: RuleOperand,
  ) => Prettify<
    RuleContextDbDocHelpers<Ns["collections"][K]> &
      (Ns["collections"][K]["namespace"] extends never
        ? {}
        : RuleContextDbNsHelpers<Ns["collections"][K]["namespace"]>)
  >
}

/**
 * Database traversal helpers injected into every rule context.
 */
export type RuleContextDbHelpers<Db extends AnyFullDbSchema> = {
  db: RuleContextDbNsHelpers<Db>
}

/**
 * Core expression builders available in every rule callback.
 *
 * These helpers model Firestore rule syntax directly and are combined with
 * proxies, database helpers, collection helpers, and registered libraries to
 * form the full rule context.
 */
export interface RuleContextBase {
  /** Literal Firestore rule expression for boolean true. */
  true: RuleExpression<"true">
  /** Literal Firestore rule expression for boolean false. */
  false: RuleExpression<"false">
  /** Literal Firestore rule expression for null. */
  null: RuleExpression<"null">
  /** Low-level expression factory for constructing custom typed expressions. */
  expr: typeof expr
  /** Emits raw Firestore rule source without escaping or transformation. */
  raw: Expr<"raw">
  /** Converts a primitive JS value into a Firestore constant operand expression. */
  const(value: PrimitiveRuleValue): RuleExpression<"const">
  /** Shorthand for an unconditional allow expression equivalent to if true. */
  always(): RuleExpression<"if">
  /** Shorthand for a deny expression equivalent to if false. */
  never(): RuleExpression<"if">
  /** Pass-through helper that marks a condition as an allow expression, or combines multiple conditions with logical AND. */
  if(...conditions: [RuleOperand, ...(readonly RuleOperand[])]): RuleExpression<"if">
  /** Negated allow helper equivalent to if not(condition), or combines multiple conditions with logical OR. */
  unless(...conditions: [RuleOperand, ...(readonly RuleOperand[])]): RuleExpression<"if">
  /** Joins multiple conditions with logical AND. */
  and(...conditions: [RuleOperand, ...(readonly RuleOperand[])]): RuleExpression<"and">
  /** Wraps an AND expression in parentheses for explicit grouping. */
  andBlock(...conditions: [RuleOperand, ...(readonly RuleOperand[])]): RuleExpression<"parens">
  /** Joins multiple conditions with logical OR. */
  or(...conditions: [RuleOperand, ...(readonly RuleOperand[])]): RuleExpression<"or">
  /** Wraps an OR expression in parentheses for explicit grouping. */
  orBlock(...conditions: [RuleOperand, ...(readonly RuleOperand[])]): RuleExpression<"parens">
  /** Negates a condition expression. */
  not(condition: RuleOperand): RuleExpression<"not">
  /** Emits an explicit return statement, typically for helper function bodies. */
  return(condition: RuleOperand): RuleExpression<"return">
  /** Builds a ternary expression using condition ? trueExpr : falseExpr. */
  ternary(
    condition: RuleOperand,
    trueExpr: RuleOperand,
    falseExpr: RuleOperand,
  ): RuleExpression<"ternary">
  /**
   * Branches on value equality and supports callback-based branch construction.
   *
   * Equivalent to `value == equalTo ? thenExpr : elseExpr`.
   */
  when<T extends RuleExpression>(
    value: T,
    equalTo: RuleOperand,
    thenExpr: ((val: T) => RuleExpression) | RuleOperand,
    elseExpr: ((val: T) => RuleExpression) | RuleOperand,
  ): RuleExpression<"ternary">
  /** Returns value when it is not null, otherwise returns defaultValue. */
  default(value: RuleOperand, defaultValue: RuleOperand): RuleExpression<"ternary">
  /**
   * Builds chained conditional expressions from `[condition, result]` pairs and a default value.
   *
   * Example: `select([c1, r1], [c2, r2], fallback)` => `c1 ? r1 : c2 ? r2 : fallback`
   */
  select(
    ...cases: [
      ...(readonly [condition: RuleOperand, result: RuleOperand][]),
      defaultCase: RuleOperand,
    ]
  ): RuleExpression<"select">
  /** Equality comparison helper (==). */
  eq(left: RuleOperand, right: RuleOperand): RuleExpression<"eq">
  /** Inequality comparison helper (!=). */
  neq(left: RuleOperand, right: RuleOperand): RuleExpression<"neq">
  /** Null-check helper equivalent to value != null. */
  isset(value: RuleOperand): RuleExpression<"isset">
  /** Greater-than comparison helper (>). */
  gt(left: RuleOperand, right: RuleOperand): RuleExpression<"gt">
  /** Greater-than-or-equal comparison helper (>=). */
  gte(left: RuleOperand, right: RuleOperand): RuleExpression<"gte">
  /** Less-than comparison helper (<). */
  lt(left: RuleOperand, right: RuleOperand): RuleExpression<"lt">
  /** Less-than-or-equal comparison helper (<=). */
  lte(left: RuleOperand, right: RuleOperand): RuleExpression<"lte">
  /** Wraps an expression in parentheses unless already parenthesized. */
  parens(condition: RuleOperand, nl?: boolean): RuleExpression<"parens">
  /** Joins a list of operands with a custom separator expression. */
  join(separator: string, parts: readonly RuleOperand[], nl?: boolean): RuleExpression<"join">
}

export type RuleContextFor<
  Db extends AnyFullDbSchema,
  Ns extends AnyFullDbNamespace | AnyFullDbCollectionBase,
  Lib = {},
> = Prettify<
  RuleContextBase &
    RuleContextProxies<Db, Ns> &
    RuleContextDbHelpers<Db> &
    RuleContextDataHelpers<Db, Ns> &
    Lib
>

/**
 * Complete rule context type available inside `rules(...)` callbacks.
 *
 * It combines the core expression helpers, scope-sensitive proxies, database
 * traversal helpers, collection helpers, and any user-registered helper
 * library.
 */

/**
 * Helper factory signature used by `withHelpers(...)`.
 *
 * The factory receives the fully typed rule context for the current builder and
 * a registrar that can promote selected helpers into named Firestore functions.
 */
export type LibFactory<
  NewLib,
  Db extends AnyFullDbSchema = EmptySchema,
  Ns extends AnyFullDbNamespace = Db,
  Lib = {},
> = (context: RuleContextFor<Db, Ns, Lib>, register: RegisterHelper) => NewLib

/**
 * Generic helper-factory form for reusable helper libraries.
 */
export interface GenericLibFactory<Lib> {
  <Db extends AnyFullDbSchema, Ns extends AnyFullDbNamespace, CurrentLib>(
    context: RuleContextFor<Db, Ns, CurrentLib>,
    register: RegisterHelper,
  ): Lib
}

/**
 * Rule callback signature for a concrete collection builder.
 */
export type RuleBuilderForCollection<
  Db extends AnyFullDbSchema,
  Col extends AnyFullDbCollection,
  Lib,
> = (context: RuleContextFor<Db, Col, Lib>) => RuleMap

/**
 * Typed map of direct child collection builders provided to `sub(...)`.
 */
export type FirestoreRulesBuilderMap<
  Db extends AnyFullDbSchema,
  Ns extends AnyFullDbNamespace,
  Lib,
> = {
  [K in keyof Ns["collections"] & string]: FirestoreChildRulesBuilder<
    Db,
    Ns["collections"][K]["namespace"],
    Ns["collections"][K],
    Lib
  >
}

/**
 * Rule callback signature for configuring direct child collections under a namespace.
 */
export type RuleBuilderForNamespace<
  Db extends AnyFullDbSchema,
  Ns extends AnyFullDbNamespace,
  Lib,
> = (map: FirestoreRulesBuilderMap<Db, Ns, Lib>) => void

/**
 * Firestore operations supported by generated `allow` statements.
 */
export type Operation = "read" | "write" | "get" | "list" | "create" | "update" | "delete"

/**
 * Partial operation map returned from a collection-scoped `rules(...)` callback.
 */
export type RuleMap = Partial<Record<Operation, RuleExpression>>

/**
 * Rendering controls shared by expression, helper, and builder formatters.
 */
export interface FormattingOptions {
  /**
   * Removes emitted helper and builder comments from the generated output.
   */
  stripComments?: boolean
  /**
   * Base indentation level used when rendering nested blocks.
   */
  indentationLevel?: number
  /**
   * Prefix inserted at the start of the rendered block after indentation is normalized.
   */
  prepend?: string
  /**
   * Suffix appended to the rendered block before final indentation is applied.
   */
  append?: string
}

/**
 * Type-level singularization used to derive default `...Id` path parameter names.
 *
 * This mirrors the runtime {@link singularize} helper so schema-driven types and
 * generated builder paths stay aligned.
 */
export type Singularize<T extends string> =
  // Irregular / Specific Exceptions
  T extends "people"
    ? "person"
    : T extends "children"
      ? "child"
      : T extends "criteria"
        ? "criterion"
        : T extends "status"
          ? "status"
          : // Suffix: -ies (cities -> city)
            T extends `${infer Rest}ies`
            ? `${Rest}y`
            : // Suffix: -es (categories, boxes, bushes)
              // Check common cases where -es is used (ending in x, s, h, o)
              T extends `${infer Rest}${"xes" | "ses" | "hes" | "oes"}`
              ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
                `${Rest}${T extends `${any}es` ? (T extends `${infer R}es` ? R : never) : never}`
              : T extends `${infer Rest}es`
                ? Rest
                : // Suffix: -s (cats -> cat)
                  T extends `${infer Rest}s`
                  ? Rest
                  : T

/**
 * Runtime companion for {@link Singularize}.
 *
 * It is used when builders derive default parameter names such as `userId` from
 * collection names such as `users`.
 */
export const singularize = <T extends string>(str: T): Singularize<T> => {
  if (str === "status") return "status" as Singularize<T>
  if (str === "people") return "person" as Singularize<T>
  if (str === "children") return "child" as Singularize<T>
  if (str === "criteria") return "criterion" as Singularize<T>
  if (str.endsWith("ies")) return (str.slice(0, -3) + "y") as Singularize<T>
  if (str.endsWith("xes") || str.endsWith("ses") || str.endsWith("hes") || str.endsWith("oes")) {
    return str.slice(0, -2) as Singularize<T>
  }
  if (str.endsWith("es")) return str.slice(0, -2) as Singularize<T>
  if (str.endsWith("s")) return str.slice(0, -1) as Singularize<T>
  return str as Singularize<T>
}

// Flattens intersections for easier editor display.
type Prettify<T> = T extends object ? { [K in keyof T]: T[K] } & {} : T
