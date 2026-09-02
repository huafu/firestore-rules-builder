import type { FirestoreTypeName, BinaryOperator, LogicalOperator, UnaryOperator } from "./operators"
import type { NodeKind } from "./kinds"
import type { SourceRange } from "./location"

/**
 * Base shape shared by all AST nodes.
 */
export interface BaseNode {
  kind: NodeKind
  loc?: SourceRange
}

/**
 * Root node for a Firestore rules document.
 */
export interface ProgramNode extends BaseNode {
  kind: "Program"
  version: string
  comments: CommentNode[]
  service: ServiceDeclarationNode
}

/**
 * A single line comment represented as a first-class node.
 */
export interface CommentNode extends BaseNode {
  kind: "Comment"
  value: string
}

/**
 * Identifier token used by declarations and expressions.
 */
export interface IdentifierNode extends BaseNode {
  kind: "Identifier"
  name: string
}

/**
 * Top-level service declaration.
 */
export interface ServiceDeclarationNode extends BaseNode {
  kind: "ServiceDeclaration"
  name: IdentifierNode
  body: BlockStatementNode
}

/**
 * Block containing ordered rule statements.
 */
export interface BlockStatementNode extends BaseNode {
  kind: "BlockStatement"
  statements: RuleStatementNode[]
}

/**
 * Match path pattern composed of path segments.
 */
export interface PathPatternNode extends BaseNode {
  kind: "PathPattern"
  segments: PathSegmentNode[]
}

/**
 * Literal path segment in a match pattern.
 */
export interface PathLiteralSegmentNode extends BaseNode {
  kind: "PathLiteralSegment"
  value: string
}

/**
 * Variable capture path segment such as {id}.
 */
export interface PathVariableSegmentNode extends BaseNode {
  kind: "PathVariableSegment"
  name: IdentifierNode
}

/**
 * Recursive variable capture path segment such as {doc=**}.
 */
export interface PathRecursiveSegmentNode extends BaseNode {
  kind: "PathRecursiveSegment"
  name: IdentifierNode
}

/**
 * Union of all path segment node shapes.
 */
export type PathSegmentNode =
  | PathLiteralSegmentNode
  | PathVariableSegmentNode
  | PathRecursiveSegmentNode

/**
 * Interpolated `$(expr)` segment inside a path expression.
 */
export interface PathExpressionSegmentNode extends BaseNode {
  kind: "PathExpressionSegment"
  expression: ExpressionNode
}

/**
 * Union of segments that can appear in a path expression.
 */
export type PathExpressionPart = PathLiteralSegmentNode | PathExpressionSegmentNode

/**
 * Expression-level path used by `get()` / `exists()`, e.g.
 * `/databases/$(database)/documents/users/$(request.auth.uid)`.
 */
export interface PathExpressionNode extends BaseNode {
  kind: "PathExpression"
  segments: PathExpressionPart[]
}

/**
 * Allowed operations accepted by allow declarations.
 */
export type AllowOperation = "get" | "list" | "create" | "update" | "delete" | "read" | "write"

/**
 * Match declaration node.
 */
export interface MatchDeclarationNode extends BaseNode {
  kind: "MatchDeclaration"
  path: PathPatternNode
  body: BlockStatementNode
}

/**
 * Allow declaration node.
 */
export interface AllowDeclarationNode extends BaseNode {
  kind: "AllowDeclaration"
  operations: AllowOperation[]
  condition: ExpressionNode
}

/**
 * Function declaration node.
 */
export interface FunctionDeclarationNode extends BaseNode {
  kind: "FunctionDeclaration"
  name: IdentifierNode
  params: IdentifierNode[]
  body: BlockStatementNode
}

/**
 * Let statement node.
 */
export interface LetStatementNode extends BaseNode {
  kind: "LetStatement"
  id: IdentifierNode
  init: ExpressionNode
}

/**
 * Return statement node.
 */
export interface ReturnStatementNode extends BaseNode {
  kind: "ReturnStatement"
  argument: ExpressionNode
}

/**
 * Expression statement node.
 */
export interface ExpressionStatementNode extends BaseNode {
  kind: "ExpressionStatement"
  expression: ExpressionNode
}

/**
 * Union of rule statements valid in match/function blocks.
 */
