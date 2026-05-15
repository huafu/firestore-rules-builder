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
    role: string
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
      customClaims: { admin: false, orgId: "", role: "" },
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
      customClaims: { admin: false, orgId: "", role: "" },
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
      customClaims: { admin: false, orgId: "", role: "" },
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
      customClaims: { admin: false, orgId: "", role: "" },
      helperManager: manager,
    })

    ctx.recursive(ctx.request.auth.uid)

    expect(() => manager.getUsedHelperDeclarations()).toThrow(
      'Recursive helper call detected for "recursive".',
    )
  })

  it("supports lets-factory helper with zero arguments", () => {
    const manager = new BuilderHelpersManager<TestDb, "users/{userId}">().withHelpers(
      (ctx, register) => {
        return {
          hasAdminAccess: register(
            "hasAdminAccess",
            () => ({
              adminFlag: ctx.request.auth.token.admin,
              orgMatch: ctx.request.auth.token.orgId.eq(ctx.resource.data.orgId),
            }),
            (lets) => {
              return ctx.or(lets.adminFlag, lets.orgMatch)
            },
          ),
        }
      },
    )

    const ctx = createBuilderContext<
      TestDb,
      "users/{userId}",
      {
        hasAdminAccess(): RuleValue
      }
    >({
      customClaims: { admin: false, orgId: "", role: "" },
      helperManager: manager,
    })

    expect(printNode(ctx.hasAdminAccess() as unknown as ExpressionNode)).toBe("hasAdminAccess()")

    const decls = manager.getUsedHelperDeclarations()
    expect(decls).toHaveLength(1)
    expect(decls[0]).toBeDefined()
    const source = printNode(decls[0]!)
    expect(source).toContain("let adminFlag =")
    expect(source).toContain("let orgMatch =")
    expect(source).toContain("return")
  })

  it("supports lets-factory helper with arguments", () => {
    const manager = new BuilderHelpersManager<TestDb, "users/{userId}">().withHelpers(
      (ctx, register) => {
        return {
          checkAccess: register(
            "checkAccess",
            ["requiredRole"],
            () => ({
              userRole: ctx.request.auth.token.admin,
              hasPermission: ctx.request.auth.token.admin.eq("test"),
            }),
            (args, lets) =>
              ctx.and(
                ctx.or(lets.hasPermission, ctx.request.auth.token.admin),
                ctx.request.auth.token.role.eq(args.requiredRole),
              ),
          ),
        }
      },
    )

    const ctx = createBuilderContext<
      TestDb,
      "users/{userId}",
      {
        checkAccess(requiredRole: string): RuleValue
      }
    >({
      customClaims: { admin: false, orgId: "", role: "" },
      helperManager: manager,
    })

    expect(printNode(ctx.checkAccess("admin") as unknown as ExpressionNode)).toBe(
      "checkAccess('admin')",
    )

    const decls = manager.getUsedHelperDeclarations()
    expect(decls).toHaveLength(1)
    expect(decls[0]).toBeDefined()
    const source = printNode(decls[0]!)
    expect(source).toContain("let userRole =")
    expect(source).toContain("let hasPermission =")
    expect(source).toContain("return")
  })

  it("tracks dependencies through lets-factory helpers", () => {
    const manager = new BuilderHelpersManager<TestDb, "users/{userId}">().withHelpers(
      (ctx, register) => {
        const isOwner = register("isOwner", ["ownerId"], ({ ownerId }) =>
          ctx.request.auth.uid.eq(ownerId),
        )

        return {
          isOwner,
          canModify: register(
            "canModify",
            ["ownerId"],
            (args) => ({
              ownerCheck: isOwner(args.ownerId),
            }),
            (_args, lets) => {
              return ctx.or(lets.ownerCheck, ctx.request.auth.token.admin)
            },
          ),
        }
      },
    )

    const ctx = createBuilderContext<
      TestDb,
      "users/{userId}",
      {
        isOwner(ownerId: string): RuleValue
        canModify(ownerId: string): RuleValue
      }
    >({
      customClaims: { admin: false, orgId: "", role: "" },
      helperManager: manager,
    })

    ctx.canModify("alice")

    const decls = manager.getUsedHelperDeclarations()
    const names = decls.map((d) => d.name.name)
    // isOwner should be emitted first as a dependency of canModify
    expect(names).toEqual(["isOwner", "canModify"])
  })

  it("handles recursive calls in lets-factory helpers", () => {
    const manager = new BuilderHelpersManager<TestDb, "users/{userId}">().withHelpers(
      (_ctx, register) => {
        const recursive: () => RuleValue = register(
          "recursive",
          () => ({
            // Let initializer calls itself
            check: recursive(),
          }),
          (lets) => lets.check,
        )

        return { recursive }
      },
    )

    const ctx = createBuilderContext<
      TestDb,
      "users/{userId}",
      {
        recursive(): RuleValue
      }
    >({
      customClaims: { admin: false, orgId: "", role: "" },
      helperManager: manager,
    })

    ctx.recursive()

    expect(() => manager.getUsedHelperDeclarations()).toThrow(
      'Recursive helper call detected for "recursive".',
    )
  })
})
