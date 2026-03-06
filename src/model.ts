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
  source: string
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

function build(provider: RequestyProvider, item: RequestyModel) {
  const match = provider.models[item.id] ?? seed(provider)

  return {
    ...match,
    id: item.id,
    providerID: provider.id,
    api: {
      id: item.id,
      url: match.api.url,
      npm: match.api.npm,
    },
    name: item.name ?? match.name ?? item.id,
    family: item.family ?? match.family,
    capabilities: capabilities(match, item),
    cost: cost(match, item),
    limit: limit(match, item),
    status: "active",
    options: provider.models[item.id] ? match.options : {},
    headers: provider.models[item.id] ? match.headers : {},
    release_date: match.release_date || date(item.created) || "",
    variants: provider.models[item.id] ? match.variants ?? {} : {},
  } satisfies RequestyRuntimeModel
}

export function buildModels(provider: RequestyProvider, models: RequestyModel[]) {
  const next = Object.fromEntries(models.map((item) => [item.id, build(provider, item)]))
  provider.models = next
  return next
}
