import { execSync } from "node:child_process"
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import path from "node:path"

const repoRoot = process.cwd()
const tmpDir = path.join(repoRoot, ".tmp")
const integrationDir = path.join(tmpDir, "integration")
const integrationSrcDir = path.join(integrationDir, "src")
const integrationSnapshotsDir = path.join(integrationSrcDir, "__snapshots__")

const run = (command, options = {}) => {
  execSync(command, {
    stdio: "inherit",
    ...options,
  })
}

const runText = (command, options = {}) =>
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

const packTarball = () => {
  const packOutput = runText("npm pack --json", { cwd: repoRoot })
  const parsed = JSON.parse(packOutput)

  if (!Array.isArray(parsed) || parsed.length === 0 || !parsed[0].filename) {
    throw new Error("Unable to determine tarball filename from npm pack output")
  }

  return path.join(repoRoot, parsed[0].filename)
}

const main = () => {
  let tarballPath

  try {
    tarballPath = packTarball()

    copyIntegrationFixtures()

    run("npm init -y", { cwd: integrationDir })
    run(`npm install \"${tarballPath}\" --save`, { cwd: integrationDir })
    run("npm install vitest@^4 --save-dev", { cwd: integrationDir })
    run("npx vitest run src/index.test.ts", { cwd: integrationDir })
  } finally {
    rmSync(tmpDir, { recursive: true, force: true })

    if (tarballPath) {
      rmSync(tarballPath, { force: true })
    }
  }
}

main()
