import { parseModels } from "./parse.js"

export const requestyModelsUrl = "https://router.requesty.ai/v1/models"
export type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

type RetryHandler = (input: { attempt: number; maxAttempts: number; error: RequestyFetchError }) => Promise<void> | void

export class RequestyFetchError extends Error {
  transient: boolean
  status?: number

  constructor(message: string, opts: { transient: boolean; status?: number; cause?: unknown } = { transient: false }) {
    super(message, { cause: opts.cause })
    this.name = "RequestyFetchError"
    this.transient = opts.transient
    this.status = opts.status
  }
}

function responseRetryable(status: number) {
  return status === 408 || status === 429 || status >= 500
}

function headers(key: string | undefined): Record<string, string> {
  const result = {
    "User-Agent": "opencode-requesty-models",
  }
  if (!key) return result
  return {
    ...result,
    Authorization: `Bearer ${key}`,
  }
}

async function request(key: string | undefined, opts: { fetch?: Fetcher; timeout?: number } = {}) {
  const res = await (opts.fetch ?? fetch)(requestyModelsUrl, {
    headers: headers(key),
    signal: AbortSignal.timeout(opts.timeout ?? 5000),
  })

  if (!res.ok) {
    const body = (await res.text()).trim().slice(0, 300)
    throw new RequestyFetchError(
      body
        ? `Requesty models request failed with ${res.status}: ${body}`
        : `Requesty models request failed with ${res.status}`,
      {
        transient: responseRetryable(res.status),
        status: res.status,
      },
    )
  }

  try {
    return parseModels(await res.json())
  } catch (error) {
    throw new RequestyFetchError("Requesty models response was not valid JSON", {
      transient: true,
      cause: error,
    })
  }
}

function normalizeError(error: unknown) {
  if (error instanceof RequestyFetchError) return error
  if (error instanceof TypeError || (error instanceof Error && ["AbortError", "TimeoutError"].includes(error.name))) {
    return new RequestyFetchError(error.message, {
      transient: true,
      cause: error,
    })
  }
  if (error instanceof Error) {
    return new RequestyFetchError(error.message, {
      transient: false,
      cause: error,
    })
  }
  return new RequestyFetchError(String(error), { transient: false })
}

export function isTransientFetchError(error: unknown): error is RequestyFetchError {
  return error instanceof RequestyFetchError && error.transient
}

export async function fetchModels(
  key?: string,
  opts: { fetch?: Fetcher; timeout?: number; attempts?: number; onRetry?: RetryHandler } = {},
) {
  const maxAttempts = Math.max(1, opts.attempts ?? 2)

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await request(key, opts)
    } catch (error) {
      const failure = normalizeError(error)
      if (!failure.transient || attempt >= maxAttempts) throw failure
      await opts.onRetry?.({ attempt, maxAttempts, error: failure })
    }
  }

  throw new RequestyFetchError("Requesty models request failed", { transient: false })
}
