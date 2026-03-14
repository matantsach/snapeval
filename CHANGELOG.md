# Changelog

## [0.1.0] - 2026-03-15

### Added
- Core comparison engine with 3-tier pipeline (schema, embedding, LLM judge)
- Snapshot manager with capture, approve, and audit trail
- AI test case generator (SKILL.md → evals.json)
- Variance envelope for non-determinism handling
- Budget engine with cost tracking
- Copilot CLI skill adapter
- Copilot inference adapter (gpt-5-mini, free)
- GitHub Models inference adapter (CI fallback)
- Terminal and JSON report adapters
- CLI commands: init, capture, check, approve, report
- Copilot CLI plugin with SKILL.md
- agentskills.io eval format conformance
- 193 tests
