import { describe, expect, it, vi } from "vitest"

import { createFirestoreRulesLibrary, type DbCollection } from "./index"
import { createTestUtils, stringifyExpr } from "./testing"

type TestCollection = DbCollection<
  {
    ownerId: string
  },
  {
    comments: DbCollection<{
      text: string
    }>
  }
>

type TestDb = { test: TestCollection }

describe("createTestUtils", () => {
  it("injects helpers created by createFirestoreRulesLibrary into root context", () => {
    const libFactory = createFirestoreRulesLibrary(($) => ({
      isAuthenticated: () => $.isset($.request.auth.uid),
    }))

    const test = createTestUtils<TestDb>().withHelpers(libFactory)

    expect(test.getContext()).toHaveProperty("isAuthenticated", expect.any(Function))
    expect(stringifyExpr(test.getContext().isAuthenticated())).toBe("request.auth.uid != null")
  })

  it("injects helpers in a scoped collection context", () => {
    const test = createTestUtils<TestDb>()
      .withNamespace("test")
      .withHelpers(($) => ({
        canAccess: (key: typeof $.$TDataKey) =>
          $.and($.isset($.request.auth.uid), $.neq($.resource.data[key], $.null)),
      }))

    expect(test.getContext()).toHaveProperty("canAccess", expect.any(Function))
    expect(stringifyExpr(test.getContext().canAccess("ownerId"))).toBe(
      "request.auth.uid != null && resource.data.ownerId != null",
    )
  })

  it("invokes the library factory for each withHelpers registration", () => {
    const rawFactory = vi.fn(($) => ({
      authUid: () => $.request.auth.uid,
    }))
    const libFactory = createFirestoreRulesLibrary(rawFactory)

    createTestUtils().withHelpers(libFactory)
    createTestUtils().withHelpers(libFactory)
    createTestUtils<TestDb>().withNamespace("test").withHelpers(libFactory)

    expect(rawFactory).toHaveBeenCalledTimes(3)
  })
})
