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
