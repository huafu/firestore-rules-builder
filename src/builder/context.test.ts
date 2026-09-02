import { describe, it, expect } from "vitest"
import type { ExpressionNode } from "../ast"
import { printNode } from "../ast"
import { createBuilderContext } from "./context"
import type { CollectionShape, DatabaseDefinition } from "./db"

type TestDb = DatabaseDefinition<
  {
    users: CollectionShape<
      {
        name: string
        email: string
      },
      {
        posts: CollectionShape<{ title: string; content: string }>
      }
    >
  },
  {
    admin: boolean
    orgId: string
  }
>

describe("createBuilderContext runtime", () => {
  it("creates context instance without throwing", () => {
    expect(() => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const ctx = createBuilderContext<TestDb, "users/{userId}">()
    }).not.toThrow()
  })

  it("returns proxy objects that generate AST nodes", () => {
    const ctx = createBuilderContext<TestDb, "users/{userId}">()

    // Check that request.time is an ExpressionNode
    const timeExpr = ctx.request.time
    expect(timeExpr).toBeDefined()
    expect(timeExpr).toHaveProperty("kind")
    expect((timeExpr as unknown as ExpressionNode).kind).toBe("MemberExpression")
  })

  it("provides typed methods on expressions", () => {
    const ctx = createBuilderContext<TestDb, "users/{userId}">()

    // Methods should be callable
    const expr = ctx.request.time
    const eqExpr = expr.eq(expr)
    expect(eqExpr).toBeDefined()
    expect(eqExpr).toHaveProperty("kind")
    expect((eqExpr as ExpressionNode).kind).toBe("BinaryExpression")
  })

  it("provides resource.data field access", () => {
    const ctx = createBuilderContext<TestDb, "users/{userId}">()

    const emailField = ctx.resource.data.email
    expect(emailField).toBeDefined()
    expect(emailField).toHaveProperty("kind")
  })

  it("provides global helper functions", () => {
    const ctx = createBuilderContext<TestDb, "users/{userId}">()

    const existsExpr = ctx.exists(ctx.request.path)
    expect(existsExpr).toBeDefined()
    expect(existsExpr).toHaveProperty("kind")
  })

  it("provides duration helpers", () => {
    const ctx = createBuilderContext<TestDb, "users/{userId}">()

    const durationExpr = ctx.duration.time(1, 2, 3, 4)
    expect(durationExpr).toBeDefined()
    expect(durationExpr).toHaveProperty("kind")
  })

  it("provides math helpers", () => {
    const ctx = createBuilderContext<TestDb, "users/{userId}">()

    const mathExpr = ctx.math.abs(ctx.request.time)
    expect(mathExpr).toBeDefined()
    expect(mathExpr).toHaveProperty("kind")
  })

  it("provides logical composition helpers (and/or/not)", () => {
    const ctx = createBuilderContext<TestDb, "users/{userId}">({
      pathPattern: "users/{userId}",
    })

    const isOwner = ctx.request.auth.uid.eq(ctx.params.userId)
    const isAdmin = ctx.request.auth.token.admin.eq(true)
    const isNotAdmin = ctx.not(isAdmin)

    expect(isNotAdmin).toHaveProperty("kind")
    expect((isNotAdmin as unknown as ExpressionNode).kind).toBe("UnaryExpression")

    const complexExpr = ctx.and(isOwner, ctx.or(isAdmin, isNotAdmin))
    expect(complexExpr).toBeDefined()
    expect(complexExpr).toHaveProperty("kind")
    expect((complexExpr as unknown as ExpressionNode).kind).toBe("LogicalExpression")
  })

  it("supports auth root null checks with method helpers", () => {
    const ctx = createBuilderContext<TestDb, "users/{userId}">()

    const expr = ctx.request.auth.neq(null)
    expect(expr).toBeDefined()
    expect(expr).toHaveProperty("kind")
    expect((expr as ExpressionNode).kind).toBe("BinaryExpression")
  })

  it("supports fixed-string equality checks on resource fields", () => {
    const ctx = createBuilderContext<TestDb, "users/{userId}">()

    const expr = ctx.resource.data.email.eq("fixedString")
    expect(expr).toBeDefined()
    expect(expr).toHaveProperty("kind")
    expect((expr as ExpressionNode).kind).toBe("BinaryExpression")
  })

  it("supports split helper on string fields", () => {
    const ctx = createBuilderContext<TestDb, "users/{userId}">()

    const expr = ctx.resource.data.email.split(",")
    expect(expr).toBeDefined()
    expect(expr).toHaveProperty("kind")
    expect((expr as unknown as ExpressionNode).kind).toBe("CallExpression")
  })

  it("supports ifElse helper for ternary-style expressions", () => {
    const ctx = createBuilderContext<TestDb, "users/{userId}">()

    const expr = ctx.ifElse(ctx.request.auth.neq(null), ctx.request.auth.uid, "anonymous")
    expect(expr).toBeDefined()
    expect(expr).toHaveProperty("kind")
    expect((expr as unknown as ExpressionNode).kind).toBe("ConditionalExpression")
  })

  it("supports switchCase helper", () => {
    const ctx = createBuilderContext<TestDb, "users/{userId}">()

    const expr = ctx.switchCase(
      ctx.request.method,
      [
        ["get", true],
        ["list", true],
      ],
      false,
    )
    expect(expr).toBeDefined()
    expect(expr).toHaveProperty("kind")
    expect((expr as unknown as ExpressionNode).kind).toBe("ConditionalExpression")
  })

  it("supports hasPath helper for safe object-chain checks", () => {
    const ctx = createBuilderContext<TestDb, "users/{userId}">()

    const expr = ctx.hasPath(ctx.request, "auth.token.orgId")
    expect(expr).toBeDefined()
    expect(expr).toHaveProperty("kind")
    expect((expr as unknown as ExpressionNode).kind).toBe("LogicalExpression")
  })

  it("supports list literal fallback in ifElse", () => {
    const ctx = createBuilderContext<TestDb, "users/{userId}">()

    const expr = ctx.ifElse(ctx.request.auth.neq(null), ctx.request.auth.uid.split(","), [])
    expect(expr).toBeDefined()
    expect(expr).toHaveProperty("kind")
    expect((expr as unknown as ExpressionNode).kind).toBe("ConditionalExpression")
  })

  it("throws for invalid params access", () => {
    const ctx = createBuilderContext<TestDb, "users/{userId}">({
      pathPattern: "users/{userId}",
    })

    expect(() => {
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      ;(ctx.params as Record<string, unknown>).orgId
    }).toThrow('Unknown params property "orgId"')
  })

  it("throws for unknown custom claim when claim schema is provided", () => {
    const ctx = createBuilderContext<TestDb, "users/{userId}">({
      customClaims: {
        admin: true,
        orgId: "acme",
      },
    })

    expect(() => {
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      ;(ctx.request.auth.token as Record<string, unknown>).unknownClaim
    }).toThrow('Unknown request.auth.token property "unknownClaim"')
  })
})

