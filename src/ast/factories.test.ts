import { describe, expect, it } from "vitest"

import {
  allowDeclaration,
  binaryExpression,
  blockStatement,
  booleanLiteral,
  functionDeclaration,
  identifier,
  letStatement,
  matchDeclaration,
  memberExpression,
  pathExpression,
  pathExpressionSegment,
  pathLiteralSegment,
  pathPattern,
  program,
  returnStatement,
  serviceDeclaration,
} from "./factories"
import { printNode } from "./printer"
import { expressionFromSource, programFromSource } from "./source-factories"
import { isPathExpressionNode } from "./guards"

describe("ast factories", () => {
  it("builds a basic firestore rules tree", () => {
    const requestId = identifier("request")
    const authId = identifier("auth")

    const authAccess = binaryExpression("!=", requestId, authId)
    const allow = allowDeclaration(["read", "write"], authAccess)

    const match = matchDeclaration(
      pathPattern([pathLiteralSegment("users"), pathLiteralSegment("{userId}")]),
      blockStatement([allow]),
    )

    const service = serviceDeclaration("cloud.firestore", blockStatement([match]))
    const root = program("2", service)

    expect(root.kind).toBe("Program")
    expect(root.service.kind).toBe("ServiceDeclaration")
    expect(root.service.body.statements).toHaveLength(1)
  })

  it("creates function declaration with string params", () => {
    const fn = functionDeclaration(
      "isOwner",
      ["resource", "request"],
      blockStatement([letStatement("ok", booleanLiteral(true)), returnStatement(identifier("ok"))]),
    )

    expect(fn.params.map((param) => param.name)).toEqual(["resource", "request"])
    expect(fn.body.statements).toHaveLength(2)
  })

  it("creates a program node from raw source", () => {
    const source = `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    allow read: if true;
  }
}
`

    const root = programFromSource(source)
    expect(root.kind).toBe("Program")
    expect(root.service.body.statements[0]?.kind).toBe("MatchDeclaration")
  })

  it("creates an expression node from raw source", () => {
    const expr = expressionFromSource("request.auth != null")
    expect(expr.kind).toBe("BinaryExpression")
  })

  it("throws for invalid source", () => {
    expect(() => programFromSource("service cloud.firestore {")).toThrow()
    expect(() => expressionFromSource("request.auth !=")).toThrow()
  })

  it("prints interpolated path expressions", () => {
    const uid = memberExpression(
      memberExpression(identifier("request"), identifier("auth")),
      identifier("uid"),
    )
    const path = pathExpression([
      pathLiteralSegment("databases"),
      pathExpressionSegment(identifier("database")),
      pathLiteralSegment("documents"),
      pathLiteralSegment("users"),
      pathExpressionSegment(uid),
    ])

    expect(isPathExpressionNode(path)).toBe(true)
    expect(printNode(path)).toBe("/databases/$(database)/documents/users/$(request.auth.uid)")
  })
})
