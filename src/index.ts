/**
 * Minimal public API for defining Firestore rules.
 *
 * Re-exports the core builder factory, essential database/helper types, and the
 * library authoring API. The `testing`, `typesaurus`, `ast`, and `builder`
 * scopes are intentionally excluded — import those explicitly when needed.
 */

export {
  createAstRulesBuilder,
  type FirestoreAstRulesBuilder,
  type RuleConditionInput,
  type RulesBuilderOptions,
} from "./builder/rules-builder"

export type { BuilderContext, PublicExpression, RuleValue } from "./builder/context"

export type {
  CollectionShape,
  CustomClaimsOf,
  CustomClaimsShape,
  DatabaseDefinition,
  DocumentShape,
} from "./builder/db"

export type {
  ArgsHelperConfig,
  BuilderHelperApi as BuilderHelperAPI,
  BuilderHelpersFactory,
  HelperDefinitionConfig,
  HelperFunction,
  HelperLibrary,
  RegisterContextHelper,
  TypedArgDescriptor,
  ZeroArgHelperConfig,
} from "./builder/helpers"

export { arg } from "./builder/helpers"

export { defineFirestoreRulesLibrary, type FirestoreRulesLibrary } from "./library/index"
