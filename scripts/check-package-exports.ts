import { existsSync, readFileSync } from "node:fs"
import path from "node:path"

type ExportTarget = Record<string, unknown> | string

const repoRoot = process.cwd()
const packageJsonPath = path.join(repoRoot, "package.json")

const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
  main?: string
  module?: string
  types?: string
  exports?: Record<string, ExportTarget>
}

const checkedFiles = new Set<string>()

const assertFileExists = (relativePath: string) => {
  const absolutePath = path.join(repoRoot, relativePath)

  if (!existsSync(absolutePath)) {
    throw new Error(`Missing package export target: ${relativePath}`)
  }

  checkedFiles.add(relativePath)
}

const walkExportTarget = (target: ExportTarget) => {
  if (typeof target === "string") {
    assertFileExists(target)
    return
  }

  for (const value of Object.values(target)) {
    if (typeof value === "string") {
      assertFileExists(value)
    } else if (value && typeof value === "object") {
      walkExportTarget(value as ExportTarget)
    }
  }
}

const main = () => {
  if (packageJson.main) {
    assertFileExists(packageJson.main)
  }

  if (packageJson.module) {
    assertFileExists(packageJson.module)
  }

  if (packageJson.types) {
    assertFileExists(packageJson.types)
  }

  for (const target of Object.values(packageJson.exports ?? {})) {
    walkExportTarget(target)
  }

  console.log(`Verified ${checkedFiles.size} package export targets.`)
}

main()
