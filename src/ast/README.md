# Firestore Rules AST

This module defines a clean-room abstract syntax tree for Firestore rules.

## Design goals

- Use discriminated unions with a stable `kind` tag on every node.
- Keep parser and printer independent from AST shape details.
- Keep this module isolated so it can evolve safely.

## Public API

All exported symbols are documented with TSDoc in their source modules.

### Barrel export

- [src/ast/index.ts](src/ast/index.ts) re-exports all public AST symbols.

### Kinds and operators

- [src/ast/kinds.ts](src/ast/kinds.ts): node kind constants and kind unions.
  - `NodeKind`
  - `NodeKind`
  - `DeclarationKind`
  - `StatementKind`
  - `ExpressionKind`
  - `PathSegmentKind`
  - `DeclarationKind`
  - `StatementKind`
  - `ExpressionKind`
  - `PathSegmentKind`
- [src/ast/operators.ts](src/ast/operators.ts): operator/type-name constants and unions.
  - `UnaryOperator`
  - `LogicalOperator`
  - `BinaryOperator`
  - `FirestoreTypeName`

### Core node types

- [src/ast/location.ts](src/ast/location.ts): source position and range helpers.
  - `Position`, `SourceRange`, `Locatable`, `WithLocation`, `hasLocation`
- [src/ast/nodes.ts](src/ast/nodes.ts): all node interfaces and node unions.
  - Structural nodes: `ProgramNode`, `ServiceDeclarationNode`, `MatchDeclarationNode`, `AllowDeclarationNode`, `FunctionDeclarationNode`, `BlockStatementNode`
  - Statements: `RuleStatementNode`, `LetStatementNode`, `ReturnStatementNode`, `ExpressionStatementNode`, `CommentNode`
  - Paths: `PathPatternNode`, `PathSegmentNode`, `PathLiteralSegmentNode`, `PathVariableSegmentNode`, `PathRecursiveSegmentNode`
  - Expressions: `ExpressionNode`, `LiteralNode`, `IdentifierNode`, `StringLiteralNode`, `NumberLiteralNode`, `BooleanLiteralNode`, `NullLiteralNode`, `ListLiteralNode`, `MapLiteralNode`, `MapEntryNode`, `UnaryExpressionNode`, `BinaryExpressionNode`, `LogicalExpressionNode`, `ConditionalExpressionNode`, `CallExpressionNode`, `MemberExpressionNode`, `IndexExpressionNode`, `IsExpressionNode`
  - Unions: `AllowOperation`, `DeclarationNode`, `StatementNode`, `AstNode`

### Constructors and source conversion

- [src/ast/factories.ts](src/ast/factories.ts): typed node constructors.
  - Primitives/literals: `identifier`, `comment`, `stringLiteral`, `numberLiteral`, `booleanLiteral`, `nullLiteral`, `listLiteral`, `mapEntry`, `mapLiteral`
  - Expressions: `unaryExpression`, `binaryExpression`, `logicalExpression`, `conditionalExpression`, `callExpression`, `memberExpression`, `indexExpression`, `isExpression`
  - Paths/declarations/statements: `pathLiteralSegment`, `pathVariableSegment`, `pathRecursiveSegment`, `pathPattern`, `blockStatement`, `serviceDeclaration`, `matchDeclaration`, `allowDeclaration`, `functionDeclaration`, `letStatement`, `returnStatement`, `expressionStatement`, `program`
- [src/ast/source-factories.ts](src/ast/source-factories.ts): convenience source-to-node constructors.
  - `programFromSource`
  - `expressionFromSource`

### Traversal, parsing, printing, and guards

- [src/ast/guards.ts](src/ast/guards.ts): runtime type guards for AST values.
  - `isNode`, `isProgramNode`, `isDeclarationNode`, `isRuleStatementNode`, `isCommentNode`, `isStatementNode`, `isExpressionNode`, `isPathPatternNode`, `isPathSegmentNode`, `isServiceDeclarationNode`, `isMatchDeclarationNode`, `isAllowDeclarationNode`, `isFunctionDeclarationNode`
- [src/ast/visitor.ts](src/ast/visitor.ts): AST traversal APIs.
  - `AstVisitor`, `walkAst`, `walkExpressions`, `walkStatements`
- [src/ast/parser.ts](src/ast/parser.ts): parser entry points.
  - `ParseOptions`, `parseRules`, `parseExpressionFromSource`
- [src/ast/printer.ts](src/ast/printer.ts): source rendering entry points.
  - `PrintOptions`, `printRules`, `printNode`

### Firestore convenience helpers

- [src/ast/known-factories.ts](src/ast/known-factories.ts): domain-specific expression builders.
  - Logical folding: `and`, `or`
  - Request/resource helpers: `request`, `requestAuth`, `requestAuthUid`, `requestAuthToken`, `requestAuthTokenClaim`, `requestTime`, `requestResource`, `requestResourceData`, `requestResourceDataField`, `resource`, `resourceData`, `resourceDataField`, `resourceId`, `requestMethod`, `requestPath`, `requestQuery`, `requestQueryLimit`, `requestQueryOffset`, `requestQueryOrderBy`
  - Duration helpers: `DurationValueUnit`, `duration`, `durationAbs`, `durationTime`, `durationValue`
  - Method/global wrappers: `callMethod`, `keysOf`, `existsMethod`, `sizeOf`, `hasOnly`, `hasAll`, `hasAny`, `toSet`, `concatLists`, `removeAll`, `joinList`, `diffMap`, `addedKeys`, `removedKeys`, `changedKeys`, `affectedKeys`, `unchangedKeys`, `callHelper`, `exists`, `get`, `getAfter`
  - Predicates: `isAuthenticated`, `isFalse`

## Quick usage

```ts
import {
  parseRules,
  printRules,
  programFromSource,
  expressionFromSource,
  requestResourceDataField,
  durationValue,
} from "./ast"

const program = parseRules(
  "rules_version = '2';\nservice cloud.firestore { match /databases/{db}/documents { allow read: if true; } }\n",
)
const source = printRules(program)

const sameProgram = programFromSource(source)
const expr = expressionFromSource("request.auth != null")
const ownerExpr = requestResourceDataField("profile.ownerId")
const ttlExpr = durationValue(5, "m")
```

## Node taxonomy

- `Program` is the root node and stores the declared rules version and service block.
- Declarations model rules structure: `ServiceDeclaration`, `MatchDeclaration`, `AllowDeclaration`, and `FunctionDeclaration`.
- Statements model executable blocks: `LetStatement`, `ReturnStatement`, and `ExpressionStatement`.
- `Comment` nodes preserve `//` line comments as first-class AST entries.
- Expressions model values and computations.
- Path nodes model `match` path patterns, including recursive captures.

## Extension rules

When introducing a new node kind:

1. Add the literal kind in `kinds.ts`.
2. Add the node interface and union coverage in `nodes.ts`.
3. Add a factory in `factories.ts`.
4. Add guard coverage in `guards.ts`.
5. Add traversal behavior in `visitor.ts`.
6. Add tests for shape and traversal behavior.
