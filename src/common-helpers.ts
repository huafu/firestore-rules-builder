import type {
  RegisterHelper,
  AnyDbNamespace,
  AnyDbSchema,
  RuleContextFor,
  RuleExpression,
  RuleOperand,
  DataKeysFor,
} from "./index"

/**
 * Bundled authentication and ownership helpers that can be registered on a builder.
 *
 * The helpers are intentionally small and compose with the core rule context.
 * They cover the most common auth-related checks without changing the builder's
 * type model or requiring extra setup beyond `withHelpers(...)`.
 *
 * @example
 * ```ts
 * const rules = createFirestoreRulesBuilder<{
 *   users: DbCollection<{ ownerId: string; updatedAt: timestamp }>
 * }>()
 *   .withHelpers(commonFirestoreRulesHelpers)
 *   .collection("users")
 *   .rules(($) => ({
 *     read: $.if($.isAuthenticated()),
 *     update: $.and($.isOwner($.resource.data.ownerId, true), $.isServerTime("updatedAt")),
 *   }))
 * ```
 */
export interface CommonHelpers<Db extends AnyDbSchema, Ns extends AnyDbNamespace> {
  /**
   * Checks that the request is authenticated and exposes a `uid`.
   *
   * @returns An expression that is truthy only when `request.auth.uid` exists.
   *
   * @example
   * ```ts
   * $.if($.isAuthenticated())
   * ```
   */
  isAuthenticated: () => RuleExpression

  /**
   * Compares a JWT claim from `request.auth.token` with an expected value.
   *
   * @param claim - Claim name or expression resolving to a claim key.
   * @param expected - Expected claim value.
   * @returns An equality expression over `request.auth.token`.
   *
   * @example
   * ```ts
   * $.hasClaim("admin", true)
   * $.hasClaim("role", "moderator")
   * ```
   */
  hasClaim: (
    claim: RuleExpression | (keyof Db["meta"]["authClaims"] & string),
    expected: RuleOperand,
  ) => RuleExpression

  /**
   * Compares `request.auth.uid` with the provided owner identifier.
   *
   * @param uid - Expected owner identifier.
   * @param checkAuth - When true, also requires `isAuthenticated()` first.
   * @returns An ownership check expression.
   *
   * @example
   * ```ts
   * $.isOwner($.params.userId)
   * $.isOwner($.resource.data.owner, true) // also checks that user is authenticated
   * ```
   */
  isOwner: (uid: RuleOperand, checkAuth?: boolean) => RuleExpression

  /**
   * Verifies that a timestamp matches `request.time`.
   *
   * Passing a data key uses `request.resource.data[key]` as a shorthand, which
   * only makes sense inside collection-scoped rule callbacks.
   *
   * @param timestamp - Timestamp expression or collection data key.
   * @returns An equality expression against `request.time`.
   *
   * @example
   * ```ts
   * $.isServerTime($.request.resource.data.updatedAt)
   * $.isServerTime("createdAt") // shorthand for $.isServerTime($.request.resource.data.createdAt)
   * ```
   */
  isServerTime: (timestamp: RuleExpression | DataKeysFor<Ns>) => RuleExpression
}

/**
 * Registers the bundled auth helpers on the current builder context.
 *
 * The returned object is merged into the builder's helper library, while the
 * registry callback is used only for helpers that should render as named
 * Firestore rule functions.
 *
 * @param context - Current typed rule context.
 * @param register - Helper registrar shared by the builder tree.
 * @returns A helper object that can be used in later `rules(...)` callbacks.
 *
 * @example
 * ```ts
 * const rules = createFirestoreRulesBuilder()
 *   .withHelpers(commonFirestoreRulesHelpers)
 * ```
 */
export const commonFirestoreRulesHelpers = <Db extends AnyDbSchema, Ns extends AnyDbNamespace, Lib>(
  context: RuleContextFor<Db, Ns, Lib>,
  register: RegisterHelper,
): CommonHelpers<Db, Ns> => {
  const isAuthenticated = register("isAuthenticated", [], () =>
    context.return(
      context.and(context.isset(context.request.auth), context.isset(context.request.auth.uid)),
    ),
  )
  const hasClaim = register("hasClaim", ["claim", "expected"], (arg) =>
    context.return(context.eq(context.request.auth.token.$prop(arg.claim), arg.expected)),
  )
  const isOwner = (uid: RuleOperand, checkAuth = false) =>
    checkAuth
      ? context.and(isAuthenticated(), context.eq(context.request.auth.uid, uid))
      : context.eq(context.request.auth.uid, uid)
  const isServerTime = (ts: RuleOperand | DataKeysFor<Ns>) =>
    context.eq(
      typeof ts === "string" ? context.request.resource.data[ts] : ts,
      context.request.time,
    )
  return {
    isAuthenticated,
    hasClaim,
    isOwner,
    isServerTime,
  }
}
