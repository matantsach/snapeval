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
