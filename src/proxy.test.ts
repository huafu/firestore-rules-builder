import { describe, expect, it } from "vitest"

import { expr, RuleExpression } from "./expression"
import { createDbHelpersProxy, createParamsProxy, createPathProxy } from "./proxy"

const raw = expr()

describe("proxy", () => {
  describe("createPathProxy", () => {
    it("builds dotted paths from property access", () => {
      const proxy = createPathProxy<{ profile: { name: string } }>("resource.data")

      expect(RuleExpression.toString(proxy.profile.name)).toBe("resource.data.profile.name")
    })

    it("builds indexed paths with $prop", () => {
      const proxy = createPathProxy<{ tags: string[] }>("resource.data")

      expect(RuleExpression.toString(proxy.$prop("tags"))).toBe('resource.data["tags"]')
      expect(RuleExpression.toString(proxy.$prop(raw("idx")))).toBe("resource.data[idx]")
    })

    it("throws for non-string property keys", () => {
      const proxy = createPathProxy("resource.data")

      expect(() => Reflect.get(proxy as unknown as object, Symbol.iterator)).toThrow(
        "Property keys must be strings.",
      )
    })
  })

  describe("createParamsProxy", () => {
    it("returns expressions for params names", () => {
      const params = createParamsProxy<{ userId: string; postId: string }>()

      expect(RuleExpression.toString(params.userId)).toBe("userId")
      expect(RuleExpression.toString(params.postId)).toBe("postId")
    })

    it("throws for non-string property keys", () => {
      const params = createParamsProxy<Record<string, unknown>>()

      expect(() => Reflect.get(params as unknown as object, Symbol.iterator)).toThrow(
        "Property keys must be strings.",
      )
    })
  })

  describe("createDbHelpersProxy", () => {
    it("builds exists/get helpers for string ids", () => {
      const db = createDbHelpersProxy<any>()
      // @ts-expect-error - testing dynamic proxy return type
      const userDoc = db.users("alice")

      expect(RuleExpression.toString(userDoc.$exists())).toBe("exists(users/alice)")
      expect(RuleExpression.toString(userDoc.$get().data)).toBe("get(users/alice).data")
    })

    it("builds nested document paths", () => {
      const db = createDbHelpersProxy<any>()

      // @ts-expect-error - testing dynamic proxy return type
      expect(RuleExpression.toString(db.users("alice").posts(42).$exists())).toBe(
        "exists(users/alice/posts/42)",
      )
    })

    it("binds non-primitive ids with firestore interpolation", () => {
      const db = createDbHelpersProxy<any>()
      const dynamicId = raw("request.auth.uid")

      // @ts-expect-error - testing dynamic proxy return type
      expect(RuleExpression.toString(db.users(dynamicId).$exists())).toBe(
        "exists(users/$(request.auth.uid))",
      )
    })

    it("supports creating helpers from an explicit base path", () => {
      const fromPath = createDbHelpersProxy<any>("users/alice")

      // @ts-expect-error - testing dynamic proxy return type
      expect(RuleExpression.toString(fromPath.$exists())).toBe("exists(users/alice)")
      // @ts-expect-error - testing dynamic proxy return type
      expect(RuleExpression.toString(fromPath.$get().id)).toBe("get(users/alice).id")
    })
  })
})
