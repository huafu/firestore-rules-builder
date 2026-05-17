/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { CustomClaimsOf, DatabaseDefinition, DocumentAtPath, SubcollectionsAtPath } from "./db"
import type { BinaryOperator, ExpressionNode, FirestoreTypeName } from "../ast"
import {
  booleanLiteral,
  identifier,
  memberExpression,
  binaryExpression,
  conditionalExpression,
  logicalExpression,
  unaryExpression,
  callExpression,
  isExpression,
  listLiteral,
  mapEntry,
  mapLiteral,
  nullLiteral,
  numberLiteral,
  stringLiteral,
} from "../ast/factories"
import {
  requestAuth,
  requestAuthTokenClaim,
  resourceId,
  resourceData,
  resourceDataField,
  requestResource,
  requestResourceData,
  requestAuthUid,
  requestMethod,
  requestPath,
  requestQueryLimit,
  requestQueryOffset,
  requestQueryOrderBy,
  requestTime,
  keysOf,
  existsMethod,
  sizeOf,
  hasAll,
  hasAny,
  hasOnly,
  joinList,
  concatLists,
  removeAll,
  toSet,
  diffMap,
  addedKeys,
  removedKeys,
  changedKeys,
  affectedKeys,
  unchangedKeys,
  durationAbs,
  durationTime,
  durationValue,
  exists,
  get,
  getAfter,
  callMethod,
  callHelper,
} from "../ast/known-factories"
import { extractPathParamNames, type EmptyObject } from "./utils"

/** Extracts route params from a path pattern like `users/{userId}/posts/{postId}`. */
type PathParams<TPath extends string> = TPath extends `${infer Head}/${infer Tail}`
  ? Head extends `{${infer Param}}`
    ? { [K in Param | keyof PathParams<Tail>]: string }
    : PathParams<Tail>
  : TPath extends `{${infer Param}}`
    ? { [K in Param]: string }
    : EmptyObject

/** Extracts only string keys from an object type. */
type StringKeyOf<T> = Extract<keyof T, string>

/**
 * Public-facing expression type that hides discriminator and location fields.
 * Omits `kind` and `loc` from ExpressionNode so they don't pollute auto-complete.
 */
export type PublicExpression = Omit<ExpressionNode, "kind" | "loc">

/** Internal alias used for concise proxy method signatures. */
type Expr = PublicExpression
type RuleValueLiteral =
  | string
  | number
  | boolean
  | null
  | RuleValueLiteral[]
  | { [key: string]: RuleValueLiteral }
// if T is unknown, we want to allow any literal type, else only allow literals assignable to T and RuleValueProxy<T> types
type RuleValueInput<T> = T extends readonly (infer U)[]
  ? T | RuleValueProxy<T> | RuleValueInput<U>[]
  : T extends (infer U)[]
    ? T | RuleValueProxy<T> | RuleValueInput<U>[]
    : T | RuleValueProxy<T>

type NonFunctionKeys<T> = Extract<
  {
    [K in keyof T]-?: T[K] extends (...args: any[]) => any ? never : K
  }[keyof T],
  string
>

type DotPath<T> =
  T extends Record<string, unknown>
    ? {
        [K in NonFunctionKeys<T>]: T[K] extends Record<string, unknown>
          ? `${K}` | `${K}.${DotPath<T[K]>}`
          : `${K}`
      }[NonFunctionKeys<T>]
    : never

type ValueFromInput<T> =
  T extends RuleValue<any> ? TypeOfRuleValue<T> : T extends RuleValueLiteral ? T : unknown

type IfElseResultValue<C, A> =
  ValueFromInput<C> extends never[]
    ? ValueFromInput<A>
    : ValueFromInput<A> extends never[]
      ? ValueFromInput<C>
      : ValueFromInput<C> | ValueFromInput<A>

/** Common comparison/type-check methods available on all proxied values. */
type CommonValueMethods<TValue> = {
  /**
   * Type-check: returns `true` if the value is an instance of the given Firestore type.
   * @param typeName - A Firestore type name (e.g., `"string"`, `"number"`, `"map"`, `"array"`).
   * @example
   * ```ts
   * $.request.auth.uid.is("string")  // true if uid is a string
   * ```
   */
  is(typeName: FirestoreTypeName): RuleValueProxy<boolean>
  /**
   * Equality: returns `true` if this value equals `value`.
   * @param value - The value to compare against.
   * @example
   * ```ts
   * $.resource.data.status.eq("active")
   * ```
   */
  eq(value: RuleValueInput<TValue | null>): RuleValueProxy<boolean>
  /**
   * Inequality: returns `true` if this value does not equal `value`.
   * @param value - The value to compare against.
   * @example
   * ```ts
   * $.request.method.neq("delete")
   * ```
   */
  neq(value: RuleValueInput<TValue | null>): RuleValueProxy<boolean>
  /**
   * Greater than: returns `true` if this value is greater than `value`.
   * @param value - The value to compare against.
   * @example
   * ```ts
   * $.resource.data.count.gt(0)
   * ```
   */
  gt(value: RuleValueInput<TValue>): RuleValueProxy<boolean>
  /**
   * Greater than or equal: returns `true` if this value is >= `value`.
   * @param value - The value to compare against.
   * @example
   * ```ts
   * $.request.time.gte($.resource.data.createdAt)
   * ```
   */
  gte(value: RuleValueInput<TValue>): RuleValueProxy<boolean>
  /**
   * Less than: returns `true` if this value is less than `value`.
   * @param value - The value to compare against.
   * @example
   * ```ts
   * $.request.time.lt($.resource.data.expiresAt)
   * ```
   */
  lt(value: RuleValueInput<TValue>): RuleValueProxy<boolean>
  /**
   * Less than or equal: returns `true` if this value is <= `value`.
   * @param value - The value to compare against.
   * @example
   * ```ts
   * $.resource.data.priority.lte(10)
   * ```
   */
  lte(value: RuleValueInput<TValue>): RuleValueProxy<boolean>
  /**
   * Arithmetic addition: returns `this + value`.
   * @param value - The value to add.
   * @example
   * ```ts
   * $.request.time.plus(3600)  // 1 hour later
   * ```
   */
  plus(value: RuleValueInput<TValue>): RuleValueProxy<TValue>
  /**
   * Arithmetic subtraction: returns `this - value`.
   * @param value - The value to subtract.
   * @example
   * ```ts
   * $.resource.data.total.minus($.resource.data.discount)
   * ```
   */
  minus(value: RuleValueInput<TValue>): RuleValueProxy<TValue>
  /**
   * Arithmetic multiplication: returns `this * value`.
   * @param value - The multiplier.
   * @example
   * ```ts
   * $.resource.data.quantity.multiply($.resource.data.unitPrice)
   * ```
   */
  multiply(value: RuleValueInput<TValue>): RuleValueProxy<TValue>
  /**
   * Arithmetic division: returns `this / value`.
   * @param value - The divisor.
   * @example
   * ```ts
   * $.resource.data.total.divide($.resource.data.count)
   * ```
   */
  divide(value: RuleValueInput<TValue>): RuleValueProxy<TValue>
  /**
   * Modulo/remainder: returns `this % value`.
   * @param value - The divisor for the modulo operation.
   * @example
   * ```ts
   * $.resource.data.id.modulo(2).eq(0)  // true if id is even
   * ```
   */
  modulo(value: RuleValueInput<TValue>): RuleValueProxy<TValue>
}