export type RuleStatementNode =
  | CommentNode
  | MatchDeclarationNode
  | AllowDeclarationNode
  | FunctionDeclarationNode
  | LetStatementNode
  | ReturnStatementNode
  | ExpressionStatementNode

/**
 * String literal expression node.
 */
export interface StringLiteralNode extends BaseNode {
  kind: "StringLiteral"
  value: string
}

/**
 * Number literal expression node.
 */
export interface NumberLiteralNode extends BaseNode {
  kind: "NumberLiteral"
  value: number
}

/**
 * Boolean literal expression node.
 */
export interface BooleanLiteralNode extends BaseNode {
  kind: "BooleanLiteral"
  value: boolean
}

/**
 * Null literal expression node.
 */
export interface NullLiteralNode extends BaseNode {
  kind: "NullLiteral"
  value: null
}

/**
 * List literal expression node.
 */
export interface ListLiteralNode extends BaseNode {
  kind: "ListLiteral"
  elements: ExpressionNode[]
}

/**
 * Map entry key/value pair.
 */
export interface MapEntryNode extends BaseNode {
  kind: "MapEntry"
  key: StringLiteralNode | IdentifierNode
  value: ExpressionNode
}

/**
 * Map literal expression node.
 */
export interface MapLiteralNode extends BaseNode {
  kind: "MapLiteral"
  entries: MapEntryNode[]
}

/**
 * Unary expression node.
 */
export interface UnaryExpressionNode extends BaseNode {
  kind: "UnaryExpression"
  operator: UnaryOperator
  argument: ExpressionNode
}

/**
 * Binary expression node.
 */
export interface BinaryExpressionNode extends BaseNode {
  kind: "BinaryExpression"
  operator: BinaryOperator
  left: ExpressionNode
  right: ExpressionNode
}

/**
 * Logical expression node.
 */
export interface LogicalExpressionNode extends BaseNode {
  kind: "LogicalExpression"
  operator: LogicalOperator
  left: ExpressionNode
  right: ExpressionNode
}

/**
 * Ternary conditional expression node.
 */
export interface ConditionalExpressionNode extends BaseNode {
  kind: "ConditionalExpression"
  test: ExpressionNode
  consequent: ExpressionNode
  alternate: ExpressionNode
}

/**
 * Function/method call expression node.
 */
export interface CallExpressionNode extends BaseNode {
  kind: "CallExpression"
  callee: ExpressionNode
  arguments: ExpressionNode[]
}

/**
 * Dot access expression node.
 */
export interface MemberExpressionNode extends BaseNode {
  kind: "MemberExpression"
  object: ExpressionNode
  property: IdentifierNode
}

/**
 * Bracket index access expression node.
 */
export interface IndexExpressionNode extends BaseNode {
  kind: "IndexExpression"
  object: ExpressionNode
  index: ExpressionNode
}

/**
 * Runtime type check expression node.
 */
export interface IsExpressionNode extends BaseNode {
  kind: "IsExpression"
  expression: ExpressionNode
  typeName: FirestoreTypeName
}

/**
 * Union of all literal expression nodes.
 */
export type LiteralNode =
  | StringLiteralNode
  | NumberLiteralNode
  | BooleanLiteralNode
  | NullLiteralNode
  | ListLiteralNode
  | MapLiteralNode

/**
 * Union of all expression nodes.
 */
export type ExpressionNode =
  | IdentifierNode
  | LiteralNode
  | UnaryExpressionNode
  | BinaryExpressionNode
  | LogicalExpressionNode
  | ConditionalExpressionNode
  | CallExpressionNode
  | MemberExpressionNode
  | IndexExpressionNode
  | IsExpressionNode
  | PathExpressionNode

/**
 * Union of declaration nodes.
 */
export type DeclarationNode =
  | ServiceDeclarationNode
  | MatchDeclarationNode
  | AllowDeclarationNode
  | FunctionDeclarationNode

/**
 * Union of non-declaration statement nodes.
 */
export type StatementNode =
  | BlockStatementNode
  | LetStatementNode
  | ReturnStatementNode
  | ExpressionStatementNode

/**
 * Union covering every concrete AST node shape.
 */
export type AstNode =
  | ProgramNode
  | CommentNode
  | DeclarationNode
  | StatementNode
  | ExpressionNode
  | PathPatternNode
  | PathSegmentNode
  | PathExpressionSegmentNode
  | MapEntryNode
