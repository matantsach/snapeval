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