/** String-specific helper methods available on string-like values. */
type StringMethods = {
  /**
   * Returns the number of UTF-16 code units in the string.
   * @example
   * ```ts
   * $.resource.data.name.size().lte(100)
   * ```
   */
  size(): RuleValueProxy<number>
  /**
   * Converts the string to lowercase.
   * @example
   * ```ts
   * $.resource.data.email.lower().eq("admin@example.com")
   * ```
   */
  lower(): RuleValueProxy<string>
  /**
   * Converts the string to uppercase.
   * @example
   * ```ts
   * $.resource.data.code.upper().eq("ABC")
   * ```
   */
  upper(): RuleValueProxy<string>
  /**
   * Removes leading and trailing whitespace from the string.
   * @example
   * ```ts
   * $.resource.data.tag.trim().neq("")
   * ```
   */
  trim(): RuleValueProxy<string>
  /**
   * Returns `true` if the string matches the given regular expression.
   * @param re - A regular expression string.
   * @example
   * ```ts
   * $.resource.data.email.matches(".*@example\\.com")
   * ```
   */
  matches(re: RuleValueInput<string>): RuleValueProxy<boolean>
  /**
   * Returns a new string with all regex matches replaced by the substitution string.
   * @param re - A regular expression string to match.
   * @param sub - The replacement string.
   * @example
   * ```ts
   * $.resource.data.slug.replace("-", "_")
   * ```
   */
  replace(re: RuleValueInput<string>, sub: RuleValueInput<string>): RuleValueProxy<string>
  /**
   * Splits a string into an array of substrings using the provided separator.
   * @param separator - The delimiter expression.
   * @example
   * ```ts
   * $.request.auth.token.passportIds.split(",")
   * ```
   */
  split(separator: RuleValueInput<string>): RuleValueProxy<string[]>
  /**
   * Converts the string to a byte array (UTF-8 encoded).
   * @example
   * ```ts
   * $.resource.data.token.toUtf8Bytes().size().gt(0)
   * ```
   */
  toUtf8Bytes(): RuleValueProxy<readonly number[]>
}

/** List-specific helper methods available on array-like values. */
type ListMethods<T> = {
  /**
   * Returns the number of elements in the list.
   * @example
   * ```ts
   * $.resource.data.tags.size().lte(10)
   * ```
   */
  size(): RuleValueProxy<number>
  /**
   * Returns `true` if the list contains all values from the given set.
   * @param values - A set expression to check.
   * @example
   * ```ts
   * $.resource.data.requiredTags.hasAll($.request.auth.token.userTags)
   * ```
   */
  hasAll(values: RuleValueInput<T[]>): RuleValueProxy<boolean>
  /**
   * Returns `true` if the list contains any of the values from the given set.
   * @param values - A set expression to check.
   * @example
   * ```ts
   * $.resource.data.collaborators.hasAny($.request.auth.token.userId.toSet())
   * ```
   */
  hasAny(values: RuleValueInput<T[]>): RuleValueProxy<boolean>
  /**
   * Returns `true` if the list contains only and all values from the given set (exact match).
   * @param values - A set expression to check.
   * @example
   * ```ts
   * $.resource.data.roles.hasOnly(["admin", "editor"])
   * ```
   */
  hasOnly(values: RuleValueInput<T[]>): RuleValueProxy<boolean>
  /**
   * Returns a string that joins all list elements with the given separator.
   * @param separator - The separator string or expression.
   * @example
   * ```ts
   * $.resource.data.tags.join(",")
   * ```
   */
  join(this: RuleValueProxy<T[]>, separator: RuleValueInput<string>): RuleValueProxy<string>
  /**
   * Returns a new list combining this list with another list.
   * @param values - The list to concatenate.
   * @example
   * ```ts
   * $.resource.data.existingTags.concat($.request.data.newTags)
   * ```
   */
  concat(this: RuleValueProxy<T[]>, values: RuleValueInput<T[]>): RuleValueProxy<T[]>
  /**
   * Returns a new list with all elements from the given set removed.
   * @param values - A set of values to remove.
   * @example
   * ```ts
   * $.resource.data.roles.removeAll(["guest"])
   * ```
   */
  removeAll(values: RuleValueInput<T[]>): RuleValueProxy<T[]>
  /**
   * Returns the list as a set (unique values only).
   * @example
   * ```ts
   * $.resource.data.tags.toSet()
   * ```
   */
  toSet(): RuleValueProxy<T[]>
}

