import type { Monaco } from "@monaco-editor/react"

let configured = false

const rawDistDtsFiles = import.meta.glob<string>("../../../dist/**/*.d.ts", {
  query: "?raw",
  import: "default",
  eager: true,
})

function stripMapComment(source: string): string {
  return source.replace(/\n\/\/\# sourceMappingURL=.*$/g, "")
}

function toVirtualDistPath(globPath: string): string {
  const normalizedPath = globPath.replace(/\\/g, "/")
  const distMarker = "/dist/"
  const markerIndex = normalizedPath.lastIndexOf(distMarker)
  const relativeToDist =
    markerIndex >= 0
      ? normalizedPath.slice(markerIndex + distMarker.length)
      : normalizedPath.replace(/^\.\.\/\.\.\/\.\.\/dist\//, "")

  return `file:///node_modules/firestore-rules-dsl/dist/${relativeToDist}`
}

function registerDslPackageTypes(monaco: Monaco): void {
  for (const [path, source] of Object.entries(rawDistDtsFiles)) {
    monaco.languages.typescript.typescriptDefaults.addExtraLib(
      stripMapComment(source),
      toVirtualDistPath(path),
    )
  }

  const packageBridgeFiles: Record<string, string> = {
    "file:///node_modules/firestore-rules-dsl/index.d.ts": 'export * from "./dist/index";',
    "file:///node_modules/firestore-rules-dsl/ast.d.ts": 'export * from "./dist/ast/index";',
    "file:///node_modules/firestore-rules-dsl/builder.d.ts":
      'export * from "./dist/builder/index";',
    "file:///node_modules/firestore-rules-dsl/library.d.ts":
      'export * from "./dist/library/index";',
    "file:///node_modules/firestore-rules-dsl/testing.d.ts":
      'export * from "./dist/testing/index";',
    "file:///node_modules/firestore-rules-dsl/typesaurus.d.ts":
      'export * from "./dist/typesaurus/index";',
  }

  for (const [path, source] of Object.entries(packageBridgeFiles)) {
    monaco.languages.typescript.typescriptDefaults.addExtraLib(source, path)
  }

  const packageAliasDeclarations = [
    'declare module "firestore-rules-dsl" { export * from "firestore-rules-dsl/dist/index" }',
    'declare module "firestore-rules-dsl/ast" { export * from "firestore-rules-dsl/dist/ast/index" }',
    'declare module "firestore-rules-dsl/builder" { export * from "firestore-rules-dsl/dist/builder/index" }',
    'declare module "firestore-rules-dsl/library" { export * from "firestore-rules-dsl/dist/library/index" }',
    'declare module "firestore-rules-dsl/testing" { export * from "firestore-rules-dsl/dist/testing/index" }',
    'declare module "firestore-rules-dsl/typesaurus" { export * from "firestore-rules-dsl/dist/typesaurus/index" }',
  ].join("\n")

  monaco.languages.typescript.typescriptDefaults.addExtraLib(
    packageAliasDeclarations,
    "file:///node_modules/firestore-rules-dsl/aliases.d.ts",
  )

  monaco.languages.typescript.typescriptDefaults.addExtraLib(
    'declare function buildRules(): import("firestore-rules-dsl").FirestoreAstRulesBuilder | string',
    "file:///playground-build-rules.d.ts",
  )
}

export function configureMonaco(monaco: Monaco): void {
  if (configured) {
    return
  }

  configured = true

  monaco.languages.register({ id: "firestore-rules" })
  monaco.languages.setMonarchTokensProvider("firestore-rules", {
    keywords: [
      "service",
      "match",
      "allow",
      "if",
      "return",
      "function",
      "rules_version",
      "true",
      "false",
      "null",
    ],
    tokenizer: {
      root: [
        [/rules_version/, "keyword"],
        [
          /[a-zA-Z_][\\w]*/,
          {
            cases: {
              "@keywords": "keyword",
              "@default": "identifier",
            },
          },
        ],
        [/[{}()[\]]/, "delimiter.bracket"],
        [/"[^\"]*"|'[^']*'/, "string"],
        [/\d+/, "number"],
        // Firestore rules support single-line comments (//), not block comments.
        [/\/\/.*$/, "comment"],
        [/==|!=|>=|<=|&&|\|\||[+\-*/%!<>]/, "operator"],
      ],
    },
  })

  monaco.editor.defineTheme("dsl-night-sea", {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "keyword", foreground: "8AF5D2", fontStyle: "bold" },
      { token: "identifier", foreground: "E8F1FF" },
      { token: "string", foreground: "F7C873" },
      { token: "number", foreground: "B4A6FF" },
      { token: "comment", foreground: "6D8AA8" },
      { token: "operator", foreground: "8FB7FF" },
    ],
    colors: {
      "editor.background": "#0B1322",
      "editorLineNumber.foreground": "#3F5170",
      "editorLineNumber.activeForeground": "#8FB7FF",
      "editorCursor.foreground": "#F7C873",
      "editor.selectionBackground": "#23427499",
      "editor.inactiveSelectionBackground": "#1A315C66",
    },
  })

  monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
    noSemanticValidation: false,
    noSyntaxValidation: false,
  })

  monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
    target: monaco.languages.typescript.ScriptTarget.ES2020,
    module: monaco.languages.typescript.ModuleKind.ESNext,
    strict: true,
    allowNonTsExtensions: true,
    noEmit: true,
    moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
  })

  registerDslPackageTypes(monaco)
}
