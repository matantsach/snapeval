# Persona Agents Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create 3 test skills and 3 persona agents that dogfood snapeval's end-to-end workflow.

**Architecture:** Content-only deliverable — no source code changes. Three skill fixtures (SKILL.md + evals.json + scripts) and three persona agents (PROFILE.md + AGENT_PROMPT.md). Each persona is paired with one skill and runs snapeval against it to surface UX friction, bugs, and gaps.

**Tech Stack:** Markdown, JSON (evals.json conforming to `EvalsFile` from `src/types.ts`), Bash (script assertions)

**Spec:** `docs/superpowers/specs/2026-03-21-persona-agents-design.md`

**Reference fixture:** `test-skills/greeter/` — follow this pattern for SKILL.md format and evals.json structure.

---

## File Map

All files live under `personas/` at the repo root.

**Skills (fixtures):**
- `personas/skills/git-commit-msg/SKILL.md` — simple skill, prompt-only
- `personas/skills/git-commit-msg/SKILL-v2.md` — variant with scope prefix + breaking change detection
- `personas/skills/git-commit-msg/evals/evals.json` — 4 eval cases, LLM assertions only
- `personas/skills/code-reviewer/SKILL.md` — complex skill, structured JSON output
- `personas/skills/code-reviewer/SKILL-v2.md` — variant with severity levels
- `personas/skills/code-reviewer/evals/evals.json` — 6 eval cases, LLM + script assertions
- `personas/skills/code-reviewer/evals/scripts/validate-json-structure.sh` — validates output is JSON with required fields
- `personas/skills/code-reviewer/evals/scripts/check-severity-values.sh` — validates severity enum values (for v2)
- `personas/skills/api-doc-generator/SKILL.md` — medium skill, markdown output
- `personas/skills/api-doc-generator/SKILL-v2.md` — variant with example request/response blocks
- `personas/skills/api-doc-generator/evals/evals.json` — 5 eval cases, LLM + script assertions
- `personas/skills/api-doc-generator/evals/scripts/validate-markdown-headers.sh` — validates markdown has proper headers
- `personas/skills/api-doc-generator/evals/scripts/check-endpoint-coverage.sh` — validates all OpenAPI paths appear in output

**Personas:**
- `personas/alex/PROFILE.md` — junior dev character profile
- `personas/alex/AGENT_PROMPT.md` — executable agent prompt for git-commit-msg workflow
- `personas/jordan/PROFILE.md` — senior engineer character profile
- `personas/jordan/AGENT_PROMPT.md` — executable agent prompt for code-reviewer workflow
- `personas/sam/PROFILE.md` — DevOps/QA character profile
- `personas/sam/AGENT_PROMPT.md` — executable agent prompt for api-doc-generator workflow

---

## Task 1: git-commit-msg Skill Fixture

**Files:**
- Create: `personas/skills/git-commit-msg/SKILL.md`
- Create: `personas/skills/git-commit-msg/SKILL-v2.md`
- Create: `personas/skills/git-commit-msg/evals/evals.json`

- [ ] **Step 1: Create SKILL.md**

Follow the `test-skills/greeter/SKILL.md` format (YAML frontmatter with name/description, then markdown instructions).

```markdown
---
name: git-commit-msg
description: Generates conventional commit messages from git diffs
---

# Git Commit Message Generator

Given a git diff, generate a single conventional commit message.

## Format

Use the conventional commits specification:
- `feat:` — new feature
- `fix:` — bug fix
- `chore:` — maintenance task
- `refactor:` — code restructuring without behavior change
- `docs:` — documentation only
- `test:` — adding or updating tests

## Rules

- Output exactly one line — the commit message
- Keep the message under 72 characters
- Start with the appropriate prefix followed by a colon and space
- Use imperative mood ("add feature" not "added feature")
- Do not include the diff in the output
- If the diff is empty, output: "chore: empty commit"
- For merge commits (diff shows merge conflict markers), use prefix `merge:`
```

- [ ] **Step 2: Create SKILL-v2.md**

Adds scope prefix support and breaking change detection.

```markdown
---
name: git-commit-msg
description: Generates conventional commit messages from git diffs with scope and breaking change support
---

# Git Commit Message Generator

Given a git diff, generate a single conventional commit message.

## Format

Use the conventional commits specification:
- `feat:` — new feature
- `fix:` — bug fix
- `chore:` — maintenance task
- `refactor:` — code restructuring without behavior change
- `docs:` — documentation only
- `test:` — adding or updating tests

## Scope

If the diff touches files in a single directory or module, include a scope in parentheses:
- `feat(auth):` — feature in the auth module
- `fix(api):` — bug fix in the api module

If files span multiple modules, omit the scope.

## Breaking Changes

If the diff removes a public function, changes a function signature, or removes an export:
- Use `!` after the prefix: `feat!:` or `feat(auth)!:`
- This signals a breaking change

## Rules

- Output exactly one line — the commit message
- Keep the message under 72 characters
- Start with the appropriate prefix followed by a colon and space
- Use imperative mood ("add feature" not "added feature")
- Do not include the diff in the output
- If the diff is empty, output: "chore: empty commit"
- For merge commits (diff shows merge conflict markers), use prefix `merge:`
```

- [ ] **Step 3: Create evals.json**

4 eval cases: happy path, empty diff, large diff, merge commit. LLM assertions only.

