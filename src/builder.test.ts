import { beforeEach, describe, expect, it } from "vitest"

import { getConflictingOperation } from "./builder"
import { RuleError } from "./context"
import { createFirestoreRulesBuilder, type DbCollection } from "./index"

type Schema = {
  users: DbCollection<
    {
      ownerId: string
      createdAt: Date
    },
    {
      posts: DbCollection<{
        title: string
        authorId: string
      }>
    }
  >
}

const createBuilder = () => createFirestoreRulesBuilder<Schema>()

let builder: ReturnType<typeof createBuilder>

beforeEach(() => {
  builder = createBuilder()
})

describe("builder", () => {
  describe("getConflictingOperation", () => {
    it("returns undefined when operations do not conflict", () => {
      expect(
        getConflictingOperation({
          get: "true" as any,
          create: "true" as any,
        }),
      ).toBeUndefined()
    })

    it("returns the first conflict pair found", () => {
      expect(
        getConflictingOperation({
          get: "true" as any,
          read: "true" as any,
          write: "true" as any,
          update: "true" as any,
        }),
      ).toEqual({ operation: "get", conflict: "read" })
    })
  })

  it("throws when the same operation is defined more than once", () => {
    builder
      .collection("users")
      .rules(($) => ({
        read: $.if($.true),
      }))
      .rules(($) => ({
        read: $.if($.true),
      }))

    expect(() => {
      builder.toString()
    }).toThrow('Duplicate rule definition for method "read" at path "/users/{userId}".')
  })

  it("throws when conflicting operations are declared in one collection", () => {
    builder.collection("users").rules(($) => ({
      read: $.if($.true),
      get: $.if($.true),
    }))

    expect(() => {
      builder.toString()
    }).toThrow('Conflicting operations "read" and "get" at path "/users/{userId}".')
  })

  it("throws when toString is called on a non-root builder", () => {
    const users = builder.collection("users") as unknown as { toString: () => string }

    expect(() => {
      users.toString()
    }).toThrow(new RuleError("toString can only be called on the root builder."))
  })

  it("detects rules recursively with hasRules(deep)", () => {
    builder
      .collection("users")
      .collection("posts")
      .rules(($) => ({
        read: $.if($.true),
      }))

    expect(builder.hasRules()).toBe(false)
    expect(builder.hasRules(true)).toBe(true)
  })

  it("renders nested matches and allow statements", () => {
    builder
      .collection("users")
      .rules(($) => ({
        read: $.if($.true),
      }))
      .collection("posts")
      .rules(($) => ({
        create: $.if($.true),
      }))

    const output = builder.toString()

    expect(output).toMatchSnapshot()
  })

  it("omits section comments when stripComments is enabled", () => {
    builder.collection("users").rules(($) => ({
      read: $.if($.true),
    }))

    const output = builder.toString({ stripComments: true })

    expect(output).toMatchSnapshot()
  })

  it("throws when sub-builder map is accessed with a non-string key", () => {
    expect(() => {
      builder.sub((db) => {
        Reflect.get(db as any, Symbol.iterator)
      })
    }).toThrow("Collection keys must be strings.")
  })
})
