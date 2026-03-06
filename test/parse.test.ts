import { describe, expect, test } from "bun:test"
import { parseModels } from "../src/parse.ts"
import { payload } from "./fixture.ts"

describe("parseModels", () => {
  test("parses Requesty list payloads", () => {
    const result = parseModels(payload)

    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({
      id: "deepseek/deepseek-chat",
      api: "chat",
      name: undefined,
      family: undefined,
      description: "DeepSeek-V3 sample",
      created: 1738263837,
      input_price: 2.8e-7,
      output_price: 4.2e-7,
      caching_price: 4.2e-7,
      cached_price: 2.8e-8,
      context_window: 128000,
      max_output_tokens: 8000,
      supports_caching: true,
      supports_vision: false,
      supports_computer_use: false,
      supports_reasoning: false,
      supports_image_generation: false,
      supports_tool_calling: true,
    })
  })

  test("ignores malformed rows and duplicate ids", () => {
    const result = parseModels({
      data: [
        payload.data[0],
        { id: "deepseek/deepseek-chat" },
        { id: "" },
        { foo: "bar" },
      ],
    })

    expect(result).toEqual([
      {
        id: "deepseek/deepseek-chat",
        api: "chat",
        name: undefined,
        family: undefined,
        description: "DeepSeek-V3 sample",
        created: 1738263837,
        input_price: 2.8e-7,
        output_price: 4.2e-7,
        caching_price: 4.2e-7,
        cached_price: 2.8e-8,
        context_window: 128000,
        max_output_tokens: 8000,
        supports_caching: true,
        supports_vision: false,
        supports_computer_use: false,
        supports_reasoning: false,
        supports_image_generation: false,
        supports_tool_calling: true,
      },
    ])
  })
})
