/**
 * Supported unary operators in rules expressions.
 */
export const UnaryOperator = ["!", "-"] as const
/**
 * Supported logical operators in rules expressions.
 */
export const LogicalOperator = ["&&", "||"] as const
/**
 * Supported non-logical binary operators in rules expressions.
 */
export const BinaryOperator = [
  "*",
  "/",
  "%",
  "+",
  "-",
  "<",
  "<=",
  ">",
  ">=",
  "==",
  "!=",
  "in",
] as const

/**
 * Supported type names for the `is` expression.
 */
export const FirestoreTypeName = [
  "bool",
  "int",
  "float",
  "number",
  "string",
  "list",
  "map",
  "timestamp",
  "duration",
  "path",
  "latlng",
  "constraint",
  "set",
  "map_diff",
] as const

/**
 * Union of supported unary operators.
 */
export type UnaryOperator = (typeof UnaryOperator)[number]
/**
 * Union of supported logical operators.
 */
export type LogicalOperator = (typeof LogicalOperator)[number]
/**
 * Union of supported binary operators.
 */
export type BinaryOperator = (typeof BinaryOperator)[number]
/**
 * Union of supported Firestore runtime type names.
 */
export type FirestoreTypeName = (typeof FirestoreTypeName)[number]
