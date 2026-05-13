import { describe, expect, it } from "vitest"

import type { RuleValue } from "../builder/context"
import type { CollectionShape, DatabaseDefinition } from "../builder/db"
import { defineFirestoreRulesLibrary } from "../library/index"
import { createHelperLibraryTestHarness, createRulesTestHarness, buildRulesSource } from "./index"

type TestDb = DatabaseDefinition<
  {
    users: CollectionShape<
      {
        ownerId: string
        title: string
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

describe("testing harness", () => {
  it("renders source for configured builder", () => {
    const source = buildRulesSource<TestDb>((builder) => {
      builder.matches((match) => {
        match("users/{userId}", (users, $) => {
          users.allow("read", $.request.auth.uid.eq($.resource.data.ownerId))
        })
      })
    })

    expect(source).toMatchInlineSnapshot(`
      "rules_version = '2';
      service cloud.firestore {
        match /databases/{database}/documents {
          match /users/{userId} {
            allow read: if request.auth.uid == resource.data.ownerId;
          }
        }
      }
      "
    `)
  })

  it("finds allow declarations and grouped operations by path", () => {
    const harness = createRulesTestHarness<TestDb>((builder) => {
      builder.matches((match) => {
        match("users/{userId}", (users, $) => {
          users.allow(["list", "get"], $.request.auth.uid.eq($.resource.data.ownerId))

          users.matches((nestedMatch) => {
            nestedMatch("posts/{postId}", (posts, post$) => {
              posts.allow("get", post$.resource.data.title.neq(""))
            })
          })
        })
      })
    })

    expect(harness.findMatch("users/{userId}")).toBeDefined()
    expect(harness.findMatch("users/{userId}/posts/{postId}")).toBeDefined()
    expect(harness.getAllowOperations("users/{userId}")).toEqual([["get", "list"]])
    expect(harness.getAllowOperations("users/{userId}/posts/{postId}")).toEqual([["get"]])
  })

  it("returns helper declarations emitted by used helper calls", () => {
    const harness = createRulesTestHarness<TestDb>((builder) => {
      const withHelpers = builder.withHelpers((ctx, register) => {
        const isOwner = register("isOwner", ["ownerId"], (_helperCtx, { ownerId }) => {
          return ctx.request.auth.uid.eq(ownerId)
        })

        return {
          isOwner,
          canRead: register("canRead", ["ownerId"], (_helperCtx, { ownerId }) => isOwner(ownerId)),
        }
      })

      withHelpers.matches((match) => {
        match("users/{userId}", (users, $) => {
          users.allow("read", $.canRead($.resource.data.ownerId))
        })
      })
    })

    const helperNames = harness.getHelperDeclarations().map((node) => node.name.name)
    expect(helperNames).toEqual(["isOwner", "canRead"])
  })

  it("supports reusable helper libraries and helper source assertions", () => {
    const authLibrary = defineFirestoreRulesLibrary((ctx, register) => {
      const isSignedIn = register("isSignedIn", [], () => ctx.request.auth.uid.is("string"))

      return {
        isSignedIn,
        canRead: register("canRead", [], () => isSignedIn()),
      }
    })

    const harness = createHelperLibraryTestHarness<TestDb, AuthLibrary>(authLibrary, (builder) => {
      builder.matches((match) => {
        match("users/{userId}", (users, $) => {
          users.allow("read", $.canRead())
        })
      })
    })

    expect(harness.getHelperDeclarations().map((node) => node.name.name)).toEqual([
      "isSignedIn",
      "canRead",
    ])
    expect(harness.getHelperSource("isSignedIn")).toBe(
      "function isSignedIn() {\n  return request.auth.uid is string;\n}",
    )
    expect(harness.getHelperSources()).toEqual([
      "function isSignedIn() {\n  return request.auth.uid is string;\n}",
      "function canRead() {\n  return isSignedIn();\n}",
    ])
  })

  it("supports namespaced helper libraries", () => {
    const namespacedLibrary = defineFirestoreRulesLibrary((ctx, register) => {
      const isSignedIn = register("isSignedIn", [], () => ctx.request.auth.uid.is("string"))

      return {
        auth: {
          isSignedIn,
          canRead: register("canRead", [], () => isSignedIn()),
        },
      }
    })

    const harness = createHelperLibraryTestHarness<TestDb, NamespacedAuthLibrary>(
      namespacedLibrary,
      (builder) => {
        builder.matches((match) => {
          match("users/{userId}", (users, $) => {
            users.allow("read", $.auth.canRead())
          })
        })
      },
    )

    expect(harness.getHelperDeclarations().map((node) => node.name.name)).toEqual([
      "isSignedIn",
      "canRead",
    ])
  })
})
