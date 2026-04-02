# opencode-requesty-models

OpenCode plugin that replaces Requesty's seeded `models.dev` catalog with the live key-scoped `GET /v1/models` response for the saved Requesty API key.

## What it does

- refreshes Requesty's model list during provider bootstrap
- retries one transient refresh failure before giving up
- keeps seeded metadata when live fields are missing
- overrides seeded price, limit, and capability data when live values are present
- removes seeded models that are not available for the current key
- falls back to a cached live catalog for the same key before using the seeded catalog

## Requirements

- Requesty must already exist as a seeded provider in OpenCode
- credentials must be saved with `opencode auth login`, then choosing `Requesty` and entering your Requesty API key
- the plugin reuses OpenCode's built-in API-key prompt for Requesty auth
- env-only `REQUESTY_API_KEY` is not supported in v1 because OpenCode only runs plugin auth loaders for saved auth

## Install From npm

Add the plugin to `opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["opencode-requesty-models"]
}
```

Then save your Requesty key:

```bash
opencode auth login
```

When prompted, choose `Requesty` and enter your Requesty API key.

Verify that the live catalog is being used:

```bash
opencode models requesty
```

The plugin caches the last successful live catalog in the local user cache directory so transient Requesty outages do not immediately drop back to the seeded catalog. Cache files are keyed by a secret-derived HMAC prefix, not the raw API key.

## Local Development

```bash
bun install
bun run build
bun run test
```

For local plugin testing without publishing, add a project plugin shim that re-exports `dist/index.js` from this repository.

## Publish

```bash
bun run build
npm publish
```

After publishing, users can install it directly through the `plugin` array in `opencode.json`.
