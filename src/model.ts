import type { RequestyLiveModel } from "./parse.js"

export type RequestyRuntimeModel = {
  id: string
  providerID: string
  api: {
    id: string
    url: string
    npm: string
  }
  name: string
  family?: string
  capabilities: {
    temperature: boolean
    reasoning: boolean
    attachment: boolean
    toolcall: boolean
    input: {
      text: boolean
      audio: boolean
      image: boolean
      video: boolean
      pdf: boolean
    }
    output: {
      text: boolean
      audio: boolean
      image: boolean
      video: boolean
      pdf: boolean
    }
    interleaved: boolean | { field: "reasoning_content" | "reasoning_details" }
  }
  cost: {
    input: number
    output: number
    cache: {
      read: number
      write: number
    }
    experimentalOver200K?: {
      input: number
      output: number
      cache: {
        read: number
        write: number
      }
    }
  }
  limit: {
    context: number
    input?: number
    output: number
  }
  status: "alpha" | "beta" | "deprecated" | "active"
  options: Record<string, unknown>
  headers: Record<string, string>
  release_date: string
  variants?: Record<string, Record<string, unknown>>
}

export type RequestyProvider = {
  id: string
  name: string
  source: "env" | "config" | "custom" | "api"
  env: string[]
  key?: string
  options: Record<string, unknown>
  models: Record<string, RequestyRuntimeModel>
}

export type RequestyModel = RequestyLiveModel

function blank(providerID: string): RequestyRuntimeModel {
  return {
    id: "",
    providerID,
    api: {
      id: "",
      url: "https://router.requesty.ai/v1",
      npm: "@ai-sdk/openai-compatible",
    },
    name: "",
    capabilities: {
      temperature: true,
      reasoning: false,
      attachment: false,
      toolcall: true,
      input: {
        text: true,
        audio: false,
        image: false,
        video: false,
        pdf: false,
      },
      output: {
        text: true,
        audio: false,
        image: false,
        video: false,
        pdf: false,
      },
      interleaved: false,
    },
    cost: {
      input: 0,
      output: 0,
      cache: {
        read: 0,
        write: 0,
      },
    },
    limit: {
      context: 0,
      output: 0,
    },
    status: "active",
    options: {},
    headers: {},
    release_date: "",
    variants: {},
  }
}

function seed(provider: RequestyProvider) {
  return Object.values(provider.models)[0] ?? blank(provider.id)
}

function base(provider: RequestyProvider, source: Record<string, RequestyRuntimeModel>) {
  const model = Object.values(source)[0] ?? seed(provider)
  return {
    ...blank(provider.id),
    api: {
      id: "",
      url: model.api.url,
      npm: model.api.npm,
    },
  }
}

function npm(seed: RequestyRuntimeModel, pkg: string) {
  if (seed.api.npm === pkg) return seed.api.npm
  return pkg
}

function price(value: number | undefined) {
  if (value === undefined) return undefined
  return value * 1_000_000
}

function date(value: number | undefined) {
  if (value === undefined) return undefined
  return new Date(value * 1000).toISOString().slice(0, 10)
}

function cache(seed: RequestyRuntimeModel, item: RequestyModel) {
  return {
    read:
      price(item.cached_price) ??
      (item.supports_caching === false ? 0 : seed.cost.cache.read),
    write:
      price(item.caching_price) ??
      (item.supports_caching === false ? 0 : seed.cost.cache.write),
  }
}

function cost(seed: RequestyRuntimeModel, item: RequestyModel) {
  return {
    input: price(item.input_price) ?? seed.cost.input,
    output: price(item.output_price) ?? seed.cost.output,
    cache: cache(seed, item),
    experimentalOver200K: seed.cost.experimentalOver200K,
  }
}

function limit(seed: RequestyRuntimeModel, item: RequestyModel) {
  return {
    context: item.context_window ?? seed.limit.context,
    input: seed.limit.input,
    output: item.max_output_tokens ?? seed.limit.output,
  }
}

