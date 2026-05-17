import type {
  AllowDeclarationNode,
  AllowOperation,
  ExpressionNode,
  FunctionDeclarationNode,
  MatchDeclarationNode,
  PathPatternNode,
  PathSegmentNode,
  ProgramNode,
  RuleStatementNode,
} from "../ast"
import { printNode } from "../ast/printer"
import {
  createAstRulesBuilder,
  type FirestoreAstRulesBuilder,
  type RuleConditionInput,
  type RulesBuilderOptions,
} from "../builder/rules-builder"
import type { CollectionShape, DatabaseDefinition } from "../builder/db"
import type { DeepMergeHelperLibraries, HelperLibrary } from "../builder/helpers"
import type { FirestoreRulesLibrary } from "../library/index"
import type { EmptyObject } from "../builder/utils"
import ts from "typescript"
import * as module from "../"
import * as ast from "../ast"
import * as builder from "../builder"
import * as library from "../library"
import * as testing from "../testing"
import * as typesaurus from "../typesaurus"

const ImportsName = "__imports"
const Imports = {
  module,
  ast,
  builder,
  library,
  testing,
  typesaurus,
}

/**
 * Internal utility to transform import statements in builder source for playground execution.
 * Transforms `import ... from "firestore-rules-dsl(/ast|/builder|/library|/testing|/typesaurus)?"` to direct references to the corresponding namespace imports included in the playground environment."
 */
function transformImports(source: string): string {
  const modules = "__modules"
  const res = source.replace(
    /^import\s+(.*)\s+from\s+["']firestore-rules-dsl(\/(ast|builder|library|testing|typesaurus))?["'];?$/gm,
    (match, symbols: string, _, namespace: string) => {
      const ns = namespace || "module"

      // remap and take care of "as"
      // handle *:
      const uniqueMatches =
        /^\s*(type\s+)?\*\s+as\s+(\w+)\s*$/gm.exec(symbols) ||
        /^\s*(type\s+)?(\w+)\s*$/gm.exec(symbols)
      if (uniqueMatches) return `const ${uniqueMatches[2]} = ${modules}.${ns}`
      // handle { ... }:
      const destructureMatches = /^\s*(type\s+)?{([^}]+)}\s*$/.exec(symbols)
      if (destructureMatches) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const importsList = destructureMatches[2]!.split(",").map((s) => s.trim())
        const destructured = importsList.map((s) => {
          const asMatches = /^\s*(type\s+)?(\w+)(\s+as\s+(\w+))?\s*$/.exec(s)
          if (!asMatches) {
            throw new Error(`Unsupported import symbol: ${s}`)
          }
          if (asMatches[4]) return `${asMatches[2]}: ${asMatches[4]}`
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          return asMatches[2]!
        })
        return `const { ${destructured.join(", ")} } = ${modules}.${ns}`
      }
      return match
    },
  )
  return `const ${modules} = ${ImportsName} as any;\n${res}`
}

type PlaygroundRunner = () => string | ReturnType<typeof module.createAstRulesBuilder>

/** Internal utility to transpile and execute builder source in the playground. */
export function buildPlaygroundSource(source: string): PlaygroundRunner {
  const sourceForExecution = transformImports(source).replace(
    /^\s*export\s+default\s+/gm,
    "const __builder = ",
  )

  const transpiled = ts.transpileModule(sourceForExecution, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      ignoreDeprecations: "6.0",
      strict: true,
    },
    reportDiagnostics: true,
  })

  if (transpiled.diagnostics && transpiled.diagnostics.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const first = transpiled.diagnostics[0]!
    const message = ts.flattenDiagnosticMessageText(first.messageText, "\n")
    throw new Error(`TypeScript: ${message}`)
  }

  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  const res = new Function(
    ImportsName,
    `${transpiled.outputText}
      if (typeof __builder === "undefined") { throw new Error("The default export must be defined.") }
      if (__builder == null) { throw new Error("The default export must be a builder instance or a string.") }
      return __builder;`,
  ) as (imports: typeof Imports) => string | ReturnType<typeof module.createAstRulesBuilder>

  return () => res(Imports)
}

/** Internal constraint for supported root database collection maps. */
type CollectionMap = Record<string, CollectionShape<Record<string, unknown>, unknown>>

/** Internal root builder alias used by harness entrypoints. */
type RootBuilder<Db extends DatabaseDefinition<CollectionMap, Record<string, unknown>>> =
  FirestoreAstRulesBuilder<Db, Db["collections"]>

