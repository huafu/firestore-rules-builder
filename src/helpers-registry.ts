import { raw, operand, type RuleExpression, type RuleOperand, indentFor } from "./expression"
import type { FormattingOptions } from "./types"

/**
 * Function type for registering helper functions in a registry.
 *
 * Allows registration of custom Firestore Security Rules functions with
 * parameter binding and dependency tracking.
 *
 * @template Args - Tuple type of argument names as strings (e.g., ["userId", "role"])
 *
 * @param name - The name of the helper function
 * @param argNames - Array of parameter names for the function
 * @param body - Factory function that receives named parameters and returns the function body expression
 * @returns A callable that generates expressions calling this helper with provided arguments
 *
 * @example
 * ```typescript
 * const register = registry.register.bind(registry);
 *
 * // Register a simple function
 * const isAdmin = register("isAdmin", ["role"] as const, (a) =>
 *   ctx.eq(a.role, "admin")
 * );
 *
 * // Use it
 * isAdmin("editor") // → RuleExpression
 * ```
 */
export type RegisterHelper = <const Args extends readonly string[]>(
  name: string,
  argNames: Args,
  body: (arg: { [K in Args[number]]: RuleExpression }) => RuleExpression,
) => (...args: { [Index in keyof Args]: RuleOperand }) => RuleExpression

/**
 * Represents a helper function definition with its name and body.
 */
interface HelperDefinition {
  /** The name of the helper function */
  name: string
  /** The function body as a RuleExpression */
  body: RuleExpression
}

/**
 * Registry for managing Firestore Security Rules helper functions.
 *
 * Handles:
 * - Registration of helper functions with parameter binding
 * - Dependency tracking (which helpers are actually used in rules)
 * - Deduplication of helpers (prevents duplicate function definitions)
 * - Recursive call detection (prevents infinite loops)
 *
 * Helpers are only included in the final output if they're actually called
 * in the rules, and transitive dependencies are automatically included.
 *
 * @example
 * ```typescript
 * const registry = new HelpersRegistry();
 *
 * const isOwner = registry.register("isOwner", ["uid"] as const, (a) =>
 *   ctx.eq(ctx.request.auth.uid, a.uid)
 * );
 *
 * const canEdit = registry.register("canEdit", ["uid"] as const, (a) =>
 *   ctx.and(ctx.lib.isOwner(a.uid), ctx.isset(ctx.request.auth.token))
 * );
 *
 * // Build a rule that uses canEdit
 * // registry.toString() will include both canEdit and isOwner
 * ```
 */
export class HelpersRegistry {
  protected helpers = new Map<string, HelperDefinition>()
  protected usedHelpers = new Set<string>()
  protected isResolved = false

  /**
   * Gets the list of helper names that are actually used in the generated rules.
   *
   * Handles transitive dependencies: if helper A calls helper B, both are included.
   * Performs lazy resolution of dependencies on first call, then caches the result.
   *
   * @returns Array of helper names that should be included in the output
   */
  public used(): string[] {
    if (!this.isResolved) {
      const generated = new Set<string>()
      while (!this.isResolved) {
        this.isResolved = true
        for (const helperName of this.usedHelpers) {
          if (generated.has(helperName)) continue
          generated.add(helperName)
          // force body generation to register dependencies
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          this.helpers.get(helperName)!.body.toString()
        }
      }
    }

    return Array.from(this.usedHelpers)
  }

  /**
   * Renders all used helpers as Firestore Security Rules function definitions.
   *
   * Each function is prefixed with a comment header for readability.
   * Only helpers that are actually used in the rules are included.
   *
   * @param options - Formatting options for the output
   * @returns The formatted helper functions source code
   */
  public toString(options?: FormattingOptions): string {
    const indent = indentFor(options?.indentationLevel ?? 0)
    const lines: string[] = []
    for (const helperName of this.used()) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const helper = this.helpers.get(helperName)!
      if (!options?.stripComments) {
        lines.push(`${indent}// ====[ ${helperName} ]`.padEnd(80, "="))
      }
      lines.push(helper.body.toString(options))
      lines.push("")
    }
    return lines.join("\n")
  }

  /**
   * Clears the usage tracking and resets dependency resolution.
   *
   * Used internally to reset state when new helpers are registered.
   */
  public resetUsage(): void {
    this.usedHelpers.clear()
    this.isResolved = false
  }

  /**
   * Registers a new helper function in the registry.
   *
   * The function signature and body are lazily evaluated to support dependency tracking.
   * If a helper with the same name already exists, an error is thrown.
   * Detects and prevents recursive calls within a single helper.
   *
   * @template Args - Tuple of argument names
   *
   * @param name - The function name (must be unique)
   * @param argNames - Array of parameter names
   * @param bodyFactory - Function that generates the rule expression body
   * @returns A callable that generates expressions calling this helper
   *
   * @throws Error if a helper with this name already exists
   * @throws Error if recursive calls are detected within the helper
   * @throws Error if required arguments are missing when calling
   *
   * @example
   * ```typescript
   * const isAdmin = registry.register("isAdmin", ["userId"] as const, (a) => {
   *   return ctx.eq(ctx.request.auth.uid, a.userId);
   * });
   *
   * // Use the helper
   * const adminCheck = isAdmin(userId);
   * ```
   */
  public register<Args extends readonly string[]>(
    name: string,
    argNames: Args,
    bodyFactory: (arg: { [K in Args[number]]: RuleExpression }) => RuleExpression,
  ): (...args: { [Index in keyof Args]: RuleOperand }) => RuleExpression {
    if (this.helpers.has(name)) {
      throw new Error(`Helper with name "${name}" is already registered.`)
    }
    const body = raw((options) => {
      const bodyOptions = { ...options, indentationLevel: (options?.indentationLevel ?? 0) + 1 }
      const argObj = Object.fromEntries(argNames.map((argName) => [argName, raw(argName)])) as {
        [K in Args[number]]: RuleExpression
      }
      // calling this will automatically register dependencies
      let body = bodyFactory(argObj).toString(bodyOptions)
      if (!body.includes("\n")) {
        // For single-line bodies, we can trim and then wrap with "return" + ";" if both are missing.
        // This allows to create simple helpers with the bare minimum syntax, e.g. `register("isOwner", ["userId"], "request.auth.uid == userId")`
        body = body.trim()
        if (!body.startsWith("return ") && !body.endsWith(";")) {
          body = `return ${body};`
        }
        body = indentFor(bodyOptions.indentationLevel) + body
      }
      const indent = indentFor(options?.indentationLevel ?? 0)
      return `${indent}function ${name}(${argNames.join(", ")}) {\n${body}\n${indent}}`
    })
    const helper: HelperDefinition = { name, body }
    this.helpers.set(name, helper)

    // Detect recursive calls
    let using = false

    return (...args: { [Index in keyof Args]: RuleOperand }): RuleExpression => {
      if (using) {
        throw new Error(`Recursive call detected in helper "${name}".`)
      }
      using = true
      const argList = argNames.map((argName, index) => {
        const argValue = args[index]
        if (argValue === undefined) {
          throw new Error(`Missing argument ${index} (${argName}) for helper "${name}".`)
        }
        return operand(argValue)
      })
      const call = raw(() => `${name}(${argList.join(", ")})`)
      // Mark this helper as used after generating the call expression so that dependencies are registered before
      this.usedHelpers.add(name)
      this.isResolved = false
      using = false
      return call
    }
  }
}
