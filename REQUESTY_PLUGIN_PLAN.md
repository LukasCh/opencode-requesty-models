# Requesty plugin plan

Detailed workaround for an external OpenCode plugin that replaces Requesty's incomplete seeded model list with the live key-scoped `/v1/models` catalog.

---

## Goal

- Build a publishable external plugin that users can install through `opencode.json`.
- Keep Requesty seeded by `models.dev` so OpenCode still knows the provider exists.
- Replace the seeded Requesty model map with the live model list returned for the currently saved Requesty API key.
- Make the final provider list flow through existing OpenCode code paths without TUI or web UI changes.

---

## Scope

- Target Requesty only.
- Support credentials saved with `opencode auth requesty` only.
- Do not support env-only `REQUESTY_API_KEY` in v1.
- Do not add new core hooks in v1.
- Do not require changes to the model picker UI in v1.

---

## Why use an external plugin

- The plugin should be easy to publish on GitHub and npm for other users to install.
- OpenCode already supports config-driven plugins through the `plugin` array in `packages/opencode/src/config/config.ts:1000`.
- Runtime plugin loading already exists in `packages/opencode/src/plugin/index.ts:50`.
- An internal plugin would be the fastest upstream experiment, but an external plugin matches the intended distribution model better.

---

## Current behavior

### Seed provider data

- Provider catalogs start from `models.dev` in `packages/opencode/src/provider/models.ts:88`.
- Seed provider objects are converted into runtime provider info in `packages/opencode/src/provider/provider.ts:768`.
- Requesty already exists in the bundled models fixture and points at `https://router.requesty.ai/v1` with `@ai-sdk/openai-compatible`.

### Provider assembly

- `Provider.list()` builds the connected provider map in `packages/opencode/src/provider/provider.ts:779`.
- Env-based provider activation happens in `packages/opencode/src/provider/provider.ts:915`.
- Saved auth-based provider activation happens in `packages/opencode/src/provider/provider.ts:928`.
- Plugin auth loaders run after auth is known in `packages/opencode/src/provider/provider.ts:938`.
- Built-in provider custom loaders run later in `packages/opencode/src/provider/provider.ts:985`.
- Config whitelist and blacklist are applied near the end in `packages/opencode/src/provider/provider.ts:1024`.

### UI consumption

- The server exposes the final provider list in `packages/opencode/src/server/routes/provider.ts:50`.
- The TUI model picker renders whatever is already present in `provider.models` in `packages/opencode/src/cli/cmd/tui/component/dialog-model.tsx:69`.
- The web app bootstraps the same server response in `packages/app/src/context/global-sync/bootstrap.ts:79`.
- The web app only strips deprecated models in `packages/app/src/context/global-sync/utils.ts:5`.

### Important limitation

- Plugin auth loaders are only called when stored auth exists for the provider.
- In the current core flow, env-only Requesty keys will not trigger the plugin loader.
- That is why v1 should explicitly require `opencode auth requesty`.

---

## Why this workaround is viable

- Requesty already exists in `models.dev`, so the plugin does not need to invent a new provider registration path.
- The plugin auth loader can mutate the provider object in place before it is merged into the final connected provider map.
- The built-in Copilot plugin already demonstrates in-place model mutation in `packages/opencode/src/plugin/copilot.ts:33`.
- Once `provider.models` is replaced, the rest of OpenCode should naturally consume the corrected catalog.

---

## Proposed plugin shape

### Package

- Publish an external npm package, for example `opencode-requesty-models`.
- Host the source on GitHub.
- Users install it by listing the package in `opencode.json`.

### Config example

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["opencode-requesty-models@1.0.0"]
}
```

### Auth requirement

- Users must save a Requesty key with `opencode auth requesty`.
- The plugin does not need custom login UX in v1 if plain API key auth is enough.
- The plugin may still expose an `auth` hook for `requesty` so its loader is invoked by core.

---

## Plugin contract

### Hook choice

- Use the plugin `auth` hook defined in `packages/plugin/src/index.ts:37`.
- Set `provider: "requesty"`.
- Implement `loader(auth, provider)`.

### Why the auth hook

- It is the only existing hook that has both access to saved auth and a provider object.
- The loader runs in the provider assembly pipeline, which is exactly where the model map needs to change.
- No first-class dynamic provider catalog hook exists today.

### Expected loader inputs

- `auth()` returns the saved provider credential.
- `provider` is the seeded Requesty provider object built from `models.dev`.
- The loader can mutate `provider.models` in place, then return provider options if needed.

---

## Data flow

1. OpenCode loads Requesty from `models.dev`.
2. User has saved a Requesty key through `opencode auth requesty`.
3. Core provider assembly reaches plugin auth loaders.
4. The Requesty plugin loader receives the seeded provider and the saved auth callback.
5. The loader fetches `https://router.requesty.ai/v1/models` with the saved API key.
6. The loader builds a new Requesty model map from the live response.
7. The loader replaces `provider.models` in place.
8. Core continues merging provider options and later applies config whitelist and blacklist.
9. TUI, CLI, and web surfaces render the corrected model list from `Provider.list()`.

