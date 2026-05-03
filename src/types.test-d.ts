/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-empty-object-type */
import { describe, expectTypeOf, it } from "vitest"
import type { RuleExpression, RuleOperand } from "./expression"
import type { AnyDbSchema } from "./index"

import type {
  AnyFullDbCollectionBase,
  AnyFullDbNamespace,
  CollectionFor,
  DataKeysFor,
  DbCollection,
  FullDbSchema,
  FullParamsFor,
  IsUndefined,
  ParentNamesFor,
  PathParamsFor,
  RequestProxyFor,
  RuleContextBase,
  Singularize,
} from "./types"

type AnyNs = AnyFullDbNamespace
type AnyCol = AnyFullDbCollectionBase

type Schema = {
  users: DbCollection<
    { name: string; role: "admin" | "member" },
    {
      posts: DbCollection<{ title: string; published: boolean }>
    },
    "uid"
  >
  teams: DbCollection<{ label: string }>
}

type Db = FullDbSchema<Schema>
type RootNs = Db
type UsersCol = Db["collections"]["users"]
type UsersNs = UsersCol["namespace"]
type PostsCol = UsersNs["collections"]["posts"]

describe("types", () => {
  describe("IsUndefined", () => {
    it("returns true only for exactly undefined", () => {
      expectTypeOf<IsUndefined<undefined>>().toEqualTypeOf<true>()
      expectTypeOf<IsUndefined<string>>().toEqualTypeOf<false>()
      expectTypeOf<IsUndefined<undefined | string>>().toEqualTypeOf<false>()
      expectTypeOf<IsUndefined<never>>().toEqualTypeOf<false>()
      expectTypeOf<IsUndefined<unknown>>().toEqualTypeOf<false>()
      expectTypeOf<IsUndefined<any>>().toEqualTypeOf<false>()
    })
  })

  describe("Singularize", () => {
    it("handles common plural patterns and irregular words", () => {
      expectTypeOf<Singularize<"users">>().toEqualTypeOf<"user">()
      expectTypeOf<Singularize<"categories">>().toEqualTypeOf<"category">()
      expectTypeOf<Singularize<"people">>().toEqualTypeOf<"person">()
      expectTypeOf<Singularize<"children">>().toEqualTypeOf<"child">()
      expectTypeOf<Singularize<"criteria">>().toEqualTypeOf<"criterion">()
      expectTypeOf<Singularize<"status">>().toEqualTypeOf<"status">()
      expectTypeOf<Singularize<"profile">>().toEqualTypeOf<"profile">()
    })
  })

  describe("schema-derived helper types", () => {
    it("computes path params for namespace and collection scopes", () => {
      expectTypeOf<PathParamsFor<AnyNs>>().toExtend<Record<string, string>>()
      expectTypeOf<PathParamsFor<AnyCol>>().toExtend<Record<string, string>>()

      expectTypeOf<PathParamsFor<RootNs>>().toEqualTypeOf<{}>()
      expectTypeOf<PathParamsFor<UsersNs>>().toEqualTypeOf<{ userId: string }>()
      expectTypeOf<PathParamsFor<UsersCol>>().toEqualTypeOf<{ userId: string }>()
      expectTypeOf<PathParamsFor<PostsCol>>().toEqualTypeOf<{
        userId: string
        postId: string
      }>()
    })

    it("derives full params and parent names from collection ancestry", () => {
      expectTypeOf<FullParamsFor<UsersCol>>().toEqualTypeOf<[{ userId: RuleOperand }]>()
      expectTypeOf<FullParamsFor<PostsCol>>().toEqualTypeOf<
        [
          {
            userId: RuleOperand
            postId: RuleOperand
          },
        ]
      >()

      expectTypeOf<ParentNamesFor<RootNs>>().toEqualTypeOf<[]>()
      expectTypeOf<ParentNamesFor<UsersCol>>().toEqualTypeOf<[]>()
      expectTypeOf<ParentNamesFor<UsersNs>>().toEqualTypeOf<["users"]>()
      expectTypeOf<ParentNamesFor<PostsCol>>().toEqualTypeOf<["users"]>()
    })

    it("infers collection scope and available keys from namespace", () => {
      expectTypeOf<CollectionFor<RootNs>>().toEqualTypeOf<never>()
      expectTypeOf<DataKeysFor<UsersNs>>().toEqualTypeOf<"name" | "role">()
      expectTypeOf<DataKeysFor<PostsCol>>().toEqualTypeOf<"title" | "published">()
    })

    it("types request proxy paths as rule expressions", () => {
      expectTypeOf<RequestProxyFor<Db, RootNs>["auth"]["uid"]>().toEqualTypeOf<RuleExpression>()
      expectTypeOf<RequestProxyFor<Db, UsersNs>["resource"]["id"]>().toEqualTypeOf<RuleExpression>()
      expectTypeOf<
        RequestProxyFor<Db, PostsCol>["resource"]["data"]["title"]
      >().toEqualTypeOf<RuleExpression>()
    })

    it("keeps AnyDbSchema authClaims as an indexable record", () => {
      expectTypeOf<AnyDbSchema["meta"]["authClaims"]>().toEqualTypeOf<Record<string, unknown>>()
      expectTypeOf<RequestProxyFor<AnyDbSchema, AnyNs>["auth"]["token"]>().toHaveProperty("$prop")
      expectTypeOf<Db["meta"]["authClaims"]>().toEqualTypeOf<Record<string, unknown>>()
      expectTypeOf<RequestProxyFor<Db, Db>["auth"]["token"]>().toHaveProperty("$prop")
    })
  })

  describe("RuleContextBase.select", () => {
    it("accepts condition/result pairs followed by a default case", () => {
      const op = null as unknown as RuleOperand
      const select = ((...cases: unknown[]) => {
        void cases
        return null as unknown as RuleExpression
      }) as RuleContextBase["select"]

      expectTypeOf(select([op, op], op)).toExtend<RuleExpression>()
      expectTypeOf(select([op, op], [op, op], op)).toExtend<RuleExpression>()

      // @ts-expect-error select requires [condition, result] pairs then default case
      expectTypeOf(select(op, op, op)).toEqualTypeOf<RuleExpression>()

      // @ts-expect-error select requires a trailing default case
      expectTypeOf(select([op, op])).toEqualTypeOf<RuleExpression>()
    })
  })
})
