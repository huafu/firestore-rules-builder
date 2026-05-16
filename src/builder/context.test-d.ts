/* eslint-disable @typescript-eslint/no-unused-vars */
import { describe, expectTypeOf, it } from "vitest"

import type { BuilderContext, PublicExpression } from "./context"
import type { CollectionShape, DatabaseDefinition } from "./db"

type Db = DatabaseDefinition<
  {
    users: CollectionShape<
      {
        name: string
        profile: {
          city: string
        }
        userIds: Record<string, boolean>
        types: {
          str: string
          num: number
          bool: boolean
        }
      },
      {
        posts: CollectionShape<{
          title: string
          tags: string[]
        }>
      }
    >
  },
  {
    admin: boolean
    orgId: string
  }
>

type Ctx = BuilderContext<Db, "users/{userId}">
type PostCtx = BuilderContext<Db, "users/{userId}/posts/{postId}">

describe("builder context types", () => {
  it("types db helpers at nested paths", () => {
    expectTypeOf<ReturnType<ReturnType<Ctx["db"]["users"]>["get"]>>().toExtend<PublicExpression>()
    expectTypeOf<
      ReturnType<ReturnType<Ctx["db"]["users"]>["exists"]>
    >().toExtend<PublicExpression>()

    type UsersDoc = ReturnType<Ctx["db"]["users"]>
    expectTypeOf<UsersDoc>().toHaveProperty("posts")
    expectTypeOf<ReturnType<ReturnType<UsersDoc["posts"]>["get"]>>().toExtend<PublicExpression>()
  })

  it("types request/resource common fields", () => {
    expectTypeOf<Ctx["request"]["time"]>().toExtend<PublicExpression>()
    expectTypeOf<Ctx["request"]["resource"]["id"]>().toExtend<PublicExpression>()
    expectTypeOf<Ctx["resource"]["id"]>().toExtend<PublicExpression>()
  })

  it("types request.resource.data and resource.data from path document", () => {
    expectTypeOf<
      Ctx["request"]["resource"]["data"]["profile"]["city"]
    >().toExtend<PublicExpression>()
    expectTypeOf<Ctx["resource"]["data"]["profile"]["city"]>().toExtend<PublicExpression>()

    expectTypeOf<PostCtx["request"]["resource"]["data"]["title"]>().toExtend<PublicExpression>()
  })

  it("restricts request.auth.token to custom claims", () => {
    expectTypeOf<Ctx["request"]["auth"]["token"]["admin"]>().toExtend<PublicExpression>()
    expectTypeOf<Ctx["request"]["auth"]["token"]["orgId"]>().toExtend<PublicExpression>()

    // @ts-expect-error unknown claim should not be available
    type _Missing = Ctx["request"]["auth"]["token"]["missingClaim"]
  })

  it("exposes value methods on request.auth root", () => {
    expectTypeOf<Ctx["request"]["auth"]>().toExtend<PublicExpression>()
    expectTypeOf<Ctx["request"]["auth"]>().toHaveProperty("eq")
    expectTypeOf<Ctx["request"]["auth"]>().toHaveProperty("neq")
    expectTypeOf<Ctx["request"]["auth"]>().toHaveProperty("keys")

    expectTypeOf<ReturnType<Ctx["request"]["auth"]["neq"]>>().toExtend<PublicExpression>()
  })

  it("infers params from full path", () => {
    expectTypeOf<Ctx["params"]>().toEqualTypeOf<{ userId: string }>()
    expectTypeOf<PostCtx["params"]>().toEqualTypeOf<{ userId: string; postId: string }>()
  })

  it("exposes map/list helper methods on typed fields", () => {
    expectTypeOf<
      ReturnType<Ctx["resource"]["data"]["userIds"]["keys"]>
    >().toExtend<PublicExpression>()
    expectTypeOf<
      ReturnType<PostCtx["resource"]["data"]["tags"]["size"]>
    >().toExtend<PublicExpression>()
  })

  it("hides AST node discriminator (kind) and location (loc) from public API", () => {
    // PublicExpression should not have kind or loc properties
    type TokenExpr = Ctx["request"]["auth"]["token"]["orgId"]

    // @ts-expect-error kind should not be exposed
    type _HasKind = TokenExpr["kind"]

    // @ts-expect-error loc should not be exposed
    type _HasLoc = TokenExpr["loc"]
  })

  it("provides typed method access without exposing AST internals", () => {
    type TokenExpr = Ctx["request"]["auth"]["token"]["orgId"]

    // Should have comparison methods
    expectTypeOf<TokenExpr>().toHaveProperty("eq")
    expectTypeOf<TokenExpr>().toHaveProperty("neq")
    expectTypeOf<TokenExpr>().toHaveProperty("gt")

    // But not AST properties
    expectTypeOf<TokenExpr>().not.toHaveProperty("kind")
    expectTypeOf<TokenExpr>().not.toHaveProperty("loc")
  })

  it("exposes split on string fields", () => {
    expectTypeOf<Ctx["resource"]["data"]["name"]>().toHaveProperty("split")
    expectTypeOf<
      ReturnType<Ctx["resource"]["data"]["name"]["split"]>
    >().toExtend<PublicExpression>()
    expectTypeOf<ReturnType<Ctx["resource"]["data"]["name"]["split"]>>().toHaveProperty("size")
  })

  it("exposes ifElse helper on context", () => {
    expectTypeOf<Ctx>().toHaveProperty("ifElse")
    expectTypeOf<ReturnType<Ctx["ifElse"]>>().toExtend<PublicExpression>()
  })

  it("exposes switchCase and hasPath helpers on context", () => {
    expectTypeOf<Ctx>().toHaveProperty("switchCase")
    expectTypeOf<Ctx>().toHaveProperty("hasPath")
    expectTypeOf<ReturnType<Ctx["switchCase"]>>().toExtend<PublicExpression>()
    expectTypeOf<ReturnType<Ctx["hasPath"]>>().toExtend<PublicExpression>()
  })

  it("accepts correct types for string field eq/neq", () => {
    type StrEqParam = Parameters<Ctx["resource"]["data"]["types"]["str"]["eq"]>[0]
    expectTypeOf<ReturnType<Ctx["resource"]["data"]["types"]["str"]["eq"]>>().toExtend<PublicExpression>()

    // string field eq accepts string and null
    expectTypeOf<StrEqParam>().extract<string>().toEqualTypeOf<string>()
    expectTypeOf<StrEqParam>().extract<null>().toEqualTypeOf<null>()

    // string field eq rejects number and boolean
    expectTypeOf<StrEqParam>().extract<number>().toEqualTypeOf<never>()
    expectTypeOf<StrEqParam>().extract<boolean>().toEqualTypeOf<never>()
  })

  it("accepts correct types for number field eq/neq", () => {
    type NumEqParam = Parameters<Ctx["resource"]["data"]["types"]["num"]["eq"]>[0]
    expectTypeOf<ReturnType<Ctx["resource"]["data"]["types"]["num"]["eq"]>>().toExtend<PublicExpression>()

    // number field eq accepts number and null
    expectTypeOf<NumEqParam>().extract<number>().toEqualTypeOf<number>()
    expectTypeOf<NumEqParam>().extract<null>().toEqualTypeOf<null>()

    // number field eq rejects string and boolean
    expectTypeOf<NumEqParam>().extract<string>().toEqualTypeOf<never>()
    expectTypeOf<NumEqParam>().extract<boolean>().toEqualTypeOf<never>()
  })

  it("accepts correct types for boolean field eq/neq", () => {
    type BoolEqParam = Parameters<Ctx["resource"]["data"]["types"]["bool"]["eq"]>[0]
    expectTypeOf<ReturnType<Ctx["resource"]["data"]["types"]["bool"]["eq"]>>().toExtend<PublicExpression>()

    // boolean field eq accepts boolean and null
    expectTypeOf<BoolEqParam>().extract<boolean>().toEqualTypeOf<boolean>()
    expectTypeOf<BoolEqParam>().extract<null>().toEqualTypeOf<null>()

    // boolean field eq rejects string and number
    expectTypeOf<BoolEqParam>().extract<string>().toEqualTypeOf<never>()
    expectTypeOf<BoolEqParam>().extract<number>().toEqualTypeOf<never>()
  })

  it("accepts correct types for object|null auth neq", () => {
    type AuthNeqParam = Parameters<Ctx["request"]["auth"]["neq"]>[0]
    expectTypeOf<ReturnType<Ctx["request"]["auth"]["neq"]>>().toExtend<PublicExpression>()

    // auth neq accepts null (since auth is { ... } | null)
    expectTypeOf<AuthNeqParam>().extract<null>().toEqualTypeOf<null>()

    // auth neq rejects raw primitives (only accepts the object shape or null)
    expectTypeOf<AuthNeqParam>().extract<string>().toEqualTypeOf<never>()
    expectTypeOf<AuthNeqParam>().extract<number>().toEqualTypeOf<never>()
    expectTypeOf<AuthNeqParam>().extract<boolean>().toEqualTypeOf<never>()
  })

  it("returns PublicExpression from gt on typed fields", () => {
    expectTypeOf<ReturnType<Ctx["resource"]["data"]["types"]["str"]["gt"]>>().toExtend<PublicExpression>()
    expectTypeOf<ReturnType<Ctx["resource"]["data"]["types"]["num"]["gt"]>>().toExtend<PublicExpression>()
  })
})
