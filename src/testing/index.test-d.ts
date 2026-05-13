import { describe, expectTypeOf, it } from "vitest"

import type { RuleValue } from "../builder/context"
import type { CollectionShape, DatabaseDefinition } from "../builder/db"
import { defineFirestoreRulesLibrary } from "../library/index"
import { createHelperLibraryTestHarness, createRulesTestHarness, buildRulesSource } from "./index"

type Db = DatabaseDefinition<
  {
    users: CollectionShape<
      {
        ownerId: string
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

type AuthLibrary = {
  isSignedIn: () => RuleValue
  canRead: () => RuleValue
}

type NamespacedAuthLibrary = {
  auth: {
    isSignedIn: () => RuleValue
    canRead: () => RuleValue
  }
}

describe("testing utilities types", () => {
  it("types matches callback context for harness configuration", () => {
    createRulesTestHarness<Db>((builder) => {
      builder.matches((match) => {
        match("users/{userId}", (users, $) => {
          expectTypeOf($.params).toEqualTypeOf<{ userId: string }>()
          expectTypeOf($.request.auth.token.admin).toHaveProperty("eq")

          users.allow("read", $.request.auth.uid.eq($.resource.data.ownerId))

          users.matches((nestedMatch) => {
            nestedMatch("posts/{postId}", (_posts, post$) => {
              expectTypeOf(post$.params).toEqualTypeOf<{ userId: string; postId: string }>()
              expectTypeOf(post$.resource.data.title).toHaveProperty("eq")
            })
          })
        })
      })
    })
  })

  it("returns string source from buildRulesSource", () => {
    const source = buildRulesSource<Db>((builder) => {
      builder.matches((match) => {
        match("users/{userId}", (users, $) => {
          users.allow("read", $.request.auth.token.admin)
        })
      })
    })

    expectTypeOf(source).toEqualTypeOf<string>()
  })

  it("types helper library test harness helpers", () => {
    const library = defineFirestoreRulesLibrary((ctx, register) => {
      const isSignedIn = register("isSignedIn", [], () => ctx.request.auth.uid.is("string"))

      return {
        isSignedIn,
        canRead: register("canRead", [], () => isSignedIn()),
      }
    })

    const harness = createHelperLibraryTestHarness<Db, AuthLibrary>(library, (builder) => {
      builder.matches((match) => {
        match("users/{userId}", (users, $) => {
          expectTypeOf($.isSignedIn()).toHaveProperty("eq")
          expectTypeOf($.canRead()).toHaveProperty("eq")
          users.allow("read", $.canRead())
        })
      })
    })

    expectTypeOf(harness.getHelperSources()).toEqualTypeOf<string[]>()
    expectTypeOf(harness.getHelperSource("isSignedIn")).toEqualTypeOf<string | undefined>()
  })

  it("types namespaced helper library exports", () => {
    const namespacedLibrary = defineFirestoreRulesLibrary((ctx, register) => {
      const isSignedIn = register("isSignedIn", [], () => ctx.request.auth.uid.is("string"))

      return {
        auth: {
          isSignedIn,
          canRead: register("canRead", [], () => isSignedIn()),
        },
      }
    })

    createHelperLibraryTestHarness<Db, NamespacedAuthLibrary>(namespacedLibrary, (builder) => {
      builder.matches((match) => {
        match("users/{userId}", (users, $) => {
          expectTypeOf($.auth.isSignedIn()).toHaveProperty("eq")
          users.allow("read", $.auth.canRead())
        })
      })
    })
  })
})
