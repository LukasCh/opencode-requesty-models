import type { Hooks, Plugin } from "@opencode-ai/plugin"
import { catalogCache, type CatalogCache } from "./cache.js"
import { fetchModels, isTransientFetchError, type Fetcher } from "./fetch.js"
import { buildModels, type RequestyProvider } from "./model.js"

export type Log = (level: "debug" | "info" | "warn" | "error", message: string, extra?: Record<string, unknown>) => Promise<void>

function mark(message: string) {
  console.error(`[opencode-requesty-models] ${message}`)
}

function message(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

export function requesty(opts: {
  log?: Log
  fetch?: Fetcher
  timeout?: number
  cache?: CatalogCache
} = {}): NonNullable<Hooks["auth"]> {
  const pkg = "@ai-sdk/openai-compatible"
  const cache = opts.cache ?? catalogCache

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
      let live: Awaited<ReturnType<typeof fetchModels>>

      try {
        live = await fetchModels(info.key, {
          fetch: opts.fetch,
          timeout: opts.timeout,
          onRetry: async ({ attempt, maxAttempts, error }) => {
            mark(`refresh attempt ${attempt} of ${maxAttempts} failed; retrying Requesty model catalog`)
            await opts.log?.("warn", "retrying Requesty model catalog refresh", {
              attempt,
              maxAttempts,
              error: message(error),
            })
          },
        })
      } catch (error) {
        if (isTransientFetchError(error)) {
          try {
            const cached = await cache.read(info.key)
            if (cached !== undefined) {
              const next = buildModels(provider as RequestyProvider, cached, pkg)
              mark(`failed to refresh Requesty model catalog; using cached catalog (${count} -> ${Object.keys(next).length} models)`)
              await opts.log?.("warn", "failed to refresh Requesty model catalog; using cached catalog", {
                before: count,
                after: Object.keys(next).length,
                error: message(error),
              })
              return {}
            }
          } catch (cacheError) {
            await opts.log?.("warn", "failed to read cached Requesty model catalog", {
              error: message(cacheError),
            })
          }
        }

        mark(`failed to refresh Requesty model catalog; using seeded catalog (${count} models)`)
        await opts.log?.("warn", "failed to refresh Requesty model catalog", {
          error: message(error),
        })
        return {}
      }

      const next = buildModels(provider as RequestyProvider, live, pkg)
      await cache.write(info.key, live).catch(async (error) => {
        await opts.log?.("warn", "failed to cache Requesty model catalog", {
          error: message(error),
        })
      })
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
