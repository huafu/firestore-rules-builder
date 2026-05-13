import type { ExpressionNode, IdentifierNode, LogicalExpressionNode } from "./nodes"
import type { WithLocation } from "./location"
import {
  binaryExpression,
  booleanLiteral,
  callExpression,
  identifier,
  logicalExpression,
  memberExpression,
  nullLiteral,
  numberLiteral,
  stringLiteral,
} from "./factories"

/**
 * Allowed units for duration.value.
 */
export const DurationValueUnit = ["w", "d", "h", "m", "s", "ms", "ns"] as const

/**
 * Strongly typed duration.value unit.
 */
export type DurationValueUnit = (typeof DurationValueUnit)[number]

type PathLike = string | string[] | IdentifierNode | IdentifierNode[]

function asIdentifier(name: string | IdentifierNode, options?: WithLocation): IdentifierNode {
  return typeof name === "string" ? identifier(name, options) : name
}

function asExpression(
  value: string | number | ExpressionNode,
  options?: WithLocation,
): ExpressionNode {
  if (typeof value === "string") {
    return stringLiteral(value, options)
  }
  if (typeof value === "number") {
    return numberLiteral(value, options)
  }
  return value
}

function normalizePath(path: PathLike): Array<string | IdentifierNode> {
  if (Array.isArray(path)) {
    const segments: Array<string | IdentifierNode> = []
    for (const part of path) {
      if (typeof part === "string") {
        segments.push(...part.split(".").filter((s) => s.length > 0))
      } else {
        segments.push(part)
      }
    }
    return segments
  }

  if (typeof path === "string") {
    return path.split(".").filter((s) => s.length > 0)
  }

  return [path]
}

function memberPath(base: ExpressionNode, path: PathLike, options?: WithLocation): ExpressionNode {
  return normalizePath(path).reduce<ExpressionNode>((acc, segment) => {
    return memberExpression(acc, asIdentifier(segment, options), options)
  }, base)
}

function foldLogical(
  operator: LogicalExpressionNode["operator"],
  expressions: ExpressionNode[],
  options?: WithLocation,
): ExpressionNode {
  if (expressions.length === 0) {
    throw new Error(`Cannot build logical '${operator}' expression without operands`)
  }

  return expressions.slice(1).reduce<ExpressionNode>((left, right) => {
    return logicalExpression(operator, left, right, options)
  }, expressions[0] as ExpressionNode)
}

/**
 * Folds expressions using logical AND.
 */
export function and(expressions: ExpressionNode[], options?: WithLocation): ExpressionNode {
  return foldLogical("&&", expressions, options)
}

/**
 * Folds expressions using logical OR.
 */
export function or(expressions: ExpressionNode[], options?: WithLocation): ExpressionNode {
  return foldLogical("||", expressions, options)
}

/**
 * Creates the request identifier node.
 */
export function request(options?: WithLocation): IdentifierNode {
  return identifier("request", options)
}

/**
 * Creates request.auth expression.
 */
export function requestAuth(options?: WithLocation): ExpressionNode {
  return memberExpression(request(options), asIdentifier("auth"), options)
}

/**
 * Creates request.auth.uid expression.
 */
export function requestAuthUid(options?: WithLocation): ExpressionNode {
  return memberExpression(requestAuth(options), asIdentifier("uid"), options)
}

/**
 * Creates request.auth.token expression.
 */
export function requestAuthToken(options?: WithLocation): ExpressionNode {
  return memberExpression(requestAuth(options), asIdentifier("token"), options)
}

/**
 * Creates request.auth.token.<claim> expression.
 */
export function requestAuthTokenClaim(
  claim: string | IdentifierNode,
  options?: WithLocation,
): ExpressionNode {
  return memberExpression(requestAuthToken(options), asIdentifier(claim, options), options)
}

/**
 * Creates request.time expression.
 */
export function requestTime(options?: WithLocation): ExpressionNode {
  return memberExpression(request(options), asIdentifier("time"), options)
}

/**
 * Creates request.resource expression.
 */
export function requestResource(options?: WithLocation): ExpressionNode {
  return memberExpression(request(options), asIdentifier("resource"), options)
}

/**
 * Creates request.resource.data expression.
 */
export function requestResourceData(options?: WithLocation): ExpressionNode {
  return memberExpression(requestResource(options), asIdentifier("data"), options)
}