---

## Fetch behavior

### Endpoint

- Use `GET https://router.requesty.ai/v1/models`.

### Headers

- Send `Authorization: Bearer <saved key>`.
- Send `Content-Type: application/json` only if needed.
- Send a reasonable `User-Agent` if the plugin environment makes that practical.

### Response assumptions

- Best case: Requesty returns an OpenAI-compatible shape like `{ data: [{ id, ... }] }`.
- The plugin should parse defensively so small response differences do not crash provider loading.
- The minimum required field is model `id`.

### Timeout and resilience

- Use a short timeout so provider bootstrap does not hang.
- Treat network errors, non-200 responses, and malformed payloads as soft failures.

---

## Model replacement strategy

### High-level rule

- The live Requesty `/v1/models` response is the source of truth for which models are available for the saved key.
- The seeded `models.dev` provider is only a starting template.

### Algorithm

1. Read the seeded Requesty provider passed into the loader.
2. Fetch the live Requesty model list for the saved key.
3. Extract the set of live model IDs.
4. Build a fresh object for `provider.models`.
5. For each live model ID:
   - if the ID already exists in the seeded Requesty map, copy that model entry as-is
   - if the ID does not exist in the seeded Requesty map, synthesize a minimal valid OpenCode model entry
6. Drop seeded Requesty models that are not present in the live model ID set.
7. Assign the rebuilt object back to `provider.models`.

### Why rebuild instead of mutate in place

- Rebuilding avoids stale model entries being left behind.
- Rebuilding makes the output deterministic and easier to test.
- Rebuilding also makes it easy to preserve seeded metadata only where it still applies.

---

## Handling seeded models that still exist

- If a live Requesty model ID already exists in the seeded map, preserve that full model entry.
- This keeps higher-quality metadata from `models.dev`, including capabilities, costs, limits, release date, and variants.
- Preserve the original provider-scoped `api.url` and `api.npm` unless the live endpoint provides a compelling reason to change them.

---

## Handling live-only models

### Problem

- Requesty reportedly has far more models available per key than `models.dev` currently exposes.
- Those extra models still need to appear in OpenCode.

### Solution

- Synthesize minimal valid model objects for live-only IDs.
- Use the seeded Requesty provider as the template source for provider-level defaults.

### Synthetic model fields

- `id`: live model id.
- `providerID`: `requesty`.
- `name`: best effort from the live payload, otherwise fall back to the model id.
- `family`: best effort if the live payload has a family-like field, otherwise omit.
- `api.id`: live model id.
- `api.url`: seeded Requesty base URL.
- `api.npm`: seeded Requesty npm package, expected to be `@ai-sdk/openai-compatible`.
- `status`: `active`.
- `headers`: `{}`.
- `options`: `{}`.
- `cost`: default to zeros unless the live payload has usable numbers.
- `limit`: use live values if present, otherwise conservative defaults.
- `capabilities`: use live metadata if present, otherwise conservative text-first defaults.
- `release_date`: use the live field if present, otherwise an empty string or another safe sentinel.
- `variants`: `{}` initially.

### Conservative capability defaults

- `temperature: true`
- `reasoning: false`
- `attachment: false`
- `toolcall: true`
- `input.text: true`
- `input.audio: false`
- `input.image: false`
- `input.video: false`
- `input.pdf: false`
- `output.text: true`
- `output.audio: false`
- `output.image: false`
- `output.video: false`
- `output.pdf: false`
- `interleaved: false`

These defaults should be treated as placeholders, not truth.

---

## Fallback behavior

### Recommended fallback

- If the live `/v1/models` fetch fails, leave the seeded Requesty `models.dev` catalog untouched.
- Log a warning or debug message so the failure is diagnosable.

### Why fallback instead of hiding everything

- It avoids breaking Requesty completely because of a transient network problem.
- It lets users continue working with the smaller seeded catalog.
- It keeps the plugin low-risk for adoption.

### Optional future fallback

- Cache the last successful live model response and reuse it when the endpoint fails.
- This would improve stability without reverting fully to the seeded catalog.

---

## Interaction with existing OpenCode behavior

### Config whitelist and blacklist

- Provider-level whitelist and blacklist logic runs after plugin loaders in `packages/opencode/src/provider/provider.ts:1024`.
- That means user config should still filter the rebuilt Requesty model set correctly.

### CLI behavior

- `opencode models requesty` should automatically show the rebuilt model list because it reads `Provider.list()` in `packages/opencode/src/cli/cmd/models.ts:37`.

### TUI behavior

- The TUI model picker should automatically show the rebuilt Requesty model list because it reads the server-supplied provider map in `packages/opencode/src/cli/cmd/tui/component/dialog-model.tsx:69`.

