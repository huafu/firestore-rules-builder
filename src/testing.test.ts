import { describe, expect, expectTypeOf, it, vi } from "vitest"

import {
  type AnyDbNamespace,
  type AnyDbSchema,
  type ClaimKeyFor,
  type DataKeysFor,
  type DbCollection,
  type RuleContextFor,
} from "./index"
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
type Claims = { admin?: boolean }
type Meta = { authClaims: Claims }

const libFactory = <Db extends AnyDbSchema, Ns extends AnyDbNamespace, Lib>(
  $: RuleContextFor<Db, Ns, Lib>,
) => ({
  isAuthenticated: () => $.isset($.request.auth.uid),
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
  canAccess: <K extends DataKeysFor<Ns>>(key: K) =>
    $.and($.isset($.request.auth.uid), $.neq($.resource.data[key], $.null)),
  noClaim: (key: ClaimKeyFor<Db>) => $.eq($.request.auth.token.$prop(key), $.null),
})

describe("createTestUtils", () => {
  it("injects helpers created by createFirestoreRulesLibrary into root context", () => {
    const test = createTestUtils<TestDb, Meta>().withHelpers(libFactory)

    const globalCtx = test.getContext()
    expect(globalCtx).toHaveProperty("isAuthenticated", expect.any(Function))
    expect(stringifyExpr(globalCtx.isAuthenticated())).toBe("request.auth.uid != null")

    expect(globalCtx).toHaveProperty("noClaim", expect.any(Function))
    expect(stringifyExpr(globalCtx.noClaim("admin"))).toBe('request.auth.token["admin"] == null')
    expectTypeOf<Parameters<(typeof globalCtx)["noClaim"]>[0]>().toEqualTypeOf<"admin">()

    const ctx = test.withCollection("test").getContext()
    expect(ctx).toHaveProperty("canAccess", expect.any(Function))
    expect(stringifyExpr(ctx.canAccess("ownerId"))).toBe(
      "request.auth.uid != null && resource.data.ownerId != null",
    )
    // FIXME: This should ideally be "ownerId" based on the collection schema, but it currently falls back to string
    // expectTypeOf<Parameters<(typeof ctx)["canAccess"]>[0]>().toEqualTypeOf<"ownerId">()
  })

  it("injects helpers in a scoped collection context", () => {
    const test = createTestUtils<TestDb, Meta>().withCollection("test").withHelpers(libFactory)

    const ctx = test.getContext()
    expect(ctx).toHaveProperty("isAuthenticated", expect.any(Function))
    expect(stringifyExpr(ctx.isAuthenticated())).toBe("request.auth.uid != null")

    expect(ctx).toHaveProperty("noClaim", expect.any(Function))
    expect(stringifyExpr(ctx.noClaim("admin"))).toBe('request.auth.token["admin"] == null')
    expectTypeOf<Parameters<(typeof ctx)["noClaim"]>[0]>().toEqualTypeOf<"admin">()

    expect(ctx).toHaveProperty("canAccess", expect.any(Function))
    expect(stringifyExpr(ctx.canAccess("ownerId"))).toBe(
      "request.auth.uid != null && resource.data.ownerId != null",
    )
    expectTypeOf<Parameters<(typeof ctx)["canAccess"]>[0]>().toEqualTypeOf<"ownerId">()
  })

  it("invokes the library factory for each withHelpers registration", () => {
    const dummyFactory = vi.fn(($) => ({
      authUid: () => $.request.auth.uid,
    }))

    createTestUtils<TestDb, Meta>().withHelpers(dummyFactory)
    createTestUtils<TestDb, Meta>().withHelpers(dummyFactory)
    createTestUtils<TestDb, Meta>().withCollection("test").withHelpers(dummyFactory)

    expect(dummyFactory).toHaveBeenCalledTimes(3)
  })
})