/**
 * Creates request.resource.data.<path> expression.
 */
export function requestResourceDataField(field: PathLike, options?: WithLocation): ExpressionNode {
  return memberPath(requestResourceData(options), field, options)
}

/**
 * Creates the resource identifier node.
 */
export function resource(options?: WithLocation): IdentifierNode {
  return identifier("resource", options)
}

/**
 * Creates resource.data expression.
 */
export function resourceData(options?: WithLocation): ExpressionNode {
  return memberExpression(resource(options), asIdentifier("data"), options)
}

/**
 * Creates resource.data.<path> expression.
 */
export function resourceDataField(field: PathLike, options?: WithLocation): ExpressionNode {
  return memberPath(resourceData(options), field, options)
}

/**
 * Creates resource.id expression.
 */
export function resourceId(options?: WithLocation): ExpressionNode {
  return memberExpression(resource(options), asIdentifier("id"), options)
}

/**
 * Creates the duration namespace identifier.
 */
export function duration(options?: WithLocation): IdentifierNode {
  return identifier("duration", options)
}

/**
 * Creates duration.abs(expression) call.
 */
export function durationAbs(input: ExpressionNode, options?: WithLocation): ExpressionNode {
  return callMethod(duration(options), "abs", [input], options)
}

/**
 * Creates duration.time(hours, mins, secs, nanos) call.
 */
export function durationTime(
  hours: number | ExpressionNode,
  mins: number | ExpressionNode,
  secs: number | ExpressionNode,
  nanos: number | ExpressionNode,
  options?: WithLocation,
): ExpressionNode {
  return callMethod(
    duration(options),
    "time",
    [
      asExpression(hours, options),
      asExpression(mins, options),
      asExpression(secs, options),
      asExpression(nanos, options),
    ],
    options,
  )
}

/**
 * Creates duration.value(value, unit) call.
 */
export function durationValue(
  value: number | ExpressionNode,
  unit: DurationValueUnit,
  options?: WithLocation,
): ExpressionNode {
  const callee = memberExpression(duration(options), asIdentifier("value"), options)
  const args: ExpressionNode[] = [asExpression(value, options), stringLiteral(unit, options)]
  return callExpression(callee, args, options)
}

/**
 * Creates a method call on an expression target.
 */
export function callMethod(
  target: ExpressionNode,
  method: string | IdentifierNode,
  args: ExpressionNode[] = [],
  options?: WithLocation,
): ExpressionNode {
  return callExpression(
    memberExpression(target, asIdentifier(method, options), options),
    args,
    options,
  )
}

/**
 * Creates target.keys() call.
 */
export function keysOf(target: ExpressionNode, options?: WithLocation): ExpressionNode {
  return callMethod(target, "keys", [], options)
}

/**
 * Creates target.exists() call.
 */
export function existsMethod(target: ExpressionNode, options?: WithLocation): ExpressionNode {
  return callMethod(target, "exists", [], options)
}

/**
 * Creates target.size() call.
 */
export function sizeOf(target: ExpressionNode, options?: WithLocation): ExpressionNode {
  return callMethod(target, "size", [], options)
}

/**
 * Creates target.hasOnly(values) call.
 */
export function hasOnly(
  target: ExpressionNode,
  values: ExpressionNode,
  options?: WithLocation,
): ExpressionNode {
  return callMethod(target, "hasOnly", [values], options)
}

/**
 * Creates target.hasAll(values) call.
 */
export function hasAll(
  target: ExpressionNode,
  values: ExpressionNode,
  options?: WithLocation,
): ExpressionNode {
  return callMethod(target, "hasAll", [values], options)
}

/**
 * Creates target.hasAny(values) call.
 */
export function hasAny(
  target: ExpressionNode,
  values: ExpressionNode,
  options?: WithLocation,
): ExpressionNode {
  return callMethod(target, "hasAny", [values], options)
}

/**
 * Creates target.toSet() call.
 */
export function toSet(target: ExpressionNode, options?: WithLocation): ExpressionNode {
  return callMethod(target, "toSet", [], options)
}

/**
 * Creates target.concat(other) call.
 */
export function concatLists(
  target: ExpressionNode,
  other: ExpressionNode,
  options?: WithLocation,
): ExpressionNode {
  return callMethod(target, "concat", [other], options)
}

