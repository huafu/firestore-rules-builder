/* eslint-disable @typescript-eslint/no-empty-object-type */
import {
  createRuleContextDataHelpers,
  createRuleContextProxies,
  RuleError,
  ruleError,
} from "./context"
import { indentFor, RuleExpression } from "./expression"
import type { HelpersRegistry } from "./helpers-registry"
import {
  singularize,
  type AnyFullDbCollection,
  type AnyFullDbNamespace,
  type AnyFullDbSchema,
  type FirestoreRulesBuilderMap,
  type FormattingOptions,
  type LibFactory,
  type Operation,
  type ParentNamesFor,
  type RuleBuilderForCollection,
  type RuleBuilderForNamespace,
  type RuleContextBase,
  type RuleContextDataHelpers,
  type RuleContextDbHelpers,
  type RuleContextFor,
  type RuleMap,
} from "./types"

export type FirestoreRootRulesBuilder<
  Db extends AnyFullDbSchema,
  Ns extends AnyFullDbNamespace,
  Lib = {},
> = Omit<FirestoreRulesBuilder<Db, Ns, never, Lib>, "context" | "lib">

export type FirestoreChildRulesBuilder<
  Db extends AnyFullDbSchema,
  Ns extends AnyFullDbNamespace,
  Col extends AnyFullDbCollection,
  Lib = {},
> = Omit<FirestoreRulesBuilder<Db, Ns, Col, Lib>, "toString" | "context" | "lib">

type BuilderFor<
  Db extends AnyFullDbSchema,
  Ns extends AnyFullDbNamespace,
  Col extends AnyFullDbCollection,
  Lib,
> = Ns extends Db
  ? FirestoreRulesBuilder<Db, Ns, Col, Lib>
  : FirestoreChildRulesBuilder<Db, Ns, Col, Lib>

const OrderedOperations: Operation[] = [
  "get",
  "list",
  "read",
  "create",
  "update",
  "delete",
  "write",
]
const ConflictingOperations: { [K in Operation]?: Operation[] } = {
  get: ["read"],
  list: ["read"],
  read: ["get", "list"],
  create: ["write"],
  update: ["write"],
  delete: ["write"],
  write: ["create", "update", "delete"],
}

export const LineLength = 100

/**
 * Returns the first conflicting operation pair found in the given rule map, or `undefined` if no conflicts are present.
 * @param rules - The rule map to check for conflicting operations.
 * @returns An object containing the conflicting operation and its conflict, or `undefined` if no conflicts are found.
 */
export function getConflictingOperation(
  rules: RuleMap,
): { operation: Operation; conflict: Operation } | undefined {
  for (const method in rules) {
    const op = method as Operation
    const conflicts = ConflictingOperations[op] ?? []
    for (const conflict of conflicts) {
      if (rules[conflict]) {
        return { operation: op, conflict }
      }
    }
  }
}

/**
 * Hierarchical builder used to compose Firestore rules from the root down to nested collections.
 *
 * Each instance owns one schema location plus the shared helper registry and
 * helper library accumulated so far. Root builders can render the final rules
 * file, while child builders only contribute nested `match` blocks back into
 * their parent tree.
 */
export class FirestoreRulesBuilder<
  const Db extends AnyFullDbSchema,
  const Ns extends AnyFullDbNamespace,
  const Col extends AnyFullDbCollection,
  const Lib = {},
