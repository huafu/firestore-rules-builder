import type { ParseOptions } from "./parser"
import { parseExpressionFromSource, parseRules } from "./parser"
import type { ExpressionNode, ProgramNode } from "./nodes"

/**
 * Parses raw rules source into a program node.
 */
export function programFromSource(source: string, options?: ParseOptions): ProgramNode {
  return parseRules(source, options)
}

/**
 * Parses raw expression source into an expression node.
 */
export function expressionFromSource(source: string): ExpressionNode {
  return parseExpressionFromSource(source)
}
