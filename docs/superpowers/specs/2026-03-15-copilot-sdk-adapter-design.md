# Copilot SDK Adapter Integration

## Problem

snapeval currently invokes Copilot CLI via `child_process.execFile`, which means:
- No structured response format (parsing raw stdout)
- No real token counts (estimated from output length)
- Sequential-only execution (one process at a time)
- No visibility into tool usage or session events
- Fragile error handling (exit codes + stderr parsing)

The `@github/copilot-sdk` (v0.1.x) provides a typed TypeScript API over JSON-RPC that solves all of these issues.

## Design

### Approach: Conservative, Additive Integration

New opt-in adapters behind the existing adapter pattern. No changes to existing behavior.

### New Files

| File | Purpose |
|------|---------|
| `src/adapters/copilot-sdk-client.ts` | Shared lazy `CopilotClient` singleton with dynamic import |
| `src/adapters/skill/copilot-sdk.ts` | `CopilotSDKAdapter` implementing `SkillAdapter` |
| `src/adapters/inference/copilot-sdk.ts` | `CopilotSDKInference` implementing `InferenceAdapter` |
| `tests/adapters/copilot-sdk-skill.test.ts` | Skill adapter tests |
| `tests/adapters/copilot-sdk-inference.test.ts` | Inference adapter tests |

### Modified Files

| File | Change |
|------|--------|
| `bin/snapeval.ts` | Add `copilot-sdk` to `resolveSkillAdapter()` |
| `src/adapters/inference/resolve.ts` | Add `copilot-sdk` to `resolveInference()` |
| `package.json` | Add optional peer dependency |
| `tests/adapters/resolve.test.ts` | Tests for new adapter option |

### Dependency Strategy

`@github/copilot-sdk` as optional peer dependency:
```json
{
  "peerDependencies": {
    "@github/copilot-sdk": "~0.1.0"
  },
  "peerDependenciesMeta": {
    "@github/copilot-sdk": { "optional": true }
  }
}
```

Dynamic import at runtime — no impact on users who don't install it.

### Shared Client Factory (`copilot-sdk-client.ts`)

Lazy singleton pattern:
- `getClient()` — dynamically imports SDK, creates and starts client on first call
- `stopClient()` — stops client (for cleanup in tests or process exit)
- Clear error message if SDK not installed

Both adapters share the same client to avoid spawning multiple CLI server processes.

### CopilotSDKAdapter (SkillAdapter)

- Creates session per invocation with SKILL.md content as `systemMessage`
- Uses `sendAndWait()` for prompt execution
- Captures `assistant.usage` events for real token counts
- Disconnects session after each invocation (no state leakage)
- Auto-approves permissions via `onPermissionRequest`

### CopilotSDKInference (InferenceAdapter)

- Creates session per chat call with system messages as `systemMessage`
- Sends user content via `sendAndWait()`
- Embeddings delegate to fallback adapter (same pattern as `CopilotInference`)
- `estimateCost()` returns 0

### Activation

Opt-in only:
- `--adapter copilot-sdk` for skill invocation
- `--inference copilot-sdk` for LLM judge
- `adapter: 'copilot-sdk'` / `inference: 'copilot-sdk'` in `snapeval.config.json`

Never auto-detected or defaulted to. CLI adapter remains the default.

### Future Work (not in this PR)

- Concurrent session support for parallel scenario execution
- Streaming progress output during capture/check
- Tool usage visibility in eval reports