type ReadmeDb = DatabaseDefinition<{
  users: CollectionShape<{
    createdAt: number
    expiresAt: number
    is_active: boolean
    ref: string
    metadata: Record<string, string>
  }>
}>

describe("README field-access regressions (S2H-1840)", () => {
  it("emits request.resource.data.createdAt against the request payload", () => {
    const ctx = createBuilderContext<ReadmeDb, "users/{userId}">()
    const expr = ctx.request.resource.data.createdAt.eq(ctx.request.time)
    expect(printNode(expr as unknown as ExpressionNode)).toBe(
      "request.resource.data.createdAt == request.time",
    )
  })

  it("emits $.op on request.resource.data against the request payload", () => {
    const ctx = createBuilderContext<ReadmeDb, "users/{userId}">()
    const expr = ctx.op(ctx.request.resource.data.expiresAt, ">", ctx.request.time)
    expect(printNode(expr as unknown as ExpressionNode)).toBe(
      "request.resource.data.expiresAt > request.time",
    )
  })

  it("diffs resource.data against request.resource.data, not against itself", () => {
    const ctx = createBuilderContext<ReadmeDb, "users/{userId}">()
    const expr = ctx.resource.data.metadata.diff(ctx.request.resource.data.metadata).changedKeys()
    expect(printNode(expr as unknown as ExpressionNode)).toBe(
      "resource.data.metadata.diff(request.resource.data.metadata).changedKeys()",
    )
  })

  it("emits field access on get() against the fetched document", () => {
    const ctx = createBuilderContext<ReadmeDb, "users/{userId}">()
    const fetched = ctx.get(ctx.resource.data.ref) as unknown as {
      data: { field: ExpressionNode }
    }
    expect(printNode(fetched.data.field)).toBe("get(resource.data.ref).data.field")
  })

  it("leaves resource.data field access unchanged", () => {
    const ctx = createBuilderContext<ReadmeDb, "users/{userId}">()
    expect(printNode(ctx.resource.data.is_active as unknown as ExpressionNode)).toBe(
      "resource.data.is_active",
    )
  })

  it("threads the document id through $.db.<collection>(id).get()", () => {
    const ctx = createBuilderContext<ReadmeDb, "users/{userId}">()
    const fetched = ctx.db.users(ctx.request.auth.uid).get() as unknown as ExpressionNode & {
      data: ExpressionNode
    }
    expect(printNode(fetched)).toBe(
      "get(/databases/$(database)/documents/users/$(request.auth.uid))",
    )
    expect(printNode(fetched.data)).toBe(
      "get(/databases/$(database)/documents/users/$(request.auth.uid)).data",
    )
  })
})
