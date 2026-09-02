import type { BuilderContext } from "../builder/context"
import type { DatabaseDefinition } from "../builder/db"
import type { BuilderHelperApi, HelperLibrary } from "../builder/helpers"

/**
 * Reusable helper library contract that stays generic over database/path scope.
 *
 * This lets standalone libraries export helper bundles once and reuse them
 * across multiple schemas via `withHelpers(...)`.
 *
 * @typeParam NewLib - Helper library shape contributed by this reusable module.
 */
export type FirestoreRulesLibrary<NewLib extends HelperLibrary> = <
  Db extends DatabaseDefinition<unknown, Record<string, unknown>>,
  AtPath extends string,
  Lib extends HelperLibrary,
>(
  context: BuilderContext<Db, AtPath, Lib>,
  helpers: BuilderHelperApi,
) => NewLib

/**
 * Convenience wrapper for authoring reusable Firestore rules helper libraries.
 *
 * It is intentionally a typed identity function that reuses the existing
 * helper manager / `withHelpers(...)` contracts.
 *
 * @typeParam NewLib - Helper library shape returned by the reusable library.
 * @param library - Reusable helper library factory.
 * @returns The same library, preserving exact generic helper typings.
 */
export function defineFirestoreRulesLibrary<NewLib extends HelperLibrary>(
  library: FirestoreRulesLibrary<NewLib>,
): FirestoreRulesLibrary<NewLib> {
  // TS can reject assigning contextually-typed arrow callbacks to higher-rank
  // generic function types when generic parameters appear in nested mapped types.
  // Accepting a broad contextual callback overload keeps authoring ergonomic,
  // while we still return the canonical generic reusable library contract.
  return library
}
