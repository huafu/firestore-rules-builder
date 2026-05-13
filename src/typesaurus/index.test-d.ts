/* eslint-disable @typescript-eslint/no-unused-vars */
import { schema, type Typesaurus } from "typesaurus"
import { describe, expectTypeOf, it } from "vitest"

import { createAstRulesBuilder } from "../builder/rules-builder"
import type { CollectionShape, DatabaseDefinition } from "../builder/db"
import {
  createTypesaurusRulesBuilder,
  type OfTypesaurus,
  type TypesaurusDatabaseDefinition,
} from "./index"

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

type ExpectedCollections = {
  users: CollectionShape<
    {
      name: string
      age: number
      createdAt: Date
      updatedAt: Date
    },
    Record<never, never>
  >
  posts: CollectionShape<
    {
      title: string
      content: string
      createdAt: Date
      updatedAt: Date
    },
    {
      comments: CollectionShape<
        {
          content: string
          createdAt: Date
          updatedAt: Date
        },
        Record<never, never>
      >
    }
  >
}

type ExpectedDatabaseDefinition = DatabaseDefinition<
  ExpectedCollections,
  {
    admin: boolean
    orgId: string
  }
>

describe("Typesaurus builder adapter", () => {
  it("transforms a Typesaurus DB instance to builder-compatible collections", () => {
    type Result = OfTypesaurus<Db>["collections"]
    expectTypeOf<Result>().toEqualTypeOf<ExpectedCollections>()
  })

  it("transforms a Typesaurus inferred schema to builder-compatible collections", () => {
    type Result = OfTypesaurus<Schema>["collections"]
    expectTypeOf<Result>().toEqualTypeOf<ExpectedCollections>()
  })

  it("supports passing custom claims as a second type argument", () => {
    type Result = TypesaurusDatabaseDefinition<
      Db,
      {
        admin: boolean
        orgId: string
      }
    >
    expectTypeOf<Result>().toEqualTypeOf<ExpectedDatabaseDefinition>()
  })

  it("is directly usable with createAstRulesBuilder", () => {
    const builder = createAstRulesBuilder<
      TypesaurusDatabaseDefinition<
        Db,
        {
          admin: boolean
          orgId: string
        }
      >
    >()

    builder.matches((match) => {
      match("users/{userId}", (users, $) => {
        users.allow("read", $.request.auth.token.admin)
      })
    })
  })

  it("creates a typed builder from a Typesaurus db value", () => {
    const builder = createTypesaurusRulesBuilder(db)
    builder.matches((match) => {
      match("users/{userId}", (users, $) => {
        users.allow("read", $.request.auth.uid.is("string"))
      })
    })
  })

  it("infers collection type from Typesaurus db value", () => {
    const builder = createTypesaurusRulesBuilder(db)
    type Result =
      typeof builder extends import("../builder/rules-builder").FirestoreAstRulesBuilder<
        OfTypesaurus<Db>,
        ExpectedCollections,
        "",
        Record<never, never>
      >
        ? true
        : false
    expectTypeOf<Result>().toEqualTypeOf<true>()
  })

  it("allows generic-only usage without passing a db value", () => {
    const builder = createTypesaurusRulesBuilder<Db>()
    type Result =
      typeof builder extends import("../builder/rules-builder").FirestoreAstRulesBuilder<
        OfTypesaurus<Db>,
        ExpectedCollections,
        "",
        Record<never, never>
      >
        ? true
        : false
    expectTypeOf<Result>().toEqualTypeOf<true>()
  })

  it("accepts options as first argument when using generic-only usage", () => {
    const builder = createTypesaurusRulesBuilder<Db>({ version: "2" })
    type Result =
      typeof builder extends import("../builder/rules-builder").FirestoreAstRulesBuilder<
        OfTypesaurus<Db>,
        ExpectedCollections,
        "",
        Record<never, never>
      >
        ? true
        : false
    expectTypeOf<Result>().toEqualTypeOf<true>()
  })

  it("supports withCustomClaims to narrow auth token type", () => {
    const builder = createAstRulesBuilder<OfTypesaurus<Db>>().withCustomClaims<{
      admin: boolean
      orgId: string
    }>()

    builder.matches((match) => {
      match("users/{userId}", (users, $) => {
        // $.request.auth.token.admin must type-check as a valid expression
        users.allow("read", $.request.auth.token.admin)
        users.allow("write", $.request.auth.token.orgId.is("string"))
      })
    })
  })
})
