/* eslint-disable @typescript-eslint/no-explicit-any */
import type { ExpressionNode, FunctionDeclarationNode } from "../ast"
import {
  blockStatement,
  booleanLiteral,
  functionDeclaration,
  identifier,
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

/** Mapped helper argument object passed to helper body factories. */
type HelperArgs<Args extends readonly string[]> = {
  [K in Args[number]]: RuleValue
}

/** Body factory for helpers that do not take arguments. */
type ZeroArgHelperBodyFactory = () => ExpressionNode | PublicExpression

/**
 * Signature for a helper body factory used in `register(...)`.
 */
type HelperBodyFactory<Args extends readonly string[]> = (
  args: HelperArgs<Args>,
) => ExpressionNode | PublicExpression

type HelperReturnFromFactory<F extends (...args: any[]) => ExpressionNode | PublicExpression> =
  ReturnType<F> extends RuleValue<infer T> ? RuleValue<T> : RuleValue

export type RegisterContextHelper = {
  <F extends ZeroArgHelperBodyFactory>(
    name: string,
    bodyFactory: F,
  ): () => HelperReturnFromFactory<F>
  <const Args extends readonly string[], F extends HelperBodyFactory<Args>>(
    name: string,
    argNames: Args,
    bodyFactory: F,
  ): (...args: { [Index in keyof Args]: HelperArgument }) => HelperReturnFromFactory<F>
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
> = (context: BuilderContext<Db, AtPath, Lib>, register: RegisterContextHelper) => NewLib

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
  bodyFactory: (args: HelperArgs<readonly string[]>) => ExpressionNode | PublicExpression
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
function toExpressionNode(value: HelperArgument): ExpressionNode {
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
    const helpers = factory(this.contextProxy, this.register.bind(this))

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

      const body = this.resolveBody(name)
      // Emit dependencies first so helper calls always reference functions
      // already declared above in generated source.
      for (const dependency of definition.dependencies) {
        visit(dependency)
      }

      emitted.add(name)
      declarations.push(
        functionDeclaration(
          definition.name,
          definition.argNames,
          blockStatement([returnStatement(body)]),
        ),
      )
    }

    for (const helperName of this.usedHelpers) {
      visit(helperName)
    }

    return declarations
  }

  /**
   * Registers a single named helper function and returns its callable proxy.
   */
  protected register<const Args extends readonly string[], F extends HelperBodyFactory<Args>>(
    name: string,
    argNames: Args,
    bodyFactory: F,
  ): (...args: { [Index in keyof Args]: HelperArgument }) => HelperReturnFromFactory<F>
  protected register<F extends ZeroArgHelperBodyFactory>(
    name: string,
    bodyFactory: F,
  ): () => HelperReturnFromFactory<F>
  protected register<const Args extends readonly string[], F extends HelperBodyFactory<Args>>(
    name: string,
    argNamesOrBodyFactory: Args | ZeroArgHelperBodyFactory,
    bodyFactory?: F,
  ): (...args: { [Index in keyof Args]: HelperArgument }) => HelperReturnFromFactory<F> {
    if (ReservedContextKeys.has(name)) {
      throw new Error(`Helper "${name}" cannot overwrite a built-in context property.`)
    }
    if (this.definitions.has(name)) {
      throw new Error(`Helper "${name}" is already registered.`)
    }

    if (typeof argNamesOrBodyFactory === "function") {
      const bodyFactoryOnly = argNamesOrBodyFactory

      const callable = (): RuleValue => {
        if (this.resolutionStack.includes(name)) {
          throw new Error(`Recursive helper call detected for "${name}".`)
        }

        const currentHelper = this.resolutionStack[this.resolutionStack.length - 1]
        if (currentHelper) {
          this.definitions.get(currentHelper)?.dependencies.add(name)
        }

        this.usedHelpers.add(name)
        return proxyRuleValue(callHelper(name, []))
      }

      this.definitions.set(name, {
        name,
        argNames: [],
        callable,
        bodyFactory: () => bodyFactoryOnly(),
        dependencies: new Set<string>(),
      })

      return callable as (
        ...args: { [Index in keyof Args]: HelperArgument }
      ) => HelperReturnFromFactory<F>
    }

    const argNames = argNamesOrBodyFactory

    if (!bodyFactory) {
      throw new Error(`Helper body factory is required for "${name}".`)
    }

    const callable = (...args: { [Index in keyof Args]: HelperArgument }) => {
      if (args.length < argNames.length) {
        const missingIndex = args.length
        const missingName = argNames[missingIndex]
        throw new Error(`Missing argument ${missingIndex} (${missingName}) for helper "${name}".`)
      }
      if (this.resolutionStack.includes(name)) {
        throw new Error(`Recursive helper call detected for "${name}".`)
      }

      // When resolving one helper body, direct helper calls register
      // dependency edges from current helper to the called helper.
      const currentHelper = this.resolutionStack[this.resolutionStack.length - 1]
      if (currentHelper) {
        this.definitions.get(currentHelper)?.dependencies.add(name)
      }

      this.usedHelpers.add(name)
      return proxyRuleValue(callHelper(name, args.map(toExpressionNode)))
    }

    this.definitions.set(name, {
      name,
      argNames: [...argNames],
      callable: callable as (...args: readonly HelperArgument[]) => RuleValue,
      bodyFactory: (helperArgs: HelperArgs<Args>) => bodyFactory(helperArgs),
      dependencies: new Set<string>(),
    })

    return callable as (
      ...args: { [Index in keyof Args]: HelperArgument }
    ) => HelperReturnFromFactory<F>
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

      const body = toExpressionNode(definition.bodyFactory(args))

      definition.cachedBody = body
      return body
    } finally {
      this.resolutionStack.pop()
    }
  }
}
