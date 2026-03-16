# Changelog

## [1.4.0](https://github.com/matantsach/snapeval/compare/snapeval-v1.3.1...snapeval-v1.4.0) (2026-03-16)


### Features

* add Copilot SDK adapter for programmatic skill invocation ([#19](https://github.com/matantsach/snapeval/issues/19)) ([3aa688b](https://github.com/matantsach/snapeval/commit/3aa688b44abca93949732f62d933856baa0fdb88))

## [1.3.1](https://github.com/matantsach/snapeval/compare/snapeval-v1.3.0...snapeval-v1.3.1) (2026-03-15)


### Bug Fixes

* move npm publish into release workflow to fix GITHUB_TOKEN limitation ([73283aa](https://github.com/matantsach/snapeval/commit/73283aa6a7f614216784b0510800abafadd6c9d8))

## [1.3.0](https://github.com/matantsach/snapeval/compare/snapeval-v1.2.0...snapeval-v1.3.0) (2026-03-15)


### Features

* add inference adapters (GitHub Models, Copilot, resolver) and CopilotCLI skill adapter ([f57fd6f](https://github.com/matantsach/snapeval/commit/f57fd6f8cae5e3015af79ef8c97d90a5205d73b3))
* add interactive scenario ideation with browser-based viewer ([#15](https://github.com/matantsach/snapeval/issues/15)) ([2537f52](https://github.com/matantsach/snapeval/commit/2537f52d8534cfa43e5cbedd40b58bb5a9493c5e))
* add plugin marketplace, npm packaging, and self-eval CI ([a1a4037](https://github.com/matantsach/snapeval/commit/a1a4037455002a8442ca431e051e6eda299e8c5a))
* add self-eval baselines and fix CI workflow ([8161ced](https://github.com/matantsach/snapeval/commit/8161cedeaf667f984740828644ad19c3cb7283be))
* add TerminalReporter and JSONReporter adapters ([a5444a6](https://github.com/matantsach/snapeval/commit/a5444a60d9d7923db9e7d83fffc7c37b2979f545))
* config resolution with layered merging (Task 3) ([754a244](https://github.com/matantsach/snapeval/commit/754a2444a3324e700b0d323a3f185de04f434a60))
* **engine:** add comparison pipeline orchestrator (Task 7) ([5998ea0](https://github.com/matantsach/snapeval/commit/5998ea0edb79de6fb21e9595e2da2f35bbfd1898))
* **engine:** add variance envelope module (Task 8) ([f588ae6](https://github.com/matantsach/snapeval/commit/f588ae623caffe144c5591b7c150dbd78684515c))
* HTML eval viewer with diff highlighting and benchmark dashboard ([35478a0](https://github.com/matantsach/snapeval/commit/35478a0e1f4d13757eeb841d153e2defc1c19798))
* project scaffold (Task 1) ([bf5c9df](https://github.com/matantsach/snapeval/commit/bf5c9dfd77e9f35288733cc04dd9f5ec264afa70))
* remove embedding tier, simplify to schema + LLM judge ([95ef36b](https://github.com/matantsach/snapeval/commit/95ef36b598af0287eb41b6c7729eb223a6f6f673))
* shared types and error classes (Task 2) ([0638dd2](https://github.com/matantsach/snapeval/commit/0638dd2cd5e5c1b27886285a17e8959a38817d75))
* **Task 10:** add BudgetEngine for cost tracking and cap enforcement ([1608608](https://github.com/matantsach/snapeval/commit/16086083bb361decb10c88a8ffbf101a5ab990ad))
* **Task 9:** add SnapshotManager with file I/O and audit trail ([e60ec8a](https://github.com/matantsach/snapeval/commit/e60ec8ac2739cd5aac86b819bf913d4548e0dba0))
* **task-15:** add AI test case generator with full test coverage ([fe86f95](https://github.com/matantsach/snapeval/commit/fe86f95a3b96d8286872ac00602e1c09fba9f37a))
* **task-16:** add CLI commands (init, capture, check, approve, report) and wire bin/snapeval.ts ([506259c](https://github.com/matantsach/snapeval/commit/506259c02ce7230061cac36022b145fc52970587))
* **tasks-17-18:** add Copilot CLI plugin and integration test ([11ac5cd](https://github.com/matantsach/snapeval/commit/11ac5cd07b5b8e0ab6c57d98012fe760d232c34d))
* Tier 1 schema check with structural skeleton extraction (Task 4) ([f0ff41f](https://github.com/matantsach/snapeval/commit/f0ff41f12b38251e7744735e91c5faa0bc1b825f))
* Tier 2 embedding similarity check with cosine distance (Task 5) ([3b589ec](https://github.com/matantsach/snapeval/commit/3b589ecc46565ea943ed889c271325b561cc1ea8))
* Tier 3 LLM judge with order-swap debiasing (Task 6) ([56ff37a](https://github.com/matantsach/snapeval/commit/56ff37a3c289680324e8eebbc1e2874e1c14f34c))


### Bug Fixes

* clean npm package — exclude tests, snapshots, scrub local paths ([c86fc1a](https://github.com/matantsach/snapeval/commit/c86fc1aa2a99a3817c7a04e454376e2912befebb))
* sync release-please config with workflow and update plugin versions ([607ae04](https://github.com/matantsach/snapeval/commit/607ae04ed12df6283a70c12863b445ad173ad250))
* update CopilotCLIAdapter to use correct gh copilot invocation ([81a7569](https://github.com/matantsach/snapeval/commit/81a7569f7ab5ed6c0b31fb5ca1bca468bb08ba03))

## [1.2.0](https://github.com/matantsach/snapeval/compare/v1.1.0...v1.2.0) (2026-03-15)


### Features

* add interactive scenario ideation with browser-based viewer ([#15](https://github.com/matantsach/snapeval/issues/15)) ([2537f52](https://github.com/matantsach/snapeval/commit/2537f52d8534cfa43e5cbedd40b58bb5a9493c5e))

## [1.1.0](https://github.com/matantsach/snapeval/compare/v1.0.1...v1.1.0) (2026-03-15)


### Features

* HTML eval viewer with diff highlighting and benchmark dashboard ([35478a0](https://github.com/matantsach/snapeval/commit/35478a0e1f4d13757eeb841d153e2defc1c19798))
* remove embedding tier, simplify to schema + LLM judge ([95ef36b](https://github.com/matantsach/snapeval/commit/95ef36b598af0287eb41b6c7729eb223a6f6f673))

## [1.0.1](https://github.com/matantsach/snapeval/compare/v1.0.0...v1.0.1) (2026-03-14)


### Bug Fixes

* clean npm package — exclude tests, snapshots, scrub local paths ([c86fc1a](https://github.com/matantsach/snapeval/commit/c86fc1aa2a99a3817c7a04e454376e2912befebb))

## 1.0.0 (2026-03-14)


### Features

* add inference adapters (GitHub Models, Copilot, resolver) and CopilotCLI skill adapter ([f57fd6f](https://github.com/matantsach/snapeval/commit/f57fd6f8cae5e3015af79ef8c97d90a5205d73b3))
* add plugin marketplace, npm packaging, and self-eval CI ([a1a4037](https://github.com/matantsach/snapeval/commit/a1a4037455002a8442ca431e051e6eda299e8c5a))
* add self-eval baselines and fix CI workflow ([8161ced](https://github.com/matantsach/snapeval/commit/8161cedeaf667f984740828644ad19c3cb7283be))
* add TerminalReporter and JSONReporter adapters ([a5444a6](https://github.com/matantsach/snapeval/commit/a5444a60d9d7923db9e7d83fffc7c37b2979f545))
* config resolution with layered merging (Task 3) ([754a244](https://github.com/matantsach/snapeval/commit/754a2444a3324e700b0d323a3f185de04f434a60))
* **engine:** add comparison pipeline orchestrator (Task 7) ([5998ea0](https://github.com/matantsach/snapeval/commit/5998ea0edb79de6fb21e9595e2da2f35bbfd1898))
* **engine:** add variance envelope module (Task 8) ([f588ae6](https://github.com/matantsach/snapeval/commit/f588ae623caffe144c5591b7c150dbd78684515c))
* project scaffold (Task 1) ([bf5c9df](https://github.com/matantsach/snapeval/commit/bf5c9dfd77e9f35288733cc04dd9f5ec264afa70))
* shared types and error classes (Task 2) ([0638dd2](https://github.com/matantsach/snapeval/commit/0638dd2cd5e5c1b27886285a17e8959a38817d75))
* **Task 10:** add BudgetEngine for cost tracking and cap enforcement ([1608608](https://github.com/matantsach/snapeval/commit/16086083bb361decb10c88a8ffbf101a5ab990ad))
* **Task 9:** add SnapshotManager with file I/O and audit trail ([e60ec8a](https://github.com/matantsach/snapeval/commit/e60ec8ac2739cd5aac86b819bf913d4548e0dba0))
* **task-15:** add AI test case generator with full test coverage ([fe86f95](https://github.com/matantsach/snapeval/commit/fe86f95a3b96d8286872ac00602e1c09fba9f37a))
* **task-16:** add CLI commands (init, capture, check, approve, report) and wire bin/snapeval.ts ([506259c](https://github.com/matantsach/snapeval/commit/506259c02ce7230061cac36022b145fc52970587))
* **tasks-17-18:** add Copilot CLI plugin and integration test ([11ac5cd](https://github.com/matantsach/snapeval/commit/11ac5cd07b5b8e0ab6c57d98012fe760d232c34d))
* Tier 1 schema check with structural skeleton extraction (Task 4) ([f0ff41f](https://github.com/matantsach/snapeval/commit/f0ff41f12b38251e7744735e91c5faa0bc1b825f))
* Tier 2 embedding similarity check with cosine distance (Task 5) ([3b589ec](https://github.com/matantsach/snapeval/commit/3b589ecc46565ea943ed889c271325b561cc1ea8))
* Tier 3 LLM judge with order-swap debiasing (Task 6) ([56ff37a](https://github.com/matantsach/snapeval/commit/56ff37a3c289680324e8eebbc1e2874e1c14f34c))


### Bug Fixes

* update CopilotCLIAdapter to use correct gh copilot invocation ([81a7569](https://github.com/matantsach/snapeval/commit/81a7569f7ab5ed6c0b31fb5ca1bca468bb08ba03))

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
