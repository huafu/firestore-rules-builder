/* eslint-disable @typescript-eslint/no-unused-vars */
import { schema, TypesaurusCore, type Typesaurus } from "typesaurus"
import type { DbCollection } from "./types"
import { describe, expectTypeOf, it } from "vitest"
import type { OfTypesaurus } from "./typesaurus"
import { createFirestoreRulesBuilder } from "."

interface User {
  name: string
  age: number
  createdAt: Date
  updatedAt: Date
}

interface Post {
  title: string
  content: string
  createdAt: Date
  updatedAt: Date
}

interface Comment {
  content: string
  createdAt: Date
  updatedAt: Date
}

const db = schema(($) => ({
  users: $.collection<User>(),
  posts: $.collection<Post>().sub({
    comments: $.collection<Comment>(),
  }),
}))

type Db = typeof db
type Schema = Typesaurus.Schema<Db>

type ExpectedSchema = {
  users: DbCollection<User, never, TypesaurusCore.Id<"users">>
  posts: DbCollection<
    Post,
    {
      comments: DbCollection<Comment, never, TypesaurusCore.Id<"posts/comments">>
    },
    TypesaurusCore.Id<"posts">
  >
}

describe("OfTypesaurus", () => {
  it("should correctly transform a Typesaurus schema result into our internal schema representation", () => {
    type Result = OfTypesaurus<Db>
    expectTypeOf<Result>().toEqualTypeOf<ExpectedSchema>()
  })

  it("should correctly transform a Typesaurus inferred schema into our internal schema representation", () => {
    type Result = OfTypesaurus<Schema>
    expectTypeOf<Result>().toEqualTypeOf<ExpectedSchema>()
  })
})

describe("createFirestoreRulesBuilder", () => {
  it("should create a Firestore rules builder instance from a Typesaurus schema", () => {
    const b1 = createFirestoreRulesBuilder<OfTypesaurus<Db>>()
    const b2 = createFirestoreRulesBuilder<OfTypesaurus<Schema>>()

    expectTypeOf<Parameters<(typeof b1)["collection"]>[0]>().toEqualTypeOf<"users" | "posts">()
    const p1 = b1.collection("posts")
    expectTypeOf<Parameters<(typeof p1)["collection"]>[0]>().toEqualTypeOf<"comments">()

    expectTypeOf<Parameters<(typeof b2)["collection"]>[0]>().toEqualTypeOf<"users" | "posts">()
    const p2 = b2.collection("posts")
    expectTypeOf<Parameters<(typeof p2)["collection"]>[0]>().toEqualTypeOf<"comments">()
  })
})
