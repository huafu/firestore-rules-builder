import { describe, expect, it } from "vitest"

import {
  isExpressionNode,
  isNode,
  isPathSegmentNode,
  isProgramNode,
  isRuleStatementNode,
} from "./guards"
import {
  blockStatement,
  booleanLiteral,
  identifier,
  matchDeclaration,
  pathLiteralSegment,
  pathPattern,
  program,
  serviceDeclaration,
} from "./factories"

describe("ast guards", () => {
  it("accepts program nodes", () => {
    const root = program("2", serviceDeclaration("cloud.firestore", blockStatement([])))

    expect(isNode(root)).toBe(true)
    expect(isProgramNode(root)).toBe(true)
  })

  it("rejects objects without known kind", () => {
    expect(isNode({ kind: "Unknown" })).toBe(false)
    expect(isNode({})).toBe(false)
    expect(isNode(null)).toBe(false)
  })

  it("classifies expression nodes", () => {
    const expr = booleanLiteral(true)
    expect(isExpressionNode(expr)).toBe(true)
    expect(isRuleStatementNode(expr)).toBe(false)
  })

  it("classifies path segment nodes", () => {
    const segment = pathLiteralSegment("users")
    expect(isPathSegmentNode(segment)).toBe(true)
  })

  it("classifies statement-like declaration nodes", () => {
    const stmt = matchDeclaration(pathPattern([pathLiteralSegment("users")]), blockStatement([]))
    expect(isRuleStatementNode(stmt)).toBe(true)
  })

  it("keeps nested identifier as expression node", () => {
    const node = identifier("request")
    expect(isExpressionNode(node)).toBe(true)
  })
})