/** Map-specific helper methods available on object/map values. */
type MapMethods<T> = {
  /**
   * Returns the number of key-value pairs in the map.
   * @example
   * ```ts
   * $.resource.data.metadata.size().gt(0)
   * ```
   */
  size(): RuleValueProxy<number>
  /**
   * Returns a list of all keys in the map.
   * @example
   * ```ts
   * $.resource.data.config.keys().hasAny(["enabled", "disabled"])
   * ```
   */
  keys(): RuleValueProxy<(keyof T & string)[]>
  /**
   * Compares this map with another map and returns a diff object with methods to inspect changes.
   * @param other - The map to compare against.
   * @returns A diff proxy with methods: `addedKeys()`, `removedKeys()`, `changedKeys()`, `affectedKeys()`, `unchangedKeys()`.
   * @example
   * ```ts
   * $.resource.data.metadata.diff($.request.resource.data.metadata).changedKeys()
   * ```
   */
  diff(other: Expr): MapDiffProxy
}

/** Return shape of `diff(...)` map helper operations. */
type MapDiffProxy = Expr & {
  /**
   * Returns a set of keys that were added (present in new map but not in old).
   * @example
   * ```ts
   * $.resource.data.tags.diff($.request.resource.data.tags).addedKeys().size()
   * ```
   */
  addedKeys(): RuleValueProxy<string[]>
  /**
   * Returns a set of keys that were affected by any change (added, removed, or modified).
   * @example
   * ```ts
   * $.resource.data.config.diff($.request.resource.data.config).affectedKeys()
   * ```
   */
  affectedKeys(): RuleValueProxy<string[]>
  /**
   * Returns a set of keys whose values changed between old and new maps.
   * @example
   * ```ts
   * $.resource.data.metadata.diff($.request.resource.data.metadata).changedKeys().size().gt(0)
   * ```
   */
  changedKeys(): RuleValueProxy<string[]>
  /**
   * Returns a set of keys that were removed (present in old map but not in new).
   * @example
   * ```ts
   * $.resource.data.tags.diff($.request.resource.data.tags).removedKeys()
   * ```
   */
  removedKeys(): RuleValueProxy<string[]>
  /**
   * Returns a set of keys that remained unchanged between old and new maps.
   * @example
   * ```ts
   * $.resource.data.config.diff($.request.resource.data.config).unchangedKeys()
   * ```
   */
  unchangedKeys(): RuleValueProxy<string[]>
}

declare const __type: unique symbol
/**
 * Typed proxy representation for rule values.
 *
 * Adds common methods to all values, then conditionally augments with list/map
 * methods and recursive property access for object-like values.
 */
type RuleValueProxy<T> = Expr &
  CommonValueMethods<T> &
  (T extends string ? StringMethods : EmptyObject) &
  (T extends readonly (infer U)[] ? ListMethods<U> : EmptyObject) &
  (T extends (infer U)[] ? ListMethods<U> : EmptyObject) &
  (T extends Record<string, unknown>
    ? MapMethods<T> & { [K in StringKeyOf<T>]: RuleValueProxy<T[K]> }
    : EmptyObject) & { [__type]: T }

export type RuleValue<T = unknown> = RuleValueProxy<T>
export type TypeOfRuleValue<T> = T extends RuleValueProxy<any> ? T[typeof __type] : never

/** Proxy shape for `resource` and `request.resource`. */
type ResourceProxy<TDoc> = {
  id: RuleValueProxy<string>
  data: RuleValueProxy<TDoc>
}

/** Proxy shape for `request.auth` that supports both value methods and nested auth fields. */
type RequestAuthProxy<TClaims extends Record<string, unknown>> = RuleValueProxy<{
  uid: string
  token: TClaims
} | null> & {
  uid: RuleValueProxy<string>
  token: RuleValueProxy<TClaims>
} & MapMethods<TClaims>

/** Proxy shape for `request`. */
type RequestProxy<TDoc, TClaims extends Record<string, unknown>> = {
  auth: RequestAuthProxy<TClaims>
  method: RuleValueProxy<string>
  path: RuleValueProxy<string>
  query: {
    limit: RuleValueProxy<number>
    offset: RuleValueProxy<number>
    orderBy: RuleValueProxy<string>
  }
  resource: ResourceProxy<TDoc>
  time: RuleValueProxy<number>
}

/** Proxy shape for a document selected from `db.<collection>(id)`. */
type DbDocProxy<TSubcollections> = {
  exists(): RuleValueProxy<boolean>
  get(): RuleValueProxy<any>
} & {
  [K in StringKeyOf<TSubcollections>]: (id: RuleValueProxy<string>) => TSubcollections[K] extends {
    subcollections: infer TChildSub
  }
    ? DbDocProxy<TChildSub>
    : never
}

/** Proxy shape for root-level `db` collection accessors. */
type DbRootProxy<TCollections> = {
  [K in StringKeyOf<TCollections>]: (id: Expr) => TCollections[K] extends {
    subcollections: infer TSub
  }
    ? DbDocProxy<TSub>
    : never
}

