# @huafu/firestore-rules-builder

[![CI](https://github.com/huafu/firestore-rules-builder/actions/workflows/ci.yml/badge.svg)](https://github.com/huafu/firestore-rules-builder/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/@huafu/firestore-rules-builder.svg)](https://www.npmjs.com/package/@huafu/firestore-rules-builder)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A strongly typed **TypeScript DSL** for generating Firebase Firestore Security Rules with full IDE support, type safety, and autocomplete. Write your rules in TypeScript instead of strings!

## Features

✨ **Strongly Typed** - Full TypeScript support with autocomplete for all fields and operations
🛡️ **Type Safe** - Catch errors at compile time, not in production
🎯 **Fluent API** - Readable, chainable syntax for rule definitions
📦 **Zero Runtime** - Compiles to plain Firestore Rules, no runtime overhead
🔗 **Helper Functions** - Build reusable rule logic with custom helpers
🚀 **Modern** - Latest TypeScript, ESM-first, tree-shakeable

## Installation

```bash
npm install @huafu/firestore-rules-builder
# or
yarn add @huafu/firestore-rules-builder
# or
pnpm add @huafu/firestore-rules-builder
```

## Quick Start

```typescript
import { createFirestoreRules, commonHelpers } from "@huafu/firestore-rules-builder"

interface User {
  name: string
  email: string
}
interface Schema {
  users: { data: User }
}

const rules = createFirestoreRules<Schema>()
  .withHelpers(commonHelpers) // Add common helpers
  .rules((ns) => {
    ns.users(($) => ({
      read: $.if($.lib.isAuthenticated()), // Use helper function
      create: $.eq($.params.users, $.request.auth.uid),
    }))
  })
  .build()

console.log(rules)
// Output: Valid Firestore Security Rules v2 format
```

## Core Concepts

### 1. Builder Pattern

Use the fluent API to chain operations:

```typescript
createFirestoreRules<MySchema>()
  .withHelpers(customHelpers)      // Add helper functions
  .rules((ns) => { ... })          // Define rules
  .build()                          // Generate output
```

### 2. Rule Context (`$`)

Inside rule callbacks, the `$` parameter provides:

- **Logical operations**: `and()`, `or()`, `not()`, `if()`, `unless()`, `ternary()`, `select()`
- **Comparisons**: `eq()`, `neq()`, `gt()`, `gte()`, `lt()`, `lte()`, `isset()`
- **Data validation**: `hasOnlyModified()`, `hasOnlyKeys()`, `hasAllKeys()`
- **Runtime access**: `request`, `resource`, `params`, `server`, `lib`

### 3. Type-Safe Data Access

Use PathProxy for nested property access with autocomplete:

```typescript
interface User {
  name: string
  email: string
  profile: {
    avatar: string
  }
}

ns.users(($) => ({
  read: $.eq($.resource.data.profile.avatar, $.request.resource.data.profile.avatar),
  //    ↑ Full autocomplete for User fields!
}))
```

### 4. Helper Functions

Register custom helpers to reuse logic:

```typescript
.withHelpers((ctx, register) => ({
  isAuthenticated: register("isAuthenticated", [], () =>
    ctx.isset(ctx.request.auth)
  ),
  isOwner: (uid) => ctx.eq(ctx.request.auth.uid, uid),
}))
```

## Usage Examples

### Example 1: Simple Authentication Check

```typescript
const rules = createFirestoreRules()
  .withHelpers(commonHelpers)
  .rules((ns) => {
    ns.posts(($) => ({
      read: $.if($.lib.isAuthenticated()),
      create: $.if($.lib.isAuthenticatedAndOwner($.resource.data.authorId)),
      update: $.if($.lib.isAuthenticatedAndOwner($.resource.data.authorId)),
      delete: $.if($.lib.isAuthenticatedAndOwner($.resource.data.authorId)),
    }))
  })
  .build()
```

### Example 2: Nested Collections with Multiple Operations

```typescript
interface User {
  name: string
  email: string
}
interface Post {
  title: string
  content: string
  authorId: string
}

interface Schema {
  users: {
    data: User
    children: {
      posts: {
        data: Post
      }
    }
  }
}

const rules = createFirestoreRules<Schema>()
  .rules((ns) => {
    ns.users(($) => ({
      read: $.true,
      write: $.eq($.params.usersId, $.request.auth.uid),
    })).sub((ns) => {
      ns.posts(($) => ({
        read: $.true,
        create: $.eq($.params.usersId, $.request.auth.uid),
      }))
    })
  })
  .build()
```

### Example 3: Custom Helper Functions

```typescript
const rules = createFirestoreRules()
  .withHelpers(($, register) => ({
    hasRole: register("userHasRole", ["role"], (args) =>
      $.and(
        $.isset($.request.auth.uid),
        $.isset($.request.auth.token.roles),
        $.eq($.request.auth.token.roles.$get(args.role), true),
      ),
    ),
  }))
  .rules((ns) => {
    ns.documents(($) => ({
      delete: $.if($.lib.userHasRole("admin")),
    }))
  })
  .build()
```

### Example 4: Complex Logical Rules

```typescript
interface Document {
  owner: string
  visibility: "public" | "private"
  title: string
  content: string
  updatedAt: number
}
interface Schema {
  documents: { data: Document }
}
const rules = createFirestoreRules<Schema>()
  .withHelpers(commonHelpers)
  .rules((ns) => {
    ns.documents(($) => ({
      read: $.and(
        $.isset($.request.auth.uid),
        $.or(
          $.eq($.resource.data.owner, $.request.auth.uid),
          $.eq($.resource.data.visibility, "public"),
        ),
      ),
      update: $.and(
        $.eq($.resource.data.owner, $.request.auth.uid),
        $.hasOnlyModified(["title", "content", "updatedAt"]),
        $.lib.isServerTime($.request.resource.data.updatedAt),
      ),
    }))
  })
  .build()
```

## API Reference

### Main Entry Point

#### `createFirestoreRules<Schema>()`

Creates a new builder instance for your Firestore schema.

```typescript
const builder = createFirestoreRules<MySchema>()
```

### Builder Methods

#### `.withHelpers(factory)`

Registers custom helper functions. The factory receives:

- `ctx`: The rule context for building expressions
- `register`: Function to create registered helpers

Returns a new builder with helpers added to `ctx.lib`.

#### `.rules(callback)`

Defines rules for collections. The callback receives a namespace proxy allowing typed access to collections.

#### `.build()`

Generates the final Firestore Security Rules v2 string.

### Rule Context Operations

#### Logical

- `and(...conditions)` - Logical AND
- `or(...conditions)` - Logical OR
- `not(condition)` - Logical NOT
- `if(condition)` - Identity (returns condition as-is)
- `unless(condition)` - Logical NOT (shorthand for `not()`)
- `ternary(condition, trueVal, falseVal)` - Conditional expression
- `select(...cases, default)` - Multi-way conditional

#### Comparison

- `eq(left, right)` - Equality (==)
- `neq(left, right)` - Inequality (!=)
- `gt(left, right)` - Greater than (>)
- `gte(left, right)` - Greater than or equal (>=)
- `lt(left, right)` - Less than (<)
- `lte(left, right)` - Less than or equal (<=)
- `isset(value)` - Not null check

#### Data Validation

- `hasOnlyModified(keys)` - Modified keys match list
- `hasOnlyKeys(keys)` - All keys match list
- `hasAllKeys(keys)` - Contains all keys in list

#### Helpers

- `parens(expr)` - Wraps expression in parentheses
- `join(separator, parts, wrapInParens)` - Joins parts with separator

#### Runtime Access

- `request` - Request object
  - `request.auth` - Authentication info
    - `request.auth.uid` - User ID
    - `request.auth.token` - JWT token
  - `request.resource.data` - New document data (type-safe PathProxy)
- `resource` - Current resource
  - `resource.id` - Document ID
  - `resource.data` - Document data (type-safe PathProxy)
- `params` - Path parameters
- `server` - Server values
  - `server.time` - Current server time

### Common Helpers

Register with `.withHelpers(firestoreRulesCommonHelpers)`:

- `isAuthenticated()` - User has valid auth token
- `hasClaim(claim, expected)` - JWT token claim check
- `isOwner(uid)` - UID comparison for ownership
- `isAuthenticatedAndOwner(uid)` - Combined auth + ownership
- `isServerTime(timestamp)` - Verify server timestamp

## Type Safety Example

```typescript
interface User {
  name: string
  email: string
}

interface Post {
  title: string
  content: string
  authorId: string
}

interface Schema {
  users: {
    data: User
  }
  posts: {
    data: Post
  }
}

// ✅ Type-safe, with autocomplete
const rules = createFirestoreRules<Schema>().rules((ns) => {
  ns.users(($) => ({
    // ✅ Autocomplete & type safety
    write: $.if($.eq($.params.userId, $.request.auth.uid)),
  }))
  ns.posts(($) => ({
    // ✅ Autocomplete & type safety
    update: $.if($.hasOnlyModified(["title", "content"])),
  }))
})
```

## Development

### Scripts

```bash
npm run build      # Build library (Vite)
npm run dev        # Build in watch mode
npm run lint       # Lint code (ESLint)
npm run typecheck  # Type check (TypeScript)
npm run test       # Run tests (Vitest)
npm run test:watch # Run tests in watch mode
npm run clean      # Remove build artifacts
```

### Project Structure

```
src/
├── index.ts              # Main exports
├── builder.ts            # FirestoreRulesBuilder class
├── expression.ts         # RuleExpression and utilities
├── tools.ts              # RuleContext creation
├── types.ts              # Type definitions
├── path-proxy.ts         # Type-safe property access
├── common-helpers.ts     # Built-in auth helpers
└── helpers-registry.ts   # Helper function management

tests/
├── builder.test.ts       # Builder tests
├── expression.test.ts    # Expression tests
├── tools.test.ts         # RuleContext tests
├── path-proxy.test.ts    # PathProxy tests
├── common-helpers.test.ts # Common helpers tests
└── helpers-registry.test.ts # Registry tests
```

## License

MIT © Huafu Gandon

## Contributing

Contributions are welcome! Please open an issue or pull request on [GitHub](https://github.com/huafu/firestore-rules-builder).

---

Built with ❤️ for developers using Firebase Firestore.
