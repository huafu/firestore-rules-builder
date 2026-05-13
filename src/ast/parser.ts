import type { Position, SourceRange, WithLocation } from "./location"
import { BinaryOperator, FirestoreTypeName, LogicalOperator, UnaryOperator } from "./operators"
import type {
  AllowOperation,
  BinaryExpressionNode,
  BlockStatementNode,
  CommentNode,
  ExpressionNode,
  IdentifierNode,
  LogicalExpressionNode,
  PathSegmentNode,
  ProgramNode,
  RuleStatementNode,
} from "./nodes"
import {
  allowDeclaration,
  binaryExpression,
  blockStatement,
  booleanLiteral,
  callExpression,
  comment,
  conditionalExpression,
  expressionStatement,
  functionDeclaration,
  identifier,
  indexExpression,
  isExpression,
  letStatement,
  listLiteral,
  logicalExpression,
  mapEntry,
  mapLiteral,
  matchDeclaration,
  memberExpression,
  nullLiteral,
  numberLiteral,
  pathLiteralSegment,
  pathPattern,
  pathRecursiveSegment,
  pathVariableSegment,
  program,
  returnStatement,
  serviceDeclaration,
  stringLiteral,
  unaryExpression,
} from "./factories"

/**
 * Parsing options for program source parsing.
 */
export interface ParseOptions {
  includeLocation?: boolean
}

type TokenType = "identifier" | "number" | "string" | "symbol" | "keyword" | "comment" | "eof"

interface Token {
  type: TokenType
  value: string
  start: number
  end: number
}

const Keywords = new Set([
  "rules_version",
  "service",
  "match",
  "allow",
  "function",
  "let",
  "return",
  "if",
  "true",
  "false",
  "null",
  "is",
])

const AllowOperations = new Set<AllowOperation>([
  "get",
  "list",
  "create",
  "update",
  "delete",
  "read",
  "write",
])

const Precedence: Record<string, number> = {
  "||": 1,
  "&&": 2,
  "==": 3,
  "!=": 3,
  in: 3,
  "<": 4,
  "<=": 4,
  ">": 4,
  ">=": 4,
  "+": 5,
  "-": 5,
  "*": 6,
  "/": 6,
  "%": 6,
}

class LineMap {
  private readonly lineStarts: number[]

  constructor(private readonly source: string) {
    this.lineStarts = [0]
    for (let i = 0; i < source.length; i++) {
      if (source[i] === "\n") {
        this.lineStarts.push(i + 1)
      }
    }
  }

  position(offset: number): Position {
    let lo = 0
    let hi = this.lineStarts.length - 1
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1
      if ((this.lineStarts[mid] ?? 0) <= offset) {
        lo = mid
      } else {
        hi = mid - 1
      }
    }
    return { line: lo + 1, column: offset - (this.lineStarts[lo] ?? 0), offset }
  }

  range(startOffset: number, endOffset: number): SourceRange {
    return {
      start: this.position(startOffset),
      end: this.position(endOffset),
      source: this.source,
    }
  }
}

class ParseError extends Error {
  constructor(
    message: string,
    readonly at: number,
  ) {
    super(message)
    this.name = "ParseError"
  }
}

class Tokenizer {
  private index = 0

  constructor(private readonly source: string) {}

  tokenize(): Token[] {
    const tokens: Token[] = []

    while (!this.isDone()) {
      this.skipWhitespace()
      if (this.isDone()) {
        break
      }

      const start = this.index
      const char = this.peek()
      const pair = `${char}${this.peek(1)}`

      if (pair === "//") {
        this.index += 2
        const commentStart = this.index
        while (!this.isDone() && this.peek() !== "\n") {
          this.index += 1
        }
        tokens.push({
          type: "comment",
          value: this.source.slice(commentStart, this.index),
          start,
          end: this.index,
        })
        continue
      }

      if (char === "'" || char === '"') {
        tokens.push(this.readString())
        continue
      }

      if (this.isDigit(char)) {
        tokens.push(this.readNumber())
        continue
      }

      if (this.isIdentifierStart(char)) {
        tokens.push(this.readIdentifierOrKeyword())
        continue
      }

      if (pair === "**") {
        this.index += 2
        tokens.push({ type: "symbol", value: "**", start, end: this.index })
        continue
      }

      if (["&&", "||", "==", "!=", "<=", ">="].includes(pair)) {
        this.index += 2
        tokens.push({ type: "symbol", value: pair, start, end: this.index })
        continue
      }

      if (
        [
          "{",
          "}",
          "(",
          ")",
          "[",
          "]",
          ":",
          ";",
          ",",
          ".",
          "=",
          "!",
          "/",
          "<",
          ">",
          "+",
          "-",
          "*",
          "%",
          "?",
        ].includes(char)
      ) {
        this.index += 1
        tokens.push({ type: "symbol", value: char, start, end: this.index })
        continue
      }

      throw new ParseError(`Unexpected character '${char}'`, this.index)
    }

    tokens.push({ type: "eof", value: "<eof>", start: this.index, end: this.index })
    return tokens
  }