/** Global Firestore helper functions attached to every builder context. */
type GlobalHelpers = {
  /**
   * Returns `true` if the document at `path` exists in the database.
   *
   * Equivalent to the Firestore `exists(/databases/$(database)/documents/...)` built-in.
   *
   * @param path - An expression that evaluates to a document path.
   * @example
   * ```ts
   * $.exists($.resource.data.ref)
   * ```
   */
  exists(path: Expr): Expr

  /**
   * Retrieves the document at `path` as a map. Returns `null` if the document does not exist.
   *
   * Equivalent to the Firestore `get(/databases/$(database)/documents/...)` built-in.
   *
   * @param path - An expression that evaluates to a document path.
   * @example
   * ```ts
   * $.get($.resource.data.ref).data.field
   * ```
   */
  get(path: Expr): Expr

  /**
   * Retrieves the document at `path` as it will appear after the current write operation completes.
   * Useful in write rules to inspect the resulting state of related documents.
   *
   * Equivalent to the Firestore `getAfter(/databases/$(database)/documents/...)` built-in.
   *
   * @param path - An expression that evaluates to a document path.
   * @example
   * ```ts
   * $.getAfter($.resource.data.ref).data.status
   * ```
   */
  getAfter(path: Expr): Expr

  /**
   * Combines two or more boolean expressions with logical AND (`&&`).
   * Expressions are folded left-to-right, so `$.and(a, b, c)` produces `a && b && c`.
   *
   * @param conditions - At least two expressions, all of which must be truthy for the result to be `true`.
   * @example
   * ```ts
   * $.and(
   *   $.isSignedIn(),
   *   $.isInOrg($.params.orgId),
   *   $.not($.resource.data.archived),
   * )
   * ```
   */
  and(...conditions: [Expr, Expr, ...Expr[]]): Expr

  /**
   * Combines two or more boolean expressions with logical OR (`||`).
   * Expressions are folded left-to-right, so `$.or(a, b, c)` produces `a || b || c`.
   *
   * @param conditions - At least two expressions; the result is `true` if any one is truthy.
   * @example
   * ```ts
   * $.or(
   *   $.isAdmin(),
   *   $.isOwnerOf($.resource.data.ownerId),
   * )
   * ```
   */
  or(...conditions: [Expr, Expr, ...Expr[]]): Expr

  /**
   * Negates a boolean expression with logical NOT (`!`).
   *
   * @param condition - The expression to negate.
   * @example
   * ```ts
   * $.not($.resource.data.plan.eq("free"))
   * ```
   */
  not(condition: Expr): Expr

  /**
   * Ternary-style conditional expression helper.
   *
   * @param test - Condition expression to evaluate.
   * @param consequent - Returned when `test` is truthy.
   * @param alternate - Returned when `test` is falsy.
   * @example
   * ```ts
   * $.ifElse($.request.auth.neq(null), $.request.auth.uid, "anonymous")
   * ```
   */
  ifElse<TConsequent, TAlternate>(
    test: Expr,
    consequent: TConsequent,
    alternate: TAlternate,
  ): RuleValue<IfElseResultValue<TConsequent, TAlternate>>

  /**
   * Switch/case style helper built on nested conditional expressions.
   *
   * Cases are evaluated in order and the first match wins.
   *
   * @param value - The value to compare against each case key.
   * @param cases - Ordered `[caseValue, result]` pairs.
   * @param fallback - Result used when no case matches.
   * @example
   * ```ts
   * $.switchCase($.resource.data.plan, [["free", 1], ["pro", 2]], 0)
   * ```
   */
  switchCase<T, R>(
    value: RuleValueInput<T>,
    cases: readonly (readonly [RuleValueInput<T>, RuleValueInput<R>])[],
    fallback: RuleValueInput<R>,
  ): RuleValueProxy<R>

  /**
   * Returns `true` when all members in a dotted path are non-null.
   *
   * @param root - Root object expression to start from.
   * @param path - Dotted path string (`"auth.token.roles"`, etc).
   * @example
   * ```ts
   * $.hasPath($.request, "auth.token.roles")
   * ```
   */
  hasPath<TRoot extends Record<string, unknown>>(
    root: TRoot,
    path: DotPath<TRoot>,
  ): RuleValue<boolean>

  /** Firestore `duration` built-in helpers for working with timestamp durations. */
  duration: {
    /**
     * Returns the absolute value of a duration.
     * @param value - A duration expression.
     */
    abs(value: Expr): Expr
    /**
     * Creates a duration from individual time components.
     * @param hours - Hours component.
     * @param mins - Minutes component.
     * @param secs - Seconds component.
     * @param nanos - Nanoseconds component.
     */
    time(hours: Expr, mins: Expr, secs: Expr, nanos: Expr): Expr
    /**
     * Creates a duration from a numeric value and a unit string (e.g. `"h"`, `"m"`, `"s"`).
     * @param value - The magnitude.
     * @param unit - The unit string.
     */
    value(value: Expr, unit: Expr): Expr
  }

  /** Firestore `hashing` built-in helpers for computing content hashes. */
  hashing: {
    /**
     * Returns the MD5 hash of a value as a hex string.
     * @param value - The value to hash.
     */
    md5(value: Expr): Expr
    /**
     * Returns the SHA-256 hash of a value as a hex string.
     * @param value - The value to hash.
     */
    sha256(value: Expr): Expr
  }

  /** Firestore `math` built-in helpers for numeric operations. */
  math: {
    /**
     * Returns the absolute value of a number.
     * @param value - A numeric expression.
     */
    abs(value: Expr): Expr
    /**
     * Returns the smallest integer greater than or equal to `value`.
     * @param value - A numeric expression.
     */
    ceil(value: Expr): Expr
    /**
     * Returns the largest integer less than or equal to `value`.
     * @param value - A numeric expression.
     */
    floor(value: Expr): Expr
    /**
     * Returns `base` raised to the power of `exponent`.
     * @param base - The base numeric expression.
     * @param exponent - The exponent numeric expression.
     */
    pow(base: Expr, exponent: Expr): Expr
    /**
     * Returns `value` rounded to the nearest integer.
     * @param value - A numeric expression.
     */
    round(value: Expr): Expr
    /**
     * Returns the square root of `value`.
     * @param value - A numeric expression.
     */
    sqrt(value: Expr): Expr
  }

  /**
   * Binary operator helper for explicit comparison and arithmetic operations.
   * Provides a strongly-typed fallback for any binary operator that doesn't have a dedicated method.
   *
   * @param left - The left-hand side expression.
   * @param operator - The binary operator as a string (e.g., `"<"`, `">"`, `"=="`, `"+"`, `"%"`, `"in"`).
   * @param right - The right-hand side expression.
   * @example
   * ```ts
   * // Instead of: $.request.resource.data.expiresAt.gt($.request.time)
   * $.op($.request.resource.data.expiresAt, ">", $.request.time)
   * ```
   */
  op(left: Expr, operator: BinaryOperator, right: Expr): Expr
}

/**
 * Full builder context shape available inside match/helper callbacks.
 */
export type BuilderContext<
  Db extends DatabaseDefinition<unknown, Record<string, unknown>>,
  AtPath extends string,
  THelpers extends Record<string, unknown> = EmptyObject,
> = {
  db: DbRootProxy<Db["collections"]>
  params: PathParams<AtPath>
  request: RequestProxy<DocumentAtPath<Db, AtPath>, CustomClaimsOf<Db>>
  resource: ResourceProxy<DocumentAtPath<Db, AtPath>>
  sub: SubcollectionsAtPath<Db, AtPath>
} & GlobalHelpers &
  THelpers

