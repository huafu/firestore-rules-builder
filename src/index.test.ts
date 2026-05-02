import {
  commonFirestoreRulesHelpers,
  createFirestoreRulesBuilder,
  type DbCollection,
  type timestamp,
} from "./index"
import { describe, it, expect, beforeEach } from "vitest"

type Schema = {
  users: DbCollection<{
    name: string
    email: string
    createdAt: timestamp
    updatedAt: timestamp
  }>
  posts: DbCollection<
    {
      title: string
      content: string
      authorId: string
      createdAt: timestamp
      updatedAt: timestamp
    },
    {
      comments: DbCollection<
        {
          text: string
          commenterId: string
          createdAt: timestamp
          updatedAt: timestamp
        },
        {
          likes: DbCollection<{
            userId: string
            createdAt: timestamp
            updatedAt: timestamp
          }>
        }
      >
    }
  >
}

const createBuilder = () =>
  createFirestoreRulesBuilder<
    Schema,
    {
      authClaims: {
        admin?: boolean
      }
    }
  >()

let builder: ReturnType<typeof createBuilder>

beforeEach(() => {
  builder = createBuilder()
})

describe("createFirestoreRulesBuilder", () => {
  it("should render empty rules correctly", () => {
    expect(builder.toString()).toMatchSnapshot()
  })

  it("should render rules correctly", () => {
    builder.withHelpers(commonFirestoreRulesHelpers).sub((db) => {
      db.users.rules(($) => ({
        read: $.if($.isAuthenticated()),
        update: $.if($.isOwner($.params.userId, true)),
        delete: $.never(),
      }))
      db.posts
        .rules(($) => ({
          read: $.if($.isAuthenticated()),
          create: $.if($.isAuthenticated()),
          update: $.if(
            $.and(
              $.isOwner($.resource.data.authorId, true),
              $.hasOnlyModified(["title", "content", "updatedAt"]),
              $.isServerTime("updatedAt"),
            ),
          ),
          delete: $.if($.isOwner($.resource.data.authorId, true)),
        }))
        .sub((posts) => {
          posts.comments.rules(($) => ({
            read: $.if($.isAuthenticated()),
            create: $.if($.isAuthenticated()),
            update: $.if(
              $.and(
                $.isOwner($.resource.data.commenterId, true),
                $.hasOnlyModified(["text", "updatedAt"]),
                $.isServerTime("updatedAt"),
              ),
            ),
            delete: $.if(
              $.or($.isOwner($.resource.data.commenterId, true), $.hasClaim("admin", true)),
            ),
          }))
        })
    })
    expect(builder.toString()).toMatchSnapshot()
  })
})
