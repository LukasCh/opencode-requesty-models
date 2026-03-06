import { parseModels } from "./parse.js"

export const requestyModelsUrl = "https://router.requesty.ai/v1/models"

export async function fetchModels(key: string, opts: { fetch?: typeof fetch; timeout?: number } = {}) {
  const res = await (opts.fetch ?? fetch)(requestyModelsUrl, {
    headers: {
      Authorization: `Bearer ${key}`,
      "User-Agent": "opencode-requesty-models",
    },
    signal: AbortSignal.timeout(opts.timeout ?? 5000),
  })

  if (!res.ok) throw new Error(`Requesty models request failed with ${res.status}`)

  return parseModels(await res.json())
}
