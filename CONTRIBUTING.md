# Contributing to snapeval

Thanks for your interest in contributing! Here's how to get started.

## Development Setup

```bash
git clone https://github.com/matantsach/snapeval.git
cd snapeval
npm install
npm test
```

## Making Changes

1. Fork the repo and create a branch from `main`
2. Write tests for any new functionality
3. Run `npm test` to ensure all tests pass
4. Submit a pull request

## Code Style

- TypeScript with strict mode
- Tests with vitest
- Follow existing patterns in the codebase

## Reporting Issues

Use GitHub Issues. Include:
- What you expected to happen
- What actually happened
- Steps to reproduce
- Your environment (OS, Node version, Copilot CLI version)

## Pull Request Process

1. Update tests for any changed functionality
2. Ensure all tests pass (`npm test`)
3. PRs require passing CI checks before merge
4. Keep PRs focused — one feature or fix per PR
