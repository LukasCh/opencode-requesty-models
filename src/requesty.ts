import type { Hooks, Plugin, ProviderHookContext } from "@opencode-ai/plugin"
import { catalogCache, type CatalogCache } from "./cache.js"
import { fetchModels, fetchUsage, isTransientFetchError, type Fetcher, type RequestyUsage } from "./fetch.js"
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
  onKey?: (key: string) => void
}

const commandHandled = "__REQUESTY_USAGE_COMMAND_HANDLED__"

function mark(message: string) {
  console.error(`[opencode-requesty-models] ${message}`)
}

function message(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

function key(auth: ProviderHookContext["auth"]) {
  return auth?.type === "api" && auth.key ? auth.key : undefined
}

function amount(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: value < 1 && value > 0 ? 4 : 2,
    maximumFractionDigits: value < 1 && value > 0 ? 4 : 2,
  }).format(value)
}

function usageText(usage: RequestyUsage) {
  const lines = [
    "Requesty API key usage",
    "",
    `Key: ${usage.name}`,
    `Monthly spend: ${amount(usage.monthlySpend)}`,
  ]

  if (usage.monthlyLimit === 0) {
    lines.push("Monthly limit: Unlimited")
  } else {
    const remaining = Math.max(usage.monthlyLimit - usage.monthlySpend, 0)
    const percent = Math.min((usage.monthlySpend / usage.monthlyLimit) * 100, 100)
    lines.push(`Monthly limit: ${amount(usage.monthlyLimit)}`)
    lines.push(`Remaining: ${amount(remaining)}`)
    lines.push(`Used: ${percent.toFixed(1)}%`)
  }

  return lines.join("\n")
}

async function usagePrompt(apiKey: string | undefined, opts: RequestyOptions) {
  if (!apiKey) {
    return [
      "Requesty usage is unavailable because no Requesty API key is loaded.",
      "Save credentials with `opencode auth login`, choose Requesty, then run `/requesty-usage` again.",
    ].join("\n")
  }

  try {
    const usage = await fetchUsage(apiKey, {
      fetch: opts.fetch,
      timeout: opts.timeout,
    })
    return usageText(usage)
  } catch (error) {
    await opts.log?.("warn", "failed to fetch Requesty usage", {
      error: message(error),
    })
    return `Failed to fetch Requesty usage: ${message(error)}`
  }
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
  if (apiKey) opts.onKey?.(apiKey)
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
      if (apiKey) opts.onKey?.(apiKey)
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
  let usageKey = process.env.REQUESTY_API_KEY
  opts.onKey = (apiKey) => {
    usageKey = apiKey
  }

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

  async function injectRawOutput(sessionID: string, output: string) {
    await (input.client as any).session.prompt({
      path: { id: sessionID },
      body: {
        noReply: true,
        parts: [
          {
            type: "text",
            text: output,
            ignored: true,
          },
        ],
      },
    })
  }

  async function handleUsageCommand(sessionID: string): Promise<never> {
    await injectRawOutput(sessionID, await usagePrompt(usageKey, opts))
    throw new Error(commandHandled)
  }

  return {
    config(cfg) {
      cfg.command ??= {}
      cfg.command["requesty-usage"] = {
        description: "Show Requesty monthly spend and limit",
        template: "/requesty-usage",
      }
      return Promise.resolve()
    },
    auth: requesty(opts),
    provider: {
      id: "requesty",
      models(provider, ctx) {
        usageKey = key(ctx.auth) ?? usageKey
        return opts.refresh!(provider as RequestyProvider, ctx.auth)
      },
    },
    async "command.execute.before"(command) {
      if (command.command !== "requesty-usage") return
      return handleUsageCommand(command.sessionID)
    },
  }
}
