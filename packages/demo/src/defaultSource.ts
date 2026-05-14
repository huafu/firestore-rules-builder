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

function buildRules() {
  const authHelpers = defineFirestoreRulesLibrary(($, register) => {
    const isSignedIn = register("isSignedIn", [], ($) => {
      return $.request.auth.neq(null)
    })

    const isOwner = register("isOwner", ["ownerId"], ($, { ownerId }) => {
      return $.request.auth.uid.eq(ownerId)
    })

    return { isSignedIn, isOwner }
  })

  const builder = createAstRulesBuilder<AppDb>()
    .withHelpers(authHelpers)
    .withHelpers(($, register) => {
      const isAdmin = register("isAdmin", [], ($) => $.and(
        $.hasPath($.request, "auth.token"),
        $.request.auth.token.admin.eq(true),
      ))
      const canRead = register("canRead", ["ownerId"], ($, arg) => $.or(
        isAdmin(),
        $.isOwner(arg.ownerId)
      ))

      return { isAdmin, canRead }
    })

  builder.matches((match) => {
    match("users/{userId}", (users, $) => {
      users.allow(["get", "list"], $.and($.isSignedIn(), $.canRead($.params.userId)))
      users.allow("create", $.and($.isSignedIn(), $.request.resource.data.email.split("@").size().eq(2)))
      users.allow("update", $.isOwner($.resource.id))
    })
  })

  return builder
}
`
