import { describe, expect, it } from "vitest"

import { parseExpressionFromSource, parseRules } from "./parser"
import type { AllowDeclarationNode } from "./nodes"

describe("ast parser", () => {
  it("parses firestore rules with comment nodes", () => {
    const source = `// header
rules_version = '2';
service cloud.firestore {
  // match users
  match /databases/{database}/documents/users/{userId} {
    // read rule
    allow read: if request.auth != null;
  }
}
`

    const tree = parseRules(source)

    expect(tree.kind).toBe("Program")
    expect(tree.comments.map((item) => item.value)).toEqual([" header"])
    expect(tree.service.body.statements[0]?.kind).toBe("Comment")

    const match = tree.service.body.statements[1]
    expect(match?.kind).toBe("MatchDeclaration")
    if (match?.kind !== "MatchDeclaration") {
      throw new Error("Expected MatchDeclaration")
    }

    expect(match.path.segments).toHaveLength(5)
    expect(match.body.statements[0]?.kind).toBe("Comment")
    expect(match.body.statements[1]?.kind).toBe("AllowDeclaration")
  })

  it("parses precedence in expressions", () => {
    const expr = parseExpressionFromSource("a && b || c")
    expect(expr.kind).toBe("LogicalExpression")
    if (expr.kind !== "LogicalExpression") {
      throw new Error("Expected LogicalExpression")
    }

    expect(expr.operator).toBe("||")
    expect(expr.left.kind).toBe("LogicalExpression")
  })

  it("parses recursive path capture segments", () => {
    const source = `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents/{document=**} {
    allow read: if true;
  }
}
`

    const tree = parseRules(source)
    const match = tree.service.body.statements[0]
    expect(match?.kind).toBe("MatchDeclaration")
    if (match?.kind !== "MatchDeclaration") {
      throw new Error("Expected MatchDeclaration")
    }

    const last = match.path.segments[3]
    expect(last?.kind).toBe("PathRecursiveSegment")
  })

  it("attaches source locations when includeLocation is true", () => {
    const source = `rules_version = '2';
service cloud.firestore {
  allow read: if true;
}
`
    const tree = parseRules(source, { includeLocation: true })

    expect(tree.loc).toBeDefined()
    expect(tree.loc?.start).toMatchObject({ line: 1, column: 0, offset: 0 })

    const allow = tree.service.body.statements[0] as AllowDeclarationNode
    expect(allow.loc).toMatchObject({
      start: { line: 3, column: 2 },
      end: { line: 3, column: 22 },
    })
    expect(allow.condition.loc).toMatchObject({
      start: { line: 3, column: 17 },
      end: { line: 3, column: 21 },
    })
  })

  it("does not attach locations without includeLocation option", () => {
    const source = `rules_version = '2';
service cloud.firestore {
  allow read: if true;
}
`
    const tree = parseRules(source)
    expect(tree.loc).toBeUndefined()
    expect(tree.service.loc).toBeUndefined()
  })

  it("parses unary and binary precedence correctly", () => {
    const expr = parseExpressionFromSource("!a == b")
    expect(expr.kind).toBe("BinaryExpression")
    if (expr.kind !== "BinaryExpression") {
      throw new Error("Expected BinaryExpression")
    }

    expect(expr.operator).toBe("==")
    expect(expr.left.kind).toBe("UnaryExpression")
    if (expr.left.kind !== "UnaryExpression") {
      throw new Error("Expected UnaryExpression")
    }

    expect(expr.left.argument.kind).toBe("Identifier")
    expect(expr.right.kind).toBe("Identifier")
  })

  it("parses match paths with multiple variables and recursive captures", () => {
    const source = `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents/{collection}/{doc=**} {
    allow read: if true;
  }
}
`

    const tree = parseRules(source)
    const match = tree.service.body.statements[0]
    expect(match?.kind).toBe("MatchDeclaration")
    if (match?.kind !== "MatchDeclaration") {
      throw new Error("Expected MatchDeclaration")
    }

    expect(match.path.segments.map((segment) => segment.kind)).toEqual([
      "PathLiteralSegment",
      "PathVariableSegment",
      "PathLiteralSegment",
      "PathVariableSegment",
      "PathRecursiveSegment",
    ])
  })

  it("parses escaped string literals", () => {
    const expr = parseExpressionFromSource(`'a\\'b\\nc'`)
    expect(expr.kind).toBe("StringLiteral")
    if (expr.kind !== "StringLiteral") {
      throw new Error("Expected StringLiteral")
    }

    expect(expr.value).toBe("a'b\nc")
  })

  it("parses nested map/list with postfix expressions", () => {
    const expr = parseExpressionFromSource("{user: {roles: ['a', 'b']}}.user.roles[0]")

    expect(expr.kind).toBe("IndexExpression")
    if (expr.kind !== "IndexExpression") {
      throw new Error("Expected IndexExpression")
    }

    expect(expr.object.kind).toBe("MemberExpression")
    expect(expr.index.kind).toBe("NumberLiteral")
  })
})
