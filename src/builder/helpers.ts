/* eslint-disable @typescript-eslint/no-invalid-void-type */
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { ExpressionNode, FunctionDeclarationNode } from "../ast"
import {
  blockStatement,
  booleanLiteral,
  functionDeclaration,
  identifier,
  letStatement,
  nullLiteral,
  numberLiteral,
  returnStatement,
  stringLiteral,
} from "../ast/factories"
import { callHelper } from "../ast/known-factories"

import {
  proxyRuleValue,
  type BuilderContext,
  type PublicExpression,
  type RuleValue,
} from "./context"
import type { DatabaseDefinition } from "./db"
import type { EmptyObject } from "./utils"

/**
 * Signature for callable helper functions available on rule contexts.
 */
export type HelperFunction = (...args: any[]) => RuleValue

/**
 * Shape of helper libraries returned by `withHelpers(...)` factories.
 *
 * Values can be direct helper callables or nested namespaces that group
 * helper callables ergonomically.
 */
export type HelperLibrary = Record<string, unknown>

/**
 * Merge rule for one helper-library key.
 *
 * - If the new value is a helper function, it replaces the existing value.
 * - If both sides are objects, merge recursively.
 * - Otherwise use the new value as-is.
 */
type MergeHelperLibraryValue<Left, Right> = Right extends HelperFunction
  ? Right
  : Right extends Record<string, unknown>
    ? Left extends Record<string, unknown>
      ? DeepMergeHelperLibraries<Left, Right>
      : Right
    : Right

/**
 * Type-level deep merge for helper libraries.
 *
 * This mirrors runtime merge behavior used by `BuilderHelpersManager`.
 */
export type DeepMergeHelperLibraries<
  Left extends Record<string, unknown>,
  Right extends Record<string, unknown>,
> = Omit<Left, keyof Right> & {
  [K in keyof Right]: K extends keyof Left ? MergeHelperLibraryValue<Left[K], Right[K]> : Right[K]
}

/** Values accepted when invoking generated helper callables. */
type HelperArgument = ExpressionNode | PublicExpression | string | number | boolean | null

/** Internal constraint for lets-factory functions (used in the register() implementation). */
type LetsFactory = (...a: any[]) => Record<string, ExpressionNode | PublicExpression | RuleValue>

/** Constraint for the `Lets` type parameter: the record returned by a `lets` factory. */
type LetsConstraint = Record<string, ExpressionNode | PublicExpression | RuleValue>

/**
 * A typed argument descriptor created via `arg(name)<T>()`.
 *
 * The `type` field is a phantom type used only by TypeScript — it is never
 * set at runtime. Specifying `T` enables type-specific methods on the argument
 * inside helper bodies (`StringMethods`, `ListMethods`, `MapMethods`, etc.).
 */
export interface TypedArgDescriptor<Name extends string, T = unknown> {
  readonly name: Name
  readonly type: T
}

/**
 * Creates a typed argument descriptor for use in `def()` config `args` arrays.
 *
 * The name is inferred from the argument, and the type is specified in the
 * second call. This curried form avoids TypeScript's partial type application
 * problem where an explicit `T` would shadow inference of `Name`:
 * - `arg("orgId")<string>()` → `RuleValue<string>` with `.split()` etc.
 * - `arg("items")<readonly string[]>()` → `RuleValue<readonly string[]>` with `.hasAll()` etc.
 * - `arg("orgId")()` → `RuleValue<unknown>` (untyped fallback)
 */
export function arg<const K extends string>(name: K): <T = unknown>() => TypedArgDescriptor<K, T> {
  return <T>() => ({ name }) as TypedArgDescriptor<K, T>
}

/** Mapped helper argument object derived from a typed descriptor tuple. */
type HelperArgs<Args extends readonly TypedArgDescriptor<string>[]> = {
  [A in Args[number] as A extends TypedArgDescriptor<infer N>
    ? N
    : never]: A extends TypedArgDescriptor<string, infer T> ? RuleValue<T> : RuleValue
}

