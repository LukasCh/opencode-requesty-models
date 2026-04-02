import { describe, expect, test } from "bun:test"
import * as mod from "../src/index.ts"

describe("package entrypoint", () => {
  test("only exports plugin functions", () => {
    expect(Object.keys(mod).sort()).toEqual(["RequestyModelsPlugin", "default"])
    expect(mod.default).toBe(mod.RequestyModelsPlugin)
  })
})
