import { LineLength } from "./builder"
import { RuleError } from "./context"
import { operand, RuleExpression, type RuleOperand, indentFor, expr } from "./expression"
import type { FormattingOptions } from "./types"

/**
 * Signature used by builders to register reusable helper functions.
 *
 * Registered helpers render as named Firestore functions and return callable
 * wrappers that can be used inside later rule expressions.
 */
export type RegisterHelper = <const Args extends readonly string[]>(
  name: string,
  argNames: Args,
  body: (arg: { [K in Args[number]]: RuleExpression }) => RuleExpression,
) => (...args: { [Index in keyof Args]: RuleOperand }) => RuleExpression

/**
 * Internal helper metadata.
 */
interface HelperDefinition {
  /** The name of the helper function */
  name: string
  /** The function body as a RuleExpression */
  body: RuleExpression
}

/**
 * Tracks helper definitions and emits only helpers used by generated rules.
 *
 * Usage is resolved lazily during rendering so helper dependencies discovered
 * from other helper bodies are included automatically.
 */
export class HelpersRegistry {
  protected helpers = new Map<string, HelperDefinition>()
  protected usedHelpers = new Set<string>()
  protected isResolved = false

  /**
   * Resolves and returns helper names referenced by the current render pass.
   *
   * The resolution loop forces helper bodies to render so any nested helper calls
   * can mark additional dependencies before emission order is finalized.
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
          const helper = this.helpers.get(helperName)!
          RuleExpression.toString(helper.body) // generate the body to register dependencies
        }
      }
    }

    return Array.from(this.usedHelpers)
  }

  /**
   * Renders all used helper functions as Firestore rules source.
   *
   * Comments are emitted as section headers unless `stripComments` is enabled.
   */
  public toString(options?: FormattingOptions): string {
    return this.toSourceLines(options).join("\n")
  }

  /**
   * Renders all currently used helpers as source lines.
   *
   * @param options - Formatting controls forwarded to helper body rendering.
   * @returns Source lines for all used helpers, separated by blank lines.
   */
  public toSourceLines(options?: FormattingOptions): string[] {
    const indent = indentFor(options?.indentationLevel ?? 0)
    const lines: string[] = []
    for (const helperName of this.used()) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const helper = this.helpers.get(helperName)!
      if (!options?.stripComments) {
        lines.push(`${indent}// ====[ ${helperName} ]`.padEnd(LineLength, "="))
      }
      lines.push(...RuleExpression.toString(helper.body, options).split("\n"))
      lines.push("")
    }
    return lines
  }

  /**
   * Clears helper usage state before a new render pass.
   */
  public resetUsage(): void {
    this.usedHelpers.clear()
    this.isResolved = false
  }

  /**
   * Registers a helper function and returns a callable expression builder.
   *
   * Duplicate names are rejected. Recursive self-calls are also guarded at
   * runtime so helper expansion cannot loop forever while usage is being
   * resolved.
   *
   * @param name - Helper function name emitted into the generated rules file.
   * @param argNames - Positional helper argument names.
   * @param bodyFactory - Factory that builds the helper body from named args.
   * @returns A callable expression builder that records helper usage on call.
   */
  public register<Name extends string, Args extends readonly string[]>(
    name: Name,
    argNames: Args,
    bodyFactory: (arg: { [K in Args[number]]: RuleExpression }) => RuleExpression,
  ): (...args: { [Index in keyof Args]: RuleOperand }) => RuleExpression<`call:${Name}`> {
    if (this.helpers.has(name)) {
      throw new RuleError(`Helper with name "${name}" is already registered.`)
    }
    const body = expr(`helper:${name}`)((options) => {
      const bodyOptions = { ...options, indentationLevel: (options?.indentationLevel ?? 0) + 1 }
      const argObj = Object.fromEntries(
        argNames.map((argName) => [argName, expr(`arg:${argName}`)(argName)]),
      ) as {
        [K in Args[number]]: RuleExpression
      }
      // calling this will automatically register dependencies
      let body = RuleExpression.toString(bodyFactory(argObj), bodyOptions)
      if (!body.includes(";")) {
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

    return (...args: { [Index in keyof Args]: RuleOperand }): RuleExpression<`call:${Name}`> => {
      if (using) {
        throw new RuleError(`Recursive call detected in helper "${name}".`)
      }
      using = true
      const argList = argNames.map((argName, index) => {
        const argValue = args[index]
        if (argValue === undefined) {
          throw new RuleError(`Missing argument ${index} (${argName}) for helper "${name}".`)
        }
        return operand(argValue)
      })
      const call = expr(`call:${name}`)(() => `${name}(${argList.join(", ")})`)
      // Mark this helper as used after generating the call expression so that dependencies are registered before
      this.usedHelpers.add(name)
      this.isResolved = false
      using = false
      return call
    }
  }
}
