/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-empty-object-type */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFirestoreRulesBuilder } from "."
import { FirestoreRulesBuilder } from "./builder"
import { RuleExpression } from "./expression"
import type {
  AnyFullDbCollectionBase,
  AnyFullDbNamespace,
  AnyFullDbSchema,
  DbMeta,
  DbSchema,
  FullDbSchema,
  LibFactory,
  RuleContextFor,
} from "./types"

/**
 * Fluent test helper API for building a typed rules context in unit tests.
 *
 * The utility can move between root, namespace, and collection scopes,
 * register helper libraries, and expose the resulting strongly typed context.
 *
 * @typeParam Db - Fully expanded database schema used by the test builder.
 * @typeParam Ns - Current namespace scope within Db.
 * @typeParam Col - Current collection scope, or never when at namespace/root scope.
 * @typeParam Lib - Accumulated helper library available on the context.
 */
type TestUtils<
  Db extends AnyFullDbSchema,
  Ns extends AnyFullDbNamespace,
  Col extends AnyFullDbCollectionBase,
  Lib,
> = {
  /**
   * Registers a helper factory on the current scope.
   *
   * @typeParam NewLib - Helper object returned by the provided factory.
   * @param factory - Factory invoked with the current typed rule context.
   * @returns TestUtils with the merged helper library.
   */
  withHelpers: <NewLib>(
    factory: LibFactory<NewLib, Db, Ns, Lib>,
  ) => TestUtils<Db, Ns, Col, Lib & NewLib>

  /**
   * Rebinds the utility to a fresh root builder with a different schema.
   *
   * Previously registered helper factories are reapplied to the new builder.
   *
   * @typeParam NewDb - New top-level schema declaration.
   * @typeParam Meta - Optional metadata for auth claim typing.
   * @returns TestUtils positioned at the new database root.
   */
  withDb: <NewDb extends DbSchema, Meta extends DbMeta = DbMeta>() => TestUtils<
    FullDbSchema<NewDb, Meta>,
    FullDbSchema<NewDb, Meta>,
    never,
    Lib
  >

  /**
   * Returns to the current database root namespace.
   *
   * @returns TestUtils at the root namespace scope.
   */
  withRoot: () => TestUtils<Db, Db, never, Lib>

  /**
   * Moves scope to the namespace under a child collection key.
   *
   * @typeParam Key - Child collection key in the current namespace.
   * @param ns - Child collection key to traverse into.
   * @returns TestUtils at the child collection namespace scope.
   */
  withNamespace: <Key extends keyof Ns["collections"] & string>(
    ns: Key,
  ) => TestUtils<Db, Ns["collections"][Key]["namespace"], never, Lib>

  /**
   * Moves scope to a concrete child collection under the current namespace.
   *
   * @typeParam Key - Child collection key in the current namespace.
   * @param collection - Child collection key to traverse into.
   * @returns TestUtils at the selected collection scope.
   */
  withCollection: <Key extends keyof Ns["collections"] & string>(
    collection: Key,
  ) => TestUtils<Db, Ns, Ns["collections"][Key], Lib>

  /**
   * Returns the typed rule context for the active test scope.
   *
   * Namespace context is returned when no concrete collection is selected.
   *
   * @returns Context value typed for the current builder position and helpers.
   */
  getContext: () => RuleContextFor<Db, [Col] extends [never] ? Ns : Col, Lib>
}

/**
 * Internal constructor for the fluent TestUtils chain.
 *
 * It carries helper factories across scope switches and reapplies them whenever
 * a fresh root builder is created.
 *
 * @param options - Optional builder/factory state used to continue the chain.
 * @returns A fluent object for changing scope and reading typed context.
 */
const testUtils = ({
  factories = [],
  builder,
}: {
  builder?: FirestoreRulesBuilder<AnyFullDbSchema, AnyFullDbSchema, never, any>
  factories?: LibFactory<any, AnyFullDbSchema, AnyFullDbSchema, any>[]
} = {}) => {
  if (!builder) {
    builder = createFirestoreRulesBuilder() as unknown as FirestoreRulesBuilder<
      AnyFullDbSchema,
      AnyFullDbSchema,
      never,
      any
    >
    for (const factory of factories) {
      builder = builder.withHelpers(factory)
    }
  }

  return {
    withHelpers: (factory: LibFactory<any, AnyFullDbSchema, AnyFullDbSchema, any>) => {
      factories.push(factory)
      return testUtils({ factories, builder: builder.withHelpers(factory) })
    },
    withDb: () => testUtils({ factories }),
    withRoot: () => testUtils({ factories }),
    withNamespace: (ns: string) =>
      testUtils({
        factories,
        builder: builder.collection(ns) as FirestoreRulesBuilder<
          AnyFullDbSchema,
          AnyFullDbSchema,
          never,
          any
        >,
      }),
    withCollection: (collection: string) =>
      testUtils({
        factories,
        builder: builder.collection(collection) as FirestoreRulesBuilder<
          AnyFullDbSchema,
          AnyFullDbSchema,
          never,
          any
        >,
      }),
    getContext: () => builder.context,
  }
}

/**
 * Creates a fluent utility for testing helper factories across typed scopes.
 *
 * Typical usage is: declare schema via generics, optionally register helper
 * libraries with `withHelpers`, move to a scope with `withNamespace` or
 * `withCollection`, and inspect the inferred rule context via `getContext`.
 *
 * @typeParam Db - Top-level schema declaration.
 * @typeParam Meta - Optional metadata used for auth claim typing.
 * @returns A TestUtils instance positioned at the database root scope.
 */
export const createTestUtils = testUtils as unknown as <
  Db extends DbSchema,
  Meta extends DbMeta = DbMeta,
>() => TestUtils<FullDbSchema<Db, Meta>, FullDbSchema<Db, Meta>, never, {}>

/**
 * Renders a rule expression to source text for focused test assertions.
 *
 * Use this helper when tests only need expression output and do not need to
 * render the full rules file.
 *
 * @param expr - Rule expression to render.
 * @returns Firestore rules source for the provided expression.
 */
export const stringifyExpr = (expr: RuleExpression) => RuleExpression.toString(expr)