  private readString(): Token {
    const quote = this.peek()
    const start = this.index
    this.index += 1
    let value = ""

    while (!this.isDone()) {
      const ch = this.peek()
      if (ch === quote) {
        this.index += 1
        return { type: "string", value, start, end: this.index }
      }

      if (ch === "\\") {
        this.index += 1
        const escaped = this.peek()
        if (escaped === "n") {
          value += "\n"
        } else if (escaped === "r") {
          value += "\r"
        } else if (escaped === "t") {
          value += "\t"
        } else {
          value += escaped
        }
        this.index += 1
        continue
      }

      value += ch
      this.index += 1
    }

    throw new ParseError("Unterminated string literal", start)
  }

  private readNumber(): Token {
    const start = this.index
    while (!this.isDone() && this.isDigit(this.peek())) {
      this.index += 1
    }

    if (this.peek() === "." && this.isDigit(this.peek(1))) {
      this.index += 1
      while (!this.isDone() && this.isDigit(this.peek())) {
        this.index += 1
      }
    }

    return {
      type: "number",
      value: this.source.slice(start, this.index),
      start,
      end: this.index,
    }
  }

  private readIdentifierOrKeyword(): Token {
    const start = this.index
    this.index += 1
    while (!this.isDone() && this.isIdentifierPart(this.peek())) {
      this.index += 1
    }

    const value = this.source.slice(start, this.index)
    return {
      type: Keywords.has(value) ? "keyword" : "identifier",
      value,
      start,
      end: this.index,
    }
  }

  private isDone(): boolean {
    return this.index >= this.source.length
  }

  private peek(offset = 0): string {
    return this.source[this.index + offset] ?? ""
  }

  private skipWhitespace(): void {
    while (!this.isDone() && /\s/.test(this.peek())) {
      this.index += 1
    }
  }

  private isDigit(char: string): boolean {
    return /[0-9]/.test(char)
  }

  private isIdentifierStart(char: string): boolean {
    return /[A-Za-z_]/.test(char)
  }

  private isIdentifierPart(char: string): boolean {
    return /[A-Za-z0-9_]/.test(char)
  }
}

class Parser {
  private cursor = 0
  private lastEnd = 0
  private pendingComments: CommentNode[] = []

  constructor(
    private readonly tokens: Token[],
    private readonly lineMap?: LineMap,
  ) {}

  private mark(): number {
    return this.tokens[this.cursor]?.start ?? this.lastEnd
  }

  private loc(start: number): WithLocation | undefined {
    if (!this.lineMap) return undefined
    return { loc: this.lineMap.range(start, this.lastEnd) }
  }

  private tokenLoc(token: Token): WithLocation | undefined {
    if (!this.lineMap) return undefined
    return { loc: this.lineMap.range(token.start, token.end) }
  }

  parseProgram(): ProgramNode {
    const start = this.mark()
    const programComments = this.collectComments()

    this.expectKeyword("rules_version")
    this.expectSymbol("=")
    const versionToken = this.expectOneOf(["string", "number"])
    this.expectSymbol(";")

    const service = this.parseServiceDeclaration()
    this.consumeCommentsIntoPending()
    const trailingComments = this.drainPendingComments()
    this.expect("eof")

    return program(
      versionToken.value,
      service,
      [...programComments, ...trailingComments],
      this.loc(start),
    )
  }

  parseStandaloneExpression(): ExpressionNode {
    const expr = this.parseExpression()
    this.consumeCommentsIntoPending()
    this.expect("eof")
    return expr
  }

  private parseServiceDeclaration() {
    this.consumeCommentsIntoPending()
    const start = this.mark()
    this.expectKeyword("service")
    const name = this.parseDottedIdentifier()
    const body = this.parseBlockStatement()
    return serviceDeclaration(name, body, this.loc(start))
  }