/**
 * Runtime construction options for `createBuilderContext(...)`.
 */
export interface CreateBuilderContextOptions<
  Db extends DatabaseDefinition<unknown, Record<string, unknown>>,
  AtPath extends string,
> {
  /** Optional match path pattern used to resolve `params.<name>` proxies. */
  pathPattern?: string
  /** Optional concrete collections map for runtime access checks. */
  collections?: Db["collections"]
  /** Optional custom claims value map used to narrow token properties at runtime. */
  customClaims?: CustomClaimsOf<Db>
  /** Optional helper manager that injects merged helper namespaces. */
  helperManager?: {
    attachToContext(context: BuilderContext<Db, AtPath>): Record<string, unknown>
  }
  /** Optional explicit subcollection map for current path scope. */
  subcollections?: SubcollectionsAtPath<Db, AtPath>
}

/** Converts primitive/public expression values into expression nodes. */
function toExpressionNode(value: RuleValueInput<any>): ExpressionNode {
  if (typeof value === "string") return stringLiteral(value)
  if (typeof value === "number") return numberLiteral(value)
  if (typeof value === "boolean") return booleanLiteral(value)
  if (value === null) return nullLiteral()
  if (Array.isArray(value)) return listLiteral(value.map((item) => toExpressionNode(item)))

  if (typeof value === "object" && value && !("kind" in value)) {
    return mapLiteral(
      Object.entries(value).map(([key, entryValue]) =>
        mapEntry(stringLiteral(key), toExpressionNode(entryValue)),
      ),
    )
  }
  return value
}

/** Builds consistent unknown-property error messages for proxy contexts. */
function unknownPropertyError(scope: string, prop: string, known?: readonly string[]): Error {
  if (known && known.length > 0) {
    return new Error(`Unknown ${scope} property "${prop}". Known properties: ${known.join(", ")}.`)
  }
  return new Error(`Unknown ${scope} property "${prop}".`)
}

/**
 * Creates a handler for a rule-value proxy rooted at an expression node.
 *
 * The handler lazily resolves members/methods into AST expressions and caches
 * the generated proxy entries by property name.
 *
 * @internal
 * @ts-expect-error Runtime proxy dispatch intentionally uses dynamic `any` access.
 */
