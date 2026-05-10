import { NodeKind } from "./kinds"
import type {
  AstNode,
  BlockStatementNode,
  CommentNode,
  ExpressionNode,
  MapEntryNode,
  PathPatternNode,
  PathSegmentNode,
  ProgramNode,
  RuleStatementNode,
} from "./nodes"

/**
 * Options controlling AST to source code rendering.
 */
export interface PrintOptions {
  indent?: string
}

const ExpressionPrecedence: Record<string, number> = {
  ConditionalExpression: 1,
  IsExpression: 4,
  UnaryExpression: 5,
  CallExpression: 6,
  MemberExpression: 6,
  IndexExpression: 6,
  Identifier: 7,
  StringLiteral: 7,
  NumberLiteral: 7,
  BooleanLiteral: 7,
  NullLiteral: 7,
  ListLiteral: 7,
  MapLiteral: 7,
}

const BinaryOperationPrecedence: Record<string, number> = {
  "*": 6,
  "/": 6,
  "%": 6,
  "+": 5,
  "-": 5,
  "<": 4,
  "<=": 4,
  ">": 4,
  ">=": 4,
  "==": 3,
  "!=": 3,
  in: 3,
}

const LogicalOperationPrecedence: Record<string, number> = {
  "&&": 2,
  "||": 1,
}

function getExpressionPrecedence(node: ExpressionNode): number {
  if (node.kind === NodeKind.logicalExpression) {
    return LogicalOperationPrecedence[node.operator] ?? 0
  }

  if (node.kind === NodeKind.binaryExpression) {
    return BinaryOperationPrecedence[node.operator] ?? 0
  }

  return ExpressionPrecedence[node.kind] ?? 0
}

function printPathSegment(node: PathSegmentNode): string {
  switch (node.kind) {
    case NodeKind.pathLiteralSegment:
      return node.value
    case NodeKind.pathVariableSegment:
      return `{${node.name.name}}`
    case NodeKind.pathRecursiveSegment:
      return `{${node.name.name}=**}`
    default: {
      const neverNode: never = node
      return neverNode
    }
  }
}

function printPathPattern(node: PathPatternNode): string {
  return `/${node.segments.map(printPathSegment).join("/")}`
}

function printComment(node: CommentNode, indent: string): string {
  return `${indent}//${node.value}`
}

function wrapIfNeeded(value: string, node: ExpressionNode, minPrecedence: number): string {
  const precedence = getExpressionPrecedence(node)
  if (precedence < minPrecedence) {
    return `(${value})`
  }
  return value
}

function printExpression(node: ExpressionNode, minPrecedence = 0): string {
  switch (node.kind) {
    case NodeKind.identifier:
      return node.name
    case NodeKind.stringLiteral:
      return `'${node.value.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`
    case NodeKind.numberLiteral:
      return String(node.value)
    case NodeKind.booleanLiteral:
      return node.value ? "true" : "false"
    case NodeKind.nullLiteral:
      return "null"
    case NodeKind.listLiteral:
      return `[${node.elements.map((entry) => printExpression(entry)).join(", ")}]`
    case NodeKind.mapLiteral:
      return `{${node.entries.map((entry) => printMapEntry(entry)).join(", ")}}`
    case NodeKind.unaryExpression: {
      const body = `${node.operator}${printExpression(node.argument, ExpressionPrecedence.UnaryExpression)}`
      return wrapIfNeeded(body, node, minPrecedence)
    }
    case NodeKind.isExpression: {
      const body = `${printExpression(node.expression, ExpressionPrecedence.isExpression)} is ${node.typeName}`
      return wrapIfNeeded(body, node, minPrecedence)
    }
    case NodeKind.binaryExpression:
    case NodeKind.logicalExpression: {
      const precedence = getExpressionPrecedence(node)
      const left = printExpression(node.left, precedence)
      const right = printExpression(node.right, precedence + 1)
      const body = `${left} ${node.operator} ${right}`
      return wrapIfNeeded(body, node, minPrecedence)
    }
    case NodeKind.conditionalExpression: {
      const precedence = ExpressionPrecedence.conditionalExpression
      const body = `${printExpression(node.test, precedence)} ? ${printExpression(node.consequent)} : ${printExpression(node.alternate, precedence)}`
      return wrapIfNeeded(body, node, minPrecedence)
    }
    case NodeKind.callExpression: {
      const body = `${printExpression(node.callee, ExpressionPrecedence.callExpression)}(${node.arguments.map((arg) => printExpression(arg)).join(", ")})`
      return wrapIfNeeded(body, node, minPrecedence)
    }
    case NodeKind.memberExpression: {
      const body = `${printExpression(node.object, ExpressionPrecedence.memberExpression)}.${node.property.name}`
      return wrapIfNeeded(body, node, minPrecedence)
    }
    case NodeKind.indexExpression: {
      const body = `${printExpression(node.object, ExpressionPrecedence.indexExpression)}[${printExpression(node.index)}]`
      return wrapIfNeeded(body, node, minPrecedence)
    }
    default: {
      const neverNode: never = node
      return neverNode
    }
  }
}

