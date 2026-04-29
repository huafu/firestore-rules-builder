import { indentFor } from "./expression"
import { HelpersRegistry, type RegisterHelper } from "./helpers-registry"
import { createRuleContext, type RuleContext } from "./tools"
import type {
  CollectionBuilder,
  DbCollection,
  DbSchema,
  DbNamespace,
  NamespaceApi,
  Operation,
  RuleMap,
  FormattingOptions,
} from "./types"

/**
 * Internal representation of a collection node in the rule hierarchy.
 * @internal
 */
interface CollectionNode {
  key: string
  paramName: string
  operations: RuleMap
  children: CollectionNode[]
}

const OperationOrder: readonly Operation[] = [
  "read",
  "write",
  "get",
  "list",
  "create",
  "update",
  "delete",
]

const createNamespaceApi = <NS extends DbNamespace, Params extends Record<string, string>, Lib>(
  targetNodes: CollectionNode[],
  params: Params,
  lib: Lib,
): NamespaceApi<NS, Params, Lib> => {
  return new Proxy(
    {},
    {
      get(_target, property) {
        if (typeof property !== "string") {
          return undefined
        }

        return (
          callback: (
            context: RuleContext<Record<string, unknown>, Record<string, string>, Lib>,
          ) => RuleMap,
        ): CollectionBuilder<DbCollection, Record<string, string>, Lib> => {
          const paramName = `${property}Id`
          const nextParams = {
            ...params,
            [paramName]: paramName,
          } as Record<string, string>

          const node: CollectionNode = {
            key: property,
            paramName,
            operations: {},
            children: [],
          }

          const context = createRuleContext<Lib, Record<string, unknown>, Record<string, string>>(
            lib,
          )

          const operations = callback(context)
          node.operations = operations
          targetNodes.push(node)

          const collectionBuilder: CollectionBuilder<DbCollection, Record<string, string>, Lib> = {
            rules(childCallback) {
              const children = createNamespaceApi(node.children, nextParams, lib)

              childCallback(children)
              return collectionBuilder
            },
          }

          return collectionBuilder
        }
      },
    },
  ) as NamespaceApi<NS, Params, Lib>
}

const renderNode = (
  parents: string[],
  node: CollectionNode,
  options?: FormattingOptions,
): string[] => {
  const lines: string[] = []
  const level = options?.indentationLevel ?? 0
  if (!options?.stripComments) {
    lines.push(
      `${indentFor(level)}// ====[ ${[...parents, node.key].join("/{}")} ]`.padEnd(80, "="),
    )
  }
  lines.push(`${indentFor(level)}match /${node.key}/{${node.paramName}} {`)

  for (const operation of OperationOrder) {
    const expression = node.operations[operation]
    if (expression === undefined) {
      continue
    }

    lines.push(`${indentFor(level + 1)}allow ${operation}: if ${expression};`)
  }

  const childOptions = { ...options, indentationLevel: level + 1 }
  for (const childNode of node.children) {
    lines.push(...renderNode([...parents, node.key], childNode, childOptions))
  }

  const endComment = options?.stripComments
    ? ""
    : ` // end of ${[...parents, node.key].join("/{}")}`
  lines.push(`${indentFor(level)}}${endComment}`)
  return lines
}

type RootParent = {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  data: {}
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  params: {}
}

/**
 * Main builder class for constructing Firestore Security Rules with type safety.
 *
 * Provides a fluent API for defining collections, operations (read, write, create, update, delete),
 * and helper functions. Supports nested collections and custom libraries of helper functions.
 *
 * @template Schema - The database schema type (collection structure)
 * @template Lib - The library of available helper functions
 * @template Parent - The parent context (data shape and parameters)
 *
 * @example
 * ```typescript
 * const rules = createFirestoreRules<MySchema>()
 *   .withHelpers((ctx, register) => ({
 *     isAuthenticated: register("isAuthenticated", [], () => ctx.isset(ctx.request.auth))
 *   }))
 *   .rules((ns) => {
 *     ns.users(($) => ({
 *       read: $.lib.isAuthenticated(),
 *       create: $.eq($.resource.data.uid, $.request.auth.uid)
 *     }))
 *   })
 *   .build()
 * ```
 */
export class FirestoreRulesBuilder<
  Schema extends DbNamespace,
  Lib,
  Parent extends { data: Record<string, unknown>; params: Record<string, string> } = RootParent,
