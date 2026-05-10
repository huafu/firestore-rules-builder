import { describe, expect, it } from "vitest"

import { RuleExpression, expr } from "./expression"
import { HelpersRegistry } from "./helpers-registry"
import { createPathProxy } from "./proxy"

const raw = expr()

describe("helpers-registry", () => {
  it("registers helpers and returns callable expressions", () => {
    const registry = new HelpersRegistry()
    const isOwner = registry.register(
      "isOwner",
      ["userId"] as const,
      ({ userId }) => raw`request.auth.uid == ${userId}`,
    )

    expect(RuleExpression.toString(isOwner("alice"))).toBe('isOwner("alice")')
  })

  it("renders helper calls correctly when used with a PathProxy as argument", () => {
    const registry = new HelpersRegistry()
    const isOwner = registry.register(
      "isOwner",
      ["userId"] as const,
      ({ userId }) => raw`request.auth.uid == ${userId}`,
    )

    const pp = createPathProxy<{ test: string }>("req")

    expect(RuleExpression.toString(isOwner(pp.test))).toBe("isOwner(req.test)")
  })

  it("throws on duplicate helper names", () => {
    const registry = new HelpersRegistry()

    registry.register("sameName", [] as const, () => raw("true"))

    expect(() => {
      registry.register("sameName", [] as const, () => raw("false"))
    }).toThrow('Helper with name "sameName" is already registered.')
  })

  it("throws when helper is called with missing arguments", () => {
    const registry = new HelpersRegistry()
    const withArg = registry.register("withArg", ["id"] as const, ({ id }) => id)

    expect(() => {
      ;(withArg as (...args: any[]) => RuleExpression)()
    }).toThrow('Missing argument 0 (id) for helper "withArg".')
  })

  it("resolves transitive helper dependencies in used()", () => {
    const registry = new HelpersRegistry()
    const isAuthenticated = registry.register("isAuthenticated", [] as const, () =>
      raw("request.auth != null"),
    )
    const canRead = registry.register("canRead", [] as const, () => raw`${isAuthenticated()}`)

    canRead()

    const used = registry.used()
    expect(used).toEqual(expect.arrayContaining(["canRead", "isAuthenticated"]))
  })

  it("renders used helpers with comments by default", () => {
    const registry = new HelpersRegistry()
    const isAuthenticated = registry.register("isAuthenticated", [] as const, () =>
      raw("request.auth != null"),
    )

    isAuthenticated()
    const output = registry.toString()

    expect(output).toMatchInlineSnapshot(`
      "// ====[ isAuthenticated ]==========================================================================
      function isAuthenticated() {
        return request.auth != null;
      }
      "
    `)
  })

  it("respects stripComments and indentationLevel in rendering", () => {
    const registry = new HelpersRegistry()
    const isAuthenticated = registry.register("isAuthenticated", [] as const, () =>
      raw("request.auth != null"),
    )

    isAuthenticated()
    const lines = registry.toSourceLines({ stripComments: true, indentationLevel: 1 })

    expect(lines.some((line) => line.includes("// ====["))).toBe(false)
    expect(lines[0]).toBe("  function isAuthenticated() {")
    expect(lines[1]).toBe("    return request.auth != null;")
    expect(lines[2]).toBe("  }")
  })

  it("clears usage with resetUsage", () => {
    const registry = new HelpersRegistry()
    const isAuthenticated = registry.register("isAuthenticated", [] as const, () =>
      raw("request.auth != null"),
    )

    isAuthenticated()
    expect(registry.used()).toContain("isAuthenticated")

    registry.resetUsage()

    expect(registry.used()).toEqual([])
  })
})
