import { describe, expectTypeOf, it } from "vitest"

import type { CollectionShape, DatabaseDefinition } from "../builder/db"
import { createAstRulesBuilder } from "../builder/rules-builder"
import { defineFirestoreRulesLibrary } from "./index"

type DbA = DatabaseDefinition<
  {
    users: CollectionShape<{
      ownerId: string
    }>
  },
  {
    admin: boolean
  }
>

type DbB = DatabaseDefinition<
  {
    projects: CollectionShape<{
      ownerId: string
    }>
  },
  {
    admin: boolean
    orgId: string
  }
>

const authLibrary = defineFirestoreRulesLibrary((ctx, { def }) => {
  const isSignedIn = def("isSignedIn", {
    body: () => ctx.request.auth.uid.is("string"),
  })

  return {
    isSignedIn,
    canRead: def("canRead", {
      body: () => isSignedIn(),
    }),
  }
})

describe("defineFirestoreRulesLibrary", () => {
  it("is reusable across distinct database definitions", () => {
    const builderA = createAstRulesBuilder<DbA>().withHelpers(authLibrary)
    const builderB = createAstRulesBuilder<DbB>().withHelpers(authLibrary)

    builderA.matches((match) => {
      match("users/{userId}", (users, $) => {
        expectTypeOf($.isSignedIn()).toHaveProperty("eq")
        users.allow("read", $.canRead())
      })
    })

    builderB.matches((match) => {
      match("projects/{projectId}", (projects, $) => {
        expectTypeOf($.canRead()).toHaveProperty("eq")
        projects.allow("read", $.isSignedIn())
      })
    })
  })

  it("supports namespaced helper exports", () => {
    const namespacedLibrary = defineFirestoreRulesLibrary((ctx, { def }) => {
      const isSignedIn = def("isSignedIn", {
        body: () => ctx.request.auth.uid.is("string"),
      })

      return {
        auth: {
          isSignedIn,
          canRead: def("canRead", {
            body: () => isSignedIn(),
          }),
        },
      }
    })

    const builder = createAstRulesBuilder<DbA>().withHelpers(namespacedLibrary)
    builder.matches((match) => {
      match("users/{userId}", (users, $) => {
        expectTypeOf($.auth.isSignedIn()).toHaveProperty("eq")
        users.allow("read", $.auth.canRead())
      })
    })
  })
})
