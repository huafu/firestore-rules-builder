import { useEffect, useMemo, useRef, useState } from "react"
import Editor, { type Monaco, type OnMount } from "@monaco-editor/react"
import type * as MonacoType from "monaco-editor"
import ts from "typescript"
import { createAstRulesBuilder, defineFirestoreRulesLibrary } from "firestore-rules-dsl"
import brandIcon from "./brand-icon.svg"
import { defaultSource } from "./defaultSource"
import { configureMonaco } from "./monacoSetup"

type PreviewState = {
  rules: string
  error: string | null
}

function normalizeSourceForExecution(source: string): string {
  return source.replace(
    /^\s*import(?:\s+type)?\s+\{[^}]*\}\s+from\s+["']firestore-rules-dsl["'];?\s*$/gm,
    "",
  )
}

function compileRules(source: string): PreviewState {
  try {
    const sourceForExecution = normalizeSourceForExecution(source)

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
      const first = transpiled.diagnostics[0]
      const message = ts.flattenDiagnosticMessageText(first.messageText, "\n")
      return {
        rules: "",
        error: `TypeScript: ${message}`,
      }
    }

    // Runtime execution is required for the playground preview.
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const runner = new Function(
      "createAstRulesBuilder",
      "defineFirestoreRulesLibrary",
      `${transpiled.outputText}\nif (typeof buildRules !== "function") { throw new Error("Please define function buildRules() { ... }") }\nreturn buildRules();`,
    ) as (
      createAstRulesBuilderRef: typeof createAstRulesBuilder,
      defineFirestoreRulesLibraryRef: typeof defineFirestoreRulesLibrary,
    ) => unknown

    const result = runner(createAstRulesBuilder, defineFirestoreRulesLibrary)
    if (typeof result === "string") {
      return { rules: result, error: null }
    }

    if (typeof result === "object" && result !== null && "toString" in result) {
      const sourceOutput = (result as { toString: () => string }).toString()
      return { rules: sourceOutput, error: null }
    }

    return {
      rules: "",
      error: "buildRules() must return a builder instance or a string.",
    }
  } catch (error) {
    return {
      rules: "",
      error: error instanceof Error ? error.message : "Unknown execution error",
    }
  }
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

