import { FirestoreRulesBuilder } from "./builder"
import { createRuleContextBase, createRuleContextDbHelpers } from "./context"
import { HelpersRegistry } from "./helpers-registry"
import type { DbMeta, DbSchema, FullDbSchema, ParentNamesFor } from "./types"

/**
 * Public schema and context types used to describe a Firestore rules model.
 *
 * These types cover collection declarations, derived rule-context typing, and
 * a few convenience aliases that consumer code commonly imports alongside the
 * builder factory.
 */
export type {
  DbCollection,
  timestamp,
  RuleContextFor,
  AnyFullDbNamespace as AnyDbNamespace,
  AnyFullDbSchema as AnyDbSchema,
  DataKeysFor,
  DbMeta,
} from "./types"
export type { RuleExpression, RuleOperand } from "./expression"
export type { RegisterHelper } from "./helpers-registry"
export { RuleError } from "./context"

/**
 * Bundled helper factory with common authentication and ownership checks.
 *
 * Use it with {@link createFirestoreRulesBuilder} via `withHelpers(...)` when
 * the default helper set is enough for a project.
 */
export { commonFirestoreRulesHelpers } from "./common-helpers"

/**
 * Creates the root rules builder for a typed Firestore schema.
 *
 * The returned builder starts at the database root, already wired with the
 * base rule helpers and database traversal helpers. From there, consumer code
 * can register reusable helpers, enter collections, define `allow` clauses,
 * and render the final Firestore rules source.
 *
 * @typeParam Schema - Top-level Firestore collection schema.
 * @typeParam Meta - Optional metadata used to refine typed runtime values such
 * as `request.auth.token` claims.
 *
 * @example
 * ```ts
 * const builder = createFirestoreRulesBuilder<{
 *   users: DbCollection<{ ownerId: string }>
 * }>()
 * ```
 *
 * @returns A root builder that can traverse the declared schema and render the
 * corresponding Firestore rules file.
 */
export function createFirestoreRulesBuilder<
  Schema extends DbSchema,
  Meta extends DbMeta = DbMeta,
>(): FirestoreRulesBuilder<FullDbSchema<Schema, Meta>, FullDbSchema<Schema, Meta>, never> {
  type Db = FullDbSchema<Schema, Meta>
  const context = {
    ...createRuleContextDbHelpers<Db>(),
    ...createRuleContextBase(),
  }
  const registry = new HelpersRegistry()
  return new FirestoreRulesBuilder<Db, Db, never>(registry, [] as ParentNamesFor<Db>, context, {})
}
