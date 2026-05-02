import { execSync, type ExecSyncOptionsWithStringEncoding } from "node:child_process"
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import path from "node:path"

type NpmPackResult = {
  filename: string
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null
const isUnknownArray = (value: unknown): value is unknown[] => Array.isArray(value)

const parseJson = (value: string): unknown => JSON.parse(value) as unknown

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
}

const parseNpmPackOutput = (json: string): NpmPackResult => {
  const parsed = parseJson(json)

  if (!isUnknownArray(parsed) || parsed.length === 0) {
    throw new Error("Unable to determine tarball filename from npm pack output")
  }

  const firstResult = parsed[0]
  if (!isRecord(firstResult)) {
    throw new Error("Unable to determine tarball filename from npm pack output")
  }

  const filename = firstResult["filename"]
  if (typeof filename !== "string") {
    throw new Error("Unable to determine tarball filename from npm pack output")
  }

  return { filename }
}

const packTarball = () => {
  const packOutput = runText("npm pack --json", { cwd: repoRoot, encoding: "utf8" })
  const { filename } = parseNpmPackOutput(packOutput)
  return path.join(repoRoot, filename)
}

const main = () => {
  let tarballPath: string | undefined

  try {
    tarballPath = packTarball()

    copyIntegrationFixtures()

    run("npm init -y", { cwd: integrationDir, encoding: "utf8" })
    run(`npm install "${tarballPath}" --save`, { cwd: integrationDir, encoding: "utf8" })
    run("npm install vitest@^4 --save-dev", { cwd: integrationDir, encoding: "utf8" })
    run("npx vitest run src/index.test.ts", { cwd: integrationDir, encoding: "utf8" })
  } finally {
    rmSync(tmpDir, { recursive: true, force: true })

    if (tarballPath !== undefined) {
      rmSync(tarballPath, { force: true })
    }
  }
}

main()
