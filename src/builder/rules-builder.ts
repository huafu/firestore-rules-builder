/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-explicit-any */
import type {
  AllowOperation,
  ExpressionNode,
  FunctionDeclarationNode,
  MatchDeclarationNode,
  PathSegmentNode,
} from "../ast"
import {
  allowDeclaration,
  blockStatement,
  matchDeclaration,
  pathLiteralSegment,
  pathPattern,
  pathVariableSegment,
  program,
  serviceDeclaration,
} from "../ast/factories"
import { printRules, type PrintOptions } from "../ast/printer"

import {
  createBuilderContext,
  type BuilderContext,
  type PublicExpression,
  type RuleValue,
} from "./context"
import type { CustomClaimsOf, DatabaseDefinition, SubcollectionsOf } from "./db"
import {
  BuilderHelpersManager,
  type BuilderHelpersFactory,
  type DeepMergeHelperLibraries,
  type RegisterContextHelper,
} from "./helpers"
import { extractPathParamNames, type EmptyObject } from "./utils"
/** Internal collection map constraint used by builder generics. */
type CollectionMap = Record<string, unknown>

/** Extracts nested subcollection map from a collection shape. */
type Subcollections<TCollection> = SubcollectionsOf<TCollection>
/** Extracts collection name from a `collection/{param}` path segment. */
type CollectionNameFromContextPath<TPath extends string> =
  TPath extends `${infer TCollection}/{${string}}` ? TCollection : never
/** Canonical context path shape for a collection match declaration. */
type ContextPathForCollection<K extends string> = `${K}/{${string}}`
/** Appends a child path to an existing context path. */
type AppendContextPath<TPath extends string, TSegment extends string> = TPath extends ""
  ? TSegment
  : `${TPath}/${TSegment}`
/** Narrows unknown subcollection maps into a collection map fallback. */
type AsCollectionMap<T> = [T] extends [never]
  ? EmptyObject
  : T extends Record<string, unknown>
    ? T
    : EmptyObject

type CollectionScopeBuilder<
  Db extends DatabaseDefinition<CollectionMap, Record<string, unknown>>,
  Ns extends CollectionMap,
  AtPath extends string,
  Lib extends Record<string, unknown>,
  TPath extends ContextPathForCollection<Extract<keyof Ns, string>>,
> = FirestoreAstRulesBuilder<
  Db,
  AsCollectionMap<Subcollections<Ns[CollectionNameFromContextPath<TPath>]>>,
  AppendContextPath<AtPath, TPath>,
  Lib
>

type CollectionScopeCallbackView<
  Db extends DatabaseDefinition<CollectionMap, Record<string, unknown>>,
  Ns extends CollectionMap,
  AtPath extends string,
  Lib extends Record<string, unknown>,
  TPath extends ContextPathForCollection<Extract<keyof Ns, string>>,
> = Omit<CollectionScopeBuilder<Db, Ns, AtPath, Lib, TPath>, "allow" | "matches"> & {
  allow: (
    ...args: Parameters<CollectionScopeBuilder<Db, Ns, AtPath, Lib, TPath>["allow"]>
  ) => ReturnType<CollectionScopeBuilder<Db, Ns, AtPath, Lib, TPath>["allow"]>
  matches: (
    ...args: Parameters<CollectionScopeBuilder<Db, Ns, AtPath, Lib, TPath>["matches"]>
  ) => ReturnType<CollectionScopeBuilder<Db, Ns, AtPath, Lib, TPath>["matches"]>
}

/**
 * Allowed condition inputs accepted by `allow(...)`.
 *
 * Primitive values are converted to literal AST nodes before emission.
 */
export type RuleConditionInput =
  | ExpressionNode
  | PublicExpression
  | RuleValue
  | string
  | number
  | boolean
  | null

/** Internal ordered allow entry tracked before final AST emission. */
type RuleEntry = {
  operations: AllowOperation[]
  condition: RuleConditionInput
  order: number
}

/** Allowed operation parameter shape for `allow(...)`. */
type AllowOperationsInput = AllowOperation | readonly AllowOperation[]

/** Options for top-level rules builder rendering. */
export interface RulesBuilderOptions {
  /** Firestore rules version, defaults to `2`. */
  version?: string
  /** Optional printer customization options. */
  print?: PrintOptions
}

/** Stable global operation ordering used during rule normalization. */
const OrderedOperations: AllowOperation[] = [
  "get",
  "list",
  "read",
  "create",
  "update",
  "delete",
  "write",
]

