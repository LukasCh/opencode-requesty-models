import { describe, expect, test } from "bun:test"
import { buildModels } from "../src/model.ts"
import { parseModels } from "../src/parse.ts"
import { payload, provider } from "./fixture.ts"

describe("buildModels", () => {
  test("overrides seeded fields and removes stale models", () => {
    const state = provider()
    const map = state.models
    const model = state.models["deepseek/deepseek-chat"]
    const next = buildModels(state, parseModels(payload))

    expect(next).toBe(map)
    expect(next["deepseek/deepseek-chat"]).toBe(model)
    expect(Object.keys(next)).toEqual(["deepseek/deepseek-chat", "zai/GLM-4.5"])
    expect(next["deepseek/deepseek-chat"]).toMatchObject({
      id: "deepseek/deepseek-chat",
      providerID: "requesty",
      name: "DeepSeek Seed",
      family: "deepseek",
      status: "active",
      cost: {
        input: 0.28,
        output: 0.42,
        cache: {
          read: 0.028,
          write: 0.42,
        },
      },
      limit: {
        context: 128000,
        output: 8000,
      },
      capabilities: {
        reasoning: false,
        toolcall: true,
        input: {
          image: false,
        },
        output: {
          image: false,
        },
      },
      options: {
        seed: true,
      },
      headers: {
        "x-seed": "1",
      },
      variants: {
        fast: {},
      },
      release_date: "2024-01-01",
    })
  })

  test("creates conservative synthetic models for live-only ids", () => {
    const state = provider()
    const next = buildModels(state, parseModels(payload))

    expect(next["zai/GLM-4.5"]).toEqual({
      id: "zai/GLM-4.5",
      providerID: "requesty",
      api: {
        id: "zai/GLM-4.5",
        url: "https://router.requesty.ai/v1",
        npm: "@ai-sdk/openai-compatible",
      },
      name: "zai/GLM-4.5",
      family: undefined,
      capabilities: {
        temperature: true,
        reasoning: true,
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
        input: 0.6,
        output: 2.2,
        cache: {
          read: 0.11,
          write: 0.6,
        },
        experimentalOver200K: undefined,
      },
      limit: {
        context: 131072,
        input: undefined,
        output: 98304,
      },
      status: "active",
      options: {},
      headers: {},
      release_date: "2025-10-16",
      variants: {},
    })
  })
})
