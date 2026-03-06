# opencode-requesty-models

OpenCode plugin that replaces Requesty's seeded `models.dev` catalog with the live key-scoped `GET /v1/models` response for the saved Requesty API key.

## What it does

- refreshes Requesty's model list during provider bootstrap
- keeps seeded metadata when live fields are missing
- overrides seeded price, limit, and capability data when live values are present
- removes seeded models that are not available for the current key
- falls back to the seeded catalog if the live fetch fails

## Requirements

- Requesty must already exist as a seeded provider in OpenCode
- credentials must be saved with `opencode auth requesty`
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
opencode auth requesty
```

Verify that the live catalog is being used:

```bash
opencode models requesty
```

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
