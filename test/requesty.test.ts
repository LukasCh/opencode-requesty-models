import { describe, expect, test } from "bun:test"
import { RequestyModelsPlugin, requesty } from "../src/requesty.ts"
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

    const result = await hook.loader?.(async () => ({ type: "api", key: "rq_test" }), state)

    expect(Object.keys(state.models)).toEqual(["deepseek/deepseek-chat", "zai/GLM-4.5"])
    expect(result?.models).toBe(state.models)
  })

  test("rebuilds provider models from the public catalog without auth", async () => {
    let headers: Headers | undefined
    const hook = requesty({
      fetch: async (_input, init) => {
        headers = new Headers(init?.headers)
        return liveResponse()
      },
      cache: emptyCache,
    })
    const state = provider()

    const result = await hook.loader?.(async () => {
      throw new Error("no saved auth")
    }, state)

    expect(headers?.get("Authorization")).toBeNull()
    expect(Object.keys(state.models)).toEqual(["deepseek/deepseek-chat", "zai/GLM-4.5"])
    expect(result?.models).toBe(state.models)
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

    const result = await hook.loader?.(async () => ({ type: "api", key: "rq_test" }), state)

    expect(Object.keys(state.models)).toEqual(["zai/GLM-4.5"])
    expect(result?.models).toBe(state.models)
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

describe("requesty usage command", () => {
  test("registers the usage command", async () => {
    const hooks = await RequestyModelsPlugin({
      client: {
        app: {
          log: async () => undefined,
        },
      },
    } as never)
    const cfg: { command?: Record<string, unknown> } = {}

    await hooks.config?.(cfg as never)

    expect(cfg.command?.["requesty-usage"]).toEqual({
      description: "Show Requesty monthly spend and limit",
      template: "/requesty-usage",
    })
  })

  test("injects current usage without requesting an LLM reply", async () => {
    const originalFetch = globalThis.fetch
    const originalKey = process.env.REQUESTY_API_KEY
    let authorization: string | null = null
    let accept: string | null = null
    let url = ""
    let prompt: unknown
    process.env.REQUESTY_API_KEY = "rq_test"
    globalThis.fetch = (async (input, init) => {
      url = String(input)
      const headers = new Headers(init?.headers)
      authorization = headers.get("Authorization")
      accept = headers.get("Accept")
      return new Response(
        JSON.stringify({
          data: {
            api_key: {
              id: "00000000-0000-0000-0000-000000000000",
              name: "Test key",
              logging: true,
              monthly_spend: "12.34",
              monthly_limit: "50",
              permissions: {
                manage: "read",
                completions: "write",
              },
            },
          },
        }),
        {
          headers: {
            "Content-Type": "application/json",
          },
        },
      )
    }) as typeof fetch

    try {
      const hooks = await RequestyModelsPlugin({
        client: {
          session: {
            prompt: async (input: unknown) => {
              prompt = input
            },
          },
          app: {
            log: async () => undefined,
          },
        },
      } as never)

      await expect(
        hooks["command.execute.before"]?.({
          command: "requesty-usage",
          sessionID: "session",
          arguments: "",
        }),
      ).rejects.toThrow("__REQUESTY_USAGE_COMMAND_HANDLED__")

      expect(url).toBe("https://api-v2.requesty.ai/v1/manage/apikey/self")
      expect(authorization).toBe("Bearer rq_test")
      expect(accept).toBe("application/json")
      expect(prompt).toEqual({
        path: { id: "session" },
        body: {
          noReply: true,
          parts: [
            {
              type: "text",
              text: [
                "Requesty API key usage",
                "",
                "Key: Test key",
                "Monthly spend: $12.34",
                "Monthly limit: $50.00",
                "Remaining: $37.66",
                "Used: 24.7%",
              ].join("\n"),
              ignored: true,
            },
          ],
        },
      })
    } finally {
      globalThis.fetch = originalFetch
      if (originalKey === undefined) delete process.env.REQUESTY_API_KEY
      else process.env.REQUESTY_API_KEY = originalKey
    }
  })
})
