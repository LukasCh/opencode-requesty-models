# opencode-requesty-models

OpenCode plugin that replaces Requesty's seeded `models.dev` catalog with the live key-scoped `GET /v1/models` response for the saved Requesty API key.

## What it does

- refreshes Requesty's model list during provider bootstrap
- retries one transient refresh failure before giving up
- keeps seeded metadata when live fields are missing
- overrides seeded price, limit, and capability data when live values are present
- removes seeded models that are not available for the current key
- falls back to a cached live catalog for the same key before using the seeded catalog
- adds `/requesty-usage` to show the saved Requesty key's current monthly spend and limit

## Requirements

- Requesty must already exist as a seeded provider in OpenCode
- saved Requesty credentials are optional on current OpenCode versions; the model catalog endpoint also works publicly
- older OpenCode versions that only run auth loaders may still need saved Requesty credentials for the compatibility fallback
- when credentials are saved, the plugin reuses OpenCode's built-in API-key prompt for Requesty auth

## Install From npm

Add the plugin to `opencode.json` with an explicit version:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["opencode-requesty-models@0.1.9"]
}
```

OpenCode caches npm plugins, so a bare `"opencode-requesty-models"` entry can remain on an older resolved package after a new version is published. Pin the version in config and bump that version when upgrading.

Optionally save your Requesty key:

```bash
opencode auth login
```

When prompted, choose `Requesty` and enter your Requesty API key.

Verify that the live catalog is being used:

```bash
opencode models requesty
```

Show Requesty usage for the saved API key:

```bash
/requesty-usage
```

The usage command injects the report directly into the session without requesting an LLM reply. It calls `GET https://api-v2.requesty.ai/v1/manage/apikey/self` with the saved Requesty API key and reports `monthly_spend` and `monthly_limit`. This requires a saved Requesty key; the public model-catalog fallback cannot query account usage.

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

When publishing a new release, update the recommended config version in this README and tell users to bump their plugin entry, for example from `opencode-requesty-models@0.1.9` to `opencode-requesty-models@0.1.10`, then restart OpenCode.
