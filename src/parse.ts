export type RequestyLiveModel = {
  id: string
  api?: string
  name?: string
  family?: string
  description?: string
  created?: number
  input_price?: number
  output_price?: number
  caching_price?: number
  cached_price?: number
  context_window?: number
  max_output_tokens?: number
  supports_caching?: boolean
  supports_vision?: boolean
  supports_computer_use?: boolean
  supports_reasoning?: boolean
  supports_image_generation?: boolean
  supports_tool_calling?: boolean
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function text(value: unknown) {
  if (typeof value !== "string") return undefined
  return value.trim() || undefined
}

function num(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined
  return value
}

function flag(value: unknown) {
  if (typeof value !== "boolean") return undefined
  return value
}

function list(value: unknown) {
  if (Array.isArray(value)) return value
  if (record(value) && Array.isArray(value.data)) return value.data
  return []
}

export function parseModels(value: unknown): RequestyLiveModel[] {
  const seen = new Set<string>()

  return list(value).flatMap((item) => {
    if (!record(item)) return []

    const id = text(item.id)
    if (!id || seen.has(id)) return []
    seen.add(id)

    return [
      {
        id,
        api: text(item.api),
        name: text(item.name) ?? text(item.display_name) ?? text(item.title),
        family: text(item.family),
        description: text(item.description),
        created: num(item.created),
        input_price: num(item.input_price),
        output_price: num(item.output_price),
        caching_price: num(item.caching_price),
        cached_price: num(item.cached_price),
        context_window: num(item.context_window),
        max_output_tokens: num(item.max_output_tokens),
        supports_caching: flag(item.supports_caching),
        supports_vision: flag(item.supports_vision),
        supports_computer_use: flag(item.supports_computer_use),
        supports_reasoning: flag(item.supports_reasoning),
        supports_image_generation: flag(item.supports_image_generation),
        supports_tool_calling: flag(item.supports_tool_calling),
      },
    ]
  })
}