export function App() {
  const dslVersion = __DSL_VERSION__
  const [source, setSource] = useState(defaultSource)
  const [preview, setPreview] = useState<PreviewState>(() => compileRules(defaultSource))
  const [npmDownloads, setNpmDownloads] = useState<number | null>(null)
  const [githubStars, setGithubStars] = useState<number | null>(null)
  const [tsMarkers, setTsMarkers] = useState<MonacoType.editor.IMarker[]>([])
  const monacoRef = useRef<Monaco | null>(null)

  useEffect(() => {
    fetch("https://api.npmjs.org/downloads/point/last-month/firestore-rules-dsl")
      .then((r) => r.json())
      .then((d: { downloads?: number }) => {
        setNpmDownloads(d.downloads ?? null)
      })
      .catch(() => {})
    fetch("https://api.github.com/repos/huafu/firestore-rules-builder")
      .then((r) => r.json())
      .then((d: { stargazers_count?: number }) => {
        setGithubStars(d.stargazers_count ?? null)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setPreview(compileRules(source))
    }, 220)

    return () => {
      window.clearTimeout(handle)
    }
  }, [source])

  const statusText = useMemo(() => {
    if (preview.error) {
      return "Needs attention"
    }
    return "Live preview"
  }, [preview.error])

  const handleBeforeMount = (monaco: Monaco) => {
    configureMonaco(monaco)
  }

  const handleTsEditorMount: OnMount = (_editor, monaco) => {
    monacoRef.current = monaco
    const updateMarkers = () => {
      const allMarkers = monaco.editor.getModelMarkers({ resource: undefined })
      const tsMarkerList = allMarkers.filter(
        (m) =>
          m.owner === "typescript" &&
          (m.severity === monaco.MarkerSeverity.Error ||
            m.severity === monaco.MarkerSeverity.Warning),
      )
      setTsMarkers(tsMarkerList)
    }
    monaco.editor.onDidChangeMarkers(updateMarkers)
    updateMarkers()
  }

  const tsErrorCount = tsMarkers.filter(
    (m) => monacoRef.current && m.severity === monacoRef.current.MarkerSeverity.Error,
  ).length
  const tsWarningCount = tsMarkers.filter(
    (m) => monacoRef.current && m.severity === monacoRef.current.MarkerSeverity.Warning,
  ).length

  return (
    <div className="page-shell">
      <header className="header-bar">
        <div className="brand-block">
          <img src={brandIcon} alt="Firestore Rules DSL icon" className="brand-icon" />
          <div>
            <p className="eyebrow">Package playground</p>
            <h1>Firestore Rules DSL Live Studio</h1>
          </div>
        </div>
        <div className="header-actions">
          <span className="version-pill" title="Current package version">
            v{dslVersion}
          </span>
          <a
            href="https://www.npmjs.com/package/firestore-rules-dsl"
            target="_blank"
            rel="noopener noreferrer"
            className="pkg-badge pkg-badge--npm"
            title="View on npm"
          >
            {/* npm logo */}
            <svg
              className="pkg-badge__icon"
              viewBox="0 0 18 7"
              aria-hidden="true"
              fill="currentColor"
            >
              <path d="M0 0h18v6H9V7H5V6H0zm1 5h2V2h1v3h1V1H1zm5-4v5h2V5h2V1zm2 1h1v2h-1zm3-1v4h2V2h1v3h1V2h1v3h1V1z" />
            </svg>
            <span className="pkg-badge__label">npm</span>
            {npmDownloads !== null && (
              <span className="pkg-badge__count">{formatCount(npmDownloads)}/mo</span>
            )}
          </a>
          <a
            href="https://github.com/huafu/firestore-rules-builder"
            target="_blank"
            rel="noopener noreferrer"
            className="pkg-badge pkg-badge--gh"
            title="View on GitHub"
          >
            {/* GitHub mark */}
            <svg
              className="pkg-badge__icon"
              viewBox="0 0 16 16"
              aria-hidden="true"
              fill="currentColor"
            >
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
            </svg>
            <span className="pkg-badge__label">GitHub</span>
            {githubStars !== null && (
              <span className="pkg-badge__count">
                <svg
                  viewBox="0 0 16 16"
                  aria-hidden="true"
                  fill="currentColor"
                  style={{
                    width: "0.75em",
                    height: "0.75em",
                    verticalAlign: "middle",
                    marginRight: "0.2em",
                  }}
                >
                  <path d="M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.751.751 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.873 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25Z" />
                </svg>
                {formatCount(githubStars)}
              </span>
            )}
          </a>
          <div className={`status-pill ${preview.error ? "is-error" : "is-ok"}`}>{statusText}</div>
        </div>
      </header>

      <main className="editor-grid">
        <section className="panel panel-input">
          <div className="panel-head">
            <div className="panel-head-row">
              <h2>TypeScript editor</h2>
              <button
                className="reset-btn"
                onClick={() => {
                  setSource(defaultSource)
                }}
                title="Reset to default example"
              >
                Reset
              </button>
            </div>
            <span>Autocomplete, diagnostics, and instant execution contract</span>
          </div>
          <div className="editor-wrap">
            <Editor
              beforeMount={handleBeforeMount}
              onMount={handleTsEditorMount}
              language="typescript"
              value={source}
              onChange={(nextValue) => {
                setSource(nextValue ?? "")
              }}
              theme="dsl-night-sea"
              options={{
                minimap: { enabled: false },
                fontSize: 14,
                fontFamily: "'IBM Plex Mono', monospace",
                lineNumbersMinChars: 3,
                wordWrap: "on",
                padding: { top: 14, bottom: 14 },
                smoothScrolling: true,
                automaticLayout: true,
                scrollBeyondLastLine: false,
              }}
            />
          </div>
          <div
            className={`diagnostic-strip ${tsErrorCount > 0 ? "is-error" : tsWarningCount > 0 ? "is-warning" : "is-ok"}`}
            role="status"
            aria-live="polite"
          >
            {tsErrorCount > 0 || tsWarningCount > 0 ? (
              <>
                {tsErrorCount > 0 && (
                  <span className="diag-item diag-item--error">
                    <svg
                      viewBox="0 0 16 16"
                      fill="currentColor"
                      aria-hidden="true"
                      className="diag-icon"
                    >
                      <circle
                        cx="8"
                        cy="8"
                        r="7"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        fill="none"
                      />
                      <path
                        d="M8 4.5v4M8 10.5v1"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                      />
                    </svg>
                    {tsErrorCount} error{tsErrorCount !== 1 ? "s" : ""}
                  </span>
                )}
                {tsWarningCount > 0 && (
                  <span className="diag-item diag-item--warning">
                    <svg
                      viewBox="0 0 16 16"
                      fill="currentColor"
                      aria-hidden="true"
                      className="diag-icon"
                    >
                      <path
                        d="M8 2L14.9 14H1.1L8 2z"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        fill="none"
                        strokeLinejoin="round"
                      />
                      <path
                        d="M8 7v3M8 11.5v.5"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                      />
                    </svg>
                    {tsWarningCount} warning{tsWarningCount !== 1 ? "s" : ""}
                  </span>
                )}
              </>
            ) : (
              "No TypeScript diagnostics."
            )}
          </div>
        </section>

        <section className="panel panel-output">
          <div className="panel-head">
            <h2>Generated Firestore rules</h2>
            <span>Read-only output updates as you type</span>
          </div>
          <div className="editor-wrap">
            <Editor
              beforeMount={handleBeforeMount}
              language="firestore-rules"
              value={preview.rules}
              theme="dsl-night-sea"
              options={{
                readOnly: true,
                minimap: { enabled: false },
                fontSize: 14,
                fontFamily: "'IBM Plex Mono', monospace",
                lineNumbersMinChars: 3,
                wordWrap: "on",
                padding: { top: 14, bottom: 14 },
                smoothScrolling: true,
                automaticLayout: true,
                scrollBeyondLastLine: false,
              }}
            />
          </div>
          <div
            className={`diagnostic-strip ${preview.error ? "is-error" : "is-ok"}`}
            role="status"
            aria-live="polite"
          >
            {preview.error ? preview.error : "Compilation successful. Rules output is current."}
          </div>
        </section>
      </main>
    </div>
  )
}
