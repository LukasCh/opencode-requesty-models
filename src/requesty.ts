import type { Hooks, Plugin, ProviderHookContext } from "@opencode-ai/plugin"
import { catalogCache, type CatalogCache } from "./cache.js"
import { fetchModels, isTransientFetchError, type Fetcher } from "./fetch.js"
import { buildModels, type RequestyProvider, type RequestyRuntimeModel } from "./model.js"

export type Log = (level: "debug" | "info" | "warn" | "error", message: string, extra?: Record<string, unknown>) => Promise<void>
type AuthLoader = NonNullable<NonNullable<Hooks["auth"]>["loader"]>
type AuthReader = Parameters<AuthLoader>[0]
type Refresh = (provider: RequestyProvider, auth?: ProviderHookContext["auth"]) => Promise<Record<string, RequestyRuntimeModel>>
type RequestyOptions = {
  log?: Log
  fetch?: Fetcher
  timeout?: number
  cache?: CatalogCache
  refresh?: Refresh
}

function mark(message: string) {
  console.error(`[opencode-requesty-models] ${message}`)
}

function message(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

function key(auth: ProviderHookContext["auth"]) {
  return auth?.type === "api" && auth.key ? auth.key : undefined
}

async function readKey(auth: AuthReader, log?: Log) {
  try {
    return key(await auth())
  } catch (error) {
    mark("failed to read Requesty auth; using public model catalog")
    await log?.("warn", "failed to read Requesty auth; using public model catalog", {
      error: message(error),
    })
    return undefined
  }
}

async function models(provider: RequestyProvider, opts: RequestyOptions, auth?: ProviderHookContext["auth"]) {
  const pkg = "@ai-sdk/openai-compatible"
  const cache = opts.cache ?? catalogCache
  const apiKey = key(auth)
  const cacheKey = apiKey ?? "public"

  const count = Object.keys(provider.models).length
  mark(`refreshing Requesty model catalog (${count} seeded models)`)
  let live: Awaited<ReturnType<typeof fetchModels>>

  try {
    live = await fetchModels(apiKey, {
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
        const cached = await cache.read(cacheKey)
        if (cached !== undefined) {
          const next = buildModels(provider, cached, pkg)
          mark(`failed to refresh Requesty model catalog; using cached catalog (${count} -> ${Object.keys(next).length} models)`)
          await opts.log?.("warn", "failed to refresh Requesty model catalog; using cached catalog", {
            before: count,
            after: Object.keys(next).length,
            error: message(error),
          })
          return next
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
    return provider.models
  }

  const next = buildModels(provider, live, pkg)
  await cache.write(cacheKey, live).catch(async (error) => {
    await opts.log?.("warn", "failed to cache Requesty model catalog", {
      error: message(error),
    })
  })
  mark(`refreshed Requesty model catalog (${count} -> ${Object.keys(next).length} models)`)
  await opts.log?.("debug", "refreshed Requesty model catalog", {
    before: count,
    after: Object.keys(next).length,
  })

  return next
}

export function requesty(opts: RequestyOptions = {}): NonNullable<Hooks["auth"]> {
  return {
    provider: "requesty",
    methods: [
      {
        type: "api",
        label: "API key",
      },
    ],
    async loader(auth, provider) {
      if (!provider?.models) return {}
      const apiKey = await readKey(auth, opts.log)
      const next = await (opts.refresh ?? ((input, inputAuth) => models(input, opts, inputAuth)))(
        provider as RequestyProvider,
        apiKey ? { type: "api", key: apiKey } : undefined,
      )
      return { models: next }
    },
  }
}

export const RequestyModelsPlugin: Plugin = async (input) => {
  const opts: RequestyOptions = {
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
  }
  let previous: { key: string; result: Promise<Record<string, RequestyRuntimeModel>> } | undefined

  opts.refresh = (provider, auth) => {
    const cacheKey = key(auth) ?? "public"
    if (previous?.key === cacheKey) return previous.result
    const result = models(provider, opts, auth)
    previous = { key: cacheKey, result }
    result.catch(() => {
      if (previous?.result === result) previous = undefined
    })
    return result
  }

  return {
    auth: requesty(opts),
    provider: {
      id: "requesty",
      models(provider, ctx) {
        return opts.refresh!(provider as RequestyProvider, ctx.auth)
      },
    },
  }
}
