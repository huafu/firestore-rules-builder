import { NodeKind } from "./kinds"
import type {
  AstNode,
  BlockStatementNode,
  CallExpressionNode,
  ExpressionNode,
  FunctionDeclarationNode,
  IdentifierNode,
  IsExpressionNode,
  ListLiteralNode,
  LogicalExpressionNode,
  MapEntryNode,
  MapLiteralNode,
  MatchDeclarationNode,
  PathExpressionNode,
  PathExpressionSegmentNode,
  PathPatternNode,
  PathRecursiveSegmentNode,
  PathVariableSegmentNode,
  ProgramNode,
  RuleStatementNode,
  ServiceDeclarationNode,
} from "./nodes"

/**
 * Visitor callbacks for traversing the Firestore rules AST.
 */
export interface AstVisitor {
  enter?: (node: AstNode, parent: AstNode | null) => void
  exit?: (node: AstNode, parent: AstNode | null) => void

  Program?: (node: ProgramNode, parent: AstNode | null) => void
  Comment?: (node: AstNode & { kind: "Comment" }, parent: AstNode | null) => void
  ServiceDeclaration?: (node: ServiceDeclarationNode, parent: AstNode | null) => void
  MatchDeclaration?: (node: MatchDeclarationNode, parent: AstNode | null) => void
  AllowDeclaration?: (node: AstNode & { kind: "AllowDeclaration" }, parent: AstNode | null) => void
  FunctionDeclaration?: (node: FunctionDeclarationNode, parent: AstNode | null) => void

  BlockStatement?: (node: BlockStatementNode, parent: AstNode | null) => void
  LetStatement?: (node: AstNode & { kind: "LetStatement" }, parent: AstNode | null) => void
  ReturnStatement?: (node: AstNode & { kind: "ReturnStatement" }, parent: AstNode | null) => void
  ExpressionStatement?: (
    node: AstNode & { kind: "ExpressionStatement" },
    parent: AstNode | null,
  ) => void

  Identifier?: (node: IdentifierNode, parent: AstNode | null) => void
  StringLiteral?: (node: AstNode & { kind: "StringLiteral" }, parent: AstNode | null) => void
  NumberLiteral?: (node: AstNode & { kind: "NumberLiteral" }, parent: AstNode | null) => void
  BooleanLiteral?: (node: AstNode & { kind: "BooleanLiteral" }, parent: AstNode | null) => void
  NullLiteral?: (node: AstNode & { kind: "NullLiteral" }, parent: AstNode | null) => void
  ListLiteral?: (node: ListLiteralNode, parent: AstNode | null) => void
  MapLiteral?: (node: MapLiteralNode, parent: AstNode | null) => void
  MapEntry?: (node: MapEntryNode, parent: AstNode | null) => void
  UnaryExpression?: (node: AstNode & { kind: "UnaryExpression" }, parent: AstNode | null) => void
  BinaryExpression?: (node: AstNode & { kind: "BinaryExpression" }, parent: AstNode | null) => void
  LogicalExpression?: (node: LogicalExpressionNode, parent: AstNode | null) => void
  ConditionalExpression?: (
    node: AstNode & { kind: "ConditionalExpression" },
    parent: AstNode | null,
  ) => void
  CallExpression?: (node: CallExpressionNode, parent: AstNode | null) => void
  MemberExpression?: (node: AstNode & { kind: "MemberExpression" }, parent: AstNode | null) => void
  IndexExpression?: (node: AstNode & { kind: "IndexExpression" }, parent: AstNode | null) => void
  IsExpression?: (node: IsExpressionNode, parent: AstNode | null) => void

  PathPattern?: (node: PathPatternNode, parent: AstNode | null) => void
  PathLiteralSegment?: (
    node: AstNode & { kind: "PathLiteralSegment" },
    parent: AstNode | null,
  ) => void
  PathVariableSegment?: (node: PathVariableSegmentNode, parent: AstNode | null) => void
  PathRecursiveSegment?: (node: PathRecursiveSegmentNode, parent: AstNode | null) => void
  PathExpression?: (node: PathExpressionNode, parent: AstNode | null) => void
  PathExpressionSegment?: (node: PathExpressionSegmentNode, parent: AstNode | null) => void
}

