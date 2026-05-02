import { describe, expect, it, vi } from "vitest"

import { RuleExpression, indentBlock, indentFor, operand, primitive, expr } from "./expression"

describe("expression", () => {
  describe("RuleExpression", () => {
    it("detects expressions by instance and optional id", () => {
      const named = expr("auth")`request.auth`
      const unnamed = expr()(`resource.data`)

      expect(RuleExpression.is(named)).toBe(true)
      expect(RuleExpression.is(named, "auth")).toBe(true)
      expect(RuleExpression.is(named, "other")).toBe(false)
      expect(RuleExpression.is(unnamed)).toBe(true)
      expect(RuleExpression.is("request.auth")).toBe(false)
    })

    it("builds expressions from source parts and tagged templates", () => {
      const requestAuth = expr("auth")`request.auth`
      const uid = expr()`request.auth.uid`

      expect(RuleExpression.toString(expr()("request", ".", "auth"))).toBe("request.auth")
      expect(RuleExpression.toString(expr()`${requestAuth}.uid == ${uid}`)).toBe(
        "request.auth.uid == request.auth.uid",
      )
    })

    it("reuses an existing expression when the id matches", () => {
      const requestAuth = expr("auth")`request.auth`

      expect(expr("auth")(requestAuth)).toBe(requestAuth)
      expect(expr("other")(requestAuth)).not.toBe(requestAuth)
      expect(RuleExpression.toString(expr("other")(requestAuth))).toBe("request.auth")
    })

    it("supports id-only expressions and rejects missing source without id", () => {
      expect(RuleExpression.toString(expr("allow")())).toBe("allow")
      expect(() => expr()()).toThrow("Expression ID is required when no source is provided.")
    })

    it("evaluates lazy parts and caches plain string output", () => {
      const fragment = vi.fn(() => "request.auth")
      const rule = expr("auth")(fragment)

      expect(RuleExpression.toString(rule)).toBe("request.auth")
      expect(RuleExpression.toString(rule)).toBe("request.auth")
      expect(fragment).toHaveBeenCalledTimes(1)
    })

    it("skips cache when formatting options change output", () => {
      const fragment = vi.fn(() => "request.auth")
      const rule = expr("auth")(fragment)

      expect(RuleExpression.toString(rule, { prepend: "if ", append: ";" })).toBe(
        "if request.auth;",
      )
      expect(RuleExpression.toString(rule, { prepend: "if ", append: ";" })).toBe(
        "if request.auth;",
      )
      expect(fragment).toHaveBeenCalledTimes(2)
    })

    it("normalizes indentation and source lines", () => {
      const rule = expr()("\n    allow read: if true\n      && request.auth != null\n")

      expect(RuleExpression.toString(rule, { indentationLevel: 1 })).toBe(
        "\n  allow read: if true\n    && request.auth != null\n",
      )
      expect(RuleExpression.toSourceLines(rule, { prepend: "if ", append: ";" })).toEqual([
        "",
        "if allow read: if true",
        "  && request.auth != null;",
        "",
      ])
    })

    it("supports lazy fragments returning nested expressions", () => {
      const left = expr()`request.auth`
      const rule = expr()`(${() => left} != ${() => operand(null)})`

      expect(RuleExpression.toString(rule)).toBe("(request.auth != null)")
    })
  })

  describe("operand", () => {
    it("converts primitive operands into rule literals", () => {
      expect(RuleExpression.toString(operand('hello "world"'))).toBe(
        JSON.stringify('hello "world"'),
      )
      expect(RuleExpression.toString(operand(42))).toBe("42")
      expect(RuleExpression.toString(operand(true))).toBe("true")
      expect(RuleExpression.toString(operand(false))).toBe("false")
      expect(RuleExpression.toString(operand(null))).toBe("null")
    })

    it("returns expressions unchanged", () => {
      const source = expr()`request.auth.uid`

      expect(operand(source)).toBe(source)
    })
  })

  describe("indentation helpers", () => {
    it("creates indentation strings and indents non-empty lines only", () => {
      expect(indentFor(0)).toBe("")
      expect(indentFor(2)).toBe("    ")
      expect(indentBlock("a\n\n b", 1)).toBe("  a\n\n   b")
    })
  })

  describe("primitive guards", () => {
    it("identifies only primitive rule values", () => {
      const rule = expr()`request.auth.uid`

      expect(primitive.isString("hello")).toBe(true)
      expect(primitive.isNumber(1)).toBe(true)
      expect(primitive.isBoolean(false)).toBe(true)
      expect(primitive.isNull(null)).toBe(true)
      expect(primitive.isString(rule)).toBe(false)
      expect(primitive.isNumber(rule)).toBe(false)
      expect(primitive.isBoolean(rule)).toBe(false)
      expect(primitive.isNull(rule)).toBe(false)
    })
  })
})
