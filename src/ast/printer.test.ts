import { describe, expect, it } from "vitest"

import { parseExpressionFromSource, parseRules } from "./parser"
import { printNode, printRules } from "./printer"

describe("ast printer", () => {
  it("prints comments and declarations", () => {
    const source = `// top
rules_version = '2';
service cloud.firestore {
  // docs
  match /databases/{database}/documents {
    // read access
    allow read, write: if request.auth != null;
  }
}
`

    const tree = parseRules(source)
    const printed = printRules(tree)

    expect(printed).toMatchInlineSnapshot(`
      "// top
      rules_version = '2';
      service cloud.firestore {
        // docs
        match /databases/{database}/documents {
          // read access
          allow read, write: if request.auth != null;
        }
      }
      "
    `)
  })

  it("round-trips parse and print for comment nodes", () => {
    const source = `rules_version = '2';
service cloud.firestore {
  // one
  let ok = true;
  // two
  return ok;
}
`

    const parsed = parseRules(source)
    const printed = printRules(parsed)
    const reparsed = parseRules(printed)

    expect(reparsed.service.body.statements.filter((node) => node.kind === "Comment")).toHaveLength(
      2,
    )
  })

  it("prints parentheses only when required by precedence", () => {
    const andExpr = parseExpressionFromSource("(a || b) && c")
    const orExpr = parseExpressionFromSource("a || (b && c)")

    expect(printNode(andExpr)).toBe("(a || b) && c")
    expect(printNode(orExpr)).toBe("a || b && c")
  })

  it("respects custom indentation unit", () => {
    const source = `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    allow read: if true;
  }
}
`

    const printed = printRules(parseRules(source), { indent: "    " })
    expect(printed).toMatchInlineSnapshot(`
      "rules_version = '2';
      service cloud.firestore {
          match /databases/{database}/documents {
              allow read: if true;
          }
      }
      "
    `)
  })
})