> {
  protected static _proxies = createRuleContextProxies()

  protected _path: ParentNamesFor<Ns>
  protected _registry: HelpersRegistry

  protected _lib: {
    _original: Partial<Lib>
    _extra: Partial<Lib>
  }

  protected _context: {
    data: RuleContextDataHelpers<Db, Ns>
    base: RuleContextBase & RuleContextDbHelpers<Db>
  }

  protected _ruleFactories: ((rules: RuleMap) => RuleMap)[] = []

  protected _buildersMap: FirestoreRulesBuilderMap<Db, Ns, Lib>

  protected _childBuilders: Partial<{
    [K in keyof Ns["collections"] & string]: FirestoreRulesBuilder<
      Db,
      Ns["collections"][K]["namespace"],
      Ns["collections"][K],
      Lib
    >
  }>

  get context(): RuleContextFor<Db, Ns, Lib> {
    return {
      ...this._context.base,
      ...this._context.data,
      ...FirestoreRulesBuilder._proxies,
      ...this.lib,
    } as RuleContextFor<Db, Ns, Lib>
  }

  get lib(): Lib {
    return {
      ...this._lib._original,
      ...this._lib._extra,
    } as Lib
  }

  constructor(
    registry: HelpersRegistry,
    path: ParentNamesFor<Ns>,
    context: RuleContextBase & RuleContextDbHelpers<Db>,
    lib: Lib,
  ) {
    this._path = path
    this._context = {
      base: context,
      data: createRuleContextDataHelpers(path),
    }
    this._lib = {
      _original: lib,
      _extra: {},
    }
    this._registry = registry
    this._childBuilders = {}
    this._buildersMap = new Proxy({} as FirestoreRulesBuilderMap<Db, Ns, Lib>, {
      get: (_target, property) => {
        if (typeof property !== "string") {
          throw new RuleError("Collection keys must be strings.")
        }
        return this.childBuilder(property)
      },
    })
  }

  protected extendLib<NewLib>(lib: NewLib): FirestoreRulesBuilder<Db, Ns, Col, Lib & NewLib> {
    Object.assign(this._lib._extra, lib)
    return this as unknown as FirestoreRulesBuilder<Db, Ns, Col, Lib & NewLib>
  }

  protected childBuilder<K extends keyof Ns["collections"] & string>(
    collection: K,
  ): FirestoreChildRulesBuilder<Db, Ns["collections"][K]["namespace"], Ns["collections"][K], Lib> {
    return (this._childBuilders[collection] ??= new FirestoreRulesBuilder(
      this._registry,
      [...this._path, collection] as ParentNamesFor<Ns["collections"][K]["namespace"]>,
      this._context.base,
      this.lib,
    ))
  }

  public get isRoot(): boolean {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    return this._path.length === 0
  }

  /**
   * Extends the current builder context with additional helper functions.
   *
   * The factory receives the current typed context and the shared helper
   * registrar. Returned helpers become available to subsequent `rules(...)`
   * callbacks on this builder and any descendants created from it.
   *
   * @param factory - Helper factory invoked with the current context.
   * @returns The same builder instance with an extended helper library.
   */
  public withHelpers<NewLib>(
    factory: LibFactory<NewLib, Db, Ns, Lib>,
  ): BuilderFor<Db, Ns, Col, Lib & NewLib> {
    const newLib = factory(this.context, this._registry.register.bind(this._registry))
    return this.extendLib(newLib) as BuilderFor<Db, Ns, Col, Lib & NewLib>
  }

  /**
   * Defines `allow` rules for the current collection.
   *
   * The callback runs with a collection-scoped rule context, which means it has
   * access to `resource`, collection data helpers, path params, database
   * traversal helpers, and any registered helper library.
   *
   * @param builder - Callback returning the operation map for this collection.
   * @returns The current builder for fluent chaining.
   */
  public rules(builder: RuleBuilderForCollection<Db, Col, Lib>): BuilderFor<Db, Ns, Col, Lib> {
    const err = ruleError()
    this._ruleFactories.push((prev: RuleMap) => {
      const rules = builder(this.context as unknown as RuleContextFor<Db, Col, Lib>)

      // check for duplicate rule definitions
      for (const method in rules) {
        if (prev[method as Operation]) {
          throw err(`Duplicate rule definition for method "${method}" at path "${this.path}".`)
        }
      }
      return { ...prev, ...rules }
    })
    return this as BuilderFor<Db, Ns, Col, Lib>
  }

  /**
   * Defines nested collection rules using a typed map of direct child collections.
   *
   * This is the fluent alternative to repeated `collection(...)` calls when a
   * namespace contains multiple child collections that should be configured
   * together.
   *
   * @param builder - Callback receiving builders for direct child collections.
   * @returns The current builder for fluent chaining.
   */
  public sub(builder: RuleBuilderForNamespace<Db, Ns, Lib>): BuilderFor<Db, Ns, Col, Lib> {
    builder(this._buildersMap)
    return this as BuilderFor<Db, Ns, Col, Lib>
  }

  /**
   * Returns the builder for a direct child collection.
   *
   * Repeated calls for the same collection reuse the same child builder so rules
   * and helpers accumulate on one subtree.
   *
   * @param collection - Collection name declared in the current namespace.
   * @returns A child builder for that collection.
   */
  public collection<K extends keyof Ns["collections"] & string>(
    collection: K,
  ): FirestoreChildRulesBuilder<Db, Ns["collections"][K]["namespace"], Ns["collections"][K], Lib> {
    return this.childBuilder(collection)
  }

  protected get paramName(): string {
    if (this.isRoot) {
      throw new RuleError("Cannot generate param name for root level.")
    }
    return `${singularize(this._path[this._path.length - 1] as unknown as string)}Id`
  }

  protected get path(): string {
    return (
      "/" + [...this._path].map((s) => `${s as unknown as string}/{${this.paramName}}`).join("/")
    )
  }

  protected get prettyPath(): string {
    return this._path.join(" / ")
  }

  /**
   * Checks whether this builder, optionally including descendants, contains any rules.
   *
   * @param deep - When true, also inspects nested child builders.
   * @returns `true` when at least one rule has been defined.
   */
  public hasRules(deep = false): boolean {
    const self = this._ruleFactories.length > 0
    if (self) return true
    if (deep) {
      for (const child of Object.values(this._childBuilders)) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        if (child!.hasRules(true)) return true
      }
    }
    return false
  }

  /**
   * Builds the full rule map for this builder by merging all registered rule factories.
   *
   * This is a separate step from rendering to allow for late binding of rules and
   * to ensure that helper usage is tracked across the entire builder tree before
   * any rendering happens.
   *
   * @returns The merged rule map for this builder.
   */
  protected buildRules(): RuleMap {
    return this._ruleFactories.reduce((rules, factory) => factory(rules), {})
  }

  /**
   * Renders the current builder subtree into Firestore `match` blocks.
   *
   * Root builders prepend registered helper functions and emit the database root
   * `match` block, while child builders emit only their nested collection block.
   */
  protected toSourceLines(options?: FormattingOptions): string[] {
    if (!this.hasRules(true)) return []
    if (this.isRoot) this._registry.resetUsage()

    const body: string[] = []
    const level = options?.indentationLevel ?? 0
    const baseIndent = indentFor(level)
    const indent = indentFor(level + 1)
    const comments = !options?.stripComments

    const rules = this.buildRules()
    const conflict = getConflictingOperation(rules)
    if (conflict) {
      throw new RuleError(
        `Conflicting operations "${conflict.operation}" and "${conflict.conflict}" at path "${this.path}".`,
      )
    }
    let before = false
    for (const operation of OrderedOperations) {
      const ruleBody = rules[operation]
      if (!ruleBody) continue
      before = true
      body.push(
        ...RuleExpression.toSourceLines(ruleBody, {
          ...options,
          indentationLevel: level + 1,
          prepend: `allow ${operation}: if `,
          append: ";",
        }),
      )
    }

    for (const collectionName in this._childBuilders) {
      const builder = this._childBuilders[collectionName as keyof typeof this._childBuilders]
      if (!builder?.hasRules(true)) continue
      if (before) body.push("")
      before = true
      body.push(...builder.toSourceLines({ ...options, indentationLevel: level + 1 }))
    }

    if (this.isRoot) {
      // root level
      // at root level, we need to add the helpers before any rules
      const helperLines = this._registry.toSourceLines({
        ...options,
        indentationLevel: level + 1,
      })
      return [
        `${baseIndent}match /databases/{database}/documents {`,
        helperLines.length > 0
          ? comments
            ? [`${indent}// ****[ HELPERS ]`.padEnd(LineLength, "*"), ""]
            : [""]
          : [],
        ...helperLines,
        helperLines.length > 0 && body.length > 0
          ? comments
            ? [`${indent}// ****[ RULES ]`.padEnd(LineLength, "*"), ""]
            : [""]
          : [],
        ...body,
        `${baseIndent}}${comments ? " // End of rules" : ""}`,
      ].flat()
    } else {
      // nested level
      return [
        comments ? [`${baseIndent}// ====[ ${this.prettyPath} ]`.padEnd(LineLength, "=")] : [],
        `${baseIndent}match ${this.path} {`,
        ...body,
        `${baseIndent}}${comments ? ` // End of ${this.prettyPath}` : ""}`,
      ].flat()
    }
  }

  /**
   * Renders the full Firestore rules file.
   *
   * This method is available only on the root builder. Child builders omit it at
   * the type level and still guard against misuse at runtime.
   *
   * @param options - Optional formatting controls for the rendered source.
   * @returns Complete Firestore security rules source.
   */
  public toString(options?: FormattingOptions): string {
    if (!this.isRoot) throw new RuleError("toString can only be called on the root builder.")
    const level = options?.indentationLevel ?? 0
    const indent = indentFor(level)
    const comments = !options?.stripComments
    return [
      comments
        ? [
            `${indent}// Firestore Security Rules generated by firestore-rules-dsl`,
            `${indent}// DO NOT EDIT THIS FILE DIRECTLY. Edit the TypeScript source and regenerate.`,
            "",
          ]
        : [],
      `${indent}rules_version = '2';`,
      `${indent}service cloud.firestore {`,
      ...this.toSourceLines({ ...options, indentationLevel: level + 1 }),
      `${indent}}${!options?.stripComments ? " // End of service definition" : ""}`,
    ]
      .flat()
      .join("\n")
  }
}