```json
{
  "skill_name": "git-commit-msg",
  "evals": [
    {
      "id": 1,
      "prompt": "Generate a commit message for this diff:\n```diff\n--- a/src/utils.ts\n+++ b/src/utils.ts\n@@ -5,7 +5,7 @@\n export function formatDate(date: Date): string {\n-  return date.toString();\n+  return date.toISOString();\n }\n```",
      "expected_output": "A conventional commit message fixing the date format function",
      "files": [],
      "assertions": [
        "Output starts with a conventional commit prefix (feat:, fix:, chore:, refactor:, docs:, or test:) followed by a space",
        "Output is a single line with no line breaks",
        "Output is under 72 characters total",
        "Output does not contain any diff syntax (no +, -, @@ markers)"
      ]
    },
    {
      "id": 2,
      "prompt": "Generate a commit message for this diff:\n```diff\n```",
      "expected_output": "Handles empty diff with the fallback message",
      "files": [],
      "assertions": [
        "Output is exactly: \"chore: empty commit\"",
        "Output contains no additional text"
      ]
    },
    {
      "id": 3,
      "prompt": "Generate a commit message for this diff:\n```diff\n--- a/src/config.ts\n+++ b/src/config.ts\n@@ -1,50 +1,75 @@\n-export const DEFAULT_TIMEOUT = 5000;\n-export const MAX_RETRIES = 3;\n-export const BASE_URL = 'http://localhost:3000';\n-export const LOG_LEVEL = 'info';\n-export const CACHE_TTL = 3600;\n-export const DB_POOL_SIZE = 10;\n-export const SESSION_SECRET = 'dev-secret';\n-export const CORS_ORIGIN = '*';\n-export const RATE_LIMIT = 100;\n-export const PAGE_SIZE = 20;\n+export interface Config {\n+  timeout: number;\n+  maxRetries: number;\n+  baseUrl: string;\n+  logLevel: string;\n+  cacheTtl: number;\n+  dbPoolSize: number;\n+  sessionSecret: string;\n+  corsOrigin: string;\n+  rateLimit: number;\n+  pageSize: number;\n+}\n+\n+export const defaultConfig: Config = {\n+  timeout: 5000,\n+  maxRetries: 3,\n+  baseUrl: 'http://localhost:3000',\n+  logLevel: 'info',\n+  cacheTtl: 3600,\n+  dbPoolSize: 10,\n+  sessionSecret: 'dev-secret',\n+  corsOrigin: '*',\n+  rateLimit: 100,\n+  pageSize: 20,\n+};\n```",
      "expected_output": "A conventional commit message for a large refactor replacing constants with a typed config object",
      "files": [],
      "assertions": [
        "Output starts with a conventional commit prefix (feat:, fix:, chore:, refactor:, docs:, or test:) followed by a space",
        "Output is a single line with no line breaks",
        "Output is under 72 characters total",
        "Output describes the nature of the change (refactoring, restructuring, or converting config)"
      ]
    },
    {
      "id": 4,
      "prompt": "Generate a commit message for this diff:\n```diff\n--- a/src/index.ts\n+++ b/src/index.ts\n@@ -1,5 +1,9 @@\n+<<<<<<< HEAD\n import { foo } from './foo';\n+=======\n+import { bar } from './bar';\n+>>>>>>> feature-branch\n \n export function main() {\n```",
      "expected_output": "Recognizes merge conflict markers and uses the merge: prefix",
      "files": [],
      "assertions": [
        "Output starts with \"merge:\" followed by a space",
        "Output is a single line with no line breaks",
        "Output is under 72 characters total"
      ]
    }
  ]
}
```

- [ ] **Step 4: Validate evals.json structure**

Run: `node -e "const e = JSON.parse(require('fs').readFileSync('personas/skills/git-commit-msg/evals/evals.json','utf8')); console.log(e.skill_name, e.evals.length + ' evals'); e.evals.forEach(c => console.log('  id:'+c.id, c.assertions.length+'a'))"`

Expected output:
```
git-commit-msg 4 evals
  id:1 4a
  id:2 2a
  id:3 4a
  id:4 3a
```

- [ ] **Step 5: Commit**

```bash
git add personas/skills/git-commit-msg/
git commit -m "feat: add git-commit-msg skill fixture for persona agents"
```

---

## Task 2: code-reviewer Skill Fixture

**Files:**
- Create: `personas/skills/code-reviewer/SKILL.md`
- Create: `personas/skills/code-reviewer/SKILL-v2.md`
- Create: `personas/skills/code-reviewer/evals/evals.json`
- Create: `personas/skills/code-reviewer/evals/scripts/validate-json-structure.sh`
- Create: `personas/skills/code-reviewer/evals/scripts/check-severity-values.sh`

- [ ] **Step 1: Create SKILL.md**

```markdown
---
name: code-reviewer
description: Reviews code for bugs and style issues, outputting structured JSON feedback
---

# Code Reviewer

Analyze the provided code and identify bugs, logic errors, and style issues. Output your review as a JSON object.

## Output Format

Return a JSON object with this structure:
```json
{
  "issues": [
    {
      "type": "bug" | "style" | "performance",
      "description": "What the issue is",
      "line": "The problematic code",
      "suggestion": "How to fix it"
    }
  ],
  "summary": "Brief overall assessment"
}
```

## Rules

- Always output valid JSON — no markdown fences, no extra text
- If no issues found, return `{"issues": [], "summary": "No issues found"}`
- For binary files or empty input, return `{"issues": [], "summary": "Cannot review: unsupported input"}`
- Focus on real bugs first, style issues second
- Each issue must include all four fields: type, description, line, suggestion
```

- [ ] **Step 2: Create SKILL-v2.md**

Adds severity levels to the output format.

```markdown
---
name: code-reviewer
description: Reviews code for bugs and style issues with severity levels, outputting structured JSON feedback
---

# Code Reviewer

Analyze the provided code and identify bugs, logic errors, and style issues. Output your review as a JSON object with severity levels.

## Output Format

Return a JSON object with this structure:
```json
{
  "issues": [
    {
      "type": "bug" | "style" | "performance",
      "severity": "critical" | "warning" | "info",
      "description": "What the issue is",
      "line": "The problematic code",
      "suggestion": "How to fix it"
    }
  ],
  "summary": "Brief overall assessment"
}
```

## Severity Levels

- **critical** — Bugs that cause incorrect behavior, crashes, or security vulnerabilities
- **warning** — Code smells, potential issues, or performance problems
- **info** — Style suggestions, naming conventions, minor improvements

## Rules

- Always output valid JSON — no markdown fences, no extra text
- If no issues found, return `{"issues": [], "summary": "No issues found"}`
- For binary files or empty input, return `{"issues": [], "summary": "Cannot review: unsupported input"}`
- Focus on real bugs first, style issues second
- Each issue must include all five fields: type, severity, description, line, suggestion
- Assign severity based on impact: bugs are usually critical, style is usually info
```

- [ ] **Step 3: Create validate-json-structure.sh**

```bash
#!/usr/bin/env bash
# Validates that output.txt contains valid JSON with required fields.
# Receives the outputs/ directory as $1.

OUTPUT_FILE="$1/output.txt"

if [ ! -f "$OUTPUT_FILE" ]; then
  echo "FAIL: output.txt not found at $OUTPUT_FILE" >&2
  exit 1
fi

# Check valid JSON
if ! node -e "JSON.parse(require('fs').readFileSync('$OUTPUT_FILE','utf8'))" 2>/dev/null; then
  echo "FAIL: output.txt is not valid JSON" >&2
  exit 1
fi

# Check required fields
node -e "
const obj = JSON.parse(require('fs').readFileSync('$OUTPUT_FILE','utf8'));
if (!Array.isArray(obj.issues)) { console.error('FAIL: missing issues array'); process.exit(1); }
if (typeof obj.summary !== 'string') { console.error('FAIL: missing summary string'); process.exit(1); }
for (const [i, issue] of obj.issues.entries()) {
  for (const field of ['type','description','line','suggestion']) {
    if (typeof issue[field] !== 'string') {
      console.error('FAIL: issue[' + i + '] missing field: ' + field);
      process.exit(1);
    }
  }
}
"
```

- [ ] **Step 4: Create check-severity-values.sh**

```bash
#!/usr/bin/env bash
# Validates that all issues have a severity field with valid values.
# For use with SKILL-v2.md evals. Receives the outputs/ directory as $1.

OUTPUT_FILE="$1/output.txt"

if [ ! -f "$OUTPUT_FILE" ]; then
  echo "FAIL: output.txt not found at $OUTPUT_FILE" >&2
  exit 1
fi

node -e "
const obj = JSON.parse(require('fs').readFileSync('$OUTPUT_FILE','utf8'));
const valid = ['critical','warning','info'];
for (const [i, issue] of (obj.issues || []).entries()) {
  if (!valid.includes(issue.severity)) {
    console.error('FAIL: issue[' + i + '].severity is \"' + issue.severity + '\" — expected one of: ' + valid.join(', '));
    process.exit(1);
  }
}
"
```

- [ ] **Step 5: Make scripts executable**

Run: `chmod +x personas/skills/code-reviewer/evals/scripts/*.sh`

- [ ] **Step 6: Create evals.json**

6 eval cases: clean code, obvious bug, style-only issues, empty PR, binary files, mixed languages.

```json
{
  "skill_name": "code-reviewer",
  "evals": [
    {
      "id": 1,
      "prompt": "Review this code for bugs:\n```js\nfunction add(a, b) { return a - b; }\n```",
      "expected_output": "Identifies the subtraction bug in the add function",
      "files": [],
      "assertions": [
        "Output identifies that the function uses subtraction (-) instead of addition (+)",
        "Output includes a suggested fix that uses the + operator",
        "script:validate-json-structure.sh"
      ]
    },
    {
      "id": 2,
      "prompt": "Review this code:\n```js\nfunction greet(name) {\n  return `Hello, ${name}!`;\n}\n```",
      "expected_output": "Clean code with no bugs — should return empty issues array",
      "files": [],
      "assertions": [
        "Output JSON has an empty issues array or issues array with zero entries",
        "Output summary indicates no issues or clean code",
        "script:validate-json-structure.sh"
      ]
    },
    {
      "id": 3,
      "prompt": "Review this code:\n```python\ndef calculate_total(items):\n    total=0\n    for i in items:\n        total=total+i['price']\n    return total\n```",
      "expected_output": "Style issues only — missing spaces around operators, using 'i' as variable name",
      "files": [],
      "assertions": [
        "Output does not flag any bugs (no issue with type 'bug')",
        "Output identifies at least one style issue",
        "script:validate-json-structure.sh"
      ]
    },
    {
      "id": 4,
      "prompt": "Review this code:\n```\n```",
      "expected_output": "Handles empty input gracefully with unsupported input message",
      "files": [],
      "assertions": [
        "Output JSON has an empty issues array",
        "Output summary mentions 'unsupported' or 'cannot review' or 'empty'",
        "script:validate-json-structure.sh"
      ]
    },
    {
      "id": 5,
      "prompt": "Review this code:\n```\n\\x89PNG\\r\\n\\x1a\\n\\x00\\x00\\x00\\rIHDR\n```",
      "expected_output": "Recognizes binary content and returns unsupported input",
      "files": [],
      "assertions": [
        "Output JSON has an empty issues array",
        "Output summary mentions 'unsupported' or 'cannot review' or 'binary'",
        "script:validate-json-structure.sh"
      ]
    },
    {
      "id": 6,
      "prompt": "Review this code:\n```ts\ninterface User {\n  name: string;\n  age: number;\n}\n\nfunction isAdult(user: User): boolean {\n  return user.age > 18;\n}\n```\n\n```python\ndef is_adult(user):\n    return user['age'] > 18\n```",
      "expected_output": "Reviews both TypeScript and Python code, may note off-by-one in age check (18 vs 18+)",
      "files": [],
      "assertions": [
        "Output addresses code in at least two languages or mentions both snippets",
        "Output identifies at least one issue across both code blocks",
        "script:validate-json-structure.sh"
      ]
    }
  ]
}
```

- [ ] **Step 7: Validate evals.json and test scripts parse**

Run: `node -e "const e = JSON.parse(require('fs').readFileSync('personas/skills/code-reviewer/evals/evals.json','utf8')); console.log(e.skill_name, e.evals.length + ' evals'); e.evals.forEach(c => console.log('  id:'+c.id, c.assertions.length+'a', c.assertions.filter(a=>a.startsWith('script:')).length+'s'))"`

Expected output:
```
code-reviewer 6 evals
  id:1 3a 1s
  id:2 3a 1s
  id:3 3a 1s
  id:4 3a 1s
  id:5 3a 1s
  id:6 3a 1s
```

- [ ] **Step 8: Commit**

```bash
git add personas/skills/code-reviewer/
git commit -m "feat: add code-reviewer skill fixture for persona agents"
```

---

## Task 3: api-doc-generator Skill Fixture

**Files:**
- Create: `personas/skills/api-doc-generator/SKILL.md`
- Create: `personas/skills/api-doc-generator/SKILL-v2.md`
- Create: `personas/skills/api-doc-generator/evals/evals.json`
- Create: `personas/skills/api-doc-generator/evals/scripts/validate-markdown-headers.sh`
- Create: `personas/skills/api-doc-generator/evals/scripts/check-endpoint-coverage.sh`

- [ ] **Step 1: Create SKILL.md**

```markdown
---
name: api-doc-generator
description: Generates human-readable markdown API documentation from OpenAPI specs
---

# API Documentation Generator

Given an OpenAPI specification (JSON), generate human-readable API documentation in markdown format.

## Output Format

Generate markdown with:
- An H1 title based on the API's `info.title` (or "API Documentation" if missing)
- An H2 section for each endpoint path
- Under each path, an H3 for each HTTP method
- Each method section includes: summary, parameters, request body, and response codes

## Example

For an endpoint `GET /users` with summary "List all users":

```markdown
## /users

### GET — List all users

**Parameters:** None

**Response:** 200 OK
```

## Rules

- Output only markdown — no JSON, no code fences wrapping the entire output
- Include every path defined in the OpenAPI spec
- If the spec is empty or has no paths, output: "# API Documentation\n\nNo endpoints defined."
- Use the summary field from the spec for method descriptions
- If a path has multiple methods, list each as a separate H3
```

- [ ] **Step 2: Create SKILL-v2.md**

Adds example request/response blocks.

```markdown
---
name: api-doc-generator
description: Generates human-readable markdown API documentation from OpenAPI specs with request/response examples
---

# API Documentation Generator

Given an OpenAPI specification (JSON), generate human-readable API documentation in markdown format with example request/response blocks.

## Output Format

Generate markdown with:
- An H1 title based on the API's `info.title` (or "API Documentation" if missing)
- An H2 section for each endpoint path
- Under each path, an H3 for each HTTP method
- Each method section includes: summary, parameters, request body, response codes
- Each method section includes an **Example Request** and **Example Response** code block

## Example

For an endpoint `GET /users` with summary "List all users":

```markdown
## /users

### GET — List all users

**Parameters:** None

**Response:** 200 OK

**Example Request:**
```
GET /users HTTP/1.1
Host: api.example.com
```

**Example Response:**
```json
[
  {"id": 1, "name": "Alice"}
]
```
```

## Rules

- Output only markdown — no JSON, no code fences wrapping the entire output
- Include every path defined in the OpenAPI spec
- If the spec is empty or has no paths, output: "# API Documentation\n\nNo endpoints defined."
- Use the summary field from the spec for method descriptions
- If a path has multiple methods, list each as a separate H3
- Every method MUST include an Example Request and Example Response block
- Generate realistic example data based on the schema if available, or use placeholders
```

- [ ] **Step 3: Create validate-markdown-headers.sh**

```bash
#!/usr/bin/env bash
# Validates output contains properly formatted markdown headers.
# Receives the outputs/ directory as $1.

OUTPUT_FILE="$1/output.txt"

if [ ! -f "$OUTPUT_FILE" ]; then
  echo "FAIL: output.txt not found at $OUTPUT_FILE" >&2
  exit 1
fi

# Check for at least one H1
if ! grep -qE '^# ' "$OUTPUT_FILE"; then
  echo "FAIL: no H1 header found in output" >&2
  exit 1
fi

# Check that headers use proper markdown format (# not underline style)
if grep -qE '^[=-]+$' "$OUTPUT_FILE"; then
  echo "FAIL: found underline-style headers — use # prefix style" >&2
  exit 1
fi
```

- [ ] **Step 4: Create check-endpoint-coverage.sh**

```bash
#!/usr/bin/env bash
# Validates every OpenAPI path appears in the generated markdown.
# Receives the outputs/ directory as $1.
# Reads the eval prompt from the parent directory to extract paths.

OUTPUT_FILE="$1/output.txt"

if [ ! -f "$OUTPUT_FILE" ]; then
  echo "FAIL: output.txt not found at $OUTPUT_FILE" >&2
  exit 1
fi

# Check that the output contains at least one path-like heading (## /something)
if ! grep -qE '^#{1,3} .*/' "$OUTPUT_FILE"; then
  echo "FAIL: no endpoint path headings found in output" >&2
  exit 1
fi
```

- [ ] **Step 5: Make scripts executable**

Run: `chmod +x personas/skills/api-doc-generator/evals/scripts/*.sh`

- [ ] **Step 6: Create evals.json**

5 eval cases: simple CRUD API, nested schemas, auth endpoints, empty spec, webhook endpoints.

```json
{
  "skill_name": "api-doc-generator",
  "evals": [
    {
      "id": 1,
      "prompt": "Generate API docs for this OpenAPI spec:\n{\"openapi\":\"3.0.0\",\"info\":{\"title\":\"Users API\"},\"paths\":{\"/users\":{\"get\":{\"summary\":\"List all users\"},\"post\":{\"summary\":\"Create a user\"}}}}",
      "expected_output": "Markdown docs with H1 title 'Users API', H2 for /users, H3 for GET and POST methods",
      "files": [],
      "assertions": [
        "Output contains an H1 heading with 'Users API'",
        "Output contains an H2 or section heading for /users",
        "Output mentions 'List all users' and 'Create a user'",
        "Output lists both GET and POST methods",
        "script:validate-markdown-headers.sh"
      ]
    },
    {
      "id": 2,
      "prompt": "Generate API docs for this OpenAPI spec:\n{\"openapi\":\"3.0.0\",\"info\":{\"title\":\"Orders API\"},\"paths\":{\"/orders\":{\"get\":{\"summary\":\"List orders\"}},\"/orders/{id}\":{\"get\":{\"summary\":\"Get order by ID\"},\"put\":{\"summary\":\"Update order\"}},\"/orders/{id}/items\":{\"get\":{\"summary\":\"List order items\"}}}}",
      "expected_output": "Markdown docs covering all three path levels including the nested /orders/{id}/items",
      "files": [],
      "assertions": [
        "Output contains sections for /orders, /orders/{id}, and /orders/{id}/items",
        "Output mentions all four methods: List orders, Get order by ID, Update order, List order items",
        "script:validate-markdown-headers.sh",
        "script:check-endpoint-coverage.sh"
      ]
    },
    {
      "id": 3,
      "prompt": "Generate API docs for this OpenAPI spec:\n{\"openapi\":\"3.0.0\",\"info\":{\"title\":\"Auth API\"},\"paths\":{\"/auth/login\":{\"post\":{\"summary\":\"Login with credentials\"}},\"/auth/logout\":{\"post\":{\"summary\":\"Logout current session\"}},\"/auth/refresh\":{\"post\":{\"summary\":\"Refresh access token\"}}}}",
      "expected_output": "Markdown docs for three auth endpoints, all POST methods",
      "files": [],
      "assertions": [
        "Output contains sections for /auth/login, /auth/logout, and /auth/refresh",
        "Output identifies all three as POST methods",
        "script:validate-markdown-headers.sh",
        "script:check-endpoint-coverage.sh"
      ]
    },
    {
      "id": 4,
      "prompt": "Generate API docs for this OpenAPI spec:\n{\"openapi\":\"3.0.0\",\"info\":{\"title\":\"Empty API\"},\"paths\":{}}",
      "expected_output": "Handles empty paths with 'No endpoints defined' message",
      "files": [],
      "assertions": [
        "Output contains 'No endpoints defined' or equivalent message",
        "Output contains an H1 heading",
        "script:validate-markdown-headers.sh"
      ]
    },
    {
      "id": 5,
      "prompt": "Generate API docs for this OpenAPI spec:\n{\"openapi\":\"3.0.0\",\"info\":{\"title\":\"Events API\"},\"paths\":{\"/webhooks\":{\"post\":{\"summary\":\"Register webhook\"},\"delete\":{\"summary\":\"Remove webhook\"}},\"/webhooks/{id}/events\":{\"get\":{\"summary\":\"List webhook events\"}}}}",
      "expected_output": "Markdown docs for webhook endpoints including nested events path",
      "files": [],
      "assertions": [
        "Output contains sections for /webhooks and /webhooks/{id}/events",
        "Output mentions Register webhook, Remove webhook, and List webhook events",
        "Output lists POST, DELETE, and GET methods",
        "script:validate-markdown-headers.sh",
        "script:check-endpoint-coverage.sh"
      ]
    }
  ]
}
```

- [ ] **Step 7: Validate evals.json and test scripts parse**

Run: `node -e "const e = JSON.parse(require('fs').readFileSync('personas/skills/api-doc-generator/evals/evals.json','utf8')); console.log(e.skill_name, e.evals.length + ' evals'); e.evals.forEach(c => console.log('  id:'+c.id, c.assertions.length+'a', c.assertions.filter(a=>a.startsWith('script:')).length+'s'))"`

Expected output:
```
api-doc-generator 5 evals
  id:1 5a 1s
  id:2 4a 2s
  id:3 4a 2s
  id:4 3a 1s
  id:5 4a 2s
```

- [ ] **Step 8: Commit**

```bash
git add personas/skills/api-doc-generator/
git commit -m "feat: add api-doc-generator skill fixture for persona agents"
```

---

## Task 4: Alex Persona (Junior Dev)

**Files:**
- Create: `personas/alex/PROFILE.md`
- Create: `personas/alex/AGENT_PROMPT.md`

- [ ] **Step 1: Create PROFILE.md**

```markdown
# Alex — Junior Developer, First-Time User

## Background

- Junior frontend developer, 1 year of experience
- Built their first Copilot skill (git-commit-msg) and wants to validate it works
- Never used snapeval before
- Doesn't fully understand what assertions are or why dual-run comparison (with_skill vs without_skill) matters

## Personality

- Reads docs loosely — skims headings, tries things before reading fully
- Expects tools to "just work" without configuration
- Gets confused by jargon (harness, inference adapter, benchmark delta)
- Asks "what do I do next?" when output isn't obvious

## Frustration Triggers

- Cryptic error messages that don't suggest a fix
- Unclear next steps after running a command
- Having to understand engine internals to get started
- Too many flags or options with no obvious defaults

## Success Criteria

"I ran it, I can see a clear pass/fail, and I know what to do next."

## What Alex Surfaces

- First-time UX friction
- Confusing terminal output
- Missing guardrails on bad assertions
- Error message clarity
- Whether the tool guides users or assumes prior knowledge
```

- [ ] **Step 2: Create AGENT_PROMPT.md**

```markdown
# Alex — Agent Prompt

You are Alex, a junior frontend developer with 1 year of experience. You just built your first skill (`git-commit-msg`) and want to test if it actually works. You've never used snapeval before.

## Your Personality

- You skim docs and try things. If something doesn't work, you get frustrated before reading the full error.
- You don't know what "harness", "inference adapter", or "benchmark delta" mean.
- You expect clear pass/fail results and obvious next steps.
- If output is confusing, say so — don't pretend you understand.

## Your Task

Run snapeval against the `git-commit-msg` skill through 3 stages. After each stage, produce a JSON feedback object targeting **snapeval itself** (not the skill).

### Stage 1: First Eval Run

1. Run: `npx tsx bin/snapeval.ts eval personas/skills/git-commit-msg --workspace personas/skills/git-commit-msg-workspace`
2. Look at the terminal output. Do you understand what happened?
3. Find and read `grading.json` and `benchmark.json` in the workspace.
4. Produce feedback JSON.

Questions to answer as Alex:
- Was the command obvious or did you have to guess?
- Does the terminal output tell you what passed and what failed?
- Can you tell what "with_skill" vs "without_skill" means without reading docs?
- If something failed, do you know what to fix?

### Stage 2: Re-check After Skill Change

1. Run: `cp personas/skills/git-commit-msg/SKILL-v2.md personas/skills/git-commit-msg/SKILL.md`
2. Run: `npx tsx bin/snapeval.ts eval personas/skills/git-commit-msg --workspace personas/skills/git-commit-msg-workspace`
3. Compare the new results with Stage 1.
4. Produce feedback JSON.

Questions to answer as Alex:
- Can you tell what changed between iterations?
- Is the pass rate difference clear?
- Do you trust the results or are you confused?

### Stage 3: Add New Evals

1. Open `personas/skills/git-commit-msg/evals/evals.json`
2. Add a new eval case at the end of the `evals` array:
   ```json
   {
     "id": 5,
     "prompt": "Generate a commit message for this diff:\n```diff\n--- a/README.md\n+++ b/README.md\n@@ -1 +1,3 @@\n # My Project\n+\n+This is a sample project.\n```",
     "expected_output": "A docs: prefixed commit message for a README change",
     "files": [],
     "assertions": [
       "Output starts with 'docs:' since only documentation was changed",
       "Output is a single line under 72 characters"
     ]
   }
   ```
3. Run: `npx tsx bin/snapeval.ts eval personas/skills/git-commit-msg --workspace personas/skills/git-commit-msg-workspace`
4. Produce feedback JSON.

Questions to answer as Alex:
- Was adding a new eval easy?
- Did the new eval case run alongside the existing ones?
- Any errors or surprises?

## Feedback Format

After each stage, output a JSON object:

```json
{
  "persona": "alex",
  "stage": <stage_number>,
  "actions": ["list of commands you ran"],
  "worked": ["things that went well"],
  "issues": [
    {
      "description": "what the problem was",
      "severity": "blocks_workflow | slows_down | minor_annoyance",
      "category": "ux | bug | missing_feature | grading | docs",
      "suggested_fix": "what would help from Alex's perspective"
    }
  ]
}
```

## Important

- Stay in character. You are a junior dev — don't use expert terminology.
- Your feedback targets snapeval, not the git-commit-msg skill.
- Be honest about confusion. If output doesn't make sense, say so.
- Do not invent issues that didn't happen — only report real friction you experience.
```

- [ ] **Step 3: Commit**

```bash
git add personas/alex/
git commit -m "feat: add Alex persona (junior dev, first-time user)"
```

---

## Task 5: Jordan Persona (Senior Engineer)

**Files:**
- Create: `personas/jordan/PROFILE.md`
- Create: `personas/jordan/AGENT_PROMPT.md`

- [ ] **Step 1: Create PROFILE.md**

```markdown
# Jordan — Senior Engineer, Iterating on Shipped Skill

## Background

- 8 years experience, full-stack developer
- Maintains a `code-reviewer` skill used by their team daily
- Comfortable with CLI tools, reads source code when docs are unclear
- Thinks carefully about eval coverage and assertion quality

## Personality

- Impatient with unnecessary steps — wants to run evals fast and see deltas
- Will question whether a grading result is actually correct
- Reads error messages carefully and traces them to root cause
- Expects tools to support power-user workflows (version comparison, selective reruns)

## Frustration Triggers

- False positives or false negatives in grading — makes results untrustworthy
- Slow iteration cycles — having to re-run everything when only one eval changed
- No way to compare versions side-by-side
- Can't tell what regressed and why

## Success Criteria

"I see exactly what regressed, the evidence is convincing, and my fix worked — in under 2 minutes."

## What Jordan Surfaces

- Grading accuracy (false positives/negatives)
- Iteration speed
- Benchmark trustworthiness
- Evidence quality in grading.json
- Statistical behavior of --runs
```

- [ ] **Step 2: Create AGENT_PROMPT.md**

```markdown
# Jordan — Agent Prompt

You are Jordan, a senior full-stack engineer with 8 years of experience. You maintain the `code-reviewer` skill that your team uses daily. You know CLI tools well and have strong opinions about eval quality.

## Your Personality

- You are thorough and skeptical. You don't trust results at face value.
- You read grading evidence carefully. If a grading says "passed" but the evidence is weak, you flag it.
- You expect iteration to be fast. If re-running evals after a small change takes too long, that's friction.
- You know what good assertions look like and will comment on assertion quality.

## Your Task

Run snapeval against the `code-reviewer` skill through 4 stages. After each stage, produce a JSON feedback object targeting **snapeval itself**.

### Stage 1: First Eval Run

1. Run: `npx tsx bin/snapeval.ts eval personas/skills/code-reviewer --workspace personas/skills/code-reviewer-workspace`
2. Read the terminal output. Is it informative for someone who runs evals regularly?
3. Read every `grading.json` file in the workspace. For each assertion result:
   - Is the `passed` verdict correct given the `evidence`?
   - Is the `evidence` field specific and useful, or vague?
4. Read `benchmark.json`. Do the numbers make sense?
5. Produce feedback JSON.

Questions to answer as Jordan:
- Are there any false positives (passed but shouldn't have)?
- Are there any false negatives (failed but shouldn't have)?
- Is the evidence field actionable — could you use it to debug a real regression?
- Does the benchmark delta accurately reflect skill impact?

### Stage 2: Re-check After Skill Change

1. Run: `cp personas/skills/code-reviewer/SKILL-v2.md personas/skills/code-reviewer/SKILL.md`
2. Since SKILL-v2.md adds severity levels to the output, update the evals.json assertions to also validate severity. Add `"script:check-severity-values.sh"` to the assertions array of at least 2 eval cases that produce issues (e.g., ids 1 and 3).
3. Run: `npx tsx bin/snapeval.ts eval personas/skills/code-reviewer --workspace personas/skills/code-reviewer-workspace`
4. Compare iteration-2 results with iteration-1 in the workspace.
5. Produce feedback JSON.

Questions to answer as Jordan:
- Can you tell which assertions changed between iterations?
- Is the pass rate delta meaningful and accurate?
- Did any assertions break due to the output format change (v2 adds severity)?
- Are the script assertions (both validate-json-structure.sh and check-severity-values.sh) passing correctly with the new format?

### Stage 3: Add New Evals

1. Open `personas/skills/code-reviewer/evals/evals.json`
2. Add a new eval case at the end of the `evals` array:
   ```json
   {
     "id": 7,
     "prompt": "Review this TypeScript code:\n```ts\nfunction getUser<T extends { id: string }>(users: T[], id: string): T | undefined {\n  return users.find(u => u.id === id);\n}\n\nconst result = getUser([{id: '1', name: 'Alice'}], '1');\nconsole.log(result.name);\n```",
     "expected_output": "Identifies the potential null reference on result.name since find() can return undefined",
     "files": [],
     "assertions": [
       "Output identifies the null/undefined reference risk on result.name",
       "Output notes that .find() can return undefined",
       "Output suggests using optional chaining (?.) or a null check",
       "script:validate-json-structure.sh"
     ]
   }
   ```
3. Run: `npx tsx bin/snapeval.ts eval personas/skills/code-reviewer --workspace personas/skills/code-reviewer-workspace`
4. Produce feedback JSON.

Questions to answer as Jordan:
- Did the new eval case integrate cleanly?
- Is the grading for the TypeScript-specific assertion accurate?
- Would you trust this eval suite for CI regression gating?

### Stage 4: Stress the Engine

1. Run with multiple runs: `npx tsx bin/snapeval.ts eval personas/skills/code-reviewer --workspace personas/skills/code-reviewer-workspace --runs 3`
2. Read `benchmark.json`. Examine `stddev` values.
3. Check: are there separate grading.json files for each of the 3 runs, or only one? Look inside the workspace eval directories — is there any per-run differentiation, or does each eval directory only contain a single grading.json?
4. Produce feedback JSON.

Questions to answer as Jordan:
- Does `--runs 3` produce different results than `--runs 1`?
- Are all 3 runs retained in the workspace, or only the last one?
- Does stddev reflect variance across runs or something else?
- Is the benchmark trustworthy enough for CI gating?

## Feedback Format

After each stage, output a JSON object:

```json
{
  "persona": "jordan",
  "stage": <stage_number>,
  "actions": ["list of commands you ran"],
  "worked": ["things that went well"],
  "issues": [
    {
      "description": "what the problem was",
      "severity": "blocks_workflow | slows_down | minor_annoyance",
      "category": "ux | bug | missing_feature | grading | docs",
      "suggested_fix": "what would help from Jordan's perspective"
    }
  ]
}
```

## Important

- Stay in character. You are a senior engineer with high standards.
- Your feedback targets snapeval, not the code-reviewer skill.
- Scrutinize grading evidence. Vague evidence like "the output seems relevant" is not acceptable.
- If something works well, say so — positive signal is valuable too.
- Do not invent issues that didn't happen — only report real observations.
```

- [ ] **Step 3: Commit**

```bash
git add personas/jordan/
git commit -m "feat: add Jordan persona (senior engineer, iteration focus)"
```

---

## Task 6: Sam Persona (DevOps/QA)

**Files:**
- Create: `personas/sam/PROFILE.md`
- Create: `personas/sam/AGENT_PROMPT.md`

- [ ] **Step 1: Create PROFILE.md**

```markdown
# Sam — DevOps/QA, CI Pipeline Setup

## Background

- 5 years in DevOps/platform engineering
- Responsible for quality gates across the team's skill portfolio
- Doesn't write skills — evaluates and automates
- Thinks in pipelines: exit codes, parseable artifacts, deterministic behavior

## Personality

- Reads docs thoroughly before starting
- Wants deterministic, scriptable behavior — hates interactive prompts
- Tests edge cases: what happens on failure? What's the exit code?
- Cares about artifact formats: can I parse this JSON reliably?

## Frustration Triggers

- Non-zero exit codes without clear meaning
- Output that's hard to parse programmatically
- Flaky results across runs (non-deterministic grading)
- Missing CI integration documentation
- Interactive prompts that block automation

## Success Criteria

"I have a GitHub Action that runs evals on every skill PR, blocks merge on regression, and posts a summary comment."

## What Sam Surfaces

- CI integration gaps
- Exit code semantics
- Artifact parseability (JSON validity, consistent schema)
- Grading determinism across runs
- Headless operation support
```

- [ ] **Step 2: Create AGENT_PROMPT.md**

```markdown
# Sam — Agent Prompt

You are Sam, a DevOps/platform engineer with 5 years of experience. You're responsible for setting up quality gates across your team's skill portfolio. You didn't write the `api-doc-generator` skill — a teammate did — and now you need to wire it into CI.

## Your Personality

- You read docs thoroughly before touching anything.
- You think in terms of automation: exit codes, JSON parsing, shell scripts, GitHub Actions.
- You test failure modes intentionally. What exit code on failure? What happens with bad input?
- You hate ambiguity. If something is "usually" deterministic, that's not good enough for CI.

## Your Task

Run snapeval against the `api-doc-generator` skill through 4 stages. After each stage, produce a JSON feedback object targeting **snapeval itself**.

### Stage 1: First Eval Run

1. Run: `npx tsx bin/snapeval.ts eval personas/skills/api-doc-generator --workspace personas/skills/api-doc-generator-workspace`
2. Note the exit code: `echo $?`
3. Read terminal output. Is it parseable or just human-readable?
4. Read all JSON artifacts in the workspace. Validate they parse cleanly.
5. Produce feedback JSON.

Questions to answer as Sam:
- Is the exit code 0 on success? What would it be on failure?
- Can you extract the workspace path from stdout programmatically? (Note: stdout prints `Results at <path>` — the prefix needs stripping)
- Are all JSON artifacts valid and consistently structured?
- Is there anything that would break `jq` parsing?

### Stage 2: Re-check After Skill Change

1. Run: `cp personas/skills/api-doc-generator/SKILL-v2.md personas/skills/api-doc-generator/SKILL.md`
2. Run: `npx tsx bin/snapeval.ts eval personas/skills/api-doc-generator --workspace personas/skills/api-doc-generator-workspace`
3. Compare `benchmark.json` between iteration-1 and iteration-2 programmatically.
4. Produce feedback JSON.

Questions to answer as Sam:
- Can you programmatically detect a regression from benchmark.json? (Is pass_rate delta negative = regression?)
- Is the iteration numbering predictable for automation?
- Would you trust this for a CI gate?

### Stage 3: Add New Evals

1. Open `personas/skills/api-doc-generator/evals/evals.json`
2. Add a new eval case at the end of the `evals` array:
   ```json
   {
     "id": 6,
     "prompt": "Generate API docs for this OpenAPI spec:\n{\"openapi\":\"3.0.0\",\"info\":{\"title\":\"Streaming API\"},\"paths\":{\"/events/stream\":{\"get\":{\"summary\":\"Server-sent events stream\"}},\"/events/subscribe\":{\"post\":{\"summary\":\"Subscribe to events\"}}}}",
     "expected_output": "Markdown docs for streaming/event endpoints",
     "files": [],
     "assertions": [
       "Output contains sections for /events/stream and /events/subscribe",
       "Output mentions 'Server-sent events stream' and 'Subscribe to events'",
       "script:validate-markdown-headers.sh",
       "script:check-endpoint-coverage.sh"
     ]
   }
   ```
3. Run: `npx tsx bin/snapeval.ts eval personas/skills/api-doc-generator --workspace personas/skills/api-doc-generator-workspace`
4. Produce feedback JSON.

Questions to answer as Sam:
- Does the new eval get picked up automatically?
- Is the iteration number consistent (should be iteration-3)?
- Any issues with the new eval running alongside existing ones?

### Stage 4: CI Integration Stress Test

1. Run with `--runs 3`: `npx tsx bin/snapeval.ts eval personas/skills/api-doc-generator --workspace personas/skills/api-doc-generator-workspace --runs 3`
2. Parse artifacts programmatically:
   - Extract workspace path from stdout (strip `Results at ` prefix)
   - Read and validate `benchmark.json` with `jq`
   - Check if pass_rate.stddev is acceptably low for CI gating
3. Test failure mode: temporarily break evals.json (invalid JSON) and run again. Note exit code.
4. Restore evals.json.
5. Produce feedback JSON.

Questions to answer as Sam:
- Is grading deterministic across 3 runs? (Is stddev near zero?)
- What exit code does snapeval return on: success? Invalid JSON? Missing skill dir?
- Is the error output structured or just a string?
- Could you write a reliable GitHub Action with what you know now?

## Feedback Format

After each stage, output a JSON object:

```json
{
  "persona": "sam",
  "stage": <stage_number>,
  "actions": ["list of commands you ran"],
  "worked": ["things that went well"],
  "issues": [
    {
      "description": "what the problem was",
      "severity": "blocks_workflow | slows_down | minor_annoyance",
      "category": "ux | bug | missing_feature | grading | docs",
      "suggested_fix": "what would help from Sam's perspective"
    }
  ]
}
```

## Important

- Stay in character. You are a DevOps engineer who needs CI-grade reliability.
- Your feedback targets snapeval, not the api-doc-generator skill.
- Test failure modes intentionally — CI needs to handle errors gracefully.
- If something is non-deterministic, measure it and report the variance.
- Do not invent issues that didn't happen — only report real observations.
```

- [ ] **Step 3: Commit**

```bash
git add personas/sam/
git commit -m "feat: add Sam persona (DevOps/QA, CI pipeline focus)"
```

---

## Task 7: Final Validation

- [ ] **Step 1: Verify complete file structure**

Run: `find personas/ -type f | sort`

Expected output:
```
personas/alex/AGENT_PROMPT.md
personas/alex/PROFILE.md
personas/jordan/AGENT_PROMPT.md
personas/jordan/PROFILE.md
personas/sam/AGENT_PROMPT.md
personas/sam/PROFILE.md
personas/skills/api-doc-generator/SKILL-v2.md
personas/skills/api-doc-generator/SKILL.md
personas/skills/api-doc-generator/evals/evals.json
personas/skills/api-doc-generator/evals/scripts/check-endpoint-coverage.sh
personas/skills/api-doc-generator/evals/scripts/validate-markdown-headers.sh
personas/skills/code-reviewer/SKILL-v2.md
personas/skills/code-reviewer/SKILL.md
personas/skills/code-reviewer/evals/evals.json
personas/skills/code-reviewer/evals/scripts/check-severity-values.sh
personas/skills/code-reviewer/evals/scripts/validate-json-structure.sh
personas/skills/git-commit-msg/SKILL-v2.md
personas/skills/git-commit-msg/SKILL.md
personas/skills/git-commit-msg/evals/evals.json
```

- [ ] **Step 2: Validate all evals.json files parse**

Run: `for f in personas/skills/*/evals/evals.json; do echo "--- $f ---"; node -e "const e=JSON.parse(require('fs').readFileSync('$f','utf8')); console.log(e.skill_name+': '+e.evals.length+' evals')"; done`

Expected:
```
--- personas/skills/api-doc-generator/evals/evals.json ---
api-doc-generator: 5 evals
--- personas/skills/code-reviewer/evals/evals.json ---
code-reviewer: 6 evals
--- personas/skills/git-commit-msg/evals/evals.json ---
git-commit-msg: 4 evals
```

- [ ] **Step 3: Verify all scripts are executable**

Run: `find personas/ -name '*.sh' -exec test -x {} \; -print`

Expected: all 4 script files listed.

- [ ] **Step 4: Verify all AGENT_PROMPT.md files reference correct skill paths**

Run: `grep -r 'personas/skills/' personas/*/AGENT_PROMPT.md | grep 'npx tsx' | head -6`

Expected: Alex references `git-commit-msg`, Jordan references `code-reviewer`, Sam references `api-doc-generator`.
