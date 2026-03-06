import type { RequestyProvider } from "../src/model.ts"

export const payload = {
  object: "list",
  data: [
    {
      api: "chat",
      id: "deepseek/deepseek-chat",
      object: "model",
      created: 1738263837,
      owned_by: "system",
      input_price: 2.8e-7,
      caching_price: 4.2e-7,
      cached_price: 2.8e-8,
      output_price: 4.2e-7,
      max_output_tokens: 8000,
      context_window: 128000,
      supports_caching: true,
      supports_vision: false,
      supports_computer_use: false,
      supports_reasoning: false,
      supports_image_generation: false,
      supports_tool_calling: true,
      description: "DeepSeek-V3 sample",
    },
    {
      api: "chat",
      id: "zai/GLM-4.5",
      object: "model",
      created: 1760609788,
      owned_by: "system",
      input_price: 6e-7,
      caching_price: 6e-7,
      cached_price: 1.1e-7,
      output_price: 0.0000022,
      max_output_tokens: 98304,
      context_window: 131072,
      supports_caching: false,
      supports_vision: false,
      supports_computer_use: false,
      supports_reasoning: true,
      supports_image_generation: false,
      supports_tool_calling: true,
      description: "GLM sample",
    },
  ],
}

export function provider(): RequestyProvider {
  return {
    id: "requesty",
    name: "Requesty",
    source: "custom",
    env: ["REQUESTY_API_KEY"],
    options: {},
    models: {
      "deepseek/deepseek-chat": {
        id: "deepseek/deepseek-chat",
        providerID: "requesty",
        api: {
          id: "deepseek/deepseek-chat",
          url: "https://router.requesty.ai/v1",
          npm: "@ai-sdk/openai-compatible",
        },
        name: "DeepSeek Seed",
        family: "deepseek",
        capabilities: {
          temperature: true,
          reasoning: true,
          attachment: true,
          toolcall: false,
          input: {
            text: true,
            audio: false,
            image: true,
            video: false,
            pdf: false,
          },
          output: {
            text: true,
            audio: false,
            image: true,
            video: false,
            pdf: false,
          },
          interleaved: false,
        },
        cost: {
          input: 9,
          output: 9,
          cache: {
            read: 9,
            write: 9,
          },
        },
        limit: {
          context: 32000,
          output: 2000,
        },
        status: "deprecated",
        options: {
          seed: true,
        },
        headers: {
          "x-seed": "1",
        },
        release_date: "2024-01-01",
        variants: {
          fast: {},
        },
      },
      "stale/model": {
        id: "stale/model",
        providerID: "requesty",
        api: {
          id: "stale/model",
          url: "https://router.requesty.ai/v1",
          npm: "@ai-sdk/openai-compatible",
        },
        name: "Stale",
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
          input: 1,
          output: 1,
          cache: {
            read: 0,
            write: 0,
          },
        },
        limit: {
          context: 1000,
          output: 100,
        },
        status: "active",
        options: {},
        headers: {},
        release_date: "2023-01-01",
        variants: {},
      },
    },
  }
}
