import { describe, expect, it } from "vitest"

import type { RuleValue } from "./context"
import type { CollectionShape, DatabaseDefinition } from "./db"
import { createAstRulesBuilder } from "./rules-builder"

type TestDb = DatabaseDefinition<
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

describe("ast rules builder", () => {
  it("renders nested match blocks and allow rules", () => {
    const builder = createAstRulesBuilder<TestDb>()

    builder.matches((match) => {
      match("users/{userId}", (users, $) => {
        users.allow("read", $.request.auth.uid.eq($.resource.data.ownerId))

        users.matches((match) => {
          match("posts/{postId}", (posts, $) => {
            posts.allow("get", $.resource.data.title.neq(""))
          })
        })
      })
    })

    const source = builder.toString()

    expect(source).toMatchInlineSnapshot(`
      "rules_version = '2';
      service cloud.firestore {
        match /databases/{database}/documents {
          match /users/{userId} {
            allow read: if request.auth.uid == resource.data.ownerId;
            match /posts/{postId} {
              allow get: if resource.data.title != '';
            }
          }
        }
      }
      "
    `)
  })

  it("emits only used helpers and their dependencies", () => {
    const builder = createAstRulesBuilder<TestDb>().withHelpers((ctx, register) => {
      const isOwner = register("isOwner", ["ownerId"], ({ ownerId }) =>
        ctx.request.auth.uid.eq(ownerId),
      )

      return {
        isOwner,
        canRead: register("canRead", ["ownerId"], ({ ownerId }) => isOwner(ownerId)),
        neverUsed: register("neverUsed", [], () => ctx.request.auth.token.admin),
      }
    })

    builder.matches((match) => {
      match("users/{userId}", (users, $) => {
        users.allow("read", $.canRead($.resource.data.ownerId))
      })
    })

    const source = builder.toString()

    expect(source).toMatchInlineSnapshot(`
      "rules_version = '2';
      service cloud.firestore {
        match /databases/{database}/documents {
          function isOwner(ownerId) {
            return request.auth.uid == ownerId;
          }
          function canRead(ownerId) {
            return isOwner(ownerId);
          }
          match /users/{userId} {
            allow read: if canRead(resource.data.ownerId);
          }
        }
      }
      "
    `)
    expect(source).not.toContain("function neverUsed(")
  })

  it("rejects conflicting operations", () => {
    const builder = createAstRulesBuilder<TestDb>()
    builder.matches((match) => {
      match("users/{userId}", (users, $) => {
        users.allow("get", $.request.auth.token.admin)
        users.allow("read", $.request.auth.uid.eq($.resource.data.ownerId))
      })
    })

    expect(() => builder.toString()).toThrow(
      'Conflicting operations "get" and "read" at path "users/{userId}".',
    )
  })

  it("supports grouped operations in a single allow definition", () => {
    const builder = createAstRulesBuilder<TestDb>()

    builder.matches((match) => {
      match("users/{userId}", (users, $) => {
        users.allow(["list", "get"], $.request.auth.uid.eq($.resource.data.ownerId))
      })
    })

    const source = builder.toString()

    expect(source).toMatchInlineSnapshot(`
      "rules_version = '2';
      service cloud.firestore {
        match /databases/{database}/documents {
          match /users/{userId} {
            allow get, list: if request.auth.uid == resource.data.ownerId;
          }
        }
      }
      "
    `)
  })

  it("rejects allow on root builder", () => {
    const builder = createAstRulesBuilder<TestDb>()

    expect(() => builder.allow("read", true)).toThrow(
      "Allow rules can only be defined on collection builders, not the root builder.",
    )
  })

  it("rejects recursive helper definitions", () => {
    const builder = createAstRulesBuilder<TestDb>().withHelpers((_ctx, register) => {
      const recursive: (ownerId: RuleValue) => RuleValue = register(
        "recursive",
        ["ownerId"],
        ({ ownerId }) => recursive(ownerId),
      )

      return { recursive }
    })

    builder.matches((match) => {
      match("users/{userId}", (users, ctx) => {
        users.allow("read", ctx.recursive(ctx.resource.data.ownerId))
      })
    })

    expect(() => builder.toString()).toThrow('Recursive helper call detected for "recursive".')
  })
})