### Web behavior

- The web app should automatically show the rebuilt Requesty model list because it bootstraps provider data from the same server route in `packages/app/src/context/global-sync/bootstrap.ts:79`.

---

## Implementation checklist

### Package setup

- Create a new plugin package or standalone repo.
- Export a plugin function compatible with `@opencode-ai/plugin`.
- Ensure the built output can be installed from npm.

### Core plugin logic

- Implement `auth.provider = "requesty"`.
- Expose a normal API-key auth method if needed.
- Implement `auth.loader(auth, provider)`.
- Validate that `auth()` returns an API key.
- Short-circuit safely if `provider` is missing.
- Fetch the live Requesty model list.
- Normalize the response into a flat list of model records.
- Rebuild `provider.models` from live IDs plus seeded metadata.
- Return an empty options object unless extra provider options are needed.

### Utility helpers

- Add a small helper to parse the live response shape.
- Add a helper to create synthetic model objects.
- Add a helper to merge seeded and live model data.

### Logging

- Log fetch failures at warning or debug level.
- Avoid logging secrets.
- Log model counts before and after replacement if that helps debugging.

---

## Suggested file layout

This is one possible package structure.

```text
src/
  index.ts
  requesty.ts
  model.ts
  fetch.ts
  parse.ts
```

### Suggested responsibilities

- `src/index.ts`: plugin export.
- `src/requesty.ts`: `auth` hook and loader wiring.
- `src/fetch.ts`: Requesty `/v1/models` fetch with timeout and auth header.
- `src/parse.ts`: response normalization.
- `src/model.ts`: seeded/live merge logic and synthetic model creation.

---

## Example user flow

1. User installs the plugin package in `opencode.json`.
2. User runs `opencode auth requesty` and saves a Requesty API key.
3. User starts OpenCode.
4. OpenCode seeds Requesty from `models.dev`.
5. The plugin loader fetches the live key-scoped model catalog.
6. The plugin replaces `provider.models`.
7. The user opens the model picker and sees the full Requesty model set for that key.

---

## Test strategy

### Unit tests

- Parse OpenAI-style `{ data: [...] }` payloads.
- Parse slightly different payload shapes if Requesty returns them.
- Verify synthetic model creation for live-only IDs.
- Verify seeded metadata is preserved for matching IDs.
- Verify stale seeded IDs are removed.

### Integration-style tests

- Seed a Requesty provider object with a small fake `models.dev` map.
- Save a fake Requesty auth record.
- Mock `fetch` for `GET /v1/models`.
- Assert that the loader rebuilds `provider.models` as expected.

### Failure tests

- Network timeout.
- Non-200 response.
- Invalid JSON.
- Unexpected payload shape.
- Missing auth.

### Expected assertions

- Matching live IDs remain and preserve seeded metadata.
- Live-only IDs are added as synthetic models.
- Missing live IDs are removed.
- Failure path leaves the seeded model map intact.

---

## Risks

### Plugin API mismatch

- This design uses the auth loader for a job that is broader than auth.
- It works with the current core flow, but it is not a clean formal extension point.

### Metadata quality

- Live-only Requesty models may have weaker metadata than seeded `models.dev` entries.
- That can affect sorting, pricing display, capability flags, and model heuristics.

### Auth mode limitation

- Env-only `REQUESTY_API_KEY` will not trigger the loader in the current core path.
- Users must understand that `opencode auth requesty` is required for this plugin.

### Endpoint assumptions

- If Requesty changes or extends its `/v1/models` response shape, the parser may need updates.

### Startup latency

- Fetching `/v1/models` adds network work during provider bootstrap.
- Timeouts and fallback behavior need to stay conservative.

---

## Rollout notes

- Start with a small v1 that only replaces the model catalog.
- Avoid fancy metadata mapping until the basic flow is stable.
- Document clearly that the plugin depends on `opencode auth requesty`.
- Document fallback behavior so users know why they may still see the smaller seeded catalog during transient failures.

---

## Future improvements

- Add cached last-known-good live model responses.
- Support env-only `REQUESTY_API_KEY`, which likely requires a small core change.
- Map richer Requesty `/v1/models` metadata into OpenCode model fields.
- Add a dedicated core or plugin hook for dynamic provider catalogs.
- Generalize the pattern for other OpenAI-compatible providers with key-scoped model lists.

---

## Recommendation

- Build the plugin as an external npm package with GitHub-hosted source.
- Keep Requesty seeded by `models.dev` only so the provider exists in core.
- Use the plugin auth loader to treat Requesty's live `/v1/models` response as the source of truth for model availability.
- Preserve seeded metadata when possible and synthesize minimal models for live-only IDs.
- Fall back to the seeded catalog on fetch failure.
- Explicitly scope v1 to keys saved through `opencode auth requesty`.

This is the fastest workable design that stays within today's plugin system while solving the immediate Requesty catalog problem.