/**
 * Creates target.removeAll(values) call.
 */
export function removeAll(
  target: ExpressionNode,
  values: ExpressionNode,
  options?: WithLocation,
): ExpressionNode {
  return callMethod(target, "removeAll", [values], options)
}

/**
 * Creates target.join(separator) call.
 */
export function joinList(
  target: ExpressionNode,
  separator: string | ExpressionNode,
  options?: WithLocation,
): ExpressionNode {
  return callMethod(target, "join", [asExpression(separator, options)], options)
}

/**
 * Creates target.diff(other) call.
 */
export function diffMap(
  target: ExpressionNode,
  other: ExpressionNode,
  options?: WithLocation,
): ExpressionNode {
  return callMethod(target, "diff", [other], options)
}

/**
 * Creates target.addedKeys() call.
 */
export function addedKeys(target: ExpressionNode, options?: WithLocation): ExpressionNode {
  return callMethod(target, "addedKeys", [], options)
}

/**
 * Creates target.removedKeys() call.
 */
export function removedKeys(target: ExpressionNode, options?: WithLocation): ExpressionNode {
  return callMethod(target, "removedKeys", [], options)
}

/**
 * Creates target.changedKeys() call.
 */
export function changedKeys(target: ExpressionNode, options?: WithLocation): ExpressionNode {
  return callMethod(target, "changedKeys", [], options)
}

/**
 * Creates target.affectedKeys() call.
 */
export function affectedKeys(target: ExpressionNode, options?: WithLocation): ExpressionNode {
  return callMethod(target, "affectedKeys", [], options)
}

/**
 * Creates target.unchangedKeys() call.
 */
export function unchangedKeys(target: ExpressionNode, options?: WithLocation): ExpressionNode {
  return callMethod(target, "unchangedKeys", [], options)
}

/**
 * Creates request.method expression.
 */
export function requestMethod(options?: WithLocation): ExpressionNode {
  return memberExpression(request(options), asIdentifier("method"), options)
}

/**
 * Creates request.path expression.
 */
export function requestPath(options?: WithLocation): ExpressionNode {
  return memberExpression(request(options), asIdentifier("path"), options)
}

/**
 * Creates request.query expression.
 */
export function requestQuery(options?: WithLocation): ExpressionNode {
  return memberExpression(request(options), asIdentifier("query"), options)
}

/**
 * Creates request.query.limit expression.
 */
export function requestQueryLimit(options?: WithLocation): ExpressionNode {
  return memberExpression(requestQuery(options), asIdentifier("limit"), options)
}

/**
 * Creates request.query.offset expression.
 */
export function requestQueryOffset(options?: WithLocation): ExpressionNode {
  return memberExpression(requestQuery(options), asIdentifier("offset"), options)
}

/**
 * Creates request.query.orderBy expression.
 */
export function requestQueryOrderBy(options?: WithLocation): ExpressionNode {
  return memberExpression(requestQuery(options), asIdentifier("orderBy"), options)
}

/**
 * Creates request.auth != null expression.
 */
export function isAuthenticated(options?: WithLocation): ExpressionNode {
  return binaryExpression("!=", requestAuth(options), nullLiteral(options), options)
}

/**
 * Creates expr == false expression.
 */
export function isFalse(expr: ExpressionNode, options?: WithLocation): ExpressionNode {
  return binaryExpression("==", expr, booleanLiteral(false, options), options)
}

/**
 * Creates a call to a global helper function.
 */
export function callHelper(
  helper: string | IdentifierNode,
  args: ExpressionNode[] = [],
  options?: WithLocation,
): ExpressionNode {
  return callExpression(asIdentifier(helper, options), args, options)
}

/**
 * Creates exists(path) helper call.
 */
export function exists(path: string | ExpressionNode, options?: WithLocation): ExpressionNode {
  return callHelper("exists", [asExpression(path, options)], options)
}

/**
 * Creates get(path) helper call.
 */
export function get(path: string | ExpressionNode, options?: WithLocation): ExpressionNode {
  return callHelper("get", [asExpression(path, options)], options)
}

/**
 * Creates getAfter(path) helper call.
 */
export function getAfter(path: string | ExpressionNode, options?: WithLocation): ExpressionNode {
  return callHelper("getAfter", [asExpression(path, options)], options)
}
