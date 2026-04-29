import type { RuleExpression } from "./expression"
import type { RuleContext } from "./tools"

/**
 * Represents a single collection in the Firestore database schema.
 *
 * @template TData - The type of data fields in documents of this collection
 * @template TChildren - The type of nested subcollections
 *
 * @example
 * ```typescript
 * interface User extends DbCollection<{
 *   name: string
 *   email: string
 * }, {
 *   posts: DbCollection<{ title: string }>
 * }> {}
 * ```
 */
export interface DbCollection<
  TData extends Record<string, unknown> = Record<string, unknown>,
  TChildren extends DbNamespace = DbNamespace,
> {
  data: TData
  children?: TChildren
}

/**
 * A record of collections making up a namespace or database.
 *
 * Maps collection names to their DbCollection definitions.
 */
export type DbNamespace = Record<string, DbCollection>

/**
 * The root schema of a Firestore database, defining all root-level collections.
 *
 * @example
 * ```typescript
 * interface MyDbSchema {
 *   users: DbCollection<{ name: string }>
 *   posts: DbCollection<{ title: string }>
 * }
 * ```
 */
export type DbSchema = DbNamespace

/**
 * A Firestore Security Rule operation type.
 *
 * Firestore supports these operations for access control:
 * - `read`: Allows both `get` and `list` operations
 * - `write`: Allows both `create` and `update` operations
 * - `get`: Read a single document
 * - `list`: List documents in a collection
 * - `create`: Create a new document
 * - `update`: Modify an existing document
 * - `delete`: Remove a document
 */
export type Operation = "read" | "write" | "get" | "list" | "create" | "update" | "delete"

/**
 * A mapping of operations to their allowed rule expressions.
 *
 * Each operation that has an entry will be rendered in the generated rules.
 *
 * @example
 * ```typescript
 * const rules: RuleMap = {
 *   read: ctx.isset(ctx.request.auth.uid),
 *   write: ctx.false,
 *   create: ctx.eq(ctx.resource.data.owner, ctx.request.auth.uid)
 * }
 * ```
 */
export type RuleMap = Partial<Record<Operation, RuleExpression>>

/**
 * Helper type for extending a parameters record with a new key.
 *
 * @template Params - The existing parameters
 * @template Key - The new parameter key to add
 *
 * @example
 * ```typescript
 * type OldParams = { userId: string }
 * type NewParams = ExtendParams<OldParams, "postId"> // { userId: string; postId: string }
 * ```
 */
export type ExtendParams<Params extends Record<string, string>, Key extends string> = Params &
  Record<Key, string>

/**
 * Interface for defining rules on a nested collection via the fluent API.
 *
 * @template C - The collection being configured
 * @template Params - The path parameters available in this context
 * @template Lib - The available helper functions
 *
 * @example
 * ```typescript
 * collection
 *   .rules((children) => {
 *     children.posts(($) => ({
 *       read: $.true
 *     }))
 *   })
 * ```
 */
export interface CollectionBuilder<
  C extends DbCollection,
  Params extends Record<string, string>,
  Lib,
> {
  rules(
    callback: (children: NamespaceApi<NonNullable<C["children"]>, Params, Lib>) => void,
  ): CollectionBuilder<C, Params, Lib>
}

/**
 * Proxy type that provides typed access to collections in a namespace.
 *
 * Each collection name becomes a method that accepts a callback for defining rules.
 * Enables strongly-typed, autocomplete-friendly collection navigation.
 *
 * @template NS - The namespace type defining available collections
 * @template Params - The current path parameters
 * @template Lib - The available helper functions
 *
 * @example
 * ```typescript
 * // Returns an autocomplete-friendly interface
 * ns.users(($) => ({ read: $.true }))
 * ns.posts(($) => ({ write: $.false }))
 * ```
 */
export type NamespaceApi<NS extends DbNamespace, Params extends Record<string, string>, Lib> = {
  [K in keyof NS]: (
    callback: (
      context: RuleContext<NS[K]["data"], ExtendParams<Params, Extract<K, string>>, Lib>,
    ) => RuleMap,
  ) => CollectionBuilder<NS[K], ExtendParams<Params, Extract<K, string>>, Lib>
}

export interface FormattingOptions {
  /**
   * If true, comments will be stripped from the generated output.
   * Default is false (comments are included).
   */
  stripComments?: boolean
  /**
   * Current indentation level.
   * Default is 0 (no indentation).
   */
  indentationLevel?: number
}