> {
  private lib: Lib
  private readonly rootNodes: CollectionNode[]
  private readonly helpers: HelpersRegistry

  /**
   * Creates a new FirestoreRulesBuilder instance.
   *
   * @param registry - The helpers registry (created if not provided)
   * @param lib - Custom helper functions library
   * @param rootNodes - Root collection nodes (created if not provided)
   */
  public constructor(
    registry: HelpersRegistry = new HelpersRegistry(),
    lib?: Lib,
    rootNodes?: CollectionNode[],
  ) {
    this.lib = lib ?? ({} as Lib)
    this.rootNodes = rootNodes ?? []
    this.helpers = registry
  }

  /**
   * Registers custom helper functions to use in rules.
   *
   * The factory receives the current rule context and a register function.
   * Helpers can call other helpers recursively. Multiple calls to withHelpers
   * accumulate helpers (later helpers can access earlier ones via ctx.lib).
   *
   * @template NewLib - The type of new helpers being registered
   *
   * @param factory - Function that receives context and register, returns new helpers object
   * @returns New builder with helpers added to the library
   *
   * @example
   * ```typescript
   * builder.withHelpers((ctx, register) => ({
   *   isOwner: (uid) => ctx.eq(ctx.resource.data.owner, uid),
   *   canEdit: register("canEdit", ["uid"] as const, (a) =>
   *     ctx.and(ctx.lib.isOwner(a.uid), ctx.isset(ctx.request.auth))
   *   )
   * }))
   * ```
   */
  public withHelpers<NewLib>(
    factory: (
      context: RuleContext<Parent["data"], Parent["params"], Lib>,
      register: RegisterHelper,
    ) => NewLib,
  ): FirestoreRulesBuilder<Schema, Lib & NewLib, Parent> {
    const register = this.helpers.register.bind(this.helpers)

    const context = createRuleContext<Lib, Parent["data"], Parent["params"]>(this.lib)

    const generatedHelpers = factory(context, register)
    const newLib = {
      ...this.lib,
      ...generatedHelpers,
    }

    return new FirestoreRulesBuilder<Schema, Lib & NewLib, Parent>(
      this.helpers,
      newLib,
      this.rootNodes,
    )
  }

  /**
   * Defines rules for the root-level collections in the database.
   *
   * The callback receives a namespace proxy that allows defining rules for each
   * collection using a fluent API. Rules are specified for operations like read,
   * write, create, update, delete. Nested collections can be defined via the
   * `.rules()` method on each collection.
   *
   * @param callback - Function receiving the collection namespace proxy
   * @returns New builder with rules defined
   *
   * @example
   * ```typescript
   * builder.rules((ns) => {
   *   ns.users(($) => ({
   *     read: $.if($.isset($.request.auth.uid)),
   *     create: $.eq($.resource.data.uid, $.request.auth.uid)
   *   })).rules((children) => {
   *     children.posts(($) => ({
   *       read: $.if(true)
   *     }))
   *   })
   * })
   * ```
   */
  public rules(
    callback: (namespace: NamespaceApi<Schema, Record<string, string>, Lib>) => void,
  ): FirestoreRulesBuilder<Schema, Lib, Parent> {
    const nextRootNodes: CollectionNode[] = []

    const namespaceApi = createNamespaceApi<Schema, Record<string, string>, Lib>(
      nextRootNodes,
      {},
      this.lib,
    )

    callback(namespaceApi)

    return new FirestoreRulesBuilder<Schema, Lib, Parent>(this.helpers, this.lib, nextRootNodes)
  }

  /**
   * Generates the final Firestore Security Rules string.
   *
   * Renders all collections, operations, and registered helper functions
   * into valid Firestore Rules syntax (rules_version = '2').
   *
   * @returns The complete Firestore Security Rules as a string
   *
   * @example
   * ```typescript
   * const rulesCode = builder.build();
   * console.log(rulesCode);
   * // Output:
   * // rules_version = '2';
   * // service cloud.firestore {
   * //   match /databases/{database}/documents {
   * //     ...
   * //   }
   * // }
   * ```
   */
  public build(options?: FormattingOptions): string {
    const bodyOptions = { ...options, indentationLevel: (options?.indentationLevel ?? 0) + 2 }
    const indent = indentFor((options?.indentationLevel ?? 0) + 1)
    // render rules to trigger dependency collection
    const ruleLines: string[] = []
    for (const node of this.rootNodes) {
      ruleLines.push(...renderNode([], node, bodyOptions))
    }

    const helpers = this.helpers.toString(bodyOptions)

    const lines: string[] = [
      "rules_version = '2';",
      "service cloud.firestore {",
      `${indent}match /databases/{database}/documents {`,
    ]

    if (!options?.stripComments) {
      lines.push(`${indent}// ====[ HELPERS ]`.padEnd(80, "="))
    }
    lines.push(...helpers.split("\n"))

    lines.push("", "")

    if (!options?.stripComments) {
      lines.push(`${indent}// ====[ RULES ]`.padEnd(80, "="))
    }

    lines.push(...ruleLines)

    const endComment = options?.stripComments
      ? ""
      : " // end of match /databases/{database}/documents"
    lines.push(`${indent}}${endComment}`)
    const serviceEndComment = options?.stripComments ? "" : " // end of service cloud.firestore"
    lines.push(`}${serviceEndComment}`)
    lines.push("")

    return lines.join("\n")
  }
}

/**
 * Factory function to create a new FirestoreRulesBuilder instance.
 *
 * This is the main entry point for building Firestore Security Rules with type safety.
 *
 * @template Schema - The database schema type defining collection structure
 * @returns A new FirestoreRulesBuilder instance ready for configuration
 *
 * @example
 * ```typescript
 * interface MySchema {
 *   users: DbCollection<{ name: string; email: string }>
 *   posts: DbCollection<{ title: string; content: string }>
 * }
 *
 * const rules = createFirestoreRules<MySchema>()
 *   .withHelpers(...)
 *   .rules(...)
 *   .build()
 * ```
 */
export const createFirestoreRules = <Schema extends DbSchema>() =>
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  new FirestoreRulesBuilder<Schema, {}>()

/**
 * Type definition for a helper factory function used with {@link FirestoreRulesBuilder.withHelpers}.
 *
 * @template NewLib - The type of helpers being created
 */
export type HelpersFactory<NewLib> = <
  Data extends Record<string, unknown>,
  Params extends Record<string, string>,
  Lib,
>(
  context: RuleContext<Data, Params, Lib>,
  register: RegisterHelper,
) => NewLib
