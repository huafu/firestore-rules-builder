export const defaultSource = `import * as dsl from "firestore-rules-dsl"

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

type AppDb = dsl.DatabaseDefinition<{
    users: dsl.CollectionShape<User, { notifications: Notification }>
  },
  AppClaims
>

export default dsl.createAstRulesBuilder<AppDb>()
  .withHelpers(($, { def, arg }) => ({
    isSignedIn: def(
      "isSignedIn",
      { body: () => $.hasPath($.request, "auth.uid") }
    ),
    hasRole: def(
      "hasRole",
      {
        args: [arg("role")<string>()],
        lets: () => ({
          roles: $.ifElse(
            $.hasPath($.request, "auth.token.roles"),
            $.request.auth.token.roles.split(","),
            [],
          ),
        }),
        body: (args, lets) => lets.roles.hasAny([args.role]),
      }
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