function dispatch(visitor: AstVisitor, node: AstNode, parent: AstNode | null): void {
  const fn = visitor[node.kind as keyof AstVisitor] as
    | ((node: AstNode, parent: AstNode | null) => void)
    | undefined
  fn?.(node, parent)
}

function collectChildren(node: AstNode): AstNode[] {
  switch (node.kind) {
    case NodeKind.program:
      return [...node.comments, node.service]
    case NodeKind.comment:
      return []
    case NodeKind.serviceDeclaration:
      return [node.name, node.body]
    case NodeKind.matchDeclaration:
      return [node.path, node.body]
    case NodeKind.allowDeclaration:
      return [node.condition]
    case NodeKind.functionDeclaration:
      return [node.name, ...node.params, node.body]
    case NodeKind.blockStatement:
      return [...node.statements]
    case NodeKind.letStatement:
      return [node.id, node.init]
    case NodeKind.returnStatement:
      return [node.argument]
    case NodeKind.expressionStatement:
      return [node.expression]
    case NodeKind.identifier:
    case NodeKind.stringLiteral:
    case NodeKind.numberLiteral:
    case NodeKind.booleanLiteral:
    case NodeKind.nullLiteral:
    case NodeKind.pathLiteralSegment:
      return []
    case NodeKind.listLiteral:
      return [...node.elements]
    case NodeKind.mapLiteral:
      return [...node.entries]
    case NodeKind.mapEntry:
      return [node.key, node.value]
    case NodeKind.unaryExpression:
      return [node.argument]
    case NodeKind.binaryExpression:
    case NodeKind.logicalExpression:
      return [node.left, node.right]
    case NodeKind.conditionalExpression:
      return [node.test, node.consequent, node.alternate]
    case NodeKind.callExpression:
      return [node.callee, ...node.arguments]
    case NodeKind.memberExpression:
      return [node.object, node.property]
    case NodeKind.indexExpression:
      return [node.object, node.index]
    case NodeKind.isExpression:
      return [node.expression]
    case NodeKind.pathPattern:
      return [...node.segments]
    case NodeKind.pathVariableSegment:
    case NodeKind.pathRecursiveSegment:
      return [node.name]
    case NodeKind.pathExpression:
      return [...node.segments]
    case NodeKind.pathExpressionSegment:
      return [node.expression]
    default: {
      const neverNode: never = node
      return neverNode
    }
  }
}

/**
 * Walks an AST in depth-first order and invokes visitor callbacks.
 */
export function walkAst(root: AstNode, visitor: AstVisitor): void {
  const visit = (node: AstNode, parent: AstNode | null): void => {
    visitor.enter?.(node, parent)
    dispatch(visitor, node, parent)

    for (const child of collectChildren(node)) {
      visit(child, node)
    }

    visitor.exit?.(node, parent)
  }

  visit(root, null)
}

/**
 * Walks an AST and invokes a callback for each expression node encountered.
 */
export function walkExpressions(
  root: AstNode,
  visitor: (node: ExpressionNode, parent: AstNode | null) => void,
): void {
  walkAst(root, {
    enter(node, parent) {
      switch (node.kind) {
        case NodeKind.identifier:
        case NodeKind.stringLiteral:
        case NodeKind.numberLiteral:
        case NodeKind.booleanLiteral:
        case NodeKind.nullLiteral:
        case NodeKind.listLiteral:
        case NodeKind.mapLiteral:
        case NodeKind.unaryExpression:
        case NodeKind.binaryExpression:
        case NodeKind.logicalExpression:
        case NodeKind.conditionalExpression:
        case NodeKind.callExpression:
        case NodeKind.memberExpression:
        case NodeKind.indexExpression:
        case NodeKind.isExpression:
        case NodeKind.pathExpression:
          visitor(node, parent)
          break
        default:
          break
      }
    },
  })
}

/**
 * Walks an AST and invokes a callback for each rule statement node encountered.
 */
export function walkStatements(
  root: AstNode,
  visitor: (node: RuleStatementNode, parent: AstNode | null) => void,
): void {
  walkAst(root, {
    enter(node, parent) {
      switch (node.kind) {
        case NodeKind.comment:
        case NodeKind.matchDeclaration:
        case NodeKind.allowDeclaration:
        case NodeKind.functionDeclaration:
        case NodeKind.letStatement:
        case NodeKind.returnStatement:
        case NodeKind.expressionStatement:
          visitor(node, parent)
          break
        default:
          break
      }
    },
  })
}
