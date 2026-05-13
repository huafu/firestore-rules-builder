import { defineConfig } from "vite"
import dts from "vite-plugin-dts"

export default defineConfig({
  build: {
    lib: {
      entry: {
        index: "src/index.ts",
        ast: "src/ast/index.ts",
        builder: "src/builder/index.ts",
        library: "src/library/index.ts",
        testing: "src/testing/index.ts",
        typesaurus: "src/typesaurus/index.ts",
      },
      formats: ["es", "cjs"],
      fileName: (format, entryName) => (format === "es" ? `${entryName}.js` : `${entryName}.cjs`),
    },
  },
  plugins: [
    dts({
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/**/*.test-d.ts"],
    }),
  ],
})
