import { defineConfig } from "vite"
import dts from "vite-plugin-dts"

export default defineConfig({
  build: {
    lib: {
      entry: "src/index.ts",
      name: "FirestoreRulesBuilder",
      formats: ["es", "cjs"],
      fileName: (format) => (format === "es" ? "index.js" : "index.cjs")
    }
  },
  plugins: [
    dts({
      include: ["src/**/*.ts"],
      outDir: "dist"
    })
  ]
})
