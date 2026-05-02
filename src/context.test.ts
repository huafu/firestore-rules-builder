/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from "vitest"

import {
  createRuleContextBase,
  createRuleContextDataHelpers,
  createRuleContextDbHelpers,
  createRuleContextProxies,
} from "./context"
import { RuleExpression } from "./expression"

describe("context", () => {
  describe("createRuleContextBase", () => {
    it("provides primitive constants and passthrough helpers", () => {
      const ctx = createRuleContextBase()

      expect(RuleExpression.toString(ctx.true)).toBe("true")
      expect(RuleExpression.toString(ctx.false)).toBe("false")
      expect(RuleExpression.toString(ctx.null)).toBe("null")
      expect(RuleExpression.toString(ctx.const("hello"))).toBe('"hello"')
      expect(RuleExpression.toString(ctx.if(ctx.raw("request.auth")))).toBe("request.auth")
      expect(RuleExpression.toString(ctx.unless(ctx.raw("request.auth")))).toBe("!(request.auth)")
    })

    it("builds logical/comparison expressions", () => {
      const ctx = createRuleContextBase()

      expect(RuleExpression.toString(ctx.and(ctx.raw("a"), ctx.raw("b")))).toMatch(
        /^\s*a\s+&&\s+b\s*$/,
      )
      expect(RuleExpression.toString(ctx.or(ctx.raw("a"), ctx.raw("b")))).toMatch(
        /^\s*a\s+\|\|\s*b\s*$/,
      )
      expect(RuleExpression.toString(ctx.eq(ctx.raw("a"), ctx.raw("b")))).toBe("a == b")
      expect(RuleExpression.toString(ctx.neq(ctx.raw("a"), ctx.raw("b")))).toBe("a != b")
      expect(RuleExpression.toString(ctx.gt(ctx.raw("a"), ctx.raw("b")))).toBe("a > b")
      expect(RuleExpression.toString(ctx.gte(ctx.raw("a"), ctx.raw("b")))).toBe("a >= b")
      expect(RuleExpression.toString(ctx.lt(ctx.raw("a"), ctx.raw("b")))).toBe("a < b")
      expect(RuleExpression.toString(ctx.lte(ctx.raw("a"), ctx.raw("b")))).toBe("a <= b")
      expect(RuleExpression.toString(ctx.isset(ctx.raw("request.auth")))).toBe(
        "request.auth != null",
      )
    })

    it("supports ternary/select/parens/join", () => {
      const ctx = createRuleContextBase()

      expect(
        RuleExpression.toString(ctx.ternary(ctx.raw("cond"), ctx.raw("a"), ctx.raw("b"))),
      ).toBe("cond ? a : b")
      expect(
        RuleExpression.toString(
          ctx.select([ctx.raw("a"), ctx.raw("x")], [ctx.raw("b"), ctx.raw("y")], ctx.raw("z")),
        ),
      ).toBe("a ? x : b ? y : z")
      expect(RuleExpression.toString(ctx.parens(ctx.raw("a == b")))).toBe("(a == b)")
      expect(RuleExpression.toString(ctx.parens(ctx.parens(ctx.raw`a == b`)))).toBe("(a == b)")
      expect(RuleExpression.toString(ctx.join(" + ", [ctx.raw("a"), ctx.raw("b")]))).toBe("a + b")
    })

    it("throws when select is called without a default case", () => {
      const ctx = createRuleContextBase()
      // eslint-disable-next-line @typescript-eslint/unbound-method
      const invalidSelect = ctx.select as (...args: unknown[]) => RuleExpression

      expect(() => {
        invalidSelect()
      }).toThrow("select requires at least a default case")
    })
  })

  describe("createRuleContextDbHelpers", () => {
    it("returns db traversal helpers", () => {
      const ctx = createRuleContextDbHelpers<any>()

      // @ts-expect-error testing dynamic proxy behavior
      expect(RuleExpression.toString(ctx.db.users("alice").$exists())).toBe("exists(users/alice)")
    })
  })

  describe("createRuleContextDataHelpers", () => {
    it("returns key validation helpers", () => {
      const helpers = createRuleContextDataHelpers<any, any>([]) as any

      expect(RuleExpression.toString(helpers.hasOnlyModified(["name", "email"]))).toBe(
        'request.resource.data.diff(resource.data).changedKeys().hasOnly(["name","email"])',
      )
      expect(RuleExpression.toString(helpers.hasOnlyKeys(["name"]))).toBe(
        'request.resource.data.keys().hasOnly(["name"])',
      )
      expect(RuleExpression.toString(helpers.hasAllKeys(["name"]))).toBe(
        'request.resource.data.keys().hasAll(["name"])',
      )
    })

    it("builds parent loaders when parents are provided", () => {
      const helpers = createRuleContextDataHelpers<any, any>(["users", "posts"]) as any

      expect(RuleExpression.toString(helpers.parent.users.$exists())).toBe(
        "exists(users/$(userId))",
      )
      expect(RuleExpression.toString(helpers.parent.posts.$exists())).toBe(
        "exists(users/$(userId)/posts/$(postId))",
      )
    })

    it("throws for unknown parent key", () => {
      const helpers = createRuleContextDataHelpers<any, any>(["users", "posts"]) as any

      expect(() => {
        void helpers.parent.comments
      }).toThrow('Parent "comments" not found in parents array.')
    })

    it("throws for non-string parent key", () => {
      const helpers = createRuleContextDataHelpers<any, any>(["users"]) as any

      expect(() => {
        Reflect.get(helpers.parent as object, Symbol.iterator)
      }).toThrow("Property keys must be strings.")
    })
  })

  describe("createRuleContextProxies", () => {
    it("creates request/resource/params proxies", () => {
      const proxies = createRuleContextProxies<any, any>() as any

      expect(RuleExpression.toString(proxies.request.auth.uid)).toBe("request.auth.uid")
      expect(RuleExpression.toString(proxies.resource.data)).toBe("resource.data")
      expect(RuleExpression.toString(proxies.params.userId)).toBe("userId")
    })
  })
})
