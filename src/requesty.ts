import type { Hooks, Plugin } from "@opencode-ai/plugin"
import { fetchModels } from "./fetch.js"
import { buildModels, type RequestyProvider } from "./model.js"

export type Log = (level: "debug" | "info" | "warn" | "error", message: string, extra?: Record<string, unknown>) => Promise<void>

export function requesty(opts: {
  log?: Log
  fetch?: typeof fetch
  timeout?: number
} = {}): NonNullable<Hooks["auth"]> {
  return {
    provider: "requesty",
    methods: [
      {
        type: "api",
        label: "Requesty API key",
        prompts: [
          {
            type: "text",
            key: "key",
            message: "Enter your Requesty API key",
            placeholder: "rq_...",
            validate: (value) => (value.trim() ? undefined : "Required"),
          },
        ],
        async authorize(input = {}) {
          const key = input.key?.trim()
          if (!key) return { type: "failed" as const }
          return { type: "success" as const, key }
        },
      },
    ],
    async loader(auth, provider) {
      const info = await auth()
      if (!provider?.models) return {}
      if (info.type !== "api" || !info.key) return {}

      const count = Object.keys(provider.models).length
      const live = await fetchModels(info.key, opts).catch(async (err) => {
        await opts.log?.("warn", "failed to refresh Requesty model catalog", {
          error: err instanceof Error ? err.message : String(err),
        })
        return undefined
      })

      if (!live) return {}

      const next = buildModels(provider as RequestyProvider, live)
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
