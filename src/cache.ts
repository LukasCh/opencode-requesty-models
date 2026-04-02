import { createHmac } from "node:crypto"
import { mkdir, readFile, rename, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"
import { parseModels, type RequestyLiveModel } from "./parse.js"

const cacheVersion = 1
const cacheIDLength = 24

export type CatalogCache = {
  read(key: string): Promise<RequestyLiveModel[] | undefined>
  write(key: string, models: RequestyLiveModel[]): Promise<void>
}

function cacheRoot(dir?: string) {
  if (dir) return dir
  if (process.env.XDG_CACHE_HOME) return join(process.env.XDG_CACHE_HOME, "opencode", "requesty-models")
  if (process.platform === "win32") {
    const local = process.env.LOCALAPPDATA ?? join(homedir(), "AppData", "Local")
    return join(local, "opencode", "requesty-models")
  }
  return join(homedir(), ".cache", "opencode", "requesty-models")
}

function secretPath(dir: string) {
  return join(dir, "secret")
}

function message(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

function text(value: unknown) {
  if (typeof value !== "string") return undefined
  const trimmed = value.trim()
  return trimmed || undefined
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function bytesToHex(value: ArrayBuffer | Uint8Array) {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value)
  return Array.from(bytes, (item) => item.toString(16).padStart(2, "0")).join("")
}

function hexToBytes(value: string) {
  if (!/^[0-9a-f]+$/i.test(value) || value.length % 2 !== 0) return undefined
  const bytes = new Uint8Array(value.length / 2)

  for (let i = 0; i < value.length; i += 2) {
    bytes[i / 2] = Number.parseInt(value.slice(i, i + 2), 16)
  }

  return bytes
}

async function ensureDir(dir: string) {
  await mkdir(dir, {
    recursive: true,
    mode: 0o700,
  })
}

async function readOrCreateSecret(dir: string) {
  await ensureDir(dir)
  const path = secretPath(dir)

  try {
    const current = text(await readFile(path, "utf8"))
    const bytes = current ? hexToBytes(current) : undefined
    if (bytes) return bytes
  } catch (error) {
    if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT")) throw error
  }

  const next = crypto.getRandomValues(new Uint8Array(32))

  try {
    await writeFile(path, bytesToHex(next), {
      encoding: "utf8",
      mode: 0o600,
      flag: "wx",
    })
    return next
  } catch (error) {
    if (!(error && typeof error === "object" && "code" in error && error.code === "EEXIST")) {
      throw error
    }
  }

  const current = text(await readFile(path, "utf8"))
  const bytes = current ? hexToBytes(current) : undefined
  if (!bytes) throw new Error(`invalid cache secret at ${path}`)
  return bytes
}

async function cacheID(secret: Uint8Array, key: string) {
  return createHmac("sha256", secret).update(key).digest("hex").slice(0, cacheIDLength)
}

async function cachePath(dir: string, secret: Uint8Array, key: string) {
  return join(dir, `${await cacheID(secret, key)}.json`)
}

function parseCachedModels(value: unknown) {
  if (!record(value)) return undefined
  if (value.version !== cacheVersion) return undefined
  if (!Array.isArray(value.models)) return undefined

  const models = parseModels(value.models)
  if (value.models.length > 0 && models.length === 0) return undefined
  return models
}

export function createCatalogCache(opts: { dir?: string } = {}): CatalogCache {
  const dir = cacheRoot(opts.dir)
  let secret: Promise<Uint8Array> | undefined

  function getSecret() {
    if (secret) return secret
    secret = readOrCreateSecret(dir).catch((error) => {
      secret = undefined
      throw error
    })
    return secret
  }

  return {
    async read(key) {
      const file = await cachePath(dir, await getSecret(), key)

      try {
        const raw = JSON.parse(await readFile(file, "utf8"))
        return parseCachedModels(raw)
      } catch (error) {
        if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
          return undefined
        }
        if (error instanceof SyntaxError) return undefined
        throw new Error(`failed to read Requesty model cache: ${message(error)}`, {
          cause: error,
        })
      }
    },
    async write(key, models) {
      await ensureDir(dir)
      const file = await cachePath(dir, await getSecret(), key)
      const temp = `${file}.tmp-${process.pid}-${Date.now()}`
      const body = JSON.stringify(
        {
          version: cacheVersion,
          fetchedAt: new Date().toISOString(),
          models,
        },
        null,
        2,
      )

      await writeFile(temp, body, {
        encoding: "utf8",
        mode: 0o600,
      })
      await rename(temp, file)
    },
  }
}

export const catalogCache = createCatalogCache()