function printMapEntry(entry: MapEntryNode): string {
  const key = entry.key.kind === NodeKind.identifier ? entry.key.name : printExpression(entry.key)
  return `${key}: ${printExpression(entry.value)}`
}

function printRuleStatement(node: RuleStatementNode, depth: number, indentUnit: string): string {
  const indent = indentUnit.repeat(depth)

  switch (node.kind) {
    case NodeKind.comment:
      return printComment(node, indent)
    case NodeKind.matchDeclaration:
      return `${indent}match ${printPathPattern(node.path)} ${printBlock(node.body, depth, indentUnit)}`
    case NodeKind.allowDeclaration:
      return `${indent}allow ${node.operations.join(", ")}: if ${printExpression(node.condition)};`
    case NodeKind.functionDeclaration:
      return `${indent}function ${node.name.name}(${node.params.map((param) => param.name).join(", ")}) ${printBlock(node.body, depth, indentUnit)}`
    case NodeKind.letStatement:
      return `${indent}let ${node.id.name} = ${printExpression(node.init)};`
    case NodeKind.returnStatement:
      return `${indent}return ${printExpression(node.argument)};`
    case NodeKind.expressionStatement:
      return `${indent}${printExpression(node.expression)};`
    default: {
      const neverNode: never = node
      return neverNode
    }
  }
}

function printBlock(node: BlockStatementNode, depth: number, indentUnit: string): string {
  const indent = indentUnit.repeat(depth)
  if (node.statements.length === 0) {
    return "{}"
  }

  const lines = node.statements.map((statement) =>
    printRuleStatement(statement, depth + 1, indentUnit),
  )
  return `{
${lines.join("\n")}
${indent}}`
}

/**
 * Prints a program AST into a complete Firestore rules document.
 */
export function printRules(ast: ProgramNode, options: PrintOptions = {}): string {
  const indentUnit = options.indent ?? "  "
  const lines: string[] = []

  for (const item of ast.comments) {
    lines.push(printComment(item, ""))
  }

  lines.push(`rules_version = '${ast.version}';`)
  lines.push(`service ${ast.service.name.name} ${printBlock(ast.service.body, 0, indentUnit)}`)

  return `${lines.join("\n")}\n`
}

/**
 * Prints any single AST node to Firestore rules source text.
 */
export function printNode(node: AstNode, options: PrintOptions = {}): string {
  const indentUnit = options.indent ?? "  "

  switch (node.kind) {
    case NodeKind.program:
      return printRules(node, options)
    case NodeKind.comment:
      return printComment(node, "")
    case NodeKind.blockStatement:
      return printBlock(node, 0, indentUnit)
    case NodeKind.matchDeclaration:
    case NodeKind.allowDeclaration:
    case NodeKind.functionDeclaration:
    case NodeKind.letStatement:
    case NodeKind.returnStatement:
    case NodeKind.expressionStatement:
      return printRuleStatement(node, 0, indentUnit)
    case NodeKind.pathPattern:
      return printPathPattern(node)
    case NodeKind.pathLiteralSegment:
    case NodeKind.pathVariableSegment:
    case NodeKind.pathRecursiveSegment:
      return printPathSegment(node)
    case NodeKind.serviceDeclaration:
      return `service ${node.name.name} ${printBlock(node.body, 0, indentUnit)}`
    default:
      return printExpression(node as ExpressionNode)
  }
}
