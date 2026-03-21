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