/**
 * Configuration for a helper with typed arguments (used in `def(name, config)`).
 *
 * - `args` is **required** (non-optional) so TypeScript performs full literal inference,
 *   preserving arg-name literals as object-property keys.
 * - `lets` is an optional factory `(args: HelperArgs<Args>) => Lets` whose parameter
 *   is contextually typed from `args`, enabling destructuring without explicit annotations.
 * - `Lets` is the **return type** of the `lets` factory (a specific record), which flows
 *   directly into the `body`'s second parameter for precise property access.
 */
export type ArgsHelperConfig<
  Args extends readonly TypedArgDescriptor<string>[],
  Lets extends LetsConstraint = Record<never, never>,
  Body extends ExpressionNode | PublicExpression = ExpressionNode | PublicExpression,
> = {
  args: Args
  lets?: (args: HelperArgs<Args>) => Lets
  body: (args: HelperArgs<Args>, lets: Lets) => Body
}

/**
 * Configuration for a zero-argument helper (used in `def(name, config)`).
 * Does not include an `args` property — pass `args: [...]` to use the with-args overload.
 *
 * - `lets` is an optional zero-arg factory `() => Lets` whose return type flows into `body`.
 * - `Lets` is the **return type** of the `lets` factory.
 */
export type ZeroArgHelperConfig<
  Lets extends LetsConstraint = Record<never, never>,
  Body extends ExpressionNode | PublicExpression = ExpressionNode | PublicExpression,
> = {
  lets?: () => Lets
  body: (args: Record<never, never>, lets: Lets) => Body
}

/**
 * Union of both helper config shapes. `Args` determines which variant is used:
 * - `undefined` (default) → `ZeroArgHelperConfig`
 * - tuple of `TypedArgDescriptor` → `ArgsHelperConfig`
 */
export type HelperDefinitionConfig<
  Args extends readonly TypedArgDescriptor<string>[] | undefined = undefined,
  Lets extends LetsConstraint = Record<never, never>,
> = Args extends readonly TypedArgDescriptor<string>[]
  ? ArgsHelperConfig<Args, Lets>
  : ZeroArgHelperConfig<Lets>

/**
 * Type of the `def` function provided inside `withHelpers` factory callbacks.
 * Registers a named helper and returns its callable proxy.
 *
 * Two call signatures (with-args checked **first** so TypeScript uses it whenever
 * `args` is present):
 * - With args: `args: [arg(name)<T>(), ...]` → returns `(...callArgs) => RuleValue`
 * - Zero-arg: no `args` → returns `() => RuleValue`
 *
 * `Lets` is the **return type** of the optional `lets` factory, providing precise types
 * for let-variable properties in the `body`'s second parameter.
 */
export type RegisterContextHelper = {
  <
    const Args extends readonly TypedArgDescriptor<string>[],
    Lets extends LetsConstraint = Record<never, never>,
  >(
    name: string,
    config: ArgsHelperConfig<Args, Lets>,
  ): (...callArgs: { [Index in keyof Args]: HelperArgument }) => RuleValue
  <
    Lets extends LetsConstraint = Record<never, never>,
    Body extends ExpressionNode | PublicExpression = ExpressionNode | PublicExpression,
  >(
    name: string,
    config: ZeroArgHelperConfig<Lets, Body>,
  ): () => Body extends RuleValue<infer R> ? RuleValue<R> : RuleValue
}

/**
 * Helper authoring API injected as the second parameter of `withHelpers`
 * factory callbacks. Provides `def` (to register helpers) and `arg` (to
 * create typed argument descriptors) without requiring any imports.
 *
 * `def` is declared as an overloaded method so TypeScript uses native overload
 * resolution and `const` type parameter inference, preserving literal arg-name
 * strings as property keys in `body`'s `args` parameter.
 */
