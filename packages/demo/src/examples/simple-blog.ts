import * as dsl from "firestore-rules-dsl"

type Post = {
  title: string
  body: string
  authorId: string
  published: boolean
  createdAt: Date
}

type Comment = {
  text: string
  authorId: string
  createdAt: Date
}

type BlogDb = dsl.DatabaseDefinition<{
  posts: dsl.CollectionShape<Post, { comments: dsl.CollectionShape<Comment> }>
}>

export default dsl.createAstRulesBuilder<BlogDb>()
  .withHelpers(($, { def, arg }) => ({
    isSignedIn: def(
      "isSignedIn",
      { body: () => $.hasPath($.request, "auth.uid") }
    ),
    isOwner: def(
      "isOwner",
      {
        args: [arg("authorId")<string>()],
        body: (args) => $.request.auth.uid.eq(args.authorId),
      }
    ),
  }))
  .matches((match) => {
    match("posts/{postId}", ({ allow, matches }, $) => {
      // Anyone can read published posts
      allow("read", $.resource.data.published.eq(true))

      // Only signed-in users can create posts
      allow(
        "create",
        $.and(
          $.isSignedIn(),
          $.request.resource.data.authorId.eq($.request.auth.uid),
        )
      )

      // Only the author can update or delete
      allow(["update", "delete"], $.isOwner($.resource.data.authorId))

      // Comments sub-collection
      matches((match) => {
        match("comments/{commentId}", ({ allow }, $) => {
          allow("read", true)
          allow(
            "create",
            $.and(
              $.isSignedIn(),
              $.isOwner($.request.resource.data.authorId),
            )
          )
        })
      })
    })
  })
