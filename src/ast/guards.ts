import { DeclarationKind, ExpressionKind, NodeKind, PathSegmentKind, StatementKind } from "./kinds"
import type {
  AllowDeclarationNode,
  AstNode,
  BlockStatementNode,
  DeclarationNode,
  ExpressionNode,
  FunctionDeclarationNode,
  MatchDeclarationNode,
  PathPatternNode,
  PathSegmentNode,
  ProgramNode,
  RuleStatementNode,
  ServiceDeclarationNode,
} from "./nodes"

const AllKinds = new Set<string>(Object.values(NodeKind))
const DeclarationKinds = new Set<string>(DeclarationKind)
const StatementKinds = new Set<string>(StatementKind)
const ExpressionKinds = new Set<string>(ExpressionKind)
const PathSegmentKinds = new Set<string>(PathSegmentKind)

/**
 * Returns true when a value matches any known AST node shape.
 */
export function isNode(value: unknown): value is AstNode {
  if (typeof value !== "object" || value === null) {
    return false
  }

  const maybeNode = value as { kind?: unknown }
  return typeof maybeNode.kind === "string" && AllKinds.has(maybeNode.kind)
}

/**
 * Returns true when a value is a program root node.
 */
export function isProgramNode(value: unknown): value is ProgramNode {
  return isNode(value) && value.kind === NodeKind.program
}

/**
 * Returns true when a value is a declaration node.
 */
export function isDeclarationNode(value: unknown): value is DeclarationNode {
  return isNode(value) && DeclarationKinds.has(value.kind)
}

/**
 * Returns true when a value can appear in a rule statement list.
 */
export function isRuleStatementNode(value: unknown): value is RuleStatementNode {
  if (!isNode(value)) {
    return false
  }

  return (
    value.kind === NodeKind.comment ||
    DeclarationKinds.has(value.kind) ||
    value.kind === NodeKind.letStatement ||
    value.kind === NodeKind.returnStatement ||
    value.kind === NodeKind.expressionStatement
  )
}

/**
 * Returns true when a value is a comment node.
 */
export function isCommentNode(value: unknown): value is AstNode & { kind: "comment" } {
  return isNode(value) && value.kind === NodeKind.comment
}

/**
 * Returns true when a value is a block statement or rule statement node.
 */
export function isStatementNode(value: unknown): value is BlockStatementNode | RuleStatementNode {
  return isNode(value) && (StatementKinds.has(value.kind) || isRuleStatementNode(value))
}

/**
 * Returns true when a value is an expression node.
 */
export function isExpressionNode(value: unknown): value is ExpressionNode {
  return isNode(value) && ExpressionKinds.has(value.kind)
}

/**
 * Returns true when a value is a path pattern node.
 */
export function isPathPatternNode(value: unknown): value is PathPatternNode {
  return isNode(value) && value.kind === NodeKind.pathPattern
}

/**
 * Returns true when a value is a path segment node.
 */
export function isPathSegmentNode(value: unknown): value is PathSegmentNode {
  return isNode(value) && PathSegmentKinds.has(value.kind)
}

/**
 * Returns true when a value is a service declaration node.
 */
export function isServiceDeclarationNode(value: unknown): value is ServiceDeclarationNode {
  return isNode(value) && value.kind === NodeKind.serviceDeclaration
}

/**
 * Returns true when a value is a match declaration node.
 */
export function isMatchDeclarationNode(value: unknown): value is MatchDeclarationNode {
  return isNode(value) && value.kind === NodeKind.matchDeclaration
}

/**
 * Returns true when a value is an allow declaration node.
 */
export function isAllowDeclarationNode(value: unknown): value is AllowDeclarationNode {
  return isNode(value) && value.kind === NodeKind.allowDeclaration
}

/**
 * Returns true when a value is a function declaration node.
 */
export function isFunctionDeclarationNode(value: unknown): value is FunctionDeclarationNode {
  return isNode(value) && value.kind === NodeKind.functionDeclaration
}