  private parseBlockStatement(): BlockStatementNode {
    this.consumeCommentsIntoPending()
    const start = this.mark()
    this.expectSymbol("{")

    const statements: RuleStatementNode[] = [...this.drainPendingComments()]
    while (!this.matchSymbol("}")) {
      this.consumeCommentsIntoPending()
      statements.push(...this.drainPendingComments())
      if (this.matchSymbol("}")) {
        break
      }
      statements.push(this.parseRuleStatement())
    }

    return blockStatement(statements, this.loc(start))
  }

  private parseRuleStatement(): RuleStatementNode {
    if (this.peek().type === "keyword") {
      switch (this.peek().value) {
        case "match":
          return this.parseMatchDeclaration()
        case "allow":
          return this.parseAllowDeclaration()
        case "function":
          return this.parseFunctionDeclaration()
        case "let":
          return this.parseLetStatement()
        case "return":
          return this.parseReturnStatement()
        default:
          break
      }
    }

    const expr = this.parseExpression()
    this.expectSymbol(";")
    return expressionStatement(expr)
  }

  private parseMatchDeclaration() {
    const start = this.mark()
    this.expectKeyword("match")
    const path = this.parsePathPattern()
    const body = this.parseBlockStatement()
    return matchDeclaration(path, body, this.loc(start))
  }

  private parsePathPattern() {
    const start = this.mark()
    const segments: PathSegmentNode[] = []

    this.expectSymbol("/")
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    while (true) {
      if (this.matchSymbol("{")) {
        const segStart = this.mark()
        const name = this.expect("identifier").value
        if (this.matchSymbol("=")) {
          this.expectSymbol("**")
          this.expectSymbol("}")
          segments.push(pathRecursiveSegment(name, this.loc(segStart)))
        } else {
          this.expectSymbol("}")
          segments.push(pathVariableSegment(name, this.loc(segStart)))
        }
      } else {
        const literal = this.expectOneOf(["identifier", "keyword", "number", "string"])
        segments.push(pathLiteralSegment(literal.value, this.tokenLoc(literal)))
      }

      if (!this.matchSymbol("/")) {
        break
      }
    }

    return pathPattern(segments, this.loc(start))
  }

  private parseAllowDeclaration() {
    const start = this.mark()
    this.expectKeyword("allow")
    const operations: AllowOperation[] = []

    do {
      const opToken = this.expectOneOf(["identifier", "keyword"])
      if (!AllowOperations.has(opToken.value as AllowOperation)) {
        throw new ParseError(`Unsupported allow operation '${opToken.value}'`, opToken.start)
      }
      operations.push(opToken.value as AllowOperation)
    } while (this.matchSymbol(","))

    this.expectSymbol(":")
    this.expectKeyword("if")
    const condition = this.parseExpression()
    this.expectSymbol(";")
    return allowDeclaration(operations, condition, this.loc(start))
  }

  private parseFunctionDeclaration() {
    const start = this.mark()
    this.expectKeyword("function")
    const name = this.expect("identifier").value
    this.expectSymbol("(")
    const params: string[] = []

    if (!this.matchSymbol(")")) {
      do {
        params.push(this.expect("identifier").value)
      } while (this.matchSymbol(","))
      this.expectSymbol(")")
    }

    const body = this.parseBlockStatement()
    return functionDeclaration(name, params, body, this.loc(start))
  }

  private parseLetStatement() {
    const start = this.mark()
    this.expectKeyword("let")
    const id = this.expect("identifier").value
    this.expectSymbol("=")
    const init = this.parseExpression()
    this.expectSymbol(";")
    return letStatement(id, init, this.loc(start))
  }

  private parseReturnStatement() {
    const start = this.mark()
    this.expectKeyword("return")
    const argument = this.parseExpression()
    this.expectSymbol(";")
    return returnStatement(argument, this.loc(start))
  }

  private parseExpression(): ExpressionNode {
    return this.parseConditionalExpression()
  }

  private parseConditionalExpression(): ExpressionNode {
    const start = this.mark()
    const test = this.parseBinaryExpression(1)
    if (!this.matchSymbol("?")) {
      return test
    }

    const consequent = this.parseExpression()
    this.expectSymbol(":")
    const alternate = this.parseExpression()
    return conditionalExpression(test, consequent, alternate, this.loc(start))
  }

