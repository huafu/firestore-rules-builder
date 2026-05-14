import { describe, expect, it } from "vitest"

import {
  createAstRulesBuilder,
  defineFirestoreRulesLibrary,
  type CollectionShape,
  type DatabaseDefinition,
} from "./index"

describe("root barrel real-world integration", () => {
  it("comprehensive rules using all context helpers and methods", () => {
    type UserDoc = {
      displayName: string
      email: string
      createdAt: number
      tags: string[]
      metadata: Record<string, unknown>
    }

    type OrgDoc = {
      name: string
      ownerId: string
      members: string[]
      plan: "free" | "pro" | "enterprise"
      quota: { projects: number }
      created: number
      updated: number
    }

    type ProjectDoc = {
      name: string
      ownerId: string
      public: boolean
      status: "active" | "archived"
    }

    type InviteDoc = {
      email: string
      role: string
      expiresAt: number
      createdBy: string
    }

    type AppClaims = {
      admin: boolean
      orgId: string
      roles: string
    }

    type AppDb = DatabaseDefinition<
      {
        users: CollectionShape<UserDoc>
        orgs: CollectionShape<
          OrgDoc,
          {
            projects: CollectionShape<ProjectDoc>
            invites: CollectionShape<InviteDoc>
          }
        >
      },
      AppClaims
    >

    const authHelpers = defineFirestoreRulesLibrary((ctx, register) => {
      const isSignedIn = register("isSignedIn", [], () =>
        ctx.and(ctx.request.auth.neq(null), ctx.request.auth.uid.neq(null)),
      )
      const isOwner = register("isOwner", ["ownerId"], (_helperCtx, { ownerId }) => {
        return ctx.request.auth.uid.eq(ownerId)
      })
      return { isSignedIn, isOwner }
    })

    const builder = createAstRulesBuilder<AppDb>()
      .withHelpers(authHelpers)
      .withHelpers((ctx, register) => {
        const isAdmin = register("isAdmin", [], () => {
          return ctx.request.auth.token.admin.eq(true)
        })
        const isMemberOfOrg = register("isMemberOfOrg", ["orgId"], (_helperCtx, { orgId }) => {
          return ctx.request.auth.token.orgId.eq(orgId)
        })
        const notExpired = register("notExpired", ["expiresAt"], (_helperCtx, { expiresAt }) => {
          return ctx.request.time.lt(expiresAt)
        })
        const listRoles = register("listRoles", [], () => {
          return ctx.ifElse(
            ctx.hasPath(ctx.request, "auth.token.roles"),
            ctx.request.auth.token.roles.split(","),
            [],
          )
        })
        const hasRoles = register("hasRoles", [], () => {
          return listRoles().size().gt(0)
        })
        const canReadByMethod = register("canReadByMethod", [], () => {
          return ctx.switchCase(
            ctx.request.method,
            [
              ["get", true],
              ["list", true],
              ["read", true],
            ],
            false,
          )
        })
        return { isAdmin, isMemberOfOrg, notExpired, listRoles, hasRoles, canReadByMethod }
      })

    builder.matches((match) => {
      // User documents: use $.request, $.resource, $.params, $.exists, $.get, arithmetic
      match("users/{userId}", (users, $) => {
        users.allow(
          "read",
          $.and(
            $.canReadByMethod(),
            $.or($.isOwner($.params.userId), $.isSignedIn(), $.hasRoles()),
          ),
        )

        users.allow(
          "create",
          $.and(
            $.isSignedIn(),
            $.request.resource.data.createdAt.eq($.request.time),
            $.request.resource.data.email.split("@").size().eq(2),
          ),
        )

        users.allow("update", $.isOwner($.params.userId))

        users.allow("delete", $.or($.isOwner($.params.userId), $.isAdmin()))
      })

      // Orgs: use $.getAfter, logical operators, nested collections
      match("orgs/{orgId}", (orgs, $) => {
        orgs.allow("read", $.isMemberOfOrg($.params.orgId))

        orgs.allow(
          "create",
          $.and(
            $.isSignedIn(),
            $.request.resource.data.ownerId.eq($.request.auth.uid),
            $.request.resource.data.plan.eq("free"),
          ),
        )

        orgs.allow("update", $.or($.isAdmin(), $.isOwner($.resource.data.ownerId)))

        orgs.allow("delete", $.isAdmin())

        // Nested projects with public access check
        orgs.matches((match) => {
          match("projects/{projectId}", (projects, $) => {
            projects.allow(
              "read",
              $.or(
                $.resource.data.public.eq(true),
                $.and($.isMemberOfOrg($.params.orgId), $.resource.data.status.eq("active")),
              ),
            )

            projects.allow(
              "create",
              $.and(
                $.isMemberOfOrg($.params.orgId),
                $.request.resource.data.ownerId.eq($.request.auth.uid),
                $.request.resource.data.status.eq("active"),
              ),
            )

            projects.allow(
              "update",
              $.or(
                $.isOwner($.resource.data.ownerId),
                $.and($.isAdmin(), $.not($.resource.data.status.eq("deleted"))),
              ),
            )

            projects.allow("delete", $.isOwner($.resource.data.ownerId))
          })
        })

        // Nested invites with time-based expiry
        orgs.matches((match) => {
          match("invites/{inviteId}", (invites, $) => {
            invites.allow(
              "read",
              $.and($.isMemberOfOrg($.params.orgId), $.notExpired($.resource.data.expiresAt)),
            )

            invites.allow(
              "create",
              $.and(
                $.isMemberOfOrg($.params.orgId),
                $.op($.request.resource.data.expiresAt, ">", $.request.time),
                $.request.resource.data.expiresAt.lte($.request.time.plus(2592000)),
              ),
            )

            invites.allow(
              "delete",
              $.and($.notExpired($.resource.data.expiresAt), $.isOwner($.resource.data.createdBy)),
            )
          })
        })
      })
    })

    const source = builder.toString()
    expect(source).toMatchSnapshot()
  })
})
