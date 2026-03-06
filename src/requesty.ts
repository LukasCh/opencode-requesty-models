import type { Hooks, Plugin } from "@opencode-ai/plugin"

export type Log = (level: "debug" | "info" | "warn" | "error", message: string, extra?: Record<string, unknown>) => Promise<void>

export function requesty(_: {
  log?: Log
  fetch?: typeof fetch
  timeout?: number
} = {}): NonNullable<Hooks["auth"]> {
  return {
    provider: "requesty",
    methods: [
      {
        type: "api",
        label: "Requesty API key",
        prompts: [
          {
            type: "text",
            key: "key",
            message: "Enter your Requesty API key",
            placeholder: "rq_...",
            validate: (value) => (value.trim() ? undefined : "Required"),
          },
        ],
        async authorize(input = {}) {
          const key = input.key?.trim()
          if (!key) return { type: "failed" as const }
          return { type: "success" as const, key }
        },
      },
    ],
    async loader() {
      return {}
    },
  }
}

export const RequestyModelsPlugin: Plugin = async (input) => ({
  auth: requesty({
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
  }),
})
