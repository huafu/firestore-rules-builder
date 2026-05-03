/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Typesaurus, TypesaurusCore } from "typesaurus"
import type { DbCollection } from "./types"

/** Matches any value produced by `Typesaurus.Schema<DB>`. */
type AnyTypesaurusSchema = Typesaurus.Schema<any>

/** Matches any Typesaurus database instance returned by `schema(...)`. */
type AnyTypesaurusDB = TypesaurusCore.DB<any>

/**
 * Converts a `Typesaurus.Schema<DB>` into the `DbCollection`-based schema
 * format expected by {@link createFirestoreRulesBuilder}.
 *
 * Each collection is mapped to a `DbCollection` carrying the server-side data
 * shape, the typed document ID, and any subcollections recursively converted
 * in the same way.
 *
 * The public {@link OfTypesaurus} type uses this as the underlying implementation.
 * @internal
 */
type FromTypesaurusSchema<S extends Typesaurus.Schema<any>> = {
  [Collection in keyof S & string]: DbCollection<
    S[Collection]["ServerData"],
    S[Collection]["sub"] extends never ? never : FromTypesaurusSchema<S[Collection]["sub"]>,
    S[Collection]["Id"]
  >
}

/**
 * Derives the `DbCollection`-based schema accepted by
 * {@link createFirestoreRulesBuilder} from either a Typesaurus **database
 * instance** (`typeof db`) or a **schema type** (`Typesaurus.Schema<typeof db>`).
 *
 * This is the primary integration point between `typesaurus` and
 * `firestore-rules-dsl`. Import it from the dedicated subpath so that the
 * `typesaurus` peer dependency is only required when this type is actually used:
 *
 * ```ts
 * import type { OfTypesaurus } from "firestore-rules-dsl/typesaurus"
 * ```
 *
 * @example
 * ```ts
 * import { schema } from "typesaurus"
 * import type { OfTypesaurus } from "firestore-rules-dsl/typesaurus"
 * import { createFirestoreRulesBuilder } from "firestore-rules-dsl"
 *
 * const db = schema(($) => ({
 *   users: $.collection<User>(),
 *   posts: $.collection<Post>().sub({
 *     comments: $.collection<Comment>(),
 *   }),
 * }))
 *
 * // Pass the db instance directly:
 * const builder = createFirestoreRulesBuilder<OfTypesaurus<typeof db>>()
 *
 * // Or pass the inferred schema type:
 * type Schema = Typesaurus.Schema<typeof db>
 * const builder2 = createFirestoreRulesBuilder<OfTypesaurus<Schema>>()
 * ```
 */
export type OfTypesaurus<S extends AnyTypesaurusSchema | AnyTypesaurusDB> =
  S extends AnyTypesaurusSchema
    ? FromTypesaurusSchema<S>
    : S extends AnyTypesaurusDB
      ? FromTypesaurusSchema<Typesaurus.Schema<S>>
      : never