/**
 * Internal root builder alias with merged helper-library typings.
 */
type RootBuilderWithHelpers<
  Db extends DatabaseDefinition<CollectionMap, Record<string, unknown>>,
  Lib extends HelperLibrary,
> = FirestoreAstRulesBuilder<Db, Db["collections"], "", DeepMergeHelperLibraries<EmptyObject, Lib>>

/** Normalizes paths so lookups are stable regardless of extra slashes. */
function normalizePath(path: string): string {
  return path
    .split("/")
    .filter((segment) => segment.length > 0)
    .join("/")
}

/** Converts a path segment AST node to canonical source text. */
function segmentToString(segment: PathSegmentNode): string {
  switch (segment.kind) {
    case "PathLiteralSegment":
      return segment.value
    case "PathVariableSegment":
      return `{${segment.name.name}}`
    case "PathRecursiveSegment":
      return `{${segment.name.name}=**}`
    default: {
      const neverSegment: never = segment
      return neverSegment
    }
  }
}

/** Flattens a path pattern node into slash-delimited source text. */
function patternToPath(pattern: PathPatternNode): string {
  return pattern.segments.map(segmentToString).join("/")
}

/** Returns the canonical documents-root match node from a program AST. */
function getDocumentsRoot(ast: ProgramNode): MatchDeclarationNode {
  const root = ast.service.body.statements.find((statement): statement is MatchDeclarationNode => {
    return statement.kind === "MatchDeclaration"
  })
  if (!root) {
    throw new Error("Missing root match declaration for /databases/{database}/documents.")
  }
  return root
}

/**
 * Finds a nested match node by normalized path using breadth-first traversal.
 */
function findMatchNode(ast: ProgramNode, path: string): MatchDeclarationNode | undefined {
  const target = normalizePath(path)
  const documentsRoot = getDocumentsRoot(ast)

  // Seed traversal from direct children of the fixed documents root.
  const queue: Array<{ node: MatchDeclarationNode; parentPath: string }> =
    documentsRoot.body.statements
      .filter((statement): statement is MatchDeclarationNode => {
        return statement.kind === "MatchDeclaration"
      })
      .map((node) => ({ node, parentPath: "" }))

  while (queue.length > 0) {
    const current = queue.shift()
    if (!current) break

    const currentPath = normalizePath(patternToPath(current.node.path))
    const fullPath = normalizePath(
      current.parentPath === "" ? currentPath : `${current.parentPath}/${currentPath}`,
    )

    if (fullPath === target) {
      return current.node
    }

    // Continue traversal through nested match declarations only.
    for (const statement of current.node.body.statements) {
      if (statement.kind !== "MatchDeclaration") continue
      queue.push({ node: statement, parentPath: fullPath })
    }
  }
}

/** Extracts allow declarations from a match body statement list. */
function filterAllows(statements: RuleStatementNode[]): AllowDeclarationNode[] {
  return statements.filter((statement): statement is AllowDeclarationNode => {
    return statement.kind === "AllowDeclaration"
  })
}

/** Returns helper function declarations emitted at documents root scope. */
function filterHelpers(ast: ProgramNode): FunctionDeclarationNode[] {
  const documentsRoot = getDocumentsRoot(ast)
  return documentsRoot.body.statements.filter((statement): statement is FunctionDeclarationNode => {
    return statement.kind === "FunctionDeclaration"
  })
}

/**
 * Introspection API returned by createRulesTestHarness.
 *
 * @typeParam Db - Database definition used to type the root builder.
 */
export interface RulesTestHarness<
  Db extends DatabaseDefinition<CollectionMap, Record<string, unknown>>,
> {
  /** Underlying AST-native root builder instance used by this harness. */
  readonly builder: RootBuilder<Db>

  /** Builds and returns the full rules AST program node. */
  toAst(): ProgramNode

  /** Builds and returns full Firestore rules source text. */
  toString(): string

  /** Finds a match declaration node by normalized collection path. */
  findMatch(path: string): MatchDeclarationNode | undefined

  /** Returns all allow declarations for a matched path. */
  getAllowDeclarations(path: string): AllowDeclarationNode[]

  /** Returns operation arrays for each allow declaration at the target path. */
  getAllowOperations(path: string): AllowOperation[][]

  /** Returns helper function declarations emitted by the builder. */
  getHelperDeclarations(): FunctionDeclarationNode[]

  /** Returns rendered source for each emitted helper declaration. */
  getHelperSources(): string[]

  /** Returns rendered helper source by exact helper function name. */
  getHelperSource(name: string): string | undefined
}

