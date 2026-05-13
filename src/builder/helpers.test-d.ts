import { describe, expectTypeOf, it } from "vitest"

import { createBuilderContext, type RuleValue } from "./context"
import type { CollectionShape, DatabaseDefinition } from "./db"
import { BuilderHelpersManager } from "./helpers"

type Db = DatabaseDefinition<
  {
    users: CollectionShape<{
      ownerId: string
    }>
  },
  {
    admin: boolean
    orgId: string
  }
>

type HelperLib = {
  isOwner(ownerId: string): RuleValue
  canRead(ownerId: string): RuleValue
}

describe("builder helper manager types", () => {
  it("merges helper functions into the builder context", () => {
    const manager = new BuilderHelpersManager<Db, "users/{userId}">().withHelpers(
      (ctx, register) => {
        const isOwner = register("isOwner", ["ownerId"], (_innerCtx, { ownerId }) =>
          ctx.request.auth.uid.eq(ownerId),
        )

        return {
          isOwner,
          canRead: register("canRead", ["ownerId"], (_innerCtx, { ownerId }) => isOwner(ownerId)),
        }
      },
    )

    const ctx = createBuilderContext<Db, "users/{userId}", HelperLib>({
      customClaims: { admin: false, orgId: "" },
      helperManager: manager,
    })

    expectTypeOf(ctx).toHaveProperty("isOwner")
    expectTypeOf(ctx).toHaveProperty("canRead")
    expectTypeOf(ctx.isOwner("alice")).toHaveProperty("eq")
    expectTypeOf(ctx.canRead("alice")).not.toHaveProperty("kind")
  })

  it("deep merges namespaced libraries across chained withHelpers", () => {
    const manager = new BuilderHelpersManager<Db, "users/{userId}">()
      .withHelpers((ctx, register) => {
        const isSignedIn = register("isSignedIn", [], () => ctx.request.auth.uid.is("string"))

        return {
          auth: {
            isSignedIn,
          },
        }
      })
      .withHelpers((_ctx, register) => {
        const canRead = register("canRead", [], () => true)

        return {
          auth: {
            canRead,
          },
        }
      })

    const ctx = createBuilderContext<
      Db,
      "users/{userId}",
      {
        auth: {
          isSignedIn(): RuleValue
          canRead(): RuleValue
        }
      }
    >({
      customClaims: { admin: false, orgId: "" },
      helperManager: manager,
    })

    expectTypeOf(ctx.auth.isSignedIn()).toHaveProperty("eq")
    expectTypeOf(ctx.auth.canRead()).toHaveProperty("eq")
  })
})