function capabilities(seed: RequestyRuntimeModel, item: RequestyModel) {
  const input = {
    text: true,
    audio: seed.capabilities.input.audio,
    image: item.supports_vision ?? seed.capabilities.input.image,
    video: seed.capabilities.input.video,
    pdf: seed.capabilities.input.pdf,
  }

  const output = {
    text: true,
    audio: seed.capabilities.output.audio,
    image: item.supports_image_generation ?? seed.capabilities.output.image,
    video: seed.capabilities.output.video,
    pdf: seed.capabilities.output.pdf,
  }

  return {
    temperature: seed.capabilities.temperature,
    reasoning: item.supports_reasoning ?? seed.capabilities.reasoning,
    attachment:
      input.audio ||
      input.image ||
      input.video ||
      input.pdf ||
      output.audio ||
      output.image ||
      output.video ||
      output.pdf,
    toolcall: item.supports_tool_calling ?? seed.capabilities.toolcall,
    input,
    output,
    interleaved: seed.capabilities.interleaved,
  }
}

function apiID(id: string, ids: Set<string>) {
  if (!id.startsWith("openai/")) return id
  const responseID = `openai-responses/${id.slice("openai/".length)}`
  return ids.has(responseID) ? responseID : id
}

function title(value: string) {
  return value
    .split(/[-_:]/)
    .filter(Boolean)
    .map((part) => {
      if (part === "gpt") return "GPT"
      if (/^o\d/i.test(part)) return part.toUpperCase()
      return `${part.charAt(0).toUpperCase()}${part.slice(1)}`
    })
    .join(" ")
}

function responseName(id: string, names: Map<string, string>) {
  if (!id.startsWith("openai-responses/")) return undefined
  const base = id.slice("openai-responses/".length)
  const match = names.get(`openai/${base}`)
  const name = match && match !== `openai/${base}` ? match : title(base)
  return name.endsWith(" - Responses") ? name : `${name} - Responses`
}

function openAIName(id: string) {
  if (!id.startsWith("openai/")) return undefined
  return title(id.slice("openai/".length))
}

function build(provider: RequestyProvider, source: Record<string, RequestyRuntimeModel>, item: RequestyModel, ids: Set<string>, names: Map<string, string>, pkg: string) {
  const hit = source[item.id]
  const match = hit ?? base(provider, source)

  return {
    ...match,
    id: item.id,
    providerID: provider.id,
    api: {
      id: apiID(item.id, ids),
      url: match.api.url,
      npm: npm(match, pkg),
    },
    name: item.name ?? hit?.name ?? responseName(item.id, names) ?? openAIName(item.id) ?? item.id,
    family: item.family ?? hit?.family,
    capabilities: capabilities(match, item),
    cost: cost(match, item),
    limit: limit(match, item),
    status: "active",
    options: hit ? match.options : {},
    headers: hit ? match.headers : {},
    release_date: hit?.release_date || date(item.created) || "",
    variants: hit ? match.variants ?? {} : {},
  } satisfies RequestyRuntimeModel
}

export function buildModels(provider: RequestyProvider, models: RequestyModel[], pkg: string) {
  const curr = provider.models
  const source = { ...curr }
  const ids = new Set(models.map((item) => item.id))
  const keep = new Set(models.map((item) => item.id))
  const names = new Map(Object.entries(source).map(([id, model]) => [id, model.name]))

  for (const item of models) {
    const name = item.name ?? source[item.id]?.name
    if (name) names.set(item.id, name)
  }

  for (const id of Object.keys(curr)) {
    if (!keep.has(id)) delete curr[id]
  }

  for (const item of models) {
    const next = build(provider, source, item, ids, names, pkg)
    const hit = curr[item.id]
    curr[item.id] = hit ? Object.assign(hit, next) : next
  }

  return curr
}