/**
 * Creates a test harness around the AST-native builder API.
 *
 * @example
 * ```ts
 * const harness = createRulesTestHarness<MyDb>((builder) => {
 *   builder.matches((match) => {
 *     match("users/{userId}", (users, $) => {
 *       users.allow("read", $.request.auth.uid.eq($.resource.data.ownerId))
 *     })
 *   })
 * })
 *
 * expect(harness.getAllowOperations("users/{userId}")).toEqual([["read"]])
 * expect(harness.toString()).toContain("allow read")
 * ```
 *
 * @typeParam Db - Database definition used to type the root builder.
 * @param configure - Optional callback to configure rules on the root builder.
 * @param options - Builder options forwarded to createAstRulesBuilder.
 * @returns A harness exposing AST/source and targeted inspection helpers.
 */
export function createRulesTestHarness<
  Db extends DatabaseDefinition<CollectionMap, Record<string, unknown>>,
>(
  configure?: (builder: RootBuilder<Db>) => void,
  options: RulesBuilderOptions = {},
): RulesTestHarness<Db> {
  const builder = createAstRulesBuilder<Db>(options)

  if (configure) {
    configure(builder)
  }

  return {
    builder,
    toAst: () => builder.toAst(),
    toString: () => builder.toString(),
    findMatch: (path: string) => findMatchNode(builder.toAst(), path),
    getAllowDeclarations: (path: string) => {
      const match = findMatchNode(builder.toAst(), path)
      return match ? filterAllows(match.body.statements) : []
    },
    getAllowOperations: (path: string) => {
      return filterAllows(findMatchNode(builder.toAst(), path)?.body.statements ?? []).map(
        (allow) => allow.operations,
      )
    },
    getHelperDeclarations: () => filterHelpers(builder.toAst()),
    getHelperSources: () => filterHelpers(builder.toAst()).map((helper) => printNode(helper)),
    getHelperSource: (name: string) => {
      const node = filterHelpers(builder.toAst()).find((helper) => helper.name.name === name)
      return node ? printNode(node) : undefined
    },
  }
}

/**
 * Creates a test harness with a reusable helper library pre-attached.
 *
 * @typeParam Db - Database definition used to type the root builder.
 * @typeParam NewLib - Helper library shape returned by library.
 * @param library - Reusable helper library attached before configure runs.
 * @param configure - Callback receiving the helper-extended root builder.
 * @param options - Builder options forwarded to createAstRulesBuilder.
 * @returns A standard test harness bound to the configured builder instance.
 */
export function createHelperLibraryTestHarness<
  Db extends DatabaseDefinition<CollectionMap, Record<string, unknown>>,
  NewLib extends HelperLibrary,
>(
  library: FirestoreRulesLibrary<NewLib>,
  configure: (builder: RootBuilderWithHelpers<Db, NewLib>) => void,
  options: RulesBuilderOptions = {},
): RulesTestHarness<Db> {
  return createRulesTestHarness<Db>((builder) => {
    const withHelpers = builder.withHelpers(library)
    configure(withHelpers)
  }, options)
}

/**
 * Builds full rules source from a single inline builder configuration.
 *
 * @example
 * ```ts
 * const source = buildRulesSource<MyDb>((builder) => {
 *   builder.matches((match) => {
 *     match("users/{userId}", (users, $) => {
 *       users.allow("read", $.request.auth.token.admin)
 *     })
 *   })
 * })
 *
 * expect(source).toContain("allow read")
 * ```
 *
 * @typeParam Db - Database definition used to type the root builder.
 * @param configure - Callback that defines all match/allow rules.
 * @param options - Builder options forwarded to createAstRulesBuilder.
 * @returns Rendered Firestore rules source.
 */
export function buildRulesSource<
  Db extends DatabaseDefinition<CollectionMap, Record<string, unknown>>,
>(configure: (builder: RootBuilder<Db>) => void, options: RulesBuilderOptions = {}): string {
  return createRulesTestHarness<Db>(configure, options).toString()
}

/**
 * Renders a single rule condition expression to source text.
 *
 * Useful for focused assertions around helper outputs or composed conditions.
 *
 * @param condition - Condition expression node-like input.
 * @returns Rendered expression source string.
 */
export function renderCondition(condition: RuleConditionInput): string {
  return printNode(condition as ExpressionNode)
}
