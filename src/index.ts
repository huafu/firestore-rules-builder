/**
 * @huafu/firestore-rules-builder
 *
 * A strongly typed TypeScript DSL for generating Firestore Security Rules with full IDE support
 * and type safety.
 *
 * ## Quick Start
 *
 * ```typescript
 * import { createFirestoreRules } from '@huafu/firestore-rules-builder'
 *
 * const rules = createFirestoreRules()
 *   .rules((ns) => {
 *     ns.users(($) => ({
 *       read: $.if($.isset($.request.auth.uid))
 *     }))
 *   })
 *   .build()
 * ```
 *
 * ## Main Exports
 *
 * - {@link createFirestoreRules} - Factory to create a rules builder
 * - {@link RuleContext} - Type for the rule context object
 * - {@link CommonHelpers} - Common authentication helpers
 * - {@link PathProxy} - Type for typed data access
 * - {@link firestoreRulesCommonHelpers} - Register common auth helpers
 *
 * @packageDocumentation
 */

/**
 * Factory function to create a new Firestore rules builder.
 *
 * This is the entry point for constructing Firestore Security Rules with type safety.
 *
 * @example
 * ```typescript
 * const builder = createFirestoreRules<MySchema>();
 * ```
 *
 * @see {@link FirestoreRulesBuilder} for the builder API
 */
export { createFirestoreRules } from "./builder"

/**
 * Register common authentication and authorization helper functions.
 *
 * Includes helpers for:
 * - isAuthenticated(): Check if user has valid auth token
 * - hasClaim(claim, expected): Check JWT token claims
 * - isOwner(uid): Compare UIDs for ownership checks
 * - isAuthenticatedAndOwner(uid): Combined auth + ownership check
 * - isServerTime(timestamp): Verify server timestamp
 *
 * @example
 * ```typescript
 * const rules = createFirestoreRules()
 *   .withHelpers(firestoreRulesCommonHelpers)
 *   .rules((ns) => {
 *     ns.users(($) => ({
 *       read: $.if($.lib.isAuthenticated())
 *     }))
 *   })
 * ```
 *
 * @see {@link CommonHelpers} for the interface
 */
export { registerCommonHelpers as firestoreRulesCommonHelpers } from "./common-helpers"

/**
 * Interface for common authentication and authorization helpers.
 *
 * @see {@link firestoreRulesCommonHelpers}
 */
export type { CommonHelpers } from "./common-helpers"

/**
 * Type for strongly-typed nested property access in rule expressions.
 *
 * Enables autocomplete and type checking for accessing deeply nested document fields.
 *
 * @example
 * ```typescript
 * interface User { profile: { name: string } }
 * const proxy: PathProxy<User> = ctx.resource.data;
 * proxy.profile.name // Type-safe, autocomplete available
 * ```
 *
 * @see {@link createPathProxy}
 */
export type { PathProxy } from "./path-proxy"

/**
 * The main rule context for building expressions.
 *
 * Provides logical operations, comparisons, data validation, and access to
 * Firestore runtime values.
 *
 * @example
 * ```typescript
 * // Use in rule callbacks
 * ns.documents(($: RuleContext) => ({
 *   read: $.and(
 *     $.isset($.request.auth.uid),
 *     $.eq($.resource.data.owner, $.request.auth.uid)
 *   )
 * }))
 * ```
 *
 * @see {@link createRuleContext}
 */
export type { RuleContext } from "./tools"
