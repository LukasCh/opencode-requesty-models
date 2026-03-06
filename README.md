# opencode-requesty-models

External OpenCode plugin that replaces Requesty's seeded `models.dev` catalog with the live key-scoped `GET /v1/models` response for the saved Requesty API key.

## Install

Add the plugin to `opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["opencode-requesty-models"]
}
```

Then save a Requesty key:

```bash
opencode auth requesty
```

## Behavior

- Requires credentials saved with `opencode auth requesty`
- Fetches `https://router.requesty.ai/v1/models` during provider bootstrap
- Rebuilds `requesty.models` from the live response
- Preserves seeded metadata when live data is missing
- Overrides seeded price, limit, and capability fields when live data is present
- Removes seeded models that are not in the live catalog
- Falls back to the seeded catalog if the live fetch fails

## Development

```bash
bun install
bun test
bun run build
```