export interface BuilderHelperAPI {
  /** Register a helper with typed arguments. `Args` is inferred from the `args` array. */
  def<
    const Args extends readonly TypedArgDescriptor<string>[],
    Lets extends LetsConstraint = Record<never, never>,
    Body extends ExpressionNode | PublicExpression = ExpressionNode | PublicExpression,
  >(
    this: void,
    name: string,
    config: ArgsHelperConfig<Args, Lets, Body>,
  ): (
    ...callArgs: { [Index in keyof Args]: HelperArgument }
  ) => Body extends RuleValue<infer R> ? RuleValue<R> : RuleValue
  /** Register a zero-argument helper. */
  def<
    Lets extends LetsConstraint = Record<never, never>,
    Body extends ExpressionNode | PublicExpression = ExpressionNode | PublicExpression,
  >(
    this: void,
    name: string,
    config: ZeroArgHelperConfig<Lets, Body>,
  ): () => Body extends RuleValue<infer R> ? RuleValue<R> : RuleValue
  /**
   * Creates a typed argument descriptor.
   * `arg("name")<T>()` — specify `T` explicitly to get type-aware methods in the body.
   * `arg("name")()` — untyped fallback, gives `RuleValue<unknown>`.
   */
  arg: typeof arg
}

/**
 * Factory contract for extending builder helper libraries.
 *
 * The returned object is deep-merged into the previously registered helper
 * library shape.
 */
export type BuilderHelpersFactory<
  NewLib extends Record<string, unknown>,
  Db extends DatabaseDefinition<unknown, Record<string, unknown>>,
  AtPath extends string,
  Lib extends Record<string, unknown>,
> = (context: BuilderContext<Db, AtPath, Lib>, helpers: BuilderHelperAPI) => NewLib

