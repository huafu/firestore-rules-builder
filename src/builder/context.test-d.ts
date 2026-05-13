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

  it("accepts primitive and null values in comparison helpers", () => {
    expectTypeOf<ReturnType<Ctx["request"]["auth"]["neq"]>>().toExtend<PublicExpression>()
    expectTypeOf<ReturnType<Ctx["resource"]["data"]["name"]["eq"]>>().toExtend<PublicExpression>()
    expectTypeOf<ReturnType<Ctx["resource"]["data"]["name"]["gt"]>>().toExtend<PublicExpression>()

    expectTypeOf<Parameters<Ctx["request"]["auth"]["neq"]>[0]>().toEqualTypeOf<
      PublicExpression | string | number | boolean | null
    >()
    expectTypeOf<Parameters<Ctx["resource"]["data"]["name"]["eq"]>[0]>().toEqualTypeOf<
      PublicExpression | string | number | boolean | null
    >()
  })
})
