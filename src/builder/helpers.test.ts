import { describe, expect, it } from "vitest"

import type { ExpressionNode } from "../ast"
import { printNode } from "../ast"
import { createBuilderContext, type RuleValue } from "./context"
import type { CollectionShape, DatabaseDefinition } from "./db"
import { BuilderHelpersManager } from "./helpers"

type TestDb = DatabaseDefinition<
  {
    users: CollectionShape<{
      orgId: string
      ownerId: string
    }>
  },
  {
    admin: boolean
    orgId: string
  }
>

describe("builder helpers manager", () => {
  it("supports zero-argument helper shorthand", () => {
    const manager = new BuilderHelpersManager<TestDb, "users/{userId}">().withHelpers(
      (ctx, register) => ({
        isSignedIn: register("isSignedIn", () => ctx.request.auth.uid.is("string")),
      }),
    )

    const ctx = createBuilderContext<
      TestDb,
      "users/{userId}",
      {
        isSignedIn(): RuleValue
      }
    >({
      customClaims: { admin: false, orgId: "" },
      helperManager: manager,
    })

    expect(printNode(ctx.isSignedIn() as unknown as ExpressionNode)).toBe("isSignedIn()")
  })

  it("exposes registered helpers on the context", () => {
    const manager = new BuilderHelpersManager<TestDb, "users/{userId}">().withHelpers(
      (ctx, register) => ({
        isOrgMember: register("isOrgMember", ["orgId"], ({ orgId }) =>
          ctx.request.auth.token.orgId.eq(orgId),
        ),
      }),
    )

    const ctx = createBuilderContext<
      TestDb,
      "users/{userId}",
      {
        isOrgMember(orgId: string): RuleValue
      }
    >({
      customClaims: { admin: false, orgId: "" },
      helperManager: manager,
    })

    const expr = ctx.isOrgMember("acme")
    expect((expr as unknown as ExpressionNode).kind).toBe("CallExpression")
    expect(printNode(expr as unknown as ExpressionNode)).toBe("isOrgMember('acme')")
  })

  it("emits only used helpers and their transitive dependencies", () => {
    const manager = new BuilderHelpersManager<TestDb, "users/{userId}">().withHelpers(
      (ctx, register) => {
        const isOwner = register("isOwner", ["ownerId"], ({ ownerId }) =>
          ctx.request.auth.uid.eq(ownerId),
        )

        return {
          isOwner,
          canRead: register("canRead", ["ownerId"], ({ ownerId }) => isOwner(ownerId)),
          unusedHelper: register("unusedHelper", [], () => ctx.request.auth.token.admin),
        }
      },
    )

    const ctx = createBuilderContext<
      TestDb,
      "users/{userId}",
      {
        isOwner(ownerId: string): unknown
        canRead(ownerId: string): unknown
        unusedHelper(): unknown
      }
    >({
      customClaims: { admin: false, orgId: "" },
      helperManager: manager,
    })

    ctx.canRead("alice")

    const helperSources = manager.getUsedHelperDeclarations().map((node) => printNode(node))
    expect(helperSources).toEqual([
      "function isOwner(ownerId) {\n  return request.auth.uid == ownerId;\n}",
      "function canRead(ownerId) {\n  return isOwner(ownerId);\n}",
    ])
  })

  it("rejects recursive helper bodies", () => {
    const manager = new BuilderHelpersManager<TestDb, "users/{userId}">().withHelpers(
      (_ctx, register) => {
        const recursive: (ownerId: RuleValue) => RuleValue = register(
          "recursive",
          ["ownerId"],
          ({ ownerId }) => recursive(ownerId),
        )

        return { recursive }
      },
    )

    const ctx = createBuilderContext<
      TestDb,
      "users/{userId}",
      {
        recursive(ownerId: RuleValue): RuleValue
      }
    >({
      customClaims: { admin: false, orgId: "" },
      helperManager: manager,
    })

    ctx.recursive(ctx.request.auth.uid)

    expect(() => manager.getUsedHelperDeclarations()).toThrow(
      'Recursive helper call detected for "recursive".',
    )
  })
})