/** Map of operations that cannot coexist in the same match scope. */
const ConflictingOperations: { [K in AllowOperation]?: AllowOperation[] } = {
  get: ["read"],
  list: ["read"],
  read: ["get", "list"],
  create: ["write"],
  update: ["write"],
  delete: ["write"],
  write: ["create", "update", "delete"],
}

/** Converts accepted condition inputs into concrete expression AST nodes. */
function toExpressionNode(input: RuleConditionInput): ExpressionNode {
  if (typeof input === "string") return { kind: "StringLiteral", value: input }
  if (typeof input === "number") return { kind: "NumberLiteral", value: input }
  if (typeof input === "boolean") return { kind: "BooleanLiteral", value: input }
  if (input === null) return { kind: "NullLiteral", value: null }
  return input as ExpressionNode
}

/** Parses match path syntax into path pattern segments. */
function toPathSegments(path: string): PathSegmentNode[] {
  const segments = path.split("/").filter((segment) => segment.length > 0)
  return segments.map((segment) => {
    const paramMatch = /^\{([A-Za-z_][A-Za-z0-9_]*)\}$/.exec(segment)
    if (paramMatch) {
      return pathVariableSegment(paramMatch[1] ?? "id")
    }
    return pathLiteralSegment(segment)
  })
}

/** Internal helper manager contract shared across nested builders. */
type InternalHelperManager = {
  withHelpers(factory: BuilderHelpersFactory<any, any, any, any>): unknown
  resetUsage(): void
  getUsedHelperDeclarations(): FunctionDeclarationNode[]
  attachToContext(context: any): Record<string, unknown>
}

/**
 * AST-native Firestore Rules builder.
 *
 * Each instance represents one match scope and can declare allow rules,
 * nested matches, and helper libraries shared with descendants.
 */
export class FirestoreAstRulesBuilder<
  Db extends DatabaseDefinition<CollectionMap, Record<string, unknown>>,
  Ns extends CollectionMap,
  AtPath extends string = "",
  Lib extends Record<string, unknown> = EmptyObject,