function createRuleValueProxyHandler(
  baseExpr: ExpressionNode,
  fieldPath: string[] = [],
): ProxyHandler<any> {
  const cache = new Map<string, any>()

  return {
    get(target: any, prop: string | symbol) {
      if (typeof prop !== "string") return undefined

      // Surface native ExpressionNode members first to preserve compatibility.
      if (prop in target) return target[prop]

      if (cache.has(prop)) return cache.get(prop)

      // Common value methods: is, eq, neq, gt, gte, lt, lte
      if (prop === "is") {
        const fn = (typeName: FirestoreTypeName) => {
          return wrapExpressionInProxy(isExpression(baseExpr, typeName))
        }
        cache.set(prop, fn)
        return fn
      }
      if (prop === "eq") {
        const fn = (other: any) =>
          wrapExpressionInProxy(binaryExpression("==", baseExpr, toExpressionNode(other)))
        cache.set(prop, fn)
        return fn
      }
      if (prop === "neq") {
        const fn = (other: any) =>
          wrapExpressionInProxy(binaryExpression("!=", baseExpr, toExpressionNode(other)))
        cache.set(prop, fn)
        return fn
      }
      if (prop === "gt") {
        const fn = (other: any) =>
          wrapExpressionInProxy(binaryExpression(">", baseExpr, toExpressionNode(other)))
        cache.set(prop, fn)
        return fn
      }
      if (prop === "gte") {
        const fn = (other: any) =>
          wrapExpressionInProxy(binaryExpression(">=", baseExpr, toExpressionNode(other)))
        cache.set(prop, fn)
        return fn
      }
      if (prop === "lt") {
        const fn = (other: any) =>
          wrapExpressionInProxy(binaryExpression("<", baseExpr, toExpressionNode(other)))
        cache.set(prop, fn)
        return fn
      }
      if (prop === "lte") {
        const fn = (other: any) =>
          wrapExpressionInProxy(binaryExpression("<=", baseExpr, toExpressionNode(other)))
        cache.set(prop, fn)
        return fn
      }
      if (prop === "plus") {
        const fn = (other: any) =>
          wrapExpressionInProxy(binaryExpression("+", baseExpr, toExpressionNode(other)))
        cache.set(prop, fn)
        return fn
      }
      if (prop === "minus") {
        const fn = (other: any) =>
          wrapExpressionInProxy(binaryExpression("-", baseExpr, toExpressionNode(other)))
        cache.set(prop, fn)
        return fn
      }
      if (prop === "multiply") {
        const fn = (other: any) =>
          wrapExpressionInProxy(binaryExpression("*", baseExpr, toExpressionNode(other)))
        cache.set(prop, fn)
        return fn
      }
      if (prop === "divide") {
        const fn = (other: any) =>
          wrapExpressionInProxy(binaryExpression("/", baseExpr, toExpressionNode(other)))
        cache.set(prop, fn)
        return fn
      }
      if (prop === "modulo") {
        const fn = (other: any) =>
          wrapExpressionInProxy(binaryExpression("%", baseExpr, toExpressionNode(other)))
        cache.set(prop, fn)
        return fn
      }

      if (prop === "lower") {
        const fn = () => wrapExpressionInProxy(callMethod(baseExpr, "lower", []))
        cache.set(prop, fn)
        return fn
      }
      if (prop === "upper") {
        const fn = () => wrapExpressionInProxy(callMethod(baseExpr, "upper", []))
        cache.set(prop, fn)
        return fn
      }
      if (prop === "trim") {
        const fn = () => wrapExpressionInProxy(callMethod(baseExpr, "trim", []))
        cache.set(prop, fn)
        return fn
      }
      if (prop === "matches") {
        const fn = (re: any) =>
          wrapExpressionInProxy(callMethod(baseExpr, "matches", [toExpressionNode(re)]))
        cache.set(prop, fn)
        return fn
      }
      if (prop === "replace") {
        const fn = (re: any, sub: any) =>
          wrapExpressionInProxy(
            callMethod(baseExpr, "replace", [toExpressionNode(re), toExpressionNode(sub)]),
          )
        cache.set(prop, fn)
        return fn
      }
      if (prop === "split") {
        const fn = (separator: any) =>
          wrapExpressionInProxy(callMethod(baseExpr, "split", [toExpressionNode(separator)]))
        cache.set(prop, fn)
        return fn
      }
      if (prop === "toUtf8Bytes") {
        const fn = () => wrapExpressionInProxy(callMethod(baseExpr, "toUtf8Bytes", []))
        cache.set(prop, fn)
        return fn
      }

      // List methods: size, hasAll, hasAny, hasOnly, join, concat, removeAll, toSet
      if (prop === "size") {
        const fn = () => wrapExpressionInProxy(sizeOf(baseExpr))
        cache.set(prop, fn)
        return fn
      }
      if (prop === "hasAll") {
        const fn = (values: any) =>
          wrapExpressionInProxy(hasAll(baseExpr, toExpressionNode(values)))
        cache.set(prop, fn)
        return fn
      }
      if (prop === "hasAny") {
        const fn = (values: any) =>
          wrapExpressionInProxy(hasAny(baseExpr, toExpressionNode(values)))
        cache.set(prop, fn)
        return fn
      }
      if (prop === "hasOnly") {
        const fn = (values: any) =>
          wrapExpressionInProxy(hasOnly(baseExpr, toExpressionNode(values)))
        cache.set(prop, fn)
        return fn
      }
      if (prop === "join") {
        const fn = (separator: any) =>
          wrapExpressionInProxy(joinList(baseExpr, toExpressionNode(separator)))
        cache.set(prop, fn)
        return fn
      }
      if (prop === "concat") {
        const fn = (other: any) =>
          wrapExpressionInProxy(concatLists(baseExpr, toExpressionNode(other)))
        cache.set(prop, fn)
        return fn
      }
      if (prop === "removeAll") {
        const fn = (values: any) =>
          wrapExpressionInProxy(removeAll(baseExpr, toExpressionNode(values)))
        cache.set(prop, fn)
        return fn
      }
      if (prop === "toSet") {
        const fn = () => wrapExpressionInProxy(toSet(baseExpr))
        cache.set(prop, fn)
        return fn
      }

      // Map methods: keys, diff
      if (prop === "keys") {
        const fn = () => wrapExpressionInProxy(keysOf(baseExpr))
        cache.set(prop, fn)
        return fn
      }
      if (prop === "diff") {
        const fn = (other: any) => {
          const diffResult = diffMap(baseExpr, other)
          return new Proxy(diffResult, {
            get(_, methodProp: string | symbol) {
              if (typeof methodProp !== "string") return undefined
              if (methodProp === "addedKeys")
                return () => wrapExpressionInProxy(addedKeys(diffResult))
              if (methodProp === "removedKeys")
                return () => wrapExpressionInProxy(removedKeys(diffResult))
              if (methodProp === "changedKeys")
                return () => wrapExpressionInProxy(changedKeys(diffResult))
              if (methodProp === "affectedKeys")
                return () => wrapExpressionInProxy(affectedKeys(diffResult))
              if (methodProp === "unchangedKeys")
                return () => wrapExpressionInProxy(unchangedKeys(diffResult))
              throw unknownPropertyError("diff", methodProp, [
                "addedKeys",
                "removedKeys",
                "changedKeys",
                "affectedKeys",
                "unchangedKeys",
              ])
            },
          })
        }
        cache.set(prop, fn)
        return fn
      }

      // Fallback to nested field access (resource/request-resource style chains).
      const fieldExpr = resourceDataField([...fieldPath, prop])
      const result = new Proxy(
        fieldExpr,
        createRuleValueProxyHandler(fieldExpr, [...fieldPath, prop]),
      )
      cache.set(prop, result)
      return result
    },
  }
}

/**
 * Creates a proxy for `request.auth.token` that is optionally narrowed to
 * known custom claim keys.
 *
 * @internal
 * @ts-expect-error Runtime proxy dispatch intentionally uses dynamic `any` access.
 */
function createTokenProxy(claims: Record<string, unknown>): any {
  const cache = new Map<string, any>()
  const claimKeys = Object.keys(claims)
  const hasClaimSchema = claimKeys.length > 0

  return new Proxy(
    {},
    {
      get(_, prop: string | symbol) {
        if (typeof prop !== "string") return undefined
        if (hasClaimSchema && !claimKeys.includes(prop)) {
          throw unknownPropertyError("request.auth.token", prop, claimKeys)
        }
        if (cache.has(prop)) return cache.get(prop)

        const expr = requestAuthTokenClaim(prop)
        const result = new Proxy(expr, createRuleValueProxyHandler(expr))
        cache.set(prop, result)
        return result
      },
    },
  )
}

/**
 * Creates a proxy for `resource.data` field access.
 *
 * @internal
 * @ts-expect-error Runtime proxy dispatch intentionally uses dynamic `any` access.
 */
function createResourceDataProxy(): any {
  return new Proxy({}, createRuleValueProxyHandler(resourceData(), []))
}

/**
 * Creates a proxy for `request.resource.data` field access.
 *
 * @internal
 * @ts-expect-error Runtime proxy dispatch intentionally uses dynamic `any` access.
 */
function createRequestResourceDataProxy(): any {
  return new Proxy({}, createRuleValueProxyHandler(requestResourceData(), []))
}

/**
 * Creates a proxy for document helpers under `db.<collection>(id)`.
 *
 * @internal
 * @ts-expect-error Runtime proxy dispatch intentionally uses dynamic `any` access.
 */
