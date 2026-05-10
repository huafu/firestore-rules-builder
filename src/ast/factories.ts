import { NodeKind } from "./kinds"
import type { SourceRange, WithLocation } from "./location"
import type {
  AllowDeclarationNode,
  AllowOperation,
  BinaryExpressionNode,
  BlockStatementNode,
  BooleanLiteralNode,
  CallExpressionNode,
  CommentNode,
  ConditionalExpressionNode,
  ExpressionNode,
  ExpressionStatementNode,
  FunctionDeclarationNode,
  IdentifierNode,
  IndexExpressionNode,
  IsExpressionNode,
  LetStatementNode,
  ListLiteralNode,
  LogicalExpressionNode,
  MapEntryNode,
  MapLiteralNode,
  MatchDeclarationNode,
  MemberExpressionNode,
  NullLiteralNode,
  NumberLiteralNode,
  PathLiteralSegmentNode,
  PathPatternNode,
  PathRecursiveSegmentNode,
  PathSegmentNode,
  PathVariableSegmentNode,
  ProgramNode,
  ReturnStatementNode,
  RuleStatementNode,
  ServiceDeclarationNode,
  StringLiteralNode,
  UnaryExpressionNode,
} from "./nodes"
import type { BinaryOperator, FirestoreTypeName, LogicalOperator, UnaryOperator } from "./operators"

function withLoc<T extends object>(node: T, options?: WithLocation): T {
  if (options?.loc) {
    ;(node as T & { loc?: SourceRange }).loc = options.loc
  }

  return node
}

/**
 * Creates an identifier node.
 */
export function identifier(name: string, options?: WithLocation): IdentifierNode {
  return withLoc({ kind: NodeKind.identifier, name }, options)
}

/**
 * Creates a comment node preserving raw comment text after //.
 */
export function comment(value: string, options?: WithLocation): CommentNode {
  return withLoc({ kind: NodeKind.comment, value }, options)
}

/**
 * Creates a string literal node.
 */
export function stringLiteral(value: string, options?: WithLocation): StringLiteralNode {
  return withLoc({ kind: NodeKind.stringLiteral, value }, options)
}

/**
 * Creates a number literal node.
 */
export function numberLiteral(value: number, options?: WithLocation): NumberLiteralNode {
  return withLoc({ kind: NodeKind.numberLiteral, value }, options)
}

/**
 * Creates a boolean literal node.
 */
export function booleanLiteral(value: boolean, options?: WithLocation): BooleanLiteralNode {
  return withLoc({ kind: NodeKind.booleanLiteral, value }, options)
}

/**
 * Creates a null literal node.
 */
export function nullLiteral(options?: WithLocation): NullLiteralNode {
  return withLoc({ kind: NodeKind.nullLiteral, value: null }, options)
}

/**
 * Creates a list literal node.
 */
export function listLiteral(elements: ExpressionNode[], options?: WithLocation): ListLiteralNode {
  return withLoc({ kind: NodeKind.listLiteral, elements }, options)
}

/**
 * Creates a map entry node.
 */
export function mapEntry(
  key: StringLiteralNode | IdentifierNode,
  value: ExpressionNode,
  options?: WithLocation,
): MapEntryNode {
  return withLoc({ kind: NodeKind.mapEntry, key, value }, options)
}

/**
 * Creates a map literal node.
 */
export function mapLiteral(entries: MapEntryNode[], options?: WithLocation): MapLiteralNode {
  return withLoc({ kind: NodeKind.mapLiteral, entries }, options)
}

/**
 * Creates a unary expression node.
 */
export function unaryExpression(
  operator: UnaryOperator,
  argument: ExpressionNode,
  options?: WithLocation,
): UnaryExpressionNode {
  return withLoc({ kind: NodeKind.unaryExpression, operator, argument }, options)
}

/**
 * Creates a binary expression node.
 */
export function binaryExpression(
  operator: BinaryOperator,
  left: ExpressionNode,
  right: ExpressionNode,
  options?: WithLocation,
): BinaryExpressionNode {
  return withLoc({ kind: NodeKind.binaryExpression, operator, left, right }, options)
}

/**
 * Creates a logical expression node.
 */
export function logicalExpression(
  operator: LogicalOperator,
  left: ExpressionNode,
  right: ExpressionNode,
  options?: WithLocation,
): LogicalExpressionNode {
  return withLoc({ kind: NodeKind.logicalExpression, operator, left, right }, options)
}

/**
 * Creates a conditional expression node.
 */
export function conditionalExpression(
  test: ExpressionNode,
  consequent: ExpressionNode,
  alternate: ExpressionNode,
  options?: WithLocation,
): ConditionalExpressionNode {
  return withLoc({ kind: NodeKind.conditionalExpression, test, consequent, alternate }, options)
}

/**
 * Creates a call expression node.
 */
