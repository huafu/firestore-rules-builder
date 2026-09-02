/**
 * Canonical string discriminator values used by all AST nodes.
 */
export const NodeKind = {
  program: "Program",
  comment: "Comment",
  serviceDeclaration: "ServiceDeclaration",
  matchDeclaration: "MatchDeclaration",
  allowDeclaration: "AllowDeclaration",
  functionDeclaration: "FunctionDeclaration",
  blockStatement: "BlockStatement",
  letStatement: "LetStatement",
  returnStatement: "ReturnStatement",
  expressionStatement: "ExpressionStatement",
  identifier: "Identifier",
  stringLiteral: "StringLiteral",
  numberLiteral: "NumberLiteral",
  booleanLiteral: "BooleanLiteral",
  nullLiteral: "NullLiteral",
  listLiteral: "ListLiteral",
  mapLiteral: "MapLiteral",
  mapEntry: "MapEntry",
  unaryExpression: "UnaryExpression",
  binaryExpression: "BinaryExpression",
  logicalExpression: "LogicalExpression",
  conditionalExpression: "ConditionalExpression",
  callExpression: "CallExpression",
  memberExpression: "MemberExpression",
  indexExpression: "IndexExpression",
  isExpression: "IsExpression",
  pathPattern: "PathPattern",
  pathLiteralSegment: "PathLiteralSegment",
  pathVariableSegment: "PathVariableSegment",
  pathRecursiveSegment: "PathRecursiveSegment",
  pathExpression: "PathExpression",
  pathExpressionSegment: "PathExpressionSegment",
} as const

/**
 * Union of all valid AST node discriminator values.
 */
export type NodeKind = (typeof NodeKind)[keyof typeof NodeKind]

/**
 * Node kinds considered declarations in Firestore rules structure.
 */
export const DeclarationKind = [
  NodeKind.serviceDeclaration,
  NodeKind.matchDeclaration,
  NodeKind.allowDeclaration,
  NodeKind.functionDeclaration,
] as const

/**
 * Node kinds considered statements.
 */
export const StatementKind = [
  NodeKind.blockStatement,
  NodeKind.comment,
  NodeKind.letStatement,
  NodeKind.returnStatement,
  NodeKind.expressionStatement,
] as const

/**
 * Node kinds considered expressions.
 */
export const ExpressionKind = [
  NodeKind.identifier,
  NodeKind.stringLiteral,
  NodeKind.numberLiteral,
  NodeKind.booleanLiteral,
  NodeKind.nullLiteral,
  NodeKind.listLiteral,
  NodeKind.mapLiteral,
  NodeKind.unaryExpression,
  NodeKind.binaryExpression,
  NodeKind.logicalExpression,
  NodeKind.conditionalExpression,
  NodeKind.callExpression,
  NodeKind.memberExpression,
  NodeKind.indexExpression,
  NodeKind.isExpression,
  NodeKind.pathExpression,
] as const

/**
 * Node kinds used as match path pattern segments.
 */
export const PathSegmentKind = [
  NodeKind.pathLiteralSegment,
  NodeKind.pathVariableSegment,
  NodeKind.pathRecursiveSegment,
] as const

/**
 * Union of declaration node kind values.
 */
export type DeclarationKind = (typeof DeclarationKind)[number]
/**
 * Union of statement node kind values.
 */
export type StatementKind = (typeof StatementKind)[number]
/**
 * Union of expression node kind values.
 */
export type ExpressionKind = (typeof ExpressionKind)[number]
/**
 * Union of path segment node kind values.
 */
export type PathSegmentKind = (typeof PathSegmentKind)[number]
