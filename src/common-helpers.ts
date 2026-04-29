import type { HelpersFactory } from "./builder"
import { raw, type RuleExpression, type RuleOperand } from "./expression"

/**
 * Common authentication and authorization helper functions for Firestore Security Rules.
 *
 * Provides reusable helpers for common patterns like checking authentication,
 * JWT claims, ownership verification, and server timestamp validation.
 *
 * @example
 * ```typescript
 * const rules = createFirestoreRules()
 *   .withHelpers(registerCommonHelpers)
 *   .rules((ns) => {
 *     ns.users(($) => ({
 *       read: $.if($.lib.isAuthenticated()),
 *       create: $.if($.lib.isAuthenticatedAndOwner($.params.userId))
 *     }))
 *   })
 * ```
 */
export interface CommonHelpers {
  /**
   * Checks if a user is authenticated (has a valid JWT token with uid).
   *
   * @returns A rule expression that evaluates to true if authenticated
   *
   * @example
   * ```typescript
   * ctx.if(ctx.lib.isAuthenticated())
   * ```
   */
  isAuthenticated: () => RuleExpression

  /**
   * Checks if a specific JWT token claim matches an expected value.
   *
   * @param claim - The name of the JWT claim to check
   * @param expected - The expected value of the claim
   * @returns A rule expression that evaluates to true if the claim matches
   *
   * @example
   * ```typescript
   * ctx.lib.hasClaim("admin", true)
   * ctx.lib.hasClaim("role", "moderator")
   * ```
   */
  hasClaim: (claim: RuleOperand, expected: RuleOperand) => RuleExpression

  /**
   * Checks if the authenticated user's UID matches the provided value.
   *
   * @param uid - The UID to compare against
   * @returns A rule expression that evaluates to true if UIDs match
   *
   * @example
   * ```typescript
   * ctx.lib.isOwner($.params.userId)
   * ctx.lib.isOwner($.resource.data.owner)
   * ```
   */
  isOwner: (uid: RuleOperand) => RuleExpression

  /**
   * Checks if the user is authenticated AND is the owner of the resource.
   *
   * @param uid - The expected owner UID
   * @returns A rule expression that evaluates to true if authenticated and owner
   *
   * @example
   * ```typescript
   * ctx.lib.isAuthenticatedAndOwner($.resource.data.owner)
   * ```
   */
  isAuthenticatedAndOwner: (uid: RuleOperand) => RuleExpression

  /**
   * Checks if a timestamp equals the server's current time (for update timestamps).
   *
   * @param timestamp - The timestamp to verify
   * @returns A rule expression that evaluates to true if it's the server time
   *
   * @example
   * ```typescript
   * ctx.lib.isServerTime($.request.resource.data.updatedAt)
   * ```
   */
  isServerTime: (timestamp: RuleOperand) => RuleExpression
}

/**
 * Factory function that registers common auth helpers with the rules builder.
 *
 * Use with {@link FirestoreRulesBuilder.withHelpers} to add authentication helpers
 * to your rule builder.
 *
 * @param ctx - The rule context
 * @param register - The helper registration function
 * @returns An object containing the common helper functions
 *
 * @example
 * ```typescript
 * const rules = createFirestoreRules()
 *   .withHelpers(registerCommonHelpers)
 * ```
 */
export const registerCommonHelpers: HelpersFactory<CommonHelpers> = (ctx, register) => {
  const isAuthenticated = register("isAuthenticated", [], () =>
    ctx.and(ctx.isset(ctx.request.auth), ctx.isset(ctx.request.auth.uid)),
  )
  const hasClaim = register("hasClaim", ["claim", "expected"], (arg) =>
    ctx.eq(raw(`${ctx.request.auth.token}[${arg.claim}]`), arg.expected),
  )
  const isOwner = (uid: RuleOperand) => ctx.eq(ctx.request.auth.uid, uid)
  const isAuthenticatedAndOwner = register("isAuthenticatedAndOwner", ["uid"], (arg) =>
    ctx.and(isAuthenticated(), isOwner(arg.uid)),
  )
  const isServerTime = (ts: RuleOperand) => ctx.eq(ts, ctx.server.time)
  return {
    isAuthenticated,
    hasClaim,
    isOwner,
    isAuthenticatedAndOwner,
    isServerTime,
  }
}