  private parseBinaryExpression(minPrecedence: number): ExpressionNode {
    const start = this.mark()
    let left = this.parseUnaryExpression()

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    while (true) {
      const token = this.peek()
      const op = this.readBinaryOperator(token)
      if (!op) {
        break
      }

      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const precedence = Precedence[op]!
      if (precedence < minPrecedence) {
        break
      }

      this.lastEnd = token.end
      this.cursor += 1
      const right = this.parseBinaryExpression(precedence + 1)

      if (LogicalOperator.includes(op as LogicalOperator)) {
        left = logicalExpression(
          op as LogicalExpressionNode["operator"],
          left,
          right,
          this.loc(start),
        )
      } else {
        left = binaryExpression(
          op as BinaryExpressionNode["operator"],
          left,
          right,
          this.loc(start),
        )
      }
    }

    if (this.matchKeyword("is")) {
      const typeToken = this.expectOneOf(["identifier", "keyword"])
      const typeName = typeToken.value
      if (!FirestoreTypeName.includes(typeName as FirestoreTypeName)) {
        throw new ParseError(`Unsupported Firestore type '${typeName}'`, typeToken.start)
      }
      left = isExpression(left, typeName as FirestoreTypeName, this.loc(start))
    }

    return left
  }

  private parseUnaryExpression(): ExpressionNode {
    const token = this.peek()
    if (token.type === "symbol" && UnaryOperator.includes(token.value as UnaryOperator)) {
      const start = token.start
      this.lastEnd = token.end
      this.cursor += 1
      return unaryExpression(
        token.value as UnaryOperator,
        this.parseUnaryExpression(),
        this.loc(start),
      )
    }

    return this.parsePostfixExpression()
  }

  private parsePostfixExpression(): ExpressionNode {
    const start = this.mark()
    let expr = this.parsePrimaryExpression()

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    while (true) {
      if (this.matchSymbol(".")) {
        const propToken = this.expect("identifier")
        expr = memberExpression(
          expr,
          identifier(propToken.value, this.tokenLoc(propToken)),
          this.loc(start),
        )
        continue
      }

      if (this.matchSymbol("(")) {
        const args: ExpressionNode[] = []
        if (!this.matchSymbol(")")) {
          do {
            args.push(this.parseExpression())
          } while (this.matchSymbol(","))
          this.expectSymbol(")")
        }
        expr = callExpression(expr, args, this.loc(start))
        continue
      }

      if (this.matchSymbol("[")) {
        const idx = this.parseExpression()
        this.expectSymbol("]")
        expr = indexExpression(expr, idx, this.loc(start))
        continue
      }

      break
    }

    return expr
  }

  private parsePrimaryExpression(): ExpressionNode {
    const token = this.peek()

    if (token.type === "identifier") {
      this.lastEnd = token.end
      this.cursor += 1
      return identifier(token.value, this.tokenLoc(token))
    }

    if (token.type === "keyword") {
      this.lastEnd = token.end
      this.cursor += 1
      if (token.value === "true") {
        return booleanLiteral(true, this.tokenLoc(token))
      }
      if (token.value === "false") {
        return booleanLiteral(false, this.tokenLoc(token))
      }
      if (token.value === "null") {
        return nullLiteral(this.tokenLoc(token))
      }
      return identifier(token.value, this.tokenLoc(token))
    }

    if (token.type === "number") {
      this.lastEnd = token.end
      this.cursor += 1
      return numberLiteral(Number(token.value), this.tokenLoc(token))
    }

    if (token.type === "string") {
      this.lastEnd = token.end
      this.cursor += 1
      return stringLiteral(token.value, this.tokenLoc(token))
    }

    if (this.matchSymbol("(")) {
      const expr = this.parseExpression()
      this.expectSymbol(")")
      return expr
    }

    if (this.matchSymbol("[")) {
      const listStart = this.mark()
      const elements: ExpressionNode[] = []
      if (!this.matchSymbol("]")) {
        do {
          elements.push(this.parseExpression())
        } while (this.matchSymbol(","))
        this.expectSymbol("]")
      }
      return listLiteral(elements, this.loc(listStart))
    }

    if (this.matchSymbol("{")) {
      const mapStart = this.mark()
      const entries = []
      if (!this.matchSymbol("}")) {
        do {
          const entryStart = this.mark()
          const keyToken = this.expectOneOf(["identifier", "string"])
          const key: IdentifierNode | ReturnType<typeof stringLiteral> =
            keyToken.type === "identifier"
              ? identifier(keyToken.value, this.tokenLoc(keyToken))
              : stringLiteral(keyToken.value, this.tokenLoc(keyToken))
          this.expectSymbol(":")
          entries.push(mapEntry(key, this.parseExpression(), this.loc(entryStart)))
        } while (this.matchSymbol(","))
        this.expectSymbol("}")
      }
      return mapLiteral(entries, this.loc(mapStart))
    }

    throw new ParseError(`Unexpected token '${token.value}'`, token.start)
  }

