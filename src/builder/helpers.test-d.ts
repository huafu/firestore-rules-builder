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
  it("supports zero-argument helper shorthand", () => {
    const manager = new BuilderHelpersManager<Db, "users/{userId}">().withHelpers(
      (ctx, { def }) => {
        const isSignedIn = def("isSignedIn", { body: () => ctx.request.auth.uid.is("string") })

        return {
          isSignedIn,
        }
      },
    )

    const ctx = createBuilderContext<Db, "users/{userId}", { isSignedIn(): RuleValue }>({
      customClaims: { admin: false, orgId: "" },
      helperManager: manager,
    })

    expectTypeOf(ctx.isSignedIn()).toHaveProperty("eq")
  })

  it("merges helper functions into the builder context", () => {
    const manager = new BuilderHelpersManager<Db, "users/{userId}">().withHelpers(
      (ctx, { def, arg }) => {
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
      .withHelpers((ctx, { def }) => {
        const isSignedIn = def("isSignedIn", { body: () => ctx.request.auth.uid.is("string") })

        return {
          auth: {
            isSignedIn,
          },
        }
      })
      .withHelpers((_ctx, { def }) => {
        const canRead = def("canRead", { body: () => true })

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

  it("typed arg<string> provides StringMethods in body", () => {
    new BuilderHelpersManager<Db, "users/{userId}">().withHelpers((_ctx, { def, arg }) => {
      def("strHelper", {
        args: [arg("val")<string>()],
        body: ({ val }) => {
          // RuleValue<string> should have string-specific methods
          expectTypeOf(val).toHaveProperty("split")
          expectTypeOf(val).toHaveProperty("lower")
          return val
        },
      })
      return {}
    })
  })

  it("typed arg<readonly string[]> provides ListMethods in body", () => {
    new BuilderHelpersManager<Db, "users/{userId}">().withHelpers((_ctx, { def, arg }) => {
      def("listHelper", {
        args: [arg("items")<readonly string[]>()],
        body: ({ items }) => {
          // RuleValue<readonly string[]> should have list-specific methods
          expectTypeOf(items).toHaveProperty("hasAll")
          expectTypeOf(items).toHaveProperty("hasAny")
          return items
        },
      })
      return {}
    })
  })

  it("untyped arg() falls back to RuleValue<unknown>", () => {
    new BuilderHelpersManager<Db, "users/{userId}">().withHelpers((_ctx, { def, arg }) => {
      def("untypedHelper", {
        args: [arg("orgId")()],
        body: ({ orgId }) => {
          // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-arguments
          expectTypeOf(orgId).toEqualTypeOf<RuleValue<unknown>>()
          return orgId
        },
      })
      return {}
    })
  })

  it("lets factory return type flows into body second parameter", () => {
    new BuilderHelpersManager<Db, "users/{userId}">().withHelpers((ctx, { def }) => {
      def("withLets", {
        lets: () => ({
          adminFlag: ctx.request.auth.token.admin,
        }),
        body: (_, lets) => {
          // adminFlag should be RuleValue<boolean> (inferred from token.admin)
          expectTypeOf(lets.adminFlag).toHaveProperty("eq")
          return lets.adminFlag
        },
      })
      return {}
    })
  })

  it("lets factory with args flows arg types into lets and body", () => {
    new BuilderHelpersManager<Db, "users/{userId}">().withHelpers((ctx, { def, arg }) => {
      def("withArgsAndLets", {
        args: [arg("requiredRole")<string>()],
        lets: ({ requiredRole }) => ({
          // requiredRole is RuleValue<string> — should have StringMethods
          roleLower: requiredRole.lower(),
          adminCheck: ctx.request.auth.token.admin,
        }),
        body: ({ requiredRole }, lets) => {
          expectTypeOf(requiredRole).toHaveProperty("split")
          expectTypeOf(lets.roleLower).toHaveProperty("eq")
          expectTypeOf(lets.adminCheck).toHaveProperty("eq")
          return lets.roleLower
        },
      })
      return {}
    })
  })
})
