# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- Placeholder for upcoming changes.

## [1.0.4] - 2026-05-17

### Fixed
- CLI executable entrypoint now includes a Node shebang, resolving `npx @monzingo89/engineer-maxxing@1.0.3 --fresh` failures where shell attempted to execute ESM imports directly.

## [1.0.3] - 2026-05-17

### Added
- Secret hygiene detection workflow to flag likely committed secrets and record findings in `NOSE`/`SOUL`.
- Expanded `SOUL` output to include third-party integration documentation links.
- Stronger model-action guardrails in `BRAIN` (ask-first, plan-first, anti-hallucination, low-token discipline, no assumptions).

### Changed
- Canonical anatomy layout finalized under `anatomy/` only (root-level organ duplicates removed).
- `SOUL` defaults to section-only empty template until a scan populates content.
- `HEART` now includes an explicit database changes section.
- Release scripts and workflow finalized for clean patch/minor publish flow.

## [1.0.2] - 2026-05-17

### Added
- Anatomy system under `anatomy/` with `BRAIN.md`, `EYES.md`, `EARS.md`, `NOSE.md`, `HANDS.md`, `SOUL.md`, and `HEART.md`.
- Container platform detection and observable context events (`Docker`, `Compose`, `AKS`, `Container Apps`, Kubernetes manifests).
- Repo authorship model enum + parsing and colorized model attribution during scanning.
- Task-aware resume and handoff continuity using `.cortex/context.json` and token budget-aware model handoff.
- Dependency audit workflow for `SOUL.md` including health score and unused runtime dependency analysis.
- Architecture pattern inference (DDD, multi-tenant signals, identity provider hints, database paradigm summary).
- CLI `--fresh` mode to reset anatomy and local `.cortex` scan state before a new learn pass.

### Changed
- Scanner now writes anatomy outputs to `anatomy/*` and uses `anatomy/BRAIN.md` as the live brain context source.
- `README.md` simplified for quick-start and operational clarity.
- Runtime dependency surface simplified to only used dependencies (`chalk`, `commander`).

## [1.0.1] - 2026-05-16

### Added
- CLI options for path selection, file size limits, include/exclude controls, and output modes (`--quiet`, `--verbose`, `--json-summary`).
- Realtime token usage visibility during scans, including cumulative token budget usage per model.
- Automatic technology detection with official documentation links written into repo memory context.
- High-level architecture and data-layer Brain snapshot (frontend, frontend->backend, backend, backend->database, caching, SignalR/realtime).
- Database-agnostic default Brain posture until concrete database technology evidence is detected.
- Distribution planning document at `docs/distribution-plan.md`.
- Automated test coverage for model selection, token tracker behavior, and technology docs detection.
- Release helper scripts: `release:patch` and `release:minor`.

### Changed
- Scan ordering is now deterministic (sorted traversal/results).
- Publish verification now includes tests before packaging dry-run.

## [1.0.0] - 2026-05-16

### Added
- First public npm release: `@monzingo89/engineer-maxxing`.
- CLI usage via `npx @monzingo89/engineer-maxxing`.
- Core Cortex scanner structure under `cortex/`:
  - workflows, prompts, models, token tracking, events, and writers.
- Repository memory/organ markdown files (`BRAIN.md`, `EYES.md`, `EARS.md`, `NOSE.md`, `HANDS.md`).
- Packaging and publish verification scripts (`verify:publish`, `prepublishOnly`).
- Open-source project documentation (`README.md`) and licensing (`MIT`).

[Unreleased]: https://github.com/Monzingo89/engineer-maxxing/compare/v1.0.4...HEAD
[1.0.4]: https://github.com/Monzingo89/engineer-maxxing/releases/tag/v1.0.4
[1.0.3]: https://github.com/Monzingo89/engineer-maxxing/releases/tag/v1.0.3
[1.0.2]: https://github.com/Monzingo89/engineer-maxxing/releases/tag/v1.0.2
[1.0.1]: https://github.com/Monzingo89/engineer-maxxing/releases/tag/v1.0.1
[1.0.0]: https://github.com/Monzingo89/engineer-maxxing/releases/tag/v1.0.0