function isHelperNamespace(value: unknown): value is HelperLibrary {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/**
 * Runtime deep merge for helper library objects.
 */
function mergeHelperLibraries(target: Record<string, unknown>, source: HelperLibrary): void {
  for (const [name, value] of Object.entries(source)) {
    if (isHelperNamespace(value)) {
      const current = target[name]
      if (isHelperNamespace(current)) {
        mergeHelperLibraries(current, value)
      } else {
        const branch: Record<string, unknown> = {}
        mergeHelperLibraries(branch, value)
        target[name] = branch
      }
      continue
    }

    target[name] = value
  }
}

/**
 * Internal representation of a registered helper.
 */
interface HelperDefinition {
  name: string
  argNames: string[]
  callable: (...args: readonly HelperArgument[]) => RuleValue
  dependencies: Set<string>
  bodyFactory: (
    args: Record<string, RuleValue>,
    lets?: Record<string, RuleValue>,
  ) => ExpressionNode | PublicExpression
  letsFactory?: (
    args: Record<string, RuleValue>,
  ) => Record<string, ExpressionNode | PublicExpression | RuleValue>
  /** Cached resolved let-variable expressions (keyed by variable name), populated by resolveBody(). */
  cachedLets?: Record<string, ExpressionNode>
  cachedBody?: ExpressionNode
}

/**
 * Root-level context keys reserved by `BuilderContext` and unavailable as
 * top-level helper names.
 */
const ReservedContextKeys = new Set([
  "db",
  "params",
  "request",
  "resource",
  "sub",
  "exists",
  "get",
  "getAfter",
  "duration",
  "hashing",
  "math",
])

/**
 * Converts helper call arguments to expression nodes.
 */
function toExpressionNode(value: HelperArgument | RuleValue): ExpressionNode {
  if (typeof value === "string") return stringLiteral(value)
  if (typeof value === "number") return numberLiteral(value)
  if (typeof value === "boolean") return booleanLiteral(value)
  if (value === null) return nullLiteral()
  return value as ExpressionNode
}

/**
 * Manages helper registration, dependency tracking, and helper declaration
 * emission for a specific builder scope path.
 */
export class BuilderHelpersManager<
  Db extends DatabaseDefinition<unknown, Record<string, unknown>>,
  AtPath extends string,
  Lib extends Record<string, unknown> = EmptyObject,
> {
  protected readonly definitions = new Map<string, HelperDefinition>()
  protected readonly usedHelpers = new Set<string>()
  protected readonly resolutionStack: string[] = []
  protected readonly library: Record<string, unknown> = {}
  protected readonly contextRef: { current: BuilderContext<Db, AtPath, HelperLibrary> | null } = {
    current: null,
  }
  protected readonly contextProxy = new Proxy(
    {},
    {
      get: (_, prop: string | symbol) => {
        if (typeof prop !== "string") return undefined

        const current = this.contextRef.current
        if (!current) {
          throw new Error("Helper context is not attached yet.")
        }

        return current[prop]
      },
    },
  ) as BuilderContext<Db, AtPath, Lib>

  /**
   * Registers a helper library factory and deep-merges its result into the
   * accumulated helper namespace.
   */
  public withHelpers<NewLib extends HelperLibrary>(
    factory: BuilderHelpersFactory<NewLib, Db, AtPath, Lib>,
  ): BuilderHelpersManager<Db, AtPath, DeepMergeHelperLibraries<Lib, NewLib>> {
    const api: BuilderHelperAPI = { def: this.register.bind(this), arg }
    const helpers = factory(this.contextProxy, api)

    // Recursively validate namespace trees and ensure every leaf helper was
    // created via `register(...)` on this manager instance.
    const validate = (tree: HelperLibrary, atRoot: boolean): void => {
      for (const [name, helperOrNamespace] of Object.entries(tree)) {
        if (atRoot && ReservedContextKeys.has(name)) {
          throw new Error(`Helper "${name}" cannot overwrite a built-in context property.`)
        }

        if (isHelperNamespace(helperOrNamespace)) {
          validate(helperOrNamespace, false)
          continue
        }

        const definition = this.definitions.get(name)
        if (!definition || definition.callable !== helperOrNamespace) {
          throw new Error(`Helper "${name}" must be created via register(...).`)
        }
      }
    }

    // Validate first so partial library merges cannot leave inconsistent state.
    validate(helpers, true)
    mergeHelperLibraries(this.library, helpers)
    return this as unknown as BuilderHelpersManager<
      Db,
      AtPath,
      DeepMergeHelperLibraries<Lib, NewLib>
    >
  }

  /**
   * Attaches merged helpers to a concrete builder context instance.
   */
  public attachToContext(context: BuilderContext<Db, AtPath>): Lib {
    const mergedContext = Object.assign({}, context, this.library) as BuilderContext<
      Db,
      AtPath,
      Lib
    >
    this.contextRef.current = mergedContext
    return this.library as Lib
  }

  /**
   * Clears helper usage tracking for a fresh render pass.
   */
  public resetUsage(): void {
    this.usedHelpers.clear()
  }

  /**
   * Returns helper function declarations required by currently used helpers,
   * including transitive dependencies in dependency-first order.
   */
  public getUsedHelperDeclarations(): FunctionDeclarationNode[] {
    const declarations: FunctionDeclarationNode[] = []
    const emitted = new Set<string>()

    const visit = (name: string) => {
      if (emitted.has(name)) return

      const definition = this.definitions.get(name)
      if (!definition) {
        throw new Error(`Unknown helper "${name}".`)
      }

      // Resolve body first to populate dependencies
      const returnExpr = this.resolveBody(name)

      // Emit dependencies first so helper calls always reference functions
      // already declared above in generated source.
      for (const dependency of definition.dependencies) {
        visit(dependency)
      }

      emitted.add(name)

      // Build function body based on whether helper has lets
      let body: ReturnType<typeof blockStatement>

      if (definition.cachedLets) {
        // Lets-factory helper: emit cached let statements + return
        const letStmts = Object.entries(definition.cachedLets).map(([varName, varExpr]) =>
          letStatement(varName, varExpr),
        )
        body = blockStatement([...letStmts, returnStatement(returnExpr)])
      } else {
        // Expression-only helper: just return
        body = blockStatement([returnStatement(returnExpr)])
      }

      declarations.push(functionDeclaration(definition.name, definition.argNames, body))
    }

    for (const helperName of this.usedHelpers) {
      visit(helperName)
    }

    return declarations
  }

  /**
   * Registers a single named helper function and returns its callable proxy.
   *
   * Called internally via the `def` property on the `BuilderHelperAPI` object
   * injected into `withHelpers` factory callbacks.
   */
  protected register<
    const Args extends readonly TypedArgDescriptor<string, any>[],
    Lets extends LetsConstraint = Record<never, never>,
  >(
    name: string,
    config: ArgsHelperConfig<Args, Lets>,
  ): (...callArgs: { [Index in keyof Args]: HelperArgument }) => RuleValue
  protected register<
    Lets extends LetsConstraint = Record<never, never>,
    Body extends ExpressionNode | PublicExpression = ExpressionNode | PublicExpression,
  >(
    name: string,
    config: ZeroArgHelperConfig<Lets, Body>,
  ): () => Body extends RuleValue<infer R> ? RuleValue<R> : RuleValue
  protected register(
    name: string,
    config: {
      args?: readonly TypedArgDescriptor<string, any>[] | undefined
      lets?: LetsFactory | undefined
      body: (args: any, lets: any) => ExpressionNode | PublicExpression
    },
  ): (...callArgs: HelperArgument[]) => RuleValue {
    if (ReservedContextKeys.has(name)) {
      throw new Error(`Helper "${name}" cannot overwrite a built-in context property.`)
    }
    if (this.definitions.has(name)) {
      throw new Error(`Helper "${name}" is already registered.`)
    }

    const argNames = config.args?.map((d) => d.name) ?? []

    const callable = (...args: HelperArgument[]): RuleValue => {
      if (args.length < argNames.length) {
        const missingIndex = args.length
        const missingName = argNames[missingIndex]
        throw new Error(`Missing argument ${missingIndex} (${missingName}) for helper "${name}".`)
      }
      if (this.resolutionStack.includes(name)) {
        throw new Error(`Recursive helper call detected for "${name}".`)
      }

      const currentHelper = this.resolutionStack[this.resolutionStack.length - 1]
      if (currentHelper) {
        this.definitions.get(currentHelper)?.dependencies.add(name)
      }

      this.usedHelpers.add(name)
      return proxyRuleValue(callHelper(name, args.map(toExpressionNode)))
    }

    const definition: HelperDefinition = {
      name,
      argNames,
      callable,
      bodyFactory: (helperArgs, lets) =>
        (config.body as (a: any, l: any) => ExpressionNode | PublicExpression)(
          helperArgs,
          lets ?? {},
        ),
      dependencies: new Set<string>(),
    }

    if (config.lets) {
      const letsFactory = config.lets
      definition.letsFactory = (helperArgs) => letsFactory(helperArgs)
    }

    this.definitions.set(name, definition)

    return callable
  }

  /**
   * Resolves and caches a helper body expression while tracking dependencies.
   */
  protected resolveBody(name: string): ExpressionNode {
    const definition = this.definitions.get(name)
    if (!definition) {
      throw new Error(`Unknown helper "${name}".`)
    }
    if (definition.cachedBody) {
      return definition.cachedBody
    }
    if (this.resolutionStack.includes(name)) {
      throw new Error(`Recursive helper call detected for "${name}".`)
    }

    this.resolutionStack.push(name)
    // Recompute dependencies each resolution so emitted helper order matches
    // the latest helper body graph.
    definition.dependencies.clear()

    try {
      const args = Object.fromEntries(
        definition.argNames.map((argName) => [argName, proxyRuleValue(identifier(argName))]),
      )

      let lets: Record<string, RuleValue> | undefined
      if (definition.letsFactory) {
        const letsMap = definition.letsFactory(args)
        // Cache the full expressions for emission in getUsedHelperDeclarations()
        definition.cachedLets = Object.fromEntries(
          Object.entries(letsMap).map(([letName, letExpr]) => [letName, toExpressionNode(letExpr)]),
        )
        // Proxy each let variable by its identifier so the body emits `roles.hasAny(...)`,
        // not the full initializer expression repeated inside the return value.
        lets = Object.fromEntries(
          Object.keys(letsMap).map((letName) => [letName, proxyRuleValue(identifier(letName))]),
        )
      }

      const body = toExpressionNode(definition.bodyFactory(args, lets))

      definition.cachedBody = body
      return body
    } finally {
      this.resolutionStack.pop()
    }
  }
}
