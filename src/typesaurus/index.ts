/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Typesaurus, TypesaurusCore } from "typesaurus"

import type { CollectionShape, CustomClaimsShape, DatabaseDefinition } from "../builder/db"
import {
  createAstRulesBuilder,
  type FirestoreAstRulesBuilder,
  type RulesBuilderOptions,
} from "../builder/rules-builder"

type EmptyClaims = Record<never, never>
type EmptyCollections = Record<never, never>

type AnyTypesaurusSchema = Typesaurus.Schema<any>
type AnyTypesaurusDB = TypesaurusCore.DB<any>

type FromTypesaurusSchema<S extends AnyTypesaurusSchema> = {
  [Collection in keyof S & string]: CollectionShape<
    S[Collection]["ServerData"],
    S[Collection]["sub"] extends never
      ? EmptyCollections
      : FromTypesaurusSchema<S[Collection]["sub"]>
  >
}

/**
 * Converts a Typesaurus schema (or DB instance type) into a collection map compatible
 * with the new builder DatabaseDefinition shape.
 */
export type TypesaurusCollections<T extends AnyTypesaurusSchema | AnyTypesaurusDB> =
  T extends AnyTypesaurusSchema
    ? FromTypesaurusSchema<T>
    : T extends AnyTypesaurusDB
      ? FromTypesaurusSchema<Typesaurus.Schema<T>>
      : never

/**
 * Builds a builder-compatible DatabaseDefinition from a Typesaurus schema (or DB instance).
 *
 * Custom claims are provided as a second generic argument.
 */
export type TypesaurusDatabaseDefinition<
  T extends AnyTypesaurusSchema | AnyTypesaurusDB,
  TCustomClaims extends CustomClaimsShape = EmptyClaims,
> = DatabaseDefinition<TypesaurusCollections<T>, TCustomClaims>

/**
 * Backward-compatible alias for consumers already using OfTypesaurus.
 */
export type OfTypesaurus<
  T extends AnyTypesaurusSchema | AnyTypesaurusDB,
  TCustomClaims extends CustomClaimsShape = EmptyClaims,
> = TypesaurusDatabaseDefinition<T, TCustomClaims>

/** Internal empty-helper baseline used as the starting Lib generic. */
type EmptyLib = Record<never, never>

/**
 * Creates an AST-native rules builder directly from a Typesaurus db or schema value.
 *
 * The runtime value is only used for generic type inference and is never read at
 * runtime. This avoids having to write out `TypesaurusDatabaseDefinition<typeof db>`
 * by hand when the database instance is already available.
 *
 * @typeParam T - Typesaurus db instance or schema type.
 * @typeParam TCustomClaims - Optional `request.auth.token` claims shape.
 * @param _db - Typesaurus db/schema value used for type inference only.
 * @param options - Optional builder rendering options.
 * @returns Root AST-native rules builder typed from the Typesaurus model.
 *
 * @example
 * ```ts
 * import { createTypesaurusRulesBuilder } from "firestore-rules-dsl/typesaurus"
 *
 * const db = schema(($) => ({ users: $.collection<User>() }))
 *
 * const builder = createTypesaurusRulesBuilder(db)
 * builder.matches((match) => {
 *   match("users/{userId}", (users, $) => {
 *     users.allow("read", $.request.auth.uid.neq(null))
 *   })
 * })
 * ```
 */
export function createTypesaurusRulesBuilder<
  T extends AnyTypesaurusSchema | AnyTypesaurusDB,
  TCustomClaims extends CustomClaimsShape = EmptyClaims,
>(
  _db: T,
  options: RulesBuilderOptions = {},
): FirestoreAstRulesBuilder<
  TypesaurusDatabaseDefinition<T, TCustomClaims>,
  TypesaurusCollections<T>,
  "",
  EmptyLib
> {
  return createAstRulesBuilder<TypesaurusDatabaseDefinition<T, TCustomClaims>>(options)
}
