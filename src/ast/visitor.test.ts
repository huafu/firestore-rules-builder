import { describe, expect, it } from "vitest"

import {
  allowDeclaration,
  blockStatement,
  booleanLiteral,
  functionDeclaration,
  identifier,
  matchDeclaration,
  pathLiteralSegment,
  pathPattern,
  program,
  returnStatement,
  serviceDeclaration,
} from "./factories"
import { walkAst, walkExpressions, walkStatements } from "./visitor"

describe("ast visitor", () => {
  it("walks nodes in pre-order", () => {
    const tree = program(
      "2",
      serviceDeclaration(
        "cloud.firestore",
        blockStatement([
          matchDeclaration(
            pathPattern([pathLiteralSegment("users")]),
            blockStatement([allowDeclaration(["read"], booleanLiteral(true))]),
          ),
        ]),
      ),
    )

    const seen: string[] = []

    walkAst(tree, {
      enter(node) {
        seen.push(node.kind)
      },
    })

    expect(seen[0]).toBe("Program")
    expect(seen).toContain("AllowDeclaration")
    expect(seen).toContain("BooleanLiteral")
  })

  it("walkExpressions only emits expression kinds", () => {
    const tree = allowDeclaration(["read"], identifier("request"))
    const seen: string[] = []

    walkExpressions(tree, (node) => {
      seen.push(node.kind)
    })

    expect(seen).toEqual(["Identifier"])
  })

  it("walkStatements emits declaration and statement nodes", () => {
    const tree = matchDeclaration(pathPattern([pathLiteralSegment("users")]), blockStatement([]))
    const seen: string[] = []

    walkStatements(tree, (node) => {
      seen.push(node.kind)
    })

    expect(seen).toEqual(["MatchDeclaration"])
  })

  it("calls exit in post-order", () => {
    const tree = program(
      "2",
      serviceDeclaration(
        "cloud.firestore",
        blockStatement([allowDeclaration(["read"], booleanLiteral(true))]),
      ),
    )

    const entered: string[] = []
    const exited: string[] = []

    walkAst(tree, {
      enter(node) {
        entered.push(node.kind)
      },
      exit(node) {
        exited.push(node.kind)
      },
    })

    expect(entered[0]).toBe("Program")
    expect(exited[0]).toBe("Identifier")
    expect(exited.at(-1)).toBe("Program")
  })

  it("invokes kind-specific visitor hooks", () => {
    const fn = functionDeclaration(
      "isAuthed",
      ["request"],
      blockStatement([returnStatement(identifier("request"))]),
    )
    const tree = program("2", serviceDeclaration("cloud.firestore", blockStatement([fn])))

    const seen: string[] = []

    walkAst(tree, {
      FunctionDeclaration(node) {
        seen.push(node.name.name)
      },
    })

    expect(seen).toEqual(["isAuthed"])
  })
})
