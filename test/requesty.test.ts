import { describe, expect, test } from "bun:test"
import { requesty } from "../src/requesty.ts"
import { payload, provider } from "./fixture.ts"

const liveResponse = () =>
  new Response(JSON.stringify(payload), {
    headers: {
      "Content-Type": "application/json",
    },
  })

const emptyCache = {
  read: async () => undefined,
  write: async () => undefined,
}

describe("requesty auth hook", () => {
  test("keeps auth on the default api-key flow", async () => {
    const hook = requesty()
    const method = hook.methods[0]

    expect(method).toEqual({
      type: "api",
      label: "API key",
    })
  })

  test("rebuilds provider models from the live catalog", async () => {
    const hook = requesty({
      fetch: async () => liveResponse(),
      cache: emptyCache,
    })
    const state = provider()

    await hook.loader?.(async () => ({ type: "api", key: "rq_test" }), state)

    expect(Object.keys(state.models)).toEqual(["deepseek/deepseek-chat", "zai/GLM-4.5"])
  })

  test("retries one transient failure before succeeding", async () => {
    let calls = 0
    const writes: unknown[] = []
    const lines: Array<{ level: string; message: string }> = []
    const hook = requesty({
      fetch: async () => {
        calls += 1
        if (calls === 1) throw new TypeError("network down")
        return liveResponse()
      },
      cache: {
        read: async () => undefined,
        write: async (_key, models) => {
          writes.push(models)
        },
      },
      log: async (level, message) => {
        lines.push({ level, message })
      },
    })
    const state = provider()

    await hook.loader?.(async () => ({ type: "api", key: "rq_test" }), state)

    expect(calls).toBe(2)
    expect(Object.keys(state.models)).toEqual(["deepseek/deepseek-chat", "zai/GLM-4.5"])
    expect(writes).toHaveLength(1)
    expect(lines).toContainEqual({
      level: "warn",
      message: "retrying Requesty model catalog refresh",
    })
  })

  test("uses the cached catalog when transient refresh failures persist", async () => {
    const lines: Array<{ level: string; message: string }> = []
    const hook = requesty({
      fetch: async () => {
        throw new TypeError("network down")
      },
      cache: {
        read: async () => [payload.data[1]],
        write: async () => undefined,
      },
      log: async (level, message) => {
        lines.push({ level, message })
      },
    })
    const state = provider()

    await hook.loader?.(async () => ({ type: "api", key: "rq_test" }), state)

    expect(Object.keys(state.models)).toEqual(["zai/GLM-4.5"])
    expect(lines).toContainEqual({
      level: "warn",
      message: "failed to refresh Requesty model catalog; using cached catalog",
    })
  })

  test("uses the cached catalog when the live response is invalid JSON", async () => {
    const lines: Array<{ level: string; message: string }> = []
    const hook = requesty({
      fetch: async () =>
        new Response("{not json", {
          headers: {
            "Content-Type": "application/json",
          },
        }),
      cache: {
        read: async () => [payload.data[1]],
        write: async () => undefined,
      },
      log: async (level, message) => {
        lines.push({ level, message })
      },
    })
    const state = provider()

    await hook.loader?.(async () => ({ type: "api", key: "rq_test" }), state)

    expect(Object.keys(state.models)).toEqual(["zai/GLM-4.5"])
    expect(lines).toContainEqual({
      level: "warn",
      message: "retrying Requesty model catalog refresh",
    })
    expect(lines).toContainEqual({
      level: "warn",
      message: "failed to refresh Requesty model catalog; using cached catalog",
    })
  })

  test("keeps the seeded catalog when the live fetch fails", async () => {
    const lines: Array<{ level: string; message: string }> = []
    const hook = requesty({
      fetch: async () => new Response("boom", { status: 500 }),
      cache: emptyCache,
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
        message: "retrying Requesty model catalog refresh",
      },
      {
        level: "warn",
        message: "failed to refresh Requesty model catalog",
      },
    ])
  })

  test("does not retry auth failures and keeps the seeded catalog", async () => {
    let calls = 0
    const hook = requesty({
      fetch: async () => {
        calls += 1
        return new Response("unauthorized", { status: 401 })
      },
      cache: {
        read: async () => [payload.data[1]],
        write: async () => undefined,
      },
    })
    const state = provider()
    const seed = structuredClone(state.models)

    await hook.loader?.(async () => ({ type: "api", key: "rq_test" }), state)

    expect(calls).toBe(1)
    expect(state.models).toEqual(seed)
  })
})