function createDbDocProxy(collectionPath: string, subcollections: Record<string, unknown>): any {
  const cache = new Map<string, any>()
  const subKeys = Object.keys(subcollections)
  const hasKnownSubcollections = subKeys.length > 0

  return new Proxy(
    {},
    {
      get(_, prop: string | symbol) {
        if (typeof prop !== "string") return undefined

        // Handle exists() and get() methods
        if (prop === "exists") {
          const fn = () => {
            const pathExpr = callExpression(identifier("path"), [identifier(collectionPath)])
            return wrapExpressionInProxy(existsMethod(pathExpr))
          }
          return fn
        }
        if (prop === "get") {
          const fn = () => {
            const pathExpr = callExpression(identifier("path"), [identifier(collectionPath)])
            return wrapExpressionInProxy(get(pathExpr))
          }
          return fn
        }

        // Restrict known subcollection names when schema metadata is present.
        if (!hasKnownSubcollections || subKeys.includes(prop)) {
          if (cache.has(prop)) return cache.get(prop)

          const fn = (/* _id: any */) => {
            const newPath = `${collectionPath}/${prop}/{id}`
            return createDbDocProxy(newPath, {})
          }
          cache.set(prop, fn)
          return fn
        }

        throw unknownPropertyError(`db document path "${collectionPath}"`, prop, subKeys)
      },
    },
  )
}

/**
 * Creates the root `db` proxy for collection traversal.
 *
 * @internal
 * @ts-expect-error Runtime proxy dispatch intentionally uses dynamic `any` access.
 */
function createDbRootProxy(collections: Record<string, unknown>): any {
  const cache = new Map<string, any>()
  const collectionKeys = Object.keys(collections)
  const hasKnownCollections = collectionKeys.length > 0

  return new Proxy(
    {},
    {
      get(_, prop: string | symbol) {
        if (typeof prop !== "string") return undefined
        if (hasKnownCollections && !collectionKeys.includes(prop)) {
          throw unknownPropertyError("db", prop, collectionKeys)
        }
        if (cache.has(prop)) return cache.get(prop)

        const fn = (/* id: any */) => {
          return createDbDocProxy(prop, {})
        }
        cache.set(prop, fn)
        return fn
      },
    },
  )
}

/**
 * Wraps expression nodes in the value-proxy handler.
 *
 * @internal
 * @ts-expect-error Runtime proxy dispatch intentionally uses dynamic `any` access.
 */
function wrapExpressionInProxy(expr: ExpressionNode): any {
  return new Proxy(expr, createRuleValueProxyHandler(expr, []))
}

/**
 * Converts an expression node into a typed `RuleValue` proxy.
 */
export function proxyRuleValue<T = unknown>(expr: ExpressionNode): RuleValue<T> {
  return wrapExpressionInProxy(expr) as RuleValue<T>
}

/**
 * Creates `request.query` proxy helpers.
 *
 * @internal
 */
function createQueryProxy(): any {
  return new Proxy(
    {},
    {
      get(_, prop: string | symbol) {
        if (prop === "limit") return wrapExpressionInProxy(requestQueryLimit())
        if (prop === "offset") return wrapExpressionInProxy(requestQueryOffset())
        if (prop === "orderBy") return wrapExpressionInProxy(requestQueryOrderBy())
        if (typeof prop === "string") {
          throw unknownPropertyError("request.query", prop, ["limit", "offset", "orderBy"])
        }
        return undefined
      },
    },
  )
}

/**
 * Creates `request.auth` proxy helpers.
 *
 * @internal
 */
function createAuthProxy(claims: Record<string, unknown>): any {
  const authExpr = wrapExpressionInProxy(requestAuth())
  const methodProps = new Set([
    "is",
    "eq",
    "neq",
    "gt",
    "gte",
    "lt",
    "lte",
    "plus",
    "minus",
    "multiply",
    "divide",
    "modulo",
    "size",
    "keys",
    "diff",
  ])

  return new Proxy(
    {},
    {
      get(_, prop: string | symbol) {
        if (prop === "uid") return wrapExpressionInProxy(requestAuthUid())
        if (prop === "token") return createTokenProxy(claims)
        if (typeof prop === "string" && methodProps.has(prop)) {
          return (authExpr as Record<string, unknown>)[prop]
        }
        if (typeof prop === "string") {
          throw unknownPropertyError("request.auth", prop, [
            "uid",
            "token",
            "is",
            "eq",
            "neq",
            "gt",
            "gte",
            "lt",
            "lte",
            "plus",
            "minus",
            "multiply",
            "divide",
            "modulo",
            "size",
            "keys",
            "diff",
          ])
        }
        return undefined
      },
    },
  )
}

/**
 * Creates `params` proxy helpers bound to a match path pattern.
 *
 * Accessing `params.<name>` returns an expression proxy for the same path
 * variable identifier when `<name>` exists in the path pattern.
 *
 * @internal
 */
function createParamsProxy(pathPattern: string): any {
  const names = extractPathParamNames(pathPattern)
  return new Proxy(
    {},
    {
      get(_, prop: string | symbol) {
        if (typeof prop !== "string") return undefined
        if (!names.has(prop)) {
          throw unknownPropertyError("params", prop, Array.from(names))
        }
        return wrapExpressionInProxy(identifier(prop))
      },
    },
  )
}

/**
 * Creates a typed builder context at a specific database path.
 *
 * @typeParam Db - Database definition with collections and custom claims shape.
 * @typeParam AtPath - Full path to the document location (e.g., "users/{userId}/posts/{postId}").
 *
 * @example
 * ```ts
 * const ctx = createBuilderContext<MyDb, "users/{userId}">();
 * // ctx.params => { userId: string }
 * // ctx.request.auth.token.xxxxx => auto-complete only shows custom claims
 * // ctx.resource.data.xxx => typed access to user document fields
 * ```
 */
export function createBuilderContext<
  Db extends DatabaseDefinition<unknown, Record<string, unknown>>,
  AtPath extends string,
  THelpers extends Record<string, unknown> = EmptyObject,
