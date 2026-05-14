export const defaultSource = `import { createAstRulesBuilder, defineFirestoreRulesLibrary, DatabaseDefinition, CollectionShape } from "firestore-rules-dsl"

type UserDoc = {
  name: string
  email: string
  createdAt: Date
}

type AppClaims = {
  admin: boolean
}

type AppDb = DatabaseDefinition<{
    users: CollectionShape<UserDoc>
  },
  AppClaims
>

const buildRules = () => createAstRulesBuilder<AppDb>()
  .withHelpers(($, register) => ({
    isSignedIn: register(
      "isSignedIn",
      () => $.and(
        $.request.auth.neq(null),
        $.request.auth.uid.neq(null),
      )
    ),
  }))
  .matches((match) => {
    match("users/{userId}", ({allow}, $) => {
      allow(
        "read",
        $.and(
          $.isSignedIn(),
          $.request.auth.uid.eq($.params.userId),
        )
      )
      allow(
        ["create", "update", "delete"],
        $.request.auth.token.admin.eq(true),
      )
    })
  })
`
