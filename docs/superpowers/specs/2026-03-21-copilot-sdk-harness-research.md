# Copilot SDK Harness — Research Document

> Research for replacing CopilotCLIHarness with a CopilotSDKHarness using `@github/copilot-sdk@0.2.0`.

## Current State

### CopilotCLIHarness (today)

The only built-in harness. Invokes Copilot CLI via `child_process.execFile`:

```typescript
execFile('copilot', ['-s', '--no-ask-user', '--allow-all-tools', '--model', 'gpt-4.1', '-p', finalPrompt])
```

**Limitations:**
- SKILL.md is prepended to the prompt string (not native skill loading)
- No structured response (raw stdout parsing)
- `total_tokens` hardcoded to 0 (CLI doesn't expose token counts)
- `files` always empty (no visibility into generated files)
- No transcript of tool usage
- Fragile error handling (exit codes + stderr)

### Existing SDK Integration

- `src/adapters/copilot-sdk-client.ts` — Lazy singleton `CopilotClient` (targets v0.1.x API)
- `src/adapters/inference/copilot-sdk.ts` — SDK-based inference adapter for LLM grading
- No SDK-based harness exists yet
- Existing design spec (`2026-03-15-copilot-sdk-adapter-design.md`) targets v0.1.x and proposes `systemMessage` for SKILL.md injection

## SDK v0.2.0 — Key Capabilities for Harness

### 1. Native Skill Loading (`skillDirectories`)

The SDK can load skills from directories natively, exactly as the CLI does in interactive mode:

```typescript
const session = await client.createSession({
  model: 'gpt-4.1',
  skillDirectories: ['/path/to/skill-parent-dir'],
  onPermissionRequest: approveAll,
});
```

The CLI discovers SKILL.md files under the provided directories and loads them into the session context. This is the production-identical code path — no prompt manipulation needed.

**Runtime skill management via RPC:**

```typescript
// List loaded skills (name, description, source, enabled, path)
const { skills } = await session.rpc.skills.list();

// Enable/disable specific skills
await session.rpc.skills.enable({ name: 'my-skill' });
await session.rpc.skills.disable({ name: 'my-skill' });

// Reload skills from directories
await session.rpc.skills.reload();
```

**Skill events:**

- `session.skills_loaded` — Emitted during session creation. Contains array of resolved skill metadata (name, description, source, userInvocable, enabled, path).
- `skill.invoked` — Emitted when the model invokes a skill. Contains the full SKILL.md content, path, allowed tools, and plugin metadata.

### 2. `sendAndWait()` with Typed Response

```typescript
const response = await session.sendAndWait(
  { prompt: 'Generate API docs for this spec: ...' },
  timeout  // ms, default 60000
);
// response?.data.content — the assistant's final message
```

Returns `AssistantMessageEvent | undefined` with typed `data.content`.

### 3. `approveAll` Built-in Permission Handler

```typescript
import { approveAll } from '@github/copilot-sdk';
// No more manual: onPermissionRequest: async () => ({ kind: 'approved' })
```

### 4. `workingDirectory` on Session Config

```typescript
const session = await client.createSession({
  workingDirectory: '/path/to/output/dir',
  // Tool operations (file reads/writes) are relative to this directory
});
```

Replaces manual file copying to output dir.

### 5. `cwd` on Client Options

```typescript
const client = new CopilotClient({ cwd: '/path/to/project' });
```

Sets the working directory for the spawned CLI process itself.

### 6. `infiniteSessions` Control

```typescript
// Disable for eval isolation (no context compaction, no state persistence)
const session = await client.createSession({
  infiniteSessions: { enabled: false },
});
```

Each eval run should be a clean, isolated session without context carryover.

### 7. `getMessages()` — Full Event History

```typescript
const events = await session.getMessages();
// Filter for tool executions, assistant messages, errors, etc.
```

Enables building a transcript of what happened during the eval run.

### 8. File Attachments

```typescript
await session.send({
  prompt: 'Analyze this file',
  attachments: [
    { type: 'file', path: '/path/to/input.json', displayName: 'spec.json' },
  ],
});
```

Native file attachment support — replaces manual file copying.

### 9. `logLevel` Control

```typescript
const client = new CopilotClient({ logLevel: 'none' });
```

Suppresses CLI server output for clean eval runs.

## Design Implications

### Skill Loading Strategy

**Old plan (v0.1.x):** Inject SKILL.md content via `systemMessage: { content: skillMd }`.

**New plan (v0.2.0):** Use `skillDirectories` to load skills natively. This means:
- The skill is loaded through the exact same code path as production
- Skill metadata, allowed tools, and invocation events are all tracked
- For "without_skill" runs, simply omit `skillDirectories`
- For "old_skill" comparison, point `skillDirectories` to the old skill's directory

### Session Lifecycle per Eval Run

```
1. Create session (skillDirectories, workingDirectory, approveAll, infiniteSessions: false)
2. Attach file attachments if eval case has files
3. sendAndWait(prompt, timeout)
4. Extract response from AssistantMessageEvent
5. getMessages() for transcript
6. Disconnect session
```

Each eval case gets its own session — full isolation.

### Token Count Extraction

Check events for usage data. The `assistant.message` event's data may contain token usage. Additionally, tool execution events provide granular tracking.

### Client Singleton

Reuse the existing `copilot-sdk-client.ts` singleton pattern. One `CopilotClient` spawns one CLI server process; multiple sessions run on the same server. This is efficient for parallel eval execution with `--concurrency`.

### Making It Default

Change `DEFAULT_CONFIG.harness` from `'copilot-cli'` to `'copilot-sdk'` in `src/config.ts`. The CLI harness remains available via `--harness copilot-cli` for environments without the SDK installed.

`isAvailable()` should check `isSDKInstalled()` from the existing client module.

### Updated copilot-sdk-client.ts

The existing client code needs minor updates for v0.2.0:
- Add `logLevel: 'none'` to suppress CLI server output
- Add `cwd` option support
- The `CopilotClient` constructor and `start()/stop()` API is unchanged

### Existing Inference Adapter

`CopilotSDKInference` also needs updating for v0.2.0:
- Use `approveAll` instead of manual permission handler
- `infiniteSessions: { enabled: false }` for grading sessions

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/adapters/harness/copilot-sdk.ts` | Create | `CopilotSDKHarness` implementing `Harness` interface |
| `src/adapters/harness/resolve.ts` | Modify | Add `copilot-sdk` case, update error message |
| `src/adapters/copilot-sdk-client.ts` | Modify | Add `logLevel`, `cwd` options for v0.2.0 |
| `src/adapters/inference/copilot-sdk.ts` | Modify | Use `approveAll`, disable infinite sessions |
| `src/config.ts` | Modify | Change default harness to `copilot-sdk` |
| `bin/snapeval.ts` | Modify | Add cleanup hook for `stopClient()` on exit |
| `package.json` | Modify | Update SDK version range to `~0.2.0` |
| `tests/adapters/copilot-sdk-harness.test.ts` | Create | Unit tests for SDK harness |
| `CLAUDE.md` | Modify | Update architecture docs |
| `skills/snapeval/SKILL.md` | Modify | Update harness options |

## Open Questions

1. **Timeout per eval case** — The `sendAndWait()` default is 60s. Should we make this configurable via eval config, or use a generous default (e.g., 120s)?
2. **Token extraction** — Need to verify which event type carries usage/token data in v0.2.0. May need to iterate on this after initial implementation.
3. **Transcript format** — What level of detail to capture from `getMessages()`? Full tool execution trace or just assistant messages?
