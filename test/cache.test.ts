import { describe, expect, test } from "bun:test"
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createCatalogCache } from "../src/cache.ts"
import { parseModels } from "../src/parse.ts"
import { payload } from "./fixture.ts"

describe("catalog cache", () => {
  test("defers filesystem setup until the cache is used", async () => {
    const parent = await mkdtemp(join(tmpdir(), "requesty-cache-"))
    const dir = join(parent, "lazy-cache")

    try {
      const cache = createCatalogCache({ dir })

      expect(await readdir(parent)).toEqual([])

      await cache.write("rq_test_secret_key", parseModels(payload))

      expect(await readdir(parent)).toContain("lazy-cache")
    } finally {
      await rm(parent, { recursive: true, force: true })
    }
  })

  test("stores models under a hashed filename", async () => {
    const dir = await mkdtemp(join(tmpdir(), "requesty-cache-"))

    try {
      const cache = createCatalogCache({ dir })
      const models = parseModels(payload)

      await cache.write("rq_test_secret_key", models)

      expect(await cache.read("rq_test_secret_key")).toEqual(models)
      expect(await cache.read("rq_other_secret_key")).toBeUndefined()

      const files = await readdir(dir)
      expect(files).toContain("secret")
      expect(files.some((file) => /^[0-9a-f]{24}\.json$/.test(file))).toBe(true)
      expect(files.some((file) => file.includes("rq_test_secret_key"))).toBe(false)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  test("ignores corrupted cache files", async () => {
    const dir = await mkdtemp(join(tmpdir(), "requesty-cache-"))

    try {
      const cache = createCatalogCache({ dir })
      const models = parseModels(payload)

      await cache.write("rq_test_secret_key", models)

      const files = await readdir(dir)
      const data = files.find((file) => file.endsWith(".json"))
      if (!data) throw new Error("expected cache data file")

      await writeFile(join(dir, data), "{not json", "utf8")

      expect(await cache.read("rq_test_secret_key")).toBeUndefined()
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
