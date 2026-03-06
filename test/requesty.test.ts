import { describe, expect, test } from "bun:test"
import { requesty } from "../src/requesty.ts"
import { payload, provider } from "./fixture.ts"

describe("requesty auth hook", () => {
  test("stores api keys through the plugin auth method", async () => {
    const hook = requesty()
    const method = hook.methods[0]

    if (method.type !== "api" || !method.authorize) throw new Error("missing api authorize")

    await expect(method.authorize({ key: "rq_test" })).resolves.toEqual({
      type: "success",
      key: "rq_test",
    })
  })

  test("rebuilds provider models from the live catalog", async () => {
    const hook = requesty({
      fetch: async () =>
        new Response(JSON.stringify(payload), {
          headers: {
            "Content-Type": "application/json",
          },
        }),
    })
    const state = provider()

    await hook.loader?.(async () => ({ type: "api", key: "rq_test" }), state)

    expect(Object.keys(state.models)).toEqual(["deepseek/deepseek-chat", "zai/GLM-4.5"])
  })

  test("keeps the seeded catalog when the live fetch fails", async () => {
    const lines: Array<{ level: string; message: string }> = []
    const hook = requesty({
      fetch: async () => new Response("boom", { status: 500 }),
      log: async (level, message) => {
        lines.push({ level, message })
      },
    })
    const state = provider()
    const seed = structuredClone(state.models)

    await hook.loader?.(async () => ({ type: "api", key: "rq_test" }), state)

    expect(state.models).toEqual(seed)
    expect(lines).toEqual([
      {
        level: "warn",
        message: "failed to refresh Requesty model catalog",
      },
    ])
  })
})