>(options: CreateBuilderContextOptions<Db, AtPath> = {}): BuilderContext<Db, AtPath, THelpers> {
  const customClaims = (options.customClaims ?? {}) as CustomClaimsOf<Db>
  const subcollections = (options.subcollections ?? {}) as SubcollectionsAtPath<Db, AtPath>
  const params = createParamsProxy(options.pathPattern ?? "") as PathParams<AtPath>

  // Build proxy roots first, then stitch them into one context object.
  const db = createDbRootProxy(options.collections ?? {})
  const resource = {
    id: wrapExpressionInProxy(resourceId()),
    data: createResourceDataProxy(),
  }
  const request = {
    auth: createAuthProxy(customClaims),
    method: wrapExpressionInProxy(requestMethod()),
    path: wrapExpressionInProxy(requestPath()),
    query: createQueryProxy(),
    resource: {
      id: wrapExpressionInProxy(memberExpression(requestResource(), identifier("id"))),
      data: createRequestResourceDataProxy(),
    },
    time: wrapExpressionInProxy(requestTime()),
  }

  // Global helpers intentionally return proxied expressions for fluent chaining.
  const duration = {
    abs: (value: any) => wrapExpressionInProxy(durationAbs(toExpressionNode(value))),
    time: (hours: any, mins: any, secs: any, nanos: any) =>
      wrapExpressionInProxy(
        durationTime(
          toExpressionNode(hours),
          toExpressionNode(mins),
          toExpressionNode(secs),
          toExpressionNode(nanos),
        ),
      ),
    value: (value: any, unit: any) =>
      wrapExpressionInProxy(durationValue(toExpressionNode(value), unit)),
  }
  const hashing = {
    md5: (value: any) => wrapExpressionInProxy(callHelper("md5", [toExpressionNode(value)])),
    sha256: (value: any) => wrapExpressionInProxy(callHelper("sha256", [toExpressionNode(value)])),
  }
  const math = {
    abs: (value: any) => wrapExpressionInProxy(callHelper("abs", [toExpressionNode(value)])),
    ceil: (value: any) => wrapExpressionInProxy(callHelper("ceil", [toExpressionNode(value)])),
    floor: (value: any) => wrapExpressionInProxy(callHelper("floor", [toExpressionNode(value)])),
    pow: (base: any, exponent: any) =>
      wrapExpressionInProxy(
        callHelper("pow", [toExpressionNode(base), toExpressionNode(exponent)]),
      ),
    round: (value: any) => wrapExpressionInProxy(callHelper("round", [toExpressionNode(value)])),
    sqrt: (value: any) => wrapExpressionInProxy(callHelper("sqrt", [toExpressionNode(value)])),
  }

  const baseContext = {
    db,
    params,
    request,
    resource,
    sub: subcollections,
    exists: (path: any) => wrapExpressionInProxy(exists(toExpressionNode(path))),
    get: (path: any) => wrapExpressionInProxy(get(toExpressionNode(path))),
    getAfter: (path: any) => wrapExpressionInProxy(getAfter(toExpressionNode(path))),
    and: (...conditions: any[]) =>
      wrapExpressionInProxy(
        conditions
          .map((c: any) => toExpressionNode(c))
          .reduce((acc: ExpressionNode, cur: ExpressionNode) => logicalExpression("&&", acc, cur)),
      ),
    or: (...conditions: any[]) =>
      wrapExpressionInProxy(
        conditions
          .map((c: any) => toExpressionNode(c))
          .reduce((acc: ExpressionNode, cur: ExpressionNode) => logicalExpression("||", acc, cur)),
      ),
    not: (condition: any) =>
      wrapExpressionInProxy(unaryExpression("!", toExpressionNode(condition))),
    ifElse: (test: any, consequent: any, alternate: any) =>
      wrapExpressionInProxy(
        conditionalExpression(
          toExpressionNode(test),
          toExpressionNode(consequent),
          toExpressionNode(alternate),
        ),
      ),
    switchCase: (value: any, cases: readonly (readonly [any, any])[], fallback: any) => {
      const valueExpr = toExpressionNode(value)
      const folded = [...cases].reverse().reduce((acc, [caseValue, result]) => {
        return conditionalExpression(
          binaryExpression("==", valueExpr, toExpressionNode(caseValue)),
          toExpressionNode(result),
          acc,
        )
      }, toExpressionNode(fallback))
      return wrapExpressionInProxy(folded)
    },
    hasPath: (root: any, path: string) => {
      const flatSegments = path.split(".").filter(Boolean)
      if (flatSegments.length === 0) {
        throw new Error("hasPath requires a non-empty dotted path.")
      }

      let currentExpr: ExpressionNode
      let startIndex = 0

      const looksLikeRequestRoot =
        typeof root === "object" &&
        root !== null &&
        ["auth", "method", "path", "query", "resource", "time"].every((key) => key in root)
      const looksLikeResourceRoot =
        typeof root === "object" && root !== null && ["id", "data"].every((key) => key in root)

      if (looksLikeRequestRoot) {
        currentExpr = identifier("request")
      } else if (looksLikeResourceRoot) {
        currentExpr = identifier("resource")
      } else if (typeof root === "object" && root && !("kind" in root)) {
        const firstSegment = flatSegments[0]
        if (!firstSegment) {
          throw new Error("hasPath requires a non-empty dotted path.")
        }

        currentExpr = toExpressionNode(
          (root as Record<string, unknown>)[firstSegment] as RuleValueInput<any>,
        )
        startIndex = 1
      } else {
        currentExpr = toExpressionNode(root)
      }

      let chainValid: ExpressionNode | undefined =
        looksLikeRequestRoot || looksLikeResourceRoot
          ? undefined
          : binaryExpression("!=", currentExpr, nullLiteral())

      for (const segment of flatSegments.slice(startIndex)) {
        currentExpr = memberExpression(currentExpr, identifier(segment))
        const memberCheck = binaryExpression("!=", currentExpr, nullLiteral())
        chainValid = chainValid ? logicalExpression("&&", chainValid, memberCheck) : memberCheck
      }

      return wrapExpressionInProxy(chainValid ?? booleanLiteral(true))
    },
    op: (left: any, operator: BinaryOperator, right: any) =>
      wrapExpressionInProxy(
        binaryExpression(operator, toExpressionNode(left), toExpressionNode(right)),
      ),
    duration,
    hashing,
    math,
  }

  // Helper manager merges in registered helper namespaces for this scope.
  const helperValues = options.helperManager?.attachToContext(baseContext)

  return Object.assign(baseContext, helperValues ?? {}) as BuilderContext<Db, AtPath, THelpers>
}
