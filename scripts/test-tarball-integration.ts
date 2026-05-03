import { execSync, type ExecSyncOptionsWithStringEncoding } from "node:child_process"
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import path from "node:path"

type PnpmPackResult = {
  filename: string
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null

const repoRoot = process.cwd()
const tmpDir = path.join(repoRoot, ".tmp")
const integrationDir = path.join(tmpDir, "integration")
const integrationSrcDir = path.join(integrationDir, "src")
const integrationSnapshotsDir = path.join(integrationSrcDir, "__snapshots__")

const run = (
  command: string,
  options: ExecSyncOptionsWithStringEncoding = { encoding: "utf8" },
) => {
  execSync(command, {
    stdio: "inherit",
    ...options,
  })
}

const runText = (command: string, options?: ExecSyncOptionsWithStringEncoding) =>
  execSync(command, {
    encoding: "utf8",
    ...options,
  }).trim()

const copyIntegrationFixtures = () => {
  rmSync(integrationDir, { recursive: true, force: true })
  mkdirSync(integrationSnapshotsDir, { recursive: true })

  const sourceTestPath = path.join(repoRoot, "src", "index.test.ts")
  const sourceSnapshotPath = path.join(repoRoot, "src", "__snapshots__", "index.test.ts.snap")

  const targetTestPath = path.join(integrationSrcDir, "index.test.ts")
  const targetSnapshotPath = path.join(integrationSnapshotsDir, "index.test.ts.snap")

  copyFileSync(sourceSnapshotPath, targetSnapshotPath)

  const testSource = readFileSync(sourceTestPath, "utf8")
  const patchedTestSource = testSource.replace(
    /from\s+["']\.\/index["']/g,
    'from "firestore-rules-dsl"',
  )

  writeFileSync(targetTestPath, patchedTestSource)

  const subpathTypecheckPath = path.join(integrationSrcDir, "typesaurus-subpath.typecheck.ts")
  writeFileSync(
    subpathTypecheckPath,
    [
      'import type { Typesaurus } from "typesaurus"',
      'import type { OfTypesaurus } from "firestore-rules-dsl/typesaurus"',
      "",
      "// Smoke test: the subpath type export resolves and composes with Typesaurus types.",
      "type _Smoke = OfTypesaurus<Typesaurus.Schema<any>>",
      "",
    ].join("\n"),
  )
}

const packTarball = () => {
  const output = runText("pnpm pack --json", { cwd: repoRoot, encoding: "utf8" })
  const parsed = JSON.parse(output) as unknown

  if (!isRecord(parsed) || typeof parsed["filename"] !== "string") {
    throw new Error("Unable to determine tarball filename from pnpm pack output")
  }

  const { filename } = parsed as PnpmPackResult
  return path.join(repoRoot, filename)
}

const main = () => {
  let tarballPath: string | undefined
  const options = { cwd: integrationDir, encoding: "utf8" } as const

  try {
    tarballPath = packTarball()

    copyIntegrationFixtures()

    run("pnpm init", options)
    run(`pnpm add "file:${tarballPath}"`, options)
    run("pnpm add -D vitest@^4", options)
    run("pnpm exec vitest run src/index.test.ts", options)
    run("pnpm add -D typesaurus@^10 typescript@^6", options)
    run(
      "pnpm exec tsc --ignoreConfig --noEmit --skipLibCheck --moduleResolution bundler --module esnext src/typesaurus-subpath.typecheck.ts",
      options,
    )
  } finally {
    rmSync(tmpDir, { recursive: true, force: true })

    if (tarballPath !== undefined) {
      rmSync(tarballPath, { force: true })
    }
  }
}

main()
