export const defaultSource = `import { createAstRulesBuilder } from "firestore-rules-dsl"
import type { DatabaseDefinition, CollectionShape } from "firestore-rules-dsl"

type User = {
  name: string
  email: string
  createdAt: Date
}

type Notification = {
  title: string
  readAt: Date
}

type AppClaims = {
  admin: boolean
  roles: string
}

type AppDb = DatabaseDefinition<{
    users: CollectionShape<User, { notifications: Notification }>
  },
  AppClaims
>

const buildRules = () => createAstRulesBuilder<AppDb>()
  .withHelpers(($, register) => ({
    isSignedIn: register(
      "isSignedIn",
      () => $.hasPath($.request, "auth.uid")
    ),
    hasRole: register(
      "hasRole",
      ["role"],
      () => ({
        roles: $.ifElse(
          $.hasPath($.request, "auth.token.roles"),
          $.request.auth.token.roles.split(","),
          [],
        ),
      }),
      (args, lets) => lets.roles.hasAny([args.role]),
    ),
  }))
  .matches((match) => {
    match("users/{userId}", ({ allow, matches }, $) => {
      // rules
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
      // sub-collection
      matches((match) => {
        match("notifications/{notificationId}", ({allow}, $) => {
          allow("create", $.hasRole("notifier"))
        })
      })
    })
  })
`
