import { describe, expect, it } from "vitest"

import { identifier, listLiteral, stringLiteral } from "./factories"
import {
  addedKeys,
  affectedKeys,
  and,
  changedKeys,
  callMethod,
  concatLists,
  diffMap,
  durationAbs,
  durationTime,
  durationValue,
  exists,
  existsMethod,
  get,
  getAfter,
  hasAll,
  hasAny,
  hasOnly,
  joinList,
  keysOf,
  or,
  requestAuthTokenClaim,
  requestAuthUid,
  requestMethod,
  requestPath,
  requestQueryLimit,
  requestQueryOffset,
  requestQueryOrderBy,
  requestResourceDataField,
  requestTime,
  removeAll,
  removedKeys,
  resourceDataField,
  resourceId,
  sizeOf,
  toSet,
  unchangedKeys,
} from "./known-factories"
import { printNode } from "./printer"

describe("known factories", () => {
  it("builds logical chains", () => {
    const expr = and([identifier("a"), identifier("b"), identifier("c")])
    expect(printNode(expr)).toBe("a && b && c")

    const alt = or([identifier("x"), identifier("y")])
    expect(printNode(alt)).toBe("x || y")
  })

  it("builds request and resource shortcuts", () => {
    expect(printNode(requestAuthUid())).toBe("request.auth.uid")
    expect(printNode(requestTime())).toBe("request.time")
    expect(printNode(requestResourceDataField("ownerId"))).toBe("request.resource.data.ownerId")
    expect(printNode(requestResourceDataField("meta.owner.id"))).toBe(
      "request.resource.data.meta.owner.id",
    )
    expect(printNode(requestResourceDataField(["meta", "owner", "id"]))).toBe(
      "request.resource.data.meta.owner.id",
    )
    expect(printNode(resourceDataField("status"))).toBe("resource.data.status")
    expect(printNode(resourceDataField([identifier("meta"), identifier("status")]))).toBe(
      "resource.data.meta.status",
    )
    expect(printNode(resourceId())).toBe("resource.id")
    expect(printNode(requestAuthTokenClaim("admin"))).toBe("request.auth.token.admin")
    expect(printNode(requestMethod())).toBe("request.method")
    expect(printNode(requestPath())).toBe("request.path")
    expect(printNode(requestQueryLimit())).toBe("request.query.limit")
    expect(printNode(requestQueryOffset())).toBe("request.query.offset")
    expect(printNode(requestQueryOrderBy())).toBe("request.query.orderBy")
  })

  it("builds known helper and method calls", () => {
    expect(printNode(durationValue(5, "m"))).toBe("duration.value(5, 'm')")
    expect(printNode(durationAbs(durationValue(5, "m")))).toBe(
      "duration.abs(duration.value(5, 'm'))",
    )
    expect(printNode(durationTime(1, 2, 3, 4))).toBe("duration.time(1, 2, 3, 4)")
    expect(printNode(exists("users/alice"))).toBe("exists('users/alice')")
    expect(printNode(get("users/alice"))).toBe("get('users/alice')")
    expect(printNode(getAfter("users/alice"))).toBe("getAfter('users/alice')")

    const data = identifier("data")
    expect(printNode(keysOf(data))).toBe("data.keys()")
    expect(printNode(existsMethod(data))).toBe("data.exists()")
    expect(printNode(sizeOf(data))).toBe("data.size()")
    expect(printNode(callMethod(data, "diff", [identifier("other")]))).toBe("data.diff(other)")
  })

  it("builds hasOnly and hasAll wrappers", () => {
    const keys = keysOf(identifier("resourceData"))
    const allowed = listLiteral([stringLiteral("title"), stringLiteral("updatedAt")])
    const required = listLiteral([stringLiteral("title")])
    const optional = listLiteral([stringLiteral("ownerId")])

    expect(printNode(hasOnly(keys, allowed))).toBe(
      "resourceData.keys().hasOnly(['title', 'updatedAt'])",
    )
    expect(printNode(hasAll(keys, required))).toBe("resourceData.keys().hasAll(['title'])")
    expect(printNode(hasAny(keys, optional))).toBe("resourceData.keys().hasAny(['ownerId'])")
  })

  it("builds list and map diff wrappers", () => {
    const list = identifier("list")
    const listB = identifier("listB")
    const mapA = identifier("mapA")
    const mapB = identifier("mapB")
    const diff = diffMap(mapA, mapB)

    expect(printNode(toSet(list))).toBe("list.toSet()")
    expect(printNode(concatLists(list, listB))).toBe("list.concat(listB)")
    expect(printNode(removeAll(list, listB))).toBe("list.removeAll(listB)")
    expect(printNode(joinList(list, ","))).toBe("list.join(',')")

    expect(printNode(diff)).toBe("mapA.diff(mapB)")
    expect(printNode(addedKeys(diff))).toBe("mapA.diff(mapB).addedKeys()")
    expect(printNode(removedKeys(diff))).toBe("mapA.diff(mapB).removedKeys()")
    expect(printNode(changedKeys(diff))).toBe("mapA.diff(mapB).changedKeys()")
    expect(printNode(affectedKeys(diff))).toBe("mapA.diff(mapB).affectedKeys()")
    expect(printNode(unchangedKeys(diff))).toBe("mapA.diff(mapB).unchangedKeys()")
  })

  it("rejects empty logical helpers", () => {
    expect(() => and([])).toThrow("Cannot build logical '&&' expression without operands")
    expect(() => or([])).toThrow("Cannot build logical '||' expression without operands")
  })
})
