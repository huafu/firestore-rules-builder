# Firestore Rules DSL

Strongly typed builder for writing Firebase Firestore Security Rules in TypeScript.

[![npm version](https://img.shields.io/npm/v/firestore-rules-dsl.svg)](https://www.npmjs.com/package/firestore-rules-dsl)
[![npm downloads](https://img.shields.io/npm/dm/firestore-rules-dsl.svg)](https://www.npmjs.com/package/firestore-rules-dsl)
[![CI](https://img.shields.io/github/actions/workflow/status/huafu/firestore-rules-builder/ci.yml?branch=develop&label=CI)](https://github.com/huafu/firestore-rules-builder/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

The goal of this package is to help you author Firestore rules with a strongly typed developer experience.

It does not model or manage your runtime database. The schema types you provide are only used to drive compile-time typing for rule context properties, helper signatures, and expression methods.

## Install

```bash
pnpm add firestore-rules-dsl
```

## What You Get

- A root builder via `createAstRulesBuilder(...)`.
- Typed `match` callbacks via `matches(...)`.
- Typed rule declarations via `allow(...)`.
- A typed context (`$`) with `request`, `resource`, `request.resource`, `params`, `db`, and helper methods.
- Reusable helper libraries via `defineFirestoreRulesLibrary(...)`.
- Deterministic rules output via `toString()`.

## Quick Start

```ts
import {
  createAstRulesBuilder,
  defineFirestoreRulesLibrary,
  type CollectionShape,
  type DatabaseDefinition,
} from "firestore-rules-dsl"

type UserDoc = {
  displayName: string
  email: string
  createdAt: number
}

type OrgDoc = {
  name: string
  ownerId: string
  plan: "free" | "pro" | "enterprise"
}

type AppClaims = {
  admin: boolean
  orgId: string
}

type AppDb = DatabaseDefinition<
  {
    users: CollectionShape<UserDoc>
    orgs: CollectionShape<OrgDoc>
  },
  AppClaims
>

const authHelpers = defineFirestoreRulesLibrary((ctx, register) => {
  const isSignedIn = register("isSignedIn", [], () => ctx.request.auth.uid.is("string"))
  const isOwner = register("isOwner", ["ownerId"], (_helperCtx, { ownerId }) => {
    return ctx.request.auth.uid.eq(ownerId)
  })

  return { isSignedIn, isOwner }
})

const builder = createAstRulesBuilder<AppDb>()
  .withHelpers(authHelpers)
  .withHelpers((ctx, register) => {
    const isAdmin = register("isAdmin", [], () => ctx.request.auth.token.admin.eq(true))
    return { isAdmin }
  })

builder.matches((match) => {
  match("users/{userId}", (users, $) => {
    users.allow("read", $.or($.isOwner($.params.userId), $.isSignedIn()))

    users.allow(
      "create",
      $.and($.isSignedIn(), $.request.resource.data.createdAt.eq($.request.time)),
    )

    users.allow("update", $.isOwner($.params.userId))
    users.allow("delete", $.or($.isOwner($.params.userId), $.isAdmin()))
  })
})

const rulesSource = builder.toString()
console.log(rulesSource)
```

## Core API

### `DatabaseDefinition` and `CollectionShape`

Use `DatabaseDefinition<TCollections, TCustomClaims>` and `CollectionShape<TDoc, TSubcollections>` to provide type information for the rule context.

```ts
type AppDb = DatabaseDefinition<
  {
    orgs: CollectionShape<
      { name: string; ownerId: string },
      {
        projects: CollectionShape<{ name: string; ownerId: string }>
      }
    >
  },
  { admin: boolean }
>
```

These types are compile-time only and exist to power autocomplete, inference, and safety in your rules code.

### `createAstRulesBuilder(...)`

`createAstRulesBuilder<Db>()` creates the root builder.

You can then:

1. call `withHelpers(...)` to register helper libraries,
2. call `matches(...)` to define path scopes,
3. call `allow(...)` on each match builder,
4. call `toString()` to render Firestore rules text.

### `matches(...)`

Use `matches(...)` to define nested `match` scopes.

```ts
builder.matches((match) => {
  match("orgs/{orgId}", (orgs, $) => {
    orgs.allow("read", $.request.auth.uid.is("string"))

    orgs.matches((match) => {
      match("projects/{projectId}", (projects, $) => {
        projects.allow("read", $.resource.data.ownerId.eq($.request.auth.uid))
      })
    })
  })
})
```

### `allow(...)`

Use `allow(operation, condition)` to attach a rule condition to one or more operations.

```ts
users.allow("read", $.request.auth.uid.is("string"))
users.allow("update", $.resource.data.ownerId.eq($.request.auth.uid))
users.allow(["create", "delete"], $.request.auth.token.admin.eq(true))
```

### `defineFirestoreRulesLibrary(...)`

Use `defineFirestoreRulesLibrary(...)` to publish reusable helper libraries with full typing preserved.

```ts
import { defineFirestoreRulesLibrary } from "firestore-rules-dsl"

export const sharedHelpers = defineFirestoreRulesLibrary((ctx, register) => {
  const isSignedIn = register("isSignedIn", [], () => ctx.request.auth.uid.is("string"))
  const isAdmin = register("isAdmin", [], () => ctx.request.auth.token.admin.eq(true))

  return { isSignedIn, isAdmin }
})
```

Then attach them with `withHelpers(...)`.

## Context Reference

Inside each `match` callback, `$` is strongly typed.

### Core context objects

- `$.request.auth.uid`
- `$.request.auth.token.<claim>`
- `$.request.method`
- `$.request.path`
- `$.request.time`
- `$.request.resource.data` (incoming document data for writes)
- `$.resource.data` (existing persisted document data)
- `$.params.<segmentName>`
- `$.db` (schema-aware traversal for `exists(...)` and `get(...)` patterns)

### Global context helpers

- `$.exists(path)`
- `$.get(path)`
- `$.getAfter(path)`
- `$.and(...conditions)`
- `$.or(...conditions)`
- `$.not(condition)`
- `$.op(left, operator, right)`
- `$.duration.abs(...)`, `$.duration.time(...)`, `$.duration.value(...)`
- `$.hashing.md5(...)`, `$.hashing.sha256(...)`
- `$.math.abs(...)`, `$.math.ceil(...)`, `$.math.floor(...)`, `$.math.pow(...)`, `$.math.round(...)`, `$.math.sqrt(...)`

### Value methods

Comparison and arithmetic:

- `.is(...)`
- `.eq(...)`, `.neq(...)`, `.gt(...)`, `.gte(...)`, `.lt(...)`, `.lte(...)`
- `.plus(...)`, `.minus(...)`, `.multiply(...)`, `.divide(...)`, `.modulo(...)`

List methods:

- `.size()`
- `.hasAll(...)`, `.hasAny(...)`, `.hasOnly(...)`
- `.join(...)`, `.concat(...)`, `.removeAll(...)`, `.toSet()`

Map methods:

- `.size()`
- `.keys()`
- `.diff(...)` with `.addedKeys()`, `.removedKeys()`, `.changedKeys()`, `.affectedKeys()`, `.unchangedKeys()`

## Typesaurus Integration

If your schema is already defined with Typesaurus, use `createTypesaurusRulesBuilder(...)` from the `typesaurus` subpath.

```ts
import { schema } from "typesaurus"
import { createTypesaurusRulesBuilder } from "firestore-rules-dsl/typesaurus"

const db = schema(($) => ({
  users: $.collection<{ name: string }>(),
}))

const builder = createTypesaurusRulesBuilder(db).withCustomClaims<{
  admin: boolean
  orgId: string
}>()

builder.matches((match) => {
  match("users/{userId}", (users, $) => {
    users.allow("read", $.request.auth.token.admin)
  })
})
```

The backward-compatible `OfTypesaurus` alias is also exported for existing codebases.

## Package Exports

- `firestore-rules-dsl`
- `firestore-rules-dsl/ast`
- `firestore-rules-dsl/builder`
- `firestore-rules-dsl/library`
- `firestore-rules-dsl/testing`
- `firestore-rules-dsl/typesaurus`

## Migration Notes

If you are migrating from earlier versions:

- `createFirestoreRulesBuilder(...)` was replaced by `createAstRulesBuilder(...)`.
- rule definition moved to `matches(...)` plus `allow(...)`.
- helper libraries should be authored with `defineFirestoreRulesLibrary(...)`.

## Development

```bash
pnpm run build
pnpm run lint
pnpm run typecheck
pnpm run test
```

## License

MIT

---

Made with 💖 in TypeScript by Huafu from Thailand.
