import { describe, expect, it } from "vitest"

import {
  createAstRulesBuilder,
  defineFirestoreRulesLibrary,
  type CollectionShape,
  type DatabaseDefinition,
} from "./index"
import ts from "typescript"
import { readFileSync } from "node:fs"
import path from "node:path"

function loadDemoDefaultSource(): string {
  const demoSourcePath = path.resolve(process.cwd(), "packages/demo/src/defaultSource.ts")
  const fileContent = readFileSync(demoSourcePath, "utf8")
  const match = fileContent.match(/export const defaultSource = `([\s\S]*)`\s*$/)

  if (!match || !match[1]) {
    throw new Error("Unable to parse defaultSource from packages/demo/src/defaultSource.ts")
  }

  return match[1]
}

describe("root barrel real-world integration", () => {
  it("renders rules from the playground default source", () => {
    const defaultSource = loadDemoDefaultSource()
    const sourceForExecution = defaultSource.replace(
      /^\s*import\s+\{[^}]*\}\s+from\s+["']firestore-rules-dsl["'];?\s*$/gm,
      "",
    )

    const transpiled = ts.transpileModule(sourceForExecution, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
        ignoreDeprecations: "6.0",
        strict: true,
      },
      reportDiagnostics: true,
    })

    expect(transpiled.diagnostics?.length ?? 0).toBe(0)

    // Required to execute the imported playground source in test runtime.
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const runBuildRules = new Function(
      "createAstRulesBuilder",
      "defineFirestoreRulesLibrary",
      `${transpiled.outputText}\nif (typeof buildRules !== "function") { throw new Error("Please define function buildRules() { ... }") }\nreturn buildRules();`,
    ) as (
      createAstRulesBuilderRef: typeof createAstRulesBuilder,
      defineFirestoreRulesLibraryRef: typeof defineFirestoreRulesLibrary,
    ) => unknown

    const result = runBuildRules(createAstRulesBuilder, defineFirestoreRulesLibrary)
    const renderedSource =
      typeof result === "string" ? result : (result as { toString: () => string }).toString()

    expect(renderedSource).toMatchSnapshot()
  })

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
      const isOwner = register("isOwner", ["ownerId"], ({ ownerId }) => {
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
        const isMemberOfOrg = register("isMemberOfOrg", ["orgId"], ({ orgId }) => {
          return ctx.request.auth.token.orgId.eq(orgId)
        })
        const notExpired = register("notExpired", ["expiresAt"], ({ expiresAt }) => {
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
