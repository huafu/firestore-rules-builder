import { describe, expectTypeOf, it } from "vitest"

import type {
  CollectionAtPath,
  CollectionNames,
  CollectionShape,
  CustomClaimsOf,
  DatabaseDefinition,
  DocumentAtPath,
  RootDocument,
  SubcollectionsAtPath,
} from "./db"

type Db = DatabaseDefinition<
  {
    users: CollectionShape<
      { name: string; role: "admin" | "member" },
      {
        posts: CollectionShape<
          { title: string; published: boolean },
          {
            comments: CollectionShape<{ content: string }>
          }
        >
      }
    >
    teams: CollectionShape<{ label: string }>
  },
  {
    admin: boolean
    orgId: string
    flags: string[]
  }
>

describe("db shape types", () => {
  it("infers root collection names", () => {
    expectTypeOf<CollectionNames<Db>>().toEqualTypeOf<"users" | "teams">()
  })

  it("infers document shape at root path", () => {
    expectTypeOf<DocumentAtPath<Db, "users">>().toEqualTypeOf<{
      name: string
      role: "admin" | "member"
    }>()

    expectTypeOf<RootDocument<Db, "users">>().toEqualTypeOf<{
      name: string
      role: "admin" | "member"
    }>()
  })

  it("infers nested collection and document path types", () => {
    expectTypeOf<DocumentAtPath<Db, "users/posts">>().toEqualTypeOf<{
      title: string
      published: boolean
    }>()

    expectTypeOf<SubcollectionsAtPath<Db, "users">>().toHaveProperty("posts")

    expectTypeOf<CollectionAtPath<Db, "users/posts/comments">>().toExtend<{
      kind: "collection"
    }>()
  })

  it("returns never for invalid paths", () => {
    expectTypeOf<DocumentAtPath<Db, "unknown">>().toEqualTypeOf<never>()
    expectTypeOf<DocumentAtPath<Db, "users/unknown">>().toEqualTypeOf<never>()
    expectTypeOf<SubcollectionsAtPath<Db, "unknown">>().toEqualTypeOf<never>()
  })

  it("infers custom claims from database metadata", () => {
    expectTypeOf<CustomClaimsOf<Db>>().toEqualTypeOf<{
      admin: boolean
      orgId: string
      flags: string[]
    }>()
  })
})
