import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const currentDir = dirname(fileURLToPath(import.meta.url))
const rootPackageJsonPath = resolve(currentDir, "../../package.json")
const rootPackageJson = JSON.parse(readFileSync(rootPackageJsonPath, "utf8")) as {
  version?: string
}
const dslVersion = rootPackageJson.version ?? "0.0.0"

export default defineConfig({
  plugins: [react()],
  define: {
    __DSL_VERSION__: JSON.stringify(dslVersion),
  },
})
