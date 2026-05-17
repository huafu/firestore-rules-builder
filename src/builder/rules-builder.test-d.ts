import { describe, expectTypeOf, it } from "vitest"

import type { CollectionShape, DatabaseDefinition } from "./db"
import { createAstRulesBuilder } from "./rules-builder"

type Db = DatabaseDefinition<
  {
    users: CollectionShape<
      {
        ownerId: string
        orgId: string
      },
      {
        posts: CollectionShape<{
          title: string
        }>
      }
    >
  },
  {
    admin: boolean
    orgId: string
  }
>

describe("ast rules builder types", () => {
  it("types path params and claims in callbacks", () => {
    const destructureBuilder = createAstRulesBuilder<Db>()

    destructureBuilder.matches((match) => {
      match("users/{userId}", ({ allow, matches }, ctx) => {
        allow("get", ctx.request.auth.uid.eq(ctx.resource.data.ownerId))

        matches((nestedMatch) => {
          nestedMatch("posts/{postId}", ({ allow: allowPost }, postCtx) => {
            expectTypeOf(postCtx.params).toEqualTypeOf<{ userId: string; postId: string }>()
            allowPost("get", postCtx.resource.data.title.neq(""))
          })
        })
      })
    })

    const builder = createAstRulesBuilder<Db>()

    builder.matches((match) => {
      match("users/{userId}", (users, ctx) => {
        expectTypeOf(ctx.params).toEqualTypeOf<{ userId: string }>()
        expectTypeOf(ctx.request.auth.token.admin).toHaveProperty("eq")
        expectTypeOf(ctx.resource.data.ownerId).toHaveProperty("eq")

        users.allow("read", ctx.request.auth.uid.eq(ctx.resource.data.ownerId))
        users.allow(["get", "list"], ctx.request.auth.uid.eq(ctx.resource.data.ownerId))
      })
    })

    builder.matches((match) => {
      match("users/{userId}", (users) => {
        users.matches((nestedMatch) => {
          nestedMatch("posts/{postId}", (posts, ctx) => {
            expectTypeOf(ctx.params).toEqualTypeOf<{ userId: string; postId: string }>()
            expectTypeOf(ctx.resource.data.title).toHaveProperty("eq")
            posts.allow("get", ctx.resource.data.title.neq(""))
          })
        })
      })
    })

    builder.matches((match) => {
      match("users/{userId}", (users, ctx) => {
        users.allow("create", ctx.request.auth.token.admin)
      })
    })
  })

  it("merges helpers into context", () => {
    const builder = createAstRulesBuilder<Db>().withHelpers((ctx, { def, arg }) => {
      const isOwner = def("isOwner", {
        args: [arg("ownerId")<string>()],
        body: ({ ownerId }) => ctx.request.auth.uid.eq(ownerId),
      })

      return {
        isOwner,
        canRead: def("canRead", {
          args: [arg("ownerId")<string>()],
          body: ({ ownerId }) => isOwner(ownerId),
        }),
      }
    })

    builder.matches((match) => {
      match("users/{userId}", (users, ctx) => {
        expectTypeOf(ctx).toHaveProperty("isOwner")
        expectTypeOf(ctx).toHaveProperty("canRead")
        expectTypeOf(ctx.canRead(ctx.resource.data.ownerId)).toHaveProperty("eq")

        users.allow("read", ctx.canRead(ctx.resource.data.ownerId))
      })
    })
  })

  it("infers nested match types from path argument without explicit generics", () => {
    const builder = createAstRulesBuilder<Db>().withHelpers((ctx, { def, arg }) => {
      const canReadOrg = def("canReadOrg", {
        args: [arg("orgId")<string>()],
        body: ({ orgId }) => ctx.request.auth.token.orgId.eq(orgId),
      })
      return { canReadOrg }
    })

    builder.matches((match) => {
      match("users/{userId}", (users) => {
        users.matches((nestedMatch) => {
          nestedMatch("posts/{postId}", (posts, ctx) => {
            expectTypeOf(ctx.params).toEqualTypeOf<{ userId: string; postId: string }>()
            posts.allow("get", ctx.canReadOrg(ctx.request.auth.token.orgId))
          })
        })
      })
    })
  })
})