  private parseDottedIdentifier(): string {
    const first = this.expectOneOf(["identifier", "keyword"]).value
    const parts = [first]
    while (this.matchSymbol(".")) {
      parts.push(this.expectOneOf(["identifier", "keyword"]).value)
    }
    return parts.join(".")
  }

  private collectComments(): CommentNode[] {
    const comments: CommentNode[] = []
    while (this.peek().type === "comment") {
      const token = this.peek()
      this.lastEnd = token.end
      this.cursor += 1
      comments.push(comment(token.value, this.tokenLoc(token)))
    }
    return comments
  }

  private consumeCommentsIntoPending(): void {
    this.pendingComments.push(...this.collectComments())
  }

  private drainPendingComments(): CommentNode[] {
    const values = this.pendingComments
    this.pendingComments = []
    return values
  }

  private readBinaryOperator(token: Token): string | null {
    if (token.type === "symbol" && BinaryOperator.includes(token.value as BinaryOperator)) {
      return token.value
    }

    if (token.type === "symbol" && LogicalOperator.includes(token.value as LogicalOperator)) {
      return token.value
    }

    if ((token.type === "identifier" || token.type === "keyword") && token.value === "in") {
      return "in"
    }

    return null
  }

  private expect(type: TokenType): Token {
    this.consumeCommentsIntoPending()
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const token = this.tokens[this.cursor]!
    if (token.type !== type) {
      throw new ParseError(`Expected token type '${type}', received '${token.type}'`, token.start)
    }
    this.lastEnd = token.end
    this.cursor += 1
    return token
  }

  private expectOneOf(types: TokenType[]): Token {
    this.consumeCommentsIntoPending()
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const token = this.tokens[this.cursor]!
    if (!types.includes(token.type)) {
      throw new ParseError(
        `Expected one of ${types.join(", ")}, received '${token.type}'`,
        token.start,
      )
    }
    this.lastEnd = token.end
    this.cursor += 1
    return token
  }

  private expectKeyword(value: string): Token {
    this.consumeCommentsIntoPending()
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const token = this.tokens[this.cursor]!
    if (token.type !== "keyword" || token.value !== value) {
      throw new ParseError(`Expected keyword '${value}', received '${token.value}'`, token.start)
    }
    this.lastEnd = token.end
    this.cursor += 1
    return token
  }

  private expectSymbol(value: string): Token {
    this.consumeCommentsIntoPending()
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const token = this.tokens[this.cursor]!
    if (token.type !== "symbol" || token.value !== value) {
      throw new ParseError(`Expected symbol '${value}', received '${token.value}'`, token.start)
    }
    this.lastEnd = token.end
    this.cursor += 1
    return token
  }

  private matchKeyword(value: string): boolean {
    this.consumeCommentsIntoPending()
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const token = this.tokens[this.cursor]!
    if (token.type === "keyword" && token.value === value) {
      this.lastEnd = token.end
      this.cursor += 1
      return true
    }
    return false
  }

  private matchSymbol(value: string): boolean {
    this.consumeCommentsIntoPending()
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const token = this.tokens[this.cursor]!
    if (token.type === "symbol" && token.value === value) {
      this.lastEnd = token.end
      this.cursor += 1
      return true
    }
    return false
  }

  private peek(): Token {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return this.tokens[this.cursor]!
  }
}

/**
 * Parses a full Firestore rules source string into a program AST.
 */
export function parseRules(source: string, options: ParseOptions = {}): ProgramNode {
  const tokenizer = new Tokenizer(source)
  const tokens = tokenizer.tokenize()
  const lineMap = options.includeLocation ? new LineMap(source) : undefined
  const parser = new Parser(tokens, lineMap)
  return parser.parseProgram()
}

/**
 * Parses a standalone expression source string into an expression AST node.
 */
export function parseExpressionFromSource(source: string): ExpressionNode {
  const tokens = new Tokenizer(source).tokenize()
  const parser = new Parser(tokens)
  return parser.parseStandaloneExpression()
}
