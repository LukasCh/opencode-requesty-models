import type { Hooks, Plugin } from "@opencode-ai/plugin"
import { fetchModels, type Fetcher } from "./fetch.js"
import { buildModels, type RequestyProvider } from "./model.js"

export type Log = (level: "debug" | "info" | "warn" | "error", message: string, extra?: Record<string, unknown>) => Promise<void>

function mark(message: string) {
  console.error(`[opencode-requesty-models] ${message}`)
}

export function requesty(opts: {
  log?: Log
  fetch?: Fetcher
  timeout?: number
} = {}): NonNullable<Hooks["auth"]> {
  const pkg = "@ai-sdk/openai-compatible"

  return {
    provider: "requesty",
    methods: [
      {
        type: "api",
        label: "API key",
      },
    ],
    async loader(auth, provider) {
      const info = await auth()
      if (!provider?.models) return {}
      if (info.type !== "api" || !info.key) return {}

      const count = Object.keys(provider.models).length
      mark(`refreshing Requesty model catalog (${count} seeded models)`)
      const live = await fetchModels(info.key, opts).catch(async (err) => {
        mark(`failed to refresh Requesty model catalog; using seeded catalog (${count} models)`) 
        await opts.log?.("warn", "failed to refresh Requesty model catalog", {
          error: err instanceof Error ? err.message : String(err),
        })
        return undefined
      })

      if (!live) return {}

      const next = buildModels(provider as RequestyProvider, live, pkg)
      mark(`refreshed Requesty model catalog (${count} -> ${Object.keys(next).length} models)`)
      await opts.log?.("debug", "refreshed Requesty model catalog", {
        before: count,
        after: Object.keys(next).length,
      })

      return {}
    },
  }
}

export const RequestyModelsPlugin: Plugin = async (input) => ({
  auth: requesty({
    log(level, message, extra = {}) {
      return input.client.app
        .log({
          body: {
            service: "opencode-requesty-models",
            level,
            message,
            extra,
          },
        })
        .then(() => undefined)
        .catch(() => undefined)
    },
  }),
})