> {
  protected readonly options: RulesBuilderOptions
  protected readonly helperManager: InternalHelperManager
  protected readonly currentPath: string | null
  protected readonly fullPath: string
  protected readonly children = new Map<
    string,
    FirestoreAstRulesBuilder<Db, CollectionMap, string, Lib>
  >()
  protected readonly ruleEntries: RuleEntry[] = []

  /**
   * Creates a new builder for one match scope.
   */
  constructor(
    currentPath: string | null,
    fullPath: string,
    options: RulesBuilderOptions = {},
    helperManager?: InternalHelperManager,
  ) {
    this.currentPath = currentPath
    this.fullPath = fullPath
    this.options = options
    this.helperManager = helperManager ?? new BuilderHelpersManager<Db, AtPath>()

    // Allow destructuring methods like `const { allow } = users` in match callbacks.
    this.allow = this.allow.bind(this)
    this.matches = this.matches.bind(this)
  }

  /**
   * Narrows the custom claims type for `request.auth.token`.
   *
   * This is a type-only operation — no runtime change. It re-types the builder
   * so that all downstream `$.request.auth.token` accesses reflect the declared
   * claims shape.
   *
   * @typeParam TCustomClaims - Shape of `request.auth.token` claims.
   * @returns The same builder instance re-typed with the narrowed claims.
   *
   * @example
   * ```ts
   * const builder = createAstRulesBuilder<MyDb>()
   *   .withCustomClaims<{ admin: boolean; orgId: string }>()
   *
   * builder.matches((match) => {
   *   match("users/{userId}", (users, $) => {
   *     users.allow("read", $.request.auth.token.admin)
   *   })
   * })
   * ```
   */
  public withCustomClaims<
    TCustomClaims extends Record<string, unknown>,
  >(): FirestoreAstRulesBuilder<
    DatabaseDefinition<Db["collections"], TCustomClaims>,
    Ns,
    AtPath,
    Lib
  > {
    return this as unknown as FirestoreAstRulesBuilder<
      DatabaseDefinition<Db["collections"], TCustomClaims>,
      Ns,
      AtPath,
      Lib
    >
  }

  /**
   * Registers and merges helper libraries into this builder scope.
   *
   * The resulting helper context type is a deep merge of existing helper
   * namespaces and the newly returned helper namespace.
   */
  public withHelpers<NewLib extends Record<string, unknown>>(
    factory: BuilderHelpersFactory<NewLib, Db, AtPath, Lib>,
  ): FirestoreAstRulesBuilder<Db, Ns, AtPath, DeepMergeHelperLibraries<Lib, NewLib>> {
    this.helperManager.withHelpers(factory)
    return this as unknown as FirestoreAstRulesBuilder<
      Db,
      Ns,
      AtPath,
      DeepMergeHelperLibraries<Lib, NewLib>
    >
  }

  /**
   * Adds an `allow` declaration to the current match scope.
   */
  public allow(operationsInput: AllowOperationsInput, condition: RuleConditionInput): this {
    if (this.currentPath === null) {
      throw new Error(
        "Allow rules can only be defined on collection builders, not the root builder.",
      )
    }

    const path = this.pathString
    const operations = Array.isArray(operationsInput) ? [...operationsInput] : [operationsInput]
    if (operations.length === 0) {
      throw new Error(`At least one operation is required at path "${path}".`)
    }

    const inEntry = new Set<AllowOperation>()
    const declaredOperations = new Set<AllowOperation>()
    // Collect already declared operations across all prior allow entries.
    for (const entry of this.ruleEntries) {
      for (const operation of entry.operations) {
        declaredOperations.add(operation)
      }
    }

    // Reject duplicates both within the same entry and across previous entries.
    for (const operation of operations) {
      if (inEntry.has(operation)) {
        throw new Error(
          `Duplicate operation "${operation}" in a single allow definition at path "${path}".`,
        )
      }
      inEntry.add(operation)

      if (declaredOperations.has(operation)) {
        throw new Error(`Duplicate rule definition for operation "${operation}" at path "${path}".`)
      }
    }

    this.ruleEntries.push({
      operations,
      condition,
      order: this.ruleEntries.length,
    })

    return this
  }

  /**
   * Returns (or creates) a child collection builder for a concrete path segment.
   */
  protected collection<TPath extends ContextPathForCollection<Extract<keyof Ns, string>>>(
    path: TPath,
  ): FirestoreAstRulesBuilder<
    Db,
    AsCollectionMap<Subcollections<Ns[CollectionNameFromContextPath<TPath>]>>,
    AppendContextPath<AtPath, TPath>,
    Lib
  > {
    const cached = this.children.get(path)
    if (cached) {
      return cached
    }

    const childFullPath = this.fullPath === "" ? path : `${this.fullPath}/${path}`
    const child = new FirestoreAstRulesBuilder<
      Db,
      AsCollectionMap<Subcollections<Ns[CollectionNameFromContextPath<TPath>]>>,
      AppendContextPath<AtPath, TPath>,
      Lib
    >(path, childFullPath, this.options, this.helperManager)

    this.children.set(path, child)
    return child
  }

  /**
   * Defines child match blocks under this builder scope.
   */
  public matches(
    builder: (
      match: <const TPath extends ContextPathForCollection<Extract<keyof Ns, string>>>(
        path: TPath,
        configure?: (
          builder: CollectionScopeCallbackView<Db, Ns, AtPath, Lib, TPath>,
          context: BuilderContext<Db, AppendContextPath<AtPath, TPath>, Lib>,
        ) => void,
      ) => CollectionScopeCallbackView<Db, Ns, AtPath, Lib, TPath>,
    ) => void,
  ): this {
    const match = <const TPath extends ContextPathForCollection<Extract<keyof Ns, string>>>(
      path: TPath,
      configure?: (
        builder: CollectionScopeCallbackView<Db, Ns, AtPath, Lib, TPath>,
        context: BuilderContext<Db, AppendContextPath<AtPath, TPath>, Lib>,
      ) => void,
    ) => {
      const child = this.collection(path)
      if (configure) {
        // Context is created with this scope's merged helper manager so nested
        // callbacks see the same helper namespace behavior as emitted output.
        const context = createBuilderContext<Db, AppendContextPath<AtPath, TPath>, Lib>({
          pathPattern: child.fullPath,
          customClaims: {} as CustomClaimsOf<Db>,
          helperManager: this.helperManager,
          subcollections: {} as never,
        })
        configure(child, context)
      }
      return child as CollectionScopeCallbackView<Db, Ns, AtPath, Lib, TPath>
    }

    builder(match)
    return this
  }

  /**
   * Builds the complete program AST for Firestore Rules output.
   */
  public toAst() {
    const rootMatchBody: Array<MatchDeclarationNode | FunctionDeclarationNode> = []
    for (const child of this.children.values()) {
      const childNode = child.toMatchNode()
      if (childNode) rootMatchBody.push(childNode)
    }

    // Helper functions are emitted before match declarations because rules
    // files require function definitions to be in scope where referenced.
    const usedHelpers = this.helperManager.getUsedHelperDeclarations()
    const rootStatements = [...usedHelpers, ...rootMatchBody]

    return program(
      this.options.version ?? "2",
      serviceDeclaration(
        "cloud.firestore",
        blockStatement([
          matchDeclaration(
            pathPattern([
              pathLiteralSegment("databases"),
              pathVariableSegment("database"),
              pathLiteralSegment("documents"),
            ]),
            blockStatement(rootStatements),
          ),
        ]),
      ),
    )
  }

  /**
   * Renders the generated AST into Firestore Rules source text.
   */
  public toString(): string {
    return printRules(this.toAst(), this.options.print)
  }

  /**
   * Converts this builder scope into a `match` declaration node.
   */
  protected toMatchNode(): MatchDeclarationNode | null {
    if (this.currentPath === null) return null

    // Guard: a param name in this segment must not shadow any ancestor param.
    const parentPath = this.fullPath.slice(0, this.fullPath.length - this.currentPath.length - 1)
    if (parentPath) {
      const parentParams = extractPathParamNames(parentPath)
      for (const param of extractPathParamNames(this.currentPath)) {
        if (parentParams.has(param)) {
          throw new Error(
            `Path parameter "{${param}}" at "${this.fullPath}" shadows an ancestor parameter with the same name. Use a unique parameter name.`,
          )
        }
      }
    }

    const statements = this.buildStatements()
    if (statements.length === 0) return null

    return matchDeclaration(
      pathPattern(toPathSegments(this.currentPath)),
      blockStatement(statements),
    )
  }

  /**
   * Builds ordered rule statements (allow declarations + nested matches).
   */
  protected buildStatements() {
    const allowStatements = this.buildAllowStatements()
    const nestedMatchStatements: MatchDeclarationNode[] = []

    for (const child of this.children.values()) {
      const childNode = child.toMatchNode()
      if (childNode) nestedMatchStatements.push(childNode)
    }

    return [...allowStatements, ...nestedMatchStatements]
  }

  /**
   * Builds and normalizes allow declarations for this scope.
   */
  protected buildAllowStatements() {
    const entries = [...this.ruleEntries]
    const conflict = this.getConflictingOperation(entries)
    const path = this.pathString
    if (conflict) {
      throw new Error(
        `Conflicting operations "${conflict.operation}" and "${conflict.conflict}" at path "${path}".`,
      )
    }

    const operationIndex = new Map<AllowOperation, number>(
      OrderedOperations.map((operation, index) => [operation, index]),
    )

    // Normalize operation ordering inside each allow declaration.
    const normalizeEntry = (entry: RuleEntry): RuleEntry => ({
      ...entry,
      operations: [...entry.operations].sort(
        (left, right) => (operationIndex.get(left) ?? 0) - (operationIndex.get(right) ?? 0),
      ),
    })

    // Sort allow declarations by first operation weight then insertion order,
    // producing deterministic source output independent of call ordering noise.
    const sortedEntries = entries.map(normalizeEntry).sort((left, right) => {
      const leftWeight = left.operations.reduce(
        (min, op) => Math.min(min, operationIndex.get(op) ?? Number.MAX_SAFE_INTEGER),
        Number.MAX_SAFE_INTEGER,
      )
      const rightWeight = right.operations.reduce(
        (min, op) => Math.min(min, operationIndex.get(op) ?? Number.MAX_SAFE_INTEGER),
        Number.MAX_SAFE_INTEGER,
      )

      if (leftWeight !== rightWeight) return leftWeight - rightWeight
      return left.order - right.order
    })

    return sortedEntries.map((entry) =>
      allowDeclaration(entry.operations, toExpressionNode(entry.condition)),
    )
  }

  /**
   * Full slash-delimited path for this builder scope.
   */
  protected get pathString(): string {
    return this.fullPath === "" ? "/" : this.fullPath
  }

  /**
   * Detects the first conflicting operation pair among declared operations.
   */
  protected getConflictingOperation(
    entries: RuleEntry[],
  ): { operation: AllowOperation; conflict: AllowOperation } | undefined {
    const declaredOperations = new Set<AllowOperation>()
    for (const entry of entries) {
      for (const operation of entry.operations) {
        declaredOperations.add(operation)
      }
    }

    for (const operation of declaredOperations) {
      const conflicts = ConflictingOperations[operation] ?? []
      for (const conflict of conflicts) {
        if (declaredOperations.has(conflict)) {
          return { operation, conflict }
        }
      }
    }

    return undefined
  }
}

/**
 * Creates a root AST rules builder.
 */
export function createAstRulesBuilder<
  Db extends DatabaseDefinition<CollectionMap, Record<string, unknown>>,
>(options: RulesBuilderOptions = {}) {
  return new FirestoreAstRulesBuilder<Db, Db["collections"], "", EmptyObject>(null, "", options)
}

export type { BuilderHelpersFactory, RegisterContextHelper }