export function callExpression(
  callee: ExpressionNode,
  args: ExpressionNode[],
  options?: WithLocation,
): CallExpressionNode {
  return withLoc({ kind: NodeKind.callExpression, callee, arguments: args }, options)
}

/**
 * Creates a member expression node.
 */
export function memberExpression(
  object: ExpressionNode,
  property: IdentifierNode,
  options?: WithLocation,
): MemberExpressionNode {
  return withLoc({ kind: NodeKind.memberExpression, object, property }, options)
}

/**
 * Creates an index expression node.
 */
export function indexExpression(
  object: ExpressionNode,
  index: ExpressionNode,
  options?: WithLocation,
): IndexExpressionNode {
  return withLoc({ kind: NodeKind.indexExpression, object, index }, options)
}

/**
 * Creates an is-expression node.
 */
export function isExpression(
  expression: ExpressionNode,
  typeName: FirestoreTypeName,
  options?: WithLocation,
): IsExpressionNode {
  return withLoc({ kind: NodeKind.isExpression, expression, typeName }, options)
}

/**
 * Creates a literal path segment node.
 */
export function pathLiteralSegment(value: string, options?: WithLocation): PathLiteralSegmentNode {
  return withLoc({ kind: NodeKind.pathLiteralSegment, value }, options)
}

/**
 * Creates a variable path segment node.
 */
export function pathVariableSegment(
  name: string | IdentifierNode,
  options?: WithLocation,
): PathVariableSegmentNode {
  return withLoc(
    {
      kind: NodeKind.pathVariableSegment,
      name: typeof name === "string" ? identifier(name) : name,
    },
    options,
  )
}

/**
 * Creates a recursive path segment node.
 */
export function pathRecursiveSegment(
  name: string | IdentifierNode,
  options?: WithLocation,
): PathRecursiveSegmentNode {
  return withLoc(
    {
      kind: NodeKind.pathRecursiveSegment,
      name: typeof name === "string" ? identifier(name) : name,
    },
    options,
  )
}

/**
 * Creates a path pattern node.
 */
export function pathPattern(segments: PathSegmentNode[], options?: WithLocation): PathPatternNode {
  return withLoc({ kind: NodeKind.pathPattern, segments }, options)
}

/**
 * Creates a block statement node.
 */
export function blockStatement(
  statements: RuleStatementNode[],
  options?: WithLocation,
): BlockStatementNode {
  return withLoc({ kind: NodeKind.blockStatement, statements }, options)
}

/**
 * Creates a service declaration node.
 */
export function serviceDeclaration(
  name: string | IdentifierNode,
  body: BlockStatementNode,
  options?: WithLocation,
): ServiceDeclarationNode {
  return withLoc(
    {
      kind: NodeKind.serviceDeclaration,
      name: typeof name === "string" ? identifier(name) : name,
      body,
    },
    options,
  )
}

/**
 * Creates a match declaration node.
 */
export function matchDeclaration(
  path: PathPatternNode,
  body: BlockStatementNode,
  options?: WithLocation,
): MatchDeclarationNode {
  return withLoc({ kind: NodeKind.matchDeclaration, path, body }, options)
}

/**
 * Creates an allow declaration node.
 */
export function allowDeclaration(
  operations: AllowOperation[],
  condition: ExpressionNode,
  options?: WithLocation,
): AllowDeclarationNode {
  return withLoc({ kind: NodeKind.allowDeclaration, operations, condition }, options)
}

/**
 * Creates a function declaration node.
 */
export function functionDeclaration(
  name: string | IdentifierNode,
  params: Array<string | IdentifierNode>,
  body: BlockStatementNode,
  options?: WithLocation,
): FunctionDeclarationNode {
  return withLoc(
    {
      kind: NodeKind.functionDeclaration,
      name: typeof name === "string" ? identifier(name) : name,
      params: params.map((param) => (typeof param === "string" ? identifier(param) : param)),
      body,
    },
    options,
  )
}

/**
 * Creates a let statement node.
 */
export function letStatement(
  id: string | IdentifierNode,
  init: ExpressionNode,
  options?: WithLocation,
): LetStatementNode {
  return withLoc(
    {
      kind: NodeKind.letStatement,
      id: typeof id === "string" ? identifier(id) : id,
      init,
    },
    options,
  )
}

/**
 * Creates a return statement node.
 */
export function returnStatement(
  argument: ExpressionNode,
  options?: WithLocation,
): ReturnStatementNode {
  return withLoc({ kind: NodeKind.returnStatement, argument }, options)
}

/**
 * Creates an expression statement node.
 */
export function expressionStatement(
  expression: ExpressionNode,
  options?: WithLocation,
): ExpressionStatementNode {
  return withLoc({ kind: NodeKind.expressionStatement, expression }, options)
}

/**
 * Creates a program root node.
 */
export function program(
  version: string,
  service: ServiceDeclarationNode,
  comments: CommentNode[] = [],
  options?: WithLocation,
): ProgramNode {
  return withLoc({ kind: NodeKind.program, version, comments, service }, options)
}
